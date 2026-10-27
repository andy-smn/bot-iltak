'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const { createInteractionHandler } = require('../src/bot/interactionHandler');
const { linesToParam, skillsToLines } = require('../src/commands/formulaire');
const { DiceService } = require('../src/services/diceService');
const { parseCompetences } = require('../src/utils/competenceParser');
const { GUILD, MJ_1, MJ_2, PLAYER_1, PLAYER_2, makeTempDir, makeServices } = require('./helpers');

/** Fausse interaction (commande, bouton, menu ou formulaire) enregistrant les réponses du bot. */
function fake({ kind = 'command', commandName, customId, userId, guildId = GUILD, options = {}, users = {}, values = [], fields = {} }) {
  const calls = { reply: [], editReply: [], deferReply: [], followUp: [], showModal: [] };
  return {
    calls,
    commandName,
    customId,
    values,
    guildId,
    user: { id: userId },
    deferred: false,
    replied: false,
    isAutocomplete: () => false,
    isChatInputCommand: () => kind === 'command',
    isModalSubmit: () => kind === 'modal',
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    inGuild: () => guildId !== null,
    options: {
      getString: (name) => options[name] ?? null,
      getInteger: (name) => options[name] ?? null,
      getUser: (name) => users[name] ?? null,
    },
    fields: { getTextInputValue: (id) => fields[id] ?? '' },
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
    async followUp(payload) {
      calls.followUp.push(payload);
    },
    async showModal(modal) {
      calls.showModal.push(modal.toJSON());
    },
  };
}

async function setup() {
  const services = await makeServices(await makeTempDir());
  await services.mjService.add(MJ_1);
  await services.mjService.add(MJ_2);
  const seq = [3, 5];
  const handler = createInteractionHandler({
    ...services,
    diceService: new DiceService({ randomInt: () => seq[0] === undefined ? 1 : seq.shift() }),
    logger: { error() {} },
  });
  const create = (options) => services.personnageService.setPerso({ guildId: GUILD, actorId: MJ_1, ...options });
  return { ...services, handler, create };
}

const modalFields = (modal) => Object.fromEntries(modal.components.map((row) => [row.components[0].custom_id, row.components[0]]));
const ephemeral = (interaction) => interaction.calls.reply[0].flags === MessageFlags.Ephemeral;

test('formulaire : conversion des lignes et aller-retour avec le parseur', () => {
  const skills = {
    cac: { nom: 'Dit "oui", puis ; non', bonus: -2 },
    sens: { nom: 'Sens', bonus: 3 },
  };
  const text = skillsToLines(skills);
  assert.equal(text, 'cac,"Dit ""oui"", puis ; non",-2\nsens,"Sens",3');
  assert.deepEqual(
    parseCompetences(linesToParam(`\n  ${text.replace('\n', '\r\n\r\n')}  \n`)).map(({ id, nom, bonus }) => [id, nom, bonus]),
    [['cac', 'Dit "oui", puis ; non', -2], ['sens', 'Sens', 3]],
  );
  assert.equal(linesToParam('  \n\n '), '');
});

test('/formulaire-perso : réservé aux MJ, ouvre un formulaire vierge pour un nouveau PNJ', async () => {
  const { handler } = await setup();

  const denied = fake({ commandName: 'formulaire-perso', userId: PLAYER_1 });
  await handler(denied);
  assert.equal(denied.calls.showModal.length, 0);
  assert.match(denied.calls.reply[0].content, /réservée aux maîtres du jeu/);
  assert.ok(ephemeral(denied));

  const form = fake({ commandName: 'formulaire-perso', userId: MJ_1 });
  await handler(form);
  const modal = form.calls.showModal[0];
  assert.equal(modal.custom_id, 'perso-form:pnj');
  assert.equal(modal.title, 'Nouveau PNJ');
  const fields = modalFields(modal);
  assert.deepEqual(Object.keys(fields), ['nom', 'carac', 'bagarre', 'savoir', 'pouvoir']);
  assert.ok(fields.nom.required && fields.carac.required);
  assert.ok(!fields.bagarre.required && fields.bagarre.style === 2);
  assert.ok(Object.values(fields).every((f) => f.value === undefined));
  assert.ok(Object.values(fields).every((f) => f.label.length <= 45));
});

