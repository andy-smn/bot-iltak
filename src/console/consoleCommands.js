'use strict';

const { parseDiscordId } = require('../utils/validators');

const PREFIX = '[ILTAK]';

const HELP = [
  'Commandes console disponibles :',
  '  set-mj <id | mention>     Donne le statut MJ à un utilisateur Discord',
  '  remove-mj <id | mention>  Retire le statut MJ (les personnages sont conservés)',
  '  list-mj                   Liste les MJ enregistrés',
  '  help                      Affiche cette aide',
  '  stop                      Arrête le bot',
].join('\n');

/**
 * Exécute une ligne saisie dans la console du bot. Ces commandes n'existent volontairement
 * pas sous forme de commandes slash : seule la console peut gérer le statut MJ.
 *
 * @param {string} line
 * @param {{ mjService: import('../services/mjService').MjService }} deps
 * @returns {Promise<{ output: string, exit?: boolean } | null>} null si la ligne est vide.
 */
async function executeConsoleCommand(line, { mjService }) {
  const [command, ...args] = line.trim().split(/\s+/);
  if (!command) return null;

  const requireId = () => {
    const id = parseDiscordId(args.join(' '));
    if (!id) {
      throw new Error(
        `Identifiant invalide. Usage : ${command} <identifiant numérique | <@identifiant>> ` +
          '(les pseudos ne peuvent pas être résolus depuis la console).',
      );
    }
    return id;
  };

  try {
    switch (command.toLowerCase()) {
      case 'set-mj': {
        const id = requireId();
        const added = await mjService.add(id);
        return {
          output: added
            ? `${PREFIX} L'utilisateur ${id} est désormais MJ.`
            : `${PREFIX} L'utilisateur ${id} est déjà MJ.`,
        };
      }
      case 'remove-mj': {
        const id = requireId();
        const removed = await mjService.remove(id);
        return {
          output: removed
            ? `${PREFIX} L'utilisateur ${id} n'est plus MJ. Ses personnages sont conservés.`
            : `${PREFIX} L'utilisateur ${id} n'est pas MJ.`,
        };
      }
      case 'list-mj': {
        const ids = mjService.list();
        return { output: ids.length ? `${PREFIX} MJ enregistrés : ${ids.join(', ')}` : `${PREFIX} Aucun MJ enregistré.` };
      }
      case 'help':
        return { output: HELP };
      case 'stop':
      case 'exit':
        return { output: `${PREFIX} Arrêt du bot...`, exit: true };
      default:
        return { output: `${PREFIX} Commande inconnue : « ${command} ». Tapez « help » pour la liste des commandes.` };
    }
  } catch (error) {
    return { output: `${PREFIX} Erreur : ${error.message}` };
  }
}

/**
 * Branche la console (lecture de stdin ligne par ligne).
 * @param {{ mjService, input?: NodeJS.ReadableStream, output?: { log: Function }, onExit?: () => void }} options
 * @returns {import('node:readline').Interface}
 */
function startConsole({ mjService, input = process.stdin, output = console, onExit = () => {} }) {
  const readline = require('node:readline');
  const rl = readline.createInterface({ input });
  rl.on('line', (line) => {
    executeConsoleCommand(line, { mjService })
      .then((result) => {
        if (!result) return;
        output.log(result.output);
        if (result.exit) onExit();
      })
      .catch((error) => output.log(`${PREFIX} Erreur inattendue : ${error.message}`));
  });
  return rl;
}

module.exports = { executeConsoleCommand, startConsole };
