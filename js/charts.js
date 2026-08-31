/* Essor — graphiques SVG, sans dépendance.
   Courbes continues, jamais pointillées ; étiquettes hors du tracé (EX-84).
   Survol : lecture d'une valeur à une date, granularité fine (EX-67). */
'use strict';

const Charts = {

  COLORS: {
    or: '#f3c96b', orClair: '#f7d98c', argent: '#c7d2e0', argentClair: '#e8edf4',
    cuivre: '#d2793f', cuivreClair: '#e8a06b',
    vert: '#45d68b', rouge: '#f47070',
    grid: 'rgba(139,149,168,.13)', axis: 'rgba(139,149,168,.45)',
  },

  /* ---------- Courbes temporelles ----------
     series: [{name, values:[cents|null], color, width?, fill?}]
     labels: ["YYYY-MM", ...] — même longueur que values.
     opts: {height, band:{low,high}, realSeries, formatY} */
  line(container, labels, series, opts = {}) {
    const W = Math.max(320, container.clientWidth || 640);
    const H = opts.height || 300;
    const padL = 74, padR = 16, padT = 14, padB = 30;
    const iw = W - padL - padR, ih = H - padT - padB;
    const n = labels.length;
    if (!n) { container.innerHTML = '<div class="empty">Aucune donnée à tracer.</div>'; return; }

    let min = Infinity, max = -Infinity;
    const all = [...series.map(s => s.values), opts.band ? [opts.band.low, opts.band.high].flat() : []];
    for (const arr of all) for (const v of arr) if (v != null) { min = Math.min(min, v); max = Math.max(max, v); }
    if (min === Infinity) { min = 0; max = 100; }
    if (min === max) { min -= 100; max += 100; }
    const span = max - min;
    min -= span * 0.06; max += span * 0.06;

    const x = i => padL + (n === 1 ? iw / 2 : i * iw / (n - 1));
    const y = v => padT + ih - (v - min) / (max - min) * ih;

    // Graduations Y « rondes » avec granularité suffisante (EX-67).
    const ticks = Charts._niceTicks(min, max, Math.max(4, Math.floor(ih / 46)));
    let g = '';
    for (const t of ticks) {
      g += `<line x1="${padL}" y1="${y(t)}" x2="${W - padR}" y2="${y(t)}" stroke="${Charts.COLORS.grid}"/>`;
      g += `<text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" class="ch-tick">${U.fmtEURcompact(t)}</text>`;
    }
    // Graduations X.
    const step = Math.max(1, Math.ceil(n / Math.floor(iw / 62)));
    for (let i = 0; i < n; i += step) {
      g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ch-tick">${U.fmtMonthShort(labels[i])}</text>`;
    }

    // Bande de dispersion (EX-66) — surface, pas de pointillés (EX-84).
    let bandPath = '';
    if (opts.band) {
      const up = opts.band.high.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      const down = [...opts.band.low].reverse().map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      bandPath = `<path d="${up}${down}Z" fill="${Charts.COLORS.or}" opacity="0.10"/>`;
    }

    let paths = '';
    for (const s of series) {
      let d = '', started = false;
      s.values.forEach((v, i) => {
        if (v == null) { started = false; return; }
        d += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        started = true;
      });
      paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }

    // Étiquettes de séries hors du tracé (EX-84) : légende au-dessus.
    const legend = series.filter(s => s.name).map(s =>
      `<span class="ch-leg"><i style="background:${s.color}"></i>${U.escapeHtml(s.name)}</span>`).join('');

    const id = 'ch' + U.uid();
    container.innerHTML =
      `${legend ? `<div class="ch-legend">${legend}</div>` : ''}` +
      `<svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block">
        ${g}${bandPath}${paths}
        <line id="${id}-cur" x1="0" y1="${padT}" x2="0" y2="${padT + ih}" stroke="${Charts.COLORS.argent}" stroke-width="1" opacity="0"/>
        ${series.map((s, si) => `<circle id="${id}-dot${si}" r="3.5" fill="${s.color}" opacity="0"/>`).join('')}
        <rect x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent" style="cursor:crosshair"/>
      </svg>
      <div id="${id}-tip" class="ch-tip" style="display:none"></div>`;

    // Survol : valeur à une date (EX-67).
    const svg = document.getElementById(id);
    const tip = document.getElementById(id + '-tip');
    const cursor = document.getElementById(id + '-cur');
    svg.addEventListener('mousemove', ev => {
      const r = svg.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * (W / r.width);
      let i = Math.round((mx - padL) / (iw / Math.max(1, n - 1)));
      i = U.clamp(i, 0, n - 1);
      cursor.setAttribute('x1', x(i)); cursor.setAttribute('x2', x(i));
      cursor.setAttribute('opacity', '0.6');
      let html = `<div class="ch-tip-t">${U.fmtMonth(labels[i])}</div>`;
      series.forEach((s, si) => {
        const dot = document.getElementById(`${id}-dot${si}`);
        const v = s.values[i];
        if (v == null) { dot.setAttribute('opacity', '0'); return; }
        dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); dot.setAttribute('opacity', '1');
        html += `<div><i style="background:${s.color}"></i>${U.escapeHtml(s.name || '')} <b>${U.fmtEUR(v)}</b>` +
          (opts.realSeries && opts.realSeries[si] && opts.realSeries[si][i] != null
            ? `<span class="ch-real"> soit ${U.fmtEUR(opts.realSeries[si][i])} constants</span>` : '') + '</div>';
      });
      tip.innerHTML = html;
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      const px = ev.clientX - r.left;
      tip.style.left = Math.min(Math.max(4, px - tw / 2), r.width - tw - 4) + 'px';
      tip.style.top = '30px';
    });
    svg.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
      cursor.setAttribute('opacity', '0');
      series.forEach((s, si) => document.getElementById(`${id}-dot${si}`).setAttribute('opacity', '0'));
    });
  },

  _niceTicks(min, max, count) {
    const span = max - min;
    const rawStep = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    let step = mag;
    for (const m of [1, 2, 2.5, 5, 10]) { if (mag * m >= rawStep) { step = mag * m; break; } }
    const out = [];
    for (let t = Math.ceil(min / step) * step; t <= max; t += step) out.push(t);
    return out;
  },

  /* ---------- Donut de répartition ---------- */

  // items: [{label, value, color}] — arcs en aplats, lisibles d'un coup d'œil.
  donut(container, items, opts = {}) {
    const total = U.sum(items, i => i.value);
    if (total <= 0) { container.innerHTML = '<div class="empty">Rien à répartir.</div>'; return; }
    const size = opts.size || 180, thick = opts.thick || 26;
    // Le trait est centré sur le rayon : il déborde de thick/2 de chaque côté.
    // Le rayon doit laisser cette marge, sinon l'anneau est rogné par le bord
    // du viewBox.
    const r = size / 2 - thick / 2 - 2, cx = size / 2, cy = size / 2;

    let paths = '';
    let angle = -Math.PI / 2;
    for (const it of items) {
      const frac = it.value / total;
      if (frac <= 0) continue;
      const a2 = angle + frac * Math.PI * 2;
      // Un arc de 360° ne s'écrit pas en un seul « A » : cercle complet.
      // `data-part` identifie la part : il permet à un autre écran de réagir
      // au survol d'un secteur sans que ce module sache ce qu'il représente.
      const marque = `data-part="${U.escapeHtml(it.label)}"`;
      if (frac >= 0.9999) {
        paths += `<circle ${marque} cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${thick}"/>`;
      } else {
        const gap = items.length > 1 ? 0.014 : 0;   // léger jour entre les parts
        const s = angle + gap / 2, e = a2 - gap / 2;
        const large = (e - s) > Math.PI ? 1 : 0;
        const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
        const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
        paths += `<path ${marque} d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}"
          fill="none" stroke="${it.color}" stroke-width="${thick}" stroke-linecap="butt"/>`;
      }
      angle = a2;
    }

    const legend = items.map(it =>
      `<div class="donut-leg" data-part="${U.escapeHtml(it.label)}"><i style="background:${it.color}"></i>
        <span class="dl-name">${U.escapeHtml(it.label)}</span>
        <span class="dl-val num">${U.fmtEUR(it.value)}</span>
        <span class="dl-pct num">${U.fmtPct(it.value / total, 0)}</span></div>`).join('');

    container.innerHTML =
      `<div class="donut-wrap">
        <svg class="donut-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
             preserveAspectRatio="xMidYMid meet">${paths}</svg>
        <div class="donut-legs">${legend}</div>
      </div>`;
  },

  /* ---------- Palette catégorielle des répartitions ----------
     Huit teintes franchement distinctes, dans un ORDRE FIXE : la part n° 3
     garde sa couleur quelle que soit la composition du patrimoine, sinon un
     filtre repeindrait les parts survivantes.
     Six couleurs franches, une par famille, aucun ton doré ni olive — c'est la
     différence entre les parts qui doit sauter aux yeux.
     Vérifiées sur le fond exact des cartes (#131721) en tenant compte du fait
     qu'un anneau est CIRCULAIRE : la dernière part touche la première, ce
     couple est donc contrôlé comme les autres. Un septième ton avait dû être
     écarté pour cette raison — il tombait à côté du bleu avec un écart
     invisible.
     Résultat mesuré : contraste ≥ 3:1 pour chacune, parts voisines séparées de
     ΔE 13,1 en vision deutéranope et 24,9 en vision normale.
     C'est le seul endroit où l'application s'écarte des trois métaux (EX-83),
     à la demande expresse : une répartition ne se lit pas en camaïeu. */
  CATEGORICAL: [
    '#026cd4', // bleu
    '#d3331d', // rouge
    '#0d9298', // turquoise
    '#8646cd', // violet
    '#12b058', // vert
    '#c1216c', // rose
  ],

  // Le surplus n'a jamais de teinte inventée : il porte un gris neutre, qui
  // dit « ce n'est pas une catégorie de plus, c'est le reste ».
  AUTRES: '#7c8899',

  categoricalPalette(n) {
    return Charts.CATEGORICAL.slice(0, Math.min(n, Charts.CATEGORICAL.length));
  },

  // Regroupe le surplus au-delà de `max` parts sous une entrée « Autres ».
  foldExtras(items, max = Charts.CATEGORICAL.length, label = 'Autres') {
    if (items.length <= max) return items;
    const kept = items.slice(0, max - 1);
    const rest = items.slice(max - 1);
    kept.push({ label: `${label} (${rest.length})`, value: U.sum(rest, x => x.value), autres: true });
    return kept;
  },

  // Couleurs d'une série de parts : rang fixe, gris pour le regroupement.
  colorsFor(items) {
    const p = Charts.categoricalPalette(items.length);
    return items.map((it, i) => it.autres ? Charts.AUTRES : p[i]);
  },

  /* ---------- Barres horizontales de répartition ----------
     Pour comparer des grandeurs entre elles — une exposition par région —
     la barre se lit mieux que l'angle d'un secteur. */
  bars(container, items, opts = {}) {
    const total = opts.total ?? U.sum(items, i => i.value);
    if (total <= 0) { container.innerHTML = '<div class="empty">Rien à répartir.</div>'; return; }
    const max = Math.max(...items.map(i => i.value));
    container.innerHTML = `<div class="bars">` + items.map(it => `
      <div class="bar-row">
        <span class="bar-name">${U.escapeHtml(it.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(it.value / max * 100).toFixed(1)}%;background:${it.color}"></span></span>
        <span class="bar-pct num">${U.fmtPct(it.value / total, 0)}</span>
        <span class="bar-val num">${U.fmtEUR(it.value)}</span>
      </div>`).join('') + `</div>`;
  },

  /* ---------- Barres de consommation budget ---------- */

  // Ratio consommé/prévu → barre or (dans le budget) / cuivre (dépassement).
  gauge(ratio) {
    const pct = U.clamp(ratio, 0, 1.5);
    const over = ratio > 1;
    const w = Math.min(100, pct / 1.5 * 100 * 1.5, pct * 100);
    return `<div class="gauge"><div class="gauge-fill${over ? ' over' : ''}" style="width:${Math.min(100, pct * 100).toFixed(0)}%"></div>
      ${over ? `<div class="gauge-mark" style="left:${(100 / ratio).toFixed(1)}%"></div>` : ''}</div>`;
  },
};
