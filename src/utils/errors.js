'use strict';

/**
 * Erreur métier dont le message est destiné à être affiché à l'utilisateur.
 * Toute autre erreur est considérée comme interne et n'est jamais exposée telle quelle.
 */
class IltakError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'IltakError';
    this.code = code;
  }
}

const ErrorCodes = Object.freeze({
  NOT_MJ: 'NOT_MJ',
  NO_CHARACTER: 'NO_CHARACTER',
  CHARACTER_NOT_FOUND: 'CHARACTER_NOT_FOUND',
  FOREIGN_PNJ: 'FOREIGN_PNJ',
  PERSO_NOT_ALLOWED: 'PERSO_NOT_ALLOWED',
  NAME_TAKEN: 'NAME_TAKEN',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  INVALID_SKILL_ID: 'INVALID_SKILL_ID',
  INVALID_CARAC: 'INVALID_CARAC',
  INVALID_SKILLS: 'INVALID_SKILLS',
  DUPLICATE_SKILL: 'DUPLICATE_SKILL',
  DUPLICATE_PJ: 'DUPLICATE_PJ',
  INVALID_INPUT: 'INVALID_INPUT',
  STORAGE_ERROR: 'STORAGE_ERROR',
  STORAGE_CORRUPT: 'STORAGE_CORRUPT',
  SYNC_FAILED: 'SYNC_FAILED',
});

module.exports = { IltakError, ErrorCodes };
