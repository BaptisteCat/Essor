/* Essor — projection du patrimoine (EX-58…70).

   Capitalisation composée mois par mois (EX-59), rendements prudents par
   nature nets de frais (EX-60), inflation et pouvoir d'achat constant
   (EX-62), amortissement des crédits (EX-64). L'épargne mensuelle est
   répartie par le MÊME moteur que l'assistant (EX-57).

   Scénario avancé (settings.projAdvanced, opt-in) : paliers d'épargne datés,
   charges mensuelles à venir, rentrées et dépenses ponctuelles,
   remboursements anticipés de crédit — le tout rejoué à l'identique par la
   centrale et le Monte Carlo. Désactivé, la projection est inchangée.

   Dispersion (EX-65, EX-66) : le rendement saisi est le taux de croissance
   médian ; autour de lui, les scénarios sont des QUANTILES d'un modèle
   log-normal appliqué à chaque compte volatil — prudent = P25, optimiste =
   P75, bande = P10–P90. L'incertitude d'un euro croît avec son temps passé
   en marché : on suit donc, compte par compte, l'âge moyen pondéré des
   sommes investies — un versement de 2035 est moins incertain en 2036 que
   le capital de départ. Deux fautes de la version précédente sont ainsi
   corrigées : la part volatile n'est plus figée au jour 0, et un actif très
   volatil ne capitalise plus ±σ/2 par an pendant tout l'horizon.

   Le Monte Carlo (monteCarlo) tire 500 trajectoires reproductibles (graine
   fixe) avec les mêmes hypothèses : rendements mensuels log-normaux,
   comptes de même famille parfaitement corrélés (PEA et compte-titres
   bougent ensemble), familles indépendantes entre elles. */
'use strict';

