# Essor V2

Application personnelle de prévision budgétaire et de suivi de patrimoine.
HTML/JS pur — **aucune dépendance, aucun build, aucun serveur applicatif**.

## Où elle vit

Essor est publiée sur **GitHub Pages** et s'utilise sur ordinateur comme sur
téléphone, à la même adresse. Le site publié ne contient que du code : vos
données ne le traversent jamais.

- Elles sont **chiffrées** (AES-256-GCM, clé dérivée de votre phrase de passe
  par PBKDF2) et conservées dans le navigateur de chaque appareil.
- Elles se synchronisent d'un appareil à l'autre par un **dépôt GitHub privé**
  où n'atterrit que le fichier chiffré. GitHub n'en voit qu'un bloc d'octets.
- La phrase de passe n'est **ni stockée ni transmise** : elle ne sert qu'à
  dériver la clé, en mémoire vive, le temps de la session. Elle ne peut donc pas
  être récupérée — notez-la dans votre gestionnaire de mots de passe.

Mise en ligne pas à pas : **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Premier lancement

1. Ouvrez l'adresse du site.
2. **Commencer à neuf**, **Rejoindre mes données** (si un autre appareil est déjà
   configuré) ou **Reprendre un fichier** (un `essor-data.json` de la version
   locale d'Essor, ou une sauvegarde chiffrée).
3. **Réglages → Synchronisation** pour brancher le dépôt privé.

## Installer sur le téléphone

**Réglages → Cet appareil** donne la marche à suivre et l'état d'installation.
Sur Android, un bouton **Installer l'application** y apparaît ; sur iPhone,
Safari → **Partager** → **Sur l'écran d'accueil** (Chrome iOS ne sait pas le
faire) ; sur ordinateur, l'icône d'installation de la barre d'adresse.

Installée, Essor s'ouvre en plein écran depuis l'écran d'accueil et **fonctionne
hors ligne** — les données sont déjà sur l'appareil, seule la synchronisation
attend le réseau. Le navigateur cesse aussi de traiter son stockage comme celui
d'un site de passage susceptible d'être effacé pour faire de la place.

Sur iPhone, l'application installée dispose de son **propre stockage**, distinct
de Safari : à son premier lancement, choisissez *Rejoindre mes données*.

## Plusieurs appareils

Chaque appareil garde son propre coffre chiffré et son propre jeton d'accès ; le
dépôt privé sert de point de rendez-vous.

Seules les **données** se synchronisent : l'écran ouvert, le mois affiché et le
cache d'instantanés restent propres à chaque appareil. Consulter Essor sur le
téléphone pendant qu'il est ouvert sur l'ordinateur ne crée donc aucune
divergence, et un contenu inchangé n'engendre aucune révision.

Chaque envoi porte l'heure exacte de la modification et le nom de l'appareil.
Quand le dépôt a bougé, Essor distingue trois cas : il ne porte que notre propre
travail (il reprend le numéro de version, sans un mot), l'autre appareil est
simplement en avance (sa version est adoptée, sans un mot), ou **les deux côtés
ont réellement modifié des données** — et alors seulement la question est posée,
chiffrée : quel appareil, à quelle heure, combien de fiches diffèrent. On peut
reprendre l'une, l'autre, ou **réunir les deux** sans dupliquer les opérations.

Tant que la fenêtre est ouverte, le dépôt est interrogé toutes les 45 secondes
par un appel qui ne rapporte que le numéro de version — le fichier n'est
téléchargé que s'il a changé. Aucune divergence n'est jamais tranchée à votre
place, et la version écartée est toujours conservée dans `backups/`.

L'application se **verrouille** d'elle-même après un temps d'inactivité réglable
(20 minutes par défaut) : rien n'est lisible sans la phrase.

Pour ne pas la retaper à chaque fois, **Réglages → Sécurité** la scelle avec
Face ID, Touch ID ou Windows Hello : l'appareil dérive un secret stable
(extension WebAuthn *PRF*) qu'il ne livre qu'après vous avoir vérifié, et qui
n'est jamais conservé ni transmis. La phrase reste toujours acceptée, et demeure
le seul recours sur un nouvel appareil. Chaque champ secret — phrase comme jeton
d'accès — s'affiche d'une pression sur l'œil.

## Démarrage type

1. **Opérations** → créer vos comptes (nature, plafond, IBAN comme indice d'import),
   puis « Certifier un solde » pour chacun : tout le reste en découle.
2. **Opérations** → déposez directement votre archive « Relevé de tous comptes »
   sur la section **Comptes** (ou passez par « Importer des relevés »). Une seule
   archive suffit : plusieurs comptes, plusieurs mois, archives imbriquées comprises.
   Le compte de chaque fichier est reconnu par ses métadonnées — jamais par les
   libellés d'opérations — puis mémorisé. Réimporter ne crée jamais de doublon.

   Formats reconnus : CSV bancaires français (Bred et assimilés, séparateur `;`,
   colonnes « Détail »), exports Revolut, **QIF**, OFX/QFX, JSON, et les rapports
   de courtier **XLSX** (XTB : onglets *Cash Operations*, *Open Positions*,
   *Closed Positions*), y compris lorsqu'ils arrivent en ZIP dans le ZIP.
   Le QIF n'ayant pas d'ordre de date normalisé, celui du relevé est **déduit**
   du fichier entier plutôt que supposé ; le compte déclaré par un bloc
   `!Account` sert d'indice de rattachement.
   Les positions ouvertes sont lues comme un **instantané de quantités** daté du
   rapport — la valorisation en découle, aucune saisie de valeur n'est demandée.
3. **Budget** → « Installer l'arborescence proposée » crée six catégories de dépenses
   et leurs sous-catégories (Logement, Alimentation, Transport, Abonnements, Vie
   quotidienne, Loisirs), plus huit lignes de revenus (salaires, loyers perçus,
   intérêts, remboursements, virements reçus, aides, ventes, cadeaux), avec les
   règles de reconnaissance correspondantes. Un aperçu chiffré montre d'abord
   combien de vos opérations seraient classées. Ensuite, « Recaler sur le réel »
   remplit les montants d'après les mois constatés.

   Classer une opération à la main classe automatiquement **toutes les autres du
   même émetteur restées sans catégorie**, et crée la règle pour les imports à venir.
   Marquer une opération « mouvement interne » se propage de la même façon.
   Ce qui était déjà classé n'est jamais réécrit, et l'opération est annulable.

   **Rien ne se généralise sans preuve.** Si vous classez un même commerçant de
   deux façons différentes (Amazon en cadeau, puis en achat personnel), il est
   déclaré *polyvalent* : sa règle est retirée, les classements qu'elle avait
   produits reviennent « à classer », vos choix manuels sont préservés, et ses
   opérations se classent désormais une par une. Un bouton rétablit la règle si
   la contradiction était une erreur.

   De même, « Recaler sur le réel » ne propose un montant mensuel que pour les
   lignes **présentes dans au moins deux tiers des mois**. Un remboursement reçu
   une fois ne devient jamais un revenu récurrent : ces lignes sont listées à
   part, décochées, avec leur total sur la période. Le montant proposé est la
   **médiane** (un mois exceptionnel ne le déforme pas), le détail mois par mois
   est affiché, un changement de niveau est signalé, et chaque montant reste
   modifiable avant application.

   **Arrondis convertis en bitcoin** (Réglages) : si votre carte arrondit chaque
   paiement et convertit la différence en BTC, ces petits débits sont transformés
   en position bitcoin, chacun au cours de son propre jour. Rejouable sans doublon.

   Catégories, sous-catégories et règles vivent dans vos données : renommez,
   déplacez une sous-catégorie d'une catégorie à l'autre (ses opérations suivent),
   supprimez ce qui ne sert pas.
4. **Réglages** → hypothèses de rendement (prudentes par défaut), inflation,
   cibles d'épargne par compte, crédits, objectifs, cours des supports.

   L'**exposition géographique** ne demande aucune saisie : l'indice suivi par
   chaque ETF est reconnu d'après son nom et son code (`C50.FR` → Euro Stoxx 50,
   `DCAM.FR` → MSCI World…), et sa répartition par pays en découle. L'écran
   Patrimoine agrège par transparence sur un **planisphère** : chaque pays est
   teinté selon votre exposition, les plus fortes portent leur pourcentage, le
   survol donne le montant et la part. Les régions (« Zone euro », « Marchés
   émergents ») sont ventilées entre leurs pays au prorata de l'indice, au
   centime près. Le détail chiffré — continents en camembert, régions en barres
   — reste sous la carte.

   La carte est un **cartogramme** : chaque pays investi est un **disque dont
   l'aire est proportionnelle à votre exposition**, posé à sa place
   géographique puis écarté juste assez pour ne plus recouvrir ses voisins.
   Seuls les pays où vous avez de l'argent apparaissent — une carte à l'échelle
   consacrerait l'essentiel de sa surface à des pays sans un euro.
   Chaque information a son canal : **aire = combien, couleur = quel
   continent** (les mêmes couleurs que le camembert). Carte à gauche sur deux
   tiers, camembert et détail chiffré à droite sur un tiers.

   **Survolez un disque** — ou une part du camembert, les deux commandent la
   même chose : la vue se rapproche sur le continent et les bulles cèdent la
   place aux pays dans leur forme réelle, teintés selon leur poids, leur
   pourcentage inscrit dedans. Les deux vues répondent à deux questions — les
   bulles disent *combien*, la vue rapprochée dit *où exactement*. On revient à
   la vue d'ensemble en quittant la région, sans avoir à quitter la carte.

   Le cadrage se règle sur les pays qui portent 90 % du poids du continent :
   sans ce filtre, une ligne résiduelle en Finlande étirerait le cadre européen
   jusqu'au cercle polaire et interdirait tout rapprochement.

   La silhouette des continents, en fond très discret, situe le regard. Sa
   projection est **volontairement faussée** en faveur de l'hémisphère Nord
   (Mercator, dilatation du haut, cadrage resserré au sud).

   La géométrie (Natural Earth 110 m, **domaine public**) est **embarquée** dans
   `js/worldmap.js` : convertie hors ligne, projetée une fois pour toutes, elle
   ne charge aucune ressource à l'exécution — l'application reste sans
   dépendance et fonctionne hors ligne. Les pays à cheval sur l'antiméridien
   sont découpés, sans quoi leur tracé barre la carte de part en part. Ce qui ne
   désigne aucun territoire (« Reste du monde ») est chiffré sous la carte
   plutôt que placé au hasard.
   Toute déduction est signalée et corrigeable ; une correction manuelle n'est
   jamais réécrasée.

   Ces poids sont ceux **publiés de l'indice**, pas la composition exacte de votre
   fonds au jour le jour. Pour les poids réels, collez une clé Financial Modeling
   Prep (gratuite) dans Réglages : c'est la seule API testée qui fournisse la
   répartition par pays *et* autorise l'appel depuis un fichier local. Facultatif —
   sans clé, la déduction hors ligne suffit.
5. **Suivi du mois** → sur le **mois en cours**, prévu contre réel avec l'écart et
   la consommation. Sur un **mois révolu**, le prévisionnel disparaît : le budget
   enregistré dit ce que vous prévoyez aujourd'hui, pas ce que vous prévoyiez alors.
   Le mois est alors comparé au précédent — fait contre fait.

   Les sous-catégories sans mouvement sont repliées (leur nombre est annoncé, un
   bouton les révèle). L'écran va du plus court au moins utile : revenus, dépenses,
   puis mouvements internes.
   **Cliquez un montant constaté** pour voir les opérations qui le composent, savoir
   si chacune a été classée par une règle, devinée ou saisie à la main, et la
   corriger sur place — le détail se rouvre à jour.

6. **Patrimoine** → photo de l'instant, projection, assistant d'épargne
   (mêmes calculs que la projection, au centime près).

   L'**épargne mensuelle simulée** se règle directement sur la carte Projection —
   saisie libre, ou déduite en un clic de votre prévisionnel, de votre réel constaté
   ou de vos versements d'épargne du Budget (valeur par défaut). Une ligne sous le
   champ rappelle toujours d'où vient le montant retenu.

   La projection est un **Monte Carlo** : 500 trajectoires simulées (tirage
   reproductible), percentiles P10 à P90, rendements nets des frais annuels saisis
   par compte, PEA et compte-titres corrélés. Le rendement saisi est un taux
   médian ; la dispersion ne touche que les actifs volatils et croît avec le temps
   passé en marché de chaque euro. Objectifs datés en euros courants **et**
   constants ; taux de rente réglable. Dans Réglages, la colonne « Constaté »
   confronte vos hypothèses au rendement réellement produit par vos comptes.

   La **fiscalité de sortie** est modélisée par enveloppe (PEA 17,2 % de PS après
   5 ans, CTO et crypto 30 %, AV avec abattement après 8 ans, livrets exonérés) :
   l'impôt ne frappe que les gains, la projection affiche brut, net de fiscalité
   et net en euros constants, la rente est donnée nette. Année d'ouverture et taux
   personnalisé se règlent dans la fiche de chaque compte ; c'est une
   approximation de liquidation en une fois, au droit actuel, dite à l'écran.

   Le montant à épargner se déduit d'un clic — de votre prévisionnel (revenus
   prévus − dépenses prévues), de votre réel constaté (moyenne des mois complets,
   mouvements internes et épargne déjà versée exclus), ou de vos versements
   prévus — et reste modifiable à la main. Le calcul est affiché en toutes
   lettres, et l'application signale les dépenses qui ressemblent à des virements
   vers vos propres comptes, lesquelles minoreraient la capacité.

   Les ordres sont présentés dans l'ordre où on les exécute : **1 — virements à
   effectuer**, puis **2 — ordres à passer** sur chaque compte-titres une fois le
   virement crédité, avec le nom lisible du fonds, la quantité entière, le cours
   et le montant. Le reliquat non investissable est chiffré, jamais tu.

