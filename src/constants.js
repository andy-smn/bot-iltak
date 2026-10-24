'use strict';

const CARACTERISTIQUES = Object.freeze([
  { key: 'corps', label: 'Corps' },
  { key: 'coeur', label: 'Cœur' },
  { key: 'meninges', label: 'Méninges' },
]);

const CATEGORIES = Object.freeze(['bagarre', 'savoir', 'pouvoir']);

const CATEGORY_LABELS = Object.freeze({
  bagarre: 'Bagarre',
  savoir: 'Savoir',
  pouvoir: 'Pouvoir',
});

const TYPE_PJ = 'PJ';
const TYPE_PNJ = 'PNJ';

const MAX_BONUS = 1000;
const MAX_NAME_LENGTH = 80;
const MAX_SKILL_NAME_LENGTH = 100;
const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

module.exports = {
  CARACTERISTIQUES,
  CATEGORIES,
  CATEGORY_LABELS,
  TYPE_PJ,
  TYPE_PNJ,
  MAX_BONUS,
  MAX_NAME_LENGTH,
  MAX_SKILL_NAME_LENGTH,
  SKILL_ID_PATTERN,
  SNOWFLAKE_PATTERN,
};