test('/formulaire-perso : formulaire prérempli pour modifier un PJ (joueur) ou un personnage (perso)', async () => {
  const { handler, create } = await setup();
  const { personnage: arthur } = await create({
    joueurId: PLAYER_1, nom: 'Arthur Bennet', carac: '1,-2,3',
    bagarre: 'cac,"Corps ""à"" corps",2;distance,"Armes",-1', pouvoir: 'sens,"Sens",3',
  });
  const { personnage: louis } = await create({ nom: 'Louis Glass', carac: '0,0,0' });

  const byJoueur = fake({ commandName: 'formulaire-perso', userId: MJ_2, users: { joueur: { id: PLAYER_1, bot: false } } });
  await handler(byJoueur);
  let modal = byJoueur.calls.showModal[0];
  assert.equal(modal.custom_id, `perso-form:edit:${arthur.id}`);
  assert.equal(modal.title, 'Modifier Arthur Bennet');
  let fields = modalFields(modal);
  assert.equal(fields.nom.value, 'Arthur Bennet');
  assert.equal(fields.carac.value, '1,-2,3');
  assert.equal(fields.bagarre.value, 'cac,"Corps ""à"" corps",2\ndistance,"Armes",-1');
  assert.equal(fields.savoir.value, undefined);
  assert.equal(fields.pouvoir.value, 'sens,"Sens",3');

  const byPerso = fake({ commandName: 'formulaire-perso', userId: MJ_1, options: { perso: 'louis glass' } });
  await handler(byPerso);
  assert.equal(byPerso.calls.showModal[0].custom_id, `perso-form:edit:${louis.id}`);

  // Joueur sans PJ : formulaire de création d'un PJ pour lui.
  const newPj = fake({ commandName: 'formulaire-perso', userId: MJ_1, users: { joueur: { id: PLAYER_2, bot: false } } });
  await handler(newPj);
  assert.equal(newPj.calls.showModal[0].custom_id, `perso-form:pj:${PLAYER_2}`);
  assert.equal(newPj.calls.showModal[0].title, 'Nouveau PJ');
});

test('/formulaire-perso : refus (PNJ d\'un autre MJ, inconnu, options incompatibles, bot)', async () => {
  const { handler, create } = await setup();
  await create({ nom: 'Louis Glass', carac: '0,0,0' });
  const cases = [
    [{ userId: MJ_2, options: { perso: 'Louis Glass' } }, /appartient à un autre MJ/],
    [{ userId: MJ_1, options: { perso: 'Inconnu' } }, /introuvable/],
    [{ userId: MJ_1, options: { perso: 'Louis Glass' }, users: { joueur: { id: PLAYER_1, bot: false } } }, /soit « joueur », soit « perso »/],
    [{ userId: MJ_1, users: { joueur: { id: PLAYER_1, bot: true } } }, /Un bot/],
  ];
  for (const [params, pattern] of cases) {
    const interaction = fake({ commandName: 'formulaire-perso', ...params });
    await handler(interaction);
    assert.equal(interaction.calls.showModal.length, 0);
    assert.match(interaction.calls.reply[0].content, pattern);
    assert.ok(ephemeral(interaction));
  }
});

test('formulaire : un trop gros contenu est refusé au lieu d\'être tronqué', async () => {
  const { handler, create } = await setup();
  const skills = Array.from({ length: 90 }, (_, i) => `s${i},"${'x'.repeat(45)}",1`).join(';');
  await create({ nom: 'Géant', carac: '0,0,0', savoir: skills });
  const interaction = fake({ commandName: 'formulaire-perso', userId: MJ_1, options: { perso: 'Géant' } });
  await handler(interaction);
  assert.equal(interaction.calls.showModal.length, 0);
  assert.match(interaction.calls.reply[0].content, /Trop de compétences en Savoir.*\/set-perso/);
});

