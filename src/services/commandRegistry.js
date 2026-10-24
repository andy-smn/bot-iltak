'use strict';

const { Routes } = require('discord.js');
const { IltakError, ErrorCodes } = require('../utils/errors');

// Codes d'erreur de l'API Discord.
const DISCORD_MISSING_ACCESS = 50001;

function toSyncError(error) {
  if (error instanceof IltakError) return error;
  if (error?.code === DISCORD_MISSING_ACCESS) {
    return new IltakError(
      ErrorCodes.SYNC_FAILED,
      'Échec de synchronisation Discord : accès refusé. Le bot doit être invité avec la portée « applications.commands ».',
      { cause: error },
    );
  }
  return new IltakError(
    ErrorCodes.SYNC_FAILED,
    `Échec de synchronisation des commandes Discord : ${error?.message ?? 'erreur inconnue'}.`,
    { cause: error },
  );
}

/**
 * Enregistre les commandes slash propres à chaque serveur (applicationGuildCommands,
 * propagation immédiate). L'ensemble des commandes de l'application sur le serveur est
 * remplacé par la liste fixe du bot : l'opération est idempotente et supprime les
 * commandes obsolètes. Elle n'a lieu qu'au démarrage et à l'arrivée sur un serveur,
 * jamais lors d'un jet ou d'une modification de personnage.
 */
class CommandRegistry {
  /**
   * @param {object} options
   * @param {import('discord.js').REST} options.rest
   * @param {string} options.clientId
   * @param {object[]} options.commands Corps JSON des commandes slash du bot.
   */
  constructor({ rest, clientId, commands }) {
    this.rest = rest;
    this.clientId = clientId;
    this.commands = commands;
  }

  /** @throws {IltakError} SYNC_FAILED */
  async syncGuild(guildId) {
    try {
      await this.rest.put(Routes.applicationGuildCommands(this.clientId, guildId), { body: this.commands });
    } catch (error) {
      throw toSyncError(error);
    }
  }
}

module.exports = { CommandRegistry, toSyncError };
