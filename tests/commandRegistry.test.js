'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CommandRegistry } = require('../src/services/commandRegistry');
const { getCommands } = require('../src/bot/interactionHandler');
const { ErrorCodes } = require('../src/utils/errors');
const { GUILD } = require('./helpers');

test('définitions : commandes slash du bot', () => {
  const commands = getCommands();
  assert.deepEqual(commands.map((c) => c.name), [
    'set-perso', 'formulaire-perso', 'corps', 'coeur', 'meninges', 'bagarre', 'savoir', 'pouvoir',
    'liste-perso', 'fiche-perso', 'set-mj', 'remove-mj', 'liste-mj',
  ]);

  const byName = Object.fromEntries(commands.map((c) => [c.name, c]));
  assert.deepEqual(byName['set-perso'].options.map((o) => o.name), ['joueur', 'nom', 'carac', 'bagarre', 'savoir', 'pouvoir']);
  assert.deepEqual(byName.corps.options.map((o) => o.name), ['bonus', 'perso']);

  for (const name of ['bagarre', 'savoir', 'pouvoir']) {
    const options = byName[name].options;
    assert.deepEqual(options.map((o) => o.name), ['competence', 'perso', 'bonus']);
    assert.equal(options[0].required, true);
    assert.equal(options[0].autocomplete, true);
    assert.ok(!options[1].required && !options[2].required);
  }
  for (const command of commands) assert.ok(command.description.length <= 100);
});

test('syncGuild : remplace les commandes du serveur par la liste du bot', async () => {
  const calls = [];
  const rest = { put: async (route, { body }) => calls.push({ route, body }) };
  const commands = getCommands();
  await new CommandRegistry({ rest, clientId: '800000000000000001', commands }).syncGuild(GUILD);
  assert.equal(calls.length, 1);
  assert.match(calls[0].route, new RegExp(`/applications/800000000000000001/guilds/${GUILD}/commands$`));
  assert.deepEqual(calls[0].body, commands);
});

test('syncGuild : erreurs Discord converties en erreurs explicites', async () => {
  const make = (error) => new CommandRegistry({ rest: { put: async () => { throw error; } }, clientId: '1', commands: [] });
  await assert.rejects(
    make(Object.assign(new Error('Missing Access'), { code: 50001 })).syncGuild(GUILD),
    (error) => error.code === ErrorCodes.SYNC_FAILED && /applications\.commands/.test(error.message),
  );
  await assert.rejects(
    make(new Error('réseau')).syncGuild(GUILD),
    (error) => error.code === ErrorCodes.SYNC_FAILED && /réseau/.test(error.message),
  );
});
