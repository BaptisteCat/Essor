/* Essor — relais bancaire (Cloudflare Worker).

   Enable Banking authentifie chaque appel par un JWT signé avec la clé privée
   de votre application. Cette clé ne peut pas vivre dans un site public —
   quiconque lirait la page pourrait consommer votre quota et lancer des
   autorisations. Ce relais, déployé sur VOTRE compte Cloudflare (offre
   gratuite), la garde en secret d'environnement, signe les jetons, et
   transmet les appels — rien d'autre. Il ne stocke aucune donnée.

   Déploiement (une fois, ~10 minutes) :
   1. dash.cloudflare.com → Workers & Pages → Create Worker → coller ce fichier.
   2. Settings → Variables and Secrets, trois secrets :
      - EB_APP_ID     : l'identifiant d'application Enable Banking (kid)
      - EB_CLE_PRIVEE : la clé privée téléchargée à la création de l'application,
                        au format PEM (-----BEGIN PRIVATE KEY----- …)
      - RELAIS_CLE    : un mot de passe long que vous inventez — le même sera
                        collé dans Essor (Réglages → Connexion bancaire)
      et une variable :
      - ORIGINES      : https://VOTRE-COMPTE.github.io
   3. Deploy. L'adresse https://…workers.dev est celle à coller dans Essor. */

const API = 'https://api.enablebanking.com';
// Seuls les chemins dont Essor a besoin : lecture de comptes, rien de plus.
const CHEMINS = /^\/(aspsps|auth|sessions|accounts\/[^/]+\/(transactions|balances)|sessions\/[^/]+)$/;

let jetonCache = null; // {jwt, exp} — resigner à chaque appel serait du gaspillage

function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signerJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  if (jetonCache && jetonCache.exp - now > 300) return jetonCache.jwt;
  const pem = env.EB_CLE_PRIVEE.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const cle = await crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const exp = now + 3600;
  const corps = enc({ typ: 'JWT', alg: 'RS256', kid: env.EB_APP_ID }) + '.' +
    enc({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(corps));
  jetonCache = { jwt: corps + '.' + b64url(sig), exp };
  return jetonCache.jwt;
}

function corsEntetes(env, origine) {
  const permises = (env.ORIGINES || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = permises.includes(origine) || /^http:\/\/localhost(:\d+)?$/.test(origine || '');
  return {
    'Access-Control-Allow-Origin': ok ? origine : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Essor-Cle',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(req, env) {
    const origine = req.headers.get('Origin') || '';
    const cors = corsEntetes(env, origine);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);

    // Point de santé, public : dit ce qui est configuré, jamais les valeurs.
    // C'est ce qui permet de distinguer « secret absent » de « clé différente »
    // sans jamais faire circuler un secret.
    if (url.pathname === '/sante') {
      const etat = {
        relais: 'essor',
        relais_cle_definie: !!env.RELAIS_CLE,
        eb_app_id_defini: !!env.EB_APP_ID,
        eb_cle_privee_definie: !!env.EB_CLE_PRIVEE,
        origines: env.ORIGINES || '(absentes)',
        variables_recues: Object.keys(env).map(k => JSON.stringify(k)),
      };
      // Auto-test de bout en bout : signer un vrai jeton et demander à Enable
      // Banking l'état de l'application. Ce que dit leur réponse — « does not
      // exist », « not active », signature refusée — est LE diagnostic ; une
      // clé privée illisible se nomme ici au lieu de planter sans explication.
      if (etat.eb_app_id_defini && etat.eb_cle_privee_definie) {
        try {
          const jwt = await signerJwt(env);
          const r = await fetch(API + '/application', {
            headers: { 'Authorization': `Bearer ${jwt}` },
          });
          const corps = await r.text();
          let d; try { d = JSON.parse(corps); } catch { d = {}; }
          etat.enable_banking = {
            statut: r.status,
            reponse: r.ok ? `application « ${d.name || '?'} » reconnue et joignable`
              : (d.message || corps.slice(0, 160)),
          };
        } catch (e) {
          etat.enable_banking = { statut: 'signature impossible',
            reponse: `la clé privée ne se lit pas (${e.message}) — recollez le PEM complet dans EB_CLE_PRIVEE` };
        }
      }
      return new Response(JSON.stringify(etat), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Le relais est à vous : sans la clé partagée, il ne répond rien.
    if (req.headers.get('X-Essor-Cle') !== env.RELAIS_CLE) {
      return new Response(JSON.stringify({ erreur: 'clé de relais absente ou invalide' }),
        { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (!CHEMINS.test(url.pathname)) {
      return new Response(JSON.stringify({ erreur: 'chemin non autorisé' }),
        { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const jwt = await signerJwt(env);
    const cible = API + url.pathname + url.search;
    const reponse = await fetch(cible, {
      method: req.method,
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: ['POST', 'DELETE'].includes(req.method) ? await req.text() : undefined,
    });
    const corps = await reponse.text();
    return new Response(corps, {
      status: reponse.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
