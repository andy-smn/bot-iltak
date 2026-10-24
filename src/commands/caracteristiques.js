'use strict';

const { CARACTERISTIQUES } = require('../constants');
const { addRollOptions, executeRoll, guildCommand } = require('./shared');

const DESCRIPTIONS = {
  corps: 'Lance 2d6 + votre bonus de Corps',
  coeur: 'Lance 2d6 + votre bonus de Cœur',
  meninges: 'Lance 2d6 + votre bonus de Méninges',
};

/** Définitions (SlashCommandBuilder) des commandes /corps, /coeur et /meninges. */
const builders = CARACTERISTIQUES.map(({ key }) => addRollOptions(guildCommand(key, DESCRIPTIONS[key])));

const names = CARACTERISTIQUES.map(({ key }) => key);

function execute(interaction, ctx) {
  const carac = CARACTERISTIQUES.find(({ key }) => key === interaction.commandName);
  return executeRoll(interaction, ctx, (personnage) => ({
    label: carac.label,
    base: personnage.caracteristiques[carac.key],
  }));
}

module.exports = { builders, names, execute };
