/* Essor — déduction automatique de la répartition géographique d'un support.

   Un ETF indiciel n'a pas de géographie propre : il a celle de son indice.
   Reconnaître l'indice à partir du nom du fonds — que l'import récupère déjà
   du relevé de courtier — suffit donc à déduire l'exposition, sans réseau et
   sans que l'utilisateur ait rien à saisir.

   Ce sont des faits publics sur des indices, pas des règles liées à la
   situation de l'utilisateur (EX-35). Les poids sont ceux publiés par les
   fournisseurs d'indices, arrondis ; ils bougent lentement. Toute déduction
   est signalée à l'écran et reste corrigeable (P7) : une correction manuelle
   n'est jamais réécrasée (P6). */
'use strict';

const Indices = {

  // Reconnaissance par le nom du fonds, puis par le code. L'ordre compte :
  // le premier motif qui correspond gagne, donc du plus spécifique au plus
  // général (« MSCI World ex USA » avant « MSCI World »).
  TABLE: [
    { indice: 'Nasdaq 100', nom: /nasdaq[\s-]*100|nasdaq/i, code: /^(NDX|ANX|PANX|CNDX|UST)/i,
      geo: { 'États-Unis': 0.97, 'Reste du monde': 0.03 } },

    { indice: 'S&P 500', nom: /s&?p\s*500|sp500/i, code: /^(SPY|VOO|IVV|PE500|ESE|P500|SP5)/i,
      geo: { 'États-Unis': 1 } },

    { indice: 'Russell 2000', nom: /russell\s*2000/i, code: /^(IWM|RS2K)/i,
      geo: { 'États-Unis': 1 } },

    { indice: 'MSCI USA', nom: /msci\s*usa|actions?\s*am[ée]ricaines?|us\s*equity/i, code: /^(CU5|USA)/i,
      geo: { 'États-Unis': 1 } },

    { indice: 'MSCI World ex-USA / EAFE', nom: /world\s*ex[\s-]*(usa|us)|eafe|monde\s*hors\s*[ée]tats/i,
      code: /^(EFA|IEFA)/i,
      geo: { 'Japon': 0.22, 'Royaume-Uni': 0.15, 'Zone euro': 0.30, 'Suisse': 0.09,
             'Canada': 0.12, 'Australie': 0.08, 'Reste du monde': 0.04 } },

    { indice: 'MSCI ACWI', nom: /acwi|all\s*country|monde\s*entier/i, code: /^(ACWI|IMIE|MWRD)/i,
      geo: { 'États-Unis': 0.63, 'Japon': 0.05, 'Royaume-Uni': 0.03, 'Zone euro': 0.07,
             'Suisse': 0.02, 'Canada': 0.03, 'Chine': 0.03,
             'Marchés émergents (hors Chine)': 0.07, 'Reste du monde': 0.07 } },

    { indice: 'MSCI World', nom: /msci\s*world|world|monde/i, code: /^(CW8|IWDA|MWRD|DCAM|EWLD|WLD)/i,
      geo: { 'États-Unis': 0.71, 'Japon': 0.06, 'Royaume-Uni': 0.04, 'Zone euro': 0.08,
             'Suisse': 0.03, 'Canada': 0.03, 'Australie': 0.02, 'Reste du monde': 0.03 } },

    { indice: 'Euro Stoxx 50', nom: /euro\s*stoxx\s*50|eurostoxx\s*50/i, code: /^(C50|MSE|EUE|CSX5)/i,
      geo: { 'France': 0.36, 'Allemagne': 0.27, 'Pays-Bas': 0.14, 'Italie': 0.09,
             'Espagne': 0.08, 'Reste zone euro': 0.06 } },

    { indice: 'CAC 40', nom: /cac\s*40/i, code: /^(CAC|C40|E40)/i,
      geo: { 'France': 1 } },

    { indice: 'DAX', nom: /\bdax\b/i, code: /^(DAX|EXS1)/i,
      geo: { 'Allemagne': 1 } },

    { indice: 'Stoxx Europe 600 / MSCI Europe', nom: /stoxx\s*(europe\s*)?600|msci\s*europe|europe/i,
      code: /^(MEU|C6E|IMEU|PAEEM$)/i,
      geo: { 'Royaume-Uni': 0.23, 'France': 0.16, 'Suisse': 0.15, 'Allemagne': 0.14,
             'Pays-Bas': 0.07, 'Suède': 0.05, 'Italie': 0.04, 'Espagne': 0.04,
             'Danemark': 0.04, 'Reste Europe': 0.08 } },

    { indice: 'MSCI Emerging Markets', nom: /[ée]mergent|emerging/i, code: /^(PAEEM|AEEM|IEMA|EMIM)/i,
      geo: { 'Chine': 0.30, 'Inde': 0.19, 'Taïwan': 0.18, 'Corée du Sud': 0.11,
             'Brésil': 0.05, 'Afrique du Sud': 0.03, 'Reste émergents': 0.14 } },

    { indice: 'MSCI Japan / Topix', nom: /japan|japon|topix|nikkei/i, code: /^(JPN|CJ1|TPX)/i,
      geo: { 'Japon': 1 } },

    { indice: 'MSCI India', nom: /\bindia\b|\binde\b/i, code: /^(INR|NDIA)/i,
      geo: { 'Inde': 1 } },

    { indice: 'MSCI China', nom: /\bchina\b|\bchine\b/i, code: /^(PRAC|CNYA)/i,
      geo: { 'Chine': 1 } },

    { indice: 'MSCI Pacific', nom: /pacific|pacifique/i, code: /^(PACX)/i,
      geo: { 'Japon': 0.60, 'Australie': 0.24, 'Corée du Sud': 0.09, 'Singapour': 0.05, 'Reste Pacifique': 0.02 } },
  ],

  // → {indice, geo} ou null. `nom` vient du relevé de courtier, `code` du ticker.
  deduce(code, nom) {
    const n = String(nom || '');
    const c = String(code || '');
    // Le nom est plus fiable que le code : un ticker peut être ambigu.
    for (const e of Indices.TABLE) if (n && e.nom.test(n)) return { indice: e.indice, geo: e.geo };
    for (const e of Indices.TABLE) if (c && e.code.test(c)) return { indice: e.indice, geo: e.geo };
    return null;
  },

  // Applique la déduction à tous les supports dont la répartition n'a pas été
  // saisie ou corrigée à la main. Rejouable sans effet de bord.
  // → [{symbol, indice, nouveau}]
  applyAll({ force = false } = {}) {
    const S = Store.state;
    const faits = [];
    const symbols = new Set([...Object.keys(S.prices), ...S.positionSnapshots.map(p => p.symbol)]);
    for (const sym of symbols) {
      // Une saisie manuelle fait foi et n'est jamais réécrasée (P6, P7).
      if (!force && S.geoSource?.[sym] === 'manuel') continue;
      if (!force && S.geo[sym] && !S.geoSource?.[sym]) continue; // saisie d'avant le suivi de source
      const meta = S.priceMeta[sym] || {};
      const d = Indices.deduce(sym, meta.name);
      if (!d) continue;
      const nouveau = JSON.stringify(S.geo[sym] || null) !== JSON.stringify(d.geo);
      S.geo[sym] = d.geo;
      if (!S.geoSource) S.geoSource = {};
      S.geoSource[sym] = 'deduit';
      if (!S.geoIndice) S.geoIndice = {};
      S.geoIndice[sym] = d.indice;
      if (nouveau) faits.push({ symbol: sym, indice: d.indice });
    }
    if (faits.length) { Engine.invalidate(); Store.markDirty(); }
    return faits;
  },

  // Supports investis dont la répartition reste inconnue après déduction.
  nonDeduits() {
    const S = Store.state;
    const out = [];
    for (const a of S.accounts) {
      if (a.closed || !ACCOUNT_TYPES[a.type]?.positions) continue;
      for (const sym of Engine.symbolsOf(a.id)) {
        if (Engine.qtyAt(a.id, sym, U.today()) > 1e-9 && !S.geo[sym]) out.push(sym);
      }
    }
    return [...new Set(out)];
  },

  /* ---------- Enrichissement en ligne, facultatif ----------
     Financial Modeling Prep expose les poids par pays réellement constatés
     dans le fonds et autorise l'appel depuis une page locale. Une clé
     gratuite est nécessaire ; sans elle, la déduction hors ligne ci-dessus
     suffit. Seul le code du support sort de la machine, comme pour les cours
     (EX-99). */
  async fetchOnline(symbol, key) {
    const url = `https://financialmodelingprep.com/api/v3/etf-country-weightings/${encodeURIComponent(symbol)}?apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`réponse ${r.status} du fournisseur de données`);
    const data = await r.json();
    if (data['Error Message']) throw new Error(data['Error Message']);
    if (!Array.isArray(data) || !data.length) return null;   // support inconnu du fournisseur
    const geo = {};
    let total = 0;
    for (const row of data) {
      const pays = Indices.FR_PAYS[row.country] || row.country;
      const part = Number(String(row.weightPercentage || '').replace('%', '')) / 100;
      if (!pays || !isFinite(part) || part <= 0) continue;
      geo[pays] = (geo[pays] || 0) + part;
      total += part;
    }
    if (!total) return null;
    // Renormalisation : les fournisseurs laissent parfois 1 à 2 % de côté.
    for (const k of Object.keys(geo)) geo[k] = geo[k] / total;
    return geo;
  },

  FR_PAYS: {
    'United States': 'États-Unis', 'Japan': 'Japon', 'United Kingdom': 'Royaume-Uni',
    'France': 'France', 'Germany': 'Allemagne', 'Switzerland': 'Suisse', 'Canada': 'Canada',
    'Netherlands': 'Pays-Bas', 'Italy': 'Italie', 'Spain': 'Espagne', 'Sweden': 'Suède',
    'Denmark': 'Danemark', 'Australia': 'Australie', 'China': 'Chine', 'India': 'Inde',
    'Taiwan': 'Taïwan', 'South Korea': 'Corée du Sud', 'Korea': 'Corée du Sud',
    'Brazil': 'Brésil', 'South Africa': 'Afrique du Sud', 'Mexico': 'Mexique',
    'Belgium': 'Belgique', 'Finland': 'Finlande', 'Norway': 'Norvège', 'Ireland': 'Irlande',
    'Austria': 'Autriche', 'Portugal': 'Portugal', 'Singapore': 'Singapour',
    'Hong Kong': 'Hong Kong', 'Israel': 'Israël', 'Other': 'Reste du monde',
  },
};