## Tests

Ouvrir `tests.html` (à l'adresse du site, ou via le lanceur local) : la page
rejoue les critères d'acceptation de la section 9 du cahier des charges —
capitalisation exacte, soldes certifiés, import multi-comptes, dédoublonnage,
décalages de versement — auxquels s'ajoutent le chiffrement du coffre, la
concurrence entre appareils et la lecture des QIF. Les tests de persistance
travaillent sur un stockage simulé : ils ne touchent jamais vos données.

Pour rejouer en plus les tests sur une archive réelle, copiez votre
« Relevé de tous comptes.zip » à côté de `tests.html` sous le nom
`_test-releve.zip`. Sans ce fichier, ces tests sont simplement ignorés.

## Réseau

Deux destinations, et seulement deux :

- **api.github.com** — le dépôt privé de données, en enveloppe chiffrée.
- **CoinGecko**, à la demande, pour les cours crypto : seuls les identifiants de
  supports sortent de la machine. Les cours d'ETF et d'actions se saisissent
  dans Réglages ou arrivent par les relevés de courtier.

Tout le reste fonctionne hors ligne, y compris le premier chargement une fois
l'application installée.

## Structure

- `index.html` + `js/` + `css/` — l'application (scripts classiques, pas de build)
- `js/crypto.js` — coffre : AES-GCM, dérivation PBKDF2, enveloppes
- `js/github.js` — dépôt de données : lecture, écriture, sauvegardes, versions
- `js/store.js` — persistance chiffrée (IndexedDB), synchronisation, conflits
- `js/engine.js` — soldes certifiés, valorisation, historique mensuel
- `js/importers.js` — ZIP/CSV/QIF/OFX/XLSX/JSON, rattachement de compte, dédoublonnage
- `js/rules.js` — catégorisation, virements internes, décalages de versement
- `js/alloc.js` — moteur d'allocation unique (assistant **et** projection)
- `js/project.js` — projection capitalisée, scénarios, dispersion, rente
- `sw.js` + `manifest.webmanifest` — installation et fonctionnement hors ligne
- `tests.html` — tests d'acceptation
- `DEPLOIEMENT.md` — mise en ligne, dépôts, jeton d'accès
