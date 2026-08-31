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

Sur téléphone, installez l'application : Safari → Partager → *Sur l'écran
d'accueil* ; Chrome Android → menu → *Installer l'application*. Elle s'ouvre
alors en plein écran et fonctionne hors ligne — les données sont déjà sur
l'appareil, seule la synchronisation attend le réseau.

## 6. Publier une mise à jour

`git push` sur le dépôt de l'application. Le service worker sert l'ancienne
version le temps du chargement, puis récupère la nouvelle en arrière-plan :
elle apparaît au lancement suivant. Pour la voir tout de suite, rechargez deux
fois.

Après une modification de la liste des fichiers, incrémentez `CACHE` dans
`sw.js` (`essor-v1` → `essor-v2`) : les anciens caches sont alors purgés.

## Ce qui se passe quand deux appareils se croisent

Le fichier du dépôt porte un identifiant de version (le `sha` GitHub). Essor
n'écrit qu'en déclarant la version qu'il croit remplacer ; si elle a changé
entre temps, GitHub refuse, et Essor vous le dit au lieu de trancher : reprendre
la version de l'autre appareil, ou garder la sienne. Dans les deux cas, la
version écartée est conservée dans `backups/` du dépôt, qu'Essor n'efface
jamais.

Hors ligne, tout continue de fonctionner : l'enregistrement se fait sur
l'appareil et l'indicateur affiche « synchronisation en attente ». L'envoi
repart au retour du réseau.

## En cas de perte

| Ce qui est perdu | Conséquence |
|---|---|
| Un appareil | Rien. Révoquez son jeton, reprenez les données ailleurs avec la phrase. |
| Le jeton | Rien. Générez-en un autre, collez-le dans Réglages → Synchronisation. |
| Les données du navigateur | Rien si la synchronisation était active : « Rejoindre mes données » les récupère. |
| **La phrase de passe** | **Tout.** Aucune récupération n'est possible, par construction. |
