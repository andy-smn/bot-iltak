'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ErrorCodes } = require('../src/utils/errors');
const { DiceService, formatRoll } = require('../src/services/diceService');
const { executeConsoleCommand } = require('../src/console/consoleCommands');
const { GUILD, GUILD_2, MJ_1, MJ_2, PLAYER_1, PLAYER_2, makeTempDir, makeServices } = require('./helpers');

const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code, `code ${code} attendu`);

async function setup() {
  const services = await makeServices(await makeTempDir());
  await services.mjService.add(MJ_1);
  await services.mjService.add(MJ_2);
  await services.personnageService.setPerso({
    guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, nom: 'Arthur Bennet', carac: '1,2,1', bagarre: 'cac,"Techniques",2',
  });
  await services.personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, nom: 'Louis Glass', carac: '1,1,3' });
  return services;
}

test('MJ : seuls les MJ enregistrés passent assertMj, le retrait est persistant', async () => {
  const { permissionService, mjService } = await setup();
  permissionService.assertMj(MJ_1);
  throwsCode(() => permissionService.assertMj(PLAYER_1), ErrorCodes.NOT_MJ);
  assert.equal(await mjService.remove(MJ_1), true);
  assert.equal(await mjService.remove(MJ_1), false);
  throwsCode(() => permissionService.assertMj(MJ_1), ErrorCodes.NOT_MJ);
});

test('joueur : utilise son PJ, identifié par son ID Discord', async () => {
  const { permissionService } = await setup();
  assert.equal(permissionService.resolveCharacter({ guildId: GUILD, userId: PLAYER_1 }).nom, 'Arthur Bennet');
  throwsCode(() => permissionService.resolveCharacter({ guildId: GUILD, userId: PLAYER_2 }), ErrorCodes.NO_CHARACTER);
  // Un PJ n'existe que sur son serveur.
  throwsCode(() => permissionService.resolveCharacter({ guildId: GUILD_2, userId: PLAYER_1 }), ErrorCodes.NO_CHARACTER);
});

test('joueur : le paramètre perso est interdit', async () => {
  const { permissionService } = await setup();
  for (const persoName of ['Louis Glass', 'Arthur Bennet', 'Inconnu']) {
    throwsCode(
      () => permissionService.resolveCharacter({ guildId: GUILD, userId: PLAYER_1, persoName }),
      ErrorCodes.PERSO_NOT_ALLOWED,
    );
  }
});

test('MJ créateur : accède à son PNJ (nom insensible à la casse), pas à un personnage inconnu', async () => {
  const { permissionService } = await setup();
  assert.equal(permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_1, persoName: 'louis glass' }).nom, 'Louis Glass');
  throwsCode(
    () => permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_1, persoName: 'Inconnu' }),
    ErrorCodes.CHARACTER_NOT_FOUND,
  );
  throwsCode(() => permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_1 }), ErrorCodes.NO_CHARACTER);
});

test('un MJ peut utiliser le PJ de n\'importe quel joueur, sur le même serveur uniquement', async () => {
  const { permissionService } = await setup();
  for (const userId of [MJ_1, MJ_2]) {
    const pj = permissionService.resolveCharacter({ guildId: GUILD, userId, persoName: 'arthur bennet' });
    assert.equal(pj.type, 'PJ');
    assert.equal(pj.ownerId, PLAYER_1);
  }
  throwsCode(
    () => permissionService.resolveCharacter({ guildId: GUILD_2, userId: MJ_1, persoName: 'Arthur Bennet' }),
    ErrorCodes.CHARACTER_NOT_FOUND,
  );
});

test('un autre MJ ne peut pas utiliser le PNJ', async () => {
  const { permissionService } = await setup();
  throwsCode(
    () => permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_2, persoName: 'Louis Glass' }),
    ErrorCodes.FOREIGN_PNJ,
  );
});

test('un MJ révoqué conserve ses PNJ mais ne peut plus les utiliser, jusqu\'à restauration', async () => {
  const { permissionService, mjService, personnageService } = await setup();
  await mjService.remove(MJ_1);
  for (const persoName of ['Louis Glass', 'Arthur Bennet']) {
    throwsCode(
      () => permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_1, persoName }),
      ErrorCodes.PERSO_NOT_ALLOWED,
    );
  }
  assert.ok(personnageService.findPnjByName(GUILD, 'Louis Glass'));
  assert.equal(personnageService.findPjByOwner(GUILD, PLAYER_1).nom, 'Arthur Bennet');
  await mjService.add(MJ_1);
  assert.equal(permissionService.resolveCharacter({ guildId: GUILD, userId: MJ_1, persoName: 'Louis Glass' }).nom, 'Louis Glass');
});

