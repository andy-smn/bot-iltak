'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { ErrorCodes } = require('../src/utils/errors');
const { GUILD, GUILD_2, MJ_1, MJ_2, PLAYER_1, PLAYER_2, makeTempDir, makeServices } = require('./helpers');

const ARTHUR = {
  guildId: GUILD,
  actorId: MJ_1,
  joueurId: PLAYER_1,
  nom: 'Arthur Bennet',
  carac: '1,2,1',
  bagarre: 'cac,"Techniques d\'interpelation",2;distance,"Armes à distance",1',
  savoir: 'inspecteur,"Apprenti inspecteur",1',
  pouvoir: 'sens,"Sens",3',
};
const LOUIS = {
  guildId: GUILD,
  actorId: MJ_1,
  nom: 'Louis Glass',
  carac: '1,1,3',
  bagarre: 'cac,"Corps à corps",0;distance,"Armes à distance",2',
  savoir: 'legiste,"Médecin légiste",2',
  pouvoir: 'glace-creer,"Glace - Créer",1',
};

const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code, `code ${code} attendu`);

test('création d\'un PJ (exemple 8.1)', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  const result = await personnageService.setPerso(ARTHUR);
  assert.equal(result.created, true);
  assert.deepEqual(result.added.sort(), ['cac', 'distance', 'inspecteur', 'sens']);
  const p = result.personnage;
  assert.equal(p.type, 'PJ');
  assert.equal(p.ownerId, PLAYER_1);
  assert.equal(p.createdBy, MJ_1);
  assert.equal(p.guildId, GUILD);
  assert.deepEqual(p.caracteristiques, { corps: 1, coeur: 2, meninges: 1 });
  assert.deepEqual(p.competences.bagarre.cac, { nom: 'Techniques d\'interpelation', bonus: 2 });
  assert.deepEqual(p.competences.pouvoir.sens, { nom: 'Sens', bonus: 3 });
  assert.ok(p.id && p.createdAt && p.updatedAt);
});

test('création d\'un PNJ (exemple 8.2) et unicité des noms insensible à la casse', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  const { personnage } = await personnageService.setPerso(LOUIS);
  assert.equal(personnage.type, 'PNJ');
  assert.equal(personnage.ownerId, null);
  assert.equal(personnage.createdBy, MJ_1);

  // Même nom (casse différente) : c'est une mise à jour du même PNJ, pas un doublon.
  const again = await personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, nom: 'LOUIS  glass', carac: '0,0,0' });
  assert.equal(again.created, false);
  assert.equal(again.personnage.id, personnage.id);
  assert.equal(again.personnage.nom, 'Louis Glass');
  assert.equal(Object.keys(personnageService.store.snapshot().personnages).length, 1);
});

test('noms uniques par serveur, PJ et PNJ confondus', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  await personnageService.setPerso(LOUIS);
  const snapshot = personnageService.store.snapshot();

  // Un PNJ ne peut pas porter le nom d'un PJ (même autre MJ, casse différente).
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_2, nom: 'arthur bennet', carac: '0,0,0' }),
    ErrorCodes.NAME_TAKEN,
  );
  // Un PJ ne peut pas être créé ou renommé avec le nom d'un PNJ.
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_2, nom: 'Louis Glass', carac: '0,0,0' }),
    ErrorCodes.NAME_TAKEN,
  );
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, nom: 'LOUIS GLASS' }),
    ErrorCodes.NAME_TAKEN,
  );
  assert.deepEqual(personnageService.store.snapshot(), snapshot);

  // Changer la casse de son propre nom reste possible, et un autre serveur n'est pas concerné.
  const renamed = await personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, nom: 'ARTHUR BENNET' });
  assert.equal(renamed.personnage.nom, 'ARTHUR BENNET');
  await personnageService.setPerso({ guildId: GUILD_2, actorId: MJ_2, nom: 'Louis Glass', carac: '0,0,0' });
});

test('findByName retrouve un PJ ou un PNJ sans tenir compte de la casse', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  await personnageService.setPerso(LOUIS);
  assert.equal(personnageService.findByName(GUILD, ' arthur  BENNET ').type, 'PJ');
  assert.equal(personnageService.findByName(GUILD, 'louis glass').type, 'PNJ');
  assert.equal(personnageService.findByName(GUILD_2, 'louis glass'), null);
});

