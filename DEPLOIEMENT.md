# Mettre Essor en ligne

Une heure la première fois, dix minutes par appareil ensuite.

## Ce qu'il faut comprendre avant de commencer

**GitHub Pages ne sait pas rendre un site privé.** Sur un compte Free ou Pro, tout
site publié est accessible à qui connaît son adresse ; l'accès restreint n'existe
que sur GitHub Enterprise Cloud. Chercher à cacher l'adresse serait un faux
confort.

Essor prend donc le problème par l'autre bout : **le site public ne contient
aucune donnée**. Il ne contient que du code — le même que celui de ce dossier,
que n'importe qui peut lire sans rien apprendre de vous. Vos données vivent
ailleurs, sous deux protections cumulées :

1. elles sont chiffrées (AES-256-GCM) par une clé dérivée de votre phrase de
   passe, qui n'est ni stockée ni transmise — ni à GitHub, ni à personne ;
2. le fichier chiffré est déposé dans un **second dépôt, privé**.

Autrement dit : même si quelqu'un ouvre l'adresse du site, il voit une
application vide qui lui demande une phrase de passe. Et même si quelqu'un
obtenait le fichier de données, il n'en tirerait qu'un bloc d'octets.

**La phrase de passe ne peut pas être récupérée.** Il n'y a ni serveur, ni
courriel de réinitialisation, ni question secrète. Notez-la dans votre
gestionnaire de mots de passe avant même de la saisir.

## 1. Le dépôt de l'application (public ou privé selon votre offre)

1. Créez un dépôt GitHub nommé par exemple **`essor`**.
   - Compte **Free** : le dépôt doit être **public** pour que Pages fonctionne.
     Ce n'est pas un problème — il n'y a que du code dedans.
   - Compte **Pro / Team** : le dépôt peut être privé ; le site publié reste
     malgré tout accessible par son adresse.
2. Déposez-y le contenu de ce dossier (`index.html`, `css/`, `js/`, `sw.js`,
   `manifest.webmanifest`, les icônes, `.nojekyll`).

   ```bash
   git init
   git add .
   git commit -m "Essor"
   git branch -M main
   git remote add origin https://github.com/VOTRE-COMPTE/essor.git
   git push -u origin main
   ```

3. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`. Enregistrez.
4. Au bout d'une minute, le site est à
   `https://VOTRE-COMPTE.github.io/essor/`.

`.nojekyll` est là pour que GitHub serve les fichiers tels quels, sans passer par
Jekyll.

## 2. Le dépôt de données (privé, obligatoirement)

1. Créez un second dépôt, **privé**, nommé par exemple **`essor-data`**.
2. Cochez « Add a README file » à la création : un dépôt entièrement vide n'a pas
   de branche, et Essor ne saurait pas où écrire.

Rien d'autre à y faire : l'application y créera elle-même `essor-data.json.enc`
et le dossier `backups/`.

## 3. Le jeton d'accès

Essor écrit dans ce dépôt privé en votre nom ; il lui faut un jeton.

