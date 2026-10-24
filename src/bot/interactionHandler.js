'use strict';

const caracteristiques = require('../commands/caracteristiques');
const competences = require('../commands/competences');
const consultation = require('../commands/consultation');
const setPerso = require('../commands/set-perso');
const { replyEphemeral } = require('../commands/shared');
const { IltakError, ErrorCodes } = require('../utils/errors');
const { nameKey } = require('../utils/validators');

const MAX_AUTOCOMPLETE_CHOICES = 25;

/** Corps JSON des commandes slash du bot, à enregistrer sur chaque serveur. */
function getCommands() {
  return [setPerso.data, ...caracteristiques.builders, ...competences.builders, ...consultation.builders].map((builder) =>
    builder.toJSON(),
  );
}

/**
 * Route les interactions Discord vers les commandes. Toute erreur est interceptée :
 * un message explicite est renvoyé à l'utilisateur et le bot continue de fonctionner.
 *
 * @param {{ mjService, personnageService, permissionService, diceService, logger? }} ctx
 */
function createInteractionHandler(ctx) {
  const logger = ctx.logger ?? console;

  async function handleAutocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      let choices = [];
      if (!interaction.inGuild()) {
        choices = [];
      } else if (focused.name === 'perso' && ctx.mjService.isMj(interaction.user.id)) {
        const query = nameKey(focused.value ?? '');
        choices = ctx.personnageService
          .listUsableByMj(interaction.guildId, interaction.user.id)
          .filter((p) => nameKey(p.nom).includes(query))
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
          .slice(0, MAX_AUTOCOMPLETE_CHOICES)
          .map((p) => ({ name: `${p.nom} (${p.type})`.slice(0, 100), value: p.nom }));
      } else if (focused.name === 'competence' && competences.names.includes(interaction.commandName)) {
        choices = competences.suggest(ctx, {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          persoName: interaction.options.getString('perso'),
          categorie: interaction.commandName,
          query: focused.value,
        });
      }
      await interaction.respond(choices);
    } catch (error) {
      logger.error('[ILTAK] Erreur d\'autocomplétion :', error);
    }
  }

  async function route(interaction) {
    if (!interaction.inGuild()) {
      throw new IltakError(ErrorCodes.INVALID_INPUT, 'Cette commande est utilisable uniquement sur un serveur.');
    }
    const name = interaction.commandName;
    if (name === setPerso.NAME) return setPerso.execute(interaction, ctx);
    if (caracteristiques.names.includes(name)) return caracteristiques.execute(interaction, ctx);
    if (competences.names.includes(name)) return competences.execute(interaction, ctx);
    if (consultation.names.includes(name)) return consultation.execute(interaction, ctx);
    throw new IltakError(ErrorCodes.INVALID_INPUT, `Commande inconnue : /${name}.`);
  }

  return async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) return handleAutocomplete(interaction);
    if (!interaction.isChatInputCommand()) return undefined;

    try {
      return await route(interaction);
    } catch (error) {
      let message;
      if (error instanceof IltakError) {
        message = `❌ ${error.message}`;
        if (error.cause) logger.error(`[ILTAK] ${error.code} :`, error.cause);
      } else {
        logger.error('[ILTAK] Erreur inattendue :', error);
        message = '❌ Une erreur interne est survenue. Aucune donnée n\'a été modifiée par cette commande.';
      }
      try {
        await replyEphemeral(interaction, message);
      } catch (replyError) {
        logger.error('[ILTAK] Impossible de répondre à l\'interaction :', replyError);
      }
      return undefined;
    }
  };
}

module.exports = { createInteractionHandler, getCommands };