test('création : caractéristiques et nom obligatoires', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, nom: 'Sans Carac' }),
    ErrorCodes.INVALID_CARAC,
  );
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, carac: '1,1,1' }),
    ErrorCodes.INVALID_INPUT,
  );
  await rejectsWith(personnageService.setPerso({ guildId: GUILD, actorId: MJ_1 }), ErrorCodes.INVALID_INPUT);
  assert.equal(Object.keys(personnageService.store.snapshot().personnages).length, 0);
});

test('modification partielle (exemple 8.3) : fusion et conservation des compétences', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  const { personnage: before } = await personnageService.setPerso(ARTHUR);

  const result = await personnageService.setPerso({
    guildId: GUILD,
    actorId: MJ_1,
    joueurId: PLAYER_1,
    nom: 'Arthur Bennet',
    carac: '2,2,3',
    bagarre: 'cac,"Combat rapproché",4;esquive,"Esquive",2',
  });
  const p = result.personnage;
  assert.equal(result.created, false);
  assert.equal(p.id, before.id);
  assert.deepEqual(p.caracteristiques, { corps: 2, coeur: 2, meninges: 3 });
  assert.deepEqual(p.competences.bagarre.cac, { nom: 'Combat rapproché', bonus: 4 });
  assert.deepEqual(p.competences.bagarre.esquive, { nom: 'Esquive', bonus: 2 });
  assert.deepEqual(p.competences.bagarre.distance, before.competences.bagarre.distance);
  assert.deepEqual(p.competences.savoir, before.competences.savoir);
  assert.deepEqual(p.competences.pouvoir, before.competences.pouvoir);
  assert.deepEqual(result.added, ['esquive']);
  assert.deepEqual(result.updated, ['cac']);
  assert.equal(p.createdAt, before.createdAt);
});

test('modification : sans carac les valeurs sont conservées, sans nom d\'affichage l\'ancien est conservé', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  const { personnage } = await personnageService.setPerso({
    guildId: GUILD,
    actorId: MJ_1,
    joueurId: PLAYER_1,
    bagarre: 'cac,5',
    savoir: 'nouveau,-1',
  });
  assert.deepEqual(personnage.caracteristiques, { corps: 1, coeur: 2, meninges: 1 });
  assert.deepEqual(personnage.competences.bagarre.cac, { nom: 'Techniques d\'interpelation', bonus: 5 });
  assert.deepEqual(personnage.competences.savoir.nouveau, { nom: 'nouveau', bonus: -1 });
  assert.equal(personnage.nom, 'Arthur Bennet');
});

test('un PJ peut être renommé via son propriétaire', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  const result = await personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, nom: 'Art Bennet' });
  assert.equal(result.renamed, true);
  assert.equal(personnageService.findPjByOwner(GUILD, PLAYER_1).nom, 'Art Bennet');
});

test('un joueur ne possède qu\'un seul PJ par serveur', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  await personnageService.setPerso({ ...ARTHUR, nom: 'Autre Nom' }); // met à jour, ne crée pas
  const pjs = Object.values(personnageService.store.snapshot().personnages).filter((p) => p.type === 'PJ');
  assert.equal(pjs.length, 1);

  // Un fichier contenant deux PJ pour le même joueur est refusé par la validation.
  await assert.rejects(
    personnageService.store.update((draft) => {
      const copy = structuredClone(pjs[0]);
      copy.id = 'autre-id';
      draft.personnages[copy.id] = copy;
    }),
    (error) => error.code === ErrorCodes.DUPLICATE_PJ,
  );

  // Sur un autre serveur, le même joueur peut avoir un autre PJ.
  const other = await personnageService.setPerso({ ...ARTHUR, guildId: GUILD_2 });
  assert.equal(other.created, true);
});

