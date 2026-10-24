'use strict';

const { escapeMarkdown } = require('discord.js');
const { CARACTERISTIQUES, CATEGORIES, CATEGORY_LABELS, TYPE_PJ, TYPE_PNJ } = require('../constants');
const { formatSigned } = require('./validators');

const DISCORD_MESSAGE_LIMIT = 2000;

/** Fiche complète d'un personnage (caractéristiques et compétences par catégorie). */
function formatFiche(personnage) {
  const owner =
    personnage.type === TYPE_PJ ? `joueur <@${personnage.ownerId}>` : `créé par <@${personnage.createdBy}>`;
  const lines = [
    `**${escapeMarkdown(personnage.nom)}** — ${personnage.type} (${owner})`,
    'Caractéristiques : ' +
      CARACTERISTIQUES.map(({ key, label }) => `${label} ${formatSigned(personnage.caracteristiques[key])}`).join(' · '),
  ];
  for (const categorie of CATEGORIES) {
    const skills = Object.entries(personnage.competences[categorie]);
    lines.push('', `**${CATEGORY_LABELS[categorie]}**`);
    if (skills.length === 0) {
      lines.push('_Aucune compétence_');
      continue;
    }
    for (const [id, skill] of skills) {
      lines.push(`• \`${id}\` — ${escapeMarkdown(skill.nom)} : ${formatSigned(skill.bonus)}`);
    }
  }
  return lines.join('\n');
}

/** Liste des personnages, séparée en PJ puis PNJ et triée par nom. */
function formatListe(personnages) {
  if (personnages.length === 0) return 'Aucun personnage sur ce serveur.';
  const byName = (a, b) => a.nom.localeCompare(b.nom, 'fr');
  const pjs = personnages.filter((p) => p.type === TYPE_PJ).sort(byName);
  const pnjs = personnages.filter((p) => p.type === TYPE_PNJ).sort(byName);

  const lines = [`**Personnages (${personnages.length})**`];
  if (pjs.length > 0) {
    lines.push('', `**PJ (${pjs.length})**`);
    for (const p of pjs) lines.push(`• ${escapeMarkdown(p.nom)} — <@${p.ownerId}>`);
  }
  if (pnjs.length > 0) {
    lines.push('', `**PNJ (${pnjs.length})**`);
    for (const p of pnjs) lines.push(`• ${escapeMarkdown(p.nom)}`);
  }
  return lines.join('\n');
}

/** Découpe un texte en messages de 2000 caractères maximum, en coupant entre les lignes. */
function splitMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    const piece = line.length > limit ? line.slice(0, limit) : line;
    if (current && current.length + 1 + piece.length > limit) {
      chunks.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

module.exports = { formatFiche, formatListe, splitMessage };
