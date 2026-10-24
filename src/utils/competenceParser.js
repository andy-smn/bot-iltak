'use strict';

const { MAX_BONUS, MAX_SKILL_NAME_LENGTH } = require('../constants');
const { IltakError, ErrorCodes } = require('./errors');
const { normalizeName, validateSkillId } = require('./validators');

const INTEGER_PATTERN = /^[+-]?\d+$/;

function parseBonus(text, makeError) {
  if (!INTEGER_PATTERN.test(text)) {
    throw makeError(`« ${text} » n'est pas un entier valide.`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_BONUS) {
    throw makeError(`Le bonus « ${text} » doit être compris entre -${MAX_BONUS} et ${MAX_BONUS}.`);
  }
  return value === 0 ? 0 : value; // évite -0
}

/**
 * Parse `X,Y,Z` en { corps, coeur, meninges }.
 */
function parseCaracteristiques(input) {
  const makeError = (detail) =>
    new IltakError(
      ErrorCodes.INVALID_CARAC,
      `Format de caractéristiques invalide : ${detail} Format attendu : « corps,coeur,meninges » (ex. 1,2,1).`,
    );

  if (typeof input !== 'string' || !input.trim()) {
    throw makeError('valeur vide.');
  }
  const parts = input.split(',').map((part) => part.trim());
  if (parts.length !== 3) {
    throw makeError(`3 valeurs séparées par des virgules attendues, ${parts.length} reçue(s).`);
  }
  const [corps, coeur, meninges] = parts.map((part) => parseBonus(part, makeError));
  return { corps, coeur, meninges };
}

/**
 * Découpe `id,"Nom",bonus;id2,bonus2` en entrées de champs.
 * Respecte les guillemets (`\"` ou `""` pour un guillemet littéral) ; les guillemets
 * typographiques sont assimilés à des guillemets droits.
 */
function tokenize(input, makeError) {
  const text = input.replace(/[“”«»]/g, '"');
  const entries = [];
  let fields = [];
  let current = { text: '', quoted: false, closed: false };
  let inQuotes = false;

  const pushField = () => {
    fields.push({ value: current.quoted ? current.text : current.text.trim(), quoted: current.quoted });
    current = { text: '', quoted: false, closed: false };
  };
  const pushEntry = () => {
    entries.push(fields);
    fields = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) {
        current.text += text[i + 1];
        i += 1;
      } else if (ch === '"') {
        if (text[i + 1] === '"') {
          current.text += '"';
          i += 1;
        } else {
          inQuotes = false;
          current.closed = true;
        }
      } else {
        current.text += ch;
      }
    } else if (ch === '"') {
      if (current.closed || current.text.trim() !== '') {
        throw makeError('guillemet inattendu (les noms entre guillemets doivent occuper tout le champ).');
      }
      current = { text: '', quoted: true, closed: false };
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === ';') {
      pushField();
      pushEntry();
    } else if (current.closed) {
      if (!/\s/.test(ch)) {
        throw makeError('caractères inattendus après le guillemet fermant.');
      }
    } else {
      current.text += ch;
    }
  }
  if (inQuotes) {
    throw makeError('guillemet non fermé.');
  }
  pushField();
  pushEntry();

  // Un point-virgule final est toléré.
  const last = entries[entries.length - 1];
  if (entries.length > 1 && last.length === 1 && !last[0].quoted && last[0].value === '') {
    entries.pop();
  }
  return entries;
}

/**
 * Parse un paramètre de compétences : `id,"Nom d'affichage",bonus;id2,bonus2`.
 *
 * @param {string} input
 * @param {string} [categorie] Utilisé uniquement pour les messages d'erreur.
 * @returns {{ id: string, nom: string | null, bonus: number }[]} `nom` vaut null s'il est omis.
 */
function parseCompetences(input, categorie = 'compétences') {
  const makeError = (detail) =>
    new IltakError(
      ErrorCodes.INVALID_SKILLS,
      `Format de ${categorie} invalide : ${detail} ` +
        'Format attendu : id,"Nom d\'affichage",bonus;id2,bonus2 (le nom est facultatif).',
    );

  if (typeof input !== 'string' || !input.trim()) {
    throw makeError('valeur vide.');
  }

  const entries = tokenize(input, makeError);
  const seen = new Set();
  const skills = [];

  entries.forEach((fields, index) => {
    const position = `compétence n°${index + 1}`;
    const fail = (detail) => makeError(`${position} : ${detail}`);

    if (fields.length !== 2 && fields.length !== 3) {
      throw fail(`2 ou 3 champs attendus (id, nom facultatif, bonus), ${fields.length} reçu(s).`);
    }
    const id = fields[0].value;
    if (id === '') throw fail('identifiant vide.');
    validateSkillId(id);

    let nom = null;
    if (fields.length === 3) {
      nom = normalizeName(fields[1].value);
      if (nom === '') throw fail('le nom d\'affichage ne peut pas être vide.');
      if (nom.length > MAX_SKILL_NAME_LENGTH) {
        throw fail(`le nom d'affichage ne doit pas dépasser ${MAX_SKILL_NAME_LENGTH} caractères.`);
      }
    }
    const bonusField = fields[fields.length - 1];
    if (bonusField.quoted) throw fail('le bonus ne doit pas être entre guillemets.');
    const bonus = parseBonus(bonusField.value, fail);

    if (seen.has(id)) {
      throw new IltakError(
        ErrorCodes.DUPLICATE_SKILL,
        `Doublon de compétence : « ${id} » apparaît plusieurs fois dans le paramètre ${categorie}.`,
      );
    }
    seen.add(id);
    skills.push({ id, nom, bonus });
  });

  return skills;
}

module.exports = { parseCaracteristiques, parseCompetences };
