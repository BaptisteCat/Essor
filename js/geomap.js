/* Essor — planisphère de l'exposition géographique (EX-5).

   Vos ETF exposent à des RÉGIONS (« Zone euro », « Marchés émergents »), la
   carte parle en PAYS : ce module fait la jonction. Le poids d'une région est
   réparti entre ses pays au prorata de leur poids dans l'indice
   correspondant — un « Zone euro : 8 % » n'est pas 8 % pour chaque pays.

   Ce qui ne se place pas sur une carte (« Reste du monde ») n'est jamais
   dilué en douce : il est chiffré à part sous le planisphère (P7).

   L'intensité de la teinte suit la racine du poids : sans cela, les
   États-Unis à 48 % écraseraient tout et la carte n'aurait qu'une couleur. */
'use strict';

const GeoMap = {

  // Composition indicative des régions, en poids relatifs. Ce sont des faits
  // publics sur des indices, pas des règles liées à l'utilisateur (EX-35).
  REGIONS: {
    'Zone euro': { France: 30, Germany: 26, Netherlands: 13, Italy: 10, Spain: 9,
                   Belgium: 4, Ireland: 4, Finland: 2, Austria: 2 },
    'Reste zone euro': { Belgium: 30, Ireland: 25, Finland: 20, Austria: 15, Portugal: 10 },
    'Reste Europe': { Sweden: 25, Denmark: 20, Norway: 15, Italy: 15, Spain: 15, Poland: 10 },
    'Europe': { 'United Kingdom': 23, France: 17, Switzerland: 15, Germany: 14,
                Netherlands: 7, Sweden: 5, Italy: 4, Spain: 4, Denmark: 4, Belgium: 3, Norway: 2, Finland: 2 },
    'Marchés émergents': { China: 30, India: 19, Taiwan: 18, 'South Korea': 11,
                           Brazil: 5, 'South Africa': 3, Mexico: 3, Indonesia: 3, Thailand: 3, Malaysia: 3, Turkey: 2 },
    'Marchés émergents (hors Chine)': { India: 27, Taiwan: 26, 'South Korea': 16,
                                        Brazil: 7, 'South Africa': 5, Mexico: 5, Indonesia: 5, Thailand: 5, Malaysia: 4 },
    'Reste émergents': { Brazil: 22, 'South Africa': 16, Mexico: 16, Indonesia: 16,
                         Thailand: 12, Malaysia: 10, Turkey: 8 },
    'Reste Pacifique': { Singapore: 45, 'New Zealand': 30, 'Hong Kong': 25 },
    'Asie développée': { Japan: 60, Australia: 24, 'South Korea': 9, Singapore: 5, 'Hong Kong': 2 },
    'Amérique du Nord': { 'United States of America': 92, Canada: 8 },
  },

  // Noms de pays employés dans les répartitions → noms de la géométrie.
  PAYS: {
    'États-Unis': 'United States of America', 'Etats-Unis': 'United States of America',
    'Japon': 'Japan', 'Royaume-Uni': 'United Kingdom', 'Allemagne': 'Germany',
    'Suisse': 'Switzerland', 'Pays-Bas': 'Netherlands', 'Italie': 'Italy',
    'Espagne': 'Spain', 'Suède': 'Sweden', 'Danemark': 'Denmark', 'Norvège': 'Norway',
    'Belgique': 'Belgium', 'Irlande': 'Ireland', 'Autriche': 'Austria',
    'Finlande': 'Finland', 'Portugal': 'Portugal', 'Pologne': 'Poland', 'Grèce': 'Greece',
    'Australie': 'Australia', 'Nouvelle-Zélande': 'New Zealand', 'Canada': 'Canada',
    'Chine': 'China', 'Inde': 'India', 'Taïwan': 'Taiwan', 'Taiwan': 'Taiwan',
    'Corée du Sud': 'South Korea', 'Brésil': 'Brazil', 'Mexique': 'Mexico',
    'Afrique du Sud': 'South Africa', 'Indonésie': 'Indonesia', 'Thaïlande': 'Thailand',
    'Malaisie': 'Malaysia', 'Turquie': 'Turkey', 'Israël': 'Israel',
    'Singapour': 'Singapore', 'Hong Kong': 'Hong Kong', 'France': 'France',
  },

  // Régions volontairement non cartographiables : elles ne désignent aucun
  // territoire, les placer quelque part serait inventer.
  SANS_LIEU: /^(reste du monde|autres?|divers|monde|global)$/i,

  /* ---------- Cartogramme ----------
     Une carte à l'échelle consacre l'essentiel de sa surface à des pays où
     il n'y a pas un euro : la Russie occupe un dixième de l'image pour zéro
     exposition, et la France vaut trois pixels pour 6 %. On renonce donc à
     l'exactitude géographique au profit de ce qu'on cherche vraiment à lire.

     Chaque pays investi devient un DISQUE dont l'AIRE est proportionnelle à
     son poids — l'aire est le bon encodage pour une grandeur qu'on compare,
     et elle rend les pays investis immédiatement visibles puisqu'eux seuls
     ont un disque. La TEINTE reste celle du continent sur le camembert.
     Chaque information a ainsi son propre canal : aire = combien, couleur =
     où. Les disques partent de la position géographique du pays puis
     s'écartent juste assez pour ne plus se recouvrir : l'Europe s'étale au
     lieu de s'agglutiner, et la carte reste reconnaissable. */

  // Rayon : proportionnel à la racine du poids, pour que l'AIRE soit
  // proportionnelle au poids et non le rayon — sinon les écarts sont
  // visuellement exagérés au carré.
  rayon(part, partMax, rMax) {
    if (!(part > 0) || !(partMax > 0)) return 0;
    return Math.max(9, rMax * Math.sqrt(part / partMax));
  },

  // Écarte les disques qui se recouvrent, en les retenant près de leur place
  // d'origine. Sans cette relaxation, les pays européens se superposent en
  // un seul amas illisible.
  disposer(cercles, W, H, iterations = 260) {
    for (let k = 0; k < iterations; k++) {
      // Rappel vers la position géographique : la carte doit rester lisible.
      for (const c of cercles) {
        c.x += (c.x0 - c.x) * 0.012;
        c.y += (c.y0 - c.y) * 0.012;
      }
      for (let i = 0; i < cercles.length; i++) {
        for (let j = i + 1; j < cercles.length; j++) {
          const a = cercles[i], b = cercles[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          const mini = a.r + b.r + 3;
          if (d >= mini) continue;
          if (d < 0.01) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); d = Math.hypot(dx, dy); }
          const pousse = (mini - d) / 2;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * pousse; a.y -= uy * pousse;
          b.x += ux * pousse; b.y += uy * pousse;
        }
      }
      // Rester dans le cadre.
      for (const c of cercles) {
        c.x = Math.min(W - c.r - 2, Math.max(c.r + 2, c.x));
        c.y = Math.min(H - c.r - 2, Math.max(c.r + 2, c.y));
      }
    }
    return cercles;
  },

  // Répartit l'exposition par région en exposition par pays.
  // → {parPays: Map(nom → centimes), horsCarte: [{label, value}], place, total}
  parPays(expo) {
    const parPays = new Map();
    const horsCarte = [];
    let place = 0, total = 0;
    const add = (pays, v) => parPays.set(pays, (parPays.get(pays) || 0) + v);

    for (const [region, valeur] of expo) {
      total += valeur;
      if (valeur <= 0) continue;
      if (GeoMap.SANS_LIEU.test(region)) { horsCarte.push({ label: region, value: valeur }); continue; }
      const direct = GeoMap.PAYS[region];
      if (direct && WorldMap.PATHS[direct]) { add(direct, valeur); place += valeur; continue; }
      const compo = GeoMap.REGIONS[region];
      if (compo) {
        // Les parts sont réparties au centime près, sans perte (P9).
        const noms = Object.keys(compo);
        const parts = U.splitCents(valeur, noms.map(n => compo[n]));
        noms.forEach((n, i) => { if (WorldMap.PATHS[n]) add(n, parts[i]); });
        place += valeur;
        continue;
      }
      horsCarte.push({ label: region, value: valeur });
    }
    return { parPays, horsCarte, place, total };
  },

  // Dessine le planisphère. `expo` : Map(région → centimes).
  render(container, expo, opts = {}) {
    const { parPays, horsCarte, place, total } = GeoMap.parPays(expo);
    if (!total) { container.innerHTML = '<div class="empty">Aucune exposition à cartographier.</div>'; return; }

    const max = Math.max(0, ...parPays.values());
    const partMax = total > 0 ? max / total : 0;
    // Couleurs des continents, telles que le camembert les montre.
    const couleurs = opts.couleursContinent || new Map();
    const couleurDe = (paysAnglais) => {
      const cont = Engine.continentOf(GeoMap.nomFr(paysAnglais));
      return couleurs.get(cont) || Charts.AUTRES;
    };

    const W = WorldMap.W, H = WorldMap.H;
    const id = 'map' + U.uid();

    // Fond : les continents en silhouette très discrète. Ils situent le
    // regard sans jamais concurrencer les disques.
    let fond = '';
    for (const d of Object.values(WorldMap.PATHS)) fond += `<path d="${d}"/>`;

    // Vue rapprochée, révélée au survol : les pays dans leur forme réelle,
    // teintés selon leur poids, leur pourcentage inscrit dedans. Elle répond
    // à une autre question que les bulles — non plus « combien » mais « où
    // exactement » — et c'est pourquoi les deux coexistent.
    const parContinent = new Map();
    for (const [nom, v] of parPays) {
      if (v <= 0) continue;
      const cont = Engine.continentOf(GeoMap.nomFr(nom));
      if (!parContinent.has(cont)) parContinent.set(cont, { pays: [], valeur: 0 });
      const g = parContinent.get(cont);
      g.pays.push({ nom, v });
      g.valeur += v;
    }
    // Le cadrage se règle sur les pays qui portent l'essentiel du poids, pas
    // sur les traces : sans ce filtre, une ligne à 0,5 % en Finlande étire le
    // cadre européen jusqu'au cercle polaire et interdit tout rapprochement.
    // Les pays écartés du CADRAGE restent colorés — ils sortent simplement du
    // champ, ce qui est le propre d'un zoom.
    for (const g of parContinent.values()) {
      g.pays.sort((a, b) => b.v - a.v);
      let cumul = 0;
      const cadrants = [];
      for (const p of g.pays) {
        cadrants.push(p);
        cumul += p.v;
        if (cumul >= g.valeur * 0.90 && cadrants.length >= 2) break;
      }
      g.cadre = null;
      for (const p of cadrants) {
        const c = GeoMap.cadre(WorldMap.PATHS[p.nom]);
        if (!c) continue;
        g.cadre = g.cadre ? { x0: Math.min(g.cadre.x0, c.x0), x1: Math.max(g.cadre.x1, c.x1),
                              y0: Math.min(g.cadre.y0, c.y0), y1: Math.max(g.cadre.y1, c.y1) } : { ...c };
      }
    }
    // Intensité rapportée au plus fort du CONTINENT : rapportée au total, une
    // Europe dont le maximum est 8 % resterait uniformément pâle.
    let detail = '';
    for (const [cont, g] of parContinent) {
      const maxCont = Math.max(...g.pays.map(p => p.v));
      let dedans = '';
      for (const { nom, v } of g.pays) {
        const t = maxCont > 0 ? Math.sqrt(v / maxCont) : 0;
        const fill = `color-mix(in oklab, ${couleurDe(nom)} ${(35 + t * 65).toFixed(0)}%, var(--carte-vide))`;
        const c = GeoMap.centre(WorldMap.PATHS[nom]);
        dedans += `<path d="${WorldMap.PATHS[nom]}" fill="${fill}" stroke="var(--carte-trait)"
          stroke-width="0.6" data-pays="${U.escapeHtml(nom)}" data-val="${v}"/>`;
        if (c) dedans += `<text class="carte-detail-part" x="${c.x.toFixed(1)}" y="${c.y.toFixed(1)}"
          data-pays="${U.escapeHtml(nom)}" data-val="${v}">${U.fmtPct(v / total, v / total < 0.01 ? 1 : 0)}</text>`;
      }
      detail += `<g class="carte-detail" data-cont="${U.escapeHtml(cont)}">${dedans}</g>`;
    }

    // Un disque par pays investi.
    const rMax = opts.rMax ?? Math.min(H * 0.34, 108);
    const cercles = [];
    for (const [nom, v] of [...parPays.entries()].sort((a, b) => b[1] - a[1])) {
      if (v <= 0) continue;
      const c = GeoMap.centre(WorldMap.PATHS[nom]);
      if (!c) continue;
      cercles.push({ nom, v, part: v / total, r: GeoMap.rayon(v / total, partMax, rMax),
        x: c.x, y: c.y, x0: c.x, y0: c.y, couleur: couleurDe(nom) });
    }
    GeoMap.disposer(cercles, W, H);

    let disques = '';
    for (const c of cercles) {
      const nomFr = GeoMap.nomFr(c.nom);
      const pct = U.fmtPct(c.part, c.part < 0.01 ? 1 : 0);
      // Le nom n'est écrit que s'il TIENT dans le disque : un seuil sur le
      // seul rayon laisserait « Royaume-Uni » déborder de tous côtés.
      const largeurNom = nomFr.length * 7.4;      // ~15 px de fonte
      const nomTient = c.r >= 22 && largeurNom <= c.r * 1.85;
      const texte = nomTient
        ? `<text class="carte-nom" x="${c.x.toFixed(1)}" y="${(c.y - 4).toFixed(1)}">${U.escapeHtml(nomFr)}</text>
           <text class="carte-part" x="${c.x.toFixed(1)}" y="${(c.y + 14).toFixed(1)}">${pct}</text>`
        : c.r >= 15
          ? `<text class="carte-part" x="${c.x.toFixed(1)}" y="${(c.y + 5).toFixed(1)}">${pct}</text>`
          : '';
      const cont = Engine.continentOf(nomFr);
      disques += `<g class="carte-disque" data-pays="${U.escapeHtml(c.nom)}" data-val="${c.v}"
        data-cont="${U.escapeHtml(cont)}">
        <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${c.r.toFixed(1)}" fill="${c.couleur}"/>
        ${texte}</g>`;
    }

    // Les plus petits disques ne portent pas d'étiquette : leur nom et leur
    // part se lisent au survol, et dans le détail chiffré à côté de la carte.
    container.innerHTML = `
      <div class="carte-wrap">
        <svg id="${id}" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet">
          <g id="${id}-zoom" class="carte-zoom">
            <g class="carte-fond">${fond}</g>
            <g id="${id}-detail" class="carte-details">${detail}</g>
            <g id="${id}-bulles" class="carte-bulles">${disques}</g>
          </g>
        </svg>
        <div class="carte-tip" id="${id}-tip" style="display:none"></div>
        <div class="carte-retour" id="${id}-retour" style="display:none"></div>
      </div>
      <div class="carte-legende">
        ${[...couleurs].map(([cont, c]) => `<span class="carte-cle">
          <i style="background:${c}"></i>${U.escapeHtml(cont)}</span>`).join('')}
      </div>
      ${horsCarte.length ? `<div class="notice" style="margin-top:8px">
        <b>${U.fmtEUR(U.sum(horsCarte, h => h.value))} ne figurent pas sur la carte</b> :
        ${horsCarte.map(h => `${U.escapeHtml(h.label)} (${U.fmtPct(h.value / total, 0)})`).join(' · ')}
        — ces libellés ne désignent aucun territoire précis, les placer quelque part serait inventer.
      </div>` : ''}`;

    /* ---------- Zoom au survol ----------
       Survoler un disque rapproche la vue sur son continent et échange les
       bulles contre les pays réels. On revient à la vue d'ensemble dès que
       le curseur quitte la carte : rien à cliquer, rien à refermer. */
    const svg = document.getElementById(id);
    const tip = document.getElementById(id + '-tip');
    const zoom = document.getElementById(id + '-zoom');
    const gDetail = document.getElementById(id + '-detail');
    const gBulles = document.getElementById(id + '-bulles');
    const retour = document.getElementById(id + '-retour');
    let continentActif = null;
    let minuterie = null;
    let zoneActive = null;

    const vueEnsemble = () => {
      continentActif = null;
      zoneActive = null;
      zoom.setAttribute('transform', '');
      gDetail.querySelectorAll('.carte-detail').forEach(g => g.classList.remove('visible'));
      gBulles.classList.remove('efface');
      retour.style.display = 'none';
    };

    // Position du curseur dans le repère de la carte, une fois le zoom
    // défait : c'est ce qui permet de savoir si l'on est encore sur la région.
    const enCoordonneesCarte = (ev) => {
      const r = svg.getBoundingClientRect();
      let x = (ev.clientX - r.left) * (W / r.width);
      let y = (ev.clientY - r.top) * (H / r.height);
      if (zoneActive) {
        x = (x - (W / 2 - zoneActive.k * zoneActive.cx)) / zoneActive.k;
        y = (y - (H / 2 - zoneActive.k * zoneActive.cy)) / zoneActive.k;
      }
      return { x, y };
    };

    const zoomer = (cont) => {
      const g = parContinent.get(cont);
      if (!g || !g.cadre || continentActif === cont) return;
      continentActif = cont;
      // Marge proportionnelle : une marge fixe est négligeable sur un
      // continent vaste et étouffe le zoom sur une région compacte.
      const marge = Math.max(6, Math.max(g.cadre.x1 - g.cadre.x0, g.cadre.y1 - g.cadre.y0) * 0.04);
      const bx0 = g.cadre.x0 - marge, bx1 = g.cadre.x1 + marge;
      const by0 = g.cadre.y0 - marge, by1 = g.cadre.y1 + marge;
      const k = Math.max(1, Math.min(6, Math.min(W / (bx1 - bx0), H / (by1 - by0))));
      const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
      // Zone à ne pas quitter : dès que le curseur en sort, on dézoome.
      zoneActive = { x0: bx0, x1: bx1, y0: by0, y1: by1, k, cx, cy };
      zoom.setAttribute('transform', `translate(${(W / 2 - k * cx).toFixed(1)},${(H / 2 - k * cy).toFixed(1)}) scale(${k.toFixed(3)})`);
      // Le groupe est agrandi : sans compensation, les étiquettes le seraient
      // aussi et deviendraient énormes.
      gDetail.style.setProperty('--zoom-k', k.toFixed(3));
      gDetail.querySelectorAll('.carte-detail').forEach(el =>
        el.classList.toggle('visible', el.dataset.cont === cont));
      gBulles.classList.add('efface');
      retour.textContent = `${cont} — ${U.fmtEUR(g.valeur)} · ${U.fmtPct(g.valeur / total, 0)} de la part investie`;
      retour.style.display = '';
    };

    svg.addEventListener('mousemove', (ev) => {
      // Un disque survolé commande le zoom. En vue rapprochée, on dézoome dès
      // que le curseur quitte la RÉGION — inutile de sortir de la carte.
      if (continentActif && zoneActive) {
        const p = enCoordonneesCarte(ev);
        const tol = 14;   // tolérance : frôler le bord ne doit pas dézoomer
        if (p.x < zoneActive.x0 - tol || p.x > zoneActive.x1 + tol ||
            p.y < zoneActive.y0 - tol || p.y > zoneActive.y1 + tol) {
          clearTimeout(minuterie);
          vueEnsemble();
        }
      } else {
        const disque = ev.target.closest('.carte-disque');
        if (disque) {
          clearTimeout(minuterie);
          minuterie = setTimeout(() => zoomer(disque.dataset.cont), 140);
        }
      }
      const cible = ev.target.closest('[data-pays]');
      if (!cible) { tip.style.display = 'none'; return; }
      const v = Number(cible.dataset.val);
      tip.innerHTML = `<div class="ch-tip-t">${U.escapeHtml(GeoMap.nomFr(cible.dataset.pays))}</div>
        <b>${U.fmtEUR(v)}</b> · ${U.fmtPct(v / total, 1)} de la part investie`;
      tip.style.display = 'block';
      const r = svg.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      tip.style.left = Math.min(Math.max(4, x - tip.offsetWidth / 2), r.width - tip.offsetWidth - 4) + 'px';
      tip.style.top = Math.max(4, y - tip.offsetHeight - 12) + 'px';
    });
    svg.addEventListener('mouseleave', () => {
      clearTimeout(minuterie);
      tip.style.display = 'none';
      vueEnsemble();
    });

    // Commandes rendues à l'appelant : survoler une part du camembert doit
    // pouvoir rapprocher la carte sur la région correspondante.
    return {
      zoomer: (cont) => { clearTimeout(minuterie); zoomer(cont); },
      vueEnsemble: () => { clearTimeout(minuterie); vueEnsemble(); },
      continents: [...parContinent.keys()],
    };
  },

  // Cadre englobant d'un tracé, boucles minuscules écartées : sans ce filtre,
  // une dépendance lointaine étirerait le cadre à travers un océan.
  cadre(d, seuilAire = 0.02) {
    if (!d) return null;
    const boucles = [];
    let aireMax = 0;
    for (const ring of d.split('Z')) {
      if (!ring) continue;
      const pts = ring.replace(/^M/, '').split(/[ML]/).filter(Boolean)
        .map(s => s.split(',').map(Number)).filter(p => p.length === 2 && !isNaN(p[0]));
      if (pts.length < 3) continue;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y] of pts) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x);
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      const aire = (x1 - x0) * (y1 - y0);
      aireMax = Math.max(aireMax, aire);
      boucles.push({ aire, x0, x1, y0, y1 });
    }
    let best = null;
    for (const b of boucles) {
      if (b.aire < aireMax * seuilAire) continue;
      best = best ? { x0: Math.min(best.x0, b.x0), x1: Math.max(best.x1, b.x1),
                      y0: Math.min(best.y0, b.y0), y1: Math.max(best.y1, b.y1) } : b;
    }
    return best;
  },

  // Centre approché d'un tracé, pour y poser l'étiquette : centre de la plus
  // grande boucle, et non de l'ensemble — sinon l'étiquette des États-Unis
  // atterrit dans le Pacifique, tirée par l'Alaska.
  centre(d) {
    if (!d) return null;
    let best = null;
    for (const ring of d.split('Z')) {
      if (!ring) continue;
      const pts = ring.replace(/^M/, '').split(/[ML]/).filter(Boolean)
        .map(s => s.split(',').map(Number)).filter(p => p.length === 2 && !isNaN(p[0]));
      if (pts.length < 3) continue;
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const [x, y] of pts) {
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      const aire = (maxx - minx) * (maxy - miny);
      if (!best || aire > best.aire) best = { aire, x: (minx + maxx) / 2, y: (miny + maxy) / 2 };
    }
    return best;
  },

  _fr: null,
  nomFr(nom) {
    if (!GeoMap._fr) {
      GeoMap._fr = new Map();
      for (const [fr, en] of Object.entries(GeoMap.PAYS)) if (!GeoMap._fr.has(en)) GeoMap._fr.set(en, fr);
    }
    return GeoMap._fr.get(nom) || nom;
  },
};
