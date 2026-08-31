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
    Store._shaDistant = distant.sha;
    await Store._ecrireLocal();
    await Store._put('sha', distant.sha);
    await Store.enregistrerJeton(cfgDepot.jeton);
    await Store._majIndices();
    Store.mode = 'sync';
  },

  verrouiller() {
    Store._cle = null;
    Store.state = null;
    Store.mode = 'boot';
    Depot.configure(null);
    if (Store.onLock) Store.onLock();
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
    await Store._majIndices();
    Store.markDirty();
  },

  async oublierDepot() {
    Store.state.sync = { owner: '', repo: '', branch: 'main', chemin: 'essor-data.json.enc' };
    await Store.enregistrerJeton(null);
    Depot.configure(null);
    Store.mode = 'local';
    Store._shaDistant = null;
    await Store._del('sha');
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
    if (Store.conflit) return;            // tant que le conflit n'est pas tranché
    Store.saveStatus = 'saving';
    Store._notify();
    try {
      await Store._ecrireLocal();         // l'appareil d'abord : rien ne se perd hors ligne
    } catch (e) {
      console.error('Échec de l\'enregistrement local', e);
      Store.saveStatus = 'error';
      Store._notify();
      return;
    }
    if (!Depot.actif()) { Store.saveStatus = 'saved'; Store._notify(); return; }
    await Store._pousser();
  },

  async _ecrireLocal() {
    const enveloppe = await Coffre.sceller(Store._cle, Store._sel, Store.state);
    await Store._put('coffre', enveloppe);
    Store._derniereEnveloppe = enveloppe;
  },

  _derniereEnveloppe: null,
  _raisonAttente: null,

  async _pousser({ forcer = false, message } = {}) {
    try {
      const env = Store._derniereEnveloppe || await Coffre.sceller(Store._cle, Store._sel, Store.state);
      const sha = forcer ? await Depot.shaCourant() : Store._shaDistant;
      const r = await Depot.ecrire(env, sha, message || `Essor — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
      Store._shaDistant = r.sha;
      await Store._put('sha', r.sha);
      Store._enAttente = false;
      Store.conflit = false;
      Store.saveStatus = 'saved';
    } catch (e) {
      if (e.code === 'CONFLIT') {
        Store.conflit = true;
        Store.saveStatus = 'error';
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

  // Rattrape une synchronisation en attente (retour du réseau, bouton manuel).
  async synchroniser() {
    if (!Depot.actif() || !Store.state) return;
    await Store.save();
  },

  /* ---------- Relecture du dépôt (arrivée d'un autre appareil) ---------- */

  // Le dépôt a-t-il bougé depuis la dernière écriture de cette session ?
  // → 'a-jour' | 'repris' (état distant adopté) | 'conflit' | 'indisponible'
  async rafraichir() {
    if (!Depot.actif() || !Store.state) return 'indisponible';
    // Ce qui attend d'être écrit part d'abord : c'est le dépôt qui arbitre, par
    // le sha. Sans cela, une modification non encore poussée passerait pour un
    // conflit alors qu'elle n'a même pas été proposée.
    if (Store.saveStatus === 'dirty' || Store._enAttente) {
      await Store.save();
      if (Store.conflit) return 'conflit';
      if (Store._enAttente) return 'indisponible';   // toujours sans réseau
    }
    let distant;
    try { distant = await Depot.lire(); }
    catch { return 'indisponible'; }
    if (!distant) return 'a-jour';
    if (distant.sha === Store._shaDistant) return 'a-jour';
    const donnees = await Coffre.ouvrirAvecCle(Store._cle, distant.texte);
    Store.state = Store.migrate(donnees);
    Store.state.snapshotsDirty = true;
    Store._shaDistant = distant.sha;
    await Store._ecrireLocal();
    await Store._put('sha', distant.sha);
    Store.saveStatus = 'saved';
    Store._notify();
    return 'repris';
  },

  // Écrase la version du dépôt, après l'avoir mise à l'abri dans backups/.
  async imposerMaVersion() {
    try {
      const distant = await Depot.lire();
      if (distant) await Depot.deposerSauvegarde(`essor-conflit-${Store._horodatage()}-version-ecartee.json.enc`, distant.texte);
    } catch { /* rien à sauvegarder */ }
    Store.conflit = false;
    await Store._pousser({ forcer: true, message: 'Essor — version de cet appareil imposée' });
  },

  // Reprend la version de l'autre appareil, en abandonnant la sienne.
  async reprendreLautreVersion() {
    try {
      await Store._sauvegardeLocale('conflit-version-locale-ecartee');
      const distant = await Depot.lire();
      if (!distant) throw new Error('Le dépôt ne contient aucun fichier.');
      const donnees = await Coffre.ouvrirAvecCle(Store._cle, distant.texte);
      Store.state = Store.migrate(donnees);
      Store.state.snapshotsDirty = true;
      Store._shaDistant = distant.sha;
      await Store._ecrireLocal();
      await Store._put('sha', distant.sha);
      Store.conflit = false;
      Store.saveStatus = 'saved';
    } catch (e) {
      Store.saveStatus = 'error';
      throw e;
    } finally { Store._notify(); }
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
    for (const k of ['coffre', 'jeton', 'sha', 'backups', 'indices']) await Store._del(k);
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
