# Audit d'Essor V2 — simulation de patrimoine et comparaison Finary

*07/08/2026 — audit du code réel (js/project.js, js/alloc.js, js/engine.js), pas des intentions.*

## 1. Ce que la simulation prend en compte aujourd'hui

| Paramètre | État | Détail |
|---|---|---|
| Capitalisation composée | ✔ | mensuelle, géométrique, exacte au centime (testée) |
| Rendement par nature de compte | ✔ | prudents par défaut (livret 1,7 %, PEA/titres 4,5 %, AV 2,5 %, crypto 0 %, immo 1 %), surchargeables par compte |
| Volatilité par nature | ✔ | titres/PEA 15 %, crypto 60 %, AV 5 %, immo 8 % |
| Inflation | ✔ | 2 %/an, toute valeur affichée en courant **et** constant |
| Épargne mensuelle | ✔ | issue du budget, indexable sur l'inflation |
| Allocation des versements | ✔ | même moteur que l'assistant (cibles, plafonds, parts entières) — identité testée |
| Crédits | ✔ | amortissement mensuel, capital restant dû par mois |
| Scénarios | ✔ | central, ±0,5 σ (prudent/optimiste) |
| Dispersion | ≈ | cône analytique ±1 σ√t sur la part volatile |
| Objectifs | ≈ | date d'atteinte sur trajectoire centrale **nominale** |
| Rente | ≈ | règle des 4 %, fixe, brute |
| **Fiscalité** | ✘ | aucune — tout est brut |
| **Frais** (TER, frais d'AV, courtage) | ✘ | aucun |
| Événements de vie | ✘ | aucun (apport, achat immobilier, changement d'épargne à date) |
| Décumulation / FIRE | ✘ | aucun simulateur de retrait |
| Croissance des revenus | ✘ | épargne constante hors inflation |
| Corrélations entre classes | ✘ | (peu grave tant qu'il n'y a pas de Monte Carlo) |

## 2. Défauts identifiés dans le moteur actuel

**D1 — Le cône de dispersion est figé au jour 0** (`_volatileShareByMonth` ne calcule
rien "par mois" malgré son nom : part volatile et σ moyens sont pris une fois sur le
patrimoine actuel). Or la stratégie cible 70 % PEA : la part volatile *croît* avec les
versements. Le cône est donc **trop étroit à long terme** — le risque affiché à 10 ans
est sous-estimé, ce qui contredit l'esprit de P8/EX-66.

**D2 — Les scénarios ±0,5 σ sont arithmétiques.** Pour la crypto (σ = 60 %), le
scénario optimiste capitalise +30 %/an pendant tout l'horizon et le prudent −30 %/an :
dès qu'une position crypto pèse, les extrêmes deviennent des caricatures. Pas de prise
en compte du « volatility drag » (moyenne géométrique ≈ μ − σ²/2).

**D3 — Les objectifs se comparent en euros courants.** `goalReachDate` cherche quand la
trajectoire *nominale* franchit la cible : « 50 000 € atteints en avril 2031 » vaudront
~45 000 € d'aujourd'hui. Le cahier des charges impose partout le double affichage (P8) ;
les objectifs y échappent.

**D4 — La rente est brute et figée à 4 %.** Pas de paramètre, pas de fiscalité de
sortie, alors que la littérature sur le taux de retrait sûr donne plutôt 3–4 % *avant*
impôt.

**D5 — Les hypothèses ne sont jamais confrontées au réalisé.** L'app calcule la
performance réelle mensuelle (EX-7) mais ne dit jamais « votre PEA a fait X %/an
constaté, votre hypothèse est 4,5 % ». L'utilisateur règle ses hypothèses à l'aveugle.

Mineur : `goalReachDate` relance une projection de 600 mois par objectif (perf) ; le
crédit n'est adossé à aucun bien (vendre l'immobilier dans une simulation est impossible).

## 3. Face à Finary

| Domaine | Finary | Essor | Verdict |
|---|---|---|---|
| Agrégation des comptes | synchro bancaire automatique | import fichiers certifié, zéro doublon | Finary plus confortable — mais l'agrégation auto est **explicitement hors périmètre** du cahier (données locales, EX-99). Choix assumé, à ne pas copier. |
| Vie privée | données sur leurs serveurs, abonnement | 100 % local, JSON lisible, gratuit, pérenne | **Essor** |
| Budget / catégorisation | secondaire | catégorisation apprenante, décalages de versement, prévisionnel vs réel | **Essor** |
| Exactitude | agrégats, écarts de synchro fréquents | solde certifié, recalcul intégral, 76 tests | **Essor** |
| Simulation | Monte Carlo, percentiles, événements de vie, âge FIRE | 3 scénarios + cône analytique figé | **Finary**, nettement |
| Fiscalité | enveloppes reconnues, performances nettes | rien | **Finary** |
| Frais | analyseur de frais (TER, AV) | rien | **Finary** |
| Passage à l'acte | aucun ordre concret | ordres exécutables en parts entières, virements chiffrés | **Essor** — c'est votre différenciateur, aucun agrégateur ne le fait |
| Performance | TWR, benchmarks | gains mensuels hors versements, sans annualisation ni benchmark | **Finary** |
| Immobilier | biens valorisés, estimation auto | un compte à 1 %/an | **Finary** |

L'écart réel est concentré sur un point : **Finary simule un avenir plausible
(dispersion honnête, fiscalité, frais, événements), Essor projette un présent prolongé
avec grande exactitude**. La bonne nouvelle : l'exactitude est la partie difficile, et
elle est acquise et testée.

## 4. Améliorations recommandées, par ordre de rentabilité

### Corrections rapides — **réalisées le 07/08/2026**
1. ✔ **D1/D2 — quantiles log-normaux par compte**, avec suivi de l'âge moyen pondéré des
   sommes en marché : la dispersion naît des versements (plus de part volatile figée au
   jour 0) et la crypto ne capitalise plus ±30 %/an composés (testé : ratio prudent/central
   à 10 ans > 0,15 contre 0,03 avant).
2. ✔ **D3 — objectifs à double date**, nominale et en pouvoir d'achat constant.
3. ✔ **D4 — taux de rente paramétrable** (Réglages), affiché avec son taux.
4. ✔ **D5 — colonne « Constaté »** dans Réglages : rendement annualisé réalisé par nature,
   hors versements, rouge si l'écart à l'hypothèse dépasse 3 points.
5. ✔ **Frais annuels par compte** (fiche de compte), déduits du rendement projeté.

### Chantiers moyens (jours)
6. ✔ **Fiscalité de sortie par enveloppe — réalisée le 07/08/2026** (js/fisc.js).
   L'impôt frappe les gains, jamais les versements : la projection suit la base
   fiscale de chaque compte (versements + plus-values latentes via PRU), et le net
   est calculé trajectoire par trajectoire dans le Monte Carlo — une bonne
   trajectoire paie plus d'impôt qu'une mauvaise. Règles : PEA ≥ 5 ans 17,2 % PS
   (< 5 ans PFU 30 %), CTO/crypto PFU 30 %, AV ≥ 8 ans 17,2 % + 7,5 % au-delà de
   l'abattement (4 600/9 200 €, réglable), livrets réglementés et immo exonérés,
   taux personnalisé par compte pour les cas particuliers. Année d'ouverture
   PEA/AV saisissable ; sans elle, enveloppes supposées mûres à l'horizon (dit à
   l'écran). Affiché : colonne « Net de fiscalité » par percentile, patrimoine net
   d'impôt aujourd'hui, impôt médian à l'horizon, rente nette. 12 tests.
   Limites assumées et affichées : sortie en une fois, taux actuels, abattement AV
   appliqué une fois, primes AV < 150 k€, PRU inconnus ⇒ impôt plancher.
7. ✔ **Monte Carlo — réalisé le 07/08/2026** : 500 trajectoires, graine fixe (reproductible),
   rendements mensuels log-normaux, PEA et compte-titres parfaitement corrélés, familles
   indépendantes entre elles. Percentiles P10/P25/P50/P75/P90 affichés, médiane collant à la
   trajectoire centrale (testé), 140 ms pour 120 mois.
8. **Événements de vie** : versement/retrait ponctuel à une date, achat immobilier (bien + crédit adossé), changement d'épargne mensuelle. Le cahier ne les prévoit pas, mais toute projection à 10 ans sans eux est un présent prolongé.
9. **Décumulation** : « à partir de telle date, je retire X €/mois » → durée de survie du capital, ou l'inverse (date FIRE pour une rente visée).
10. **Cours d'ETF automatiques** via la clé FMP déjà prévue pour la géographie (l'en-tête CORS le permet, vérifié) — couverture des ETF Paris à confirmer sur vos codes.
11. **Décomposition versements / performance** sur l'historique : « +12 400 € cette année, dont 9 600 € versés et 2 800 € de gains ». Les données existent déjà (EX-7).

