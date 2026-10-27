'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { createInteractionHandler } = require('../src/bot/interactionHandler');
const { DiceService } = require('../src/services/diceService');
const { GUILD, MJ_1, MJ_2, OWNER, PLAYER_1, PLAYER_2, makeTempDir, makeServices } = require('./helpers');

function fakeInteraction({ commandName, userId, guildId = GUILD, options = {}, users = {} }) {
  const calls = { reply: [], editReply: [], deferReply: [], respond: [] };
  return {
    calls,
    commandName,
    guildId,
    user: { id: userId },
    deferred: false,
    replied: false,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isModalSubmit: () => false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    inGuild: () => guildId !== null,
    options: {
      getString: (name) => options[name] ?? null,
      getInteger: (name) => options[name] ?? null,
      getUser: (name) => users[name] ?? null,
    },
    async deferReply(payload) {
      this.deferred = true;
      calls.deferReply.push(payload);
    },
    async reply(payload) {
      this.replied = true;
      calls.reply.push(payload);
    },
    async editReply(payload) {
      calls.editReply.push(payload);
    },
  };
}

async function setup() {
  const services = await makeServices(await makeTempDir());
  await services.mjService.add(MJ_1);
  await services.mjService.add(MJ_2);
  const handler = createInteractionHandler({
    ...services,
    diceService: new DiceService({ randomInt: (() => { const seq = [3, 5]; return () => seq.shift() ?? 1; })() }),
    logger: { error() {} },
  });
  return { ...services, handler };
}

