/* Essor — fiscalité de sortie par enveloppe.

   Ce que vaudrait le patrimoine si l'on liquidait tout à une date donnée, au
   droit français actuel. L'impôt frappe les GAINS, jamais le capital : il
   faut donc connaître la base fiscale de chaque compte — ses versements —
   que la projection suit mois par mois.

   C'est une approximation de sortie en une fois, assumée et dite à l'écran
   (P7, P8) : primes d'assurance-vie < 150 k€, abattement AV appliqué une
   seule fois, taux d'aujourd'hui pour des retraits de demain. Elle rend
   enfin comparables un PEA et un CTO — 17,2 % contre 30 % sur les gains,
   l'écart qui justifie l'enveloppe.

   Sans année d'ouverture renseignée, PEA et AV sont supposés avoir mûri à
   l'horizon (5 et 8 ans) — hypothèse favorable, affichée. Les livrets
   réglementés et la résidence principale sont exonérés ; un livret bancaire
   fiscalisé ou un bien locatif se déclarent par le taux personnalisé du
   compte. */
'use strict';

const Fisc = {

  PS: 0.172,     // prélèvements sociaux
  PFU: 0.30,     // prélèvement forfaitaire unique (12,8 % IR + 17,2 % PS)
  AV_IR: 0.075,  // IR sur l'assurance-vie après 8 ans, primes < 150 k€

  // Âge de l'enveloppe dans `yearsAhead` années, si l'ouverture est connue.
  _age(account, yearsAhead) {
    if (!account.openedYear) return null;
    return new Date().getFullYear() + yearsAhead - account.openedYear;
  },

  // Régime applicable à un compte — retourne de quoi calculer ET de quoi
  // expliquer : chaque euro d'impôt projeté doit pouvoir dire d'où il vient.
  regime(account, yearsAhead) {
    if (account.taxRateOverride != null) {
      return { rate: account.taxRateOverride,
        label: `taux personnalisé ${(account.taxRateOverride * 100).toLocaleString('fr-FR')} %` };
    }
    const age = Fisc._age(account, yearsAhead);
    switch (account.type) {
      case 'pea':
        if (age !== null && age < 5) return { rate: Fisc.PFU, label: 'PEA < 5 ans : PFU 30 %' };
        return { rate: Fisc.PS, label: 'PEA ≥ 5 ans : prélèvements sociaux 17,2 %' };
      case 'titres':
        return { rate: Fisc.PFU, label: 'CTO : PFU 30 %' };
      case 'crypto':
        return { rate: Fisc.PFU, label: 'Crypto : flat tax 30 %' };
      case 'av':
        if (age !== null && age < 8) return { rate: Fisc.PFU, label: 'AV < 8 ans : PFU 30 %' };
        return { av: true, label: 'AV ≥ 8 ans : 17,2 % + 7,5 % au-delà de l\'abattement' };
      default:
        return { rate: 0, label: 'exonéré' };
    }
  },

  // Impôt dû si le compte était liquidé, ses gains valant (valeur − base).
  tax(account, value, basis, settings, yearsAhead) {
    const gains = Math.max(0, value - basis);
    if (gains <= 0) return 0;
    const r = Fisc.regime(account, yearsAhead);
    if (r.av) {
      const abattement = settings.avAbattement ?? 460000;
      return U.roundCents(gains * Fisc.PS + Math.max(0, gains - abattement) * Fisc.AV_IR);
    }
    return U.roundCents(gains * (r.rate || 0));
  },

  // Patrimoine net de fiscalité de sortie : comptes nets d'impôt, moins les
  // dettes. `vals` et `basis` : centimes par identifiant de compte.
  netTotal(accounts, vals, basis, settings, yearsAhead, debts) {
    let tot = 0;
    for (const a of accounts) {
      const v = vals[a.id] || 0;
      tot += v - Fisc.tax(a, v, basis[a.id] ?? v, settings, yearsAhead);
    }
    return U.roundCents(tot - (debts || 0));
  },
};
