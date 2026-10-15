(function(TL) {
  const {rand: rand, dist: dist} = TL.util;
  function moveToward(e, pt, speed, dt, stopAt = 0) {
    const dx = pt.x - e.x, dy = pt.y - e.y, d = Math.hypot(dx, dy);
    if (d <= stopAt || d < 1e-4) return true;
    const step = Math.min(d - stopAt, speed * dt);
    e.x += dx / d * step;
    e.y += dy / d * step;
    e.moving = true;
    e.facing = Math.atan2(dy, dx);
    return false;
  }
  function separate(g, e) {
    const p = g.player;
    if (!p.dead && !p.motion) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy), min = e.radius + p.radius;
      if (d > 0 && d < min) {
        e.x += dx / d * (min - d);
        e.y += dy / d * (min - d);
      }
    }
  }
  function foe(g, e) {
    const ds = g.cls.decoys ? g.cls.decoys(g) : [];
    if (!ds.length) {
      e.decoy = null;
      return g.player;
    }
    if (!e.decoy || e.decoy.dead || !ds.includes(e.decoy)) {
      let best = null, bd = Infinity;
      for (const d of ds) {
        const k = dist(e, d);
        if (k < bd) {
          bd = k;
          best = d;
        }
      }
      e.decoy = best;
    }
    return e.decoy;
  }
  function strike(g, e, tgt, amount, school, name, kind) {
    if (tgt === g.player) g.enemyHitPlayer(e, amount, school, name, kind); else if (!tgt.dead && g.cls.hitDecoy) g.cls.hitDecoy(g, tgt, e, amount, school, name, kind);
  }
  const spreadSpeed = .5;
  function spread(g, e, t, dt, center) {
    const p = center || g.player;
    if (p.dead || !g.inMelee(e, p)) return;
    const R = Math.hypot(e.x - p.x, e.y - p.y);
    if (R < .001) return;
    const a = Math.atan2(e.y - p.y, e.x - p.x), idx = g.enemies.indexOf(e);
    let push = 0;
    for (const o of g.enemies) {
      if (o === e || o.dead || !g.inMelee(o, p)) continue;
      const overlap = e.radius + o.radius - Math.hypot(e.x - o.x, e.y - o.y);
      if (overlap <= 0) continue;
      let diff = a - Math.atan2(o.y - p.y, o.x - p.x);
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const side = Math.abs(diff) > .001 ? Math.sign(diff) : idx < g.enemies.indexOf(o) ? 1 : -1;
      push += side * overlap;
    }
    if (!push) return;
    const step = Math.sign(push) * Math.min(Math.abs(push), (t.speed || 6) * spreadSpeed * dt);
    const na = a + step / R;
    e.x = p.x + Math.cos(na) * R;
    e.y = p.y + Math.sin(na) * R;
    e.facing = Math.atan2(p.y - e.y, p.x - e.x);
  }
  function goHome(g, e, t, dt) {
    e.cast = null;
    if (moveToward(e, e.home, t.speed, dt, .1)) {
      e.hp = g.maxHp(e);
      e.mana = g.maxMana(e);
      e.evading = false;
    }
  }
  function leashed(g, e) {
    const st = e.station, p = g.player;
    if (dist(e, st) > st.r || !g.playerInArea(st)) {
      g.evade(e);
      return true;
    }
    return p.dead;
  }
  function inArea(e, pt, margin = 1.5) {
    const st = e.station, dx = pt.x - st.x, dy = pt.y - st.y, d = Math.hypot(dx, dy), max = st.r - margin;
    return d <= max ? pt : {
      x: st.x + dx / d * max,
      y: st.y + dy / d * max
    };
  }
  function contact(e, p) {
    return e.radius + p.radius + .4;
  }
  function meleeAttack(g, e, t, dt, name, tgt) {
    tgt = tgt || g.player;
    e.attackTimer -= dt;
    if (e.attackTimer <= 0) {
      e.attackTimer = t.attackSpeed || t.speed;
      strike(g, e, tgt, rand(t.min, t.max), "physical", name, "melee");
      g.fx({
        kind: "slash",
        x: tgt.x,
        y: tgt.y,
        a: e.facing,
        color: "#ff6a5a",
        life: .15,
        max: .15
      });
    }
  }
  TL.ai.dummy = (g, e) => {
    e.facing = Math.atan2(g.player.y - e.y, g.player.x - e.x);
    if (!g.player.dead && dist(g.player, e) > 30) e.aggro = false;
  };
  TL.ai.caster = (g, e, dt) => {
    const p = foe(g, e), t = g.tune.enemies[e.type], sb = t.shadowBolt, s = e.state;
    if (!e.aggro) {
      goHome(g, e, t, dt);
      return;
    }
    if (leashed(g, e)) {
      e.aggro = false;
      return;
    }
    const d = dist(e, p);
    s.retreatCd = (s.retreatCd || 0) - dt;
    if (e.cast) {
      const ct = e.cast.tgt || p;
      e.facing = Math.atan2(ct.y - e.y, ct.x - e.x);
      e.cast.elapsed += dt;
      if (e.cast.elapsed >= e.cast.total) {
        e.mana -= e.cast.cost;
        const c = e.cast;
        e.cast = null;
        if (!ct.dead && dist(e, ct) <= sb.range) {
          g.fx({
            kind: "bolt",
            x: e.x,
            y: e.y,
            tx: ct.x,
            ty: ct.y,
            color: "#a58bff",
            life: .25,
            max: .25
          });
          strike(g, e, ct, rand(sb.min, sb.max), c.school, c.name, "spell");
        }
      }
      return;
    }
    if (s.retreat > 0) {
      s.retreat -= dt;
      const away = inArea(e, {
        x: e.x + (e.x - p.x) * 3,
        y: e.y + (e.y - p.y) * 3
      });
      moveToward(e, away, t.speed, dt);
      separate(g, e);
      return;
    }
    if (t.retreats && d < t.retreatTrigger && s.retreatCd <= 0) {
      s.retreat = t.retreatDuration;
      s.retreatCd = t.retreatCooldown;
      g.floater(e, "Retreats", "#b8c2b5", {
        small: true
      });
      return;
    }
    const locked = (e.schoolLocks.shadow || 0) > g.time;
    if (e.mana >= sb.cost && !locked) {
      if (d > sb.range) {
        moveToward(e, p, t.speed, dt);
        return;
      }
      if (g.time >= (s.nextCast || 0)) {
        e.cast = {
          name: "Shadow Bolt",
          school: "shadow",
          cost: sb.cost,
          total: sb.castTime,
          elapsed: 0,
          tgt: p
        };
        s.nextCast = g.time + rand(sb.repeatMin, sb.repeatMax);
        return;
      }
      e.facing = Math.atan2(p.y - e.y, p.x - e.x);
      return;
    }
    if (d > contact(e, p)) {
      moveToward(e, p, t.speed, dt, contact(e, p));
      separate(g, e);
    }
    if (g.inMelee(e, p)) meleeAttack(g, e, {
      min: t.melee.min,
      max: t.melee.max,
      attackSpeed: t.melee.speed
    }, dt, "Staff", p);
    spread(g, e, t, dt, p);
  };
  TL.ai.melee = (g, e, dt) => {
    const p = foe(g, e), t = g.tune.enemies[e.type];
    if (!e.aggro) {
      goHome(g, e, t, dt);
      return;
    }
    if (leashed(g, e)) {
      e.aggro = false;
      return;
    }
    if (dist(e, p) > contact(e, p)) moveToward(e, p, t.speed, dt, contact(e, p)); else e.facing = Math.atan2(p.y - e.y, p.x - e.x);
    if (g.inMelee(e, p)) meleeAttack(g, e, t, dt, "Claw", p);
    separate(g, e);
    spread(g, e, t, dt, p);
  };
  TL.ai.elite = (g, e, dt) => {
    const p = foe(g, e), t = g.tune.enemies[e.type], sp = t.special, s = e.state, pl = g.player;
    if (!e.aggro) {
      goHome(g, e, t, dt);
      return;
    }
    if (leashed(g, e)) {
      e.aggro = false;
      return;
    }
    if (s.nextSpecial == null) s.nextSpecial = g.time + sp.first;
    if (e.cast) {
      e.cast.elapsed += dt;
      if (e.cast.elapsed >= e.cast.total) {
        const c = e.cast;
        e.cast = null;
        const embers = [];
        for (let i = 0; i < 26; i++) embers.push({
          a: Math.random() * Math.PI * 2,
          sp: .4 + Math.random() * .6,
          c: Math.random() < .5 ? "#7dff6a" : "#d8ffb0"
        });
        g.fx({
          kind: "blast",
          x: e.x,
          y: e.y,
          r: sp.radius,
          life: .6,
          max: .6,
          embers: embers,
          palette: {
            core: "235,255,220",
            mid: "140,255,90",
            edge: "40,160,30",
            ring: "#b6ff7a",
            ring2: "#3fd62b"
          }
        });
        g.emit("shake", .25);
        if (!pl.dead && dist(e, pl) <= sp.radius + pl.radius) g.enemyHitPlayer(e, rand(sp.min, sp.max), "physical", c.name, "area"); else if (!pl.dead) g.floater(pl, "Avoided", "#b6ff7a", {
          small: true
        });
        for (const d of g.cls.decoys ? g.cls.decoys(g) : []) if (dist(e, d) <= sp.radius + d.radius) strike(g, e, d, rand(sp.min, sp.max), "physical", c.name, "area");
        s.nextSpecial = g.time + sp.every;
      }
      return;
    }
    const d = dist(e, p);
    if (g.time >= s.nextSpecial && d <= sp.radius + 4) {
      e.cast = {
        name: sp.name,
        school: "physical",
        cost: 0,
        total: sp.castTime,
        elapsed: 0,
        uninterruptible: true,
        area: sp.radius
      };
      g.floater(e, sp.name, "#b6ff7a", {
        big: true,
        life: 1.4
      });
      g.addLog(`${e.name} begins to cast ${sp.name}. Get out of the circle!`, "#e3847a");
      return;
    }
    if (d > contact(e, p)) moveToward(e, p, t.speed, dt, contact(e, p)); else e.facing = Math.atan2(p.y - e.y, p.x - e.x);
    if (g.inMelee(e, p)) meleeAttack(g, e, t, dt, "Axe", p);
    separate(g, e);
    spread(g, e, t, dt, p);
  };
  TL.ai.channeler = (g, e, dt) => {
    const p = g.player, t = g.tune.enemies[e.type], ch = t.channel, s = e.state;
    if (!e.aggro) {
      goHome(g, e, t, dt);
      return;
    }
    if (leashed(g, e)) {
      e.aggro = false;
      return;
    }
    const ally = g.enemies.find(o => !o.dead && o.type === ch.allyType);
    if (e.cast && e.cast.channel) {
      if (!ally) {
        e.cast = null;
        return;
      }
      e.facing = Math.atan2(ally.y - e.y, ally.x - e.x);
      e.cast.elapsed += dt;
      if (e.cast.elapsed >= e.cast.total) {
        e.cast = null;
        s.nextChannel = g.time + ch.gap;
      }
      return;
    }
    const locked = (e.schoolLocks.shadow || 0) > g.time;
    if (ally && !e.cast && !locked && e.mana >= ch.cost && g.time >= (s.nextChannel || 0)) {
      if (dist(e, ally) > ch.range) {
        moveToward(e, ally, t.speed, dt, ch.range - 2);
        separate(g, e);
        return;
      }
      e.mana -= ch.cost;
      e.cast = {
        name: ch.name,
        school: "shadow",
        cost: ch.cost,
        total: ch.duration,
        elapsed: 0,
        channel: true
      };
      g.floater(ally, ch.name, "#c9a8ff", {
        small: true
      });
      g.addLog(`${e.name} channels ${ch.name} on ${ally.name}.`, "#c9a8ff");
      return;
    }
    TL.ai.caster(g, e, dt);
  };
})(window.TL);