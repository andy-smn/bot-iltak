'use strict';

const path = require('node:path');
const { SNOWFLAKE_PATTERN } = require('./constants');

/**
 * Lit et valide la configuration depuis les variables d'environnement.
 * @param {NodeJS.ProcessEnv} env
 */
function loadConfig(env = process.env) {
  const token = env.DISCORD_TOKEN?.trim();
  const clientId = env.CLIENT_ID?.trim();

  const problems = [];
  if (!token) problems.push('DISCORD_TOKEN est manquant');
  if (!clientId) problems.push('CLIENT_ID est manquant');
  else if (!SNOWFLAKE_PATTERN.test(clientId)) problems.push('CLIENT_ID doit être un identifiant numérique Discord');
  const ownerId = env.OWNER_ID?.trim() || null;
  if (ownerId !== null && !SNOWFLAKE_PATTERN.test(ownerId)) {
    problems.push('OWNER_ID doit être un identifiant numérique Discord');
  }
  if (problems.length > 0) {
    throw new Error(`Configuration invalide (.env) : ${problems.join(' ; ')}. Voir .env.example.`);
  }

  const dataDir = env.DATA_DIR?.trim()
    ? path.resolve(env.DATA_DIR.trim())
    : path.resolve(__dirname, '..', 'data');

  return { token, clientId, ownerId, dataDir };
}

module.exports = { loadConfig };
