/* Essor — classement des opérations.
   Règles utilisateur (EX-35…38), suggestions heuristiques corrigeables et
   signalées (EX-39, P7), mouvements internes (EX-40…44), décalages de
   versement (EX-45…51), récurrences non budgétées (EX-19), recalage du
   prévisionnel (EX-18). */
'use strict';

const Rules = {

  S() { return Store.state; },

  /* ---------- Règles de catégorisation ---------- */

  // Mots porteurs d'un libellé : ceux qui désignent réellement quelqu'un.
  tokens(label) {
    return U.normLabel(label).split(' ')
      .filter(w => w.length >= 3 && !Rules.MOTS_VIDES.has(w) && !/^\d+$/.test(w));
  },

  // Un motif correspond si tous ses mots figurent dans le libellé, dans le
  // même ordre. La comparaison porte sur les MOTS et non sur les caractères :
  // « TRANSFER REVOLUT DIGITAL » doit reconnaître « Transfer to Revolut
  // Digital Assets Europe Ltd », où un mot vide s'est glissé au milieu — et
  // « ESSO » ne doit pas se déclencher sur « ESSONNE ».
  matches(label, pattern) {
    const mots = Rules.tokens(pattern);
    if (!mots.length) return false;
    const cible = Rules.tokens(label);
    let i = 0;
    for (const w of cible) { if (w === mots[i]) i++; if (i === mots.length) return true; }
    return false;
  },

  // Règle la plus spécifique d'abord : le motif comptant le plus de mots
  // l'emporte, ce qui fait primer « UBER EATS » sur « UBER » (EX-38).
  findRule(tx) {
    if (!U.normLabel(tx.label)) return null;
    let best = null, bestScore = -1;
    for (const r of Rules.S().rules) {
      if (!Rules.matches(tx.label, r.pattern)) continue;
      const score = Rules.tokens(r.pattern).length * 1000 + r.pattern.length;
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  },

  // Crée/complète une règle à partir d'une correction manuelle (EX-35, EX-36).
  // Une règle peut porter une ligne de budget, le caractère interne du
  // mouvement, ou les deux : décider qu'un libellé désigne un virement vers
  // ses propres comptes est une connaissance à conserver au même titre qu'un
  // classement (P6).
  addRule(pattern, lineId, kind, { internal } = {}) {
    pattern = U.normLabel(pattern);
    if (!pattern) return null;
    const S = Rules.S();
    let r = S.rules.find(r => r.pattern === pattern);
    if (!r) { r = { id: U.uid(), pattern, lineId: null, kind: null }; S.rules.push(r); }
    if (lineId !== undefined) r.lineId = lineId;
    if (kind) r.kind = kind;
    if (internal !== undefined) r.internal = internal;
    Store.markDirty();
    return r;
  },

  // Une décision explicite de l'utilisateur sur CETTE opération prime sur
  // toute règle : on ne la contredit jamais (P7, EX-38).
  _verrouilleContre(t, interne) {
    return t.internalLocked && !!t.internal !== interne;
  },

  /* ---------- Commerçants équivoques ----------
     Tous les commerçants ne désignent pas une seule dépense : Amazon vend
     aussi bien un cadeau qu'un achat personnel. Classer une opération ne dit
     alors rien des autres, et généraliser serait une déduction abusive
     (EX-114). On repère le cas au moment où l'utilisateur se contredit :
     deux classements manuels différents pour le même libellé. Le commerçant
     est dès lors marqué équivoque, sa règle retirée, et ses opérations
     restent à classer une par une. */

  // Lignes vers lesquelles ce commerçant a DÉJÀ été classé à la main.
  classementsManuels(key, exceptId) {
    const lignes = new Set();
    for (const t of Rules.S().transactions) {
      if (t.id === exceptId || t.auto !== false || !t.lineId) continue;
      if (Rules.matches(t.label, key)) lignes.add(t.lineId);
    }
    return [...lignes];
  },

  estEquivoque(key) {
    return (Rules.S().ambiguousMerchants || []).includes(key);
  },

  // Marque le commerçant, retire sa règle de classement, et rend à l'état
  // « à classer » les opérations que cette règle avait rangées — jamais
  // celles que l'utilisateur avait classées lui-même.
  marquerEquivoque(key) {
    const S = Rules.S();
    if (!S.ambiguousMerchants) S.ambiguousMerchants = [];
    if (!S.ambiguousMerchants.includes(key)) S.ambiguousMerchants.push(key);
    const regle = S.rules.find(r => r.pattern === key);
    const parRegle = [];
    if (regle && regle.lineId) {
      for (const t of S.transactions) {
        if (t.auto === 'rule' && t.lineId === regle.lineId && Rules.matches(t.label, key)) {
          parRegle.push({ id: t.id, lineId: t.lineId, auto: t.auto });
        }
      }
      // La règle ne portait que le classement : elle disparaît. Si elle
      // portait aussi le caractère interne, celui-ci est conservé.
      if (regle.internal === true) regle.lineId = null;
      else S.rules = S.rules.filter(r => r !== regle);
    }
    Store.markDirty();
    return parRegle;
  },

  // Rétablit un commerçant jugé équivoque à tort.
  reconnaitreUnivoque(key) {
    const S = Rules.S();
    S.ambiguousMerchants = (S.ambiguousMerchants || []).filter(k => k !== key);
    Store.markDirty();
  },

  // Opérations similaires à une opération donnée (EX-36).
  similarTo(tx) {
    const key = Rules.merchantKey(tx.label);
    if (!key) return [];
    return Rules.S().transactions.filter(t => t.id !== tx.id && Rules.matches(t.label, key));
  },

  // « Émetteur / bénéficiaire » : les mots porteurs du libellé normalisé.
  // Les mots vides et les fragments trop courts sont écartés — un relevé
  // laisse traîner des « LE », « DU », « REF » qui ne désignent personne et
  // qui empêcheraient deux écritures du même commerçant de se reconnaître.
  MOTS_VIDES: new Set(['LE', 'LA', 'LES', 'DU', 'DE', 'DES', 'ET', 'AU', 'AUX', 'UN', 'UNE',
                       'SUR', 'PAR', 'POUR', 'REF', 'NOTE', 'FR', 'EUR', 'ORIGINE', 'MONTANT']),

  merchantKey(label) {
    return Rules.tokens(label).slice(0, 3).join(' ');
  },

  // Classe automatiquement toutes les opérations NON CLASSÉES dont le libellé
  // contient ce motif. Ne touche jamais une opération déjà classée : ce serait
  // une requalification invisible (P7). Retourne les identifiants modifiés,
  // pour pouvoir revenir en arrière.
  // `internal` : caractère interne à propager également, s'il a été décidé.
  // Une opération déjà marquée interne n'est PAS écartée quand la règle porte
  // elle-même sur des mouvements internes — c'est justement le cas où elle
  // doit recevoir sa sous-catégorie.
  applyToUncategorized(pattern, lineId, { exceptId, internal } = {}) {
    const p = U.normLabel(pattern);
    if (!p) return [];
    // Un commerçant équivoque ne se généralise pas : seul le caractère
    // interne, qui ne dépend pas de la nature de l'achat, peut se propager.
    if (lineId && Rules.estEquivoque(Rules.merchantKey(pattern))) {
      if (internal === undefined) return [];
      lineId = null;
    }
    const touchees = [];
    for (const t of Rules.S().transactions) {
      if (t.id === exceptId) continue;
      if (t.lineId && !(internal === true && !t.internal)) continue;   // déjà classée : on ne réécrit pas
      if (t.internal && internal !== true) continue;                   // interne : hors budget, sauf règle interne
      if (Rules._verrouilleContre(t, internal === true)) continue;
      if (!Rules.matches(t.label, p)) continue;
      const avant = { lineId: t.lineId, internal: !!t.internal };
      if (lineId) { t.lineId = lineId; t.auto = 'rule'; }
      if (internal === true && !t.internal) { t.internal = true; t.internalBy = 'regle'; }
      if (internal === false && t.internal) { t.internal = false; }
      if (avant.lineId !== t.lineId || avant.internal !== !!t.internal) touchees.push(t.id);
    }
    if (touchees.length) { Engine.invalidate(); Store.markDirty(); }
    return touchees;
  },

  // Rejoue les règles sur l'historique (EX-37). Le choix manuel de
  // l'utilisateur (auto === false) n'est jamais écrasé (EX-38).
  categorizeAll({ onlyUncategorized = false } = {}) {
    let n = 0;
    for (const t of Rules.S().transactions) {
      if (t.auto === false) continue;
      if (onlyUncategorized && t.lineId && t.auto !== 'guess') continue;
      const r = Rules.findRule(t);
      if (r) {
        // Une règle peut ne porter que le caractère interne : elle ne doit
        // alors pas effacer le classement existant.
        if (r.lineId && (t.lineId !== r.lineId || t.auto !== 'rule')) {
          t.lineId = r.lineId; t.auto = 'rule'; if (r.kind) t.kind = r.kind; n++;
        }
        if (r.internal === true && !t.internal && !Rules._verrouilleContre(t, true)) {
          t.internal = true; t.internalBy = 'regle'; n++;
        }
      } else if (!t.lineId || t.auto === 'guess') {
        // Aucune supposition sur un commerçant équivoque : mieux vaut « à
        // classer » qu'un classement plausible et faux.
        if (Rules.estEquivoque(Rules.merchantKey(t.label))) continue;
        const g = Rules.guessLine(t);
        if (g && t.lineId !== g) { t.lineId = g; t.auto = 'guess'; n++; } // approximation signalée (EX-39, P7)
      }
    }
    if (n) Store.markDirty();
    return n;
  },

  // Heuristique : mots du nom de ligne présents dans le libellé (EX-39).
  guessLine(tx) {
    const norm = ' ' + U.normLabel(tx.label) + ' ';
    let best = null, bestLen = 0;
    for (const l of Engine.allLines()) {
      if ((tx.amount < 0) !== (l.kind === 'expense')) continue;
      const words = U.normLabel(l.name).split(' ').filter(w => w.length >= 4);
      for (const w of words) {
        if (norm.includes(' ' + w + ' ') && w.length > bestLen) { best = l.id; bestLen = w.length; }
      }
    }
    return best;
  },

  /* ---------- Mouvements internes (EX-40…44) ---------- */

  // Reconnaissance complète, rejouable à volonté (EX-44). Idempotente.
  // Respecte les décisions explicites de l'utilisateur (internalLocked).
  detectTransfers() {
    const S = Rules.S();
    let n = 0;

    // 0. Ce que l'utilisateur a déclaré lui-même : « ce libellé désigne un
    //    virement vers mes propres comptes ». Rien ne le devinerait — un
    //    transfert vers un service externe ne ressemble à rien de reconnaissable
    //    — et c'est pourquoi cette connaissance se conserve et se rejoue (P6).
    for (const r of S.rules) {
      if (r.internal !== true) continue;
      for (const t of S.transactions) {
        if (t.internal || Rules._verrouilleContre(t, true)) continue;
        if (!Rules.matches(t.label, r.pattern)) continue;
        t.internal = true; t.internalBy = 'regle';
        if (r.lineId && !t.lineId) { t.lineId = r.lineId; t.auto = 'rule'; }
        n++;
      }
    }

    // 1. Nature portée par le relevé (EX-42, EX-109) : type d'opération ou
    //    champ brut désignant un virement interne / épargne.
    const internalTypeRe = /VIREMENT\s+(INTERNE|EPARGNE|COMPTE A COMPTE)|INTERNAL|SAVINGS?_?(IN|OUT|TRANSFER)|OWN ACCOUNT|VERSEMENT PROGRAMME/i;
    for (const t of S.transactions) {
      if (t.internalLocked) continue;
      const fields = [t.opType || '', ...(t.raw ? Object.values(t.raw).map(String) : [])].join(' ');
      if (internalTypeRe.test(fields) && !t.internal) { t.internal = true; t.internalBy = 'nature'; n++; }
    }

    // 2. Comptes d'épargne et d'investissement : rien n'y est une dépense de
    //    consommation ; seuls les intérêts sont un revenu réel (EX-43).
    for (const t of S.transactions) {
      if (t.internalLocked) continue;
      const acc = Engine.account(t.accountId);
      if (!acc) continue;
      if (['livret', 'titres', 'pea', 'av', 'crypto'].includes(acc.type)) {
        if (Engine._isInterest(t)) {
          if (t.internal) { t.internal = false; n++; }
          t.kind = 'interet';
        } else if (!t.internal) { t.internal = true; t.internalBy = 'type-compte'; n++; }
      }
    }

    // 3. Appariement : même montant en sens inverse sur deux comptes distincts
    //    à ≤ 4 jours — le virement vu des deux côtés compte une fois (EX-41).
    const unpaired = S.transactions.filter(t => !t.pairId);
    const byAmount = U.groupBy(unpaired, t => Math.abs(t.amount));
    for (const [, group] of byAmount) {
      if (group.length < 2) continue;
      const outs = group.filter(t => t.amount < 0).sort((a, b) => a.date < b.date ? -1 : 1);
      const ins = group.filter(t => t.amount > 0).sort((a, b) => a.date < b.date ? -1 : 1);
      for (const o of outs) {
        if (o.pairId) continue;
        const cand = ins.find(i => !i.pairId && i.accountId !== o.accountId &&
          Math.abs(Rules._dayDiff(o.date, i.date)) <= 4 &&
          (Rules._looksLikeTransfer(o) || Rules._looksLikeTransfer(i) ||
           ['livret', 'titres', 'pea', 'av', 'crypto'].includes(Engine.account(i.accountId)?.type) ||
           ['livret', 'titres', 'pea', 'av', 'crypto'].includes(Engine.account(o.accountId)?.type)));
        if (cand) {
          const pid = U.uid();
          o.pairId = pid; cand.pairId = pid;
          if (!o.internalLocked && !o.internal) { o.internal = true; o.internalBy = 'paire'; n++; }
          if (!cand.internalLocked && !cand.internal) { cand.internal = true; cand.internalBy = 'paire'; n++; }
        }
      }
    }
    if (n) { Engine.invalidate(); Store.markDirty(); }
    return n;
  },

  _looksLikeTransfer(t) {
    const s = ((t.opType || '') + ' ' + (t.label || '')).toUpperCase();
    return /VIR|TRANSFER|VERSEMENT/.test(s);
  },

  _dayDiff(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  },

  /* ---------- Décalages de versement (EX-45, EX-49…51) ---------- */

  // Détection volontairement conservatrice (EX-50, EX-114) : uniquement des
  // revenus réguliers (≥ 3 occurrences, montants serrés, mensuels), arrivés
  // tôt dans un mois alors qu'ils tombent d'habitude en fin de mois, et dont
  // le mois précédent est resté vide. Chaque proposition détaille son
  // raisonnement (EX-49). Les propositions écartées ne reviennent pas (EX-51).
  detectShifts() {
    const S = Rules.S();
    if (!S.dismissedShifts) S.dismissedShifts = [];
    const proposals = [];
    const incomes = S.transactions.filter(t => t.amount > 0 && !t.internal);
    const groups = U.groupBy(incomes, t => Rules.merchantKey(t.label));
    const curMonth = U.currentMonth();

    for (const [key, txs] of groups) {
      if (txs.length < 3 || !key) continue;
      // Régularité des montants : écart ≤ 10 % de la médiane (EX-50).
      const amounts = txs.map(t => t.amount).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      if (median <= 0) continue;
      if (!txs.every(t => Math.abs(t.amount - median) <= median * 0.10)) continue;
      // Régularité mensuelle : pas deux fois le même mois comptable en régime normal.
      const days = txs.map(t => Number(t.date.slice(8))).sort((a, b) => a - b);
      const medianDay = days[Math.floor(days.length / 2)];
      if (medianDay < 20) continue; // seuls les versements de fin de mois peuvent glisser

      for (const t of txs) {
        if (t.monthOverride) continue;
        const day = Number(t.date.slice(8));
        if (day > 7) continue; // arrivé en tout début de mois alors que l'habitude est la fin
        const prevMonth = U.addMonths(U.monthOf(t.date), -1);
        const prevHas = txs.some(x => x !== t && Engine.budgetMonth(x) === prevMonth);
        const sameMonthHas = txs.some(x => x !== t && Engine.budgetMonth(x) === Engine.budgetMonth(t));
        if (prevHas || !sameMonthHas) {
          // pas d'anomalie claire : soit le mois précédent est servi, soit le
          // mois courant n'est pas doublé → on ne propose rien (EX-50)
          if (prevHas || U.monthOf(t.date) === curMonth) continue;
        }
        const sig = `${t.id}->${prevMonth}`;
        if (S.dismissedShifts.includes(sig)) continue;
        proposals.push({
          txId: t.id, sig, toMonth: prevMonth,
          reason: `« ${t.label} » arrive d'habitude vers le ${medianDay} du mois ` +
            `(${txs.length} occurrences, montants à ±10 %). Celui-ci est daté du ${U.fmtDate(t.date)}, ` +
            `et ${U.fmtMonth(prevMonth)} n'a pas reçu ce versement : il s'agit vraisemblablement ` +
            `du revenu de ${U.fmtMonth(prevMonth)} versé en retard.`,
        });
      }
    }
    return proposals;
  },

  applyShift(proposal) {
    const t = Rules.S().transactions.find(t => t.id === proposal.txId);
    if (!t) return;
    t.monthOverride = proposal.toMonth; // la date et le montant ne changent pas (P3, EX-46)
    Store.markDirty();
  },

  dismissShift(proposal) {
    const S = Rules.S();
    if (!S.dismissedShifts) S.dismissedShifts = [];
    if (!S.dismissedShifts.includes(proposal.sig)) S.dismissedShifts.push(proposal.sig);
    Store.markDirty();
  },

  /* ---------- Récurrences non budgétées (EX-19) ---------- */

  detectRecurring() {
    const S = Rules.S();
    if (!S.dismissedRecurring) S.dismissedRecurring = [];
    const out = [];
    const expenses = S.transactions.filter(t => t.amount < 0 && !t.internal && !t.lineId);
    const groups = U.groupBy(expenses, t => Rules.merchantKey(t.label));
    for (const [key, txs] of groups) {
      if (!key || txs.length < 3) continue;
      if (S.dismissedRecurring.includes(key)) continue;
      if (Rules.estEquivoque(key)) continue;   // pas un abonnement : un commerçant polyvalent
      const months = new Set(txs.map(t => Engine.budgetMonth(t)));
      if (months.size < 3) continue;
      const amounts = txs.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
      const median = amounts[Math.floor(amounts.length / 2)];
      if (!txs.every(t => Math.abs(Math.abs(t.amount) - median) <= median * 0.25)) continue;
      out.push({ key, label: txs[txs.length - 1].label, months: months.size, median, count: txs.length, txs });
    }
    return out;
  },

  /* ---------- Recalage du prévisionnel sur le réel (EX-18) ---------- */

  // Aperçu ligne par ligne, mois en cours exclu (incomplet).
  // Un prévisionnel MENSUEL ne se déduit que d'une régularité MENSUELLE.
  // Recevoir un remboursement une fois en six mois ne fait pas un revenu
  // récurrent : moyenner ce montant sur six mois inventerait une rentrée
  // d'argent qui n'existe pas (EX-114).
  //
  // Chaque ligne est donc classée d'après sa présence réelle :
  //   régulière  — présente dans la majorité des mois : un montant est proposé,
  //                la MÉDIANE, pour qu'un mois exceptionnel ne le déforme pas ;
  //   ponctuelle — sporadique : aucun montant proposé, elle est montrée à part.
  // Le détail mois par mois accompagne chaque ligne : c'est ce qui rend la
  // proposition vérifiable au lieu d'être un chiffre tombé du ciel.
  recalibrationPreview({ window = 6 } = {}) {
    const S = Rules.S();
    const cur = U.currentMonth();
    const connus = new Set();
    for (const t of S.transactions) {
      const m = Engine.budgetMonth(t);
      if (m < cur) connus.add(m);
    }
    const used = [...connus].sort().slice(-window);
    if (!used.length) return { months: [], lines: [], ponctuelles: [] };

    const perLine = new Map();
    for (const t of S.transactions) {
      if (!t.lineId || t.internal) continue;
      const m = Engine.budgetMonth(t);
      if (!used.includes(m)) continue;
      if (!perLine.has(t.lineId)) perLine.set(t.lineId, new Map());
      const lm = perLine.get(t.lineId);
      lm.set(m, (lm.get(m) || 0) + Math.abs(t.amount));
    }

    // Seuil de régularité : présente dans au moins deux tiers des mois, et
    // jamais moins de trois — en dessous, rien ne prouve la récurrence.
    const seuil = Math.max(3, Math.ceil(used.length * 2 / 3));
    const lines = [], ponctuelles = [];

    for (const l of Engine.allLines()) {
      const lm = perLine.get(l.id);
      if (!lm || !lm.size) continue;
      const parMois = used.map(m => lm.get(m) || 0);
      const avecDonnees = parMois.filter(v => v > 0);
      const total = U.sum(parMois);
      const commun = { lineId: l.id, name: l.name, category: l.category, kind: l.kind,
        current: l.amount, parMois, months: used,
        monthsWithData: avecDonnees.length, total };

      if (avecDonnees.length < seuil) {
        // Ponctuelle : on n'invente aucun montant mensuel. Si le budget en
        // porte un, le proposer à zéro est une correction, pas une déduction.
        ponctuelles.push({ ...commun, proposed: 0,
          raison: `présente ${avecDonnees.length} mois sur ${used.length}` });
        continue;
      }
      const mediane = U.median(parMois);
      // Changement de niveau : les derniers mois s'écartent nettement des
      // précédents (un salaire qui augmente). On ne tranche pas à sa place —
      // on le signale et le montant reste modifiable.
      const recents = parMois.slice(-2).filter(v => v > 0);
      const anciens = parMois.slice(0, -2).filter(v => v > 0);
      let niveau = null;
      if (recents.length && anciens.length) {
        const mr = U.median(recents), ma = U.median(anciens);
        if (ma > 0 && Math.abs(mr - ma) / ma > 0.25) {
          niveau = { recent: mr, ancien: ma,
            sens: mr > ma ? 'hausse' : 'baisse',
            // Deux mois au nouveau niveau : c'est une tendance, on la propose.
            // Un seul : on signale sans trancher.
            certain: recents.length >= 2 && parMois.slice(-2).every(v => v > 0) };
        }
      }
      const proposed = niveau && niveau.certain ? niveau.recent : mediane;
      lines.push({ ...commun, proposed, mediane, niveau });
    }
    return { months: used, lines, ponctuelles, seuil };
  },

  // `overrides` : montants corrigés à la main dans l'aperçu — la proposition
  // n'est qu'une proposition.
  applyRecalibration(preview, selectedIds, overrides = {}) {
    const b = Rules.S().budget;
    const all = [...b.categories.flatMap(c => c.lines), ...b.incomes, ...b.savings];
    let n = 0;
    for (const p of [...preview.lines, ...preview.ponctuelles]) {
      if (selectedIds && !selectedIds.includes(p.lineId)) continue;
      const l = all.find(l => l.id === p.lineId);
      if (!l) continue;
      const v = overrides[p.lineId] != null ? overrides[p.lineId] : p.proposed;
      if (l.amount !== v) { l.amount = v; n++; }
    }
    if (n) Store.markDirty();
    return n;
  },

  /* ---------- Doublons probables ----------
     Le dédoublonnage d'import (EX-27) reconnaît une opération à son empreinte :
     compte, date, montant, libellé. Il est infaillible sur le MÊME fichier
     réimporté — mais deux exports de la même opération peuvent différer d'un
     détail : la banque a changé de colonne de date (opération contre valeur),
     ou de libellé entre deux formats. L'empreinte change, le doublon passe.
     Un salaire compté deux fois fausse tout : revenus, budget, capacité
     d'épargne. On cherche donc les paires qui se ressemblent trop — même
     compte, même montant, même libellé normalisé, à quelques jours d'écart —
     et on les SOUMET : deux cafés à quatre jours d'écart existent, seul
     l'utilisateur peut trancher (P2, jamais de suppression silencieuse). */

  doublonsSuspects() {
    const S = Rules.S();
    if (!S.dismissedDupes) S.dismissedDupes = [];
    const paires = [];
    const parCle = U.groupBy(S.transactions, t => `${t.accountId}|${t.amount}|${U.normLabel(t.label)}`);
    for (const [, groupe] of parCle) {
      if (groupe.length < 2) continue;
      const tris = [...groupe].sort((a, b) => a.date < b.date ? -1 : 1);
      for (let i = 0; i < tris.length - 1; i++) {
        const a = tris[i], b = tris[i + 1];
        const ecart = Rules._dayDiff(a.date, b.date);
        // Même jour même libellé : déjà arbitré par l'import (deux cafés
        // identiques sont légitimes). Suspect : proche mais PAS identique.
        if (ecart < 1 || ecart > 4) continue;
        const sig = [a.id, b.id].sort().join('~');
        if (S.dismissedDupes.includes(sig)) continue;
        paires.push({ sig, a, b, ecart,
          // Les gros montants d'abord : c'est le salaire doublé qui fait mal.
          poids: Math.abs(a.amount) });
      }
    }
    return paires.sort((x, y) => y.poids - x.poids);
  },

  // L'utilisateur a tranché : ce sont deux opérations réelles.
  dismissDupe(sig) {
    const S = Rules.S();
    if (!S.dismissedDupes) S.dismissedDupes = [];
    if (!S.dismissedDupes.includes(sig)) S.dismissedDupes.push(sig);
    Store.markDirty();
  },
};