test('listUsableByMj : tous les PJ du serveur et les PNJ du MJ uniquement', async () => {
  const { personnageService } = await setup();
  const names = (guildId, mjId) => personnageService.listUsableByMj(guildId, mjId).map((p) => p.nom).sort();
  assert.deepEqual(names(GUILD, MJ_1), ['Arthur Bennet', 'Louis Glass']);
  assert.deepEqual(names(GUILD, MJ_2), ['Arthur Bennet']);
  assert.deepEqual(names(GUILD_2, MJ_1), []);
});

test('dés : somme des deux dés, bonus enregistré et bonus temporaire', () => {
  const sequence = [3, 5];
  const dice = new DiceService({ randomInt: () => sequence.shift() });
  const roll = dice.roll({ base: 1, tempBonus: 2 });
  assert.deepEqual(roll, { dice: [3, 5], base: 1, tempBonus: 2, total: 11 });
});

test('dés : le générateur par défaut produit des valeurs de 1 à 6', () => {
  const dice = new DiceService();
  for (let i = 0; i < 500; i += 1) {
    const { dice: values, total } = dice.roll({ base: 0 });
    assert.equal(values.length, 2);
    assert.ok(values.every((v) => Number.isInteger(v) && v >= 1 && v <= 6));
    assert.equal(total, values[0] + values[1]);
  }
});

test('dés : formats d\'affichage (sans bonus temporaire, avec, négatifs)', () => {
  const format = (roll) => formatRoll({ label: 'Corps', personnageNom: 'Arthur Bennet', roll });
  assert.equal(
    format({ dice: [3, 5], base: 1, tempBonus: 0, total: 9 }),
    '**Jet de Corps de Arthur Bennet**\n2d6[3, 5] + 1 = 9',
  );
  assert.equal(
    format({ dice: [3, 5], base: 1, tempBonus: 2, total: 11 }),
    '**Jet de Corps de Arthur Bennet**\n2d6[3, 5] + 1 + 2 (bonus temporaire) = 11',
  );
  assert.equal(
    format({ dice: [3, 5], base: -1, tempBonus: -2, total: 5 }),
    '**Jet de Corps de Arthur Bennet**\n2d6[3, 5] - 1 - 2 (bonus temporaire) = 5',
  );
});

test('le bonus temporaire ne modifie jamais les données enregistrées', async () => {
  const { personnageService, permissionService } = await setup();
  const dice = new DiceService({ randomInt: () => 4 });
  const before = personnageService.store.snapshot();
  const pj = permissionService.resolveCharacter({ guildId: GUILD, userId: PLAYER_1 });
  const roll = dice.roll({ base: pj.caracteristiques.corps, tempBonus: -5 });
  assert.equal(roll.total, 8 + 1 - 5);
  assert.deepEqual(personnageService.store.snapshot(), before);
});

test('console set-mj / remove-mj : identifiant, mention, déjà MJ, erreurs', async () => {
  const { mjService } = await makeServices(await makeTempDir());
  const run = (line) => executeConsoleCommand(line, { mjService });
  const id = '123456789012345678';

  assert.equal((await run(`set-mj ${id}`)).output, `[ILTAK] L'utilisateur ${id} est désormais MJ.`);
  assert.equal(mjService.isMj(id), true);
  assert.match((await run(`set-mj <@${id}>`)).output, /déjà MJ/);
  assert.match((await run('set-mj @nym4s')).output, /Identifiant invalide/);
  assert.match((await run('set-mj')).output, /Identifiant invalide/);
  assert.match((await run(`remove-mj <@!${id}>`)).output, /n'est plus MJ/);
  assert.equal(mjService.isMj(id), false);
  assert.match((await run(`remove-mj ${id}`)).output, /n'est pas MJ/);
  assert.match((await run('inconnue')).output, /Commande inconnue/);
  assert.equal(await run('   '), null);
  assert.equal((await run('stop')).exit, true);
});

test('console : le statut MJ survit à un redémarrage', async () => {
  const dir = await makeTempDir();
  const first = await makeServices(dir);
  await executeConsoleCommand(`set-mj ${MJ_1}`, { mjService: first.mjService });
  const second = await makeServices(dir);
  assert.equal(second.mjService.isMj(MJ_1), true);
});
