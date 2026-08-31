/* Essor — déverrouillage par Face ID, Touch ID ou Windows Hello.

   Une phrase de passe longue est la bonne serrure, mais la retaper à chaque
   ouverture sur un téléphone est intenable. WebAuthn offre exactement ce qu'il
   faut pour l'éviter sans rien affaiblir : l'extension **PRF** fait dériver à
   l'authentificateur de l'appareil un secret stable, toujours le même pour une
   clé d'accès et un sel donnés, et qu'il ne livre qu'après vérification de
   l'utilisateur — regard, empreinte, code de l'appareil.

   Ce secret ne sert qu'à sceller la phrase de passe sur cet appareil. Il n'est
   ni stocké ni transmis : il est recalculé à chaque déverrouillage. Sans la
   biométrie, le fichier scellé ne dit rien, et la phrase reste le recours.

   Rien de tout cela ne touche au dépôt : la clé d'accès est locale à l'appareil
   et à l'adresse du site, et n'est jamais synchronisée par Essor. */
'use strict';

const Bio = {

  RP_NOM: 'Essor',

  /* ---------- Disponibilité ---------- */

  // L'appareil sait-il vérifier son porteur (biométrie ou code) ?
  async disponible() {
    if (!window.PublicKeyCredential || !navigator.credentials ||
        typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
  },

  // Le nom que porte ce mécanisme sur cet appareil : le dire juste évite
  // d'avoir à deviner quel geste on attend de vous.
  nomLocal() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/i.test(ua)) return 'Face ID ou Touch ID';
    if (/Android/i.test(ua)) return 'l\'empreinte ou le code de l\'appareil';
    if (/Windows/i.test(ua)) return 'Windows Hello';
    if (/Mac OS X/i.test(ua)) return 'Touch ID';
    return 'la vérification de l\'appareil';
  },

  async configuree() { return !!(await Store._get('bio')); },

  /* ---------- Activation ---------- */

  // Enregistre une clé d'accès et scelle la phrase avec le secret qu'elle
  // dérive. La phrase est vérifiée AVANT d'arriver ici.
  async activer(phrase) {
    if (!(await Bio.disponible())) throw new Error('Cet appareil ne propose pas de vérification biométrique.');
    const idUtilisateur = crypto.getRandomValues(new Uint8Array(16));
    let cred;
    try {
      cred = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: Bio.RP_NOM, id: location.hostname },
          user: { id: idUtilisateur, name: 'essor', displayName: 'Essor' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',   // l'appareil lui-même, pas une clé USB
            residentKey: 'preferred',
            userVerification: 'required',          // sans vérification, aucun intérêt
          },
          extensions: { prf: {} },
          timeout: 60000,
        },
      });
    } catch (e) {
      throw new Error(e && e.name === 'NotAllowedError'
        ? 'Vérification refusée ou expirée.'
        : 'Impossible d\'enregistrer une clé d\'accès sur cet appareil.');
    }
    if (!cred) throw new Error('Aucune clé d\'accès n\'a été créée.');

    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    if (!ext.prf || ext.prf.enabled === false) {
      throw new Error('Ce navigateur enregistre bien une clé d\'accès, mais ne sait pas en dériver ' +
        'de secret (extension PRF absente). Le déverrouillage biométrique n\'est pas possible ici.');
    }

    const idCred = new Uint8Array(cred.rawId);
    const sel = crypto.getRandomValues(new Uint8Array(32));
    const secret = await Bio._evaluer(idCred, sel);   // demande la vérification
    if (!secret) throw new Error('Ce navigateur n\'a pas renvoyé de secret dérivé (extension PRF).');

    const cle = await Bio._cleDe(secret);
    await Store._put('bio', {
      idCred: Coffre._b64(idCred),
      sel: Coffre._b64(sel),
      enveloppe: await Coffre.sceller(cle, 'prf', { phrase }),
      nom: Bio.nomLocal(),
      cree: new Date().toISOString(),
    });
  },

  /* ---------- Ouverture ---------- */

  // → la phrase de passe. Lève si la vérification est refusée.
  async ouvrir() {
    const reg = await Store._get('bio');
    if (!reg) throw new Error('Aucun déverrouillage biométrique n\'est enregistré sur cet appareil.');
    const secret = await Bio._evaluer(Coffre._debase64(reg.idCred), Coffre._debase64(reg.sel));
    if (!secret) throw new Error('Ce navigateur n\'a pas renvoyé le secret attendu.');
    const cle = await Bio._cleDe(secret);
    let ouvert;
    try { ouvert = await Coffre.ouvrirAvecCle(cle, reg.enveloppe); }
    catch {
      // Secret dérivé différent : clé d'accès remplacée, ou profil restauré.
      throw new Error('Le déverrouillage biométrique de cet appareil n\'est plus valable. ' +
        'Saisissez la phrase de passe, puis réactivez-le dans Réglages.');
    }
    return ouvert.phrase;
  },

  async desactiver() { await Store._del('bio'); },

  // La phrase a changé : le scellé doit suivre, sinon la biométrie ouvrirait
  // sur une phrase périmée.
  async resceller(phrase) {
    if (!(await Bio.configuree())) return;
    try { await Bio.activer(phrase); }        // nouvelle clé d'accès, nouveau sel
    catch { await Bio.desactiver(); }         // à défaut, on ne laisse rien de faux
  },

  /* ---------- Rouages ---------- */

  // Demande à l'authentificateur d'évaluer sa fonction pseudo-aléatoire sur
  // notre sel. C'est ce qui provoque le Face ID / Windows Hello.
  async _evaluer(idCred, sel) {
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: idCred }],
          userVerification: 'required',
          extensions: { prf: { eval: { first: sel } } },
          timeout: 60000,
        },
      });
    } catch (e) {
      const err = new Error(e && e.name === 'NotAllowedError'
        ? 'Vérification refusée ou expirée.'
        : 'La vérification de l\'appareil a échoué.');
      err.code = 'REFUS';
      throw err;
    }
    const ext = assertion && assertion.getClientExtensionResults ? assertion.getClientExtensionResults() : {};
    const r = ext.prf && ext.prf.results && ext.prf.results.first;
    return r ? new Uint8Array(r) : null;
  },

  async _cleDe(secret) {
    // Le secret PRF est déjà une sortie de dérivation : on le passe malgré tout
    // par HKDF pour lier la clé à cet usage et à cette application.
    const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('essor/bio/v1') },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
};
