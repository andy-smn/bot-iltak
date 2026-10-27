'use strict';

const { InteractionContextType, MessageFlags, SlashCommandBuilder, escapeMarkdown } = require('discord.js');
const { MAX_BONUS, MAX_NAME_LENGTH } = require('../constants');
const { formatRoll } = require('../services/diceService');
const { splitMessage } = require('../utils/formatters');

const NO_MENTIONS = Object.freeze({ parse: [] });

/** Base d'une commande slash utilisable uniquement sur un serveur. */
function guildCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild);
}

function addBonusOption(builder) {
  return builder.addIntegerOption((option) =>
    option
      .setName('bonus')
      .setDescription('Bonus temporaire (négatif possible), non enregistré')
      .setMinValue(-MAX_BONUS)
      .setMaxValue(MAX_BONUS),
  );
}

function addPersoOption(builder) {
  return builder.addStringOption((option) =>
    option
      .setName('perso')
      .setDescription('MJ uniquement : nom du personnage (PJ ou PNJ) à utiliser')
      .setMaxLength(MAX_NAME_LENGTH)
      .setAutocomplete(true),
  );
}

/** Options des commandes de caractéristiques : `bonus` (temporaire) puis `perso`. */
function addRollOptions(builder) {
  return addPersoOption(addBonusOption(builder));
}

/** Lance 2d6 + bonus pour un personnage et publie le résultat publiquement dans le salon. */
async function publishRoll(interaction, ctx, personnage, { label, base, tempBonus = 0 }) {
  const roll = ctx.diceService.roll({ base, tempBonus });
  await interaction.reply({
    content: formatRoll({
      label: escapeMarkdown(label),
      personnageNom: escapeMarkdown(personnage.nom),
      roll,
    }),
    allowedMentions: NO_MENTIONS,
  });
}

/**
 * Exécute un jet : résout le personnage (PJ de l'utilisateur, ou personnage désigné par un MJ),
 * détermine le bonus enregistré via `pickBase`, puis publie le résultat publiquement dans le salon.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ctx
 * @param {(personnage: object) => { label: string, base: number }} pickBase
 */
async function executeRoll(interaction, ctx, pickBase) {
  const personnage = ctx.permissionService.resolveCharacter({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    persoName: interaction.options.getString('perso'),
  });
  const { label, base } = pickBase(personnage);
  const tempBonus = interaction.options.getInteger('bonus') ?? 0;
  await publishRoll(interaction, ctx, personnage, { label, base, tempBonus });
}

/** Réponse éphémère (visible uniquement par l'utilisateur). `extra` : composants, etc. */
async function replyEphemeral(interaction, content, extra = {}) {
  const payload = { content, allowedMentions: NO_MENTIONS, ...extra };
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

/**
 * Réponse éphémère découpée en plusieurs messages si elle dépasse la limite de Discord.
 * Les composants éventuels sont attachés au dernier message (le plus proche du bas de l'écran).
 */
async function replyEphemeralChunks(interaction, text, components = []) {
  const chunks = splitMessage(text);
  const extraFor = (index) => (index === chunks.length - 1 && components.length > 0 ? { components } : {});
  await replyEphemeral(interaction, chunks[0], extraFor(0));
  for (let i = 1; i < chunks.length; i += 1) {
    await interaction.followUp({
      content: chunks[i],
      allowedMentions: NO_MENTIONS,
      flags: MessageFlags.Ephemeral,
      ...extraFor(i),
    });
  }
}

module.exports = {
  NO_MENTIONS,
  guildCommand,
  addBonusOption,
  addPersoOption,
  addRollOptions,
  executeRoll,
  publishRoll,
  replyEphemeral,
  replyEphemeralChunks,
};
