/* Essor — moteur d'allocation d'épargne (EX-52…57).
   UNIQUE : l'assistant d'épargne et la projection appellent exactement cette
   fonction (EX-57, P9). Combler d'abord les retards sur cibles, puis répartir
   le surplus selon les parts visées, plafonds respectés, débordements
   reportés (EX-53). Pour un compte-titres : parts entières, reliquat rendu
   aux autres comptes (EX-54), non-investi minimisé (EX-55). */
'use strict';

const Alloc = {

  // amount : centimes à répartir.
  // accts : [{id, type, value, share, cap?, plafond?, supports?:[{symbol, price, weight}]}]
  //   share ∈ [0,1] — part du patrimoine total visée (EX-52) ; cap — montant max.
  // → {perAccount: {id: {amount, buys:[{symbol, shares, price, cost}]}}, leftover}
  allocate(amount, accts) {
    const res = {};
    for (const a of accts) res[a.id] = { amount: 0, buys: [] };
    if (amount <= 0 || !accts.length) return { perAccount: res, leftover: Math.max(0, amount) };

    const targeted = accts.filter(a => a.share > 0);
    const totalP = U.sum(accts, a => a.value) + amount;
    // Valeur visée d'un compte : part du patrimoine, bornée par le montant
    // maximum et le plafond réglementaire (EX-52, EX-2).
    const capOf = a => Math.min(a.cap ?? Infinity, a.plafond ?? Infinity);
    const targetOf = a => Math.min(a.share * totalP, capOf(a));

    let pool = amount;

    // Phase 1 — combler les retards, au prorata des retards (EX-53).
    pool -= Alloc._waterFill(pool, targeted, res,
      a => Math.max(0, U.roundCents(targetOf(a)) - (a.value + res[a.id].amount)),
      a => Math.max(0, U.roundCents(targetOf(a)) - (a.value + res[a.id].amount)));

    // Phase 2 — surplus selon les parts visées, dans la limite des plafonds ;
    // ce qui déborde d'un compte plein se reporte sur les autres (EX-53).
    pool -= Alloc._waterFill(pool, targeted, res,
      a => a.share,
      a => Math.max(0, U.roundCents(capOf(a) === Infinity ? Infinity : capOf(a)) - (a.value + res[a.id].amount)));

    // Phase 3 — comptes à supports : parts entières uniquement (EX-54).
    // Le reliquat retourne au pot et se redistribue aux autres.
    for (let pass = 0; pass < 3; pass++) {
      let returned = 0;
      for (const a of accts) {
        if (!a.supports || !a.supports.length) continue;
        const cash = res[a.id].amount - U.sum(res[a.id].buys, b => b.cost);
        if (cash <= 0) continue;
        const buys = Alloc.fitShares(cash, a.supports, res[a.id].buys);
        const spent = U.sum(buys, b => b.cost);
        res[a.id].buys = Alloc._mergeBuys(res[a.id].buys, buys);
        const rest = cash - spent;
        if (rest > 0) { res[a.id].amount -= rest; returned += rest; }
      }
      if (!returned) break;
      // Redistribution du reliquat, plafonds toujours respectés.
      const absorbed = Alloc._waterFill(returned, targeted, res,
        a => a.share,
        a => {
          const cap = capOf(a);
          return Math.max(0, (cap === Infinity ? Infinity : U.roundCents(cap)) - (a.value + res[a.id].amount));
        });
      pool += returned - absorbed;
      if (absorbed === 0) break;
    }

    // Invariant final : sur un compte à supports, le montant versé est
    // exactement le coût des parts entières — ce qui n'achète pas de part
    // n'est jamais immobilisé (EX-54) et rejoint le non-investi (EX-55).
    for (const a of accts) {
      if (!a.supports || !a.supports.length) continue;
      const spent = U.sum(res[a.id].buys, b => b.cost);
      if (res[a.id].amount > spent) { pool += res[a.id].amount - spent; res[a.id].amount = spent; }
    }
    const leftover = pool;
    return { perAccount: res, leftover };
  },

  // Remplissage proportionnel avec bornes : répartit `pool` selon weightFn,
  // sans dépasser roomFn, en réitérant tant qu'il reste du pot et de la place.
  // Retourne le montant effectivement distribué.
  _waterFill(pool, accts, res, weightFn, roomFn) {
    let distributed = 0;
    let remaining = Math.max(0, Math.floor(pool));
    for (let iter = 0; iter < 20 && remaining > 0; iter++) {
      const open = accts.filter(a => roomFn(a) > 0 && weightFn(a) > 0);
      if (!open.length) break;
      const wSum = U.sum(open, weightFn);
      if (wSum <= 0) break;
      let roundGiven = 0;
      for (const a of open) {
        const ideal = remaining * (weightFn(a) / wSum);
        const give = Math.min(Math.floor(ideal), roomFn(a));
        if (give > 0) { res[a.id].amount += give; roundGiven += give; }
      }
      if (roundGiven === 0) {
        // Miettes : au premier compte ouvert, centime par centime.
        for (const a of open) {
          const give = Math.min(remaining, roomFn(a));
          if (give > 0) { res[a.id].amount += give; roundGiven += give; break; }
        }
        if (roundGiven === 0) break;
      }
      remaining -= roundGiven;
      distributed += roundGiven;
    }
    return distributed;
  },

  // Parts entières pour un budget donné : viser les poids demandés, une part
  // chère ne doit jamais immobiliser l'argent (EX-54) — on achète tant qu'un
  // support abordable existe, en servant d'abord le plus en retard.
  // priorBuys : achats déjà décidés (pour viser les poids globalement).
  fitShares(budget, supports, priorBuys = []) {
    const sup = supports.filter(s => s.price > 0);
    if (!sup.length) return [];
    const wSum = U.sum(sup, s => s.weight || 1) || 1;
    const spent = {};
    for (const b of priorBuys) spent[b.symbol] = (spent[b.symbol] || 0) + b.cost;
    const priorTotal = U.sum(Object.values(spent));
    const total = budget + priorTotal;
    const buys = new Map();
    let rest = budget;
    for (let guard = 0; guard < 100000; guard++) {
      let best = null, bestDeficit = -Infinity;
      for (const s of sup) {
        const b0 = buys.get(s.symbol);
        const inc = U.roundCents(((b0 ? b0.shares : 0) + 1) * s.price) - (b0 ? b0.cost : 0);
        if (inc > rest) continue;
        const cur = (spent[s.symbol] || 0) + (buys.get(s.symbol)?.cost || 0);
        const deficit = total * ((s.weight || 1) / wSum) - cur;
        if (deficit > bestDeficit) { bestDeficit = deficit; best = s; }
      }
      if (!best) break;
      const b = buys.get(best.symbol) || { symbol: best.symbol, shares: 0, price: best.price, cost: 0 };
      // Le cours d'un ETF a des décimales sous le centime ; le MONTANT d'un
      // ordre, lui, s'arrête au centime (EX-77). On avance donc par le coût
      // arrondi cumulé, de sorte que cost === arrondi(parts × cours) à tout
      // instant et que le reste demeure un nombre entier de centimes.
      const coutSuivant = U.roundCents((b.shares + 1) * best.price);
      const increment = coutSuivant - b.cost;
      if (increment > rest) break;   // plus finançable une fois arrondi
      b.shares += 1;
      b.cost = coutSuivant;
      buys.set(best.symbol, b);
      rest -= increment;
    }
    return [...buys.values()];
  },

  _mergeBuys(a, b) {
    const m = new Map();
    for (const x of [...a, ...b]) {
      const cur = m.get(x.symbol) || { symbol: x.symbol, shares: 0, price: x.price, cost: 0 };
      cur.shares += x.shares;
      cur.cost += x.cost;
      cur.price = x.price;
      m.set(x.symbol, cur);
    }
    return [...m.values()];
  },

  /* ---------- Contexte réel : construit les entrées depuis l'état ---------- */

  // Prépare le contexte d'allocation à une date donnée (utilisé par
  // l'assistant ET par la projection — mêmes entrées, même fonction).
  buildContext(date) {
    const S = Store.state;
    const accts = [];
    for (const a of Engine.accountsSorted()) {
      if (a.closed) continue;
      const target = S.targets.find(t => t.accountId === a.id);
      const v = Engine.accountValue(a.id, date);
      const entry = {
        id: a.id, type: a.type,
        value: v ? v.total : 0,
        share: target ? target.share : 0,
        cap: target && target.cap ? target.cap : undefined,
        plafond: a.plafond || undefined,
      };
      if (ACCOUNT_TYPES[a.type]?.positions) {
        const weights = target && target.supports ? target.supports : null;
        const detail = v ? v.detail : [];
        const syms = weights ? weights.map(w => w.symbol) : detail.map(d => d.symbol);
        entry.supports = syms.map(sym => {
          const p = Engine.priceAt(sym, date);
          const w = weights ? (weights.find(x => x.symbol === sym)?.weight || 1)
            : Math.max(1, detail.find(d => d.symbol === sym)?.value || 1);
          return { symbol: sym, price: p ? p.price : 0, weight: w };
        }).filter(s => s.price > 0);
      }
      accts.push(entry);
    }
    return accts;
  },

  // Épargne mensuelle prévue au budget (EX-56) : total des lignes d'épargne.
  plannedMonthlySavings() {
    return U.sum(Store.state.budget.savings, l => l.amount || 0);
  },
};
