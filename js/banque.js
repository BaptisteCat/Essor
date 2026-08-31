/* Essor — connexion bancaire (Enable Banking, via votre relais).

   La connexion ne remplace pas la mécanique des relevés : elle la NOURRIT.
   Les opérations récupérées passent par le même pipeline que les fichiers —
   dédoublonnage, libellés apparentés, catégorisation — et le solde renvoyé
   par la banque devient une proposition de certification : la preuve au
   centime, sans geste. On gagne la fraîcheur ; on ne perd aucune vérification.

   Ce qui transite, et par où : vos opérations voyagent de la banque à Enable
   Banking (prestataire agréé DSP2), puis par votre relais Cloudflare, jusqu'à
   cette page. Rien n'est stocké en chemin. Le consentement DSP2 se renouvelle
   auprès de la banque tous les 90 à 180 jours — c'est la règle, pas un choix. */
'use strict';

const Banque = {

  /* ---------- Configuration ---------- */

  cfg() {
    const S = Store.state;
    if (!S.settings.banque) {
      S.settings.banque = { relais: '', cle: '', sessions: [], liens: {}, auto: true, intervalleH: 6, dernierMaj: null };
    }
    return S.settings.banque;
  },

  actif() {
    const b = Store.state && Store.state.settings.banque;
    return !!(b && b.relais && b.cle);
  },

  /* ---------- Appels au relais ---------- */

  async appel(chemin, options = {}) {
    const b = Banque.cfg();
    let r;
    try {
      r = await fetch(b.relais.replace(/\/$/, '') + chemin, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Essor-Cle': b.cle },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      const e = new Error('relais injoignable — vérifiez la connexion et l\'adresse du relais');
      e.code = 'HORS_LIGNE';
      throw e;
    }
    if (r.status === 401) { const e = new Error('clé de relais refusée'); e.code = 'CLE'; throw e; }
    const texte = await r.text();
    let data;
    try { data = JSON.parse(texte); } catch { data = { brut: texte }; }
    if (!r.ok) {
      const e = new Error(data.erreur || data.message || `réponse ${r.status} du service bancaire`);
      e.code = r.status;
      throw e;
    }
    return data;
  },

  // Banques disponibles en France (mémorisées : la liste ne bouge presque jamais).
  async banques() {
    if (Banque._banques) return Banque._banques;
    const data = await Banque.appel('/aspsps?country=FR');
    Banque._banques = (data.aspsps || []).map(a => ({ name: a.name, country: a.country }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return Banque._banques;
  },

  /* ---------- Consentement ---------- */

  // Lance le parcours d'autorisation : la page part chez la banque, qui
  // renverra vers l'application avec un code. L'état visite le paramètre
  // `state` pour être reconnu au retour.
  async autoriser(nomBanque) {
    const validite = new Date(Date.now() + 180 * 86400000).toISOString();
    const r = await Banque.appel('/auth', {
      method: 'POST',
      body: {
        access: { valid_until: validite },
        aspsp: { name: nomBanque, country: 'FR' },
        state: 'essor-eb',
        redirect_url: location.origin + location.pathname,
        psu_type: 'personal',
      },
    });
    if (!r.url) throw new Error('la banque n\'a pas renvoyé d\'adresse d\'autorisation');
    // L'enregistrement part AVANT la redirection : au retour, la page renaît.
    await Store.save();
    location.href = r.url;
  },

  // Au retour de la banque : ?state=essor-eb&code=… → la session s'ouvre.
  // → null si l'URL ne porte rien, sinon la session créée.
  async reprendre() {
    const q = new URLSearchParams(location.search);
    if (q.get('state') !== 'essor-eb') return null;
    const code = q.get('code');
    // L'URL est nettoyée tout de suite : un rechargement ne doit pas rejouer
    // un code qui ne vaut qu'une fois.
    history.replaceState(history.state, '', location.pathname);
    if (!code) throw new Error(q.get('error') ? `autorisation refusée : ${q.get('error')}` : 'retour de banque sans code');
    const s = await Banque.appel('/sessions', { method: 'POST', body: { code } });
    const b = Banque.cfg();
    const session = {
      id: s.session_id,
      aspsp: (s.aspsp && s.aspsp.name) || 'banque',
      validUntil: (s.access && s.access.valid_until) || null,
      comptes: (s.accounts || []).map(uid => ({ uid: typeof uid === 'string' ? uid : uid.uid || uid.id })),
    };
    // Détail des comptes (IBAN, nom) pour que le rattachement soit lisible.
    for (const c of session.comptes) {
      try {
        const d = await Banque.appel(`/accounts/${encodeURIComponent(c.uid)}/balances`);
        c.solde = Banque._meilleurSolde(d.balances);
      } catch { /* le solde viendra à la première synchronisation */ }
    }
    b.sessions = b.sessions.filter(x => x.aspsp !== session.aspsp);   // un consentement remplace le précédent
    b.sessions.push(session);
    Store.markDirty();
    return session;
  },

  // Jours de validité restants d'une session ; ≤ 0 = consentement à renouveler.
  joursRestants(session) {
    if (!session.validUntil) return null;
    return Math.floor((new Date(session.validUntil) - Date.now()) / 86400000);
  },

  /* ---------- Synchronisation ---------- */

  _meilleurSolde(balances) {
    if (!balances || !balances.length) return null;
    // Le solde comptable arrêté (CLBD) d'abord ; à défaut, le premier venu.
    const b = balances.find(x => x.balance_type === 'CLBD') || balances[0];
    const v = b.balance_amount && b.balance_amount.amount;
    if (v == null) return null;
    return { balance: U.parseAmount(String(v)), date: b.reference_date || U.today(), type: b.balance_type };
  },

  // Une transaction Enable Banking → une ligne du pipeline d'import.
  _versLigne(t) {
    const date = t.booking_date || t.value_date;
    let montant = U.parseAmount(String(t.transaction_amount && t.transaction_amount.amount));
    if (montant == null || !date) return null;
    const debit = t.credit_debit_indicator === 'DBIT';
    if (t.credit_debit_indicator) montant = debit ? -Math.abs(montant) : Math.abs(montant);
    const tiers = debit ? (t.creditor && t.creditor.name) : (t.debtor && t.debtor.name);
    const motif = Array.isArray(t.remittance_information)
      ? t.remittance_information.join(' ').trim() : (t.remittance_information || '');
    return {
      date, amount: montant,
      label: [tiers, motif].filter(Boolean).join(' — ') || 'Opération',
      raw: { eb: t.entry_reference || null, statut: t.status || null },
      opType: (t.bank_transaction_code && t.bank_transaction_code.description) || undefined,
    };
  },

  // Synchronise tous les comptes rattachés. → bilan chiffré.
  async synchroniser({ silencieux = false } = {}) {
    const b = Banque.cfg();
    const bilan = { comptes: 0, ajoutees: 0, doublons: 0, soldes: [], expirees: [], erreurs: [] };
    for (const session of b.sessions) {
      const jours = Banque.joursRestants(session);
      if (jours != null && jours <= 0) { bilan.expirees.push(session.aspsp); continue; }
      for (const compte of session.comptes) {
        const essorId = b.liens[compte.uid];
        if (!essorId || !Engine.account(essorId)) continue;   // pas rattaché : pas touché
        try {
          // Une semaine de recouvrement : le dédoublonnage fait le tri, et un
          // retard de comptabilisation ne perd jamais une opération.
          const depuis = b.dernierMaj
            ? U.dateStr(new Date(new Date(b.dernierMaj).getTime() - 7 * 86400000))
            : U.dateStr(new Date(Date.now() - 90 * 86400000));
          const lignes = [];
          let suite = null;
          for (let page = 0; page < 20; page++) {
            const q = `/accounts/${encodeURIComponent(compte.uid)}/transactions?date_from=${depuis}` +
              (suite ? `&continuation_key=${encodeURIComponent(suite)}` : '');
            const d = await Banque.appel(q);
            for (const t of d.transactions || []) {
              if (t.status && t.status !== 'BOOK') continue;   // le pré-comptabilisé bouge encore
              const l = Banque._versLigne(t);
              if (l) lignes.push(l);
            }
            suite = d.continuation_key;
            if (!suite) break;
          }
          // Le MÊME pipeline que les fichiers : dédoublonnage exact, libellés
          // apparentés, catégorisation, tout s'applique à l'identique.
          const sessionImport = {
            files: [{ name: `eb:${session.aspsp}`, path: `eb:${session.aspsp}/${compte.uid.slice(0, 8)}`,
              parsed: { kind: 'bank', preamble: [], header: [], rows: lignes, soldes: [] },
              clues: [], accountId: essorId, resolution: 'auto' }],
            errors: [],
          };
          const r = Importer.apply(sessionImport, {});
          bilan.comptes++;
          bilan.ajoutees += r.added;
          bilan.doublons += r.dup;
          // Le solde que la banque annonce : la certification sans geste.
          const d = await Banque.appel(`/accounts/${encodeURIComponent(compte.uid)}/balances`);
          const solde = Banque._meilleurSolde(d.balances);
          if (solde) {
            compte.solde = solde;
            bilan.soldes.push({ accountId: essorId, date: solde.date, balance: solde.balance,
              source: `solde ${session.aspsp} (${solde.type})` });
          }
        } catch (e) {
          bilan.erreurs.push(`${session.aspsp} : ${e.message}`);
          if (e.code === 'CLE' || e.code === 'HORS_LIGNE') break;
        }
      }
    }
    if (bilan.comptes) {
      b.dernierMaj = new Date().toISOString();
      Store.markDirty();
    }
    if (!silencieux && Banque.onBilan) Banque.onBilan(bilan);
    return bilan;
  },

  onBilan: null,

  // À l'ouverture, comme les cours : au plus une fois par intervalle.
  aRafraichir() {
    const b = Store.state && Store.state.settings.banque;
    if (!b || !Banque.actif() || b.auto === false) return false;
    if (!Object.keys(b.liens || {}).length) return false;
    if (!b.dernierMaj) return true;
    return (Date.now() - new Date(b.dernierMaj).getTime()) / 3600000 >= (b.intervalleH || 6);
  },

  async majAuto() {
    if (!navigator.onLine || !Banque.aRafraichir()) return null;
    return Banque.synchroniser();
  },

  derniereMaj() {
    const d = Store.state && Store.state.settings.banque && Store.state.settings.banque.dernierMaj;
    if (!d) return 'jamais';
    const h = (Date.now() - new Date(d).getTime()) / 3600000;
    if (h < 1) return 'il y a moins d\'une heure';
    if (h < 24) return `il y a ${Math.round(h)} h`;
    return `le ${new Date(d).toLocaleDateString('fr-FR')}`;
  },
};
