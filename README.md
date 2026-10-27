# Bot Discord – JDR Iltak

Bot Discord (Node.js + discord.js v14) pour le jeu de rôle **Iltak** : les maîtres du jeu (MJ) créent et modifient des personnages joueurs (PJ) et non-joueurs (PNJ), leurs caractéristiques et leurs compétences, puis les jets de dés (2d6 + bonus) se lancent avec des commandes slash.

## 1. Prérequis

- [Node.js](https://nodejs.org/) **22 LTS ou plus récent**.
- Un compte Discord et un serveur sur lequel vous pouvez inviter un bot.

## 2. Installation

```bash
npm install
```

## 3. Création de l'application Discord

1. Ouvrez le [portail développeur Discord](https://discord.com/developers/applications) et créez une **New Application**.
2. Onglet **General Information** : copiez l'**Application ID** (c'est le `CLIENT_ID`).
3. Onglet **Bot** : cliquez sur **Reset Token** et copiez le token (c'est le `DISCORD_TOKEN`). Aucun intent privilégié n'est nécessaire.

## 4. Configuration de `.env`

Copiez `.env.example` vers `.env` puis renseignez :

```env
DISCORD_TOKEN=le_token_du_bot
CLIENT_ID=l_application_id
# Votre identifiant Discord : propriétaire du bot, toujours MJ, seul à gérer les MJ
OWNER_ID=votre_identifiant_discord
# Optionnel : dossier des fichiers JSON (par défaut ./data)
# DATA_DIR=
```

`OWNER_ID` : activez le mode développeur (Discord > Paramètres > Avancés), puis clic droit sur votre profil > *Copier l'identifiant utilisateur*.

Le fichier `.env` est exclu de Git : ne partagez jamais le token.

## 5. Inviter le bot sur un serveur

Dans le portail, **OAuth2 > URL Generator** :

- Scopes : `bot` **et** `applications.commands` (obligatoire pour les commandes slash du serveur) ;
- Permissions du bot : aucune permission particulière n'est requise (les réponses utilisent les interactions).

Ouvrez l'URL générée et choisissez le serveur.

## 6. Démarrage

```bash
npm start
```

Au démarrage, le bot :

1. charge `data/mj.json` et `data/personnages.json` (ils sont créés s'ils n'existent pas) ;
2. se connecte à Discord ;
3. enregistre, pour chaque serveur, les 13 commandes slash du bot.

Il refuse de démarrer, sans rien modifier, si un fichier JSON existant est corrompu.

Tests automatisés (sans connexion à Discord) :

```bash
npm test
```

## 7. Gérer les MJ

Seul le **propriétaire du bot** peut attribuer ou retirer le statut MJ. Il est défini par `OWNER_ID` dans le `.env` (voir section 4) : il est toujours MJ, sans avoir besoin d'être enregistré, et ses droits ne peuvent pas être retirés. Personne d'autre ne peut gérer les MJ ; les contrôles sont faits côté bot, sur l'identifiant Discord (jamais sur le pseudo).

### Depuis Discord (propriétaire uniquement)

| Commande | Description |
|----------|-------------|
| `/set-mj utilisateur:@quelqu'un` | Donne le statut MJ. |
| `/remove-mj utilisateur:@quelqu'un` | Retire le statut MJ (les personnages sont conservés). |
| `/liste-mj` | Liste les MJ. |

Ces commandes sont visibles de tous mais refusées à toute personne autre que le propriétaire. Les réponses sont éphémères. Elles nécessitent que `OWNER_ID` soit renseigné.

### Depuis la console du bot

La console reste disponible quand le bot tourne dans un terminal (utile sans `OWNER_ID`). Elle n'ayant pas de système de mentions, utilisez l'identifiant numérique de l'utilisateur ou une mention copiée.

```text
set-mj 123456789012345678
set-mj <@123456789012345678>
remove-mj 123456789012345678
list-mj
help
stop
```

Exemple de retour : `[ILTAK] L'utilisateur 123456789012345678 est désormais MJ.`

Retirer le statut MJ ne supprime aucun personnage. Les PNJ restent associés à leur MJ créateur, qui les retrouve s'il redevient MJ.

## 8. Créer un PJ

`/set-perso` (réservé aux MJ). Avec le paramètre `joueur`, le personnage est un PJ lié à l'**identifiant Discord** du joueur (un seul PJ par joueur et par serveur).

```text
/set-perso joueur:@nym4s nom:Arthur Bennet carac:1,2,1
           bagarre:cac,"Techniques d'interpelation",2;distance,"Armes à distance",1
           savoir:inspecteur,"Apprenti inspecteur",1
           pouvoir:sens,"Sens",3
```

| Paramètre | Description |
|-----------|-------------|
| `joueur`  | Utilisateur Discord. Présent : PJ. Absent : PNJ du MJ qui exécute la commande. |
| `nom`     | Nom du personnage (espaces acceptés). Obligatoire pour un PNJ et à la création. |
| `carac`   | `corps,coeur,meninges` (entiers positifs, négatifs ou nuls, de -1000 à 1000). Obligatoire à la création. |
| `bagarre`, `savoir`, `pouvoir` | Compétences : `id,"Nom d'affichage",bonus;id2,"Nom 2",bonus2`. Le nom est facultatif : `cac,2`. |

Règles sur les identifiants de compétence : 1 à 32 caractères `a-z`, `0-9`, `-`, `_` (minuscules, sans accent ni espace). Les noms d'affichage acceptent espaces, accents et Unicode ; mettez-les entre guillemets s'ils contiennent une virgule ou un point-virgule (`""` ou `\"` pour un guillemet littéral).

Les réponses de `/set-perso` et les erreurs sont **éphémères** (seul le MJ les voit).

## 9. Créer un PNJ

Même commande, sans `joueur` :

```text
/set-perso nom:Louis Glass carac:1,1,3
           bagarre:cac,"Corps à corps",0;distance,"Armes à distance",2
           savoir:legiste,"Médecin légiste",2
           pouvoir:glace-creer,"Glace - Créer",1
```

Le PNJ appartient au MJ qui l'a créé : **seul ce MJ** peut le modifier et lancer ses jets. Les noms de personnages (PJ et PNJ confondus) sont uniques par serveur, sans tenir compte de la casse : c'est ce qui permet à un MJ de désigner un personnage par son nom.

## 10. Modifier un personnage

Relancez `/set-perso` en désignant le personnage : `joueur` pour un PJ, `nom` pour un PNJ. Seuls les paramètres fournis sont modifiés.

- `carac` fourni : les trois caractéristiques sont remplacées ; absent : conservées.
- Compétences : **fusion** avec l'existant. Un identifiant nouveau est ajouté ; un identifiant existant (même catégorie) voit son bonus remplacé, et son nom aussi s'il est fourni ; les autres compétences ne sont jamais supprimées.
- Un identifiant ne peut pas exister dans deux catégories pour un même personnage : l'opération est refusée sans rien modifier.
- Pour un PJ, fournir un `nom` différent avec `joueur` renomme le personnage. Les PNJ ne se renomment pas pour l'instant (un PNJ est identifié par son nom).
- Toute erreur (syntaxe, doublon, sauvegarde) annule l'ensemble de l'opération.

Exemple : `/set-perso joueur:@nym4s carac:2,2,3 bagarre:cac,"Combat rapproché",4;esquive,"Esquive",2` met à jour Arthur ; `/bagarre competence:esquive` est utilisable immédiatement, sans aucune nouvelle commande Discord.

## 11. Commandes de jets et de consultation

Les commandes de jet lancent **2d6 + bonus** et publient le résultat **publiquement** dans le salon. Les commandes de consultation répondent de façon **éphémère** (seul l'utilisateur voit la réponse).

| Commande | Description |
|----------|-------------|
| `/corps`, `/coeur`, `/meninges` | Jet de caractéristique. Options : `bonus`, `perso`. |
| `/bagarre`, `/savoir`, `/pouvoir` | Jet d'une compétence de la catégorie. Arguments : `competence` (obligatoire, identifiant), `perso`, `bonus`. |
| `/liste-perso` | MJ uniquement : liste tous les PJ (avec leur joueur) et tous les PNJ du serveur, quel que soit le MJ qui les a créés. |
| `/fiche-perso` | Fiche d'un personnage : caractéristiques et compétences par catégorie. Sans option : votre PJ. Option : `perso` (MJ uniquement). Les réponses trop longues sont découpées en plusieurs messages. |

`bonus` : entier, éventuellement négatif, **temporaire** (jamais enregistré). `perso` : MJ uniquement, nom du personnage à utiliser (avec autocomplétion) : n'importe quel **PJ** du serveur ou un **PNJ** que le MJ a créé. L'argument `competence` propose en autocomplétion les compétences de la catégorie du personnage concerné (`perso` doit être saisi avant pour que les compétences d'un autre personnage soient proposées).

```text
/corps bonus:2
**Jet de Corps de Arthur Bennet**
2d6[3, 5] + 1 + 2 (bonus temporaire) = 11

/bagarre competence:cac perso:Louis Glass
**Jet de Corps à corps de Louis Glass**
2d6[4, 3] + 0 = 7
```

- Sans `perso` : le PJ lié au compte Discord de l'utilisateur est utilisé.
- Avec `perso` : réservé aux MJ. Un MJ peut utiliser tous les PJ, mais uniquement ses propres PNJ (un PNJ créé par un autre MJ reste inaccessible).
- Le bonus et le nom d'affichage sont ceux du personnage concerné.
- Une compétence que le personnage ne possède pas lance quand même les dés : **2d6 sans bonus** (le nom affiché est celui saisi). En revanche, un identifiant qui existe chez le personnage mais dans une autre catégorie que la commande utilisée renvoie une erreur explicite (« utilisez /savoir »).

## 12. Interface dans Discord (formulaire et fiche interactive)

Ces deux fonctions s'ajoutent aux commandes texte, qui restent disponibles.

### Fiche interactive : `/fiche-perso`

Sous la fiche (visible de vous seul) s'affichent :

- une rangée de **boutons** : Corps, Cœur et Méninges, avec leur bonus ;
- un **menu déroulant par catégorie** non vide (Bagarre, Savoir, Pouvoir) pour choisir une compétence.

Un clic **lance 2d6 + bonus** et publie le résultat **publiquement** dans le salon, comme `/corps` ou `/bagarre`. Les droits sont revérifiés à chaque clic : un joueur ne peut utiliser que son PJ, un MJ n'importe quel PJ ou ses propres PNJ, et un MJ révoqué perd l'accès même avec une ancienne fiche affichée. Un menu affiche au maximum 25 compétences (limite Discord) : au-delà, utilisez `/bagarre`, `/savoir` ou `/pouvoir`. Si une fiche est périmée (compétence supprimée entre-temps), le bot l'indique et demande de relancer `/fiche-perso`.

### Formulaire de création et de modification : `/formulaire-perso` (MJ)

Ouvre une fenêtre avec les champs **Nom**, **Caractéristiques** (`1,2,1`) et un champ par catégorie de compétences, **une compétence par ligne** : `id,"Nom d'affichage",bonus` (le nom est facultatif : `cac,2`).

| Utilisation | Résultat |
|-------------|----------|
| `/formulaire-perso` | Formulaire vierge : nouveau **PNJ**. |
| `/formulaire-perso joueur:@quelqu'un` | Modifie le PJ de ce joueur, ou ouvre un formulaire de création de **PJ** s'il n'en a pas. |
| `/formulaire-perso perso:Nom` | Modifie ce personnage (n'importe quel PJ, ou un PNJ que vous avez créé), avec autocomplétion. |

Différences avec `/set-perso` :

- en modification, le formulaire est **prérempli** avec l'état actuel et **remplace** le contenu de chaque catégorie : une compétence effacée du formulaire est **supprimée** (ce que vous voyez est ce que vous obtenez, la confirmation liste les compétences supprimées) ;
- il permet de **renommer un PNJ**, ce que `/set-perso` ne peut pas faire ;
- en création, il **refuse d'écraser** un personnage existant (nom déjà pris, ou joueur ayant déjà un PJ).

L'envoi est validé d'un bloc : à la moindre erreur (format, doublon d'identifiant entre catégories, nom pris, droits), rien n'est enregistré et le message d'erreur est affiché à vous seul. Les droits MJ sont revérifiés à l'envoi. Le contenu d'un champ est limité à 4 000 caractères par Discord : un personnage trop volumineux est refusé à l'ouverture, avec un renvoi vers `/set-perso`.

## 12 bis. Fonctionnement des fichiers JSON

Dossier `data/` (créé automatiquement, exclu de Git, jamais supprimé par le bot) :

- `mj.json` : `{ "123456789012345678": true }` ;
- `personnages.json` : `{ "personnages": { "<uuid>": { "id", "guildId", "type", "nom", "ownerId", "createdBy", "caracteristiques", "competences", "createdAt", "updatedAt", "updatedBy" } } }`.

Les identifiants Discord sont toujours des chaînes. Les personnages sont isolés par serveur (`guildId`).

Garanties : validation avant chaque sauvegarde, écriture atomique (fichier `.tmp` puis renommage), mises à jour sérialisées, état en mémoire inchangé si l'écriture échoue, et **aucune réinitialisation silencieuse** : un fichier illisible bloque le démarrage avec un message explicite. Pensez à sauvegarder le dossier `data/` régulièrement.

## 13. Synchronisation des commandes Discord

Le bot expose 13 commandes slash fixes (`/set-perso`, `/formulaire-perso`, `/corps`, `/coeur`, `/meninges`, `/bagarre`, `/savoir`, `/pouvoir`, `/liste-perso`, `/fiche-perso`, `/set-mj`, `/remove-mj`, `/liste-mj`), enregistrées **par serveur** (propagation immédiate). Elles sont synchronisées au démarrage et à l'arrivée du bot sur un serveur ; cette opération remplace la liste des commandes du bot sur le serveur (les commandes obsolètes disparaissent). Ajouter ou modifier une compétence ne touche pas aux commandes Discord, et la limite de 100 commandes par serveur n'est plus un sujet.

## 14. Limites techniques connues

- Tous les joueurs voient les commandes `/bagarre`, `/savoir` et `/pouvoir` ; l'autocomplétion et l'exécution sont limitées aux compétences du personnage concerné.
- L'autocomplétion ne propose les compétences d'un autre personnage que si `perso` est déjà renseigné ; la saisie manuelle de l'identifiant reste possible.
- Une seule instance du bot doit utiliser un même dossier `data/`.
- Il n'y a pas encore de commande de renommage ou de suppression de PNJ, ni de suppression de compétence.
- Les bonus sont limités à ±1000 (jets lisibles et sûrs).

## 15. Démarrage automatique sous Windows

Pour que le bot se lance tout seul à l'ouverture de session Windows (sans hébergeur) :

1. Double-cliquez sur `scripts\install-autostart.cmd`. Il place un lanceur dans le dossier Démarrage de votre session.
2. À la prochaine ouverture de session, une fenêtre « Bot Iltak » s'ouvre, **réduite** dans la barre des tâches. Cliquez dessus pour voir les messages ou taper une commande console (`set-mj`, `stop`…).
3. Si le bot s'arrête sur une erreur (réseau pas encore prêt, coupure…), il est **relancé automatiquement après 15 secondes**.

Pour tout arrêter : tapez `stop` dans la fenêtre du bot, ou fermez-la. Pour supprimer le démarrage automatique : `scripts\uninstall-autostart.cmd`.

Limites : le bot ne tourne que pendant que la session Windows est ouverte et que le PC est allumé (en veille, il se reconnecte à Discord au réveil). Le dossier du projet ne doit pas être déplacé après l'installation (sinon relancez `install-autostart.cmd`). Node.js doit être accessible dans le `PATH`.

## 16. Hébergement avec Docker (VPS, Railway, Fly.io…)

GitHub stocke le code mais n'exécute pas le bot en continu : il faut un hébergeur qui lance le conteneur 24h/24. Prérequis de l'hébergeur : **une seule instance** et un **volume persistant** monté sur `/data` (là où sont écrits `mj.json` et `personnages.json`).

Fichiers fournis :

- `Dockerfile` : image Node 22 Alpine, exécutée avec l'utilisateur `node`, données dans `/data` (variable `DATA_DIR`) ;
- `docker-compose.yml` : lancement sur un VPS avec redémarrage automatique et volume nommé `iltak-data` ;
- `.github/workflows/ci.yml` : tests (Node 22 et 24) et construction de l'image Docker à chaque push et pull request ;
- `.github/workflows/docker-publish.yml` : publie l'image sur GitHub Container Registry (`ghcr.io/<utilisateur>/<dépôt>`) à chaque push sur `main` (tags `latest` et `sha`) et à chaque tag `vX.Y.Z`.

### Sur un VPS (Linux avec Docker)

```bash
git clone https://github.com/andy-smn/bot-iltak.git && cd bot-iltak
cp .env.example .env          # puis renseigner DISCORD_TOKEN et CLIENT_ID
docker compose up -d --build
docker compose logs -f bot    # vérifier la connexion
```

Mise à jour : `git pull && docker compose up -d --build`. Les données du volume sont conservées.

Pour utiliser l'image publiée par GitHub Actions plutôt que de la construire, remplacez `build: .` par la ligne `image: ghcr.io/andy-smn/bot-iltak:latest` (en commentaire dans le fichier), puis `docker compose pull && docker compose up -d`. Cette image est construite pour `amd64` uniquement : sur un serveur ARM (par exemple Oracle Ampere), gardez `build: .`. Si le dépôt (donc le paquet) est privé, connectez-vous d'abord : `docker login ghcr.io` avec un jeton d'accès personnel ayant la portée `read:packages`.

### Reprendre des données existantes

Après un premier `docker compose up -d` (qui crée le volume), copiez vos fichiers dans le volume :

```bash
docker compose stop
docker run --rm -v iltak-data:/data -v "$HOME":/src alpine sh -c "cp /src/mj.json /src/personnages.json /data/ && chown 1000:1000 /data/*.json"
docker compose up -d
```

(`mj.json` et `personnages.json` ayant été préalablement envoyés dans votre dossier personnel, par exemple avec `scp`.)

### Console du bot (`set-mj`) dans Docker

Le plus simple est d'utiliser `OWNER_ID` et les commandes `/set-mj`, `/remove-mj`, `/liste-mj` (voir section 7). La console reste utilisable : elle lit l'entrée standard du conteneur, donc `docker attach iltak-bot`, puis `set-mj <identifiant>`. Pour quitter sans arrêter le bot : `Ctrl+P` puis `Ctrl+Q` (surtout pas `Ctrl+C`).

### Sauvegarde des données

```bash
docker run --rm -v iltak-data:/data -v "$PWD":/backup alpine tar czf /backup/iltak-data.tgz -C /data .
```

### Secrets

Le token n'est jamais dans l'image ni dans Git : il vient du fichier `.env` (VPS) ou des variables d'environnement / secrets de l'hébergeur (`DISCORD_TOKEN`, `CLIENT_ID`). Ne lancez jamais deux instances du même bot (données corrompues et réponses en double).

## 17. Hébergement sur Railway

[Railway](https://railway.com) déploie le bot directement depuis le dépôt GitHub (en utilisant le `Dockerfile`). Le plan gratuit donne 30 jours d'essai avec 5 $ de crédit, puis 1 $ de crédit par mois, avec 1 vCPU / 0,5 Go de RAM et un volume de 0,5 Go ; la facturation se fait à la seconde, selon la consommation réelle. Un bot comme celui-ci consomme très peu, mais vérifiez l'onglet *Usage* après quelques jours : si le crédit est dépassé, le plan Hobby coûte 5 $ par mois. Les tarifs peuvent évoluer : consultez [railway.com/pricing](https://railway.com/pricing).

1. Connectez-vous sur Railway avec votre compte GitHub, puis **New Project > Deploy from GitHub repo** et choisissez `bot-iltak` (autorisez l'accès au dépôt si on vous le demande).
2. Dans le service créé, onglet **Variables**, ajoutez :

   | Variable | Valeur |
   |----------|--------|
   | `DISCORD_TOKEN` | le token du bot |
   | `CLIENT_ID` | l'identifiant de l'application |
   | `OWNER_ID` | votre identifiant Discord (propriétaire, voir section 7) |
   | `RAILWAY_RUN_UID` | `0` (l'image tourne en utilisateur non-root ; sans cela, Railway interdit l'écriture dans le volume) |

   `DATA_DIR` vaut déjà `/data` dans l'image.
3. Ajoutez un **volume** persistant au service (clic droit sur le service ou **+ New > Volume**) avec comme chemin de montage `/data`. **Sans volume, les personnages sont perdus à chaque redéploiement.**
4. Vérifiez dans les **Deployments > Logs** les lignes « Bot connecté » et « Commandes synchronisées ».
5. Sur Discord, utilisez `/set-mj` (compte propriétaire) pour nommer les autres MJ.

Points d'attention :

- **Une seule instance** : n'exécutez pas le bot en même temps sur votre PC (supprimez le démarrage automatique avec `scripts\uninstall-autostart.cmd` et arrêtez le bot local), et gardez 1 seul réplica sur Railway.
- Il n'y a pas de console sur Railway : utilisez `/set-mj`, `/remove-mj` et `/liste-mj`.
- Les mises à jour se font par `git push` : Railway redéploie automatiquement.
- Pour reprendre des données existantes (`mj.json`, `personnages.json`), il faut les copier dans le volume avec la CLI Railway (`railway ssh`, voir la documentation des volumes). Pour quelques personnages, il est plus simple de les recréer avec `/set-perso`.

## Architecture

```text
src/
├── index.js                 Démarrage et assemblage
├── config.js                Lecture/validation de .env
├── constants.js             Catégories, limites
├── bot/interactionHandler.js  Routage des interactions, gestion centralisée des erreurs
├── commands/                set-perso, caractéristiques, compétences (/bagarre /savoir /pouvoir)
├── console/consoleCommands.js set-mj, remove-mj, list-mj…
├── models/personnage.js     Modèle et validation des personnages
├── services/                mj, personnage, permission, dés, enregistrement des commandes
├── storage/jsonStorage.js   Persistance JSON atomique et sérialisée
└── utils/                   Parseur de compétences, validateurs, erreurs
tests/                       Tests (node:test), sans connexion à Discord
```
