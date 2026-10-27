'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextDisplayBuilder,
  MessageFlags,
  escapeMarkdown,
} = require('discord.js');

const { CARACTERISTIQUES, CATEGORIES } = require('../constants');
const { ErrorCodes, IltakError } = require('../utils/errors');
const { formatSigned } = require('../utils/validators');
const { addPersoOption, guildCommand, publishRoll } = require('./shared');

const NAME = 'f';
const PREFIX = 'fiche';

/**
 * Commande de test /fiche-interactive : même fiche que /fiche-perso (qui reste inchangée),
 * avec en plus des boutons et des menus pour lancer les dés.
 */
const data = addPersoOption(
  guildCommand(NAME, 'Fiche interactive : boutons et menus pour lancer les dés (test)'),
);

/**
 * Composants de la fiche : une rangée de boutons (caractéristiques) et un menu déroulant par
 * catégorie de compétences non vide. Le personnage est désigné par son identifiant dans le
 * `customId` ; les droits sont revérifiés à chaque clic.
 */
function buildComponents(personnage, pages = {}) {
  const PAGE_SIZE = 5;

  const titres = {
    bagarre: 'Bagarre',
    savoir: 'Savoir',
    pouvoir: 'Magie',
  };

  // Trie les compétences et borne les pages demandées.
  const categories = CATEGORIES.map((categorie) => {
    const skills = Object.entries(
      personnage.competences[categorie],
    ).sort(([, a], [, b]) => a.nom.localeCompare(b.nom, 'fr'));

    const pageCount = Math.max(1, Math.ceil(skills.length / PAGE_SIZE));
    const requestedPage = pages[categorie];

    const page = Number.isSafeInteger(requestedPage)
      ? Math.max(0, Math.min(requestedPage, pageCount - 1))
      : 0;

    return { categorie, skills, pageCount, page };
  });

  // Chaque flèche conserve aussi les pages des autres catégories.
  function navigationId(categorie, targetPage) {
    const state = categories.map((entry) =>
      entry.categorie === categorie ? targetPage : entry.page,
    );

    return `${PREFIX}:page:${personnage.id}:${categorie}:${state.join(',')}`;
  }

  const components = [
    new TextDisplayBuilder().setContent(
      `## ${escapeMarkdown(personnage.nom)}\n### Caractéristiques`,
    ),

    new ActionRowBuilder().addComponents(
      CARACTERISTIQUES.map(({ key, label }) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:carac:${personnage.id}:${key}`)
          .setLabel(
            `${label} ${formatSigned(personnage.caracteristiques[key])}`,
          )
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  ];

  for (const { categorie, skills, pageCount, page } of categories) {
    components.push(
      new TextDisplayBuilder().setContent(
        `### ${titres[categorie]} — ${page + 1}/${pageCount}`,
      ),
    );

    if (skills.length === 0) {
      components.push(
        new TextDisplayBuilder().setContent('_Aucune compétence_'),
      );
      continue;
    }

    const start = page * PAGE_SIZE;

    components.push(
      new ActionRowBuilder().addComponents(
        skills.slice(start, start + PAGE_SIZE).map(([id, skill]) =>
          new ButtonBuilder()
            .setCustomId(
              `${PREFIX}:skill:${personnage.id}:${categorie}:${id}`,
            )
            .setLabel(
              `${skill.nom} ${formatSigned(skill.bonus)}`.slice(0, 80),
            )
            .setStyle(ButtonStyle.Secondary),
        ),
      ),
    );

    if (pageCount > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(navigationId(categorie, page - 1))
            .setLabel('Précédent')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),

          new ButtonBuilder()
            .setCustomId(navigationId(categorie, page + 1))
            .setLabel('Suivant')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === pageCount - 1),
        ),
      );
    }
  }

  return components;
}
/*
function buildComponents(personnage) {
  const rows = [
    new ActionRowBuilder().addComponents(
      CARACTERISTIQUES.map(({ key, label }) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}:carac:${personnage.id}:${key}`)
          .setLabel(`${label} ${formatSigned(personnage.caracteristiques[key])}`)
          .setStyle(ButtonStyle.Primary),
      ),
    ),
  ];

  for (const categorie of CATEGORIES) {
    const skills = Object.entries(personnage.competences[categorie]).sort(([, a], [, b]) =>
      a.nom.localeCompare(b.nom, 'fr'),
    );
    if (skills.length === 0) continue;

    const truncated = skills.length > MAX_SELECT_OPTIONS ? ` (${MAX_SELECT_OPTIONS} premières sur ${skills.length})` : '';
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}:skill:${personnage.id}:${categorie}`)
          .setPlaceholder(`${CATEGORY_LABELS[categorie]} : lancer une compétence${truncated}`)
          .addOptions(
            skills.slice(0, MAX_SELECT_OPTIONS).map(([id, skill]) => ({
              label: skill.nom.slice(0, 100),
              description: `${id} · ${formatSigned(skill.bonus)}`.slice(0, 100),
              value: id,
            })),
          ),
      ),
    );
  }
  return rows;
}
*/
/** /fiche-interactive : mêmes règles d'accès que /fiche-perso et que les jets. */
async function execute(interaction, ctx) {
  const personnage = ctx.permissionService.resolveCharacter({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    persoName: interaction.options.getString('perso'),
  });

  await interaction.reply({
    components: buildComponents(personnage),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

/** Clic sur un bouton ou un menu de la fiche : lance 2d6 + bonus, résultat public dans le salon. */
async function handleComponent(interaction, ctx) {
  const [, action, personnageId, arg, extra] =
    interaction.customId.split(':');

  // Revérifie les droits, y compris lors d'un changement de page.
  const personnage = ctx.permissionService.resolveCharacterById({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    personnageId,
  });

  if (action === 'page' && CATEGORIES.includes(arg)) {
    const values = (extra ?? '').split(',').map(Number);

    if (
      values.length !== CATEGORIES.length ||
      !values.every(Number.isSafeInteger)
    ) {
      throw new IltakError(
        ErrorCodes.INVALID_INPUT,
        'Cette navigation est invalide : relancez /fiche-interactive.',
      );
    }

    const pages = Object.fromEntries(
      CATEGORIES.map((categorie, index) => [
        categorie,
        values[index],
      ]),
    );

    // Modifie la fiche existante, sans nouveau message.
    return interaction.update({
      components: buildComponents(personnage, pages),
      allowedMentions: { parse: [] },
    });
  }

  if (action === 'carac') {
    const carac = CARACTERISTIQUES.find(({ key }) => key === arg);

    if (!carac) {
      throw new IltakError(
        ErrorCodes.INVALID_INPUT,
        "Cette caractéristique n'est plus valide.",
      );
    }

    return publishRoll(interaction, ctx, personnage, {
      label: carac.label,
      base: personnage.caracteristiques[carac.key],
    });
  }

  if (action === 'skill' && CATEGORIES.includes(arg)) {
    const skill = personnage.competences[arg][extra];

    if (!skill) {
      throw new IltakError(
        ErrorCodes.SKILL_NOT_FOUND,
        "Cette compétence n'existe plus : relancez /fiche-interactive.",
      );
    }

    return publishRoll(interaction, ctx, personnage, {
      label: skill.nom,
      base: skill.bonus,
    });
  }

  throw new IltakError(
    ErrorCodes.INVALID_INPUT,
    "Cette interaction n'est plus valide.",
  );
}

module.exports = { NAME, PREFIX, data, execute, buildComponents, handleComponent };
