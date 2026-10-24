'use strict';

const { MessageFlags, escapeMarkdown } = require('discord.js');
const { CARACTERISTIQUES, CATEGORIES, CATEGORY_LABELS, MAX_NAME_LENGTH } = require('../constants');
const { ErrorCodes, IltakError } = require('../utils/errors');
const { formatSigned } = require('../utils/validators');
const { guildCommand, replyEphemeral } = require('./shared');

const NAME = 'set-perso';

const data = guildCommand(NAME, 'MJ : crée ou met à jour un personnage (PJ si « joueur » est renseigné, sinon PNJ)')
  .addUserOption((option) => option.setName('joueur').setDescription('Joueur propriétaire du PJ (absent : PNJ du MJ)'))
  .addStringOption((option) =>
    option
      .setName('nom')
      .setDescription('Nom du personnage (obligatoire pour un PNJ et à la création)')
      .setMaxLength(MAX_NAME_LENGTH),
  )
  .addStringOption((option) => option.setName('carac').setDescription('Bonus Corps,Cœur,Méninges (ex. 1,2,1)'))
  .addStringOption((option) =>
    option.setName('bagarre').setDescription('id,"Nom",bonus;id2,"Nom 2",bonus2 (nom facultatif)'),
  )
  .addStringOption((option) =>
    option.setName('savoir').setDescription('id,"Nom",bonus;id2,"Nom 2",bonus2 (nom facultatif)'),
  )
  .addStringOption((option) =>
    option.setName('pouvoir').setDescription('id,"Nom",bonus;id2,"Nom 2",bonus2 (nom facultatif)'),
  );

function formatConfirmation(result, joueurId) {
  const { personnage: p } = result;
  const verb = result.created ? 'créé' : 'mis à jour';
  const owner = p.type === 'PJ' ? ` — joueur <@${joueurId ?? p.ownerId}>` : '';
  const lines = [`✅ ${p.type} **${escapeMarkdown(p.nom)}** ${verb}${owner}`];

  lines.push(
    'Caractéristiques : ' +
      CARACTERISTIQUES.map(({ key, label }) => `${label} ${formatSigned(p.caracteristiques[key])}`).join(' · '),
  );
  for (const categorie of CATEGORIES) {
    const skills = Object.entries(p.competences[categorie]);
    if (skills.length === 0) continue;
    lines.push(
      `${CATEGORY_LABELS[categorie]} : ` +
        skills
          .map(([id, s]) => `\`${id}\` ${escapeMarkdown(s.nom)} ${formatSigned(s.bonus)}`)
          .join(' · '),
    );
  }
  if (result.renamed) lines.push('Le personnage a été renommé.');
  if (result.added.length > 0) lines.push(`Compétences ajoutées : ${result.added.map((id) => `\`${id}\``).join(', ')}`);
  if (result.updated.length > 0) lines.push(`Compétences modifiées : ${result.updated.map((id) => `\`${id}\``).join(', ')}`);
  return lines.join('\n');
}

async function execute(interaction, ctx) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Permissions vérifiées avant toute lecture ou modification des données.
  ctx.permissionService.assertMj(interaction.user.id);

  const joueur = interaction.options.getUser('joueur');
  if (joueur?.bot) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Un bot ne peut pas être propriétaire d\'un personnage joueur.');
  }

  const result = await ctx.personnageService.setPerso({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    joueurId: joueur?.id ?? null,
    nom: interaction.options.getString('nom'),
    carac: interaction.options.getString('carac'),
    bagarre: interaction.options.getString('bagarre'),
    savoir: interaction.options.getString('savoir'),
    pouvoir: interaction.options.getString('pouvoir'),
  });

  await replyEphemeral(interaction, formatConfirmation(result, joueur?.id ?? null));
}

module.exports = { NAME, data, execute, formatConfirmation };
