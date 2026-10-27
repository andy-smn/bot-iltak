'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { CARACTERISTIQUES, CATEGORIES, CATEGORY_LABELS } = require('../constants');
const { ErrorCodes, IltakError } = require('../utils/errors');
const { formatSigned } = require('../utils/validators');
const { publishRoll } = require('./shared');

const PREFIX = 'fiche';
const MAX_SELECT_OPTIONS = 25;

/**
 * Composants de la fiche : une rangée de boutons (caractéristiques) et un menu déroulant par
 * catégorie de compétences non vide. Le personnage est désigné par son identifiant dans le
 * `customId` ; les droits sont revérifiés à chaque clic.
 */
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

/** Clic sur un bouton ou un menu de la fiche : lance 2d6 + bonus, résultat public dans le salon. */
async function handleComponent(interaction, ctx) {
  const [, action, personnageId, arg] = interaction.customId.split(':');
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
    const skill = personnage.competences[arg][interaction.values[0]];
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

module.exports = { PREFIX, buildComponents, handleComponent };
