'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCaracteristiques, parseCompetences } = require('../src/utils/competenceParser');
const { parseDiscordId } = require('../src/utils/validators');
const { ErrorCodes } = require('../src/utils/errors');

const throwsCode = (fn, code) =>
  assert.throws(fn, (error) => error.code === code, `code ${code} attendu`);

test('parseCaracteristiques : valeurs valides, négatives et nulles', () => {
  assert.deepEqual(parseCaracteristiques('1,2,1'), { corps: 1, coeur: 2, meninges: 1 });
  assert.deepEqual(parseCaracteristiques(' -1 , 0 , +3 '), { corps: -1, coeur: 0, meninges: 3 });
});

test('parseCaracteristiques : formats invalides', () => {
  for (const bad of ['', '1,2', '1,2,3,4', 'a,b,c', '1.5,2,3', '1,2,', '99999,1,1']) {
    throwsCode(() => parseCaracteristiques(bad), ErrorCodes.INVALID_CARAC);
  }
});

test('parseCompetences : avec nom d\'affichage', () => {
  const skills = parseCompetences('cac,"Techniques d\'interpelation",2;distance,"Armes à distance",1');
  assert.deepEqual(skills, [
    { id: 'cac', nom: 'Techniques d\'interpelation', bonus: 2 },
    { id: 'distance', nom: 'Armes à distance', bonus: 1 },
  ]);
});

test('parseCompetences : sans nom d\'affichage (nom null)', () => {
  assert.deepEqual(parseCompetences('cac,2'), [{ id: 'cac', nom: null, bonus: 2 }]);
});

test('parseCompetences : bonus négatifs et nom contenant virgule, point-virgule et Unicode', () => {
  const skills = parseCompetences('glace-creer,"Glace ; Créer, ça – œuvre",-2;sens,"Sens",-0');
  assert.equal(skills[0].nom, 'Glace ; Créer, ça – œuvre');
  assert.equal(skills[0].bonus, -2);
  assert.equal(skills[1].bonus, 0);
  assert.ok(Object.is(skills[1].bonus, 0));
});

test('parseCompetences : guillemets échappés, typographiques et point-virgule final', () => {
  assert.equal(parseCompetences('a,"Dit ""oui""",1')[0].nom, 'Dit "oui"');
  assert.equal(parseCompetences('a,"Dit \\"oui\\"",1')[0].nom, 'Dit "oui"');
  assert.equal(parseCompetences('a,“Nom typo”,1;')[0].nom, 'Nom typo');
  assert.equal(parseCompetences('a,1;').length, 1);
});

test('parseCompetences : erreurs de syntaxe', () => {
  const bad = ['', 'cac', 'cac,', 'cac,x', 'cac,"Nom",', 'cac,"Nom,2', 'cac,"Nom" x,2', 'a,1;;b,2', 'a,"",1', 'a,b,c,1', 'a,"2"'];
  for (const input of bad) {
    throwsCode(() => parseCompetences(input, 'bagarre'), ErrorCodes.INVALID_SKILLS);
  }
});

test('parseCompetences : identifiants invalides', () => {
  for (const id of ['Cac', 'ca c', 'é', '-a', 'a'.repeat(33), 'a/b']) {
    throwsCode(() => parseCompetences(`${id},1`), ErrorCodes.INVALID_SKILL_ID);
  }
});

test('parseCompetences : doublon dans un même paramètre', () => {
  throwsCode(() => parseCompetences('cac,1;cac,2'), ErrorCodes.DUPLICATE_SKILL);
});

test('parseDiscordId : identifiant ou mention', () => {
  assert.equal(parseDiscordId('123456789012345678'), '123456789012345678');
  assert.equal(parseDiscordId('<@123456789012345678>'), '123456789012345678');
  assert.equal(parseDiscordId('<@!123456789012345678>'), '123456789012345678');
  for (const bad of ['@nym4s', '123', '', 'abc', '<@abc>', undefined]) {
    assert.equal(parseDiscordId(bad), null);
  }
});