test('envoi du formulaire : création d\'un PNJ puis refus d\'écraser un personnage existant', async () => {
  const { handler, personnageService } = await setup();
  const submit = (fields, userId = MJ_1, customId = 'perso-form:pnj') => fake({ kind: 'modal', customId, userId, fields });

  const ok = submit({
    nom: 'Louis Glass', carac: '1,1,3',
    bagarre: 'cac,"Corps à corps",0\n\ndistance,"Armes à distance",2\n', savoir: '', pouvoir: 'glace-creer,"Glace - Créer",1',
  });
  await handler(ok);
  assert.equal(ok.calls.deferReply[0].flags, MessageFlags.Ephemeral);
  assert.match(ok.calls.editReply[0].content, /PNJ \*\*Louis Glass\*\* créé/);
  const louis = personnageService.findPnjByName(GUILD, 'Louis Glass');
  assert.equal(louis.createdBy, MJ_1);
  assert.deepEqual(Object.keys(louis.competences.bagarre), ['cac', 'distance']);
  assert.equal(louis.competences.pouvoir['glace-creer'].nom, 'Glace - Créer');

  const before = personnageService.store.snapshot();
  for (const userId of [MJ_1, MJ_2]) {
    const again = submit({ nom: 'LOUIS GLASS', carac: '9,9,9' }, userId);
    await handler(again);
    assert.match(again.calls.editReply[0].content, /déjà utilisé/);
  }
  assert.deepEqual(personnageService.store.snapshot(), before);
});

test('envoi du formulaire : création d\'un PJ pour un joueur, un seul PJ par joueur', async () => {
  const { handler, personnageService } = await setup();
  const submit = (nom) =>
    fake({ kind: 'modal', customId: `perso-form:pj:${PLAYER_2}`, userId: MJ_1, fields: { nom, carac: '2,2,2' } });

  const ok = submit('Marie');
  await handler(ok);
  assert.match(ok.calls.editReply[0].content, new RegExp(`PJ \\*\\*Marie\\*\\* créé — joueur <@${PLAYER_2}>`));
  assert.equal(personnageService.findPjByOwner(GUILD, PLAYER_2).createdBy, MJ_1);

  const second = submit('Autre');
  await handler(second);
  assert.match(second.calls.editReply[0].content, /possède déjà un personnage joueur/);
  assert.equal(Object.keys(personnageService.store.snapshot().personnages).length, 1);
});

test('envoi du formulaire : modification (remplacement des compétences, renommage d\'un PNJ)', async () => {
  const { handler, create, personnageService } = await setup();
  const { personnage: louis } = await create({
    nom: 'Louis Glass', carac: '1,1,3', bagarre: 'cac,"Corps à corps",0;distance,"Armes",2', savoir: 'legiste,"Médecin",2',
  });

  const edit = fake({
    kind: 'modal', customId: `perso-form:edit:${louis.id}`, userId: MJ_1,
    fields: { nom: 'Louis Glass Jr', carac: '2,1,3', bagarre: 'cac,4', savoir: '', pouvoir: '' },
  });
  await handler(edit);
  const reply = edit.calls.editReply[0].content;
  assert.match(reply, /PNJ \*\*Louis Glass Jr\*\* mis à jour/);
  assert.match(reply, /Le personnage a été renommé/);
  assert.match(reply, /Compétences supprimées : `distance`, `legiste`/);
  const after = personnageService.findById(GUILD, louis.id);
  assert.equal(after.nom, 'Louis Glass Jr');
  assert.deepEqual(after.caracteristiques, { corps: 2, coeur: 1, meninges: 3 });
  assert.deepEqual(after.competences.bagarre, { cac: { nom: 'Corps à corps', bonus: 4 } });
  assert.deepEqual(after.competences.savoir, {});
});

