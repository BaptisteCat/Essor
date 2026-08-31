/* Essor — persistance (P1, EX-89…98), version web.

   L'application est servie par GitHub Pages et doit fonctionner sur ordinateur
   comme sur téléphone. La File System Access API — qui portait la version
   locale — n'existe ni sur Safari iOS ni sur Chrome Android : les données
   vivent donc dans le navigateur (IndexedDB), TOUJOURS chiffrées, et se
   synchronisent d'un appareil à l'autre par un dépôt GitHub privé où l'on ne
   dépose que l'enveloppe chiffrée (js/crypto.js, js/github.js).

   Trois garanties conservées de la version locale :
   — enregistrement automatique, l'utilisateur n'y pense jamais (EX-90) ;
   — aucune écriture ne peut effacer en silence celle d'un autre appareil : le
     sha GitHub joue le rôle de l'horodatage du fichier (P1) ;
   — sauvegarde horodatée avant toute action destructrice, jamais purgée (EX-95). */
'use strict';

const Store = {

  state: null,          // données de l'application (déchiffrées, en mémoire vive)
  fileName: 'essor-data.json',
  mode: 'boot',         // 'sync' (dépôt configuré) | 'local' (cet appareil seul) | 'boot'
  saveStatus: 'saved',  // 'saved' | 'saving' | 'dirty' | 'local' | 'error'
  onStatus: null,       // callback UI (EX-93)
  onConflict: null,
  onLock: null,         // appelé quand la session se verrouille
  conflit: false,
  _saveChain: Promise.resolve(),
  _cle: null,           // clé AES dérivée de la phrase ; perdue au verrouillage
  _sel: null,           // sel PBKDF2, stable pour toute la vie des données
  _shaDistant: null,    // version distante sur laquelle cette session s'appuie
  _enAttente: false,    // écrit localement, pas encore poussé (hors ligne)

  SCHEMA: 1,

  defaultState() {
    return {
      schema: Store.SCHEMA,
      settings: {
        inflation: 0.020,             // prudence par défaut (P8)
        savingsFollowInflation: true, // EX-63
        horizonMonths: 120,
        renteRate: 0.04,              // règle empirique de retrait, réglable (EX-70)
        avAbattement: 460000,         // abattement AV après 8 ans : 4 600 € seul, 9 200 € couple
        projSavings: null,            // épargne mensuelle simulée ; null = celle du budget
        projSavingsSource: 'budget',  // d'où elle vient, pour pouvoir le dire (P7)
        verrouillageMin: 20,          // verrouillage auto après N minutes d'inactivité ; 0 = jamais
        // Rendements annuels attendus par nature (EX-2, EX-60) — volontairement bas.
        returns: { courant: 0, livret: 0.017, titres: 0.045, pea: 0.045, av: 0.025, crypto: 0.0, immo: 0.01, autre: 0 },
        // Volatilité annuelle par nature — la dispersion ne s'applique qu'aux actifs volatils (EX-66).
        vols: { courant: 0, livret: 0, titres: 0.15, pea: 0.15, av: 0.05, crypto: 0.60, immo: 0.08, autre: 0 },
      },
      // Dépôt de synchronisation — sans le jeton, qui reste propre à l'appareil.
      sync: { owner: '', repo: '', branch: 'main', chemin: 'essor-data.json.enc' },
      maj: null,          // heure exacte de la dernière modification synchronisée
      majPar: null,       // et l'appareil qui l'a faite — pour pouvoir le dire
      accounts: [],       // {id, name, type, order, plafond?, returnOverride?, closed}
      credits: [],        // {id, name, principal, annualRate, monthlyPayment, startDate, months}
      certifications: [], // {id, accountId, date, balance}  (balance en centimes)
      trades: [],         // {id, accountId, symbol, date, qtyDelta, priceCents?} — mouvements de titres (EX-11)
      // Quantités certifiées par un rapport de courtier : un instantané dit
      // « à cette date je détiens N parts », comme une certification de solde
      // (P2). Les mouvements postérieurs s'y ajoutent.
      positionSnapshots: [], // {id, accountId, symbol, date, qty, source}
      pru: {},            // symbol → prix de revient unitaire en centimes (EX-12)
      prices: {},         // symbol → { "YYYY-MM-DD": centimes }  (cours, EX-14)
      priceMeta: {},      // symbol → {name, currency, source, isin, capitalisant:true}
      geo: {},            // symbol → {région: part}  (exposition géographique, EX-5)
      geoSource: {},      // symbol → 'deduit' | 'enligne' | 'manuel'  (P7 : dire d'où vient le chiffre)
      geoIndice: {},      // symbol → nom de l'indice reconnu
      budget: {
        categories: [],   // {id, name, lines:[{id, name, amount}]}
        incomes: [],      // {id, name, amount}
        savings: [],      // {id, name, amount, accountId}  (EX-16)
      },
      rules: [],          // {id, pattern, lineId, kind, internal} — règles utilisateur (EX-35)
      ambiguousMerchants: [], // libellés classés différemment selon les fois : jamais généralisés
      dismissedDupes: [],     // paires jugées « deux vraies opérations » : ne plus les proposer
      dismissedShifts: [],    // décalages écartés (EX-51)
      transactions: [],   // {id, accountId, date, amount, label, raw?, lineId?, auto?, internal?, pairId?, monthOverride?, hash}
      snapshots: {},      // "YYYY-MM" → {total, byAccount:{id:cents}, computedAt} — cache recalculable (EX-75)
      snapshotsDirty: true,
      goals: [],          // {id, name, target}
      targets: [],        // {accountId, share, cap?}  (EX-52)
      importMemory: {},   // empreinte de fichier → accountId (EX-26)
      ui: { lastScreen: 'patrimoine', period: { kind: 'month', month: null } },
    };
  },

  /* ---------- IndexedDB : coffre local ---------- */

  _idb() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open('essor', 2);
      rq.onupgradeneeded = () => {
        if (!rq.result.objectStoreNames.contains('kv')) rq.result.createObjectStore('kv');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  },

  async _get(key) {
    try {
      const db = await Store._idb();
      return await new Promise((res, rej) => {
        const rq = db.transaction('kv').objectStore('kv').get(key);
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      });
    } catch { return null; }
  },

  async _put(key, val) {
    const db = await Store._idb();
    await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  },

  async _del(key) {
    try {
      const db = await Store._idb();
      await new Promise((res) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').delete(key);
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch { /* rien à supprimer */ }
  },

  /* ---------- Démarrage ---------- */

  // Ce que sait l'appareil AVANT toute phrase de passe : y a-t-il un coffre
  // local, et vers quel dépôt pointait-il ? (rien de confidentiel ici)
  async indices() {
    return (await Store._get('indices')) || null;
  },

  async _majIndices() {
    const s = Store.state ? Store.state.sync : null;
    await Store._put('indices', {
      coffre: true, sel: Store._sel,
      depot: s && s.owner && s.repo ? { owner: s.owner, repo: s.repo, branch: s.branch, chemin: s.chemin } : null,
      derniereOuverture: new Date().toISOString(),
    });
  },

  // → 'vierge' (rien sur cet appareil) | 'verrouille' (coffre présent)
  async init() {
    if (!Coffre.disponible()) throw new Error(
      'Ce navigateur ne fournit pas WebCrypto. Ouvrez l\'application en HTTPS ' +
      '(l\'adresse doit commencer par https://) avec un navigateur à jour.');
    const c = await Store._get('coffre');
    return c ? 'verrouille' : 'vierge';
  },

  /* ---------- Création, ouverture, verrouillage ---------- */

  // Premier usage sur le tout premier appareil. `reprise` = état déjà connu
  // (import d'un essor-data.json de l'ancienne version), sinon état neuf.
  async creer(phrase, reprise) {
    await Store._reinitialiserAppareil();
    const { cle, sel } = await Coffre.deriver(phrase, null);
    Store._cle = cle; Store._sel = sel; Store._shaDistant = null;
    Store._sigBase = Store._sigEnvoyee = null;
    Store.state = reprise ? Store.migrate(reprise) : Store.defaultState();
    Store.state.snapshotsDirty = true;
    await Store._ecrireLocal();
    await Store._majIndices();
    Store.mode = Depot.actif() ? 'sync' : 'local';
  },

  // Ouverture d'un coffre local existant.
  async deverrouiller(phrase) {
    const texte = await Store._get('coffre');
    if (!texte) throw new Error('Aucune donnée sur cet appareil.');
    const { donnees, cle, sel } = await Coffre.ouvrir(phrase, texte);   // lève PHRASE_INVALIDE
    Store._cle = cle; Store._sel = sel;
    Store.state = Store.migrate(donnees);
    Store.state.snapshotsDirty = true;
    Store._shaDistant = (await Store._get('sha')) || null;
    // Le point d'accord d'où repart cette session. Absent (installation
    // antérieure à cette version), on ne suppose rien : la première divergence
    // sera arbitrée à la main, une fois.
    Store._sigEnvoyee = Store._sigBase = (await Store._get('sigEnvoyee')) || null;
    Store._baseTexte = (await Store._get('base')) || null;
    await Store._brancherDepot();
    await Store._majIndices();
  },

  // Premier usage sur un NOUVEL appareil : rien en local, on va chercher le
  // coffre dans le dépôt. Le sel voyage dans l'enveloppe, donc la même phrase
  // redonne la même clé.
  async rejoindre(phrase, cfgDepot) {
    Depot.configure(cfgDepot);
    const distant = await Depot.lire();
    if (!distant) throw new Error('Le dépôt ne contient pas encore de fichier de données.');
    const { donnees, cle, sel } = await Coffre.ouvrir(phrase, distant.texte);
    await Store._reinitialiserAppareil();   // un coffre précédent ne s'ouvrirait plus
    Store._cle = cle; Store._sel = sel;
    Store.state = Store.migrate(donnees);
    Store.state.snapshotsDirty = true;
    Store.state.sync = { owner: cfgDepot.owner, repo: cfgDepot.repo, branch: cfgDepot.branch, chemin: cfgDepot.chemin };
    await Store._ecrireLocal();
    await Store._noterAccord(distant.sha, Store.signature());
    await Store.enregistrerJeton(cfgDepot.jeton);
    await Store._majIndices();
    Store.mode = 'sync';
  },

  verrouiller() {
    Store._cle = null;
    Store.state = null;
    Store.mode = 'boot';
    Depot.configure(null);
    // Verrouiller est un geste : il retire aussi la clé de session conservée
    // par « rester déverrouillé » — un verrou qui se rouvre seul n'en est pas un.
    Store._del('cleSession');
    if (Store.onLock) Store.onLock();
  },

  /* ---------- Rester déverrouillé sur cet appareil ----------
     La clé AES — non extractible — est conservée dans IndexedDB : le
     navigateur peut la ranger et l'utiliser, jamais en lire les octets.
     L'application s'ouvre alors sans phrase ni biométrie ; la protection
     devient celle de l'appareil (son code, sa session). C'est un choix par
     appareil, jamais un défaut, et le verrouillage manuel le révoque. */

  async resterDeverrouille(actif) {
    if (actif) {
      if (!Store._cle) throw new Error('Le coffre doit être ouvert.');
      await Store._put('cleSession', { cle: Store._cle, sel: Store._sel });
    } else {
      await Store._del('cleSession');
    }
  },

  async estResterDeverrouille() { return !!(await Store._get('cleSession')); },

  // Ouverture sans phrase, si la clé de session est là et ouvre encore le
  // coffre (une phrase changée ailleurs la rend caduque — on retombe alors
  // sur l'écran de déverrouillage, sans rien casser).
  async deverrouillerAuto() {
    const sess = await Store._get('cleSession');
    if (!sess || !sess.cle) return false;
    const texte = await Store._get('coffre');
    if (!texte) return false;
    let donnees;
    try { donnees = await Coffre.ouvrirAvecCle(sess.cle, texte); }
    catch { await Store._del('cleSession'); return false; }
    Store._cle = sess.cle; Store._sel = sess.sel;
    Store.state = Store.migrate(donnees);
    Store.state.snapshotsDirty = true;
    Store._shaDistant = (await Store._get('sha')) || null;
    Store._sigEnvoyee = Store._sigBase = (await Store._get('sigEnvoyee')) || null;
    Store._baseTexte = (await Store._get('base')) || null;
    await Store._brancherDepot();
    await Store._majIndices();
    return true;
  },

  async changerPhrase(ancienne, nouvelle) {
    const texte = await Store._get('coffre');
    const ouvert = await Coffre.ouvrir(ancienne, texte);          // vérifie l'ancienne
    const { cle, sel } = await Coffre.deriver(nouvelle, null);    // nouveau sel
    const jeton = Store._jeton;
    // Les sauvegardes locales sont scellées avec l'ancienne clé : sans ce
    // rescellement, changer de phrase les rendrait toutes irrécupérables.
    const anciennes = (await Store._get('backups')) || [];
    const rescellees = [];
    for (const b of anciennes) {
      try {
        const clair = await Coffre.ouvrirAvecCle(ouvert.cle, b.texte);
        rescellees.push({ ...b, texte: await Coffre.sceller(cle, sel, clair) });
      } catch { /* sauvegarde d'un coffre antérieur : on l'abandonne */ }
    }
    Store._cle = cle; Store._sel = sel;
    await Store._put('backups', rescellees);
    await Store._ecrireLocal();
    if (jeton) await Store.enregistrerJeton(jeton);
    await Store._majIndices();
    // Le déverrouillage biométrique et la clé de session ouvraient sur
    // l'ancienne phrase : ils suivent, ou disparaissent — jamais ne restent faux.
    if (await Store.estResterDeverrouille()) await Store.resterDeverrouille(true);
    if (typeof Bio !== 'undefined') await Bio.resceller(nouvelle);
    // Le dépôt doit recevoir la nouvelle enveloppe tout de suite : sinon les
    // autres appareils continueraient d'y lire l'ancien sel.
    if (Depot.actif()) await Store._pousser({ forcer: true, message: 'Essor — nouvelle phrase de passe' });
  },

  /* ---------- Jeton d'accès (propre à l'appareil) ---------- */

  _jeton: null,

  async enregistrerJeton(jeton) {
    Store._jeton = jeton || null;
    if (!jeton) { await Store._del('jeton'); return; }
    await Store._put('jeton', await Coffre.sceller(Store._cle, Store._sel, { jeton }));
  },

  async _lireJeton() {
    const t = await Store._get('jeton');
    if (!t) return null;
    try { return (await Coffre.ouvrirAvecCle(Store._cle, t)).jeton; }
    catch { return null; }    // phrase changée ailleurs : le jeton sera redemandé
  },

  async _brancherDepot() {
    const s = Store.state.sync || {};
    Store._jeton = await Store._lireJeton();
    if (s.owner && s.repo && Store._jeton) {
      Depot.configure({
        owner: s.owner, repo: s.repo, branch: s.branch || 'main',
        chemin: s.chemin || 'essor-data.json.enc', jeton: Store._jeton,
      });
      Store.mode = 'sync';
    } else {
      Depot.configure(null);
      Store.mode = 'local';
    }
  },

  // Configure (ou reconfigure) le dépôt depuis les Réglages.
  async configurerDepot({ owner, repo, branch, chemin, jeton }) {
    Store.state.sync = { owner, repo, branch: branch || 'main', chemin: chemin || 'essor-data.json.enc' };
    await Store.enregistrerJeton(jeton);
    Depot.configure({ owner, repo, branch: branch || 'main', chemin: chemin || 'essor-data.json.enc', jeton });
    Store.mode = 'sync';
    Store._shaDistant = await Depot.shaCourant();
    Store._sigBase = Store._sigEnvoyee = null;   // ce dépôt ne nous connaît pas encore
    await Store._put('sha', Store._shaDistant);
    await Store._del('sigEnvoyee');
    await Store._majIndices();
    Store.markDirty();
  },

  async oublierDepot() {
    Store.state.sync = { owner: '', repo: '', branch: 'main', chemin: 'essor-data.json.enc' };
    await Store.enregistrerJeton(null);
    Depot.configure(null);
    Store.mode = 'local';
    Store._shaDistant = null;
    Store._sigBase = Store._sigEnvoyee = null;
    await Store._del('sha');
    await Store._del('sigEnvoyee');
    await Store._majIndices();
    Store.markDirty();
  },

  /* ---------- Migration ---------- */

  // Reprise automatique des anciennes versions de données (EX-106).
  migrate(data) {
    const def = Store.defaultState();
    if (!data.schema || data.schema < Store.SCHEMA) data.schema = Store.SCHEMA;
    // Complète les clés manquantes sans écraser l'existant.
    for (const k of Object.keys(def)) if (data[k] === undefined) data[k] = def[k];
    for (const k of Object.keys(def.settings)) if (data.settings[k] === undefined) data.settings[k] = def.settings[k];
    // Natures de comptes ajoutées après coup (ex. PEA) : compléter les hypothèses (EX-106).
    for (const k of Object.keys(def.settings.returns)) if (data.settings.returns[k] === undefined) data.settings.returns[k] = def.settings.returns[k];
    for (const k of Object.keys(def.settings.vols)) if (data.settings.vols[k] === undefined) data.settings.vols[k] = def.settings.vols[k];
    for (const k of Object.keys(def.sync)) if (data.sync[k] === undefined) data.sync[k] = def.sync[k];
    return data;
  },

  /* ---------- Ce qui se synchronise, et ce qui reste ici ---------- */

  // L'écran ouvert et la période choisie appartiennent à l'appareil, pas aux
  // données : le téléphone et l'ordinateur n'ont aucune raison de regarder le
  // même mois. Les instantanés, eux, sont un cache recalculable (EX-75).
  // Les synchroniser faisait d'un simple clic d'onglet une divergence à
  // arbitrer — c'était la cause du va-et-vient incessant entre deux appareils.
  LOCAL: ['ui', 'snapshots', 'snapshotsDirty'],

  // Voyagent avec le document mais ne comptent pas dans son empreinte : elles
  // changent à chaque envoi, alors que l'empreinte doit dire « même contenu ».
  META: ['maj', 'majPar'],

  // Le document tel qu'il part dans le dépôt, hors horodatage.
  documentSync(etat) {
    const src = etat || Store.state;
    const doc = {};
    for (const k of Object.keys(src)) {
      if (!Store.LOCAL.includes(k) && !Store.META.includes(k)) doc[k] = src[k];
    }
    return doc;
  },

  // Empreinte du contenu synchronisable : deux documents de même empreinte
  // disent la même chose, quelle que soit l'heure ou l'appareil de leur envoi.
  signature(etat) { return U.hash(JSON.stringify(Store.documentSync(etat))); },

  // Le document du dernier accord avec le dépôt. C'est le troisième point de
  // repère — celui qui permet de dire « cette fiche, c'est LUI qui l'a
  // changée » plutôt que de constater bêtement deux versions différentes.
  _baseTexte: null,
  baseDoc() {
    if (!Store._baseTexte) return null;
    try { return JSON.parse(Store._baseTexte); } catch { return null; }
  },

  _sigBase: null,        // empreinte du document au dernier accord avec le dépôt
  _sigEnvoyee: null,     // empreinte du dernier envoi réussi

  // Le point d'accord avec le dépôt survit à la fermeture : sans lui, la
  // session suivante ne saurait plus distinguer « j'ai modifié » de
  // « l'autre appareil a modifié ».
  async _noterAccord(sha, sig, texte) {
    Store._shaDistant = sha;
    Store._sigBase = Store._sigEnvoyee = sig;
    Store._baseTexte = texte || JSON.stringify(Store.documentSync());
    await Store._put('sha', sha);
    await Store._put('sigEnvoyee', sig);
    await Store._put('base', Store._baseTexte);
  },

  /* ---------- Identité de l'appareil ---------- */

  _appareil: null,

  async idAppareil() {
    if (Store._appareil) return Store._appareil;
    let a = await Store._get('appareil');
    if (!a) {
      a = { id: U.uid(), nom: Store._nomAppareil() };
      await Store._put('appareil', a);
    }
    Store._appareil = a;
    return a;
  },

  _nomAppareil() {
    const ua = navigator.userAgent;
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac OS X/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'cet appareil';
  },

  /* ---------- Enregistrement ---------- */

  markDirty() {
    Store.saveStatus = 'dirty';
    Store._notify();
    Store._debouncedSave();
  },

  _debouncedSave: null, // initialisé plus bas

  async save() {
    if (!Store.state || !Store._cle) return;
    Store._saveChain = Store._saveChain.then(() => Store._doSave()).catch(() => {});
    return Store._saveChain;
  },

  async _doSave() {
    Store.saveStatus = 'saving';
    Store._notify();
    // L'appareil d'abord, TOUJOURS — y compris pendant un conflit. Le conflit
    // ne porte que sur le dépôt ; refuser d'écrire en local laisserait le
    // travail en cours dans la seule mémoire vive, qu'un rechargement efface.
    try {
      await Store._ecrireLocal();
    } catch (e) {
      console.error('Échec de l\'enregistrement local', e);
      Store.saveStatus = 'error';
      Store._notify();
      return;
    }
    if (!Depot.actif()) { Store.saveStatus = 'saved'; Store._notify(); return; }
    if (Store.conflit) {
      // Le dépôt attend un arbitrage. On ne pousse pas — mais on le dit, et on
      // remet la question à l'écran plutôt que de rester figé sans rien faire.
      Store.saveStatus = 'conflit';
      Store._notify();
      if (Store.onConflict) Store.onConflict();
      return;
    }
    await Store._pousser();
  },

  async _ecrireLocal() {
    const enveloppe = await Coffre.sceller(Store._cle, Store._sel, Store.state);
    await Store._put('coffre', enveloppe);
    Store._derniereEnveloppe = enveloppe;
  },

  _derniereEnveloppe: null,
  _raisonAttente: null,

  async _pousser({ forcer = false, message, reessai = false } = {}) {
    try {
      const sig = Store.signature();
      // Rien de neuf à dire au dépôt : on ne l'encombre pas d'une révision
      // identique, qui ne ferait qu'invalider le repère de l'autre appareil.
      if (!forcer && sig === Store._sigEnvoyee && Store._shaDistant) {
        Store._enAttente = false;
        Store.saveStatus = 'saved';
        Store._notify();
        return;
      }
      const appareil = await Store.idAppareil();
      const doc = Store.documentSync();
      doc.maj = new Date().toISOString();          // l'heure exacte de CETTE modification
      doc.majPar = { id: appareil.id, nom: appareil.nom };
      const env = await Coffre.sceller(Store._cle, Store._sel, doc);
      const sha = forcer ? await Depot.shaCourant() : Store._shaDistant;
      const r = await Depot.ecrire(env, sha,
        message || `Essor — ${appareil.nom} — ${doc.maj.slice(0, 16).replace('T', ' ')}`);
      // Un dépôt qui n'annonce pas la nouvelle version nous laisserait sans
      // repère, et le prochain envoi passerait pour un conflit : on va la
      // chercher plutôt que de retenir « rien ».
      await Store._noterAccord(r.sha || await Depot.shaCourant(), sig);
      Store.state.maj = doc.maj;
      Store.state.majPar = doc.majPar;
      Store._enAttente = false;
      Store.conflit = false;
      Store.saveStatus = 'saved';
    } catch (e) {
      if (e.code === 'CONFLIT' && !reessai) return Store._arbitrer(message);
      if (e.code === 'CONFLIT') {
        Store.conflit = true;
        Store.saveStatus = 'conflit';
        Store._notify();
        if (Store.onConflict) Store.onConflict();
        return;
      }
      // Hors ligne ou jeton refusé : les données SONT enregistrées sur
      // l'appareil, seule la synchronisation attend (P7 : le dire).
      Store._enAttente = true;
      Store.saveStatus = 'local';
      Store._raisonAttente = e.code === 'JETON_REFUSE'
        ? 'Le jeton d\'accès a été refusé par GitHub.'
        : 'Pas de connexion au dépôt.';
    }
    Store._notify();
  },

  /* ---------- Arbitrage ---------- */

  // Le dépôt a refusé l'envoi : sa version n'est plus celle qu'on croyait.
  // Trois situations très différentes se cachent derrière ce même refus, et
  // une seule mérite qu'on dérange l'utilisateur.
  async _arbitrer(message) {
    let distant;
    try { distant = await Depot.lire(); }
    catch {
      Store._enAttente = true;
      Store.saveStatus = 'local';
      Store._raisonAttente = 'Pas de connexion au dépôt.';
      Store._notify();
      return;
    }
    if (!distant) return Store._pousser({ forcer: true, message, reessai: true });

    const docDistant = await Coffre.ouvrirAvecCle(Store._cle, distant.texte);
    const sigDistant = Store.signature(docDistant);
    const sigLocal = Store.signature();

    // 1. Le dépôt dit exactement ce que nous disons — ou exactement ce sur quoi
    //    nous nous appuyions. Rien n'a divergé : seul le numéro de version
    //    manquait. On le reprend, sans un mot.
    if (sigDistant === sigLocal) {
      await Store._accorder(distant, docDistant);
      return;
    }
    if (Store._sigBase && sigDistant === Store._sigBase) {
      Store._shaDistant = distant.sha;
      await Store._put('sha', distant.sha);
      return Store._pousser({ message, reessai: true });
    }

    // 2. Nous n'avons rien changé depuis notre dernier accord : l'autre
    //    appareil est simplement en avance. On le suit — c'est une mise à
    //    jour, pas un conflit.
    if (Store._sigBase && sigLocal === Store._sigBase) {
      await Store._adopter(distant, docDistant);
      if (Store.onFastForward) Store.onFastForward(docDistant);
      return;
    }

    // 3. Les deux côtés ont changé. Ce n'est presque jamais une contradiction :
    //    l'un a importé un relevé, l'autre a classé des opérations. Poser la
    //    question à chaque fois était intenable — et trompeur, puisque « garder
    //    la mienne » jetait le travail de l'autre appareil.
    //    On réunit donc les deux, fiche par fiche, en s'appuyant sur le
    //    document du dernier accord : ce qui n'a changé que d'un côté vient de
    //    ce côté-là ; ce qui a changé des deux revient au plus récent.
    const base = Store.baseDoc();
    // Notre document, horodatage compris, et la préférence qui va avec : ce
    // que l'on vient de modifier prime sur ce que le dépôt portait déjà.
    const docLocal = Store.documentSync();
    docLocal.maj = Store.state.maj;
    docLocal.majPar = Store.state.majPar;
    const fusion = Store.fusion3(base, docLocal, docDistant, { prefere: 'local' });
    await Store._sauvegardeLocale('avant-fusion-automatique');
    const avant = Store._derniereEnveloppe;
    const local = { ui: Store.state.ui, snapshots: Store.state.snapshots };
    Store.state = Store.migrate(fusion.doc);
    Store.state.ui = local.ui;
    Store.state.snapshots = local.snapshots || {};
    Store.state.snapshotsDirty = true;
    Store.state.maj = docDistant.maj;
    Store.state.majPar = docDistant.majPar;
    Store.conflit = false;
    Store.conflitInfo = null;
    Store._shaDistant = distant.sha;
    await Store._ecrireLocal();
    await Store._pousser({ forcer: true, message: 'Essor — fusion automatique', reessai: true });
    if (Store.onFusionAuto) {
      Store.onFusionAuto({
        par: docDistant.majPar || null,
        contestes: fusion.contestes,
        sansBase: !base,
        annuler: avant,          // l'enveloppe d'avant fusion, pour revenir en arrière
      });
    }
  },

  // Revenir à l'état d'avant une fusion automatique.
  async annulerFusion(enveloppe) {
    if (!enveloppe) throw new Error('Rien à annuler.');
    const local = { ui: Store.state.ui, snapshots: Store.state.snapshots };
    Store.state = Store.migrate(await Coffre.ouvrirAvecCle(Store._cle, enveloppe));
    Store.state.ui = local.ui;
    Store.state.snapshots = local.snapshots || {};
    Store.state.snapshotsDirty = true;
    await Store._ecrireLocal();
    await Store._pousser({ forcer: true, message: 'Essor — fusion annulée', reessai: true });
  },

  /* ---------- Fusion à trois points ---------- */

  // base = document du dernier accord, local = le nôtre, distant = celui du
  // dépôt. → {doc, contestes:[clés réellement modifiées des deux côtés]}
  // Sans base, on se rabat sur une réunion simple, le plus récent l'emportant.
  // `prefere` tranche les fiches modifiées des deux côtés. Lors d'un envoi,
  // c'est 'local' : la modification qu'on est en train de faire est, par
  // construction, la plus récente — et c'est celle que l'utilisateur veut
  // garder. À défaut de préférence, l'horodatage des documents décide.
  fusion3(base, local, distant, { prefere } = {}) {
    const contestes = [];
    const doc = {};
    const plusRecent = prefere || ((distant.maj || '') > (local.maj || '') ? 'distant' : 'local');
    const cles = new Set([...Object.keys(local), ...Object.keys(distant)]);
    for (const k of cles) {
      if (Store.META.includes(k) || Store.LOCAL.includes(k)) continue;
      const l = local[k], d = distant[k];
      const sl = JSON.stringify(l), sd = JSON.stringify(d);
      if (sl === sd) { doc[k] = l; continue; }
      if (base) {
        const sb = JSON.stringify(base[k]);
        if (sb === sl) { doc[k] = d; continue; }   // seul le dépôt a bougé
        if (sb === sd) { doc[k] = l; continue; }   // seul nous
      }
      // Les deux ont bougé : on descend d'un cran.
      if (Array.isArray(l) && Array.isArray(d) && Store._listeIdentifiee(l, d)) {
        const r = Store._fusionListe(base ? base[k] : null, l, d, plusRecent === 'distant');
        doc[k] = r.liste;
        for (const id of r.contestes) contestes.push(`${k}:${id}`);
      } else if (l && d && typeof l === 'object' && typeof d === 'object' && !Array.isArray(l) && !Array.isArray(d)) {
        // Dictionnaires (cours, métadonnées, mémoire d'import) : réunion clé à clé.
        doc[k] = plusRecent === 'distant' ? Object.assign({}, l, d) : Object.assign({}, d, l);
      } else {
        doc[k] = plusRecent === 'distant' ? d : l;
        contestes.push(k);
      }
    }
    // Deux imports du même relevé, un par appareil, créent deux jeux
    // d'identifiants pour les mêmes opérations : la règle du relevé
    // s'applique aussi ici (EX-27).
    if (Array.isArray(doc.transactions)) {
      doc.transactions = Store._plafonnerDoublons(doc.transactions, local.transactions || [], distant.transactions || []);
    }
    return { doc, contestes };
  },

  _listeIdentifiee(a, b) {
    const x = (a && a[0]) || (b && b[0]);
    return !!x && typeof x === 'object' && x.id !== undefined;
  },

  _fusionListe(base, local, distant, distantGagne) {
    const parId = (a) => { const m = new Map(); for (const x of (a || [])) m.set(x.id, x); return m; };
    const mb = parId(base), ml = parId(local), md = parId(distant);
    const contestes = [], liste = [];
    for (const id of new Set([...ml.keys(), ...md.keys()])) {
      const b = mb.get(id), l = ml.get(id), d = md.get(id);
      const sb = b === undefined ? null : JSON.stringify(b);
      if (l && !d) {
        // Absent du dépôt : supprimé là-bas si nous ne l'avons pas touché,
        // sinon c'est notre modification qui l'emporte sur une suppression.
        if (base && sb !== null && sb === JSON.stringify(l)) continue;
        liste.push(l); continue;
      }
      if (!l && d) {
        if (base && sb !== null && sb === JSON.stringify(d)) continue;   // supprimé ici
        liste.push(d); continue;
      }
      const sl = JSON.stringify(l), sd = JSON.stringify(d);
      if (sl === sd) { liste.push(l); continue; }
      if (base && sb !== null) {
        if (sb === sl) { liste.push(d); continue; }
        if (sb === sd) { liste.push(l); continue; }
      }
      liste.push(distantGagne ? d : l);
      contestes.push(id);
    }
    return { liste, contestes };
  },

  // Pour une même empreinte, le nombre d'occurrences retenu est le plus grand
  // des deux côtés — jamais leur somme.
  _plafonnerDoublons(fusion, local, distant) {
    const cle = (t) => `${t.accountId}|${t.hash}`;
    const compter = (l) => { const m = new Map(); for (const t of l) m.set(cle(t), (m.get(cle(t)) || 0) + 1); return m; };
    const cl = compter(local), cd = compter(distant);
    const vus = new Map(), out = [];
    for (const t of fusion) {
      const k = cle(t);
      const max = Math.max(cl.get(k) || 0, cd.get(k) || 0);
      const n = vus.get(k) || 0;
      if (n >= max) continue;
      vus.set(k, n + 1);
      out.push(t);
    }
    return out;
  },

  onFusionAuto: null,
  conflitInfo: null,
  onFastForward: null,

  // Le dépôt et nous disons la même chose : on s'aligne sur son numéro.
  async _accorder(distant, docDistant) {
    Store.state.maj = docDistant.maj || Store.state.maj;
    Store.state.majPar = docDistant.majPar || Store.state.majPar;
    await Store._noterAccord(distant.sha, Store.signature());
    Store.conflit = false;
    Store._enAttente = false;
    Store.saveStatus = 'saved';
    Store._notify();
  },

  // Adopte le document du dépôt, en gardant ce qui appartient à cet appareil
  // (l'écran ouvert, la période, le cache d'instantanés).
  async _adopter(distant, docDistant) {
    const local = { ui: Store.state.ui, snapshots: Store.state.snapshots };
    Store.state = Store.migrate(docDistant);
    Store.state.ui = local.ui;
    Store.state.snapshots = local.snapshots || {};
    Store.state.snapshotsDirty = true;
    await Store._ecrireLocal();
    await Store._noterAccord(distant.sha, Store.signature());
    Store.conflit = false;
    Store.conflitInfo = null;
    Store._enAttente = false;
    Store.saveStatus = 'saved';
    Store._notify();
  },

  // Rattrape une synchronisation en attente (retour du réseau, bouton manuel).
  async synchroniser() {
    if (!Depot.actif() || !Store.state) return;
    await Store.save();
  },

  /* ---------- Relecture du dépôt (arrivée d'un autre appareil) ---------- */

  // Interrogation légère : un seul appel, qui ne rapporte que le numéro de
  // version. C'est elle qu'on répète en tâche de fond — jamais le contenu.
  async aDuNeuf() {
    if (!Depot.actif() || !Store.state) return false;
    try {
      const sha = await Depot.shaCourant();
      return !!sha && sha !== Store._shaDistant;
    } catch { return false; }
  },

  // → 'a-jour' | 'repris' | 'conflit' | 'indisponible'
  async rafraichir() {
    if (!Depot.actif() || !Store.state) return 'indisponible';
    if (Store.conflit) return 'conflit';
    let distant;
    try { distant = await Depot.lire(); }
    catch { return 'indisponible'; }
    if (!distant) {
      // Le dépôt est vide : c'est à nous de l'amorcer.
      if (Store.signature() !== Store._sigEnvoyee) await Store.save();
      return 'a-jour';
    }
    const aEcrire = Store.signature() !== Store._sigEnvoyee || Store._enAttente;
    if (distant.sha === Store._shaDistant) {
      if (aEcrire) await Store.save();
      return 'a-jour';
    }
    const docDistant = await Coffre.ouvrirAvecCle(Store._cle, distant.texte);
    const sigDistant = Store.signature(docDistant);
    if (sigDistant === Store.signature()) { await Store._accorder(distant, docDistant); return 'a-jour'; }
    // Rien de local en attente : on suit le dépôt, sans rien demander.
    if (!aEcrire || sigDistant === Store._sigBase || Store.signature() === Store._sigBase) {
      if (sigDistant === Store._sigBase) { await Store.save(); return 'a-jour'; }
      await Store._adopter(distant, docDistant);
      return 'repris';
    }
    // Les deux côtés ont bougé : l'envoi passera par la fusion, exactement
    // comme lorsque le dépôt refuse une écriture. Une seule voie, un seul
    // comportement.
    await Store.save();
    return Store.conflit ? 'conflit' : 'fusionne';
  },

  /* ---------- Résolution d'une divergence réelle ---------- */

  // Ce qui sépare les deux versions, en clair et en chiffres : sans cela,
  // « garder ma session » ou « reprendre l'autre » se choisit à l'aveugle.
  comparer(docDistant) {
    const COLLECTIONS = ['transactions', 'accounts', 'certifications', 'trades',
      'positionSnapshots', 'goals', 'credits', 'rules'];
    const out = { collections: [], reglages: false };
    for (const k of COLLECTIONS) {
      const ici = new Set((Store.state[k] || []).map(x => x.id));
      const la = new Set((docDistant[k] || []).map(x => x.id));
      const seulIci = [...ici].filter(id => !la.has(id)).length;
      const seulLa = [...la].filter(id => !ici.has(id)).length;
      if (seulIci || seulLa) out.collections.push({ nom: k, ici: seulIci, la: seulLa });
    }
    out.reglages = JSON.stringify(Store.state.settings) !== JSON.stringify(docDistant.settings) ||
      JSON.stringify(Store.state.budget) !== JSON.stringify(docDistant.budget) ||
      JSON.stringify(Store.state.targets) !== JSON.stringify(docDistant.targets);
    return out;
  },

  // Réunit les deux versions : tout ce qui existe d'un côté ou de l'autre est
  // gardé, et ce qui a été modifié des deux côtés revient à la version la plus
  // récente. C'est le bon geste quand les appareils ont travaillé sur des
  // choses différentes — importer ici, catégoriser là.
  async fusionner() {
    if (!Store.conflitInfo) throw new Error('Aucune divergence à fusionner.');
    const distant = Store.conflitInfo.distant;
    await Store._sauvegardeLocale('avant-fusion');
    const docLocal = Store.documentSync();
    docLocal.maj = Store.state.maj;
    const fusion = Store.fusion3(Store.baseDoc(), docLocal, distant.doc, { prefere: 'local' });
    const local = { ui: Store.state.ui, snapshots: Store.state.snapshots };
    Store.state = Store.migrate(fusion.doc);
    Store.state.ui = local.ui;
    Store.state.snapshots = local.snapshots || {};
    Store.state.snapshotsDirty = true;
    Store._shaDistant = distant.sha;
    Store.conflit = false;
    Store.conflitInfo = null;
    await Store._ecrireLocal();
    await Store._pousser({ forcer: true, message: 'Essor — fusion des deux appareils', reessai: true });
  },

  // Reprend la règle de dédoublonnage de l'import (EX-27) : deux relevés
  // identiques importés de part et d'autre ne doivent pas doubler les lignes,
  // mais deux cafés réellement payés le même jour doivent rester deux.
  _dedoublonner(a, b) {
    const cle = (t) => `${t.accountId}|${t.hash || U.hash(`${t.date}|${t.amount}|${U.normLabel(t.label || '')}`)}`;
    const compte = (liste) => {
      const m = new Map();
      for (const t of liste) m.set(cle(t), (m.get(cle(t)) || 0) + 1);
      return m;
    };
    const ca = compte(a), cb = compte(b);
    const plafond = new Map();
    for (const k of new Set([...ca.keys(), ...cb.keys()])) plafond.set(k, Math.max(ca.get(k) || 0, cb.get(k) || 0));
    const vus = new Map(), out = [], ids = new Set();
    for (const t of [...b, ...a]) {           // le côté récent d'abord
      if (ids.has(t.id)) continue;
      const k = cle(t);
      const n = vus.get(k) || 0;
      if (n >= (plafond.get(k) || 0)) continue;
      vus.set(k, n + 1);
      ids.add(t.id);
      out.push(t);
    }
    return out;
  },

  // Écrase la version du dépôt, après l'avoir mise à l'abri dans backups/.
  async imposerMaVersion() {
    try {
      const distant = await Depot.lire();
      if (distant) await Depot.deposerSauvegarde(`essor-conflit-${Store._horodatage()}-version-ecartee.json.enc`, distant.texte);
    } catch { /* rien à sauvegarder */ }
    Store.conflit = false;
    Store.conflitInfo = null;
    Store._sigBase = null;
    await Store._pousser({ forcer: true, message: 'Essor — version de cet appareil imposée', reessai: true });
  },

  // Reprend la version de l'autre appareil, en abandonnant la sienne.
  async reprendreLautreVersion() {
    try {
      await Store._sauvegardeLocale('conflit-version-locale-ecartee');
      const distant = await Depot.lire();
      if (!distant) throw new Error('Le dépôt ne contient aucun fichier.');
      const docDistant = await Coffre.ouvrirAvecCle(Store._cle, distant.texte);
      await Store._adopter(distant, docDistant);
    } catch (e) {
      Store.saveStatus = 'conflit';   // le conflit tient toujours : le dire
      Store._notify();
      throw e;
    }
  },

  /* ---------- Sauvegardes (EX-95, EX-96) ---------- */

  _horodatage() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  },

  // Sauvegarde complète horodatée avant toute action destructrice (EX-95).
  // Toujours écrite sur l'appareil ; poussée dans le dépôt si le réseau suit.
  // Le dépôt n'est jamais purgé par l'application (EX-96) ; l'appareil, lui,
  // ne garde que les 12 dernières — la mémoire du navigateur n'est pas infinie.
  async backup(reason) {
    if (!Store.state || !Store._cle) throw new Error('Aucune donnée à sauvegarder.');
    const nom = await Store._sauvegardeLocale(reason || 'manuel');
    if (Depot.actif()) {
      try { await Depot.deposerSauvegarde(nom, Store._derniereEnveloppe); }
      catch { /* hors ligne : la copie locale suffit */ }
    }
    return nom;
  },

  async _sauvegardeLocale(reason) {
    const enveloppe = await Coffre.sceller(Store._cle, Store._sel, Store.state);
    Store._derniereEnveloppe = enveloppe;
    const nom = `essor-backup-${Store._horodatage()}-${(reason || 'manuel').replace(/[^a-z0-9-]/gi, '-').slice(0, 30)}.json.enc`;
    const liste = (await Store._get('backups')) || [];
    liste.unshift({ nom, texte: enveloppe, date: new Date().toISOString() });
    await Store._put('backups', liste.slice(0, 12));
    return nom;
  },

  async listerSauvegardesLocales() {
    return ((await Store._get('backups')) || []).map(b => ({ nom: b.nom, date: b.date, taille: b.texte.length }));
  },

  async restaurerSauvegardeLocale(nom) {
    const liste = (await Store._get('backups')) || [];
    const b = liste.find(x => x.nom === nom);
    if (!b) throw new Error('Sauvegarde introuvable.');
    await Store._sauvegardeLocale('avant-restauration');
    Store.state = Store.migrate(await Coffre.ouvrirAvecCle(Store._cle, b.texte));
    Store.state.snapshotsDirty = true;
    Store.markDirty();
  },

  /* ---------- Export / import de fichier ---------- */

  // Copie EN CLAIR, pour archivage hors application (EX-97). Le fichier obtenu
  // n'est pas chiffré : c'est dit à l'écran avant le téléchargement.
  exportDownload() {
    const blob = new Blob([JSON.stringify(Store.state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = Store.fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // Copie chiffrée, illisible sans la phrase — celle qu'on peut poser n'importe où.
  async exportChiffre() {
    const env = await Coffre.sceller(Store._cle, Store._sel, Store.state);
    const blob = new Blob([env], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `essor-${Store._horodatage()}.json.enc`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },

  // Reprend un fichier : JSON en clair (version locale d'Essor) ou enveloppe
  // chiffrée. → l'objet d'état, sans l'installer.
  async lireFichier(texte, phrase) {
    if (Coffre.estEnveloppe(texte)) {
      const { donnees } = await Coffre.ouvrir(phrase, texte);
      return donnees;
    }
    let data;
    try { data = JSON.parse(texte); }
    catch { throw new Error('Fichier illisible : ce n\'est ni du JSON Essor, ni une enveloppe chiffrée.'); }
    if (!data || typeof data !== 'object' || !('accounts' in data || 'transactions' in data)) {
      throw new Error('Ce fichier ne ressemble pas à des données Essor.');
    }
    return data;
  },

  async remplacerPar(donnees) {
    await Store._sauvegardeLocale('avant-import');
    Store.state = Store.migrate(donnees);
    Store.state.snapshotsDirty = true;
    Store.markDirty();
  },

  /* ---------- Effacement de l'appareil ---------- */

  async effacerAppareil() {
    await Store._reinitialiserAppareil();
    Store._cle = null; Store.state = null; Store.mode = 'boot';
  },

  // Tout ce qui est scellé avec l'ancienne clé — coffre, jeton, sauvegardes —
  // deviendrait illisible sous une nouvelle : on ne le garde pas.
  async _reinitialiserAppareil() {
    for (const k of ['coffre', 'jeton', 'sha', 'sigEnvoyee', 'base', 'backups', 'indices', 'bio', 'cleSession']) await Store._del(k);
    Store._jeton = null; Store._derniereEnveloppe = null;
    Store._enAttente = false; Store.conflit = false;
  },

  _notify() { if (Store.onStatus) Store.onStatus(Store.saveStatus, Store.mode); },
};

// Enregistrement automatique : l'utilisateur n'y pense jamais (EX-90).
Store._debouncedSave = U.debounce(() => Store.save(), 600);

// Une modification suivie d'une fermeture immédiate ne doit rien perdre (EX-91).
// Sur téléphone, « pagehide » est souvent le seul événement reçu.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && Store.saveStatus !== 'saved') Store.save();
});
window.addEventListener('pagehide', () => { if (Store.saveStatus !== 'saved') Store.save(); });
window.addEventListener('beforeunload', (e) => {
  if (Store.saveStatus === 'dirty' || Store.saveStatus === 'saving') {
    Store.save();
    e.preventDefault();
    e.returnValue = '';
  }
});
// Retour du réseau : on rattrape ce qui attendait.
window.addEventListener('online', () => { if (Store._enAttente) Store.synchroniser(); });