test('/set-perso puis /corps, /bagarre et /savoir via le routeur', async () => {
  const { handler } = await setup();

  const create = fakeInteraction({
    commandName: 'set-perso',
    userId: MJ_1,
    users: { joueur: { id: PLAYER_1, bot: false } },
    options: { nom: 'Arthur Bennet', carac: '1,2,1', bagarre: 'cac,"Techniques d\'interpelation",2' },
  });
  await handler(create);
  assert.deepEqual(create.calls.deferReply[0].flags, MessageFlags.Ephemeral);
  assert.match(create.calls.editReply[0].content, /PJ \*\*Arthur Bennet\*\* créé/);
  assert.doesNotMatch(create.calls.editReply[0].content, /Nouvelles commandes/);

  const corps = fakeInteraction({ commandName: 'corps', userId: PLAYER_1 });
  await handler(corps);
  assert.equal(corps.calls.reply[0].flags, undefined, 'les jets sont publics');
  assert.equal(corps.calls.reply[0].content, '**Jet de Corps de Arthur Bennet**\n2d6[3, 5] + 1 = 9');

  const cac = fakeInteraction({ commandName: 'bagarre', userId: PLAYER_1, options: { competence: 'cac', bonus: 1 } });
  await handler(cac);
  assert.match(cac.calls.reply[0].content, /Jet de Techniques d'interpelation de Arthur Bennet\*\*\n2d6\[1, 1\] \+ 2 \+ 1 \(bonus temporaire\) = 5/);

  // Compétence que le personnage ne possède pas : jet de 2d6 sans bonus, public.
  const missing = fakeInteraction({ commandName: 'bagarre', userId: PLAYER_1, options: { competence: ' Distance ' } });
  await handler(missing);
  assert.equal(missing.calls.reply[0].flags, undefined);
  assert.equal(missing.calls.reply[0].content, '**Jet de Distance de Arthur Bennet**\n2d6[1, 1] + 0 = 2');

  const missingWithBonus = fakeInteraction({ commandName: 'savoir', userId: PLAYER_1, options: { competence: 'inconnue', bonus: 3 } });
  await handler(missingWithBonus);
  assert.equal(missingWithBonus.calls.reply[0].content, '**Jet de inconnue de Arthur Bennet**\n2d6[1, 1] + 0 + 3 (bonus temporaire) = 5');

  // La compétence existe, mais dans une autre catégorie : message explicite.
  const wrongCategory = fakeInteraction({ commandName: 'savoir', userId: PLAYER_1, options: { competence: ' CAC ' } });
  await handler(wrongCategory);
  assert.match(wrongCategory.calls.reply[0].content, /compétence de Bagarre : utilisez \/bagarre/);
});

test('/set-mj, /remove-mj et /liste-mj : réservés au propriétaire (OWNER_ID)', async () => {
  const { handler, mjService, permissionService } = await setup();
  const NEW_MJ = '400000000000000001';
  const run = async (commandName, userId, utilisateur) => {
    const interaction = fakeInteraction({
      commandName,
      userId,
      users: utilisateur ? { utilisateur } : {},
    });
    await handler(interaction);
    assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
    return interaction.calls.reply[0].content;
  };

  // Ni un MJ, ni un joueur ne peuvent gérer les MJ.
  for (const userId of [MJ_1, PLAYER_1]) {
    assert.match(await run('set-mj', userId, { id: PLAYER_2, bot: false }), /réservée au propriétaire/);
    assert.match(await run('remove-mj', userId, { id: MJ_2, bot: false }), /réservée au propriétaire/);
    assert.match(await run('liste-mj', userId), /réservée au propriétaire/);
  }
  assert.equal(mjService.isMj(PLAYER_2), false);
  assert.equal(mjService.isMj(MJ_2), true);

  // Le propriétaire peut tout faire.
  assert.equal(await run('set-mj', OWNER, { id: NEW_MJ, bot: false }), `✅ <@${NEW_MJ}> est désormais MJ.`);
  assert.equal(mjService.isMj(NEW_MJ), true);
  assert.match(await run('set-mj', OWNER, { id: NEW_MJ, bot: false }), /déjà MJ/);
  assert.match(await run('liste-mj', OWNER), new RegExp(`<@${OWNER}>[\\s\\S]*<@${NEW_MJ}>`));
  assert.match(await run('remove-mj', OWNER, { id: NEW_MJ, bot: false }), /n'est plus MJ/);
  assert.equal(mjService.isMj(NEW_MJ), false);
  assert.match(await run('remove-mj', OWNER, { id: NEW_MJ, bot: false }), /n'est pas MJ/);

  // Cas limites : un bot, et le propriétaire lui-même.
  assert.match(await run('set-mj', OWNER, { id: NEW_MJ, bot: true }), /Un bot ne peut pas être MJ/);
  assert.match(await run('remove-mj', OWNER, { id: OWNER, bot: false }), /toujours MJ/);
  permissionService.assertOwner(OWNER);
});

test('/set-perso : le propriétaire est MJ sans être enregistré dans mj.json', async () => {
  const { handler, personnageService } = await setup();
  const interaction = fakeInteraction({
    commandName: 'set-perso',
    userId: OWNER,
    options: { nom: 'Pnj Du Proprio', carac: '1,1,1' },
  });
  await handler(interaction);
  assert.match(interaction.calls.editReply[0].content, /PNJ \*\*Pnj Du Proprio\*\* créé/);
  assert.equal(personnageService.findPnjByName(GUILD, 'pnj du proprio').createdBy, OWNER);
});

test('/set-perso refusé aux non-MJ, sans aucune modification', async () => {
  const { handler, personnageService } = await setup();
  const denied = fakeInteraction({
    commandName: 'set-perso',
    userId: PLAYER_2,
    options: { nom: 'Pirate', carac: '9,9,9' },
  });
  await handler(denied);
  assert.match(denied.calls.editReply[0].content, /réservée aux maîtres du jeu/);
  assert.equal(Object.keys(personnageService.store.snapshot().personnages).length, 0);
});

test('PNJ : jets par le MJ créateur uniquement', async () => {
  const { handler } = await setup();
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_1, options: { nom: 'Louis Glass', carac: '1,1,3' } }));

  const other = fakeInteraction({ commandName: 'corps', userId: MJ_2, options: { perso: 'Louis Glass' } });
  await handler(other);
  assert.match(other.calls.reply[0].content, /appartient à un autre MJ/);
  assert.equal(other.calls.reply[0].flags, MessageFlags.Ephemeral);

  const player = fakeInteraction({ commandName: 'corps', userId: PLAYER_2, options: { perso: 'Louis Glass' } });
  await handler(player);
  assert.match(player.calls.reply[0].content, /réservé aux maîtres du jeu/);

  const owner = fakeInteraction({ commandName: 'meninges', userId: MJ_1, options: { perso: 'Louis Glass', bonus: 2 } });
  await handler(owner);
  assert.equal(owner.calls.reply[0].content, '**Jet de Méninges de Louis Glass**\n2d6[3, 5] + 3 + 2 (bonus temporaire) = 13');
});

