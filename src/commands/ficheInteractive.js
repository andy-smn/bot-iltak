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
function buildComponents(personnage) {
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

  const titres = {
    bagarre: 'Bagarre',
    savoir: 'Savoir',
    pouvoir: 'Magie',
  };

  for (const categorie of CATEGORIES) {
    const skills = Object.entries(personnage.competences[categorie]).sort(
      ([, a], [, b]) => a.nom.localeCompare(b.nom, 'fr'),
    );

    components.push(
      new TextDisplayBuilder().setContent(`### ${titres[categorie]}`),
    );

    if (skills.length === 0) {
      components.push(
        new TextDisplayBuilder().setContent('_Aucune compétence_'),
      );
      continue;
    }

    for (let i = 0; i < skills.length; i += 5) {
      components.push(
        new ActionRowBuilder().addComponents(
          skills.slice(i, i + 5).map(([id, skill]) =>
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
    }
  }

  // Discord compte aussi les boutons à l'intérieur des rangées.
  const total = components.reduce(
    (count, component) => count + 1 + (component.components?.length ?? 0),
    0,
  );

  if (total > 40) {
    throw new IltakError(
      ErrorCodes.INVALID_INPUT,
      'Cette fiche contient trop de boutons pour un seul message. Utilisez /fiche-perso ou les commandes de jets.',
    );
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
  const [, action, personnageId, arg, competenceId] =
    interaction.customId.split(':');
  const personnage = ctx.permissionService.resolveCharacterById({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    personnageId,
  });

  if (action === 'carac') {
    const carac = CARACTERISTIQUES.find(({ key }) => key === arg);
    if (!carac) throw new IltakError(ErrorCodes.INVALID_INPUT, 'Cette interaction n\'est plus valide.');
    return publishRoll(interaction, ctx, personnage, { label: carac.label, base: personnage.caracteristiques[carac.key] });
  }

  if (action === 'skill' && CATEGORIES.includes(arg)) {
    const skill = personnage.competences[arg][competenceId];
    if (!skill) {
      throw new IltakError(
        ErrorCodes.SKILL_NOT_FOUND,
        'Cette compétence n\'existe plus chez ce personnage : relancez /fiche-perso.',
      );
    }
    return publishRoll(interaction, ctx, personnage, { label: skill.nom, base: skill.bonus });
  }

  throw new IltakError(ErrorCodes.INVALID_INPUT, 'Cette interaction n\'est plus valide.');
}

module.exports = { NAME, PREFIX, data, execute, buildComponents, handleComponent };
