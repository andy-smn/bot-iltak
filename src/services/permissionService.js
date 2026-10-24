'use strict';

const { TYPE_PNJ } = require('../constants');
const { IltakError, ErrorCodes } = require('../utils/errors');

/** Seul le MJ créateur d'un PNJ peut le contrôler (jets et modifications). */
function assertCanControlPnj(personnage, userId) {
  if (personnage.type === TYPE_PNJ && personnage.createdBy !== userId) {
    throw new IltakError(
      ErrorCodes.FOREIGN_PNJ,
      `Accès refusé : le PNJ « ${personnage.nom} » appartient à un autre MJ.`,
    );
  }
}

/**
 * Contrôles d'accès côté bot. Les utilisateurs sont toujours identifiés par leur
 * identifiant Discord, jamais par leur pseudo.
 */
class PermissionService {
  /**
   * @param {{ mjService: import('./mjService').MjService, personnageService: import('./personnageService').PersonnageService }} deps
   */
  constructor({ mjService, personnageService }) {
    this.mjService = mjService;
    this.personnageService = personnageService;
  }

  assertMj(userId) {
    if (!this.mjService.isMj(userId)) {
      throw new IltakError(ErrorCodes.NOT_MJ, 'Cette commande est réservée aux maîtres du jeu (MJ).');
    }
  }

  /**
   * Détermine le personnage utilisé pour un jet :
   * - avec `persoName` (réservé aux MJ actuels) : n'importe quel PJ du serveur, ou un PNJ
   *   créé par ce MJ ;
   * - sans : PJ lié au compte Discord de l'utilisateur.
   */
  resolveCharacter({ guildId, userId, persoName = null }) {
    if (persoName !== null && persoName !== undefined && String(persoName).trim() !== '') {
      if (!this.mjService.isMj(userId)) {
        throw new IltakError(
          ErrorCodes.PERSO_NOT_ALLOWED,
          'Le paramètre « perso » est réservé aux maîtres du jeu (MJ).',
        );
      }
      const perso = this.personnageService.findByName(guildId, persoName);
      if (!perso) {
        throw new IltakError(
          ErrorCodes.CHARACTER_NOT_FOUND,
          `Personnage introuvable : aucun personnage nommé « ${String(persoName).trim()} » sur ce serveur.`,
        );
      }
      assertCanControlPnj(perso, userId);
      return perso;
    }

    const pj = this.personnageService.findPjByOwner(guildId, userId);
    if (!pj) {
      const hint = this.mjService.isMj(userId)
        ? ' Utilisez le paramètre « perso » pour lancer les dés d\'un PJ ou d\'un de vos PNJ.'
        : ' Demandez à un MJ de le créer avec /set-perso.';
      throw new IltakError(
        ErrorCodes.NO_CHARACTER,
        `Aucun personnage joueur n'est associé à votre compte sur ce serveur.${hint}`,
      );
    }
    return pj;
  }
}

module.exports = { PermissionService, assertCanControlPnj };