test('doublon d\'identifiant entre catégories : erreur explicite, aucune modification', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  const snapshot = personnageService.store.snapshot();

  await rejectsWith(
    personnageService.setPerso({
      guildId: GUILD,
      actorId: MJ_1,
      joueurId: PLAYER_1,
      carac: '9,9,9',
      bagarre: 'nouveau,1',
      savoir: 'cac,3', // cac existe déjà en bagarre
    }),
    ErrorCodes.DUPLICATE_SKILL,
  );
  // Même identifiant dans deux catégories de la même commande.
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, bagarre: 'x,1', pouvoir: 'x,2' }),
    ErrorCodes.DUPLICATE_SKILL,
  );
  assert.deepEqual(personnageService.store.snapshot(), snapshot);
});

test('paramètre invalide : aucune donnée partielle n\'est enregistrée', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(ARTHUR);
  const snapshot = personnageService.store.snapshot();
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, carac: '5,5,5', bagarre: 'ok,1', savoir: 'Mauvais Id,1' }),
    ErrorCodes.INVALID_SKILL_ID,
  );
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, carac: '5,5', bagarre: 'ok,1' }),
    ErrorCodes.INVALID_CARAC,
  );
  assert.deepEqual(personnageService.store.snapshot(), snapshot);
});

test('un PNJ est protégé : un autre MJ ne peut pas le modifier', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(LOUIS);
  const snapshot = personnageService.store.snapshot();
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_2, nom: 'Louis Glass', carac: '9,9,9' }),
    ErrorCodes.FOREIGN_PNJ,
  );
  assert.deepEqual(personnageService.store.snapshot(), snapshot);
});

test('isolation par serveur : un même nom de PNJ peut exister sur deux serveurs', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  await personnageService.setPerso(LOUIS);
  const other = await personnageService.setPerso({ ...LOUIS, guildId: GUILD_2, actorId: MJ_2 });
  assert.equal(other.created, true);
  assert.equal(personnageService.findPnjByName(GUILD, 'louis glass').createdBy, MJ_1);
  assert.equal(personnageService.findPnjByName(GUILD_2, 'louis glass').createdBy, MJ_2);
  assert.deepEqual(personnageService.listGuildIds().sort(), [GUILD, GUILD_2]);
});

test('persistance après redémarrage et identification par identifiant Discord', async () => {
  const dir = await makeTempDir();
  const first = await makeServices(dir);
  await first.mjService.add(MJ_1);
  await first.personnageService.setPerso(ARTHUR);
  await first.personnageService.setPerso(LOUIS);

  const second = await makeServices(dir);
  assert.equal(second.mjService.isMj(MJ_1), true);
  const arthur = second.personnageService.findPjByOwner(GUILD, PLAYER_1);
  assert.equal(arthur.nom, 'Arthur Bennet');
  assert.equal(second.personnageService.findPjByOwner(GUILD, PLAYER_2), null);
  assert.equal(second.personnageService.findPnjByName(GUILD, 'Louis Glass').createdBy, MJ_1);

  const raw = JSON.parse(await fsp.readFile(path.join(dir, 'personnages.json'), 'utf8'));
  for (const p of Object.values(raw.personnages)) {
    assert.equal(typeof p.guildId, 'string');
    assert.equal(typeof p.createdBy, 'string');
  }
});

test('plus de limite liée aux commandes : un personnage peut avoir de très nombreuses compétences', async () => {
  const { personnageService } = await makeServices(await makeTempDir());
  const skills = Array.from({ length: 150 }, (_, i) => `s${i},1`).join(';');
  const result = await personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, nom: 'Plein', carac: '0,0,0', savoir: skills });
  assert.equal(result.added.length, 150);
});

test('erreur de stockage : aucune donnée conservée', async () => {
  const dir = await makeTempDir();
  const { personnageService, personnageStore } = await makeServices(dir);
  await personnageService.setPerso(ARTHUR);
  const snapshot = personnageStore.snapshot();

  // On remplace le dossier cible par un fichier pour provoquer une erreur d'écriture réelle.
  const file = path.join(dir, 'personnages.json');
  await fsp.rm(`${file}.tmp`, { force: true });
  await fsp.mkdir(`${file}.tmp`);
  await rejectsWith(
    personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, joueurId: PLAYER_1, carac: '9,9,9' }),
    ErrorCodes.STORAGE_ERROR,
  );
  assert.deepEqual(personnageStore.snapshot(), snapshot);
});
