'use strict';

const {
  MAX_BONUS,
  MAX_NAME_LENGTH,
  SKILL_ID_PATTERN,
  SNOWFLAKE_PATTERN,
} = require('../constants');
const { IltakError, ErrorCodes } = require('./errors');

/**
 * Extrait un identifiant Discord depuis un identifiant numérique ou une mention
 * (`<@123>`, `<@!123>`). Retourne null si le format est invalide.
 */
function parseDiscordId(input) {
  if (typeof input !== 'string') return null;
  const match = input.trim().match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
  return match ? (match[1] ?? match[2]) : null;
}

function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE_PATTERN.test(value);
}

function isBonus(value) {
  return Number.isInteger(value) && Math.abs(value) <= MAX_BONUS;
}

/** Normalise un nom (Unicode NFC, espaces superflus supprimés). */
function normalizeName(name) {
  return String(name).normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Clé de comparaison insensible à la casse. */
function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function validateCharacterName(name) {
  const normalized = normalizeName(name ?? '');
  if (!normalized) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Le nom du personnage ne peut pas être vide.');
  }
  if (normalized.length > MAX_NAME_LENGTH) {
    throw new IltakError(
      ErrorCodes.INVALID_INPUT,
      `Le nom du personnage ne doit pas dépasser ${MAX_NAME_LENGTH} caractères.`,
    );
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Le nom du personnage contient des caractères interdits.');
  }
  return normalized;
}

/** Vérifie qu'un identifiant de compétence est valide (saisi dans les commandes /bagarre, /savoir, /pouvoir). */
function validateSkillId(id) {
  if (!SKILL_ID_PATTERN.test(id)) {
    throw new IltakError(
      ErrorCodes.INVALID_SKILL_ID,
      `Identifiant de compétence invalide : « ${id} ». Utilisez 1 à 32 caractères parmi a-z, 0-9, « - » et « _ » ` +
        '(en minuscules, sans espace ni accent, en commençant par une lettre ou un chiffre).',
    );
  }
}

function formatSigned(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

module.exports = {
  parseDiscordId,
  isSnowflake,
  isBonus,
  normalizeName,
  nameKey,
  validateCharacterName,
  validateSkillId,
  formatSigned,
};
