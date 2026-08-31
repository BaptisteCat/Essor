/* Essor — écran Budget prévisionnel.
   Catégories à lignes multiples (EX-15), revenus et versements d'épargne
   rattachés à un compte (EX-16), renommage sans orphelins (EX-17),
   recalage sur le réel avec aperçu (EX-18), récurrences non budgétées (EX-19). */
'use strict';

const ScreenBudget = {

  /* ---------- Arborescence proposée ----------
     Un point de départ, pas une règle inscrite dans le comportement de
     l'application (EX-35) : à l'installation, ces catégories et ces règles de
     reconnaissance sont ÉCRITES DANS VOS DONNÉES, où elles deviennent
     modifiables et supprimables comme n'importe quelle autre.
     Les motifs sont comparés au libellé normalisé (majuscules, sans accents) ;
     le plus long l'emporte, ce qui fait qu'« UBER EATS » prime sur « UBER ». */
  MODELE: [
    { nom: 'Logement', lignes: [
      { nom: 'Loyer', motifs: ['FONCIA'] },
      { nom: 'Charges et énergie', motifs: ['EDF', 'ENGIE', 'TOTALENERGIES ELEC', 'VEOLIA', 'SUEZ'] },
      { nom: 'Assurance habitation', motifs: [] },
      { nom: 'Équipement et travaux', motifs: ['LEROY MERLIN', 'CASTORAMA', 'IKEA'] },
    ]},
    { nom: 'Alimentation', lignes: [
      { nom: 'Courses', motifs: ['FRANPRIX', 'INTERMARCHE', 'MONOPRIX', 'GRAND FRAIS', 'LECLERC',
                                 'CARREFOUR', 'AUCHAN', 'LIDL', 'ALDI', 'SUPER U', 'PICARD',
                                 'BIOCOOP', 'NATURALIA', 'MARKET'] },
      { nom: 'Restaurants', motifs: [] },
      { nom: 'Livraison', motifs: ['UBER EATS', 'DELIVEROO', 'JUST EAT'] },
      { nom: 'Boulangerie et quotidien', motifs: ['BOULANGERIE'] },
    ]},
    { nom: 'Transport', lignes: [
      { nom: 'Uber et taxi', motifs: ['UBER', 'BOLT EU', 'FREENOW', 'G7'] },
      { nom: 'Carburant et péage', motifs: ['TOTALENERGIES', 'APRR', 'VINCI AUTOROUTES', 'SANEF', 'ESSO', 'SHELL'] },
      { nom: 'Titres de transport', motifs: ['NAVIGO', 'SNCF', 'RATP', 'TRAINLINE', 'BLABLACAR'] },
      { nom: 'Voiture (entretien, assurance)', motifs: ['NORAUTO', 'FEU VERT', 'MIDAS'] },
    ]},
    { nom: 'Abonnements', lignes: [
      { nom: 'Téléphone et internet', motifs: ['FREE TELECOM', 'FREE MOBILE', 'ORANGE', 'SFR', 'BOUYGUES TELECOM', 'SOSH'] },
      { nom: 'Frais bancaires', motifs: ['COTISATION BREDACCES'] },
      { nom: 'Streaming et logiciels', motifs: ['SPOTIFY', 'NETFLIX', 'DISNEY', 'AMAZON PRIME',
                                                'APPLE COM', 'GOOGLE', 'MICROSOFT', 'ADOBE', 'OPENAI', 'ANTHROPIC'] },
    ]},
    { nom: 'Vie quotidienne', lignes: [
      { nom: 'Santé', motifs: ['PHARMACIE', 'DOCTOLIB', 'LABORATOIRE', 'MUTUELLE'] },
      { nom: 'Beauté', motifs: ['COIFFEUR', 'SEPHORA'] },
      { nom: 'Vêtements', motifs: ['ZARA', 'UNIQLO', 'KIABI', 'VINTED', 'DECATHLON'] },
      { nom: 'Éducation et famille', motifs: [] },
    ]},
    { nom: 'Loisirs', lignes: [
      { nom: 'Sorties et culture', motifs: ['UGC', 'PATHE', 'GAUMONT', 'FNAC', 'CINEMA'] },
      { nom: 'Sport', motifs: ['FITNESS PARK', 'BASIC FIT'] },
      { nom: 'Voyages', motifs: ['BOOKING', 'AIRBNB', 'AIR FRANCE'] },
      { nom: 'Cadeaux et dons', motifs: [] },
    ]},
  ],

  /* ---------- Lignes de revenus proposées ----------
     « Revenus » est la catégorie, ces lignes en sont les sous-catégories :
     c'est ainsi qu'elles apparaissent dans la fiche d'une opération.
     Les motifs s'accrochent notamment au champ « MOTIF » que votre banque
     inscrit dans le libellé des virements reçus. */
  MODELE_REVENUS: [
    { nom: 'Salaires et honoraires', motifs: ['SALAIRE', 'REMUNERATION', 'HONORAIRES', 'PAIE'] },
    { nom: 'Loyers perçus', motifs: ['MOTIF LOYER', 'LOYER'] },
    { nom: 'Intérêts et dividendes', motifs: ['INTERETS', 'INTERET', 'DIVIDENDE', 'COUPON'] },
    { nom: 'Remboursements', motifs: ['MOTIF REMBOU', 'REMBOURSEMENT', 'MOTIF NOURRI', 'CPAM', 'AMELI', 'NOTE DE FRAIS'] },
    { nom: 'Virements reçus', motifs: ['MOTIF VIREME'] },
    { nom: 'Aides et allocations', motifs: ['ALLOCATION', 'POLE EMPLOI', 'FRANCE TRAVAIL', 'BOURSE'] },
    { nom: 'Ventes', motifs: ['VINTED', 'LEBONCOIN', 'BLABLACAR'] },
    { nom: 'Cadeaux reçus', motifs: ['MOTIF CADEAU'] },
  ],

  render() {
    document.getElementById('screen-title').innerHTML =
      `<h1>Budget prévisionnel</h1><div class="small">Ce que vous prévoyez chaque mois — le réel se lit dans Suivi du mois</div>`;
    const el = document.getElementById('content-inner');
    const b = Store.state.budget;

    const totExp = U.sum(b.categories, c => U.sum(c.lines, l => l.amount || 0));
    const totInc = U.sum(b.incomes, l => l.amount || 0);
    const totSav = U.sum(b.savings, l => l.amount || 0);
    const reste = totInc - totExp - totSav;

    el.innerHTML = `
      <div class="grid c3">
        <div class="card kpi"><div class="kpi-label">Revenus prévus</div><div class="kpi-val num">${U.fmtEUR(totInc)}</div></div>
        <div class="card kpi"><div class="kpi-label">Dépenses prévues</div><div class="kpi-val num" style="color:var(--cuivre-clair)">${U.fmtEUR(totExp)}</div></div>
        <div class="card kpi"><div class="kpi-label">Épargne prévue</div><div class="kpi-val num">${U.fmtEUR(totSav)}</div>
          <div class="kpi-sub">${reste >= 0 ? `marge restante ${U.fmtEUR(reste)}` : `<span class="down">déficit prévisionnel ${U.fmtEUR(-reste)}</span>`}</div></div>
      </div>

      <div id="bud-recurring"></div>

      <div class="grid c2">
        <div class="card">
          <div class="toolbar"><h2 style="margin:0">Revenus</h2><span class="spacer"></span>
            <button id="bud-add-inc">+ Ligne</button></div>
          <div id="bud-incs"></div>
        </div>
        <div class="card">
          <div class="toolbar"><h2 style="margin:0">Versements d'épargne</h2><span class="spacer"></span>
            <button id="bud-add-sav">+ Versement</button></div>
          <div id="bud-savs"></div>
          <div class="hint">Chaque versement vise un compte de destination ; l'assistant d'épargne (Patrimoine)
          sait ensuite le répartir. <b>Leur somme est l'épargne capitalisée par la simulation de
          patrimoine</b> — modifiable directement sur l'écran Patrimoine.</div>
        </div>
      </div>

      <div class="card">
        <div class="toolbar"><h2 style="margin:0">Dépenses</h2><span class="spacer"></span>
          <button id="bud-modele">Installer l'arborescence proposée…</button>
          <button id="bud-recal">Recaler sur le réel constaté…</button>
          <button id="bud-add-cat" class="primary">+ Catégorie</button></div>
        <div id="bud-cats"></div>
      </div>`;

    ScreenBudget.renderCats();
    ScreenBudget.renderIncomes();
    ScreenBudget.renderSavings();
    ScreenBudget.renderRecurring();

    document.getElementById('bud-add-cat').onclick = () => {
      const name = prompt('Nom de la catégorie (ex. Abonnements) :');
      if (!name) return;
      b.categories.push({ id: U.uid(), name: name.trim(), lines: [] });
      Store.markDirty();
      ScreenBudget.render();
    };
    document.getElementById('bud-add-inc').onclick = () => ScreenBudget.lineModal('income');
    document.getElementById('bud-add-sav').onclick = () => ScreenBudget.lineModal('saving');
    document.getElementById('bud-recal').onclick = () => ScreenBudget.recalModal();
    document.getElementById('bud-modele').onclick = () => ScreenBudget.modeleModal();
  },

  renderCats() {
    const b = Store.state.budget;
    const holder = document.getElementById('bud-cats');
    if (!b.categories.length) {
      holder.innerHTML = `<div class="notice gold">
        <b>Aucune catégorie pour l'instant.</b> Une arborescence toute prête est disponible —
        Logement, Alimentation, Transport, Abonnements, Vie quotidienne, Loisirs — avec leurs
        sous-catégories et la reconnaissance des enseignes courantes.
        Un aperçu chiffré vous montrera d'abord combien de vos opérations seraient classées.
        <div style="margin-top:10px"><button class="primary" id="bud-modele-vide">Voir l'arborescence proposée</button></div>
      </div>
      <div class="hint">Sinon, créez vos catégories à la main : « Abonnements » peut contenir
        séparément « Fitness Park » et « Spotify » — un montant unique par poste ne suffit pas.</div>`;
      holder.querySelector('#bud-modele-vide').onclick = () => ScreenBudget.modeleModal();
      return;
    }
    let html = '';
    for (const c of b.categories) {
      const tot = U.sum(c.lines, l => l.amount || 0);
      html += `<table style="margin-bottom:14px">
        <tr class="section"><td>
          <span class="clickable" data-renc="${c.id}" title="Renommer">${U.escapeHtml(c.name)} ✎</span></td>
          <td class="num" style="width:120px">${U.fmtEUR(tot)} /mois</td>
          <td class="right" style="width:200px">
            <button class="ghost" data-addline="${c.id}">+ ligne</button>
            <button class="ghost" data-delc="${c.id}" title="Supprimer la catégorie">✕</button></td></tr>`;
      for (const l of c.lines) {
        html += `<tr><td>&nbsp;&nbsp;<span class="clickable" data-ren="${l.id}" title="Renommer — les opérations rattachées suivent">${U.escapeHtml(l.name)} ✎</span></td>
          <td class="num">${U.fmtEUR(l.amount || 0)}</td>
          <td class="right"><button class="ghost" data-edl="${l.id}">modifier</button>
            <button class="ghost" data-dell="${l.id}">✕</button></td></tr>`;
      }
      html += `</table>`;
    }
    holder.innerHTML = html;

    holder.querySelectorAll('[data-renc]').forEach(el => el.onclick = () => {
      const c = b.categories.find(c => c.id === el.dataset.renc);
      const name = prompt('Nouveau nom :', c.name);
      if (name) { c.name = name.trim(); Store.markDirty(); ScreenBudget.render(); }
    });
    holder.querySelectorAll('[data-delc]').forEach(el => el.onclick = () => {
      const c = b.categories.find(c => c.id === el.dataset.delc);
      const nTx = Store.state.transactions.filter(t => c.lines.some(l => l.id === t.lineId)).length;
      UI.confirmDestructive({
        title: `Supprimer la catégorie « ${c.name} »`,
        previewHtml: `<p>${c.lines.length} ligne(s) supprimée(s) ; <b>${nTx} opération(s)</b> repasseront « sans catégorie »
          (elles ne sont pas supprimées).</p>`,
        confirmLabel: 'Supprimer',
        onConfirm: () => {
          const ids = new Set(c.lines.map(l => l.id));
          for (const t of Store.state.transactions) if (ids.has(t.lineId)) { t.lineId = null; t.auto = undefined; }
          Store.state.rules = Store.state.rules.filter(r => !ids.has(r.lineId));
          b.categories = b.categories.filter(x => x.id !== c.id);
          ScreenBudget.render();
        },
      });
    });
    holder.querySelectorAll('[data-addline]').forEach(el => el.onclick = () => ScreenBudget.lineModal('expense', el.dataset.addline));
    holder.querySelectorAll('[data-ren]').forEach(el => el.onclick = () => ScreenBudget.renameLine(el.dataset.ren));
    holder.querySelectorAll('[data-edl]').forEach(el => el.onclick = () => ScreenBudget.lineModal('expense', null, el.dataset.edl));
    holder.querySelectorAll('[data-dell]').forEach(el => el.onclick = () => ScreenBudget.deleteLine(el.dataset.dell));
  },

  renderIncomes() {
    const b = Store.state.budget;
    const rows = b.incomes.map(l => `<tr>
      <td><span class="clickable" data-ren="${l.id}">${U.escapeHtml(l.name)} ✎</span></td>
      <td class="num">${U.fmtEUR(l.amount || 0)}</td>
      <td class="right"><button class="ghost" data-edl="${l.id}">modifier</button>
        <button class="ghost" data-dell="${l.id}">✕</button></td></tr>`).join('');
    const h = document.getElementById('bud-incs');
    h.innerHTML = b.incomes.length ? `<table>${rows}</table>` : '<div class="empty">Aucune ligne de revenu.</div>';
    h.querySelectorAll('[data-ren]').forEach(el => el.onclick = () => ScreenBudget.renameLine(el.dataset.ren));
    h.querySelectorAll('[data-edl]').forEach(el => el.onclick = () => ScreenBudget.lineModal('income', null, el.dataset.edl));
    h.querySelectorAll('[data-dell]').forEach(el => el.onclick = () => ScreenBudget.deleteLine(el.dataset.dell));
  },

  renderSavings() {
    const b = Store.state.budget;
    const rows = b.savings.map(l => {
      const a = l.accountId ? Engine.account(l.accountId) : null;
      return `<tr><td><span class="clickable" data-ren="${l.id}">${U.escapeHtml(l.name)} ✎</span>
        <div class="small">→ ${a ? U.escapeHtml(a.name) : '<span class="badge cuivre">compte manquant</span>'}</div></td>
        <td class="num">${U.fmtEUR(l.amount || 0)}</td>
        <td class="right"><button class="ghost" data-edl="${l.id}">modifier</button>
          <button class="ghost" data-dell="${l.id}">✕</button></td></tr>`;
    }).join('');
    const h = document.getElementById('bud-savs');
    h.innerHTML = b.savings.length ? `<table>${rows}</table>` : '<div class="empty">Aucun versement d\'épargne prévu.</div>';
    h.querySelectorAll('[data-ren]').forEach(el => el.onclick = () => ScreenBudget.renameLine(el.dataset.ren));
    h.querySelectorAll('[data-edl]').forEach(el => el.onclick = () => ScreenBudget.lineModal('saving', null, el.dataset.edl));
    h.querySelectorAll('[data-dell]').forEach(el => el.onclick = () => ScreenBudget.deleteLine(el.dataset.dell));
  },

  findLine(id) {
    const b = Store.state.budget;
    for (const c of b.categories) { const l = c.lines.find(l => l.id === id); if (l) return { l, list: c.lines }; }
    let l = b.incomes.find(l => l.id === id); if (l) return { l, list: b.incomes };
    l = b.savings.find(l => l.id === id); if (l) return { l, list: b.savings };
    return null;
  },

  // Renommer ne change pas l'identifiant : aucune opération orpheline (EX-17).
  renameLine(id) {
    const f = ScreenBudget.findLine(id);
    if (!f) return;
    const name = prompt('Nouveau nom (les opérations déjà rattachées suivent) :', f.l.name);
    if (name) { f.l.name = name.trim(); Store.markDirty(); ScreenBudget.render(); }
  },

  deleteLine(id) {
    const f = ScreenBudget.findLine(id);
    if (!f) return;
    const nTx = Store.state.transactions.filter(t => t.lineId === id).length;
    UI.confirmDestructive({
      title: `Supprimer la ligne « ${f.l.name} »`,
      previewHtml: `<p><b>${nTx} opération(s)</b> rattachée(s) repasseront « sans catégorie » (elles ne sont pas supprimées).
        Montant prévisionnel retiré : <b class="num">${U.fmtEUR(f.l.amount || 0)}</b> /mois.</p>`,
      confirmLabel: 'Supprimer la ligne',
      onConfirm: () => {
        for (const t of Store.state.transactions) if (t.lineId === id) { t.lineId = null; t.auto = undefined; }
        Store.state.rules = Store.state.rules.filter(r => r.lineId !== id);
        const i = f.list.findIndex(l => l.id === id);
        f.list.splice(i, 1);
        ScreenBudget.render();
      },
    });
  },

  lineModal(kind, catId, lineId) {
    const b = Store.state.budget;
    const existing = lineId ? ScreenBudget.findLine(lineId) : null;
    const l = existing ? existing.l : null;
    // La catégorie est modifiable aussi à la modification : une sous-catégorie
    // doit pouvoir changer de rattachement sans qu'on ait à la recréer — les
    // opérations déjà classées la suivent, puisque son identifiant ne bouge pas.
    const catActuelle = l ? b.categories.find(c => c.lines.some(x => x.id === l.id)) : null;
    const catOpts = kind === 'expense' ?
      `<div class="field"><label>Catégorie${l ? ' — la changer déplace cette sous-catégorie, ses opérations suivent' : ''}</label>
        <select id="ln-cat">
        ${b.categories.map(c => `<option value="${c.id}" ${c.id === (catActuelle ? catActuelle.id : catId) ? 'selected' : ''}>${U.escapeHtml(c.name)}</option>`).join('')}
      </select></div>` : '';
    const accField = kind === 'saving' ?
      `<div class="field"><label>Compte de destination</label>${UI.accountSelect('ln-acc', l ? l.accountId : null)}</div>` : '';
    const m = UI.modal(`
      <h2>${l ? 'Modifier' : 'Nouvelle'} ligne ${kind === 'income' ? 'de revenu' : kind === 'saving' ? 'd\'épargne' : 'de dépense'}</h2>
      ${catOpts}
      <div class="row">
        <div class="field"><label>Nom</label><input id="ln-name" value="${l ? U.escapeHtml(l.name) : ''}" placeholder="${kind === 'income' ? 'Salaire' : kind === 'saving' ? 'Versement PEA' : 'Spotify'}"></div>
        <div class="field"><label>Montant mensuel</label>${UI.amountInput('ln-amount', l ? l.amount : null, '0,00')}</div>
      </div>
      ${accField}
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">${l ? 'Enregistrer' : 'Créer'}</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const name = m.el.querySelector('#ln-name').value.trim();
      const amount = UI.readAmount(m.el.querySelector('#ln-amount')) || 0;
      if (!name) { UI.error('Le nom est vide.', 'Donnez un nom à la ligne.'); return; }
      if (l) {
        l.name = name; l.amount = amount;
        if (kind === 'saving') l.accountId = m.el.querySelector('#ln-acc').value;
        if (kind === 'expense') {
          const cible = b.categories.find(c => c.id === m.el.querySelector('#ln-cat').value);
          if (cible && catActuelle && cible.id !== catActuelle.id) {
            catActuelle.lines.splice(catActuelle.lines.findIndex(x => x.id === l.id), 1);
            cible.lines.push(l);   // même identifiant : rien n'est orphelin (EX-17)
          }
        }
      } else {
        const nl = { id: U.uid(), name, amount };
        if (kind === 'expense') {
          const cid = m.el.querySelector('#ln-cat')?.value || catId;
          const c = b.categories.find(c => c.id === cid);
          if (!c) { UI.error('Aucune catégorie.', 'Créez d\'abord une catégorie.'); return; }
          c.lines.push(nl);
        } else if (kind === 'income') b.incomes.push(nl);
        else { nl.accountId = m.el.querySelector('#ln-acc').value; b.savings.push(nl); }
      }
      Store.markDirty();
      m.close();
      ScreenBudget.render();
    };
  },

  /* ---------- Installation de l'arborescence proposée ---------- */

  // Aperçu chiffré avant d'agir : combien de catégories, de lignes, de règles,
  // et surtout combien de vos opérations seraient classées (EX-86 par esprit,
  // même si l'action n'est qu'additive).
  modeleModal() {
    const b = Store.state.budget;
    const existantes = new Set(b.categories.map(c => U.normLabel(c.name)));
    const aCreer = ScreenBudget.MODELE.filter(c => !existantes.has(U.normLabel(c.nom)));
    // Simulation : combien d'opérations non classées chaque motif attraperait.
    const nonClassees = Store.state.transactions.filter(t => !t.lineId && !t.internal);
    const apercu = [];
    let totalTouche = 0;
    const simuler = (nomCat, ligne, sens) => {
      if (!ligne.motifs.length) return;
      const touchees = nonClassees.filter(t => {
        if (sens === 'depense' ? t.amount >= 0 : t.amount <= 0) return false;
        const n = U.normLabel(t.label);
        return ligne.motifs.some(m => n.includes(m));
      });
      if (touchees.length) {
        apercu.push({ cat: nomCat, ligne: ligne.nom, sens, n: touchees.length,
          montant: Math.abs(U.sum(touchees, t => t.amount)) });
        totalTouche += touchees.length;
      }
    };
    for (const cat of ScreenBudget.MODELE) for (const ligne of cat.lignes) simuler(cat.nom, ligne, 'depense');
    for (const ligne of ScreenBudget.MODELE_REVENUS) simuler('Revenus', ligne, 'revenu');

    const nbLignes = ScreenBudget.MODELE.reduce((s, c) => s + c.lignes.length, 0) + ScreenBudget.MODELE_REVENUS.length;
    const nbMotifs = ScreenBudget.MODELE.reduce((s, c) => s + U.sum(c.lignes, l => l.motifs.length), 0) +
      U.sum(ScreenBudget.MODELE_REVENUS, l => l.motifs.length);
    const m = UI.modal(`
      <h2>Installer l'arborescence proposée</h2>
      <p class="small">Seront ajoutés : <b>${aCreer.length} catégorie(s) de dépenses</b> sur ${ScreenBudget.MODELE.length},
      <b>${ScreenBudget.MODELE_REVENUS.length} lignes de revenus</b> (salaires, loyers, intérêts,
      remboursements, virements reçus…), soit <b>${nbLignes} sous-catégories</b> et
      <b>${nbMotifs} règles de reconnaissance</b>.
      Ce que vous avez déjà n'est pas touché, les montants prévisionnels restent à 0 —
      « Recaler sur le réel » les remplira ensuite.</p>
      ${apercu.length ? `
        <h3>Ce qui serait classé dans vos opérations actuelles</h3>
        <table><tr><th>Catégorie · sous-catégorie</th><th class="num">Opérations</th><th class="num">Montant</th></tr>
        ${apercu.sort((x, y) => y.montant - x.montant).map(a => `<tr>
          <td>${U.escapeHtml(a.cat)} · ${U.escapeHtml(a.ligne)}
            ${a.sens === 'revenu' ? '<span class="badge argent">revenu</span>' : ''}</td>
          <td class="num">${a.n}</td><td class="num">${U.fmtEUR(a.montant)}</td></tr>`).join('')}
        <tr class="section"><td>Total</td><td class="num">${totalTouche}</td>
          <td class="num">${U.fmtEUR(U.sum(apercu, a => a.montant))}</td></tr></table>
        <div class="hint">${nonClassees.length - totalTouche} opération(s) resteraient sans catégorie —
        classez-en une et l'application proposera d'en faire une règle.</div>`
        : `<div class="notice">Aucune opération importée pour l'instant : les règles s'appliqueront au prochain import.</div>`}
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Installer</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = (e) => UI.busy(e.target, async () => {
      const r = ScreenBudget.installerModele();
      m.close();
      UI.toast(`${r.categories} catégorie(s), ${r.lignes} sous-catégories et ${r.regles} règles créées. ` +
        `${r.classees} opération(s) classée(s).`);
      ScreenBudget.render();
    });
  },

  installerModele() {
    const b = Store.state.budget;
    const bilan = { categories: 0, lignes: 0, regles: 0, classees: 0 };
    for (const cat of ScreenBudget.MODELE) {
      let c = b.categories.find(x => U.normLabel(x.name) === U.normLabel(cat.nom));
      if (!c) { c = { id: U.uid(), name: cat.nom, lines: [] }; b.categories.push(c); bilan.categories++; }
      for (const ligne of cat.lignes) {
        let l = c.lines.find(x => U.normLabel(x.name) === U.normLabel(ligne.nom));
        if (!l) { l = { id: U.uid(), name: ligne.nom, amount: 0 }; c.lines.push(l); bilan.lignes++; }
        for (const motif of ligne.motifs) {
          if (!Store.state.rules.some(r => r.pattern === motif)) {
            Store.state.rules.push({ id: U.uid(), pattern: motif, lineId: l.id, kind: null });
            bilan.regles++;
          }
        }
      }
    }
    // Lignes de revenus : « Revenus » tient lieu de catégorie, ces lignes en
    // sont les sous-catégories.
    for (const ligne of ScreenBudget.MODELE_REVENUS) {
      let l = b.incomes.find(x => U.normLabel(x.name) === U.normLabel(ligne.nom));
      if (!l) { l = { id: U.uid(), name: ligne.nom, amount: 0 }; b.incomes.push(l); bilan.lignes++; }
      for (const motif of ligne.motifs) {
        if (!Store.state.rules.some(r => r.pattern === motif)) {
          Store.state.rules.push({ id: U.uid(), pattern: motif, lineId: l.id, kind: null });
          bilan.regles++;
        }
      }
    }
    bilan.classees = Rules.categorizeAll({ onlyUncategorized: true });
    Engine.invalidate();
    Store.markDirty();
    return bilan;
  },

  /* ---------- Recalage sur le réel (EX-18) ---------- */

  recalModal() {
    const preview = Rules.recalibrationPreview();
    if (!preview.lines.length && !preview.ponctuelles.length) {
      UI.toast(preview.months.length
        ? 'Rien à recaler : aucune ligne n\'a de mouvement sur les mois complets.'
        : 'Pas encore de mois complet constaté : importez des relevés d\'abord.');
      return;
    }
    const all = [...preview.lines, ...preview.ponctuelles];
    const idx = (p) => all.indexOf(p);
    // Le détail mois par mois rend la proposition vérifiable : on voit d'où
    // sort le chiffre au lieu de devoir le croire.
    const detail = (p) => `<div class="small num" style="opacity:.75">${
      p.parMois.map((v, i) => `<span title="${U.fmtMonth(p.months[i])}">${v ? U.fmtEURcompact(v) : '—'}</span>`).join(' · ')}</div>`;

    const ligneReguliere = (p) => `<tr>
      <td class="checkbox-cell"><input type="checkbox" data-i="${idx(p)}" checked style="width:auto"></td>
      <td>${U.escapeHtml(p.category)} · <b>${U.escapeHtml(p.name)}</b>
        <span class="badge argent">${p.monthsWithData}/${p.months.length} mois</span>
        ${p.niveau ? `<span class="badge cuivre" title="médiane récente ${U.fmtEUR(p.niveau.recent)} contre ${U.fmtEUR(p.niveau.ancien)} avant">
          ${p.niveau.sens === 'hausse' ? '↑' : '↓'} changement de niveau${p.niveau.certain ? '' : ' ?'}</span>` : ''}
        ${detail(p)}</td>
      <td class="num">${U.fmtEUR(p.current)}</td>
      <td class="num">${UI.amountInput('rc-' + idx(p), p.proposed)}</td>
      <td class="num">${UI.varia(p.proposed - p.current)}</td></tr>`;

    const lignePonctuelle = (p) => `<tr>
      <td class="checkbox-cell"><input type="checkbox" data-i="${idx(p)}" style="width:auto"></td>
      <td>${U.escapeHtml(p.category)} · ${U.escapeHtml(p.name)}
        <span class="badge cuivre">${U.escapeHtml(p.raison)}</span>
        ${detail(p)}</td>
      <td class="num">${U.fmtEUR(p.current)}</td>
      <td class="num">${UI.amountInput('rc-' + idx(p), 0)}</td>
      <td class="num">${U.fmtEUR(p.total)} <span class="small">sur la période</span></td></tr>`;

    const m = UI.modal(`
      <h2>Recaler le prévisionnel sur le réel</h2>
      <p class="small">Constaté sur ${preview.months.length} mois complets
      (${preview.months.map(U.fmtMonthShort).join(', ')}) — le mois en cours, incomplet, est exclu.
      Le montant proposé est la <b>médiane</b>, pour qu'un mois exceptionnel ne le déforme pas ;
      il reste modifiable ligne par ligne.</p>

      ${preview.lines.length ? `
        <h3>Lignes régulières — présentes dans au moins ${preview.seuil} mois sur ${preview.months.length}</h3>
        <table><tr><th></th><th>Ligne · détail mois par mois</th><th class="num">Prévu actuel</th>
          <th class="num">Proposé</th><th class="num">Δ</th></tr>
          ${preview.lines.map(ligneReguliere).join('')}</table>` : ''}

      ${preview.ponctuelles.length ? `
        <h3 style="margin-top:16px">Lignes ponctuelles — aucun montant mensuel proposé</h3>
        <p class="small">Ces lignes ont bougé trop rarement pour qu'une récurrence mensuelle en soit
        déduite : un remboursement reçu une fois n'est pas un revenu tous les mois. Elles sont
        décochées ; les cocher remet leur prévisionnel à zéro.</p>
        <table><tr><th></th><th>Ligne · détail mois par mois</th><th class="num">Prévu actuel</th>
          <th class="num">Proposé</th><th class="num">Total constaté</th></tr>
          ${preview.ponctuelles.map(lignePonctuelle).join('')}</table>` : ''}

      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Appliquer aux lignes cochées</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const sel = [], overrides = {};
      m.el.querySelectorAll('[data-i]:checked').forEach(cb => {
        const p = all[Number(cb.dataset.i)];
        sel.push(p.lineId);
        const v = UI.readAmount(m.el.querySelector('#rc-' + cb.dataset.i));
        if (v != null) overrides[p.lineId] = v;
      });
      const n = Rules.applyRecalibration(preview, sel, overrides);
      m.close();
      UI.toast(`${n} ligne(s) recalée(s) sur le réel.`);
      ScreenBudget.render();
    };
  },

  /* ---------- Récurrences non budgétées (EX-19) ---------- */

  renderRecurring() {
    const holder = document.getElementById('bud-recurring');
    const recs = Rules.detectRecurring();
    if (!recs.length) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<div class="card">
      <h2>Dépenses récurrentes non budgétées</h2>
      ${recs.slice(0, 5).map((r, i) => `<div class="notice">
        « ${U.escapeHtml(r.label)} » revient sur ${r.months} mois (${r.count} fois), autour de
        <b class="num">${U.fmtEUR(r.median)}</b> — l'ajouter au prévisionnel ?
        <div style="margin-top:6px">
          <button class="primary" data-add="${i}">Ajouter au budget</button>
          <button class="ghost" data-skip="${i}">Ignorer</button>
        </div></div>`).join('')}
    </div>`;
    holder.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const r = recs[Number(b.dataset.add)];
      ScreenBudget.addRecurring(r);
    });
    holder.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => {
      const r = recs[Number(b.dataset.skip)];
      Store.state.dismissedRecurring.push(r.key);
      Store.markDirty();
      ScreenBudget.render();
    });
  },

  addRecurring(r) {
    const b = Store.state.budget;
    if (!b.categories.length) b.categories.push({ id: U.uid(), name: 'Dépenses courantes', lines: [] });
    const catNames = b.categories.map((c, i) => `<option value="${c.id}">${U.escapeHtml(c.name)}</option>`).join('');
    const m = UI.modal(`
      <h2>Ajouter « ${U.escapeHtml(r.label)} »</h2>
      <div class="row">
        <div class="field"><label>Catégorie</label><select id="rc-cat">${catNames}</select></div>
        <div class="field"><label>Nom de la ligne</label><input id="rc-name" value="${U.escapeHtml(Rules.merchantKey(r.label))}"></div>
        <div class="field"><label>Montant mensuel</label>${UI.amountInput('rc-amount', r.median)}</div>
      </div>
      <div class="actions">
        <button class="ghost" data-x="cancel">Annuler</button>
        <button class="primary" data-x="ok">Ajouter et classer les opérations</button>
      </div>`);
    m.el.querySelector('[data-x="cancel"]').onclick = m.close;
    m.el.querySelector('[data-x="ok"]').onclick = () => {
      const c = Store.state.budget.categories.find(c => c.id === m.el.querySelector('#rc-cat').value);
      const nl = { id: U.uid(), name: m.el.querySelector('#rc-name').value.trim(), amount: UI.readAmount(m.el.querySelector('#rc-amount')) || 0 };
      c.lines.push(nl);
      Rules.addRule(r.key, nl.id);        // s'apprend et se conserve (P6)
      for (const t of r.txs) { t.lineId = nl.id; t.auto = 'rule'; }
      Store.markDirty();
      m.close();
      UI.toast(`Ligne créée et ${r.txs.length} opération(s) classée(s). La règle vaudra pour les imports futurs.`);
      ScreenBudget.render();
    };
  },
};
