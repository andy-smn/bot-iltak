'use strict';

const {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { CATEGORIES, CATEGORY_LABELS, MAX_NAME_LENGTH } = require('../constants');
const { ErrorCodes, IltakError } = require('../utils/errors');
const { assertCanControlPnj } = require('../services/permissionService');
const { formatConfirmation } = require('./set-perso');
const { guildCommand, replyEphemeral } = require('./shared');

const NAME = 'formulaire-perso';
const PREFIX = 'perso-form';
const MAX_FIELD_LENGTH = 4000;

const data = guildCommand(NAME, 'MJ : ouvre un formulaire pour créer ou modifier un personnage')
  .addUserOption((option) =>
    option.setName('joueur').setDescription('Joueur : modifie son PJ, ou crée un PJ pour lui'),
  )
  .addStringOption((option) =>
    option
      .setName('perso')
      .setDescription('Personnage existant à modifier (PJ ou PNJ). Sans option : nouveau PNJ')
      .setMaxLength(MAX_NAME_LENGTH)
      .setAutocomplete(true),
  );

/** Une compétence par ligne : `id,"Nom d'affichage",bonus` (guillemets doublés dans le nom). */
function skillsToLines(skills) {
  return Object.entries(skills)
    .map(([id, skill]) => `${id},"${skill.nom.replace(/"/g, '""')}",${skill.bonus}`)
    .join('\n');
}

/** Convertit les lignes du formulaire au format attendu par le parseur (séparateur `;`). */
function linesToParam(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(';');
}

function textInput({ id, label, style, required, placeholder, value, maxLength }) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required);
  if (placeholder) input.setPlaceholder(placeholder);
  if (maxLength) input.setMaxLength(maxLength);
  if (value) input.setValue(value);
  return new ActionRowBuilder().addComponents(input);
}

/**
 * Formulaire prérempli avec l'état actuel du personnage. À l'envoi, les catégories de
 * compétences sont REMPLACÉES par le contenu des champs (ce qu'on voit est ce qu'on obtient).
 */
function buildModal(mode, personnage) {
  const prefill = {};
  for (const categorie of CATEGORIES) {
    prefill[categorie] = personnage ? skillsToLines(personnage.competences[categorie]) : '';
    if (prefill[categorie].length > MAX_FIELD_LENGTH) {
      throw new IltakError(
        ErrorCodes.INVALID_INPUT,
        `Trop de compétences en ${CATEGORY_LABELS[categorie]} pour tenir dans le formulaire : utilisez /set-perso.`,
      );
    }
  }

  const c = personnage?.caracteristiques;
  const title = personnage ? `Modifier ${personnage.nom}` : mode.startsWith('pj') ? 'Nouveau PJ' : 'Nouveau PNJ';

  return new ModalBuilder()
    .setCustomId(`${PREFIX}:${mode}`)
    .setTitle(title.slice(0, 45))
    .addComponents(
      textInput({
        id: 'nom',
        label: 'Nom',
        style: TextInputStyle.Short,
        required: true,
        maxLength: MAX_NAME_LENGTH,
        value: personnage?.nom,
      }),
      textInput({
        id: 'carac',
        label: 'Caractéristiques : corps,coeur,meninges',
        style: TextInputStyle.Short,
        required: true,
        placeholder: '1,2,1',
        value: c ? `${c.corps},${c.coeur},${c.meninges}` : undefined,
      }),
      ...CATEGORIES.map((categorie) =>
        textInput({
          id: categorie,
          label: `${CATEGORY_LABELS[categorie]} (une par ligne : id,"Nom",bonus)`,
          style: TextInputStyle.Paragraph,
          required: false,
          placeholder: 'cac,"Corps à corps",2',
          maxLength: MAX_FIELD_LENGTH,
          value: prefill[categorie],
        }),
      ),
    );
}

/**
 * /formulaire-perso : réservé aux MJ.
 * - `perso` : modifie ce personnage (PJ, ou PNJ du MJ) ;
 * - `joueur` : modifie le PJ de ce joueur, ou en crée un ;
 * - sans option : crée un nouveau PNJ.
 */
async function execute(interaction, ctx) {
  const userId = interaction.user.id;
  ctx.permissionService.assertMj(userId);

  const joueur = interaction.options.getUser('joueur');
  const persoName = interaction.options.getString('perso');
  if (joueur && persoName) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Indiquez soit « joueur », soit « perso », pas les deux.');
  }
  if (joueur?.bot) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Un bot ne peut pas être propriétaire d\'un personnage joueur.');
  }

  let personnage = null;
  let mode = 'pnj';
  if (persoName) {
    personnage = ctx.personnageService.findByName(interaction.guildId, persoName);
    if (!personnage) {
      throw new IltakError(
        ErrorCodes.CHARACTER_NOT_FOUND,
        `Personnage introuvable : aucun personnage nommé « ${persoName.trim()} » sur ce serveur. ` +
          'Pour en créer un, lancez la commande sans option (PNJ) ou avec « joueur » (PJ).',
      );
    }
    assertCanControlPnj(personnage, userId);
    mode = `edit:${personnage.id}`;
  } else if (joueur) {
    personnage = ctx.personnageService.findPjByOwner(interaction.guildId, joueur.id);
    mode = personnage ? `edit:${personnage.id}` : `pj:${joueur.id}`;
  }

  await interaction.showModal(buildModal(mode, personnage));
}

/** Envoi du formulaire : les droits sont revérifiés, puis les données sont validées et enregistrées d'un bloc. */
async function handleModalSubmit(interaction, ctx) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const userId = interaction.user.id;
  ctx.permissionService.assertMj(userId);

  const [, kind, ref] = interaction.customId.split(':');
  const field = (id) => interaction.fields.getTextInputValue(id);
  const params = {
    guildId: interaction.guildId,
    actorId: userId,
    nom: field('nom'),
    carac: field('carac'),
    bagarre: linesToParam(field('bagarre')),
    savoir: linesToParam(field('savoir')),
    pouvoir: linesToParam(field('pouvoir')),
    remplacer: true,
  };

  if (kind === 'edit') {
    params.personnageId = ref;
  } else if (kind === 'pj') {
    params.joueurId = ref;
    params.creerUniquement = true;
  } else if (kind === 'pnj') {
    params.creerUniquement = true;
  } else {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Ce formulaire n\'est plus valide.');
  }

  const result = await ctx.personnageService.setPerso(params);
  await replyEphemeral(interaction, formatConfirmation(result, result.personnage.ownerId));
}

module.exports = { NAME, PREFIX, data, execute, handleModalSubmit, skillsToLines, linesToParam };