1. GitHub → votre photo → **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**.
2. Renseignez :
   - **Token name** : `essor` (ou `essor — téléphone`, un par appareil, c'est mieux) ;
   - **Expiration** : à vous de voir ; au-delà de l'échéance Essor vous dira que
     le jeton est refusé et continuera d'enregistrer localement en attendant ;
   - **Repository access** : *Only select repositories* → **`essor-data`**
     uniquement ;
   - **Permissions → Repository permissions → Contents : Read and write**.
     C'est la seule permission nécessaire. Ne donnez rien d'autre.
3. Copiez le jeton (`github_pat_…`). GitHub ne le réaffichera jamais.

Un jeton par appareil vaut mieux qu'un jeton partagé : en cas de perte du
téléphone, vous révoquez celui-là sans toucher aux autres.

## 4. Premier appareil

1. Ouvrez `https://VOTRE-COMPTE.github.io/essor/`.
2. **Commencer à neuf** — ou **Reprendre un fichier** si vous arrivez de la
   version locale d'Essor, avec votre `essor-data.json`.
3. Choisissez la phrase de passe. Notez-la.
4. **Réglages → Synchronisation → Configurer** : propriétaire, dépôt
   (`essor-data`), branche (`main`), fichier (`essor-data.json.enc`), jeton.
   Essor vérifie l'accès avant d'enregistrer quoi que ce soit, et vous prévient
   si le dépôt indiqué est public.

## 5. Autres appareils (téléphone compris)

1. Ouvrez la même adresse.
2. **Rejoindre mes données** : dépôt, jeton (celui de cet appareil), phrase de passe.
3. Les données arrivent chiffrées et s'ouvrent localement.

## 6. Installer sur le téléphone

**Réglages → Cet appareil** dit à tout moment où en est l'installation, et
donne la marche à suivre propre à la plateforme.

- **Android (Chrome)** — un bouton **Installer l'application** apparaît dans
  Réglages, et Chrome propose souvent l'installation de lui-même. Sinon :
  menu ⋮ → *Ajouter à l'écran d'accueil*.
- **iPhone / iPad (Safari)** — Safari n'offre aucun bouton : bouton **Partager**
  (le carré avec la flèche) → **Sur l'écran d'accueil** → **Ajouter**. Il faut
  vraiment Safari : Chrome sur iOS ne sait pas installer.
- **Ordinateur (Chrome, Edge)** — icône d'installation à droite de la barre
  d'adresse, ou menu ⋮ → *Installer Essor*.

Une fois installée, Essor s'ouvre en plein écran depuis l'écran d'accueil, sans
barre d'adresse, et **fonctionne hors réseau** : les données sont déjà sur
l'appareil, seule la synchronisation attend la connexion. Le navigateur traite
alors son stockage comme durable au lieu de celui d'un site de passage —
Réglages → Cet appareil affiche ce statut.

> **Sur iPhone, l'application installée a son propre stockage**, distinct de
> celui de Safari. Au premier lancement depuis l'écran d'accueil, elle ne
> connaît donc rien : choisissez **Rejoindre mes données**, avec le dépôt, un
> jeton et la phrase de passe. C'est un nouvel appareil, du point de vue du
> système.

## 7. Ouvrir sans retaper la phrase

Une phrase longue est la bonne serrure, mais la saisir à chaque ouverture au
pouce est intenable. **Réglages → Sécurité → Déverrouillage sans saisie**
propose de la sceller avec Face ID, Touch ID ou Windows Hello.

Ce que fait Essor exactement : elle enregistre une **clé d'accès** (passkey) sur
l'appareil, et lui fait dériver un secret stable — extension WebAuthn *PRF* —
qui n'est livré qu'après vérification de votre identité par l'appareil. Ce
secret chiffre la phrase de passe *sur cet appareil seulement*. Il n'est jamais
conservé : il est recalculé à chaque déverrouillage, et ne part ni vers le
dépôt, ni ailleurs.

Rien n'est affaibli : sans votre visage, votre empreinte ou le code de
l'appareil, le scellé ne s'ouvre pas — et il ne remplace pas la phrase, qui
reste toujours acceptée et demeure le **seul** recours sur un nouvel appareil.
À activer appareil par appareil, chacun avec sa propre clé d'accès.

Deux cas où le bouton n'apparaît pas : le navigateur ne gère pas l'extension PRF
(Essor le dit alors franchement plutôt que d'enregistrer une clé inutile), ou
l'appareil n'a pas de vérification biométrique configurée.

Et dans tous les cas, le petit œil au bout de chaque champ affiche ce que vous
tapez — phrase de passe comme jeton d'accès.

## 8. Connexion bancaire directe (facultative)

Essor peut interroger vos banques directement — comme Bankin' ou Finary — via
**Enable Banking**, prestataire agréé DSP2 dont l'offre « Restricted
Production » est gratuite pour vos propres comptes. Les opérations récupérées
passent par le même pipeline que les fichiers (dédoublonnage compris), et le
solde annoncé par la banque est proposé en certification.

Ce que ça change à la confidentialité, dit clairement : vos opérations
transitent par Enable Banking puis par un petit relais Cloudflare **à vous** —
rien n'y est stocké, mais elles ne restent plus confinées à votre machine.
Le consentement DSP2 se renouvelle auprès de chaque banque tous les 90 à
180 jours.

Mise en place (~30 minutes, une fois) :

1. **Enable Banking** — créez un compte sur enablebanking.com, puis dans le
   Control Panel créez une *application* :
   - environnement : **Production** (l'accès restreint à vos comptes est la
     valeur par défaut d'un nouveau compte) ;
   - **redirect URL** : `https://VOTRE-COMPTE.github.io/Essor/` — exactement
     l'adresse de l'application, barre finale comprise ;
   - téléchargez la **clé privée** (fichier PEM) et notez l'**application ID**.
2. **Cloudflare** — dash.cloudflare.com → Workers & Pages → créer une
   application → **importer un dépôt GitHub** → choisissez le dépôt de
   l'application (`Essor`). Cloudflare y trouve `wrangler.toml` et déploie
   `relais-cloudflare.js` tout seul — et le redéploiera à chaque mise à jour
   du dépôt. Une fois le premier déploiement passé, ouvrez l'application
   déployée → **Settings → Variables and Secrets** et créez trois **secrets** :
   `EB_APP_ID` (l'identifiant d'application Enable Banking), `EB_CLE_PRIVEE`
   (tout le contenu du fichier .pem, en-têtes compris) et `RELAIS_CLE` (un mot
   de passe long que vous inventez). La variable `ORIGINES` est déjà posée par
   la configuration. L'adresse `https://essor-relais.….workers.dev` est celle
   du relais. (L'ancienne voie — créer un Worker vierge et coller le code —
   fonctionne aussi si votre tableau de bord la propose.)
3. **Essor** — Réglages → Connexion bancaire : collez l'adresse du relais et
   la `RELAIS_CLE`, puis « Autoriser cette banque… ». La page part chez la
   banque (authentification forte), revient, et vous rattachez chaque compte
   bancaire à son compte Essor. La synchronisation se fait ensuite toute
   seule à l'ouverture, au plus une fois toutes les 6 heures.

À l'expiration du consentement, Essor le signale — « Renouveler » relance le
même parcours. Les fichiers restent utilisables à tout moment : connexion et
imports se croisent sans doublon.

## 9. Publier une mise à jour

`git push` sur le dépôt de l'application.

La page elle-même est servie **par le réseau d'abord** : une version déployée
arrive donc au rechargement suivant, sans manœuvre. Les scripts et la feuille de
style, eux, sont servis du cache puis rafraîchis en arrière-plan — ils peuvent
avoir un lancement de retard.

**Dès que la liste des fichiers change** (un `js/` ajouté ou renommé),
incrémentez `CACHE` dans `sw.js` (`essor-v2` → `essor-v3`). Le nouveau cache est
constitué en entier avant d'entrer en service et les anciens sont purgés : c'est
ce qui évite qu'une page neuve appelle un script périmé.

## Ce qui se passe quand deux appareils se croisent

Essor ne synchronise que ce qui le mérite. **L'écran ouvert, le mois affiché et
le cache d'instantanés appartiennent à l'appareil** et ne partent jamais dans le
dépôt : consulter Essor sur le téléphone pendant qu'il est ouvert sur
l'ordinateur ne crée donc aucune divergence. Et un contenu inchangé n'engendre
aucune révision — le dépôt ne reçoit que de vraies modifications.

Chaque envoi porte **l'heure exacte de la modification et le nom de l'appareil**
qui l'a faite. À cela s'ajoute une empreinte du contenu, qui permet de
reconnaître trois situations très différentes derrière un même refus de GitHub :

| Situation | Ce que fait Essor |
|---|---|
| Le dépôt dit déjà ce que nous disons, ou porte notre propre envoi précédent | Il reprend le numéro de version et continue. **Rien n'est demandé.** |
| L'autre appareil a modifié, pas nous | Sa version est adoptée. **Rien n'est demandé** — un message signale la mise à jour. |
| Les deux ont modifié depuis leur dernier point commun | Là seulement, la question est posée. |

Tant que la fenêtre est ouverte, Essor interroge le dépôt toutes les 45 secondes
— **un seul appel, qui ne rapporte que le numéro de version** ; le fichier n'est
téléchargé que s'il a réellement changé. C'est ainsi qu'un appareil apprend
qu'un autre a travaillé *avant* d'écrire lui-même, et qu'une mise à jour ne se
transforme pas en divergence.

Quand la question se pose vraiment, elle est chiffrée : quel appareil, à quelle
heure, et combien de fiches diffèrent de chaque côté. Trois réponses :

- **Reprendre celle du dépôt** — la version locale part dans les sauvegardes.
- **Garder la mienne** — la version du dépôt part dans `backups/`.
- **Réunir les deux** — tout ce qui existe d'un côté ou de l'autre est conservé,
  ce qui a été modifié des deux côtés revient à la version la plus récente, et
  un relevé importé sur les deux appareils ne double pas les opérations : la
  règle de dédoublonnage de l'import s'applique aussi à la fusion.

Hors ligne, tout continue de fonctionner : l'enregistrement se fait sur
l'appareil et l'indicateur affiche « synchronisation en attente ». L'envoi
repart au retour du réseau.

Tant qu'une divergence n'est pas tranchée, **l'appareil continue d'enregistrer**
— seul l'envoi vers le dépôt est suspendu. L'indicateur affiche « le dépôt
attend votre arbitrage » et se clique pour reposer la question ; le même bouton
figure dans Réglages → Synchronisation.

## En cas de perte

| Ce qui est perdu | Conséquence |
|---|---|
| Un appareil | Rien. Révoquez son jeton, reprenez les données ailleurs avec la phrase. |
| Le jeton | Rien. Générez-en un autre, collez-le dans Réglages → Synchronisation. |
| Les données du navigateur | Rien si la synchronisation était active : « Rejoindre mes données » les récupère. |
| Le déverrouillage biométrique | Rien. Saisissez la phrase, puis réactivez-le dans Réglages. |
| **La phrase de passe** | **Tout.** Aucune récupération n'est possible, par construction — la biométrie n'est qu'un raccourci vers elle, pas un substitut. |
