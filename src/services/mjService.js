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

/**
 * Gestion des maîtres du jeu, persistée dans mj.json.
 * Le propriétaire du bot (variable OWNER_ID) est toujours MJ, sans dépendre du fichier JSON,
 * et est le seul à pouvoir attribuer ou retirer le statut MJ.
 */
class MjService {
  /**
   * @param {import('../storage/jsonStorage').JsonStore} store
   * @param {{ ownerId?: string | null }} [options]
   */
  constructor(store, { ownerId = null } = {}) {
    this.store = store;
    this.ownerId = ownerId;
  }

  isOwner(userId) {
    return this.ownerId !== null && userId === this.ownerId;
  }

  isMj(userId) {
    return this.isOwner(userId) || this.store.snapshot()[userId] === true;
  }

  /** Liste des MJ, propriétaire en premier. */
  list() {
    const ids = Object.keys(this.store.snapshot()).filter((id) => id !== this.ownerId);
    return this.ownerId ? [this.ownerId, ...ids] : ids;
  }

  /** @returns {Promise<boolean>} true si l'utilisateur vient d'être promu, false s'il l'était déjà. */
  add(userId) {
    if (this.isOwner(userId)) return Promise.resolve(false);
    return this.store.update((draft) => {
      if (draft[userId] === true) return false;
      draft[userId] = true;
      return true;
    });
  }

  /** @returns {Promise<boolean>} true si les droits ont été retirés, false si l'utilisateur n'était pas MJ. */
  remove(userId) {
    if (this.isOwner(userId)) {
      return Promise.reject(
        new IltakError(ErrorCodes.INVALID_INPUT, 'Le propriétaire du bot est toujours MJ : ses droits ne peuvent pas être retirés.'),
      );
    }
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
