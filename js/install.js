/* Essor — installation sur l'appareil.

   Une application installée n'est pas qu'un confort : lancée depuis l'écran
   d'accueil, elle occupe tout l'écran, s'ouvre hors réseau, et son stockage
   est traité comme durable plutôt que comme celui d'un onglet de passage.

   Chaque plateforme s'y prend autrement. Chrome et Edge émettent
   « beforeinstallprompt » et acceptent qu'on déclenche l'installation depuis
   un bouton. Safari, lui, n'émet rien : sur iPhone, seule la manœuvre manuelle
   existe — il faut donc l'expliquer plutôt que de proposer un bouton mort. */
'use strict';

const Install = {

  _invite: null,     // l'événement beforeinstallprompt mis de côté
  onChange: null,    // l'interface se rafraîchit quand l'état bouge

  /* ---------- État ---------- */

  // Lancée depuis l'écran d'accueil (et non dans un onglet) ?
  installee() {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      navigator.standalone === true;     // Safari iOS
  },

  plateforme() {
    const ua = navigator.userAgent;
    // iPadOS 13+ se déclare « Macintosh » : c'est l'écran tactile qui le trahit.
    if (/iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'bureau';
  },

  // Un bouton d'installation a-t-il un sens ici et maintenant ?
  invitable() { return !!Install._invite; },

  // L'application est-elle servie dans des conditions qui permettent
  // l'installation ? (HTTPS ou localhost — sinon rien n'est proposé nulle part)
  servieCorrectement() {
    return location.protocol === 'https:' ||
      ['localhost', '127.0.0.1'].includes(location.hostname);
  },

  /* ---------- Invitation native ---------- */

  // → 'accepte' | 'refuse' | 'indisponible'
  async proposer() {
    if (!Install._invite) return 'indisponible';
    const invite = Install._invite;
    Install._invite = null;              // un événement ne se rejoue pas
    invite.prompt();
    const { outcome } = await invite.userChoice;
    Install._prevenir();
    return outcome === 'accepted' ? 'accepte' : 'refuse';
  },

  _prevenir() { if (Install.onChange) Install.onChange(); },

  /* ---------- Marche à suivre, quand il n'y a pas de bouton ---------- */

  // Safari n'offre aucune interface programmable : le chemin exact vaut mieux
  // qu'une invitation vague (EX-88 — nommer l'action corrective).
  instructions() {
    switch (Install.plateforme()) {
      case 'ios':
        return `<ol class="pas-a-pas">
          <li>Ouvrez cette page dans <b>Safari</b> (Chrome sur iPhone ne sait pas installer).</li>
          <li>Touchez le bouton <b>Partager</b> — le carré avec une flèche vers le haut.</li>
          <li>Faites défiler, puis <b>Sur l'écran d'accueil</b>.</li>
          <li><b>Ajouter</b>. Essor apparaît avec les autres applications.</li>
        </ol>`;
      case 'android':
        return `<ol class="pas-a-pas">
          <li>Ouvrez le menu <b>⋮</b> de Chrome.</li>
          <li><b>Ajouter à l'écran d'accueil</b> ou <b>Installer l'application</b>.</li>
          <li>Confirmez.</li>
        </ol>`;
      default:
        return `<ol class="pas-a-pas">
          <li>Dans Chrome ou Edge, cliquez l'icône d'installation à droite de la barre d'adresse
          (un écran avec une flèche), ou menu <b>⋮</b> → <b>Installer Essor</b>.</li>
        </ol>`;
    }
  },

  /* ---------- Stockage durable ---------- */

  // Sans cette demande, le navigateur se réserve le droit d'effacer les données
  // d'un site « de passage » quand la place manque. Accordée, elle ne dispense
  // évidemment pas de la synchronisation — elle réduit le risque, c'est tout.
  async rendreDurable() {
    if (!navigator.storage || !navigator.storage.persist) return 'inconnu';
    try {
      if (await navigator.storage.persisted()) return 'accorde';
      return (await navigator.storage.persist()) ? 'accorde' : 'refuse';
    } catch { return 'inconnu'; }
  },

  async etatStockage() {
    if (!navigator.storage || !navigator.storage.persisted) return { durable: 'inconnu' };
    const out = {};
    try { out.durable = (await navigator.storage.persisted()) ? 'accorde' : 'refuse'; }
    catch { out.durable = 'inconnu'; }
    try {
      const e = await navigator.storage.estimate();
      out.utilise = e.usage; out.quota = e.quota;
    } catch { /* estimation indisponible */ }
    return out;
  },
};

// Chrome/Edge annoncent l'installabilité par cet événement ; sans
// preventDefault, la bannière du navigateur s'affiche et l'événement est perdu.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  Install._invite = e;
  Install._prevenir();
});

window.addEventListener('appinstalled', () => {
  Install._invite = null;
  Install._prevenir();
});