test('un MJ lance les dés d\'un PJ avec l\'argument perso (/bagarre, /corps)', async () => {
  const { handler } = await setup();
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      users: { joueur: { id: PLAYER_1, bot: false } },
      options: { nom: 'Test Perso', carac: '1,2,3', bagarre: 'test-bagarre,"Test Bagarre",4' },
    }),
  );

  // N'importe quel MJ (pas seulement le créateur du PJ) peut utiliser un PJ.
  const bagarre = fakeInteraction({ commandName: 'bagarre', userId: MJ_2, options: { competence: 'test-bagarre', perso: 'test perso' } });
  await handler(bagarre);
  assert.equal(bagarre.calls.reply[0].content, '**Jet de Test Bagarre de Test Perso**\n2d6[3, 5] + 4 = 12');

  const corps = fakeInteraction({ commandName: 'corps', userId: MJ_1, options: { perso: 'Test Perso', bonus: -1 } });
  await handler(corps);
  assert.match(corps.calls.reply[0].content, /Jet de Corps de Test Perso\*\*\n2d6\[1, 1\] \+ 1 - 1 \(bonus temporaire\) = 2/);

  // Un joueur ne peut pas viser le PJ d'un autre.
  const player = fakeInteraction({ commandName: 'bagarre', userId: PLAYER_2, options: { competence: 'test-bagarre', perso: 'Test Perso' } });
  await handler(player);
  assert.match(player.calls.reply[0].content, /réservé aux maîtres du jeu/);
});

test('joueur sans personnage et utilisation hors serveur : messages explicites', async () => {
  const { handler } = await setup();
  const none = fakeInteraction({ commandName: 'corps', userId: PLAYER_2 });
  await handler(none);
  assert.match(none.calls.reply[0].content, /Aucun personnage joueur/);

  const dm = fakeInteraction({ commandName: 'corps', userId: PLAYER_2, guildId: null });
  await handler(dm);
  assert.match(dm.calls.reply[0].content, /uniquement sur un serveur/);
});

test('une erreur inattendue ne plante pas le bot', async () => {
  const { handler, personnageService } = await setup();
  personnageService.findPjByOwner = () => {
    throw new Error('bug');
  };
  const interaction = fakeInteraction({ commandName: 'corps', userId: PLAYER_1 });
  await handler(interaction);
  assert.match(interaction.calls.reply[0].content, /erreur interne/);
  assert.equal(interaction.calls.reply[0].flags, MessageFlags.Ephemeral);
});

test('/pouvoir sur un PNJ : réservé au MJ créateur, avec le bon bonus et le bon nom', async () => {
  const { handler } = await setup();
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      options: { nom: 'Louis Glass', carac: '1,1,3', pouvoir: 'glace-creer,"Glace - Créer",1' },
    }),
  );

  const owner = fakeInteraction({ commandName: 'pouvoir', userId: MJ_1, options: { competence: 'glace-creer', perso: 'louis glass' } });
  await handler(owner);
  assert.equal(owner.calls.reply[0].content, '**Jet de Glace - Créer de Louis Glass**\n2d6[3, 5] + 1 = 9');

  const other = fakeInteraction({ commandName: 'pouvoir', userId: MJ_2, options: { competence: 'glace-creer', perso: 'Louis Glass' } });
  await handler(other);
  assert.match(other.calls.reply[0].content, /appartient à un autre MJ/);

  const player = fakeInteraction({ commandName: 'pouvoir', userId: PLAYER_2, options: { competence: 'glace-creer', perso: 'Louis Glass' } });
  await handler(player);
  assert.match(player.calls.reply[0].content, /réservé aux maîtres du jeu/);
});

