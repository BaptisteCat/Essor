/* Essor — écran Opérations.
   Comptes (soldes certifiés EX-10, positions EX-11/12, réordonnancement EX-33),
   import d'archives (EX-23…27), liste unique de toutes les opérations, tous
   mois confondus (EX-28), filtres (EX-30), sélection multiple (EX-29),
   rattachement de mois signalé (EX-46…48), purge avec aperçu chiffré et
   sauvegarde préalable (EX-34, EX-86, EX-95). */
'use strict';

const ScreenOperations = {

  filters: { text: '', type: 'all', lineId: 'all', accountId: 'all' },

  render() {
    const months = UI.periodMonths();
    document.getElementById('screen-title').innerHTML =
      `<h1>Opérations</h1><div class="small">Période analysée : ${UI.periodLabel()}</div>`;
    const el = document.getElementById('content-inner');
    el.innerHTML = `
      <div class="card dropzone" id="op-accounts-card">
        <div class="toolbar">
          <h2 style="margin:0">Comptes</h2>
          <span class="spacer"></span>
          <button id="op-add-account">+ Nouveau compte</button>
          <button id="op-import" class="primary">Importer des relevés</button>
        </div>
        <div class="drop-hint">Déposez ici votre archive « Relevé de tous comptes » — CSV bancaires,
          exports Revolut et rapports de courtier compris.</div>
        <div id="op-accounts"></div>
        <div class="hint">Le solde est celui du ${months[months.length - 1] === U.currentMonth() ? 'jour' :
          'dernier jour de la période'} ; le mouvement est la somme des opérations de la période.
          Ces deux montants ne s'additionnent pas : le solde contient déjà le mouvement.</div>
      </div>

      <div class="card">
        <div class="toolbar">
          <h2 style="margin:0">Opérations <span class="small">— tous les mois se corrigent ici, sans changer de contexte</span></h2>
          <span class="spacer"></span>
          <button id="op-replay-rules" title="Rejouer les règles de catégorisation sur tout l'historique">Rejouer les règles</button>
          <button id="op-replay-transfers" title="Rejouer la reconnaissance des mouvements internes sur tout l'historique">Reconnaître les virements internes</button>
          <button id="op-purge" class="danger">Purger les opérations</button>
        </div>
        <div class="toolbar">
          <input id="f-text" placeholder="Recherche libellé…" value="${U.escapeHtml(ScreenOperations.filters.text)}" style="width:200px">
          <select id="f-type">
            <option value="all">Tous types</option>
            <option value="expense">Dépenses</option>
            <option value="income">Revenus</option>
            <option value="internal">Mouvements internes</option>
            <option value="shifted">Rattachées à un autre mois</option>
            <option value="uncat">Sans catégorie</option>
          </select>
          <select id="f-account"><option value="all">Tous comptes</option>
            ${Engine.accountsSorted().map(a => `<option value="${a.id}">${U.escapeHtml(a.name)}</option>`).join('')}
          </select>
          <select id="f-line"><option value="all">Toutes catégories</option>
            ${Engine.allLines().map(l => `<option value="${l.id}">${U.escapeHtml(l.category + ' · ' + l.name)}</option>`).join('')}
          </select>
          <span class="spacer"></span>
          <button id="op-del-sel" class="danger" style="display:none">Supprimer la sélection</button>
        </div>
        <div id="op-list"></div>
      </div>`;

    ScreenOperations.renderAccounts();
    ScreenOperations.renderList();
    ScreenOperations.wireDropZone();

    document.getElementById('op-add-account').onclick = () => ScreenOperations.accountModal();
    document.getElementById('op-import').onclick = () => {
      if (!Store.state.accounts.length) {
        UI.error('Aucun compte n\'existe encore.', 'Créez d\'abord vos comptes, puis importez les relevés.');
        return;
      }
      ScreenOperations.importModal();
    };
    document.getElementById('op-purge').onclick = () => ScreenOperations.purgeModal();
    document.getElementById('op-replay-rules').onclick = (e) => UI.busy(e.target, async () => {
      const n = Rules.categorizeAll();      // EX-37
      Engine.invalidate();
      UI.toast(`${n} opération(s) reclassée(s) par les règles.`);
      ScreenOperations.renderList();
    });
    document.getElementById('op-replay-transfers').onclick = (e) => UI.busy(e.target, async () => {
      const n = Rules.detectTransfers();    // EX-44
      UI.toast(`${n} opération(s) reconnue(s) comme mouvement interne.`);
      ScreenOperations.renderList();
      ScreenOperations.renderAccounts();
    });
    for (const [id, key] of [['f-text', 'text'], ['f-type', 'type'], ['f-account', 'accountId'], ['f-line', 'lineId']]) {
      const inp = document.getElementById(id);
      inp.value = ScreenOperations.filters[key] || (id === 'f-text' ? '' : 'all');
      inp.addEventListener(id === 'f-text' ? 'input' : 'change', () => {
        ScreenOperations.filters[key] = inp.value;
        ScreenOperations.renderList();
      });
    }
  },

  /* ---------- Comptes ---------- */

  renderAccounts() {
    const months = UI.periodMonths();
    const lastMonth = months[months.length - 1];
    const cur = U.currentMonth();
    // Solde au dernier jour de la période ; au jour même pour le mois en cours (EX-32).
    const balDate = lastMonth === cur ? U.today() : U.monthEnd(lastMonth);
    const from = U.monthStart(months[0]);

    const accs = Engine.accountsSorted();
    const rows = accs.map((a, idx) => {
      const v = Engine.accountValue(a.id, balDate);
      const mov = U.sum(Store.state.transactions.filter(t =>
        t.accountId === a.id && t.date >= from && t.date <= balDate), t => t.amount);
      const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.autre;
      return `<tr data-id="${a.id}">
        <td class="drag-handle" title="Réordonner">
          <button class="ghost" data-mv="-1" ${idx === 0 ? 'disabled' : ''}>↑</button><button class="ghost" data-mv="1" ${idx === accs.length - 1 ? 'disabled' : ''}>↓</button></td>
        <td class="clickable" data-x="edit"><b>${U.escapeHtml(a.name)}</b> <span class="badge argent">${t.label}</span>
          ${a.closed ? '<span class="badge cuivre">clôturé</span>' : ''}</td>
        <td class="num">${UI.varia(mov)}<div class="small">mouvement</div></td>
        <td class="num stat-val">${v ? U.fmtEUR(v.total) : '<span class="muted">non certifié</span>'}
          <div class="small">${v && !v.cashKnown
            ? '<span class="badge cuivre" title="Titres seuls : les espèces non investies manquent">espèces non certifiées</span>'
            : `solde au ${U.fmtDate(balDate)}`}</div></td>
        <td class="right">
          <button data-x="certify">Certifier un solde</button>
          ${t.positions ? `<button data-x="pos">${t.motPositions || 'Positions'}</button>` : ''}
        </td></tr>`;
    }).join('');
    document.getElementById('op-accounts').innerHTML = accs.length
      ? `<table><tr><th></th><th>Compte</th><th class="num">Mouvement (période)</th><th class="num">Solde</th><th></th></tr>${rows}</table>`
      : `<div class="empty">Aucun compte. Créez-en un pour commencer.</div>`;

    document.querySelectorAll('#op-accounts tr[data-id]').forEach(tr => {
      const id = tr.dataset.id;
      tr.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => ScreenOperations.moveAccount(id, Number(b.dataset.mv)));
      tr.querySelector('[data-x="edit"]').onclick = () => ScreenOperations.accountModal(id);
      tr.querySelector('[data-x="certify"]').onclick = () => ScreenOperations.certifyModal(id);
      const posBtn = tr.querySelector('[data-x="pos"]');
      if (posBtn) posBtn.onclick = () => ScreenOperations.positionsModal(id);
    });
  },

  moveAccount(id, dir) {
    // Réordonner selon sa propre logique (EX-33).
    const accs = Engine.accountsSorted();
    accs.forEach((a, i) => a.order = i);
    const i = accs.findIndex(a => a.id === id);
    const j = i + dir;
    if (j < 0 || j >= accs.length) return;
    [accs[i].order, accs[j].order] = [accs[j].order, accs[i].order];
    Store.markDirty();
    ScreenOperations.renderAccounts();
  },

  accountModal(id) {
    const a = id ? Engine.account(id) : null;
    const types = Object.entries(ACCOUNT_TYPES).map(([k, t]) =>
      `<option value="${k}" ${a && a.type === k ? 'selected' : ''}>${t.label}</option>`).join('');
    const m = UI.modal(`
      <h2>${a ? 'Modifier le compte' : 'Nouveau compte'}</h2>
      <div class="field"><label>Nom</label><input id="ac-name" value="${a ? U.escapeHtml(a.name) : ''}" placeholder="Livret A, CTO Bourso…"></div>
      <div class="row">
        <div class="field"><label>Nature (comportement propre : rendement, plafond…)</label><select id="ac-type">${types}</select></div>
        <div class="field"><label>Plafond réglementaire (optionnel)</label>${UI.amountInput('ac-plafond', a ? a.plafond : null, 'ex. 22 950')}</div>
        <div class="field"><label>Frais annuels (%)</label>
          <input id="ac-fees" class="amount" size="5" value="${a && a.feesRate ? (a.feesRate * 100).toLocaleString('fr-FR') : ''}" placeholder="0"></div>
      </div>
      <div class="hint">Les frais annuels (gestion d'AV, TER moyen…) sont déduits du rendement
      dans la projection — 0,8 % par an pendant 20 ans, c'est un cinquième du capital final.</div>
      <div class="row" style="margin-top:8px">
        <div class="field"><label>Année d'ouverture — fiscalité PEA/AV</label>
          <input id="ac-open" class="amount" size="6" value="${a && a.openedYear ? a.openedYear : ''}" placeholder="2021"></div>
        <div class="field"><label>Fiscalité de sortie (%) — vide : règle de l'enveloppe</label>
          <input id="ac-tax" class="amount" size="5" value="${a && a.taxRateOverride != null ? (a.taxRateOverride * 100).toLocaleString('fr-FR') : ''}" placeholder="auto"></div>
      </div>
      <div class="hint">Sans année d'ouverture, PEA et AV sont supposés mûrs à l'horizon (5 et 8 ans).
      Le taux personnalisé sert aux cas particuliers : livret bancaire fiscalisé (30), bien locatif…</div>
      <div class="field"><label>Indices de reconnaissance à l'import — IBAN, n° de compte, morceau du nom de fichier (un par ligne)</label>
        <textarea id="ac-fp" rows="2" style="width:100%" placeholder="FR7612345678901234567890123">${a && a.fingerprints ? U.escapeHtml(a.fingerprints.join('\n')) : ''}</textarea></div>
      ${a ? `<div class="field"><label><input type="checkbox" id="ac-closed" ${a.closed ? 'checked' : ''} style="width:auto"> Compte clôturé (exclu du patrimoine)</label></div>` : ''}
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">${a ? 'Enregistrer' : 'Créer'}</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const name = m.el.querySelector('#ac-name').value.trim();
      if (!name) { UI.error('Le nom du compte est vide.', 'Donnez un nom au compte.'); return; }
      const fps = m.el.querySelector('#ac-fp').value.split('\n').map(s => s.trim().replace(/\s/g, '').toUpperCase()).filter(Boolean);
      const data = {
        name, type: m.el.querySelector('#ac-type').value,
        plafond: UI.readAmount(m.el.querySelector('#ac-plafond')) || null,
        feesRate: (U.parseAmount(m.el.querySelector('#ac-fees').value) || 0) / 10000 || null,
        openedYear: parseInt(m.el.querySelector('#ac-open').value, 10) || null,
        taxRateOverride: (() => {
          const v = U.parseAmount(m.el.querySelector('#ac-tax').value);
          return v == null ? null : v / 10000;
        })(),
        fingerprints: fps,
      };
      if (a) {
        Object.assign(a, data);
        a.closed = m.el.querySelector('#ac-closed')?.checked || false;
      } else {
        Store.state.accounts.push({ id: U.uid(), order: Store.state.accounts.length, closed: false, ...data });
      }
      Engine.invalidate();
      m.close();
      ScreenOperations.render();
    };
  },

  certifyModal(accountId) {
    const a = Engine.account(accountId);
    const isPos = ACCOUNT_TYPES[a.type]?.positions;
    const m = UI.modal(`
      <h2>Certifier le solde — ${U.escapeHtml(a.name)}</h2>
      <p class="small">Vous certifiez le solde ${isPos ? '<b>espèces</b> (les titres sont valorisés à part, par quantités × cours)' : ''}
      de ce compte à une date donnée. Tout le reste — solde actuel, soldes passés — en découle,
      en tenant compte des opérations connues.</p>
      <div class="row">
        <div class="field"><label>Date du solde</label><input type="date" id="ct-date" value="${U.today()}"></div>
        <div class="field"><label>Solde ${isPos ? 'espèces' : ''} constaté</label>${UI.amountInput('ct-bal', null, '0,00')}</div>
      </div>
      ${Store.state.certifications.filter(c => c.accountId === accountId).length ?
        `<h3>Certifications existantes</h3><table>${Store.state.certifications.filter(c => c.accountId === accountId)
          .sort((x, y) => x.date < y.date ? 1 : -1)
          .map(c => `<tr><td>${U.fmtDate(c.date)}</td><td class="num">${U.fmtEUR(c.balance)}</td>
            <td class="right"><button class="ghost" data-del="${c.id}">retirer</button></td></tr>`).join('')}</table>` : ''}
      <div class="actions">
        <button class="ghost" data-x="cancel">Fermer</button>
        <button class="primary" data-x="ok">Certifier</button>
      </div>`);
    m.el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      Store.state.certifications = Store.state.certifications.filter(c => c.id !== b.dataset.del);
      Engine.invalidate();
      m.close();
      ScreenOperations.render();
    });
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const date = m.el.querySelector('#ct-date').value;
      const bal = UI.readAmount(m.el.querySelector('#ct-bal'));
      if (!date || bal == null) { UI.error('Date ou solde manquant.', 'Renseignez les deux champs.'); return; }
      Store.state.certifications.push({ id: U.uid(), accountId, date, balance: bal });
      Engine.invalidate();
      m.close();
      ScreenOperations.render();
      UI.toast(`Solde certifié au ${U.fmtDate(date)}. Les soldes passés et actuels en découlent.`);
    };
  },

  // Identifiants CoinGecko des actifs les plus courants : sans eux, « Mettre à
  // jour les cours crypto » ne saurait pas quoi demander, et il faudrait aller
  // les saisir un par un dans les Réglages.
  CRYPTO_CONNUES: {
    BTC: 'bitcoin', XBT: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
    DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
    LINK: 'chainlink', XRP: 'ripple', LTC: 'litecoin', BCH: 'bitcoin-cash', DOGE: 'dogecoin',
    ATOM: 'cosmos', ALGO: 'algorand', XTZ: 'tezos', NEAR: 'near', ARB: 'arbitrum',
    OP: 'optimism', UNI: 'uniswap', AAVE: 'aave', TRX: 'tron', BNB: 'binancecoin',
    USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
  },

  // On saisit un ACTIF — BTC, ETH, BNB — pas une paire : la devise est celle du
  // prix, pas de l'actif. Une paire écrite par habitude (« BTC/EUR ») n'est
  // pourtant pas refusée : on en retient l'actif, c'est ce qu'elle désigne.
  lireActif(saisie) {
    const t = String(saisie || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!t) return '';
    const m = t.match(/^([A-Z0-9]{2,10})[/\-:](?:EUR|USD|USDT|USDC|GBP|CHF)$/);
    return m ? m[1] : t;
  },

  // Devises de saisie. Tout est valorisé en euros : une saisie faite dans une
  // autre monnaie est convertie à un taux que l'utilisateur voit et corrige.
  DEVISES: ['EUR', 'USD', 'USDT', 'USDC', 'GBP', 'CHF'],

  /* ---------- Positions et actifs (EX-11, EX-12) ---------- */

  positionsModal(accountId, edition) {
    const a = Engine.account(accountId);
    const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.autre;
    // Vocabulaire du compte : « Positions / Support / PRU » pour un
    // compte-titres, « Actifs / Actif / Prix moyen d'achat » pour la crypto.
    const MOT = {
      titre: t.motPositions || 'Positions',
      support: t.motSupport || 'Support',
      exemple: t.exempleSupport || 'IE00B4L5Y983',
      pru: t.motPru || 'PRU',
      dec: t.decimales || 3,
    };
    const crypto = a.type === 'crypto';
    const today = U.today();
    const v = Engine.positionsValue(accountId, today);
    const qte = (q) => q.toLocaleString('fr-FR', { maximumFractionDigits: MOT.dec });
    // Le pourcentage porte la même couleur que le montant : vert ou cuivre,
    // jamais un chiffre nu qu'il faudrait interpréter.
    const pct = (gain, investi) => `<span class="${gain > 0 ? 'up' : gain < 0 ? 'down' : 'neutral-c'} num">` +
      `${gain >= 0 ? '+' : ''}${(gain / investi * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}&nbsp;%</span>`;

    let totalInvesti = 0, totalValeur = 0, tousPru = true;
    const rows = v.detail.map(d => {
      const pru = Store.state.pru[d.symbol];
      const investi = pru ? U.roundCents(d.qty * pru) : null;
      const gain = investi != null ? d.value - investi : null;
      if (investi != null) totalInvesti += investi; else tousPru = false;
      totalValeur += d.value;
      const nom = (Store.state.priceMeta[d.symbol] || {}).name;
      return `<tr>
        <td>${U.escapeHtml(d.symbol)}
          ${nom ? `<div class="small">${U.escapeHtml(nom)}</div>` : ''}
          <div class="small seul-mobile clickable" data-pru="${U.escapeHtml(d.symbol)}"
            >payé ${pru ? U.fmtPrice(pru) : '—'} ✎</div></td>
        <td class="num">${qte(d.qty)}</td>
        <td class="num col-large">${d.price != null ? U.fmtPrice(d.price) : '—'}${d.approx ? ' <span class="badge cuivre" title="cours daté du ' + U.fmtDate(d.priceDate) + '">approx.</span>' : ''}</td>
        <td class="num col-large clickable" data-pru="${U.escapeHtml(d.symbol)}"
            title="Cliquez pour corriger ${U.escapeHtml(MOT.pru.toLowerCase())}">
          ${pru ? U.fmtPrice(pru) : '<span class="muted">non renseigné</span>'} <span class="small">✎</span></td>
        <td class="num col-large">${investi != null ? U.fmtEUR(investi) : '—'}</td>
        <td class="num">${gain != null ? UI.varia(gain) : '—'}
          ${gain != null && investi ? `<div class="small seul-mobile">${pct(gain, investi)}</div>` : ''}</td>
        <td class="num col-large">${gain != null && investi ? pct(gain, investi) : '—'}</td>
        <td class="num stat-val">${U.fmtEUR(d.value)}</td></tr>`;
    }).join('');

    // Les mouvements déclarés à la main : c'est là qu'une faute de frappe se
    // corrige ou s'efface. Sans cette liste, une erreur de saisie était
    // définitive — on ne voyait plus que son résultat agrégé.
    const mvts = Store.state.trades
      .filter(x => x.accountId === accountId)
      .sort((x, y) => (y.date + y.id).localeCompare(x.date + x.id));
    const lignesMvt = mvts.map(x => `<tr${edition === x.id ? ' class="selected"' : ''}>
      <td>${U.fmtDate(x.date)}</td>
      <td>${U.escapeHtml(x.symbol)}</td>
      <td class="num ${x.qtyDelta < 0 ? 'down' : 'up'}">${x.qtyDelta > 0 ? '+' : ''}${qte(x.qtyDelta)}</td>
      <td class="num col-large">${x.priceCents ? U.fmtPrice(x.priceCents) : '—'}</td>
      <td class="num">
        <button class="ghost" data-mod="${x.id}" title="Corriger ce mouvement">✎</button>
        <button class="ghost" data-suppr="${x.id}" title="Supprimer ce mouvement">✕</button></td></tr>`).join('');

    const gainTotal = tousPru && totalInvesti ? totalValeur - totalInvesti : null;
    const enEdition = edition ? mvts.find(x => x.id === edition) : null;

    const m = UI.modal(`
      <h2>${MOT.titre} — ${U.escapeHtml(a.name)}</h2>
      <p class="small">Vous saisissez ce que vous détenez (quantités) et ce que vous l'avez payé
      (${MOT.pru.toLowerCase()}) : la valeur du jour découle des cours, et la plus ou moins-value
      s'en déduit. ${crypto
        ? 'Les cours se mettent à jour depuis CoinGecko (Réglages → Cours) ; seuls les identifiants des actifs sortent de la machine.'
        : 'Les supports capitalisants réinvestissent leurs revenus dans le cours — ne comptez pas de dividendes en plus.'}</p>
      ${v.detail.length ? `<div style="overflow-x:auto"><table>
        <tr><th>${MOT.support}</th><th class="num">Quantité</th><th class="num col-large">Cours</th>
          <th class="num col-large">${MOT.pru}</th><th class="num col-large">Investi</th>
          <th class="num">± value</th><th class="num col-large">%</th><th class="num">Valeur</th></tr>
        ${rows}
        ${gainTotal != null ? `<tr class="section"><td>Total</td><td></td><td class="col-large"></td>
          <td class="col-large"></td><td class="num col-large">${U.fmtEUR(totalInvesti)}</td>
          <td class="num">${UI.varia(gainTotal)}
            <div class="small seul-mobile">${pct(gainTotal, totalInvesti)}</div></td>
          <td class="num col-large">${pct(gainTotal, totalInvesti)}</td>
          <td class="num stat-val">${U.fmtEUR(totalValeur)}</td></tr>` : ''}
      </table></div>` : `<div class="empty">Aucun ${crypto ? 'actif' : 'support'} déclaré.</div>`}
      ${!tousPru && v.detail.length ? `<div class="notice">Sans ${MOT.pru.toLowerCase()}, la plus ou
        moins-value ne peut pas être calculée — c'est la seule saisie qu'Essor ne sait pas déduire
        de vos relevés. Cliquez la colonne pour la renseigner.</div>` : ''}

      ${mvts.length ? `<h3 style="margin-top:16px">Mouvements déclarés</h3>
      <div style="overflow-x:auto"><table>
        <tr><th>Date</th><th>${MOT.support}</th><th class="num">Quantité</th>
          <th class="num col-large">Cours</th><th class="num"></th></tr>
        ${lignesMvt}
      </table></div>
      <div class="hint">✎ corrige, ✕ supprime — une suppression reste annulable le temps du message.</div>` : ''}

      <h3 style="margin-top:16px">${enEdition ? 'Corriger le mouvement' : (crypto ? 'Déclarer un achat ou une vente' : 'Déclarer un mouvement de titres')}</h3>
      <div class="row">
        <div class="field"><label>${MOT.support}</label>
          <input id="ps-sym" placeholder="${MOT.exemple}" size="14" autocapitalize="characters" spellcheck="false"
            value="${enEdition ? U.escapeHtml(enEdition.symbol) : ''}"></div>
        <div class="field"><label>Quantité <span class="small">(négative pour une vente)</span></label>
          <input id="ps-qty" class="amount" size="10" placeholder="${crypto ? '0,05' : '10'}"
            value="${enEdition ? String(enEdition.qtyDelta).replace('.', ',') : ''}"></div>
        <div class="field"><label>Date</label>
          <input type="date" id="ps-date" value="${enEdition ? enEdition.date : today}"></div>
        <div class="field"><label>Cours unitaire</label>
          ${UI.amountInput('ps-price', enEdition ? enEdition.priceCents : null, crypto ? '58 400,00' : '87,42')}</div>
        <div class="field"><label>${MOT.pru}</label>${UI.amountInput('ps-pru', null)}</div>
        ${crypto ? `<div class="field"><label>Devise des prix</label>
          <select id="ps-dev">${ScreenOperations.DEVISES.map(x =>
            `<option ${x === 'EUR' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>` : ''}
        <button class="primary" id="ps-add">${enEdition ? 'Enregistrer la correction' : 'Ajouter'}</button>
        ${enEdition ? '<button class="ghost" id="ps-annuler">Abandonner</button>' : ''}
      </div>
      ${crypto ? `<div id="ps-change" style="display:none">
        <div class="row" style="margin-top:6px">
          <div class="field"><label>Taux de change au jour de l'achat</label>
            <span class="num">1 <b id="ps-dev-nom">USD</b> =</span>
            ${UI.amountInput('ps-taux', null, '0,92')} <span class="small">€</span></div>
          <div class="field"><div class="hint" id="ps-apercu">&nbsp;</div></div>
        </div>
        <div class="hint">Essor valorise tout en euros : sans ce taux, la plus-value serait celle
        d'une autre monnaie. Le dernier taux utilisé pour cette devise est proposé.</div>
      </div>` : ''}
      <div class="hint">${crypto
        ? "Saisissez l'actif seul : BTC, ETH, BNB. Laissez le prix moyen d'achat vide et le cours saisi en tient lieu — commode pour un premier achat."
        : "Les achats importés d'un relevé de courtier (colonnes ISIN + quantité) créent ces mouvements automatiquement."}</div>
      <div class="erreur" id="ps-err"></div>
      <div class="actions"><button class="ghost" data-x="cancel">Fermer</button></div>`);

    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    const rouvrir = (ed) => { m.close(); ScreenOperations.positionsModal(accountId, ed); };
    const bAnnuler = m.el.querySelector('#ps-annuler');
    if (bAnnuler) bAnnuler.onclick = () => rouvrir(null);

    // La devise ne se demande que si elle sort de l'euro, et le taux avec elle.
    const selDev = m.el.querySelector('#ps-dev');
    const majChange = () => {
      const dev = selDev.value;
      const bloc = m.el.querySelector('#ps-change');
      bloc.style.display = dev === 'EUR' ? 'none' : 'block';
      if (dev === 'EUR') return;
      m.el.querySelector('#ps-dev-nom').textContent = dev;
      const champTaux = m.el.querySelector('#ps-taux');
      const memoire = (Store.state.settings.tauxChange || {})[dev];
      if (!champTaux.value && memoire) champTaux.value = (memoire / 10000).toLocaleString('fr-FR');
      const apercu = () => {
        const taux = UI.readAmount(champTaux);
        const prix = UI.readAmount(m.el.querySelector('#ps-price'));
        const pru = UI.readAmount(m.el.querySelector('#ps-pru'));
        const conv = (x) => x != null && taux ? U.fmtEUR(U.roundCents(x * taux / 10000)) : '—';
        m.el.querySelector('#ps-apercu').innerHTML = taux
          ? `soit ${conv(prix)} le cours, ${conv(pru)} le prix moyen`
          : 'renseignez le taux pour voir les montants en euros';
      };
      champTaux.oninput = apercu;
      m.el.querySelector('#ps-price').oninput = apercu;
      m.el.querySelector('#ps-pru').oninput = apercu;
      apercu();
    };
    if (selDev) { selDev.onchange = majChange; majChange(); }

    // Corriger le prix moyen d'achat sans repasser par un mouvement.
    m.el.querySelectorAll('[data-pru]').forEach(cell => cell.onclick = () => {
      const sym = cell.dataset.pru;
      ScreenOperations.pruModal(accountId, sym, MOT, () => rouvrir(edition));
    });

    // Corriger un mouvement : il revient dans le formulaire.
    m.el.querySelectorAll('[data-mod]').forEach(b => b.onclick = () => rouvrir(b.dataset.mod));

    // Supprimer : immédiat, mais annulable le temps du message — une faute de
    // frappe se corrige d'un geste, et rien ne se perd sans recours (P1).
    m.el.querySelectorAll('[data-suppr]').forEach(b => b.onclick = () => {
      const id = b.dataset.suppr;
      const i = Store.state.trades.findIndex(x => x.id === id);
      if (i < 0) return;
      const [retire] = Store.state.trades.splice(i, 1);
      Engine.invalidate();
      Store.markDirty();
      rouvrir(edition === id ? null : edition);
      UI.toastAction(
        `Mouvement supprimé : ${qte(retire.qtyDelta)} ${U.escapeHtml(retire.symbol)} du ${U.fmtDate(retire.date)}.`,
        'Annuler la suppression',
        () => {
          Store.state.trades.push(retire);
          Engine.invalidate();
          Store.markDirty();
          document.querySelectorAll('.modal-back').forEach(x => x.remove());
          ScreenOperations.positionsModal(accountId, edition);
        });
    });

    m.el.querySelector('#ps-add').onclick = () => {
      const err = m.el.querySelector('#ps-err');
      err.textContent = '';
      const saisie = m.el.querySelector('#ps-sym').value;
      const qty = Number(String(m.el.querySelector('#ps-qty').value).replace(',', '.'));
      const date = m.el.querySelector('#ps-date').value;
      let price = UI.readAmount(m.el.querySelector('#ps-price'));
      let pru = UI.readAmount(m.el.querySelector('#ps-pru'));
      if (!saisie.trim() || !qty || Number.isNaN(qty) || !date) {
        err.textContent = `${MOT.support}, quantité ou date manquant.`;
        return;
      }
      let sym = saisie.trim().toUpperCase();
      if (crypto) {
        sym = ScreenOperations.lireActif(saisie);
        // Les prix saisis dans une autre monnaie sont ramenés à l'euro, unité
        // de tout le reste de l'application, au taux affiché.
        const dev = selDev ? selDev.value : 'EUR';
        if (dev !== 'EUR') {
          const taux = UI.readAmount(m.el.querySelector('#ps-taux'));
          if (!taux) {
            err.textContent = `Indiquez combien vaut 1 ${dev} en euros : sans ce taux, la plus-value serait fausse.`;
            return;
          }
          const enEuros = (x) => x == null ? null : U.roundCents(x * taux / 10000);
          price = enEuros(price);
          pru = enEuros(pru);
          Store.state.settings.tauxChange = { ...(Store.state.settings.tauxChange || {}), [dev]: taux };
        }
        const meta = Store.state.priceMeta[sym] || {};
        const cg = ScreenOperations.CRYPTO_CONNUES[sym];
        if (cg && !meta.coingecko) Store.state.priceMeta[sym] = { ...meta, coingecko: cg, currency: 'EUR' };
        // Premier achat sans prix de revient : le cours saisi en tient lieu.
        if (!pru && price && qty > 0 && !Store.state.pru[sym]) pru = price;
      }
      if (enEdition) {
        Object.assign(enEdition, { symbol: sym, date, qtyDelta: qty, priceCents: price || null });
      } else {
        Store.state.trades.push({ id: U.uid(), accountId, symbol: sym, date, qtyDelta: qty, priceCents: price || null });
      }
      if (price) Engine.setPrice(sym, date, price);
      if (pru) Store.state.pru[sym] = pru;
      Engine.invalidate();
      Store.markDirty();
      rouvrir(null);
      if (enEdition) UI.toast('Mouvement corrigé.');
    };
  },

  // Correction du prix moyen d'achat d'un support, indépendamment des
  // mouvements : c'est souvent lui qu'on saisit de travers.
  pruModal(accountId, sym, MOT, apres) {
    const actuel = Store.state.pru[sym];
    const m = UI.modal(`
      <h2>${U.escapeHtml(MOT.pru)} — ${U.escapeHtml(sym)}</h2>
      <p class="small">Ce que vous avez payé en moyenne, par unité, tous achats confondus. C'est de
      lui que découle la plus ou moins-value ; il n'a aucun effet sur la valeur du portefeuille.</p>
      <div class="row">
        <div class="field"><label>${U.escapeHtml(MOT.pru)} en euros</label>${UI.amountInput('pru-v', actuel || null)}</div>
        <button class="primary" data-x="ok">Enregistrer</button>
        ${actuel ? '<button class="danger" data-x="raz">Effacer</button>' : ''}
      </div>
      <div class="actions"><button class="ghost" data-x="cancel">Annuler</button></div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const v = UI.readAmount(m.el.querySelector('#pru-v'));
      if (v) Store.state.pru[sym] = v; else delete Store.state.pru[sym];
      Engine.invalidate();
      Store.markDirty();
      m.close();
      apres();
    };
    const raz = m.el.querySelector('[data-x="raz"]');
    if (raz) raz.onclick = () => {
      delete Store.state.pru[sym];
      Engine.invalidate();
      Store.markDirty();
      m.close();
      apres();
    };
  },

  /* ---------- Glisser-déposer sur la section Comptes ---------- */

  wireDropZone() {
    const zone = document.getElementById('op-accounts-card');
    if (!zone) return;
    let depth = 0; // dragenter/dragleave se déclenchent aussi sur les enfants
    zone.addEventListener('dragenter', e => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      depth++;
      zone.classList.add('drop-active');
    });
    zone.addEventListener('dragover', e => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    zone.addEventListener('dragleave', () => {
      if (--depth <= 0) { depth = 0; zone.classList.remove('drop-active'); }
    });
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      depth = 0;
      zone.classList.remove('drop-active');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      await ScreenOperations.importFiles(files);
    });
    // Un dépôt en dehors de la zone ne doit jamais faire quitter l'application.
    if (!ScreenOperations._globalDropGuard) {
      ScreenOperations._globalDropGuard = true;
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('drop', e => e.preventDefault());
    }
  },

  /* ---------- Import (EX-23…27) ---------- */

  // Point d'entrée commun au bouton et au glisser-déposer : même chemin,
  // donc même dédoublonnage (EX-27) et même affectation des mois (EX-110).
  async importFiles(fileList) {
    if (!Store.state.accounts.length) {
      UI.error('Aucun compte n\'existe encore.', 'Créez d\'abord vos comptes, puis déposez les relevés.');
      return;
    }
    const m = ScreenOperations.importModal();
    const files = [];
    for (const f of fileList) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    await m.analyze(files);
  },

  importModal() {
    const m = UI.modal(`
      <h2>Importer des relevés</h2>
      <p class="small">Déposez une archive ZIP contenant tous vos relevés — plusieurs comptes et
      plusieurs mois mélangés, archives imbriquées comprises — ou des fichiers CSV / XLSX / QIF / OFX / JSON.
      Chaque opération sera affectée au bon compte et au bon mois. Réimporter ne crée aucun doublon.</p>
      <div class="field">
        <input type="file" id="im-files" multiple accept=".zip,.csv,.txt,.tsv,.qif,.ofx,.qfx,.json,.xlsx">
      </div>
      <div id="im-preview"></div>
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok" disabled>Importer</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    let session = null;

    // Analyse partagée par le sélecteur de fichiers et le glisser-déposer.
    m.analyze = async (files) => {
      const pv = m.el.querySelector('#im-preview');
      pv.innerHTML = '<div class="empty">Analyse des fichiers…</div>';
      try {
        session = await Importer.analyze(files);
      } catch (err) {
        pv.innerHTML = '';
        UI.error(`Analyse impossible : ${err.message}`, 'Vérifiez le format des fichiers.');
        return;
      }
      let html = '';
      if (session.errors.length) {
        html += `<div class="notice warn">${session.errors.map(U.escapeHtml).join('<br>')}</div>`;
      }
      if (session.files.length) {
        html += `<table><tr><th>Relevé</th><th>Compte</th><th class="num">Nouvelles</th><th class="num">Doublons ignorés</th></tr>`;
        for (const f of session.files) {
          const sel = f.accountId
            ? `${U.escapeHtml(Engine.account(f.accountId).name)} <span class="badge or" title="reconnu par ${U.escapeHtml(f.matchedBy || '')}">reconnu</span>`
            : `<select data-res="${U.escapeHtml(f.path)}">${['<option value="">— choisir le compte —</option>',
                ...Engine.accountsSorted().map(a => `<option value="${a.id}">${U.escapeHtml(a.name)}</option>`)].join('')}</select>
               <div class="small">sera mémorisé pour les prochains imports</div>`;
          const nPos = f.parsed.positions ? f.parsed.positions.filter(p => p.open).length : 0;
          html += `<tr><td>${U.escapeHtml(f.path)}<div class="small">${f.parsed.rows.length} lignes ·
              ${f.parsed.kind === 'broker' ? 'courtier' : 'banque'}${nPos ? ` · ${nPos} position(s)` : ''}</div></td>
            <td>${sel}</td><td class="num">${f.newRows.length}</td><td class="num">${f.dupCount}</td></tr>`;
        }
        html += `</table>`;
      } else if (!session.errors.length) {
        html += `<div class="empty">Rien à importer.</div>`;
      }
      pv.innerHTML = html;
      m.el.querySelector('[data-x="ok"]').disabled = !session.files.length;
    };

    m.el.querySelector('#im-files').onchange = async (e) => {
      const files = [];
      for (const f of e.target.files) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      await m.analyze(files);
    };
    m.el.querySelector('[data-x="ok"]').onclick = async (e) => {
      if (!session) return;
      const resolutions = {};
      let missing = false;
      m.el.querySelectorAll('[data-res]').forEach(sel => {
        if (sel.value) resolutions[sel.dataset.res] = sel.value;
        else missing = true;
      });
      if (missing) { UI.error('Des fichiers n\'ont pas de compte attribué.', 'Choisissez un compte pour chaque fichier, il sera mémorisé.'); return; }
      await UI.busy(e.target, async () => {
        const report = Importer.apply(session, resolutions);
        m.close();
        UI.toast(`Import terminé : <b>${report.added}</b> opération(s) ajoutée(s), ${report.dup} doublon(s) ignoré(s)` +
          (report.trades ? `, ${report.trades} position(s) mise(s) à jour` : '') + '.');
        ScreenOperations.render();
        if (report.dateParValeur) {
          UI.toast("Ce relevé ne porte que la <b>date de valeur</b> : les opérations peuvent être " +
            "décalées d'un jour ou deux. Préférez un export contenant la date d'opération.", 'error');
        }
        ScreenOperations.proposerSoldesReleves(report.soldes);
        ScreenOperations.proposeCashCertification();
      });
    };
    return m;
  },

  // Le relevé porte souvent son propre solde (« Nouveau solde au 31/08/2026 »).
  // C'est la meilleure certification qui soit : elle vient de la banque, à une
  // date précise, et elle ferme la question du solde juste. On la propose —
  // c'est l'utilisateur qui certifie, jamais l'application (P2).
  proposerSoldesReleves(soldes) {
    if (!soldes || !soldes.length) return;
    // Un seul solde par compte : le plus récent que le relevé annonce.
    const parCompte = new Map();
    for (const s of soldes) {
      const p = parCompte.get(s.accountId);
      if (!p || s.date > p.date) parCompte.set(s.accountId, s);
    }
    const propositions = [...parCompte.values()].filter(s => {
      const a = Engine.account(s.accountId);
      if (!a) return false;
      // Inutile si l'on certifie déjà exactement cela.
      return !Store.state.certifications.some(c =>
        c.accountId === s.accountId && c.date === s.date && c.balance === s.balance);
    });
    if (!propositions.length) return;

    const lignes = propositions.map(s => {
      const a = Engine.account(s.accountId);
      const actuel = Engine.cashBalance(s.accountId, s.date);
      const ecart = actuel == null ? null : s.balance - actuel;
      return `<tr>
        <td><input type="checkbox" data-sc="${s.accountId}" checked></td>
        <td>${U.escapeHtml(a.name)}</td>
        <td>${U.fmtDate(s.date)}</td>
        <td class="num">${U.fmtEUR(s.balance)}</td>
        <td class="num">${actuel == null ? '<span class="muted">non certifié</span>'
          : ecart === 0 ? '<span class="up">exact</span>'
          : `<span class="down">${ecart > 0 ? '+' : ''}${U.fmtEUR(ecart)}</span>`}</td>
      </tr>`;
    }).join('');

    const m = UI.modal(`
      <h2>Le relevé annonce son propre solde</h2>
      <p class="small">Certifier ce solde ancre le compte sur un fait vérifiable : tout le reste —
      soldes passés, patrimoine, projections — s'en déduit. La colonne « écart » compare ce que dit
      la banque à ce qu'Essor reconstruit aujourd'hui ; un écart non nul signale des opérations
      manquantes ou en trop sur la période.</p>
      <table>
        <tr><th></th><th>Compte</th><th>Date</th><th class="num">Solde annoncé</th><th class="num">Écart avec Essor</th></tr>
        ${lignes}
      </table>
      <div class="actions">
        <button class="ghost" data-x="non">Ne pas certifier</button>
        <button class="primary" data-x="oui">Certifier ces soldes</button>
      </div>`);
    m.el.querySelector('[data-x="non"]').onclick = m.close;
    m.el.querySelector('[data-x="oui"]').onclick = () => {
      let n = 0;
      m.el.querySelectorAll('[data-sc]:checked').forEach(cb => {
        const s = parCompte.get(cb.dataset.sc);
        if (!s) return;
        Store.state.certifications.push({ id: U.uid(), accountId: s.accountId, date: s.date, balance: s.balance });
        n++;
      });
      Engine.invalidate();
      Store.markDirty();
      m.close();
      if (n) UI.toast(`${n} solde(s) certifié(s) d'après le relevé. Les soldes passés et actuels en découlent.`);
      ScreenOperations.render();
    };
  },

  // Après un import, un compte à titres dont les espèces ne sont pas
  // certifiées voit son argent non investi manquer au patrimoine (EX-111).
  // On propose la certification qui découle des mouvements importés — mais
  // c'est l'utilisateur qui certifie, l'application ne décide jamais à sa
  // place (P2).
  proposeCashCertification() {
    const manquants = Engine.accountsWithUnknownCash()
      .map(a => ({ a, flux: Engine.cashFlowTotal(a.id), n: Store.state.transactions.filter(t => t.accountId === a.id).length }))
      .filter(x => x.n > 0);
    if (!manquants.length) return;
    const lignes = manquants.map((x, i) => {
      const premier = Store.state.transactions.filter(t => t.accountId === x.a.id)
        .map(t => t.date).sort()[0];
      return `<tr>
        <td><input type="checkbox" data-i="${i}" checked style="width:auto"> ${U.escapeHtml(x.a.name)}
          <div class="small">${x.n} mouvement(s) espèces depuis le ${U.fmtDate(premier)}</div></td>
        <td class="num stat-val">${U.fmtEUR(x.flux)}</td></tr>`;
    }).join('');
    const m = UI.modal(`
      <h2>Argent non encore investi</h2>
      <p class="small">Ces comptes détiennent des titres, mais leur solde espèces n'est pas certifié :
      les versements que vous n'avez pas encore investis <b>manquent à votre patrimoine</b>.</p>
      <p class="small">Si le rapport importé couvre toute la vie du compte, le solde espèces
      d'aujourd'hui vaut la somme de ses mouvements :</p>
      <table><tr><th>Compte</th><th class="num">Solde espèces déduit</th></tr>${lignes}</table>
      <div class="notice">Cette certification vaut au ${U.fmtDate(U.today())}. Si le montant ne
      correspond pas à ce qu'affiche votre courtier, corrigez-le ensuite par
      « Certifier un solde » — c'est votre certification qui fait foi, pas le calcul.</div>
      <div class="actions">
        <button class="ghost" data-x="no">Plus tard</button>
        <button class="primary" data-x="ok">Certifier les comptes cochés</button>
      </div>`);
    m.el.querySelector('[data-x="no"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      let n = 0;
      m.el.querySelectorAll('[data-i]:checked').forEach(cb => {
        const x = manquants[Number(cb.dataset.i)];
        Store.state.certifications.push({ id: U.uid(), accountId: x.a.id, date: U.today(), balance: x.flux });
        n++;
      });
      Engine.invalidate();
      m.close();
      if (n) UI.toast(`${n} solde(s) espèces certifié(s) — l'argent non investi compte désormais dans le patrimoine.`);
      ScreenOperations.render();
    };
  },

  /* ---------- Liste des opérations ---------- */

  filteredTxs() {
    const f = ScreenOperations.filters;
    const months = UI.periodMonths();
    const set = new Set(months);
    let txs = Store.state.transactions.filter(t => set.has(Engine.budgetMonth(t)));
    if (f.accountId !== 'all') txs = txs.filter(t => t.accountId === f.accountId);
    if (f.lineId !== 'all') txs = txs.filter(t => t.lineId === f.lineId);
    if (f.type === 'expense') txs = txs.filter(t => t.amount < 0 && !t.internal);
    else if (f.type === 'income') txs = txs.filter(t => t.amount > 0 && !t.internal);
    else if (f.type === 'internal') txs = txs.filter(t => t.internal);
    else if (f.type === 'shifted') txs = txs.filter(t => t.monthOverride);
    else if (f.type === 'uncat') txs = txs.filter(t => !t.lineId && !t.internal);
    if (f.text) {
      const q = U.normLabel(f.text);
      txs = txs.filter(t => U.normLabel(t.label).includes(q));
    }
    return txs.sort((a, b) => a.date < b.date ? 1 : -1);
  },

  selection: new Set(),

  renderList() {
    const holder = document.getElementById('op-list');
    if (!holder) return;   // la fiche d'opération s'ouvre aussi depuis d'autres écrans
    const txs = ScreenOperations.filteredTxs();
    ScreenOperations.selection.clear();
    document.getElementById('op-del-sel').style.display = 'none';
    if (!txs.length) { holder.innerHTML = '<div class="empty">Aucune opération sur cette période avec ces filtres.</div>'; return; }
    const cap = 400;
    const shown = txs.slice(0, cap);
    const rows = shown.map(t => {
      const a = Engine.account(t.accountId);
      const line = t.lineId ? Engine.budgetLine(t.lineId) : null;
      let badge = '';
      if (!t.lineId && !t.internal && Rules.estEquivoque(Rules.merchantKey(t.label))) {
        badge = `<span class="badge cuivre" title="Ce commerçant a été classé de plusieurs façons : chaque opération se classe séparément">à classer — commerçant polyvalent</span>`;
      }
      if (t.internal) badge = `<span class="badge argent" title="mouvement entre vos comptes — ni dépensé, ni gagné">interne</span>`;
      else if (line) badge = `<span class="badge ${t.auto === 'guess' ? 'guess' : 'or'}" title="${t.auto === 'guess' ? 'classement deviné d\'après le libellé — cliquez pour corriger' : t.auto === 'rule' ? 'classé par règle' : 'classé manuellement'}">${U.escapeHtml(line.line.name)}${t.auto === 'guess' ? ' ?' : ''}</span>`;
      // Rattachement à un autre mois visiblement signalé (EX-48, P7).
      const shifted = t.monthOverride
        ? ` <span class="badge cuivre" title="opération du ${U.fmtDate(t.date)} rattachée comptablement à ${U.fmtMonth(t.monthOverride)}">→ ${U.fmtMonthShort(t.monthOverride)}</span>` : '';
      const cls = t.internal ? 'neutral-c' : (t.amount < 0 ? '' : 'up');
      return `<tr data-id="${t.id}" class="${ScreenOperations.selection.has(t.id) ? 'selected' : ''}">
        <td class="checkbox-cell"><input type="checkbox" data-sel="${t.id}" style="width:auto"></td>
        <td class="num small">${U.fmtDate(t.date)}${shifted}</td>
        <td class="clickable" data-edit="${t.id}">${U.escapeHtml(t.label)} ${badge}</td>
        <td class="small">${a ? U.escapeHtml(a.name) : '?'}</td>
        <td class="num ${cls}">${U.fmtEUR(t.amount, { forceSign: true })}</td>
      </tr>`;
    }).join('');
    holder.innerHTML = `
      <table>
        <tr><th class="checkbox-cell"><input type="checkbox" id="sel-all" style="width:auto"></th>
        <th>Date</th><th>Libellé</th><th>Compte</th><th class="num">Montant</th></tr>${rows}
      </table>
      ${txs.length > cap ? `<div class="hint">${txs.length - cap} opérations non affichées — affinez les filtres ou la période.</div>` : ''}`;

    holder.querySelectorAll('[data-sel]').forEach(cb => cb.onchange = () => {
      const id = cb.dataset.sel;
      if (cb.checked) ScreenOperations.selection.add(id); else ScreenOperations.selection.delete(id);
      cb.closest('tr').classList.toggle('selected', cb.checked);
      ScreenOperations._updateDelBtn();
    });
    holder.querySelector('#sel-all').onchange = (e) => {
      holder.querySelectorAll('[data-sel]').forEach(cb => {
        cb.checked = e.target.checked;
        cb.dispatchEvent(new Event('change'));
      });
    };
    holder.querySelectorAll('[data-edit]').forEach(td => td.onclick = () => ScreenOperations.editModal(td.dataset.edit));
    document.getElementById('op-del-sel').onclick = () => ScreenOperations.deleteSelected();
  },

  _updateDelBtn() {
    const b = document.getElementById('op-del-sel');
    if (!b) return;
    const n = ScreenOperations.selection.size;
    b.style.display = n ? '' : 'none';
    b.textContent = `Supprimer la sélection (${n})`;
  },

  deleteSelected() {
    // Sélection multiple → suppression en une fois (EX-29), avec aperçu chiffré (EX-86).
    const ids = new Set(ScreenOperations.selection);
    const txs = Store.state.transactions.filter(t => ids.has(t.id));
    const total = U.sum(txs, t => t.amount);
    UI.confirmDestructive({
      title: `Supprimer ${txs.length} opération(s)`,
      previewHtml: `<p>${txs.length} opération(s) seront supprimées, pour un total net de
        <b class="num">${U.fmtEUR(total)}</b> (du ${U.fmtDate(txs.map(t => t.date).sort()[0])}
        au ${U.fmtDate(txs.map(t => t.date).sort().pop())}).
        Les soldes reconstruits et l'historique du patrimoine seront recalculés.</p>`,
      confirmLabel: 'Supprimer',
      onConfirm: () => {
        Store.state.transactions = Store.state.transactions.filter(t => !ids.has(t.id));
        Engine.invalidate();
        ScreenOperations.render();
        UI.toast(`${txs.length} opération(s) supprimée(s).`);
      },
    });
  },

  // onSaved : rappel de l'écran appelant, pour qu'il se rafraîchisse. La fiche
  // s'ouvre aussi bien depuis la liste des opérations que depuis le détail
  // d'une ligne de budget.
  editModal(txId, onSaved) {
    const t = Store.state.transactions.find(t => t.id === txId);
    if (!t) return;
    const a = Engine.account(t.accountId);
    const monthOpts = (() => {
      const base = U.monthOf(t.date);
      return [-2, -1, 0, 1, 2].map(d => U.addMonths(base, d))
        .map(mo => `<option value="${mo === base ? '' : mo}" ${((t.monthOverride || '') === (mo === base ? '' : mo)) ? 'selected' : ''}>
          ${U.fmtMonth(mo)}${mo === base ? ' (mois de la date)' : ''}</option>`).join('');
    })();
    const rawHtml = t.raw ? Object.entries(t.raw).slice(0, 12).map(([k, v]) =>
      `<tr><td class="small">${U.escapeHtml(k)}</td><td class="small">${U.escapeHtml(String(v))}</td></tr>`).join('') : '';
    const m = UI.modal(`
      <h2>Opération</h2>
      <p><b>${U.escapeHtml(t.label)}</b><br>
      <span class="small">${U.fmtDate(t.date)} · ${a ? U.escapeHtml(a.name) : '?'} ·
      <span class="num">${U.fmtEUR(t.amount, { forceSign: true })}</span></span></p>
      ${UI.catLineSelect('ed-cat', 'ed-line', t.lineId)}
      <div class="row">
        <div class="field"><label>Mouvement interne (ni dépensé, ni gagné)</label>
          <select id="ed-internal">
            <option value="" ${!t.internal ? 'selected' : ''}>Non</option>
            <option value="1" ${t.internal ? 'selected' : ''}>Oui — virement entre mes comptes</option>
          </select></div>
      </div>
      <div class="field"><label>Mois comptable — la date et le montant ne changent pas, seule l'analyse budgétaire suit ce choix</label>
        <select id="ed-month">${monthOpts}</select></div>
      ${rawHtml ? `<details><summary class="small clickable">Données brutes du relevé (conservées intégralement)</summary>
        <table>${rawHtml}</table></details>` : ''}
      <div class="actions">
        <button class="danger" data-x="del">Supprimer</button>
        <span class="spacer"></span>
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Enregistrer</button>
      </div>`);
    UI.wireCatLine(m.el, 'ed-cat', 'ed-line');
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="del"]').onclick = () => {
      m.close();
      ScreenOperations.selection = new Set([t.id]);
      ScreenOperations.deleteSelected();
    };
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const resolu = UI.resolveCatLine(m.el, 'ed-cat', 'ed-line');
      if (resolu === false) return;        // création abandonnée : on ne ferme rien
      const newLine = resolu;
      const newInternal = !!m.el.querySelector('#ed-internal').value;
      const newMonth = m.el.querySelector('#ed-month').value || null;
      const lineChanged = newLine !== (t.lineId || null);
      const internalChanged = newInternal !== !!t.internal;
      if (internalChanged) { t.internal = newInternal; t.internalLocked = true; }
      t.monthOverride = newMonth; // P3 : la date reste un fait, le mois une interprétation
      if (lineChanged) {
        t.lineId = newLine;
        t.auto = false; // choix manuel : prime sur tout classement automatique (EX-38)
      }
      Engine.invalidate();
      m.close();
      // Marquer une opération « interne » est une décision aussi apprenable
      // qu'un classement : elle donne lieu à une règle, elle aussi.
      if ((lineChanged && newLine) || internalChanged) ScreenOperations.proposeRule(t, { internalChanged });
      else ScreenOperations.renderList();
      if (onSaved) onSaved(t);
    };
  },

  // Après une correction manuelle, la règle s'applique d'elle-même à toutes
  // les opérations du même commerçant restées sans catégorie (EX-36, P6) —
  // pas de fenêtre à valider. Ce qui est déjà classé n'est jamais réécrit.
  // L'action est annoncée et annulable : automatique ne veut pas dire
  // invisible (P7).
  proposeRule(t, { internalChanged } = {}) {
    const key = Rules.merchantKey(t.label);
    const line = t.lineId ? Engine.budgetLine(t.lineId) : null;
    if (!key || (!line && !internalChanged)) { ScreenOperations.renderList(); return; }

    // Un commerçant que vous avez déjà classé ailleurs à la main n'est pas
    // généralisable : Amazon vend un cadeau et un achat personnel. On le
    // constate ici, on le dit, et on cesse de généraliser (EX-114).
    if (line) {
      const autres = Rules.classementsManuels(key, t.id).filter(id => id !== t.lineId);
      if (autres.length || Rules.estEquivoque(key)) {
        const noms = autres.map(id => Engine.budgetLine(id)).filter(Boolean)
          .map(i => `${i.category ? i.category.name + ' · ' : ''}${i.line.name}`);
        const remis = Rules.marquerEquivoque(key);
        for (const r of remis) {
          const x = Store.state.transactions.find(x => x.id === r.id);
          if (x) { x.lineId = null; x.auto = undefined; }
        }
        Engine.invalidate();
        ScreenOperations.renderList();
        UI.toastAction(
          `<b>« ${U.escapeHtml(key)} » n'est pas classé toujours pareil.</b>
           ${noms.length ? `Vous l'aviez mis dans ${noms.map(U.escapeHtml).join(', ')}, et cette fois dans
           ${U.escapeHtml(line.line.name)}.` : ''}
           Ce commerçant ne sera plus généralisé : ses opérations restent à classer une par une.
           ${remis.length ? `<br>${remis.length} opération(s) classée(s) par l'ancienne règle sont remises « à classer ».` : ''}`,
          remis.length ? 'Rétablir la règle' : 'Généraliser quand même',
          () => {
            Rules.reconnaitreUnivoque(key);
            for (const r of remis) {
              const x = Store.state.transactions.find(x => x.id === r.id);
              if (x) { x.lineId = r.lineId; x.auto = r.auto; }
            }
            Rules.addRule(key, t.lineId);
            Rules.applyToUncategorized(key, t.lineId, { exceptId: t.id });
            Engine.invalidate();
            Store.markDirty();
            UI.toast('Règle rétablie pour ce commerçant.');
            ScreenOperations.renderList();
          });
        return;
      }
    }

    // Mémoire de l'état antérieur, pour rendre l'opération réversible.
    const regleAvant = Store.state.rules.find(r => r.pattern === key);
    const snapshot = regleAvant ? { ...regleAvant } : null;
    const interne = internalChanged ? !!t.internal : undefined;

    Rules.addRule(key, t.lineId || undefined, null, { internal: interne });
    const touchees = Rules.applyToUncategorized(key, t.lineId || null,
      { exceptId: t.id, internal: interne });
    const avant = new Map();   // pour l'annulation
    for (const id of touchees) {
      const x = Store.state.transactions.find(x => x.id === id);
      if (x) avant.set(id, { lineId: x.lineId, internal: !!x.internal, auto: x.auto, internalBy: x.internalBy });
    }
    ScreenOperations.renderList();

    const quoi = [
      line ? `classée(s) dans ${U.escapeHtml(line.category ? line.category.name + ' · ' : '')}${U.escapeHtml(line.line.name)}` : null,
      interne === true ? 'marquée(s) comme mouvement interne' : interne === false ? 'sorties des mouvements internes' : null,
    ].filter(Boolean).join(' et ');

    if (touchees.length) {
      UI.toastAction(
        `<b>${touchees.length} opération(s) « ${U.escapeHtml(key)} »</b> ${quoi}.
         La règle vaudra aussi pour les prochains imports.`,
        'Annuler', () => {
          for (const [id, etat] of avant) {
            const x = Store.state.transactions.find(x => x.id === id);
            if (!x) continue;
            x.lineId = etat.lineId; x.auto = etat.auto;
            x.internal = etat.internal; x.internalBy = etat.internalBy;
          }
          Store.state.rules = Store.state.rules.filter(r => r.pattern !== key);
          if (snapshot) Store.state.rules.push(snapshot);
          Engine.invalidate();
          Store.markDirty();
          UI.toast('Modification annulée.');
          ScreenOperations.renderList();
        });
    } else {
      UI.toast(`Règle enregistrée : « ${U.escapeHtml(key)} » → ${quoi || 'sans effet immédiat'}.
        Elle s'appliquera aux prochaines opérations de ce libellé.`);
    }
  },

  /* ---------- Purge (EX-34) ---------- */

  purgeModal() {
    const S = Store.state;
    const n = S.transactions.length;
    if (!n) { UI.toast('Aucune opération à purger.'); return; }
    const months = new Set(S.transactions.map(t => U.monthOf(t.date)));
    UI.confirmDestructive({
      title: 'Purger toutes les opérations',
      previewHtml: `<p>Seront supprimées : <b>${n} opérations</b> réparties sur <b>${months.size} mois</b>.</p>
        <p>Seront <b>conservés</b> : les soldes certifiés, les positions et mouvements de titres,
        les comptes, les règles de catégorisation, le budget, les cibles et tous les réglages.</p>
        <p class="small">Usage prévu : repartir sur un import propre.</p>`,
      confirmLabel: `Purger ${n} opérations`,
      onConfirm: () => {
        S.transactions = [];
        Engine.invalidate();
        ScreenOperations.render();
        UI.toast('Opérations purgées. Les soldes certifiés, positions, comptes et réglages sont intacts.');
      },
    });
  },
};
