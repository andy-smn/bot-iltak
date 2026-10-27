'use strict';

const { CATEGORIES, CATEGORY_LABELS, TYPE_PJ, TYPE_PNJ } = require('../constants');
const { createPersonnage, findSkill, validatePersonnagesFile } = require('../models/personnage');
const { JsonStore } = require('../storage/jsonStorage');
const { parseCaracteristiques, parseCompetences } = require('../utils/competenceParser');
const { IltakError, ErrorCodes } = require('../utils/errors');
const { isSnowflake, nameKey, validateCharacterName } = require('../utils/validators');
const { assertCanControlPnj } = require('./permissionService');

function createPersonnageStore(filePath, options = {}) {
  return new JsonStore({
    filePath,
    createDefault: () => ({ personnages: {} }),
    validate: validatePersonnagesFile,
    ...options,
  });
}

class PersonnageService {
  /**
   * @param {object} deps
   * @param {JsonStore} deps.store
   * @param {() => Date} [deps.now]
   */
  constructor({ store, now = () => new Date() }) {
    this.store = store;
    this.now = now;
  }

  #guildPersonnages(guildId) {
    return Object.values(this.store.snapshot().personnages).filter((p) => p.guildId === guildId);
  }

  findPjByOwner(guildId, ownerId) {
    return this.#guildPersonnages(guildId).find((p) => p.type === TYPE_PJ && p.ownerId === ownerId) ?? null;
  }

  findByName(guildId, nom) {
    const key = nameKey(nom);
    return this.#guildPersonnages(guildId).find((p) => nameKey(p.nom) === key) ?? null;
  }

  findPnjByName(guildId, nom) {
    const key = nameKey(nom);
    return this.#guildPersonnages(guildId).find((p) => p.type === TYPE_PNJ && nameKey(p.nom) === key) ?? null;
  }

  /** Tous les personnages (PJ et PNJ) d'un serveur. */
  listByGuild(guildId) {
    return this.#guildPersonnages(guildId);
  }

  /** Personnages qu'un MJ peut utiliser : tous les PJ du serveur et ses propres PNJ. */
  listUsableByMj(guildId, mjId) {
    return this.#guildPersonnages(guildId).filter((p) => p.type === TYPE_PJ || p.createdBy === mjId);
  }

  findById(guildId, personnageId) {
    const p = this.store.snapshot().personnages[personnageId];
    return p && p.guildId === guildId ? p : null;
  }

  listGuildIds() {
    return [...new Set(Object.values(this.store.snapshot().personnages).map((p) => p.guildId))];
  }

  /**
   * Crée ou met à jour un personnage. Toute la validation est faite avant la moindre
   * écriture ; en cas d'erreur, rien n'est conservé.
   *
   * Le personnage visé est identifié par `personnageId`, sinon par `joueurId` (PJ), sinon par `nom` (PNJ).
   * - `remplacer` : pour chaque catégorie fournie, les compétences absentes de la liste sont supprimées
   *   (sinon les compétences sont fusionnées avec l'existant, sans rien supprimer) ;
   * - `creerUniquement` : refuse de modifier un personnage existant.
   *
   * La vérification du statut MJ de `actorId` doit être faite par l'appelant (PermissionService).
   */
  async setPerso({
    guildId,
    actorId,
    personnageId = null,
    joueurId = null,
    nom = null,
    carac = null,
    bagarre = null,
    savoir = null,
    pouvoir = null,
    remplacer = false,
    creerUniquement = false,
  }) {
    if (!isSnowflake(guildId) || !isSnowflake(actorId) || (joueurId !== null && !isSnowflake(joueurId))) {
      throw new IltakError(ErrorCodes.INVALID_INPUT, 'Identifiants Discord invalides.');
    }

    const cleanNom = nom !== null && nom !== undefined ? validateCharacterName(nom) : null;
    if (!joueurId && !personnageId && cleanNom === null) {
      throw new IltakError(
        ErrorCodes.INVALID_INPUT,
        'Précisez « joueur » (pour un PJ) et/ou « nom » (obligatoire pour un PNJ).',
      );
    }
    const caracteristiques = carac !== null && carac !== undefined ? parseCaracteristiques(carac) : null;

    const rawSkills = { bagarre, savoir, pouvoir };
    const parsedSkills = {};
    const idsInCommand = new Map();
    for (const categorie of CATEGORIES) {
      if (rawSkills[categorie] === null || rawSkills[categorie] === undefined) continue;
      parsedSkills[categorie] =
        remplacer && String(rawSkills[categorie]).trim() === '' ? [] : parseCompetences(rawSkills[categorie], categorie);
      for (const skill of parsedSkills[categorie]) {
        if (idsInCommand.has(skill.id)) {
          throw new IltakError(
            ErrorCodes.DUPLICATE_SKILL,
            `Doublon de compétence : « ${skill.id} » est présent dans les catégories « ${CATEGORY_LABELS[idsInCommand.get(skill.id)]} » ` +
              `et « ${CATEGORY_LABELS[categorie]} ». Un identifiant ne peut appartenir qu'à une seule catégorie.`,
          );
        }
        idsInCommand.set(skill.id, categorie);
      }
    }

    const timestamp = this.now();

    const mutate = (draft) => {
      const inGuild = () => Object.values(draft.personnages).filter((p) => p.guildId === guildId);

      let target;
      if (personnageId) {
        target = draft.personnages[personnageId];
        if (!target || target.guildId !== guildId) {
          throw new IltakError(
            ErrorCodes.CHARACTER_NOT_FOUND,
            'Personnage introuvable (il a peut-être été supprimé ou renommé).',
          );
        }
        assertCanControlPnj(target, actorId);
      } else if (joueurId) {
        target = inGuild().find((p) => p.type === TYPE_PJ && p.ownerId === joueurId);
      } else {
        const key = nameKey(cleanNom);
        target = inGuild().find((p) => p.type === TYPE_PNJ && nameKey(p.nom) === key);
        if (target && !creerUniquement) assertCanControlPnj(target, actorId);
      }

      if (creerUniquement && target) {
        throw joueurId
          ? new IltakError(
              ErrorCodes.DUPLICATE_PJ,
              `Ce joueur possède déjà un personnage joueur (« ${target.nom} ») : modifiez-le au lieu d'en créer un autre.`,
            )
          : new IltakError(ErrorCodes.NAME_TAKEN, `Le nom « ${cleanNom} » est déjà utilisé par un personnage de ce serveur.`);
      }

      const result = { created: false, renamed: false, caracChanged: false, added: [], updated: [], removed: [] };

      // Les noms sont uniques par serveur (PJ et PNJ confondus) : un MJ désigne un personnage par son nom.
      const assertNameFree = (nom, exceptId) => {
        const key = nameKey(nom);
        const clash = inGuild().find((p) => p.id !== exceptId && nameKey(p.nom) === key);
        if (clash) {
          throw new IltakError(
            ErrorCodes.NAME_TAKEN,
            `Le nom « ${nom} » est déjà utilisé par un ${clash.type} sur ce serveur.`,
          );
        }
      };

      if (!target) {
        if (!caracteristiques) {
          throw new IltakError(
            ErrorCodes.INVALID_CARAC,
            'Les caractéristiques (« carac ») sont obligatoires pour créer un personnage.',
          );
        }
        if (cleanNom === null) {
          throw new IltakError(ErrorCodes.INVALID_INPUT, 'Le nom est obligatoire pour créer un personnage.');
        }
        assertNameFree(cleanNom, null);
        target = createPersonnage({
          guildId,
          nom: cleanNom,
          ownerId: joueurId,
          createdBy: actorId,
          caracteristiques,
          now: timestamp,
        });
        draft.personnages[target.id] = target;
        result.created = true;
        result.caracChanged = true;
      } else {
        // Un PNJ désigné seulement par son nom ne peut pas être renommé (le nom est la clé de sélection).
        if ((joueurId || personnageId) && cleanNom !== null && cleanNom !== target.nom) {
          assertNameFree(cleanNom, target.id);
          target.nom = cleanNom;
          result.renamed = true;
        }
        if (caracteristiques) {
          target.caracteristiques = caracteristiques;
          result.caracChanged = true;
        }
      }

      const before = structuredClone(target.competences);
      if (remplacer) {
        for (const categorie of Object.keys(parsedSkills)) target.competences[categorie] = {};
      }

      for (const categorie of CATEGORIES) {
        for (const skill of parsedSkills[categorie] ?? []) {
          const clash = findSkill(target, skill.id);
          if (clash && clash.categorie !== categorie) {
            throw new IltakError(
              ErrorCodes.DUPLICATE_SKILL,
              `Doublon de compétence : « ${skill.id} » existe déjà chez ${target.nom} dans la catégorie ` +
                `« ${CATEGORY_LABELS[clash.categorie]} ». Un identifiant ne peut pas être utilisé dans deux catégories.`,
            );
          }
          const previous = findSkill({ competences: before }, skill.id);
          target.competences[categorie][skill.id] = {
            nom: skill.nom ?? previous?.nom ?? skill.id,
            bonus: skill.bonus,
          };
          (previous ? result.updated : result.added).push(skill.id);
        }
      }

      if (remplacer) {
        result.removed = CATEGORIES.flatMap((categorie) => Object.keys(before[categorie])).filter(
          (id) => !findSkill(target, id),
        );
      }

      target.updatedAt = timestamp.toISOString();
      target.updatedBy = actorId;

      return { ...result, personnage: structuredClone(target) };
    };

    return this.store.update(mutate);
  }
}

module.exports = { PersonnageService, createPersonnageStore };
