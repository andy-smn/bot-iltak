'use strict';

const { formatFiche, formatListe } = require('../utils/formatters');
const { addPersoOption, guildCommand, replyEphemeralChunks } = require('./shared');

const LISTE = 'liste-perso';
const FICHE = 'fiche-perso';

const builders = [
  guildCommand(LISTE, 'MJ : liste tous les PJ et PNJ du serveur'),
  addPersoOption(
    guildCommand(FICHE, 'Affiche la fiche de votre personnage (MJ : de n\'importe quel PJ ou de vos PNJ)'),
  ),
];

const names = [LISTE, FICHE];

/** /liste-perso : réservé aux MJ ; liste tous les personnages du serveur, quel que soit le MJ créateur des PNJ. */
async function executeListe(interaction, ctx) {
  ctx.permissionService.assertMj(interaction.user.id);
  const personnages = ctx.personnageService.listByGuild(interaction.guildId);
  await replyEphemeralChunks(interaction, formatListe(personnages));
}

/** /fiche-perso : son propre PJ, ou (MJ) le personnage désigné par `perso`, avec les mêmes règles d'accès que les jets. */
async function executeFiche(interaction, ctx) {
  const personnage = ctx.permissionService.resolveCharacter({
    guildId: interaction.guildId,
    userId: interaction.user.id,
    persoName: interaction.options.getString('perso'),
  });
  await replyEphemeralChunks(interaction, formatFiche(personnage));
}

function execute(interaction, ctx) {
  return interaction.commandName === LISTE ? executeListe(interaction, ctx) : executeFiche(interaction, ctx);
}

module.exports = { builders, names, execute };
