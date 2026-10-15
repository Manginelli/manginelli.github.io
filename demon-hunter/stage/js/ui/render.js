(function(TL) {
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seeded = seed => () => {
    seed = seed + 1831565813 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  class Renderer {
    constructor(canvas, game) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.g = game;
      this.shake = 0;
      game.on("shake", a => {
        if (!reduceMotion) this.shake = Math.max(this.shake, a);
      });
      game.on("crit", () => {
        if (!reduceMotion) this.shake = Math.max(this.shake, .12);
      });
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = this.c.getBoundingClientRect();
      this.c.width = Math.round(r.width * dpr);
      this.c.height = Math.round(r.height * dpr);
      this.dpr = dpr;
      const vw = this.g.enc.viewWidth || 48, vh = this.g.enc.viewHeight || 30;
      this.ppy = Math.max(10, Math.min(30, Math.min(r.width / vw, r.height / vh))) * dpr;
    }
    toWorld(sx, sy) {
      return {
        x: (sx * this.dpr - this.ox) / this.ppy,
        y: (sy * this.dpr - this.oy) / this.ppy
      };
    }
    draw(dt) {
      const {ctx: ctx, g: g} = this, W = this.c.width, H = this.c.height, s = this.ppy, p = g.player;
      const aw = g.enc.width * s, ah = g.enc.height * s;
      let ox = W / 2 - p.x * s, oy = H / 2 - p.y * s;
      ox = aw < W ? (W - aw) / 2 : Math.min(0, Math.max(W - aw, ox));
      oy = ah < H ? (H - ah) / 2 : Math.min(0, Math.max(H - ah, oy));
      if (this.shake > 0) {
        ox += (Math.random() - .5) * this.shake * 18 * this.dpr;
        oy += (Math.random() - .5) * this.shake * 18 * this.dpr;
        this.shake = Math.max(0, this.shake - dt * 1.6);
      }
      this.ox = ox;
      this.oy = oy;
      const X = x => ox + x * s, Y = y => oy + y * s;
      if (g.enc.theme === "hollow") this.drawHollow(ctx, W, H, s, X, Y, dt); else {
        ctx.fillStyle = "#0b0f0d";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#141d18";
        ctx.fillRect(X(0), Y(0), aw, ah);
        ctx.strokeStyle = "rgba(200,220,200,0.035)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= g.enc.width; x += 5) {
          ctx.moveTo(X(x), Y(0));
          ctx.lineTo(X(x), Y(g.enc.height));
        }
        for (let y = 0; y <= g.enc.height; y += 5) {
          ctx.moveTo(X(0), Y(y));
          ctx.lineTo(X(g.enc.width), Y(y));
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(232,196,106,0.25)";
        ctx.lineWidth = 2 * this.dpr;
        ctx.strokeRect(X(0), Y(0), aw, ah);
      }
      for (const st of g.enc.stations) {
        ctx.beginPath();
        ctx.arc(X(st.x), Y(st.y), st.r * s, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(152,72,179,0.045)";
        ctx.fill();
        ctx.setLineDash([ 6 * this.dpr, 8 * this.dpr ]);
        ctx.strokeStyle = "rgba(232,196,106,0.22)";
        ctx.lineWidth = 1.5 * this.dpr;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(232,196,106,0.75)";
        ctx.font = `${13 * this.dpr}px "Marcellus SC", Georgia, serif`;
        ctx.fillText(st.label, X(st.x), Y(st.y + st.r) - 26 * this.dpr);
        ctx.fillStyle = "rgba(200,210,200,0.45)";
        ctx.font = `${12 * this.dpr}px "Alegreya Sans", system-ui, sans-serif`;
        ctx.fillText(st.hint, X(st.x), Y(st.y + st.r) - 10 * this.dpr);
      }
      for (const e of g.enemies) if (!e.dead && e.cast && e.cast.area) {
        const k = e.cast.elapsed / e.cast.total, R = e.cast.area * s;
        ctx.fillStyle = `rgba(120,255,80,${.08 + .1 * k})`;
        ctx.beginPath();
        ctx.arc(X(e.x), Y(e.y), R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(160,255,110,0.22)";
        ctx.beginPath();
        ctx.arc(X(e.x), Y(e.y), R * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(182,255,122,0.9)";
        ctx.lineWidth = 3 * this.dpr;
        ctx.beginPath();
        ctx.arc(X(e.x), Y(e.y), R, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const f of g.effectsFx) if (f.kind === "ghost") {
        ctx.globalAlpha = f.life / f.max * .35;
        ctx.fillStyle = "#b07ad1";
        ctx.beginPath();
        ctx.arc(X(f.x), Y(f.y), p.radius * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const immo = p.auras.find(a => a.id === "immolation");
      if (immo && !p.dead) {
        const it = g.abilityTune("immolation"), r = it.meleeArea ? g.tune.melee.attackDistance : it.radius;
        const grd = ctx.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), r * s);
        const arc = it.school === "arcane";
        grd.addColorStop(0, arc ? "rgba(170,110,255,0.02)" : "rgba(255,140,40,0.02)");
        grd.addColorStop(.8, arc ? "rgba(150,90,255,0.10)" : "rgba(255,120,30,0.10)");
        grd.addColorStop(1, arc ? "rgba(200,160,255,0.28)" : "rgba(255,160,60,0.28)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), r * s, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2, rr = (.3 + Math.random() * .7) * r;
          ctx.fillStyle = arc ? `rgba(${150 + Math.random() * 80 | 0},${100 + Math.random() * 80 | 0},255,${.3 + Math.random() * .5})` : `rgba(255,${120 + Math.random() * 100 | 0},40,${.3 + Math.random() * .5})`;
          ctx.fillRect(X(p.x + Math.cos(a) * rr), Y(p.y + Math.sin(a) * rr), 3 * this.dpr, 3 * this.dpr);
        }
      }
      for (const m of g.specStates && g.specStates.spellbreaker && g.specStates.spellbreaker.images || []) {
        const rr = 1.4 * s, gr = ctx.createRadialGradient(X(m.x), Y(m.y), 0, X(m.x), Y(m.y), rr);
        gr.addColorStop(0, "rgba(111,180,255,0.20)");
        gr.addColorStop(1, "rgba(111,180,255,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(X(m.x), Y(m.y), rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = .55 + .15 * Math.sin(g.time * 6 + m.slot);
        this.drawPlayer(Object.assign({}, p, {
          x: m.x,
          y: m.y,
          facing: m.facing,
          auras: [],
          channel: null,
          flash: m.flash || 0,
          hop: 0,
          color: "#3d7fe0",
          image: true
        }), X, Y, s);
        ctx.globalAlpha = 1;
        if (m.maxHp) {
          const d = this.dpr, w = 22 * d, h = 3 * d, bx = X(m.x) - w / 2, by = Y(m.y) - (m.radius || 1) * s - 12 * d;
          ctx.fillStyle = "rgba(0,0,0,0.75)";
          ctx.fillRect(bx - d, by - d, w + 2 * d, h + 2 * d);
          ctx.fillStyle = "#4fd04f";
          ctx.fillRect(bx, by, w * Math.max(0, m.hp / m.maxHp), h);
        }
      }
      this.drawWindTrail(p, X, Y, s, dt);
      const ents = g.enemies.filter(e => !e.dead).concat(p.dead ? [] : [ p ]).sort((a, b) => a.y - b.y);
      for (const e of ents) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(X(e.x), Y(e.y) + e.radius * s * .55, e.radius * s * 1.05, e.radius * s * .45, 0, 0, Math.PI * 2);
        ctx.fill();
        if (e === g.target) {
          const mr = g.meleeRange(p, e), inside = g.inMelee(p, e);
          ctx.setLineDash([ 3 * this.dpr, 5 * this.dpr ]);
          ctx.strokeStyle = inside ? "rgba(232,196,106,0.45)" : "rgba(224,74,58,0.35)";
          ctx.lineWidth = 1.5 * this.dpr;
          ctx.beginPath();
          ctx.arc(X(e.x), Y(e.y), mr * s, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "#e04a3a";
          ctx.lineWidth = 2.5 * this.dpr;
          ctx.beginPath();
          ctx.ellipse(X(e.x), Y(e.y) + e.radius * s * .55, e.radius * s * 1.4, e.radius * s * .62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (e.kind === "player") this.drawPlayer(e, X, Y, s); else this.drawEnemy(e, X, Y, s);
      }
      for (const f of g.effectsFx) {
        const k = f.life / f.max;
        if (f.kind === "ring") {
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 3 * this.dpr;
          ctx.beginPath();
          ctx.arc(X(f.x), Y(f.y), f.r * s * (1.1 - k * .3), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (f.kind === "impact") {
          const q = 1 - k, sc = f.crit ? 1.5 : f.small ? .6 : 1, R = f.r * s * sc, cx = X(f.x), cy = Y(f.y), d = this.dpr;
          ctx.save();
          if (f.school === "fire") {
            ctx.globalCompositeOperation = "lighter";
            for (const pt of f.parts) {
              const dx = Math.cos(pt.a) * q * R * 1.2 * pt.sp, dy = Math.sin(pt.a) * q * R * .8 * pt.sp - q * R * 1.3, rr = R * .5 * pt.sz * (.7 + q * .9);
              const gr = ctx.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, rr);
              gr.addColorStop(0, `rgba(255,235,170,${Math.min(1, 1.3 * k)})`);
              gr.addColorStop(.45, `rgba(255,120,30,${.75 * k})`);
              gr.addColorStop(1, "rgba(200,40,0,0)");
              ctx.fillStyle = gr;
              ctx.beginPath();
              ctx.arc(cx + dx, cy + dy, rr, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = `rgba(255,200,110,${k})`;
              ctx.fillRect(cx + dx * 1.6, cy + dy * 1.4 - q * R * .4, 1.6 * d, 1.6 * d);
            }
          } else if (f.school === "arcane") {
            ctx.globalCompositeOperation = "lighter";
            if (q < .3) {
              ctx.fillStyle = `rgba(150,215,255,${(.3 - q) * 1.6})`;
              ctx.beginPath();
              ctx.arc(cx, cy, R * .6, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.strokeStyle = `rgba(143,216,255,${.85 * k})`;
            ctx.lineWidth = 2 * d;
            ctx.beginPath();
            ctx.arc(cx, cy, R * (.5 + q * 1.3), 0, Math.PI * 2);
            ctx.stroke();
            for (const pt of f.parts) {
              const a = pt.a + f.rot + q * 1.6, dist = R * (.5 + q * 1.3 * pt.sp), px = cx + Math.cos(a) * dist, py = cy + Math.sin(a) * dist, z = (4.5 + 4 * pt.sz) * d * (1 - q * .4);
              const ka = Math.min(1, k * 1.6);
              ctx.fillStyle = pt.sz > .8 ? `rgba(230,248,255,${ka})` : `rgba(180,150,255,${ka})`;
              ctx.beginPath();
              ctx.moveTo(px, py - z);
              ctx.lineTo(px + z * .45, py);
              ctx.lineTo(px, py + z);
              ctx.lineTo(px - z * .45, py);
              ctx.closePath();
              ctx.fill();
            }
          } else if (f.school === "shadow") {
            for (const pt of f.parts) {
              const dist = R * (.2 + q * 1.1 * pt.sp), px = cx + Math.cos(pt.a) * dist, py = cy + Math.sin(pt.a) * dist, rr = R * .45 * pt.sz * (.7 + q);
              const gr = ctx.createRadialGradient(px, py, 0, px, py, rr);
              gr.addColorStop(0, `rgba(120,70,190,${.6 * k})`);
              gr.addColorStop(1, "rgba(30,10,50,0)");
              ctx.fillStyle = gr;
              ctx.beginPath();
              ctx.arc(px, py, rr, 0, Math.PI * 2);
              ctx.fill();
            }
            if (q < .3) {
              ctx.globalCompositeOperation = "lighter";
              ctx.fillStyle = `rgba(190,160,255,${(.3 - q) * 2})`;
              ctx.beginPath();
              ctx.arc(cx, cy, R * .5, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            if (f.crit && q < .3) {
              ctx.fillStyle = `rgba(255,250,230,${(.3 - q) * .9})`;
              ctx.beginPath();
              ctx.arc(cx, cy, R * .4 * (1 - q), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.strokeStyle = `rgba(255,246,210,${Math.min(1, k * 1.5)})`;
            ctx.lineWidth = (f.crit ? 2.8 : 2.2) * d;
            ctx.lineCap = "round";
            for (const pt of f.parts) {
              const r0 = R * (.5 + q * 1.2 * pt.sp), r1 = r0 + R * .6 * pt.sz * (1 - q * .6);
              ctx.beginPath();
              ctx.moveTo(cx + Math.cos(pt.a) * r0, cy + Math.sin(pt.a) * r0);
              ctx.lineTo(cx + Math.cos(pt.a) * r1, cy + Math.sin(pt.a) * r1);
              ctx.stroke();
            }
          }
          ctx.restore();
        } else if (f.kind === "slash") {
          const len = (f.big ? 1.8 : 1.1) * s;
          ctx.strokeStyle = f.color || "rgba(255,255,255,0.9)";
          ctx.globalAlpha = k;
          ctx.lineWidth = (f.big ? 4 : 2) * this.dpr;
          const a = f.a + Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(X(f.x) - Math.cos(a) * len / 2, Y(f.y) - Math.sin(a) * len / 2);
          ctx.lineTo(X(f.x) + Math.cos(a) * len / 2, Y(f.y) + Math.sin(a) * len / 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (f.kind === "blast") {
          const q = 1 - k, R = f.r * s, cx = X(f.x), cy = Y(f.y);
          const fr = R * (.5 + .8 * Math.min(1, q * 2.5));
          const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
          const pal = f.palette || {
            core: "255,250,220",
            mid: "255,190,70",
            edge: "255,90,20",
            ring: "#ffd36b",
            ring2: "#ff6a1f"
          };
          grd.addColorStop(0, `rgba(${pal.core},${.9 * k})`);
          grd.addColorStop(.35, `rgba(${pal.mid},${.7 * k})`);
          grd.addColorStop(1, `rgba(${pal.edge},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(cx, cy, fr, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = k;
          ctx.strokeStyle = pal.ring;
          ctx.lineWidth = (3 + 9 * k) * this.dpr;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (.7 + .9 * q), 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = pal.ring2;
          ctx.lineWidth = 2 * this.dpr;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (.5 + 1.3 * q), 0, Math.PI * 2);
          ctx.stroke();
          for (const e of f.embers) {
            const d = R * (.3 + 1.6 * q * e.sp), sz = (2 + 4 * k) * this.dpr;
            ctx.fillStyle = e.c;
            ctx.fillRect(cx + Math.cos(e.a) * d - sz / 2, cy + Math.sin(e.a) * d - sz / 2, sz, sz);
          }
          ctx.globalAlpha = 1;
        } else if (f.kind === "sweep") {
          const q = 1 - k, ax = X(f.x), ay = Y(f.y), bx = X(f.tx), by = Y(f.ty), a = Math.atan2(by - ay, bx - ax), L = Math.hypot(bx - ax, by - ay) * Math.min(1, q * 5), w = f.w * s;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(a);
          const gr = ctx.createLinearGradient(0, -w, 0, w);
          gr.addColorStop(0, "rgba(230,236,255,0)");
          gr.addColorStop(.5, `rgba(230,236,255,${.3 * k})`);
          gr.addColorStop(1, "rgba(230,236,255,0)");
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(L * .5, -w * 1.6, L, 0);
          ctx.quadraticCurveTo(L * .5, w * 1.6, 0, 0);
          ctx.fill();
          ctx.lineCap = "round";
          for (const st of f.streaks) {
            const x = st.u * L, h = w * st.h * .75, edge = Math.sin(Math.PI * st.u);
            ctx.strokeStyle = `rgba(255,255,255,${.9 * k})`;
            ctx.lineWidth = (1.2 + 2.2 * k) * this.dpr;
            ctx.beginPath();
            ctx.moveTo(x - h * .35, -h * edge);
            ctx.quadraticCurveTo(x + h * .4, 0, x - h * .35, h * edge);
            ctx.stroke();
          }
          ctx.restore();
        } else if (f.kind === "restore") {
          const q = 1 - k, who = f.follow ? g.player : f, cx = X(who.x), cy = Y(who.y), d = this.dpr, col = f.rgb, R = (f.r || 1) * s;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const gl = ctx.createRadialGradient(cx, cy, R * .6, cx, cy, R * 2.2);
          gl.addColorStop(0, `rgba(${col},${.5 * k})`);
          gl.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = gl;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 2.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${col},${.95 * Math.min(1, k * 1.6)})`;
          ctx.lineWidth = 3 * d;
          ctx.beginPath();
          ctx.arc(cx, cy, R * 1.04, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(${col},${.8 * k})`;
          ctx.lineWidth = 2.5 * d;
          ctx.beginPath();
          ctx.arc(cx, cy, R * (1.1 + q * 1.3), 0, Math.PI * 2);
          ctx.stroke();
          for (const m of f.motes) {
            const t = (q * 1.2 + m.ph) % 1, mx = cx + Math.cos(m.a) * R * m.r, my = cy + Math.sin(m.a) * R * m.r * .6 - t * R * 2.8, a = Math.sin(Math.PI * t) * k, z = (2 + m.z) * d;
            ctx.fillStyle = `rgba(${col},${a})`;
            ctx.beginPath();
            ctx.arc(mx, my, z, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,${.55 * a})`;
            ctx.lineWidth = 1 * d;
            ctx.beginPath();
            ctx.moveTo(mx - z * 2, my);
            ctx.lineTo(mx + z * 2, my);
            ctx.moveTo(mx, my - z * 2);
            ctx.lineTo(mx, my + z * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (f.kind === "scar") {
          const q = 1 - k, cx = X(f.x), cy = Y(f.y), L = f.len * s, grow = Math.min(1, q * 7), d = this.dpr;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(f.a);
          const pts = f.pts.filter(pt => pt.u <= grow), poly = wk => {
            ctx.beginPath();
            pts.forEach((pt, i) => {
              const x = (pt.u - .5) * L, y = pt.v * L - pt.w * wk;
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            });
            for (let i = pts.length - 1; i >= 0; i--) {
              const pt = pts[i];
              ctx.lineTo((pt.u - .5) * L, pt.v * L + pt.w * wk);
            }
            ctx.closePath();
          };
          if (pts.length > 1) {
            ctx.globalAlpha = Math.min(1, k * 1.6);
            poly(L * .06);
            ctx.fillStyle = "rgba(8,12,30,0.92)";
            ctx.fill();
            ctx.globalCompositeOperation = "lighter";
            ctx.shadowColor = "#4fa3ff";
            ctx.shadowBlur = 14 * d;
            poly(L * .03);
            ctx.fillStyle = "rgba(90,170,255,0.95)";
            ctx.fill();
            ctx.shadowBlur = 0;
            poly(L * .012);
            ctx.fillStyle = "rgba(235,248,255,1)";
            ctx.fill();
            ctx.strokeStyle = "rgba(120,190,255,0.8)";
            ctx.lineWidth = 1.2 * d;
            for (const b of f.branches) {
              if (b.u > grow) continue;
              const x = (b.u - .5) * L, y = b.v * L;
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + Math.cos(b.a) * b.l * L, y + Math.sin(b.a) * b.l * L);
              ctx.stroke();
            }
          }
          ctx.restore();
        } else if (f.kind === "iai") {
          const q = 1 - k, L = f.len * s, cx = X(f.x), cy = Y(f.y), a = f.a + .35, grow = Math.min(1, q * 6);
          const x0 = cx - Math.cos(a) * L / 2, y0 = cy - Math.sin(a) * L / 2, x1 = x0 + Math.cos(a) * L * grow, y1 = y0 + Math.sin(a) * L * grow;
          ctx.lineCap = "round";
          ctx.globalAlpha = k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = (10 * k + 2) * this.dpr;
          ctx.shadowColor = f.color;
          ctx.shadowBlur = 18 * this.dpr;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = f.core;
          ctx.lineWidth = (3 * k + 1) * this.dpr;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.lineCap = "butt";
        } else if (f.kind === "bolt") {
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = k;
          ctx.lineWidth = 4 * this.dpr;
          ctx.beginPath();
          ctx.moveTo(X(f.x), Y(f.y));
          ctx.lineTo(X(f.tx), Y(f.ty));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      for (const e of g.enemies) if (!e.dead) this.drawBars(e, X, Y, s);
      if (!p.dead) this.drawPlayerBars(p, X, Y, s);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      for (const f of g.floaters) {
        const age = f.max - f.life, pop = f.big || f.huge, hold = pop ? .2 : 0, d = this.dpr;
        const u = age <= hold ? 0 : Math.min(1, (age - hold) / (f.max - hold));
        const tau = u + .6 / (2 * Math.PI) * Math.sin(2 * Math.PI * u);
        const H = (f.small ? 30 : pop ? 38 : 46) * d, W = (pop ? 34 : 48) * d;
        const rise = H * 4 * tau * (1 - tau);
        const side = ((f.lane || 0) * 34 + (f.bias || 0) * 40 + (f.jitter || 0)) * d + (f.out || 0) * W * tau;
        let scale = 1;
        if (pop) scale = age < .1 ? 1.9 - .5 * (age / .1) : 1.4 - .25 * Math.min(1, (age - .1) / (f.max * .6)); else if (age < .08) scale = 1.25 - .25 * (age / .08);
        const base = f.huge ? 26 : f.small ? 14 : 19, size = base * scale * this.dpr;
        ctx.font = `700 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        ctx.globalAlpha = tau < .7 ? 1 : Math.max(0, 1 - (tau - .7) / .3);
        const tx = X(f.x) + side, ty = Y(f.y) - rise - (30 + Math.abs(f.lane || 0) * 5) * d;
        ctx.lineWidth = Math.max(2.5 * this.dpr, size * .2);
        ctx.strokeStyle = "rgba(0,0,0,0.9)";
        ctx.strokeText(f.text, tx, ty);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, tx, ty);
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = "alphabetic";
    }
    drawHollow(ctx, W, H, s, X, Y, dt) {
      const key = W + "x" + H + "x" + s;
      if (!this.hollow && !this.hollowReady) {
        this.hollowReady = true;
        ctx.fillStyle = "#0a0907";
        ctx.fillRect(0, 0, W, H);
        return;
      }
      if (!this.hollow || this.hollow.key !== key) this.hollow = this.buildHollow(W, H, s, key);
      const h = this.hollow;
      ctx.fillStyle = "#0a0907";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(h.cv, Math.round(X(-h.M)), Math.round(Y(-h.M)));
      if (!reduceMotion && h.spots.length) {
        this.emberTime = (this.emberTime || 0) + dt;
        const t = this.emberTime, gs = this.glowSprite || (this.glowSprite = (() => {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 64;
          const c = cv.getContext("2d"), gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
          gr.addColorStop(0, "rgba(255,170,80,1)");
          gr.addColorStop(.35, "rgba(240,90,20,0.45)");
          gr.addColorStop(1, "rgba(200,40,0,0)");
          c.fillStyle = gr;
          c.fillRect(0, 0, 64, 64);
          return cv;
        })());
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const sp of h.spots) {
          const f = .5 + .5 * Math.sin(t * sp.speed + sp.phase) * Math.sin(t * sp.speed * .37 + sp.phase * 2);
          ctx.globalAlpha = .18 + .5 * f;
          const rr = sp.r * s * (.8 + .4 * f);
          ctx.drawImage(gs, X(sp.x) - rr, Y(sp.y) - rr, rr * 2, rr * 2);
        }
        ctx.restore();
      }
      if (!reduceMotion && (h.scars.length || h.spots.length)) {
        const E = this.embers || (this.embers = []);
        if (dt > 0) {
          this.emberClock = (this.emberClock || 0) + dt * 9;
          while (this.emberClock >= 1) {
            this.emberClock -= 1;
            const sc = h.scars[Math.floor(Math.random() * h.scars.length)], pt = sc[Math.floor(Math.random() * sc.length)];
            E.push({
              x: pt.x,
              y: pt.y,
              vx: (Math.random() - .5) * .5,
              vy: -.25 - Math.random() * .45,
              life: 0,
              max: 1.6 + Math.random() * 2.2,
              r: .6 + Math.random() * .9
            });
          }
          this.treeEmberClock = (this.treeEmberClock || 0) + dt * 6;
          while (this.treeEmberClock >= 1 && h.spots.length) {
            this.treeEmberClock -= 1;
            const sp = h.spots[Math.floor(Math.random() * h.spots.length)];
            E.push({
              x: sp.x,
              y: sp.y,
              vx: (Math.random() - .5) * .4,
              vy: -.2 - Math.random() * .35,
              life: 0,
              max: 1.4 + Math.random() * 2,
              r: .5 + Math.random() * .7
            });
          }
          for (const e of E) {
            e.life += dt;
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            e.vx += (Math.random() - .5) * dt * .6;
          }
          for (let i = E.length - 1; i >= 0; i--) if (E[i].life >= E[i].max) E.splice(i, 1);
        }
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const e of E) {
          const k = e.life / e.max, a = Math.sin(Math.PI * k) * .6;
          ctx.fillStyle = `rgba(255,${Math.round(150 - 80 * k)},40,${a})`;
          ctx.beginPath();
          ctx.arc(X(e.x), Y(e.y), e.r * this.dpr * (1 - .4 * k), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    buildHollow(W, H, s, key) {
      const E = this.g.enc, aw = E.width, ah = E.height, rnd = seeded(1977);
      const M = Math.ceil(Math.max((W - aw * s) / 2, (H - ah * s) / 2, 0) / s) + 8;
      const cv = document.createElement("canvas");
      cv.width = Math.ceil((aw + 2 * M) * s);
      cv.height = Math.ceil((ah + 2 * M) * s);
      const c = cv.getContext("2d"), X = x => (x + M) * s, Y = y => (y + M) * s, d = this.dpr;
      const R = (a, b) => a + rnd() * (b - a), inArena = (x, y, pad) => x > pad && x < aw - pad && y > pad && y < ah - pad;
      const blob = (x, y, r, col, a) => {
        const gr = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * s);
        gr.addColorStop(0, `rgba(${col},${a})`);
        gr.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = gr;
        c.fillRect(X(x - r), Y(y - r), 2 * r * s, 2 * r * s);
      };
      c.fillStyle = "#0c0b09";
      c.fillRect(0, 0, cv.width, cv.height);
      const cx = aw / 2, cy = ah / 2;
      c.save();
      c.translate(X(cx), Y(cy));
      c.scale(1, ah / aw);
      const cl = c.createRadialGradient(0, 0, 0, 0, 0, (aw / 2 + 4) * s);
      cl.addColorStop(0, "#1d1a15");
      cl.addColorStop(.72, "#191612");
      cl.addColorStop(.92, "#12100d");
      cl.addColorStop(1, "rgba(12,11,9,0)");
      c.fillStyle = cl;
      c.beginPath();
      c.arc(0, 0, (aw / 2 + 4) * s, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.fillStyle = "rgba(25,22,18,0.85)";
      c.fillRect(X(1), Y(1), (aw - 2) * s, (ah - 2) * s);
      for (let i = 0; i < 170; i++) {
        const x = R(-2, aw + 2), y = R(-2, ah + 2), t = rnd();
        if (t < .32) blob(x, y, R(1.5, 5), "58,54,48", R(.18, .32)); else if (t < .6) blob(x, y, R(1.5, 6), "6,5,4", R(.3, .5)); else if (t < .82) blob(x, y, R(1.2, 4), "38,48,28", R(.14, .26)); else blob(x, y, R(1.2, 3.5), "66,36,20", R(.12, .22));
      }
      for (let i = 0; i < 7; i++) {
        const x = R(6, aw - 6), y = R(5, ah - 5), r = R(2, 4.2);
        blob(x, y, r * 1.25, "4,3,2", .55);
        c.strokeStyle = "rgba(70,60,50,0.18)";
        c.lineWidth = 1.5 * d;
        c.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = k / 24 * Math.PI * 2, rr = r * (.9 + rnd() * .2);
          k ? c.lineTo(X(x + Math.cos(a) * rr), Y(y + Math.sin(a) * rr)) : c.moveTo(X(x + Math.cos(a) * rr), Y(y + Math.sin(a) * rr));
        }
        c.stroke();
      }
      for (let i = 0; i < 2200; i++) {
        const x = R(-1, aw + 1), y = R(-1, ah + 1), v = Math.round(R(40, 95));
        c.fillStyle = `rgba(${v},${v - 4},${v - 10},${R(.08, .28)})`;
        c.fillRect(X(x), Y(y), R(.6, 1.8) * d, R(.6, 1.8) * d);
      }
      for (let i = 0; i < 90; i++) {
        const x = R(1, aw - 1), y = R(1, ah - 1), n = 4 + Math.floor(rnd() * 5);
        c.strokeStyle = `rgba(${Math.round(R(60, 85))},${Math.round(R(60, 75))},${Math.round(R(34, 44))},${R(.12, .28)})`;
        c.lineWidth = 1 * d;
        c.beginPath();
        for (let k = 0; k < n; k++) {
          const a = R(0, Math.PI * 2), l = R(.25, .6);
          c.moveTo(X(x), Y(y));
          c.lineTo(X(x + Math.cos(a) * l), Y(y + Math.sin(a) * l));
        }
        c.stroke();
      }
      for (let i = 0; i < 40; i++) {
        const x = R(1, aw - 1), y = R(1, ah - 1), a = R(0, Math.PI * 2), l = R(.8, 2.2);
        c.strokeStyle = "rgba(14,10,8,0.8)";
        c.lineWidth = R(1.5, 3) * d;
        c.lineCap = "round";
        c.beginPath();
        c.moveTo(X(x), Y(y));
        c.lineTo(X(x + Math.cos(a) * l), Y(y + Math.sin(a) * l));
        const f = R(.3, .7), b = a + R(-.9, .9);
        c.moveTo(X(x + Math.cos(a) * l * f), Y(y + Math.sin(a) * l * f));
        c.lineTo(X(x + Math.cos(a) * l * f + Math.cos(b) * l * .35), Y(y + Math.sin(a) * l * f + Math.sin(b) * l * .35));
        c.stroke();
      }
      const NOOP = new Proxy({}, {
        get: () => () => {},
        set: () => true
      });
      const paintScars = (cc, keep, forks) => {
        const out = [], starts = [], rs = seeded(2026), RS = (a, b) => a + rs() * (b - a);
        const walk = (x, y, a, len, seg, jag, Rn = RS) => {
          const pts = [ {
            x: x,
            y: y
          } ];
          let done = 0, head = a;
          while (done < len) {
            head += Rn(-.12, .12);
            const l = Rn(seg * .6, seg * 1.4), t = head + Rn(-jag, jag);
            x += Math.cos(t) * l;
            y += Math.sin(t) * l;
            done += l;
            if (!inArena(x, y, 1.2)) break;
            pts.push({
              x: x,
              y: y
            });
          }
          return pts;
        };
        const outline = (pts, wAt, Rn) => {
          const L = [], Rr = [], n = pts.length;
          for (let k = 0; k < n; k++) {
            const p0 = pts[Math.max(0, k - 1)], p1 = pts[Math.min(n - 1, k + 1)], dx = p1.x - p0.x, dy = p1.y - p0.y, dl = Math.hypot(dx, dy) || 1;
            const w = wAt(k / (n - 1)) * Rn(.7, 1.3) / 2, nx = -dy / dl * w, ny = dx / dl * w;
            L.push([ X(pts[k].x + nx), Y(pts[k].y + ny) ]);
            Rr.push([ X(pts[k].x - nx), Y(pts[k].y - ny) ]);
          }
          cc.beginPath();
          L.concat(Rr.reverse()).forEach(([px, py], k) => k ? cc.lineTo(px, py) : cc.moveTo(px, py));
          cc.closePath();
        };
        const crack = (pts, maxW, kind, Rn = RS) => {
          const wAt = kind === "main" ? t => maxW * Math.pow(Math.sin(Math.PI * t), .75) : kind === "arm" ? t => maxW * Math.pow(1 - t, .8) : t => maxW * Math.pow(1 - t, .9);
          const hot = kind !== "branch";
          cc.lineJoin = "miter";
          outline(pts, wAt, Rn);
          cc.fillStyle = "rgba(7,5,4,0.88)";
          cc.fill();
          cc.save();
          cc.shadowColor = "rgba(255,80,20,0.45)";
          cc.shadowBlur = .35 * s;
          outline(pts, t => wAt(t) * .5, Rn);
          cc.fillStyle = hot ? "rgba(200,75,22,0.5)" : "rgba(180,62,18,0.38)";
          cc.fill();
          cc.restore();
          if (hot) {
            const mid = kind === "main" ? pts.slice(Math.floor(pts.length * .25), Math.ceil(pts.length * .75)) : pts.slice(0, Math.ceil(pts.length * .5));
            cc.save();
            cc.globalCompositeOperation = "lighter";
            cc.strokeStyle = "rgba(255,175,95,0.32)";
            cc.lineWidth = Math.max(1, .03 * s);
            cc.lineJoin = "round";
            cc.beginPath();
            mid.forEach((p, k) => k ? cc.lineTo(X(p.x), Y(p.y)) : cc.moveTo(X(p.x), Y(p.y)));
            cc.stroke();
            cc.restore();
          }
          cc.strokeStyle = "rgba(120,104,88,0.1)";
          cc.lineWidth = Math.max(1, .03 * s);
          cc.lineJoin = "miter";
          cc.beginPath();
          pts.forEach((p, k) => {
            const o = wAt(k / (pts.length - 1)) * .6;
            k ? cc.lineTo(X(p.x - o * .5), Y(p.y - o)) : cc.moveTo(X(p.x - o * .5), Y(p.y - o));
          });
          cc.stroke();
        };
        for (let i = 0; i < 10; i++) {
          const real = cc !== NOOP && keep.has(i), saved = cc;
          if (cc !== NOOP && !real) cc = NOOP;
          let x, y, tries = 0, ok;
          do {
            x = RS(4, aw - 4);
            y = RS(3, ah - 3);
            tries++;
            ok = Math.hypot(x - E.playerStart.x, y - E.playerStart.y) >= 7 && Math.hypot(x - aw * .7, y - ah / 2) >= 6 && starts.every(p => Math.hypot(x - p.x, y - p.y) >= 9);
          } while (!ok && tries < 80);
          starts.push({
            x: x,
            y: y
          });
          const a = RS(0, Math.PI * 2), pts = walk(x, y, a, RS(5.5, 10), .4, .55);
          if (pts.length < 6) {
            cc = saved;
            continue;
          }
          const maxW = RS(.3, .44);
          const branches = [];
          for (let k = 2; k < pts.length - 2; k++) if (rs() < .22) {
            const p = pts[k], q = pts[k + 1], h = Math.atan2(q.y - p.y, q.x - p.x) + (rs() < .5 ? -1 : 1) * RS(.5, 1.1);
            const b = walk(p.x, p.y, h, RS(1.2, 3.2), .3, .5);
            if (b.length > 2) branches.push([ b, maxW * RS(.35, .55) ]);
            if (b.length > 4 && rs() < .5) {
              const m = b[2], h2 = h + (rs() < .5 ? -1 : 1) * RS(.5, 1);
              const b2 = walk(m.x, m.y, h2, RS(.6, 1.5), .25, .5);
              if (b2.length > 2) branches.push([ b2, maxW * .22 ]);
            }
          }
          cc.strokeStyle = "rgba(8,6,5,0.4)";
          cc.lineWidth = Math.max(1, .025 * s);
          cc.lineJoin = "miter";
          for (let k = 1; k < pts.length - 1; k++) if (rs() < .35) {
            const p = pts[k], hl = walk(p.x, p.y, RS(0, Math.PI * 2), RS(.4, 1.3), .2, .6);
            cc.beginPath();
            hl.forEach((q, m) => m ? cc.lineTo(X(q.x), Y(q.y)) : cc.moveTo(X(q.x), Y(q.y)));
            cc.stroke();
          }
          const all = [ pts ].concat(branches.map(b => b[0]));
          if (real && forks.has(i)) {
            const rf = seeded(700 + i), RF = (lo, hi) => lo + rf() * (hi - lo), k = Math.floor(pts.length * RF(.4, .55)), p = pts[k], q = pts[k + 1];
            const h = Math.atan2(q.y - p.y, q.x - p.x) + (rf() < .5 ? -1 : 1) * RF(.8, 1.1);
            const arm = walk(p.x, p.y, h, (pts.length - k) * .4 * RF(.75, 1), .4, .55, RF);
            if (arm.length > 3) {
              crack(arm, maxW * Math.pow(Math.sin(Math.PI * k / (pts.length - 1)), .75) * .85, "arm", RF);
              all.push(arm);
            }
          }
          for (const [b, w] of branches) crack(b, w, "branch");
          crack(pts, maxW, "main");
          out.push({
            i: i,
            pts: pts,
            all: all
          });
          cc = saved;
        }
        return out;
      };
      const laid = paintScars(NOOP, new Set, new Set);
      for (const a of laid) a.flat = a.all.flat();
      const gap = (a, b) => {
        let m = Infinity;
        for (const p of a.flat) for (const q of b.flat) {
          const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
          if (d2 < m) m = d2;
        }
        return Math.sqrt(m);
      };
      const gaps = new Map, gapOf = (a, b) => {
        const k = a.i < b.i ? a.i + ":" + b.i : b.i + ":" + a.i;
        if (!gaps.has(k)) gaps.set(k, gap(a, b));
        return gaps.get(k);
      };
      let left = laid.slice();
      for (let n = 0; n < 3; n++) {
        const near = left.map(a => left.filter(b => b !== a).map(b => gapOf(a, b)).sort((u, v) => u - v));
        let pick = 0;
        for (let k = 1; k < left.length; k++) {
          const A = near[k], B = near[pick];
          if (A[0] < B[0] - 1e-9 || Math.abs(A[0] - B[0]) < 1e-9 && A[1] < B[1]) pick = k;
        }
        left.splice(pick, 1);
      }
      const forks = new Set(left.slice().sort((a, b) => b.pts.length - a.pts.length).slice(0, 2).map(a => a.i));
      const scars = paintScars(c, new Set(left.map(a => a.i)), forks).filter(a => left.some(b => b.i === a.i)).flatMap(a => a.all.slice(0, 1).concat(a.all.length > 1 && forks.has(a.i) ? [ a.all[a.all.length - 1] ] : []));
      const edge = (x0, y0, x1, y1) => {
        const gr = c.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1));
        gr.addColorStop(0, "rgba(8,7,6,0.75)");
        gr.addColorStop(1, "rgba(8,7,6,0)");
        return gr;
      };
      const band = 3;
      c.fillStyle = edge(0, 0, 0, band);
      c.fillRect(X(-M), Y(-M), (aw + 2 * M) * s, (M + band) * s);
      c.fillStyle = edge(0, ah, 0, ah - band);
      c.fillRect(X(-M), Y(ah - band), (aw + 2 * M) * s, (M + band) * s);
      c.fillStyle = edge(0, 0, band, 0);
      c.fillRect(X(-M), Y(-M), (M + band) * s, (ah + 2 * M) * s);
      c.fillStyle = edge(aw, 0, aw - band, 0);
      c.fillRect(X(aw - band), Y(-M), (M + band) * s, (ah + 2 * M) * s);
      const trees = [];
      for (let row = 0; row < 6; row++) {
        const out = -.6 + row * 2.8, step = 3.6 + row * .5;
        const ring = [];
        for (let x = -out; x <= aw + out; x += step) {
          ring.push([ x, -out ]);
          ring.push([ x, ah + out ]);
        }
        for (let y = -out + step; y <= ah + out - step; y += step) {
          ring.push([ -out, y ]);
          ring.push([ aw + out, y ]);
        }
        for (const [x, y] of ring) if (rnd() < .9) trees.push({
          x: x + R(-1.4, 1.4),
          y: y + R(-1.4, 1.4),
          r: R(1.8, 3.8) + row * .3,
          row: row
        });
      }
      for (let i = 0; i < 6; i++) {
        const side = Math.floor(rnd() * 4);
        trees.push({
          x: side === 0 ? R(.3, 1.2) : side === 1 ? aw - R(.3, 1.2) : R(4, aw - 4),
          y: side === 2 ? R(.3, 1.2) : side === 3 ? ah - R(.3, 1.2) : R(4, ah - 4),
          r: R(1.4, 2.2),
          row: 0
        });
      }
      trees.sort((a, b) => b.row - a.row);
      const spots = [], re = seeded(451);
      const vx0 = M * s - (W - aw * s) / 2 - s, vy0 = M * s - (H - ah * s) / 2 - s, vx1 = vx0 + W + 2 * s, vy1 = vy0 + H + 2 * s;
      const fitsX = aw * s <= W, fitsY = ah * s <= H, BLANK = new Proxy({}, {
        get: () => () => BLANK,
        set: () => true
      });
      for (const t of trees) {
        const tip = t.row <= 2 && re() < .35 ? [] : null, tx = X(t.x), ty = Y(t.y), reach = t.r * s * 1.9;
        const seen = (!fitsX || tx + reach > vx0 && tx - reach < vx1) && (!fitsY || ty + reach > vy0 && ty - reach < vy1);
        this.drawDeadTree(seen ? c : BLANK, tx, ty, t.r * s, t.row, rnd, d, tip, re);
        if (tip && !seen) for (let k = Math.min(3, tip.length); k > 0; k--) {
          re();
          re();
          re();
        }
        if (tip && seen) for (const p of tip.slice(0, 3)) {
          const sp = {
            x: p.x / s - M,
            y: p.y / s - M,
            r: .32 + re() * .3,
            speed: 1.2 + re() * 2.2,
            phase: re() * 6.3
          };
          spots.push(sp);
          const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, sp.r * s);
          gr.addColorStop(0, "rgba(255,140,60,0.55)");
          gr.addColorStop(.4, "rgba(200,60,15,0.25)");
          gr.addColorStop(1, "rgba(160,30,0,0)");
          c.fillStyle = gr;
          c.fillRect(p.x - sp.r * s, p.y - sp.r * s, sp.r * 2 * s, sp.r * 2 * s);
          c.fillStyle = "rgba(255,190,110,0.8)";
          c.beginPath();
          c.arc(p.x, p.y, Math.max(1, .05 * s), 0, Math.PI * 2);
          c.fill();
        }
      }
      const vg = c.createRadialGradient(X(cx), Y(cy), Math.min(aw, ah) * .5 * s, X(cx), Y(cy), (Math.max(aw, ah) / 2 + M) * s);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.65)");
      c.fillStyle = vg;
      c.fillRect(0, 0, cv.width, cv.height);
      return {
        key: key,
        cv: cv,
        M: M,
        scars: scars,
        spots: spots
      };
    }
    drawDeadTree(c, x, y, r, row, rnd, d, tip, re) {
      const R = (a, b) => a + rnd() * (b - a), shade = Math.max(.35, 1 - row * .13);
      const col = v => `rgb(${Math.round(v[0] * shade)},${Math.round(v[1] * shade)},${Math.round(v[2] * shade)})`;
      const bark = col([ 36, 28, 22 ]), light = col([ 70, 56, 44 ]);
      c.save();
      c.lineCap = "round";
      c.lineJoin = "round";
      const sx = x + r * .22, sy = y + r * .28, sg = c.createRadialGradient(sx, sy, 0, sx, sy, r * 1.05);
      sg.addColorStop(0, "rgba(0,0,0,0.4)");
      sg.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = sg;
      c.fillRect(sx - r * 1.05, sy - r * 1.05, r * 2.1, r * 2.1);
      const barkSegs = new Map, lightSegs = new Map;
      const seg = (m, w, x0, y0, x1, y1) => {
        const k = Math.round(w * 4) / 4;
        let a = m.get(k);
        if (!a) m.set(k, a = []);
        a.push(x0, y0, x1, y1);
      };
      const flush = (m, style, alpha) => {
        c.strokeStyle = style;
        c.globalAlpha = alpha;
        for (const [w, a] of m) {
          c.lineWidth = w;
          c.beginPath();
          for (let i = 0; i < a.length; i += 4) {
            c.moveTo(a[i], a[i + 1]);
            c.lineTo(a[i + 2], a[i + 3]);
          }
          c.stroke();
        }
        c.globalAlpha = 1;
      };
      const limb = (x0, y0, a, len, w, depth) => {
        const n = 5, bend = R(-.22, .22);
        let px = x0, py = y0;
        for (let k = 0; k < n; k++) {
          a += bend + R(-.28, .28);
          const nx = px + Math.cos(a) * len / n, ny = py + Math.sin(a) * len / n, ww = Math.max(.7 * d, w * (1 - k / n * .75));
          seg(barkSegs, ww, px, py, nx, ny);
          if (ww > 1.6 * d) seg(lightSegs, ww * .3, px - ww * .15, py - ww * .15, nx - ww * .15, ny - ww * .15);
          if (tip && k >= 2 && re() < .12) tip.push({
            x: nx,
            y: ny
          });
          if (depth > 0 && k >= 1 && k < n - 1 && rnd() < .5) limb(nx, ny, a + (rnd() < .5 ? -1 : 1) * R(.45, 1), len * R(.35, .6), ww * .7, depth - 1);
          px = nx;
          py = ny;
        }
      };
      const n = 3 + Math.floor(rnd() * 3);
      let a = R(0, Math.PI * 2);
      for (let i = 0; i < n; i++) {
        limb(x, y, a, r * R(.55, 1.1), Math.max(1.6 * d, r * .12), 3);
        a += R(.9, 2.3);
      }
      flush(barkSegs, bark, 1);
      flush(lightSegs, light, .35);
      c.fillStyle = bark;
      c.beginPath();
      for (let k = 0; k <= 9; k++) {
        const t = k / 9 * Math.PI * 2, rr = r * .13 * R(.75, 1.25);
        k ? c.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr) : c.moveTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr);
      }
      c.closePath();
      c.fill();
      c.restore();
    }
    drawWindTrail(p, X, Y, s, dt) {
      const T = this.windTrail || (this.windTrail = []), on = !p.dead && p.auras.some(a => a.id === "wind_walk"), t = this.g.time;
      if (on && (!T.length || Math.hypot(T[T.length - 1].x - p.x, T[T.length - 1].y - p.y) > .35)) T.push({
        x: p.x,
        y: p.y,
        t: t
      });
      while (T.length && t - T[0].t > .45) T.shift();
      const ctx = this.ctx;
      for (const g of T) {
        const k = 1 - (t - g.t) / .45;
        ctx.fillStyle = `rgba(200,225,255,${.22 * k})`;
        ctx.beginPath();
        ctx.arc(X(g.x), Y(g.y), p.radius * s * (.7 + .3 * k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    portrait(src) {
      const c = this.portraits || (this.portraits = {});
      if (!c[src]) {
        const im = new Image;
        im.src = src;
        c[src] = im;
      }
      return c[src].complete && c[src].naturalWidth ? c[src] : null;
    }
    drawPortrait(img, cx, cy, r, flash, tint) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
      if (tint) {
        ctx.fillStyle = tint;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(.75, flash * 6)})`;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    drawPlayer(p, X, Y, s) {
      const ctx = this.ctx, g = this.g;
      const windWalk = p.auras.some(a => a.id === "wind_walk");
      ctx.save();
      if (windWalk) ctx.globalAlpha = .45;
      this.drawPlayerBody(p, X, Y, s);
      ctx.restore();
    }
    drawPlayerBody(p, X, Y, s) {
      const ctx = this.ctx, g = this.g;
      const meta = p.auras.some(a => a.id === "metamorphosis");
      const metaAura = p.auras.find(a => a.id === "metamorphosis"), infernal = !!(metaAura && metaAura.mods && metaAura.mods.schoolOverride);
      const felForm = false;
      const voidForm = meta && !infernal;
      const r = p.radius * s * (meta ? 1.3 : 1);
      const cx = X(p.x), cy = Y(p.y) - (p.hop || 0) * 1.6 * s;
      if (p.channel && (p.channel.kind === "restoreMana" || p.channel.kind === "regen")) {
        const d = this.dpr, breath = .5 + .5 * Math.sin(g.time * 3), R = r * (2.2 + breath * .9);
        const gl = ctx.createRadialGradient(cx, cy, r * .8, cx, cy, R);
        gl.addColorStop(0, `rgba(127,178,255,${.28 + .12 * breath})`);
        gl.addColorStop(1, "rgba(127,178,255,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(170,205,255,${.35 + .35 * breath})`;
        ctx.lineWidth = 1.5 * d;
        ctx.beginPath();
        ctx.arc(cx, cy, R * .8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 10; i++) {
          const ph = (g.time * .7 + i / 10) % 1, a = i * 2.39996 + g.time * .4, dist = r * (3.4 - 2.6 * ph);
          ctx.fillStyle = `rgba(160,205,255,${Math.sin(Math.PI * ph) * .9})`;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, (1.6 + ph) * d, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (p.channel && p.channel.kind === "cast") {
        const k = 1 - Math.max(0, p.channel.remaining / p.channel.total);
        ctx.strokeStyle = `rgba(111,180,255,${.35 + .55 * k})`;
        ctx.lineWidth = (2 + 2 * k) * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * (3.2 - 1.9 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(150,205,255,${.1 + .25 * k})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.channel && p.channel.kind === "aoe") {
        const rr = g.abilityTune(p.channel.ab.id).radius * s;
        ctx.strokeStyle = "rgba(230,230,245,0.55)";
        ctx.lineWidth = 3 * this.dpr;
        for (let i = 0; i < 4; i++) {
          const a = p.channel.spin + i * Math.PI / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, rr * .8, a, a + .5);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(152,72,179,0.35)";
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (meta) {
        ctx.fillStyle = voidForm ? "rgba(90,30,140,0.24)" : felForm ? "rgba(80,255,60,0.18)" : "rgba(255,120,40,0.20)";
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = voidForm ? "rgba(76,30,110,0.92)" : felForm ? "rgba(10,50,8,0.88)" : "rgba(70,18,8,0.88)";
        for (const side of [ -1, 1 ]) {
          const a = p.facing + Math.PI + side * .9;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a - side * .5) * r * 2.4, cy + Math.sin(a - side * .5) * r * 2.4);
          ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6);
          ctx.closePath();
          ctx.fill();
        }
      }
      const felStage = (p.auras.find(a => a.id === "burning_blades") || {}).stage || 0;
      const ablaze = felStage > 0 || meta && infernal;
      const fel = felForm;
      ctx.strokeStyle = fel ? "#7dff6a" : meta && infernal ? "#ffb347" : ablaze ? "#ffb347" : voidForm ? "#b48ae0" : "#e4e4e4";
      ctx.lineWidth = (ablaze ? 3.5 + felStage * .5 : 3) * this.dpr;
      ctx.lineCap = "round";
      if (felStage && !fel && !(meta && infernal)) ctx.strokeStyle = [ "#ffb347", "#ff8a2a", "#ff5a1a" ][felStage - 1] || "#ff5a1a";
      if (ablaze) {
        ctx.shadowColor = fel ? "#2bd62b" : "#ff6a1f";
        ctx.shadowBlur = (12 + felStage * 6) * this.dpr;
      }
      for (const side of [ -1, 1 ]) {
        const a = p.facing + side * .75;
        const bx = cx + Math.cos(a) * r * .9, by = cy + Math.sin(a) * r * .9;
        const ta = p.facing + side * .25;
        const ex = bx + Math.cos(ta) * r * 1.2, ey = by + Math.sin(ta) * r * 1.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        if (ablaze) for (let i = 0; i < 4 + felStage * 3; i++) {
          const f = Math.random(), fx = bx + (ex - bx) * f, fy = by + (ey - by) * f, up = (2 + Math.random() * (6 + felStage * 3)) * this.dpr;
          ctx.fillStyle = fel ? `rgba(${60 + Math.random() * 80 | 0},255,${40 + Math.random() * 60 | 0},${.5 + Math.random() * .5})` : `rgba(255,${120 + Math.random() * 110 | 0},40,${.5 + Math.random() * .5})`;
          ctx.fillRect(fx + (Math.random() - .5) * 4 * this.dpr, fy - up, 2.5 * this.dpr, 2.5 * this.dpr);
        }
      }
      ctx.shadowBlur = 0;
      ctx.lineCap = "butt";
      const pimg = p.kind === "player" && g.cls.portrait ? meta && !p.image ? this.portrait("icons/metamorphosis.webp") || this.portrait(g.cls.portrait) : this.portrait(g.cls.portrait) : null;
      if (pimg) this.drawPortrait(pimg, cx, cy, r, p.flash, p.image ? "rgba(60,120,230,0.5)" : null); else {
        ctx.fillStyle = p.flash > 0 ? "#ffffff" : voidForm ? "#3a1458" : meta ? fel ? "#1f5a14" : "#7a2410" : p.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = voidForm ? "#9b5cd6" : meta ? fel ? "#7dff6a" : "#ff8a2a" : p.image ? "#5f8fe0" : "#6a2d94";
      ctx.lineWidth = (pimg ? 2.5 : 2) * this.dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      if (p.auras.some(a => a.id === "demonic_skin")) {
        ctx.save();
        ctx.strokeStyle = "#7dff6a";
        ctx.lineWidth = 3 * this.dpr;
        ctx.shadowColor = "#2bd62b";
        ctx.shadowBlur = 10 * this.dpr;
        for (let i = 0; i < 6; i++) {
          const a0 = i * Math.PI / 3 + .12;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.32, a0, a0 + Math.PI / 3 - .24);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (!pimg) {
        ctx.strokeStyle = "#2a0f36";
        ctx.lineWidth = 3 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * .62, p.facing - .7, p.facing + .7);
        ctx.stroke();
      }
    }
    drawEnemy(e, X, Y, s) {
      const ctx = this.ctx, cx = X(e.x), cy = Y(e.y), r = e.radius * s;
      if (this.g.isStunned(e)) {
        ctx.fillStyle = "#e8c46a";
        for (let i = 0; i < 3; i++) {
          const a = this.g.time * 5 + i * 2.09;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * .9, cy - r * 1.05 + Math.sin(a) * r * .3, 2.5 * this.dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const shackled = (e.shackledUntil || 0) > this.g.time;
      if (shackled) {
        const t = this.g.time, d = this.dpr, R = r * 2.1;
        ctx.save();
        const gl = ctx.createRadialGradient(cx, cy, r * .6, cx, cy, R * 1.1);
        gl.addColorStop(0, "rgba(80,150,255,0.0)");
        gl.addColorStop(.75, "rgba(80,150,255,0.18)");
        gl.addColorStop(1, "rgba(80,150,255,0)");
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "#5aa0ff";
        ctx.shadowBlur = 10 * d;
        ctx.strokeStyle = "rgba(140,195,255,0.9)";
        ctx.lineWidth = 2 * d;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(140,195,255,0.45)";
        ctx.lineWidth = 1 * d;
        ctx.beginPath();
        ctx.arc(cx, cy, R * .86, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(190,225,255,0.95)";
        for (let i = 0; i < 6; i++) {
          const a = t * .6 + i * Math.PI / 3, rx = cx + Math.cos(a) * R * .93, ry = cy + Math.sin(a) * R * .93, z = 3.2 * d;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(a);
          ctx.beginPath();
          ctx.moveTo(0, -z);
          ctx.lineTo(z * .6, 0);
          ctx.lineTo(0, z);
          ctx.lineTo(-z * .6, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.shadowBlur = 6 * d;
        ctx.strokeStyle = "rgba(170,210,255,0.95)";
        ctx.lineWidth = 1.6 * d;
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + i * 2 * Math.PI / 3 + Math.sin(t * 2 + i) * .04, x0 = cx + Math.cos(a) * r * 1.05, y0 = cy + Math.sin(a) * r * 1.05, x1 = cx + Math.cos(a) * R, y1 = cy + Math.sin(a) * R;
          const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / (5 * d)));
          for (let k = 0; k < n; k++) {
            const u = (k + .5) / n, lx = x0 + (x1 - x0) * u, ly = y0 + (y1 - y0) * u;
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(a);
            ctx.beginPath();
            if (k % 2) ctx.ellipse(0, 0, 3 * d, 1.6 * d, 0, 0, Math.PI * 2); else {
              ctx.moveTo(-3 * d, 0);
              ctx.lineTo(3 * d, 0);
            }
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.restore();
      }
      if (e.veiled) {
        const pulse = 1.55 + Math.sin(this.g.time * 5) * .08;
        ctx.fillStyle = "rgba(120,70,200,0.22)";
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(190,150,255,0.85)";
        ctx.lineWidth = 2.5 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.color;
      if (e.type === "dummy" && !e.def.portrait) {
        ctx.fillRect(cx - r * .8, cy - r, r * 1.6, r * 2);
        ctx.strokeStyle = "#3b2a18";
        ctx.lineWidth = 3 * this.dpr;
        ctx.strokeRect(cx - r * .8, cy - r, r * 1.6, r * 2);
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.4, cy - r * .3);
        ctx.lineTo(cx + r * 1.4, cy - r * .3);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy + r * .2, r * .35, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = e.flash > 0 ? "#ffffff" : "#2b2220";
      for (const side of [ -1, 1 ]) {
        const a = e.facing + side * .8;
        const hx = cx + Math.cos(a) * r * .8, hy = cy + Math.sin(a) * r * .8;
        ctx.beginPath();
        ctx.moveTo(hx - 3 * this.dpr, hy);
        ctx.lineTo(hx + 3 * this.dpr, hy);
        ctx.lineTo(hx + Math.cos(e.facing) * r * .7, hy + Math.sin(e.facing) * r * .7 - r * .3);
        ctx.closePath();
        ctx.fill();
      }
      const eimg = e.def.portrait ? this.portrait(e.def.portrait) : null;
      if (eimg) {
        this.drawPortrait(eimg, cx, cy, r, e.flash, null);
        ctx.strokeStyle = e.def.elite ? "#e8c46a" : e.def.ring || e.color;
        ctx.lineWidth = (e.def.elite ? 3.5 : 3) * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = e.flash > 0 ? "#ffffff" : e.color;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = e.def.elite ? "#e8c46a" : "rgba(0,0,0,0.5)";
        ctx.lineWidth = (e.def.elite ? 3 : 2) * this.dpr;
        ctx.stroke();
        ctx.fillStyle = e.type === "imp" ? "#ffe45a" : "#b6ff5a";
        for (const side of [ -1, 1 ]) {
          const a = e.facing + side * .45;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55, Math.max(1.5, r * .13), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (shackled) {
        const d = this.dpr, pulse = .75 + .25 * Math.sin(this.g.time * 6);
        ctx.save();
        ctx.shadowColor = "#5aa0ff";
        ctx.shadowBlur = 12 * d;
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(150,205,255,${pulse})`;
        ctx.lineWidth = 3.5 * d;
        for (const [a0, a1] of [ [ -2.6, -.55 ], [ .55, 2.6 ] ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.12, a0, a1);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(235,245,255,0.9)";
        ctx.lineWidth = 1.2 * d;
        for (const [a0, a1] of [ [ -2.6, -.55 ], [ .55, 2.6 ] ]) {
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.12, a0, a1);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (e.cast) {
        ctx.strokeStyle = e.cast.uninterruptible ? "rgba(170,176,186,0.9)" : "rgba(165,139,255,0.8)";
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.cast.elapsed / e.cast.total));
        ctx.stroke();
      }
    }
    drawPlayerBars(p, X, Y, s) {
      const ctx = this.ctx, g = this.g, d = this.dpr, w = Math.max(2.4, p.radius * 2.6) * s, h = 5 * d;
      const x = X(p.x) - w / 2, y = Y(p.y) - (p.hop || 0) * 1.6 * s - p.radius * s * 1.35 - 12 * d;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = "#3fae4a";
      ctx.fillRect(x, y, w * Math.max(0, p.hp / g.maxHp(p)), h);
      const mh = 3 * d;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x - 1, y + h + 1, w + 2, mh + 2);
      ctx.fillStyle = "#2f6fd6";
      ctx.fillRect(x, y + h + 2, w * Math.max(0, p.mana / g.maxMana(p)), mh);
      const rows = [];
      const ma = g.specStates && g.specStates.martial;
      if (ma && g.passiveOn && g.passiveOn("momentum") && ma.stacks > 0 && g.time <= ma.momUntil) rows.push({
        n: ma.stacks,
        color: "#f2ecff",
        edge: "#8f7ab8"
      });
      if (p.breakStacks > 0 && g.time < p.breakUntil) {
        const sb = g.tune.specs.spellbreaker, full = p.breakStacks >= (sb.scarStacks || sb.breakMaxStacks || 10);
        rows.push({
          n: p.breakStacks,
          color: full ? "#cfe6ff" : "#4f9bff",
          edge: "#123a7a"
        });
      }
      const fb = p.auras.find(a => a.id === "burning_blades");
      if (fb && fb.stage) {
        const max = g.tune.abilities.burning_blades && g.tune.abilities.burning_blades.maxStage || 3, full = fb.stage >= max;
        rows.push({
          n: fb.stage,
          color: full ? "#ffe2a6" : "#ff8a2a",
          edge: "#6a1a08"
        });
      }
      let ry = y - 8 * d;
      for (const r of rows) {
        const sz = 6 * d, gap = 2 * d, total = r.n * sz + (r.n - 1) * gap, sx = X(p.x) - total / 2;
        for (let i = 0; i < r.n; i++) {
          ctx.fillStyle = r.edge;
          ctx.fillRect(sx + i * (sz + gap) - d, ry - d, sz + 2 * d, sz + 2 * d);
          ctx.fillStyle = r.color;
          ctx.fillRect(sx + i * (sz + gap), ry, sz, sz);
        }
        ry -= sz + 4 * d;
      }
      const im = g.specId === "felblood" && p.auras.find(a => a.id === "immolation");
      if (im && im.duration) {
        const bh = 3 * d, by = ry + 6 * d - bh - 1 * d, f = Math.max(0, Math.min(1, im.remaining / im.duration));
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(x - 1, by - 1, w + 2, bh + 2);
        ctx.fillStyle = f < .25 ? "#ffd36b" : "#ff6a1a";
        ctx.fillRect(x, by, w * f, bh);
      }
    }
    drawBars(e, X, Y, s) {
      const ctx = this.ctx, g = this.g, w = Math.max(2.4, e.radius * 2.6) * s, h = 5 * this.dpr, d = this.dpr;
      const x = X(e.x) - w / 2;
      let y = Y(e.y) - e.radius * s - 12 * d - (e.def.hasMana ? 5 * d : 0);
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = e.aggro ? "#c8372d" : "#b8a13a";
      ctx.fillRect(x, y, w * Math.max(0, e.hp / g.maxHp(e)), h);
      if (e.brandUntil > g.time) {
        const bx = X(e.x), by = Y(e.y) - e.radius * s - 30 * d;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#9dff6a";
        ctx.strokeStyle = "#1d3a12";
        ctx.lineWidth = 2 * d;
        ctx.fillRect(-4 * d, -4 * d, 8 * d, 8 * d);
        ctx.strokeRect(-4 * d, -4 * d, 8 * d, 8 * d);
        ctx.restore();
      }
      if (e.def.hasMana) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(x - 1, y + h + 1, w + 2, 3 * d + 2);
        ctx.fillStyle = "#2f6fd6";
        ctx.fillRect(x, y + h + 2, w * Math.max(0, e.mana / g.maxMana(e)), 3 * d);
      }
      if (e.cast) {
        const cy = y - 9 * d;
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(x - 1, cy - 1, w + 2, h + 2);
        const frac = e.cast.channel ? 1 - e.cast.elapsed / e.cast.total : e.cast.elapsed / e.cast.total;
        ctx.fillStyle = e.cast.uninterruptible ? "#9aa0a8" : "#e8c46a";
        ctx.fillRect(x, cy, w * frac, h);
        ctx.textAlign = "center";
        ctx.font = `700 ${12 * d}px "Alegreya Sans", system-ui, sans-serif`;
        ctx.lineWidth = 3 * d;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(e.cast.name, X(e.x), cy - 4 * d);
        ctx.fillStyle = "#f2ede0";
        ctx.fillText(e.cast.name, X(e.x), cy - 4 * d);
      }
    }
  }
  TL.Renderer = Renderer;
})(window.TL);