const Projection = {

  // Quantiles retenus : scénarios = quartiles, bande = P10–P90.
  Z: { p10: -1.2816, p25: -0.6745, p75: 0.6745, p90: 1.2816 },

  // Rendement net : hypothèse de la nature (ou du compte), moins les frais
  // annuels du compte — 0,8 % de frais d'AV pendant 20 ans, c'est un
  // cinquième du capital final, ils ne peuvent pas être ignorés.
  returnOf(a) {
    const S = Store.state;
    return (a.returnOverride ?? S.settings.returns[a.type] ?? 0) - (a.feesRate || 0);
  },

  volOf(a) { return Store.state.settings.vols[a.type] ?? 0; },

  // Épargne mensuelle capitalisée par la projection : le montant choisi sur
  // l'écran Patrimoine, à défaut la somme des versements d'épargne du budget.
  monthlySavings() {
    const S = Store.state.settings;
    return S.projSavings != null ? S.projSavings : Alloc.plannedMonthlySavings();
  },

  // Scénario avancé s'il est activé, null sinon — désactivé, la projection
  // est strictement celle d'origine.
  advanced() {
    const a = Store.state.settings.projAdvanced;
    return a && a.enabled ? a : null;
  },

  // Échéancier d'un crédit avec remboursements anticipés : capital restant dû
  // à chaque mois de projection (rem[m]), dernier mois où une mensualité part
  // encore (endPay — échéance naturelle ou solde anticipé), et montant
  // réellement prélevé par chaque remboursement (un « solde total » vaut le
  // capital restant CE mois-là, pas celui d'aujourd'hui). Sans remboursement
  // anticipé, reproduit Engine.creditRemaining à l'identique.
  creditSchedule(credit, startMonth, horizonMonths, payoffs = []) {
    const first = U.monthOf(credit.startDate);
    const maxN = credit.months ?? 1200;
    const r = (credit.annualRate || 0) / 12;
    const lastMonth = U.addMonths(startMonth, horizonMonths);
    const rem = new Array(horizonMonths + 1).fill(0);
    const applied = new Map();
    let rest = credit.principal;
    let endPay = null;
    for (let month = first, i = 0; month <= lastMonth; month = U.addMonths(month, 1), i++) {
      if (i > 0 && i <= maxN && rest > 0) {
        rest = rest + U.roundCents(rest * r) - credit.monthlyPayment;
        if (rest < 0) rest = 0;
      }
      for (const p of payoffs) {
        if (p.month === month && rest > 0) {
          const montant = p.amount != null ? Math.min(p.amount, rest) : rest;
          applied.set(p.id, montant);
          rest -= montant;
        }
      }
      if (endPay === null && (rest <= 0 || i >= maxN)) endPay = month;
      const idx = U.monthDiff(startMonth, month);
      if (idx >= 0 && idx <= horizonMonths) rem[idx] = rest;
    }
    return { rem, endPay, applied };
  },

  // → {months, central, low (P25), high (P75), band {low:P10, high:P90},
  //    real {central, low, high}, firstAlloc, contribs, debts, deflator}
  run(horizonMonths, opts = {}) {
    const S = Store.state;
    const today = U.today();
    const startMonth = U.currentMonth();
    const monthlyInfl = Math.pow(1 + S.settings.inflation, 1 / 12) - 1;
    const accounts = Engine.accountsSorted().filter(a => !a.closed);
    const baseCtx = Alloc.buildContext(today);
    let savings = opts.monthlySavings ?? Projection.monthlySavings();

    // Scénario avancé (paliers d'épargne, charges, ponctuels, remboursements
    // anticipés) : tout est daté au mois. Les échéanciers de crédit sont
    // recalculés une fois, remboursements compris — la centrale et le Monte
    // Carlo (qui rejoue contribs et debts) voient le même monde.
    const adv = Projection.advanced();
    const steps = adv ? adv.savingsSteps.slice().sort((a, b) => a.month < b.month ? -1 : 1) : [];
    let stepIdx = 0;
    const plans = adv ? S.credits.map(c => Projection.creditSchedule(c, startMonth, horizonMonths,
      (adv.payoffs || []).filter(p => p.creditId === c.id))) : null;
    const payoffParMois = new Map();
    if (adv) {
      S.credits.forEach((c, i) => {
        for (const p of (adv.payoffs || [])) {
          if (p.creditId === c.id && plans[i].applied.has(p.id))
            payoffParMois.set(p.month, (payoffParMois.get(p.month) || 0) + plans[i].applied.get(p.id));
        }
      });
    }
    const cashAcc = accounts.find(a => a.type === 'courant') || accounts[0];

    // Valeurs par compte en centimes flottants internes — l'arrondi ne se
    // fait qu'en sortie, pour une capitalisation exacte (EX-77, crit. 1).
    // sage = valeur × années passées en marché, pour l'âge moyen pondéré.
    // fisc = base fiscale : les versements, que l'impôt de sortie ne frappe
    // jamais — seuls les gains au-delà sont imposables.
    const vals = {}, sage = {}, fisc = {};
    for (const c of baseCtx) { vals[c.id] = c.value; sage[c.id] = 0; fisc[c.id] = Engine.fiscalBasis(c.id); }

    const out = { months: [], central: [], low: [], high: [],
      band: { low: [], high: [] }, real: { central: [], low: [], high: [] },
      firstAlloc: null, contribs: [], debts: [], deflator: [],
      valsSeries: [], basisSeries: [] };

    for (let m = 0; m <= horizonMonths; m++) {
      const month = U.addMonths(startMonth, m);
      const contrib = {};
      if (m > 0) {
        // 0. Scénario avancé : l'épargne du mois se corrige AVANT d'être
        //    versée — palier daté, charges en plus, mensualités libérées,
        //    rentrées ponctuelles. Ce qui sort (dépense ponctuelle, épargne
        //    nette négative, remboursement anticipé) est retiré du compte
        //    courant, jamais absorbé en silence.
        let pool = savings;
        let retrait = 0;
        if (adv) {
          while (stepIdx < steps.length && steps[stepIdx].month <= month) savings = pool = steps[stepIdx++].amount;
          pool -= U.sum((adv.charges || []).filter(c => c.from <= month && (!c.to || month <= c.to)), c => c.amount);
          if (adv.freedPaymentToSavings) {
            S.credits.forEach((c, i) => {
              if (plans[i].endPay && plans[i].endPay < month) pool += c.monthlyPayment;
            });
          }
          for (const e of (adv.events || [])) {
            if (e.month !== month) continue;
            if (e.amount > 0) pool += e.amount; else retrait += -e.amount;
          }
          retrait += payoffParMois.get(month) || 0;
          if (pool < 0) { retrait += -pool; pool = 0; }
        }
        // 1. Épargne du mois, versée en début de mois et répartie par LE
        //    moteur d'allocation (EX-57) — au mois 1, contexte identique à
        //    celui de l'assistant (critère d'acceptation 3).
        if (pool > 0) {
          const ctx = baseCtx.map(c => ({ ...c, value: vals[c.id],
            supports: c.supports ? c.supports.map(s => ({ ...s,
              price: Math.max(1, Math.round(s.price * Math.pow(1 + (Projection.returnOf(accounts.find(a => a.id === c.id)) || 0), (m - 1) / 12))) })) : undefined }));
          const alloc = Alloc.allocate(U.roundCents(pool), ctx);
          if (m === 1) out.firstAlloc = alloc;
          for (const c of ctx) {
            vals[c.id] += alloc.perAccount[c.id].amount;
            fisc[c.id] += alloc.perAccount[c.id].amount;   // un versement n'est pas un gain
            if (alloc.perAccount[c.id].amount) contrib[c.id] = alloc.perAccount[c.id].amount;
          }
          if (alloc.leftover > 0 && cashAcc) {
            vals[cashAcc.id] += alloc.leftover;
            fisc[cashAcc.id] += alloc.leftover;
            contrib[cashAcc.id] = (contrib[cashAcc.id] || 0) + alloc.leftover;
          }
        }
        if (retrait > 0 && cashAcc) {
          vals[cashAcc.id] -= retrait;
          fisc[cashAcc.id] = Math.max(0, fisc[cashAcc.id] - retrait);
          contrib[cashAcc.id] = (contrib[cashAcc.id] || 0) - retrait;
        }
        // 2. Capitalisation : les gains produisent des gains (EX-59, EX-61).
        //    Un versement entre avec un âge nul ; l'argent déjà investi
        //    vieillit d'un mois — son incertitude aussi.
        for (const a of accounts) {
          const g = Math.pow(1 + Math.max(-0.99, Projection.returnOf(a)), 1 / 12);
          vals[a.id] *= g;
          if (Projection.volOf(a) > 0) sage[a.id] = sage[a.id] * g + vals[a.id] / 12;
        }
        // 3. L'effort d'épargne suit l'inflation si demandé (EX-63).
        if (S.settings.savingsFollowInflation) savings *= (1 + monthlyInfl);
      }
      out.contribs.push(contrib);
      out.valsSeries.push({ ...vals });
      out.basisSeries.push({ ...fisc });

      // 4. Dettes : capital restant dû à ce mois (EX-64) — remboursements
      //    anticipés du scénario avancé compris.
      let debts = 0;
      if (plans) for (const pl of plans) debts += pl.rem[m];
      else { const dEnd = U.monthEnd(month); for (const c of S.credits) debts += Engine.creditRemaining(c, dEnd); }
      out.debts.push(debts);

      // 5. Quantiles : chaque compte volatil × exp(z·σ·√âge) — l'âge moyen
      //    pondéré de ses euros, pas le temps calendaire (EX-66 : la
      //    dispersion ne s'applique qu'aux actifs volatils).
      const q = (z) => {
        let tot = 0;
        for (const a of accounts) {
          const v = vals[a.id] || 0;
          const sig = Projection.volOf(a);
          if (z !== 0 && sig > 0 && v > 0) {
            const age = sage[a.id] / v;
            tot += v * Math.exp(z * sig * Math.sqrt(Math.max(0, age)));
          } else tot += v;
        }
        return U.roundCents(tot - debts);
      };
      const defl = Math.pow(1 + monthlyInfl, m);
      out.deflator.push(defl);
      const central = q(0), lo = q(Projection.Z.p25), hi = q(Projection.Z.p75);
      out.months.push(month);
      out.central.push(central);
      out.low.push(lo);
      out.high.push(hi);
      out.band.low.push(q(Projection.Z.p10));
      out.band.high.push(q(Projection.Z.p90));
      out.real.central.push(U.roundCents(central / defl));
      out.real.low.push(U.roundCents(lo / defl));
      out.real.high.push(U.roundCents(hi / defl));
    }
    return out;
  },

  /* ---------- Monte Carlo ---------- */

  // Comptes de même famille : parfaitement corrélés (un seul tirage par
  // famille et par mois). Les familles sont indépendantes entre elles.
  FAMILLES: { titres: 'actions', pea: 'actions', av: 'av', crypto: 'crypto', immo: 'immo' },

  // Générateur reproductible (mulberry32) : mêmes trajectoires à chaque
  // rendu — une projection qui change à chaque regard serait illisible.
  _rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  },

  // → {months, paths, p10, p25, p50, p75, p90, central,
  //    real {central, p10, p25, p50, p75, p90}, firstAlloc}
  monteCarlo(horizonMonths, opts = {}) {
    const paths = opts.paths || 500;
    const base = Projection.run(horizonMonths, opts); // contributions, dettes, déflateur, centrale
    const accounts = Engine.accountsSorted().filter(a => !a.closed);
    const baseCtx = Alloc.buildContext(U.today());
    const v0 = {};
    for (const c of baseCtx) v0[c.id] = c.value;

    // Le rendement saisi est un taux MÉDIAN : la médiane du produit de
    // log-normales de moyenne ln(1+µ)/12 vaut exactement (1+µ)^t — la
    // trajectoire médiane du Monte Carlo colle donc à la centrale.
    const params = accounts.map(a => ({
      id: a.id,
      muM: Math.log(1 + Math.max(-0.99, Projection.returnOf(a))) / 12,
      sigM: Projection.volOf(a) / Math.sqrt(12),
      famille: Projection.FAMILLES[a.type] || null,
      detG: Math.pow(1 + Math.max(-0.99, Projection.returnOf(a)), 1 / 12),
    }));
    const familles = [...new Set(params.filter(p => p.sigM > 0).map(p => p.famille || p.id))];
    const n = horizonMonths + 1;
    const totals = Array.from({ length: n }, () => new Float64Array(paths));
    const rng = Projection._rng(opts.seed ?? 20260807);
    const gauss = () => {
      let u = 0, v = 0;
      while (!u) u = rng();
      while (!v) v = rng();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    // Fiscalité de sortie à l'horizon : la base fiscale (les versements) est
    // identique sur toutes les trajectoires — seuls les gains diffèrent, et
    // ce sont eux que l'impôt frappe. Une bonne trajectoire paie donc plus
    // d'impôt qu'une mauvaise, et le net est calculé trajectoire par
    // trajectoire, jamais en appliquant un taux moyen au brut.
    const S = Store.state;
    const H = horizonMonths;
    const netArr = new Float64Array(paths);

    for (let p = 0; p < paths; p++) {
      const vals = { ...v0 };
      for (let m = 0; m < n; m++) {
        if (m > 0) {
          const contrib = base.contribs[m];
          for (const k in contrib) vals[k] = (vals[k] || 0) + contrib[k];
          const z = {};
          for (const f of familles) z[f] = gauss();
          for (const pa of params) {
            if (pa.sigM > 0) vals[pa.id] *= Math.exp(pa.muM + pa.sigM * z[pa.famille || pa.id]);
            else vals[pa.id] *= pa.detG;
          }
        }
        let tot = 0;
        for (const pa of params) tot += vals[pa.id] || 0;
        totals[m][p] = tot - base.debts[m];
        if (m === H) netArr[p] = Fisc.netTotal(accounts, vals, base.basisSeries[H], S.settings, H / 12, base.debts[H]);
      }
    }

    const pct = (arr, qq) => {
      const s = Float64Array.from(arr).sort();
      return U.roundCents(s[Math.min(s.length - 1, Math.max(0, Math.round(qq * (s.length - 1))))]);
    };
    const out = { months: base.months, paths, central: base.central, firstAlloc: base.firstAlloc,
      p10: [], p25: [], p50: [], p75: [], p90: [],
      real: { central: base.real.central, p10: [], p25: [], p50: [], p75: [], p90: [] } };
    for (let m = 0; m < n; m++) {
      for (const qq of ['p10', 'p25', 'p50', 'p75', 'p90']) {
        const v = pct(totals[m], { p10: .10, p25: .25, p50: .50, p75: .75, p90: .90 }[qq]);
        out[qq].push(v);
        out.real[qq].push(U.roundCents(v / base.deflator[m]));
      }
    }
    // Net de fiscalité à l'horizon : percentiles de la distribution nette,
    // plus le net de la trajectoire centrale, en courant et en constant.
    const netCentral = Fisc.netTotal(accounts, base.valsSeries[H], base.basisSeries[H], S.settings, H / 12, base.debts[H]);
    out.net = { central: netCentral, real: { central: U.roundCents(netCentral / base.deflator[H]) } };
    for (const qq of ['p10', 'p25', 'p50', 'p75', 'p90']) {
      const v = pct(netArr, { p10: .10, p25: .25, p50: .50, p75: .75, p90: .90 }[qq]);
      out.net[qq] = v;
      out.net.real[qq] = U.roundCents(v / base.deflator[H]);
    }
    return out;
  },

  // Patrimoine net de fiscalité si l'on liquidait AUJOURD'HUI — les
  // plus-values latentes connues (PRU) sont imposables dès maintenant.
  netToday() {
    const accounts = Engine.accountsSorted().filter(a => !a.closed);
    const vals = {}, basis = {};
    for (const a of accounts) {
      const v = Engine.accountValue(a.id, U.today());
      vals[a.id] = v ? v.total : 0;
      basis[a.id] = Engine.fiscalBasis(a.id);
    }
    const nw = Engine.netWorth(U.today());
    return { brut: nw.total, net: Fisc.netTotal(accounts, vals, basis, Store.state.settings, 0, nw.debts) };
  },

  /* ---------- Objectifs (EX-68, EX-69) ---------- */

  // Date d'atteinte en euros courants ET en pouvoir d'achat constant (P8) :
  // « 50 000 € en 2031 » ne sont pas 50 000 € d'aujourd'hui.
  goalReach(p, target) {
    let nominal = null, reel = null;
    for (let i = 0; i < p.central.length; i++) {
      if (nominal === null && p.central[i] >= target) nominal = p.months[i];
      if (reel === null && p.real.central[i] >= target) reel = p.months[i];
      if (nominal !== null && reel !== null) break;
    }
    return { nominal, reel };
  },

  /* ---------- Rente potentielle (EX-70) ---------- */

  // Règle empirique du taux de retrait — paramétrable (3 à 4 % selon les
  // études), jamais présentée comme une garantie.
  rente(patrimoine) {
    const taux = Store.state.settings.renteRate ?? 0.04;
    return { taux,
      annual: U.roundCents(patrimoine * taux),
      monthly: U.roundCents(patrimoine * taux / 12) };
  },
};
