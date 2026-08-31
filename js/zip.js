/* Essor — lecteur ZIP minimal, sans dépendance (EX-23, EX-105).
   Gère les entrées "stored" et "deflate" via DecompressionStream natif. */
'use strict';

const Zip = {

  isZip(bytes) {
    return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
  },

  // ArrayBuffer → [{name, bytes:Uint8Array}] (répertoires exclus).
  async read(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    // Chercher l'End Of Central Directory (signature 0x06054b50) depuis la fin.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Archive ZIP illisible : répertoire central introuvable.");
    const count = view.getUint16(eocd + 10, true);
    let off = view.getUint32(eocd + 16, true);
    const entries = [];
    for (let n = 0; n < count; n++) {
      if (view.getUint32(off, true) !== 0x02014b50) break;
      const method = view.getUint16(off + 10, true);
      const compSize = view.getUint32(off + 20, true);
      const nameLen = view.getUint16(off + 28, true);
      const extraLen = view.getUint16(off + 30, true);
      const commentLen = view.getUint16(off + 32, true);
      const localOff = view.getUint32(off + 42, true);
      const flags = view.getUint16(off + 8, true);
      const rawName = bytes.subarray(off + 46, off + 46 + nameLen);
      // Bit 11 = UTF-8 ; sinon CP437, on tente UTF-8 quand même (suffisant pour nos usages).
      const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'utf-8').decode(rawName);
      off += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;                    // répertoire
      if (/(^|\/)__MACOSX\//.test(name) || /(^|\/)\./.test(name)) continue; // fichiers cachés macOS
      // En-tête local : relire les longueurs locales (peuvent différer du central).
      const lNameLen = view.getUint16(localOff + 26, true);
      const lExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = bytes.subarray(dataStart, dataStart + compSize);
      entries.push({ name, method, comp });
    }
    const out = [];
    for (const e of entries) {
      let data;
      if (e.method === 0) data = e.comp.slice();
      else if (e.method === 8) data = await Zip._inflate(e.comp);
      else throw new Error(`«${e.name}» : compression ZIP non gérée (méthode ${e.method}).`);
      out.push({ name: e.name, bytes: data });
    }
    return out;
  },

  async _inflate(comp) {
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([comp]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  },

  // Décode un fichier texte en devinant l'encodage (UTF-8 sinon Windows-1252,
  // fréquent dans les exports bancaires français). EX-24 : formats natifs.
  decodeText(bytes) {
    // BOM UTF-8
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  },
};