test('autocomplétion de l\'argument competence : compétences de la catégorie du personnage concerné', async () => {
  const { handler } = await setup();
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      users: { joueur: { id: PLAYER_1, bot: false } },
      options: { nom: 'Arthur', carac: '0,0,0', bagarre: 'cac,"Corps à corps",2;distance,"Armes à distance",-1', savoir: 'lois,"Lois",1' },
    }),
  );
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      options: { nom: 'Louis Glass', carac: '0,0,0', bagarre: 'esquive,"Esquive",3' },
    }),
  );

  const auto = (userId, commandName, value, perso = null) => {
    const interaction = fakeInteraction({ commandName, userId, options: perso ? { perso } : {} });
    interaction.isAutocomplete = () => true;
    interaction.options.getFocused = () => ({ name: 'competence', value });
    interaction.respond = async (choices) => interaction.calls.respond.push(choices);
    return interaction;
  };

  const all = auto(PLAYER_1, 'bagarre', '');
  await handler(all);
  assert.deepEqual(all.calls.respond[0], [
    { name: 'Armes à distance (distance) -1', value: 'distance' },
    { name: 'Corps à corps (cac) +2', value: 'cac' },
  ]);

  const filtered = auto(PLAYER_1, 'bagarre', 'CAC');
  await handler(filtered);
  assert.deepEqual(filtered.calls.respond[0].map((c) => c.value), ['cac']);

  const savoir = auto(PLAYER_1, 'savoir', '');
  await handler(savoir);
  assert.deepEqual(savoir.calls.respond[0].map((c) => c.value), ['lois']);

  const pnj = auto(MJ_1, 'bagarre', '', 'Louis Glass');
  await handler(pnj);
  assert.deepEqual(pnj.calls.respond[0].map((c) => c.value), ['esquive']);

  // Un MJ voit aussi les compétences d'un PJ.
  const pj = auto(MJ_2, 'savoir', '', 'Arthur');
  await handler(pj);
  assert.deepEqual(pj.calls.respond[0].map((c) => c.value), ['lois']);

  // Ni suggestion pour un PNJ d'un autre MJ, ni pour un joueur sans PJ, ni pour un joueur visant un personnage.
  for (const denied of [auto(MJ_2, 'bagarre', '', 'Louis Glass'), auto(PLAYER_2, 'bagarre', ''), auto(PLAYER_2, 'bagarre', '', 'Louis Glass')]) {
    await handler(denied);
    assert.deepEqual(denied.calls.respond[0], []);
  }
});

async function createArthur(handler) {
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      users: { joueur: { id: PLAYER_1, bot: false } },
      options: { nom: 'Arthur Bennet', carac: '1,2,1', bagarre: 'cac,"Techniques",2' },
    }),
  );
}

test('/liste-perso : réservée aux MJ, liste tous les PJ et PNJ du serveur quel que soit leur créateur', async () => {
  const { handler } = await setup();
  await createArthur(handler);
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_1, options: { nom: 'Louis Glass', carac: '1,1,3' } }));
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_2, options: { nom: 'Autre Pnj', carac: '1,1,3' } }));

  const expected =
    `**Personnages (3)**\n\n**PJ (1)**\n• Arthur Bennet — <@${PLAYER_1}>\n\n**PNJ (2)**\n• Autre Pnj\n• Louis Glass`;
  for (const userId of [MJ_1, MJ_2]) {
    const liste = fakeInteraction({ commandName: 'liste-perso', userId });
    await handler(liste);
    assert.equal(liste.calls.reply[0].flags, MessageFlags.Ephemeral);
    assert.equal(liste.calls.reply[0].content, expected);
  }

  const player = fakeInteraction({ commandName: 'liste-perso', userId: PLAYER_1 });
  await handler(player);
  assert.match(player.calls.reply[0].content, /réservée aux maîtres du jeu/);
});