test('envoi du formulaire : droits revérifiés et erreurs sans aucune modification', async () => {
  const { handler, create, personnageService } = await setup();
  const { personnage: louis } = await create({ nom: 'Louis Glass', carac: '1,1,3', bagarre: 'cac,1' });
  const snapshot = personnageService.store.snapshot();
  const send = (userId, fields, customId = `perso-form:edit:${louis.id}`) => fake({ kind: 'modal', customId, userId, fields });
  const ok = { nom: 'Louis Glass', carac: '1,1,3' };

  const cases = [
    [PLAYER_1, ok, undefined, /réservée aux maîtres du jeu/], // non-MJ
    [MJ_2, { ...ok, nom: 'Vol' }, undefined, /appartient à un autre MJ/], // PNJ d'un autre MJ
    [MJ_1, { ...ok, carac: '1,2' }, undefined, /Format de caractéristiques invalide/],
    [MJ_1, { ...ok, bagarre: 'cac,"Nom' }, undefined, /guillemet non fermé/],
    [MJ_1, { ...ok, bagarre: 'MAUVAIS ID,1' }, undefined, /Identifiant de compétence invalide/],
    [MJ_1, { ...ok, bagarre: 'x,1', savoir: 'x,2' }, undefined, /Doublon de compétence/],
    [MJ_1, ok, 'perso-form:edit:inexistant', /introuvable/],
    [MJ_1, ok, 'perso-form:autre', /plus valide/],
  ];
  for (const [userId, fields, customId, pattern] of cases) {
    const interaction = send(userId, fields, customId);
    await handler(interaction);
    assert.match(interaction.calls.editReply[0].content, pattern);
  }
  assert.deepEqual(personnageService.store.snapshot(), snapshot);

  const unknown = fake({ kind: 'modal', customId: 'autre:chose', userId: MJ_1, fields: ok });
  await handler(unknown);
  assert.match(unknown.calls.reply[0].content, /plus valide/);
});

test('/fiche-interactive : boutons de caractéristiques et un menu par catégorie non vide', async () => {
  const { handler, create } = await setup();
  const { personnage } = await create({
    joueurId: PLAYER_1, nom: 'Arthur Bennet', carac: '1,-2,3',
    bagarre: 'cac,"Techniques",2;distance,"Armes à distance",-1', pouvoir: 'sens,"Sens",3',
  });

  const fiche = fake({ commandName: 'fiche-interactive', userId: PLAYER_1 });
  await handler(fiche);
  assert.ok(ephemeral(fiche));
  const rows = fiche.calls.reply[0].components.map((row) => row.toJSON());
  assert.equal(rows.length, 3); // boutons + bagarre + pouvoir (savoir est vide)

  assert.deepEqual(
    rows[0].components.map((b) => [b.custom_id, b.label]),
    [
      [`fiche:carac:${personnage.id}:corps`, 'Corps +1'],
      [`fiche:carac:${personnage.id}:coeur`, 'Cœur -2'],
      [`fiche:carac:${personnage.id}:meninges`, 'Méninges +3'],
    ],
  );
  const bagarre = rows[1].components[0];
  assert.equal(bagarre.custom_id, `fiche:skill:${personnage.id}:bagarre`);
  assert.deepEqual(bagarre.options.map((o) => [o.value, o.label, o.description]), [
    ['distance', 'Armes à distance', 'distance · -1'],
    ['cac', 'Techniques', 'cac · +2'],
  ]);
  assert.equal(rows[2].components[0].custom_id, `fiche:skill:${personnage.id}:pouvoir`);
  assert.ok(rows.every((r) => r.components.every((c) => c.custom_id.length <= 100)));
});

