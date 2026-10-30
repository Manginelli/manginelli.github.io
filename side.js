/* Side art for wide screens. Styles in side.css.
   Builds a fixed layer in the empty sides of the Home and the About, never over the content column. As the window narrows, the
   pieces leave one at a time, each when its own space gets tight: A (arena floor), the D readout, C (minimap and
   quests), the D ruler. Sizes shrink smoothly between a side of 300 px and a side of 704 px (a 2560 screen).
   Phones and tablets (no mouse) never get it; with "reduce motion" the arena stands still. */
(() => {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const main = document.getElementById('main'), bar = document.querySelector('.topbar');
  if (!main) return;
  // Each page lists its own sections; the About page (body data-page="about") gets its own quest and only the cow
  const PAGE = document.body.dataset.page || 'home', $ = id => document.getElementById(id);
  const SECTIONS = (PAGE === 'about' ? [
    { el: main, name: 'About', c: '#f4f2ec' },
    { el: $('design-title'), name: 'How I design', c: '#ffd100', quest: 'Learn how he designs' },
    { el: $('career-title'), name: 'Career', c: '#ffd100', quest: 'Follow his career' },
    { el: $('awards-title'), name: 'Awards & education', c: '#ffd100', quest: 'See the awards' },
    { el: $('next-title'), name: "What's next", c: '#3ee040', quest: "Read what's next" },
  ] : [
    { el: main, name: 'Daniel Manginelli', c: '#f4f2ec' },
    { el: $('games'), name: 'Games I designed', c: '#ff8a4c', quest: 'See the games he designed' },
    { el: $('how'), name: 'How I work', c: '#c47ede', quest: 'Learn how he works' },
    { el: $('lab'), name: "Danny's Tinker Lab", c: '#69ccf0', quest: 'Try the Tinker Lab' },
    { el: $('contact'), name: "Let's talk", c: '#3ee040', quest: 'Say hi' },
  ]).filter(s => s.el);
  const QUEST = PAGE === 'about' ? 'Get to know Daniel' : 'Meet the designer';
  const RULER = 46, lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  const layer = document.createElement('div');
  layer.className = 'side'; layer.setAttribute('aria-hidden', 'true');
  // The floor grid scrolls at the same slow speed as the arena (35% of the page), so units stay on their tiles and the
  // page reads as information floating above the arena (ui.css: html.floor-parallax)
  const FLOOR = 0.35;
  document.documentElement.classList.add('floor-parallax');
  document.body.appendChild(layer);

  // ---------- which pieces fit, and how big they are ----------
  function layout() {
    const r = main.getBoundingClientRect(), g = r.left, t = (g - 300) / (704 - 300);
    const M = Math.round(lerp(24, 64, t)), QW = Math.round(lerp(220, 300, t)), DISC = Math.round(lerp(130, 190, t)), TOPG = Math.round(lerp(24, 40, t));
    const hud = M + QW + 16;
    return { g, x0: r.left, cw: r.width, M, QW, DISC, TOPG,
      ruler: g >= RULER + 14, C: g >= RULER + 8 + (M + QW), Dw: g >= RULER + 40 + hud, A: g >= RULER + 24 + 200 + 24 + hud };
  }

  // ---------- A: the arena scenes ----------
  // WoW names keep WoW class colors; the renamed classes have colors of their own
  const CC = { warrior: '#c79c6e', mage: '#69ccf0', paladin: '#f58cba', priest: '#ffffff', assassin: '#e8573f', cleric: '#f2c94c', crusader: '#f0a04b', sorcerer: '#b45cff' };
  const FOE = '#c0392b', OK = '#3ee040';
  const ALL_SCENES = [
    { side: 'L', f: .5, y: 230, units: [            // two DPS on a training dummy
      { n: 'Training Dummy', c: FOE, x: 0, y: 0, dummy: true },
      { n: 'Assassin', c: CC.assassin, hpc: OK, x: -58, y: 104, t: 0, melee: [1500, 200] },
      { n: 'Mage', c: CC.mage, hpc: OK, x: 66, y: 168, t: 0, cast: [2600, 700] } ] },
    { side: 'R', f: .5, y: 620, units: [            // a tank holds a demon while a healer keeps him up
      { n: 'Big Bad Demon', c: FOE, x: -40, y: 0, t: 1, hp: 70, melee: [2000, 900], foe: true },
      { n: 'Warrior', c: CC.warrior, hpc: OK, x: 44, y: 100, t: 0, hp: 85, melee: [1600, 300], tank: true },
      { n: 'Priest', c: CC.priest, hpc: OK, x: -30, y: 236, heals: 1, healEvery: [2400, 1500] } ] },
    { side: 'L', f: .45, y: 1080, units: [          // a passive cow, minding its own business
      { n: 'Cow', c: '#ffd100', hpc: '#ffd100', x: 0, y: 0, wander: true, moo: [9000, 3000] } ] },
    { side: 'R', f: .5, y: 1460, units: [           // a paladin and a sorcerer on another dummy
      { n: 'Training Dummy', c: FOE, x: 0, y: 0, dummy: true },
      { n: 'Paladin', c: CC.paladin, hpc: OK, x: 58, y: 104, t: 0, melee: [1700, 500] },
      { n: 'Sorcerer', c: CC.sorcerer, hpc: OK, x: -66, y: 168, t: 0, cast: [2800, 1200] } ] },
    { side: 'L', f: .55, y: 1900, units: [          // a crusader and a cleric finishing an abomination
      { n: 'Undead Abomination', c: FOE, x: 40, y: 0, t: 1, hp: 30, melee: [2200, 700], foe: true },
      { n: 'Crusader', c: CC.crusader, hpc: OK, x: -44, y: 100, t: 0, hp: 80, melee: [1600, 100], tank: true },
      { n: 'Cleric', c: CC.cleric, hpc: OK, x: 34, y: 236, heals: 1, healEvery: [2600, 1900] } ] },
  ];
  // the About is a reading page: no fights there, only the cow passing by
  const SCENES = PAGE === 'about'
    ? [{ side: 'L', f: .45, y: 560, units: [{ n: 'Cow', c: '#ffd100', hpc: '#ffd100', x: 0, y: 0, wander: true, moo: [11000, 4000] }] }]
    : ALL_SCENES;
  const HP = SCENES.map(sc => sc.units.map(u => ({ hp: u.hp ?? 100, dead: false })));
  const uel = (si, ui) => layer.querySelector(`[data-u="${si}-${ui}"]`);
  const fmt = n => n.toLocaleString('en-US'), rnd = (a, b) => Math.round(a + Math.random() * (b - a));
  const pulse = (el, cls, ms) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
  function setHp(si, ui, v) { const st = HP[si][ui]; st.hp = Math.max(0, Math.min(100, v)); const e = uel(si, ui); if (e) e.querySelector('.np i').style.setProperty('--hp', st.hp + '%'); }
  function number(si, ui, text, kind) {
    const e = uel(si, ui); if (!e) return; const u = SCENES[si].units[ui], player = !u.dummy && !u.foe && !u.wander;
    const d = document.createElement('div'); d.className = 'ct' + (kind ? ' ' + kind : ''); d.textContent = text;
    d.style.left = player ? (u.x >= 0 ? 58 : -58) + 'px' : rnd(-14, 14) + 'px';
    d.style.top = player ? (kind === 'heal' ? -30 : -6) + 'px' : '-78px';
    e.querySelector('.body').appendChild(d); setTimeout(() => d.remove(), 2700);
  }
  function flinch(si, ui, fromUi) {
    const e = uel(si, ui); if (!e) return; const a = SCENES[si].units[fromUi], b = SCENES[si].units[ui], ang = Math.atan2(b.y - a.y, b.x - a.x);
    e.style.setProperty('--fx', (Math.cos(ang) * 4).toFixed(1) + 'px'); e.style.setProperty('--fy', (Math.sin(ang) * 4).toFixed(1) + 'px'); pulse(e, 'flinch', 260);
  }
  function die(si, ti) {
    HP[si][ti].dead = true; uel(si, ti)?.classList.add('dead');
    setTimeout(() => uel(si, ti)?.classList.add('gone'), 2600);                 // the body fades away
    setTimeout(() => { HP[si][ti].dead = false; setHp(si, ti, 100); const x = uel(si, ti); x?.classList.remove('dead', 'gone'); }, 4200); // a new one walks in
  }
  function damage(si, ai, ti, ranged) {
    const t = SCENES[si].units[ti];
    if (HP[si][ti].dead || HP[si][ai].dead) return;
    if (t.tank) { number(si, ti, '-' + fmt(rnd(900, 1300)), 'taken'); flinch(si, ti, ai); setHp(si, ti, Math.max(30, HP[si][ti].hp - 14)); return; }
    const crit = Math.random() < .22, v = crit ? rnd(2400, 3600) : rnd(ranged ? 600 : 300, ranged ? 1300 : 900);
    number(si, ti, fmt(v), crit ? 'crit' : ''); flinch(si, ti, ai);
    if (t.foe) { setHp(si, ti, HP[si][ti].hp - (crit ? 6 : 3)); if (HP[si][ti].hp <= 0) die(si, ti); }
  }
  const tracks = [];
  SCENES.forEach((sc, si) => sc.units.forEach((u, ui) => {
    if (u.melee) tracks.push({ every: u.melee[0], off: u.melee[1], fn: () => {   // swing: the hit lands at the peak of the lunge
      if (HP[si][ui].dead || HP[si][u.t].dead) return; pulse(uel(si, ui), 'hit', 340); setTimeout(() => damage(si, ui, u.t, false), 150); } });
    if (u.cast) tracks.push({ every: u.cast[0], off: u.cast[1], fn: () => {      // cast: glow, then a bolt flies, then the number
      const e = uel(si, ui); if (!e) return; e.classList.add('casting');
      setTimeout(() => { e.classList.remove('casting'); if (!e.isConnected) return; const t = sc.units[u.t], bolt = document.createElement('div');
        bolt.className = 'bolt'; bolt.style.setProperty('--c', u.c); bolt.style.left = u.x + 'px'; bolt.style.top = u.y + 'px';
        e.parentElement.appendChild(bolt); void bolt.offsetWidth;               // commit the start position, or the bolt jumps instead of flying
        bolt.style.transform = `translate(${t.x - u.x}px, ${t.y - u.y}px)`;
        setTimeout(() => { bolt.remove(); damage(si, ui, u.t, true); }, 420); }, 900); } });
    if (u.healEvery) tracks.push({ every: u.healEvery[0], off: u.healEvery[1], fn: () => { // heal: glow, the beam fires, health goes up with the number
      const e = uel(si, ui), tgt = u.heals; if (!e) return; e.classList.add('casting');
      setTimeout(() => { e.classList.remove('casting'); const b = layer.querySelector(`[data-beam="${si}-${ui}"]`); b?.classList.add('on');
        setTimeout(() => { number(si, tgt, '+' + fmt(rnd(1700, 2300)), 'heal'); setHp(si, tgt, HP[si][tgt].hp + 18); }, 120);
        setTimeout(() => b?.classList.remove('on'), 480); }, 750); } });
    if (u.moo) tracks.push({ every: u.moo[0], off: u.moo[1], fn: () => number(si, ui, 'Moo.', 'emote') });
  }));

  // ---------- build the layer for the current width ----------
  let L, built = '';
  function build() {
    L = layout();
    const { g, x0, cw, M, QW, DISC, TOPG } = L, R = x => x0 + cw + x, H = innerHeight;
    layer.style.setProperty('--side-top', (bar ? bar.getBoundingClientRect().height : 57) + 'px');
    const key = [L.A, L.C, L.Dw, L.ruler, Math.round(g)].join();
    if (key === built) return; built = key;
    let h = '';
    if (L.A) {
      const bandL = [M + QW + 16 + 24, g - RULER - 24], bandR = [RULER + 24, g - (M + QW + 16) - 24];
      const at = (s, f) => { const b = s === 'L' ? bandL : bandR, m = b[0] + (b[1] - b[0]) * f; return s === 'L' ? m : R(m); };
      SCENES.forEach((sc, si) => {
        // free placement (not snapped to the tiles, it reads more organic); the floor parallax keeps each unit on its spot
        const sx = Math.round(at(sc.side, sc.f));
        h += `<div class="scene" data-y="${sc.y}" style="left:${sx}px;top:${sc.y}px">`;
        sc.units.forEach((u, ui) => {
          const tg = u.t != null ? sc.units[u.t] : null, ang = tg ? Math.atan2(tg.y - u.y, tg.x - u.x) : (u.wander ? 0.17 : Math.PI / 2);
          if (u.heals != null) {
            const b = sc.units[u.heals], a2 = Math.atan2(b.y - u.y, b.x - u.x), len = Math.hypot(b.x - u.x, b.y - u.y) - 36;
            h += `<div class="beam" data-beam="${si}-${ui}" style="left:${u.x + Math.cos(a2) * 18}px;top:${u.y + Math.sin(a2) * 18}px;width:${len}px;transform:rotate(${a2}rad)"></div>`;
          }
          const st = HP[si][ui];
          h += `<div class="u${u.wander ? ' wander' : ''}${st.dead ? ' dead' : ''}" data-u="${si}-${ui}" style="left:${u.x}px;top:${u.y}px;--c:${u.c};--hpc:${u.hpc || FOE};--a:${ang}rad;--lx:${(Math.cos(ang) * 10).toFixed(1)}px;--ly:${(Math.sin(ang) * 10).toFixed(1)}px">`;
          h += `<div class="body"><div class="tok"></div>${tg || u.wander ? '<div class="face"></div>' : ''}<div class="np">${u.n}<i style="--hp:${st.hp}%"></i></div></div></div>`;
        });
        h += `</div>`;
      });
    }
    if (L.C) {
      const qw = Math.min(QW, g - RULER - 8 - M);
      h += `<div class="mm" style="left:${R(g - M - (DISC + 20))}px;top:${TOPG}px;width:${DISC + 20}px"><div class="zone"></div><div class="disc" style="width:${DISC}px;height:${DISC}px"><div class="mapin" style="position:absolute;inset:0"></div><div class="me"></div></div></div>`;
      h += `<div class="qt" style="left:${R(g - M - qw)}px;top:${TOPG + DISC + 70}px;width:${qw}px"><div class="qh">${QUEST}</div>${SECTIONS.map((x, i) => x.quest ? `<div class="o" data-q="${i}">${x.quest}</div>` : '').join('')}</div>`;
    }
    if (L.Dw) h += `<div class="readout" style="left:${M}px;top:${TOPG}px;width:${QW}px"></div>`;
    if (L.ruler) h += `<div class="ruler" style="left:${x0 - 40}px;top:0;height:100%"></div><div class="ruler r" style="left:${x0 + cw + 6}px;top:0;height:100%"></div>`;
    layer.innerHTML = h;
    update();
  }

  // ---------- follow the scroll ----------
  let tops = [], pageH = 1;
  function measure() { tops = SECTIONS.map(s => s.el.getBoundingClientRect().top + scrollY); pageH = document.documentElement.scrollHeight; }
  function update() {
    const s = scrollY, H = innerHeight;
    let i = 0; tops.forEach((t, k) => { if (s + 140 >= t) i = k; });
    const f = s * FLOOR; document.documentElement.style.setProperty('--floor-y', (-f).toFixed(1) + 'px');
    layer.querySelectorAll('.scene').forEach(sc => { sc.style.top = (+sc.dataset.y - f) + 'px'; });
    const mapin = layer.querySelector('.mapin');
    if (mapin) {
      const span = L.DISC / (pageH * 0.55);
      if (!mapin.childElementCount) mapin.innerHTML = `<div class="road" style="top:0;height:${pageH * span}px"></div>` + SECTIONS.map((x, k) => `<div class="poi" style="top:${tops[k] * span}px;--c:${x.c}"></div>`).join('');
      mapin.style.transform = `translateY(${L.DISC / 2 - (s + 140) * span}px)`;
      layer.querySelector('.zone').textContent = SECTIONS[i].name;
      layer.querySelectorAll('.qt .o').forEach(o => o.classList.toggle('done', tops[+o.dataset.q] < s + H * 0.7 || s + H >= pageH - 4));   // done once well into view, or at the bottom of the page   // an objective completes once its section is well into view
    }
    const ro = layer.querySelector('.readout');
    if (ro) ro.innerHTML = `<b>Y</b> ${Math.round(s)} &nbsp; <b>Grid</b> 56 px &nbsp; <b>Column</b> 1120 px<br><b>Section</b> ${SECTIONS[i].name}`;
    const rl = layer.querySelectorAll('.ruler');
    if (rl.length) {
      // ticks every 56 px on the floor grid lines, which move with the floor; labels are floor coordinates
      const top = parseFloat(getComputedStyle(layer).top) || 0; let t = '';
      for (let k = Math.floor(f / 56); k * 56 - f < H; k++) {
        const y = k * 56 - f - top; if (y < -20) continue; const big = k % 4 === 0;
        t += `<div class="tk${big ? ' big' : ''}" style="top:${y}px;width:${big ? 22 : 10}px"></div>${big ? `<div class="tl" style="top:${y}px">${k * 56}</div>` : ''}`;
      }
      rl.forEach(r => { r.innerHTML = t; });
    }
  }

  let raf = 0;
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); }, { passive: true });
  addEventListener('resize', () => { measure(); build(); });
  addEventListener('load', () => { measure(); built = ''; build(); });
  measure(); build();

  // ---------- the combat clock: one clock, so every number has a cause ----------
  if (reduce) return;
  const t0 = performance.now(); tracks.forEach(t => t.next = t0 + t.off);
  setInterval(() => {
    const now = performance.now();
    if (document.hidden || !L || !L.A) { tracks.forEach(t => { while (now >= t.next) t.next += t.every; }); return; } // paused: skip, never catch up in a burst
    tracks.forEach(t => { while (now >= t.next) { t.fn(); t.next += t.every; } });
  }, 50);
})();
