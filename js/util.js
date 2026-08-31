/* Essor — utilitaires : monnaie en centimes, dates, formatage.
   Tous les montants circulent en centimes entiers (EX-77). */
'use strict';

const U = {

  /* ---------- Monnaie ---------- */

  // Arrondi bancaire simple au centime le plus proche (demi vers le haut en valeur absolue).
  roundCents(x) {
    return x >= 0 ? Math.round(x) : -Math.round(-x);
  },

  // "1 234,56 €" — chasse fixe assurée par le CSS (EX-85).
  fmtEUR(cents, opts = {}) {
    if (cents == null || Number.isNaN(cents)) return '—';
    // Dernier rempart : un montant s'affiche toujours au centime entier
    // (EX-77). Sans cet arrondi, un cours à décimales fait ressortir des
    // « 599,11.4000000001 € ».
    const n = U.roundCents(cents);
    const sign = n < 0 ? '-' : (opts.forceSign && n > 0 ? '+' : '');
    const abs = Math.abs(n);
    const euros = Math.floor(abs / 100);
    const c = String(abs % 100).padStart(2, '0');
    const e = euros.toLocaleString('fr-FR');
    return `${sign}${e},${c} €`;
  },

  fmtEURcompact(cents) {
    if (cents == null || Number.isNaN(cents)) return '—';
    const v = cents / 100;
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return (v / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M€';
    if (abs >= 10_000) return Math.round(v / 1000).toLocaleString('fr-FR') + ' k€';
    return Math.round(v).toLocaleString('fr-FR') + ' €';
  },

  // Un cours n'est pas un montant : il se cote avec plusieurs décimales
  // (6,222 €). Seul le montant qui en découle est arrondi au centime (EX-77).
  fmtPrice(cents, maxDecimals = 4) {
    if (cents == null || Number.isNaN(cents)) return '—';
    const v = cents / 100;
    const s = v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });
    return s + ' €';
  },

  fmtPct(x, digits = 1) {
    if (x == null || Number.isNaN(x)) return '—';
    return (x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' %';
  },

  // Analyse un montant texte ("1 234,56", "-12.30", "1.234,56") → centimes ou null.
  parseAmount(s) {
    if (s == null) return null;
    if (typeof s === 'number') return U.roundCents(s * 100);
    s = String(s).trim().replace(/ | | /g, '').replace(/€/g, '');
    if (!s) return null;
    // Format "1.234,56" → retirer les points de milliers ; "1,234.56" → retirer les virgules.
    const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
      s = s.replace(',', '.');
    }
    const v = Number(s);
    if (Number.isNaN(v)) return null;
    return U.roundCents(v * 100);
  },

  /* ---------- Dates (chaînes "YYYY-MM-DD" et mois "YYYY-MM") ---------- */

  today() {
    const d = new Date();
    return U.dateStr(d);
  },

  dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  monthOf(dateStr) { return dateStr.slice(0, 7); },

  currentMonth() { return U.today().slice(0, 7); },

  // Dernier jour du mois "YYYY-MM" → "YYYY-MM-DD".
  monthEnd(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return `${month}-${String(last).padStart(2, '0')}`;
  },

  monthStart(month) { return month + '-01'; },

  // Décale un mois de n (n peut être négatif).
  addMonths(month, n) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  // Liste inclusive de mois entre deux bornes "YYYY-MM".
  monthRange(from, to) {
    const out = [];
    let m = from;
    while (m <= to) { out.push(m); m = U.addMonths(m, 1); }
    return out;
  },

  monthDiff(a, b) { // b - a en mois
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
  },

  fmtMonth(month) {
    const [y, m] = month.split('-').map(Number);
    const noms = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    return `${noms[m - 1]} ${y}`;
  },

  fmtMonthShort(month) {
    const [y, m] = month.split('-').map(Number);
    const noms = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return `${noms[m - 1]} ${String(y).slice(2)}`;
  },

  fmtDate(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  },

  // Numéro de série Excel (jours depuis le 30/12/1899) → "YYYY-MM-DD".
  excelDate(serial) {
    const ms = Math.round((serial - 25569) * 86400000); // 25569 = 01/01/1970
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  },

  // Interprète des dates de relevés : "31/12/2025", "2025-12-31", "31.12.2025", "12/31/2025" (heuristique).
  parseDate(s) {
    if (!s) return null;
    s = String(s).trim();
    // "2026-01-02 11:22:13" (Revolut) → la partie date suffit.
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
    if (m) {
      let d = Number(m[1]), mo = Number(m[2]);
      if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // format américain détecté
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})$/);
    if (m) {
      const y = 2000 + Number(m[3]);
      return `${y}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    }
    return null;
  },

  /* ---------- Libellés apparentés ----------
     Deux exports d'une même banque décrivent la même opération avec des
     libellés différents : l'un concatène type, tiers et motif, l'autre ne
     donne que le tiers. Les mots significatifs de l'un sont alors CONTENUS
     dans l'autre — c'est ce qu'on teste, plutôt que l'égalité stricte. */

  tokens(label) {
    return new Set(U.normLabel(label).split(' ').filter(m => m.length >= 3));
  },

  libellesApparentes(a, b) {
    const ta = U.tokens(a), tb = U.tokens(b);
    if (!ta.size || !tb.size) return false;
    const [petit, grand] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    for (const m of petit) if (!grand.has(m)) return false;
    return true;
  },

  /* ---------- Texte ---------- */

  // Normalisation de libellé pour comparaison de règles : majuscules, sans accents,
  // sans dates/numéros variables, espaces réduits.
  normLabel(s) {
    return String(s || '')
      .toUpperCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\d{2}[\/.\-]\d{2}([\/.\-]\d{2,4})?/g, ' ')  // dates
      .replace(/\b\d{4,}\b/g, ' ')                          // longues séquences numériques
      .replace(/CARTE|CB|PAIEMENT|ACHAT|PRLV|SEPA|VIR(EMENT)?( INST(ANTANE)?)?/g, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  // Hachage stable (dédoublonnage d'import, EX-27).
  hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
  },

  // Découpe un montant en parts entières de centimes dont la somme vaut
  // EXACTEMENT le montant de départ. Arrondir chaque part séparément ferait
  // perdre quelques centimes et deux écrans afficheraient des totaux
  // différents (P9). Méthode des plus forts restes.
  splitCents(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) return weights.map(() => 0);
    const exact = weights.map(w => total * w / sum);
    const parts = exact.map(Math.floor);
    let reste = total - parts.reduce((a, b) => a + b, 0);
    // Les centimes restants vont aux parts dont la décimale est la plus forte.
    const ordre = exact.map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac);
    for (let k = 0; reste > 0 && k < ordre.length; k++, reste--) parts[ordre[k].i]++;
    return parts;
  },

  clamp(x, a, b) { return Math.min(b, Math.max(a, x)); },

  sum(arr, f) { return arr.reduce((s, x) => s + (f ? f(x) : x), 0); },

  // Médiane — préférée à la moyenne partout où un mois exceptionnel ne doit
  // pas déformer le résultat.
  median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const i = Math.floor(s.length / 2);
    return s.length % 2 ? s[i] : U.roundCents((s[i - 1] + s[i]) / 2);
  },

  groupBy(arr, keyFn) {
    const m = new Map();
    for (const x of arr) {
      const k = keyFn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  },

  debounce(fn, ms) {
    let t = null;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...args); }, ms);
    };
    wrapped.flush = (...args) => { clearTimeout(t); t = null; fn(...args); };
    wrapped.pending = () => t != null;
    return wrapped;
  },
};
