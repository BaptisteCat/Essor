/* Essor — écran Réglages.
   Hypothèses de projection (EX-60, EX-62), cibles d'épargne (EX-52), crédits
   (EX-3), objectifs (EX-68), cours et répartition des supports (EX-5,
   EX-13, EX-99), sauvegardes (EX-95). */
'use strict';

const ScreenReglages = {

  _toutesNatures: false,

  render() {
    document.getElementById('screen-title').innerHTML =
      `<h1>Réglages</h1><div class="small">Hypothèses, cibles, crédits, objectifs, cours</div>`;
    const el = document.getElementById('content-inner');
    const s = Store.state.settings;

    el.innerHTML = `
      <div class="grid c2">
        <div class="card">
          <h2>Hypothèses de projection</h2>
          <p class="hint">Prudentes par défaut.
          ${UI.info(`Rendements annuels attendus par nature de compte. Ce sont vos hypothèses :
          les projections les simulent, elles ne prédisent rien. « Constaté » = ce que vos comptes
          ont réellement produit, hors versements — rouge si l'écart dépasse 3 points.`)}</p>
          <table id="rg-returns">
            <tr><th>Nature</th><th class="num">Rendement /an</th><th class="num">Volatilité /an</th>
              <th class="num" title="Rendement annualisé réellement constaté sur vos mois complets, hors versements">Constaté</th></tr>
            ${(() => {
              const constate = Engine.realizedByType();
              // Ne parler que des natures que ce patrimoine possède : huit
              // lignes d'hypothèses dont cinq ne servent à rien noyaient les
              // trois qui comptent. Les autres apparaissent à la demande.
              const enUsage = new Set(Store.state.accounts.filter(a => !a.closed).map(a => a.type));
              const toutes = ScreenReglages._toutesNatures || !enUsage.size;
              return Object.entries(ACCOUNT_TYPES)
                .filter(([k]) => toutes || enUsage.has(k))
                .map(([k, t]) => {
                const c = constate[k];
                const affiche = c
                  ? `<span class="${Math.abs(c.annual - (s.returns[k] || 0)) > 0.03 ? 'down' : 'muted'}"
                       title="constaté sur ${c.months} mois complets, hors versements">
                       ${(c.annual * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                       <span class="small">(${c.months} mois)</span></span>`
                  : '<span class="muted">—</span>';
                return `<tr>
                  <td>${t.label}</td>
                  <td class="num"><input data-ret="${k}" class="amount" size="5" value="${((s.returns[k] || 0) * 100).toLocaleString('fr-FR')}"> %</td>
                  <td class="num"><input data-vol="${k}" class="amount" size="5" value="${((s.vols[k] || 0) * 100).toLocaleString('fr-FR')}"> %</td>
                  <td class="num">${affiche}</td>
                </tr>`;
              }).join('');
            })()}
          </table>
          <div class="hint"><button class="lien" id="rg-toutes-natures">${ScreenReglages._toutesNatures
            ? 'Ne montrer que les natures de mes comptes'
            : 'Montrer toutes les natures'}</button></div>
          <div class="row" style="margin-top:12px">
            <div class="field"><label>Inflation annuelle</label>
              <input id="rg-infl" class="amount" size="5" value="${(s.inflation * 100).toLocaleString('fr-FR')}"> %</div>
            <div class="field"><label>Taux de rente (règle empirique, 3–4 %)</label>
              <input id="rg-rente" class="amount" size="5" value="${((s.renteRate ?? 0.04) * 100).toLocaleString('fr-FR')}"> %</div>
            <div class="field"><label>Abattement AV — 4 600 € seul, 9 200 € couple</label>
              ${UI.amountInput('rg-avab', s.avAbattement ?? 460000)}</div>
            <div class="field"><label><input type="checkbox" id="rg-savinfl" ${s.savingsFollowInflation ? 'checked' : ''} style="width:auto">
              L'effort d'épargne suit l'inflation</label></div>
          </div>
          <button class="primary" id="rg-save-settings">Enregistrer les hypothèses</button>
        </div>

        <div class="card">
          <h2>Cibles d'épargne par compte</h2>
          <p class="hint">La stratégie que l'assistant et la projection appliquent.
          ${UI.info(`Part du patrimoine visée par compte, bornée éventuellement par un montant
          maximum — ex. matelas de sécurité à 30 % mais jamais plus de 6 000 €. Les deux écrans
          utilisent le même moteur d'allocation, au centime près.`)}</p>
          <div id="rg-targets"></div>
        </div>
      </div>

      <div class="grid c2">
        <div class="card">
          <div class="toolbar"><h2 style="margin:0">Crédits en cours</h2><span class="spacer"></span>
            <button id="rg-add-credit">+ Crédit</button></div>
          <div id="rg-credits"></div>
        </div>
        <div class="card">
          <div class="toolbar"><h2 style="margin:0">Objectifs</h2><span class="spacer"></span>
            <button id="rg-add-goal">+ Objectif</button></div>
          <div id="rg-goals"></div>
        </div>
      </div>

      <div class="card">
        <h2>Cours et répartition des supports</h2>
        <p class="hint">Cours, prix de revient et répartition de chaque support.
        ${UI.info(`Les supports capitalisants réinvestissent leurs revenus : les rendements
        constatés sont des rendements totaux, dividendes déjà compris. Seuls les identifiants de
        supports cotés sortent de la machine, pour récupérer les cours — rien d'autre.`)}</p>
        <div id="rg-symbols"></div>
      </div>

      <div class="card">
        <h2>Connexion bancaire</h2>
        <div id="rg-banque"></div>
      </div>

      <div class="card">
        <h2>Synchronisation</h2>
        <div id="rg-sync"></div>
      </div>

      <div class="card">
        <h2>Cet appareil</h2>
        <div id="rg-installation"></div>
      </div>

      <div class="card">
        <h2>Sécurité de cet appareil</h2>
        <div id="rg-securite"></div>
      </div>

      <div class="card">
        <h2>Données et sauvegardes</h2>
        <div id="rg-donnees"></div>
      </div>`;

    ScreenReglages.renderTargets();
    ScreenReglages.renderCredits();
    ScreenReglages.renderGoals();
    ScreenReglages.renderSymbols();
    ScreenReglages.renderBanque();
    ScreenReglages.renderSync();
    ScreenReglages.renderInstallation();
    ScreenReglages.renderSecurite();
    ScreenReglages.renderDonnees();

    document.getElementById('rg-save-settings').onclick = () => {
      const pct = v => { const x = U.parseAmount(v); return x == null ? 0 : x / 10000; };
      el.querySelectorAll('[data-ret]').forEach(i => s.returns[i.dataset.ret] = pct(i.value));
      el.querySelectorAll('[data-vol]').forEach(i => s.vols[i.dataset.vol] = pct(i.value));
      s.inflation = pct(document.getElementById('rg-infl').value);
      s.renteRate = pct(document.getElementById('rg-rente').value) || 0.04;
      s.avAbattement = UI.readAmount(document.getElementById('rg-avab')) ?? 460000;
      s.savingsFollowInflation = document.getElementById('rg-savinfl').checked;
      Engine.invalidate();
      UI.toast('Hypothèses enregistrées.');
    };
    document.getElementById('rg-toutes-natures').onclick = () => {
      ScreenReglages._toutesNatures = !ScreenReglages._toutesNatures;
      ScreenReglages.render();
    };
    document.getElementById('rg-add-credit').onclick = () => ScreenReglages.creditModal();
    document.getElementById('rg-add-goal').onclick = () => ScreenReglages.goalModal();
  },

  /* ---------- Connexion bancaire ---------- */

  async renderBanque() {
    const holder = document.getElementById('rg-banque');
    if (!holder) return;
    const b = Banque.cfg();
    const actif = Banque.actif();

    const sessions = b.sessions.map(s => {
      const jours = Banque.joursRestants(s);
      const etat = jours == null ? '' : jours <= 0
        ? '<span class="badge cuivre">consentement expiré</span>'
        : jours <= 15 ? `<span class="badge cuivre">${jours} j restants</span>`
        : `<span class="badge argent">${jours} j de consentement</span>`;
      const comptes = s.comptes.map(c => `<tr>
        <td>${U.escapeHtml((c.uid || '').slice(0, 10))}…
          ${c.solde ? `<div class="small num">${U.fmtEUR(c.solde.balance)} au ${U.fmtDate(c.solde.date)}</div>` : ''}</td>
        <td>${UI.accountSelect('lien-' + c.uid, b.liens[c.uid], { allowNone: true })}</td>
      </tr>`).join('');
      return `<div class="notice" style="margin-top:8px">
        <b>${U.escapeHtml(s.aspsp)}</b> ${etat}
        <button class="ghost" data-renouveler="${U.escapeHtml(s.aspsp)}">Renouveler</button>
        <button class="ghost" data-oublier="${U.escapeHtml(s.aspsp)}">Oublier</button>
        <table style="margin-top:6px"><tr><th>Compte bancaire</th><th>Compte Essor</th></tr>${comptes}</table>
      </div>`;
    }).join('');

    holder.innerHTML = `
      <p class="small">Vos banques alimentent Essor directement — mêmes vérifications que les
      fichiers. ${UI.info(`Les opérations passent de la banque à Enable Banking (prestataire agréé
      DSP2), puis par votre relais Cloudflare, jusqu'ici. Rien n'est stocké en chemin, et le solde
      annoncé par la banque est proposé en certification — la preuve au centime, sans geste. Le
      consentement se renouvelle tous les 90 à 180 jours : c'est la règle DSP2. La marche à suivre
      complète est dans DEPLOIEMENT.md du dépôt de l'application.`)}</p>
      <div class="row">
        <div class="field" style="min-width:230px"><label>Adresse du relais (Cloudflare Worker)</label>
          <input id="bq-relais" placeholder="https://essor-relais.xxx.workers.dev"
            value="${U.escapeHtml(b.relais || '')}" autocapitalize="off" spellcheck="false"></div>
        <div class="field" style="min-width:200px"><label>Clé du relais</label>
          ${UI.secret('bq-cle', { placeholder: 'la RELAIS_CLE du Worker', autocomplete: 'off' })}</div>
        <div class="field"><button class="primary" id="bq-config">${actif ? 'Mettre à jour' : 'Connecter'}</button></div>
      </div>
      ${actif ? `
        <div class="row" style="margin-top:8px">
          <div class="field" style="min-width:220px"><label>Ajouter une banque</label>
            <select id="bq-banque"><option value="">Chargement…</option></select></div>
          <div class="field"><button id="bq-autoriser">Autoriser cette banque…</button></div>
          <div class="field"><button id="bq-sync">Synchroniser maintenant</button></div>
        </div>
        <div class="row" style="margin-top:4px">
          <div class="field"><label>
            <input type="checkbox" id="bq-auto" style="width:auto" ${b.auto === false ? '' : 'checked'}>
            Synchronisation automatique à l'ouverture</label></div>
          <div class="hint">Dernière synchronisation : ${U.escapeHtml(Banque.derniereMaj())}.</div>
        </div>
        ${sessions || '<div class="empty">Aucune banque autorisée pour l’instant.</div>'}
      ` : ''}`;

    const champCle = document.getElementById('bq-cle');
    if (champCle) champCle.value = b.cle || '';

    document.getElementById('bq-config').onclick = (e) => UI.busy(e.target, async () => {
      b.relais = document.getElementById('bq-relais').value.trim();
      b.cle = document.getElementById('bq-cle').value.trim();
      if (!b.relais || !b.cle) { UI.error('Adresse ou clé du relais manquante.', 'Les deux se trouvent dans votre Worker Cloudflare.'); return; }
      try { await Banque.appel('/aspsps?country=FR'); }
      catch (ex) { UI.error(`Le relais ne répond pas : ${ex.message}.`, "Vérifiez l’adresse, la clé, et que le Worker est déployé."); return; }
      Store.markDirty();
      UI.toast('Relais connecté. Autorisez maintenant votre première banque.');
      ScreenReglages.renderBanque();
    });

    if (!actif) return;

    // La liste des banques se charge en arrière-plan.
    Banque.banques().then(liste => {
      const sel = document.getElementById('bq-banque');
      if (!sel) return;
      sel.innerHTML = '<option value="">— choisir —</option>' +
        liste.map(x => `<option value="${U.escapeHtml(x.name)}">${U.escapeHtml(x.name)}</option>`).join('');
    }).catch(() => {});

    document.getElementById('bq-autoriser').onclick = (e) => UI.busy(e.target, async () => {
      const nom = document.getElementById('bq-banque').value;
      if (!nom) { UI.error('Choisissez une banque.', 'La liste couvre les établissements français.'); return; }
      await Banque.autoriser(nom);   // la page part chez la banque
    });
    document.getElementById('bq-sync').onclick = (e) => UI.busy(e.target, async () => {
      await Banque.synchroniser();
      ScreenReglages.renderBanque();
    });
    document.getElementById('bq-auto').onchange = (e) => {
      b.auto = e.target.checked;
      Store.markDirty();
    };
    holder.querySelectorAll('[data-renouveler]').forEach(x => x.onclick = (e) =>
      UI.busy(e.target, () => Banque.autoriser(x.dataset.renouveler)));
    holder.querySelectorAll('[data-oublier]').forEach(x => x.onclick = () => UI.confirm(
      'Oublier cette banque ?',
      'Le consentement local est effacé — les opérations déjà importées restent. Pour révoquer côté banque, passez par son espace client.',
      () => {
        b.sessions = b.sessions.filter(s => s.aspsp !== x.dataset.oublier);
        Store.markDirty();
        ScreenReglages.renderBanque();
      }));
    // Rattachement compte bancaire → compte Essor, enregistré au changement.
    holder.querySelectorAll('[id^="lien-"]').forEach(sel => sel.onchange = () => {
      const uid = sel.id.slice(5);
      if (sel.value) b.liens[uid] = sel.value; else delete b.liens[uid];
      Store.markDirty();
      UI.toast(sel.value ? 'Compte rattaché : il sera synchronisé.' : 'Compte détaché.');
    });
  },

  /* ---------- Synchronisation entre appareils ---------- */

  renderSync() {
    const s = Store.state.sync || {};
    const holder = document.getElementById('rg-sync');
    const actif = Store.mode === 'sync';
    holder.innerHTML = `
      <p class="small">Vos appareils partagent un fichier chiffré via un dépôt GitHub privé.
      ${UI.info(`GitHub n'en voit qu'un bloc d'octets : votre phrase de passe ne quitte jamais
      l'appareil, et sans elle le fichier est inexploitable. Le jeton d'accès reste sur cet
      appareil, chiffré lui aussi.`)}</p>
      ${actif
        ? `${Store.conflit ? `<div class="notice warn"><b>Le dépôt attend votre arbitrage.</b>
               Il a été modifié ailleurs depuis que cette session l'a ouvert. Vos données restent
               enregistrées sur cet appareil, mais plus rien ne part tant que vous n'avez pas tranché.
               <br><button class="primary" id="rg-conflit" style="margin-top:8px">Trancher maintenant…</button></div>` : ''}
           <div class="notice gold">Synchronisé avec <b>${U.escapeHtml(s.owner)}/${U.escapeHtml(s.repo)}</b>
             — fichier <code>${U.escapeHtml(s.chemin)}</code> sur la branche <code>${U.escapeHtml(s.branch)}</code>.
             ${Store._enAttente ? `<br><b>En attente d'envoi.</b> ${U.escapeHtml(Store._raisonAttente || '')}` : ''}</div>
           <button id="rg-sync-now">Synchroniser maintenant</button>
           <button id="rg-sync-edit">Modifier le dépôt…</button>
           <button class="danger" id="rg-sync-off">Ne plus synchroniser</button>`
        : `<div class="notice warn">Cet appareil n'est pas synchronisé : vos données ne vivent que
             dans ce navigateur. Un effacement des données de site les perdrait définitivement.</div>
           <button class="primary" id="rg-sync-edit">Configurer la synchronisation…</button>`}
      <div id="rg-sync-form"></div>`;

    const edit = document.getElementById('rg-sync-edit');
    edit.onclick = () => {
      const f = document.getElementById('rg-sync-form');
      f.innerHTML = `<div style="margin-top:12px">
        ${App.champsDepot(s)}
        <div class="erreur" id="rg-sync-err"></div>
        <button class="primary" id="rg-sync-ok">Vérifier et enregistrer</button></div>`;
      document.getElementById('rg-sync-ok').onclick = (e) => UI.busy(e.target, async () => {
        const err = document.getElementById('rg-sync-err');
        err.textContent = '';
        const cfg = App.lireChampsDepot();
        if (!cfg.owner || !cfg.repo || !cfg.jeton) { err.textContent = 'Propriétaire, dépôt et jeton sont nécessaires.'; return; }
        let info;
        try { info = await Depot.verifier(cfg); }
        catch (ex) {
          err.textContent = ex.code === 'JETON_REFUSE' ? 'GitHub a refusé le jeton (droits insuffisants ou expiré).'
            : ex.code === 'HORS_LIGNE' ? 'Impossible de joindre GitHub : vérifiez la connexion.' : ex.message;
          return;
        }
        if (!info.ecriture) { err.textContent = 'Ce jeton n\'a pas le droit d\'écrire dans ce dépôt (Contents : read and write).'; return; }
        await Store.configurerDepot(cfg);
        await Store.save();
        App.armerSondage();
        ScreenReglages.renderSync();
        UI.toast(info.prive
          ? `Synchronisation active avec ${info.nomComplet}.`
          : `Synchronisation active — attention, ${info.nomComplet} est un dépôt PUBLIC. Le fichier y est chiffré, mais rendez-le privé.`);
      });
    };
    if (!actif) return;
    const bConflit = document.getElementById('rg-conflit');
    if (bConflit) bConflit.onclick = () => App.conflitModal();
    document.getElementById('rg-sync-now').onclick = (e) => UI.busy(e.target, async () => {
      if (Store.conflit) { App.conflitModal(); return; }
      const r = await Store.rafraichir();
      if (r === 'repris') { Engine.invalidate(); App.render(); UI.toast('Données reprises depuis le dépôt.'); return; }
      await Store.synchroniser();
      ScreenReglages.renderSync();
      UI.toast(Store.saveStatus === 'saved' ? 'Dépôt à jour.' : 'Envoi impossible pour l\'instant — données conservées sur l\'appareil.');
    });
    document.getElementById('rg-sync-off').onclick = (e) => UI.confirm(
      'Ne plus synchroniser cet appareil ?',
      'Le fichier du dépôt reste en place ; cet appareil cesse simplement de le lire et de l\'écrire.',
      async () => { await Store.oublierDepot(); App.armerSondage(); ScreenReglages.renderSync(); UI.toast('Synchronisation désactivée.'); });
  },

  /* ---------- Installation sur l'appareil ---------- */

  async renderInstallation() {
    const holder = document.getElementById('rg-installation');
    if (!holder) return;
    const installee = Install.installee();
    const stock = await Install.etatStockage();
    // Un rendu qui attend peut revenir après un changement d'écran : ses
    // éléments n'existent plus, et rien ne doit être branché sur du vide.
    if (!document.body.contains(holder)) return;
    const durable = {
      accorde: 'protégé de l\'effacement automatique',
      refuse: 'pas encore protégé de l\'effacement automatique',
      inconnu: 'de statut inconnu',
    }[stock.durable];
    const place = stock.utilise != null
      ? `${(stock.utilise / 1048576).toFixed(1)} Mo utilisés${stock.quota ? ` sur ${Math.round(stock.quota / 1048576)} Mo disponibles` : ''}`
      : null;

    holder.innerHTML = `
      ${installee
        ? `<div class="notice gold">Essor est <b>installée</b> sur cet appareil : elle s'ouvre en plein
             écran depuis l'écran d'accueil, et fonctionne sans réseau.</div>`
        : `<p class="small">Installée, Essor s'ouvre depuis l'écran d'accueil comme n'importe quelle
             application : plein écran, sans barre d'adresse, et utilisable hors réseau — les données
             sont déjà sur l'appareil, seule la synchronisation attend la connexion.</p>
           ${!Install.servieCorrectement()
             ? '<div class="notice warn">L\'installation exige une adresse en <code>https://</code> : ouvrez le site publié, pas une copie locale.</div>'
             : Install.invitable()
               ? '<button class="primary" id="inst-btn">Installer l\'application</button>'
               : Install.instructions()}`}
      <h3 style="margin-top:16px">Stockage de cet appareil</h3>
      <p class="small">Le coffre chiffré est <b>${durable}</b>${place ? ` — ${place}` : ''}.
      ${stock.durable === 'accorde'
        ? 'Le navigateur s\'engage à ne pas l\'effacer pour faire de la place.'
        : stock.durable === 'refuse'
          ? 'Le navigateur peut l\'effacer s\'il manque de place — l\'installation rend en général ce statut durable. Raison de plus pour garder la synchronisation active.'
          : 'Ce navigateur ne renseigne pas ce statut.'}</p>
      ${Install.plateforme() === 'ios' && !installee ? `<div class="notice">
        Sur iPhone, l'application installée dispose de son <b>propre stockage</b>, distinct de celui de
        Safari : au premier lancement depuis l'écran d'accueil, elle vous redemandera la phrase de passe
        et, si vous synchronisez, choisissez alors « Rejoindre mes données ».</div>` : ''}`;

    if (!installee && Install.invitable()) {
      App.brancherInstallation(() => ScreenReglages.renderInstallation());
    }
  },

  /* ---------- Sécurité ---------- */

  async renderSecurite() {
    const s = Store.state.settings;
    const holder = document.getElementById('rg-securite');
    const bioDispo = await Bio.disponible();
    const bioActive = await Bio.configuree();
    const resteOuvert = await Store.estResterDeverrouille();
    // Un rendu qui attend peut revenir après un changement d'écran : ses
    // éléments n'existent plus, et rien ne doit être branché sur du vide.
    if (!document.body.contains(holder)) return;
    holder.innerHTML = `
      <p class="small">Rien n'est lisible sans la phrase de passe.
      ${UI.info(`L'adresse du site est publique — GitHub Pages ne sait pas faire autrement. Ce qui
      protège vos données n'est pas l'adresse mais le chiffrement : ni cet appareil, ni le dépôt ne
      contiennent quoi que ce soit en clair.`)}</p>
      <div class="row">
        <div class="field"><label>Verrouillage automatique après</label>
          <select id="rg-verrou">
            ${[0, 5, 10, 20, 60, 240].map(v => `<option value="${v}" ${(s.verrouillageMin || 0) === v ? 'selected' : ''}>
              ${v ? v + ' minutes d\'inactivité' : 'jamais'}</option>`).join('')}
          </select></div>
        <div class="field"><button id="rg-verrou-now">Verrouiller maintenant</button></div>
        <div class="field"><button id="rg-phrase">Changer la phrase de passe…</button></div>
      </div>
      <div id="rg-phrase-form"></div>

      <h3 style="margin-top:16px">Rester déverrouillé sur cet appareil</h3>
      <p class="small"><label><input type="checkbox" id="rg-reste" style="width:auto" ${resteOuvert ? 'checked' : ''}>
      L'application s'ouvre directement, sans phrase ni empreinte.</label></p>
      <p class="small">${UI.info(resteOuvert
        ? "La clé de déchiffrement est confiée à ce navigateur : la protection devient celle de l'appareil — son code, sa session. « Verrouiller maintenant » la retire."
        : 'À réserver à un appareil qui a son propre verrou (code, empreinte). Le choix vaut pour cet appareil seulement.')}</p>

      <h3 style="margin-top:16px">Déverrouillage sans saisie</h3>
      ${!bioDispo
        ? `<p class="small">Cet appareil ne propose pas de vérification biométrique à cette
             adresse — il faudra saisir la phrase. Sur iPhone, elle n'est offerte qu'à une
             application ouverte depuis l'écran d'accueil ou dans Safari.</p>`
        : bioActive
          ? `<div class="notice gold">Essor s'ouvre avec <b>${U.escapeHtml(Bio.nomLocal())}</b> sur cet appareil.
               La phrase de passe reste toujours acceptée, et demeure le seul recours si vous
               changez d'appareil.</div>
             <button class="danger" id="rg-bio-off">Ne plus utiliser ${U.escapeHtml(Bio.nomLocal())}</button>`
          : `<p class="small">Votre phrase de passe peut être scellée par <b>${U.escapeHtml(Bio.nomLocal())}</b> :
               un regard ou une empreinte remplace la saisie. Le secret qui l'ouvre est dérivé par
               l'appareil à chaque fois, jamais conservé — et ne sort ni de l'appareil, ni vers le dépôt.</p>
             <button class="primary" id="rg-bio-on">Activer ${U.escapeHtml(Bio.nomLocal())}</button>`}
      <div id="rg-bio-form"></div>`;
    document.getElementById('rg-verrou').onchange = (e) => {
      s.verrouillageMin = Number(e.target.value);
      Store.markDirty();
      App.armerVerrouAuto();
      UI.toast(s.verrouillageMin ? `Verrouillage après ${s.verrouillageMin} minutes.` : 'Verrouillage automatique désactivé.');
    };
    document.getElementById('rg-verrou-now').onclick = async () => { await Store.save(); Store.verrouiller(); };
    document.getElementById('rg-reste').onchange = async (e) => {
      await Store.resterDeverrouille(e.target.checked);
      if (e.target.checked && s.verrouillageMin) {
        // Rester ouvert et se verrouiller après 20 minutes se contrediraient.
        s.verrouillageMin = 0;
        Store.markDirty();
        App.armerVerrouAuto();
      }
      ScreenReglages.renderSecurite();
      UI.toast(e.target.checked
        ? "Essor s'ouvrira directement sur cet appareil. « Verrouiller maintenant » révoque ce choix."
        : "La phrase (ou l'empreinte) sera demandée à chaque ouverture.");
    };
    document.getElementById('rg-phrase').onclick = () => {
      document.getElementById('rg-phrase-form').innerHTML = `
        <div class="notice warn">La nouvelle phrase remplace l'ancienne <b>partout</b> : sur cet appareil
        et dans le dépôt. Vos autres appareils demanderont la nouvelle à leur prochaine ouverture.</div>
        <div class="row">
          <div class="field"><label>Phrase actuelle</label>${UI.secret('rg-p0', { autocomplete: 'off' })}</div>
          <div class="field"><label>Nouvelle phrase</label>${UI.secret('rg-p1', { autocomplete: 'new-password' })}</div>
          <div class="field"><label>Répéter</label>${UI.secret('rg-p2', { autocomplete: 'new-password' })}</div>
          <div class="field"><button class="primary" id="rg-p-ok">Changer</button></div>
        </div>
        <div class="erreur" id="rg-p-err"></div>`;
      document.getElementById('rg-p-ok').onclick = (e) => UI.busy(e.target, async () => {
        const err = document.getElementById('rg-p-err');
        err.textContent = '';
        const p1 = document.getElementById('rg-p1').value, p2 = document.getElementById('rg-p2').value;
        if (p1 !== p2) { err.textContent = 'Les deux saisies diffèrent.'; return; }
        if (p1.length < 10) { err.textContent = 'Au moins 10 caractères.'; return; }
        try { await Store.changerPhrase(document.getElementById('rg-p0').value, p1); }
        catch (ex) { err.textContent = ex.message === 'PHRASE_INVALIDE' ? 'Phrase actuelle incorrecte.' : ex.message; return; }
        document.getElementById('rg-phrase-form').innerHTML = '';
        ScreenReglages.renderSecurite();
        UI.toast('Phrase de passe changée. Notez-la : elle seule ouvre vos données.');
      });
    };

    // Activer la biométrie exige de prouver qu'on connaît la phrase : sans
    // cela, un appareil laissé déverrouillé suffirait à sceller n'importe quoi.
    const bOn = document.getElementById('rg-bio-on');
    if (bOn) bOn.onclick = () => {
      document.getElementById('rg-bio-form').innerHTML = `
        <div style="margin-top:10px">
          <p class="small">Confirmez votre phrase de passe : c'est elle que l'appareil scellera.</p>
          <div class="row">
            <div class="field" style="min-width:240px"><label>Phrase de passe</label>
              ${UI.secret('rg-bio-ph', { autocomplete: 'current-password' })}</div>
            <div class="field"><button class="primary" id="rg-bio-ok">Sceller avec ${U.escapeHtml(Bio.nomLocal())}</button></div>
          </div>
          <div class="erreur" id="rg-bio-err"></div>
        </div>`;
      document.getElementById('rg-bio-ok').onclick = (e) => UI.busy(e.target, async () => {
        const err = document.getElementById('rg-bio-err');
        err.textContent = '';
        const phrase = document.getElementById('rg-bio-ph').value;
        try { await Coffre.ouvrir(phrase, await Store._get('coffre')); }
        catch { err.textContent = 'Phrase de passe incorrecte.'; return; }
        try { await Bio.activer(phrase); }
        catch (ex) { err.textContent = ex.message; return; }
        ScreenReglages.renderSecurite();
        UI.toast(`Essor s'ouvrira désormais avec ${Bio.nomLocal()} sur cet appareil.`);
      });
    };

    const bOff = document.getElementById('rg-bio-off');
    if (bOff) bOff.onclick = () => UI.confirm(
      'Ne plus déverrouiller sans saisie ?',
      'La phrase de passe sera redemandée à chaque ouverture sur cet appareil. Vos données ne bougent pas.',
      async () => { await Bio.desactiver(); ScreenReglages.renderSecurite(); UI.toast('Déverrouillage biométrique retiré.'); });
  },

  /* ---------- Données et sauvegardes ---------- */

  async renderDonnees() {
    const holder = document.getElementById('rg-donnees');
    const locales = await Store.listerSauvegardesLocales();
    // Un rendu qui attend peut revenir après un changement d'écran : ses
    // éléments n'existent plus, et rien ne doit être branché sur du vide.
    if (!document.body.contains(holder)) return;
    holder.innerHTML = `
      <p class="small">Une sauvegarde est prise avant chaque action destructrice.
      ${UI.info(`Chiffrée, gardée sur cet appareil (les 12 dernières) et déposée dans backups/ du
      dépôt, où elle n'est jamais effacée.`)}</p>
      <div class="row">
        <div class="field"><button id="rg-backup">Sauvegarder maintenant</button></div>
        <div class="field"><button id="rg-export-enc">Exporter une copie chiffrée…</button></div>
        <div class="field"><button id="rg-export">Exporter en clair (JSON lisible)…</button></div>
        <div class="field"><button id="rg-import">Reprendre un fichier…</button></div>
      </div>
      <div class="hint">L'export en clair n'est protégé par rien : il sert à relire ou retravailler vos
      données ailleurs, pas à les stocker.</div>
      <div id="rg-import-form"></div>
      <h3 style="margin-top:16px">Sauvegardes sur cet appareil</h3>
      ${locales.length ? `<table>
        <tr><th>Sauvegarde</th><th class="num">Taille</th><th></th></tr>
        ${locales.map(b => `<tr><td>${U.escapeHtml(b.nom)}</td>
          <td class="num">${Math.round(b.taille / 1024)} Ko</td>
          <td class="num"><button data-restaurer="${U.escapeHtml(b.nom)}">Restaurer</button></td></tr>`).join('')}
      </table>` : '<div class="empty">Aucune sauvegarde locale pour l\'instant.</div>'}
      <h3 style="margin-top:16px">Effacement</h3>
      <button class="danger" id="rg-effacer">Effacer les données de cet appareil…</button>
      <div class="hint">N'efface que ce navigateur. ${Store.mode === 'sync'
        ? 'Le dépôt garde tout : cet appareil pourra les récupérer avec la phrase de passe.'
        : '<b>Aucune synchronisation n\'est configurée : ce serait définitif.</b>'}</div>`;

    document.getElementById('rg-backup').onclick = (e) => UI.busy(e.target, async () => {
      const nom = await Store.backup('manuel');
      UI.toast(`Sauvegarde créée : ${nom}`);
      ScreenReglages.renderDonnees();
    });
    document.getElementById('rg-export-enc').onclick = (e) => UI.busy(e.target, () => Store.exportChiffre());
    document.getElementById('rg-export').onclick = () => UI.confirm(
      'Exporter les données en clair ?',
      'Le fichier obtenu est lisible par quiconque y a accès : ne le laissez pas traîner.',
      () => Store.exportDownload());
    document.getElementById('rg-import').onclick = () => {
      document.getElementById('rg-import-form').innerHTML = `
        <div class="notice warn" style="margin-top:10px">Reprendre un fichier <b>remplace</b> toutes les
        données de cette session. Une sauvegarde est prise avant.</div>
        <div class="row">
          <div class="field"><input type="file" id="rg-f" accept=".json,.enc,application/json"></div>
          <div class="field"><label>Phrase (si fichier chiffré)</label>${UI.secret('rg-f-ph', { autocomplete: 'off' })}</div>
          <div class="field"><button class="danger" id="rg-f-ok">Remplacer les données</button></div>
        </div>
        <div class="erreur" id="rg-f-err"></div>`;
      document.getElementById('rg-f-ok').onclick = (e) => UI.busy(e.target, async () => {
        const err = document.getElementById('rg-f-err');
        err.textContent = '';
        const f = document.getElementById('rg-f').files[0];
        if (!f) { err.textContent = 'Choisissez un fichier.'; return; }
        let donnees;
        try { donnees = await Store.lireFichier(await f.text(), document.getElementById('rg-f-ph').value); }
        catch (ex) { err.textContent = ex.message === 'PHRASE_INVALIDE' ? 'Phrase incorrecte pour ce fichier.' : ex.message; return; }
        await Store.remplacerPar(donnees);
        Engine.invalidate();
        UI.toast(`Données remplacées : ${(Store.state.transactions || []).length} opération(s).`);
        App.render();
      });
    };
    holder.querySelectorAll('[data-restaurer]').forEach(b => b.onclick = () => UI.confirm(
      'Restaurer cette sauvegarde ?',
      'Les données de la session en cours sont d\'abord sauvegardées, puis remplacées.',
      async () => {
        await Store.restaurerSauvegardeLocale(b.dataset.restaurer);
        Engine.invalidate();
        UI.toast('Sauvegarde restaurée.');
        App.render();
      }));
    document.getElementById('rg-effacer').onclick = () => UI.confirm(
      'Effacer les données de cet appareil ?',
      Store.mode === 'sync'
        ? 'Le coffre local, le jeton et les sauvegardes locales sont supprimés. Le dépôt n\'est pas touché.'
        : 'Aucune synchronisation n\'est configurée : ces données seront définitivement perdues.',
      async () => { await Store.effacerAppareil(); location.reload(); });
  },

  /* ---------- Cibles (EX-52) ---------- */

  renderTargets() {
    const S = Store.state;
    const holder = document.getElementById('rg-targets');
    const accs = Engine.accountsSorted().filter(a => !a.closed);
    if (!accs.length) { holder.innerHTML = '<div class="empty">Créez d\'abord des comptes (Opérations).</div>'; return; }
    const totalShare = U.sum(S.targets, t => t.share);
    holder.innerHTML = `<table>
      <tr><th>Compte</th><th class="num">Part visée</th><th class="num">Montant max</th></tr>
      ${accs.map(a => {
        const t = S.targets.find(t => t.accountId === a.id);
        return `<tr><td>${U.escapeHtml(a.name)}${a.plafond ? ` <span class="small">plafond ${U.fmtEUR(a.plafond)}</span>` : ''}</td>
          <td class="num"><input data-share="${a.id}" class="amount" size="4" value="${t ? (t.share * 100).toLocaleString('fr-FR') : ''}" placeholder="0"> %</td>
          <td class="num"><input data-cap="${a.id}" class="amount" size="8" value="${t && t.cap ? (t.cap / 100).toLocaleString('fr-FR', { useGrouping: false }) : ''}" placeholder="illimité"> €</td></tr>`;
      }).join('')}
    </table>
    <div class="small" style="margin:8px 0">Total des parts : <b class="num">${U.fmtPct(totalShare, 0)}</b>
      ${Math.abs(totalShare - 1) > 0.001 && totalShare > 0 ? '<span class="badge cuivre">≠ 100 % — le surplus ira aux parts au prorata</span>' : ''}</div>
    <button class="primary" id="rg-save-targets">Enregistrer les cibles</button>`;
    document.getElementById('rg-save-targets').onclick = () => {
      const targets = [];
      holder.querySelectorAll('[data-share]').forEach(i => {
        const share = (U.parseAmount(i.value) || 0) / 10000;
        const capEl = holder.querySelector(`[data-cap="${i.dataset.share}"]`);
        const cap = U.parseAmount(capEl.value);
        if (share > 0 || cap) targets.push({ accountId: i.dataset.share, share, cap: cap || null });
      });
      S.targets = targets;
      Store.markDirty();
      UI.toast('Cibles enregistrées — l\'assistant d\'épargne et la projection les utilisent désormais.');
      ScreenReglages.renderTargets();
    };
  },

  /* ---------- Crédits (EX-3, EX-64) ---------- */

  renderCredits() {
    const S = Store.state;
    const holder = document.getElementById('rg-credits');
    if (!S.credits.length) { holder.innerHTML = '<div class="empty">Aucun crédit déclaré.</div>'; return; }
    holder.innerHTML = `<table><tr><th>Crédit</th><th class="num">Restant dû</th><th class="num">Mensualité</th><th></th></tr>
      ${S.credits.map(c => `<tr><td>${U.escapeHtml(c.name)}<div class="small">${(c.annualRate * 100).toLocaleString('fr-FR')} % · depuis ${U.fmtDate(c.startDate)}</div></td>
        <td class="num" style="color:var(--cuivre-clair)">${U.fmtEUR(Engine.creditRemaining(c, U.today()))}</td>
        <td class="num">${U.fmtEUR(c.monthlyPayment)}</td>
        <td class="right"><button class="ghost" data-ed="${c.id}">modifier</button>
          <button class="ghost" data-del="${c.id}">✕</button></td></tr>`).join('')}</table>`;
    holder.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => ScreenReglages.creditModal(b.dataset.ed));
    holder.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      const c = S.credits.find(c => c.id === b.dataset.del);
      UI.confirmDestructive({
        title: `Retirer le crédit « ${c.name} »`,
        previewHtml: `<p>Restant dû actuel : <b class="num">${U.fmtEUR(Engine.creditRemaining(c, U.today()))}</b>.
          Le patrimoine net remontera d'autant ; l'historique sera recalculé.</p>`,
        confirmLabel: 'Retirer',
        onConfirm: () => {
          S.credits = S.credits.filter(x => x.id !== c.id);
          Engine.invalidate();
          ScreenReglages.render();
        },
      });
    });
  },

  creditModal(id) {
    const c = id ? Store.state.credits.find(c => c.id === id) : null;
    const m = UI.modal(`
      <h2>${c ? 'Modifier le crédit' : 'Nouveau crédit'}</h2>
      <div class="row">
        <div class="field"><label>Nom</label><input id="cr-name" value="${c ? U.escapeHtml(c.name) : ''}" placeholder="Prêt auto"></div>
        <div class="field"><label>Capital emprunté</label>${UI.amountInput('cr-principal', c ? c.principal : null)}</div>
      </div>
      <div class="row">
        <div class="field"><label>Taux annuel (%)</label><input id="cr-rate" class="amount" size="6" value="${c ? (c.annualRate * 100).toLocaleString('fr-FR') : ''}"></div>
        <div class="field"><label>Mensualité</label>${UI.amountInput('cr-monthly', c ? c.monthlyPayment : null)}</div>
        <div class="field"><label>Première échéance</label><input type="date" id="cr-start" value="${c ? c.startDate : U.today()}"></div>
        <div class="field"><label>Durée (mois)</label><input id="cr-months" class="amount" size="5" value="${c ? c.months : ''}"></div>
      </div>
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Enregistrer</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const data = {
        name: m.el.querySelector('#cr-name').value.trim(),
        principal: UI.readAmount(m.el.querySelector('#cr-principal')),
        annualRate: (U.parseAmount(m.el.querySelector('#cr-rate').value) || 0) / 10000,
        monthlyPayment: UI.readAmount(m.el.querySelector('#cr-monthly')),
        startDate: m.el.querySelector('#cr-start').value,
        months: Number(m.el.querySelector('#cr-months').value) || 240,
      };
      if (!data.name || !data.principal || !data.monthlyPayment || !data.startDate) {
        UI.error('Champs manquants.', 'Nom, capital, mensualité et première échéance sont requis.');
        return;
      }
      if (c) Object.assign(c, data);
      else Store.state.credits.push({ id: U.uid(), ...data });
      Engine.invalidate();
      m.close();
      ScreenReglages.render();
    };
  },

  /* ---------- Objectifs (EX-68) ---------- */

  renderGoals() {
    const S = Store.state;
    const holder = document.getElementById('rg-goals');
    if (!S.goals.length) { holder.innerHTML = '<div class="empty">Aucun objectif — ex. « 100 k€ à 35 ans ».</div>'; return; }
    holder.innerHTML = `<table>${S.goals.map(g => `<tr>
      <td>${U.escapeHtml(g.name)}</td><td class="num">${U.fmtEUR(g.target)}</td>
      <td class="right"><button class="ghost" data-ed="${g.id}">modifier</button>
        <button class="ghost" data-del="${g.id}">✕</button></td></tr>`).join('')}</table>`;
    holder.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => ScreenReglages.goalModal(b.dataset.ed));
    holder.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      S.goals = S.goals.filter(g => g.id !== b.dataset.del);
      Store.markDirty();
      ScreenReglages.renderGoals();
    });
  },

  goalModal(id) {
    const g = id ? Store.state.goals.find(g => g.id === id) : null;
    const m = UI.modal(`
      <h2>${g ? 'Modifier l\'objectif' : 'Nouvel objectif'}</h2>
      <div class="row">
        <div class="field"><label>Nom</label><input id="gl-name" value="${g ? U.escapeHtml(g.name) : ''}" placeholder="Apport immobilier"></div>
        <div class="field"><label>Montant visé</label>${UI.amountInput('gl-target', g ? g.target : null)}</div>
      </div>
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Enregistrer</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const name = m.el.querySelector('#gl-name').value.trim();
      const target = UI.readAmount(m.el.querySelector('#gl-target'));
      if (!name || !target) { UI.error('Nom ou montant manquant.', 'Renseignez les deux.'); return; }
      if (g) { g.name = name; g.target = target; }
      else Store.state.goals.push({ id: U.uid(), name, target });
      Store.markDirty();
      m.close();
      ScreenReglages.renderGoals();
    };
  },

  /* ---------- Cours des supports (EX-13, EX-99) ---------- */

  renderSymbols() {
    const S = Store.state;
    const holder = document.getElementById('rg-symbols');
    const syms = new Set([...Object.keys(S.prices), ...S.trades.map(t => t.symbol),
      ...S.positionSnapshots.map(x => x.symbol)]);
    if (!syms.size) { holder.innerHTML = '<div class="empty">Aucun support — les positions se déclarent dans Opérations.</div>'; return; }
    // Chaque bloc de ce panneau suppose une donnée : pas de donnée, pas de
    // bloc. La géographie ne concerne que les fonds (jamais la crypto), les
    // cours automatiques que la crypto, les arrondis qu'un motif ou un compte
    // crypto existant.
    const estCrypto = (sym) => !!((S.priceMeta[sym] || {}).coingecko || Cours.IDS[sym]);
    const aDeLaCrypto = [...syms].some(estCrypto);
    const aDesFonds = [...syms].some(sym => !estCrypto(sym));
    const montrerArrondis = !!S.settings.btcRoundUpPattern ||
      S.accounts.some(a => a.type === 'crypto' && !a.closed);
    holder.innerHTML = `<table><tr><th>Support</th><th class="num">Dernier cours</th><th class="num">PRU</th>
      <th>Répartition géographique</th><th></th></tr>
      ${[...syms].sort().map(sym => {
        const p = Engine.priceAt(sym, U.today());
        const g = S.geo[sym];
        const src = S.geoSource?.[sym];
        const etiq = src === 'deduit'
          ? `<span class="badge argent" title="Déduit de l'indice suivi par le fonds — corrigeable">déduit : ${U.escapeHtml(S.geoIndice?.[sym] || '')}</span>`
          : src === 'enligne' ? `<span class="badge or" title="Poids réels récupérés en ligne">en ligne</span>`
          : src === 'manuel' ? `<span class="badge or">saisi</span>` : '';
        const geoStr = g
          ? `${etiq}<div>${Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3)
              .map(([k, v]) => `${k} ${Math.round(v * 100)} %`).join(', ')}${Object.keys(g).length > 3 ? '…' : ''}</div>`
          : '<span class="badge cuivre">indice non reconnu</span>';
        const meta = S.priceMeta[sym] || {};
        return `<tr><td><b>${U.escapeHtml(sym)}</b>${meta.name ? `<div class="small">${U.escapeHtml(meta.name)}</div>` : ''}</td>
          <td class="num">${p ? `${U.fmtPrice(p.price)}<div class="small">au ${U.fmtDate(p.date)}</div>` : '<span class="badge cuivre">aucun cours</span>'}</td>
          <td class="num">${S.pru[sym] ? U.fmtPrice(S.pru[sym]) : '—'}</td>
          <td class="small">${geoStr}</td>
          <td class="right"><button class="ghost" data-sym="${U.escapeHtml(sym)}">gérer</button></td></tr>`;
      }).join('')}</table>
      ${aDesFonds ? `<div class="notice" style="margin-top:12px">
        <b>Répartition géographique</b> — déduite automatiquement de l'indice suivi par chaque
        fonds. ${UI.info(`Reconnue d'après le nom et le code du support ; ce sont les poids publiés
        de l'indice, pas la composition du fonds au jour le jour. Pour les poids réels, un
        fournisseur en ligne peut être interrogé ci-dessous — accès payant chez Financial Modeling
        Prep depuis 2025 ; sans clé, tout fonctionne hors ligne et seul le code du support sort de
        la machine.`)}
        <div class="row" style="margin-top:10px">
          <button id="rg-rededuce">Relancer la déduction</button>
          <div class="field" style="margin:0;min-width:250px">
            <label>Clé Financial Modeling Prep (gratuite, facultative)</label>
            ${UI.secret('rg-fmp', { placeholder: 'collez votre clé', autocomplete: 'off' })}</div>
          <button id="rg-fetch-geo">Récupérer les poids réels en ligne</button>
        </div>

      </div>` : ''}
      ${montrerArrondis ? `<div class="notice" style="margin-top:12px">
        <b>Arrondis convertis en bitcoin.</b> ${UI.info(`Si votre carte arrondit chaque paiement
        et convertit la différence en BTC, ces petits débits sortent de votre patrimoine alors que
        l'argent a seulement changé de forme. Essor les transforme en position bitcoin, chacun au
        cours de son propre jour. Rejouable sans doublon.`)}
        <div class="row" style="margin-top:10px">
          <div class="field" style="margin:0"><label>Libellé de ces opérations</label>
            <input id="rg-btc-motif" value="${U.escapeHtml(S.settings.btcRoundUpPattern || 'TRANSFER REVOLUT DIGITAL')}" size="26"></div>
          <div class="field" style="margin:0"><label>Compte qui détient le bitcoin</label>
            ${UI.accountSelect('rg-btc-compte', S.settings.btcRoundUpAccount, { allowNone: true })}</div>
          <button id="rg-btc-go">Convertir les arrondis</button>
        </div>

      </div>` : ''}
      ${aDeLaCrypto ? `<div class="row" style="margin-top:10px">
        <div class="row" style="align-items:center">
          <button id="rg-fetch-crypto">Mettre à jour les cours crypto maintenant</button>
          <div class="field" style="margin:0"><label>
            <input type="checkbox" id="rg-cours-auto" style="width:auto"
              ${S.settings.coursAuto === false ? '' : 'checked'}>
            Mise à jour automatique à l'ouverture</label></div>
          <div class="field" style="margin:0"><label>Pas plus d'une fois toutes les</label>
            <select id="rg-cours-h">${[1, 3, 6, 12, 24].map(h =>
              `<option value="${h}" ${(S.settings.coursIntervalleH || 6) === h ? 'selected' : ''}>${h} h</option>`).join('')}</select></div>
        </div>
        <div class="hint">Dernière mise à jour : ${U.escapeHtml(Cours.derniereMaj())}.
          ${UI.info(`Seuls les identifiants d'actifs (« bitcoin », « ethereum ») sortent de la
          machine — jamais vos quantités ni vos montants. Sans réseau, la valorisation garde le
          dernier cours connu.`)}</div>

      </div>` : ''}`;
    holder.querySelectorAll('[data-sym]').forEach(b => b.onclick = () => ScreenReglages.symbolModal(b.dataset.sym));
    // Les blocs sont conditionnels : ne brancher que ce qui est à l'écran.
    const si = (id, ev, fn) => { const e = document.getElementById(id); if (e) e[ev] = fn; };
    si('rg-fetch-crypto', 'onclick', (e) => UI.busy(e.target, () => ScreenReglages.fetchCrypto()));
    si('rg-cours-auto', 'onchange', (e) => {
      S.settings.coursAuto = e.target.checked;
      Store.markDirty();
      UI.toast(e.target.checked ? "Les cours se mettront à jour à l'ouverture." : 'Mise à jour automatique désactivée.');
    });
    si('rg-cours-h', 'onchange', (e) => {
      S.settings.coursIntervalleH = Number(e.target.value);
      Store.markDirty();
    });
    // La clé déjà enregistrée est replacée dans le champ après rendu (un champ
    // secret ne porte pas sa valeur dans le HTML).
    const champFmp = document.getElementById('rg-fmp');
    if (champFmp) champFmp.value = S.settings.fmpKey || '';
    si('rg-rededuce', 'onclick', (e) => UI.busy(e.target, async () => {
      const faits = Indices.applyAll({ force: true });
      const restants = Indices.nonDeduits();
      UI.toast(`${faits.length} support(s) rattaché(s) à leur indice.` +
        (restants.length ? ` Non reconnus : ${restants.map(U.escapeHtml).join(', ')}.` : ''));
      ScreenReglages.renderSymbols();
    }));
    si('rg-fetch-geo', 'onclick', (e) => UI.busy(e.target, () => ScreenReglages.fetchGeo()));
    si('rg-btc-go', 'onclick', (e) => UI.busy(e.target, () => ScreenReglages.convertirArrondis()));
  },

  // Répartitions géographiques types des grands indices. Ce ne sont pas des
  // règles liées à la situation de l'utilisateur (EX-35) mais des faits
  // publics sur des indices, offerts comme point de départ modifiable.
  MODELES_GEO: {
    'MSCI World': { 'États-Unis': 0.71, 'Japon': 0.06, 'Royaume-Uni': 0.04, 'Zone euro': 0.08,
                    'Suisse': 0.03, 'Canada': 0.03, 'Reste du monde': 0.05 },
    'MSCI ACWI': { 'États-Unis': 0.63, 'Japon': 0.05, 'Royaume-Uni': 0.03, 'Zone euro': 0.07,
                   'Chine': 0.03, 'Marchés émergents (hors Chine)': 0.07, 'Reste du monde': 0.12 },
    'S&P 500': { 'États-Unis': 1 },
    'Euro Stoxx 50': { 'France': 0.36, 'Allemagne': 0.27, 'Pays-Bas': 0.14, 'Italie': 0.09,
                       'Espagne': 0.08, 'Reste zone euro': 0.06 },
    'Émergents': { 'Chine': 0.30, 'Inde': 0.19, 'Taïwan': 0.18, 'Corée du Sud': 0.11,
                   'Brésil': 0.05, 'Reste émergents': 0.17 },
    'CAC 40': { 'France': 1 },
  },

  symbolModal(sym) {
    const S = Store.state;
    const geo = S.geo[sym] || {};
    const hist = S.prices[sym] || {};
    const histRows = Object.keys(hist).sort().reverse().slice(0, 8)
      .map(d => `<tr><td>${U.fmtDate(d)}</td><td class="num">${U.fmtEUR(hist[d])}</td></tr>`).join('');
    const meta = S.priceMeta[sym] || {};
    const m = UI.modal(`
      <h2>${U.escapeHtml(sym)}</h2>
      <div class="row">
        <div class="field"><label>Nom lisible</label><input id="sy-name" value="${U.escapeHtml(meta.name || '')}" placeholder="MSCI World capit."></div>
        <div class="field"><label>Identifiant CoinGecko (crypto uniquement)</label><input id="sy-cg" value="${U.escapeHtml(meta.coingecko || '')}" placeholder="bitcoin"></div>
      </div>
      <div class="row">
        <div class="field"><label>Nouveau cours</label>${UI.amountInput('sy-price', null)}</div>
        <div class="field"><label>à la date</label><input type="date" id="sy-date" value="${U.today()}"></div>
        <div class="field"><label>PRU</label>${UI.amountInput('sy-pru', S.pru[sym])}</div>
        <button id="sy-addprice">Enregistrer le cours</button>
      </div>
      <div class="field">
        <label>Répartition géographique — « Région : part » par ligne. Alimente l'exposition
          géographique de l'écran Patrimoine.</label>
        <div class="toolbar" style="margin-bottom:6px">
          <span class="small">Modèles :</span>
          ${Object.keys(ScreenReglages.MODELES_GEO).map(k =>
            `<button class="ghost" data-geo="${U.escapeHtml(k)}">${U.escapeHtml(k)}</button>`).join('')}
        </div>
        <textarea id="sy-geo" rows="5" style="width:100%" placeholder="États-Unis : 70&#10;Japon : 6&#10;Royaume-Uni : 4">${Object.entries(geo).map(([k, v]) => `${k} : ${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}`).join('\n')}</textarea>
        <div class="hint">${S.geoSource?.[sym] === 'deduit'
          ? `Actuellement <b>déduit</b> de l'indice « ${U.escapeHtml(S.geoIndice?.[sym] || '')} ». Toute correction ici fera foi et ne sera plus réécrasée.`
          : S.geoSource?.[sym] === 'enligne'
          ? `Actuellement récupéré <b>en ligne</b>. Toute correction ici fera foi.`
          : `Ces poids se lisent sur la fiche du fonds (« répartition géographique »).`}</div>
      </div>
      ${histRows ? `<h3>Derniers cours</h3><table>${histRows}</table>` : ''}
      <div class="actions">
        <button class="ghost" data-x="cancel">Fermer</button>
        <button class="primary" data-x="ok">Enregistrer</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('#sy-addprice').onclick = () => {
      const price = UI.readAmount(m.el.querySelector('#sy-price'));
      const date = m.el.querySelector('#sy-date').value;
      if (price && date) { Engine.setPrice(sym, date, price); Store.markDirty(); UI.toast(`Cours enregistré : ${U.fmtEUR(price)} au ${U.fmtDate(date)}.`); }
    };
    // Modèles géographiques : remplissent le champ, restent modifiables.
    m.el.querySelectorAll('[data-geo]').forEach(b => b.onclick = () => {
      const modele = ScreenReglages.MODELES_GEO[b.dataset.geo];
      m.el.querySelector('#sy-geo').value = Object.entries(modele)
        .map(([k, v]) => `${k} : ${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}`).join('\n');
    });
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      // « Région : part » par ligne → {région: fraction}. Retourne null si le
      // total s'écarte trop de 100 %.
      const lire = (texte) => {
        const out = {};
        let total = 0;
        for (const line of texte.split('\n')) {
          const mm = line.match(/^(.+?)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/);
          if (mm) { const v = Number(mm[2].replace(',', '.')) / 100; out[mm[1].trim()] = v; total += v; }
        }
        return { out, total };
      };
      const geoIn = lire(m.el.querySelector('#sy-geo').value);
      if (Object.keys(geoIn.out).length && Math.abs(geoIn.total - 1) > 0.02) {
        UI.error(`La répartition géographique somme à ${Math.round(geoIn.total * 100)} %.`,
          'Ajustez les parts pour approcher 100 %, ou videz le champ.');
        return;
      }
      S.priceMeta[sym] = { ...meta,
        name: m.el.querySelector('#sy-name').value.trim() || undefined,
        coingecko: m.el.querySelector('#sy-cg').value.trim() || undefined };
      const pru = UI.readAmount(m.el.querySelector('#sy-pru'));
      if (pru) S.pru[sym] = pru; else delete S.pru[sym];
      // Une répartition saisie ou corrigée à la main prime et ne sera plus
      // jamais réécrasée par la déduction automatique (P6, EX-38).
      if (!S.geoSource) S.geoSource = {};
      const avant = JSON.stringify(S.geo[sym] || null);
      if (Object.keys(geoIn.out).length) {
        S.geo[sym] = geoIn.out;
        if (JSON.stringify(geoIn.out) !== avant) { S.geoSource[sym] = 'manuel'; delete S.geoIndice?.[sym]; }
      } else {
        delete S.geo[sym];
        delete S.geoSource[sym];
      }
      Engine.invalidate();
      m.close();
      ScreenReglages.renderSymbols();
    };
  },

  // Poids par pays réellement constatés dans les fonds, via Financial Modeling
  // Prep. Facultatif : sans clé, la déduction hors ligne suffit. Une réponse
  // vide n'écrase jamais une répartition déjà connue (P7).
  async fetchGeo() {
    const S = Store.state;
    const key = document.getElementById('rg-fmp').value.trim();
    if (!key) {
      UI.error('Aucune clé renseignée.',
        'Créez une clé gratuite sur financialmodelingprep.com, collez-la dans le champ, puis relancez. ' +
        'Sans clé, la déduction automatique par indice continue de fonctionner.');
      return;
    }
    S.settings.fmpKey = key;   // conservée chiffrée, comme le reste des données
    Store.markDirty();
    const symbols = [...new Set(S.positionSnapshots.map(p => p.symbol))];
    if (!symbols.length) { UI.toast('Aucun support à mettre à jour.'); return; }
    let ok = 0, abonnement = null;
    const absents = [], erreurs = [];
    for (const sym of symbols) {
      if (S.geoSource?.[sym] === 'manuel') continue;   // une saisie manuelle fait foi (P6)
      try {
        const geo = await Indices.fetchOnline(sym, key);
        if (!geo) { absents.push(sym); continue; }
        S.geo[sym] = geo;
        S.geoSource[sym] = 'enligne';
        delete S.geoIndice[sym];
        ok++;
      } catch (err) {
        if (err.code === 'ABONNEMENT') { abonnement = err.message; break; }   // inutile d'insister
        erreurs.push(`${sym} : ${err.message}`);
      }
    }
    Engine.invalidate();
    ScreenReglages.renderSymbols();
    if (abonnement) {
      // Ne pas laisser croire à une erreur de manipulation : la clé est bonne,
      // c'est l'accès qui est payant. Et l'application n'en a pas besoin.
      UI.error(`Poids réels indisponibles : ${abonnement}.`,
        "Votre clé est valide — cet accès précis est payant. Essor continue de déduire la " +
        "répartition des poids publiés de l'indice suivi, ce qui suffit pour un patrimoine personnel.");
    } else if (erreurs.length) {
      UI.error(`Récupération impossible — ${erreurs[0]}.`,
        "La répartition déduite de l'indice reste en place.");
    } else {
      UI.toast(`${ok} support(s) mis à jour avec les poids réels.` +
        (absents.length ? ` Inconnus du fournisseur, déduction conservée : ${absents.map(U.escapeHtml).join(', ')}.` : ''));
    }
  },

  // Arrondis convertis en bitcoin : aperçu chiffré, puis exécution (EX-86).
  async convertirArrondis() {
    const S = Store.state;
    const motif = document.getElementById('rg-btc-motif').value.trim();
    const compte = document.getElementById('rg-btc-compte').value;
    if (!motif) { UI.error('Aucun libellé indiqué.', 'Renseignez le libellé de ces opérations, par exemple « TRANSFER REVOLUT DIGITAL ».'); return; }
    if (!compte) {
      UI.error('Aucun compte choisi pour détenir le bitcoin.',
        'Créez un compte de nature « Crypto » dans Opérations, puis sélectionnez-le ici.');
      return;
    }
    S.settings.btcRoundUpPattern = motif;
    S.settings.btcRoundUpAccount = compte;
    Store.markDirty();
    let apercu;
    try { apercu = await RoundUp.convertir(motif, compte, { simuler: true }); }
    catch (err) {
      UI.error(`Cours du bitcoin indisponibles : ${err.message}.`,
        'Vérifiez la connexion réseau, puis relancez. Rien n\'a été modifié.');
      return;
    }
    if (!apercu.txs) {
      UI.error(`Aucune opération ne correspond à « ${motif} ».`,
        'Vérifiez le libellé exact dans l\'écran Opérations.');
      return;
    }
    if (!apercu.converties) {
      UI.toast(`Rien de nouveau : les ${apercu.deja} opération(s) correspondantes sont déjà converties.`);
      return;
    }
    const nom = Engine.account(compte)?.name || compte;
    const m = UI.modal(`
      <h2>Convertir les arrondis en bitcoin</h2>
      <table>
        <tr><td>Opérations trouvées</td><td class="num">${apercu.txs}</td></tr>
        <tr><td>Déjà converties, laissées telles quelles</td><td class="num">${apercu.deja}</td></tr>
        <tr><td><b>À convertir</b></td><td class="num"><b>${apercu.converties}</b></td></tr>
        <tr><td>Montant total</td><td class="num">${U.fmtEUR(apercu.eur)}</td></tr>
        <tr class="section"><td>Bitcoin ajouté sur ${U.escapeHtml(nom)}</td>
          <td class="num">${apercu.btc.toFixed(8)} BTC</td></tr>
      </table>
      <p class="small">Chaque montant est converti au cours du jour de son opération, jamais à
      celui d'aujourd'hui. Ces opérations deviennent des mouvements internes : l'argent n'a pas
      quitté votre patrimoine, il a changé de forme.</p>
      ${apercu.manquants ? `<div class="notice warn">${apercu.manquants} opération(s) sans cours
        connu à leur date seront laissées de côté.</div>` : ''}
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Convertir</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = (e) => UI.busy(e.target, async () => {
      const bilan = await RoundUp.convertir(motif, compte);
      m.close();
      UI.toast(`${bilan.converties} arrondi(s) convertis : <b>${bilan.btc.toFixed(8)} BTC</b>
        pour ${U.fmtEUR(bilan.eur)}.`);
      ScreenReglages.render();
    });
  },

  // Cours crypto via CoinGecko — seuls les identifiants de supports sortent (EX-99).
  async fetchCrypto() {
    const r = await Cours.majCrypto();
    if (r.erreur) {
      UI.error(`Mise à jour impossible : ${r.erreur}.`,
        'Tout le reste fonctionne hors ligne, sur le dernier cours connu.');
      return;
    }
    if (!r.total) {
      UI.error('Aucun actif crypto détenu.',
        'Déclarez vos actifs depuis Opérations → un compte crypto → Actifs.');
      return;
    }
    Engine.invalidate();
    ScreenReglages.renderSymbols();
    UI.toast(`${r.n} cours mis à jour.` +
      (r.sans.length ? ` Identifiant inconnu, cours à saisir à la main : ${r.sans.map(U.escapeHtml).join(', ')}.` : ''));
  },
};
