'use strict';

require('dotenv').config({ quiet: true });

const path = require('node:path');
const { Client, Events, GatewayIntentBits, REST } = require('discord.js');
const { createInteractionHandler, getCommands } = require('./bot/interactionHandler');
const { loadConfig } = require('./config');
const { startConsole } = require('./console/consoleCommands');
const { CommandRegistry } = require('./services/commandRegistry');
const { DiceService } = require('./services/diceService');
const { MjService, createMjStore } = require('./services/mjService');
const { PermissionService } = require('./services/permissionService');
const { PersonnageService, createPersonnageStore } = require('./services/personnageService');

async function main() {
  const config = loadConfig();

  // Les stores refusent de démarrer (sans rien écraser) si un fichier existant est corrompu.
  const mjStore = createMjStore(path.join(config.dataDir, 'mj.json'));
  const personnageStore = createPersonnageStore(path.join(config.dataDir, 'personnages.json'));
  await mjStore.init();
  await personnageStore.init();

  const rest = new REST({ version: '10' }).setToken(config.token);
  const commandRegistry = new CommandRegistry({ rest, clientId: config.clientId, commands: getCommands() });

  const mjService = new MjService(mjStore, { ownerId: config.ownerId });
  const personnageService = new PersonnageService({ store: personnageStore });
  const permissionService = new PermissionService({ mjService, personnageService });
  const diceService = new DiceService();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const handleInteraction = createInteractionHandler({
    mjService,
    personnageService,
    permissionService,
    diceService,
    logger: console,
  });

  async function syncGuild(guildId) {
    try {
      await commandRegistry.syncGuild(guildId);
      console.log(`[ILTAK] Commandes synchronisées pour le serveur ${guildId}.`);
    } catch (error) {
      console.error(`[ILTAK] Échec de synchronisation des commandes pour le serveur ${guildId} :`, error.message);
    }
  }

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[ILTAK] Bot connecté : ${readyClient.user.tag}`);
    for (const guildId of readyClient.guilds.cache.keys()) {
      await syncGuild(guildId);
    }
  });
  client.on(Events.GuildCreate, (guild) => syncGuild(guild.id));
  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction).catch((error) => console.error('[ILTAK] Erreur non gérée :', error));
  });
  client.on(Events.Error, (error) => console.error('[ILTAK] Erreur client Discord :', error));

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[ILTAK] Arrêt en cours...');
    await client.destroy();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  startConsole({ mjService, onExit: shutdown });
  console.log('[ILTAK] Console prête : tapez « help » pour la liste des commandes.');
  if (!config.ownerId) {
    console.log('[ILTAK] OWNER_ID non défini : /set-mj, /remove-mj et /liste-mj sont inutilisables (utilisez la console).');
  }

  await client.login(config.token);
}

process.on('unhandledRejection', (reason) => {
  console.error('[ILTAK] Promesse rejetée non gérée :', reason);
});

main().catch((error) => {
  console.error(`[ILTAK] Démarrage impossible : ${error.message}`);
  process.exit(1);
});
