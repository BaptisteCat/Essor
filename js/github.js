/* Essor — dépôt de données GitHub (synchronisation PC ↔ mobile).

   L'application, elle, est servie par GitHub Pages ; les données vivent dans
   un SECOND dépôt, privé, où l'on ne dépose que des enveloppes chiffrées
   (voir js/crypto.js). GitHub ne voit qu'un bloc d'octets, et son historique
   de commits offre gratuitement un journal de versions.

   Le jeton d'accès ne sort jamais du navigateur : il est conservé chiffré
   dans IndexedDB, et n'est déchiffré qu'après la phrase de passe. */
'use strict';

const Depot = {

  cfg: null,   // {owner, repo, branch, chemin, jeton}

  API: 'https://api.github.com',

  configure(cfg) { Depot.cfg = cfg && cfg.owner && cfg.repo && cfg.jeton ? cfg : null; },
  actif() { return !!Depot.cfg; },
  chemin() { return (Depot.cfg && Depot.cfg.chemin) || 'essor-data.json.enc'; },
  branche() { return (Depot.cfg && Depot.cfg.branch) || 'main'; },

  _entetes(extra) {
    return Object.assign({
      'Authorization': `Bearer ${Depot.cfg.jeton}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }, extra || {});
  },

  async _appel(url, opts = {}) {
    let r;
    try {
      r = await fetch(url, opts);
    } catch (e) {
      const err = new Error('HORS_LIGNE');
      err.code = 'HORS_LIGNE';
      throw err;
    }
    if (r.status === 401 || r.status === 403) {
      const err = new Error('JETON_REFUSE');
      err.code = 'JETON_REFUSE';
      err.detail = (await r.text().catch(() => '')).slice(0, 300);
      throw err;
    }
    return r;
  },

  /* ---------- Vérification de la configuration ---------- */

  // → {nomComplet, prive, ecriture} ; lève sur jeton ou dépôt invalide.
  async verifier(cfg) {
    const garde = Depot.cfg;
    Depot.cfg = cfg;
    try {
      const r = await Depot._appel(`${Depot.API}/repos/${cfg.owner}/${cfg.repo}`, { headers: Depot._entetes() });
      if (r.status === 404) throw new Error('Dépôt introuvable, ou le jeton n\'y donne pas accès.');
      if (!r.ok) throw new Error(`GitHub a répondu ${r.status}.`);
      const j = await r.json();
      return {
        nomComplet: j.full_name,
        prive: !!j.private,
        ecriture: !!(j.permissions && j.permissions.push),
        brancheParDefaut: j.default_branch || 'main',
      };
    } finally { Depot.cfg = garde; }
  },

  /* ---------- Lecture ---------- */

  // Métadonnées du fichier de données. → {sha, size} | null s'il n'existe pas.
  async _meta(chemin) {
    const c = chemin || Depot.chemin();
    const dossier = c.includes('/') ? c.slice(0, c.lastIndexOf('/')) : '';
    const nom = c.slice(c.lastIndexOf('/') + 1);
    const url = `${Depot.API}/repos/${Depot.cfg.owner}/${Depot.cfg.repo}/contents/${encodeURI(dossier)}?ref=${encodeURIComponent(Depot.branche())}`;
    const r = await Depot._appel(url, { headers: Depot._entetes() });
    if (r.status === 404) return null;          // dossier (ou dépôt vide) absent
    if (!r.ok) throw new Error(`Lecture impossible (${r.status}).`);
    const liste = await r.json();
    if (!Array.isArray(liste)) return null;
    const e = liste.find(x => x.name === nom && x.type === 'file');
    return e ? { sha: e.sha, size: e.size } : null;
  },

  // → {texte, sha} | null. Le média « raw » lève la limite de 1 Mo de l'API
  // JSON : un historique d'opérations chiffré la dépasse vite.
  async lire() {
    const meta = await Depot._meta();
    if (!meta) return null;
    const url = `${Depot.API}/repos/${Depot.cfg.owner}/${Depot.cfg.repo}/contents/${encodeURI(Depot.chemin())}?ref=${encodeURIComponent(Depot.branche())}`;
    const r = await Depot._appel(url, { headers: Depot._entetes({ 'Accept': 'application/vnd.github.raw' }) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Lecture impossible (${r.status}).`);
    return { texte: await r.text(), sha: meta.sha };
  },

  // Le sha connu de la dernière lecture ; renvoyé aussi par écrire().
  async shaCourant() {
    const m = await Depot._meta();
    return m ? m.sha : null;
  },

  /* ---------- Écriture ---------- */

  // Écrit le fichier. `sha` est celui de la version qu'on croit remplacer :
  // GitHub refuse (409) s'il a changé entre temps — c'est ainsi qu'un autre
  // appareil ne se fait jamais écraser en silence.
  // → {sha} ; lève une erreur .code='CONFLIT' le cas échéant.
  async ecrire(texte, sha, message, chemin) {
    const c = chemin || Depot.chemin();
    const url = `${Depot.API}/repos/${Depot.cfg.owner}/${Depot.cfg.repo}/contents/${encodeURI(c)}`;
    const corps = {
      message: message || 'Essor — mise à jour',
      content: Coffre._b64(new TextEncoder().encode(texte)),
      branch: Depot.branche(),
    };
    if (sha) corps.sha = sha;
    const r = await Depot._appel(url, {
      method: 'PUT', headers: Depot._entetes({ 'Content-Type': 'application/json' }), body: JSON.stringify(corps),
    });
    if (r.status === 409 || r.status === 422) {
      const err = new Error('CONFLIT');
      err.code = 'CONFLIT';
      throw err;
    }
    if (!r.ok) throw new Error(`Écriture refusée par GitHub (${r.status}).`);
    const j = await r.json();
    return { sha: j.content && j.content.sha };
  },

  /* ---------- Sauvegardes ---------- */

  async deposerSauvegarde(nom, texte) {
    return Depot.ecrire(texte, null, `Essor — sauvegarde ${nom}`, `backups/${nom}`);
  },

  // → [{nom, taille}] du plus récent au plus ancien (les noms sont horodatés).
  async listerSauvegardes() {
    const url = `${Depot.API}/repos/${Depot.cfg.owner}/${Depot.cfg.repo}/contents/backups?ref=${encodeURIComponent(Depot.branche())}`;
    const r = await Depot._appel(url, { headers: Depot._entetes() });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`Lecture des sauvegardes impossible (${r.status}).`);
    const l = await r.json();
    if (!Array.isArray(l)) return [];
    return l.filter(x => x.type === 'file').map(x => ({ nom: x.name, taille: x.size, sha: x.sha }))
      .sort((a, b) => b.nom.localeCompare(a.nom));
  },

  async lireSauvegarde(nom) {
    const url = `${Depot.API}/repos/${Depot.cfg.owner}/${Depot.cfg.repo}/contents/${encodeURI('backups/' + nom)}?ref=${encodeURIComponent(Depot.branche())}`;
    const r = await Depot._appel(url, { headers: Depot._entetes({ 'Accept': 'application/vnd.github.raw' }) });
    if (!r.ok) throw new Error(`Sauvegarde illisible (${r.status}).`);
    return r.text();
  },
};