### À ne pas faire
- **Synchro bancaire automatique** — contraire au cahier des charges (hors périmètre §1.3, EX-99) et c'est précisément ce qui rend Essor pérenne et privé.
- **Multi-devises** — vos relevés convertissent déjà tout en EUR ; coût élevé, gain nul.
- **Actifs exotiques** (montres, vin…) — un compte « Autre » certifié suffit déjà.

## 4 bis. Excès de généralisation — corrigé le 07/08/2026

Défaut transversal signalé par l'usage réel, et déjà interdit par EX-114 (« une
détection automatique ne doit jamais s'appliquer à des données dont la régularité
n'a pas été vérifiée »). La règle était respectée pour les décalages de versement,
violée partout ailleurs. Deux foyers :

**Recalage du prévisionnel** — toute ligne ayant bougé une seule fois recevait un
montant mensuel égal à sa moyenne sur la fenêtre : un remboursement unique de 70 €
devenait 11,67 €/mois de revenu récurrent. Corrigé : seuil de régularité (présence
dans ≥ 2/3 des mois, minimum 3), médiane au lieu de la moyenne, détection des
changements de niveau, détail mois par mois affiché, montants modifiables, lignes
ponctuelles isolées et décochées. Sur les données réelles : Remboursements,
Cadeaux reçus, Carburant, Titres de transport, Sorties et Uber et taxi passent de
« revenus/dépenses mensuels fantômes » à « ponctuel, proposé 0 ».

**Propagation des règles** — classer une opération créait une règle appliquée à
tout le commerçant, sans vérifier qu'il soit univoque. Or Amazon vend un cadeau et
un achat personnel. Corrigé : la contradiction (deux classements manuels
divergents) marque le commerçant *équivoque*, retire sa règle, défait ses
classements automatiques (jamais les manuels), et interdit ensuite toute
généralisation — y compris la suggestion heuristique et la détection de récurrence.
Le caractère « mouvement interne » reste propageable : il ne dépend pas de la
nature de l'achat. Réversible d'un bouton.

## 5. Conclusion

La fondation d'Essor est plus solide que celle des agrégateurs sur ce qu'elle couvre :
chiffres certifiés, cohérence assistant/projection prouvée, recommandations exécutables.
Ses projections, en revanche, décrivent un monde sans impôts, sans frais et sans
événements, avec un risque sous-estimé à long terme. Les cinq corrections rapides
réparent les défauts internes ; la fiscalité (6) et le Monte Carlo (7) sont les deux
chantiers qui changeraient la nature de l'outil.
