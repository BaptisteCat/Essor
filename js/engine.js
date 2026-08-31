/* Essor — moteur de calcul.
   Tout découle des faits enregistrés : certifications de solde (P2),
   opérations, positions (quantités) et cours. Les soldes affichés sont
   toujours reconstruits, jamais stockés (EX-10, EX-72, EX-75). */
'use strict';

const ACCOUNT_TYPES = {
  courant: { label: 'Compte courant', classe: 'Comptes courants', invest: false, positions: false },
  // Un livret est un PLACEMENT — rémunéré, plafonné — et non de la trésorerie
  // de tous les jours : il ne se confond ni avec un compte courant, ni avec
  // l'argent qui dort sur un compte-titres.
  livret:  { label: 'Livret',         classe: 'Livrets d\'épargne', invest: false, positions: false },
  // `cashClasse` : ce que devient la part non placée en supports. Sur un
  // compte-titres c'est de l'argent qui attend ; sur une assurance-vie c'est
  // le fonds euros, donc un placement à part entière.
  titres:  { label: 'Compte-titres',  classe: 'Actions', invest: true, positions: true,
             cashClasse: 'Espèces sur comptes-titres' },
  pea:     { label: 'PEA',            classe: 'Actions', invest: true, positions: true,
             cashClasse: 'Espèces sur comptes-titres' },
  av:      { label: 'Assurance-vie',  classe: 'Actions', invest: true, positions: true,
             cashClasse: 'Fonds euros' },
  // Un portefeuille crypto ne se pense pas en « positions » et en ISIN, mais en
  // ACTIFS et en paires (BTC/EUR). Le vocabulaire de l'écran suit celui du
  // compte : c'est la même mécanique — quantité détenue, prix de revient,
  // valorisation au cours — sous les mots justes.
  crypto:  { label: 'Crypto',         classe: 'Crypto', invest: true, positions: true,
             cashClasse: 'Espèces sur compte crypto',
             motPositions: 'Actifs', motPosition: 'Actif', motSupport: 'Actif',
             exempleSupport: 'BTC', motPru: "Prix moyen d'achat", decimales: 8 },
  immo:    { label: 'Immobilier',     classe: 'Immobilier', invest: false, positions: false },
  autre:   { label: 'Autre',          classe: 'Autre', invest: false, positions: false },
};

