'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { JsonStore } = require('../src/storage/jsonStorage');
const { ErrorCodes } = require('../src/utils/errors');
const { makeTempDir } = require('./helpers');

const makeStore = (filePath, extra = {}) =>
  new JsonStore({ filePath, createDefault: () => ({ n: 0 }), ...extra });

test('JsonStore : crée le dossier et le fichier s\'ils n\'existent pas', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'sous', 'dossier', 'x.json');
  await makeStore(file).init();
  assert.deepEqual(JSON.parse(await fsp.readFile(file, 'utf8')), { n: 0 });
});

test('JsonStore : persistance après redémarrage', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'x.json');
  const first = makeStore(file);
  await first.init();
  await first.update((draft) => {
    draft.n = 42;
  });
  const second = makeStore(file);
  await second.init();
  assert.equal(second.snapshot().n, 42);
});

test('JsonStore : un JSON corrompu fait échouer le démarrage sans être écrasé', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'x.json');
  await fsp.writeFile(file, '{ pas du json');
  await assert.rejects(makeStore(file).init(), (error) => error.code === ErrorCodes.STORAGE_CORRUPT);
  assert.equal(await fsp.readFile(file, 'utf8'), '{ pas du json');
});

test('JsonStore : un contenu invalide fait échouer le démarrage sans être écrasé', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'x.json');
  await fsp.writeFile(file, '{"n":"oops"}');
  const store = makeStore(file, {
    validate: (data) => {
      if (typeof data.n !== 'number') throw new Error('n doit être un nombre');
    },
  });
  await assert.rejects(store.init(), (error) => error.code === ErrorCodes.STORAGE_CORRUPT);
  assert.equal(await fsp.readFile(file, 'utf8'), '{"n":"oops"}');
});

test('JsonStore : une erreur d\'écriture ne modifie ni le disque ni la mémoire', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'x.json');
  let failWrites = false;
  const fs = {
    ...fsp,
    rename: (...args) => (failWrites ? Promise.reject(new Error('disque plein')) : fsp.rename(...args)),
  };
  const store = makeStore(file, { fs });
  await store.init();
  await store.update((draft) => {
    draft.n = 1;
  });

  failWrites = true;
  await assert.rejects(
    store.update((draft) => {
      draft.n = 2;
    }),
    (error) => error.code === ErrorCodes.STORAGE_ERROR,
  );
  assert.equal(store.snapshot().n, 1);
  assert.equal(JSON.parse(await fsp.readFile(file, 'utf8')).n, 1);
  await assert.rejects(fsp.access(`${file}.tmp`)); // pas de fichier temporaire résiduel

  failWrites = false;
  await store.update((draft) => {
    draft.n = 3;
  });
  assert.equal(store.snapshot().n, 3);
});

test('JsonStore : une erreur dans le mutateur annule tout et n\'expose pas l\'état interne', async () => {
  const dir = await makeTempDir();
  const store = makeStore(path.join(dir, 'x.json'));
  await store.init();
  await assert.rejects(
    store.update((draft) => {
      draft.n = 99;
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(store.snapshot().n, 0);
  store.snapshot().n = 5; // modifier la copie ne change rien
  assert.equal(store.snapshot().n, 0);
});

test('JsonStore : les mises à jour concurrentes sont sérialisées sans perte', async () => {
  const dir = await makeTempDir();
  const file = path.join(dir, 'x.json');
  const store = makeStore(file);
  await store.init();
  await Promise.all(
    Array.from({ length: 30 }, () =>
      store.update(async (draft) => {
        const current = draft.n;
        await new Promise((resolve) => setTimeout(resolve, 1));
        draft.n = current + 1;
      }),
    ),
  );
  assert.equal(store.snapshot().n, 30);
  assert.equal(JSON.parse(await fsp.readFile(file, 'utf8')).n, 30);
});
