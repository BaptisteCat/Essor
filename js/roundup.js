/* Essor — arrondis convertis en bitcoin.

   Revolut arrondit chaque paiement par carte et convertit la différence en
   BTC. Vu du relevé, ce n'est qu'un petit débit « Transfer to Revolut Digital
   Assets » : l'argent semble disparaître alors qu'il change seulement de
   forme. Sans traitement, ces montants sortent du patrimoine.

   On les transforme donc en quantité de bitcoin, au cours du JOUR de chaque
   opération — pas au cours d'aujourd'hui, qui donnerait une plus-value
   fictive. Les cours viennent de CoinGecko en un seul appel pour toute la
   période ; seul le nom « bitcoin » sort de la machine (EX-99). */
'use strict';

const RoundUp = {

  SYMBOLE: 'BTC',

  // Opérations concernées : un débit dont le libellé correspond au motif.
  candidates(pattern) {
    return Store.state.transactions
      .filter(t => t.amount < 0 && Rules.matches(t.label, pattern))
      .sort((a, b) => a.date < b.date ? -1 : 1);
  },

  // Déjà converties : un mouvement de titres porte l'identifiant de l'opération
  // d'origine, ce qui rend l'opération rejouable sans jamais doubler.
  tradeId(txId) { return 'btc-' + txId; },

  dejaConverties(txs) {
    const faits = new Set(Store.state.trades.map(t => t.id));
    return txs.filter(t => faits.has(RoundUp.tradeId(t.id)));
  },

  // Cours journaliers BTC-EUR sur la période, en un appel (EX-103 : le reste
  // de l'application fonctionne hors ligne, ceci est l'exception assumée).
  async fetchPrices(dateMin, dateMax) {
    const from = Math.floor(new Date(dateMin + 'T00:00:00Z').getTime() / 1000) - 86400 * 2;
    const to = Math.floor(new Date(dateMax + 'T23:59:59Z').getTime() / 1000) + 86400;
    const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range` +
      `?vs_currency=eur&from=${from}&to=${to}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`réponse ${r.status} de CoinGecko`);
    const data = await r.json();
    if (!data.prices || !data.prices.length) throw new Error('aucun cours renvoyé pour cette période');
    // Un cours par jour : le dernier relevé de la journée fait foi.
    const parJour = new Map();
    for (const [ms, prix] of data.prices) {
      const jour = new Date(ms).toISOString().slice(0, 10);
      parJour.set(jour, prix);
    }
    return parJour;
  },

  // Cours du jour demandé, à défaut le dernier connu avant lui.
  prixAu(parJour, date) {
    if (parJour.has(date)) return parJour.get(date);
    const jours = [...parJour.keys()].sort();
    let best = null;
    for (const j of jours) { if (j <= date) best = j; else break; }
    return best ? parJour.get(best) : null;
  },

  // Convertit les arrondis en position bitcoin. Retourne un bilan chiffré.
  async convertir(pattern, accountId, { simuler = false } = {}) {
    const txs = RoundUp.candidates(pattern);
    if (!txs.length) return { txs: 0, converties: 0, deja: 0, eur: 0, btc: 0, manquants: 0 };
    const deja = RoundUp.dejaConverties(txs).length;
    const aFaire = txs.filter(t => !Store.state.trades.some(x => x.id === RoundUp.tradeId(t.id)));
    if (!aFaire.length) return { txs: txs.length, converties: 0, deja, eur: 0, btc: 0, manquants: 0 };

    const parJour = await RoundUp.fetchPrices(aFaire[0].date, aFaire[aFaire.length - 1].date);
    let eur = 0, btc = 0, manquants = 0;
    const nouveaux = [];
    for (const t of aFaire) {
      const prix = RoundUp.prixAu(parJour, t.date);
      if (!prix) { manquants++; continue; }
      const montant = Math.abs(t.amount);           // centimes
      const qty = (montant / 100) / prix;           // en bitcoins
      eur += montant;
      btc += qty;
      nouveaux.push({
        id: RoundUp.tradeId(t.id), accountId, symbol: RoundUp.SYMBOLE, date: t.date,
        qtyDelta: qty, priceCents: U.roundCents(prix * 100), origine: t.id,
      });
    }
    if (simuler) return { txs: txs.length, converties: nouveaux.length, deja, eur, btc, manquants };

    for (const n of nouveaux) {
      Store.state.trades.push(n);
      Engine.setPrice(RoundUp.SYMBOLE, n.date, n.priceCents);
      // L'argent n'a pas quitté le patrimoine : il a changé de forme.
      const t = Store.state.transactions.find(x => x.id === n.origine);
      if (t && !t.internal) { t.internal = true; t.internalBy = 'arrondi-btc'; }
    }
    // Cours du jour, pour que la position se valorise à l'écran.
    const dernier = [...parJour.keys()].sort().pop();
    if (dernier) Engine.setPrice(RoundUp.SYMBOLE, dernier, U.roundCents(parJour.get(dernier) * 100));
    if (!Store.state.priceMeta[RoundUp.SYMBOLE]) {
      Store.state.priceMeta[RoundUp.SYMBOLE] = { name: 'Bitcoin', coingecko: 'bitcoin' };
    }
    Engine.invalidate();
    Store.markDirty();
    return { txs: txs.length, converties: nouveaux.length, deja, eur, btc, manquants };
  },
};
