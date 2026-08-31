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

    if (status === 'verrouille') {
      // « Rester déverrouillé » : la clé de session ouvre le coffre sans rien
      // demander — l'application s'ouvre comme n'importe quelle application.
      if (await Store.deverrouillerAuto()) {
        App.demarrer();
        App.rattraperDepot();
        return;
      }
      App.ecranDeverrouillage();
    } else App.ecranPremierUsage();
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
    if (message) App._bioAutoFaite = true;   // verrou volontaire : pas d'invite automatique
    clearInterval(App._sondage);          // plus rien ne parle au dépôt une fois verrouillé
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
      <div id="zone-bio"></div>
      <form id="frm-open" autocomplete="on">
        <input type="text" name="username" value="essor" autocomplete="username" hidden>
        ${UI.secret('ph', { placeholder: 'Phrase de passe', autocomplete: 'current-password', requis: true })}
        <div class="erreur" id="err-open"></div>
        <button class="primary" type="submit">Ouvrir</button>
      </form>
      ${depot ? `<p class="hint">Dépôt de synchronisation : <b>${U.escapeHtml(depot)}</b></p>` : ''}
      <p class="hint"><button class="lien" id="autre-appareil">Utiliser un autre coffre sur cet appareil…</button></p>
      ${App.encartInstallation()}
    </div>`;
    App.brancherInstallation(() => App.ecranDeverrouillage(message));
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
    App.offrirBiometrie(err);
    setTimeout(() => { const i = document.getElementById('ph'); if (i) i.focus(); }, 60);
  },

  // Déverrouillage sans saisie, quand l'appareil sait vérifier son porteur.
  // La phrase reste affichée dessous : la biométrie peut échouer, et un
  // déverrouillage sans porte de sortie serait une impasse.
  async offrirBiometrie(err) {
    const zone = document.getElementById('zone-bio');
    if (!zone || !(await Bio.configuree()) || !(await Bio.disponible())) return;
    zone.innerHTML = `<button class="primary bouton-bio" id="btn-bio">
      <span class="ico-bio">☉</span> Déverrouiller avec ${U.escapeHtml(Bio.nomLocal())}</button>
      <div class="separateur"><span>ou la phrase de passe</span></div>`;
    const ouvrir = async (bouton) => UI.busy(bouton, async () => {
      if (err) err.textContent = '';
      let phrase;
      try { phrase = await Bio.ouvrir(); }
      catch (ex) { if (err) err.textContent = ex.message; return; }
      try { await Store.deverrouiller(phrase); }
      catch (ex) {
        if (err) err.textContent = ex.message === 'PHRASE_INVALIDE'
          ? 'La phrase enregistrée pour cet appareil n\'ouvre plus le coffre. Saisissez-la à la main.'
          : ex.message;
        return;
      }
      App.demarrer();
      App.rattraperDepot();
    });
    document.getElementById('btn-bio').onclick = (e) => ouvrir(e.currentTarget);
    // L'invite se lance d'elle-même à l'ouverture : sur Android, l'empreinte
    // apparaît sans toucher au bouton. Une seule tentative — refusée ou
    // impossible (Safari exige un geste), le bouton reste là.
    if (!App._bioAutoFaite) {
      App._bioAutoFaite = true;
      setTimeout(() => {
        const b = document.getElementById('btn-bio');
        if (b && !Store.state) ouvrir(b);
      }, 350);
    }
  },

  /* ---------- Installation sur l'appareil ---------- */

  // Encart discret des écrans d'accueil : c'est là qu'un nouvel appareil
  // arrive, donc le bon moment pour proposer l'installation. Rien ne s'affiche
  // si l'application tourne déjà depuis l'écran d'accueil.
  encartInstallation() {
    if (Install.installee() || !Install.servieCorrectement()) return '';
    if (Install.invitable()) {
      return `<div class="encart-install">
        <b>Installer Essor sur cet appareil</b>
        <p class="small">Elle s'ouvre alors en plein écran, depuis l'écran d'accueil, et fonctionne hors réseau.</p>
        <button class="primary" id="inst-btn">Installer l'application</button></div>`;
    }
    if (Install.plateforme() === 'bureau') return '';   // inutile d'insister sur un ordinateur
    return `<div class="encart-install">
      <b>Installer Essor sur cet appareil</b>
      ${Install.instructions()}</div>`;
  },

  brancherInstallation(rafraichir) {
    const b = document.getElementById('inst-btn');
    if (!b) return;
    b.onclick = () => UI.busy(b, async () => {
      const r = await Install.proposer();
      if (r === 'accepte' && UI.toast) UI.toast('Essor est installée : retrouvez-la sur votre écran d\'accueil.');
      if (rafraichir) rafraichir();
    });
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
      ${App.encartInstallation()}
    </div>`;
    App.brancherInstallation(() => App.ecranPremierUsage(coffreExistant));
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
    <label>Jeton d'accès personnel (fine-grained, droit « Contents : read and write » sur ce dépôt)</label>
    ${UI.secret('d-jeton', { placeholder: 'github_pat_…', autocomplete: 'off' })}
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
        ${UI.secret('p1', { placeholder: 'Phrase de passe', autocomplete: 'new-password', requis: true })}
        <div id="jauge" class="jauge"></div>
        ${UI.secret('p2', { placeholder: 'Répéter la phrase', autocomplete: 'new-password', requis: true })}
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
        <label>Phrase de passe</label>
        ${UI.secret('pj', { autocomplete: 'current-password', requis: true })}
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
      <div id="lbl-ph-src" style="display:none"><label>Phrase de passe du fichier chiffré</label>
        ${UI.secret('ph-src', { autocomplete: 'off' })}</div>
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
    App.armerRetour();
    // Le navigateur se réserve d'effacer les données d'un site « de passage »
    // quand la place manque : on demande le statut durable dès l'ouverture.
    // Les cours crypto se rafraîchissent d'eux-mêmes, au plus une fois par
    // intervalle réglé. En silence : un cours qui n'arrive pas n'est pas un
    // incident, la valorisation continue sur le dernier connu.
    if (Cours.completerIdentifiants()) Store.markDirty();
    Cours.onMaj = (r) => {
      Engine.invalidate();
      App.render();
      UI.toast(`${r.n} cours crypto mis à jour.`);
    };
    Cours.majAuto();
    // Retour d'une autorisation bancaire : l'URL porte un code à échanger.
    Banque.onBilan = (b) => {
      Engine.invalidate();
      App.render();
      if (b.erreurs.length) UI.error(`Synchronisation bancaire : ${b.erreurs[0]}.`, 'Les autres comptes ont été traités.');
      else if (b.ajoutees || b.comptes) UI.toast(`Banques synchronisées : ${b.ajoutees} opération(s) nouvelle(s) sur ${b.comptes} compte(s).`);
      if (b.expirees.length) UI.toast(`Consentement à renouveler : ${b.expirees.map(U.escapeHtml).join(', ')} (Réglages → Connexion bancaire).`, 'error');
      if (b.soldes.length && typeof ScreenOperations !== 'undefined') {
        ScreenOperations.proposerSoldesReleves(b.soldes);
      }
    };
    if (new URLSearchParams(location.search).get('state') === 'essor-eb') {
      Banque.reprendre().then(session => {
        if (!session) return;
        UI.toast(`${U.escapeHtml(session.aspsp)} connectée : ${session.comptes.length} compte(s).
          Rattachez-les dans Réglages → Connexion bancaire.`);
        App.go('reglages');
      }).catch(e => UI.error(`Connexion bancaire : ${e.message}.`, 'Relancez l’autorisation depuis Réglages.'));
    } else {
      Banque.majAuto();
    }
    Install.rendreDurable();
    // L'installabilité peut n'être annoncée qu'après coup : l'écran Réglages
    // doit alors se remettre à jour tout seul.
    Install.onChange = () => { if (App.current === 'reglages') ScreenReglages.renderInstallation(); };
    // L'autre appareil était simplement en avance : on l'a suivi, on le dit,
    // et on ne demande rien — il n'y avait rien à arbitrer.
    // Les deux appareils ont travaillé : Essor réunit, puis le dit. Rien n'est
    // perdu, et le geste reste annulable — c'est mieux qu'une question posée à
    // chaque modification, à laquelle il n'y avait pas de bonne réponse.
    Store.onFusionAuto = (info) => {
      Engine.invalidate();
      App.render();
      const par = info.par && info.par.nom ? U.escapeHtml(info.par.nom) : "l'autre appareil";
      const nuance = info.contestes.length
        ? ` ${info.contestes.length} fiche(s) modifiée(s) des deux côtés ont pris la version la plus récente.`
        : '';
      UI.toastAction(`Vos modifications ont été <b>réunies</b> avec celles de ${par}.${nuance}`,
        'Revenir à ma version seule',
        () => Store.annulerFusion(info.annuler)
          .then(() => { Engine.invalidate(); App.render(); UI.toast('Fusion annulée : seule votre version est conservée.'); })
          .catch((e) => UI.error(e.message, "La fusion n'a pas pu être annulée.")));
    };
    Store.onFastForward = (doc) => {
      Engine.invalidate();
      App.render();
      const par = doc.majPar && doc.majPar.nom ? ` (${doc.majPar.nom})` : '';
      UI.toast(`Données mises à jour depuis l'autre appareil${par}.`);
    };
    App.armerSondage();
    // Les écrans se re-rendent d'eux-mêmes après une action : les fiches se
    // reposent alors sans que chaque écran ait à y penser.
    if (!App._obsFiches) {
      App._obsFiches = new MutationObserver(U.debounce(() => { if (UI.estMobile()) UI.fiches(); }, 60));
      App._obsFiches.observe(document.getElementById('content-inner'), { childList: true, subtree: true });
    }
  },

  // À l'ouverture d'une session, le dépôt peut porter le travail d'un autre
  // appareil : on va le chercher avant que l'utilisateur ne touche à quoi que ce soit.
  async rattraperDepot({ discret = false } = {}) {
    if (Store.mode !== 'sync' || App._rattrapageEnCours) return;
    // Un seul appel, qui ne rapporte que le numéro de version : inutile de
    // télécharger le fichier tant que le dépôt n'a pas bougé.
    if (discret && !(await Store.aDuNeuf()) && !Store._enAttente &&
        Store.signature() === Store._sigEnvoyee) return;
    App._rattrapageEnCours = true;
    try {
      const r = await Store.rafraichir();
      if (r === 'repris') {
        Engine.invalidate();
        App.render();
        UI.toast('Données mises à jour depuis le dépôt.');
      }
      // 'fusionne' : onFusionAuto a déjà tout dit et tout rafraîchi.
      if (Store._enAttente) await Store.synchroniser();
    } finally { App._rattrapageEnCours = false; }
  },

  _rattrapageEnCours: false,
  _sondage: null,

  // Interrogation périodique tant que la fenêtre est visible : c'est ainsi
  // qu'un appareil apprend qu'un autre a travaillé AVANT d'écrire lui-même —
  // une mise à jour plutôt qu'une divergence à arbitrer.
  armerSondage() {
    clearInterval(App._sondage);
    if (Store.mode !== 'sync') return;
    App._sondage = setInterval(() => {
      if (document.visibilityState === 'visible' && !Store.conflit) {
        App.rattraperDepot({ discret: true });
      }
    }, 45000);
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
      if (Store.state) App.rattraperDepot({ discret: true });
    });
    reset();
  },

  /* ---------- Bouton retour du téléphone ----------
     Sans cela, le geste retour d'Android quittait l'application au lieu de
     fermer ce qui est ouvert. Une entrée de garde est posée dans l'historique ;
     chaque retour la consomme, ferme UNE chose — modale, fiche, puis écran —
     et la repose. À la racine, plus rien à fermer : le retour suivant quitte,
     comme dans n'importe quelle application. */

  armerRetour() {
    if (App._retourArme) return;
    App._retourArme = true;
    history.replaceState({ essor: 'base' }, '');
    history.pushState({ essor: 'garde' }, '');
    window.addEventListener('popstate', () => {
      if (UI.retourArriere()) history.pushState({ essor: 'garde' }, '');
      // sinon : la garde est consommée, le retour suivant quitte vraiment.
    });
  },

  // La garde se repose dès qu'on rouvre quelque chose après la racine.
  garder() {
    if (App._retourArme && (!history.state || history.state.essor !== 'garde')) {
      history.pushState({ essor: 'garde' }, '');
    }
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
    App.garder();
    // Changer d'onglet referme la fiche ouverte : chaque écran repart de sa liste.
    UI._ficheOuverte = null;
    document.body.classList.remove('fiche-ouverte');
    App.current = screen;
    Store.state.ui.lastScreen = screen;
    Store.markDirty();
    App.renderNav();
    App.render();
    document.getElementById('content').scrollTop = 0;
  },

  /* ---------- Conflit entre appareils ---------- */

  _conflitOuvert: false,

  // Quand elle survient — les deux appareils ont vraiment modifié des données
  // depuis leur dernier point commun — la question ne peut pas être posée dans
  // l'abstrait : il faut dire quand, par qui, et sur quoi ils divergent.
  conflitModal() {
    if (App._conflitOuvert) return;
    App._conflitOuvert = true;
    const info = Store.conflitInfo || {};
    const quand = (iso) => iso ? new Date(iso).toLocaleString('fr-FR') : 'date inconnue';
    const qui = (p) => p && p.nom ? U.escapeHtml(p.nom) : 'appareil inconnu';
    const NOMS = {
      transactions: 'opérations', accounts: 'comptes', certifications: 'certifications de solde',
      trades: 'mouvements de titres', positionSnapshots: 'positions', goals: 'objectifs',
      credits: 'crédits', rules: 'règles de catégorisation',
    };
    const r = info.resume || { collections: [], reglages: false };
    const detail = r.collections.length || r.reglages
      ? `<table style="margin:10px 0">
          <tr><th>Ce qui diffère</th><th class="num">Ici seulement</th><th class="num">Là-bas seulement</th></tr>
          ${r.collections.map(c => `<tr><td>${NOMS[c.nom] || c.nom}</td>
            <td class="num">${c.ici || '—'}</td><td class="num">${c.la || '—'}</td></tr>`).join('')}
          ${r.reglages ? '<tr><td>Réglages, budget ou cibles</td><td class="num" colspan="2">modifiés des deux côtés</td></tr>' : ''}
        </table>`
      : '<p class="small">Les deux versions diffèrent sans qu\'aucune fiche n\'ait été ajoutée ou retirée.</p>';

    const m = UI.modal(`
      <h2>Les deux appareils ont travaillé chacun de leur côté</h2>
      <div class="grid c2" style="gap:10px;margin-bottom:6px">
        <div class="card" style="margin:0"><h3>Ici — ${qui(info.local && info.local.par) || 'cet appareil'}</h3>
          <div class="small">Dernière modification envoyée : ${quand(info.local && info.local.maj)}</div></div>
        <div class="card" style="margin:0"><h3>Dans le dépôt — ${qui(info.distant && info.distant.par)}</h3>
          <div class="small">Dernière modification : ${quand(info.distant && info.distant.maj)}</div></div>
      </div>
      ${detail}
      <p class="small">Rien n'a été écrasé, et vos données restent enregistrées sur cet appareil.
      La version écartée est conservée dans « backups ».</p>
      <div class="actions">
        <button data-x="autre">Reprendre celle du dépôt</button>
        <button data-x="moi">Garder la mienne</button>
        <button class="primary" data-x="fusion">Réunir les deux</button>
      </div>
      <div class="hint" style="margin-top:8px">« Réunir » garde tout ce qui existe d'un côté ou de
      l'autre ; ce qui a été modifié des deux côtés revient à la version la plus récente. Les relevés
      importés en double ne sont pas dupliqués.</div>`);
    const fermer = () => { App._conflitOuvert = false; m.close(); };
    // La modale se referme quoi qu'il arrive : si le dépôt a bougé une
    // seconde fois pendant l'arbitrage, la question est reposée au lieu d'être
    // avalée par le garde-fou d'unicité — c'est ainsi qu'on restait bloqué,
    // conflit non résolu et plus rien à l'écran pour le dire.
    const arbitrer = (bouton, action, message) => UI.busy(bouton, async () => {
      try { await action(); }
      finally { fermer(); }
      if (Store.conflit) { App.conflitModal(); return; }
      Engine.invalidate();
      App.render();
      UI.toast(message);
    });
    m.el.querySelector('[data-x="autre"]').onclick = (e) =>
      arbitrer(e.target, () => Store.reprendreLautreVersion(), 'Données rechargées depuis le dépôt.');
    m.el.querySelector('[data-x="moi"]').onclick = (e) =>
      arbitrer(e.target, () => Store.imposerMaVersion(),
        'Votre session a été poussée ; la version écartée est conservée dans « backups ».');
    m.el.querySelector('[data-x="fusion"]').onclick = (e) =>
      arbitrer(e.target, () => Store.fusionner(),
        'Les deux versions ont été réunies, puis envoyées au dépôt.');
  },

  render() {
    const s = App.screens[App.current];
    UI.renderPeriodPicker(s.period);
    const el = document.getElementById('content-inner');
    el.innerHTML = '';
    s.render();
    if (UI.estMobile()) UI.fiches();
  },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