test('/fiche-interactive : droits d\'accès identiques à ceux de /fiche-perso', async () => {
  const { handler, create } = await setup();
  await create({ joueurId: PLAYER_1, nom: 'Arthur', carac: '1,1,1' });
  await create({ nom: 'Louis', carac: '1,1,1' });
  const run = async (commandName, userId, options = {}) => {
    const interaction = fake({ commandName, userId, options });
    await handler(interaction);
    return interaction.calls.reply[0];
  };
  for (const [userId, options] of [
    [PLAYER_1, {}], // son propre PJ
    [MJ_2, { perso: 'Arthur' }], // n'importe quel MJ sur un PJ
    [MJ_1, { perso: 'Louis' }], // MJ créateur sur son PNJ
    [PLAYER_2, {}], // sans PJ
    [PLAYER_1, { perso: 'Arthur' }], // option réservée aux MJ
    [MJ_2, { perso: 'Louis' }], // PNJ d'un autre MJ
    [MJ_1, { perso: 'Inconnu' }],
  ]) {
    const ancienne = await run('fiche-perso', userId, options);
    const nouvelle = await run('fiche-interactive', userId, options);
    assert.equal(nouvelle.content, ancienne.content);
    assert.equal(nouvelle.flags, ancienne.flags);
  }
});

test('/fiche-perso reste inchangée : texte seul, sans bouton ni menu', async () => {
  const { handler, create } = await setup();
  await create({ joueurId: PLAYER_1, nom: 'Arthur', carac: '1,1,1', bagarre: 'cac,2' });
  const fiche = fake({ commandName: 'fiche-perso', userId: PLAYER_1 });
  await handler(fiche);
  assert.ok(ephemeral(fiche));
  assert.match(fiche.calls.reply[0].content, /^\*\*Arthur\*\* — PJ/);
  assert.equal(fiche.calls.reply[0].components, undefined);
  assert.equal(fiche.calls.followUp.length, 0);
});

test('/fiche-interactive : plus de 25 compétences, le menu est limité et le signale', async () => {
  const { handler, create } = await setup();
  const skills = Array.from({ length: 30 }, (_, i) => `s${String(i).padStart(2, '0')},"Compétence ${i}",1`).join(';');
  await create({ joueurId: PLAYER_1, nom: 'Arthur', carac: '0,0,0', savoir: skills });
  const fiche = fake({ commandName: 'fiche-interactive', userId: PLAYER_1 });
  await handler(fiche);
  const menu = fiche.calls.reply[0].components[1].toJSON().components[0];
  assert.equal(menu.options.length, 25);
  assert.match(menu.placeholder, /25 premières sur 30/);
});

