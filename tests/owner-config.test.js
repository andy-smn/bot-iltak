'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { executeConsoleCommand } = require('../src/console/consoleCommands');
const { ErrorCodes } = require('../src/utils/errors');
const { MJ_1, OWNER, makeTempDir, makeServices } = require('./helpers');

const base = { DISCORD_TOKEN: 'token', CLIENT_ID: '800000000000000001' };

test('config : OWNER_ID facultatif, validé s\'il est présent', () => {
  assert.equal(loadConfig(base).ownerId, null);
  assert.equal(loadConfig({ ...base, OWNER_ID: '  123456789012345678 ' }).ownerId, '123456789012345678');
  assert.equal(loadConfig({ ...base, OWNER_ID: '' }).ownerId, null);
  assert.throws(() => loadConfig({ ...base, OWNER_ID: 'moi' }), /OWNER_ID/);
});

test('config : DATA_DIR personnalisé et configuration incomplète', () => {
  assert.equal(loadConfig({ ...base, DATA_DIR: '/data' }).dataDir, path.resolve('/data'));
  assert.throws(() => loadConfig({}), /DISCORD_TOKEN.*CLIENT_ID/);
});

test('propriétaire : toujours MJ, jamais retirable, listé en premier', async () => {
  const { mjService } = await makeServices(await makeTempDir());
  assert.equal(mjService.isOwner(OWNER), true);
  assert.equal(mjService.isOwner(MJ_1), false);
  assert.equal(mjService.isMj(OWNER), true);

  assert.equal(await mjService.add(OWNER), false);
  assert.deepEqual(mjService.store.snapshot(), {}); // pas écrit dans mj.json
  await mjService.add(MJ_1);
  assert.deepEqual(mjService.list(), [OWNER, MJ_1]);
  await assert.rejects(mjService.remove(OWNER), (error) => error.code === ErrorCodes.INVALID_INPUT);
  assert.equal(mjService.isMj(OWNER), true);
});

test('sans OWNER_ID : personne n\'est propriétaire, la console reste disponible', async () => {
  const { mjService, permissionService } = await makeServices(await makeTempDir(), { ownerId: null });
  assert.equal(mjService.isOwner(OWNER), false);
  assert.throws(() => permissionService.assertOwner(OWNER), (error) => error.code === ErrorCodes.NOT_OWNER);
  assert.match((await executeConsoleCommand(`set-mj ${MJ_1}`, { mjService })).output, /désormais MJ/);
  assert.deepEqual(mjService.list(), [MJ_1]);
});

test('console : le propriétaire est « déjà MJ » et ne peut pas être retiré', async () => {
  const { mjService } = await makeServices(await makeTempDir());
  assert.match((await executeConsoleCommand(`set-mj ${OWNER}`, { mjService })).output, /déjà MJ/);
  assert.match((await executeConsoleCommand(`remove-mj ${OWNER}`, { mjService })).output, /toujours MJ/);
});
