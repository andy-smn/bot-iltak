'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const { IltakError, ErrorCodes } = require('../utils/errors');

class StorageError extends IltakError {
  constructor(code, message, options) {
    super(code, message, options);
    this.name = 'StorageError';
  }
}

/**
 * Stockage d'un document JSON unique, avec :
 * - création automatique du fichier s'il n'existe pas ;
 * - refus de démarrer (sans rien écraser) si le fichier existant est corrompu ou invalide ;
 * - mises à jour sérialisées (une seule écriture à la fois) ;
 * - écriture atomique (fichier temporaire + renommage) ;
 * - état en mémoire modifié uniquement si la validation et l'écriture ont réussi.
 */
class JsonStore {
  #data = null;
  #queue = Promise.resolve();

  /**
   * @param {object} options
   * @param {string} options.filePath
   * @param {() => object} options.createDefault Fabrique de la valeur initiale.
   * @param {(data: object) => void} [options.validate] Doit lever une erreur si les données sont invalides.
   * @param {typeof fsp} [options.fs] Implémentation du système de fichiers (injectable pour les tests).
   */
  constructor({ filePath, createDefault, validate = () => {}, fs = fsp }) {
    this.filePath = filePath;
    this.createDefault = createDefault;
    this.validate = validate;
    this.fs = fs;
  }

  async init() {
    await this.fs.mkdir(path.dirname(this.filePath), { recursive: true });

    let raw;
    try {
      raw = await this.fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new StorageError(
          ErrorCodes.STORAGE_ERROR,
          `Impossible de lire ${this.filePath} : ${error.message}`,
          { cause: error },
        );
      }
      const initial = this.createDefault();
      this.validate(initial);
      await this.#write(initial);
      this.#data = initial;
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new StorageError(
        ErrorCodes.STORAGE_CORRUPT,
        `Le fichier ${this.filePath} n'est pas un JSON valide (${error.message}). ` +
          'Il n\'a pas été modifié : corrigez-le ou restaurez une sauvegarde avant de relancer le bot.',
        { cause: error },
      );
    }

    try {
      this.validate(parsed);
    } catch (error) {
      throw new StorageError(
        ErrorCodes.STORAGE_CORRUPT,
        `Le contenu de ${this.filePath} est invalide : ${error.message}. ` +
          'Le fichier n\'a pas été modifié.',
        { cause: error },
      );
    }
    this.#data = parsed;
  }

  /** Copie profonde de l'état courant (l'état interne n'est jamais exposé). */
  snapshot() {
    this.#assertReady();
    return structuredClone(this.#data);
  }

  /**
   * Applique `mutator` sur une copie de travail, valide, écrit sur disque puis remplace
   * l'état en mémoire. Si quoi que ce soit échoue, ni le disque ni la mémoire ne sont modifiés.
   *
   * @template T
   * @param {(draft: object) => T | Promise<T>} mutator
   * @returns {Promise<T>} La valeur retournée par `mutator`.
   */
  update(mutator) {
    this.#assertReady();
    const run = this.#queue.then(async () => {
      const draft = structuredClone(this.#data);
      const result = await mutator(draft);
      try {
        this.validate(draft);
      } catch (error) {
        if (error instanceof IltakError) throw error;
        throw new StorageError(
          ErrorCodes.STORAGE_ERROR,
          `Données invalides, aucune modification enregistrée : ${error.message}`,
          { cause: error },
        );
      }
      await this.#write(draft);
      this.#data = draft;
      return result;
    });
    this.#queue = run.catch(() => {});
    return run;
  }

  #assertReady() {
    if (this.#data === null) {
      throw new Error(`JsonStore non initialisé : ${this.filePath}`);
    }
  }

  async #write(data) {
    const tmpPath = `${this.filePath}.tmp`;
    try {
      const handle = await this.fs.open(tmpPath, 'w');
      try {
        await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.fs.rename(tmpPath, this.filePath);
    } catch (error) {
      await this.fs.rm(tmpPath, { force: true }).catch(() => {});
      throw new StorageError(
        ErrorCodes.STORAGE_ERROR,
        'Erreur de sauvegarde JSON : aucune donnée n\'a été modifiée.',
        { cause: error },
      );
    }
  }
}

module.exports = { JsonStore, StorageError };