test('fiche interactive : un clic lance les dés publiquement (caractéristique et compétence)', async () => {
  const { handler, create, personnageService } = await setup();
  const { personnage } = await create({
    joueurId: PLAYER_1, nom: 'Arthur Bennet', carac: '1,2,3', bagarre: 'cac,"Techniques d\'interpelation",2',
  });
  const before = personnageService.store.snapshot();

  const carac = fake({ kind: 'button', customId: `fiche:carac:${personnage.id}:corps`, userId: PLAYER_1 });
  await handler(carac);
  assert.equal(carac.calls.reply[0].flags, undefined, 'le jet est public');
  assert.equal(carac.calls.reply[0].content, '**Jet de Corps de Arthur Bennet**\n2d6[3, 5] + 1 = 9');

  const skill = fake({ kind: 'select', customId: `fiche:skill:${personnage.id}:bagarre`, userId: PLAYER_1, values: ['cac'] });
  await handler(skill);
  assert.equal(skill.calls.reply[0].flags, undefined);
  assert.match(skill.calls.reply[0].content, /^\*\*Jet de Techniques d'interpelation de Arthur Bennet\*\*\n2d6\[1, 1\] \+ 2 = 4$/);

  assert.deepEqual(personnageService.store.snapshot(), before);
});

test('fiche interactive : droits revérifiés à chaque clic', async () => {
  const { handler, create, mjService } = await setup();
  const { personnage: pj } = await create({ joueurId: PLAYER_1, nom: 'Arthur', carac: '1,1,1', bagarre: 'cac,2' });
  const { personnage: pnj } = await create({ nom: 'Louis', carac: '1,1,1', bagarre: 'cac,2' });
  const click = (userId, personnage, action = 'carac', arg = 'corps') =>
    fake({ kind: 'button', customId: `fiche:${action}:${personnage.id}:${arg}`, userId });
  const run = async (interaction) => {
    await handler(interaction);
    return interaction.calls.reply[0];
  };

  // Autorisés : le joueur sur son PJ, n'importe quel MJ sur un PJ, le MJ créateur sur son PNJ.
  for (const [userId, perso] of [[PLAYER_1, pj], [MJ_2, pj], [MJ_1, pnj]]) {
    assert.equal((await run(click(userId, perso))).flags, undefined);
  }
  // Refusés : autre joueur, autre MJ sur un PNJ, joueur sur un PNJ.
  for (const [userId, perso, pattern] of [
    [PLAYER_2, pj, /Vous ne pouvez pas utiliser/],
    [MJ_2, pnj, /appartient à un autre MJ/],
    [PLAYER_1, pnj, /Vous ne pouvez pas utiliser/],
  ]) {
    const reply = await run(click(userId, perso));
    assert.match(reply.content, pattern);
    assert.equal(reply.flags, MessageFlags.Ephemeral);
  }
  // Un MJ révoqué perd l'accès à ses PNJ, même avec une ancienne fiche affichée.
  await mjService.remove(MJ_1);
  assert.match((await run(click(MJ_1, pnj))).content, /Vous ne pouvez pas utiliser/);
});

test('fiche interactive : fiche obsolète (compétence ou personnage disparu, identifiant invalide)', async () => {
  const { handler, create, personnageService } = await setup();
  const { personnage } = await create({ joueurId: PLAYER_1, nom: 'Arthur', carac: '1,1,1', bagarre: 'cac,2' });
  const reply = async (interaction) => {
    await handler(interaction);
    return interaction.calls.reply[0].content;
  };

  const gone = fake({ kind: 'select', customId: `fiche:skill:${personnage.id}:bagarre`, userId: PLAYER_1, values: ['disparue'] });
  assert.match(await reply(gone), /n'existe plus chez ce personnage/);

  const unknown = fake({ kind: 'button', customId: 'fiche:carac:inconnu:corps', userId: PLAYER_1 });
  assert.match(await reply(unknown), /Personnage introuvable/);

  const badKey = fake({ kind: 'button', customId: `fiche:carac:${personnage.id}:force`, userId: PLAYER_1 });
  assert.match(await reply(badKey), /plus valide/);
  const badAction = fake({ kind: 'button', customId: `fiche:autre:${personnage.id}:x`, userId: PLAYER_1 });
  assert.match(await reply(badAction), /plus valide/);

  const other = fake({ kind: 'button', customId: 'autre:module:1', userId: PLAYER_1 });
  assert.match(await reply(other), /plus valide/);

  const dm = fake({ kind: 'button', customId: `fiche:carac:${personnage.id}:corps`, userId: PLAYER_1, guildId: null });
  assert.match(await reply(dm), /uniquement sur un serveur/);
  void personnageService;
});

test('/fiche-interactive : les composants sont attachés au dernier message d\'une longue fiche', async () => {
  const { handler, create } = await setup();
  const skills = Array.from({ length: 80 }, (_, i) => `s${i},"Compétence numéro ${i} avec un nom assez long",1`).join(';');
  await create({ nom: 'Gros Perso', carac: '0,0,0', savoir: skills });
  const fiche = fake({ commandName: 'fiche-interactive', userId: MJ_1, options: { perso: 'Gros Perso' } });
  await handler(fiche);
  assert.equal(fiche.calls.reply[0].components, undefined);
  assert.ok(fiche.calls.followUp.length >= 1);
  const last = fiche.calls.followUp[fiche.calls.followUp.length - 1];
  assert.equal(last.components.length, 2); // boutons + menu Savoir
  assert.ok(fiche.calls.followUp.slice(0, -1).every((m) => m.components === undefined));
});
