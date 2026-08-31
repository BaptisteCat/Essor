/* Essor — coffre (chiffrement local et distant).

   L'application est publiée sur GitHub Pages : le code est public, les données
   ne le sont jamais. Tout ce qui sort de la mémoire vive — l'enregistrement
   local dans le navigateur comme le fichier déposé dans le dépôt de données —
   passe par ce module. Sans la phrase de passe, un fichier volé n'est qu'un
   bloc d'octets.

   AES-GCM 256 bits, clé dérivée de la phrase de passe par PBKDF2-SHA256.
   Le sel est conservé EN CLAIR dans l'enveloppe : c'est ce qui permet de
   retrouver la même clé sur un autre appareil à partir de la seule phrase.
   Le vecteur d'initialisation est tiré à neuf à chaque écriture — réutiliser
   un IV avec GCM détruirait la confidentialité. */
'use strict';

const Coffre = {

  ITER: 310000,          // OWASP 2023 pour PBKDF2-SHA256
  VERSION: 1,

  disponible() {
    return typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.deriveKey === 'function';
  },

  /* ---------- Base64 ---------- */

  _b64(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(s);
  },

  _debase64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  /* ---------- Dérivation ---------- */

  // → {cle, sel}  (sel en base64, à reconduire tel quel d'une écriture à l'autre)
  async deriver(phrase, selB64) {
    if (!Coffre.disponible()) throw new Error('Ce navigateur ne fournit pas WebCrypto : ouvrez l\'application en HTTPS.');
    const sel = selB64 ? Coffre._debase64(selB64) : crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'PBKDF2', false, ['deriveKey']);
    const cle = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: sel, iterations: Coffre.ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { cle, sel: selB64 || Coffre._b64(sel) };
  },

  /* ---------- Enveloppe ---------- */

  estEnveloppe(texte) {
    if (typeof texte !== 'string') return false;
    try { const o = JSON.parse(texte); return !!(o && o.essor && o.ct && o.iv && o.kdf); }
    catch { return false; }
  },

  // Chiffre un objet quelconque → texte d'enveloppe (JSON, lisible mais opaque).
  async sceller(cle, sel, objet) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const clair = new TextEncoder().encode(JSON.stringify(objet));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, clair);
    return JSON.stringify({
      essor: Coffre.VERSION,
      note: 'Donnees chiffrees AES-GCM. Sans la phrase de passe, ce fichier est inexploitable.',
      kdf: { algo: 'PBKDF2-SHA256', iter: Coffre.ITER, sel },
      iv: Coffre._b64(iv),
      ct: Coffre._b64(ct),
    }, null, 1);
  },

  // Ouvre une enveloppe avec une clé déjà dérivée. Lève si la clé est fausse
  // (GCM authentifie : une phrase erronée ne produit jamais de faux clair).
  async ouvrirAvecCle(cle, texte) {
    const env = typeof texte === 'string' ? JSON.parse(texte) : texte;
    let clair;
    try {
      clair = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Coffre._debase64(env.iv) }, cle, Coffre._debase64(env.ct));
    } catch { throw new Error('PHRASE_INVALIDE'); }
    return JSON.parse(new TextDecoder().decode(clair));
  },

  // Ouvre une enveloppe à partir de la phrase seule. → {donnees, cle, sel}
  async ouvrir(phrase, texte) {
    const env = typeof texte === 'string' ? JSON.parse(texte) : texte;
    const sel = env.kdf && env.kdf.sel;
    if (!sel) throw new Error('Enveloppe illisible : sel absent.');
    const { cle } = await Coffre.deriver(phrase, sel);
    // Les enveloppes anciennes peuvent avoir été forgées avec un autre nombre
    // d'itérations : on respecte celui qu'elles déclarent.
    if (env.kdf.iter && env.kdf.iter !== Coffre.ITER) {
      const c2 = await Coffre._deriverIter(phrase, sel, env.kdf.iter);
      return { donnees: await Coffre.ouvrirAvecCle(c2, env), cle: c2, sel };
    }
    return { donnees: await Coffre.ouvrirAvecCle(cle, env), cle, sel };
  },

  async _deriverIter(phrase, selB64, iter) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(phrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: Coffre._debase64(selB64), iterations: iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },

  /* ---------- Qualité de la phrase ---------- */

  // Estimation grossière, affichée à la création : elle décourage « azerty »
  // sans prétendre mesurer quoi que ce soit d'exact.
  force(p) {
    if (!p) return { score: 0, mot: 'vide' };
    let classes = 0;
    if (/[a-z]/.test(p)) classes++;
    if (/[A-Z]/.test(p)) classes++;
    if (/[0-9]/.test(p)) classes++;
    if (/[^a-zA-Z0-9]/.test(p)) classes++;
    const mots = p.trim().split(/\s+/).length;
    let score = Math.min(4, Math.floor(p.length / 6) + (classes >= 3 ? 1 : 0) + (mots >= 4 ? 1 : 0));
    if (p.length < 10) score = Math.min(score, 1);
    if (/^(azerty|qwerty|123|motdepasse|password)/i.test(p)) score = 0;
    return { score, mot: ['très faible', 'faible', 'correcte', 'bonne', 'solide'][score] };
  },
};
