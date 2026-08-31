/* Essor — briques d'interface partagées : modales, toasts, boutons occupés
   (EX-87), période globale (EX-79…82), indicateur d'enregistrement (EX-93). */
'use strict';

const UI = {

  /* ---------- Toasts ---------- */

  toast(msg, kind = 'ok') {
    let zone = document.querySelector('.toast-zone');
    if (!zone) { zone = document.createElement('div'); zone.className = 'toast-zone'; document.body.appendChild(zone); }
    const el = document.createElement('div');
    el.className = 'toast' + (kind === 'error' ? ' error' : '');
    el.innerHTML = msg;
    zone.appendChild(el);
    setTimeout(() => el.remove(), kind === 'error' ? 9000 : 4500);
  },

  // Message porteur d'une action — sert à signaler une requalification
  // automatique tout en laissant revenir en arrière (P7).
  toastAction(msg, libelle, action) {
    let zone = document.querySelector('.toast-zone');
    if (!zone) { zone = document.createElement('div'); zone.className = 'toast-zone'; document.body.appendChild(zone); }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div>${msg}</div>`;
    const b = document.createElement('button');
    b.className = 'ghost';
    b.style.marginTop = '8px';
    b.textContent = libelle;
    b.onclick = () => { el.remove(); action(); };
    el.appendChild(b);
    zone.appendChild(el);
    setTimeout(() => el.remove(), 12000);   // laisse le temps de lire et d'annuler
  },

  // Tout message d'erreur nomme la cause et l'action corrective (EX-88).
  error(cause, action) {
    UI.toast(`<b>${U.escapeHtml(cause)}</b><br>${U.escapeHtml(action || '')}`, 'error');
  },

  /* ---------- Champ secret ---------- */

  // Une phrase de passe longue se tape mal à l'aveugle, surtout au pouce sur un
  // téléphone. On la montre à la demande : c'est le geste que fait tout le
  // monde, et le masquage par défaut suffit contre le regard par-dessus l'épaule.
  secret(id, { placeholder = '', autocomplete = 'current-password', requis = false } = {}) {
    return `<div class="champ-secret">
      <input type="password" id="${id}" placeholder="${U.escapeHtml(placeholder)}"
        autocomplete="${autocomplete}" autocapitalize="off" autocorrect="off"
        spellcheck="false" ${requis ? 'required' : ''}>
      <button type="button" class="oeil" data-oeil="${id}"
        aria-label="Afficher la phrase" title="Afficher la phrase">${UI.OEIL}</button>
    </div>`;
  },

  OEIL: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1.6 12S5.3 5.5 12 5.5 22.4 12 22.4 12 18.7 18.5 12 18.5 1.6 12 1.6 12Z"/><circle cx="12" cy="12" r="3.1"/></svg>',
  OEIL_BARRE: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1.6 12S5.3 5.5 12 5.5c1.6 0 3 .37 4.2.94M22.4 12s-3.7 6.5-10.4 6.5c-1.7 0-3.1-.4-4.3-1"/><path d="M9.9 9.9a3.1 3.1 0 004.3 4.3"/><path d="M3 3l18 18"/></svg>',

  /* ---------- Modales ---------- */

  modal(html, { onClose } = {}) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); if (onClose) onClose(); };
    back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    return { el: back.querySelector('.modal'), close };
  },

  // Action destructrice : aperçu chiffré obligatoire, jamais une simple
  // confirmation (EX-86). previewHtml doit détailler ce qui va se passer.
  confirmDestructive({ title, previewHtml, confirmLabel, onConfirm }) {
    const m = UI.modal(`
      <h2>${U.escapeHtml(title)}</h2>
      ${previewHtml}
      <div class="notice warn">Une sauvegarde complète horodatée et chiffrée sera créée avant
      l'exécution — sur cet appareil, et dans « backups » du dépôt. L'application ne les
      supprime jamais.</div>
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="danger" data-x="ok">${U.escapeHtml(confirmLabel)}</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = async (e) => {
      await UI.busy(e.target, async () => {
        await Store.backup(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)); // EX-95
        await onConfirm();
      });
      m.close();
    };
    return m;
  },

  // Confirmation simple, pour un choix conséquent mais non destructeur
  // (couper la synchronisation, exporter en clair). Les suppressions, elles,
  // passent par confirmDestructive : aperçu chiffré et sauvegarde d'office.
  confirm(titre, detail, onOui, { libelle = 'Continuer', danger = false } = {}) {
    const m = UI.modal(`
      <h2>${U.escapeHtml(titre)}</h2>
      <p>${detail}</p>
      <div class="actions">
        <button class="ghost" data-x="non">Annuler</button>
        <button class="${danger ? 'danger' : 'primary'}" data-x="oui">${U.escapeHtml(libelle)}</button>
      </div>`);
    m.el.querySelector('[data-x="non"]').onclick = m.close;
    m.el.querySelector('[data-x="oui"]').onclick = async (e) => {
      await UI.busy(e.target, async () => { await onOui(); });
      m.close();
    };
    return m;
  },

  // Toute action longue indique son état sur son déclencheur (EX-87).
  async busy(button, fn) {
    if (!button) return fn();
    button.classList.add('busy');
    button.disabled = true;
    try { return await fn(); }
    catch (e) {
      console.error(e);
      UI.error(e.message || 'Une erreur est survenue.', 'Réessayez ; si le problème persiste, vérifiez la connexion et les Réglages → Synchronisation.');
    }
    finally { button.classList.remove('busy'); button.disabled = false; }
  },

  /* ---------- Indicateur d'enregistrement (EX-93) ---------- */

  renderSaveStatus(status, mode) {
    const el = document.getElementById('save-status');
    if (!el) return;
    const labels = {
      saved: mode === 'sync' ? 'Enregistré et synchronisé' : 'Enregistré sur cet appareil',
      saving: 'Enregistrement…',
      dirty: 'Modifications en attente…',
      // Le distinguo compte : les données SONT à l'abri, seul le dépôt attend.
      local: 'Enregistré ici — synchronisation en attente',
      conflit: 'Enregistré ici — le dépôt attend votre arbitrage',
      error: 'ÉCHEC d\'enregistrement',
    };
    el.className = status === 'local' ? 'dirty' : status === 'conflit' ? 'error' : status;
    el.title = status === 'local' ? (Store._raisonAttente || '')
      : status === 'conflit' ? 'Cliquez pour trancher : reprendre la version du dépôt, ou imposer la vôtre.'
      : mode === 'local' ? 'Aucune synchronisation configurée (Réglages → Synchronisation).' : '';
    // Un état bloquant doit toujours offrir sa sortie, à portée de clic.
    el.style.cursor = status === 'conflit' ? 'pointer' : '';
    el.onclick = status === 'conflit' ? () => App.conflitModal() : null;
    el.innerHTML = `<span class="dot"></span>${labels[status] || status}`;
  },

  /* ---------- Période globale (EX-79, EX-80) ---------- */

  period() {
    const p = Store.state.ui.period;
    if (!p.month && p.kind === 'month') p.month = U.currentMonth();
    return p;
  },

  // Mois couverts par la période choisie.
  periodMonths() {
    const p = UI.period();
    const cur = U.currentMonth();
    if (p.kind === 'month') return [p.month || cur];
    const first = Engine.firstKnownMonth() || cur;
    if (p.rolling === 'all') return U.monthRange(first, cur);
    const n = p.rolling || 12;
    const from = U.addMonths(cur, -(n - 1));
    return U.monthRange(from < first ? first : from, cur);
  },

  // Mois qu'analyse un écran par nature mensuel (EX-82) : le mois choisi, ou
  // le dernier mois de la période glissante.
  analyzedMonth() {
    const months = UI.periodMonths();
    return months[months.length - 1];
  },

  periodLabel() {
    const p = UI.period();
    if (p.kind === 'month') return U.fmtMonth(p.month || U.currentMonth());
    if (p.rolling === 'all') return 'Tout l\'historique';
    return `${p.rolling || 12} derniers mois`;
  },

  // Rendu du sélecteur — unique et global (EX-79), masqué sur l'écran du
  // patrimoine qui est une photo de l'instant (EX-81).
  renderPeriodPicker(visible) {
    const holder = document.getElementById('period-picker');
    if (!visible) { holder.innerHTML = ''; return; }
    const p = UI.period();
    const cur = U.currentMonth();
    const first = Engine.firstKnownMonth() || cur;
    const monthOpts = U.monthRange(first, cur).reverse()
      .map(m => `<option value="m:${m}" ${p.kind === 'month' && p.month === m ? 'selected' : ''}>${U.fmtMonth(m)}</option>`).join('');
    holder.innerHTML = `
      <button class="ghost" id="pp-prev" title="Mois précédent">‹</button>
      <select id="pp-select">
        ${monthOpts}
        <option value="r:12" ${p.kind === 'rolling' && p.rolling === 12 ? 'selected' : ''}>12 derniers mois</option>
        <option value="r:24" ${p.kind === 'rolling' && p.rolling === 24 ? 'selected' : ''}>24 derniers mois</option>
        <option value="r:all" ${p.kind === 'rolling' && p.rolling === 'all' ? 'selected' : ''}>Tout l'historique</option>
      </select>
      <button class="ghost" id="pp-next" title="Mois suivant">›</button>`;
    holder.querySelector('#pp-select').onchange = (e) => {
      const [k, v] = e.target.value.split(':');
      if (k === 'm') Store.state.ui.period = { kind: 'month', month: v };
      else Store.state.ui.period = { kind: 'rolling', rolling: v === 'all' ? 'all' : Number(v) };
      Store.markDirty();
      App.render();
    };
    const shiftMonth = (d) => {
      const pp = UI.period();
      const base = pp.kind === 'month' ? pp.month : U.currentMonth();
      const next = U.addMonths(base, d);
      if (next > cur || next < first) return;
      Store.state.ui.period = { kind: 'month', month: next };
      Store.markDirty();
      App.render();
    };
    holder.querySelector('#pp-prev').onclick = () => shiftMonth(-1);
    holder.querySelector('#pp-next').onclick = () => shiftMonth(1);
  },

  /* ---------- Petites briques ---------- */

  amountInput(id, cents, placeholder = '') {
    const v = cents != null ? (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, useGrouping: false }) : '';
    return `<input class="amount" id="${id}" value="${v}" placeholder="${placeholder}" size="10">`;
  },

  readAmount(el) {
    return U.parseAmount(el.value);
  },

  accountSelect(id, selected, { allowNone } = {}) {
    const opts = Engine.accountsSorted().filter(a => !a.closed)
      .map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${U.escapeHtml(a.name)}</option>`).join('');
    return `<select id="${id}">${allowNone ? `<option value="">—</option>` : ''}${opts}</select>`;
  },

  // Sélecteur à deux niveaux : catégorie, puis sous-catégorie. Rendre la
  // catégorie explicite permet d'en changer directement, au lieu de chercher
  // la bonne ligne dans une longue liste à plat.
  // À appeler avec UI.wireCatLine(racine, idCat, idLigne) après insertion.
  catLineSelect(idCat, idLine, selectedLineId) {
    const groupes = UI._groupes();
    let catSel = '';
    for (const g of groupes) if (g.lines.some(l => l.id === selectedLineId)) catSel = g.id;
    const catOpts = `<option value="">— sans catégorie —</option>` +
      groupes.map(g => `<option value="${g.id}" ${g.id === catSel ? 'selected' : ''}>${U.escapeHtml(g.name)}</option>`).join('');
    const g = groupes.find(x => x.id === catSel);
    return `<div class="row">
      <div class="field"><label>Catégorie</label><select id="${idCat}">${catOpts}</select></div>
      <div class="field"><label>Sous-catégorie</label>
        <select id="${idLine}">${UI._optionsLignes(g, selectedLineId)}</select></div>
    </div>`;
  },

  // Une opération se rattache à une sous-catégorie, jamais à une catégorie
  // seule. Une catégorie encore vide doit donc pouvoir en recevoir une sur
  // place, sans quoi la choisir ne mènerait nulle part.
  NOUVELLE: '__nouvelle',

  _optionsLignes(groupe, selectedLineId) {
    if (!groupe) return '<option value="">—</option>';
    const opts = groupe.lines.map(l =>
      `<option value="${l.id}" ${l.id === selectedLineId ? 'selected' : ''}>${U.escapeHtml(l.name)}</option>`).join('');
    const creer = `<option value="${UI.NOUVELLE}" ${groupe.lines.length ? '' : 'selected'}>＋ Nouvelle sous-catégorie…</option>`;
    return opts + creer;
  },

  _groupes() {
    const b = Store.state.budget;
    return [
      ...b.categories.map(c => ({ id: c.id, name: c.name, lines: c.lines })),
      { id: '__revenus', name: 'Revenus', lines: b.incomes },
      { id: '__epargne', name: 'Épargne', lines: b.savings },
    ];
  },

  wireCatLine(root, idCat, idLine) {
    const cat = root.querySelector('#' + idCat);
    const line = root.querySelector('#' + idLine);
    cat.onchange = () => {
      const g = UI._groupes().find(x => x.id === cat.value);
      line.disabled = !g;
      line.innerHTML = UI._optionsLignes(g, null);
    };
  },

  // Résout le choix du couple catégorie / sous-catégorie en identifiant de
  // ligne, en créant la sous-catégorie si l'utilisateur l'a demandé.
  // → id de ligne, ou null (sans catégorie), ou false si l'utilisateur a
  //   renoncé à nommer la nouvelle sous-catégorie.
  resolveCatLine(root, idCat, idLine) {
    const catId = root.querySelector('#' + idCat).value;
    if (!catId) return null;
    const valeur = root.querySelector('#' + idLine).value;
    if (valeur && valeur !== UI.NOUVELLE) return valeur;

    const b = Store.state.budget;
    const groupe = UI._groupes().find(x => x.id === catId);
    const nom = prompt(`Nom de la nouvelle sous-catégorie dans « ${groupe ? groupe.name : ''} » :`);
    if (!nom || !nom.trim()) return false;
    const ligne = { id: U.uid(), name: nom.trim(), amount: 0 };
    if (catId === '__revenus') b.incomes.push(ligne);
    else if (catId === '__epargne') {
      ligne.accountId = (Engine.accountsSorted().find(a => !a.closed) || {}).id || null;
      b.savings.push(ligne);
    } else {
      const c = b.categories.find(c => c.id === catId);
      if (!c) return false;
      c.lines.push(ligne);
    }
    Store.markDirty();
    return ligne.id;
  },

  lineSelect(id, selected) {
    const b = Store.state.budget;
    let html = `<select id="${id}"><option value="">— sans catégorie —</option>`;
    for (const c of b.categories) {
      html += `<optgroup label="${U.escapeHtml(c.name)}">`;
      for (const l of c.lines) html += `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${U.escapeHtml(l.name)}</option>`;
      html += `</optgroup>`;
    }
    html += `<optgroup label="Revenus">`;
    for (const l of b.incomes) html += `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${U.escapeHtml(l.name)}</option>`;
    html += `</optgroup><optgroup label="Épargne">`;
    for (const l of b.savings) html += `<option value="${l.id}" ${l.id === selected ? 'selected' : ''}>${U.escapeHtml(l.name)}</option>`;
    html += `</optgroup></select>`;
    return html;
  },

  varia(cents, { pct } = {}) {
    if (cents == null) return '<span class="muted">—</span>';
    const cls = cents > 0 ? 'up' : cents < 0 ? 'down' : 'neutral-c';
    return `<span class="${cls} num">${U.fmtEUR(cents, { forceSign: true })}${pct != null ? ` (${U.fmtPct(pct)})` : ''}</span>`;
  },
};

// Bascule « afficher / masquer » de tout champ secret, où qu'il soit rendu —
// écrans d'accueil, modales, Réglages. Un seul écouteur, posé une fois.
document.addEventListener('click', (e) => {
  const b = e.target.closest ? e.target.closest('[data-oeil]') : null;
  if (!b) return;
  const champ = document.getElementById(b.dataset.oeil);
  if (!champ) return;
  const montre = champ.type === 'password';
  champ.type = montre ? 'text' : 'password';
  b.innerHTML = montre ? UI.OEIL_BARRE : UI.OEIL;
  b.setAttribute('aria-label', montre ? 'Masquer la phrase' : 'Afficher la phrase');
  b.title = b.getAttribute('aria-label');
  b.classList.toggle('actif', montre);
  // Rendre la main au champ, curseur en fin de saisie.
  champ.focus();
  const n = champ.value.length;
  try { champ.setSelectionRange(n, n); } catch { /* type=text seulement */ }
});
