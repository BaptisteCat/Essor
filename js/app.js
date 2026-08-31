/* Essor — démarrage, verrou et navigation entre les espaces (EX-78).

   Le site est public (GitHub Pages ne sait pas faire autrement sur un compte
   ordinaire) ; les données, elles, ne le sont jamais : rien n'est lisible sans
   la phrase de passe, qui n'est ni stockée ni transmise — elle ne sert qu'à
   dériver la clé, en mémoire vive, le temps de la session. */
'use strict';

const App = {

  screens: {
    patrimoine: { label: 'Patrimoine', ico: '◆', render: () => ScreenPatrimoine.render(), period: false }, // EX-81
    mois:       { label: 'Suivi du mois', ico: '▤', render: () => ScreenMois.render(), period: true },
    budget:     { label: 'Budget prévisionnel', ico: '▦', render: () => ScreenBudget.render(), period: true },
    operations: { label: 'Opérations', ico: '⇄', render: () => ScreenOperations.render(), period: true },
    reglages:   { label: 'Réglages', ico: '⚙', render: () => ScreenReglages.render(), period: false },
  },

  // Étiquettes courtes pour la barre du bas, sur téléphone.
  court: { patrimoine: 'Patrimoine', mois: 'Mois', budget: 'Budget', operations: 'Opérations', reglages: 'Réglages' },

  current: 'patrimoine',

  async boot() {
    Store.onStatus = UI.renderSaveStatus;
    // Deux appareils peuvent avoir enregistré chacun de leur côté. On ne
    // tranche jamais à leur place, et on n'écrase rien tant que l'utilisateur
    // n'a pas choisi (P1).
    Store.onConflict = () => App.conflitModal();
    Store.onLock = () => App.ecranDeverrouillage('Session verrouillée.');

    let status;
    try { status = await Store.init(); }
    catch (e) { App.bootErreur(e.message); return; }

    if (status === 'verrouille') App.ecranDeverrouillage();
    else App.ecranPremierUsage();
  },

  bootErreur(msg) {
    document.getElementById('app').style.display = 'none';
    const b = document.getElementById('boot');
    b.style.display = 'flex';
    b.innerHTML = `<div class="boot-carte"><div class="brand">Essor<small>PRÉVISION &amp; PATRIMOINE</small></div>
      <p class="notice warn">${U.escapeHtml(msg)}</p></div>`;
  },

  /* ---------- Écran de déverrouillage ---------- */

  async ecranDeverrouillage(message) {
    document.getElementById('app').style.display = 'none';
    const b = document.getElementById('boot');
    b.style.display = 'flex';
    const ind = await Store.indices();
    const depot = ind && ind.depot ? `${ind.depot.owner}/${ind.depot.repo}` : null;
    b.innerHTML = `<div class="boot-carte">
      <div class="brand">Essor<small>PRÉVISION &amp; PATRIMOINE</small></div>
      ${message ? `<p class="notice">${U.escapeHtml(message)}</p>` : ''}
      <p>Vos données sont chiffrées sur cet appareil. Saisissez la phrase de passe
      pour les ouvrir.</p>
      <form id="frm-open" autocomplete="on">
        <input type="text" name="username" value="essor" autocomplete="username" hidden>
        <input type="password" id="ph" placeholder="Phrase de passe" autocomplete="current-password"
               autocapitalize="off" autocorrect="off" spellcheck="false" required>
        <div class="erreur" id="err-open"></div>
        <button class="primary" type="submit">Ouvrir</button>
      </form>
      ${depot ? `<p class="hint">Dépôt de synchronisation : <b>${U.escapeHtml(depot)}</b></p>` : ''}
      <p class="hint"><button class="lien" id="autre-appareil">Utiliser un autre coffre sur cet appareil…</button></p>
    </div>`;
    const err = document.getElementById('err-open');
    document.getElementById('frm-open').onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      const bouton = e.target.querySelector('button[type=submit]');
      await UI.busy(bouton, async () => {
        try {
          await Store.deverrouiller(document.getElementById('ph').value);
        } catch (ex) {
          err.textContent = ex.message === 'PHRASE_INVALIDE'
            ? 'Phrase de passe incorrecte.' : ex.message;
          return;
        }
        App.demarrer();
        App.rattraperDepot();
      });
    };
    document.getElementById('autre-appareil').onclick = () => App.ecranPremierUsage(true);
    setTimeout(() => { const i = document.getElementById('ph'); if (i) i.focus(); }, 60);
  },

  /* ---------- Premier usage : créer, rejoindre, reprendre ---------- */

  ecranPremierUsage(coffreExistant) {
    document.getElementById('app').style.display = 'none';
    const b = document.getElementById('boot');
    b.style.display = 'flex';
    b.innerHTML = `<div class="boot-carte large">
      <div class="brand">Essor<small>PRÉVISION &amp; PATRIMOINE</small></div>
      <p>Cet appareil ne connaît pas encore vos données.
      ${coffreExistant ? '<b>Attention : un coffre existe déjà ici et sera remplacé.</b>' : ''}</p>
      <div class="choix">
        <button class="carte-choix" data-c="creer"><b>Commencer à neuf</b>
          <span>Créer une phrase de passe et partir d'une application vide.</span></button>
        <button class="carte-choix" data-c="rejoindre"><b>Rejoindre mes données</b>
          <span>Cet appareil s'ajoute aux autres : les données viennent du dépôt GitHub privé.</span></button>
        <button class="carte-choix" data-c="fichier"><b>Reprendre un fichier</b>
          <span>Importer un <code>essor-data.json</code> (version locale) ou une sauvegarde chiffrée.</span></button>
      </div>
      <div id="boot-form"></div>
    </div>`;
    b.querySelectorAll('[data-c]').forEach(x => x.onclick = () => {
      b.querySelectorAll('[data-c]').forEach(y => y.classList.toggle('actif', y === x));
      App[{ creer: 'formCreer', rejoindre: 'formRejoindre', fichier: 'formFichier' }[x.dataset.c]]();
    });
  },

  // Bloc de saisie du dépôt, commun à « rejoindre » et aux Réglages.
  champsDepot(pre = {}) {
    return `<div class="grille2">
      <label>Propriétaire GitHub<input id="d-owner" placeholder="mon-compte" value="${U.escapeHtml(pre.owner || '')}"
        autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label>Dépôt de données (privé)<input id="d-repo" placeholder="essor-data" value="${U.escapeHtml(pre.repo || '')}"
        autocapitalize="off" autocorrect="off" spellcheck="false"></label>
      <label>Branche<input id="d-branch" placeholder="main" value="${U.escapeHtml(pre.branch || 'main')}"></label>
      <label>Fichier<input id="d-chemin" placeholder="essor-data.json.enc" value="${U.escapeHtml(pre.chemin || 'essor-data.json.enc')}"></label>
    </div>
    <label>Jeton d'accès personnel (fine-grained, droit « Contents : read and write » sur ce dépôt)
      <input type="password" id="d-jeton" placeholder="github_pat_…" autocomplete="off"
        autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <div class="hint">Le jeton reste sur cet appareil, chiffré avec votre phrase de passe.
    Il n'est jamais écrit dans le dépôt ni transmis ailleurs qu'à api.github.com.</div>`;
  },

  lireChampsDepot() {
    return {
      owner: document.getElementById('d-owner').value.trim(),
      repo: document.getElementById('d-repo').value.trim(),
      branch: document.getElementById('d-branch').value.trim() || 'main',
      chemin: document.getElementById('d-chemin').value.trim() || 'essor-data.json.enc',
      jeton: document.getElementById('d-jeton').value.trim(),
    };
  },

  formCreer(repriseDonnees) {
    document.getElementById('boot-form').innerHTML = `
      <h3>${repriseDonnees ? 'Protéger les données reprises' : 'Créer le coffre'}</h3>
      <p class="hint"><b>Cette phrase ne peut pas être récupérée.</b> Elle seule ouvre vos données,
      ici comme dans le dépôt : notez-la dans votre gestionnaire de mots de passe avant de continuer.</p>
      <form id="frm-creer">
        <input type="text" name="username" value="essor" autocomplete="username" hidden>
        <input type="password" id="p1" placeholder="Phrase de passe" autocomplete="new-password"
               autocapitalize="off" autocorrect="off" spellcheck="false" required>
        <div id="jauge" class="jauge"></div>
        <input type="password" id="p2" placeholder="Répéter la phrase" autocomplete="new-password"
               autocapitalize="off" autocorrect="off" spellcheck="false" required>
        <div class="erreur" id="err-creer"></div>
        <button class="primary" type="submit">Créer le coffre</button>
      </form>`;
    const p1 = document.getElementById('p1');
    const jauge = document.getElementById('jauge');
    p1.oninput = () => {
      const f = Coffre.force(p1.value);
      jauge.innerHTML = `<span class="j j${f.score}"></span> phrase ${f.mot}`;
    };
    document.getElementById('frm-creer').onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById('err-creer');
      err.textContent = '';
      if (p1.value !== document.getElementById('p2').value) { err.textContent = 'Les deux saisies diffèrent.'; return; }
      if (p1.value.length < 10) { err.textContent = 'Au moins 10 caractères — c\'est la seule serrure.'; return; }
      await UI.busy(e.target.querySelector('button'), async () => {
        await Store.creer(p1.value, repriseDonnees || null);
        App.demarrer();
        UI.toast('Coffre créé. Pour retrouver ces données sur vos autres appareils, configurez Réglages → Synchronisation.');
      });
    };
  },

  formRejoindre() {
    document.getElementById('boot-form').innerHTML = `
      <h3>Rejoindre mes données</h3>
      <p class="hint">Indiquez le dépôt privé où Essor dépose son fichier chiffré, puis la phrase
      de passe qui l'ouvre — la même que sur vos autres appareils.</p>
      <form id="frm-rej">
        ${App.champsDepot()}
        <input type="text" name="username" value="essor" autocomplete="username" hidden>
        <label>Phrase de passe<input type="password" id="pj" autocomplete="current-password"
          autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
        <div class="erreur" id="err-rej"></div>
        <button class="primary" type="submit">Récupérer mes données</button>
      </form>`;
    document.getElementById('frm-rej').onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById('err-rej');
      err.textContent = '';
      const cfg = App.lireChampsDepot();
      if (!cfg.owner || !cfg.repo || !cfg.jeton) { err.textContent = 'Propriétaire, dépôt et jeton sont nécessaires.'; return; }
      await UI.busy(e.target.querySelector('button[type=submit]'), async () => {
        try { await Store.rejoindre(document.getElementById('pj').value, cfg); }
        catch (ex) {
          err.textContent = ex.message === 'PHRASE_INVALIDE' ? 'Phrase de passe incorrecte pour ce fichier.'
            : ex.code === 'JETON_REFUSE' ? 'GitHub a refusé le jeton (droits insuffisants ou expiré).'
            : ex.code === 'HORS_LIGNE' ? 'Impossible de joindre GitHub : vérifiez la connexion.'
            : ex.message;
          return;
        }
        App.demarrer();
        UI.toast('Données récupérées et synchronisées.');
      });
    };
  },

  formFichier() {
    document.getElementById('boot-form').innerHTML = `
      <h3>Reprendre un fichier</h3>
      <p class="hint">Un <code>essor-data.json</code> issu de la version locale, ou une sauvegarde
      chiffrée <code>.json.enc</code>. Vous choisirez ensuite la phrase de passe qui protégera ces données.</p>
      <input type="file" id="f-fichier" accept=".json,.enc,application/json">
      <label id="lbl-ph-src" style="display:none">Phrase de passe du fichier chiffré
        <input type="password" id="ph-src" autocomplete="off"></label>
      <div class="erreur" id="err-fic"></div>
      <button class="primary" id="btn-fic">Lire le fichier</button>`;
    let texte = null;
    document.getElementById('f-fichier').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      texte = await f.text();
      document.getElementById('lbl-ph-src').style.display = Coffre.estEnveloppe(texte) ? 'block' : 'none';
    };
    document.getElementById('btn-fic').onclick = async (e) => {
      const err = document.getElementById('err-fic');
      err.textContent = '';
      if (!texte) { err.textContent = 'Choisissez d\'abord un fichier.'; return; }
      await UI.busy(e.target, async () => {
        let donnees;
        try { donnees = await Store.lireFichier(texte, document.getElementById('ph-src').value); }
        catch (ex) { err.textContent = ex.message === 'PHRASE_INVALIDE' ? 'Phrase de passe incorrecte pour ce fichier.' : ex.message; return; }
        const n = (donnees.transactions || []).length;
        UI.toast(`Fichier lu : ${n} opération(s), ${(donnees.accounts || []).length} compte(s).`);
        App.formCreer(donnees);
      });
    };
  },

  /* ---------- Application ---------- */

  demarrer() {
    document.getElementById('boot').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    // Données dérivées obsolètes rafraîchies dès l'ouverture (EX-76, EX-112).
    Indices.applyAll();
    Engine.snapshots();
    App.current = Store.state.ui.lastScreen || 'patrimoine';
    if (!App.screens[App.current]) App.current = 'patrimoine';
    App.renderNav();
    App.render();
    UI.renderSaveStatus(Store.saveStatus, Store.mode);
    App.armerVerrouAuto();
  },

  // À l'ouverture d'une session, le dépôt peut porter le travail d'un autre
  // appareil : on va le chercher avant que l'utilisateur ne touche à quoi que ce soit.
  async rattraperDepot() {
    if (Store.mode !== 'sync') return;
    const r = await Store.rafraichir();
    if (r === 'repris') {
      Engine.invalidate();
      App.render();
      UI.toast('Données mises à jour depuis le dépôt.');
    }
    if (Store._enAttente) Store.synchroniser();
  },

  /* ---------- Verrouillage automatique ---------- */

  _minuteur: null,

  armerVerrouAuto() {
    const reset = () => {
      clearTimeout(App._minuteur);
      const min = Store.state && Store.state.settings ? (Store.state.settings.verrouillageMin || 0) : 0;
      if (!min) return;
      App._minuteur = setTimeout(() => {
        Store.save().finally(() => Store.verrouiller());
      }, min * 60000);
    };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, reset, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reset();
      // De retour sur l'onglet (ou l'application, sur téléphone) : le dépôt
      // a pu bouger entre temps.
      if (Store.state) App.rattraperDepot();
    });
    reset();
  },

  /* ---------- Navigation ---------- */

  renderNav() {
    const items = (cle, s, court) => `<button class="nav-item ${cle === App.current ? 'active' : ''}" data-s="${cle}">
      <span class="ico">${s.ico}</span><span class="lbl">${court ? App.court[cle] : s.label}</span></button>`;
    const principaux = Object.entries(App.screens).filter(([k]) => k !== 'reglages');

    document.getElementById('nav-items').innerHTML = principaux.map(([k, s]) => items(k, s)).join('');
    document.getElementById('nav-bottom').innerHTML =
      items('reglages', App.screens.reglages) +
      `<button class="nav-item" id="btn-verrou"><span class="ico">⌧</span><span class="lbl">Verrouiller</span></button>`;
    // Barre du bas : sur téléphone, la colonne de gauche n'a pas sa place.
    document.getElementById('tabbar').innerHTML =
      Object.entries(App.screens).map(([k, s]) => items(k, s, true)).join('');

    document.querySelectorAll('.nav-item[data-s]').forEach(b => b.onclick = () => App.go(b.dataset.s));
    document.getElementById('btn-verrou').onclick = async () => {
      await Store.save();
      Store.verrouiller();
    };
  },

  go(screen) {
    App.current = screen;
    Store.state.ui.lastScreen = screen;
    Store.markDirty();
    App.renderNav();
    App.render();
    document.getElementById('content').scrollTop = 0;
  },

  /* ---------- Conflit entre appareils ---------- */

  _conflitOuvert: false,

  conflitModal() {
    if (App._conflitOuvert) return;
    App._conflitOuvert = true;
    const m = UI.modal(`
      <h2>Ces données ont été modifiées ailleurs</h2>
      <p>Le fichier du dépôt a changé depuis que cette session l'a ouvert —
      Essor a été utilisé sur un autre appareil.</p>
      <p class="small">Rien n'a été écrasé : l'enregistrement dans le dépôt est suspendu jusqu'à votre choix.
      Vos données restent enregistrées sur cet appareil, et la version écartée est conservée dans « backups ».</p>
      <div class="actions">
        <button data-x="autre">Reprendre la version de l'autre appareil</button>
        <button class="primary" data-x="moi">Garder ma session en cours</button>
      </div>`);
    const fermer = () => { App._conflitOuvert = false; m.close(); };
    m.el.querySelector('[data-x="autre"]').onclick = async (e) => {
      await UI.busy(e.target, async () => {
        await Store.reprendreLautreVersion();
        Engine.invalidate();
        fermer();
        UI.toast('Données rechargées depuis le dépôt.');
        App.render();
      });
    };
    m.el.querySelector('[data-x="moi"]').onclick = async (e) => {
      await UI.busy(e.target, async () => {
        await Store.imposerMaVersion();
        fermer();
        UI.toast('Votre session a été poussée ; la version écartée est conservée dans « backups ».');
      });
    };
  },

  render() {
    const s = App.screens[App.current];
    UI.renderPeriodPicker(s.period);
    const el = document.getElementById('content-inner');
    el.innerHTML = '';
    s.render();
  },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
