'use strict';

const { JsonStore } = require('../storage/jsonStorage');
const { IltakError, ErrorCodes } = require('../utils/errors');
const { isSnowflake } = require('../utils/validators');

function validateMjFile(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Structure attendue : { "<discord_id>": true }.');
  }
  for (const [id, value] of Object.entries(data)) {
    if (!isSnowflake(id) || value !== true) {
      throw new IltakError(ErrorCodes.INVALID_INPUT, `Entrée MJ invalide : « ${id} ».`);
    }
  }
}

/** Gestion des maîtres du jeu, persistée dans mj.json. */
class MjService {
  /** @param {import('../storage/jsonStorage').JsonStore} store */
  constructor(store) {
    this.store = store;
  }

  isMj(userId) {
    return this.store.snapshot()[userId] === true;
  }

  list() {
    return Object.keys(this.store.snapshot());
  }

  /** @returns {Promise<boolean>} true si l'utilisateur vient d'être promu, false s'il l'était déjà. */
  add(userId) {
    return this.store.update((draft) => {
      if (draft[userId] === true) return false;
      draft[userId] = true;
      return true;
    });
  }

  /** @returns {Promise<boolean>} true si les droits ont été retirés, false si l'utilisateur n'était pas MJ. */
  remove(userId) {
    return this.store.update((draft) => {
      if (draft[userId] !== true) return false;
      delete draft[userId];
      return true;
    });
  }
}

function createMjStore(filePath, options = {}) {
  return new JsonStore({ filePath, createDefault: () => ({}), validate: validateMjFile, ...options });
}

module.exports = { MjService, createMjStore, validateMjFile };
