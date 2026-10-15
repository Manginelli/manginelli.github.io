window.TL = window.TL || {};

(function(TL) {
  TL.registry = {
    classes: {},
    encounters: {}
  };
  TL.registerClass = d => {
    TL.registry.classes[d.id] = d;
  };
  TL.registerEncounter = d => {
    TL.registry.encounters[d.id] = d;
  };
  TL.effects = TL.effects || {};
  TL.ai = TL.ai || {};
  TL.SCHOOL_COLORS = {
    white: "#ffffff",
    physical: "#ffe27a",
    arcane: "#8fd8ff",
    fire: "#ff8a2a",
    shadow: "#a58bff",
    heal: "#6ee07a"
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clone = o => JSON.parse(JSON.stringify(o));
  function merge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
        a[k] = merge(a[k] && typeof a[k] === "object" ? a[k] : {}, b[k]);
      } else a[k] = b[k];
    }
    return a;
  }
  TL.util = {
    rand: rand,
    clamp: clamp,
    dist: dist,
    clone: clone,
    merge: merge
  };
  let uid = 1;
  class Game {
    constructor(classId, encounterId) {
      this.cls = TL.registry.classes[classId];
      this.enc = TL.registry.encounters[encounterId];
      this.defaults = merge(clone(this.cls.tuning), clone(this.enc.tuning));
      this.tune = clone(this.defaults);
      this.options = {
        infiniteMana: true,
        sharedStrikeCd: false
      };
      this.abilityById = Object.fromEntries(this.cls.abilities.map(a => [ a.id, a ]));
      this.refreshAbilities();
      this.listeners = {};
      this.time = 0;
      this.paused = false;
      this.experiment = this.cls.experiments.find(e => e.id === this.cls.passive) || this.cls.experiments[0];
      this.expState = {};
      this.specId = "base";
      this.spec = null;
      this.specState = {};
      this.resetMeter();
      this.reset();
    }
    setOption(key, on) {
      this.options[key] = !!on;
      this.refreshAbilities();
      this.emit("abilities");
    }
    refreshAbilities() {
      const {list: list, hidden: hidden} = this.barOrder();
      this.abilities = list.filter(a => !hidden.includes(a.id));
    }
    availableAbilities() {
      const sp = this.specId || "base";
      return this.cls.abilities.filter(a => !a.bar && (!a.option || this.options[a.option]) && (!a.specs || a.specs.includes(sp)) && (!a.talent || this.passiveOn(a.talent)));
    }
    barOrder() {
      const sp = this.specId || "base", spec = (this.cls.specs || []).find(s => s.id === sp) || {}, avail = this.availableAbilities();
      const lay = this.barLayouts && this.barLayouts[sp];
      const order = lay ? lay.order : spec.barFirst || [], hidden = lay ? lay.hidden : spec.barHide || [];
      const rank = a => {
        const i = order.indexOf(a.id);
        return i < 0 ? order.length : i;
      };
      return {
        list: avail.map((a, i) => [ a, i ]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map(x => x[0]),
        hidden: hidden.slice()
      };
    }
    setBarLayout(layout) {
      const sp = this.specId || "base";
      this.barLayouts = this.barLayouts || {};
      if (layout) this.barLayouts[sp] = layout; else delete this.barLayouts[sp];
      this.refreshAbilities();
      this.emit("abilities");
      this.emit("barLayout");
    }
    on(evt, fn) {
      (this.listeners[evt] = this.listeners[evt] || []).push(fn);
    }
    emit(evt, data) {
      (this.listeners[evt] || []).forEach(fn => fn(data));
    }
    reset() {
      const s = this.enc.playerStart;
      this.player = this.player && !this.player.dead ? this.player : null;
      const keepPos = this.player ? {
        x: this.player.x,
        y: this.player.y
      } : {
        x: s.x,
        y: s.y
      };
      this.player = this.makePlayer(keepPos);
      this.enemies = [];
      for (const st of this.enc.stations) for (const sp of st.spawns) this.enemies.push(this.spawnEnemy(sp, st));
      this.target = null;
      this.floaters = [];
      this.effectsFx = [];
      this.timers = [];
      this.log = [];
      this.setExperiment(this.experiment.id);
      this.setSpec(this.specId, true);
      this.player.hp = this.maxHp(this.player);
      this.player.mana = this.maxMana(this.player);
      this.classState = this.cls.state ? this.cls.state() : {};
      this.addLog("Training grounds reset.", "#9aa39b");
    }
    makePlayer(pos) {
      const t = this.tune.player;
      return {
        id: "player",
        kind: "player",
        name: this.cls.name,
        color: this.cls.color,
        x: pos.x,
        y: pos.y,
        radius: t.boundingRadius,
        reach: t.combatReach,
        facing: 0,
        hp: t.maxHealth,
        mana: t.maxMana,
        auras: [],
        cooldowns: {},
        cdTotals: {},
        gcd: 0,
        mhTimer: 0,
        ohTimer: 0,
        channel: null,
        motion: null,
        sinceSpend: 99,
        dead: false,
        flash: 0,
        attacking: false,
        input: {
          x: 0,
          y: 0
        },
        moving: false,
        lastDir: {
          x: 1,
          y: 0
        }
      };
    }
    spawnEnemy(sp, station) {
      const def = this.enc.enemyTypes[sp.type];
      const t = this.tune.enemies[sp.type];
      return {
        id: "e" + uid++,
        kind: "enemy",
        type: sp.type,
        def: def,
        name: def.name,
        color: def.color,
        station: station,
        home: {
          x: sp.x,
          y: sp.y
        },
        x: sp.x,
        y: sp.y,
        radius: t.boundingRadius,
        reach: t.combatReach,
        facing: Math.PI,
        hp: t.maxHealth,
        mana: def.hasMana ? t.maxMana : 0,
        auras: [],
        cast: null,
        aggro: false,
        attackTimer: 0,
        schoolLocks: {},
        stunnedUntil: 0,
        dead: false,
        respawnAt: null,
        flash: 0,
        state: {}
      };
    }
    setExperiment(id) {
      this.experiment = this.cls.experiments.find(e => e.id === id) || this.cls.experiments[0];
      this.expState = this.experiment.state ? this.experiment.state() : {};
      this.emit("experiment", this.experiment);
    }
    setSpec(id, keepPassives) {
      if (this.cls.applyProfile && this.profileFor !== id) {
        this.cls.applyProfile(this, id);
        this.profileFor = id;
      }
      this.specId = id;
      this.spec = (this.cls.specs || []).find(s => s.id === id) || null;
      this.specStates = {};
      for (const s of this.cls.specs || []) this.specStates[s.id] = s.state ? s.state() : {};
      this.specState = this.specStates[id] || {};
      if (!keepPassives || !this.passives) {
        this.passives = {};
        for (const p of this.cls.passives || []) this.passives[p.id] = p.spec === id;
        this.emit("passives");
      }
      if (this.abilities) {
        this.refreshAbilities();
        this.emit("abilities");
      }
      this.emit("spec", this.spec);
    }
    passiveOn(id) {
      return !!(this.passives && this.passives[id]);
    }
    setPassive(id, on) {
      this.passives[id] = !!on;
      this.emit("passives");
      this.refreshAbilities();
      this.emit("abilities");
    }
    abilityGlow(ab) {
      let c = "";
      if (this.specStates) this.eachSpec("glow", (s, st) => {
        const r = s.glow(this, st, ab);
        if (r) c += " " + r;
      });
      return c.trim();
    }
    eachSpec(name, fn) {
      for (const s of this.cls.specs || []) if (s[name]) fn(s, this.specStates[s.id] || (this.specStates[s.id] = s.state ? s.state() : {}));
    }
    specBuffs() {
      const out = [];
      this.eachSpec("buff", (s, st) => {
        const b = s.buff(this, st);
        if (Array.isArray(b)) out.push(...b); else if (b) out.push(b);
      });
      if (this.cls.buff) {
        const b = this.cls.buff(this, this.classState);
        if (b) out.push(b);
      }
      return out;
    }
    resetMeter() {
      this.meter = {
        events: [],
        total: 0,
        first: null,
        last: null
      };
    }
    entityById(id) {
      return id === "player" ? this.player : this.enemies.find(e => e.id === id);
    }
    alive() {
      return this.enemies.filter(e => !e.dead);
    }
    stats() {
      return this.cls.derivedStats ? this.cls.derivedStats(this) : null;
    }
    maxHp(e) {
      if (e.kind !== "player") return this.tune.enemies[e.type].maxHealth;
      const d = this.stats(), base = d ? d.maxHealth : this.tune.player.maxHealth;
      return Math.round((base + (this.cls.maxHealthBonus ? this.cls.maxHealthBonus(this) : 0)) * this.modMult(e, "maxHealthMult"));
    }
    maxMana(e) {
      if (e.kind !== "player") return e.def.hasMana ? this.tune.enemies[e.type].maxMana : 0;
      const d = this.stats();
      return d ? d.maxMana : this.tune.player.maxMana;
    }
    regenPerSecond() {
      const d = this.stats();
      return d && d.regenPerSecond != null ? d.regenPerSecond : this.tune.mana.regenPerSecond;
    }
    healthRegenPerSecond() {
      const d = this.stats();
      return d && d.healthRegenPerSecond ? d.healthRegenPerSecond : 0;
    }
    playerDodge() {
      const d = this.stats();
      return d && d.dodge != null ? d.dodge : this.tune.player.dodge;
    }
    playerParry() {
      const d = this.stats();
      return d && d.parry != null ? d.parry : this.tune.player.parry;
    }
    playerArmor() {
      const d = this.stats();
      return d && d.armor != null ? d.armor : this.tune.player.armor;
    }
    inCombat() {
      return this.enemies.some(e => !e.dead && e.aggro && !e.evading);
    }
    isDisabled(e) {
      return this.isStunned(e) || (e.shackledUntil || 0) > this.time;
    }
    meleeRange(a, b) {
      const m = this.tune.melee;
      let r = Math.max(m.attackDistance, this.reachOf(a) + this.reachOf(b) + m.reachOffset);
      if (this.isMoving(a) && this.isMoving(b)) r += m.movingLeeway;
      return r;
    }
    reachOf(e) {
      return e.kind === "enemy" ? this.tune.enemies[e.type].combatReach : this.tune.player.combatReach;
    }
    isMoving(e) {
      return e.kind === "enemy" ? !!e.moving : e.moving || !!e.motion;
    }
    inMelee(a, b) {
      return dist(a, b) < this.meleeRange(a, b);
    }
    edgeDistance(a, b) {
      return Math.max(0, dist(a, b) - a.radius - b.radius);
    }
    modSum(e, k) {
      let v = 0;
      for (const a of e.auras) if (a.mods && a.mods[k]) v += a.mods[k];
      return v;
    }
    modMult(e, k) {
      let v = 1;
      for (const a of e.auras) if (a.mods && a.mods[k]) v *= a.mods[k];
      return v;
    }
    schoolOverride(e) {
      for (const a of e.auras) if (a.mods && a.mods.schoolOverride) return a.mods.schoolOverride;
      return null;
    }
    abilityTune(id) {
      let t = this.tune.abilities[id];
      if (t && t.costPctMaxMana && this.player) t = Object.assign({}, t, {
        cost: Math.round(this.maxMana(this.player) * t.costPctMaxMana)
      });
      if (this.specStates) this.eachSpec("tuneMod", (s, st) => {
        t = s.tuneMod(this, st, id, t) || t;
      });
      return t;
    }
    moveSpeed() {
      const p = this.player;
      let s = this.tune.player.runSpeed * (1 + (this.experiment.moveBonus ? this.experiment.moveBonus(this, this.expState) : 0)) * this.modMult(p, "moveMult") * (this.cls.moveMult ? this.cls.moveMult(this) : 1);
      if (p.channel) s *= this.abilityTune(p.channel.ab.id).moveSpeed || 0;
      return s;
    }
    expBuff() {
      return this.experiment.buff ? this.experiment.buff(this, this.expState) : null;
    }
    addLog(text, color) {
      this.log.push({
        t: this.time,
        text: text,
        color: color || "#d7dcd6"
      });
      if (this.log.length > 60) this.log.shift();
    }
    floater(ent, text, color, opts = {}) {
      const other = ent === this.player ? this.target : this.player;
      const bias = other && other !== ent && !other.dead && Math.abs(ent.x - other.x) < 4 && Math.abs(ent.y - other.y) < 3 ? ent.x >= other.x ? 1 : -1 : 0;
      const LANES = [ 0, -1, 1, -2, 2 ], used = ent.fctLanes || (ent.fctLanes = [ -9, -9, -9, -9, -9 ]);
      const pick = bias ? [ 0, bias > 0 ? 2 : 1, bias > 0 ? 4 : 3 ] : [ 0, 1, 2, 3, 4 ];
      let li = pick[0];
      for (const k of pick) if (used[k] < used[li] - .05) li = k;
      used[li] = this.time;
      const life = opts.life || (opts.huge ? 2.3 : opts.big ? 2.1 : opts.small ? 1.5 : 1.75);
      const lane = LANES[li], out = lane ? Math.sign(lane) : bias || (Math.random() < .5 ? -1 : 1);
      this.floaters.push({
        x: ent.x,
        y: ent.y - ent.radius - .4,
        text: text,
        color: color,
        life: life,
        max: life,
        big: !!opts.big,
        small: !!opts.small,
        huge: !!opts.huge,
        lane: lane,
        bias: bias,
        out: out,
        jitter: rand(-4, 4)
      });
    }
    fx(o) {
      this.effectsFx.push(Object.assign({
        life: .4,
        max: .4
      }, o));
    }
    impactFx(t, school, crit, small) {
      const n = small ? 4 : crit ? 11 : 7, parts = [];
      for (let i = 0; i < n; i++) parts.push({
        a: rand(0, Math.PI * 2),
        sp: rand(.5, 1),
        sz: rand(.6, 1)
      });
      const life = {
        physical: .28,
        fire: .45,
        arcane: .4,
        shadow: .55
      }[school] || .3;
      return {
        kind: "impact",
        school: school,
        x: t.x + rand(-.15, .15),
        y: t.y + rand(-.15, .15),
        r: t.radius || .8,
        crit: crit,
        small: small,
        parts: parts,
        rot: rand(0, Math.PI * 2),
        life: life,
        max: life
      };
    }
    powerStats() {
      const P = this.tune.player, d = this.stats(), base = d ? {
        ap: d.ap,
        sp: d.sp
      } : {
        ap: P.attackPower || 0,
        sp: P.spellPower || 0
      };
      let b = base;
      this.eachSpec("stats", s => {
        b = s.stats(this, b);
      });
      return b;
    }
    attackPower() {
      return this.powerStats().ap;
    }
    spellPower() {
      return this.powerStats().sp;
    }
    cooldownFor(id) {
      const t = this.abilityTune(id);
      let cd = t.cooldown;
      this.eachSpec("cooldown", s => {
        cd = s.cooldown(this, id, cd);
      });
      return cd;
    }
    critChance() {
      const d = this.stats();
      return d ? d.crit : this.tune.player.critChance;
    }
    weaponDps(hand) {
      const w = this.tune.weapons, h = hand === "off" ? w.offHand : w.mainHand;
      return (h.min + h.max) / 2 / h.speed;
    }
    offGcd(ab) {
      let r = false;
      if (this.specStates) this.eachSpec("offGcd", (s, st) => {
        if (s.offGcd(this, st, ab)) r = true;
      });
      return r;
    }
    canUse(ab) {
      const p = this.player, t = this.abilityTune(ab.id);
      if (p.dead) return {
        ok: false,
        reason: "You are dead"
      };
      if (p.motion) return {
        ok: false,
        reason: "Another action is in progress"
      };
      if (ab.requiresFirst && ab.requires && this.target && !this.target.dead) {
        const why = ab.requires(this, this.target);
        if (why) return {
          ok: false,
          reason: why,
          req: true
        };
      }
      if ((p.cooldowns[ab.id] || 0) > 0) return {
        ok: false,
        reason: "Ability is not ready yet"
      };
      if (ab.gcd && p.gcd > 0 && !this.offGcd(ab)) return {
        ok: false,
        reason: "Ability is not ready yet",
        gcd: true
      };
      if (p.mana < t.cost && !this.options.infiniteMana) return {
        ok: false,
        reason: "Not enough mana"
      };
      if (ab.target === "enemy") {
        const tg = this.target;
        if (!tg || tg.dead) return {
          ok: false,
          reason: "You have no target"
        };
        if (ab.range === "melee" && !this.inMelee(p, tg)) return {
          ok: false,
          reason: "Out of range",
          range: true
        };
        if (ab.range === "dive" || ab.range === "ranged") {
          const d = this.edgeDistance(p, tg);
          let minR = t.minRange;
          this.eachSpec("minRange", (s, st) => {
            minR = s.minRange(this, st, ab, minR);
          });
          if (d < minR) return {
            ok: false,
            reason: "Target is too close",
            range: true
          };
          if (d > t.maxRange) return {
            ok: false,
            reason: "Out of range",
            range: true
          };
        }
      }
      if (ab.requires) {
        const why = ab.requires(this, this.target);
        if (why) return {
          ok: false,
          reason: why,
          req: true
        };
      }
      return {
        ok: true
      };
    }
    useAbility(id) {
      const ab = this.abilityById[id];
      if (!ab) return false;
      const p = this.player;
      if (p.channel && p.channel.isCast) return false;
      let reused = false;
      this.eachSpec("reuse", (s, st) => {
        if (!reused && s.reuse(this, st, ab)) reused = true;
      });
      if (reused) {
        this.emit("ability", ab);
        return true;
      }
      if (p.channel) {
        const same = p.channel.ab.id === id;
        this.endChannel(same ? "cancelled" : "interrupted");
        if (same) return true;
      }
      if ((ab.tag === "strike" || ab.autoTarget) && (!this.target || this.target.dead)) {
        let best = null, bd = Infinity;
        for (const e of this.alive()) {
          if (e.evading) continue;
          const d = dist(p, e);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (best) this.setTarget(best);
      }
      const chk = this.canUse(ab);
      if (!chk.ok) {
        this.emit("error", chk.reason);
        if (chk.reason === "Target is immune" && this.target) this.floater(this.target, "Immune", "#c9c9c9", {
          small: true
        });
        return false;
      }
      const t = this.abilityTune(id);
      if (p.auras.some(a => a.mods && a.mods.breakOnAbility)) {
        for (const a of p.auras.filter(a => a.mods && a.mods.breakOnAbility)) this.addLog(`${a.name} ends.`, "#9aa39b");
        p.auras = p.auras.filter(a => !(a.mods && a.mods.breakOnAbility));
      }
      this.spendMana(t.cost);
      const cdLen = this.cooldownFor(id);
      if (cdLen > 0) {
        p.cooldowns[id] = cdLen;
        p.cdTotals[id] = cdLen;
        if (this.options.sharedStrikeCd && ab.tag === "strike") for (const a of this.cls.abilities) if (a.tag === "strike" && a.id !== id) {
          p.cooldowns[a.id] = cdLen;
          p.cdTotals[a.id] = cdLen;
        }
      }
      if (ab.gcd && !this.offGcd(ab)) {
        p.gcd = this.gcdLength();
        p.gcdTotal = p.gcd;
      }
      if (ab.target === "enemy" && ab.startsAttack !== false && this.target) p.attacking = true;
      this.eachSpec("beforeAbility", (s, st) => s.beforeAbility(this, st, ab));
      for (const ef of ab.effects) {
        if (ef.when && !ef.when(this)) continue;
        TL.effects[ef.type](this, ab, ef, t, this.target);
      }
      if (this.experiment.onAbility) this.experiment.onAbility(this, this.expState, ab);
      this.eachSpec("onAbility", (s, st) => s.onAbility(this, st, ab));
      if (this.cls.onAbility) this.cls.onAbility(this, this.classState, ab);
      this.emit("ability", ab);
      return true;
    }
    hasteMult() {
      let h = 1 + (this.tune.player.hastePercent || 0) / 100;
      for (const a of this.player.auras) if (a.mods && a.mods.attackSpeed) h *= 1 + a.mods.attackSpeed;
      if (this.experiment.hasteBonus) h *= 1 + this.experiment.hasteBonus(this, this.expState);
      if (this.cls.hasteBonus) h *= 1 + this.cls.hasteBonus(this);
      return h;
    }
    castHasteMult() {
      let h = 1 + (this.tune.player.hastePercent || 0) / 100;
      for (const a of this.player.auras) if (a.mods && a.mods.castHaste) h *= 1 + a.mods.castHaste;
      if (this.experiment.hasteBonus) h *= 1 + this.experiment.hasteBonus(this, this.expState);
      if (this.cls.hasteBonus) h *= 1 + this.cls.hasteBonus(this);
      return h;
    }
    gcdLength() {
      const red = this.experiment.gcdReduction ? this.experiment.gcdReduction(this, this.expState) : 0;
      return Math.max(this.tune.gcdMin || 1, this.tune.gcd - red);
    }
    strikeLanded(ab, res) {
      if (ab.tag === "strike" && this.experiment.onStrike) this.experiment.onStrike(this, this.expState, ab);
      this.eachSpec("onStrike", (s, st) => s.onStrike(this, st, ab, res));
      if (this.cls.onStrike) this.cls.onStrike(this, this.classState, ab, res);
    }
    spendMana(n) {
      if (this.options.infiniteMana) return;
      if (n > 0) {
        this.player.mana = Math.max(0, this.player.mana - n);
        this.player.sinceSpend = 0;
      }
    }
    pushback(c) {
      const P = this.tune.pushback || {
        cast: .5,
        channel: .25,
        hits: 2
      };
      if ((c.pushes || 0) >= P.hits) return;
      c.pushes = (c.pushes || 0) + 1;
      if (c.isCast) c.remaining = Math.min(c.total, c.remaining + P.cast); else {
        const d = Math.min(c.remaining, c.total * P.channel);
        c.remaining -= d;
        c.lost = (c.lost || 0) + d;
      }
      this.floater(this.player, "Pushback", "#c9c9c9", {
        small: true
      });
    }
    endChannel(why) {
      const p = this.player;
      if (!p.channel) return;
      const c = p.channel;
      if (why && why !== "done") this.addLog(`${c.ab.name} ${why}.`, "#9aa39b");
      if (c.isCast && why !== "done") {
        p.mana = Math.min(this.maxMana(p), p.mana + (c.cost || 0));
        p.cooldowns[c.ab.id] = 0;
      }
      p.channel = null;
    }
    addAura(ent, auraId, t) {
      const def = this.cls.auras[auraId];
      ent.auras = ent.auras.filter(a => a.id !== auraId);
      const mods = def.mods ? def.mods(t) : null;
      const before = this.maxHp(ent);
      const dur = def.durationKey ? t[def.durationKey] : t.duration;
      const aura = {
        id: auraId,
        name: def.name,
        icon: def.icon,
        remaining: dur,
        duration: dur,
        mods: mods,
        def: def,
        tickTimer: t.tick || 0
      };
      ent.auras.push(aura);
      const after = this.maxHp(ent);
      if (after > before) ent.hp += after - before;
    }
    inFrontOf(a, b) {
      const ang = Math.atan2(b.y - a.y, b.x - a.x) - a.facing;
      return Math.cos(ang) > 0;
    }
    rollTable(target, white, kind, periodic, o) {
      const w = this.tune.weapons, c = this.tune.combat, r = Math.random();
      const hit = this.cls.hitBonus ? this.cls.hitBonus(this) : 0;
      if (kind === "spell") return r < Math.max(0, c.spellMiss - hit) ? "resist" : Math.random() < this.critChance() ? "crit" : "hit";
      const miss = o && o.noMiss || this.specId && this.specId !== "base" ? 0 : Math.max(0, (white ? w.whiteMissChance : w.specialMissChance) - hit);
      const stunned = this.isStunned(target);
      const capped = this.specId && this.specId !== "base";
      const dodge = stunned || capped || o && o.noDodge ? 0 : c.mobDodge;
      const parry = !stunned && !capped && !(o && o.noParry) && this.inFrontOf(target, this.player) ? c.mobParry : 0;
      let edge = miss;
      if (r < edge) return "miss";
      if (r < (edge += dodge)) return "dodge";
      if (r < (edge += parry)) return "parry";
      if (white) {
        if (r < (edge += c.glanceChance)) return "glance";
        if (r < (edge += this.critChance())) return "crit";
        return "hit";
      }
      return Math.random() < this.critChance() ? "crit" : "hit";
    }
    playerHit(target, o) {
      if (!target || target.dead) return null;
      if (target.evading) {
        this.floater(target, "Evade", "#e8c46a", {
          small: true
        });
        return {
          roll: "evade",
          amount: 0
        };
      }
      const roll = o.roll || this.rollTable(target, !!o.white, o.kind, o.periodic, o);
      const school = this.schoolOverride(this.player) || o.school || "physical";
      if (roll === "miss" || roll === "dodge" || roll === "parry" || roll === "resist") {
        const word = {
          miss: "Miss",
          dodge: "Dodge",
          parry: "Parry",
          resist: "Resist"
        }[roll];
        this.floater(target, word, "#c9c9c9", {
          small: true
        });
        this.addLog(`${o.name || "Attack"}: ${target.name} ${roll === "miss" ? "is missed" : roll === "resist" ? "resists" : roll + "s"}.`, "#8a8f89");
        this.aggro(target);
        return {
          roll: roll,
          amount: 0
        };
      }
      let amount = o.amount != null ? o.amount : rand(o.min, o.max);
      this.eachSpec("addAmount", (s, st) => {
        amount += s.addAmount(this, st, o, school, target) || 0;
      });
      if (o.spCoef) amount += this.spellPower() * o.spCoef;
      if (roll === "crit") amount *= this.tune.player.critMultiplier;
      if (roll === "glance") amount *= rand(this.tune.combat.glanceMin, this.tune.combat.glanceMax);
      if (target.kind === "enemy") {
        const et = this.tune.enemies[target.type];
        if (school === "physical") {
          const armor = et.armor || 0;
          amount *= 1 - armor / (armor + 400 + 85 * this.tune.player.level);
        } else {
          const res = et.resist && et.resist[school] || 0;
          amount *= 1 - Math.min(.75, res / (this.tune.player.level * 5) * .75);
        }
      }
      const bonus = this.experiment.damageBonus ? this.experiment.damageBonus(this, this.expState, target) : 0;
      let sm = 1;
      this.eachSpec("damageMult", (s, st) => {
        sm *= s.damageMult(this, st, o, school, target);
      });
      const specMult = sm * (this.cls.damageMult ? this.cls.damageMult(this, this.classState, o, school, target) : 1);
      let schoolMult = 1;
      for (const a of this.player.auras) {
        const m = a.def && a.def.mods && a.def.tuneKey ? a.def.mods(this.abilityTune(a.def.tuneKey), this) : a.mods;
        if (m && m.schoolDamage && m.schoolDamage[school]) schoolMult *= 1 + m.schoolDamage[school];
      }
      amount = Math.round(amount * (1 + bonus) * specMult * schoolMult);
      if (target.kind === "enemy" && this.enc.damageTakenMult) amount = Math.round(amount * this.enc.damageTakenMult(this, target, school));
      this.applyDamage(target, amount);
      if (amount > 0) this.fx(this.impactFx(target, school, roll === "crit", !!o.periodic));
      const col = o.white && school === "physical" ? TL.SCHOOL_COLORS.white : TL.SCHOOL_COLORS[school];
      this.floater(target, String(amount), o.textColor || col, o.hugeText ? {
        huge: true
      } : {
        big: roll === "crit"
      });
      this.addLog(`${o.name || "Attack"} ${roll === "crit" ? "crits" : roll === "glance" ? "glances" : "hits"} ${target.name} for ${amount} ${school === "physical" ? "" : school + " "}damage.`, col);
      this.meter.events.push({
        t: this.time,
        a: amount
      });
      this.meter.total += amount;
      if (this.meter.first == null) this.meter.first = this.time;
      this.meter.last = this.time;
      target.flash = .08;
      if (roll === "crit") this.emit("crit");
      if (this.experiment.onHit) this.experiment.onHit(this, this.expState, {
        target: target,
        amount: amount,
        white: !!o.white
      });
      if (this.cls.onDealtDamage) this.cls.onDealtDamage(this, target, o, {
        roll: roll,
        amount: amount,
        school: school
      });
      if (o.white && this.cls.onWhiteHit) this.cls.onWhiteHit(this, target, o.hand);
      if (!o.specExtra) this.eachSpec("afterHit", (s, st) => s.afterHit(this, st, target, o, {
        roll: roll,
        amount: amount
      }));
      return {
        roll: roll,
        amount: amount
      };
    }
    applyDamage(target, amount) {
      this.aggro(target);
      target.hp -= amount;
      if (target.hp <= 0) {
        if (target.def && target.def.immortal) {
          target.hp = this.maxHp(target);
          return;
        }
        this.kill(target);
      }
    }
    stun(e, dur) {
      e.stunnedUntil = Math.max(e.stunnedUntil || 0, this.time + dur);
      e.shackledUntil = 0;
      if (e.cast && !e.cast.uninterruptible) {
        this.addLog(`${e.name}'s ${e.cast.name} is interrupted by the stun.`, "#9aa39b");
        e.cast = null;
      }
      this.floater(e, "Stunned", "#e8c46a", {
        small: true
      });
    }
    isStunned(e) {
      return (e.stunnedUntil || 0) > this.time;
    }
    evade(e) {
      if (e.evading) return;
      e.evading = true;
      e.aggro = false;
      e.cast = null;
      e.hp = this.maxHp(e);
      e.mana = this.maxMana(e);
      this.floater(e, "Evade", "#e8c46a", {
        small: true
      });
      this.addLog(`${e.name} leaves its area and resets.`, "#9aa39b");
      for (const o of this.enemies) if (o !== e && o.station === e.station && !o.dead && o.aggro) this.evade(o);
    }
    playerInArea(st) {
      return !this.player.dead && dist(this.player, st) <= st.r;
    }
    aggro(e) {
      if (e.kind !== "enemy" || e.dead || e.evading) return;
      if (e.def.ai !== "dummy" && !this.playerInArea(e.station)) return;
      if (!e.aggro) {
        e.aggro = true;
        for (const o of this.enemies) if (o.station === e.station && !o.dead) o.aggro = true;
      }
    }
    kill(e) {
      e.dead = true;
      e.hp = 0;
      e.cast = null;
      e.aggro = false;
      const t = this.tune.enemies[e.type];
      e.respawnAt = this.time + (t.respawn || 10);
      this.addLog(`${e.name} dies.`, "#e0d27a");
      if (this.target === e) {
        this.target = null;
        this.player.attacking = false;
      }
    }
    enemyHitPlayer(src, amount, school, name, kind) {
      const p = this.player;
      if (p.dead) return;
      amount *= this.tune.combat.enemyDamage || 1;
      const c = this.tune.combat, r = Math.random();
      if (kind === "spell") {
        if (r < c.spellMiss) {
          this.floater(p, "Resist", "#c9c9c9", {
            small: true
          });
          this.addLog(`You resist ${src.name}'s ${name}.`, "#8a8f89");
          return;
        }
        const sd = this.modSum(p, "spellDodge");
        if (sd && Math.random() < sd) {
          this.floater(p, "Dodge", "#c9c9c9", {
            small: true
          });
          this.addLog(`You dodge ${src.name}'s ${name}.`, "#8a8f89");
          return;
        }
      } else if (kind !== "area") {
        const parry = this.inFrontOf(p, src) ? this.playerParry() : 0;
        let edge = c.mobMiss, out = "hit";
        if (r < edge) out = "miss"; else if (r < (edge += this.playerDodge() + this.modSum(p, "dodge"))) out = "dodge"; else if (r < (edge += parry)) out = "parry"; else if (r < (edge += c.mobCrit)) out = "crit";
        if (out === "miss" || out === "dodge" || out === "parry") {
          const word = {
            miss: "Miss",
            dodge: "Dodge",
            parry: "Parry"
          }[out];
          this.floater(p, word, "#c9c9c9", {
            small: true
          });
          this.addLog(`${src.name}'s ${name}: you ${out === "miss" ? "are missed" : out}.`, "#8a8f89");
          if (out === "parry") {
            const k = this.cls.parryHaste ? this.cls.parryHaste(this) : .4;
            p.mhTimer = Math.max(0, p.mhTimer * (1 - k));
            if (k >= 1) this.addLog("Vengeful Parry: your main hand strikes back at once.", "#e8e2ff");
          }
          return;
        }
        if (out === "crit") amount *= 2;
      }
      if (school === "physical") {
        const armor = this.playerArmor() * this.modMult(p, "armorMult");
        const dr = armor / (armor + 400 + 85 * this.tune.player.level);
        amount *= 1 - dr;
      } else {
        const res = this.cls.resistance ? this.cls.resistance(this, school) : 0;
        if (res > 0) amount *= 1 - Math.min(.75, res / (this.tune.player.level * 5) * .75);
      }
      if (this.cls.damageTakenMult) amount *= this.cls.damageTakenMult(this, src, school, kind);
      const flat = this.modSum(p, "damageTakenFlat");
      if (flat) amount = Math.max(0, amount - flat);
      amount = Math.round(amount);
      p.hp -= amount;
      p.flash = .08;
      if (this.cls.onPlayerDamaged) this.cls.onPlayerDamaged(this, src, amount, school, kind);
      if (p.channel && p.channel.ab.interruptOnDamage) this.endChannel("interrupted by damage"); else if (p.channel && p.channel.ab.pushback) this.pushback(p.channel);
      this.floater(p, "-" + amount, "#ff5a4a", {
        small: true
      });
      if (kind === "spell" && amount > 0) this.fx(this.impactFx(p, school, false, false));
      this.addLog(`${src.name}'s ${name} hits you for ${amount}.`, "#e3847a");
      if (p.hp <= 0) {
        p.hp = 0;
        p.dead = true;
        p.channel = null;
        p.motion = null;
        for (const e of this.enemies) {
          e.aggro = false;
          e.cast = null;
        }
        this.addLog("You died. Press R to reset.", "#ff5a4a");
        this.emit("death");
      }
    }
    clickTarget(e) {
      this.setTarget(e);
      if (this.target) this.player.attacking = true;
    }
    setTarget(e) {
      this.target = e && !e.dead ? e : null;
      if (!this.target && this.player) this.player.attacking = false;
      this.emit("target", this.target);
    }
    tabTarget() {
      const p = this.player;
      const list = this.alive().filter(e => dist(p, e) <= 45).sort((a, b) => dist(p, a) - dist(p, b));
      if (!list.length) {
        this.setTarget(null);
        return;
      }
      const i = list.indexOf(this.target);
      this.setTarget(list[(i + 1) % list.length]);
      if (this.target) p.attacking = !((this.target.shackledUntil || 0) > this.time);
    }
    engageFrom(hits) {
      const p = this.player;
      if (p.dead || p.attacking && this.target && !this.target.dead) return;
      let best = null, bd = Infinity;
      for (const e of hits) {
        if (!e || e.dead) continue;
        const d = dist(p, e);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) return;
      this.setTarget(best);
      p.attacking = true;
    }
    schedule(delay, fn) {
      this.timers.push({
        at: this.time + delay,
        fn: fn
      });
    }
    update(dt) {
      if (this.paused) return;
      this.time += dt;
      const p = this.player, T = this.tune;
      if (this.timers.length) {
        const due = this.timers.filter(t => t.at <= this.time);
        this.timers = this.timers.filter(t => t.at > this.time);
        for (const t of due) if (!p.dead) t.fn(this);
      }
      for (const k in p.cooldowns) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
      p.gcd = Math.max(0, p.gcd - dt);
      if (this.options.infiniteMana && !p.dead) p.mana = this.maxMana(p);
      p.flash = Math.max(0, p.flash - dt);
      p.sinceSpend += dt;
      p.regenTick = (p.regenTick == null ? T.mana.tickInterval : p.regenTick) - dt;
      if (p.regenTick <= 0) {
        p.regenTick += T.mana.tickInterval;
        const inside = this.cls.regenWhileCasting ? this.cls.regenWhileCasting(this) * this.regenPerSecond() : T.mana.regenInsideRule || 0;
        const rate = p.channel && p.channel.ownRegen ? 0 : p.sinceSpend >= T.mana.fiveSecondRule ? this.regenPerSecond() : inside;
        const gain = rate * T.mana.tickInterval;
        if (!p.dead && gain > 0 && p.mana < this.maxMana(p)) p.mana = Math.min(this.maxMana(p), p.mana + gain);
        const hr = this.inCombat() ? 0 : this.healthRegenPerSecond() * T.mana.tickInterval;
        if (!p.dead && hr > 0 && p.hp < this.maxHp(p)) p.hp = Math.min(this.maxHp(p), p.hp + hr);
      }
      for (const a of p.auras) {
        a.remaining -= dt;
        if (a.def.periodic) {
          const t = this.abilityTune(a.def.tuneKey);
          a.tickTimer -= dt;
          while (a.tickTimer <= 0 && a.remaining > -1e-6) {
            a.tickTimer += t.tick;
            const hit = [];
            for (const e of this.alive()) if (t.meleeArea ? this.inMelee(p, e) : dist(p, e) <= t.radius + e.radius) {
              const r = this.playerHit(e, {
                min: t.min,
                max: t.max,
                school: t.school || a.def.periodic.school,
                name: a.name,
                attack: false,
                kind: "spell",
                periodic: true,
                spCoef: t.spCoef
              });
              if (r && r.amount > 0) hit.push(e);
            }
            if (a.engage && hit.length) {
              a.engage = false;
              this.engageFrom(hit);
            }
            this.fx({
              kind: "ring",
              x: p.x,
              y: p.y,
              r: t.meleeArea ? this.tune.melee.attackDistance : t.radius,
              color: t.school === "arcane" ? "#6fb4ff" : "#ff8a2a",
              life: .35,
              max: .35
            });
          }
        }
      }
      const hadMeta = p.auras.length;
      for (const a of p.auras) if (a.remaining <= 0 && a.def.onExpire) a.def.onExpire(this, a);
      p.auras = p.auras.filter(a => a.remaining > 0);
      const perm = this.cls.permanentAuras ? this.cls.permanentAuras(this) : [];
      p.auras = p.auras.filter(a => a.remaining !== Infinity || perm.includes(a.id));
      for (const id of perm) if (!p.auras.some(a => a.id === id)) {
        const def = this.cls.auras[id], t2 = Object.assign({}, this.abilityTune(def.tuneKey));
        t2[def.durationKey || "duration"] = Infinity;
        this.addAura(p, id, t2);
      }
      if (p.auras.length !== hadMeta) p.hp = Math.min(p.hp, this.maxHp(p));
      if (!p.dead) {
        if (p.motion) this.updateMotion(dt); else {
          const ix = p.input.x, iy = p.input.y, len = Math.hypot(ix, iy);
          p.moving = len > 0;
          if (p.moving) {
            const sp = this.moveSpeed();
            p.x += ix / len * sp * dt;
            p.y += iy / len * sp * dt;
            p.lastDir = {
              x: ix / len,
              y: iy / len
            };
          }
          this.clampToArena(p);
        }
        if (this.target && !this.target.dead) p.facing = Math.atan2(this.target.y - p.y, this.target.x - p.x); else if (p.moving) p.facing = Math.atan2(p.lastDir.y, p.lastDir.x);
      }
      if (p.channel && !p.dead) {
        const c = p.channel, t = this.abilityTune(c.ab.id);
        c.remaining -= dt;
        c.tickTimer -= dt;
        c.spin += dt * 14;
        if (!t.moveSpeed && p.moving) {
          this.endChannel("cancelled by moving");
        }
        while (p.channel && c.tickTimer <= 0 && c.remaining > -1e-6) {
          c.tickTimer += t.tick;
          TL.channelTicks[c.kind](this, c, t);
        }
        if (p.channel && c.remaining <= 0) {
          if (c.onDone) c.onDone(this, c, t);
          this.endChannel("done");
        }
      }
      this.updateAutoAttack(dt);
      if (this.experiment.update) this.experiment.update(this, this.expState, dt);
      this.eachSpec("update", (s, st) => s.update(this, st, dt));
      p.radius = T.player.boundingRadius;
      for (const e of this.enemies) {
        e.flash = Math.max(0, e.flash - dt);
        e.radius = this.tune.enemies[e.type].boundingRadius;
        e.moving = false;
        if (e.dead) {
          if (e.respawnAt != null && this.time >= e.respawnAt && !this.playerInArea(e.station)) this.respawn(e);
          continue;
        }
        if (!e.aggro && !p.dead && dist(p, e) <= (this.tune.enemies[e.type].aggroRadius || 0)) this.aggro(e);
        const ai = TL.ai[e.def.ai];
        if (ai && !this.isDisabled(e)) ai(this, e, dt);
        this.clampToArena(e);
      }
      if (this.enc.update) this.enc.update(this, dt);
      while (this.meter.events.length && this.meter.events[0].t < this.time - 120) this.meter.events.shift();
      for (const f of this.floaters) f.life -= dt;
      this.floaters = this.floaters.filter(f => f.life > 0);
      for (const f of this.effectsFx) f.life -= dt;
      this.effectsFx = this.effectsFx.filter(f => f.life > 0);
    }
    updateAutoAttack(dt) {
      const p = this.player, w = this.tune.weapons;
      const haste = this.hasteMult();
      p.mhTimer = Math.max(0, p.mhTimer - dt * haste);
      p.ohTimer = Math.max(0, p.ohTimer - dt * haste);
      const tg = this.target;
      p.autoActive = !!(p.attacking && tg && !tg.dead && !p.dead);
      if (!p.autoActive || p.motion || p.channel && p.channel.isCast || p.auras.some(a => a.mods && a.mods.noAutoAttack) || !this.inMelee(p, tg)) {
        p.autoSwinging = false;
        return;
      }
      p.autoSwinging = true;
      if (p.mhTimer <= 0) {
        this.swing("main", tg);
        p.mhTimer = w.mainHand.speed;
      }
      if (p.ohTimer <= 0 && !tg.dead) {
        this.swing("off", tg);
        p.ohTimer = w.offHand.speed;
      }
    }
    weaponBaseRoll(hand) {
      const w = this.tune.weapons, h = hand === "main" ? w.mainHand : w.offHand;
      return rand(h.min, h.max);
    }
    weaponRoll(hand) {
      const w = this.tune.weapons, h = hand === "main" ? w.mainHand : w.offHand;
      return rand(h.min, h.max) + this.attackPower() / 14 * h.speed;
    }
    autoSchool() {
      for (const a of this.player.auras) if (a.mods && a.mods.autoSchool) return a.mods.autoSchool;
      return "physical";
    }
    swing(hand, tg, label) {
      const w = this.tune.weapons;
      const mult = hand === "off" ? (() => {
        let m = w.offHand.damageMultiplier;
        this.eachSpec("offHandAuto", s => {
          m = s.offHandAuto(this, m);
        });
        return m;
      })() : 1;
      const res = this.playerHit(tg, {
        amount: this.weaponRoll(hand) * mult,
        white: true,
        weapon: true,
        hand: hand,
        school: this.autoSchool(),
        name: (label ? label + ": " : "") + (hand === "main" ? "Main hand" : "Off hand")
      });
      this.fx({
        kind: "slash",
        x: tg.x,
        y: tg.y,
        a: this.player.facing + (hand === "main" ? .6 : -.6),
        life: .15,
        max: .15
      });
      this.weaponImbues(tg, res);
      this.countAsSwing(hand, res);
      return res;
    }
    weaponImbues(tg, res, fromStrike) {
      if (!res || ![ "hit", "crit", "glance" ].includes(res.roll) || tg.dead) return;
      for (const a of this.player.auras) if (a.def.onAutoHit) {
        const t = this.abilityTune(a.def.tuneKey), h = a.def.onAutoHit;
        if (fromStrike && !t.onStrikes) continue;
        this.playerHit(tg, {
          min: t[h.minKey],
          max: t[h.maxKey],
          school: h.school,
          name: a.name,
          kind: "spell",
          attack: false,
          spCoef: t.spCoef,
          imbue: true
        });
      }
    }
    strikeWeaponHit(tg, hand, res, ab) {
      this.weaponImbues(tg, res, true);
      if (ab && ab.tranceHit) this.countAsSwing(hand, res);
    }
    countAsSwing(hand, res) {
      const landed = !!res && [ "hit", "crit", "glance" ].includes(res.roll);
      if (this.experiment.onSwing) this.experiment.onSwing(this, this.expState, hand, landed);
    }
    updateMotion(dt) {
      const p = this.player, m = p.motion;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = m.kind === "leap" ? 1 - Math.pow(1 - k, 3) : 1 - Math.pow(1 - k, 2);
      p.x = m.from.x + (m.to.x - m.from.x) * e;
      p.y = m.from.y + (m.to.y - m.from.y) * e;
      p.hop = m.kind === "leap" ? Math.sin(k * Math.PI) * (m.hop || 1) : 0;
      if (m.onStep) m.onStep(this, m);
      if (m.trailTimer === undefined || (m.trailTimer -= dt) <= 0) {
        m.trailTimer = m.kind === "leap" ? .06 : .03;
        this.fx({
          kind: "ghost",
          x: p.x,
          y: p.y,
          life: .25,
          max: .25
        });
      }
      if (k >= 1) {
        p.motion = null;
        p.hop = 0;
        this.clampToArena(p);
        if (m.onEnd) m.onEnd(this, m);
      }
    }
    respawn(e) {
      const fresh = this.spawnEnemy({
        type: e.type,
        x: e.home.x,
        y: e.home.y
      }, e.station);
      Object.assign(e, fresh, {
        id: e.id
      });
      this.addLog(`${e.name} appears.`, "#9aa39b");
    }
    clampToArena(e) {
      e.x = clamp(e.x, e.radius, this.enc.width - e.radius);
      e.y = clamp(e.y, e.radius, this.enc.height - e.radius);
    }
    dps(windowSec) {
      const ev = this.meter.events;
      if (!ev.length) return 0;
      if (windowSec) {
        const from = this.time - windowSec;
        let s = 0;
        for (let i = ev.length - 1; i >= 0 && ev[i].t >= from; i--) s += ev[i].a;
        return s / windowSec;
      }
      const span = Math.max(1, this.meter.last - this.meter.first);
      return this.meter.total / span;
    }
    buckets(size, count) {
      const out = new Array(count).fill(0), end = this.time;
      for (const e of this.meter.events) {
        const i = count - 1 - Math.floor((end - e.t) / size);
        if (i >= 0 && i < count) out[i] += e.a;
      }
      return out;
    }
  }
  TL.Game = Game;
})(window.TL);