/* Essor — cours des actifs crypto.

   Les cours n'ont jamais été récupérés d'eux-mêmes : il fallait aller presser
   un bouton dans les Réglages, et un portefeuille consulté au quotidien
   affichait donc la valeur du dernier jour où l'on y avait pensé.

   Ils se rafraîchissent désormais à l'ouverture, au plus une fois par
   intervalle réglé (six heures par défaut), et à la demande. Ce qui sort de la
   machine reste ce qui en sortait : les seuls identifiants des actifs — jamais
   vos quantités, jamais vos montants (EX-99). La bascule est dans Réglages, et
   tout continue de fonctionner sans réseau, sur le dernier cours connu. */
'use strict';

const Cours = {

  // Identifiants CoinGecko des actifs les plus courants. Sans eux, il faudrait
  // aller les saisir un par un pour que la mise à jour sache quoi demander.
  IDS: {
    BTC: 'bitcoin', XBT: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano',
    DOT: 'polkadot', AVAX: 'avalanche-2', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
    LINK: 'chainlink', XRP: 'ripple', LTC: 'litecoin', BCH: 'bitcoin-cash', DOGE: 'dogecoin',
    ATOM: 'cosmos', ALGO: 'algorand', XTZ: 'tezos', NEAR: 'near', ARB: 'arbitrum',
    OP: 'optimism', UNI: 'uniswap', AAVE: 'aave', TRX: 'tron', BNB: 'binancecoin',
    USDT: 'tether', USDC: 'usd-coin', DAI: 'dai', SHIB: 'shiba-inu', PEPE: 'pepe',
    FIL: 'filecoin', ICP: 'internet-computer', ETC: 'ethereum-classic', HBAR: 'hedera-hashgraph',
    VET: 'vechain', RENDER: 'render-token', INJ: 'injective-protocol', SUI: 'sui', TON: 'the-open-network',
  },

  NOMS: {
    bitcoin: 'Bitcoin', ethereum: 'Ethereum', solana: 'Solana', cardano: 'Cardano',
    binancecoin: 'BNB', ripple: 'XRP', litecoin: 'Litecoin', dogecoin: 'Dogecoin',
    polkadot: 'Polkadot', chainlink: 'Chainlink', 'avalanche-2': 'Avalanche',
  },

  /* ---------- Quels actifs sont concernés ---------- */

  // Les symboles réellement détenus sur un compte de nature crypto.
  symbolesCrypto() {
    const S = Store.state;
    const comptes = new Set(S.accounts.filter(a => a.type === 'crypto').map(a => a.id));
    const syms = new Set();
    for (const t of S.trades) if (comptes.has(t.accountId)) syms.add(t.symbol);
    for (const p of S.positionSnapshots) if (comptes.has(p.accountId)) syms.add(p.symbol);
    return [...syms];
  },

  // Complète les identifiants manquants d'après la table ci-dessus. Un actif
  // saisi avant que cette table n'existe, ou arrivé par un import, n'en avait
  // aucun — et restait donc muet à chaque mise à jour, sans que rien ne le dise.
  // → nombre d'identifiants posés.
  completerIdentifiants() {
    const S = Store.state;
    let n = 0;
    for (const sym of Cours.symbolesCrypto()) {
      const meta = S.priceMeta[sym] || {};
      if (meta.coingecko) continue;
      const id = Cours.IDS[sym];
      if (!id) continue;
      S.priceMeta[sym] = { ...meta, coingecko: id, currency: 'EUR', name: meta.name || Cours.NOMS[id] || meta.name };
      n++;
    }
    return n;
  },

  // Actifs détenus dont l'identifiant reste inconnu : à dire, plutôt que de
  // les passer sous silence à chaque mise à jour.
  sansIdentifiant() {
    const S = Store.state;
    return Cours.symbolesCrypto().filter(s => !(S.priceMeta[s] || {}).coingecko);
  },

  /* ---------- Récupération ---------- */

  // → {n, total, sans:[symboles], erreur?}
  async majCrypto() {
    const S = Store.state;
    Cours.completerIdentifiants();
    const cibles = [];
    for (const sym of Cours.symbolesCrypto()) {
      const id = (S.priceMeta[sym] || {}).coingecko;
      if (id) cibles.push({ sym, id });
    }
    // Les supports non crypto peuvent aussi porter un identifiant (bitcoin des
    // arrondis, par exemple) : on ne les oublie pas.
    for (const [sym, meta] of Object.entries(S.priceMeta)) {
      if (meta.coingecko && !cibles.some(c => c.sym === sym)) cibles.push({ sym, id: meta.coingecko });
    }
    const sans = Cours.sansIdentifiant();
    if (!cibles.length) return { n: 0, total: 0, sans };

    const ids = [...new Set(cibles.map(c => c.id))];
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=eur`;
    let data;
    try {
      const r = await fetch(url);
      if (r.status === 429) throw new Error('trop de demandes au fournisseur de cours — réessayez dans une minute');
      if (!r.ok) throw new Error(`réponse ${r.status} du fournisseur de cours`);
      data = await r.json();
    } catch (e) {
      return { n: 0, total: cibles.length, sans, erreur: e.message || 'fournisseur injoignable' };
    }

    const jour = U.today();
    let n = 0;
    for (const { sym, id } of cibles) {
      const eur = data[id] && data[id].eur;
      if (typeof eur !== 'number') continue;
      Engine.setPrice(sym, jour, U.roundCents(eur * 100));
      n++;
    }
    if (n) {
      S.settings.coursDernierMaj = new Date().toISOString();
      Engine.invalidate();
      Store.markDirty();
    }
    return { n, total: cibles.length, sans };
  },

  /* ---------- Rafraîchissement automatique ---------- */

  INTERVALLE_H: 6,

  // Assez de temps s'est-il écoulé depuis la dernière mise à jour réussie ?
  aRafraichir() {
    const S = Store.state;
    if (!S || S.settings.coursAuto === false) return false;
    if (!Cours.symbolesCrypto().length) return false;
    const dernier = S.settings.coursDernierMaj;
    if (!dernier) return true;
    const ecoule = (Date.now() - new Date(dernier).getTime()) / 3600000;
    return !(ecoule >= 0) || ecoule >= (S.settings.coursIntervalleH || Cours.INTERVALLE_H);
  },

  // Appelée à l'ouverture. Silencieuse : un cours qui ne se met pas à jour
  // n'est pas un incident — la valorisation continue sur le dernier connu.
  async majAuto() {
    if (!navigator.onLine) return null;
    if (!Cours.aRafraichir()) return null;
    const r = await Cours.majCrypto();
    if (r.n && Cours.onMaj) Cours.onMaj(r);
    return r;
  },

  onMaj: null,

  // Le moment de la dernière mise à jour, dit simplement.
  derniereMaj() {
    const d = Store.state && Store.state.settings.coursDernierMaj;
    if (!d) return 'jamais';
    const t = new Date(d);
    const h = (Date.now() - t.getTime()) / 3600000;
    if (h < 1) return 'il y a moins d\'une heure';
    if (h < 24) return `il y a ${Math.round(h)} h`;
    return `le ${t.toLocaleDateString('fr-FR')}`;
  },
};
