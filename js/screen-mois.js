/* Essor — écran Suivi du mois.
   Prévu / réel par catégorie et par ligne, écart et consommation (EX-20),
   mouvements internes neutres (EX-21), mois analysé sans ambiguïté
   (EX-22, EX-82), décalages de versement (EX-45, EX-49…51).

   Le prévisionnel n'est confronté au réel QUE sur le mois en cours. Sur un
   mois révolu, l'écran ne montre que le constaté : le budget enregistré dit
   ce qui est prévu aujourd'hui, pas ce qui était prévu à l'époque, et
   confronter les deux comparerait des choses qui n'ont jamais eu cours en
   même temps. Cet écart assumé au regard d'EX-20 est annoncé à l'écran, pour
   qu'une colonne manquante ne passe pas pour un défaut. */
'use strict';

const ScreenMois = {

  /* ---------- Constats : ce que le mois dit de vos habitudes ---------- */

  renderConstats(month, enCours) {
    const holder = document.getElementById('mois-constats');
    if (!holder) return;
    const t = Engine.tendances(month);
    const phrases = [];
    if (t.postes.length) {
      phrases.push(`Vos plus gros postes : ${t.postes.map(x =>
        `<b>${U.escapeHtml(x.nom)}</b> <span class="num">${U.fmtEUR(x.montant)}</span>
         <span class="small">(${Math.round(x.part * 100)} %)</span>`).join(' · ')}.`);
    }
    for (const h of t.hausses.slice(0, 3)) {
      phrases.push(`<span class="down">▲</span> <b>${U.escapeHtml(h.nom)}</b> :
        <span class="num">${U.fmtEUR(h.actuel)}</span> — <span class="down num">+${Math.round(h.pct * 100)} %</span>
        au-dessus de vos ${t.reference.length} derniers mois <span class="small num">(${U.fmtEUR(h.base)} en moyenne)</span>.`);
    }
    for (const b of t.baisses.slice(0, 2)) {
      phrases.push(`<span class="up">▼</span> <b>${U.escapeHtml(b.nom)}</b> :
        <span class="num">${U.fmtEUR(b.actuel)}</span> — <span class="up num">${Math.round(b.pct * 100)} %</span>
        sous votre habitude <span class="small num">(${U.fmtEUR(b.base)})</span>.`);
    }
    if (t.revenus || t.depenses) {
      phrases.push(`${enCours ? 'À ce stade du mois' : 'Au total'} :
        <span class="num">${U.fmtEUR(t.revenus)}</span> de revenus −
        <span class="num">${U.fmtEUR(t.depenses)}</span> de dépenses =
        <b class="num ${t.marge >= 0 ? 'up' : 'down'}">${U.fmtEUR(t.marge)}</b>
        ${t.marge >= 0 ? 'dégagés' : 'de découvert de flux'}.`);
    }
    if (!phrases.length) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<div class="card">
      <h2>Constats${UI.info(`Chaque catégorie de dépense est comparée à sa moyenne des
        ${t.reference.length || 3} mois précédents. Seuls les mouvements d'au moins 30 % et 20 €
        méritent une phrase — le reste est du bruit. Mouvements internes exclus.`)}</h2>
      <div class="constats">${phrases.map(x => `<div class="constat">${x}</div>`).join('')}</div>
    </div>`;
  },

  render() {
    const month = UI.analyzedMonth();
    const p = UI.period();
    const enCours = month === U.currentMonth();
    ScreenMois.enCours = enCours;
    // Le mois analysé est affiché sans ambiguïté, y compris quand la période
    // globale est glissante (EX-22, EX-82).
    document.getElementById('screen-title').innerHTML =
      `<h1>Suivi du mois — ${U.fmtMonth(month)}</h1>
       <div class="small">${p.kind === 'rolling' ? `période « ${UI.periodLabel()} » choisie : cet écran, mensuel par nature, analyse ${U.fmtMonth(month)}` :
         enCours ? 'mois en cours — chiffres partiels, comparés à votre prévisionnel' : 'mois révolu — chiffres définitifs'}</div>`;
    const el = document.getElementById('content-inner');

    const flows = Engine.monthFlows(month);
    const b = Store.state.budget;

    // Agrégats par ligne.
    const actualByLine = new Map();
    for (const t of flows.txs) {
      if (!t.lineId) continue;
      actualByLine.set(t.lineId, (actualByLine.get(t.lineId) || 0) + t.amount);
    }
    const uncatExp = U.sum(flows.expenses.filter(t => !t.lineId), t => t.amount);
    const uncatInc = U.sum(flows.incomes.filter(t => !t.lineId), t => t.amount);

    const plannedExp = U.sum(b.categories, c => U.sum(c.lines, l => l.amount || 0));
    const plannedInc = U.sum(b.incomes, l => l.amount || 0);
    const internal = Store.state.transactions.filter(t => Engine.budgetMonth(t) === month && t.internal);

    // Sur un mois révolu, le mois précédent sert de repère : c'est une
    // comparaison entre deux faits, là où le prévisionnel n'en est pas un.
    const moisPrec = U.addMonths(month, -1);
    const prec = Engine.monthFlows(moisPrec);
    const aPrec = prec.txs.length > 0;

    el.innerHTML = `
      <div class="grid c3">
        <div class="card kpi"><div class="kpi-label">Revenus${enCours ? ' — réel / prévu' : ''}</div>
          <div class="kpi-val num">${U.fmtEUR(flows.totalIncomes)}</div>
          <div class="kpi-sub num">${enCours
            ? `prévu ${U.fmtEUR(plannedInc)} · ${UI.varia(flows.totalIncomes - plannedInc)}`
            : aPrec ? `${U.fmtMonthShort(moisPrec)} : ${U.fmtEUR(prec.totalIncomes)} · ${UI.varia(flows.totalIncomes - prec.totalIncomes)}`
                    : 'pas de mois précédent à comparer'}</div></div>
        <div class="card kpi"><div class="kpi-label">Dépenses${enCours ? ' — réel / prévu' : ''}</div>
          <div class="kpi-val num" style="color:var(--cuivre-clair)">${U.fmtEUR(-flows.totalExpenses)}</div>
          <div class="kpi-sub num">${enCours
            ? `prévu ${U.fmtEUR(plannedExp)} · ${UI.varia(-(- flows.totalExpenses - plannedExp))}`
            : aPrec ? `${U.fmtMonthShort(moisPrec)} : ${U.fmtEUR(-prec.totalExpenses)} · ${UI.varia(-(-flows.totalExpenses - -prec.totalExpenses))}`
                    : 'pas de mois précédent à comparer'}</div></div>
        <div class="card kpi"><div class="kpi-label">Reste (réel)</div>
          <div class="kpi-val">${UI.varia(flows.totalIncomes + flows.totalExpenses)}</div>
          <div class="kpi-sub">revenus − dépenses, mouvements internes exclus</div></div>
      </div>

      <div id="mois-constats"></div>
      <div id="mois-shifts"></div>

      <div class="card"><h2>Revenus${enCours ? '' : UI.info(`Mois révolu : le prévisionnel n'est
        pas affiché — votre budget décrit ce que vous prévoyez aujourd'hui, pas ce que vous
        prévoyiez alors. Ce mois est comparé au précédent, fait contre fait.`)}</h2>
        <div id="mois-inc"></div></div>

      <div class="card">
        <div class="toolbar"><h2 style="margin:0">Dépenses par catégorie</h2>
          <span class="spacer"></span>
          <button class="ghost" id="mois-toggle-vides"></button></div>
        <div id="mois-exp"></div>
      </div>

      <div class="card">
        <div class="toolbar"><h2 style="margin:0">Mouvements internes — neutres</h2>
          <span class="spacer"></span>
          <span class="hint" style="margin:0">Virements entre vos comptes : ni dépensés, ni gagnés,
            comptés une seule fois.</span></div>
        <div id="mois-internal"></div>
      </div>`;

    // Réel du mois précédent, pour servir de repère sur un mois révolu.
    ScreenMois.precByLine = new Map();
    for (const t of prec.txs) {
      if (!t.lineId) continue;
      ScreenMois.precByLine.set(t.lineId, (ScreenMois.precByLine.get(t.lineId) || 0) + t.amount);
    }
    ScreenMois.moisPrec = moisPrec;

    ScreenMois.renderConstats(month, enCours);
    ScreenMois.renderShifts();
    ScreenMois.renderExpenses(actualByLine, uncatExp, flows);
    ScreenMois.renderIncomes(actualByLine, uncatInc);
    ScreenMois.renderInternal(internal);
  },

  // En-têtes selon le mois : le prévisionnel n'a cours que sur le mois courant.
  entetes(libelle) {
    return ScreenMois.enCours
      ? `<tr><th>${libelle}</th><th class="num">Prévu</th><th class="num">Réel</th>
         <th class="num">Écart</th><th style="width:120px">Consommation</th></tr>`
      : `<tr><th>${libelle}</th><th class="num">Réel</th>
         <th class="num">${U.fmtMonthShort(ScreenMois.moisPrec)}</th><th class="num">Variation</th></tr>`;
  },

  lineRow(name, planned, actual, kind, lineId) {
    const abs = Math.abs(actual);
    // Tout montant constaté s'ouvre : on doit pouvoir vérifier d'où il sort.
    const cliquable = lineId && abs > 0;
    const ouvre = cliquable ? `<b>${U.fmtEUR(abs)}</b> <span class="muted">›</span>` : U.fmtEUR(abs);
    const tr = `<tr${cliquable ? ` class="clickable" data-drill="${lineId}"` : ''}>`;
    if (ScreenMois.enCours) {
      const ratio = planned > 0 ? abs / planned : (abs > 0 ? 1.01 : 0);
      const ecart = kind === 'expense' ? planned - abs : abs - planned;
      return `${tr}<td>${name}</td>
        <td class="num">${U.fmtEUR(planned)}</td>
        <td class="num">${ouvre}</td>
        <td class="num">${UI.varia(ecart)}</td>
        <td>${Charts.gauge(ratio)}</td></tr>`;
    }
    // Mois révolu : deux faits comparés, sans prévisionnel.
    const avant = lineId ? Math.abs(ScreenMois.precByLine.get(lineId) || 0) : 0;
    const varia = kind === 'expense' ? avant - abs : abs - avant;
    return `${tr}<td>${name}</td>
      <td class="num">${ouvre}</td>
      <td class="num muted">${avant ? U.fmtEUR(avant) : '—'}</td>
      <td class="num">${avant ? UI.varia(varia) : '<span class="muted">—</span>'}</td></tr>`;
  },

  /* ---------- Détail d'une ligne : vérifier et corriger (P7) ---------- */

  // Ouvre les opérations qui composent un montant. Sans cela, un chiffre
  // constaté est invérifiable : on voit 90 € sans savoir d'où ils sortent.
  drillDown(lineId) {
    const month = UI.analyzedMonth();
    const info = Engine.budgetLine(lineId);
    if (!info) return;
    const txs = Store.state.transactions
      .filter(t => t.lineId === lineId && Engine.budgetMonth(t) === month && !t.internal)
      .sort((a, b) => a.date < b.date ? 1 : -1);
    const total = U.sum(txs, t => Math.abs(t.amount));
    const titre = `${info.category ? info.category.name + ' · ' : ''}${info.line.name}`;
    const rows = txs.map(t => {
      const a = Engine.account(t.accountId);
      const origine = t.auto === 'rule' ? '<span class="badge or" title="classée par une règle">règle</span>'
        : t.auto === 'guess' ? '<span class="badge guess" title="deviné d\'après le libellé">deviné</span>'
        : '<span class="badge argent" title="classée à la main">manuel</span>';
      const decale = t.monthOverride ? ` <span class="badge cuivre">rattachée à ${U.fmtMonthShort(t.monthOverride)}</span>` : '';
      return `<tr class="clickable" data-tx="${t.id}">
        <td class="num small">${U.fmtDate(t.date)}${decale}</td>
        <td>${U.escapeHtml(t.label)}</td>
        <td class="small">${a ? U.escapeHtml(a.name) : '?'}</td>
        <td>${origine}</td>
        <td class="num">${U.fmtEUR(Math.abs(t.amount))}</td></tr>`;
    }).join('');
    const m = UI.modal(`
      <h2>${U.escapeHtml(titre)} — ${U.fmtMonth(month)}</h2>
      <p class="small">${txs.length} opération(s) pour <b class="num">${U.fmtEUR(total)}</b>.
      Cliquez une ligne pour la corriger : changer sa catégorie, la marquer comme mouvement interne
      ou la rattacher à un autre mois.</p>
      ${txs.length ? `<table><tr><th>Date</th><th>Libellé</th><th>Compte</th><th>Classée par</th>
        <th class="num">Montant</th></tr>${rows}
        <tr class="section"><td colspan="4">Total</td><td class="num">${U.fmtEUR(total)}</td></tr></table>`
        : '<div class="empty">Aucune opération sur ce mois.</div>'}
      <div class="actions"><button class="ghost" data-x="close">Fermer</button></div>`);
    m.el.querySelector('[data-x="close"]').onclick = m.close;
    m.el.querySelectorAll('[data-tx]').forEach(tr => tr.onclick = () => {
      m.close();
      ScreenOperations.editModal(tr.dataset.tx, () => {
        ScreenMois.render();
        ScreenMois.drillDown(lineId);   // on revient au détail, corrigé
      });
    });
  },

  wireDrill(root) {
    root.querySelectorAll('[data-drill]').forEach(tr => tr.onclick = (e) => {
      if (e.target.closest('button')) return;
      ScreenMois.drillDown(tr.dataset.drill);
    });
  },

  renderExpenses(actualByLine, uncatExp, flows) {
    const b = Store.state.budget;
    let html = `<table>${ScreenMois.entetes('Catégorie / ligne')}`;
    let vides = 0;
    for (const c of b.categories) {
      const planned = U.sum(c.lines, l => l.amount || 0);
      const actual = U.sum(c.lines, l => Math.abs(Math.min(0, actualByLine.get(l.id) || 0)));
      // Une catégorie entièrement vide disparaît elle aussi.
      if (!planned && !actual && !ScreenMois.montrerVides) { vides += c.lines.length; continue; }
      if (ScreenMois.enCours) {
        const ratio = planned > 0 ? actual / planned : (actual ? 1.01 : 0);
        html += `<tr class="section"><td>${U.escapeHtml(c.name)}</td>
          <td class="num">${U.fmtEUR(planned)}</td><td class="num">${U.fmtEUR(actual)}</td>
          <td class="num">${UI.varia(planned - actual)}</td><td>${Charts.gauge(ratio)}</td></tr>`;
      } else {
        const avant = U.sum(c.lines, l => Math.abs(Math.min(0, ScreenMois.precByLine.get(l.id) || 0)));
        html += `<tr class="section"><td>${U.escapeHtml(c.name)}</td>
          <td class="num">${U.fmtEUR(actual)}</td>
          <td class="num muted">${avant ? U.fmtEUR(avant) : '—'}</td>
          <td class="num">${avant ? UI.varia(avant - actual) : '<span class="muted">—</span>'}</td></tr>`;
      }
      for (const l of c.lines) {
        const a = Math.min(0, actualByLine.get(l.id) || 0);
        // Une sous-catégorie sans mouvement ni montant prévu n'apprend rien :
        // elle est repliée, et son nombre annoncé pour qu'on sache qu'elle existe.
        if (!a && !(l.amount || 0) && !ScreenMois.montrerVides) { vides++; continue; }
        html += ScreenMois.lineRow('&nbsp;&nbsp;&nbsp;' + U.escapeHtml(l.name), l.amount || 0, a, 'expense', l.id);
      }
    }
    if (uncatExp) {
      const bouton = `<button class="ghost" onclick="ScreenOperations.filters.type='uncat';App.go('operations')">classer →</button>`;
      html += ScreenMois.enCours
        ? `<tr class="section"><td>Sans catégorie <span class="badge cuivre">à classer</span></td>
           <td class="num">—</td><td class="num">${U.fmtEUR(-uncatExp)}</td><td></td><td>${bouton}</td></tr>`
        : `<tr class="section"><td>Sans catégorie <span class="badge cuivre">à classer</span></td>
           <td class="num">${U.fmtEUR(-uncatExp)}</td><td></td><td>${bouton}</td></tr>`;
    }
    html += '</table>';
    const holder = document.getElementById('mois-exp');
    holder.innerHTML = b.categories.length ? html :
      '<div class="empty">Aucune catégorie au budget — définissez votre prévisionnel dans l\'espace Budget.</div>';
    ScreenMois.wireDrill(holder);

    const bouton = document.getElementById('mois-toggle-vides');
    if (!vides && !ScreenMois.montrerVides) { bouton.style.display = 'none'; return; }
    bouton.style.display = '';
    bouton.textContent = ScreenMois.montrerVides
      ? 'Masquer les lignes sans mouvement'
      : `Afficher ${vides} ligne(s) sans mouvement`;
    bouton.onclick = () => {
      ScreenMois.montrerVides = !ScreenMois.montrerVides;
      ScreenMois.render();
    };
  },

  renderIncomes(actualByLine, uncatInc) {
    const b = Store.state.budget;
    let html = `<table>${ScreenMois.entetes('Ligne')}`;
    let vides = 0;
    for (const l of b.incomes) {
      const a = Math.max(0, actualByLine.get(l.id) || 0);
      if (!a && !(l.amount || 0) && !ScreenMois.montrerVides) { vides++; continue; }
      html += ScreenMois.lineRow(U.escapeHtml(l.name), l.amount || 0, a, 'income', l.id);
    }
    if (uncatInc) {
      const bouton = `<button class="ghost" onclick="ScreenOperations.filters.type='uncat';App.go('operations')">classer →</button>`;
      html += ScreenMois.enCours
        ? `<tr><td>Sans catégorie <span class="badge cuivre">à classer</span></td>
           <td class="num">—</td><td class="num">${U.fmtEUR(uncatInc)}</td><td></td><td>${bouton}</td></tr>`
        : `<tr><td>Sans catégorie <span class="badge cuivre">à classer</span></td>
           <td class="num">${U.fmtEUR(uncatInc)}</td><td></td><td>${bouton}</td></tr>`;
    }
    html += '</table>';
    if (vides) html += `<div class="hint">${vides} ligne(s) de revenu sans mouvement, repliées.</div>`;
    const holder = document.getElementById('mois-inc');
    holder.innerHTML = b.incomes.length || uncatInc ? html :
      '<div class="empty">Aucune ligne de revenu au budget.</div>';
    ScreenMois.wireDrill(holder);
  },

  renderInternal(internal) {
    const holder = document.getElementById('mois-internal');
    if (!internal.length) { holder.innerHTML = '<div class="empty">Aucun mouvement interne ce mois.</div>'; return; }
    const rows = internal.slice(0, 20).map(t => {
      const a = Engine.account(t.accountId);
      return `<tr><td class="small num">${U.fmtDate(t.date)}</td>
        <td>${U.escapeHtml(t.label)}</td><td class="small">${a ? U.escapeHtml(a.name) : ''}</td>
        <td class="num neutral-c">${U.fmtEUR(t.amount, { forceSign: true })}</td></tr>`;
    }).join('');
    holder.innerHTML = `<table>${rows}</table>${internal.length > 20 ? `<div class="small">… et ${internal.length - 20} autres.</div>` : ''}`;
  },

  renderShifts() {
    // Détection des décalages : conservatrice, détaillée, jamais silencieuse
    // (EX-49, EX-50, P7).
    const holder = document.getElementById('mois-shifts');
    const proposals = Rules.detectShifts();
    if (!proposals.length) { holder.innerHTML = ''; return; }
    holder.innerHTML = `<div class="card">
      <h2>Décalages de versement probables</h2>
      ${proposals.map((p, i) => `<div class="notice" id="shift-${i}">
        <p style="margin:0 0 8px">${U.escapeHtml(p.reason)}</p>
        <button class="primary" data-apply="${i}">Rattacher à ${U.fmtMonth(p.toMonth)}</button>
        <button class="ghost" data-dismiss="${i}">Ignorer définitivement</button>
      </div>`).join('')}
      <div class="hint">La date et le montant de l'opération ne changeront pas — seul le mois d'analyse budgétaire.</div>
    </div>`;
    holder.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => {
      Rules.applyShift(proposals[Number(b.dataset.apply)]);
      UI.toast('Opération rattachée. Relancer la détection ne proposera rien de nouveau.');
      ScreenMois.render();
    });
    holder.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => {
      Rules.dismissShift(proposals[Number(b.dataset.dismiss)]);
      ScreenMois.render();
    });
  },
};
