'use strict';

const { ErrorCodes, IltakError } = require('../utils/errors');
const { guildCommand, replyEphemeral } = require('./shared');

const SET_MJ = 'set-mj';
const REMOVE_MJ = 'remove-mj';
const LISTE_MJ = 'liste-mj';

const targetOption = (description) => (option) =>
  option.setName('utilisateur').setDescription(description).setRequired(true);

const builders = [
  guildCommand(SET_MJ, 'Propriétaire du bot : donne le statut MJ à un utilisateur').addUserOption(
    targetOption('Utilisateur à promouvoir MJ'),
  ),
  guildCommand(REMOVE_MJ, 'Propriétaire du bot : retire le statut MJ (les personnages sont conservés)').addUserOption(
    targetOption('Utilisateur dont retirer le statut MJ'),
  ),
  guildCommand(LISTE_MJ, 'Propriétaire du bot : liste les MJ'),
];

const names = [SET_MJ, REMOVE_MJ, LISTE_MJ];

/**
 * Gestion des MJ depuis Discord, réservée au propriétaire du bot (variable OWNER_ID).
 * Le contrôle est fait côté bot, sur l'identifiant Discord de l'utilisateur.
 */
async function execute(interaction, ctx) {
  ctx.permissionService.assertOwner(interaction.user.id);

  if (interaction.commandName === LISTE_MJ) {
    const ids = ctx.mjService.list();
    await replyEphemeral(
      interaction,
      ids.length ? `**MJ (${ids.length})**\n${ids.map((id) => `• <@${id}>`).join('\n')}` : 'Aucun MJ enregistré.',
    );
    return;
  }

  const user = interaction.options.getUser('utilisateur', true);
  if (user.bot) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Un bot ne peut pas être MJ.');
  }

  if (interaction.commandName === SET_MJ) {
    const added = await ctx.mjService.add(user.id);
    await replyEphemeral(interaction, added ? `✅ <@${user.id}> est désormais MJ.` : `<@${user.id}> est déjà MJ.`);
  } else {
    const removed = await ctx.mjService.remove(user.id);
    await replyEphemeral(
      interaction,
      removed ? `✅ <@${user.id}> n'est plus MJ. Ses personnages sont conservés.` : `<@${user.id}> n'est pas MJ.`,
    );
  }
}

module.exports = { builders, names, execute };