const Engine = {

  S() { return Store.state; },

  account(id) { return Engine.S().accounts.find(a => a.id === id) || null; },

  accountsSorted() {
    return [...Engine.S().accounts].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  /* ---------- Solde espèces reconstruit (EX-10) ---------- */

  // Solde espèces d'un compte à la fin du jour `date`.
  // Convention : une certification à la date J inclut toutes les opérations ≤ J.
  cashBalance(accountId, date) {
    const S = Engine.S();
    const certs = S.certifications.filter(c => c.accountId === accountId)
      .sort((a, b) => a.date < b.date ? -1 : 1);
    if (!certs.length) return null; // solde inconnu tant que rien n'est certifié
    // Certification la plus proche de la date demandée.
    let cert = certs[0];
    for (const c of certs) if (c.date <= date) cert = c;
    if (certs[0].date > date) cert = certs[0];

    let bal = cert.balance;
    const txs = S.transactions;
    if (date >= cert.date) {
      for (const t of txs) {
        if (t.accountId === accountId && t.date > cert.date && t.date <= date) bal += t.amount;
      }
    } else {
      for (const t of txs) {
        if (t.accountId === accountId && t.date > date && t.date <= cert.date) bal -= t.amount;
      }
    }
    return bal;
  },

  /* ---------- Positions et cours (EX-11, EX-14) ---------- */

  // Quantité détenue à une date. Un instantané de courtier fait autorité à sa
  // date (P2) ; seuls les mouvements postérieurs s'y ajoutent. À défaut
  // d'instantané, la quantité est le cumul des mouvements.
  qtyAt(accountId, symbol, date) {
    const S = Engine.S();
    let snap = null;
    for (const s of S.positionSnapshots || []) {
      if (s.accountId === accountId && s.symbol === symbol && s.date <= date) {
        if (!snap || s.date > snap.date) snap = s;
      }
    }
    let q = snap ? snap.qty : 0;
    for (const t of S.trades) {
      if (t.accountId !== accountId || t.symbol !== symbol) continue;
      if (t.date > date) continue;
      if (snap && t.date <= snap.date) continue; // déjà compris dans l'instantané
      q += t.qtyDelta;
    }
    return Math.round(q * 1e6) / 1e6;
  },

  symbolsOf(accountId) {
    const set = new Set();
    for (const t of Engine.S().trades) if (t.accountId === accountId) set.add(t.symbol);
    for (const s of Engine.S().positionSnapshots || []) if (s.accountId === accountId) set.add(s.symbol);
    return [...set];
  },

  // Dernier cours connu ≤ date ; à défaut le plus ancien connu. {price, date, approx}
  priceAt(symbol, date) {
    const hist = Engine.S().prices[symbol];
    if (!hist) return null;
    const dates = Object.keys(hist).sort();
    if (!dates.length) return null;
    let best = null;
    for (const d of dates) { if (d <= date) best = d; else break; }
    if (best) return { price: hist[best], date: best, approx: U.monthOf(best) !== U.monthOf(date) && best < date };
    return { price: hist[dates[0]], date: dates[0], approx: true };
  },

  // Le cours garde ses décimales : l'arrondi au centime porte sur la valeur
  // calculée, pas sur le taux (EX-77).
  setPrice(symbol, date, cents) {
    const S = Engine.S();
    if (!S.prices[symbol]) S.prices[symbol] = {};
    S.prices[symbol][date] = Math.round(cents * 10000) / 10000;
    S.snapshotsDirty = true;
  },

  // Valeur des positions d'un compte à une date. {value, detail:[{symbol, qty, price, value, approx}]}
  positionsValue(accountId, date) {
    let value = 0;
    const detail = [];
    for (const sym of Engine.symbolsOf(accountId)) {
      const qty = Engine.qtyAt(accountId, sym, date);
      if (Math.abs(qty) < 1e-9) continue;
      const p = Engine.priceAt(sym, date);
      const v = p ? U.roundCents(qty * p.price) : 0;
      value += v;
      detail.push({ symbol: sym, qty, price: p ? p.price : null, priceDate: p ? p.date : null, value: v, approx: !p || p.approx });
    }
    return { value, detail };
  },

  /* ---------- Valeur d'un compte, patrimoine (EX-1, EX-111) ---------- */

  // Valeur totale d'un compte : espèces + positions. Les liquidités d'un
  // compte-titres — versements pas encore investis — comptent dans le
  // patrimoine au même titre que les titres (EX-111) ; elles ne sont jamais
  // présentées comme exposées aux marchés (EX-6).
  // Quand aucune certification ne permet de les connaître, `cashKnown` est
  // faux : l'interface doit le dire, jamais afficher un zéro qui ressemble à
  // un fait (P7).
  accountValue(accountId, date) {
    const acc = Engine.account(accountId);
    if (!acc) return null;
    const cash = Engine.cashBalance(accountId, date);
    const hasPos = ACCOUNT_TYPES[acc.type]?.positions;
    const pos = hasPos ? Engine.positionsValue(accountId, date) : { value: 0, detail: [] };
    if (cash === null && !pos.detail.length) return null;
    return { cash: cash ?? 0, cashKnown: cash !== null, positions: pos.value, detail: pos.detail, total: (cash ?? 0) + pos.value };
  },

  // Comptes qui détiennent des titres sans que leurs espèces soient connues :
  // leur patrimoine est sous-estimé du montant non investi (EX-111).
  accountsWithUnknownCash() {
    return Engine.S().accounts.filter(a => {
      if (a.closed || !ACCOUNT_TYPES[a.type]?.positions) return false;
      const v = Engine.accountValue(a.id, U.today());
      return v && !v.cashKnown;
    });
  },

  // Somme des mouvements espèces connus d'un compte, toutes dates confondues.
  // Sert à proposer une certification de départ à l'import d'un rapport de
  // courtier : si le rapport couvre toute la vie du compte, le solde espèces
  // actuel vaut cette somme.
  cashFlowTotal(accountId) {
    return U.sum(Engine.S().transactions.filter(t => t.accountId === accountId), t => t.amount);
  },

  // Capital restant dû d'un crédit à une date (amortissement mensuel, EX-64).
  creditRemaining(credit, date) {
    if (date < credit.startDate) return 0;
    const startMonth = U.monthOf(credit.startDate);
    const n = U.clamp(U.monthDiff(startMonth, U.monthOf(date)), 0, credit.months ?? 1200);
    let rest = credit.principal;
    const r = (credit.annualRate || 0) / 12;
    for (let i = 0; i < n && rest > 0; i++) {
      const interest = U.roundCents(rest * r); // arrondi au centime à chaque échéance (EX-77)
      rest = rest + interest - credit.monthlyPayment;
      if (rest < 0) rest = 0;
    }
    return rest;
  },

  // Patrimoine net à une date : actifs − dettes (EX-1, EX-3).
  netWorth(date) {
    const S = Engine.S();
    let assets = 0;
    const byAccount = {};
    for (const a of S.accounts) {
      if (a.closed) continue;
      const v = Engine.accountValue(a.id, date);
      byAccount[a.id] = v ? v.total : 0;
      assets += v ? v.total : 0;
    }
    let debts = 0;
    for (const c of S.credits) debts += Engine.creditRemaining(c, date);
    return { assets, debts, total: assets - debts, byAccount };
  },

  /* ---------- Historique mensuel (EX-8, EX-73, EX-74, EX-107) ---------- */

  firstKnownMonth() {
    const S = Engine.S();
    let min = null;
    for (const c of S.certifications) { const m = U.monthOf(c.date); if (!min || m < min) min = m; }
    for (const t of S.transactions) { const m = U.monthOf(t.date); if (!min || m < min) min = m; }
    for (const t of S.trades) { const m = U.monthOf(t.date); if (!min || m < min) min = m; }
    return min;
  },

  // Recalcule intégralement l'historique (EX-75). Un mois révolu est valorisé
  // à son dernier jour — jamais avec les valeurs du jour (EX-73, EX-107).
  computeSnapshots() {
    const S = Engine.S();
    const first = Engine.firstKnownMonth();
    const cur = U.currentMonth();
    const snaps = {};
    if (first) {
      for (const m of U.monthRange(first, cur)) {
        const date = m === cur ? U.today() : U.monthEnd(m);
        const nw = Engine.netWorth(date);
        snaps[m] = { total: nw.total, assets: nw.assets, debts: nw.debts, byAccount: nw.byAccount, asOf: date };
      }
    }
    S.snapshots = snaps;
    S.snapshotsDirty = false;
    return snaps;
  },

  // Toute donnée dérivée obsolète est rafraîchie sans demande (EX-76, EX-112).
  snapshots() {
    const S = Engine.S();
    if (S.snapshotsDirty) { Engine.computeSnapshots(); Store.markDirty(); }
    return S.snapshots;
  },

  invalidate() {
    Engine.S().snapshotsDirty = true;
    Store.markDirty();
  },

  /* ---------- Répartition et exposition (EX-4, EX-5, EX-6) ---------- */

  // Répartition par classe d'actifs de tout le patrimoine.
  allocationByClass(date) {
    const S = Engine.S();
    const out = new Map();
    const add = (classe, v) => out.set(classe, (out.get(classe) || 0) + v);
    for (const a of S.accounts) {
      if (a.closed) continue;
      const v = Engine.accountValue(a.id, date);
      if (!v) continue;
      const meta = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.autre;
      if (meta.positions) {
        // Les liquidités d'un compte d'investissement restent des liquidités (EX-6).
        // Nommer précisément : « Liquidités » tout court se confondait avec
        // les comptes courants, alors qu'il s'agit ici de l'argent versé sur
        // un compte-titres et pas encore placé (EX-6).
        if (v.cash) add(meta.cashClasse || 'Espèces sur comptes-titres', v.cash);
        for (const d of v.detail) add(Engine._classOfSymbol(d.symbol, a.type), d.value);
      } else {
        add(meta.classe, v.total);
      }
    }
    return out;
  },

  _classOfSymbol(symbol, accountType) {
    const meta = Engine.S().priceMeta[symbol];
    if (meta && meta.classe) return meta.classe;
    if (accountType === 'crypto') return 'Crypto';
    return 'Actions';
  },

  // Exposition géographique de la part investie, par transparence des
  // supports (EX-5), selon la répartition
  // par pays/région déclarée pour chaque support. Un support dont la
  // répartition n'est pas renseignée est compté à part, pour que l'écran ne
  // laisse jamais croire à une couverture complète (P7).
  // Continent d'une région, pour la vue d'ensemble. Le rattachement porte sur
  // des noms de pays, pas sur la situation de l'utilisateur (EX-35) ; ce qui
  // n'est pas reconnu tombe dans « Autres », jamais dans un continent au
  // hasard.
  CONTINENTS: {
    'Amérique du Nord': /états.unis|etats.unis|usa|american|amérique du nord|canada/i,
    'Europe': /europe|zone euro|france|allemagne|royaume.uni|suisse|pays.bas|italie|espagne|belgique|suède|danemark|norvège|portugal|autriche|irlande|finlande/i,
    'Asie développée': /japon|corée du sud|coree du sud|singapour|hong.kong|australie|nouvelle.zélande|pacifique/i,
    'Marchés émergents': /émergent|emergent|chine|inde|taïwan|taiwan|brésil|bresil|mexique|afrique du sud|indonésie|thaïlande|turquie|malaisie/i,
  },

  continentOf(region) {
    for (const [nom, re] of Object.entries(Engine.CONTINENTS)) if (re.test(region)) return nom;
    return 'Autres';
  },

  geoExposure(date) {
    const S = Engine.S();
    const expo = new Map();
    let invested = 0, described = 0;
    const inconnus = [];
    const symbols = [];   // supports effectivement décomposés
    const add = (k, v) => expo.set(k, (expo.get(k) || 0) + v);
    for (const a of S.accounts) {
      if (a.closed || !ACCOUNT_TYPES[a.type]?.positions) continue;
      const v = Engine.accountValue(a.id, date);
      if (!v) continue;
      for (const d of v.detail) {
        invested += d.value;
        const g = S.geo[d.symbol];
        if (g && Object.keys(g).length) {
          described += d.value;
          symbols.push(d.symbol);
          // La somme des régions doit rendre exactement la valeur du support.
          const regions = Object.keys(g);
          const parts = U.splitCents(d.value, regions.map(r => g[r]));
          regions.forEach((r, i) => add(r, parts[i]));
        } else {
          inconnus.push({ symbol: d.symbol, value: d.value });
        }
      }
    }
    // Vue d'ensemble par continent, en plus du détail par pays.
    const continents = new Map();
    for (const [region, v] of expo) {
      const c = Engine.continentOf(region);
      continents.set(c, (continents.get(c) || 0) + v);
    }
    const nw = Engine.netWorth(date);
    return { expo, continents, invested, described, inconnus, symbols,
      share: nw.total > 0 ? invested / nw.total : 0 };
  },

  /* ---------- Performance hors versements (EX-7) ---------- */

  // Gain de marché d'un mois : ΔV − flux externes. Les intérêts crédités
  // sont un gain, pas un flux (EX-43).
  monthlyPerformance(month) {
    const S = Engine.S();
    const cur = U.currentMonth();
    const endDate = month === cur ? U.today() : U.monthEnd(month);
    const startDate = U.monthEnd(U.addMonths(month, -1));
    let vStart = 0, vEnd = 0, flows = 0;
    for (const a of S.accounts) {
      if (a.closed) continue;
      const v0 = Engine.accountValue(a.id, startDate);
      const v1 = Engine.accountValue(a.id, endDate);
      vStart += v0 ? v0.total : 0;
      vEnd += v1 ? v1.total : 0;
    }
    for (const t of S.transactions) {
      if (t.date > startDate && t.date <= endDate && !Engine._isInterest(t)) flows += t.amount;
    }
    const gain = vEnd - vStart - flows;
    return { month, vStart, vEnd, flows, gain, rate: vStart > 0 ? gain / vStart : null };
  },

  _isInterest(t) {
    if (t.kind === 'interet') return true;
    return /INTERETS?|INTÉRÊTS?/.test((t.label || '').toUpperCase());
  },

  // Plus-value latente d'un compte à positions, quand les PRU sont connus
  // (EX-12). Null si rien n'est calculable.
  latentGain(accountId, date) {
    const a = Engine.account(accountId);
    if (!a || !ACCOUNT_TYPES[a.type]?.positions) return null;
    const v = Engine.accountValue(accountId, date || U.today());
    if (!v || !v.detail.length) return null;
    let cost = 0, has = false;
    for (const d of v.detail) {
      const pru = Engine.S().pru[d.symbol];
      if (pru) { cost += U.roundCents(d.qty * pru); has = true; }
      else cost += d.value;
    }
    return has ? v.positions - cost : null;
  },

  // Base fiscale approchée d'un compte aujourd'hui : sa valeur moins la
  // plus-value latente connue. Sans PRU, les plus-values antérieures sont
  // ignorées — l'impôt projeté est alors un plancher, et l'écran le dit (P7).
  fiscalBasis(accountId) {
    const v = Engine.accountValue(accountId, U.today());
    if (!v) return 0;
    return v.total - (Engine.latentGain(accountId) || 0);
  },

  // Rendement annualisé CONSTATÉ par nature de compte, sur les mois complets
  // connus. Sert à confronter les hypothèses de projection au réel : régler
  // un rendement attendu sans voir le réalisé, c'est régler à l'aveugle.
  // Méthode : rendement mensuel = gains hors flux / valeur de départ, agrégé
  // par nature, chaîné géométriquement puis annualisé. Minimum 3 mois.
  realizedByType() {
    const S = Engine.S();
    const first = Engine.firstKnownMonth();
    if (!first) return {};
    const lastComplete = U.addMonths(U.currentMonth(), -1);
    if (first > lastComplete) return {};
    // Flux par compte et par mois, les intérêts comptant comme des gains (EX-43).
    const flows = new Map();
    for (const t of S.transactions) {
      if (Engine._isInterest(t)) continue;
      const k = t.accountId + '|' + U.monthOf(t.date);
      flows.set(k, (flows.get(k) || 0) + t.amount);
    }
    const acc = {};
    for (const m of U.monthRange(first, lastComplete)) {
      const start = U.monthEnd(U.addMonths(m, -1));
      const end = U.monthEnd(m);
      const gains = {}, bases = {};
      for (const a of S.accounts) {
        if (a.closed) continue;
        const v0 = Engine.accountValue(a.id, start);
        const v1 = Engine.accountValue(a.id, end);
        if (!v0 || !v1 || v0.total <= 0) continue;
        gains[a.type] = (gains[a.type] || 0) + (v1.total - v0.total - (flows.get(a.id + '|' + m) || 0));
        bases[a.type] = (bases[a.type] || 0) + v0.total;
      }
      for (const type in bases) {
        if (bases[type] <= 0) continue;
        if (!acc[type]) acc[type] = { linked: 1, n: 0 };
        acc[type].linked *= (1 + gains[type] / bases[type]);
        acc[type].n++;
      }
    }
    const out = {};
    for (const type in acc) {
      if (acc[type].n >= 3 && acc[type].linked > 0) {
        out[type] = { annual: Math.pow(acc[type].linked, 12 / acc[type].n) - 1, months: acc[type].n };
      }
    }
    return out;
  },

  /* ---------- Agrégats budgétaires ---------- */

  // Mois comptable d'une opération : le rattachement prime la date (EX-46/47).
  budgetMonth(t) { return t.monthOverride || U.monthOf(t.date); },

  // Opérations d'un mois comptable, mouvements internes exclus (EX-21, EX-40).
  monthFlows(month) {
    const S = Engine.S();
    const txs = S.transactions.filter(t => Engine.budgetMonth(t) === month && !t.internal);
    const expenses = txs.filter(t => t.amount < 0);
    const incomes = txs.filter(t => t.amount > 0);
    return { txs, expenses, incomes,
      totalExpenses: U.sum(expenses, t => t.amount),
      totalIncomes: U.sum(incomes, t => t.amount) };
  },

  budgetLine(lineId) {
    const b = Engine.S().budget;
    for (const c of b.categories) {
      const l = c.lines.find(l => l.id === lineId);
      if (l) return { line: l, category: c, kind: 'expense' };
    }
    let l = b.incomes.find(l => l.id === lineId);
    if (l) return { line: l, category: null, kind: 'income' };
    l = b.savings.find(l => l.id === lineId);
    if (l) return { line: l, category: null, kind: 'saving' };
    return null;
  },

  allLines() {
    const b = Engine.S().budget;
    const out = [];
    for (const c of b.categories) for (const l of c.lines) out.push({ ...l, category: c.name, kind: 'expense' });
    for (const l of b.incomes) out.push({ ...l, category: 'Revenus', kind: 'income' });
    for (const l of b.savings) out.push({ ...l, category: 'Épargne', kind: 'saving' });
    return out;
  },
};
