'use strict';

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createMjStore, MjService } = require('../src/services/mjService');
const { createPersonnageStore, PersonnageService } = require('../src/services/personnageService');
const { PermissionService } = require('../src/services/permissionService');

const GUILD = '900000000000000001';
const GUILD_2 = '900000000000000002';
const MJ_1 = '100000000000000001';
const MJ_2 = '100000000000000002';
const PLAYER_1 = '200000000000000001';
const PLAYER_2 = '200000000000000002';
const OWNER = '300000000000000001';

async function makeTempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'iltak-test-'));
}

/** Construit tous les services sur un dossier de données (nouvelle « session » du bot). */
async function makeServices(dir, { ownerId = OWNER } = {}) {
  const mjStore = createMjStore(path.join(dir, 'mj.json'));
  const personnageStore = createPersonnageStore(path.join(dir, 'personnages.json'));
  await mjStore.init();
  await personnageStore.init();
  const mjService = new MjService(mjStore, { ownerId });
  const personnageService = new PersonnageService({ store: personnageStore });
  const permissionService = new PermissionService({ mjService, personnageService });
  return { mjService, personnageService, permissionService, mjStore, personnageStore };
}

module.exports = { GUILD, GUILD_2, MJ_1, MJ_2, PLAYER_1, PLAYER_2, OWNER, makeTempDir, makeServices };
