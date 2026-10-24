'use strict';

const { CATEGORIES, CATEGORY_LABELS, MAX_NAME_LENGTH } = require('../constants');
const { findSkill } = require('../models/personnage');
const { ErrorCodes, IltakError } = require('../utils/errors');
const { formatSigned, nameKey } = require('../utils/validators');
const { addBonusOption, addPersoOption, executeRoll, guildCommand } = require('./shared');

const MAX_AUTOCOMPLETE_CHOICES = 25;

const DESCRIPTIONS = {
  bagarre: 'Lance 2d6 + le bonus d\'une compétence de Bagarre',
  savoir: 'Lance 2d6 + le bonus d\'une compétence de Savoir',
  pouvoir: 'Lance 2d6 + le bonus d\'une compétence de Pouvoir',
};

/**
 * Commandes /bagarre, /savoir et /pouvoir : le premier argument est l'identifiant de la
 * compétence, le deuxième le personnage visé (MJ uniquement), le troisième un bonus temporaire.
 * Le bonus et le nom d'affichage sont résolus à l'exécution selon le personnage concerné.
 */
const builders = CATEGORIES.map((categorie) =>
  addBonusOption(
    addPersoOption(
      guildCommand(categorie, DESCRIPTIONS[categorie]).addStringOption((option) =>
        option
          .setName('competence')
          .setDescription('Identifiant de la compétence')
          .setRequired(true)
          .setMaxLength(MAX_NAME_LENGTH)
          .setAutocomplete(true),
      ),
    ),
  ),
);

const names = [...CATEGORIES];

function execute(interaction, ctx) {
  const categorie = interaction.commandName;
  const typed = interaction.options.getString('competence', true).trim();
  const skillId = typed.toLowerCase();

  return executeRoll(interaction, ctx, (personnage) => {
    const skill = personnage.competences[categorie][skillId];
    if (skill) return { label: skill.nom, base: skill.bonus };

    // Identifiant connu dans une autre catégorie : probablement une erreur de commande.
    const elsewhere = findSkill(personnage, skillId);
    if (elsewhere) {
      throw new IltakError(
        ErrorCodes.SKILL_NOT_FOUND,
        `« ${skillId} » est une compétence de ${CATEGORY_LABELS[elsewhere.categorie]} : utilisez /${elsewhere.categorie}.`,
      );
    }
    // Compétence inconnue du personnage : jet de 2d6 sans bonus.
    return { label: typed, base: 0 };
  });
}

/**
 * Suggestions d'autocomplétion pour l'argument `competence` : compétences de la catégorie
 * du personnage concerné (PJ de l'utilisateur ou personnage déjà saisi dans `perso`). Aucune suggestion si
 * l'utilisateur n'a pas accès au personnage.
 */
function suggest(ctx, { guildId, userId, persoName, categorie, query }) {
  let personnage;
  try {
    personnage = ctx.permissionService.resolveCharacter({ guildId, userId, persoName });
  } catch (error) {
    if (error instanceof IltakError) return [];
    throw error;
  }
  const key = nameKey(query ?? '');
  return Object.entries(personnage.competences[categorie])
    .filter(([id, skill]) => id.includes(key) || nameKey(skill.nom).includes(key))
    .sort(([, a], [, b]) => a.nom.localeCompare(b.nom, 'fr'))
    .slice(0, MAX_AUTOCOMPLETE_CHOICES)
    .map(([id, skill]) => ({ name: `${skill.nom} (${id}) ${formatSigned(skill.bonus)}`.slice(0, 100), value: id }));
}

module.exports = { builders, names, execute, suggest };
