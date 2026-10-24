'use strict';

const { randomUUID } = require('node:crypto');
const { CATEGORIES, TYPE_PJ, TYPE_PNJ, SKILL_ID_PATTERN, CARACTERISTIQUES } = require('../constants');
const { IltakError, ErrorCodes } = require('../utils/errors');
const { isBonus, isSnowflake, nameKey } = require('../utils/validators');

function emptyCompetences() {
  return Object.fromEntries(CATEGORIES.map((categorie) => [categorie, {}]));
}

/** Crée un personnage (PJ si `ownerId` est fourni, PNJ sinon). */
function createPersonnage({ guildId, nom, ownerId = null, createdBy, caracteristiques, now = new Date() }) {
  const timestamp = now.toISOString();
  return {
    id: randomUUID(),
    guildId,
    type: ownerId ? TYPE_PJ : TYPE_PNJ,
    nom,
    ownerId: ownerId ?? null,
    createdBy,
    caracteristiques: { ...caracteristiques },
    competences: emptyCompetences(),
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: createdBy,
  };
}

/** Retrouve une compétence par identifiant, quelle que soit sa catégorie. */
function findSkill(personnage, skillId) {
  for (const categorie of CATEGORIES) {
    const skill = personnage.competences[categorie][skillId];
    if (skill) return { categorie, id: skillId, nom: skill.nom, bonus: skill.bonus };
  }
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validatePersonnage(p) {
  const fail = (detail) => {
    throw new IltakError(ErrorCodes.INVALID_INPUT, `Personnage invalide (${p?.id ?? '?'}) : ${detail}`);
  };
  if (!isPlainObject(p)) fail('objet attendu');
  if (typeof p.id !== 'string' || !p.id) fail('id manquant');
  if (!isSnowflake(p.guildId)) fail('guildId invalide');
  if (p.type !== TYPE_PJ && p.type !== TYPE_PNJ) fail('type invalide');
  if (typeof p.nom !== 'string' || !p.nom.trim()) fail('nom invalide');
  if (p.type === TYPE_PJ ? !isSnowflake(p.ownerId) : p.ownerId !== null) fail('ownerId incohérent avec le type');
  if (!isSnowflake(p.createdBy)) fail('createdBy invalide');
  if (!isPlainObject(p.caracteristiques)) fail('caracteristiques manquantes');
  for (const { key } of CARACTERISTIQUES) {
    if (!isBonus(p.caracteristiques[key])) fail(`caractéristique « ${key} » invalide`);
  }
  if (!isPlainObject(p.competences)) fail('competences manquantes');

  const seenSkills = new Set();
  for (const categorie of CATEGORIES) {
    const skills = p.competences[categorie];
    if (!isPlainObject(skills)) fail(`catégorie « ${categorie} » manquante`);
    for (const [id, skill] of Object.entries(skills)) {
      if (!SKILL_ID_PATTERN.test(id)) fail(`identifiant de compétence invalide « ${id} »`);
      if (seenSkills.has(id)) fail(`compétence « ${id} » présente dans plusieurs catégories`);
      seenSkills.add(id);
      if (!isPlainObject(skill) || typeof skill.nom !== 'string' || !skill.nom.trim() || !isBonus(skill.bonus)) {
        fail(`compétence « ${id} » invalide`);
      }
    }
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (typeof p[field] !== 'string' || Number.isNaN(Date.parse(p[field]))) fail(`${field} invalide`);
  }
}

/** Valide l'ensemble du fichier personnages.json, y compris les contraintes d'unicité. */
function validatePersonnagesFile(data) {
  if (!isPlainObject(data) || !isPlainObject(data.personnages)) {
    throw new IltakError(ErrorCodes.INVALID_INPUT, 'Structure attendue : { "personnages": { ... } }.');
  }
  const pjKeys = new Set();
  const nameKeys = new Set();
  for (const [key, p] of Object.entries(data.personnages)) {
    validatePersonnage(p);
    if (key !== p.id) {
      throw new IltakError(ErrorCodes.INVALID_INPUT, `Clé « ${key} » différente de l'id du personnage « ${p.id} ».`);
    }
    if (p.type === TYPE_PJ) {
      const unique = `${p.guildId}:${p.ownerId}`;
      if (pjKeys.has(unique)) {
        throw new IltakError(
          ErrorCodes.DUPLICATE_PJ,
          `Le joueur ${p.ownerId} possède déjà un personnage joueur sur ce serveur.`,
        );
      }
      pjKeys.add(unique);
    }
    // Les noms (PJ et PNJ confondus) sont uniques par serveur : un MJ désigne un personnage par son nom.
    const uniqueName = `${p.guildId}:${nameKey(p.nom)}`;
    if (nameKeys.has(uniqueName)) {
      throw new IltakError(ErrorCodes.NAME_TAKEN, `Un personnage nommé « ${p.nom} » existe déjà sur ce serveur.`);
    }
    nameKeys.add(uniqueName);
  }
}

module.exports = {
  createPersonnage,
  emptyCompetences,
  findSkill,
  validatePersonnagesFile,
};
