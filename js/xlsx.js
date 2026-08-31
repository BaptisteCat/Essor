/* Essor — lecteur XLSX minimal, sans dépendance (EX-24, EX-105).
   Un .xlsx est un ZIP de XML : on lit les chaînes partagées et les feuilles,
   et on rend chaque feuille sous forme de grille de chaînes, comme un CSV.
   Suffisant pour les rapports de courtiers (XTB, Trade Republic, Degiro…). */
'use strict';

const Xlsx = {

  isXlsx(name, bytes) {
    return /\.xlsx$/i.test(name) && Zip.isZip(bytes);
  },

  // ArrayBuffer → [{name, grid:[[cell,…],…]}] (une entrée par feuille).
  async read(buffer) {
    const entries = await Zip.read(buffer);
    const byName = new Map(entries.map(e => [e.name, e]));
    const text = (n) => { const e = byName.get(n); return e ? Zip.decodeText(e.bytes) : null; };

    // Chaînes partagées : les cellules t="s" pointent vers cet index.
    const shared = [];
    const ss = text('xl/sharedStrings.xml');
    if (ss) {
      // Chaque <si> peut contenir plusieurs <t> (texte enrichi) : on concatène.
      for (const si of ss.split('<si>').slice(1)) {
        const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => Xlsx._unescape(m[1]));
        shared.push(parts.join(''));
      }
    }

    // Noms et ordre des feuilles : workbook.xml + ses relations.
    const wb = text('xl/workbook.xml') || '';
    const rels = text('xl/_rels/workbook.xml.rels') || '';
    const relMap = new Map();
    for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      relMap.set(m[1], m[2].replace(/^\/?xl\//, '').replace(/^\//, ''));
    }
    const sheets = [];
    for (const m of wb.matchAll(/<sheet\b([^>]*)\/>/g)) {
      const attrs = m[1];
      const name = (attrs.match(/name="([^"]*)"/) || [])[1] || 'Feuille';
      const rid = (attrs.match(/r:id="([^"]*)"/) || [])[1];
      const target = relMap.get(rid);
      sheets.push({ name, path: target ? 'xl/' + target : null });
    }
    // Repli si le workbook est illisible : toutes les feuilles trouvées.
    if (!sheets.length) {
      for (const e of entries) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(e.name)) sheets.push({ name: e.name, path: e.name });
      }
    }

    const out = [];
    for (const s of sheets) {
      const xml = s.path ? text(s.path) : null;
      if (!xml) continue;
      out.push({ name: s.name, grid: Xlsx._sheetGrid(xml, shared) });
    }
    return out;
  },

  _sheetGrid(xml, shared) {
    const grid = [];
    for (const rowM of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cM of rowM[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cM[1], inner = cM[2] || '';
        const ref = (attrs.match(/r="([A-Z]+)\d+"/) || [])[1];
        const col = ref ? Xlsx._colIndex(ref) : row.length;
        const type = (attrs.match(/t="([^"]*)"/) || [])[1] || 'n';
        let val = '';
        if (type === 'inlineStr') {
          val = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => Xlsx._unescape(m[1])).join('');
        } else {
          const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
          if (v != null) val = type === 's' ? (shared[Number(v)] ?? '') : Xlsx._unescape(v);
        }
        while (row.length < col) row.push('');
        row[col] = val;
      }
      grid.push(row);
    }
    return grid;
  },

  _colIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  },

  _unescape(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, '&');
  },
};
