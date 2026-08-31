/* Essor — import de relevés (EX-23…27, EX-109, EX-110).
   Une archive peut contenir plusieurs comptes et plusieurs mois : chaque
   fichier est analysé, rattaché à un compte d'après ses métadonnées — jamais
   d'après les libellés d'opérations (EX-25) —, dédoublonné (EX-27), et chaque
   opération garde son mois réel (EX-110) et toutes ses colonnes d'origine
   (EX-109). Les indices de rattachement sont mémorisés (EX-26). */
'use strict';

const Importer = {

  /* ---------- Analyse de fichiers ---------- */

  // files: [{name, bytes:Uint8Array}] → session d'import à prévisualiser.
  async analyze(inputFiles) {
    // 1. Déballer les archives, récursivement : un « relevé de tous comptes »
    //    contient les CSV des banques ET l'archive du courtier, elle-même
    //    contenant des classeurs XLSX (EX-23).
    const flat = [];
    await Importer._unpack(inputFiles.map(f => ({ name: f.name, path: f.name, bytes: f.bytes })), flat, 0);
    // 2. Analyser chaque fichier. Un classeur peut donner plusieurs relevés
    //    (XTB : un onglet espèces par compte, EUR et PEA dans le même envoi).
    const session = { files: [], errors: [] };
    for (const f of flat) {
      try {
        const parsedList = Importer.parseMulti(f);
        for (const parsed of parsedList) {
          const clues = Importer.extractClues(f, parsed);
          const guess = Importer.matchAccount(clues);
          session.files.push({
            name: parsed.subName || f.name, path: parsed.subName ? `${f.path} › ${parsed.subName}` : f.path,
            parsed, clues,
            accountId: guess.accountId, matchedBy: guess.matchedBy,
            resolution: guess.accountId ? 'auto' : 'ask',
          });
        }
        if (!parsedList.length) {
          session.errors.push(`« ${f.path} » : aucun mouvement reconnu — format non pris en charge ou fichier vide.`);
        }
      } catch (e) {
        session.errors.push(`« ${f.path} » : ${e.message}`);
      }
    }
    Importer.computeDedup(session);
    return session;
  },

  // Déballe récursivement ZIP dans ZIP (profondeur bornée), en gardant le
  // chemin complet pour l'affichage et les indices de rattachement.
  async _unpack(items, out, depth) {
    for (const f of items) {
      const buf = f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength);
      // Un .xlsx est aussi un ZIP : on le déballe comme classeur, pas comme
      // archive de relevés. Le décodage étant asynchrone, on le fait ici et
      // on attache les feuilles au fichier.
      if (Xlsx.isXlsx(f.name, f.bytes)) {
        f._sheets = await Xlsx.read(buf);
        out.push(f);
      } else if (Zip.isZip(f.bytes) && depth < 4) {
        const entries = await Zip.read(buf);
        await Importer._unpack(
          entries.map(e => ({ name: e.name.split('/').pop(), path: `${f.path}/${e.name}`, bytes: e.bytes })),
          out, depth + 1);
      } else {
        out.push(f);
      }
    }
  },

  // Un fichier → une ou plusieurs vues « relevé ».
  parseMulti(f) {
    if (Xlsx.isXlsx(f.name, f.bytes)) return Importer.parseXlsx(f);
    const parsed = Importer.parseFile(f);
    return parsed && parsed.rows.length ? [parsed] : [];
  },

  /* ---------- Parseurs ---------- */

  // → {kind:'bank'|'broker', preamble:[lignes], header:[colonnes], rows:[{date, amount, label, raw, qty?, symbol?, priceCents?}]}
  parseFile(f) {
    const name = f.name.toLowerCase();
    if (name.endsWith('.json')) return Importer.parseJson(Zip.decodeText(f.bytes));
    if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv'))
      return Importer.parseCsv(Zip.decodeText(f.bytes));
    if (name.endsWith('.ofx') || name.endsWith('.qfx')) return Importer.parseOfx(Zip.decodeText(f.bytes));
    if (name.endsWith('.qif')) return Importer.parseQif(Zip.decodeText(f.bytes));
    // Fichier sans extension : un QIF se reconnaît à sa première ligne.
    const text = Zip.decodeText(f.bytes);
    if (/^\s*!(type|account|option|clear)/i.test(text)) return Importer.parseQif(text);
    if (/[;,\t]/.test(text)) return Importer.parseCsv(text);   // tentative CSV par défaut
    throw new Error('format non reconnu (CSV, TSV, QIF, OFX, JSON et ZIP sont acceptés).');
  },

  /* ---------- QIF (Quicken Interchange Format) ---------- */

  // Le QIF est un format de 1990 sans en-tête de colonnes : une lettre par
  // champ, un « ^ » entre deux opérations. Deux pièges le rendent traître, et
  // sont traités ici plutôt que laissés à l'utilisateur :
  //   — la date n'a pas d'ordre défini (15/08 ou 08/15) : on le DÉDUIT du
  //     fichier entier avant de convertir quoi que ce soit ;
  //   — le nom du compte, quand il est déclaré (bloc « !Account »), est une
  //     métadonnée : c'est un indice de rattachement légitime (EX-25).
  parseQif(text) {
    const lignes = text.split(/\r\n|\r|\n/);
    const brut = [];          // opérations, champs encore bruts
    let courant = null;
    let type = 'Bank';        // !Type:Bank | CCard | Cash | Invst | Oth A/L
    let compte = null;        // nom déclaré par le bloc !Account
    let dansAccount = false;

    const nouvelle = () => ({ champs: {}, splits: [] });
    for (let ligne of lignes) {
      ligne = ligne.replace(/\s+$/, '');
      if (!ligne) continue;
      if (ligne[0] === '!') {
        const t = ligne.slice(1).trim();
        dansAccount = /^account/i.test(t);
        const m = t.match(/^type:\s*(.+)$/i);
        if (m) type = m[1].trim();
        courant = null;
        continue;
      }
      if (ligne[0] === '^') {
        if (dansAccount) {
          if (courant && courant.champs.N) compte = courant.champs.N;
        } else if (courant && Object.keys(courant.champs).length) {
          brut.push(courant);
        }
        courant = null;
        continue;
      }
      if (!courant) courant = nouvelle();
      const code = ligne[0], valeur = ligne.slice(1).trim();
      if (code === 'S' || code === 'E' || code === '$') {
        // Ventilation : conservée telle quelle, jamais additionnée au total.
        if (code === 'S') courant.splits.push({ categorie: valeur });
        else if (courant.splits.length) {
          const d = courant.splits[courant.splits.length - 1];
          if (code === 'E') d.memo = valeur; else d.montant = valeur;
        }
      } else if (courant.champs[code] === undefined) {
        courant.champs[code] = valeur;
      } else {
        courant.champs[code] += ' ' + valeur;    // champ répété (mémo sur deux lignes)
      }
    }

    const ordre = Importer._qifOrdreDates(brut.map(o => o.champs.D));
    const invest = /invst/i.test(type);
    const rows = [];
    for (const o of brut) {
      const c = o.champs;
      const date = Importer._qifDate(c.D, ordre);
      const montant = U.parseAmount(c.T != null ? c.T : c.U);
      if (!date) continue;

      if (invest && c.Y) {
        // Ligne de portefeuille : l'action dit le sens, la quantité et le
        // cours nourrissent les mouvements de titres (EX-11, EX-12).
        const action = (c.N || '').trim();
        const qty = c.Q ? Number(String(c.Q).replace(/\s/g, '').replace(',', '.')) : null;
        const prix = c.I != null ? U.parseAmount(c.I) : null;
        const achat = /^(buy|cvrshrt|reinvdiv|reinvint|reinvlg|reinvsh|shrsin)/i.test(action);
        const vente = /^(sell|shrsout)/i.test(action);
        let m = montant;
        if (m == null && qty && prix) m = Math.round(qty * prix);
        if (m == null) continue;
        m = achat ? -Math.abs(m) : vente ? Math.abs(m) : m;
        const r = {
          date, amount: m,
          label: [action, c.Y, c.M].filter(Boolean).join(' — ') || 'Mouvement de titres',
          raw: { ...c }, opType: action || undefined,
        };
        if (qty && (achat || vente)) { r.qty = Math.abs(qty); r.symbol = String(c.Y).trim(); r.priceCents = prix || null; }
        rows.push(r);
        continue;
      }

      if (montant == null) continue;
      // Libellé : bénéficiaire (P), à défaut mémo (M), puis catégorie (L).
      const label = [c.P, c.M].filter(Boolean).join(' — ') || c.L || 'Opération';
      rows.push({
        date, amount: montant, label,
        raw: { ...c, splits: o.splits.length ? o.splits : undefined },
        opType: c.L || undefined,     // la catégorie d'origine reste un indice (EX-42)
      });
    }

    const preamble = [`QIF !Type:${type}`];
    if (compte) preamble.push(`QIF-compte:${compte}`, `compte ${compte}`);
    return { kind: 'bank', preamble, header: [], rows, qifOrdre: ordre };
  },

  // Ordre des composantes de date, déduit du fichier entier : un seul jour
  // supérieur à 12 tranche pour tout le relevé. À défaut d'indice, l'usage
  // français (jour d'abord) l'emporte — et il est annoncé dans le préambule.
  _qifOrdreDates(dates) {
    let premierGrand = false, secondGrand = false;
    for (const d of dates) {
      if (!d) continue;
      const m = String(d).replace(/'/g, '/').match(/^\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})/);
      if (!m) continue;
      if (Number(m[1]) > 12) premierGrand = true;
      if (Number(m[2]) > 12) secondGrand = true;
    }
    if (premierGrand && !secondGrand) return 'JMA';
    if (secondGrand && !premierGrand) return 'MJA';
    return 'JMA';
  },

  _qifDate(s, ordre) {
    if (!s) return null;
    s = String(s).trim().replace(/'/g, '/').replace(/\s/g, '');
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
    if (!m) return null;
    let j = Number(ordre === 'MJA' ? m[2] : m[1]);
    let mo = Number(ordre === 'MJA' ? m[1] : m[2]);
    if (mo > 12 && j <= 12) [j, mo] = [mo, j];      // l'ordre déduit était faux pour cette ligne
    if (mo < 1 || mo > 12 || j < 1 || j > 31) return null;
    let an = Number(m[3]);
    if (m[3].length <= 2) an = an < 70 ? 2000 + an : 1900 + an;
    return `${an}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}`;
  },

  /* ---------- Classeurs XLSX (rapports de courtiers) ---------- */

  // Un classeur XTB contient « Cash Operations » (mouvements espèces),
  // « Closed Positions » et « Open Positions ». Chaque classeur correspond à
  // UN compte, identifié par « Account number » en tête de feuille — c'est
  // une métadonnée, jamais un libellé d'opération (EX-25).
  parseXlsx(f) {
    const sheets = f._sheets;
    if (!sheets) throw new Error('classeur illisible (feuilles introuvables).');
    const out = [];
    // Métadonnées d'en-tête : numéro de compte, devise, et surtout « Date to »
    // qui date l'instantané des positions.
    let acctNum = null, currency = null, asOf = null;
    for (const s of sheets) {
      for (const row of s.grid.slice(0, 8)) {
        for (let i = 0; i < row.length - 1; i++) {
          if (/account number/i.test(row[i]) && row[i + 1]) acctNum = String(row[i + 1]).trim();
          if (/currency/i.test(row[i]) && row[i + 1]) currency = String(row[i + 1]).trim();
          if (/date to/i.test(row[i]) && row[i + 1]) asOf = Importer._xlsxDate(row[i + 1]) || asOf;
        }
      }
    }
    // À défaut, la date de fin figure dans le nom du fichier (…_2026-08-06).
    if (!asOf) {
      const m = f.name.match(/(\d{4}-\d{2}-\d{2})(?!.*\d{4}-\d{2}-\d{2})/);
      if (m) asOf = m[1];
    }
    // Le nom de fichier XTB porte l'enveloppe ET le sous-compte réel
    // (EUR_54722049…, PEA_54769667…) : c'est lui qui distingue deux classeurs
    // du même accès, dont l'« Account number » interne est identique.
    const fromName = f.name.match(/^([A-Z]{2,4})[_-](\d{5,})/i);
    const preamble = [];
    if (fromName) preamble.push(`compte ${fromName[2]} ${fromName[1].toUpperCase()}`);
    else if (acctNum) preamble.push(`Account number ${acctNum}`);
    if (currency) preamble.push(`Currency ${currency}`);
    preamble.push(f.name.replace(/\.xlsx$/i, ''));

    const cash = Importer._xlsxSheet(sheets, /cash operation/i);
    const open = Importer._xlsxSheet(sheets, /open position/i);
    const closed = Importer._xlsxSheet(sheets, /closed position/i);

    const rows = [];
    if (cash) {
      const { header, body, idx } = cash;
      for (const r of body) {
        const date = Importer._xlsxDate(r[idx.time]);
        const amount = U.parseAmount(r[idx.amount]);
        if (!date || amount == null || amount === 0) continue;
        const type = (r[idx.type] || '').trim();
        const comment = (r[idx.comment] || '').trim();
        const raw = {};
        header.forEach((h, j) => { if (h && r[j]) raw[h] = r[j]; });
        rows.push({
          date, amount,
          label: [type, comment].filter(Boolean).join(' — ') || 'Mouvement',
          raw, opType: type,   // « PEA deposit », « Transfer out »… (EX-42, EX-109)
        });
      }
    }
    const positions = Importer._xlsxPositions(open, closed, asOf);
    if (rows.length || positions.some(p => p.open)) {
      out.push({ kind: 'broker', preamble, header: cash ? cash.header : [], rows, positions, asOf,
        subName: `${f.name.replace(/\.xlsx$/i, '')}${acctNum ? ` — compte ${acctNum}` : ''}` });
    }
    return out;
  },

  _xlsxSheet(sheets, nameRe) {
    const s = sheets.find(s => nameRe.test(s.name)) ||
      sheets.find(s => s.grid.some(r => r.some(c => nameRe.test(String(c)))));
    if (!s) return null;
    // Ligne d'en-tête : celle qui contient au moins deux colonnes connues.
    const KEYS = {
      time: /^(time|open time|close time)( \(utc\))?$/, amount: /^(amount|profit\/loss)$/,
      closeTime: /^close time( \(utc\))?$/, closePrice: /^close price$/,
      type: /^type$/, comment: /^comment$/, symbol: /^(symbol|ticker)$/,
      instrument: /^instrument/,   // « Instrument », « Instrument/Position ID »…
      volume: /^volume$/, price: /^open price$/, current: /^current price$/,
      value: /^value$/, category: /^category$/, id: /^(id|position id)$/,
    };
    for (let i = 0; i < Math.min(s.grid.length, 20); i++) {
      const idx = {};
      s.grid[i].forEach((c, j) => {
        const t = Importer.normHeader(c);
        if (!t) return;
        for (const [k, re] of Object.entries(KEYS)) if (idx[k] == null && re.test(t)) idx[k] = j;
      });
      if (Object.keys(idx).length >= 2 && (idx.time != null || idx.symbol != null)) {
        return { header: s.grid[i].map(c => String(c || '').trim()), body: s.grid.slice(i + 1), idx };
      }
    }
    return null;
  },

  // Taux/cours : en centièmes d'euro, décimales conservées.
  _rate(v) {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    if (Number.isNaN(n) || n === 0) return null;
    return Math.round(n * 100 * 10000) / 10000;
  },

  _xlsxDate(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 20000 && n < 80000) return U.excelDate(n);
    return U.parseDate(String(v));
  },

  // Positions détenues, d'après les lignes ouvertes (les fermées servent de
  // repère de cours historique).
  // La feuille « Open Positions » d'XTB liste, pour chaque support, une ligne
  // de synthèse PUIS chacun des lots qui la composent. Les additionner
  // compterait chaque titre deux fois : on ne retient que les lots (colonne
  // Type renseignée), et à défaut les lignes de synthèse.
  _xlsxPositions(open, closed, asOf) {
    const pos = [];
    if (open && open.idx.symbol != null && open.idx.volume != null) {
      const rows = open.body.filter(r => String(r[open.idx.symbol] || '').trim() &&
        Number(String(r[open.idx.volume] ?? '').replace(',', '.')));
      const hasType = open.idx.type != null;
      const lots = hasType ? rows.filter(r => String(r[open.idx.type] || '').trim()) : [];
      const kept = lots.length ? lots : rows.filter(r => !hasType || !String(r[open.idx.type] || '').trim());
      for (const r of kept) {
        const symbol = String(r[open.idx.symbol]).trim();
        const qty = Number(String(r[open.idx.volume]).replace(',', '.'));
        if (!qty || Number.isNaN(qty)) continue;
        // Prix d'achat du lot (prix de revient, EX-12) et cours du jour du
        // rapport — ce dernier évite de valoriser au dernier cours connu.
        const price = open.idx.price != null ? Importer._rate(r[open.idx.price]) : null;
        let current = open.idx.current != null ? Importer._rate(r[open.idx.current]) : null;
        if (!current && open.idx.value != null) {
          const val = U.parseAmount(r[open.idx.value]);
          if (val) current = val / qty;
        }
        // Nom lisible du fonds, quand la ligne de synthèse le porte
        // (« PEA Monde MSCI World » plutôt que « DCAM.FR »).
        let nom = null;
        if (open.idx.instrument != null) {
          const v = String(r[open.idx.instrument] || '').trim();
          if (v && !/^\d+$/.test(v)) nom = v;   // les lots portent un numéro de position
        }
        pos.push({ symbol, qty, date: asOf || U.today(), price: price || null,
          current: current || null, open: true, nom });
      }
      // Les noms figurent sur les lignes de synthèse, écartées quand des lots
      // existent : on les récupère quand même.
      if (open.idx.instrument != null) {
        for (const r of open.body) {
          const symbol = String(r[open.idx.symbol] || '').trim();
          const v = String(r[open.idx.instrument] || '').trim();
          if (symbol && v && !/^\d+$/.test(v)) {
            const cible = pos.find(p => p.symbol === symbol && p.open);
            if (cible && !cible.nom) cible.nom = v;
          }
        }
      }
    }
    // Positions fermées : témoins de cours passés, à leur date de clôture.
    if (closed && closed.idx.symbol != null) {
      for (const r of closed.body) {
        const symbol = String(r[closed.idx.symbol] || '').trim();
        if (!symbol) continue;
        const ci = closed.idx.closePrice != null ? closed.idx.closePrice : closed.idx.price;
        const ti = closed.idx.closeTime != null ? closed.idx.closeTime : closed.idx.time;
        const price = ci != null ? U.parseAmount(r[ci]) : null;
        const date = ti != null ? Importer._xlsxDate(r[ti]) : null;
        if (price && date) pos.push({ symbol, qty: 0, date, price, open: false });
      }
    }
    return pos;
  },

  // Découpe CSV robuste : guillemets, séparateur détecté ( ; , tab ).
  splitCsv(text) {
    const lines = [];
    let row = [], field = '', inQ = false;
    const firstLines = text.slice(0, 4000).split(/\r?\n/).slice(0, 12);
    const counts = { ';': 0, ',': 0, '\t': 0 };
    for (const l of firstLines) for (const c of l) if (counts[c] !== undefined) counts[c]++;
    const sep = counts[';'] >= counts[','] && counts[';'] >= counts['\t'] ? ';'
      : counts['\t'] > counts[','] ? '\t' : ',';
    for (let i = 0; i <= text.length; i++) {
      const c = text[i];
      if (c === undefined) { row.push(field); lines.push(row); break; }
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); lines.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    return lines.filter(r => r.length > 1 || (r[0] && r[0].trim()));
  },

  // Colonnes reconnues, tous alias confondus (banques françaises, néobanques, courtiers).
  // Les en-têtes sont comparés après normalisation (minuscules, sans accents
  // ni apostrophes) : « Date de l'opération », « Date de l'operation » et
  // « DATE DE L OPERATION » sont le même intitulé.
  COLS: {
    // La date d'opération (ou comptable) fait foi. La date de VALEUR, elle,
    // est une date bancaire d'intérêts : elle décale les opérations d'un ou
    // deux jours, et fait basculer les fins de mois dans le mois suivant —
    // de quoi fausser durablement un solde reconstruit à une date donnée.
    // Elle n'est retenue qu'à défaut d'autre chose (EX-110).
    date: /^(date|date de l ?operation|date operation|date comptable|date de debut|date de fin|dateop|operation date|booking date|completed date|started date|date d ?execution)$/,
    dateValeur: /^(date de valeur|value date|date valeur)$/,
    label: /^(libelle|libelle simplifie|libelle operation|description|designation|nom|reference|title|payee|communication|motif|commentaire)$/,
    amount: /^(montant|amount|montant ?\(?eur\)?|valeur|amount ?\(?eur\)?)$/,
    debit: /^debit$/,
    credit: /^credit$/,
    type: /^(type|type de l ?operation|type de transaction|type d ?operation|categorie operation|nature|transaction type|produit)$/,
    qty: /^(quantite|qty|quantity|nombre|parts|shares|volume)$/,
    symbol: /^(isin|symbole|symbol|ticker|code isin|instrument)$/,
    unitPrice: /^(cours|prix unitaire|price|prix|cours d ?execution|price per share|open price)$/,
  },

  normHeader(s) {
    return String(s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  parseCsv(text) {
    const grid = Importer.splitCsv(text);
    // Trouver la ligne d'en-tête : celle qui contient au moins une colonne date + (montant | débit/crédit).
    let headerIdx = -1, map = null;
    for (let i = 0; i < Math.min(grid.length, 40); i++) {
      const m = Importer.mapHeader(grid[i]);
      const uneDate = m.date != null || m.dateValeur != null;
      if (uneDate && (m.amount != null || m.debit != null || m.credit != null)) {
        headerIdx = i; map = m; break;
      }
    }
    if (headerIdx < 0) throw new Error("aucune ligne d'en-tête reconnue (colonnes date / montant introuvables).");
    // Faute de date d'opération, on se rabat sur la date de valeur — en le disant.
    const dateParValeur = map.date == null && map.dateValeur != null;
    if (dateParValeur) map.date = map.dateValeur;
    const header = grid[headerIdx].map(h => h.trim());
    const preamble = grid.slice(0, headerIdx).map(r => r.join(' ').trim()).filter(Boolean);
    const rows = [];
    const soldes = [];
    let hasQty = map.qty != null && map.symbol != null;
    for (let i = headerIdx + 1; i < grid.length; i++) {
      const r = grid[i];
      const ligne = r.join(' ').trim();
      let date = U.parseDate(r[map.date]);
      // Un relevé se termine souvent par « Nouveau solde au 31/08/2026 ».
      // Cette ligne porte une date et un montant : importée comme une
      // opération, elle fausse le solde de sa propre valeur. Elle est écartée —
      // et mise de côté, car c'est le solde que la banque certifie elle-même (P2).
      if (Importer.EST_SOLDE.test(ligne)) {
        // La date est parfois dans le libellé plutôt que dans sa colonne.
        if (!date) {
          const m = ligne.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/);
          if (m) date = U.parseDate(m[1]);
        }
        const v = map.amount != null ? U.parseAmount(r[map.amount]) : Importer._dernierMontant(r);
        if (date && v != null) soldes.push({ date, balance: v, source: ligne.slice(0, 80) });
        continue;
      }
      if (Importer.EST_TOTAL.test(ligne)) continue;   // « Total des débits », etc.
      if (!date) continue;
      let amount = null;
      if (map.amount != null) amount = U.parseAmount(r[map.amount]);
      if (amount == null && (map.debit != null || map.credit != null)) {
        const d = map.debit != null ? U.parseAmount(r[map.debit]) : null;
        const c = map.credit != null ? U.parseAmount(r[map.credit]) : null;
        if (d != null && d !== 0) amount = -Math.abs(d);
        else if (c != null) amount = Math.abs(c);
      }
      if (amount == null) continue;
      // EX-109 : toutes les colonnes sont conservées, y compris le type de
      // virement et toute information de classification.
      const raw = {};
      header.forEach((h, j) => { if (h && r[j] !== undefined && r[j] !== '') raw[h] = r[j]; });
      // Banques FR : le tiers réel est souvent dans « Détail 1 », le champ
      // « Libellé/Commentaire » étant vide. Rien de ce qui sert au
      // classement ne doit être perdu (EX-109).
      let label = (map.label != null ? r[map.label] : '') || '';
      if (!label.trim()) {
        const detail = header.findIndex(h => /^d[ée]tail\s*1$/i.test(h));
        if (detail >= 0 && r[detail]) label = r[detail];
      }
      if (!label.trim()) label = Object.values(raw).find(v => /[a-zA-Z]{3}/.test(v)) || '';
      const row = { date, amount, label: label.trim(), raw };
      if (map.type != null && r[map.type]) row.opType = r[map.type].trim();
      if (hasQty) {
        const q = U.parseAmount(r[map.qty]);
        const sym = (r[map.symbol] || '').trim();
        if (q != null && q !== 0 && sym) {
          row.qty = q / 100; // parseAmount renvoie des centièmes → quantité décimale
          row.symbol = sym;
          if (map.unitPrice != null) row.priceCents = U.parseAmount(r[map.unitPrice]);
        }
      }
      rows.push(row);
    }
    // Le solde peut aussi figurer AVANT le tableau, dans le préambule.
    for (const l of preamble) {
      if (!Importer.EST_SOLDE.test(l)) continue;
      const d = l.match(/(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/);
      const v = l.match(/(-?[\d  .]{1,15},\d{2}|-?[\d,]{1,15}\.\d{2})\s*€?\s*$/);
      if (d && v) {
        const date = U.parseDate(d[1]), balance = U.parseAmount(v[1]);
        if (date && balance != null) soldes.push({ date, balance, source: l.slice(0, 80) });
      }
    }
    return { kind: hasQty ? 'broker' : 'bank', preamble, header, rows, soldes, dateParValeur };
  },

  // « Solde au … », « Nouveau solde », « Solde créditeur » : la banque y dit
  // elle-même où elle en est. C'est la meilleure certification possible.
  EST_SOLDE: /(^|[;,	 ])(nouveau\s+solde|ancien\s+solde|solde\s+(au|cr[ée]diteur|d[ée]biteur|initial|final|pr[ée]c[ée]dent|de\s+d[ée]part)|solde\s*:)/i,
  EST_TOTAL: /(^|[;,	 ])(total\s+des?\s+(d[ée]bits?|cr[ée]dits?|op[ée]rations?)|sous.?total|report\s+[àa]\s+nouveau)/i,

  // Dernière cellule d'une ligne qui se lise comme un montant — utile quand la
  // ligne de solde n'occupe pas les mêmes colonnes que les opérations.
  _dernierMontant(cells) {
    for (let j = cells.length - 1; j >= 0; j--) {
      const c = String(cells[j] || '').trim();
      if (!/\d/.test(c)) continue;
      if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(c)) continue;   // c'est une date
      const v = U.parseAmount(c);
      if (v != null) return v;
    }
    return null;
  },

  mapHeader(cells) {
    const m = {};
    cells.forEach((c, i) => {
      const t = Importer.normHeader(c);
      if (!t) return;
      for (const [k, re] of Object.entries(Importer.COLS)) {
        if (m[k] == null && re.test(t)) m[k] = i;
      }
    });
    return m;
  },

  parseJson(text) {
    let data = JSON.parse(text);
    if (!Array.isArray(data)) data = data.transactions || data.operations || data.items || [];
    const rows = [];
    for (const o of data) {
      const date = U.parseDate(o.date || o.bookingDate || o.executionDate || o.created_at);
      const amount = U.parseAmount(o.amount ?? o.montant ?? o.value);
      if (!date || amount == null) continue;
      rows.push({ date, amount, label: String(o.label || o.description || o.libelle || o.title || '').trim(), raw: o,
        opType: o.type || o.category || undefined });
    }
    return { kind: 'bank', preamble: [], header: [], rows };
  },

  parseOfx(text) {
    const rows = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    for (const b of blocks) {
      const g = (tag) => { const m = b.match(new RegExp(`<${tag}>([^<\r\n]+)`, 'i')); return m ? m[1].trim() : null; };
      const dt = g('DTPOSTED');
      const date = dt ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
      const amount = U.parseAmount(g('TRNAMT'));
      if (!date || amount == null) continue;
      rows.push({ date, amount, label: g('NAME') || g('MEMO') || '', raw: { memo: g('MEMO'), name: g('NAME'), type: g('TRNTYPE') }, opType: g('TRNTYPE') || undefined });
    }
    const acct = text.match(/<ACCTID>([^<\r\n]+)/i);
    return { kind: 'bank', preamble: acct ? [`ACCTID ${acct[1].trim()}`] : [], header: [], rows };
  },

  /* ---------- Rattachement au compte (EX-25, EX-26) ---------- */

  // Indices extraits UNIQUEMENT du nom de fichier, du préambule et de la
  // structure — jamais des libellés d'opérations (EX-25).
  extractClues(f, parsed) {
    const clues = [];
    const push = (kind, v) => { if (v) clues.push(`${kind}:${v}`); };
    // IBAN ou numéro de compte dans le préambule.
    const pre = parsed.preamble.join(' ');
    const iban = pre.match(/[A-Z]{2}\d{2}[ ]?(\d[ ]?){10,30}/);
    if (iban) push('iban', iban[0].replace(/\s/g, ''));
    const num = pre.match(/(?:compte|account|acctid)[^0-9]{0,20}([0-9Xx*]{6,})/i);
    if (num) push('num', num[1]);
    // Nom de compte déclaré par un bloc « !Account » de QIF : métadonnée, donc
    // indice recevable — et souvent le seul que porte un QIF (EX-25).
    const qc = parsed.preamble.find(l => l.startsWith('QIF-compte:'));
    if (qc) push('qif', qc.slice('QIF-compte:'.length).trim().toUpperCase());
    // Nom de fichier, débarrassé des seules vraies dates (année-mois séparés
    // par - _ ou .) et des noms de mois : un export mensuel garde le même
    // indice d'un mois sur l'autre. Les numéros de compte sont préservés —
    // c'est eux qui distinguent deux relevés du même établissement.
    const base = f.name.replace(/\.[a-z0-9]+$/i, '').toUpperCase();
    const MOIS = /\b(JANVIER|FEVRIER|F[ÉE]VRIER|MARS|AVRIL|MAI|JUIN|JUILLET|AOUT|AO[ÛU]T|SEPTEMBRE|OCTOBRE|NOVEMBRE|DECEMBRE|D[ÉE]CEMBRE|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g;
    push('file', base
      .replace(/\b(19|20)\d{2}[-_.](0[1-9]|1[0-2])([-_.]\d{2})?\b/g, ' ')  // 2026-08-06
      .replace(/\b(0[1-9]|[12]\d|3[01])[-_.](0[1-9]|1[0-2])[-_.](19|20)\d{2}\b/g, ' ')
      .replace(MOIS, ' ')
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim());
    // Signature de structure : jeu de colonnes (distingue les établissements).
    if (parsed.header.length) push('cols', U.hash(parsed.header.join('|').toLowerCase()));
    return clues;
  },

  // → {accountId|null, matchedBy}
  matchAccount(clues) {
    const mem = Store.state.importMemory;
    // Priorité aux indices forts (iban, num) puis fichier, puis structure.
    const order = ['iban:', 'num:', 'qif:', 'file:', 'cols:'];
    for (const prefix of order) {
      for (const c of clues) {
        if (c.startsWith(prefix) && mem[c] && Engine.account(mem[c])) {
          return { accountId: mem[c], matchedBy: c };
        }
      }
    }
    // Indices déclarés sur les comptes eux-mêmes (IBAN saisi à la création).
    for (const a of Store.state.accounts) {
      for (const fp of a.fingerprints || []) {
        if (clues.some(c => c.endsWith(fp) || c.includes(fp))) return { accountId: a.id, matchedBy: 'compte:' + fp };
      }
    }
    return { accountId: null, matchedBy: null };
  },

  // Mémorisation des indices (EX-26). Un indice partagé par deux relevés de
  // comptes différents — deux classeurs XTB ont les mêmes colonnes et le même
  // numéro d'accès — n'apprend rien et ne doit pas être retenu : il ferait
  // basculer un fichier sur le mauvais compte au prochain import.
  memorize(clues, accountId, ambiguous) {
    for (const c of clues) {
      if (ambiguous && ambiguous.has(c)) { delete Store.state.importMemory[c]; continue; }
      Store.state.importMemory[c] = accountId;
    }
  },

  // Indices qui, dans cette session, désignent plus d'un compte.
  _ambiguousClues(session, resolveFn) {
    const seen = new Map();
    for (const file of session.files) {
      const acc = resolveFn(file);
      if (!acc) continue;
      for (const c of file.clues) {
        if (!seen.has(c)) seen.set(c, new Set());
        seen.get(c).add(acc);
      }
    }
    const bad = new Set();
    for (const [c, accs] of seen) if (accs.size > 1) bad.add(c);
    return bad;
  },

  /* ---------- Dédoublonnage (EX-27) ---------- */

  txHash(accountId, row) {
    return U.hash(`${accountId}|${row.date}|${row.amount}|${U.normLabel(row.label)}`);
  },

  // Règle unique (EX-27) : pour une même empreinte — compte, date, montant,
  // libellé — le relevé fait autorité sur le NOMBRE d'occurrences. Si le
  // fichier en porte trois et que la base en a déjà deux, on en ajoute une.
  // S'il en porte deux et que la base en a deux, on n'ajoute rien.
  //
  // L'ancienne version comptait autrement, et de deux façons différentes selon
  // l'endroit : trois cafés identiques le même jour n'en laissaient qu'un, et
  // le ré-import du relevé complet écartait les trois. Le solde reconstruit
  // s'en trouvait durablement faux, sans que rien ne le signale.
  _retenir(session, resoudre) {
    const enBase = new Map();
    for (const t of Store.state.transactions) {
      const k = `${t.accountId}|${t.hash}`;
      enBase.set(k, (enBase.get(k) || 0) + 1);
    }
    const vus = new Map();   // occurrences déjà retenues dans CETTE session
    for (const file of session.files) {
      file.newRows = [];
      file.dupCount = 0;
      const acc = resoudre(file) || `?${file.path}`;
      for (const row of file.parsed.rows) {
        const h = Importer.txHash(acc, row);
        const k = `${acc}|${h}`;
        const dejaVus = vus.get(k) || 0;
        if (dejaVus < (enBase.get(k) || 0)) file.dupCount++;   // cette occurrence est déjà en base
        else file.newRows.push({ ...row, hash: h });
        vus.set(k, dejaVus + 1);
      }
    }
  },

  // Prévisualisation : avec les comptes devinés, à défaut un compte fictif
  // propre au fichier (les chiffres seront revus une fois le compte choisi).
  computeDedup(session) {
    Importer._retenir(session, (f) => f.accountId);
  },

  /* ---------- Application ---------- */

  // resolutions : {filePath → accountId} pour les fichiers non reconnus.
  // Chaque opération est affectée au compte du fichier et au mois de sa
  // propre date (EX-110). Retourne un bilan chiffré.
  apply(session, resolutions = {}) {
    const S = Store.state;
    const report = { added: 0, dup: 0, trades: 0, byFile: [], soldes: [] };
    const resolve = (f) => f.accountId || resolutions[f.path] || null;
    const ambiguous = Importer._ambiguousClues(session, resolve);
    // Le dédoublonnage se rejoue avec les comptes définitifs : tant qu'un
    // fichier n'était pas rattaché, ses empreintes ne pouvaient pas être
    // comparées à celles de la base.
    Importer._retenir(session, resolve);
    for (const file of session.files) {
      const accountId = file.accountId || resolutions[file.path];
      if (!accountId) { report.byFile.push({ path: file.path, skipped: true }); continue; }
      // Recalcul du hachage si le compte vient d'être résolu manuellement.
      let added = 0, trades = 0;
      // Le solde que le relevé porte lui-même : c'est la meilleure
      // certification possible, et elle ferme la question du solde juste.
      for (const sd of (file.parsed.soldes || [])) {
        report.soldes.push({ accountId, date: sd.date, balance: sd.balance, source: sd.source, fichier: file.path });
      }
      if (file.parsed.dateParValeur) report.dateParValeur = true;
      for (const row of file.newRows) {
        const h = row.hash;
        const t = {
          id: U.uid(), accountId, date: row.date, amount: row.amount,
          label: row.label, raw: row.raw || null, hash: h,
        };
        if (row.opType) t.opType = row.opType; // nature du mouvement conservée (EX-109, EX-42)
        S.transactions.push(t);
        added++;
        if (row.qty && row.symbol) {
          // Règlement de titres : l'argent change de forme, il ne sort pas du
          // compte — la performance constatée ne doit pas le voir comme un flux.
          t.settlement = true;
          // Ligne de courtier : mouvement de titres. Achat = débit espèces → quantité positive.
          S.trades.push({
            id: U.uid(), accountId, symbol: row.symbol, date: row.date,
            qtyDelta: row.amount < 0 ? Math.abs(row.qty) : -Math.abs(row.qty),
            priceCents: row.priceCents || null,
          });
          if (row.priceCents) Engine.setPrice(row.symbol, row.date, row.priceCents);
          trades++;
        }
      }
      // Positions d'un rapport de courtier : l'utilisateur déclare ce qu'il
      // possède, pas ce que ça vaut (EX-11). Les lignes ouvertes forment un
      // instantané — plusieurs lots d'un même support s'additionnent — daté du
      // rapport. Réimporter le même rapport écrase l'instantané au lieu de
      // l'empiler : aucune duplication (EX-27).
      if (file.parsed.positions && file.parsed.positions.length) {
        const open = file.parsed.positions.filter(p => p.open);
        const closed = file.parsed.positions.filter(p => !p.open);
        for (const p of closed) if (p.price) Engine.setPrice(p.symbol, p.date, p.price); // repère de cours
        if (open.length) {
          const asOf = file.parsed.asOf || open.map(p => p.date).sort().pop();
          const bySymbol = new Map();
          for (const p of open) {
            const cur = bySymbol.get(p.symbol) || { qty: 0, cost: 0, mktValue: 0, nom: null };
            cur.qty += p.qty;
            if (p.price) cur.cost += p.price * p.qty;
            if (p.current) cur.mktValue += p.current * p.qty;
            if (p.nom && !cur.nom) cur.nom = p.nom;
            bySymbol.set(p.symbol, cur);
          }
          const source = `xlsx:${accountId}:${asOf}`;
          S.positionSnapshots = S.positionSnapshots.filter(s => s.source !== source);
          for (const [symbol, agg] of bySymbol) {
            S.positionSnapshots.push({ id: U.uid(), accountId, symbol, date: asOf,
              qty: Math.round(agg.qty * 1e6) / 1e6, source });
            // Prix de revient moyen pondéré, déduit du rapport (EX-12).
            if (agg.cost && agg.qty) S.pru[symbol] = Math.round(agg.cost / agg.qty * 10000) / 10000;
            // Cours à la date du rapport : la valorisation ne dépend plus
            // d'une saisie manuelle (EX-11).
            if (agg.mktValue && agg.qty) Engine.setPrice(symbol, asOf, agg.mktValue / agg.qty);
            if (agg.nom) S.priceMeta[symbol] = { ...(S.priceMeta[symbol] || {}), name: agg.nom };
            trades++;
          }
        }
      }
      Importer.memorize(file.clues, accountId, ambiguous);
      report.added += added;
      report.trades += trades;
      report.dup += file.dupCount;
      report.byFile.push({ path: file.path, accountId, added, dup: file.dupCount });
    }
    if (report.added) {
      Rules.categorizeAll({ onlyUncategorized: true });
      Rules.detectTransfers();
      Engine.invalidate();
    }
    // Répartition géographique déduite de l'indice suivi par chaque fonds :
    // l'utilisateur n'a rien à saisir (P6). Signalée comme déduite (P7).
    if (report.trades) report.geo = Indices.applyAll();
    Store.markDirty();
    return report;
  },
};
