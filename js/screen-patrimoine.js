/* Essor — écran Patrimoine (accueil).
   Photo de l'instant : patrimoine net et variation en un coup d'œil (EX-1),
   répartition (EX-4), exposition par transparence (EX-5), performance réelle
   (EX-7), historique (EX-8), projection (EX-58…67), objectifs (EX-68…70),
   assistant d'épargne (EX-52…57).
   Cet écran N'ÉDITE RIEN (P4, EX-9) et n'a pas de sélecteur de période (EX-81). */
'use strict';

const ScreenPatrimoine = {

  /* ---------- Mise en page mobile : un tableau de bord, pas un site replié ----------
     Le téléphone a sa propre grammaire : un grand chiffre et sa courbe,
     des pastilles qui se parcourent du pouce, la liste des comptes, la
     répartition — puis les analyses lourdes en pages qu'on OUVRE. Rien du
     PC n'est transposé, hormis le thème ; les moteurs de rendu, eux, sont
     les mêmes — seule la scène change. */

  _sparkline(values) {
    if (values.length < 2) return '';
    const W = 340, H = 64;
    const min = Math.min(...values), max = Math.max(...values), amp = (max - min) || 1;
    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * W,
      H - 5 - ((v - min) / amp) * (H - 14),
    ]);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="mob-spark" aria-hidden="true">
      <defs><linearGradient id="mob-spark-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="rgba(243,201,107,0.30)"/>
        <stop offset="1" stop-color="rgba(243,201,107,0)"/></linearGradient></defs>
      <path d="${d} L${W},${H} L0,${H} Z" fill="url(#mob-spark-g)"/>
      <path d="${d}" fill="none" stroke="#f3c96b" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
  },

  mobileHtml(months, snaps, nw, prev, delta, perf) {
    const cur = U.currentMonth();
    const serie = months.slice(-12).map(m => snaps[m].total);
    // ± value latente : ce que les positions valent au-delà de ce qu'elles ont coûté.
    let latente = null;
    for (const a of Store.state.accounts) {
      if (a.closed) continue;
      const g = Engine.latentGain(a.id);
      if (g != null) latente = (latente || 0) + g;
    }
    const epargne = Alloc.plannedMonthlySavings();
    const puce = (label, html) => `<div class="mob-puce"><div class="mob-puce-l">${label}</div><div class="mob-puce-v num">${html}</div></div>`;

    const TYPE_GLYPHE = { courant: '€', livret: '◆', titres: '▲', pea: '▲', av: '✦', crypto: '₿', immo: '⌂', autre: '·' };
    const comptes = Engine.accountsSorted().filter(a => !a.closed).map(a => {
      const v = Engine.accountValue(a.id, U.today());
      const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.autre;
      return `<button class="mob-compte" data-cpt="${a.id}">
        <span class="mob-cpt-ico">${TYPE_GLYPHE[a.type] || '·'}</span>
        <span class="mob-cpt-nom">${U.escapeHtml(a.name)}
          <span class="small">${t.label}${v && !v.cashKnown ? ' · espèces non certifiées' : ''}</span></span>
        <span class="mob-cpt-val num">${v ? U.fmtEUR(v.total) : '—'}</span>
        <span class="fiche-chev">›</span>
      </button>`;
    }).join('');

    return `
      <div class="mob-hero">
        <div class="kpi-label">Patrimoine net</div>
        <div class="mob-montant num">${U.fmtEUR(nw.total)}</div>
        <div class="mob-varia">${UI.varia(delta, { pct: prev && prev.total ? delta / prev.total : null })}
          <span class="small">sur un mois</span></div>
        ${ScreenPatrimoine._sparkline(serie)}
      </div>

      <div class="mob-puces">
        ${puce('Performance du mois', UI.varia(perf.gain, { pct: perf.rate }))}
        ${latente != null ? puce('± value latente', UI.varia(latente)) : ''}
        ${epargne ? puce('Épargne prévue', U.fmtEUR(epargne) + '<span class="small"> /mois</span>') : ''}
        ${nw.debts ? puce('Dettes', '<span class="down">−' + U.fmtEUR(nw.debts) + '</span>') : ''}
      </div>

      <h3 class="mob-section">Comptes</h3>
      <div class="mob-comptes">${comptes}</div>

      <h3 class="mob-section">Répartition</h3>
      <div class="mob-repart" id="pat-alloc"></div>

      <h3 class="mob-section">Analyses</h3>
      <div class="card">
        <h2>Projection <span class="small" id="proj-label"></span></h2>
        <div class="toolbar">
          <label style="margin:0">Horizon
            <select id="proj-horizon">
              ${[24, 60, 120, 240, 360].map(h => `<option value="${h}" ${h === (Store.state.settings.horizonMonths || 120) ? 'selected' : ''}>${h / 12} ans</option>`).join('')}
            </select>
          </label>
          <label style="margin:0 0 0 6px">Épargne mensuelle simulée
            ${UI.amountInput('proj-epargne', Projection.monthlySavings())}
          </label>
          <button class="ghost" id="proj-ep-prev" title="Revenus prévus moins dépenses prévues">déduire du prévisionnel</button>
          <button class="ghost" id="proj-ep-reel" title="Moyenne des derniers mois complets">du réel constaté</button>
          <button class="ghost" id="proj-ep-budget" title="Somme de vos lignes d'épargne au budget">de mes versements</button>
        </div>
        <div class="hint" id="proj-ep-source"></div>
        <div class="chart-holder" id="pat-proj"></div>
        <div id="proj-summary"></div>
      </div>
      <div class="card">
        <h2>Historique mensuel</h2>
        <div class="chart-holder" id="pat-history"></div>
        <div class="hint">Un mois révolu vaut le patrimoine à son dernier jour ; le mois en cours, le patrimoine du jour.</div>
      </div>
      <div class="card">
        <h2 id="pat-geo-title">Exposition géographique</h2>
        <div id="pat-geo"></div>
      </div>
      <div class="card">
        <h2>Épargne du mois — comment répartir</h2>
        <div id="pat-assist"></div>
      </div>
      <div class="card">
        <h2>Objectifs &amp; rente</h2>
        <div id="pat-goals"></div>
      </div>
    `;
  },

  // La liste des comptes mène à l'action naturelle de chacun : déclarer ses
  // actifs pour la crypto, ses positions pour un compte-titres, certifier son
  // solde pour le reste.
  wireComptesMobile() {
    document.querySelectorAll('[data-cpt]').forEach(b => b.onclick = () => {
      const a = Engine.account(b.dataset.cpt);
      if (!a) return;
      if (a.type === 'crypto') ScreenOperations.actifsModal(a.id);
      else if (ACCOUNT_TYPES[a.type]?.positions) ScreenOperations.positionsModal(a.id);
      else ScreenOperations.certifyModal(a.id);
    });
  },

  render() {
    document.getElementById('screen-title').innerHTML =
      `<h1>Patrimoine</h1><div class="small">Photo au ${U.fmtDate(U.today())} — les saisies se font dans les autres espaces</div>`;
    const el = document.getElementById('content-inner');

    const snaps = Engine.snapshots();
    const months = Object.keys(snaps).sort();
    if (!months.length) {
      el.innerHTML = `<div class="card"><h2>Bienvenue</h2>
        <p>Aucune donnée pour l'instant. Trois étapes pour démarrer :</p>
        <ol>
          <li>Créez vos comptes et certifiez leurs soldes dans <b>Opérations</b>.</li>
          <li>Importez vos relevés (une archive suffit, plusieurs comptes et mois mélangés).</li>
          <li>Décrivez votre budget prévisionnel dans <b>Budget</b>.</li>
        </ol>
        <button class="primary" onclick="App.go('operations')">Ouvrir Opérations</button></div>`;
      return;
    }

    const cur = U.currentMonth();
    const nw = Engine.netWorth(U.today());
    const prev = snaps[U.addMonths(cur, -1)];
    const delta = prev ? nw.total - prev.total : null;
    const perf = Engine.monthlyPerformance(cur);

    if (UI.estMobile()) {
      el.innerHTML = ScreenPatrimoine.mobileHtml(months, snaps, nw, prev, delta, perf);
      ScreenPatrimoine.renderAllocation();
      ScreenPatrimoine.renderHistory(months, snaps);
      ScreenPatrimoine.renderGeo();
      ScreenPatrimoine.renderProjection();
      ScreenPatrimoine.renderAssistant();
      ScreenPatrimoine.renderGoals();
      ScreenPatrimoine.wireComptesMobile();
      ScreenPatrimoine.wireProjection();
      return;
    }

    el.innerHTML = `
      <div class="grid c3">
        <div class="card kpi">
          <div class="kpi-label">Patrimoine net</div>
          <div class="kpi-val num">${U.fmtEUR(nw.total)}</div>
          <div class="kpi-sub num">Actifs ${U.fmtEUR(nw.assets)} − dettes ${U.fmtEUR(nw.debts)}</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">Variation sur un mois</div>
          <div class="kpi-val">${UI.varia(delta, { pct: prev && prev.total ? delta / prev.total : null })}</div>
          <div class="kpi-sub">par rapport à fin ${prev ? U.fmtMonth(U.addMonths(cur, -1)) : '—'}</div>
        </div>
        <div class="card kpi">
          <div class="kpi-label">Performance du mois (hors versements)</div>
          <div class="kpi-val">${UI.varia(perf.gain, { pct: perf.rate })}</div>
          <div class="kpi-sub">ce que vos actifs ont produit d'eux-mêmes</div>
        </div>
      </div>

      <div class="card">
        <h2>Historique mensuel</h2>
        <div class="chart-holder" id="pat-history"></div>
        <div class="hint">Un mois révolu vaut le patrimoine à son dernier jour ; le mois en cours, le patrimoine du jour.</div>
      </div>

      <div class="card"><h2>Répartition par classe d'actifs</h2><div id="pat-alloc"></div></div>

      <div class="card">
        <h2 id="pat-geo-title">Exposition géographique</h2>
        <div id="pat-geo"></div>
      </div>

      <div class="card">
        <h2>Comptes</h2>
        <div id="pat-accounts"></div>
      </div>

      <div class="card">
        <h2>Projection <span class="small" id="proj-label"></span></h2>
        <div class="toolbar">
          <label style="margin:0">Horizon
            <select id="proj-horizon">
              ${[24, 60, 120, 240, 360].map(h => `<option value="${h}" ${h === (Store.state.settings.horizonMonths || 120) ? 'selected' : ''}>${h / 12} ans</option>`).join('')}
            </select>
          </label>
          <label style="margin:0 0 0 6px">Épargne mensuelle simulée
            ${UI.amountInput('proj-epargne', Projection.monthlySavings())}
          </label>
          <button class="ghost" id="proj-ep-prev" title="Revenus prévus moins dépenses prévues">déduire du prévisionnel</button>
          <button class="ghost" id="proj-ep-reel" title="Moyenne des derniers mois complets">du réel constaté</button>
          <button class="ghost" id="proj-ep-budget" title="Somme de vos lignes d'épargne au budget">de mes versements</button>
        </div>
        <div class="hint" id="proj-ep-source"></div>
        <div class="chart-holder" id="pat-proj"></div>
        <div id="proj-summary"></div>
      </div>

      <div class="grid c2">
        <div class="card">
          <h2>Épargne du mois — comment répartir</h2>
          <div id="pat-assist"></div>
        </div>
        <div class="card">
          <h2>Objectifs &amp; rente</h2>
          <div id="pat-goals"></div>
        </div>
      </div>
    `;

    ScreenPatrimoine.renderHistory(months, snaps);
    ScreenPatrimoine.renderAllocation();
    ScreenPatrimoine.renderGeo();
    ScreenPatrimoine.renderAccounts();
    ScreenPatrimoine.renderProjection();
    ScreenPatrimoine.renderAssistant();
    ScreenPatrimoine.renderGoals();

    ScreenPatrimoine.wireProjection();
  },

  // Le câblage des commandes de projection, commun aux deux scènes.
  wireProjection() {
    document.getElementById('proj-horizon').onchange = (e) => {
      Store.state.settings.horizonMonths = Number(e.target.value);
      Store.markDirty();
      ScreenPatrimoine.renderProjection();
      ScreenPatrimoine.renderGoals();
    };

    // L'épargne simulée se règle ici, là où on regarde son effet — sans elle,
    // le paramètre le plus décisif de la projection était invisible.
    const champ = document.getElementById('proj-epargne');
    const source = document.getElementById('proj-ep-source');
    const majSource = () => {
      const m = ScreenPatrimoine.epargneSimulee();
      source.innerHTML = m.explication +
        ' Hypothèses de rendement, inflation et fiscalité : dans Réglages. Ceci est une simulation, pas un conseil en investissement.';
    };
    const appliquer = (montant, origine) => {
      Store.state.settings.projSavings = montant;
      Store.state.settings.projSavingsSource = origine;
      Store.markDirty();
      majSource();
      ScreenPatrimoine.renderProjection();
      ScreenPatrimoine.renderGoals();
    };
    // Réécrire le champ pendant la frappe déplacerait le curseur : on ne le
    // renseigne que pour les boutons.
    const poser = (montant, origine) => {
      champ.value = (montant / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, useGrouping: false });
      appliquer(montant, origine);
    };
    const relire = U.debounce(() => appliquer(UI.readAmount(champ) ?? 0, 'manuel'), 500);
    champ.addEventListener('input', relire);
    document.getElementById('proj-ep-prev').onclick = () => poser(ScreenPatrimoine.capacitePrevisionnelle().montant, 'previsionnel');
    document.getElementById('proj-ep-reel').onclick = () => {
      const r = ScreenPatrimoine.capaciteReelle();
      if (!r) { UI.error('Aucun mois complet constaté.', 'Importez des relevés couvrant au moins un mois révolu.'); return; }
      poser(r.montant, 'reel');
    };
    document.getElementById('proj-ep-budget').onclick = () => poser(Alloc.plannedMonthlySavings(), 'budget');
    majSource();
  },

  // Épargne mensuelle retenue par la projection, et d'où elle vient — le
  // chiffre le plus déterminant de la simulation doit toujours pouvoir dire
  // son origine (P7).
  epargneSimulee() {
    const S = Store.state.settings;
    const budget = Alloc.plannedMonthlySavings();
    if (S.projSavings == null) {
      return { montant: budget, source: 'budget',
        explication: `Épargne issue de vos <b>versements d'épargne du Budget</b> (${U.fmtEUR(budget)} /mois).` };
    }
    const libelles = {
      budget: `Épargne issue de vos <b>versements d'épargne du Budget</b>.`,
      previsionnel: `Épargne déduite de votre <b>prévisionnel</b> : revenus prévus moins dépenses prévues.`,
      reel: `Épargne déduite de votre <b>réel constaté</b> : moyenne des mois complets, mouvements internes et épargne déjà versée exclus.`,
      manuel: `Épargne <b>saisie à la main</b> pour cette simulation.`,
    };
    return { montant: S.projSavings, source: S.projSavingsSource || 'manuel',
      explication: libelles[S.projSavingsSource] || libelles.manuel };
  },

  renderHistory(months, snaps) {
    const holder = document.getElementById('pat-history');
    const values = months.map(m => snaps[m].total);
    Charts.line(holder, months, [
      { name: 'Patrimoine net', values, color: Charts.COLORS.or, width: 2.5 },
    ], { height: 260 });
    // Variation d'un mois sur l'autre (EX-8) — tableau des derniers mois.
    const rows = months.slice(-6).map((m, i, arr) => {
      const v = snaps[m].total;
      const prevM = U.addMonths(m, -1);
      const pv = snaps[prevM] ? snaps[prevM].total : null;
      return `<tr><td>${U.fmtMonth(m)}${m === U.currentMonth() ? ' <span class="badge argent">en cours</span>' : ''}</td>
        <td class="num">${U.fmtEUR(v)}</td>
        <td class="num">${pv != null ? UI.varia(v - pv) : '—'}</td></tr>`;
    }).join('');
    holder.insertAdjacentHTML('afterend',
      `<table style="margin-top:10px"><tr><th>Mois</th><th class="num">Patrimoine net</th><th class="num">Variation</th></tr>${rows}</table>`);
  },

  renderAllocation() {
    const alloc = Engine.allocationByClass(U.today());
    const items = Charts.foldExtras([...alloc.entries()].filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })));
    const colors = Charts.colorsFor(items);
    const holder = document.getElementById('pat-alloc');
    Charts.donut(holder, items.map((it, i) => ({ ...it, color: colors[i] })));

    // Ces deux classes sont toutes deux de l'argent non investi ; elles
    // restent séparées parce qu'elles n'appellent pas la même décision — le
    // solde d'un compte-titres attend d'être placé, pas celui du courant
    // (EX-6). Leur somme est dite ici, pour qu'on n'ait pas à la faire.
    const courants = alloc.get('Comptes courants') || 0;
    const especes = alloc.get('Espèces sur comptes-titres') || 0;
    const livrets = alloc.get('Livrets d\'épargne') || 0;
    if (courants || especes) {
      const nw = Engine.netWorth(U.today()).total;
      holder.insertAdjacentHTML('beforeend', `<div class="notice" style="margin-top:10px">
        <b>Argent qui ne travaille pas : ${U.fmtEUR(courants + especes)}</b>${nw > 0 ? `,
        soit ${U.fmtPct((courants + especes) / nw, 0)} du patrimoine` : ''} —
        ${U.fmtEUR(courants)} sur vos comptes courants${especes ? `,
        et ${U.fmtEUR(especes)} versés sur vos comptes-titres mais pas encore placés` : ''}.
        <div class="small" style="margin-top:4px">
        ${especes ? `Ces ${U.fmtEUR(especes)} comptent dans votre patrimoine sans jamais être
        présentés comme exposés aux marchés ; l'assistant d'épargne sait les investir. ` : ''}
        ${livrets ? `Vos ${U.fmtEUR(livrets)} de livrets n'y figurent pas : rémunérés et plafonnés,
        ils sont un placement, pas de la trésorerie.` : ''}</div></div>`);
    }
  },

  // Exposition géographique par transparence des supports détenus (EX-5).
  // C'est la seule vue « par transparence » de l'écran : elle porte donc la
  // mention de ce que la part investie pèse dans le patrimoine.
  // En barres : on compare des régions entre elles, l'angle d'un secteur se
  // compare mal, la longueur d'une barre se compare d'un coup d'œil.
  renderGeo() {
    const g = Engine.geoExposure(U.today());
    const holder = document.getElementById('pat-geo');
    const titre = document.getElementById('pat-geo-title');
    if (!g.invested) {
      titre.textContent = 'Exposition géographique';
      holder.innerHTML = `<div class="empty">Aucun support investi.</div>`;
      return;
    }
    titre.innerHTML = `Exposition géographique <span class="small">— par transparence de vos
      ${U.fmtEUR(g.described)} de supports, soit ${U.fmtPct(g.share)} du patrimoine</span>`;
    if (!g.expo.size) {
      holder.innerHTML = `<div class="notice warn">
        Aucun de vos supports n'a pu être rattaché à un indice connu, et aucune répartition
        n'a été saisie. Ouvrez <b>Réglages → Cours et répartition des supports</b>, puis
        « gérer » sur un support pour renseigner sa répartition — des modèles s'appliquent en un clic.
        </div>
        <table><tr><th>Support</th><th class="num">Montant sans répartition connue</th></tr>
        ${g.inconnus.map(x => `<tr><td>${U.escapeHtml(ScreenPatrimoine._nomSupport(x.symbol))}</td>
          <td class="num">${U.fmtEUR(x.value)}</td></tr>`).join('')}</table>`;
      return;
    }
    // Un planisphère : l'exposition géographique se lit d'abord sur une carte,
    // où la position porte l'information que ni un secteur ni une barre ne
    // peuvent donner. Les régions y sont réparties entre leurs pays.
    // Le détail par continent reste dessous, chiffré.
    const conts = Charts.foldExtras([...g.continents.entries()].filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })));
    const cc = Charts.colorsFor(conts);

    // La carte occupe les deux tiers : c'est elle qui demande de la place
    // pour être lisible. Le disque et le détail chiffré tiennent dans le tiers
    // restant, l'un au-dessus de l'autre.
    holder.innerHTML = `
      <div class="geo-layout">
        <div id="geo-carte"></div>
        <div class="geo-cote">
          <div id="geo-cont"></div>
          <div><h3>Par pays / région</h3><div id="geo-pays"></div></div>
        </div>
      </div>`;
    // Le disque et la carte partagent les mêmes couleurs de continent : les
    // deux vues se lisent ensemble au lieu de demander une traduction.
    const couleursContinent = new Map(conts.map((c, i) => [c.label, cc[i]]));
    const carte = GeoMap.render(document.getElementById('geo-carte'), g.expo, { couleursContinent });
    const disque = document.getElementById('geo-cont');
    Charts.donut(disque, conts.map((c, i) => ({ ...c, color: cc[i] })), { size: 132 });

    // Survoler une part du camembert rapproche la carte sur la même région :
    // les deux vues montrent la même chose, elles doivent se répondre.
    if (carte) {
      const zones = new Set(carte.continents);
      for (const el of disque.querySelectorAll('[data-part]')) {
        const cont = el.dataset.part;
        if (!zones.has(cont)) continue;
        el.classList.add('part-liee');
        el.addEventListener('mouseenter', () => carte.zoomer(cont));
        el.addEventListener('mouseleave', () => carte.vueEnsemble());
      }
    }
    // Le détail chiffré, region par région, sous la carte.
    const pays = [...g.expo.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const TOP = 10;
    const gardes = pays.slice(0, TOP).map(([label, value]) => ({ label, value }));
    const reste = pays.slice(TOP);
    if (reste.length) gardes.push({ label: `Autres (${reste.length})`, value: U.sum(reste, x => x[1]), autres: true });
    const couleurDe = new Map(conts.map((c, i) => [c.label, cc[i]]));
    Charts.bars(document.getElementById('geo-pays'),
      gardes.map(p => ({ ...p, color: p.autres ? Charts.AUTRES : (couleurDe.get(Engine.continentOf(p.label)) || Charts.AUTRES) })),
      { total: g.described });
    // D'où viennent ces chiffres : jamais de correction invisible (P7).
    const S = Store.state;
    const deduits = [...new Set(g.symbols || [])].filter(s => S.geoSource?.[s] === 'deduit');
    if (deduits.length) {
      holder.insertAdjacentHTML('beforeend', `<div class="notice" style="margin-top:14px">
        <b>Répartition déduite automatiquement</b> de l'indice suivi par chaque fonds :
        ${deduits.map(s => `${U.escapeHtml(ScreenPatrimoine._nomSupport(s))} → <b>${U.escapeHtml(S.geoIndice?.[s] || '?')}</b>`).join(' · ')}.
        Ce sont les poids publiés de l'indice, pas la composition exacte de votre fonds au jour le jour —
        corrigez-les dans Réglages si besoin.</div>`);
    }
    // Ce qui n'est pas décomposé est dit, jamais absorbé silencieusement (P7).
    if (g.inconnus.length) {
      holder.insertAdjacentHTML('beforeend', `<div class="notice warn" style="margin-top:14px">
        <b>${U.fmtEUR(U.sum(g.inconnus, x => x.value))}</b> ne sont pas répartis ci-dessus :
        ${g.inconnus.map(x => U.escapeHtml(ScreenPatrimoine._nomSupport(x.symbol))).join(', ')}
        — indice non reconnu, répartition à renseigner dans Réglages.</div>`);
    }
  },

  _nomSupport(symbol) {
    const meta = Store.state.priceMeta[symbol];
    return meta && meta.name ? `${meta.name} (${symbol})` : symbol;
  },

  renderAccounts() {
    const today = U.today();
    const rows = Engine.accountsSorted().filter(a => !a.closed).map(a => {
      const v = Engine.accountValue(a.id, today);
      const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.autre;
      let detail = '';
      if (t.positions && v) {
        // Liquidités d'un compte d'investissement montrées comme telles,
        // jamais comme exposées aux marchés (EX-6). Si elles ne sont pas
        // connues, on le dit — un zéro passerait pour un fait (P7, EX-111).
        detail = v.cashKnown
          ? `<span class="small">investi ${U.fmtEUR(v.positions)} · liquidités <b>${U.fmtEUR(v.cash)}</b> non investies</span>`
          : `<span class="small">investi ${U.fmtEUR(v.positions)} · <span class="badge cuivre"
              title="Sans solde espèces certifié, les versements non encore investis manquent au patrimoine">liquidités non certifiées</span></span>`;
      }
      const pv = ScreenPatrimoine._latentGain(a);
      return `<tr>
        <td>${U.escapeHtml(a.name)} <span class="badge argent">${t.label}</span></td>
        <td>${detail || ''}</td>
        <td class="num">${pv != null ? UI.varia(pv) : ''}</td>
        <td class="num stat-val">${v ? U.fmtEUR(v.total) : '<span class="muted">solde non certifié</span>'}</td>
      </tr>`;
    }).join('');
    const credits = Store.state.credits.map(c => {
      const rest = Engine.creditRemaining(c, today);
      return `<tr><td>${U.escapeHtml(c.name)} <span class="badge cuivre">crédit</span></td>
        <td><span class="small">mensualité ${U.fmtEUR(c.monthlyPayment)}</span></td><td></td>
        <td class="num stat-val" style="color:var(--cuivre-clair)">−${U.fmtEUR(rest).replace('-', '')}</td></tr>`;
    }).join('');
    // Alerte visible tant qu'un compte à titres n'a pas de solde espèces
    // certifié : son argent non investi manque au patrimoine (EX-111).
    const incomplets = Engine.accountsWithUnknownCash();
    const alerte = incomplets.length ? `<div class="notice warn">
      <b>Patrimoine sous-estimé.</b> ${incomplets.map(a => U.escapeHtml(a.name)).join(', ')} —
      les versements non encore investis n'y figurent pas tant que le solde espèces
      n'est pas certifié. Faites-le dans <b>Opérations → Certifier un solde</b>.</div>` : '';
    document.getElementById('pat-accounts').innerHTML =
      alerte +
      `<table><tr><th>Compte</th><th></th><th class="num">± value latente</th><th class="num">Valeur</th></tr>${rows}${credits}</table>
      <div class="hint">Lecture seule — certification des soldes, positions et crédits se gèrent dans Opérations et Réglages.</div>`;
  },

  _latentGain(account) {
    // Plus-value latente : valeur − prix de revient (EX-12).
    return Engine.latentGain(account.id);
  },

  renderProjection() {
    const h = Store.state.settings.horizonMonths || 120;
    // Monte Carlo : 500 trajectoires reproductibles (P8 : l'incertitude est
    // montrée par des percentiles, jamais masquée derrière un chiffre unique).
    const mc = Projection.monteCarlo(h);
    document.getElementById('proj-label').textContent =
      `— inflation ${U.fmtPct(Store.state.settings.inflation)} /an, épargne ${U.fmtEUR(Projection.monthlySavings())} /mois, ${mc.paths} trajectoires simulées`;
    Charts.line(document.getElementById('pat-proj'), mc.months, [
      { name: 'Centrale', values: mc.central, color: Charts.COLORS.or, width: 2.5 },
      { name: 'Prudente (P25)', values: mc.p25, color: Charts.COLORS.cuivre, width: 1.6 },
      { name: 'Optimiste (P75)', values: mc.p75, color: Charts.COLORS.argent, width: 1.6 },
    ], { height: 300, band: { low: mc.p10, high: mc.p90 },
         realSeries: [mc.real.central, mc.real.p25, mc.real.p75] });
    const last = mc.months.length - 1;
    // Toute valeur future en euros courants, nette de fiscalité de sortie,
    // et en pouvoir d'achat constant (P8, EX-62) — trois lectures du même avenir.
    const ligne = (nom, brut, net, netReel, fort) => {
      const b = (x) => fort ? `<b>${x}</b>` : x;
      return `<tr><td>${nom}</td>
        <td class="num">${b(U.fmtEUR(brut))}</td>
        <td class="num">${b(U.fmtEUR(net))}</td>
        <td class="num">${b(U.fmtEUR(netReel))}</td></tr>`;
    };
    const auj = Projection.netToday();
    document.getElementById('proj-summary').innerHTML = `
      <table style="margin-top:8px">
        <tr><th>Dans ${Math.round(last / 12)} ans</th><th class="num">Brut (courants)</th>
            <th class="num">Net de fiscalité</th><th class="num">Net en € constants</th></tr>
        ${ligne('Décile bas — 1 chance sur 10 de faire moins (P10)', mc.p10[last], mc.net.p10, mc.net.real.p10)}
        ${ligne('Prudent (P25)', mc.p25[last], mc.net.p25, mc.net.real.p25)}
        ${ligne('<b style="color:var(--or)">Central (médiane)</b>', mc.central[last], mc.net.central, mc.net.real.central, true)}
        ${ligne('Optimiste (P75)', mc.p75[last], mc.net.p75, mc.net.real.p75)}
        ${ligne('Décile haut — 1 chance sur 10 de faire plus (P90)', mc.p90[last], mc.net.p90, mc.net.real.p90)}
      </table>
      ${ScreenPatrimoine._noticeFiscale(auj, mc, last)}
      <div class="hint">${mc.paths} trajectoires simulées (tirage reproductible), la zone du graphique couvre
      P10–P90 en brut ; seuls les actifs volatils dispersent, PEA et compte-titres bougent ensemble.
      Rendements nets des frais saisis par compte.</div>`;
  },

  // La fiscalité appliquée, compte par compte : chaque euro d'impôt projeté
  // doit pouvoir dire d'où il vient (P7). Les approximations sont dites.
  _noticeFiscale(auj, mc, last) {
    const S = Store.state;
    const yearsAhead = last / 12;
    const accounts = Engine.accountsSorted().filter(a => !a.closed);
    const regimes = [];
    const sansPru = [];
    for (const a of accounts) {
      const r = Fisc.regime(a, yearsAhead);
      if (r.rate !== 0 || r.av) regimes.push(`${U.escapeHtml(a.name)} — ${U.escapeHtml(r.label)}`);
      if (ACCOUNT_TYPES[a.type]?.positions && Engine.accountValue(a.id, U.today())?.detail.length
          && Engine.latentGain(a.id) === null) sansPru.push(a.name);
    }
    const impotMedian = mc.central[last] - mc.net.central;
    return `<div class="notice" style="margin-top:10px">
      <b>Fiscalité de sortie</b> — si tout était liquidé en une fois, au droit actuel :
      aujourd'hui, votre patrimoine net d'impôt vaudrait <b class="num">${U.fmtEUR(auj.net)}</b>
      (brut ${U.fmtEUR(auj.brut)}) ; à l'horizon, l'impôt médian serait de
      <b class="num">${U.fmtEUR(impotMedian)}</b>.
      ${regimes.length ? `<div class="small" style="margin-top:6px">${regimes.join(' · ')}</div>` : ''}
      <div class="small" style="margin-top:6px">L'impôt ne frappe que les gains, jamais les versements.
      Sans année d'ouverture (fiche du compte), PEA et AV sont supposés mûrs à l'horizon ;
      abattement AV appliqué une fois ; primes AV < 150 k€.
      ${sansPru.length ? `<span class="down">PRU inconnus sur ${sansPru.map(U.escapeHtml).join(', ')} :
      leurs plus-values antérieures ne sont pas comptées, l'impôt est un plancher.</span>` : ''}</div></div>`;
  },

  // Capacité d'épargne déduite du budget prévisionnel : ce qui rentre moins
  // ce qui sort. Les versements d'épargne déjà prévus n'en font pas partie —
  // ce sont eux qu'on cherche à décider (EX-56).
  capacitePrevisionnelle() {
    const b = Store.state.budget;
    const revenus = U.sum(b.incomes, l => l.amount || 0);
    const depenses = U.sum(b.categories, c => U.sum(c.lines, l => l.amount || 0));
    return { revenus, depenses, montant: revenus - depenses };
  },

  // Capacité constatée : moyenne des mois complets, le mois en cours écarté
  // car incomplet.
  // Deux exclusions indispensables, sans quoi le montant serait faux :
  //  — les mouvements internes, qui ne sont ni un revenu ni une dépense ;
  //  — l'épargne déjà versée, qui n'est pas une consommation. La compter
  //    reviendrait à soustraire l'épargne d'un mois pour ensuite décider
  //    combien épargner : le même euro serait retiré deux fois.
  capaciteReelle() {
    const cur = U.currentMonth();
    const S = Store.state;
    const lignesEpargne = new Set(S.budget.savings.map(l => l.id));
    const mois = [...new Set(S.transactions
      .map(t => Engine.budgetMonth(t)).filter(m => m < cur))].sort().slice(-6);
    if (!mois.length) return null;
    let revenus = 0, depenses = 0, epargneDejaVersee = 0;
    for (const t of S.transactions) {
      if (t.internal || !mois.includes(Engine.budgetMonth(t))) continue;
      if (lignesEpargne.has(t.lineId)) { epargneDejaVersee += Math.abs(t.amount); continue; }
      if (t.amount > 0) revenus += t.amount; else depenses += -t.amount;
    }
    const n = mois.length;
    return { mois, revenus: U.roundCents(revenus / n), depenses: U.roundCents(depenses / n),
      epargneDejaVersee: U.roundCents(epargneDejaVersee / n),
      montant: U.roundCents((revenus - depenses) / n) };
  },

  // Dépenses qui ressemblent à des virements vers vos propres comptes : elles
  // fausseraient la capacité d'épargne en la minorant. On les nomme plutôt
  // que de corriger en silence (P7).
  depensesSuspectes(mois) {
    const S = Store.state;
    const suspects = new Map();
    const motifs = /EPARGNE|VERSEMENT|POCKET|VIREMENT INTERNE|COMPTE A COMPTE/i;
    const nomsComptes = S.accounts.map(a => U.normLabel(a.name)).filter(n => n.length >= 4);
    for (const t of S.transactions) {
      if (t.internal || t.amount >= 0 || !mois.includes(Engine.budgetMonth(t))) continue;
      const n = U.normLabel(t.label);
      if (motifs.test(n) || nomsComptes.some(c => n.includes(c))) {
        const k = Rules.merchantKey(t.label) || t.label;
        suspects.set(k, [(suspects.get(k) || [0, 0])[0] - t.amount, (suspects.get(k) || [0, 0])[1] + 1]);
      }
    }
    return [...suspects].sort((a, b) => b[1][0] - a[1][0]);
  },

  renderAssistant() {
    const holder = document.getElementById('pat-assist');
    const S = Store.state;
    if (!S.targets.length) {
      holder.innerHTML = `<div class="empty">Définissez des cibles par compte dans Réglages
        (part du patrimoine visée, plafond éventuel) pour obtenir une répartition.</div>`;
      return;
    }
    const prev = ScreenPatrimoine.capacitePrevisionnelle();
    const reel = ScreenPatrimoine.capaciteReelle();
    // Même montant que la projection par défaut : les deux écrans parlent de
    // la même épargne, ils ne doivent pas afficher deux chiffres (P9).
    const planned = Projection.monthlySavings();

    holder.innerHTML = `
      <div class="row" style="margin-bottom:6px">
        <div class="field"><label>Montant à répartir</label>${UI.amountInput('assist-amount', planned)}</div>
        <button class="primary" id="assist-run">Calculer les ordres</button>
      </div>
      <div class="toolbar" style="margin-bottom:4px">
        <span class="small">Déduire de :</span>
        <button id="assist-prev" title="Revenus prévus moins dépenses prévues">
          Mon prévisionnel — ${U.fmtEUR(prev.montant)}</button>
        ${reel ? `<button id="assist-reel" title="Moyenne des ${reel.mois.length} derniers mois complets">
          Mon réel constaté — ${U.fmtEUR(reel.montant)}</button>` : ''}
        <button class="ghost" id="assist-plan" title="Somme de vos lignes d'épargne au budget">
          Mes versements prévus — ${U.fmtEUR(planned)}</button>
      </div>
      <div class="hint" id="assist-source">Montant issu de vos versements d'épargne prévus au budget.</div>
      <div id="assist-result" style="margin-top:12px"></div>`;

    const champ = document.getElementById('assist-amount');
    const source = document.getElementById('assist-source');
    const poser = (montant, explication) => {
      champ.value = (montant / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, useGrouping: false });
      source.innerHTML = explication;
      run();
    };
    document.getElementById('assist-prev').onclick = () => poser(prev.montant,
      `Prévisionnel : <b class="num">${U.fmtEUR(prev.revenus)}</b> de revenus
       − <b class="num">${U.fmtEUR(prev.depenses)}</b> de dépenses
       = <b class="num">${U.fmtEUR(prev.montant)}</b>.`);
    if (reel) document.getElementById('assist-reel').onclick = () => {
      // Un montant négatif ou très bas vient presque toujours de virements
      // pris pour des dépenses : on le dit, avec les coupables (P7).
      const suspects = ScreenPatrimoine.depensesSuspectes(reel.mois);
      const totalSuspect = U.sum(suspects, s => s[1][0]);
      poser(reel.montant,
        `Constaté sur ${reel.mois.length} mois complets (${reel.mois.map(U.fmtMonthShort).join(', ')}) :
         <b class="num">${U.fmtEUR(reel.revenus)}</b> de revenus
         − <b class="num">${U.fmtEUR(reel.depenses)}</b> de dépenses en moyenne
         = <b class="num">${U.fmtEUR(reel.montant)}</b> par mois.
         ${reel.epargneDejaVersee ? `Vos <b class="num">${U.fmtEUR(reel.epargneDejaVersee)}</b> d'épargne
           déjà versée par mois sont exclus des dépenses, sans quoi ils seraient retirés deux fois.` : ''}
         Mouvements internes exclus.` +
        (suspects.length ? `<div class="notice warn" style="margin-top:8px">
           <b>Ce montant est probablement sous-estimé.</b>
           <b class="num">${U.fmtEUR(U.roundCents(totalSuspect / reel.mois.length))}</b> par mois sont comptés
           en dépenses alors qu'ils ressemblent à des virements vers vos propres comptes :
           ${suspects.slice(0, 4).map(([k, [v, n]]) =>
             `${U.escapeHtml(k)} (${U.fmtEUR(v)}, ${n} fois)`).join(' · ')}.
           Ouvrez-les depuis Suivi du mois et cochez « mouvement interne » — la capacité se recalculera.
         </div>` : ''));
    };
    document.getElementById('assist-plan').onclick = () => poser(planned,
      `Somme de vos lignes d'épargne au budget : <b class="num">${U.fmtEUR(planned)}</b>.`);
    champ.addEventListener('input', () => {
      source.textContent = 'Montant saisi à la main.';
    });

    const run = () => ScreenPatrimoine.renderOrdres(UI.readAmount(champ) ?? 0);
    document.getElementById('assist-run').onclick = run;
    run();
  },

  // Les ordres à passer, dans l'ordre où on les exécute : d'abord les
  // virements, ensuite les achats une fois l'argent arrivé. Un plan qu'on
  // suit sans avoir à le retraduire.
  renderOrdres(montant) {
    const holder = document.getElementById('assist-result');
    if (!(montant > 0)) {
      holder.innerHTML = `<div class="empty">Indiquez un montant à répartir.</div>`;
      return;
    }
    const ctx = Alloc.buildContext(U.today());
    const r = Alloc.allocate(montant, ctx);
    const courant = Engine.accountsSorted().find(a => a.type === 'courant' && !a.closed);

    // Étape 1 — les virements.
    const virements = ctx.filter(c => r.perAccount[c.id].amount > 0 && c.id !== (courant && courant.id));
    const totalVire = U.sum(virements, c => r.perAccount[c.id].amount);
    const etape1 = virements.length ? `
      <h3>1 — Virements à effectuer${courant ? ` depuis ${U.escapeHtml(courant.name)}` : ''}</h3>
      <table>
        ${virements.map(c => {
          const a = Engine.account(c.id);
          const nw = Engine.netWorth(U.today()).total;
          const partActuelle = nw > 0 ? c.value / nw : 0;
          return `<tr>
            <td><b>${U.escapeHtml(a ? a.name : c.id)}</b>
              <div class="small">${U.fmtPct(partActuelle, 0)} du patrimoine aujourd'hui,
              cible ${U.fmtPct(c.share, 0)}${c.cap ? ` · plafonné à ${U.fmtEUR(c.cap)}` : ''}</div></td>
            <td class="num stat-val" style="color:var(--or)">${U.fmtEUR(r.perAccount[c.id].amount)}</td>
          </tr>`;
        }).join('')}
        <tr class="section"><td>Total à virer</td><td class="num">${U.fmtEUR(totalVire)}</td></tr>
      </table>` : '';

    // Étape 2 — les achats, compte par compte, en parts entières.
    const avecAchats = ctx.filter(c => r.perAccount[c.id].buys.length);
    const etape2 = avecAchats.map(c => {
      const a = Engine.account(c.id);
      const buys = r.perAccount[c.id].buys.slice().sort((x, y) => y.cost - x.cost);
      const investi = U.sum(buys, b => b.cost);
      return `
        <h3 style="margin-top:16px">2 — Ordres à passer sur ${U.escapeHtml(a ? a.name : c.id)}
          <span class="small" style="text-transform:none">une fois le virement crédité</span></h3>
        <table>
          <tr><th>Support</th><th class="num">Quantité</th><th class="num">Cours</th><th class="num">Montant</th></tr>
          ${buys.map(b => `<tr>
            <td><b>${U.escapeHtml(ScreenPatrimoine._nomSupport(b.symbol))}</b></td>
            <td class="num stat-val">${b.shares}</td>
            <td class="num">${U.fmtPrice(b.price)}</td>
            <td class="num">${U.fmtEUR(b.cost)}</td></tr>`).join('')}
          <tr class="section"><td colspan="3">Total investi</td><td class="num">${U.fmtEUR(investi)}</td></tr>
        </table>`;
    }).join('');

    // Ce qui ne s'investit pas est dit, jamais passé sous silence (EX-55, P7).
    const reste = r.leftover > 0 ? `
      <div class="notice" style="margin-top:14px">
        <b class="num">${U.fmtEUR(r.leftover)}</b> ne trouvent pas de part entière à acheter et
        restent disponibles${courant ? ` sur ${U.escapeHtml(courant.name)}` : ''} —
        ce montant est le plus petit possible compte tenu du prix des parts.
      </div>` : '';

    const rienAFaire = !virements.length && !avecAchats.length;
    holder.innerHTML = rienAFaire
      ? `<div class="empty">Rien à verser : vos comptes cibles sont déjà à leur plafond.</div>${reste}`
      : etape1 + etape2 + reste;
  },

  renderGoals() {
    const holder = document.getElementById('pat-goals');
    const S = Store.state;
    const nw = Engine.netWorth(U.today());
    let html = '';
    if (S.goals.length) {
      // Une seule projection longue partagée par tous les objectifs.
      const p600 = Projection.run(600);
      html += '<table><tr><th>Objectif</th><th class="num">Progression</th><th>Atteint vers</th></tr>';
      for (const g of S.goals) {
        const prog = g.target > 0 ? U.clamp(nw.total / g.target, 0, 1) : 0;
        // Les deux dates : « 50 000 € en 2031 » ne valent pas 50 000 €
        // d'aujourd'hui — la date en pouvoir d'achat constant est la vraie (P8).
        const reach = nw.total >= g.target ? 'atteint ✓' :
          (() => {
            const r = Projection.goalReach(p600, g.target);
            if (!r.nominal) return 'hors d\'atteinte à 50 ans au rythme actuel';
            return `${U.fmtMonth(r.nominal)}<div class="small">${r.reel
              ? `en pouvoir d'achat constant : ${U.fmtMonth(r.reel)}`
              : 'jamais en pouvoir d\'achat constant, à 50 ans'}</div>`;
          })();
        html += `<tr><td>${U.escapeHtml(g.name)}<br><span class="small num">${U.fmtEUR(g.target)}</span></td>
          <td class="num">${U.fmtPct(prog, 0)}${Charts.gauge(prog)}</td>
          <td>${reach}</td></tr>`;
      }
      html += '</table>';
    } else {
      html += `<div class="empty">Aucun objectif — créez-en dans Réglages.</div>`;
    }
    // Rente potentielle (EX-70) — règle empirique au taux choisi, dite comme
    // telle, calculée aussi sur le patrimoine net de fiscalité : c'est
    // celui-là qu'on dépenserait réellement.
    const rNow = Projection.rente(nw.total);
    const h = Store.state.settings.horizonMonths || 120;
    const p = Projection.run(h);
    const last = p.central.length - 1;
    const accounts = Engine.accountsSorted().filter(a => !a.closed);
    const netH = Fisc.netTotal(accounts, p.valsSeries[last], p.basisSeries[last],
      Store.state.settings, last / 12, p.debts[last]);
    const rFuture = Projection.rente(p.central[last]);
    const rFutureNet = Projection.rente(netH);
    const rFutureNetReal = Projection.rente(U.roundCents(netH / p.deflator[last]));
    const tauxAff = (rNow.taux * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    html += `<div class="notice gold" style="margin-top:12px">
      <b>Rente potentielle</b> (règle empirique des ${tauxAff} %, réglable dans Réglages —
      un ordre de grandeur, en aucun cas une garantie) :<br>
      aujourd'hui ≈ <b class="num">${U.fmtEUR(rNow.monthly)}</b> /mois ·
      dans ${Math.round(h / 12)} ans ≈ <b class="num">${U.fmtEUR(rFuture.monthly)}</b> /mois brut,
      <b class="num">${U.fmtEUR(rFutureNet.monthly)}</b> /mois net de fiscalité de sortie
      <span class="small">(${U.fmtEUR(rFutureNetReal.monthly)} en pouvoir d'achat d'aujourd'hui)</span></div>`;
    holder.innerHTML = html;
  },
};
