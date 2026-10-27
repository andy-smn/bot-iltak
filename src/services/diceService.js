'use strict';

const { randomInt } = require('node:crypto');

const DICE_COUNT = 2;
const DICE_SIDES = 6;

class DiceService {
  /** @param {{ randomInt?: (min: number, max: number) => number }} [options] RNG injectable pour les tests. */
  constructor({ randomInt: rng = randomInt } = {}) {
    this.randomInt = rng;
  }

  /**
   * Lance 2d6 et applique le bonus enregistré et le bonus temporaire (jamais persisté).
   * @returns {{ dice: number[], base: number, tempBonus: number, total: number }}
   */
  roll({ base, tempBonus = 0 }) {
    const dice = Array.from({ length: DICE_COUNT }, () => this.randomInt(1, DICE_SIDES + 1));
    const total = dice.reduce((sum, die) => sum + die, 0) + base + tempBonus;
    return { dice, base, tempBonus, total };
  }
}

function formatTerm(value) {
  return `${value >= 0 ? '+' : '-'} ${Math.abs(value)}`;
}

/**
 * Exemple : `2d6[3, 5] + 1 + 2 (bonus temporaire) = 11`.
 */
function formatRollDetail(roll) {
  let line = `${roll.dice.length}d${DICE_SIDES}[${roll.dice.join(', ')}] ${formatTerm(roll.base)}`;
  if (roll.tempBonus !== 0) {
    line += ` ${formatTerm(roll.tempBonus)} (bonus temporaire)`;
  }
  return `${line} = ${roll.total}`;
}

function formatRoll({ label, personnageNom, roll }) {
  return `**${personnageNom}** a fait jet de **${label}**\n${formatRollDetail(roll)}`;
}

module.exports = { DiceService, formatRoll, formatRollDetail };