test('/fiche-perso : fiche de son PJ, ou du personnage désigné par un MJ selon les droits d\'accès', async () => {
  const { handler } = await setup();
  await createArthur(handler);
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_1,
      options: { nom: 'Louis Glass', carac: '1,-1,3', bagarre: 'cac,"Corps à corps",0', pouvoir: 'glace,"Glace - Créer",-2' },
    }),
  );

  const own = fakeInteraction({ commandName: 'fiche-perso', userId: PLAYER_1 });
  await handler(own);
  assert.equal(own.calls.reply[0].flags, MessageFlags.Ephemeral);
  assert.equal(
    own.calls.reply[0].content,
    `**Arthur Bennet** — PJ (joueur <@${PLAYER_1}>)\n` +
      'Caractéristiques : Corps +1 · Cœur +2 · Méninges +1\n\n' +
      '**Bagarre**\n• `cac` — Techniques : +2\n\n' +
      '**Savoir**\n_Aucune compétence_\n\n' +
      '**Pouvoir**\n_Aucune compétence_',
  );

  const pnj = fakeInteraction({ commandName: 'fiche-perso', userId: MJ_1, options: { perso: 'louis glass' } });
  await handler(pnj);
  assert.match(pnj.calls.reply[0].content, /\*\*Louis Glass\*\* — PNJ \(créé par <@100000000000000001>\)/);
  assert.match(pnj.calls.reply[0].content, /Corps \+1 · Cœur -1 · Méninges \+3/);
  assert.match(pnj.calls.reply[0].content, /• `glace` — Glace - Créer : -2/);

  const mjOnPj = fakeInteraction({ commandName: 'fiche-perso', userId: MJ_2, options: { perso: 'Arthur Bennet' } });
  await handler(mjOnPj);
  assert.match(mjOnPj.calls.reply[0].content, /\*\*Arthur Bennet\*\* — PJ/);

  for (const [userId, perso, pattern] of [
    [MJ_2, 'Louis Glass', /appartient à un autre MJ/],
    [PLAYER_2, 'Arthur Bennet', /réservé aux maîtres du jeu/],
    [MJ_1, 'Inconnu', /introuvable/],
  ]) {
    const denied = fakeInteraction({ commandName: 'fiche-perso', userId, options: { perso } });
    await handler(denied);
    assert.match(denied.calls.reply[0].content, pattern);
    assert.equal(denied.calls.reply[0].flags, MessageFlags.Ephemeral);
  }

  const noPj = fakeInteraction({ commandName: 'fiche-perso', userId: PLAYER_2 });
  await handler(noPj);
  assert.match(noPj.calls.reply[0].content, /Aucun personnage joueur/);
});

test('les longues fiches sont découpées en plusieurs messages éphémères de 2000 caractères maximum', async () => {
  const { handler } = await setup();
  const skills = Array.from({ length: 80 }, (_, i) => `s${i},"Compétence numéro ${i} avec un nom assez long",1`).join(';');
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_1, options: { nom: 'Gros Perso', carac: '0,0,0', savoir: skills } }));

  const fiche = fakeInteraction({ commandName: 'fiche-perso', userId: MJ_1, options: { perso: 'Gros Perso' } });
  fiche.calls.followUp = [];
  fiche.followUp = async (payload) => fiche.calls.followUp.push(payload);
  await handler(fiche);

  const messages = [fiche.calls.reply[0], ...fiche.calls.followUp];
  assert.ok(messages.length >= 2);
  assert.ok(messages.every((m) => m.content.length <= 2000));
  assert.ok(fiche.calls.followUp.every((m) => m.flags === MessageFlags.Ephemeral));
  const text = messages.map((m) => m.content).join('\n');
  assert.match(text, /s0.*s79/s);
});

test('autocomplétion du paramètre perso : PJ du serveur et PNJ du MJ uniquement', async () => {
  const { handler } = await setup();
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_1, options: { nom: 'Louis Glass', carac: '1,1,3' } }));
  await handler(fakeInteraction({ commandName: 'set-perso', userId: MJ_2, options: { nom: 'Lucie', carac: '1,1,3' } }));
  await handler(
    fakeInteraction({
      commandName: 'set-perso',
      userId: MJ_2,
      users: { joueur: { id: PLAYER_1, bot: false } },
      options: { nom: 'Lou Bennet', carac: '1,1,3' },
    }),
  );

  const auto = (userId, value) => {
    const interaction = fakeInteraction({ commandName: 'corps', userId });
    interaction.isAutocomplete = () => true;
    interaction.options.getFocused = () => ({ name: 'perso', value });
    interaction.respond = async (choices) => interaction.calls.respond.push(choices);
    return interaction;
  };

  const mj1 = auto(MJ_1, 'lou');
  await handler(mj1);
  assert.deepEqual(mj1.calls.respond[0], [
    { name: 'Lou Bennet (PJ)', value: 'Lou Bennet' },
    { name: 'Louis Glass (PNJ)', value: 'Louis Glass' },
  ]);
  const mj2 = auto(MJ_2, 'lou');
  await handler(mj2);
  assert.deepEqual(mj2.calls.respond[0], [{ name: 'Lou Bennet (PJ)', value: 'Lou Bennet' }]);
  const player = auto(PLAYER_1, '');
  await handler(player);
  assert.deepEqual(player.calls.respond[0], []);
});
