/* Forever Class Lab: built from src/ by tools/build.mjs. Edit src/, not this file. */
(() => {
  // src/core/util.js
  var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function makeRng(seed = Math.random() * 2 ** 32 >>> 0) {
    let s = seed >>> 0;
    const next = () => {
      s = s + 1831565813 >>> 0;
      let t = s;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    next.range = (a, b) => a + next() * (b - a);
    next.chance = (p) => next() < p;
    return next;
  }
  var Emitter = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
    }
    on(evt, fn) {
      if (!this.handlers.has(evt)) this.handlers.set(evt, []);
      this.handlers.get(evt).push(fn);
      return () => this.off(evt, fn);
    }
    off(evt, fn) {
      const list = this.handlers.get(evt);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
    emit(evt, data) {
      const list = this.handlers.get(evt);
      if (list) for (const fn of list.slice()) fn(data);
    }
  };

  // src/core/rules.js
  var RULES = {
    maxLevel: 60,
    talentPoints: 51,
    // levels 10 to 60
    pointsPerTier: 5,
    // tier N opens after 5 x N points in the same tree
    gcd: 1.5,
    // default global cooldown, not reduced by haste (Classic); a class can set its own (cls.gcd)
    gcdMin: 1,
    queueWindow: 0.4,
    // pressing a key this close to the end of a cast or GCD queues it
    runSpeed: 7,
    // yards per second
    meleeRange: 3,
    // yards between the edges of the two units (about 5 yards center to center, Classic)
    rangedMinRange: 5,
    // ranged weapons need at least this much room (edge to edge, about 8 yards center to center)
    autoShotRange: 35,
    // Normalized weapon speed for abilities that use it (Forever's 'normalized weapon damage'): Classic later values.
    normalizedSpeed: { ranged: 2.8, dagger: 1.7, oneHand: 2.4, twoHand: 3.3 },
    // Ranged attacks: no parry, no glancing blows. ESTIMATE: no dodge either (Classic sims for Hunters assume none).
    // Spell miss chance by level difference (target - caster). Forever: 3% vs same level, 16% vs a raid boss.
    spellMissByLevelDiff: [0.03, 0.04, 0.05, 0.16],
    minSpellMiss: 0.01,
    // 1% can never be removed
    spellCritBonus: 0.5,
    // spell crits deal 150% damage before talents
    meleeCritBonus: 1,
    // melee crits deal 200%
    // Level based resistance: 8 per level of difference, read as average partial resist on non-binary spells.
    resistPerLevel: 8,
    manaTick: 2,
    // mana and energy regenerate in ticks of 2 sec
    fiveSecondRule: 5,
    // spending mana stops Spirit regeneration for 5 sec
    // Pushback (Classic 1.12): damage that gets through while casting delays the cast by 1 sec (never back past its
    // start); while channeling it cuts 25% of the channel's full duration. The focus talents, Concentration Aura, Power
    // Word: Shield and Ice Barrier give a chance to keep the casting time (modifier 'pushbackChance', 1 = always pushed).
    pushback: 1,
    channelPushback: 0.25,
    // Melee attack table (Classic 1.12, weapon skill 300 against defense 5 x target level), by level difference 0 to 3.
    meleeMiss: [0.05, 0.055, 0.06, 0.08],
    // special attacks; dual wield auto attacks: miss x 0.8 + 19%
    hitSuppression: [0, 0, 0, 0.01],
    // the first 1% of hit does nothing against a +3 target
    meleeDodge: [0.05, 0.055, 0.06, 0.065],
    meleeParry: [0.05, 0.055, 0.06, 0.14],
    // only from the front
    glancingChance: [0.1, 0.2, 0.3, 0.4],
    // auto attacks only
    glancingPenalty: [0.05, 0.05, 0.15, 0.35],
    // damage lost on a glancing blow
    critSuppression: [0, 0.01, 0.02, 0.03],
    // An enemy's melee attack on the player (Classic 1.12, one roll): miss, dodge, parry and block from the front only,
    // then crit (special attacks cannot crit), crushing blow (enemies 3 or more levels above), normal hit.
    // The enemy's attack skill is 5 x its level; each point of the player's Defense above it adds 0.04% to miss, dodge,
    // parry and block and takes 0.04% from its crit chance (a level 63 boss: 315 against 300 Defense).
    enemyMiss: 0.05,
    enemyCrit: 0.05,
    defensePerPoint: 4e-4,
    baseParry: 0.05,
    // classes that can parry (cls.stats.canParry)
    baseBlock: 0.05,
    // with a shield
    crushingChance: 0.15,
    // enemy 3+ levels above (attack skill 15 over the player's level x 5)
    crushingMult: 1.5,
    enemyCritMult: 2,
    rageFromDamageTaken: 2.5,
    // rage = 2.5 x damage taken / 230.6 at level 60 (Classic; how Forever counts the damage: resources.js)
    // Hit cap against a level 63 boss (a test can put the player on it: game.rules.hitCapped): 9% for weapon attacks
    // (8% plus the 1% that does nothing), 15% for spells (16% down to the 1% that always misses).
    hitCapMelee: 0.09,
    hitCapSpell: 0.15
  };
  var byLevelDiff = (table, diff) => table[Math.max(0, Math.min(table.length - 1, diff))];
  function spellMiss(levelDiff3) {
    return byLevelDiff(RULES.spellMissByLevelDiff, levelDiff3);
  }
  function averageResist(resist, casterLevel) {
    return Math.min(0.75, Math.max(0, resist) / (casterLevel * 5) * 0.75);
  }
  function armorReduction(armor, attackerLevel) {
    const a = Math.max(0, armor), lvl = attackerLevel > 59 ? attackerLevel + 4.5 * (attackerLevel - 59) : attackerLevel;
    return Math.min(0.75, a / (a + 400 + 85 * lvl));
  }

  // src/core/modifiers.js
  function applyMods(game, key, value, ctx = {}) {
    let v = value;
    for (const m of game.talentMods) if (m.key === key) v = m.fn(v, ctx, game);
    const caster4 = ctx.caster || game.player;
    if (caster4) for (const a of caster4.auras) {
      if (!a.def.mods) continue;
      for (const m of a.def.mods(a, game)) if (m.key === key) v = m.fn(v, ctx, game, a);
    }
    const target = ctx.target;
    if (target && target !== caster4) for (const a of target.auras) {
      if (!a.def.sourceMods || a.source !== caster4) continue;
      for (const m of a.def.sourceMods(a, game)) if (m.key === key) v = m.fn(v, ctx, game, a);
    }
    return v;
  }
  var hasSchool = (ctx, school) => !!ctx.schools && ctx.schools.includes(school);
  var isAbility = (ctx, ...ids) => !!ctx.ability && ids.includes(ctx.ability.id);
  var add = (key, amount, when) => ({ key, fn: (v, ctx, g, a) => !when || when(ctx, g, a) ? v + (typeof amount === "function" ? amount(ctx, g, a) : amount) : v });
  var mult = (key, factor, when) => ({ key, fn: (v, ctx, g, a) => !when || when(ctx, g, a) ? v * (typeof factor === "function" ? factor(ctx, g, a) : factor) : v });
  var focus = (chance, when) => mult("pushbackChance", 1 - chance, when);
  var set = (key, value, when) => ({ key, fn: (v, ctx, g, a) => !when || when(ctx, g, a) ? value : v });

  // src/core/stats.js
  var ATTRIBUTES = ["str", "agi", "sta", "int", "spi"];
  function computeStats(game) {
    const rules = game.cls.stats, gear = game.loadout.gear || {};
    const ctx = { caster: game.player };
    let attrs = {};
    for (const k of ATTRIBUTES) attrs[k] = (rules.base[k] || 0) + (gear[k] || 0);
    attrs = applyMods(game, "attributes", attrs, ctx);
    for (const k of ATTRIBUTES) attrs[k] = Math.round(attrs[k]);
    const d = rules.derive(attrs);
    const w = game.cls.weapons && game.cls.weapons(game) || {}, shield = w.shield || null;
    const itemArmor = applyMods(game, "itemArmor", gear.armor || 0, ctx);
    return {
      ...attrs,
      level: rules.level,
      maxHp: Math.round(applyMods(game, "maxHp", d.maxHp, ctx)),
      armor: Math.round(applyMods(game, "armor", itemArmor + attrs.agi * 2, { ...ctx, attrs })),
      // ctx.attrs: armor from Intellect (Arcane Resilience)
      defense: Math.round(applyMods(game, "defense", rules.level * 5 + (gear.defense || 0), ctx)),
      dodge: applyMods(game, "dodgeChance", (d.dodge != null ? d.dodge : attrs.agi / 20 / 100) + (gear.dodge || 0), ctx),
      parry: rules.canParry || applyMods(game, "canParry", false, ctx) ? applyMods(game, "parryChance", RULES.baseParry + (gear.parry || 0), ctx) : 0,
      block: shield ? applyMods(game, "blockChance", RULES.baseBlock, ctx) : 0,
      blockValue: shield ? Math.round(applyMods(game, "blockValue", (shield.block || 0) + attrs.str / 20, ctx)) : 0,
      maxMana: applyMods(game, "maxMana", d.maxMana || 0, ctx),
      baseMana: rules.baseMana,
      regen: d.regen || 0,
      // mana per second from Spirit, outside the five second rule
      ap: (d.ap || 0) + (gear.ap || 0),
      // melee attack power
      rap: (d.rap || 0) + (gear.ap || 0) + (gear.rap || 0),
      // ranged attack power (gear attack power counts for both)
      crit: d.crit + (gear.crit || 0),
      // one crit chance for physical and spells (WoW: Forever)
      hit: gear.hit || 0,
      expertise: gear.expertise || 0,
      // WoW: Forever: takes as much from the target's dodge and parry chance
      haste: gear.haste || 0,
      // Bonus healing (WoW: Forever healing gear): heals get all of it, spell damage a third. sp is the spell power for
      // damage (a third of it included); healExtra is what heals add on top (healing.js).
      sp: (gear.sp || 0) + (gear.heal || 0) / 3,
      healExtra: (gear.heal || 0) * 2 / 3,
      mp5: gear.mp5 || 0,
      // mana every 5 sec that ignores the five second rule
      spSchool: gear.spSchool || {}
    };
  }
  var presetTier = (p) => p.tier || p.id;
  function gearPresetFor(presets, tier, role) {
    return presets.find((p) => presetTier(p) === tier && (!role || !p.role || p.role === role)) || presets.find((p) => p.id === tier) || null;
  }

  // src/core/resources.js
  var mana = {
    id: "mana",
    label: "Mana",
    keepsWhenInactive: true,
    // a Druid's mana regenerates in Cat and Bear Form too; Energy and Rage wait for their form
    color: "#2f6fd6",
    init(game, u) {
      u.power = this.max(game);
      u.lastSpend = -99;
      u.tickIn = RULES.manaTick;
    },
    max(game) {
      return game.stats().maxMana;
    },
    has(game, u, n) {
      return u.power >= n;
    },
    spend(game, u, n) {
      if (n > 0) {
        u.power = Math.max(0, u.power - n);
        u.lastSpend = game.time;
      }
    },
    gain(game, u, n) {
      u.power = Math.min(this.max(game), u.power + n);
    },
    // Classic: Spirit regeneration every 2 sec, stopped for 5 sec after spending mana.
    update(game, u, dt) {
      u.tickIn -= dt;
      while (u.tickIn <= 0) {
        u.tickIn += RULES.manaTick;
        const ctx = { caster: game.player };
        const inside = game.time - u.lastSpend < RULES.fiveSecondRule;
        const share = inside ? Math.min(1, applyMods(game, "regenWhileCasting", 0, ctx)) : 1;
        const mp5 = applyMods(game, "mp5", game.stats().mp5 || 0, ctx);
        const amount = game.stats().regen * RULES.manaTick * share * applyMods(game, "regenMult", 1, ctx) + mp5 / 5 * RULES.manaTick;
        if (amount > 0) this.gain(game, u, amount);
      }
    }
  };
  var energy = {
    id: "energy",
    label: "Energy",
    color: "#e8d23a",
    base: 100,
    perTick: 20,
    init(game, u) {
      u.power = this.max(game);
      u.tickIn = RULES.manaTick;
    },
    max(game) {
      return applyMods(game, "maxPower", this.base, { caster: game.player });
    },
    has(game, u, n) {
      return u.power >= n;
    },
    spend(game, u, n) {
      if (n > 0) u.power = Math.max(0, u.power - n);
    },
    gain(game, u, n) {
      u.power = Math.min(this.max(game), u.power + n);
    },
    update(game, u, dt) {
      u.tickIn -= dt;
      while (u.tickIn <= 0) {
        u.tickIn += RULES.manaTick;
        this.gain(game, u, this.perTick * applyMods(game, "powerRegenMult", 1, { caster: game.player }));
      }
    }
  };
  var RAGE_CONVERSION = 230.6;
  var RAGE_PER_SPEED = { main: 3.46, off: 1.73, twoHand: 4.5 };
  var RAGE_ARMOR_BASELINE = 0.4;
  var rageFromSwing = (weapon, hand, crit2) => {
    if (!weapon || hand === "ranged") return 0;
    const k = weapon.twoHand ? RAGE_PER_SPEED.twoHand : hand === "off" ? RAGE_PER_SPEED.off : RAGE_PER_SPEED.main;
    return k * weapon.speed * (crit2 ? 2 : 1);
  };
  var LANDED = /* @__PURE__ */ new Set(["hit", "crit", "glance"]);
  var rage = {
    id: "rage",
    label: "Rage",
    color: "#e0503f",
    startsEmpty: true,
    init(game, u) {
      u.power = 0;
      u.tickIn = 1;
    },
    max() {
      return 100;
    },
    has(game, u, n) {
      return u.power >= n;
    },
    spend(game, u, n) {
      if (n > 0) u.power = Math.max(0, u.power - n);
    },
    gain(game, u, n) {
      u.power = Math.min(100, u.power + n);
    },
    onWhiteHit(game, u, res, hand, weapon) {
      if (!res || !LANDED.has(res.outcome)) return;
      const ctx = { caster: game.player, hand };
      this.gain(game, u, rageFromSwing(weapon, hand, res.outcome === "crit") * applyMods(game, "rageFromHit", 1, ctx));
    },
    // Taking damage: 2.5 x damage / 230.6 (Classic), on the amount defense.js counts for rage (res.rageAmount: before
    // armor and absorbs, with the armor baseline). Modifier 'rageFromDamageTaken'.
    onDamageTaken(game, u, amount) {
      this.gain(game, u, RULES.rageFromDamageTaken * amount / RAGE_CONVERSION * applyMods(game, "rageFromDamageTaken", 1, { caster: game.player }));
    },
    update(game, u, dt) {
      u.tickIn -= dt;
      while (u.tickIn <= 0) {
        u.tickIn += 1;
        const ctx = { caster: game.player };
        if (game.inCombat()) this.gain(game, u, applyMods(game, "rageInCombatPerSec", 0, ctx));
        else if (game.meter.last == null || game.time - game.meter.last > 5 + applyMods(game, "rageDecayDelay", 0, ctx)) u.power = Math.max(0, u.power - 1.5 * applyMods(game, "rageDecayMult", 1, ctx));
      }
    }
  };
  var RESOURCES = { mana, energy, rage };
  var COMBO_MAX = 5;
  function comboOn(game, target) {
    const c = game.player.combo;
    return c && c.target === target ? c.points : 0;
  }
  function addCombo(game, target, n) {
    const p = game.player;
    if (!target || n <= 0) return;
    if (!p.combo || p.combo.target !== target) p.combo = { target, points: 0 };
    const before = p.combo.points;
    p.combo.points = Math.min(COMBO_MAX, p.combo.points + n);
    if (p.combo.points !== before) game.emit("combo", { target, points: p.combo.points, gained: p.combo.points - before });
  }
  function spendCombo(game) {
    const p = game.player, n = p.combo ? p.combo.points : 0;
    p.combo = null;
    if (n) game.emit("combo", { target: null, points: 0, spent: n });
    return n;
  }

  // src/core/combat.js
  function spellPower(game, ctx) {
    const s = game.stats();
    let school = 0;
    for (const k of ctx.schools || []) school = Math.max(school, s.spSchool && s.spSchool[k] || 0);
    return applyMods(game, "spellPower", s.sp + school, ctx);
  }
  function levelDiff(ctx) {
    return Math.max(0, (ctx.target.level || RULES.maxLevel) - (ctx.caster.level || RULES.maxLevel));
  }
  function resistMult(ctx) {
    if ((ctx.schools || []).includes("physical")) return 1;
    const t = ctx.target, res = t.resist || {};
    let r = Infinity;
    for (const k of ctx.schools || []) r = Math.min(r, res[k] || 0);
    if (!isFinite(r)) r = 0;
    return 1 - averageResist(r + levelDiff(ctx) * RULES.resistPerLevel, ctx.caster.level || RULES.maxLevel);
  }
  function critChance(game, ctx) {
    return applyMods(game, "critChance", game.stats().crit, ctx);
  }
  function missChance(game, ctx) {
    const raw = applyMods(game, "hitChance", game.stats().hit, ctx);
    const hit2 = game.rules.hitCapped ? Math.max(raw, RULES.hitCapSpell) : raw;
    return Math.max(RULES.minSpellMiss, spellMiss(levelDiff(ctx)) - hit2);
  }
  function spellHit(game, ctx, spec) {
    ctx.frozen = isFrozen(ctx.target) || applyMods(game, "treatAsFrozen", false, ctx);
    if (!spec.noMiss && game.rng() < missChance(game, ctx)) {
      const res2 = { outcome: "miss", amount: 0 };
      game.reportDamage(ctx, res2, spec);
      return res2;
    }
    const sp = spellPower(game, ctx) + (spec.spBonus ? spec.spBonus(game, ctx) : 0);
    let amount = game.rng.range(spec.min, spec.max) + sp * (spec.coef || 0);
    amount *= applyMods(game, "damageMult", 1, ctx);
    let outcome = "hit";
    if (spec.canCrit !== false && game.rng() < critChance(game, ctx)) {
      outcome = "crit";
      amount *= 1 + RULES.spellCritBonus * applyMods(game, "critBonusMult", 1, ctx);
    }
    if (!spec.binary) amount *= resistMult(ctx);
    const res = { outcome, amount: Math.max(0, Math.round(amount)) };
    game.reportDamage(ctx, res, spec);
    return res;
  }
  function periodicHit(game, aura2) {
    const dot = aura2.dot, caster4 = aura2.source, target = aura2.unit;
    const ctx = { caster: caster4, target, ability: aura2.data.ability || null, aura: aura2, schools: aura2.def.schools || [], tags: aura2.def.tags || [], periodic: true, castId: aura2.data.castId };
    ctx.frozen = isFrozen(target);
    let amount = dot.amount ? dot.amount(game, aura2) : aura2.data.perTick || 0;
    if (!dot.fixed) amount *= applyMods(game, "damageMult", 1, ctx);
    let outcome = "hit";
    if (dot.canCrit && game.rng() < critChance(game, ctx)) {
      outcome = "crit";
      amount *= 1 + RULES.spellCritBonus * applyMods(game, "critBonusMult", 1, ctx);
    }
    if (!dot.fixed && !dot.binary) amount *= resistMult(ctx);
    const res = { outcome, amount: Math.max(0, Math.round(amount)) };
    game.reportDamage(ctx, res, { name: dot.label || `${aura2.def.name} (DoT)` });
    return res;
  }

  // src/core/position.js
  function isBehind(attacker, target) {
    const a = Math.atan2(attacker.y - target.y, attacker.x - target.x) - (target.facing || 0);
    return Math.cos(a) < 0;
  }
  var isStunned = (unit) => unit.auras.some((a) => a.def.flags && a.def.flags.stunned);
  var isStealthed = (unit) => unit.auras.some((a) => a.def.flags && a.def.flags.stealth);

  // src/core/threat.js
  var landedOutcome = (o) => o === "hit" || o === "crit" || o === "glance" || o === "block" || o === "crushing";
  var hasThreatTable = (u) => !!u && !!u.threat;
  function addThreat(game, enemy, amount, ctx, name, icon2) {
    if (!hasThreatTable(enemy) || !(amount > 0) || game.player.dead) return 0;
    const t = amount * applyMods(game, "threatMult", 1, { caster: game.player, ...ctx, target: enemy });
    enemy.threat.player += t;
    engageEnemy(game, enemy);
    const m = game.meter;
    m.threat += t;
    const key = name || "Other";
    const row = m.threatRows[key] || (m.threatRows[key] = { name: key, icon: icon2 || null, total: 0 });
    row.total += t;
    return t;
  }
  function hitThreat(game, ctx, res, spec) {
    const t = ctx.target, ab = ctx.ability;
    if (!hasThreatTable(t) || ctx.caster !== game.player || !landedOutcome(res.outcome)) return;
    const name = spec && spec.name || ab && ab.name || "Unknown";
    const icon2 = ctx.aura && ctx.aura.def.icon || ab && ab.icon || (ctx.melee ? "inv_sword_04" : null);
    let amount = res.amount * (ctx.periodic ? (ab && ab.dotThreatMult) ?? 1 : (spec && spec.threatMult) ?? (ab && ab.threatMult) ?? 1);
    if (ab && ab.threat && !ctx.periodic && !ctx.threatBonus) {
      ctx.threatBonus = true;
      amount += typeof ab.threat === "function" ? ab.threat(game, ctx) : ab.threat;
    }
    addThreat(game, t, amount, ctx, name, icon2);
  }
  function healThreat(game, amount, ctx, name, icon2) {
    if (ctx && ctx.ability && ctx.ability.threatMult === 0) return;
    const list = game.enemies.filter((e) => hasThreatTable(e) && e.engaged && !e.dead);
    for (const e of list) addThreat(game, e, 0.5 * amount / list.length, ctx, name, icon2);
  }
  function taunt(game, enemy, duration, { force = false } = {}) {
    if (!hasThreatTable(enemy) || enemy.dead) return false;
    engageEnemy(game, enemy);
    if (!force) {
      if (enemy.aggro === "player") return false;
      enemy.threat.player = Math.max(enemy.threat.player, enemy.threat.raid);
    }
    enemy.forcedUntil = Math.max(enemy.forcedUntil || 0, game.time + duration);
    game.emit("taunt", { enemy, duration });
    return true;
  }
  function engageEnemy(game, enemy) {
    if (!enemy.ai || enemy.engaged || enemy.dead) return;
    enemy.engaged = true;
    enemy.engagedAt = game.time;
    game.emit("engage", { enemy });
  }

  // src/core/melee.js
  var weaponsOf = (game) => (game.cls.weapons ? game.cls.weapons(game) : {}) || {};
  var attackPower = (game, ctx) => applyMods(game, "attackPower", game.stats().ap, ctx);
  var rangedAttackPower = (game, ctx) => applyMods(game, "rangedAttackPower", game.stats().rap, ctx);
  function normalizedSpeed(w) {
    const n = RULES.normalizedSpeed;
    return w.ranged ? n.ranged : w.type === "dagger" ? n.dagger : w.twoHand ? n.twoHand : n.oneHand;
  }
  function weaponRoll(game, hand, ctx, normalized) {
    const w = weaponsOf(game)[hand];
    if (!w) return 0;
    const ap = w.ranged ? rangedAttackPower(game, ctx) : attackPower(game, ctx);
    return game.rng.range(w.min, w.max) + (w.ammo || 0) * w.speed + ap / 14 * (normalized ? normalizedSpeed(w) : w.speed);
  }
  var levelDiff2 = (ctx) => Math.max(0, (ctx.target.level || RULES.maxLevel) - (ctx.caster.level || RULES.maxLevel));
  function meleeHit(game, ctx, spec) {
    const s = game.stats(), diff = levelDiff2(ctx), t = ctx.target;
    ctx.melee = true;
    ctx.white = !!spec.white;
    ctx.hand = spec.hand || "main";
    ctx.ranged = ctx.hand === "ranged";
    ctx.behind = isBehind(ctx.caster, t);
    const rawHit = applyMods(game, "hitChance", s.hit, ctx);
    const hit2 = Math.max(0, (game.rules.hitCapped ? Math.max(rawHit, RULES.hitCapMelee) : rawHit) - byLevelDiff(RULES.hitSuppression, diff));
    let miss = byLevelDiff(RULES.meleeMiss, diff);
    if (spec.white && !ctx.ranged && weaponsOf(game).off && !game.player.nextSwing) miss += 0.19;
    miss = spec.noMiss ? 0 : Math.max(0, miss - hit2);
    const lessAvoid = applyMods(game, "avoidanceReduction", s.expertise || 0, ctx);
    const stunned = isStunned(t);
    const dodge = spec.noDodge || stunned || ctx.ranged ? 0 : Math.max(0, byLevelDiff(RULES.meleeDodge, diff) - lessAvoid);
    const parry = spec.noParry || stunned || ctx.behind || ctx.ranged ? 0 : Math.max(0, byLevelDiff(RULES.meleeParry, diff) - lessAvoid);
    const crit2 = Math.max(0, applyMods(game, "critChance", s.crit, ctx) - byLevelDiff(RULES.critSuppression, diff));
    let r = game.rng(), outcome;
    if (r < miss) outcome = "miss";
    else if (r < miss + dodge) outcome = "dodge";
    else if (r < miss + dodge + parry) outcome = "parry";
    else if (spec.white) {
      const glance = ctx.ranged ? 0 : byLevelDiff(RULES.glancingChance, diff);
      if (r < miss + dodge + parry + glance) outcome = "glance";
      else if (r < miss + dodge + parry + glance + crit2) outcome = "crit";
      else outcome = "hit";
    } else outcome = spec.canCrit !== false && game.rng() < crit2 ? "crit" : "hit";
    if (outcome === "miss" || outcome === "dodge" || outcome === "parry") {
      const res2 = { outcome, amount: 0 };
      game.reportDamage(ctx, res2, spec);
      return res2;
    }
    if (spec.noDamage) {
      const res2 = { outcome, amount: 0 };
      hitThreat(game, ctx, res2, spec);
      return res2;
    }
    let amount = spec.min != null ? game.rng.range(spec.min, spec.max) : weaponRoll(game, ctx.hand, ctx, spec.normalized) * (spec.weaponPct != null ? spec.weaponPct : 1) + (spec.flat || 0);
    if (spec.apCoef) amount += (ctx.ranged ? rangedAttackPower(game, ctx) : attackPower(game, ctx)) * spec.apCoef;
    if (spec.spCoef) amount += spellPower(game, ctx) * spec.spCoef;
    if (spec.white && ctx.hand === "off") amount *= 0.5 * applyMods(game, "offHandMult", 1, ctx);
    amount *= applyMods(game, "damageMult", 1, ctx);
    if (outcome === "crit") amount *= 1 + RULES.meleeCritBonus * applyMods(game, "critBonusMult", 1, ctx);
    if (outcome === "glance") amount *= 1 - byLevelDiff(RULES.glancingPenalty, diff);
    if (!spec.ignoreArmor && (ctx.schools || ["physical"]).includes("physical")) {
      const armor = applyMods(game, "targetArmor", t.armor || 0, ctx) * (1 - Math.min(1, applyMods(game, "armorPenPct", 0, ctx)));
      amount *= 1 - armorReduction(armor, ctx.caster.level || RULES.maxLevel);
    }
    const res = { outcome, amount: Math.max(0, Math.round(amount)) };
    game.reportDamage(ctx, res, spec);
    return res;
  }
  var landed = (res) => !!res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  function swing(game, hand, target, label) {
    const p = game.player;
    const ctx = { castId: ++game.castSeq, caster: p, target, ability: null, schools: ["physical"], tags: ["auto"], extra: !!label };
    const name = label || (hand === "main" ? "Main Hand" : hand === "off" ? "Off Hand" : "Auto Shot");
    const res = meleeHit(game, ctx, { white: true, hand, name });
    if (game.resource.onWhiteHit) game.resource.onWhiteHit(game, p, res, hand, weaponsOf(game)[hand]);
    game.emit("swing", { hand, ctx, res });
    return res;
  }
  function nextSwingAttack(game, target) {
    const p = game.player, ab = game.ability(p.nextSwing);
    p.nextSwing = null;
    if (!ab) return false;
    const ctx = game.newCtx(ab);
    if (game.blockReason(ab, ctx)) return false;
    game.completeCast(ab, ctx);
    game.emit("swing", { hand: "main", ctx, res: ctx.result || null, special: true });
    return true;
  }
  function updateAutoAttack(game, h2) {
    const p = game.player, w = weaponsOf(game);
    if (!w.main && !w.ranged) return;
    p.swing = p.swing || { main: 0, off: 0, ranged: 0 };
    const speed2 = applyMods(game, "attackSpeed", 1 + game.stats().haste, { caster: p });
    for (const hand of ["main", "off"]) if (w[hand]) p.swing[hand] = Math.max(0, p.swing[hand] - h2 * speed2);
    if (w.ranged) p.swing.ranged = Math.max(0, (p.swing.ranged || 0) - h2 * applyMods(game, "attackSpeed", 1 + game.stats().haste, { caster: p, ranged: true }));
    const t = p.target;
    if (!p.autoAttack || !t || t.dead || p.dead || applyMods(game, "noActions", false, { caster: p }) || applyMods(game, "noAttack", false, { caster: p })) return;
    if (p.cast && !applyMods(game, "swingWhileCasting", false, { caster: p, ability: p.cast.ab })) return;
    const d = game.edgeDistance(p, t);
    if (w.ranged && d >= RULES.rangedMinRange && d <= applyMods(game, "range", RULES.autoShotRange, { caster: p, ranged: true }) && !p.moving && p.swing.ranged <= 0) {
      game.emit("fx", { kind: "shot", from: { x: p.x, y: p.y }, to: t, schools: ["physical"], duration: Math.min(0.6, game.edgeDistance(p, t) / 45) });
      swing(game, "ranged", t);
      p.swing.ranged = w.ranged.speed;
      return;
    }
    if (d > RULES.meleeRange) return;
    for (const hand of ["main", "off"]) {
      if (!w[hand] || p.swing[hand] > 0 || t.dead) continue;
      game.breakStealth();
      if (!(hand === "main" && p.nextSwing && nextSwingAttack(game, t))) swing(game, hand, t);
      p.swing[hand] = w[hand].speed;
    }
  }

  // src/core/healing.js
  var HEAL_CRIT_BONUS = 0.5;
  var isFriendly = (u) => !!u && (u.kind === "player" || u.kind === "ally");
  var maxHpOf = (game, u) => u === game.player ? game.stats().maxHp : u.maxHp;
  var hpPct = (game, u) => u.hp / Math.max(1, maxHpOf(game, u));
  var raidMembers = (game) => [game.player, ...game.allies || []];
  var partyOf = (game, u) => raidMembers(game).filter((x) => x.party != null && x.party === u.party);
  function friendlyTarget(game) {
    const f = game.player.friend;
    return f && !f.dead ? f : game.player;
  }
  function healingPower(game, ctx) {
    const c = { ...ctx, heal: true };
    return applyMods(game, "healingPower", spellPower(game, c) + (game.stats().healExtra || 0), c);
  }
  function absorbOn(game, unit, amount, schools = ["physical"]) {
    let left = amount;
    const shields = unit.auras.filter((a) => a.def.absorb && (a.data.absorb || 0) > 0 && (!a.def.absorbSchools || schools.some((s) => a.def.absorbSchools.includes(s)))).sort((a, b) => (a.def.absorbOrder || 0) - (b.def.absorbOrder || 0));
    for (const a of shields) {
      if (left <= 0) break;
      const take = Math.min(left, a.data.absorb);
      a.data.absorb -= take;
      left -= take;
      if (a.source === game.player && take > 0) {
        const m = game.meter, r = m.healDoneRows[a.def.name] || (m.healDoneRows[a.def.name] = { name: a.def.name, icon: a.def.icon, total: 0, over: 0, hits: 0, crits: 0 });
        m.healDone += take;
        r.total += take;
        r.hits++;
      }
      if (a.data.absorb <= 0) removeAura(game, a, "consumed");
    }
    return amount - left;
  }
  function healUnit(game, unit, amount, { name = "Healing", icon: icon2 = null, crit: crit2 = false, periodic = false, source = "player", ctx = null } = {}) {
    if (!unit || unit.dead || !(amount > 0)) return { amount: 0, effective: 0 };
    const p = game.player, m = game.meter;
    let total = amount;
    if (unit === p) total *= applyMods(game, "healingTaken", 1, { caster: p, incoming: true });
    const effective = Math.max(0, Math.min(total, maxHpOf(game, unit) - unit.hp));
    unit.hp += effective;
    const mine = source === "player" || source === "self";
    if (unit === p) {
      m.healed += effective;
      const row = m.healRows[name] || (m.healRows[name] = { name, icon: icon2, total: 0 });
      row.total += effective;
    }
    if (mine) {
      if (m.first == null) m.first = game.time;
      m.last = game.time;
      m.healDone += effective;
      m.overheal += total - effective;
      const r = m.healDoneRows[name] || (m.healDoneRows[name] = { name, icon: icon2, total: 0, over: 0, hits: 0, crits: 0 });
      r.total += effective;
      r.over += total - effective;
      r.hits++;
      if (crit2) r.crits++;
      if (effective > 0) healThreat(game, effective, ctx || { caster: p }, name, icon2);
    } else m.otherHeal += effective;
    const ev = { unit, amount: Math.round(total), effective: Math.round(effective), overheal: Math.round(total - effective), name, crit: crit2, periodic, source, ctx };
    game.emit("heal", ev);
    return ev;
  }
  function healHit(game, ctx, spec) {
    const t = ctx.target;
    if (!t || t.dead) return null;
    const c = { ...ctx, heal: true };
    let amount = spec.pctMaxHp ? maxHpOf(game, t) * spec.pctMaxHp : game.rng.range(spec.min, spec.max) + healingPower(game, c) * (spec.coef || 0) + applyMods(game, "healBonus", 0, c);
    amount *= applyMods(game, "healMult", 1, c);
    let crit2 = false;
    if (spec.canCrit !== false && !spec.pctMaxHp && game.rng() < critChance(game, c)) {
      crit2 = true;
      amount *= 1 + HEAL_CRIT_BONUS * applyMods(game, "healCritBonusMult", 1, c);
    }
    const name = spec.name || ctx.ability && ctx.ability.name;
    const res = healUnit(game, t, amount, { name, icon: ctx.ability && ctx.ability.icon, crit: crit2, source: "player", ctx: c });
    ctx.healResult = res;
    return res;
  }
  function hotTick(game, a) {
    const per5 = a.data.perTick || 0, n = a.data.ticks || 1;
    const k = a.def.hotShape === "decay" ? 2 * (n + 1 - a.tick) / (n + 1) : 1;
    const ctx = { caster: a.source, target: a.unit, ability: a.data.ability || null, periodic: true, heal: true, schools: a.def.schools || [] };
    return healUnit(game, a.unit, per5 * k, { name: a.def.name, icon: a.def.icon, periodic: true, source: a.source === game.player ? "player" : "raid", ctx });
  }
  function damageUnit(game, unit, amount, { name = "Damage", schools = ["physical"], attacker = null } = {}) {
    if (!unit || unit.dead || !(amount > 0)) return 0;
    if (unit === game.player) return game.damagePlayer(Math.round(amount), { name, schools, attacker });
    const absorbed = absorbOn(game, unit, Math.round(amount), schools);
    const dmg = Math.round(amount) - absorbed;
    unit.hp -= dmg;
    if (unit.hp <= 0 && unit.immortal) {
      unit.hp = 1;
      game.emit("wouldDie", { unit });
    }
    game.meter.raidTaken += dmg;
    game.emit("allyHit", { unit, amount: dmg, absorbed, name });
    if (dmg > 0) game.emit("unitDamaged", { unit, amount: dmg, name });
    if (unit.hp <= 0) killAlly(game, unit);
    return dmg;
  }
  function spendHealth(game, unit, amount, name = "Health") {
    if (!unit || unit.dead || !(amount > 0)) return 0;
    const n = Math.min(Math.round(amount), Math.max(0, Math.ceil(unit.hp) - 1));
    if (n <= 0) return 0;
    unit.hp -= n;
    game.emit("healthCost", { unit, amount: n, name });
    return n;
  }
  function regenHealth(game, unit, amount, name = "Regeneration") {
    return healUnit(game, unit, amount, { name, periodic: true, source: "regen" });
  }
  function dispelUnit(game, unit, types, count = 1) {
    if (!unit || unit.dead) return 0;
    const list = unit.auras.filter((a) => a.def.kind === "debuff" && types.includes(a.def.dispelType)).sort((a, b) => a.applied - b.applied).slice(0, count);
    for (const a of list) removeAura(game, a, "dispelled");
    if (list.length) game.emit("dispel", { unit, auras: list.map((a) => a.def.name) });
    return list.length;
  }
  function killAlly(game, unit) {
    unit.hp = 0;
    unit.dead = true;
    for (const a of unit.auras.slice()) removeAura(game, a, "died");
    if (game.player.friend === unit) game.player.friend = null;
    game.meter.deaths.push({ name: unit.name, role: unit.role, at: game.meter.first != null ? game.time - game.meter.first : game.time });
    game.emit("allyDeath", { unit });
  }

  // src/core/auras.js
  function findAura(unit, id, source) {
    return unit.auras.find((a) => a.id === id && (source === void 0 || a.source === source)) || null;
  }
  function applyAura(game, unit, def, opts = {}) {
    const source = opts.source || null;
    const dot = def.dot ? { ...def.dot, ...opts.dot || {} } : null;
    const duration = opts.duration != null ? opts.duration : opts.dot && dot ? dot.period * dot.ticks : def.duration != null ? def.duration : dot ? dot.period * dot.ticks : Infinity;
    if (def.exclusive) {
      for (const o of unit.auras.slice()) if (o.def.exclusive === def.exclusive && o.id !== def.id && o.source === source) removeAura(game, o, "replaced");
    }
    let a = findAura(unit, def.id, source);
    const fresh = !a;
    if (fresh) {
      a = { def, id: def.id, unit, source, stacks: 0, applied: game.time, expires: 0, duration, data: {}, charges: def.charges || 0 };
      unit.auras.push(a);
    }
    const max = def.maxStacks || 1;
    a.stacks = Math.min(max, a.stacks + (opts.stacks || 1));
    if (opts.charges != null) a.charges = opts.charges;
    if (fresh || def.refresh !== false) {
      a.duration = duration;
      a.expires = game.time + duration;
    }
    if (opts.data) Object.assign(a.data, opts.data);
    if (dot) a.dot = dot;
    if (dot || def.period) {
      const period = dot ? dot.period : def.period;
      if (fresh || def.refresh !== false) {
        a.nextTick = game.time + period;
        a.tick = 0;
      }
    }
    if (dot) {
      if (dot.snapshot) dot.snapshot(game, a, opts);
      else if (dot.base != null) {
        const ctx = { caster: source, target: unit, schools: def.schools || [], ability: opts.data && opts.data.ability, periodic: true };
        const bonus = (dot.coef ? spellPower(game, ctx) * dot.coef : 0) + (dot.apCoef ? attackPower(game, ctx) * dot.apCoef : 0);
        a.data.perTick = (dot.base + bonus) / dot.ticks;
      }
    }
    if (def.onApply) def.onApply(game, a, fresh);
    game.statsChanged();
    game.emit("aura:apply", { aura: a, unit, fresh });
    return a;
  }
  function removeAura(game, aura2, reason = "removed") {
    const unit = aura2.unit;
    const i = unit.auras.indexOf(aura2);
    if (i < 0) return;
    unit.auras.splice(i, 1);
    if (aura2.def.onRemove) aura2.def.onRemove(game, aura2, reason);
    game.statsChanged();
    game.emit("aura:remove", { aura: aura2, unit, reason });
  }
  function useCharge(game, aura2) {
    aura2.charges = Math.max(0, aura2.charges - 1);
    if (aura2.charges <= 0) removeAura(game, aura2, "consumed");
    else game.emit("aura:apply", { aura: aura2, unit: aura2.unit, fresh: false });
  }
  function updateAuras(game, unit) {
    for (const a of unit.auras.slice()) {
      const period = a.dot ? a.dot.period : a.def.period;
      while (period && a.nextTick != null && a.nextTick <= game.time + 1e-9 && a.nextTick <= a.expires + 1e-6 && unit.auras.includes(a)) {
        a.nextTick += period;
        a.tick = (a.tick || 0) + 1;
        if (a.dot) periodicHit(game, a);
        if (a.def.hot) hotTick(game, a);
        if (a.def.onTick) a.def.onTick(game, a);
      }
      if (a.expires <= game.time + 1e-9 && unit.auras.includes(a)) removeAura(game, a, "expired");
    }
  }
  var isFrozen = (unit) => unit.auras.some((a) => a.def.flags && a.def.flags.frozen);
  function breakOnDamage(game, unit) {
    for (const a of unit.auras.slice()) if (a.def.flags && a.def.flags.breaksOnDamage) removeAura(game, a, "broken");
  }

  // src/core/totems.js
  var TOTEM_ELEMENTS = ["earth", "fire", "water", "air"];
  function totemOf(game, element) {
    return game.totems.find((t) => t.def.element === element) || null;
  }
  function placeTotem(game, def, ctx = {}) {
    const o = game.player;
    const old = totemOf(game, def.element);
    if (old) removeTotem(game, old, "replaced");
    const duration = applyMods(game, "totemDuration", def.duration, { caster: o, totemId: def.id });
    const slot = TOTEM_ELEMENTS.indexOf(def.element);
    const t = {
      id: `${def.id}${++game.castSeq}`,
      kind: "totem",
      def,
      name: def.name,
      owner: o,
      level: o.level,
      // set down around the owner's feet, each element on its own side
      x: o.x + Math.cos(slot * Math.PI / 2 + Math.PI / 4) * 1.2,
      y: o.y + Math.sin(slot * Math.PI / 2 + Math.PI / 4) * 1.2,
      radius: 0.35,
      placed: game.time,
      expires: game.time + duration,
      duration,
      auras: [],
      nextIn: def.firstIn != null ? def.firstIn : 0.5,
      castId: ctx.castId
    };
    game.clampToArena(t);
    game.totems.push(t);
    o.lastTotems = { ...o.lastTotems || {}, [def.element]: def.id };
    game.emit("totem:place", { totem: t });
    const reach = def.attack ? def.attack.range : def.pulse ? def.pulse.radius : null;
    if (reach != null && !game.enemies.some((e) => !e.dead && dist(t, e) - e.radius <= reach)) game.emit("error", `No enemy within ${reach} yards of your ${def.name}`);
    return t;
  }
  function removeTotem(game, t, reason = "expired") {
    const i = game.totems.indexOf(t);
    if (i < 0) return;
    game.totems.splice(i, 1);
    if (t.def.aura) {
      const a = findAura(game.player, t.def.aura, t);
      if (a) removeAura(game, a, reason);
    }
    game.emit("totem:remove", { totem: t, reason });
  }
  function totemCtx(game, t, target, spec) {
    const ability = { id: t.def.id, name: spec.name || t.def.name, icon: t.def.icon, schools: spec.schools || ["fire"], tags: ["totem"], harmful: true };
    return { castId: ++game.castSeq, caster: game.player, target, ability, schools: ability.schools, tags: ability.tags, totem: t };
  }
  function updateTotems(game, h2) {
    const o = game.player;
    for (const t of game.totems.slice()) {
      if (game.time >= t.expires - 1e-9) {
        removeTotem(game, t, "expired");
        continue;
      }
      const def = t.def;
      if (def.aura) {
        const a = findAura(o, def.aura, t), near = dist(o, t) <= def.radius;
        if (near && !a) applyAura(game, o, game.auraDef(def.aura), { source: t, duration: Infinity });
        else if (!near && a) removeAura(game, a, "out of range");
      }
      if (def.healPulse) {
        t.healIn = (t.healIn ?? def.healPulse.every) - h2;
        if (t.healIn <= 0) {
          t.healIn += def.healPulse.every;
          const n = applyMods(game, "totemHeal", def.healPulse.amount, { caster: o, totemId: def.id });
          const party = o.party != null ? partyOf(game, o) : [o];
          for (const u of party) if (!u.dead && dist(t, u) <= def.healPulse.radius) healUnit(game, u, n, { name: def.name, icon: def.icon, periodic: true, source: "player" });
        }
      }
      if (def.cleansePulse) {
        t.cleanseIn = (t.cleanseIn ?? def.cleansePulse.every) - h2;
        if (t.cleanseIn <= 0) {
          t.cleanseIn += def.cleansePulse.every;
          const party = o.party != null ? partyOf(game, o) : [o];
          for (const u of party) if (!u.dead && dist(t, u) <= def.cleansePulse.radius) dispelUnit(game, u, def.cleansePulse.types, 1);
        }
      }
      if (!def.attack && !def.pulse) continue;
      t.nextIn -= h2;
      if (t.nextIn > 0) continue;
      if (def.attack) {
        const spec = def.attack;
        const tgt = o.target && !o.target.dead && dist(t, o.target) - o.target.radius <= spec.range ? o.target : game.enemies.filter((e) => !e.dead && dist(t, e) - e.radius <= spec.range).sort((a, b) => dist(t, a) - dist(t, b))[0];
        if (!tgt || !game.inCombat() && !o.autoAttack && game.meter.first == null) {
          t.nextIn = 0.2;
          continue;
        }
        game.emit("fx", { kind: "beam", from: { x: t.x, y: t.y }, to: tgt, schools: spec.schools || ["fire"] });
        spellHit(game, totemCtx(game, t, tgt, spec), spec);
        t.nextIn = spec.every;
      } else {
        const spec = def.pulse;
        const targets = game.enemies.filter((e) => !e.dead && dist(t, e) - e.radius <= spec.radius);
        game.emit("fx", { kind: "nova", x: t.x, y: t.y, r: spec.radius, schools: spec.schools || ["fire"] });
        for (const e of targets) spellHit(game, totemCtx(game, t, e, spec), spec);
        t.nextIn = spec.every;
      }
    }
  }

  // src/core/zones.js
  function addZone(game, z) {
    const zone = { id: ++game.castSeq, kind: "area", schools: ["physical"], ...z, placed: game.time, expires: game.time + (z.duration ?? Infinity) };
    if (zone.period) zone.nextTick = game.time + zone.period;
    game.zones.push(zone);
    return zone;
  }
  function removeZone(game, zone) {
    const i = game.zones.indexOf(zone);
    if (i >= 0) game.zones.splice(i, 1);
  }
  function updateZones(game) {
    for (const z of game.zones.slice()) {
      while (z.period && z.nextTick <= game.time + 1e-9 && z.nextTick <= z.expires + 1e-6) {
        z.nextTick += z.period;
        if (z.onTick) z.onTick(game, z);
      }
      if (game.time >= z.expires - 1e-9) removeZone(game, z);
    }
  }
  function damageZone(game, ef, ctx) {
    const c = ef.center === "self" || !ctx.target ? ctx.caster : ctx.target;
    return addZone(game, {
      kind: "area",
      x: c.x,
      y: c.y,
      radius: ef.radius,
      duration: ef.duration,
      period: ef.period,
      schools: ctx.schools,
      label: ctx.ability && ctx.ability.name,
      onTick: (g, z) => {
        const inside = g.enemies.filter((e) => !e.dead && dist(z, e) <= z.radius + e.radius).slice(0, ef.maxTargets || 99);
        for (const e of inside) spellHit(g, { ...ctx, target: e, periodic: true }, { ...ef.tick, noMiss: true });
      }
    });
  }

  // src/core/effects.js
  function runEffects(game, list, ctx) {
    for (let ef of list || []) {
      if (ef.when && !ef.when(game, ctx)) continue;
      if (ef.dynamic) ef = { ...ef, ...ef.dynamic(game, ctx) };
      const run = EFFECTS[ef.type];
      if (!run) throw new Error(`Unknown effect type: ${ef.type}`);
      run(game, ef, ctx);
    }
  }
  function then(game, ef, ctx, res) {
    ctx.result = res;
    const ok = res.outcome !== "miss" && res.outcome !== "dodge" && res.outcome !== "parry";
    if (ok && ef.onHit) runEffects(game, ef.onHit, ctx);
    return res;
  }
  var EFFECTS = {
    // Spell damage: { min, max, coef, binary, canCrit, spBonus, onHit }
    damage(game, ef, ctx) {
      if (!ctx.target || ctx.target.dead) return;
      then(game, ef, ctx, spellHit(game, ctx, ef));
    },
    // Weapon strike: { hand: 'main' | 'off' | 'both', weaponPct, flat, onHit }. With 'both', each hand rolls on its own
    // and onHit runs once if either landed.
    weaponDamage(game, ef, ctx) {
      if (!ctx.target || ctx.target.dead) return;
      const hands = ef.hand === "both" ? ["main", "off"] : [ef.hand || "main"];
      let best = null;
      for (const hand of hands) {
        if (!weaponsOf(game)[hand]) continue;
        const res = meleeHit(game, { ...ctx, hand }, { ...ef, hand, name: ef.name || ctx.ability.name });
        if (!best || landed(res) && !landed(best) || res.outcome === "crit") best = res;
      }
      if (best) then(game, ef, ctx, best);
    },
    // Melee attack on several enemies around the target or the caster (Whirlwind, Cleave, Thunder Clap):
    // { center: 'self' | 'target', radius, maxTargets, hand: 'main' | 'off' | 'both' (weapon) or min/max (fixed), onHit }.
    aoeMelee(game, ef, ctx) {
      const c = ef.center === "target" && ctx.target ? ctx.target : ctx.caster;
      const near = game.enemies.filter((e) => !e.dead && dist(c, e) <= ef.radius + e.radius).sort((a, b) => a === ctx.target ? -1 : b === ctx.target ? 1 : dist(c, a) - dist(c, b)).slice(0, ef.maxTargets || 99);
      if (ef.fx !== false) game.emit("fx", { kind: "nova", x: c.x, y: c.y, r: ef.radius, schools: ["physical"] });
      ctx.results = [];
      const closest = near.slice().sort((a, b) => dist(c, a) - dist(c, b))[0];
      for (const t of near) {
        const sub = { ...ctx, target: t, closest: t === closest };
        if (ef.min != null) ctx.results.push({ target: t, res: then(game, ef, sub, meleeHit(game, sub, ef)) });
        else EFFECTS.weaponDamage(game, { ...ef, type: "weaponDamage" }, sub), ctx.results.push({ target: t, res: sub.result });
      }
      ctx.result = ctx.results.find((r) => r.target === ctx.target)?.res || ctx.results[0] && ctx.results[0].res;
    },
    // Rush to the target and stop in melee range (Charge, Intercept): {}
    dashTo(game, ef, ctx) {
      const u = ctx.caster, t = ctx.target;
      if (!t) return;
      const from = { x: u.x, y: u.y }, d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
      const stop = t.radius + u.radius + 0.8;
      u.x = t.x - (t.x - u.x) / d * stop;
      u.y = t.y - (t.y - u.y) / d * stop;
      game.clampToArena(u);
      game.emit("fx", { kind: "blink", from, to: { x: u.x, y: u.y } });
    },
    // Change stance or form: removes the current one and applies { aura } (permanent until changed).
    setForm(game, ef, ctx) {
      for (const a of ctx.caster.auras.slice()) if (a.def.flags && a.def.flags.form) removeAura(game, a, "changed");
      applyAura(game, ctx.caster, game.auraDef(ef.aura), { source: ctx.caster, duration: Infinity });
    },
    // Physical special attack that is not a weapon swing (Eviscerate): { min, max, apCoef, onHit }
    meleeDamage(game, ef, ctx) {
      if (!ctx.target || ctx.target.dead) return;
      then(game, ef, ctx, meleeHit(game, ctx, ef));
    },
    // Area damage: { radius, center: 'self' | 'target' | fn(game, ctx) -> point (Fire Nova: the fire totem), cone (degrees, from the caster), targetFilter(game, unit), onHit, ... }.
    // Every enemy rolls on its own; each one gets its own context (same castId).
    aoeDamage(game, ef, ctx) {
      const c = typeof ef.center === "function" ? ef.center(game, ctx) : ef.center === "target" && ctx.target ? ctx.target : ctx.caster;
      if (!c) return;
      const radius = applyMods(game, "radius", ef.radius, ctx);
      const targets = game.enemies.filter((e) => !e.dead && dist(c, e) <= radius + e.radius && (!ef.cone || game.inCone(ctx.caster, e, ef.cone)) && (!ef.targetFilter || ef.targetFilter(game, e)));
      game.emit("fx", { kind: ef.cone ? "cone" : "nova", x: c.x, y: c.y, r: radius, facing: ctx.caster.facing, cone: ef.cone, schools: ctx.schools });
      ctx.results = [];
      for (const t of targets) {
        const sub = { ...ctx, target: t };
        ctx.results.push({ target: t, res: then(game, ef, sub, spellHit(game, sub, ef)) });
      }
    },
    // { aura, to: 'self' | 'target', duration, stacks, charges, dot (overrides for a damage over time),
    //   spellHit (a harmful spell that only applies an aura, like Corruption: it rolls the spell hit first) }
    applyAura(game, ef, ctx) {
      const unit = ef.to === "self" ? ctx.caster : ctx.target;
      if (!unit || unit.dead) return;
      if (ef.spellHit && game.rng() < missChance(game, { ...ctx, target: unit })) {
        game.reportDamage({ ...ctx, target: unit }, { outcome: "miss", amount: 0 }, { name: ctx.ability && ctx.ability.name });
        return;
      }
      const def = game.auraDef(ef.aura);
      const f = def.flags || {};
      if (unit.ccImmune && unit !== ctx.caster && (f.stunned || f.frozen || f.rooted || f.breaksOnDamage || f.noActions)) {
        game.emit("immune", { unit, aura: def });
        return;
      }
      const base = ef.duration != null ? ef.duration : def.duration;
      const duration = base != null ? applyMods(game, "auraDuration", base, { ...ctx, auraId: def.id, aura: def }) : void 0;
      applyAura(game, unit, def, { source: ctx.caster, duration, stacks: ef.stacks, charges: ef.charges, dot: ef.dot, data: { ability: ctx.ability, castId: ctx.castId } });
    },
    // { n } combo points on the target (a builder that landed)
    addCombo(game, ef, ctx) {
      addCombo(game, ctx.target, applyMods(game, "comboGain", ef.n || 1, ctx));
    },
    // { min, max, resource } of the caster's resource: `resource`, else the ability's (a mana potion), else the active one.
    restorePower(game, ef, ctx) {
      const n = Math.round(game.rng.range(ef.min, ef.max));
      const id = ef.resource || ctx.ability && (ctx.ability.resource || ctx.ability.powerType) || game.resourceId();
      game.gainPower(id, n);
      game.emit("fx", { kind: "text", unit: ctx.caster, text: `+${n}`, color: RESOURCES[id].color });
    },
    // { filter(ability) } finishes those cooldowns (Cold Snap, Preparation)
    resetCooldowns(game, ef, ctx) {
      for (const ab of game.knownAbilities()) if (ab !== ctx.ability && ef.filter(ab)) delete ctx.caster.cooldowns[ab.cooldownGroup || ab.id];
    },
    // { distance } in the facing direction (Blink)
    teleport(game, ef, ctx) {
      const u = ctx.caster;
      const from = { x: u.x, y: u.y };
      u.x += Math.cos(u.facing) * ef.distance;
      u.y += Math.sin(u.facing) * ef.distance;
      game.clampToArena(u);
      game.emit("fx", { kind: "blink", from, to: { x: u.x, y: u.y } });
    },
    // Chain spell (Chain Lightning): hits the target, then jumps to the nearest enemy not yet hit within `radius` of the
    // last one, each jump dealing `falloff` times the one before: { targets, radius, falloff, min, max, coef, onHit }.
    chain(game, ef, ctx) {
      let cur = ctx.target, k = 1, prev = null;
      if (!cur || cur.dead) return;
      const hit2 = /* @__PURE__ */ new Set();
      for (let i = 0; i < ef.targets && cur; i++) {
        hit2.add(cur);
        const sub = { ...ctx, target: cur, chainJump: i };
        const res = then(game, ef, sub, spellHit(game, sub, { ...ef, min: ef.min * k, max: ef.max * k, coef: (ef.coef || 0) * k }));
        if (i === 0) ctx.result = res;
        k *= ef.falloff;
        const from = cur;
        game.emit("fx", { kind: "beam", from: { x: (i ? prev : ctx.caster).x, y: (i ? prev : ctx.caster).y }, to: { x: from.x, y: from.y }, schools: ctx.schools });
        prev = from;
        cur = game.enemies.filter((e) => !e.dead && !hit2.has(e) && dist(from, e) <= ef.radius + e.radius).sort((x, y) => dist(from, x) - dist(from, y))[0];
      }
    },
    // A damaging area on the ground (Flamestrike, Consecration): see zones.js.
    zone(game, ef, ctx) {
      damageZone(game, ef, ctx);
    },
    // { totem } sets down that totem of the class (cls.totems) at the caster's feet, replacing the one of its element.
    totem(game, ef, ctx) {
      placeTotem(game, game.totemDef(ef.totem), ctx);
    },
    // Threat without damage (Demoralizing Shout, Battle Shout): { amount, radius } (every enemy within radius of the
    // caster; no radius: the target).
    threat(game, ef, ctx) {
      const list = ef.radius ? game.enemies.filter((e) => !e.dead && dist(ctx.caster, e) <= ef.radius + e.radius) : [ctx.target].filter(Boolean);
      for (const e of list) addThreat(game, e, ef.amount, { ...ctx, target: e }, ctx.ability && ctx.ability.name, ctx.ability && ctx.ability.icon);
    },
    // Taunt: { duration, force (only forces the attacks, Mocking Blow), radius (every enemy around the caster, Challenging Shout) }
    taunt(game, ef, ctx) {
      const list = ef.radius ? game.enemies.filter((e) => !e.dead && dist(ctx.caster, e) <= ef.radius + e.radius) : [ctx.target].filter(Boolean);
      let any = false;
      for (const e of list) any = taunt(game, e, ef.duration, { force: !!ef.force }) || any;
      if (!any && !ef.radius && !ef.force) game.emit("error", "Already attacking you");
    },
    // A heal: { min, max, coef (spell power), canCrit, name } on the friendly target (ctx.target) or, with to: 'self',
    // on the caster; { pctMaxHp } heals that share of the target's maximum health; { fixed(game, ctx) } an exact amount
    // that never crits (Lay on Hands: the caster's maximum health).
    heal(game, ef, ctx) {
      const unit = ef.to === "self" || !isFriendly(ctx.target) ? ctx.caster : ctx.target;
      if (ef.fixed) return void healUnit(game, unit, ef.fixed(game, ctx), { name: ef.name || ctx.ability && ctx.ability.name, icon: ctx.ability && ctx.ability.icon, source: "player", ctx });
      healHit(game, { ...ctx, target: unit }, ef);
    },
    // A heal over time: { aura (def with hot: true, period, duration), base and coef per tick, to } on the friendly target.
    // The heal per tick is set now (spell power and healing done modifiers), like Classic.
    hot(game, ef, ctx) {
      const unit = ef.to === "self" || !isFriendly(ctx.target) ? ctx.caster : ctx.target;
      if (!unit || unit.dead) return;
      const def = game.auraDef(ef.aura), c = { ...ctx, target: unit, heal: true, periodic: true };
      const perTick = ((ef.base || 0) + healingPower(game, c) * (ef.coef || 0)) * applyMods(game, "healMult", 1, c);
      const duration = applyMods(game, "auraDuration", def.duration || 0, { ...c, auraId: def.id, aura: def });
      const ticks = Math.round(duration / def.period);
      applyAura(game, unit, def, { source: ctx.caster, duration, data: { perTick, ticks, ability: ctx.ability, castId: ctx.castId } });
    },
    // An absorb shield: { aura (absorb: true), amount(game, ctx), to } on the friendly target, or the caster with to: 'self'.
    absorb(game, ef, ctx) {
      const unit = ef.to === "self" || !isFriendly(ctx.target) ? ctx.caster : ctx.target;
      if (!unit || unit.dead) return;
      const n = Math.round(ef.amount(game, { ...ctx, target: unit }));
      applyAura(game, unit, game.auraDef(ef.aura), { source: ctx.caster, data: { absorb: n, absorbMax: n, ability: ctx.ability } });
    },
    // Dispel: { types: ['magic', 'curse', 'poison', 'disease'], count } removes that many harmful auras of those types
    // from the friendly target (or the caster). Each type counts separately (Cleanse: 1 poison, 1 disease and 1 magic).
    dispel(game, ef, ctx) {
      const unit = isFriendly(ctx.target) ? ctx.target : ctx.caster;
      let n = 0;
      for (const t of ef.types) n += dispelUnit(game, unit, [t], ef.count || 1);
      if (!n) game.emit("error", "Nothing to dispel");
    },
    // The party of a unit (the target's, or the caster's with of: 'self'), the living members within `radius` of the
    // center (the target, or the caster with center: 'self'), each gets `effects` with itself as the target
    // (Prayer of Healing, Holy Nova, Tranquility, Wild Growth).
    party(game, ef, ctx) {
      const of = ef.of === "self" || !isFriendly(ctx.target) ? ctx.caster : ctx.target;
      const center = ef.center === "self" ? ctx.caster : of;
      const radius = applyMods(game, "radius", ef.radius, ctx);
      const list = (of.party != null ? partyOf(game, of) : [of]).filter((u) => !u.dead && dist(center, u) <= radius + (u.radius || 0));
      if (ef.fx !== false) game.emit("fx", { kind: "nova", x: center.x, y: center.y, r: Math.min(radius, 12), schools: ctx.schools });
      for (const u of list) runEffects(game, ef.effects, { ...ctx, target: u });
    },
    // Chain heal: the target, then the most hurt living raid member within `radius` of the last one that was not healed
    // yet (only the target's party when it is in the caster's, Forever), each jump `falloff` times the one before:
    // { targets, radius, falloff, min, max, coef, bonus(game, ctx) -> multiplier on the first target }.
    chainHeal(game, ef, ctx) {
      let cur = isFriendly(ctx.target) ? ctx.target : ctx.caster, k = 1, prev = ctx.caster;
      const pool = cur.party != null && cur.party === ctx.caster.party ? partyOf(game, cur) : raidMembers(game);
      const hit2 = /* @__PURE__ */ new Set();
      for (let i = 0; i < ef.targets && cur; i++) {
        hit2.add(cur);
        const m = k * (i === 0 && ef.bonus ? ef.bonus(game, { ...ctx, target: cur }) : 1);
        healHit(game, { ...ctx, target: cur, chainJump: i }, { ...ef, min: ef.min * m, max: ef.max * m, coef: (ef.coef || 0) * m });
        game.emit("fx", { kind: "beam", from: { x: prev.x, y: prev.y }, to: { x: cur.x, y: cur.y }, schools: ctx.schools });
        k *= ef.falloff;
        prev = cur;
        const from = cur;
        cur = pool.filter((u) => !u.dead && !hit2.has(u) && u.hp < maxHpOf(game, u) && dist(from, u) <= ef.radius).sort((a, b) => hpPct(game, a) - hpPct(game, b))[0];
      }
    },
    // Escape hatch for a class rule that no generic block covers. Keep these rare.
    custom(game, ef, ctx) {
      ef.run(game, ctx);
    }
  };

  // src/core/pets.js
  var PET_SPEED = 9;
  function summonPet(game, def, opts = {}) {
    const o = game.player;
    const pet = {
      id: `${def.id}${++game.castSeq}`,
      kind: "pet",
      def,
      name: def.name,
      owner: o,
      level: o.level,
      color: def.color || "#c9a46b",
      x: o.x - 1.2,
      y: o.y + 1.2,
      radius: 0.5,
      facing: 0,
      auras: [],
      dead: false,
      swingIn: opts.firstHitIn != null ? opts.firstHitIn : 0.2,
      specialIn: def.special ? def.special.every / 2 : Infinity,
      expires: opts.duration ? game.time + opts.duration : Infinity
    };
    game.pets.push(pet);
    game.emit("pet:summon", { pet });
    return pet;
  }
  function dismissPet(game, pet) {
    game.pets = game.pets.filter((p) => p !== pet);
    game.emit("pet:remove", { pet });
  }
  function petSpell(game, pet, target, spec, ctx, diff) {
    const miss = Math.max(RULES.minSpellMiss, spellMiss(diff) - applyMods(game, "hitChance", 0, ctx));
    let outcome = "hit", amount = 0;
    if (game.rng() < miss) outcome = "miss";
    else {
      amount = (game.rng.range(spec.min, spec.max) + applyMods(game, "spellPower", 0, ctx) * (spec.coef || 0)) * applyMods(game, "damageMult", 1, ctx);
      if (game.rng() < applyMods(game, "critChance", pet.def.crit || 0.05, ctx)) {
        outcome = "crit";
        amount *= 1 + RULES.spellCritBonus * applyMods(game, "critBonusMult", 1, ctx);
      }
      amount *= 1 - averageResist(diff * RULES.resistPerLevel, pet.level || RULES.maxLevel);
    }
    const res = { outcome, amount: Math.max(0, Math.round(amount)) };
    game.reportDamage(ctx, res, { name: spec.name });
    return res;
  }
  function petHit(game, pet, target, spec) {
    const ctx = { castId: ++game.castSeq, caster: pet, target, pet: true, petKind: pet.def.id, white: !!spec.white, schools: spec.schools || ["physical"], tags: ["pet"], ability: { id: spec.id || `${pet.def.id}_attack`, name: spec.name, icon: spec.icon || pet.def.icon } };
    const diff = Math.max(0, (target.level || RULES.maxLevel) - (pet.level || RULES.maxLevel));
    if (spec.spell) return petSpell(game, pet, target, spec, ctx, diff);
    const hit2 = applyMods(game, "hitChance", 0, ctx);
    const miss = Math.max(0, byLevelDiff(RULES.meleeMiss, diff) - hit2);
    const stunned = isStunned(target), behind = isBehind(pet, target);
    const dodge = stunned ? 0 : byLevelDiff(RULES.meleeDodge, diff);
    const parry = stunned || behind ? 0 : byLevelDiff(RULES.meleeParry, diff);
    const crit2 = Math.max(0, applyMods(game, "critChance", pet.def.crit || 0.05, ctx) - byLevelDiff(RULES.critSuppression, diff));
    const glance = spec.white ? byLevelDiff(RULES.glancingChance, diff) : 0;
    const r = game.rng();
    let outcome;
    if (r < miss) outcome = "miss";
    else if (r < miss + dodge) outcome = "dodge";
    else if (r < miss + dodge + parry) outcome = "parry";
    else if (r < miss + dodge + parry + glance) outcome = "glance";
    else outcome = (spec.white ? r < miss + dodge + parry + glance + crit2 : game.rng() < crit2) ? "crit" : "hit";
    let amount = 0;
    if (outcome !== "miss" && outcome !== "dodge" && outcome !== "parry") {
      amount = game.rng.range(spec.min, spec.max) * applyMods(game, "damageMult", 1, ctx);
      if (outcome === "crit") amount *= 1 + RULES.meleeCritBonus * applyMods(game, "critBonusMult", 1, ctx);
      if (outcome === "glance") amount *= 1 - byLevelDiff(RULES.glancingPenalty, diff);
      amount *= 1 - armorReduction(applyMods(game, "targetArmor", target.armor || 0, ctx), pet.level || RULES.maxLevel);
    }
    const res = { outcome, amount: Math.max(0, Math.round(amount)) };
    game.reportDamage(ctx, res, { name: spec.name });
    return res;
  }
  function updatePets(game, h2) {
    const o = game.player;
    for (const pet of game.pets.slice()) {
      if (game.time >= pet.expires) {
        dismissPet(game, pet);
        continue;
      }
      const t = o.target;
      const engaged = !!t && !t.dead && (o.autoAttack || game.inCombat());
      const ranged = !!(pet.def.special && pet.def.special.spell && pet.def.min == null);
      const castTime = ranged ? Math.min(pet.def.special.castTime ?? 1.5, pet.def.special.every) : 0;
      pet.casting = ranged && engaged && pet.specialIn <= castTime ? { left: Math.max(0, pet.specialIn), total: castTime, schools: pet.def.special.schools } : null;
      const goal = engaged && !ranged ? { x: t.x - Math.cos(t.facing || 0) * (t.radius + pet.radius + 0.6), y: t.y - Math.sin(t.facing || 0) * (t.radius + pet.radius + 0.6) } : { x: o.x - 1.2, y: o.y + 1.2 };
      const d = Math.hypot(goal.x - pet.x, goal.y - pet.y);
      if (d > 0.05 && !pet.casting) {
        const step = Math.min(d, PET_SPEED * applyMods(game, "petRunSpeed", 1, { caster: pet, pet: true, petKind: pet.def.id }) * h2);
        pet.x += (goal.x - pet.x) / d * step;
        pet.y += (goal.y - pet.y) / d * step;
      }
      if (engaged) pet.facing = Math.atan2(t.y - pet.y, t.x - pet.x);
      const speed2 = applyMods(game, "attackSpeed", 1, { caster: pet, pet: true, petKind: pet.def.id });
      pet.swingIn -= h2 * speed2;
      pet.specialIn -= h2;
      if (!engaged || !ranged && dist(pet, t) - pet.radius - t.radius > RULES.meleeRange) continue;
      if (pet.def.min != null && pet.swingIn <= 0) {
        const first = pet.def.firstHit && !pet.firstDone;
        pet.firstDone = true;
        petHit(game, pet, t, first ? { ...pet.def.firstHit } : { white: true, name: pet.def.name, min: pet.def.min, max: pet.def.max });
        pet.swingIn = pet.def.speed;
      }
      if (pet.def.special && pet.specialIn <= 0) {
        petHit(game, pet, t, { ...pet.def.special });
        pet.specialIn = pet.def.special.every;
      }
    }
  }

  // src/core/defense.js
  var AVOIDED = /* @__PURE__ */ new Set(["miss", "dodge", "parry", "immune"]);
  var avoidedOutcome = (o) => AVOIDED.has(o);
  function defenseTable(game, attacker, special = false) {
    const p = game.player, s = game.stats();
    const diff = s.defense - (attacker.level || RULES.maxLevel) * 5;
    const k = diff * RULES.defensePerPoint;
    const front = !isBehind(attacker, p);
    const t = {
      miss: Math.max(0, RULES.enemyMiss + k),
      dodge: front ? Math.max(0, s.dodge + k) : 0,
      parry: front && s.parry > 0 ? Math.max(0, s.parry + k) : 0,
      // only a class that can parry, only with a shield to block
      block: front && s.block > 0 ? Math.max(0, s.block + k) : 0,
      crit: special ? 0 : Math.max(0, RULES.enemyCrit - k),
      crushing: special || (attacker.level || 60) - p.level < 3 ? 0 : RULES.crushingChance
    };
    let left = 1;
    for (const key of ["miss", "dodge", "parry", "block", "crit", "crushing"]) {
      t[key] = Math.min(t[key], left);
      left -= t[key];
    }
    t.hit = Math.max(0, left);
    return t;
  }
  function enemyMelee(game, attacker, spec) {
    const p = game.player;
    if (p.dead) return null;
    const schools = spec.schools || ["physical"];
    const ctx = { caster: p, attacker, schools, incoming: true, special: !!spec.special };
    let outcome;
    if (p.auras.some((a) => a.def.flags && (a.def.flags.immune || a.def.flags.immunePhysical && schools.includes("physical")))) outcome = "immune";
    else {
      const t = defenseTable(game, attacker, !!spec.special);
      let r = game.rng();
      outcome = "hit";
      for (const key of ["miss", "dodge", "parry", "block", "crit", "crushing"]) {
        if (r < t[key]) {
          outcome = key;
          break;
        }
        r -= t[key];
      }
    }
    const res = { outcome, amount: 0, blocked: 0, absorbed: 0, raw: 0 };
    if (!avoidedOutcome(outcome)) {
      let amount = game.rng.range(spec.min, spec.max);
      if (outcome === "crit") amount *= RULES.enemyCritMult;
      if (outcome === "crushing") amount *= RULES.crushingMult;
      res.raw = amount;
      const taken = applyMods(game, "damageTaken", 1, ctx);
      let forRage = amount * (schools.includes("physical") ? 1 - RAGE_ARMOR_BASELINE : 1) * taken;
      if (schools.includes("physical")) amount *= 1 - armorReduction(game.stats().armor, attacker.level || RULES.maxLevel);
      amount *= taken;
      if (outcome === "block") {
        res.blocked = Math.min(amount, game.stats().blockValue);
        amount -= res.blocked;
        forRage = Math.max(0, forRage - res.blocked);
      }
      amount = Math.max(0, Math.round(amount));
      res.rageAmount = forRage;
      res.absorbed = absorb(game, amount, schools);
      res.amount = amount - res.absorbed;
    }
    takeDamage(game, res, attacker, spec);
    return res;
  }
  function absorb(game, amount, schools) {
    return absorbOn(game, game.player, amount, schools);
  }
  function damagePlayer(game, amount, { name = "Damage", schools = ["physical"], attacker = null } = {}) {
    const p = game.player;
    if (p.dead || !(amount > 0)) return 0;
    if (p.auras.some((a) => a.def.flags && a.def.flags.immune)) {
      takeDamage(game, { outcome: "immune", amount: 0, blocked: 0, absorbed: 0, raw: 0 }, attacker, { name });
      return 0;
    }
    let n = Math.round(amount * applyMods(game, "damageTaken", 1, { caster: p, attacker, schools, incoming: true }));
    const rageAmount = n;
    const absorbed = absorb(game, n, schools);
    n -= absorbed;
    takeDamage(game, { outcome: "hit", amount: n, blocked: 0, absorbed, raw: amount, rageAmount }, attacker, { name, nonMelee: true });
    return n;
  }
  function takeDamage(game, res, attacker, spec) {
    const p = game.player, m = game.meter;
    if (m.first == null) m.first = game.time;
    m.last = game.time;
    const name = spec && spec.name || "Melee";
    const row = m.takenRows[name] || (m.takenRows[name] = { name, total: 0, swings: 0, outcomes: {} });
    row.swings++;
    row.total += res.amount;
    row.outcomes[res.outcome] = (row.outcomes[res.outcome] || 0) + 1;
    m.taken += res.amount;
    m.swingsTaken++;
    m.outcomes[res.outcome] = (m.outcomes[res.outcome] || 0) + 1;
    m.mitigated += Math.max(0, res.raw - res.amount);
    if (res.amount > 0) p.hp -= res.amount;
    if (p.hp <= 0 && game.rules.immortal && !p.dead) {
      p.hp = 1;
      game.emit("wouldDie", { unit: p });
    }
    const forRage = res.rageAmount != null ? res.rageAmount : res.amount;
    if (forRage > 0 && !p.dead && game.resource.onDamageTaken) game.resource.onDamageTaken(game, p, forRage);
    if (res.amount > 0 && p.hp > 0) game.pushback();
    if (!(spec && spec.nonMelee)) game.emit("hitTaken", { attacker, res, spec: spec || {} });
    if (res.amount > 0) game.emit("unitDamaged", { unit: p, amount: res.amount, name });
    if (p.hp <= 0 && !p.dead) die(game);
  }
  function die(game, { final = false } = {}) {
    const p = game.player;
    if (!final && game.cls.cheatDeath && game.cls.cheatDeath(game)) return;
    p.hp = 0;
    p.dead = true;
    p.autoAttack = false;
    p.queued = null;
    p.nextSwing = null;
    if (p.cast) game.cancelCast("died");
    if (p.channel) game.endChannel("died");
    game.meter.diedAt = game.meter.first != null ? game.time - game.meter.first : game.time;
    game.emit("death", { unit: p });
  }
  function healPlayer(game, amount, { name = "Healing", icon: icon2 = null, self = false, ctx = null } = {}) {
    return healUnit(game, game.player, amount, { name, icon: icon2, source: self ? "player" : "raid", ctx }).effective || 0;
  }
  function defenseSheet(game, f, attackerLevel = 63) {
    const s = game.stats(), p = game.player;
    const front = { level: attackerLevel, x: p.x + Math.cos(p.facing), y: p.y + Math.sin(p.facing), facing: p.facing + Math.PI };
    const t = defenseTable(game, front);
    return [
      ["Health", f.int(s.maxHp)],
      ["Armor", `${f.int(s.armor)} (${f.pct(armorReduction(s.armor, attackerLevel))} less damage)`],
      ["Defense", f.int(s.defense)],
      ["Miss", f.pct(t.miss)],
      ["Dodge", f.pct(t.dodge)],
      ["Parry", f.pct(t.parry)],
      ["Block", f.pct(t.block)],
      ...s.blockValue ? [["Block value", f.int(s.blockValue)]] : [],
      ["Crit taken", f.pct(t.crit)],
      ["Crushing blows", f.pct(t.crushing)]
    ];
  }

  // src/core/enemy-ai.js
  function enemyMods(enemy) {
    let ap = 0, slow = 1, dmg = 1;
    for (const a of enemy.auras) {
      const m = typeof a.def.enemy === "function" ? a.def.enemy(a) : a.def.enemy;
      if (!m) continue;
      if (m.ap) ap = Math.max(ap, m.ap);
      if (m.attackSpeed) slow = Math.max(slow, m.attackSpeed);
      if (m.damage) dmg = Math.min(dmg, m.damage);
    }
    return { ap, slow, dmg };
  }
  var raidOf = (game) => game.raid && !game.raid.dead ? game.raid : null;
  function pickTarget(game, e) {
    const p = game.player, raid = raidOf(game);
    if (p.dead) return raid ? "raid" : null;
    if ((e.forcedUntil || 0) > game.time) return "player";
    const P = e.threat.player, R = e.threat.raid;
    if (!raid || R <= 0) return "player";
    if (e.aggro === "raid") return P > R * (game.edgeDistance(e, p) <= RULES.meleeRange ? 1.1 : 1.3) ? "player" : "raid";
    if (e.aggro === "player") return R > P * 1.1 ? "raid" : "player";
    return P >= R ? "player" : "raid";
  }
  function updateEnemies(game, h2) {
    const p = game.player;
    for (const e of game.enemies) {
      const ai = e.ai;
      if (!ai || e.dead) continue;
      if (!e.engaged && !p.dead && game.edgeDistance(e, p) <= (ai.aggroRadius || 0)) engageEnemy(game, e);
      if (!e.engaged) continue;
      if (ai.raidTps && raidOf(game) && game.time - e.engagedAt >= (ai.raidDelay || 0)) e.threat.raid += ai.raidTps * h2;
      const prev = e.aggro;
      e.aggro = pickTarget(game, e);
      if (prev !== e.aggro) game.emit("aggro", { enemy: e, from: prev, to: e.aggro });
      const tgt = e.aggro === "player" ? p : e.aggro === "raid" ? raidOf(game) : null;
      if (e.aggro === "raid" && !p.dead) game.meter.aggroLost += h2;
      e.swingIn = Math.max(0, (e.swingIn || 0) - h2);
      e.specialIn = (e.specialIn == null ? ai.special ? ai.special.first ?? ai.special.every : Infinity : e.specialIn) - h2;
      if (!tgt || isStunned(e)) continue;
      e.facing = Math.atan2(tgt.y - e.y, tgt.x - e.x);
      const reach = RULES.meleeRange, gap = Math.max(0, dist(e, tgt) - e.radius - (tgt.radius || 0));
      if (gap > reach * 0.8 && !e.auras.some((a) => a.def.flags && a.def.flags.rooted)) {
        const step = Math.min(gap - reach * 0.5, (ai.moveSpeed || RULES.runSpeed) * h2), d = dist(e, tgt) || 1;
        e.x += (tgt.x - e.x) / d * step;
        e.y += (tgt.y - e.y) / d * step;
        game.clampToArena(e);
      }
      if (gap > reach || e.swingIn > 0) continue;
      const mods = enemyMods(e);
      const special = !!ai.special && e.specialIn <= 0;
      const less = mods.ap / 14 * ai.speed;
      const k = (special ? ai.special.mult : 1) * mods.dmg;
      const spec = { min: Math.max(0, (ai.min - less) * k), max: Math.max(0, (ai.max - less) * k), special, name: special ? ai.special.name : "Melee" };
      if (special) e.specialIn = ai.special.every;
      e.swingIn = ai.speed * mods.slow;
      if (tgt === p) enemyMelee(game, e, spec);
      else if (tgt.kind === "ally") damageUnit(game, tgt, game.rng.range(spec.min, spec.max) * (tgt.mitigation ?? 0.7), { name: spec.name, attacker: e });
      else game.emit("raidHit", { enemy: e, amount: Math.round(game.rng.range(spec.min, spec.max) * 0.5), special });
      game.emit("enemySwing", { enemy: e, special, target: e.aggro });
    }
  }

  // src/core/talents.js
  function talentIndex(trees10) {
    const byId = {};
    trees10.forEach((tree, ti) => tree.talents.forEach((t) => {
      byId[t.id] = { ...t, tree: ti };
    }));
    return byId;
  }
  var totalPoints = (ranks) => Object.values(ranks).reduce((s, r) => s + r, 0);
  function treePoints(trees10, ranks, ti, belowTier = Infinity) {
    return trees10[ti].talents.reduce((s, t) => s + (t.tier < belowTier ? ranks[t.id] || 0 : 0), 0);
  }
  function cannotAdd(trees10, ranks, id) {
    const idx = talentIndex(trees10), t = idx[id];
    if (!t) return "Unknown talent";
    if ((ranks[id] || 0) >= t.max) return "Maximum rank";
    if (totalPoints(ranks) >= RULES.talentPoints) return "No talent points left";
    if (treePoints(trees10, ranks, t.tree, t.tier) < t.tier * RULES.pointsPerTier) return `Requires ${t.tier * RULES.pointsPerTier} points in ${trees10[t.tree].name} Talents`;
    if (t.req && (ranks[t.req] || 0) < idx[t.req].max) return `Requires ${idx[t.req].max} points in ${idx[t.req].name}`;
    return null;
  }
  function cannotRemove(trees10, ranks, id) {
    const idx = talentIndex(trees10), t = idx[id];
    if (!(ranks[id] > 0)) return "No points";
    const next = { ...ranks, [id]: ranks[id] - 1 };
    for (const o of trees10[t.tree].talents) {
      if (!(next[o.id] > 0)) continue;
      if (o.req === id) return `${o.name} requires it`;
      if (treePoints(trees10, next, t.tree, o.tier) < o.tier * RULES.pointsPerTier) return `${o.name} needs the points below it`;
    }
    return null;
  }
  function encodeBuild(trees10, ranks) {
    return trees10.map((tree) => tree.talents.map((t) => ranks[t.id] || 0).join("").replace(/0+$/, "")).join("-");
  }
  function decodeRanks(trees10, code) {
    const ranks = {}, parts = String(code || "").split("-");
    trees10.forEach((tree, ti) => tree.talents.forEach((t, i) => {
      const r = parseInt((parts[ti] || "")[i] || "0", 10);
      if (r > 0) ranks[t.id] = Math.min(r, t.max);
    }));
    return ranks;
  }
  function placeBuild(trees10, ranks) {
    const placed = {};
    const all = trees10.flatMap((tree) => tree.talents).slice().sort((a, b) => a.tier - b.tier);
    for (let progress = true; progress; ) {
      progress = false;
      for (const t of all) while ((placed[t.id] || 0) < (ranks[t.id] || 0) && !cannotAdd(trees10, placed, t.id)) {
        placed[t.id] = (placed[t.id] || 0) + 1;
        progress = true;
      }
    }
    const active = {}, broken = /* @__PURE__ */ new Set();
    for (const t of all) {
      if ((ranks[t.id] || 0) === 0) continue;
      if ((placed[t.id] || 0) === ranks[t.id]) active[t.id] = ranks[t.id];
      else broken.add(t.id);
    }
    return { active, broken };
  }
  var buildNum = (b) => +String(b || "0").split(".").pop();
  function migrateBuild(trees10, history2, code, from) {
    const steps = (history2 || []).filter((s) => buildNum(s.until) > buildNum(from)).sort((a, b) => buildNum(a.until) - buildNum(b.until));
    if (!steps.length) return { ranks: decodeRanks(trees10, code), notes: [], step: null };
    const idx = talentIndex(trees10), parts = String(code || "").split("-"), notes = [];
    let ranks = {};
    steps[0].order.forEach((ids, ti) => ids.forEach((id, i) => {
      const r = parseInt((parts[ti] || "")[i] || "0", 10);
      if (r > 0) ranks[id] = r;
    }));
    const pts = (n) => `${n} point${n === 1 ? "" : "s"}`;
    for (const s of steps) {
      const next = {};
      for (const [id, r] of Object.entries(ranks)) {
        if (s.removed && s.removed[id]) {
          notes.push(`${s.removed[id]} was removed (${pts(r)} back)`);
          continue;
        }
        const to = s.renamed && s.renamed[id] || id;
        if (to !== id) notes.push(`${s.names && s.names[id] || id} is now ${idx[to] && idx[to].name || to}`);
        next[to] = r;
      }
      ranks = next;
    }
    const out = {};
    for (const [id, r] of Object.entries(ranks)) {
      const t = idx[id];
      if (!t) continue;
      if (r > t.max) notes.push(`${t.name} now has ${t.max} rank${t.max === 1 ? "" : "s"} (${pts(r - t.max)} back)`);
      out[id] = Math.min(r, t.max);
    }
    return { ranks: out, notes, step: steps[steps.length - 1] };
  }

  // src/core/game.js
  var STEP = 0.02;
  var WEAPON_NAMES = { dagger: "Daggers", sword: "Swords", mace: "Maces", fist: "Fist Weapons", axe: "Axes" };
  var Game = class extends Emitter {
    constructor({ cls, scenario, loadout, scenarioOptions = {}, common = {}, seed }) {
      super();
      this.rules = {};
      this.cls = cls;
      this.scenario = scenario;
      this.scenarioOptions = scenarioOptions;
      this.common = common;
      this.rng = makeRng(seed);
      this.resourceIds = cls.resources || [cls.resource];
      this.loadout = loadout;
      this.talentMods = [];
      this.talentSubs = [];
      this.abilityList = [...cls.abilities, ...(common.abilities || []).filter((a) => !a.resource || this.resourceIds.includes(a.resource))];
      this.abilityById = Object.fromEntries(this.abilityList.map((a) => [a.id, a]));
      this.reset();
    }
    /* ---------- setup ---------- */
    setLoadout(loadout) {
      this.loadout = loadout;
      this.reset();
    }
    reset() {
      this.time = 0;
      this.timers = [];
      this.castSeq = 0;
      this.statsCache = null;
      this.player = {
        id: "player",
        kind: "player",
        name: this.cls.name,
        level: this.cls.stats.level,
        color: this.cls.color,
        x: 0,
        y: 0,
        radius: 0.6,
        facing: 0,
        input: { x: 0, y: 0 },
        moving: false,
        auras: [],
        cooldowns: {},
        gcdEnd: 0,
        gcdTotal: 0,
        cast: null,
        channel: null,
        queued: null,
        target: null,
        dead: false,
        combo: null,
        autoAttack: false,
        swing: { main: 0, off: 0, ranged: 0 },
        nextSwing: null,
        reagents: {},
        res: {}
      };
      const p = this.player;
      for (const id of this.resourceIds) p.res[id] = { power: 0, tickIn: 0, lastSpend: -99 };
      for (const k of ["power", "tickIn", "lastSpend"]) {
        Object.defineProperty(p, k, { get: () => p.res[this.resourceId()][k], set: (v) => {
          p.res[this.resourceId()][k] = v;
        }, enumerable: true });
      }
      this.projectiles = [];
      this.pets = [];
      this.totems = [];
      this.zones = [];
      this.healIn = null;
      const sc = this.scenario.setup(this, this.scenarioOptions);
      this.arena = sc.arena;
      Object.assign(this.player, sc.playerStart);
      this.enemies = sc.enemies;
      this.raid = sc.raid || null;
      this.allies = sc.allies || [];
      this.scenarioState = sc.state || {};
      this.rules = sc.rules || {};
      this.player.party = sc.playerParty != null ? sc.playerParty : null;
      this.player.friend = null;
      for (const e of this.enemies) {
        e.threat = { player: 0, raid: 0 };
        e.aggro = null;
        e.engaged = false;
        e.forcedUntil = 0;
      }
      this.player.target = this.enemies[0] || null;
      this.buildTalents();
      this.player.hp = this.stats().maxHp;
      this.lastMaxHp = this.player.hp;
      for (const [id, r] of Object.entries(this.cls.reagents || {})) this.player.reagents[id] = r.start(this);
      if (this.cls.onReset) this.cls.onReset(this);
      if (this.cls.startBuffs) this.startBuffs(this.cls.startBuffs(this) || []);
      this.player.hp = this.stats().maxHp;
      this.lastMaxHp = this.player.hp;
      for (const id of this.resourceIds) RESOURCES[id].init(this, this.player.res[id]);
      this.resetMeter();
      if (this.player.res.mana) this.meter.manaStart = this.player.res.mana.power;
      this.emit("reset");
    }
    buildTalents() {
      for (const off of this.talentSubs) off();
      this.talentSubs = [];
      this.talentMods = [];
      const ranks = this.loadout.talents || {};
      const on = (evt, fn) => this.talentSubs.push(this.on(evt, fn));
      if (this.cls.mods) this.talentMods.push(...this.cls.mods(this));
      if (this.cls.listen) this.cls.listen(this, on);
      for (const [id, rank] of Object.entries(ranks)) {
        const logic = this.cls.talents[id];
        if (!logic || !(rank > 0)) continue;
        if (logic.mods) this.talentMods.push(...logic.mods(rank, this));
        if (logic.listen) logic.listen(this, rank, on);
      }
      this.statsChanged();
    }
    rank(talentId) {
      return (this.loadout.talents || {})[talentId] || 0;
    }
    isSimulatedTalent(talentId) {
      const l = this.cls.talents[talentId];
      return !!(l && (l.mods || l.listen || l.teaches));
    }
    /* ---------- queries ---------- */
    // The active resource: the one the current form names (flags.resource), else the class's.
    resourceId() {
      const a = this.player && this.player.auras.find((x) => x.def.flags && x.def.flags.resource);
      return a ? a.def.flags.resource : this.cls.resource;
    }
    get resource() {
      return RESOURCES[this.resourceId()];
    }
    // The resource an ability costs: its own powerType, else the active one.
    // An ability that needs one form costs that form's resource (Claw shows Energy even in caster form).
    resourceOf(ab) {
      if (ab && ab.powerType) return RESOURCES[ab.powerType];
      const forms = ab && ab.requires && ab.requires.form;
      if (forms && forms.length === 1) {
        const d = Object.values(this.cls.auras || {}).find((x) => x.flags && x.flags.form === forms[0] && x.flags.resource);
        if (d) return RESOURCES[d.flags.resource];
      }
      return RESOURCES[this.resourceId()];
    }
    powerState(id) {
      return this.player.res[id];
    }
    hasPower(ab, n) {
      const r = this.resourceOf(ab);
      return r.has(this, this.player.res[r.id], n);
    }
    gainPower(id, n) {
      const r = RESOURCES[id];
      if (r && this.player.res[id]) r.gain(this, this.player.res[id], n);
    }
    stats() {
      return this.statsCache || (this.statsCache = computeStats(this));
    }
    statsChanged() {
      this.statsCache = null;
    }
    auraDef(id) {
      const d = this.cls.auras && this.cls.auras[id] || this.common.auras && this.common.auras[id] || this.scenario.auras && this.scenario.auras[id];
      if (!d) throw new Error(`Unknown aura: ${id}`);
      return d;
    }
    ability(id) {
      return this.abilityById[id] || null;
    }
    addZone(z) {
      return addZone(this, z);
    }
    healPlayer(amount, opts) {
      return healPlayer(this, amount, opts);
    }
    damagePlayer(amount, opts) {
      return damagePlayer(this, amount, opts);
    }
    healingPower(ctx) {
      return healingPower(this, ctx || { caster: this.player });
    }
    maxHpOf(u) {
      return maxHpOf(this, u);
    }
    applyAuraTo(unit, def, opts) {
      return applyAura(this, unit, def, opts);
    }
    setFriend(u) {
      this.player.friend = u && isFriendly(u) && !u.dead ? u : null;
      this.emit("friend", this.player.friend);
    }
    runEffects(list, ctx) {
      runEffects(this, list, ctx);
    }
    removeZone(z) {
      removeZone(this, z);
    }
    totemDef(id) {
      const d = (this.cls.totems || {})[id];
      if (!d) throw new Error(`Unknown totem: ${id}`);
      return d;
    }
    isKnown(ab) {
      return (!ab.talent || this.rank(ab.talent) > 0) && this.hasRace(ab);
    }
    // A racial ability (ab.race: one race or a list) only for that race (the class's 'race' option).
    hasRace(ab) {
      if (!ab.race) return true;
      const r = (this.loadout.options || {}).race ?? ((this.cls.options || {}).race || {}).default;
      return [].concat(ab.race).includes(r);
    }
    knownAbilities() {
      return this.abilityList.filter((a) => this.isKnown(a));
    }
    edgeDistance(a, b) {
      return Math.max(0, dist(a, b) - a.radius - b.radius);
    }
    inCone(from, to, degrees) {
      let d = Math.atan2(to.y - from.y, to.x - from.x) - from.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) <= degrees * Math.PI / 360;
    }
    // In combat: damage dealt or taken in the last 5 sec, or an effect that puts you in combat (modifier 'forceCombat':
    // Bloodrage, Enrage).
    inCombat() {
      return this.meter.last != null && this.time - this.meter.last < 5 || applyMods(this, "forceCombat", false, { caster: this.player });
    }
    cooldownLeft(ab) {
      const c = this.player.cooldowns[ab.cooldownGroup || ab.id];
      return c ? Math.max(0, c.end - this.time) : 0;
    }
    gcdLeft() {
      return Math.max(0, this.player.gcdEnd - this.time);
    }
    combo(target = this.player.target) {
      return comboOn(this, target);
    }
    // Stances and forms: an aura with flags.form on the player (Battle Stance -> 'battle').
    form() {
      const a = this.player.auras.find((x) => x.def.flags && x.def.flags.form);
      return a ? a.def.flags.form : null;
    }
    formName(form) {
      const d = Object.values(this.cls.auras || {}).find((a) => a.flags && a.flags.form === form);
      return d ? d.name : form;
    }
    // The stances or forms an ability can be used in: its requires.form, which modifier 'requiredForms' can widen
    // (Vanguard: Charge in Defensive Stance too). Null when it needs none.
    requiredForms(ab, ctx = this.newCtx(ab)) {
      const f = ab.requires && ab.requires.form;
      return f ? applyMods(this, "requiredForms", f, ctx) : null;
    }
    // Who an ability is cast on: the enemy target, the friendly target (or yourself), or, for a spell that does both
    // (dual: Holy Shock, Penance), the friendly target when one is chosen (ctx.allyMode).
    newCtx(ab) {
      const p = this.player, ally = ab.target === "ally" || ab.dual && p.friend && !p.friend.dead;
      const target = ally ? friendlyTarget(this) : ab.target === "enemy" ? p.target : null;
      return { castId: ++this.castSeq, caster: p, target, ability: ab, schools: ab.schools || [], tags: ab.tags || [], allyMode: !!ally };
    }
    // The player dies now, whatever a class would do about it (the end of Spirit of Redemption).
    dieNow() {
      this.player.hp = 0;
      die(this, { final: true });
    }
    // Damage got through while casting or channeling: the cast is delayed, the channel is cut short (RULES.pushback),
    // unless a 'pushbackChance' modifier (focus talents, shields, Concentration Aura) keeps the casting time.
    pushback() {
      const p = this.player, c = p.cast || p.channel;
      if (!c) return;
      const chance = applyMods(this, "pushbackChance", 1, c.ctx);
      if (chance <= 0 || chance < 1 && this.rng() >= chance) return;
      if (p.cast) {
        const d = Math.min(RULES.pushback, Math.max(0, this.time - c.start));
        if (d <= 0) return;
        c.start += d;
        c.end += d;
        c.pushed = (c.pushed || 0) + d;
        this.emit("pushback", { ability: c.ab, amount: d });
      } else {
        c.end -= c.total * RULES.channelPushback;
        c.pushed = (c.pushed || 0) + 1;
        this.emit("pushback", { ability: c.ab, channel: true });
        if (c.end <= this.time) this.endChannel("pushback");
      }
    }
    effectsOf(ab, ctx) {
      return ctx.allyMode && ab.allyEffects ? ab.allyEffects : ab.effects;
    }
    costOf(ab, ctx = this.newCtx(ab)) {
      const base = typeof ab.cost === "function" ? ab.cost(this) : ab.cost || 0;
      ctx.baseCost = base;
      return Math.max(0, Math.round(applyMods(this, "cost", base, ctx)));
    }
    castTimeOf(ab, ctx = this.newCtx(ab)) {
      const t = applyMods(this, "castTime", ab.castTime || 0, ctx);
      return t > 0 ? t / (1 + this.stats().haste) : 0;
    }
    rangeOf(ab, ctx = this.newCtx(ab)) {
      return ab.range === "melee" ? RULES.meleeRange : ab.range ? applyMods(this, "range", ab.range, ctx) : 0;
    }
    reagentCost(ab, ctx) {
      return ab.reagent ? Math.max(0, Math.round(applyMods(this, "reagentCost", ab.reagent.n || 1, ctx))) : 0;
    }
    cooldownOf(ab, ctx) {
      return Math.max(0, applyMods(this, "cooldown", ab.cooldown || 0, ctx));
    }
    // Why an ability cannot be used right now (ignoring cast, GCD and cooldown, which queue), or null.
    blockReason(ab, ctx) {
      const p = this.player, req = ab.requires || {};
      if (p.dead) return "You are dead";
      if (!this.isKnown(ab)) return "You have not learned that spell";
      if (applyMods(this, "noActions", false, ctx)) return "Can't do that right now";
      if (ab.harmful && ((ab.schools || []).includes("physical") || ab.range === "melee") && applyMods(this, "noAttack", false, ctx)) return "Can't attack while protected";
      if (req.mainHand) {
        const w = weaponsOf(this).main;
        if (!w || !req.mainHand.includes(w.type)) return `Requires ${req.mainHand.map((t) => WEAPON_NAMES[t] || t).join(" or ")}`;
      }
      if (req.shield && !weaponsOf(this).shield) return "Requires a Shield";
      if (req.ranged && !weaponsOf(this).ranged) return "Requires a Ranged Weapon";
      const forms = this.requiredForms(ab, ctx);
      if (forms && !forms.includes(this.form())) return `Requires ${forms.map((f) => this.formName(f)).join(" or ")}`;
      if (req.formNot && req.formNot.includes(this.form())) return `Can't do that while in ${this.formName(this.form())}`;
      if (req.stealth && !isStealthed(p) && !applyMods(this, "ignoreStealthRequirement", false, ctx)) return "You must be stealthed";
      if (req.notInCombat && this.inCombat()) return "You are in combat";
      if (ab.usableFirst) {
        const why = ab.usableFirst(this, ctx);
        if (why) return why;
      }
      if (ctx.allyMode) {
        const t = ctx.target;
        if (!t || t.dead) return "Your target is dead";
        if (t !== p && this.edgeDistance(p, t) > this.rangeOf(ab, ctx)) return "Out of range";
      } else if (ab.target === "enemy") {
        const t = p.target;
        if (!t || t.dead) return "You have no target";
        if (this.edgeDistance(p, t) > this.rangeOf(ab, ctx)) return "Out of range";
        if (ab.minRange && this.edgeDistance(p, t) < ab.minRange) return "Target is too close";
        if (req.behind && !isBehind(p, t) && !applyMods(this, "ignoreBehindRequirement", false, ctx)) return "You must be behind your target";
      }
      if (ab.finisher && this.combo() <= 0) return "That ability requires combo points";
      if (ab.reagent && (p.reagents[ab.reagent.id] || 0) < this.reagentCost(ab, ctx)) return `Requires a ${(this.cls.reagents || {})[ab.reagent.id]?.name || ab.reagent.id}`;
      if (p.moving && (this.castTimeOf(ab, ctx) > 0 || ab.channel)) return "Can't do that while moving";
      if (!this.hasPower(ab, this.costOf(ab, ctx))) return `Not enough ${this.resourceOf(ab).label.toLowerCase()}`;
      if (ab.usable) {
        const why = ab.usable(this, ctx);
        if (why) return why;
      }
      return null;
    }
    /* ---------- using abilities ---------- */
    useAbility(id, fromQueue = false) {
      const ab = this.ability(id), p = this.player;
      if (!ab) return this.fail("Unknown ability");
      if (this.frozen) return this.fail("Press Start to begin the fight");
      const QW = RULES.queueWindow;
      const waits = [];
      if (p.cast) waits.push(p.cast.end - this.time);
      if (ab.gcd !== false && p.gcdEnd > this.time) waits.push(p.gcdEnd - this.time);
      if (this.cooldownLeft(ab) > 0) waits.push(this.cooldownLeft(ab));
      if (ab.nextSwing && p.nextSwing === id) {
        p.nextSwing = null;
        return true;
      }
      if (ab.shapeshift && this.form() === ab.shapeshift) return this.leaveForm();
      const own2 = ab.cancelsAura && p.auras.find((a) => a.id === ab.cancelsAura);
      if (own2) {
        removeAura(this, own2, "cancelled");
        return true;
      }
      if (waits.length && !ab.nextSwing) {
        const wait = Math.max(...waits);
        if (!fromQueue && wait <= QW) {
          p.queued = id;
          return true;
        }
        return this.fail(p.cast && p.cast.end > this.time ? "Another action is in progress" : "Ability is not ready yet");
      }
      const ctx = this.newCtx(ab);
      const why = this.blockReason(ab, ctx);
      if (why) {
        const r = this.resourceOf(ab);
        if (r.id === "rage" && ab.harmful && ab.range === "melee" && why === `Not enough ${r.label.toLowerCase()}` && weaponsOf(this).main) p.autoAttack = true;
        return this.fail(why);
      }
      if (ab.nextSwing) {
        p.nextSwing = p.nextSwing === id ? null : id;
        if (p.nextSwing) p.autoAttack = true;
        return true;
      }
      if (p.channel) this.endChannel("interrupted");
      if (ab.gcd !== false) {
        p.gcdTotal = Math.max(RULES.gcdMin, applyMods(this, "gcd", this.cls.gcd || RULES.gcd, ctx));
        p.gcdEnd = this.time + p.gcdTotal;
      }
      const ct = this.castTimeOf(ab, ctx);
      if (ct > 0) {
        p.cast = { ab, ctx, start: this.time, end: this.time + ct, total: ct };
        this.emit("cast:start", { ability: ab, ctx });
      } else this.completeCast(ab, ctx);
      return true;
    }
    fail(reason) {
      this.emit("error", reason);
      return false;
    }
    completeCast(ab, ctx) {
      const p = this.player;
      p.cast = null;
      const cost = this.costOf(ab, ctx), r = this.resourceOf(ab);
      if (!r.has(this, p.res[r.id], cost)) {
        this.fail(`Not enough ${r.label.toLowerCase()}`);
        return;
      }
      r.spend(this, p.res[r.id], cost);
      if (r.id === "mana") this.meter.manaSpent += cost;
      const harmful = ab.harmful && !ctx.allyMode;
      const cd = this.cooldownOf(ab, ctx);
      if (cd > 0) p.cooldowns[ab.cooldownGroup || ab.id] = { end: this.time + cd, total: cd };
      if (ab.finisher) ctx.combo = spendCombo(this);
      if (ab.reagent) p.reagents[ab.reagent.id] = Math.max(0, (p.reagents[ab.reagent.id] || 0) - this.reagentCost(ab, ctx));
      if (harmful && !ab.keepsStealth) this.breakStealth();
      if (harmful && !ab.keepsStealth && (ab.range === "melee" || ab.startsAttack)) p.autoAttack = true;
      this.emit("cast:success", { ability: ab, ctx, cost });
      if (ab.channel) {
        runEffects(this, this.effectsOf(ab, ctx), ctx);
        return this.startChannel(ab, ctx);
      }
      if (ab.speed && ctx.target && !ctx.allyMode) {
        const travel = dist(p, ctx.target) / ab.speed;
        const proj = { from: { x: p.x, y: p.y }, target: ctx.target, start: this.time, end: this.time + travel, schools: ab.schools, ability: ab };
        this.projectiles.push(proj);
        this.schedule(travel, () => {
          this.projectiles = this.projectiles.filter((x) => x !== proj);
          this.resolve(ab, ctx);
        });
      } else this.resolve(ab, ctx);
    }
    resolve(ab, ctx) {
      runEffects(this, this.effectsOf(ab, ctx), ctx);
      this.emit("spell:resolved", { ability: ab, ctx });
    }
    startChannel(ab, ctx) {
      const duration = applyMods(this, "channelDuration", ab.channel.duration, ctx);
      const interval = duration / ab.channel.ticks;
      this.player.channel = { ab, ctx, start: this.time, end: this.time + duration, total: duration, interval, nextTick: this.time + interval, ticks: 0 };
      this.emit("channel:start", { ability: ab, ctx });
    }
    endChannel(reason) {
      const c = this.player.channel;
      if (!c) return;
      this.player.channel = null;
      this.emit("channel:end", { ability: c.ab, ctx: c.ctx, reason });
    }
    cancelCast(reason) {
      const c = this.player.cast;
      if (!c) return;
      this.player.cast = null;
      this.player.queued = null;
      this.emit("cast:cancel", { ability: c.ab, reason });
    }
    // Leave the current form (back to the class's own: caster form, no stance).
    leaveForm() {
      for (const a of this.player.auras.slice()) if (a.def.flags && a.def.flags.form) removeAura(this, a, "cancelled");
      return true;
    }
    // Stealth-like auras (flags.stealth) end when the player attacks.
    breakStealth() {
      for (const a of this.player.auras.slice()) if (a.def.flags && a.def.flags.stealth) removeAura(this, a, "broken");
    }
    setTarget(e) {
      this.player.target = e && !e.dead ? e : null;
      this.emit("target", this.player.target);
    }
    // Clicking an enemy targets it and starts the auto attack (melee classes), like a right click in WoW.
    // In Stealth or Prowl it only selects: the auto attack would break it before the opener (the opener starts it).
    engage(e) {
      this.setTarget(e);
      const w = weaponsOf(this);
      if (this.player.target && (w.main || w.ranged) && !isStealthed(this.player)) this.player.autoAttack = true;
    }
    stopAttack() {
      this.player.autoAttack = false;
    }
    tabTarget() {
      const list = this.enemies.filter((e) => !e.dead).sort((a, b) => dist(this.player, a) - dist(this.player, b));
      if (!list.length) return this.setTarget(null);
      const i = list.indexOf(this.player.target);
      this.setTarget(list[(i + 1) % list.length]);
    }
    schedule(delay, fn) {
      this.timers.push({ at: this.time + delay, fn });
    }
    /* ---------- damage ---------- */
    // Called by combat for every attack result, landed or not: applies it, feeds the meter and tells everyone.
    reportDamage(ctx, res, spec) {
      const t = ctx.target;
      const name = spec && spec.name || ctx.ability && ctx.ability.name || "Unknown";
      const m = this.meter;
      const row = m.rows[name] || (m.rows[name] = { name, icon: ctx.aura && ctx.aura.def.icon || ctx.ability && ctx.ability.icon || (ctx.melee ? "inv_sword_04" : null), total: 0, hits: 0, crits: 0, misses: 0 });
      if (res.amount > 0) {
        t.hp -= res.amount;
        if (t.hp <= 0) {
          if (t.immortal) t.hp = t.resetHp || t.maxHp;
          else {
            t.hp = 0;
            t.dead = true;
          }
        }
        if (m.first == null) m.first = this.time;
        m.last = this.time;
        m.total += res.amount;
        row.total += res.amount;
        row.hits++;
        if (res.outcome === "crit") row.crits++;
      } else if (res.outcome !== "hit" && res.outcome !== "crit") {
        row.misses++;
        if (m.first == null) m.first = this.time;
        m.last = this.time;
      }
      this.emit("damage", { ctx, res, periodic: !!ctx.periodic });
      if (res.amount > 0) breakOnDamage(this, t);
      hitThreat(this, ctx, res, spec);
    }
    // The meter: damage done (rows), threat (threatRows), damage taken (takenRows, outcomes of the enemy's swings),
    // healing taken (healRows) and when the player died (diedAt, seconds into the fight).
    resetMeter() {
      this.meter = {
        first: null,
        last: null,
        total: 0,
        rows: {},
        threat: 0,
        threatRows: {},
        taken: 0,
        takenRows: {},
        swingsTaken: 0,
        outcomes: {},
        mitigated: 0,
        healed: 0,
        healRows: {},
        diedAt: null,
        aggroLost: 0,
        healDone: 0,
        overheal: 0,
        healDoneRows: {},
        otherHeal: 0,
        raidTaken: 0,
        deaths: [],
        manaSpent: 0,
        manaStart: 0
      };
    }
    tps() {
      return this.meter.threat / Math.max(1, this.fightTime());
    }
    hps() {
      return this.meter.healDone / Math.max(1, this.fightTime());
    }
    overhealPct() {
      const m = this.meter;
      return m.healDone + m.overheal > 0 ? m.overheal / (m.healDone + m.overheal) : 0;
    }
    // Seconds until the mana runs out at the net rate spent so far (Infinity when it is not going down).
    manaLasts() {
      const st = this.player.res.mana, t = this.fightTime();
      if (!st || t < 3) return Infinity;
      const drain = (this.meter.manaStart - st.power) / t;
      return drain > 0 ? st.power / drain : Infinity;
    }
    dtps() {
      return this.meter.taken / Math.max(1, this.fightTime());
    }
    dps() {
      const m = this.meter;
      if (m.first == null) return 0;
      const end = this.inCombat() ? this.time : m.last;
      return m.total / Math.max(1, end - m.first);
    }
    fightTime() {
      const m = this.meter;
      if (m.first == null) return 0;
      if (m.diedAt != null) return m.diedAt;
      return (this.inCombat() ? this.time : m.last) - m.first;
    }
    /* ---------- loop ---------- */
    update(dt) {
      if (this.frozen) return;
      let left = Math.min(dt, 0.25);
      while (left > 1e-9) {
        const h2 = Math.min(STEP, left);
        left -= h2;
        this.step(h2);
      }
    }
    step(h2) {
      this.time += h2;
      const p = this.player;
      if (this.timers.length) {
        const due = this.timers.filter((t) => t.at <= this.time + 1e-9).sort((a, b) => a.at - b.at);
        if (due.length) {
          this.timers = this.timers.filter((t) => !due.includes(t));
          for (const t of due) t.fn(this);
        }
      }
      const ix = p.input.x, iy = p.input.y, len = Math.hypot(ix, iy);
      p.moving = len > 0 && !p.dead && !applyMods(this, "noActions", false, { caster: p });
      if (p.moving) {
        const sp = applyMods(this, "runSpeed", RULES.runSpeed, { caster: p });
        p.x += ix / len * sp * h2;
        p.y += iy / len * sp * h2;
        p.facing = Math.atan2(iy, ix);
        this.clampToArena(p);
        if (p.cast) this.cancelCast("moving");
        if (p.channel) this.endChannel("moving");
      } else if (p.target && !p.target.dead && !p.dead) p.facing = Math.atan2(p.target.y - p.y, p.target.x - p.x);
      if (p.cast && this.time >= p.cast.end - 1e-9) {
        const c2 = p.cast;
        this.completeCast(c2.ab, c2.ctx);
      }
      const c = p.channel;
      if (c) {
        while (p.channel === c && c.nextTick <= this.time + 1e-9 && c.ticks < c.ab.channel.ticks) {
          c.ticks++;
          c.nextTick += c.interval;
          const tctx = { ...c.ctx, tick: c.ticks };
          if ((c.ab.target === "enemy" || tctx.allyMode) && (!tctx.target || tctx.target.dead)) {
            this.endChannel("target lost");
            break;
          }
          runEffects(this, tctx.allyMode && c.ab.channel.allyTick ? c.ab.channel.allyTick : c.ab.channel.tick, tctx);
          if (c.ab.channel.projectile && tctx.target) this.emit("fx", { kind: "shot", from: { x: p.x, y: p.y }, to: tctx.target, schools: c.ab.schools, duration: 0.35 });
          this.emit("channel:tick", { ability: c.ab, ctx: tctx });
        }
        if (p.channel === c && (c.ticks >= c.ab.channel.ticks || this.time >= c.end + 1e-6)) this.endChannel("done");
      }
      updateAutoAttack(this, h2);
      updatePets(this, h2);
      updateTotems(this, h2);
      updateZones(this);
      updateEnemies(this, h2);
      for (const u of [p, ...this.enemies, ...this.pets, ...this.allies]) updateAuras(this, u);
      const maxHp = this.stats().maxHp;
      if (maxHp !== this.lastMaxHp && !p.dead) {
        if (maxHp > this.lastMaxHp) p.hp += maxHp - this.lastMaxHp;
        p.hp = Math.max(1, Math.min(p.hp, maxHp));
      }
      this.lastMaxHp = maxHp;
      if (this.rules.infiniteMana && p.res.mana) p.res.mana.power = RESOURCES.mana.max(this);
      const active = this.resourceId();
      for (const id of this.resourceIds) if (id === active || RESOURCES[id].keepsWhenInactive) RESOURCES[id].update(this, p.res[id], h2);
      if (this.scenario.update) this.scenario.update(this, h2);
      if (p.queued && !p.cast) {
        const ab = this.ability(p.queued);
        if (ab && (ab.gcd === false || p.gcdEnd <= this.time) && this.cooldownLeft(ab) <= 0) {
          const id = p.queued;
          p.queued = null;
          this.useAbility(id, true);
        }
      }
    }
    clampToArena(u) {
      const a = this.arena;
      u.x = clamp(u.x, u.radius, a.width - u.radius);
      u.y = clamp(u.y, u.radius, a.height - u.radius);
    }
    // The talent tree with the most points (the spec), or null with no points.
    mainTree() {
      const pts = this.cls.trees.map((t, i) => treePoints(this.cls.trees, this.loadout.talents || {}, i));
      const best = Math.max(...pts);
      return best > 0 ? this.cls.trees[pts.indexOf(best)].id : null;
    }
    // Buffs the player starts the fight with, as if cast before the pull, for free: each ability's self aura or form.
    // Skipped when the ability is not known (talent) or when a buff of the same group (exclusive, or a form) is already
    // on (one chosen in the options or on the stance bar). Long buffs last the whole fight; short ones (Battle Shout) run
    // their normal duration.
    startBuffs(ids) {
      const p = this.player;
      for (const id of ids) {
        const ab = this.ability(id);
        if (!ab || !this.isKnown(ab)) continue;
        const ef = (ab.effects || []).find((e) => e.type === "setForm" || e.type === "applyAura" && (e.to === "self" || ab.target === "self" || ab.target === "ally"));
        const def = ef && (this.cls.auras || {})[ef.aura];
        if (!def) continue;
        if (p.auras.some((a) => a.id === def.id || def.exclusive && a.def.exclusive === def.exclusive || def.flags && def.flags.form && a.def.flags && a.def.flags.form)) continue;
        const long = def.duration == null || def.duration >= 600;
        applyAura(this, p, def, { source: p, duration: long ? Infinity : def.duration, charges: ef.charges });
      }
    }
    // Permanent auras chosen in the loadout (armor, buffs from other players).
    applyPermanent(unit, auraId) {
      applyAura(this, unit, this.auraDef(auraId), { source: unit, duration: Infinity });
    }
  };

  // src/common/data-version.js
  var DATA_BUILD = "1.60.1.70790";
  var LINK_DEFAULT = "1.60.1.70532";

  // src/classes/mage/talent-data.js
  var SOURCE = { site: "foreverchanges.pro/talents/mage", build: "1.60.1.70790", extracted: "2026-11-05" };
  var trees = [
    {
      id: "arcane",
      name: "Arcane",
      icon: "spell_holy_magicalsentry",
      talents: [
        { id: "wand_specialization", name: "Wand Specialization", icon: "inv_wand_01", tier: 0, col: 0, max: 2, ranks: ["Increases your damage with Wands by 13%.", "Increases your damage with Wands by 25%."] },
        { id: "improved_channeling", name: "Improved Channeling", icon: "spell_nature_starfall", tier: 0, col: 1, max: 5, ranks: [[20, 14], [40, 28], [60, 42], [80, 56], [100, 70]].map(([a, b]) => `Gives your Arcane Missiles spell a ${a}% chance and your Arcane Blast and Arcane Wrath spells a ${b}% chance to not lose casting time when you take damage.`) },
        { id: "arcane_resilience", name: "Arcane Resilience", icon: "spell_arcane_arcaneresilience", tier: 0, col: 2, max: 3, ranks: [25, 50, 75].map((n) => `Increases your Armor by an amount equal to ${n}% of your Intellect.`) },
        { id: "arcane_subtlety", name: "Arcane Subtlety", icon: "spell_holy_dispelmagic", tier: 1, col: 0, max: 2, ranks: [[8, 15], [15, 30]].map(([a, b]) => `Reduces your target's resistance to all your spells by ${a} and reduces the threat caused by your Arcane spells by ${b}%.`) },
        { id: "magic_absorption", name: "Magic Absorption", icon: "spell_nature_astralrecalgroup", tier: 1, col: 1, max: 2, ranks: [[5, 1], [10, 2]].map(([a, b]) => `Increases all your resistances by ${a} and causes all spells you fully resist to restore ${b}% of your total mana. Cannot trigger more often than 1 time per sec.`) },
        { id: "arcane_concentration", name: "Arcane Concentration", icon: "spell_shadow_manaburn", tier: 1, col: 2, max: 5, notes: true, ranks: [2, 4, 6, 8, 10].map((n) => `Gives you a ${n}% chance of entering a Clearcasting state after any damage spell hits a target. The Clearcasting state reduces the mana cost of your next damage spell by 100%.`) },
        { id: "missile_barrage", name: "Missile Barrage", icon: "ability_mage_missilebarrage", tier: 1, col: 3, max: 2, ranks: ["Gives your Arcane Blast spell a 20% chance, and your Arcane Wrath, Fireball, Frostbolt, and Frostfire Bolt spells a 10% chance to reduce the channeled duration of your next Arcane Missiles spell by 50%, reduce the Mana cost by 100%, and missiles fire every 0.5 sec.", "Gives your Arcane Blast spell a 40% chance, and your Arcane Wrath, Fireball, Frostbolt, and Frostfire Bolt spells a 20% chance to reduce the channeled duration of your next Arcane Missiles spell by 50%, reduce the Mana cost by 100%, and missiles fire every 0.5 sec."] },
        { id: "arcane_geometry", name: "Arcane Geometry", icon: "inv_ability_mage_radiantspark", tier: 2, col: 0, max: 2, ranks: [3, 6].map((n) => `Increases the range of your Arcane spells by ${n} yards.`) },
        { id: "arcane_impact", name: "Arcane Impact", icon: "spell_nature_wispsplode", tier: 2, col: 1, max: 3, ranks: [2, 4, 6].map((n) => `Increases the critical strike chance of your Arcane spells by ${n}%.`) },
        { id: "arcane_blast", name: "Arcane Blast", icon: "spell_arcane_blast", tier: 2, col: 3, max: 1, active: true, ranks: ["Teaches Arcane Blast: blasts the target with energy, dealing Arcane damage. Each time you cast Arcane Blast, you gain 12% of your Intellect as Spell Damage and the mana cost of Arcane Blast is increased by 100%. Effect stacks up to 4 times and lasts 18 sec from time of initial application."] },
        { id: "arcane_shielding", name: "Arcane Shielding", icon: "spell_shadow_detectlesserinvisibility", tier: 3, col: 0, max: 2, ranks: [[17, 25], [33, 50]].map(([a, b]) => `Decreases the Mana lost per point of damage taken when your Mana Shield spell is active by ${a}% and increases the resistances granted by your Mage Armor spell by ${b}%.`) },
        { id: "improved_counterspell", name: "Improved Counterspell", icon: "spell_frost_iceshock", tier: 3, col: 1, max: 2, ranks: [2, 4].map((n) => `Your Counterspell also Silences the target for ${n} sec.`) },
        { id: "arcane_meditation", name: "Arcane Meditation", icon: "spell_shadow_siphonmana", tier: 3, col: 2, max: 3, req: "arcane_concentration", ranks: [17, 33, 50].map((n) => `Allows ${n}% of your Mana regeneration to continue while casting.`) },
        { id: "arcane_wrath", name: "Arcane Wrath", icon: "ability_mage_netherwindpresence", tier: 3, col: 3, max: 1, req: "arcane_blast", active: true, ranks: ["Teaches Arcane Wrath: launches a projectile of pure Arcane energy at the enemy target, causing Arcane damage. This spell gains additional Spell Damage equal to 5% of your maximum Mana. 3.5 sec cast, 6 sec cooldown."] },
        { id: "presence_of_mind", name: "Presence of Mind", icon: "spell_nature_enchantarmor", tier: 4, col: 1, max: 1, active: true, ranks: ["When activated, your next Mage spell with a casting time less than 10 sec becomes an instant cast spell. 3 min cooldown."] },
        { id: "arcane_mind", name: "Arcane Mind", icon: "spell_shadow_charm", tier: 4, col: 2, max: 5, ranks: [[2, 20], [4, 40], [6, 60], [8, 80], [10, 100]].map(([a, b]) => `Increases your Intellect by ${a}% and increases the critical strike damage bonus of your Arcane spells by ${b}%.`) },
        { id: "arcane_instability", name: "Arcane Instability", icon: "spell_shadow_teleport", tier: 5, col: 2, max: 3, ranks: [1, 2, 3].map((n) => `Increases the damage done by your spells by ${n}% and your critical strike chance by ${n}%.`) },
        { id: "arcane_power", name: "Arcane Power", icon: "spell_nature_lightning", tier: 6, col: 1, max: 1, req: "presence_of_mind", active: true, ranks: ["For the next 15 sec, your spells deal 30% more damage while costing 30% more mana to cast. 3 min cooldown."] }
      ]
    },
    {
      id: "fire",
      name: "Fire",
      icon: "spell_fire_firebolt02",
      talents: [
        { id: "incineration", name: "Incineration", icon: "spell_fire_flameshock", tier: 0, col: 1, max: 5, ranks: [2, 4, 6, 8, 10].map((n) => `Increases the critical strike chance of your Fire Blast, Ice Lance, Arcane Blast, and Scorch spells by ${n}%.`) },
        { id: "accelerant", name: "Accelerant", icon: "spell_fire_flamebolt", tier: 0, col: 2, max: 5, ranks: [0.1, 0.2, 0.3, 0.4, 0.5].map((n) => `Reduces the casting time of your Fireball, Frostfire Bolt, and Arcane Wrath spells by ${n} sec.`) },
        { id: "ignite", name: "Ignite", icon: "spell_fire_incinerate", tier: 1, col: 0, max: 5, notes: true, ranks: [8, 16, 24, 32, 40].map((n) => `Your critical strikes from Fire damage spells cause the target to burn for an additional ${n}% of your spell's damage over 4 sec.`) },
        { id: "flame_throwing", name: "Flame Throwing", icon: "spell_fire_flare", tier: 1, col: 1, max: 2, ranks: [3, 6].map((n) => `Increases the range of your Fire spells by ${n} yards.`) },
        { id: "impact", name: "Impact", icon: "spell_fire_meteorstorm", tier: 1, col: 2, max: 3, ranks: [3, 7, 10].map((n) => `Gives your Fire spells a ${n}% chance to stun the target for 2 sec.`) },
        { id: "burning_soul", name: "Burning Soul", icon: "spell_fire_fire", tier: 2, col: 0, max: 3, ranks: [[23, 10], [47, 20], [70, 30]].map(([a, b]) => `Gives your Fire spells a ${a}% chance to not lose casting time when you take damage and reduces the threat caused by your Fire spells by ${b}%.`) },
        { id: "improved_flamestrike", name: "Improved Flamestrike", icon: "spell_fire_selfdestruct", tier: 2, col: 1, max: 3, ranks: [5, 10, 15].map((n) => `Increases the critical strike chance of your Flamestrike spell by ${n}%.`) },
        { id: "pyroblast", name: "Pyroblast", icon: "spell_fire_fireball02", tier: 2, col: 2, max: 1, active: true, ranks: ["Teaches Pyroblast: hurls an immense fiery boulder that causes Fire damage and an additional Fire damage over 12 sec. 6 sec cast."] },
        { id: "improved_fire_blast", name: "Improved Fire Blast", icon: "spell_fire_lavaspawn", tier: 2, col: 3, max: 2, ranks: [[1, 8], [2, 15]].map(([a, b]) => `Reduces the cooldown of your Fire Blast spell by ${a} sec and increases its range by ${b} yards.`) },
        { id: "improved_scorch", name: "Improved Scorch", icon: "spell_fire_soulburn", tier: 3, col: 0, max: 3, ranks: [33, 67, 100].map((n) => `Your Scorch spell has a ${n}% chance to cause your target to be vulnerable to Fire damage. This vulnerability increases all Fire damage you deal to your target by 3% and lasts 30 sec, stacking up to 5 times.`) },
        { id: "improved_fire_ward", name: "Improved Fire Ward", icon: "spell_fire_firearmor", tier: 3, col: 1, max: 2, ranks: [10, 20].map((n) => `Causes your Fire Ward to have a ${n}% chance to reflect Fire spells while active.`) },
        { id: "heating_up", name: "Heating Up", icon: "spell_fire_firebolt", tier: 3, col: 2, max: 1, req: "pyroblast", ranks: ["Non-periodic critical strikes with Fireball, Frostfire Bolt, Fire Blast, and Scorch reduce the cast time of your next Pyroblast cast within 20 sec by 25%, stacking up to 3 times. Fire Blast grants an additional stack every time it deals damage."] },
        { id: "master_of_elements", name: "Master of Elements", icon: "spell_fire_masterofelements", tier: 3, col: 3, max: 3, ranks: [10, 20, 30].map((n) => `Your Fire and Frost critical strikes will refund ${n}% of their base mana cost.`) },
        { id: "critical_mass", name: "Critical Mass", icon: "spell_nature_wispheal", tier: 4, col: 1, max: 3, ranks: [2, 4, 6].map((n) => `Increases the critical strike chance of your Fire spells by ${n}%.`) },
        { id: "blast_wave", name: "Blast Wave", icon: "spell_holy_excorcism_02", tier: 4, col: 2, max: 1, active: true, ranks: ["Teaches Blast Wave: a wave of flame radiates outward from the caster, damaging all enemies caught within the blast and Dazing them for 50% reduced movement speed for 6 sec. 45 sec cooldown."] },
        { id: "fire_power", name: "Fire Power", icon: "spell_fire_immolation", tier: 5, col: 2, max: 3, ranks: [[1, 4], [2, 8], [3, 12]].map(([a, b]) => `Increases the damage done by your Fire spells by ${a}% per your Fire effects on the target, up to a maximum increase of ${b}%. Effects which mix multiple schools of magic do not qualify.`) },
        { id: "combustion", name: "Combustion", icon: "spell_fire_sealoffire", tier: 6, col: 1, max: 1, req: "critical_mass", active: true, ranks: ["When activated, this spell causes each of your Fire damage spell hits to increase your critical strike chance with Fire damage spells by 10%. This effect lasts until you have caused 3 non-periodic critical strikes with Fire spells. 3 min cooldown."] }
      ]
    },
    {
      id: "frost",
      name: "Frost",
      icon: "spell_frost_frostbolt02",
      talents: [
        { id: "frost_warding", name: "Frost Warding", icon: "spell_frost_frostward", tier: 0, col: 0, max: 2, ranks: [[15, 10, 10], [30, 20, 20]].map(([a, b, c]) => `Increases the Armor and resistances granted by your Frost Armor and Ice Armor spells by ${a}%, gives your Frost Ward a ${b}% chance to negate the warded damage spell, and increases the amount absorbed by your Ice Barrier and Frost Ward by ${c}%.`) },
        { id: "improved_frostbolt", name: "Improved Frostbolt", icon: "spell_frost_frostbolt02", tier: 0, col: 1, max: 5, ranks: ["Reduces the casting time of your Frostbolt spell by 0.1 sec.", "Reduces the casting time of your Frostbolt spell by 0.2 sec.", "Reduces the casting time of your Frostbolt spell by 0.3 sec.", "Reduces the casting time of your Frostbolt spell by 0.4 sec.", "Reduces the casting time of your Frostbolt spell by 0.5 sec."] },
        { id: "precision", name: "Precision", icon: "spell_ice_magicdamage", tier: 0, col: 2, max: 3, ranks: [2, 4, 6].map((n) => `Improves your chance to hit with all spells by ${n}%.`) },
        { id: "ice_shards", name: "Ice Shards", icon: "spell_frost_iceshard", tier: 1, col: 0, max: 5, ranks: [20, 40, 60, 80, 100].map((n) => `Increases the critical strike damage bonus of your Frost spells by ${n}%.`) },
        { id: "frostbite", name: "Frostbite", icon: "spell_frost_frostarmor", tier: 1, col: 1, max: 3, ranks: [5, 10, 15].map((n) => `Gives your Chill effects a ${n}% chance to Freeze the target for 5 sec.`) },
        { id: "improved_frost_nova", name: "Improved Frost Nova", icon: "spell_frost_freezingbreath", tier: 1, col: 2, max: 2, ranks: [2, 4].map((n) => `Reduces the cooldown of your Frost Nova spell by ${n} sec.`) },
        { id: "permafrost", name: "Permafrost", icon: "spell_frost_wisp", tier: 1, col: 3, max: 3, ranks: [[11, 3], [22, 7], [33, 10]].map(([a, b]) => `Increases the duration of your Chill effects by ${a}% and reduces the target's speed by an additional ${b}%.`) },
        { id: "frost_channeling", name: "Frost Channeling", icon: "spell_frost_stun", tier: 2, col: 0, max: 3, ranks: [[5, 10], [10, 20], [15, 30]].map(([a, b]) => `Reduces the mana cost of your Frost spells by ${a}% and reduces the threat caused by your Frost spells by ${b}%.`) },
        { id: "improved_blizzard", name: "Improved Blizzard", icon: "spell_frost_icestorm", tier: 2, col: 1, max: 3, ranks: [15, 25, 40].map((n) => `Adds a Chill effect to your Blizzard spell. This effect lowers the target's movement speed by ${n}% for 1.5 sec.`) },
        { id: "ice_lance", name: "Ice Lance", icon: "spell_frost_frostblast", tier: 2, col: 2, max: 1, active: true, ranks: ["Teaches Ice Lance: deals Frost damage to an enemy target. Deals 300% increased damage to Frozen targets. Instant."] },
        { id: "arctic_reach", name: "Arctic Reach", icon: "spell_shadow_darkritual", tier: 3, col: 0, max: 2, ranks: ["Increases the range of your Frostbolt, Ice Lance, and Blizzard spells and the radius of your Frost Nova and Cone of Cold spells by 10%.", "Increases the range of your Frostbolt, Ice Lance, and Blizzard spells and the radius of your Frost Nova and Cone of Cold spells by 20%."] },
        { id: "ice_block", name: "Ice Block", icon: "spell_frost_frost", tier: 3, col: 1, max: 1, active: true, ranks: ["You become encased in a block of ice, protecting you from all physical attacks and spells for 10 sec, but during that time you cannot attack, move, or cast spells. 5 min cooldown."] },
        { id: "shatter", name: "Shatter", icon: "spell_frost_frostshock", tier: 3, col: 3, max: 3, ranks: [17, 33, 50].map((n) => `Increases the critical strike chance of all your spells against Frozen targets by ${n}%.`) },
        { id: "improved_cone_of_cold", name: "Improved Cone of Cold", icon: "spell_frost_glacier", tier: 4, col: 0, max: 3, ranks: [12, 23, 35].map((n) => `Increases the damage dealt by your Cone of Cold spell by ${n}%.`) },
        { id: "cold_snap", name: "Cold Snap", icon: "spell_frost_wizardmark", tier: 4, col: 1, max: 1, active: true, ranks: ["Finishes the remaining cooldown on all your other Frost spells. 10 min cooldown."] },
        { id: "fingers_of_frost", name: "Fingers of Frost", icon: "ability_mage_wintersgrasp", tier: 4, col: 2, max: 2, req: "ice_lance", ranks: [1, 2].map((n) => `Gives your Chill effects a 15% chance to grant you the Fingers of Frost effect, which treats your next ${n === 1 ? "1 spell" : "2 spells"} cast as if the target were Frozen. Lasts 15 sec.`) },
        { id: "winters_chill", name: "Winter's Chill", icon: "spell_frost_chillingblast", tier: 5, col: 2, max: 5, ranks: ["Gives your Frostbolt and Fingers of Frost empowered Ice Lance spells a 20% chance to apply Winter's Chill, increasing the target's damage taken from your next Cone of Cold by 20% and it gains an additional 7% of your spell damage, stacking up to 5 times.", "Gives your Frostbolt and Fingers of Frost empowered Ice Lance spells a 40% chance to apply Winter's Chill, increasing the target's damage taken from your next Cone of Cold by 20% and it gains an additional 7% of your spell damage, stacking up to 5 times.", "Gives your Frostbolt and Fingers of Frost empowered Ice Lance spells a 60% chance to apply Winter's Chill, increasing the target's damage taken from your next Cone of Cold by 20% and it gains an additional 7% of your spell damage, stacking up to 5 times.", "Gives your Frostbolt and Fingers of Frost empowered Ice Lance spells a 80% chance to apply Winter's Chill, increasing the target's damage taken from your next Cone of Cold by 20% and it gains an additional 7% of your spell damage, stacking up to 5 times.", "Gives your Frostbolt and Fingers of Frost empowered Ice Lance spells a 100% chance to apply Winter's Chill, increasing the target's damage taken from your next Cone of Cold by 20% and it gains an additional 7% of your spell damage, stacking up to 5 times."] },
        { id: "ice_barrier", name: "Ice Barrier", icon: "spell_ice_lament", tier: 6, col: 1, max: 1, req: "cold_snap", active: true, ranks: ["Teaches Ice Barrier: shield yourself, absorbing damage and increasing your Frost damage by 15% for 1 min. While shielded, your Frost damage is increased by an additional 5% and you do not lose casting time when you take damage. 30 sec cooldown."] }
      ]
    }
  ];

  // src/classes/mage/talent-history.js
  var talentHistory = [
    {
      // 1.60.1.70685 (October 28): Improved Fireball became Accelerant, Elemental Precision became Precision, Arcane Focus
      // left, Incineration went to 5 ranks and Critical Mass to 3, and five talents moved.
      until: "1.60.1.70685",
      date: "October 28",
      order: [
        ["wand_specialization", "arcane_focus", "improved_channeling", "missile_barrage", "arcane_subtlety", "magic_absorption", "arcane_concentration", "arcane_resilience", "arcane_geometry", "arcane_impact", "arcane_blast", "arcane_shielding", "improved_counterspell", "arcane_meditation", "arcane_wrath", "presence_of_mind", "arcane_mind", "arcane_instability", "arcane_power"],
        ["improved_fire_blast", "incineration", "improved_fireball", "ignite", "flame_throwing", "impact", "burning_soul", "improved_flamestrike", "pyroblast", "improved_scorch", "improved_fire_ward", "heating_up", "master_of_elements", "critical_mass", "blast_wave", "fire_power", "combustion"],
        ["frost_warding", "improved_frostbolt", "elemental_precision", "ice_shards", "frostbite", "improved_frost_nova", "permafrost", "frost_channeling", "improved_blizzard", "ice_lance", "arctic_reach", "ice_block", "shatter", "improved_cone_of_cold", "cold_snap", "fingers_of_frost", "winters_chill", "ice_barrier"]
      ],
      renamed: { improved_fireball: "accelerant", elemental_precision: "precision" },
      removed: { arcane_focus: "Arcane Focus" },
      names: { improved_fireball: "Improved Fireball", elemental_precision: "Elemental Precision" }
    }
  ];

  // src/common/spellbook.js
  var cure = (types, count = 1, abolish = null) => ({
    notSimulated: false,
    harmful: false,
    target: "ally",
    range: 30,
    dispels: types,
    tags: ["dispel"],
    effects: [{ type: "dispel", types, count }, ...abolish ? [{ type: "applyAura", to: "target", aura: abolish }] : []]
  });
  var cureAura = (types, every) => ({
    notSimulated: false,
    kind: "buff",
    period: every,
    onTick: (g, a) => dispelUnit(g, a.unit, types, 1),
    desc: () => `Removes one ${types.join(" or ")} effect every ${every} sec.`
  });
  var slug = (n) => n.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  var ENEMY = /(enem|the target|foe|attacker|hostile|creature|beast|humanoid|undead|demon)/i;
  var FRIEND = /(friendly|party member|ally|group member|raid member|targeted party|party or raid|the caster's pet|infuses the target|the target's (Intellect|Stamina|Spirit|Strength|Agility|armor|resistance)|their (Intellect|Stamina|Spirit)|same class with the target)/i;
  function parseRequires(text, forms) {
    const req = {}, list = [];
    for (const m of text.matchAll(/Requires ([^.]*?)(?= Requires |$)/g)) for (const part of m[1].split(/, | or /)) list.push(part.trim());
    const f = [...new Set(list.map((x) => forms[x]).filter(Boolean))];
    if (f.length) req.form = f;
    if (list.includes("Shields")) req.shield = true;
    if (list.includes("Ranged Weapon")) req.ranged = true;
    if (list.includes("Stealth")) req.stealth = true;
    return req;
  }
  var SECS = { sec: 1, min: 60, hr: 3600 };
  function parseDuration(text) {
    const m = text.match(/Lasts (?:up to )?(\d+(?:\.\d+)?) (sec|min|hr)/) || text.match(/for (?:up to )?(\d+(?:\.\d+)?) (sec|min|hr)/);
    return m ? +m[1] * SECS[m[2]] : null;
  }
  var firstSentence = (t) => (t.match(/^[^.]*\./) || [t])[0];
  function spellbookAbilities(rows, { known = /* @__PURE__ */ new Set(), talents = /* @__PURE__ */ new Set(), forms = {}, overrides = {}, auraOverrides = {} } = {}) {
    const out = [], auras10 = {};
    for (const [name, icon2, tree, cost, range, cast, cd, taught, text] of rows) {
      if (known.has(name)) continue;
      const id = slug(name);
      const named = text.match(/\b(Arcane|Fire|Frost|Holy|Nature|Shadow)\b (damage|resistance)/);
      const school = named ? named[1].toLowerCase() : null;
      const friendly = FRIEND.test(text), harmful = ENEMY.test(text) && !friendly;
      const ab = {
        id,
        name,
        icon: icon2,
        tree,
        schools: school ? [school] : [],
        notSimulated: true,
        text,
        cost: typeof cost === "string" ? /* @__PURE__ */ ((pct) => (g) => Math.round(g.stats().baseMana * pct))(+cost.slice(1) / 100) : cost,
        cooldown: cd || void 0,
        harmful,
        target: harmful && range ? "enemy" : friendly && range ? "ally" : "self",
        // a buff for someone else lands on the friendly target (or you)
        range: (harmful || friendly) && range ? range === "m" ? "melee" : range : void 0,
        requires: parseRequires(text, forms),
        effects: []
      };
      if (cast === "ch") {
        const d = +(text.match(/Lasts (\d+) sec/) || text.match(/for (\d+) sec/) || [0, 5])[1];
        ab.channel = { duration: d, ticks: d, tick: [] };
      } else if (cast) ab.castTime = cast;
      if (taught && talents.has(id)) ab.talent = id;
      const dur = parseDuration(text);
      if (dur && !ab.channel) {
        const onTarget = ab.target === "enemy";
        const flags = {};
        if (onTarget && /\b(Stuns?|stunning)\b/.test(text)) flags.stunned = true;
        if (onTarget && /(Any damage|damage caused|damage taken) (will |may )?(break|interrupt|remove|awaken|transform|release)/i.test(text)) flags.breaksOnDamage = true;
        auras10[id] = { id, name, icon: icon2, kind: onTarget ? "debuff" : "buff", duration: dur, flags, notSimulated: true, desc: () => firstSentence(text), ...auraOverrides[id] || {} };
        ab.effects = [{ type: "applyAura", to: onTarget || ab.target === "ally" ? "target" : "self", aura: id }];
      }
      const o = overrides[id];
      out.push(o ? { ...ab, ...o, requires: { ...ab.requires, ...o.requires || {} } } : ab);
    }
    return { abilities: out, auras: auras10 };
  }

  // src/classes/mage/spellbook-data.js
  var SPELLBOOK = [
    ["Arcane Intellect", "spell_holy_magicalsentry", "arcane", 1510, 30, 0, 0, 0, "Increases the target's Intellect by 31 for 1 hr."],
    ["Polymorph", "spell_nature_polymorph", "arcane", 150, 30, 1.5, 0, 0, "Transforms the enemy into a sheep, forcing it to wander around for up to 50 sec. While wandering, the sheep cannot attack or cast spells but will regenerate very quickly. Any damage will transform the target back into its normal form. Only one target can be polymorphed at a time. Only works on Beasts, Humanoids and Critters."],
    ["Dampen Magic", "spell_nature_abolishmagic", "arcane", 500, 30, 0, 0, 0, "Dampens magic used against the targeted party member, decreasing damage taken from spells by up to 135 and healing spells by up to 270. Lasts 10 min."],
    ["Amplify Magic", "spell_holy_flashheal", "arcane", 450, 30, 0, 0, 0, "Amplifies magic used against the targeted party member, increasing damage taken from spells by up to 113 and healing spells by up to 225. Lasts 10 min."],
    ["Remove Lesser Curse", "spell_nature_removecurse", "arcane", "b10", 30, 0, 0, 0, "Removes 1 Curse or Bane from a friendly target."],
    ["Mana Shield", "spell_shadow_detectlesserinvisibility", "arcane", 140, 0, 0, 0, 0, "Absorbs 570 physical damage, draining mana instead. Drains 2 mana per damage absorbed. Lasts 1 min."],
    ["Counterspell", "spell_frost_iceshock", "arcane", 100, 30, 0, 30, 0, "Counters the enemy's spellcast, preventing any spell from that school of magic from being cast for 10 sec. Generates a high amount of threat."],
    ["Mage Armor", "spell_magearmor", "arcane", 490, 0, 0, 0, 0, "Increases your resistance to all magic by 15 and allows 50% of your mana regeneration to continue while casting. Only one type of Armor spell can be active on the Mage at any time. Lasts 30 min."],
    ["Arcane Brilliance", "spell_holy_arcaneintellect", "arcane", 3400, 40, 0, 0, 0, "Infuses the target's party and raid with brilliance, increasing their Intellect by 31 for 1 hr."],
    ["Fire Ward", "spell_fire_firearmor", "fire", 320, 0, 0, 30, 0, "Absorbs 913 Fire damage. Lasts 30 sec."],
    ["Frost Armor", "spell_frost_frostarmor02", "frost", 170, 0, 0, 0, 0, "Increases Armor by 200. If an enemy strikes the caster, they may have their movement slowed by 30% and the time between their attacks increased by 25% for 5 sec. Only one type of Armor spell can be active on the Mage at any time. Lasts 30 min."],
    ["Frost Ward", "spell_frost_frostward", "frost", 320, 0, 0, 30, 0, "Absorbs 1004 Frost damage. Lasts 30 sec."],
    ["Ice Armor", "spell_frost_frostarmor02", "frost", 500, 0, 0, 0, 0, "Increases Armor by 560 and frost resistance by 15. If an enemy strikes the caster, they may have their movement slowed by 30% and the time between their attacks increased by 25% for 5 sec. Only one type of Armor spell can be active on the Mage at any time. Lasts 30 min."]
  ];

  // src/classes/mage/abilities.js
  var BASE_MANA = 1213;
  var chill = (aura2, duration) => ({ type: "applyAura", to: "target", aura: aura2, duration });
  var abilities = [
    /* ---------- Arcane ---------- */
    {
      id: "arcane_missiles",
      name: "Arcane Missiles",
      icon: "spell_nature_starfall",
      tree: "arcane",
      schools: ["arcane"],
      harmful: true,
      cost: 655,
      range: 30,
      target: "enemy",
      channel: { duration: 5, ticks: 5, projectile: true, tick: [{ type: "damage", min: 209, max: 209, coef: 0.286, name: "Arcane Missiles" }] },
      text: "Launches Arcane Missiles at the enemy, causing 209 Arcane damage each second for 5 sec."
    },
    {
      id: "arcane_explosion",
      name: "Arcane Explosion",
      icon: "spell_nature_wispsplode",
      tree: "arcane",
      schools: ["arcane"],
      harmful: true,
      cost: 390,
      target: "self",
      effects: [{ type: "aoeDamage", center: "self", radius: 10, min: 239, max: 258, coef: 0.143 }],
      text: "Causes an explosion of arcane magic around the caster, causing 239 to 258 Arcane damage to all targets within 10 yards."
    },
    {
      id: "arcane_blast",
      name: "Arcane Blast",
      icon: "spell_arcane_blast",
      tree: "arcane",
      schools: ["arcane"],
      harmful: true,
      talent: "arcane_blast",
      cost: Math.round(BASE_MANA * 0.15),
      castTime: 1.5,
      range: 30,
      target: "enemy",
      effects: [{ type: "damage", min: 218, max: 254, coef: 0.429 }],
      text: "Blasts the target with energy, dealing 218 to 254 Arcane damage. Each time you cast Arcane Blast, you gain 12% of your Intellect as Spell Damage and the mana cost of Arcane Blast is increased by 100%. Effect stacks up to 4 times and lasts 18 sec from time of initial application."
    },
    {
      id: "arcane_wrath",
      name: "Arcane Wrath",
      icon: "ability_mage_netherwindpresence",
      tree: "arcane",
      schools: ["arcane"],
      harmful: true,
      talent: "arcane_wrath",
      cost: 395,
      castTime: 3.5,
      cooldown: 6,
      range: 30,
      target: "enemy",
      speed: 24,
      effects: [{ type: "damage", min: 406, max: 496, coef: 1, spBonus: (g) => g.stats().maxMana * 0.05 }],
      text: "Launches a projectile of pure Arcane energy at the enemy target, causing 406 to 496 Arcane damage. This spell gains additional Spell Damage equal to 5% of your maximum Mana."
    },
    {
      id: "presence_of_mind",
      name: "Presence of Mind",
      icon: "spell_nature_enchantarmor",
      tree: "arcane",
      schools: ["arcane"],
      talent: "presence_of_mind",
      cooldown: 180,
      gcd: false,
      target: "self",
      effects: [{ type: "applyAura", to: "self", aura: "presence_of_mind" }],
      text: "When activated, your next Mage spell with a casting time less than 10 sec becomes an instant cast spell."
    },
    {
      id: "arcane_power",
      name: "Arcane Power",
      icon: "spell_nature_lightning",
      tree: "arcane",
      schools: ["arcane"],
      talent: "arcane_power",
      cooldown: 180,
      gcd: false,
      target: "self",
      effects: [{ type: "applyAura", to: "self", aura: "arcane_power" }],
      text: "For the next 15 sec, your spells deal 30% more damage while costing 30% more mana to cast."
    },
    {
      id: "evocation",
      name: "Evocation",
      icon: "spell_nature_purge",
      tree: "arcane",
      schools: ["arcane"],
      cooldown: 480,
      target: "self",
      effects: [{ type: "applyAura", to: "self", aura: "evocation" }],
      channel: { duration: 8, ticks: 4, tick: [] },
      text: "While channeling this spell, your mana regeneration is active and increased by 1500%. Lasts 8 sec."
    },
    {
      id: "blink",
      name: "Blink",
      icon: "spell_arcane_blink",
      tree: "arcane",
      schools: ["arcane"],
      cost: Math.round(BASE_MANA * 0.35),
      cooldown: 15,
      target: "self",
      effects: [{ type: "teleport", distance: 20 }],
      text: "Teleports the caster 20 yards forward, unless something is in the way. Also frees the caster from Stuns and Immobilizes."
    },
    {
      id: "mana_ruby",
      name: "Mana Ruby",
      icon: "inv_misc_gem_ruby_01",
      kind: "item",
      resource: "mana",
      gcd: false,
      cooldown: 120,
      cooldownGroup: "mana_gem",
      target: "self",
      effects: [{ type: "restorePower", min: 1e3, max: 1200 }],
      text: "Restores 1000 to 1200 mana. (Conjure Mana Ruby. Here it comes back with its 2 min cooldown, no need to conjure it again.)"
    },
    /* ---------- Fire ---------- */
    {
      id: "fireball",
      name: "Fireball",
      icon: "spell_fire_flamebolt",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      cost: 410,
      castTime: 3.5,
      range: 35,
      target: "enemy",
      speed: 24,
      effects: [{ type: "damage", min: 425, max: 541, coef: 1, onHit: [{ type: "applyAura", to: "target", aura: "fireball_dot" }] }],
      text: "Hurls a fiery ball that causes 425 to 541 Fire damage and an additional 60 Fire damage over 8 sec."
    },
    {
      id: "fire_blast",
      name: "Fire Blast",
      icon: "spell_fire_fireball",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      cost: 340,
      cooldown: 8,
      range: 20,
      target: "enemy",
      effects: [{ type: "damage", min: 417, max: 489, coef: 0.429 }],
      text: "Blasts the enemy for 417 to 489 Fire damage."
    },
    {
      id: "scorch",
      name: "Scorch",
      icon: "spell_fire_soulburn",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      cost: 150,
      castTime: 1.5,
      range: 30,
      target: "enemy",
      effects: [{ type: "damage", min: 167, max: 196, coef: 0.429 }],
      text: "Scorch the enemy for 167 to 196 Fire damage."
    },
    {
      id: "flamestrike",
      name: "Flamestrike",
      icon: "spell_fire_selfdestruct",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      cost: 990,
      castTime: 3,
      range: 30,
      target: "enemy",
      // The pillar hits everything in the circle, then the ground burns for 8 sec: whoever stands in it takes 83 every 2 sec
      // (ESTIMATE: 0.03 spell power per tick, Classic).
      effects: [
        { type: "aoeDamage", center: "target", radius: 8, min: 382, max: 466, coef: 0.157 },
        { type: "zone", center: "target", radius: 8, duration: 8, period: 2, tick: { min: 83, max: 83, coef: 0.03, canCrit: true, name: "Flamestrike (burning ground)" } }
      ],
      text: "Calls down a pillar of fire, burning all enemies within the area for 382 to 466 Fire damage and an additional 332 Fire damage over 8 sec. Only one Flamestrike can be active per Mage at a time."
    },
    {
      id: "pyroblast",
      name: "Pyroblast",
      icon: "spell_fire_fireball02",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      talent: "pyroblast",
      cost: 440,
      castTime: 6,
      range: 35,
      target: "enemy",
      speed: 24,
      effects: [{ type: "damage", min: 520, max: 646, coef: 1, onHit: [{ type: "applyAura", to: "target", aura: "pyroblast_dot" }] }],
      text: "Hurls an immense fiery boulder that causes 520 to 646 Fire damage and an additional 212 Fire damage over 12 sec."
    },
    {
      id: "blast_wave",
      name: "Blast Wave",
      icon: "spell_holy_excorcism_02",
      tree: "fire",
      schools: ["fire"],
      harmful: true,
      talent: "blast_wave",
      cost: 545,
      cooldown: 45,
      target: "self",
      effects: [{ type: "aoeDamage", center: "self", radius: 10, min: 453, max: 533, coef: 0.129, binary: true, onHit: [{ type: "applyAura", to: "target", aura: "blast_wave_daze" }] }],
      text: "A wave of flame radiates outward from the caster, damaging all enemies caught within the blast for 453 to 533 Fire damage, and Dazing them for 50% reduced movement speed for 6 sec."
    },
    {
      id: "frostfire_bolt",
      name: "Frostfire Bolt",
      icon: "ability_mage_frostfirebolt",
      tree: "fire",
      schools: ["fire", "frost"],
      harmful: true,
      cost: 370,
      castTime: 3,
      range: 35,
      target: "enemy",
      speed: 28,
      projectileStyle: { core: "#8fd8ff", edge: "#ff8a2a" },
      // ice in the middle, fire around
      effects: [{ type: "damage", min: 270, max: 314, coef: 0.814, binary: true, onHit: [chill("frostfire_chill", 9), { type: "applyAura", to: "target", aura: "frostfire_dot" }] }],
      text: "Launches a bolt of frostfire at the enemy, causing 270 to 314 Frostfire damage, slowing movement speed by 40% and causing an additional 57 Frostfire damage over 9 sec. This spell will be checked against the lower of the target's Frost and Fire resists and counts as both Frost and Fire damage."
    },
    {
      id: "combustion",
      name: "Combustion",
      icon: "spell_fire_sealoffire",
      tree: "fire",
      schools: ["fire"],
      talent: "combustion",
      cooldown: 180,
      gcd: false,
      target: "self",
      effects: [{ type: "applyAura", to: "self", aura: "combustion" }],
      text: "When activated, this spell causes each of your Fire damage spell hits to increase your critical strike chance with Fire damage spells by 10%. This effect lasts until you have caused 3 non-periodic critical strikes with Fire spells."
    },
    /* ---------- Frost ---------- */
    {
      id: "frostbolt",
      name: "Frostbolt",
      icon: "spell_frost_frostbolt02",
      tree: "frost",
      schools: ["frost"],
      harmful: true,
      cost: 290,
      castTime: 3,
      range: 30,
      target: "enemy",
      speed: 28,
      effects: [{ type: "damage", min: 457, max: 493, coef: 0.814, binary: true, onHit: [chill("frostbolt_chill", 9)] }],
      text: "Launches a bolt of frost at the enemy, causing 457 to 493 Frost damage and slowing movement speed by 40% for 9 sec."
    },
    {
      id: "ice_lance",
      name: "Ice Lance",
      icon: "spell_frost_frostblast",
      tree: "frost",
      schools: ["frost"],
      harmful: true,
      talent: "ice_lance",
      cost: 160,
      cooldown: 8,
      range: 30,
      target: "enemy",
      speed: 38,
      effects: [{
        type: "damage",
        min: 137,
        max: 161,
        coef: 0.429
        /* ESTIMATE: 0 in the client table, instant-cast rule used */
      }],
      text: "Deals 137 to 161 Frost damage to an enemy target. Deals 300% increased damage to Frozen targets."
    },
    {
      id: "frost_nova",
      name: "Frost Nova",
      icon: "spell_frost_frostnova",
      tree: "frost",
      schools: ["frost"],
      harmful: true,
      cost: 145,
      cooldown: 25,
      target: "self",
      effects: [{ type: "aoeDamage", center: "self", radius: 10, min: 72, max: 79, coef: 0.029, binary: true, onHit: [{ type: "applyAura", to: "target", aura: "frost_nova" }] }],
      text: "Blasts enemies near the caster for 72 to 79 Frost damage and freezes them in place for up to 8 sec. Damage caused may interrupt the effect."
    },
    {
      id: "cone_of_cold",
      name: "Cone of Cold",
      icon: "spell_frost_glacier",
      tree: "frost",
      schools: ["frost"],
      harmful: true,
      cost: 555,
      cooldown: 10,
      target: "self",
      effects: [{ type: "aoeDamage", center: "self", radius: 10, cone: 60, min: 328, max: 358, coef: 0.129, binary: true, onHit: [chill("cone_of_cold_chill", 6)] }],
      text: "Targets in a cone in front of the caster take 328 to 358 Frost damage and are slowed by 40% for 6 sec. The first 4 targets hit by this cone are slowed by an additional 10% for an additional 3 sec."
    },
    {
      id: "blizzard",
      name: "Blizzard",
      icon: "spell_frost_icestorm",
      tree: "frost",
      schools: ["frost"],
      harmful: true,
      cost: 1400,
      range: 30,
      target: "enemy",
      channel: {
        duration: 8,
        ticks: 8,
        tick: [{
          type: "aoeDamage",
          center: "target",
          radius: 8,
          min: 146,
          max: 146,
          coef: 0.042,
          name: "Blizzard",
          onHit: [{ type: "applyAura", to: "target", aura: "blizzard_chill", when: (g) => g.rank("improved_blizzard") > 0 }]
        }]
      },
      text: "Ice shards pelt the target area doing 1168 Frost damage over 8 sec."
    },
    {
      id: "ice_barrier",
      name: "Ice Barrier",
      icon: "spell_ice_lament",
      tree: "frost",
      schools: ["frost"],
      talent: "ice_barrier",
      cost: 480,
      cooldown: 30,
      target: "self",
      // The absorb has no spell power coefficient in the beta client (SpellEffect 13033).
      effects: [{ type: "absorb", to: "self", aura: "ice_barrier", amount: (g) => 901 * (1 + 0.1 * g.rank("frost_warding")) }, { type: "applyAura", to: "self", aura: "ice_barrier_frost" }],
      text: "Shield yourself, absorbing 901 damage and increasing your Frost damage by 15% for 1 min. While shielded, your Frost damage is increased by an additional 5% and you do not lose casting time when you take damage."
    },
    {
      id: "cold_snap",
      name: "Cold Snap",
      icon: "spell_frost_wizardmark",
      tree: "frost",
      schools: ["frost"],
      talent: "cold_snap",
      cooldown: 600,
      gcd: false,
      target: "self",
      effects: [{ type: "resetCooldowns", filter: (ab) => (ab.schools || []).includes("frost") && ab.schools.length === 1 }],
      text: "Finishes the remaining cooldown on all your other Frost spells."
    },
    {
      id: "ice_block",
      name: "Ice Block",
      icon: "spell_frost_frost",
      tree: "frost",
      schools: ["frost"],
      talent: "ice_block",
      cost: 15,
      cooldown: 300,
      target: "self",
      cancelsAura: "ice_block",
      // pressing it again ends it early
      effects: [{ type: "applyAura", to: "self", aura: "ice_block" }],
      text: "You become encased in a block of ice, protecting you from all physical attacks and spells for 10 sec, but during that time you cannot attack, move, or cast spells."
    }
  ];

  // src/classes/mage/spellbook.js
  var int31 = { mods: () => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int + 31 }) }], notSimulated: false, desc: () => "Intellect increased by 31." };
  var extra = spellbookAbilities(SPELLBOOK, {
    known: new Set(abilities.map((a) => a.name)),
    talents: new Set(trees.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      arcane_intellect: { notSimulated: false },
      arcane_brilliance: { notSimulated: false, effects: [{ type: "applyAura", to: "self", aura: "arcane_intellect" }] },
      // Every fight starts in Mage Armor; Frost Armor and Ice Armor can still be cast during the fight.
      mage_armor: { notSimulated: false },
      frost_armor: { notSimulated: false },
      ice_armor: { notSimulated: false },
      remove_lesser_curse: cure(["curse"])
    },
    auraOverrides: {
      arcane_intellect: int31,
      mage_armor: { exclusive: "mage_armor", notSimulated: false, mods: () => [add("regenWhileCasting", 0.5)], desc: () => "50% of your mana regeneration continues while casting." },
      // Armor (more with Frost Warding). ESTIMATE: the slowing effect on attackers is not simulated.
      frost_armor: { exclusive: "mage_armor", notSimulated: false, mods: (a, g) => [add("armor", 200 * (1 + 0.15 * g.rank("frost_warding")))], desc: () => "Armor increased." },
      ice_armor: { exclusive: "mage_armor", notSimulated: false, mods: (a, g) => [add("armor", 560 * (1 + 0.15 * g.rank("frost_warding")))], desc: () => "Armor increased." }
    }
  });

  // src/classes/mage/auras.js
  var DOT_CRIT = true;
  var chillAura = (id, name, icon2) => ({ id, name, icon: icon2, kind: "debuff", chill: true, schools: ["frost"], duration: 9, desc: () => "Movement slowed by 40%." });
  var auras = {
    /* ---------- buffs ---------- */
    mage_armor: {
      id: "mage_armor",
      name: "Mage Armor",
      icon: "spell_magearmor",
      kind: "buff",
      mods: () => [add("regenWhileCasting", 0.5)],
      desc: () => "Resistance to all magic increased by 15. 50% of your mana regeneration continues while casting."
    },
    ice_armor: {
      id: "ice_armor",
      name: "Ice Armor",
      icon: "spell_frost_frostarmor02",
      kind: "buff",
      desc: () => "Armor increased by 560 and Frost resistance by 15."
    },
    arcane_intellect: {
      id: "arcane_intellect",
      name: "Arcane Intellect",
      icon: "spell_holy_magicalsentry",
      kind: "buff",
      mods: () => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int + 31 }) }],
      desc: () => "Intellect increased by 31."
    },
    arcane_blast: {
      id: "arcane_blast",
      name: "Arcane Blast",
      icon: "spell_arcane_blast",
      kind: "buff",
      maxStacks: 4,
      duration: 18,
      refresh: false,
      mods: (a) => [
        { key: "spellPower", fn: (v, ctx, g) => v + g.stats().int * 0.12 * a.stacks },
        mult("cost", 1 + 1 * a.stacks, (ctx) => isAbility(ctx, "arcane_blast"))
      ],
      desc: (a, g) => `Spell damage increased by ${Math.round(g.stats().int * 0.12 * a.stacks)}. Arcane Blast costs ${100 * a.stacks}% more mana.`
    },
    presence_of_mind: {
      id: "presence_of_mind",
      name: "Presence of Mind",
      icon: "spell_nature_enchantarmor",
      kind: "buff",
      duration: Infinity,
      mods: () => [set("castTime", 0, (ctx) => ctx.ability && ctx.ability.kind !== "item" && (ctx.ability.castTime || 0) > 0 && ctx.ability.castTime < 10)],
      desc: () => "Your next Mage spell with a casting time less than 10 sec is instant."
    },
    arcane_power: {
      id: "arcane_power",
      name: "Arcane Power",
      icon: "spell_nature_lightning",
      kind: "buff",
      duration: 15,
      mods: () => [mult("damageMult", 1.3, (ctx) => !!ctx.ability && ctx.ability.harmful), mult("cost", 1.3)],
      desc: () => "Spell damage increased by 30%. Mana cost of spells increased by 30%."
    },
    clearcasting: {
      id: "clearcasting",
      name: "Clearcasting",
      icon: "spell_shadow_manaburn",
      kind: "buff",
      duration: 15,
      mods: () => [set("cost", 0, (ctx) => !!ctx.ability && ctx.ability.harmful)],
      desc: () => "Your next damage spell costs no mana."
    },
    missile_barrage: {
      id: "missile_barrage",
      name: "Missile Barrage",
      icon: "ability_mage_missilebarrage",
      kind: "buff",
      duration: 15,
      mods: () => [set("cost", 0, (ctx) => isAbility(ctx, "arcane_missiles"))],
      desc: () => "Your next Arcane Missiles costs no mana and fires its missiles twice as fast."
    },
    evocation: {
      id: "evocation",
      name: "Evocation",
      icon: "spell_nature_purge",
      kind: "buff",
      duration: 8,
      mods: () => [set("regenWhileCasting", 1), mult("regenMult", 16)],
      desc: () => "Mana regeneration active and increased by 1500%."
    },
    heating_up: {
      id: "heating_up",
      name: "Heating Up",
      icon: "spell_fire_firebolt",
      kind: "buff",
      maxStacks: 3,
      duration: 20,
      mods: (a) => [mult("castTime", 1 - 0.25 * a.stacks, (ctx) => isAbility(ctx, "pyroblast"))],
      desc: (a) => `Your next Pyroblast casts ${25 * a.stacks}% faster.`
    },
    combustion: {
      id: "combustion",
      name: "Combustion",
      icon: "spell_fire_sealoffire",
      kind: "buff",
      maxStacks: 99,
      duration: Infinity,
      onApply: (g, a, fresh) => {
        if (fresh) {
          a.stacks = 0;
          a.data.crits = 0;
        }
      },
      mods: (a) => [add("critChance", 0.1 * a.stacks, (ctx) => hasSchool(ctx, "fire"))],
      desc: (a) => `Fire critical strike chance increased by ${10 * a.stacks}%. Ends after ${3 - (a.data.crits || 0)} more Fire critical strikes.`
    },
    fingers_of_frost: {
      id: "fingers_of_frost",
      name: "Fingers of Frost",
      icon: "ability_mage_wintersgrasp",
      kind: "buff",
      duration: 15,
      charges: 1,
      desc: (a) => `Your next ${a.charges > 1 ? a.charges + " spells treat" : "spell treats"} the target as Frozen.`
    },
    // Ice Barrier: the shield (absorbs, +5% Frost damage and no pushback while it holds) and the minute of +15% Frost damage.
    ice_barrier: {
      id: "ice_barrier",
      name: "Ice Barrier",
      icon: "spell_ice_lament",
      kind: "buff",
      duration: 60,
      absorb: true,
      mods: () => [mult("damageMult", 1.05, (ctx) => hasSchool(ctx, "frost")), focus(1)],
      desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage. Frost damage increased by 5%, and you do not lose casting time when you take damage.`
    },
    ice_barrier_frost: {
      id: "ice_barrier_frost",
      name: "Ice Barrier",
      icon: "spell_ice_lament",
      kind: "buff",
      duration: 60,
      mods: () => [mult("damageMult", 1.15, (ctx) => hasSchool(ctx, "frost"))],
      desc: () => "Frost damage increased by 15%."
    },
    ice_block: {
      id: "ice_block",
      name: "Ice Block",
      icon: "spell_frost_frost",
      kind: "buff",
      duration: 10,
      flags: { encased: true },
      mods: () => [set("noActions", true)],
      desc: () => "Immune to all physical attacks and spells. Cannot move, attack or cast spells."
    },
    /* ---------- debuffs on the target ---------- */
    fireball_dot: { id: "fireball_dot", name: "Fireball", icon: "spell_fire_flamebolt", kind: "debuff", schools: ["fire"], dot: { period: 2, ticks: 4, base: 60, coef: 0, canCrit: DOT_CRIT } },
    pyroblast_dot: { id: "pyroblast_dot", name: "Pyroblast", icon: "spell_fire_fireball02", kind: "debuff", schools: ["fire"], dot: { period: 3, ticks: 4, base: 212, coef: 0.6, canCrit: DOT_CRIT } },
    flamestrike_dot: { id: "flamestrike_dot", name: "Flamestrike", icon: "spell_fire_selfdestruct", kind: "debuff", schools: ["fire"], dot: { period: 2, ticks: 4, base: 332, coef: 0.12, canCrit: DOT_CRIT } },
    frostfire_dot: { id: "frostfire_dot", name: "Frostfire Bolt", icon: "ability_mage_frostfirebolt", kind: "debuff", schools: ["fire", "frost"], dot: { period: 3, ticks: 3, base: 57, coef: 0, canCrit: DOT_CRIT } },
    // Forever Ignite: one per Mage, and new crits add to what is left instead of being lost.
    ignite: {
      id: "ignite",
      name: "Ignite",
      icon: "spell_fire_incinerate",
      kind: "debuff",
      schools: ["fire"],
      duration: 4,
      dot: { period: 2, ticks: 2, fixed: true, snapshot: () => {
      }, label: "Ignite" },
      desc: (a) => `Burning for ${Math.round(a.data.perTick || 0)} Fire damage every 2 sec.`
    },
    fire_vulnerability: {
      id: "fire_vulnerability",
      name: "Fire Vulnerability",
      icon: "spell_fire_soulburn",
      kind: "debuff",
      maxStacks: 5,
      duration: 30,
      sourceMods: (a) => [mult("damageMult", 1 + 0.03 * a.stacks, (ctx) => hasSchool(ctx, "fire"))],
      desc: (a) => `Fire damage taken from the Mage increased by ${3 * a.stacks}%.`
    },
    blast_wave_daze: { id: "blast_wave_daze", name: "Blast Wave", icon: "spell_holy_excorcism_02", kind: "debuff", duration: 6, desc: () => "Dazed: movement speed reduced by 50%." },
    frostbolt_chill: chillAura("frostbolt_chill", "Frostbolt", "spell_frost_frostbolt02"),
    frostfire_chill: chillAura("frostfire_chill", "Frostfire Bolt", "ability_mage_frostfirebolt"),
    cone_of_cold_chill: { ...chillAura("cone_of_cold_chill", "Cone of Cold", "spell_frost_glacier"), duration: 6 },
    blizzard_chill: { ...chillAura("blizzard_chill", "Improved Blizzard", "spell_frost_icestorm"), duration: 1.5 },
    frost_nova: {
      id: "frost_nova",
      name: "Frost Nova",
      icon: "spell_frost_frostnova",
      kind: "debuff",
      schools: ["frost"],
      duration: 8,
      flags: { frozen: true, breaksOnDamage: true },
      desc: () => "Frozen in place. Damage breaks the effect."
    },
    frostbite: {
      id: "frostbite",
      name: "Frostbite",
      icon: "spell_frost_frostarmor",
      kind: "debuff",
      schools: ["frost"],
      duration: 5,
      flags: { frozen: true },
      desc: () => "Frozen in place."
    },
    winters_chill: {
      id: "winters_chill",
      name: "Winter's Chill",
      icon: "spell_frost_chillingblast",
      kind: "debuff",
      maxStacks: 5,
      duration: 15,
      sourceMods: (a) => [
        mult("damageMult", 1 + 0.2 * a.stacks, (ctx) => isAbility(ctx, "cone_of_cold")),
        mult("spellPower", 1 + 0.07 * a.stacks, (ctx) => isAbility(ctx, "cone_of_cold"))
      ],
      desc: (a) => `Your next Cone of Cold deals ${20 * a.stacks}% more damage and gains ${7 * a.stacks}% more spell damage.`
    }
  };

  // src/classes/mage/presets.js
  var gearPresets = [
    { id: "fresh", name: "Fresh 60", blurb: "Quest and dungeon greens and blues.", gear: { int: 100, spi: 45, sta: 80, sp: 120, crit: 0.01, hit: 0.01, haste: 0 } },
    { id: "preraid", name: "Pre-raid", blurb: "Best dungeon, quest and crafted gear before raids.", gear: { int: 142, spi: 4, sta: 84, sp: 375, crit: 0.04, hit: 0, haste: 0, armor: 613, spSchool: { fire: 24, frost: 40 } } }
  ];
  var builds = [
    {
      id: "arcane",
      name: "Arcane",
      points: "32/3/16",
      blurb: "Arcane Blast to build, Arcane Wrath and Arcane Missiles to spend, Arcane Power and Presence of Mind for the burst. Frost on the side: Permafrost, Frost Channeling and Improved Blizzard.",
      options: { arcaneIntellect: "true" },
      talents: {
        improved_channeling: 5,
        missile_barrage: 2,
        arcane_subtlety: 2,
        arcane_concentration: 5,
        arcane_impact: 3,
        arcane_blast: 1,
        arcane_meditation: 3,
        arcane_wrath: 1,
        presence_of_mind: 1,
        arcane_mind: 5,
        arcane_instability: 3,
        arcane_power: 1,
        incineration: 3,
        frost_warding: 2,
        precision: 3,
        improved_frost_nova: 2,
        permafrost: 3,
        frost_channeling: 3,
        improved_blizzard: 3
      },
      bar: ["arcane_blast", "arcane_missiles", "arcane_wrath", "presence_of_mind", "arcane_power", "arcane_explosion", "blizzard", "evocation", "mana_ruby", "major_mana_potion", "blink", "frost_nova"]
    },
    {
      id: "fire",
      name: "Fire",
      points: "10/38/3",
      blurb: "Fireball and Scorch, Fire Blast and Pyroblast, with Combustion and Blast Wave. Master of Elements and Critical Mass keep the crits coming; Frostfire Bolt from the trainer.",
      options: { arcaneIntellect: "true" },
      talents: {
        improved_channeling: 5,
        arcane_concentration: 5,
        improved_fire_blast: 2,
        incineration: 5,
        accelerant: 5,
        ignite: 5,
        flame_throwing: 2,
        burning_soul: 3,
        pyroblast: 1,
        improved_scorch: 3,
        heating_up: 1,
        master_of_elements: 3,
        critical_mass: 3,
        blast_wave: 1,
        fire_power: 3,
        combustion: 1,
        precision: 3
      },
      bar: ["fireball", "scorch", "fire_blast", "pyroblast", "combustion", "blast_wave", "frostfire_bolt", "flamestrike", "evocation", "mana_ruby", "major_mana_potion", "blink"]
    },
    {
      id: "frost",
      name: "Frost",
      points: "12/0/39",
      blurb: "Frostbolt and Ice Lance: Fingers of Frost and Shatter turn Ice Lance into a crit. Ice Barrier, Ice Block and Cold Snap to stay alive; Arcane Concentration for free casts.",
      options: { arcaneIntellect: "true" },
      talents: {
        improved_channeling: 5,
        arcane_subtlety: 2,
        arcane_concentration: 5,
        improved_frostbolt: 5,
        precision: 3,
        ice_shards: 5,
        frostbite: 3,
        frost_channeling: 3,
        improved_blizzard: 1,
        ice_lance: 1,
        arctic_reach: 2,
        ice_block: 1,
        shatter: 3,
        improved_cone_of_cold: 3,
        cold_snap: 1,
        fingers_of_frost: 2,
        winters_chill: 5,
        ice_barrier: 1
      },
      bar: ["frostbolt", "ice_lance", "cone_of_cold", "ice_barrier", "frost_nova", "ice_block", "cold_snap", "blizzard", "evocation", "mana_ruby", "major_mana_potion", "blink"]
    }
  ];

  // src/classes/mage/mage.js
  var nonPeriodic = (ev) => !ev.periodic && ev.ctx.caster && ev.ctx.caster.kind === "player";
  var crit = (ev) => ev.res.outcome === "crit";
  var landed2 = (ev) => ev.res.outcome !== "miss";
  var spell = (ev, ...ids) => !!ev.ctx.ability && ids.includes(ev.ctx.ability.id);
  var mage = {
    id: "mage",
    name: "Mage",
    icon: "classicon_mage",
    color: "#69ccf0",
    portrait: "achievement_character_human_male",
    // placeholder class portrait (WoW icon)
    resource: "mana",
    resourceColor: "#7fb2ff",
    source: SOURCE,
    // Level 60 Human Mage base stats (Classic). Health and mana: first 20 points give 1, then 10 per Stamina and 15 per Intellect.
    stats: {
      level: 60,
      base: { str: 34, agi: 36, sta: 50, int: 125, spi: 120 },
      baseHp: 1365,
      baseMana: 1213,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1365 + conv(a.sta, 10) - 20,
          maxMana: 1213 + conv(a.int, 15) - 20,
          crit: 2e-3 + a.int / 59.5 / 100,
          // Mage: 59.5 Intellect per 1% crit, 0.2% base
          regen: (13 + a.spi / 4) / 2
          // Mage Spirit regeneration, per second
        };
      }
    },
    trees,
    talentHistory,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities, ...extra.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras, ...extra.auras },
    gearPresets,
    builds,
    // Gear sliders in the Gear panel (pct: shown as a percent, stored as a fraction).
    gearFields: [
      { k: "int", label: "Intellect", step: 5, max: 600 },
      { k: "spi", label: "Spirit", step: 5, max: 400 },
      { k: "sp", label: "Spell power", step: 10, max: 1200 },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." }
    ],
    // Character sheet rows.
    sheet(game, f) {
      const s = game.stats();
      return [
        ["Intellect", f.int(s.int)],
        ["Spirit", f.int(s.spi)],
        ["Mana", f.int(s.maxMana)],
        ["Spell power", f.int(s.sp)],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Mana regen", `${(s.regen * 5).toFixed(0)} per 5 sec (${Math.round(Math.min(1, applyMods(game, "regenWhileCasting", 0, { caster: game.player })) * 100)}% while casting)`]
      ];
    },
    // Loadout options shown in the Stats panel.
    options: {
      arcaneIntellect: { label: "Arcane Intellect", type: "toggle", default: true }
    },
    onReset(game) {
      const o = game.loadout.options || {};
      game.applyPermanent(game.player, "mage_armor");
      if (o.arcaneIntellect !== false) game.applyPermanent(game.player, "arcane_intellect");
    },
    // Baseline rules, no talent needed.
    listen(game, on) {
      const p = () => game.player;
      on("spell:resolved", ({ ability }) => {
        if (ability.id === "arcane_blast") applyAura(game, p(), auras.arcane_blast, { source: p() });
      });
      on("cast:success", ({ ability }) => {
        const a = findAura(p(), "presence_of_mind");
        if (a && (ability.castTime || 0) > 0 && ability.kind !== "item") removeAura(game, a, "consumed");
      });
      on("channel:end", ({ ability }) => {
        if (ability.id === "evocation") {
          const a = findAura(p(), "evocation");
          if (a) removeAura(game, a, "ended");
        }
      });
    },
    talents: {
      /* ---------- Arcane ---------- */
      improved_channeling: { mods: (r) => [focus(0.2 * r, (ctx) => isAbility(ctx, "arcane_missiles")), focus(0.14 * r, (ctx) => isAbility(ctx, "arcane_blast", "arcane_wrath"))] },
      arcane_subtlety: { mods: (r) => [mult("threatMult", 1 - 0.15 * r, (ctx) => hasSchool(ctx, "arcane"))] },
      arcane_resilience: { mods: (r) => [{ key: "armor", fn: (v, ctx) => v + (ctx.attrs ? ctx.attrs.int * 0.25 * r : 0) }] },
      burning_soul: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r], (ctx) => hasSchool(ctx, "fire")), mult("threatMult", 1 - 0.1 * r, (ctx) => hasSchool(ctx, "fire"))] },
      missile_barrage: {
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if (ability.id === "arcane_missiles") {
              const a = findAura(game.player, "missile_barrage");
              if (a) {
                ctx.barrage = true;
                removeAura(game, a, "consumed");
              }
              return;
            }
            const chance = ability.id === "arcane_blast" ? 0.2 * r : ["arcane_wrath", "fireball", "frostbolt", "frostfire_bolt"].includes(ability.id) ? 0.1 * r : 0;
            if (chance && game.rng() < chance) applyAura(game, game.player, auras.missile_barrage, { source: game.player });
          });
        },
        mods: () => [mult("channelDuration", 0.5, (ctx) => isAbility(ctx, "arcane_missiles") && ctx.barrage)]
      },
      arcane_concentration: {
        listen(game, r, on) {
          const rolled = /* @__PURE__ */ new Set();
          on("cast:success", ({ ability, ctx }) => {
            const a = findAura(game.player, "clearcasting");
            if (a && ability.harmful && a.applied < game.time && !ctx.barrage) removeAura(game, a, "consumed");
          });
          on("damage", (ev) => {
            if (!nonPeriodic(ev) || !landed2(ev) || !ev.ctx.ability || !ev.ctx.ability.harmful || rolled.has(ev.ctx.castId)) return;
            rolled.add(ev.ctx.castId);
            if (game.rng() < 0.02 * r) applyAura(game, game.player, auras.clearcasting, { source: game.player });
          });
        }
      },
      arcane_geometry: { mods: (r) => [add("range", 3 * r, (ctx) => hasSchool(ctx, "arcane"))] },
      arcane_impact: { mods: (r) => [add("critChance", 0.02 * r, (ctx) => hasSchool(ctx, "arcane"))] },
      arcane_blast: { teaches: "arcane_blast" },
      arcane_meditation: { mods: (r) => [add("regenWhileCasting", [0.17, 0.33, 0.5][r - 1])] },
      arcane_wrath: { teaches: "arcane_wrath" },
      presence_of_mind: { teaches: "presence_of_mind" },
      arcane_mind: {
        mods: (r) => [
          { key: "attributes", fn: (a) => ({ ...a, int: a.int * (1 + 0.02 * r) }) },
          mult("critBonusMult", 1 + 0.2 * r, (ctx) => hasSchool(ctx, "arcane"))
        ]
      },
      arcane_instability: { mods: (r) => [mult("damageMult", 1 + 0.01 * r), add("critChance", 0.01 * r)] },
      arcane_power: { teaches: "arcane_power" },
      /* ---------- Fire ---------- */
      improved_fire_blast: { mods: (r) => [add("cooldown", -r, (ctx) => isAbility(ctx, "fire_blast")), add("range", [8, 15][r - 1], (ctx) => isAbility(ctx, "fire_blast"))] },
      incineration: { mods: (r) => [add("critChance", 0.02 * r, (ctx) => isAbility(ctx, "fire_blast", "ice_lance", "arcane_blast", "scorch"))] },
      accelerant: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "fireball", "frostfire_bolt", "arcane_wrath"))] },
      // was Improved Fireball (1.60.1.70685 adds Arcane Wrath)
      ignite: {
        listen(game, r, on) {
          on("damage", (ev) => {
            const fsTick = ev.periodic && ev.ctx.caster === game.player && isAbility(ev.ctx, "flamestrike");
            if (!nonPeriodic(ev) && !fsTick || !crit(ev) || !hasSchool(ev.ctx, "fire")) return;
            const t = ev.ctx.target, p = game.player, old = findAura(t, "ignite", p);
            let pool = ev.res.amount * 0.08 * r;
            if (old) pool += (old.data.perTick || 0) * Math.max(0, Math.round((old.expires - game.time) / 2));
            applyAura(game, t, auras.ignite, { source: p, data: { perTick: pool / 2 } });
          });
        }
      },
      flame_throwing: { mods: (r) => [add("range", 3 * r, (ctx) => hasSchool(ctx, "fire"))] },
      improved_flamestrike: { mods: (r) => [add("critChance", 0.05 * r, (ctx) => isAbility(ctx, "flamestrike"))] },
      pyroblast: { teaches: "pyroblast" },
      improved_scorch: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!nonPeriodic(ev) || !landed2(ev) || !spell(ev, "scorch")) return;
            if (game.rng() < [0.33, 0.67, 1][r - 1]) applyAura(game, ev.ctx.target, auras.fire_vulnerability, { source: game.player });
          });
        }
      },
      heating_up: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!nonPeriodic(ev) || !landed2(ev)) return;
            let stacks = 0;
            if (crit(ev) && spell(ev, "fireball", "frostfire_bolt", "fire_blast", "scorch")) stacks++;
            if (spell(ev, "fire_blast") && ev.res.amount > 0) stacks++;
            if (stacks) applyAura(game, game.player, auras.heating_up, { source: game.player, stacks });
          });
          on("cast:success", ({ ability }) => {
            if (ability.id === "pyroblast") {
              const a = findAura(game.player, "heating_up");
              if (a) removeAura(game, a, "consumed");
            }
          });
        }
      },
      master_of_elements: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!nonPeriodic(ev) || !crit(ev) || !(hasSchool(ev.ctx, "fire") || hasSchool(ev.ctx, "frost"))) return;
            const refund = Math.round((ev.ctx.baseCost || 0) * 0.1 * r);
            if (refund > 0) game.resource.gain(game, game.player, refund);
          });
        }
      },
      critical_mass: { mods: (r) => [add("critChance", 0.02 * r, (ctx) => hasSchool(ctx, "fire"))] },
      blast_wave: { teaches: "blast_wave" },
      fire_power: {
        mods: (r) => [{
          key: "damageMult",
          fn: (v, ctx, g) => {
            if (!hasSchool(ctx, "fire") || ctx.schools.length > 1 || !ctx.target) return v;
            const effects = ctx.target.auras.filter((a) => a.source === g.player && a.def.schools && a.def.schools.length === 1 && a.def.schools[0] === "fire").length;
            return v * (1 + 0.01 * r * Math.min(4, effects));
          }
        }]
      },
      combustion: {
        teaches: "combustion",
        listen(game, r, on) {
          on("damage", (ev) => {
            const a = findAura(game.player, "combustion");
            if (!a || !nonPeriodic(ev) || !landed2(ev) || !hasSchool(ev.ctx, "fire")) return;
            a.stacks++;
            if (crit(ev)) {
              a.data.crits = (a.data.crits || 0) + 1;
              if (a.data.crits >= 3) removeAura(game, a, "consumed");
            }
          });
        }
      },
      /* ---------- Frost ---------- */
      frost_warding: { mods: () => [] },
      // read by Frost Armor, Ice Armor and Ice Barrier
      improved_frostbolt: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "frostbolt"))] },
      precision: { mods: (r) => [add("hitChance", 0.02 * r, (ctx) => !ctx.pet && !ctx.melee && !ctx.ranged)] },
      // was Elemental Precision: all spells since 1.60.1.70685
      ice_shards: { mods: (r) => [mult("critBonusMult", 1 + 0.2 * r, (ctx) => hasSchool(ctx, "frost"))] },
      frostbite: {
        listen(game, r, on) {
          on("aura:apply", ({ aura: aura2 }) => {
            if (aura2.def.chill && aura2.source === game.player && game.rng() < 0.05 * r) applyAura(game, aura2.unit, auras.frostbite, { source: game.player });
          });
        }
      },
      improved_frost_nova: { mods: (r) => [add("cooldown", -2 * r, (ctx) => isAbility(ctx, "frost_nova"))] },
      permafrost: { mods: (r) => [mult("auraDuration", 1 + 0.11 * r, (ctx) => !!ctx.aura && !!ctx.aura.chill)] },
      frost_channeling: { mods: (r) => [mult("cost", 1 - 0.05 * r, (ctx) => hasSchool(ctx, "frost"))] },
      improved_blizzard: { listen() {
      } },
      // its Chill is on Blizzard's tick (abilities.js) and feeds Frostbite and Fingers of Frost
      ice_lance: {
        teaches: "ice_lance",
        mods: () => [mult("damageMult", 4, (ctx) => isAbility(ctx, "ice_lance") && ctx.frozen)]
        // 300% more against Frozen targets
      },
      arctic_reach: {
        mods: (r) => [
          mult("range", 1 + 0.1 * r, (ctx) => isAbility(ctx, "frostbolt", "ice_lance", "blizzard")),
          mult("radius", 1 + 0.1 * r, (ctx) => isAbility(ctx, "frost_nova", "cone_of_cold"))
        ]
      },
      ice_block: { teaches: "ice_block" },
      shatter: { mods: (r) => [add("critChance", [0.17, 0.33, 0.5][r - 1], (ctx) => !!ctx.frozen)] },
      improved_cone_of_cold: { mods: (r) => [mult("damageMult", 1 + [0.12, 0.23, 0.35][r - 1], (ctx) => isAbility(ctx, "cone_of_cold"))] },
      cold_snap: { teaches: "cold_snap" },
      fingers_of_frost: {
        listen(game, r, on) {
          on("aura:apply", ({ aura: aura2, fresh }) => {
            if (aura2.def.chill && aura2.source === game.player && game.rng() < 0.15) applyAura(game, game.player, auras.fingers_of_frost, { source: game.player, charges: r });
          });
          on("cast:success", ({ ability, ctx }) => {
            const a = findAura(game.player, "fingers_of_frost");
            if (a && ability.harmful) {
              ctx.fof = true;
              useCharge(game, a);
            }
          });
        },
        // A channel (Blizzard) gets it on its first tick only (ctx.tick counts from 1).
        mods: () => [{ key: "treatAsFrozen", fn: (v, ctx) => v || !!ctx.fof && !(ctx.tick > 1) }]
      },
      winters_chill: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!nonPeriodic(ev) || !landed2(ev)) return;
            const ok = spell(ev, "frostbolt") || spell(ev, "ice_lance") && ev.ctx.fof;
            if (ok && game.rng() < 0.2 * r) applyAura(game, ev.ctx.target, auras.winters_chill, { source: game.player });
          });
          on("spell:resolved", ({ ability, ctx }) => {
            if (ability.id !== "cone_of_cold") return;
            for (const { target } of ctx.results || []) {
              const a = findAura(target, "winters_chill", game.player);
              if (a) removeAura(game, a, "consumed");
            }
          });
        }
      },
      ice_barrier: { teaches: "ice_barrier" }
    }
  };

  // src/classes/rogue/talent-data.js
  var SOURCE2 = { site: "foreverchanges.pro/talents/rogue", build: "1.60.1.70790", extracted: "2026-11-05" };
  var per = (values, fn) => values.map(fn);
  var hackAndSlash = (n) => `Gives your melee weapon attacks a benefit depending on the weapon.
Axe/Sword: Your successful melee attacks have a ${n}% chance to trigger an extra attack on the target.
Dagger/Fist: Increases your critical strike chance by ${n}%.
Mace: Your attacks ignore ${3 * n}% of your target's armor.`;
  var trees2 = [
    {
      id: "assassination",
      name: "Assassination",
      icon: "ability_rogue_eviscerate",
      talents: [
        { id: "improved_gouge", name: "Improved Gouge", icon: "ability_gouge", tier: 0, col: 0, max: 3, ranks: per([0.5, 1, 1.5], (n) => `Increases the duration of your Gouge ability by ${n} sec.`) },
        { id: "remorseless_attacks", name: "Remorseless Attacks", icon: "ability_fiegndead", tier: 0, col: 1, max: 2, ranks: per([20, 40], (n) => `After killing a non-trivial enemy, gives you a ${n}% increased critical strike chance on your next Sinister Strike, Backstab, Ambush, Mutilate, or Ghostly Strike. Lasts 20 sec.`) },
        { id: "malice", name: "Malice", icon: "ability_racial_bloodrage", tier: 0, col: 2, max: 5, ranks: per([1, 2, 3, 4, 5], (n) => `Increases your critical strike chance with all attacks and Poisons by ${n}%.`) },
        { id: "ruthlessness", name: "Ruthlessness", icon: "ability_druid_disembowel", tier: 1, col: 0, max: 3, ranks: per([20, 40, 60], (n) => `Gives your finishing moves a ${n}% chance to add a Combo Point to your target.`) },
        { id: "improved_expose_armor", name: "Improved Expose Armor", icon: "ability_warrior_riposte", tier: 1, col: 1, max: 2, ranks: per([[5, 1], [10, 2]], ([a, b]) => `Reduces the Energy cost of your Expose Armor ability by ${a}, and refunds ${b} Combo Points when cast with 5 Combo Points.`) },
        { id: "improved_slice_and_dice", name: "Improved Slice and Dice", icon: "ability_rogue_slicedice", tier: 1, col: 3, max: 3, ranks: per([15, 30, 45], (n) => `Increases the duration of your Slice and Dice ability by ${n}%.`) },
        { id: "vigor", name: "Vigor", icon: "spell_nature_earthbindtotem", tier: 2, col: 0, max: 2, ranks: per([5, 10], (n) => `Increases your maximum Energy by ${n}.`) },
        { id: "blood_splatter", name: "Blood Splatter", icon: "ability_rogue_bloodsplatter", tier: 2, col: 1, max: 1, ranks: ["Increases the duration of your Rupture ability by 6 sec and your Garrote ability by 9 sec."] },
        { id: "lethality", name: "Lethality", icon: "ability_criticalstrike", tier: 2, col: 2, max: 2, req: "malice", ranks: ["Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 10%.", "Increases the critical strike damage bonus of your Sinister Strike, Gouge, Backstab, Mutilate, Ghostly Strike, and Hemorrhage abilities by 20%."] },
        { id: "vile_poisons", name: "Vile Poisons", icon: "ability_rogue_feigndeath", tier: 3, col: 0, max: 5, ranks: per([[4, 8], [8, 16], [12, 24], [16, 32], [20, 40]], ([a, b]) => `Increases the damage dealt by your poisons by ${a}% and gives your poisons an additional ${b}% chance to resist dispel effects.`) },
        { id: "cold_blood", name: "Cold Blood", icon: "spell_ice_lament", tier: 3, col: 1, max: 1, active: true, ranks: ["When activated, increases the critical strike chance of your next Sinister Strike, Backstab, Ambush, Eviscerate, or Mutilate by 100%. 3 min cooldown."] },
        { id: "improved_poisons", name: "Improved Poisons", icon: "ability_poisons", tier: 3, col: 2, max: 5, ranks: per([[2, 10], [4, 20], [6, 30], [8, 40], [10, 50]], ([a, b]) => `Increases the chance to apply Poisons to your target by ${a}%, and gives Poison applications a ${b}% chance to not consume a charge.`) },
        { id: "relentless_strikes", name: "Relentless Strikes", icon: "ability_warrior_decisivestrike", tier: 4, col: 0, max: 5, ranks: ["Your finishing moves have a 4% chance per Combo Point to restore 25 Energy.", "Your finishing moves have a 8% chance per Combo Point to restore 25 Energy.", "Your finishing moves have a 12% chance per Combo Point to restore 25 Energy.", "Your finishing moves have a 16% chance per Combo Point to restore 25 Energy.", "Your finishing moves have a 20% chance per Combo Point to restore 25 Energy."] },
        { id: "venom", name: "Venom", icon: "inv_sword_31", tier: 4, col: 1, max: 1, ranks: ["Causes your Shank ability to increase your Poison damage by 30% and your chance to apply Poisons by 20% for 6 sec."] },
        { id: "improved_kidney_shot", name: "Improved Kidney Shot", icon: "ability_rogue_kidneyshot", tier: 4, col: 2, max: 2, ranks: per([5, 10], (n) => `Enemies Stunned by your Kidney Shot ability take ${n}% increased damage from your poisons and attacks.`) },
        { id: "seal_fate", name: "Seal Fate", icon: "spell_shadow_chilltouch", tier: 5, col: 2, max: 3, ranks: ["Your critical strikes from abilities that add Combo Points have a 33% chance to add an additional Combo Point.", "Your critical strikes from abilities that add Combo Points have a 66% chance to add an additional Combo Point.", "Your critical strikes from abilities that add Combo Points have a 100% chance to add an additional Combo Point."] },
        { id: "mutilate", name: "Mutilate", icon: "ability_rogue_deadlybrew", tier: 6, col: 1, max: 1, req: "venom", active: true, ranks: ["Teaches Mutilate: instantly attacks with both weapons for 90% weapon damage plus an additional amount with each weapon. Damage increased by 20% against Poisoned targets. Awards 2 Combo Points. Requires Daggers."] }
      ]
    },
    {
      id: "combat",
      name: "Combat",
      icon: "ability_backstab",
      talents: [
        { id: "coup_de_grace", name: "Coup de Grace", icon: "ability_rogue_eviscerate", tier: 0, col: 0, max: 3, ranks: ["Increases the damage done by your Eviscerate ability by 7%, and the damage and storage rate of your Death Mark ability by 7%.", "Increases the damage done by your Eviscerate ability by 13%, and the damage and storage rate of your Death Mark ability by 13%.", "Increases the damage done by your Eviscerate ability by 20%, and the damage and storage rate of your Death Mark ability by 20%."] },
        { id: "efficient_strikes", name: "Efficient Strikes", icon: "spell_shadow_ritualofsacrifice", tier: 0, col: 1, max: 2, ranks: ["Reduces the Energy cost of your Sinister Strike and Hemorrhage abilities by 3.", "Reduces the Energy cost of your Sinister Strike and Hemorrhage abilities by 5."] },
        { id: "lightning_reflexes", name: "Lightning Reflexes", icon: "spell_nature_invisibilty", tier: 0, col: 2, max: 5, ranks: per([1, 2, 3, 4, 5], (n) => `Increases your Dodge chance by ${n}%.`) },
        { id: "puncturing_wounds", name: "Puncturing Wounds", icon: "ability_backstab", tier: 1, col: 0, max: 3, ranks: per([[10, 5, 15], [20, 10, 30], [30, 15, 45]], ([a, b, c]) => `Increases the critical strike chance of your Backstab by ${a}% and your Mutilate by ${b}%, and gives Backstab a ${c}% chance to add an additional Combo Point.`) },
        { id: "deflection", name: "Deflection", icon: "ability_parry", tier: 1, col: 1, max: 3, ranks: per([2, 4, 6], (n) => `Increases your Parry chance by ${n}%.`) },
        { id: "precision", name: "Precision", icon: "ability_marksmanship", tier: 1, col: 2, max: 3, ranks: per([1, 2, 3], (n) => `Improves your chance to hit by ${n}%.`) },
        { id: "improved_sprint", name: "Improved Sprint", icon: "ability_rogue_sprint", tier: 1, col: 3, max: 2, ranks: per([50, 100], (n) => `Gives a ${n}% chance to remove all movement impairing effects when you activate your Sprint ability.`) },
        { id: "endurance", name: "Endurance", icon: "spell_shadow_shadowward", tier: 2, col: 0, max: 2, ranks: per([30, 60], (n) => `Reduces the cooldown of your Sprint and Evasion abilities by ${n}%.`) },
        { id: "riposte", name: "Riposte", icon: "ability_warrior_challange", tier: 2, col: 1, max: 1, req: "deflection", active: true, ranks: ["A strike that becomes active after parrying an opponent's attack. This attack deals 150% weapon damage and disarms the target for 6 sec. 10 Energy, 6 sec cooldown."] },
        { id: "composure", name: "Composure", icon: "ability_rogue_quickrecovery", tier: 2, col: 3, max: 2, ranks: ["Increases the Energy cost reduction of your Poised ability by 5.", "Increases the Energy cost reduction of your Poised ability by 10."] },
        { id: "improved_kick", name: "Improved Kick", icon: "ability_kick", tier: 3, col: 0, max: 2, ranks: per([50, 100], (n) => `Gives your Kick ability a ${n}% chance to Silence the target for 2 sec.`) },
        { id: "flawless_execution", name: "Flawless Execution", icon: "inv_sword_35", tier: 3, col: 1, max: 1, ranks: ["Reduces the Energy cost of your Eviscerate ability by 15."] },
        { id: "weapon_expertise", name: "Weapon Expertise", icon: "spell_holy_blessingofstrength", tier: 3, col: 2, max: 2, req: "precision", ranks: per([1, 2], (n) => `Reduces the chance for your attacks to be Dodged or Parried by ${n}%.`) },
        { id: "aggression", name: "Aggression", icon: "ability_racial_avatar", tier: 3, col: 3, max: 3, ranks: ["Increases the damage of your Sinister Strike and Eviscerate abilities by 5%.", "Increases the damage of your Sinister Strike and Eviscerate abilities by 10%.", "Increases the damage of your Sinister Strike and Eviscerate abilities by 15%."] },
        { id: "dual_wield_specialization", name: "Dual Wield Specialization", icon: "ability_dualwield", tier: 4, col: 0, max: 2, ranks: ["Increases the damage done by your off-hand weapon by 25%.", "Increases the damage done by your off-hand weapon by 50%."] },
        { id: "blade_flurry", name: "Blade Flurry", icon: "ability_warrior_punishingblow", tier: 4, col: 1, max: 1, active: true, ranks: ["Increases your melee attack speed by 20% and your melee attacks strike an additional nearby opponent. Lasts 15 sec. 25 Energy, 2 min cooldown."] },
        { id: "hack_and_slash", name: "Hack and Slash", icon: "inv_sword_27", tier: 4, col: 2, max: 5, ranks: per([1, 2, 3, 4, 5], hackAndSlash) },
        { id: "flash_of_steel", name: "Flash of Steel", icon: "ability_rogue_focusedattacks", tier: 5, col: 2, max: 5, ranks: ["Increases the Energy generated by your Shank ability by 3 and reduces its cooldown by 0.4 sec.", "Increases the Energy generated by your Shank ability by 6 and reduces its cooldown by 0.8 sec.", "Increases the Energy generated by your Shank ability by 9 and reduces its cooldown by 1.2 sec.", "Increases the Energy generated by your Shank ability by 12 and reduces its cooldown by 1.6 sec.", "Increases the Energy generated by your Shank ability by 15 and reduces its cooldown by 2.0 sec."] },
        { id: "adrenaline_rush", name: "Adrenaline Rush", icon: "spell_shadow_shadowworddominate", tier: 6, col: 1, max: 1, req: "blade_flurry", active: true, ranks: ["Increases your Energy regeneration rate by 100% for 15 sec. 5 min cooldown."] }
      ]
    },
    {
      id: "subtlety",
      name: "Subtlety",
      icon: "ability_stealth",
      talents: [
        { id: "setup", name: "Setup", icon: "spell_nature_mirrorimage", tier: 0, col: 0, max: 3, ranks: ["Gives you a 15% chance to add a Combo Point to your target after Dodging their attack or fully resisting one of their spells.", "Gives you a 30% chance to add a Combo Point to your target after Dodging their attack or fully resisting one of their spells.", "Gives you a 45% chance to add a Combo Point to your target after Dodging their attack or fully resisting one of their spells."] },
        { id: "master_of_deception", name: "Master of Deception", icon: "spell_shadow_charm", tier: 0, col: 1, max: 3, ranks: per([1, 2, 3], (n) => `Reduces the chance enemies have to detect you while in Stealth mode as if you were ${n} level${n > 1 ? "s" : ""} higher.`) },
        { id: "opportunity", name: "Opportunity", icon: "ability_warrior_warcry", tier: 0, col: 2, max: 5, ranks: ["Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by 4%.", "Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by 8%.", "Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by 12%.", "Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by 16%.", "Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by 20%."] },
        { id: "dirty_deeds", name: "Dirty Deeds", icon: "spell_shadow_summonsuccubus", tier: 1, col: 0, max: 2, ranks: per([10, 20], (n) => `Reduces the Energy cost of your Cheap Shot and Garrote abilities by ${n}, and your Garrote ability no longer requires you to be behind your target.`) },
        { id: "camouflage", name: "Camouflage", icon: "ability_stealth", tier: 1, col: 1, max: 3, ranks: ["Reduces your speed penalty from your Stealth ability by 5% and reduces its cooldown by 2 sec.", "Reduces your speed penalty from your Stealth ability by 10% and reduces its cooldown by 4 sec.", "Reduces your speed penalty from your Stealth ability by 15% and reduces its cooldown by 6 sec."] },
        { id: "improved_ambush", name: "Improved Ambush", icon: "ability_rogue_ambush", tier: 1, col: 2, max: 3, ranks: per([15, 30, 45], (n) => `Increases the critical strike chance of your Ambush ability by ${n}%.`) },
        { id: "dirty_tricks", name: "Dirty Tricks", icon: "ability_sap", tier: 1, col: 3, max: 2, ranks: per([25, 50], (n) => `Reduces the Energy cost of your Sap and Blind abilities by ${n}%.`) },
        { id: "initiative", name: "Initiative", icon: "spell_shadow_fumble", tier: 2, col: 0, max: 3, ranks: per([33, 67, 100], (n) => `Gives you a ${n}% chance to add an additional combo point to your target when using your Ambush, Garrote, or Cheap Shot ability.`) },
        { id: "premeditation", name: "Premeditation", icon: "spell_shadow_possession", tier: 2, col: 1, max: 1, active: true, ranks: ["Teaches Premeditation: adds 2 Combo Points to your target. You must add to or use those combo points within 20 sec or the combo points are lost. Must be stealthed. 2 min cooldown."] },
        { id: "serrated_blades", name: "Serrated Blades", icon: "inv_sword_17", tier: 2, col: 2, max: 3, ranks: per([[3, 10], [6, 20], [9, 30]], ([a, b]) => `Causes your attacks to ignore ${a}% of your target's Armor and increases the damage dealt by your Rupture ability by ${b}%.`) },
        { id: "elusiveness", name: "Elusiveness", icon: "spell_magic_lesserinvisibilty", tier: 3, col: 0, max: 2, ranks: per([45, 90], (n) => `Reduces the cooldown of your Vanish and Blind abilities by ${n} sec.`) },
        { id: "ghostly_strike", name: "Ghostly Strike", icon: "spell_shadow_curse", tier: 3, col: 1, max: 1, active: true, ranks: ["Teaches Ghostly Strike: a strike that deals 125% (180% if a Dagger is equipped in your Main Hand) weapon damage and increases your chance to dodge by 15% for 7 sec. Your next Ambush or Garrote within 7 sec does not require Stealth. Awards 1 combo point. 40 Energy, 20 sec cooldown."] },
        { id: "quick_getaway", name: "Quick Getaway", icon: "ability_rogue_blackjack", tier: 3, col: 3, max: 2, req: "dirty_tricks", ranks: ["Increases the maximum number of targets you may have Sapped by 1, and increases your movement speed by 15% for 3 sec after Sapping a target.", "Increases the maximum number of targets you may have Sapped by 1, and increases your movement speed by 30% for 3 sec after Sapping a target."] },
        { id: "heightened_senses", name: "Heightened Senses", icon: "ability_ambush", tier: 4, col: 0, max: 2, ranks: per([[1, 2], [3, 4]], ([a, b]) => `Increases your Stealth detection as if you were ${a} level${a > 1 ? "s" : ""} higher and reduces your chance to be hit by spells and ranged attacks by ${b}%.`) },
        { id: "preparation", name: "Preparation", icon: "spell_shadow_antishadow", tier: 4, col: 1, max: 1, active: true, ranks: ["When activated, this ability immediately finishes the cooldown on your other Rogue abilities. 10 min cooldown."] },
        { id: "hemorrhage", name: "Hemorrhage", icon: "spell_shadow_lifedrain", tier: 4, col: 2, max: 1, req: "serrated_blades", active: true, ranks: ["Teaches Hemorrhage: an instant strike that deals 100% weapon damage (145% if a Dagger is equipped) and causes the target to take 15% increased Rupture and Garrote damage from the Rogue. Lasts 15 sec. Awards 1 Combo Point. 35 Energy."] },
        { id: "boot_knife", name: "Boot Knife", icon: "inv_sword_32", tier: 5, col: 2, max: 5, ranks: ["Grants your Shank ability a 20% chance to add 2 Combo Points to the target.", "Grants your Shank ability a 40% chance to add 2 Combo Points to the target.", "Grants your Shank ability a 60% chance to add 2 Combo Points to the target.", "Grants your Shank ability a 80% chance to add 2 Combo Points to the target.", "Grants your Shank ability a 100% chance to add 2 Combo Points to the target."] },
        { id: "death_mark", name: "Death Mark", icon: "ability_rogue_slaughterfromtheshadows", tier: 6, col: 1, max: 1, req: "preparation", active: true, ranks: ["Finishing move that marks the target, storing a portion of the damage dealt by your attacks per Combo Point. Garrote and Rupture damage is stored at twice the rate. After 6 sec, the stored damage is dealt, up to a maximum increased by Attack Power and Critical Strike chance."] }
      ]
    }
  ];

  // src/classes/rogue/talent-history.js
  var talentHistory2 = [
    {
      // 1.60.1.70753 (November 3): trees remade from Blizzard's launch notes. Improved Eviscerate became Coup de Grace
      // and Improved Sinister Strike became Efficient Strikes; Murder, Improved Distract, Quietus, Cutthroat and Thousand Cuts left; Blood Splatter, Composure,
      // Flash of Steel, Quick Getaway, Boot Knife and Death Mark came in, and most talents moved or changed ranks.
      until: "1.60.1.70753",
      date: "November 3",
      order: [
        ["improved_gouge", "remorseless_attacks", "malice", "ruthlessness", "murder", "improved_slice_and_dice", "relentless_strikes", "improved_expose_armor", "lethality", "vile_poisons", "cold_blood", "improved_poisons", "vigor", "mutilate", "improved_kidney_shot", "seal_fate", "venom"],
        ["improved_eviscerate", "improved_sinister_strike", "lightning_reflexes", "puncturing_wounds", "deflection", "precision", "endurance", "riposte", "improved_sprint", "improved_kick", "flawless_execution", "dual_wield_specialization", "blade_flurry", "hack_and_slash", "weapon_expertise", "aggression", "adrenaline_rush"],
        ["camouflage", "master_of_deception", "opportunity", "setup", "elusiveness", "dirty_tricks", "improved_ambush", "initiative", "ghostly_strike", "improved_distract", "heightened_senses", "premeditation", "serrated_blades", "dirty_deeds", "preparation", "hemorrhage", "quietus", "cutthroat", "thousand_cuts"]
      ],
      renamed: { improved_eviscerate: "coup_de_grace", improved_sinister_strike: "efficient_strikes" },
      removed: { murder: "Murder", improved_distract: "Improved Distract", quietus: "Quietus", cutthroat: "Cutthroat", thousand_cuts: "Thousand Cuts" },
      names: { improved_eviscerate: "Improved Eviscerate", improved_sinister_strike: "Improved Sinister Strike" }
    },
    {
      // 1.60.1.70790 (November 4, the launch client): ten talents moved to other columns than ForeverChanges had
      // guessed from the notes (Composure, Weapon Expertise, Aggression, Flash of Steel, Dirty Deeds, Camouflage, Improved
      // Ambush, Dirty Tricks, Quick Getaway, Boot Knife), and Mutilate, Adrenaline Rush and Death Mark have prerequisites.
      until: "1.60.1.70790",
      date: "November 4",
      order: [
        ["improved_gouge", "remorseless_attacks", "malice", "ruthlessness", "improved_expose_armor", "improved_slice_and_dice", "vigor", "blood_splatter", "lethality", "vile_poisons", "cold_blood", "improved_poisons", "relentless_strikes", "venom", "improved_kidney_shot", "seal_fate", "mutilate"],
        ["coup_de_grace", "efficient_strikes", "lightning_reflexes", "puncturing_wounds", "deflection", "precision", "improved_sprint", "endurance", "riposte", "composure", "improved_kick", "flawless_execution", "aggression", "weapon_expertise", "dual_wield_specialization", "blade_flurry", "hack_and_slash", "flash_of_steel", "adrenaline_rush"],
        ["setup", "master_of_deception", "opportunity", "camouflage", "dirty_deeds", "dirty_tricks", "improved_ambush", "initiative", "premeditation", "serrated_blades", "elusiveness", "ghostly_strike", "quick_getaway", "heightened_senses", "preparation", "hemorrhage", "boot_knife", "death_mark"]
      ],
      renamed: {},
      removed: {},
      names: {}
    }
  ];

  // src/classes/rogue/spellbook-data.js
  var SPELLBOOK2 = [
    ["Gouge", "ability_gouge", "combat", 45, "m", 0, 10, 0, "Causes 75 damage, stops your attack, and incapacitates the target for 4 sec. The target must be facing you. Any damage taken will break the effect. Awards 1 combo points. Requires Melee Weapon"],
    ["Evasion", "spell_shadow_shadowward", "combat", 0, 0, 0, 300, 0, "The rogue's dodge chance will increase by 50% for 15 sec."],
    ["Sprint", "ability_rogue_sprint", "combat", 0, 0, 0, 300, 0, "Increases the rogue's movement speed by 70% for 15 sec. Does not break stealth."],
    ["Kick", "ability_kick", "combat", 25, "m", 0, 10, 0, "A quick kick that injures a single foe for 80 damage. It also interrupts spellcasting and prevents any spell in that school from being cast for 5 sec."],
    ["Feint", "ability_rogue_feint", "combat", 20, "m", 0, 10, 0, "Performs a feint, causing no damage but lowering your threat by a large amount, making the enemy less likely to attack you."],
    ["Riposte", "ability_warrior_challange", "combat", 10, "m", 0, 6, 1, "A strike that becomes active after parrying an opponent's attack. This attack deals 150% weapon damage and disarms the target for 6 sec."],
    ["Sap", "ability_sap", "subtlety", 65, "m", 0, 0, 0, "Incapacitates the target for up to 45 sec. Only works on Humanoids that are not in combat. Any damage taken will break the effect. Only 1 target may be sapped at a time. Does not break Stealth. Requires Melee Weapon Requires Stealth"],
    ["Distract", "ability_rogue_distract", "subtlety", 30, 30, 0, 30, 0, "Throws a distraction, attracting the attention of all nearby enemies and reducing their Stealth detection as if they were 1 level lower for 10 seconds. Does not break stealth."],
    ["Blind", "spell_shadow_mindsteal", "subtlety", 30, 10, 0, 300, 0, "Blinds the target, causing it to wander disoriented for up to 10 sec. Any damage caused will remove the effect."]
  ];

  // src/classes/rogue/abilities.js
  var melee = { range: "melee", target: "enemy", harmful: true, schools: ["physical"] };
  var builder = (n) => ({ type: "addCombo", n });
  var daggerPct = (dagger, other) => (g, ctx) => ({ weaponPct: g.cls.weapons(g).main.type === "dagger" ? dagger : other });
  var byCombo = (ctx, list) => list[Math.max(1, Math.min(5, ctx.combo)) - 1];
  var EVISCERATE = [[224, 332], [394, 502], [564, 672], [734, 842], [904, 1012]];
  var RUPTURE = [[159, 4, 0.04], [222, 5, 0.1], [295, 6, 0.18], [377, 7, 0.21], [469, 8, 0.24]];
  var DEATH_MARK = { rate: 0.12, duration: 6, cap: (cp2) => 156 + 245 * cp2, capAp: 0.04 };
  var finisherSecs = (ctx) => 9 + 3 * (Math.max(1, ctx.combo) - 1);
  var abilities2 = [
    /* ---------- builders ---------- */
    {
      id: "sinister_strike",
      name: "Sinister Strike",
      icon: "spell_shadow_ritualofsacrifice",
      tree: "combat",
      ...melee,
      cost: 45,
      builder: true,
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 68, onHit: [builder(1)] }],
      text: "An instant strike that causes 68 damage in addition to your normal weapon damage. Awards 1 combo point."
    },
    {
      id: "backstab",
      name: "Backstab",
      icon: "ability_backstab",
      tree: "combat",
      ...melee,
      cost: 60,
      builder: true,
      weaponStrike: true,
      requires: { behind: true, mainHand: ["dagger"] },
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1.5, flat: 150, onHit: [builder(1)] }],
      text: "Backstab the target, causing 150% weapon damage plus 150 to the target. Must be behind the target. Requires a dagger in the main hand. Awards 1 combo point."
    },
    {
      id: "mutilate",
      name: "Mutilate",
      icon: "ability_rogue_deadlybrew",
      tree: "assassination",
      ...melee,
      cost: 60,
      builder: true,
      weaponStrike: true,
      talent: "mutilate",
      requires: { mainHand: ["dagger"] },
      usable: (g) => {
        const w = g.cls.weapons(g);
        return w.off && w.off.type === "dagger" ? null : "Requires Daggers";
      },
      effects: [{ type: "weaponDamage", hand: "both", weaponPct: 0.9, flat: 79, onHit: [builder(2)] }],
      text: "Instantly attacks with both weapons for 90% weapon damage plus an additional 79 with each weapon. Damage increased by 20% against Poisoned targets. Awards 2 Combo Points."
    },
    {
      id: "hemorrhage",
      name: "Hemorrhage",
      icon: "spell_shadow_lifedrain",
      tree: "subtlety",
      ...melee,
      cost: 35,
      builder: true,
      weaponStrike: true,
      talent: "hemorrhage",
      effects: [{ type: "weaponDamage", hand: "main", dynamic: daggerPct(1.45, 1), onHit: [{ type: "applyAura", to: "target", aura: "hemorrhage" }, builder(1)] }],
      text: "An instant strike that deals 100% weapon damage (145% if a Dagger is equipped) and causes the target to take 15% increased Rupture and Garrote damage from the Rogue. Lasts 15 sec. Awards 1 Combo Point."
    },
    {
      id: "ghostly_strike",
      name: "Ghostly Strike",
      icon: "spell_shadow_curse",
      tree: "subtlety",
      ...melee,
      cost: 40,
      cooldown: 20,
      builder: true,
      weaponStrike: true,
      talent: "ghostly_strike",
      effects: [{ type: "weaponDamage", hand: "main", dynamic: daggerPct(1.8, 1.25), onHit: [{ type: "applyAura", to: "self", aura: "ghostly_strike" }, builder(1)] }],
      text: "A strike that deals 125% (180% if a Dagger is equipped in your Main Hand) weapon damage and increases your chance to dodge by 15% for 7 sec. Your next Ambush or Garrote within 7 sec does not require Stealth. Awards 1 combo point."
    },
    {
      id: "shank",
      name: "Shank",
      icon: "ability_rogue_dualweild",
      tree: "combat",
      ...melee,
      cost: 5,
      cooldown: 10,
      weaponStrike: true,
      usable: (g) => g.cls.weapons(g).off ? null : "Requires an off-hand weapon",
      effects: [{ type: "weaponDamage", hand: "off", weaponPct: 0.5, noMiss: true, onHit: [{ type: "custom", run: (g, ctx) => g.cls.afterShank(g, ctx) }] }],
      text: "Instantly strike with your off-hand weapon, dealing 50% weapon damage and generating 25 Energy. Shank cannot miss."
    },
    /* ---------- openers (from stealth) ---------- */
    {
      id: "ambush",
      name: "Ambush",
      icon: "ability_rogue_ambush",
      tree: "assassination",
      ...melee,
      cost: 60,
      builder: true,
      weaponStrike: true,
      opener: true,
      requires: { stealth: true, behind: true, mainHand: ["dagger"] },
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 2.5, flat: 290, onHit: [builder(1)] }],
      text: "Ambush the target, causing 250% weapon damage plus 290 to the target. Must be stealthed and behind the target. Requires a dagger in the main hand. Awards 1 combo point."
    },
    {
      id: "garrote",
      name: "Garrote",
      icon: "ability_rogue_garrote",
      tree: "assassination",
      ...melee,
      cost: 50,
      builder: true,
      opener: true,
      requires: { stealth: true, behind: true },
      effects: [{ type: "meleeDamage", noDamage: true, name: "Garrote", onHit: [{ type: "applyAura", to: "target", aura: "garrote" }, builder(1)] }],
      text: "Garrote the enemy, causing 552 damage over 18 sec, increased by your Attack Power. Must be stealthed and behind the target. Awards 1 combo point."
    },
    {
      id: "cheap_shot",
      name: "Cheap Shot",
      icon: "ability_cheapshot",
      tree: "assassination",
      ...melee,
      cost: 60,
      builder: true,
      opener: true,
      requires: { stealth: true },
      effects: [{ type: "meleeDamage", noDamage: true, name: "Cheap Shot", onHit: [{ type: "applyAura", to: "target", aura: "cheap_shot" }, builder(2)] }],
      text: "Stuns the target for 4 sec. Must be stealthed. Awards 2 combo points."
    },
    /* ---------- finishers ---------- */
    {
      id: "eviscerate",
      name: "Eviscerate",
      icon: "ability_rogue_eviscerate",
      tree: "assassination",
      ...melee,
      cost: 35,
      finisher: true,
      effects: [{ type: "meleeDamage", dynamic: (g, ctx) => {
        const [min, max] = byCombo(ctx, EVISCERATE);
        return { min, max, apCoef: 0.03 * ctx.combo };
      } }],
      text: "Finishing move that causes damage per combo point, increased by Attack Power:\n1 point: 224-332 damage\n2 points: 394-502 damage\n3 points: 564-672 damage\n4 points: 734-842 damage\n5 points: 904-1012 damage"
    },
    {
      id: "slice_and_dice",
      name: "Slice and Dice",
      icon: "ability_rogue_slicedice",
      tree: "assassination",
      ...melee,
      cost: 25,
      finisher: true,
      harmful: false,
      range: void 0,
      target: "self",
      effects: [{ type: "applyAura", to: "self", aura: "slice_and_dice", dynamic: (g, ctx) => ({ duration: finisherSecs(ctx) }) }],
      text: "Finishing move that increases melee attack speed by 30%. Lasts longer per combo point:\n1 point: 9 seconds\n2 points: 12 seconds\n3 points: 15 seconds\n4 points: 18 seconds\n5 points: 21 seconds"
    },
    {
      id: "rupture",
      name: "Rupture",
      icon: "ability_rogue_rupture",
      tree: "assassination",
      ...melee,
      cost: 25,
      finisher: true,
      effects: [{ type: "meleeDamage", noDamage: true, name: "Rupture", onHit: [{
        type: "applyAura",
        to: "target",
        aura: "rupture",
        dynamic: (g, ctx) => {
          const [base, ticks, apCoef] = byCombo(ctx, RUPTURE);
          return { dot: { base, ticks, apCoef } };
        }
      }] }],
      text: "Finishing move that causes damage over time, increased by your Attack Power. Lasts longer per combo point:\n1 point: 159 damage over 8 secs\n2 points: 222 damage over 10 secs\n3 points: 295 damage over 12 secs\n4 points: 377 damage over 14 secs\n5 points: 469 damage over 16 secs"
    },
    {
      id: "expose_armor",
      name: "Expose Armor",
      icon: "ability_warrior_riposte",
      tree: "assassination",
      ...melee,
      cost: 25,
      finisher: true,
      effects: [{ type: "meleeDamage", noDamage: true, name: "Expose Armor", onHit: [{ type: "custom", run: (g, ctx) => g.cls.applyExposeArmor(g, ctx) }] }],
      text: "Finishing move that exposes the target for 30 sec, reducing Armor per combo point:\n1 point: 450 Armor\n2 points: 900 Armor\n3 points: 1350 Armor\n4 points: 1800 Armor\n5 points: 2250 Armor"
    },
    {
      id: "kidney_shot",
      name: "Kidney Shot",
      icon: "ability_rogue_kidneyshot",
      tree: "assassination",
      ...melee,
      cost: 25,
      cooldown: 20,
      finisher: true,
      effects: [{ type: "meleeDamage", noDamage: true, name: "Kidney Shot", onHit: [{ type: "applyAura", to: "target", aura: "kidney_shot", dynamic: (g, ctx) => ({ duration: 1 + ctx.combo }) }] }],
      text: "Finishing move that stuns the target. Lasts longer per combo point:\n1 point: 2 seconds\n2 points: 3 seconds\n3 points: 4 seconds\n4 points: 5 seconds\n5 points: 6 seconds"
    },
    {
      id: "death_mark",
      name: "Death Mark",
      icon: "ability_rogue_slaughterfromtheshadows",
      tree: "subtlety",
      schools: ["physical"],
      range: 20,
      target: "enemy",
      harmful: true,
      cost: 25,
      cooldown: 10,
      finisher: true,
      talent: "death_mark",
      effects: [{ type: "custom", run: (g, ctx) => g.cls.applyDeathMark(g, ctx) }],
      text: "Finishing move that marks the target, storing a portion of the damage dealt by your attacks per Combo Point. Garrote and Rupture damage is stored at twice the rate. After 6 sec, the stored damage is dealt, up to a maximum increased by Attack Power and Critical Strike chance:\n1 point: 12% stored, (401 + 4% of attack power) damage cap\n2 points: 24% stored, (646 + 8% of attack power) damage cap\n3 points: 36% stored, (891 + 12% of attack power) damage cap\n4 points: 48% stored, (1136 + 16% of attack power) damage cap\n5 points: 60% stored, (1381 + 20% of attack power) damage cap"
    },
    /* ---------- cooldowns and stealth ---------- */
    {
      id: "stealth",
      name: "Stealth",
      icon: "ability_stealth",
      tree: "subtlety",
      schools: ["physical"],
      target: "self",
      cooldown: 10,
      gcd: false,
      keepsStealth: true,
      requires: { notInCombat: true },
      cancelsAura: "stealth",
      // pressing it again leaves Stealth
      usable: (g) => g.player.auras.some((a) => a.id === "stealth") ? "You are already stealthed" : null,
      effects: [{ type: "applyAura", to: "self", aura: "stealth" }],
      text: "Allows the rogue to sneak around, but reduces your speed by 30%. Lasts until cancelled. (Here: until you attack. You cannot stealth in combat.)"
    },
    {
      id: "vanish",
      name: "Vanish",
      icon: "ability_vanish",
      tree: "subtlety",
      schools: ["physical"],
      target: "self",
      cooldown: 300,
      keepsStealth: true,
      effects: [{ type: "applyAura", to: "self", aura: "stealth" }],
      text: "Allows the rogue to vanish from sight, entering an improved stealth mode for 10 sec. Also breaks movement impairing effects. More effective than Vanish (Rank 1)."
    },
    {
      id: "premeditation",
      name: "Premeditation",
      icon: "spell_shadow_possession",
      tree: "subtlety",
      schools: ["physical"],
      target: "enemy",
      range: 20,
      cooldown: 120,
      gcd: false,
      keepsStealth: true,
      talent: "premeditation",
      requires: { stealth: true },
      effects: [builder(2)],
      text: "Adds 2 Combo Points to your target. You must add to or use those combo points within 20 sec or the combo points are lost. Must be stealthed."
    },
    {
      id: "cold_blood",
      name: "Cold Blood",
      icon: "spell_ice_lament",
      tree: "assassination",
      schools: ["physical"],
      target: "self",
      cooldown: 180,
      gcd: false,
      keepsStealth: true,
      talent: "cold_blood",
      effects: [{ type: "applyAura", to: "self", aura: "cold_blood" }],
      text: "When activated, increases the critical strike chance of your next Sinister Strike, Backstab, Ambush, Eviscerate, or Mutilate by 100%."
    },
    {
      id: "blade_flurry",
      name: "Blade Flurry",
      icon: "ability_warrior_punishingblow",
      tree: "combat",
      schools: ["physical"],
      target: "self",
      cost: 25,
      cooldown: 120,
      talent: "blade_flurry",
      effects: [{ type: "applyAura", to: "self", aura: "blade_flurry" }],
      text: "Increases your melee attack speed by 20% and your melee attacks strike an additional nearby opponent. Lasts 15 sec."
    },
    {
      id: "adrenaline_rush",
      name: "Adrenaline Rush",
      icon: "spell_shadow_shadowworddominate",
      tree: "combat",
      schools: ["physical"],
      target: "self",
      cooldown: 300,
      gcd: false,
      talent: "adrenaline_rush",
      effects: [{ type: "applyAura", to: "self", aura: "adrenaline_rush" }],
      text: "Increases your Energy regeneration rate by 100% for 15 sec."
    },
    {
      id: "preparation",
      name: "Preparation",
      icon: "spell_shadow_antishadow",
      tree: "subtlety",
      schools: ["physical"],
      target: "self",
      cooldown: 600,
      talent: "preparation",
      keepsStealth: true,
      effects: [{ type: "resetCooldowns", filter: (ab) => ab.kind !== "item" }],
      // Rogue abilities only, not Thistle Tea
      text: "When activated, this ability immediately finishes the cooldown on your other Rogue abilities."
    },
    {
      id: "thistle_tea",
      name: "Thistle Tea",
      icon: "inv_drink_milk_05",
      kind: "item",
      target: "self",
      cooldown: 300,
      cooldownGroup: "thistle_tea",
      gcd: false,
      keepsStealth: true,
      effects: [{ type: "restorePower", min: 100, max: 100 }],
      text: "Instantly restores 100 energy. 5 min cooldown."
    },
    // Poisons, on the poison bar: one per weapon (MH main hand, OH off hand). 3 sec to apply; the one put on last is the one
    // the next fight starts with (options mhPoison and ohPoison). Wound, Crippling and Mind-numbing do nothing to a dummy.
    ...[
      ["instant", "Instant Poison VI", "ability_poisons", "Coats a weapon with poison: each strike has a 20% chance of poisoning the enemy for 76 to 100 Nature damage, plus 1% of your Attack Power. Lasts 30 min."],
      ["deadly", "Deadly Poison V", "ability_rogue_dualweild", "Coats a weapon with poison: each strike has a 30% chance of poisoning the enemy for 180 Nature damage over 12 sec, plus 0.9% of your Attack Power, stacking up to 5 times. Lasts 30 min."]
    ].flatMap(([kind, name, icon2, text]) => [["main", "mhPoison", "MH", "main hand"], ["off", "ohPoison", "OH", "off hand"]].map(([hand, opt, tag, words]) => ({
      id: `${kind}_poison_${tag.toLowerCase()}`,
      name: `${name} (${words})`,
      icon: icon2,
      tree: "assassination",
      schools: ["nature"],
      target: "self",
      castTime: 3,
      barTag: tag,
      setsOption: [opt, kind],
      notes: "approx",
      // the attack power share of the launch notes (rogue.js, auras.js)
      activeWhen: (g) => ((g.loadout.options || {})[opt] ?? g.cls.options[opt].default) === kind,
      effects: [{ type: "custom", run: (g) => {
        g.loadout.options = { ...g.loadout.options, [opt]: kind };
      } }],
      text: `${text} This one goes on your ${words} weapon.`
    })))
  ];

  // src/classes/rogue/spellbook.js
  var extra2 = spellbookAbilities(SPELLBOOK2, {
    known: new Set(abilities2.map((a) => a.name)),
    talents: new Set(trees2.flatMap((t) => t.talents.map((x) => x.id))),
    forms: {},
    overrides: {
      gouge: { notSimulated: false, schools: ["physical"], builder: true, effects: [{ type: "meleeDamage", min: 75, max: 75, name: "Gouge", onHit: [{ type: "applyAura", to: "target", aura: "gouge" }, { type: "addCombo", n: 1 }] }, { type: "custom", run: (g) => g.stopAttack() }] },
      // "stops your attack": a swing would break it
      // Sap and Distract do not break Stealth (tooltips), so they do not start the auto attack either.
      // Sprint (+70% speed for 15 sec, keeps Stealth) and Evasion (+50% dodge for 15 sec); Improved Sprint can clear slows.
      sprint: {
        notSimulated: false,
        keepsStealth: true,
        effects: [
          { type: "applyAura", to: "self", aura: "sprint" },
          { type: "custom", run: (g) => {
            if (g.rng() < 0.5 * g.rank("improved_sprint")) {
              for (const a of g.player.auras.slice()) if (a.def.kind === "debuff" && (a.def.chill || (a.def.flags || {}).rooted)) removeAura(g, a, "cleared");
            }
          } }
        ]
      },
      evasion: { notSimulated: false, keepsStealth: true, effects: [{ type: "applyAura", to: "self", aura: "evasion" }] },
      sap: { keepsStealth: true },
      distract: { keepsStealth: true },
      kick: { notSimulated: false, schools: ["physical"], effects: [{ type: "meleeDamage", min: 80, max: 80, name: "Kick" }] }
    },
    auraOverrides: {
      gouge: { flags: { breaksOnDamage: true, stunned: true } },
      sprint: { mods: () => [mult("runSpeed", 1.7)], desc: () => "Movement speed increased by 70%." },
      evasion: { mods: () => [add("dodgeChance", 0.5)], desc: () => "Dodge chance increased by 50%." }
    }
  });

  // src/classes/rogue/auras.js
  var deadlyTick = (g) => 23 + 9e-3 * attackPower(g, { caster: g.player }) / 4;
  var stun = (id, name, icon2) => ({ id, name, icon: icon2, kind: "debuff", flags: { stunned: true }, desc: () => "Stunned." });
  var auras2 = {
    /* ---------- buffs ---------- */
    stealth: {
      id: "stealth",
      name: "Stealth",
      icon: "ability_stealth",
      kind: "buff",
      duration: Infinity,
      flags: { stealth: true },
      onApply: (g) => g.stopAttack(),
      mods: () => [mult("runSpeed", (ctx, g) => 0.7 + 0.05 * g.rank("camouflage"))],
      desc: () => "Stealthed. Movement speed reduced. Attacking breaks it."
    },
    slice_and_dice: {
      id: "slice_and_dice",
      name: "Slice and Dice",
      icon: "ability_rogue_slicedice",
      kind: "buff",
      mods: () => [mult("attackSpeed", 1.3)],
      desc: () => "Melee attack speed increased by 30%."
    },
    blade_flurry: {
      id: "blade_flurry",
      name: "Blade Flurry",
      icon: "ability_warrior_punishingblow",
      kind: "buff",
      duration: 15,
      mods: () => [mult("attackSpeed", 1.2)],
      desc: () => "Melee attack speed increased by 20%. Melee attacks strike an additional nearby opponent."
    },
    adrenaline_rush: {
      id: "adrenaline_rush",
      name: "Adrenaline Rush",
      icon: "spell_shadow_shadowworddominate",
      kind: "buff",
      duration: 15,
      mods: () => [mult("powerRegenMult", 2)],
      desc: () => "Energy regeneration increased by 100%."
    },
    cold_blood: {
      id: "cold_blood",
      name: "Cold Blood",
      icon: "spell_ice_lament",
      kind: "buff",
      duration: Infinity,
      desc: () => "Your next Sinister Strike, Backstab, Ambush, Eviscerate, or Mutilate is a critical strike."
    },
    venom: {
      id: "venom",
      name: "Venom",
      icon: "inv_sword_31",
      kind: "buff",
      duration: 6,
      mods: () => [mult("damageMult", 1.3, (ctx) => ctx.tags && ctx.tags.includes("poison")), add("poisonChance", 0.2)],
      desc: () => "Poison damage increased by 30% and chance to apply Poisons increased by 20%."
    },
    ghostly_strike: {
      id: "ghostly_strike",
      name: "Ghostly Strike",
      icon: "spell_shadow_curse",
      kind: "buff",
      duration: 7,
      mods: () => [set("ignoreStealthRequirement", true, (ctx) => isAbility(ctx, "ambush", "garrote"))],
      desc: () => "Dodge chance increased by 15%. Your next Ambush or Garrote does not require Stealth."
    },
    /* ---------- debuffs on the target ---------- */
    rupture: { id: "rupture", name: "Rupture", icon: "ability_rogue_rupture", kind: "debuff", schools: ["physical"], dot: { period: 2, ticks: 8, base: 469, apCoef: 0.24 } },
    garrote: { id: "garrote", name: "Garrote", icon: "ability_rogue_garrote", kind: "debuff", schools: ["physical"], dot: {
      period: 3,
      ticks: 6,
      base: 552,
      apCoef: 0.18
      /* ESTIMATE */
    } },
    hemorrhage: {
      id: "hemorrhage",
      name: "Hemorrhage",
      icon: "spell_shadow_lifedrain",
      kind: "debuff",
      duration: 15,
      sourceMods: () => [mult("damageMult", 1.15, (ctx) => isAbility(ctx, "rupture", "garrote"))],
      desc: () => "Takes 15% more Rupture and Garrote damage from the Rogue."
    },
    expose_armor: {
      id: "expose_armor",
      name: "Expose Armor",
      icon: "ability_warrior_riposte",
      kind: "debuff",
      duration: 30,
      // Not on top of the raid's Sunder Armor (the dummy and the boss carry it): the two do not stack, as in the game.
      sourceMods: (a) => [add("targetArmor", -(a.data.armor || 0), (ctx) => !(ctx.target && ctx.target.raidDebuffs || []).includes("sunder_armor"))],
      desc: (a) => `Armor reduced by ${a.data.armor || 0}.`
    },
    death_mark: {
      id: "death_mark",
      name: "Death Mark",
      icon: "ability_rogue_slaughterfromtheshadows",
      kind: "debuff",
      duration: 6,
      onRemove: (g, a, reason) => {
        if (reason === "expired") g.cls.releaseDeathMark(g, a);
      },
      desc: (a) => `Storing damage: ${Math.round(a.data.stored || 0)} so far. Dealt when the mark ends.`
    },
    cheap_shot: { ...stun("cheap_shot", "Cheap Shot", "ability_cheapshot"), duration: 4 },
    kidney_shot: stun("kidney_shot", "Kidney Shot", "ability_rogue_kidneyshot"),
    deadly_poison: {
      id: "deadly_poison",
      name: "Deadly Poison V",
      icon: "ability_rogue_dualweild",
      kind: "debuff",
      schools: ["nature"],
      maxStacks: 5,
      tags: ["poison"],
      // 92 over 12 sec per stack, plus 0.9% of the attack power per stack over the 12 sec (launch notes; APPROXIMATION of
      // how the notes' share applies).
      dot: { period: 3, ticks: 4, amount: (g, a) => deadlyTick(g) * a.stacks, binary: true, label: "Deadly Poison" },
      desc: (a, g) => `${Math.round(deadlyTick(g) * a.stacks)} Nature damage every 3 sec.`
    }
  };

  // src/classes/rogue/presets.js
  var gearPresets2 = [
    { id: "fresh", name: "Fresh 60", blurb: "Quest and dungeon greens and blues.", gear: { agi: 90, str: 40, sta: 80, ap: 0, crit: 0.01, hit: 0.01, haste: 0, wdps: 38, odps: 34 } },
    { id: "preraid", name: "Pre-raid", blurb: "Best dungeon, quest and crafted gear before raids.", gear: { agi: 230, str: 34, sta: 68, ap: 142, crit: 0.06, hit: 0.109, parry: 0.01, haste: 0, wdps: 46, odps: 46, armor: 1036 } }
  ];
  var builds2 = [
    {
      id: "assassination",
      name: "Assassination",
      points: "39/11/1",
      blurb: "Daggers and Mutilate, Cold Blood, and Shank for Venom. Slice and Dice and Rupture up, Eviscerate with Seal Fate. Opportunity from Subtlety for Ambush.",
      options: { mainHand: "dagger", offHand: "dagger", mhPoison: "instant", ohPoison: "deadly" },
      talents: {
        malice: 5,
        ruthlessness: 3,
        improved_expose_armor: 2,
        improved_slice_and_dice: 3,
        vigor: 2,
        blood_splatter: 1,
        lethality: 2,
        vile_poisons: 5,
        cold_blood: 1,
        improved_poisons: 5,
        relentless_strikes: 5,
        venom: 1,
        seal_fate: 3,
        mutilate: 1,
        lightning_reflexes: 5,
        puncturing_wounds: 3,
        precision: 3,
        opportunity: 1
      },
      bar: ["mutilate", "eviscerate", "slice_and_dice", "rupture", "shank", "sinister_strike", "thistle_tea", "expose_armor", "cold_blood", "ambush", "garrote", "stealth"]
    },
    {
      id: "combat",
      name: "Combat",
      points: "16/35/0",
      blurb: "Swords, Sinister Strike and Hack and Slash, Blade Flurry and Adrenaline Rush. Slice and Dice up, Eviscerate and Rupture as finishers.",
      options: { mainHand: "sword", offHand: "sword", mhPoison: "instant", ohPoison: "instant" },
      talents: {
        malice: 5,
        ruthlessness: 3,
        improved_expose_armor: 2,
        improved_slice_and_dice: 3,
        blood_splatter: 1,
        lethality: 2,
        coup_de_grace: 3,
        efficient_strikes: 2,
        deflection: 3,
        precision: 3,
        improved_sprint: 2,
        endurance: 2,
        flawless_execution: 1,
        aggression: 3,
        weapon_expertise: 2,
        dual_wield_specialization: 2,
        blade_flurry: 1,
        hack_and_slash: 5,
        flash_of_steel: 5,
        adrenaline_rush: 1
      },
      bar: ["sinister_strike", "eviscerate", "slice_and_dice", "rupture", "adrenaline_rush", "blade_flurry", "thistle_tea", "expose_armor", "vanish", "garrote", "stealth", "shank"]
    },
    {
      id: "subtlety",
      name: "Subtlety",
      points: "19/0/32",
      blurb: "Daggers from the shadows: Ambush and Premeditation, Hemorrhage and Ghostly Strike, Shank with Boot Knife, and Death Mark. Preparation resets Vanish for another opener.",
      options: { mainHand: "dagger", offHand: "dagger", mhPoison: "instant", ohPoison: "instant" },
      talents: {
        malice: 5,
        ruthlessness: 3,
        improved_expose_armor: 2,
        improved_slice_and_dice: 3,
        vigor: 2,
        blood_splatter: 1,
        lethality: 2,
        vile_poisons: 1,
        setup: 1,
        opportunity: 5,
        camouflage: 3,
        dirty_deeds: 2,
        improved_ambush: 3,
        initiative: 3,
        premeditation: 1,
        serrated_blades: 3,
        elusiveness: 2,
        ghostly_strike: 1,
        preparation: 1,
        hemorrhage: 1,
        boot_knife: 5,
        death_mark: 1
      },
      bar: ["ghostly_strike", "hemorrhage", "shank", "rupture", "ambush", "slice_and_dice", "eviscerate", "death_mark", "preparation", "stealth", "premeditation", "vanish"]
    }
  ];

  // src/common/weapons.js
  var WEAPON_TYPES = {
    dagger: { name: "Dagger", main: 1.8, off: 1.5 },
    sword: { name: "Sword", main: 2.7, off: 1.6 },
    mace: { name: "Mace", main: 2.6, off: 1.8 },
    axe: { name: "Axe", main: 2.6, off: 1.7 },
    fist: { name: "Fist Weapon", main: 2.5, off: 1.5 },
    two_hand_sword: { name: "Two-Handed Sword", main: 3.6, twoHand: true, family: "sword" },
    two_hand_axe: { name: "Two-Handed Axe", main: 3.6, twoHand: true, family: "axe" },
    two_hand_mace: { name: "Two-Handed Mace", main: 3.6, twoHand: true, family: "mace" },
    polearm: { name: "Polearm", main: 3.5, twoHand: true, family: "polearm" },
    bow: { name: "Bow", ranged: 2.9 },
    crossbow: { name: "Crossbow", ranged: 3.2 },
    gun: { name: "Gun", ranged: 3 },
    shield: { name: "Shield", shield: true },
    none: { name: "None" }
  };
  var weaponNames = (types) => Object.fromEntries(types.map((t) => [t, WEAPON_TYPES[t].name]));
  function makeWeapon(type, hand, dps2, ammo = 0) {
    const w = WEAPON_TYPES[type];
    if (!w || !w[hand]) return null;
    const speed2 = w[hand];
    return { type, family: w.family || type, name: w.name, speed: speed2, twoHand: !!w.twoHand, ranged: hand === "ranged", ammo, min: Math.round(dps2 * speed2 * 0.75), max: Math.round(dps2 * speed2 * 1.25) };
  }
  var describeWeapon = (w) => w ? `${w.name}, ${w.speed} speed, ${w.min}-${w.max}${w.ammo ? ` (+${w.ammo} ammo DPS)` : ""}` : "None";

  // src/classes/rogue/rogue.js
  var ROGUE_WEAPONS = ["dagger", "sword", "mace", "fist", "axe"];
  var POISONS = {
    instant: { name: "Instant Poison VI", icon: "ability_poisons", chance: 0.2 },
    deadly: { name: "Deadly Poison V", icon: "ability_rogue_dualweild", chance: 0.3 }
  };
  var instantPoison = { id: "instant_poison", name: "Instant Poison", icon: "ability_poisons", schools: ["nature"], tags: ["poison"] };
  var isPlayer = (game, ev) => ev.ctx.caster === game.player;
  var landedRes = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var weaponOf = (game, ctx) => (rogue.weapons(game) || {})[ctx.hand || "main"];
  var rogue = {
    id: "rogue",
    name: "Rogue",
    icon: "classicon_rogue",
    color: "#fff569",
    resource: "energy",
    gcd: 1,
    comboPoints: true,
    source: SOURCE2,
    // Level 60 Human Rogue base stats (Classic). Attack power: Strength + Agility + level x 2 - 20. 29 Agility per 1% crit.
    stats: {
      level: 60,
      canParry: true,
      base: { str: 80, agi: 130, sta: 75, int: 35, spi: 50 },
      derive(a) {
        return {
          maxHp: 1523 + Math.min(a.sta, 20) + Math.max(0, a.sta - 20) * 10 - 20,
          ap: a.str + a.agi + 100,
          crit: a.agi / 29 / 100
        };
      }
    },
    // Main and off-hand weapon from the chosen types and the gear's weapon DPS.
    weapons(game) {
      const o = game.loadout.options || {}, g = game.loadout.gear || {};
      const pick = (t, d) => ROGUE_WEAPONS.includes(t) ? t : d;
      return { main: makeWeapon(pick(o.mainHand, "sword"), "main", g.wdps || 40), off: makeWeapon(pick(o.offHand, "dagger"), "off", g.odps || 35) };
    },
    trees: trees2,
    talentHistory: talentHistory2,
    // earlier trees, so older build links still open (talent-history.js)
    // The poison bar: each poison for the main hand (MH) and the off hand (OH).
    stanceBar: { label: "Poisons", abilities: ["instant_poison_mh", "deadly_poison_mh", "instant_poison_oh", "deadly_poison_oh"] },
    abilities: [...abilities2, ...extra2.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras2, ...extra2.auras },
    gearPresets: gearPresets2,
    builds: builds2,
    gearFields: [
      { k: "agi", label: "Agility", step: 5, max: 600 },
      { k: "str", label: "Strength", step: 5, max: 400 },
      { k: "ap", label: "Attack power", step: 10, max: 1e3, note: "From gear, on top of Strength and Agility." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." },
      { k: "wdps", label: "Main hand DPS", step: 1, max: 90 },
      { k: "odps", label: "Off hand DPS", step: 1, max: 90 }
    ],
    options: {
      mainHand: { label: "Main hand", values: ROGUE_WEAPONS, names: weaponNames(ROGUE_WEAPONS), default: "sword" },
      offHand: { label: "Off hand", values: ROGUE_WEAPONS, names: weaponNames(ROGUE_WEAPONS), default: "dagger" },
      mhPoison: { label: "Main hand poison", values: ["instant", "deadly", "none"], names: { instant: "Instant Poison VI", deadly: "Deadly Poison V", none: "None" }, default: "instant", hidden: true },
      ohPoison: { label: "Off hand poison", values: ["instant", "deadly", "none"], names: { instant: "Instant Poison VI", deadly: "Deadly Poison V", none: "None" }, default: "deadly", hidden: true }
    },
    sheet(game, f) {
      const s = game.stats(), w = rogue.weapons(game);
      const wl = describeWeapon;
      return [
        ["Agility", f.int(s.agi)],
        ["Strength", f.int(s.str)],
        ["Attack power", f.int(s.ap)],
        ["Energy", f.int(game.resource.max(game))],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Main hand", wl(w.main)],
        ["Off hand", wl(w.off)]
      ];
    },
    // Expose Armor: 450 armor per combo point for 30 sec.
    applyExposeArmor(game, ctx) {
      applyAura(game, ctx.target, auras2.expose_armor, { source: game.player, data: { armor: 450 * ctx.combo } });
    },
    // Shank: gives back Energy (Flash of Steel adds more) and, with Boot Knife, can add 2 combo points (launch notes).
    afterShank(game, ctx) {
      game.gainPower("energy", 25 + 3 * game.rank("flash_of_steel"));
      const bk = game.rank("boot_knife");
      if (bk && game.rng() < 0.2 * bk) addCombo(game, ctx.target, 2);
      if (game.rank("venom")) applyAura(game, game.player, auras2.venom, { source: game.player });
    },
    // Death Mark: stores a share of the Rogue's damage on the target per combo point, dealt when the mark ends, up to a
    // cap (DEATH_MARK in abilities.js; Coup de Grace raises the damage and the storage rate).
    applyDeathMark(game, ctx) {
      const cdg = [0, 0.07, 0.13, 0.2][game.rank("coup_de_grace")], cp2 = Math.max(1, ctx.combo);
      const cap = DEATH_MARK.cap(cp2) + DEATH_MARK.capAp * cp2 * attackPower(game, { caster: game.player });
      applyAura(game, ctx.target, auras2.death_mark, { source: game.player, duration: DEATH_MARK.duration, data: { rate: DEATH_MARK.rate * cp2 * (1 + cdg), bonus: 1 + cdg, cap, stored: 0, ability: ctx.ability } });
    },
    releaseDeathMark(game, a) {
      const amount = Math.round(Math.min(a.data.cap || Infinity, (a.data.stored || 0) * (a.data.bonus || 1)));
      if (amount <= 0 || a.unit.dead) return;
      const ctx = { castId: ++game.castSeq, caster: game.player, target: a.unit, schools: ["physical"], ability: a.data.ability };
      game.reportDamage(ctx, { outcome: "hit", amount }, { name: "Death Mark" });
    },
    // Baseline rules, no talent needed.
    mods(game) {
      return [
        add("critChance", 1, (ctx) => !!ctx.coldBlood),
        // Poised (level 18): at full Energy and out of combat, the next ability costs 10 less (Composure: 5 more per rank).
        add("cost", (ctx, g) => -(10 + 5 * g.rank("composure")), (ctx, g) => ctx.baseCost > 0 && !g.inCombat() && g.player.res.energy.power >= g.resource.max(g)),
        // Poisons are spells: melee hit from gear does not help them land.
        { key: "hitChance", fn: (v, ctx, g) => ctx.tags && ctx.tags.includes("poison") ? v - g.stats().hit : v },
        mult("damageMult", 1.2, (ctx, g) => isAbility(ctx, "mutilate") && !!findAura(ctx.target, "deadly_poison", g.player))
        // Mutilate vs a poisoned target
      ];
    },
    listen(game, on) {
      const p = () => game.player;
      on("damage", (ev) => {
        const c = ev.ctx;
        if (ev.periodic || !c.melee || !isPlayer(game, ev) || !landedRes(ev.res) || c.cleave) return;
        const o = game.loadout.options || {};
        const kind = POISONS[(c.hand === "off" ? o.ohPoison : o.mhPoison) || "none"];
        if (!kind) return;
        const chance = kind.chance + applyMods(game, "poisonChance", 0, c);
        if (game.rng() >= chance) return;
        const pctx = { castId: ++game.castSeq, caster: p(), target: c.target, schools: ["nature"], tags: ["poison"], ability: instantPoison };
        const ap = 0.01 * attackPower(game, { caster: p() });
        if (kind === POISONS.instant) spellHit(game, pctx, { min: 76 + ap, max: 100 + ap, coef: 0, binary: true, name: "Instant Poison" });
        else if (game.rng() >= missChance(game, pctx)) applyAura(game, c.target, auras2.deadly_poison, { source: p(), data: { ability: { id: "deadly_poison", name: "Deadly Poison", schools: ["nature"], tags: ["poison"] } } });
      });
      on("damage", (ev) => {
        const c = ev.ctx;
        if (ev.periodic || !c.melee || !isPlayer(game, ev) || c.cleave || ev.res.amount <= 0 || !findAura(p(), "blade_flurry")) return;
        const other = game.enemies.filter((e) => e !== c.target && !e.dead && dist(e, c.target) <= 5 + e.radius).sort((a, b) => dist(a, c.target) - dist(b, c.target))[0];
        if (other) game.reportDamage({ ...c, target: other, cleave: true }, { outcome: ev.res.outcome, amount: ev.res.amount }, { name: "Blade Flurry" });
      });
      on("cast:success", ({ ability, ctx }) => {
        if (!["sinister_strike", "backstab", "ambush", "eviscerate", "mutilate"].includes(ability.id)) return;
        const a = findAura(p(), "cold_blood");
        if (a) {
          ctx.coldBlood = true;
          removeAura(game, a, "consumed");
        }
      });
      on("cast:success", ({ ability }) => {
        if (ability.id !== "ambush" && ability.id !== "garrote") return;
        const a = findAura(p(), "ghostly_strike");
        if (a && !p().auras.some((x) => x.def.flags && x.def.flags.stealth)) removeAura(game, a, "consumed");
      });
      on("damage", (ev) => {
        const c = ev.ctx;
        if (!isPlayer(game, ev) || !(ev.res.amount > 0) || !c.target) return;
        const m = findAura(c.target, "death_mark", p());
        if (!m) return;
        const id = c.ability && c.ability.id;
        m.data.stored = (m.data.stored || 0) + ev.res.amount * m.data.rate * (id === "garrote" || id === "rupture" ? 2 : 1);
      });
      on("cast:success", ({ ability }) => {
        if (ability.id === "vanish") game.stopAttack();
      });
    },
    talents: {
      /* ---------- Assassination ---------- */
      malice: { mods: (r) => [add("critChance", 0.01 * r)] },
      ruthlessness: {
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if (ability.finisher && ctx.combo > 0 && game.rng() < 0.2 * r) addCombo(game, game.player.target, 1);
          });
        }
      },
      improved_slice_and_dice: { mods: (r) => [mult("auraDuration", 1 + 0.15 * r, (ctx) => ctx.auraId === "slice_and_dice")] },
      relentless_strikes: {
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if (ability.finisher && game.rng() < 0.04 * r * (ctx.combo || 0)) game.resource.gain(game, game.player, 25);
          });
        }
      },
      improved_expose_armor: {
        mods: (r) => [add("cost", -5 * r, (ctx) => isAbility(ctx, "expose_armor"))],
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if (ability.id === "expose_armor" && ctx.combo === 5) addCombo(game, game.player.target, r);
          });
        }
      },
      blood_splatter: { mods: () => [add("auraDuration", 6, (ctx) => ctx.auraId === "rupture"), add("auraDuration", 9, (ctx) => ctx.auraId === "garrote")] },
      lethality: { mods: (r) => [mult("critBonusMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "sinister_strike", "gouge", "backstab", "mutilate", "ghostly_strike", "hemorrhage"))] },
      vile_poisons: { mods: (r) => [mult("damageMult", 1 + 0.04 * r, (ctx) => !!ctx.tags && ctx.tags.includes("poison"))] },
      cold_blood: { teaches: "cold_blood" },
      improved_poisons: { mods: (r) => [add("poisonChance", 0.02 * r)] },
      vigor: { mods: (r) => [add("maxPower", 5 * r)] },
      mutilate: { teaches: "mutilate" },
      improved_kidney_shot: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx, g) => !!ctx.target && !!findAura(ctx.target, "kidney_shot", g.player))] },
      seal_fate: {
        listen(game, r, on) {
          on("damage", (ev) => {
            const ab = ev.ctx.ability;
            if (ev.periodic || ev.ctx.cleave || !ab || !ab.builder || ev.res.outcome !== "crit" || !isPlayer(game, ev)) return;
            if (game.rng() < [0.33, 0.66, 1][r - 1]) addCombo(game, ev.ctx.target, 1);
          });
        }
      },
      // Setup: a chance to add a combo point to the attacker after dodging its attack (the Rogue has no test where it is
      // attacked, but a boss that hits would set it off).
      setup: { listen(game, r, on) {
        on("hitTaken", ({ res, attacker }) => {
          if (res.outcome === "dodge" && attacker && game.rng() < 0.15 * r) addCombo(game, attacker, 1);
        });
      } },
      venom: { mods: () => [] },
      // read after Shank (afterShank); the empty mods mark it as simulated
      /* ---------- Combat ---------- */
      lightning_reflexes: { mods: (r) => [add("dodgeChance", 0.01 * r)] },
      endurance: { mods: (r) => [mult("cooldown", 1 - 0.3 * r, (ctx) => isAbility(ctx, "sprint", "evasion"))] },
      improved_sprint: { mods: () => [] },
      // read by Sprint (spellbook.js): a chance to clear slows and roots
      deflection: { mods: (r) => [add("parryChance", 0.02 * r)] },
      coup_de_grace: { mods: (r) => [mult("damageMult", 1 + [0.07, 0.13, 0.2][r - 1], (ctx) => isAbility(ctx, "eviscerate"))] },
      // Death Mark's part: applyDeathMark
      efficient_strikes: { mods: (r) => [add("cost", -[3, 5][r - 1], (ctx) => isAbility(ctx, "sinister_strike", "hemorrhage"))] },
      puncturing_wounds: {
        mods: (r) => [
          add("critChance", 0.1 * r, (ctx) => isAbility(ctx, "backstab")),
          add("critChance", 0.05 * r, (ctx) => isAbility(ctx, "mutilate"))
        ],
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (ability.id === "backstab" && landedRes(ctx.result) && game.rng() < 0.15 * r) addCombo(game, ctx.target, 1);
          });
        }
      },
      precision: { mods: (r) => [add("hitChance", 0.01 * r, (ctx) => !!ctx.melee)] },
      flawless_execution: { mods: () => [add("cost", -15, (ctx) => isAbility(ctx, "eviscerate"))] },
      dual_wield_specialization: { mods: (r) => [mult("damageMult", 1 + 0.25 * r, (ctx) => !!ctx.melee && ctx.hand === "off")] },
      composure: { mods: () => [] },
      // read by Poised (mods)
      flash_of_steel: { mods: (r) => [add("cooldown", -0.4 * r, (ctx) => isAbility(ctx, "shank"))] },
      // its Energy: afterShank
      boot_knife: { mods: () => [] },
      // read after Shank (afterShank)
      blade_flurry: { teaches: "blade_flurry" },
      hack_and_slash: {
        mods: (r) => [
          add("critChance", 0.01 * r, (ctx, g) => !!ctx.melee && ["dagger", "fist"].includes((weaponOf(g, ctx) || {}).type)),
          add("armorPenPct", 0.03 * r, (ctx, g) => !!ctx.melee && (weaponOf(g, ctx) || {}).type === "mace")
        ],
        listen(game, r, on) {
          on("damage", (ev) => {
            const c = ev.ctx;
            if (ev.periodic || !c.melee || c.extra || c.cleave || !isPlayer(game, ev) || !landedRes(ev.res)) return;
            const w = weaponOf(game, c);
            if (w && (w.type === "sword" || w.type === "axe") && game.rng() < 0.01 * r) game.schedule(0, (g) => swing(g, c.hand || "main", c.target, "Hack and Slash"));
          });
        }
      },
      weapon_expertise: { mods: (r) => [add("avoidanceReduction", 0.01 * r)] },
      aggression: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "sinister_strike", "eviscerate"))] },
      adrenaline_rush: { teaches: "adrenaline_rush" },
      /* ---------- Subtlety ---------- */
      camouflage: { mods: (r) => [add("cooldown", -2 * r, (ctx) => isAbility(ctx, "stealth"))] },
      // the speed part is in the Stealth aura
      opportunity: { mods: (r) => [mult("damageMult", 1 + 0.04 * r, (ctx) => isAbility(ctx, "backstab", "garrote", "ambush", "mutilate"))] },
      elusiveness: { mods: (r) => [add("cooldown", -45 * r, (ctx) => isAbility(ctx, "vanish"))] },
      improved_ambush: { mods: (r) => [add("critChance", 0.15 * r, (ctx) => isAbility(ctx, "ambush"))] },
      initiative: {
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (["ambush", "garrote", "cheap_shot"].includes(ability.id) && landedRes(ctx.result) && game.rng() < [0.33, 0.67, 1][r - 1]) addCombo(game, ctx.target, 1);
          });
        }
      },
      ghostly_strike: { teaches: "ghostly_strike" },
      premeditation: { teaches: "premeditation" },
      serrated_blades: {
        mods: (r) => [
          add("armorPenPct", 0.03 * r, (ctx) => !!ctx.melee),
          mult("damageMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "rupture"))
        ]
      },
      dirty_deeds: {
        mods: (r) => [
          add("cost", -10 * r, (ctx) => isAbility(ctx, "cheap_shot", "garrote")),
          set("ignoreBehindRequirement", true, (ctx) => isAbility(ctx, "garrote"))
        ]
      },
      preparation: { teaches: "preparation" },
      hemorrhage: { teaches: "hemorrhage" },
      death_mark: { teaches: "death_mark" }
    }
  };

  // src/classes/warrior/talent-data.js
  var SOURCE3 = { site: "foreverchanges.pro/talents/warrior", build: "1.60.1.70790", extracted: "2026-11-05" };
  var per2 = (values, fn) => values.map(fn);
  var weaponmaster = (n) => `Gives your melee weapon attacks a benefit depending on the weapon.
Axe/Polearm: Increases your critical strike chance by ${n}%.
Mace/Staff: Your attacks ignore ${3 * n}% of your target's armor.
Sword: Your successful melee attacks have a ${n}% chance to trigger an extra attack on the target.`;
  var trees3 = [
    {
      id: "arms",
      name: "Arms",
      icon: "ability_rogue_eviscerate",
      talents: [
        { id: "improved_heroic_strike", name: "Improved Heroic Strike", icon: "ability_rogue_ambush", tier: 0, col: 0, max: 3, ranks: per2([1, 2, 3], (n) => `Reduces the cost of your Heroic Strike ability by ${n} Rage.`) },
        { id: "deflection", name: "Deflection", icon: "ability_parry", tier: 0, col: 1, max: 5, ranks: per2([1, 2, 3, 4, 5], (n) => `Increases your Parry chance by ${n}%.`) },
        { id: "improved_rend", name: "Improved Rend", icon: "ability_gouge", tier: 0, col: 2, max: 3, ranks: per2([12, 23, 35], (n) => `Increases the Bleed damage done by your Rend ability by ${n}%.`) },
        { id: "improved_charge", name: "Improved Charge", icon: "ability_warrior_charge", tier: 1, col: 0, max: 2, ranks: per2([3, 6], (n) => `Increases the Rage generated by your Charge ability by ${n}.`) },
        { id: "improved_tactical_mastery", name: "Improved Tactical Mastery", icon: "spell_nature_enchantarmor", tier: 1, col: 1, max: 3, ranks: ["Tactical Mastery lets you retain up to an additional 5 Rage when you change stances.", "Tactical Mastery lets you retain up to an additional 10 Rage when you change stances.", "Tactical Mastery lets you retain up to an additional 15 Rage when you change stances."] },
        { id: "improved_overpower", name: "Improved Overpower", icon: "inv_sword_05", tier: 1, col: 3, max: 2, ranks: per2([25, 50], (n) => `Increases the critical strike chance of your Overpower ability by ${n}%.`) },
        { id: "anger_management", name: "Anger Management", icon: "spell_holy_blessingofstamina", tier: 2, col: 1, max: 1, req: "improved_tactical_mastery", ranks: ["Generates 1 Rage every 3 sec while in combat, and reduces Rage loss while out of combat by 30%."] },
        { id: "deep_wounds", name: "Deep Wounds", icon: "ability_backstab", tier: 2, col: 2, max: 3, req: "improved_rend", ranks: per2([20, 40, 60], (n) => `Your critical strikes cause your opponent to Bleed, dealing ${n}% of your melee weapon's average damage over 12 sec.`) },
        { id: "spearing_strike", name: "Spearing Strike", icon: "inv_spear_01", tier: 3, col: 0, max: 1, active: true, ranks: ["Teaches Spearing Strike: a brutal attack that deals 75% weapon damage. Deals an additional 75% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismounted. 15 Rage, 20 sec cooldown."] },
        { id: "two_handed_weapon_specialization", name: "Two-Handed Weapon Specialization", icon: "inv_axe_09", tier: 3, col: 1, max: 3, ranks: ["Increases the damage you deal with two-handed melee weapons by 2%.", "Increases the damage you deal with two-handed melee weapons by 4%.", "Increases the damage you deal with two-handed melee weapons by 6%."] },
        { id: "impale", name: "Impale", icon: "ability_searingarrow", tier: 3, col: 2, max: 2, req: "deep_wounds", ranks: per2([10, 20], (n) => `Increases the critical strike damage bonus of your abilities by ${n}%.`) },
        { id: "bloodthrill", name: "Bloodthrill", icon: "inv_sword_01", tier: 4, col: 0, max: 2, ranks: ["Grants your Main Hand melee attacks against enemies afflicted by your Rend a 10% chance to allow an activation of Overpower.", "Grants your Main Hand melee attacks against enemies afflicted by your Rend a 20% chance to allow an activation of Overpower."] },
        { id: "sweeping_strikes", name: "Sweeping Strikes", icon: "ability_rogue_slicedice", tier: 4, col: 1, max: 1, active: true, ranks: ["Teaches Sweeping Strikes: your next 5 melee attacks strike an additional nearby opponent. 30 Rage, 30 sec cooldown."] },
        { id: "weaponmaster", name: "Weaponmaster", icon: "garrison_weaponupgrade", tier: 4, col: 2, max: 5, ranks: per2([1, 2, 3, 4, 5], weaponmaster) },
        { id: "improved_slam", name: "Improved Slam", icon: "ability_warrior_decisivestrike", tier: 5, col: 0, max: 2, ranks: ["Reduces the cooldown of your Slam ability by 2.5 sec, the cast time and global cooldown by 0.25 sec, and Slam no longer interrupts or delays your melee swing.", "Reduces the cooldown of your Slam ability by 5.0 sec, the cast time and global cooldown by 0.50 sec, and Slam no longer interrupts or delays your melee swing."] },
        { id: "improved_hamstring", name: "Improved Hamstring", icon: "ability_shockwave", tier: 5, col: 2, max: 3, ranks: per2([5, 10, 15], (n) => `Gives your Hamstring ability a ${n}% chance to immobilize the target for 5 sec.`) },
        { id: "mortal_strike", name: "Mortal Strike", icon: "ability_warrior_savageblow", tier: 6, col: 1, max: 1, req: "sweeping_strikes", active: true, ranks: ["Teaches Mortal Strike: a vicious strike that deals weapon damage plus an amount and wounds the target, reducing the effectiveness of any healing by 50% for 10 sec. 30 Rage, 6 sec cooldown."] }
      ]
    },
    {
      id: "fury",
      name: "Fury",
      icon: "ability_warrior_innerrage",
      talents: [
        { id: "booming_voice", name: "Booming Voice", icon: "spell_nature_purge", tier: 0, col: 1, max: 5, ranks: ["Increases the area of effect of your Shouts by 10% and reduces the Rage cost by of your Shouts and Howls by 5%.", "Increases the area of effect of your Shouts by 20% and reduces the Rage cost by of your Shouts and Howls by 10%.", "Increases the area of effect of your Shouts by 30% and reduces the Rage cost by of your Shouts and Howls by 15%.", "Increases the area of effect of your Shouts by 40% and reduces the Rage cost by of your Shouts and Howls by 20%.", "Increases the area of effect of your Shouts by 50% and reduces the Rage cost by of your Shouts and Howls by 25%."] },
        { id: "cruelty", name: "Cruelty", icon: "ability_rogue_eviscerate", tier: 0, col: 2, max: 5, ranks: per2([1, 2, 3, 4, 5], (n) => `Improves your chance to get a critical strike with melee attacks by ${n}%.`) },
        { id: "lingering_rage", name: "Lingering Rage", icon: "ability_warrior_secondwind", tier: 1, col: 1, max: 5, ranks: per2([2, 4, 6, 8, 10], (n) => `Increases the time before your Rage begins to decay after leaving combat by ${n} sec.`) },
        { id: "unbridled_wrath", name: "Unbridled Wrath", icon: "spell_nature_stoneclawtotem", tier: 1, col: 2, max: 5, ranks: per2([12, 24, 36, 48, 60], (n) => `Gives you a ${n}% chance to generate 1 additional Rage when you deal melee damage with a weapon.`) },
        { id: "furious_precision", name: "Furious Precision", icon: "ability_warrior_incite", tier: 2, col: 0, max: 3, ranks: per2([4, 7, 10], (n) => `Increases your chance to hit with off-hand attacks by ${n}%.`) },
        { id: "piercing_howl", name: "Piercing Howl", icon: "spell_shadow_deathscream", tier: 2, col: 1, max: 1, active: true, ranks: ["Causes all enemies within 10 yds to be Dazed, reducing movement speed by 50% for 6 sec. 10 Rage."] },
        { id: "blood_craze", name: "Blood Craze", icon: "spell_shadow_summonimp", tier: 2, col: 2, max: 3, notes: true, ranks: per2([1, 2, 3], (n) => `Regenerates ${n}% of your total Health over 6 sec after being the victim of a critical strike or suffering more than 20% of your maximum Health from a single attack.`) },
        { id: "enrage", name: "Enrage", icon: "spell_shadow_unholyfrenzy", tier: 2, col: 3, max: 5, ranks: per2([2, 4, 6, 8, 10], (n) => `Gives you a 30% chance to deal ${n}% increased Physical damage for 12 sec after being the victim of any damaging attack.`) },
        { id: "dual_wield_specialization", name: "Dual Wield Specialization", icon: "ability_dualwield", tier: 3, col: 0, max: 5, ranks: per2([[5, 10], [10, 20], [15, 30], [20, 40], [25, 50]], ([a, b]) => `Increases the damage done by your off-hand weapon by ${a}% and the Rage generated by your off-hand attacks by ${b}%.`) },
        { id: "reckless_swings", name: "Reckless Swings", icon: "ability_warrior_endlessrage", tier: 3, col: 1, max: 1, active: true, ranks: ["Your next 4 melee attacks generate 5 additional Rage. Lasts 8 sec."] },
        { id: "improved_execute", name: "Improved Execute", icon: "inv_sword_48", tier: 3, col: 3, max: 2, ranks: per2([3, 5], (n) => `Reduces the Rage cost of your Execute ability by ${n}.`) },
        { id: "improved_berserker_rage", name: "Improved Berserker Rage", icon: "spell_nature_ancestralguardian", tier: 4, col: 0, max: 2, ranks: per2([[5, 50], [10, 100]], ([a, b]) => `Your Berserker Rage ability will instantly generate ${a} Rage and has a ${b}% chance to remove all movement impairing effects when activated.`) },
        { id: "death_wish", name: "Death Wish", icon: "spell_shadow_deathpact", tier: 4, col: 1, max: 1, active: true, ranks: ["Teaches Death Wish: when activated, increases your Physical damage done by 20% and makes you immune to Fear effects, but increases all damage you take by 5%. Lasts 30 sec. 10 Rage, 3 min cooldown."] },
        { id: "gore_drinker", name: "Gore Drinker", icon: "racial_troll_berserk", tier: 4, col: 2, max: 2, req: "blood_craze", notes: true, ranks: per2(["0.5", "1.0"], (n) => `Your Enrage, Berserker Rage, Bloodrage, Death Wish, and Bloodthirst abilities cause your next 3 melee attacks to restore ${n}% of your maximum Health.`) },
        { id: "improved_intercept", name: "Improved Intercept", icon: "ability_rogue_sprint", tier: 4, col: 3, max: 2, ranks: per2([5, 10], (n) => `Reduces the cooldown of your Intercept ability by ${n} sec.`) },
        { id: "improved_whirlwind", name: "Improved Whirlwind", icon: "ability_whirlwind", tier: 5, col: 0, max: 2, ranks: ["Reduces the cooldown of your Whirlwind ability by 1 sec and increases the damage it deals to the closest enemy by 15%.", "Reduces the cooldown of your Whirlwind ability by 2 sec and increases the damage it deals to the closest enemy by 30%."] },
        { id: "flurry", name: "Flurry", icon: "ability_ghoulfrenzy", tier: 5, col: 2, max: 3, ranks: ["Increases your melee attack speed by 10% for your next 3 swings after dealing a melee critical strike.", "Increases your melee attack speed by 20% for your next 3 swings after dealing a melee critical strike.", "Increases your melee attack speed by 30% for your next 3 swings after dealing a melee critical strike."] },
        { id: "bloodthirst", name: "Bloodthirst", icon: "spell_nature_bloodlust", tier: 6, col: 1, max: 1, req: "death_wish", active: true, ranks: ["Teaches Bloodthirst: instantly attack the target causing damage equal to 45% of your Attack Power plus an amount and increasing your movement speed by 10% for 10 sec. 30 Rage, 6 sec cooldown."] }
      ]
    },
    {
      id: "protection",
      name: "Protection",
      icon: "inv_shield_06",
      talents: [
        { id: "improved_bloodrage", name: "Improved Bloodrage", icon: "ability_racial_bloodrage", tier: 0, col: 0, max: 2, ranks: per2([25, 50], (n) => `Increases all the Rage generated by your Bloodrage ability by ${n}%.`) },
        { id: "shield_specialization", name: "Shield Specialization", icon: "inv_shield_06", tier: 0, col: 1, max: 5, ranks: per2([[1, 20], [2, 40], [3, 60], [4, 80], [5, 100]], ([a, b]) => `Increases your chance to Block attacks with your shield by ${a}% and grants you a ${b}% chance to generate 5 Rage when you Block.`) },
        { id: "iron_will", name: "Iron Will", icon: "spell_magic_magearmor", tier: 0, col: 2, max: 5, ranks: per2([3, 6, 9, 12, 15], (n) => `Reduces the duration of Stun and Fear effects inflicted on you by ${n}%.`) },
        { id: "anticipation", name: "Anticipation", icon: "spell_nature_mirrorimage", tier: 1, col: 0, max: 5, ranks: per2([4, 8, 12, 16, 20], (n) => `Increases your Defense Skill by ${n}.`) },
        { id: "improved_revenge", name: "Improved Revenge", icon: "ability_warrior_revenge", tier: 1, col: 2, max: 3, ranks: per2([20, 40, 60], (n) => `Increases damage dealt by your Revenge ability by ${n}%.`) },
        { id: "improved_thunder_clap", name: "Improved Thunder Clap", icon: "ability_thunderclap", tier: 1, col: 3, max: 3, ranks: per2([2, 4, 6], (n) => `Reduces the Rage cost of your Thunder Clap ability by ${n}.`) },
        { id: "last_stand", name: "Last Stand", icon: "spell_holy_ashestoashes", tier: 2, col: 0, max: 1, active: true, ranks: ["When activated, this ability temporarily grants you 30% of your maximum health for 20 sec. After the effect expires, the health is lost. 3 min cooldown."] },
        { id: "master_of_defense", name: "Master of Defense", icon: "ability_warrior_shieldguard", tier: 2, col: 1, max: 2, req: "shield_specialization", ranks: per2([50, 100], (n) => `Grants you a ${n}% chance to generate 5 Rage when you Dodge or Parry while a shield is equipped.`) },
        { id: "improved_disarm", name: "Improved Disarm", icon: "ability_warrior_disarm", tier: 2, col: 2, max: 3, ranks: per2([7, 13, 20], (n) => `Reduces the cooldown of your Disarm ability by ${n} secs.`) },
        { id: "defiance", name: "Defiance", icon: "ability_warrior_innerrage", tier: 2, col: 3, max: 3, ranks: ["Increases all threat generated in Defensive stance by an additional 7% while a shield is equipped.", "Increases all threat generated in Defensive stance by an additional 13% while a shield is equipped.", "Increases all threat generated in Defensive stance by an additional 20% while a shield is equipped."] },
        { id: "improved_sunder_armor", name: "Improved Sunder Armor", icon: "ability_warrior_sunder", tier: 3, col: 0, max: 3, ranks: per2([1, 2, 3], (n) => `Reduces the Rage cost of your Sunder Armor ability by ${n}.`) },
        { id: "vanguard", name: "Vanguard", icon: "ability_warrior_shieldcharge", tier: 3, col: 1, max: 1, ranks: ["Your Charge ability is now usable while in Defensive Stance."] },
        { id: "improved_shield_bash", name: "Improved Shield Bash", icon: "ability_warrior_shieldbash", tier: 3, col: 2, max: 2, ranks: per2([50, 100], (n) => `Gives your Shield Bash ability a ${n}% chance to Silence the target for 3 sec.`) },
        { id: "improved_shield_wall", name: "Improved Shield Wall", icon: "ability_warrior_shieldwall", tier: 4, col: 0, max: 2, ranks: per2(["5.5", "11.0"], (n) => `Reduces the cooldown of your Shield Wall ability by ${n} min.`) },
        { id: "concussion_blow", name: "Concussion Blow", icon: "ability_thunderbolt", tier: 4, col: 1, max: 1, active: true, ranks: ["Teaches Concussion Blow: stuns the target for 5 sec. 10 Rage, 45 sec cooldown."] },
        { id: "focused_rage", name: "Focused Rage", icon: "ability_warrior_focusedrage", tier: 4, col: 2, max: 3, ranks: per2([1, 2, 3], (n) => `Reduces the Rage cost of your offensive abilities by ${n}.`) },
        { id: "bastion", name: "Bastion", icon: "inv_shield_04", tier: 5, col: 2, max: 5, ranks: per2([2, 4, 6, 8, 10], (n) => `Increases all damage you deal by ${n}% while a shield is equipped.`) },
        { id: "shield_slam", name: "Shield Slam", icon: "inv_shield_05", tier: 6, col: 1, max: 1, req: "concussion_blow", active: true, ranks: ["Teaches Shield Slam: slam the target with your shield, causing 421 to 439 damage, increased by your Block Value, and has a 50% chance of dispelling 1 magic effect on the target. Causes a very high amount of threat. 20 Rage, 6 sec cooldown."] }
      ]
    }
  ];

  // src/classes/warrior/talent-history.js
  var talentHistory3 = [
    {
      // 1.60.1.70753 (November 3): Reckless Swings and Improved Whirlwind came in; Enrage and Gore Drinker moved; Improved
      // Tactical Mastery, Bloodthrill and Flurry changed ranks (Blizzard's launch notes).
      until: "1.60.1.70753",
      date: "November 3",
      order: [
        ["improved_heroic_strike", "deflection", "improved_rend", "improved_charge", "improved_tactical_mastery", "improved_overpower", "anger_management", "deep_wounds", "spearing_strike", "two_handed_weapon_specialization", "impale", "bloodthrill", "sweeping_strikes", "weaponmaster", "improved_slam", "improved_hamstring", "mortal_strike"],
        ["booming_voice", "cruelty", "lingering_rage", "unbridled_wrath", "furious_precision", "piercing_howl", "blood_craze", "dual_wield_specialization", "raging_blows", "enrage", "improved_execute", "improved_berserker_rage", "death_wish", "improved_intercept", "flurry", "gore_drinker", "bloodthirst"],
        ["improved_bloodrage", "shield_specialization", "iron_will", "anticipation", "improved_revenge", "improved_thunder_clap", "last_stand", "master_of_defense", "improved_disarm", "defiance", "improved_sunder_armor", "vanguard", "improved_shield_bash", "improved_shield_wall", "concussion_blow", "focused_rage", "bastion", "shield_slam"]
      ],
      renamed: {},
      removed: {},
      names: {}
    },
    {
      // 1.60.1.70790 (November 4, the launch client): Raging Blows left; Reckless Swings, Improved Whirlwind and Flurry
      // moved to other columns than ForeverChanges had guessed from the notes.
      until: "1.60.1.70790",
      date: "November 4",
      order: [
        ["improved_heroic_strike", "deflection", "improved_rend", "improved_charge", "improved_tactical_mastery", "improved_overpower", "anger_management", "deep_wounds", "spearing_strike", "two_handed_weapon_specialization", "impale", "bloodthrill", "sweeping_strikes", "weaponmaster", "improved_slam", "improved_hamstring", "mortal_strike"],
        ["booming_voice", "cruelty", "lingering_rage", "unbridled_wrath", "furious_precision", "piercing_howl", "blood_craze", "enrage", "dual_wield_specialization", "raging_blows", "reckless_swings", "improved_execute", "improved_berserker_rage", "death_wish", "gore_drinker", "improved_intercept", "flurry", "improved_whirlwind", "bloodthirst"],
        ["improved_bloodrage", "shield_specialization", "iron_will", "anticipation", "improved_revenge", "improved_thunder_clap", "last_stand", "master_of_defense", "improved_disarm", "defiance", "improved_sunder_armor", "vanguard", "improved_shield_bash", "improved_shield_wall", "concussion_blow", "focused_rage", "bastion", "shield_slam"]
      ],
      renamed: {},
      removed: { raging_blows: "Raging Blows" },
      names: {}
    }
  ];

  // src/classes/warrior/spellbook-data.js
  var SPELLBOOK3 = [
    ["Mocking Blow", "ability_warrior_punishingblow", "arms", 10, "m", 0, 120, 0, "A mocking attack that causes 93 damage, a moderate amount of threat and forces the target to focus attacks on you for 6 sec. Requires Melee Weapon Requires Battle Stance"],
    ["Retaliation", "ability_warrior_challange", "arms", 0, 0, 0, 900, 0, "Instantly counterattack any enemy that strikes you in melee for 15 sec. Melee attacks made from behind cannot be counterattacked. A maximum of 30 attacks will cause retaliation. Requires Battle Stance"],
    ["Victory Rush", "ability_warrior_devastate", "arms", 0, "m", 0, 30, 0, "Instantly attack the target causing (1 + 15% of attack power) damage and healing you for 10% of your maximum health. Only useable within 20 sec after you kill a non-trivial enemy."],
    ["Demoralizing Shout", "ability_warrior_warcry", "fury", 10, 0, 0, 0, 0, "Reduces the melee attack power of all enemies within 10 yards by 204 for 45 sec."],
    ["Intimidating Shout", "ability_golemthunderclap", "fury", 25, 10, 0, 180, 0, "The warrior shouts, causing the targeted enemy to cower in fear. Up to 5 enemies within 8 yds will flee in fear. Lasts 8 sec."],
    ["Challenging Shout", "ability_bullrush", "fury", 5, 0, 0, 600, 0, "Forces all nearby enemies within 10 yards to focus attacks on you for 6 sec."],
    ["Pummel", "inv_gauntlets_04", "fury", 10, "m", 0, 10, 0, "Pummel the target for 50 damage. It also interrupts spellcasting and prevents any spell in that school from being cast for 4 sec. Requires Berserker Stance"],
    ["Piercing Howl", "spell_shadow_deathscream", "fury", 10, 0, 0, 0, 1, "Causes all enemies within 10 yds to be Dazed, reducing movement speed by 50% for 6 sec."],
    ["Taunt", "spell_nature_reincarnation", "protection", 0, "m", 0, 8, 0, "Taunts the target to attack you, but has no effect if the target is already attacking you. Requires Defensive Stance"],
    ["Shield Bash", "ability_warrior_shieldbash", "protection", 10, "m", 0, 12, 0, "Bashes the target with your shield for 45 damage. It also interrupts spellcasting and prevents any spell in that school from being cast for 6 sec. Requires Shields Requires Battle Stance, Defensive Stance"],
    ["Revenge", "ability_warrior_revenge", "protection", 5, "m", 0, 5, 0, "Instantly counterattack an enemy for (138 + 22.5% of attack power) to (168 + 22.5% of attack power) damage and a high amount of threat. Revenge must follow a block, dodge or parry. Requires Melee Weapon Requires Defensive Stance"],
    ["Shield Block", "ability_defend", "protection", 10, 0, 0, 5, 0, "Increases chance to block by 75% for 7 sec, but will only block 2 attacks. Requires Shields Requires Defensive Stance"],
    ["Disarm", "ability_warrior_disarm", "protection", 20, "m", 0, 60, 0, "Disarm the enemy's weapon for 10 sec. Requires Defensive Stance"],
    ["Shield Wall", "ability_warrior_shieldwall", "protection", 0, 0, 0, 900, 0, "Reduces the damage taken from all attacks by 60% for 12 sec. Requires Shields Requires Defensive Stance"],
    ["Last Stand", "spell_holy_ashestoashes", "protection", 0, 0, 0, 180, 1, "When activated, this ability temporarily grants you 30% of your maximum health for 20 sec. After the effect expires, the health is lost."]
  ];

  // src/classes/warrior/abilities.js
  var melee2 = { range: "melee", target: "enemy", harmful: true, schools: ["physical"] };
  var BATTLE = ["battle"];
  var BERSERKER = ["berserker"];
  var abilities3 = [
    /* ---------- Arms ---------- */
    {
      id: "battle_stance",
      name: "Battle Stance",
      icon: "ability_warrior_offensivestance",
      tree: "arms",
      schools: ["physical"],
      target: "self",
      gcd: false,
      cooldown: 1,
      cooldownGroup: "stance",
      stance: true,
      setsOption: ["stance", "battle"],
      usable: (g) => g.form() === "battle" ? "You are already in that stance" : null,
      effects: [{ type: "setForm", aura: "battle_stance" }],
      text: "A balanced combat stance."
    },
    {
      id: "heroic_strike",
      name: "Heroic Strike",
      icon: "ability_rogue_ambush",
      tree: "arms",
      ...melee2,
      cost: 15,
      nextSwing: true,
      gcd: false,
      weaponStrike: true,
      threat: 175,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 157 }],
      text: "A strong attack that increases melee damage by 157 and causes a high amount of threat. Replaces your next main-hand swing."
    },
    {
      id: "charge",
      name: "Charge",
      icon: "ability_warrior_charge",
      tree: "arms",
      schools: ["physical"],
      target: "enemy",
      range: 25,
      minRange: 8,
      cooldown: 15,
      gcd: false,
      requires: { form: BATTLE, notInCombat: true },
      effects: [
        { type: "dashTo" },
        { type: "restorePower", dynamic: (g) => {
          const n = 15 + 3 * g.rank("improved_charge");
          return { min: n, max: n };
        } },
        { type: "applyAura", to: "target", aura: "charge_stun" },
        { type: "custom", run: (g) => {
          g.player.autoAttack = true;
        } }
      ],
      text: "Charge an enemy, generate 15 Rage, and Stun it for 1 sec. Cannot be used in combat."
    },
    {
      id: "rend",
      name: "Rend",
      icon: "ability_gouge",
      tree: "arms",
      ...melee2,
      cost: 10,
      requires: { form: ["battle", "defensive"] },
      effects: [{ type: "meleeDamage", noDamage: true, name: "Rend", onHit: [{ type: "applyAura", to: "target", aura: "rend" }] }],
      text: "Wounds the target causing them to bleed for 147 damage over 21 sec."
    },
    {
      id: "thunder_clap",
      name: "Thunder Clap",
      icon: "spell_nature_thunderclap",
      tree: "arms",
      schools: ["physical"],
      harmful: true,
      target: "self",
      cost: 20,
      cooldown: 6,
      threatMult: 1.75,
      requires: { form: ["battle", "defensive"] },
      effects: [{ type: "aoeMelee", center: "self", radius: 8, maxTargets: 4, min: 103, max: 103, noDodge: true, noParry: true, name: "Thunder Clap", onHit: [{ type: "applyAura", to: "target", aura: "thunder_clap" }] }],
      text: "Blasts nearby enemies with thunder, increasing the time between their attacks by 20% for 30 sec and doing 103 damage to them. Will affect up to 4 targets."
    },
    {
      id: "hamstring",
      name: "Hamstring",
      icon: "ability_shockwave",
      tree: "arms",
      ...melee2,
      cost: 10,
      requires: { form: ["battle", "berserker"] },
      weaponStrike: true,
      threat: 145,
      effects: [{ type: "meleeDamage", min: 45, max: 45, onHit: [{ type: "applyAura", to: "target", aura: "hamstring" }] }],
      text: "Maims the enemy, causing 45 damage and slowing the enemy's movement by 50% for 15 sec."
    },
    {
      id: "overpower",
      name: "Overpower",
      icon: "ability_meleedamage",
      tree: "arms",
      ...melee2,
      cost: 5,
      cooldown: 5,
      requires: { form: BATTLE },
      weaponStrike: true,
      usable: (g) => g.player.auras.some((a) => a.id === "overpower_ready") ? null : "Only usable after the target dodges",
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 35, noDodge: true, noParry: true }],
      text: "Instantly overpower the enemy, causing weapon damage plus 35. Only usable after the target dodges. The Overpower cannot be blocked, dodged or parried."
    },
    {
      id: "mortal_strike",
      name: "Mortal Strike",
      icon: "ability_warrior_savageblow",
      tree: "arms",
      ...melee2,
      cost: 30,
      cooldown: 6,
      talent: "mortal_strike",
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 160 }],
      text: "A vicious strike that deals weapon damage plus 160 and wounds the target, reducing the effectiveness of any healing by 50% for 10 sec."
    },
    {
      id: "spearing_strike",
      name: "Spearing Strike",
      icon: "inv_spear_01",
      tree: "arms",
      ...melee2,
      cost: 15,
      cooldown: 20,
      requires: { form: BATTLE },
      talent: "spearing_strike",
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 0.75 }],
      text: "A brutal attack that deals 75% weapon damage. Deals an additional 75% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismounted."
    },
    {
      id: "sweeping_strikes",
      name: "Sweeping Strikes",
      icon: "ability_rogue_slicedice",
      tree: "arms",
      schools: ["physical"],
      target: "self",
      cost: 30,
      cooldown: 30,
      requires: { form: BATTLE },
      talent: "sweeping_strikes",
      effects: [{ type: "applyAura", to: "self", aura: "sweeping_strikes", charges: 5 }],
      text: "Your next 5 melee attacks strike an additional nearby opponent."
    },
    /* ---------- Fury ---------- */
    {
      id: "battle_shout",
      name: "Battle Shout",
      icon: "ability_warrior_battleshout",
      tree: "fury",
      schools: ["physical"],
      target: "self",
      cost: 10,
      effects: [{ type: "applyAura", to: "self", aura: "battle_shout" }],
      text: "The warrior shouts, increasing the melee attack power of all party or raid members within 20 yards by 139. Lasts 3 min."
    },
    {
      id: "cleave",
      name: "Cleave",
      icon: "ability_warrior_cleave",
      tree: "fury",
      ...melee2,
      cost: 20,
      nextSwing: true,
      gcd: false,
      weaponStrike: true,
      threat: 100,
      effects: [{ type: "aoeMelee", center: "target", radius: 5, maxTargets: 2, hand: "main", weaponPct: 1, flat: 50, fx: false }],
      text: "A sweeping attack that does your weapon damage plus 50 to the target and a second nearby enemy. Replaces your next main-hand swing."
    },
    {
      id: "slam",
      name: "Slam",
      icon: "ability_warrior_decisivestrike",
      tree: "fury",
      ...melee2,
      cost: 15,
      castTime: 1.5,
      cooldown: 15,
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 87 }],
      text: "Slams the opponent, causing weapon damage plus 87."
    },
    {
      id: "execute",
      name: "Execute",
      icon: "inv_sword_48",
      tree: "fury",
      ...melee2,
      cost: 15,
      requires: { form: ["battle", "berserker"] },
      usable: (g, ctx) => ctx.target && ctx.target.hp <= ctx.target.maxHp * 0.2 ? null : "Only usable on enemies that have 20% or less health",
      effects: [{ type: "meleeDamage", dynamic: (g, ctx) => {
        const n = 600 + 15 * (ctx.extraRage || 0);
        return { min: n, max: n };
      } }],
      text: "Attempt to finish off a wounded foe, causing 600 damage and converting each extra point of rage into 15 additional damage. Only usable on enemies that have 20% or less health."
    },
    {
      id: "berserker_stance",
      name: "Berserker Stance",
      icon: "ability_racial_avatar",
      tree: "fury",
      schools: ["physical"],
      target: "self",
      gcd: false,
      cooldown: 1,
      cooldownGroup: "stance",
      stance: true,
      setsOption: ["stance", "berserker"],
      usable: (g) => g.form() === "berserker" ? "You are already in that stance" : null,
      effects: [{ type: "setForm", aura: "berserker_stance" }],
      text: "An aggressive stance. Critical strike chance increased by 3% and all damage taken is increased by 10%."
    },
    {
      id: "berserker_rage",
      name: "Berserker Rage",
      icon: "spell_nature_ancestralguardian",
      tree: "fury",
      schools: ["physical"],
      target: "self",
      cooldown: 30,
      gcd: false,
      requires: { form: BERSERKER },
      effects: [{ type: "restorePower", dynamic: (g) => {
        const n = 5 * g.rank("improved_berserker_rage");
        return { min: n, max: n };
      } }],
      text: "The warrior enters a berserker rage, becoming immune to Fear and Incapacitate effects and generating extra rage when taking damage. Lasts 10 sec."
    },
    {
      id: "intercept",
      name: "Intercept",
      icon: "ability_rogue_sprint",
      tree: "fury",
      schools: ["physical"],
      harmful: true,
      target: "enemy",
      range: 25,
      minRange: 8,
      cost: 10,
      cooldown: 30,
      requires: { form: BERSERKER },
      effects: [{ type: "dashTo" }, { type: "meleeDamage", min: 65, max: 65, noDodge: true, noParry: true, onHit: [{ type: "applyAura", to: "target", aura: "intercept_stun" }] }, { type: "custom", run: (g) => {
        g.player.autoAttack = true;
      } }],
      text: "Charge an enemy, causing 65 damage and stunning it for 3 sec."
    },
    {
      id: "whirlwind",
      name: "Whirlwind",
      icon: "ability_whirlwind",
      tree: "fury",
      schools: ["physical"],
      harmful: true,
      target: "self",
      cost: 25,
      cooldown: 10,
      requires: { form: BERSERKER },
      weaponStrike: true,
      effects: [{ type: "aoeMelee", center: "self", radius: 8, maxTargets: 4, hand: "both", weaponPct: 1 }],
      text: "In a whirlwind of steel you attack up to 4 enemies within 8 yards, causing weapon damage from both melee weapons to each enemy."
    },
    {
      id: "bloodthirst",
      name: "Bloodthirst",
      icon: "spell_nature_bloodlust",
      tree: "fury",
      ...melee2,
      cost: 30,
      cooldown: 6,
      talent: "bloodthirst",
      effects: [{ type: "meleeDamage", min: 48, max: 48, apCoef: 0.45 }],
      text: "Instantly attack the target causing damage equal to 45% of your Attack Power plus 48 and increasing your movement speed by 10% for 10 sec."
    },
    {
      id: "recklessness",
      name: "Recklessness",
      icon: "ability_criticalstrike",
      tree: "fury",
      schools: ["physical"],
      target: "self",
      cooldown: 1800,
      gcd: false,
      requires: { form: BERSERKER },
      effects: [{ type: "applyAura", to: "self", aura: "recklessness" }],
      text: "The warrior will gain 100% increased critical strike chance and will be immune to Fear effects for the next 15 sec, but all damage taken is increased by 20%."
    },
    {
      id: "death_wish",
      name: "Death Wish",
      icon: "spell_shadow_deathpact",
      tree: "fury",
      schools: ["physical"],
      target: "self",
      cost: 10,
      cooldown: 180,
      gcd: false,
      talent: "death_wish",
      effects: [{ type: "applyAura", to: "self", aura: "death_wish" }],
      text: "When activated, increases your Physical damage done by 20% and makes you immune to Fear effects, but increases all damage you take by 5%. Lasts 30 sec."
    },
    {
      id: "reckless_swings",
      name: "Reckless Swings",
      icon: "ability_warrior_endlessrage",
      tree: "arms",
      schools: ["physical"],
      target: "self",
      cooldown: 15,
      gcd: false,
      talent: "reckless_swings",
      effects: [
        // Costs 25% of base health (1689 at level 60, as Bloodrage).
        { type: "custom", run: (g) => {
          g.player.hp = Math.max(1, g.player.hp - Math.round(0.25 * 1689));
        } },
        { type: "applyAura", to: "self", aura: "reckless_swings" }
      ],
      text: "Costs 25% of your base health. Your next 4 melee attacks generate 5 additional Rage. Lasts 8 sec."
    },
    /* ---------- Protection ---------- */
    {
      id: "bloodrage",
      name: "Bloodrage",
      icon: "ability_racial_bloodrage",
      tree: "protection",
      schools: ["physical"],
      target: "self",
      cooldown: 60,
      gcd: false,
      effects: [
        { type: "restorePower", dynamic: (g) => {
          const n = 10 * (1 + 0.25 * g.rank("improved_bloodrage"));
          return { min: n, max: n };
        } },
        { type: "applyAura", to: "self", aura: "bloodrage" },
        // ESTIMATE: costs 16% of base health (Classic); the Forever tooltip only says "at the cost of health".
        { type: "custom", run: (g) => {
          g.player.hp = Math.max(1, g.player.hp - Math.round(0.16 * 1689));
        } }
      ],
      text: "Generates 10 rage at the cost of health, and then generates an additional 10 rage over 10 sec."
    },
    {
      id: "defensive_stance",
      name: "Defensive Stance",
      icon: "ability_warrior_defensivestance",
      tree: "protection",
      schools: ["physical"],
      target: "self",
      gcd: false,
      cooldown: 1,
      cooldownGroup: "stance",
      stance: true,
      setsOption: ["stance", "defensive"],
      usable: (g) => g.form() === "defensive" ? "You are already in that stance" : null,
      effects: [{ type: "setForm", aura: "defensive_stance" }],
      text: "A defensive combat stance. Decreases damage taken by 10% and damage caused by 10%. Increases all threat generated by 80%."
    },
    {
      id: "sunder_armor",
      name: "Sunder Armor",
      icon: "ability_warrior_sunder",
      tree: "protection",
      ...melee2,
      cost: 15,
      threat: 261,
      effects: [{ type: "meleeDamage", noDamage: true, name: "Sunder Armor", onHit: [{ type: "applyAura", to: "target", aura: "sunder_armor" }] }],
      text: "Sunders the target's armor, reducing it by 450 per Sunder Armor and causes a high amount of threat. Can be applied up to 5 times. Lasts 30 sec."
    },
    {
      id: "concussion_blow",
      name: "Concussion Blow",
      icon: "ability_thunderbolt",
      tree: "protection",
      ...melee2,
      cost: 10,
      cooldown: 45,
      talent: "concussion_blow",
      effects: [{ type: "meleeDamage", noDamage: true, name: "Concussion Blow", onHit: [{ type: "applyAura", to: "target", aura: "concussion_blow" }] }],
      text: "Stuns the target for 5 sec."
    },
    {
      id: "shield_slam",
      name: "Shield Slam",
      icon: "inv_shield_05",
      tree: "protection",
      ...melee2,
      cost: 20,
      cooldown: 6,
      talent: "shield_slam",
      requires: { shield: true },
      threat: 250,
      effects: [{ type: "meleeDamage", dynamic: (g) => {
        const b = (g.cls.weapons(g).shield || {}).block || 0;
        return { min: 640 + b, max: 670 + b };
      } }],
      text: "Slam the target with your shield, causing 640 to 670 damage, increased by your Block Value, and has a 50% chance of dispelling 1 magic effect on the target. Causes a very high amount of threat."
    }
  ];

  // src/classes/warrior/spellbook.js
  var hit = (n, name, extra10 = {}) => ({ notSimulated: false, schools: ["physical"], effects: [{ type: "meleeDamage", min: n, max: n, name }], ...extra10 });
  var sim = { notSimulated: false };
  var extra3 = spellbookAbilities(SPELLBOOK3, {
    known: new Set(abilities3.map((a) => a.name)),
    talents: new Set(trees3.flatMap((t) => t.talents.map((x) => x.id))),
    forms: { "Battle Stance": "battle", "Defensive Stance": "defensive", "Berserker Stance": "berserker" },
    overrides: {
      mocking_blow: { ...hit(93, "Mocking Blow"), effects: [{ type: "meleeDamage", min: 93, max: 93, name: "Mocking Blow", onHit: [{ type: "taunt", duration: 6, force: true }] }] },
      pummel: hit(50, "Pummel"),
      shield_bash: hit(45, "Shield Bash", { threat: 180 }),
      taunt: { ...sim, harmful: true, effects: [{ type: "taunt", duration: 3 }] },
      challenging_shout: { ...sim, harmful: true, effects: [{ type: "taunt", duration: 6, force: true, radius: 10 }] },
      demoralizing_shout: {
        ...sim,
        harmful: true,
        effects: [{ type: "custom", run: (g, ctx) => {
          g.emit("fx", { kind: "nova", x: ctx.caster.x, y: ctx.caster.y, r: 10, schools: ["physical"] });
          for (const e of g.enemies.filter((x) => !x.dead && Math.hypot(x.x - ctx.caster.x, x.y - ctx.caster.y) <= 10 + x.radius)) {
            g.runEffects([{ type: "applyAura", to: "target", aura: "demoralizing_shout" }, { type: "threat", amount: 43 }], { ...ctx, target: e });
          }
        } }]
      },
      revenge: {
        ...sim,
        cooldown: 5,
        weaponStrike: false,
        threat: 315,
        usable: (g) => g.player.auras.some((a) => a.id === "revenge_ready") ? null : "Only usable after you block, dodge or parry",
        // 138 to 168 plus 22.5% of attack power (1.60.1.70707), all of it raised by Improved Revenge.
        effects: [{ type: "meleeDamage", name: "Revenge", dynamic: (g) => {
          const k = 1 + 0.2 * g.rank("improved_revenge");
          return { min: 138 * k, max: 168 * k, apCoef: 0.225 * k };
        } }]
      },
      shield_block: { ...sim, gcd: false, effects: [{ type: "applyAura", to: "self", aura: "shield_block", charges: 2 }] },
      shield_wall: { ...sim, gcd: false },
      last_stand: { ...sim, gcd: false }
    },
    auraOverrides: {
      shield_block: { notSimulated: false, charges: 2, mods: () => [add("blockChance", 0.75)], desc: (a) => `Block chance increased by 75% for ${a.charges} more attacks.` },
      shield_wall: { notSimulated: false, mods: () => [mult("damageTaken", 0.4)], desc: () => "Damage taken reduced by 60%." },
      last_stand: { notSimulated: false, mods: () => [mult("maxHp", 1.3)], desc: () => "Maximum health increased by 30%. Lost when it ends." },
      demoralizing_shout: { notSimulated: false, kind: "debuff", enemy: { ap: 204 }, desc: () => "Melee attack power reduced by 204." }
    }
  });

  // src/classes/warrior/auras.js
  var physical = (ctx) => !ctx.schools || ctx.schools.includes("physical");
  var stun2 = (id, name, icon2, duration) => ({ id, name, icon: icon2, kind: "debuff", duration, flags: { stunned: true }, desc: () => "Stunned." });
  var defensiveThreat = (g) => 1.8 * (g.cls.weapons(g).shield ? 1 + [0, 0.07, 0.13, 0.2][g.rank("defiance")] : 1);
  var auras3 = {
    /* ---------- talents that answer being hit ---------- */
    blood_craze: { id: "blood_craze", name: "Blood Craze", icon: "spell_shadow_summonimp", kind: "buff", hot: true, period: 2, duration: 6, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 2 sec.` },
    enrage_talent: { id: "enrage_talent", name: "Enrage", icon: "spell_shadow_unholyfrenzy", kind: "buff", duration: 12, mods: (a) => [mult("damageMult", a.data.mult || 1, (ctx) => (ctx.schools || []).includes("physical"))], desc: (a) => `Physical damage increased by ${Math.round(((a.data.mult || 1) - 1) * 100)}%.` },
    gore_drinker: { id: "gore_drinker", name: "Gore Drinker", icon: "ability_warrior_bloodfrenzy", kind: "buff", duration: 30, charges: 3, desc: (a) => `Your next ${a.charges} melee attacks restore health.` },
    /* ---------- stances (one at a time, flags.form) ---------- */
    // Threat: Battle and Berserker Stance 80%, Defensive Stance 130% (Classic), more with Defiance and a shield.
    battle_stance: { id: "battle_stance", name: "Battle Stance", icon: "ability_warrior_offensivestance", kind: "buff", flags: { form: "battle" }, mods: () => [mult("threatMult", 0.8)], desc: () => "A balanced combat stance. Threat reduced by 20%." },
    berserker_stance: {
      id: "berserker_stance",
      name: "Berserker Stance",
      icon: "ability_racial_avatar",
      kind: "buff",
      flags: { form: "berserker" },
      mods: () => [add("critChance", 0.03), mult("damageTaken", 1.1), mult("threatMult", 0.8)],
      desc: () => "Critical strike chance increased by 3%. All damage taken increased by 10%. Threat reduced by 20%."
    },
    defensive_stance: {
      id: "defensive_stance",
      name: "Defensive Stance",
      icon: "ability_warrior_defensivestance",
      kind: "buff",
      flags: { form: "defensive" },
      mods: (a, g) => [mult("damageMult", 0.9), mult("damageTaken", 0.9), mult("threatMult", defensiveThreat(g))],
      desc: (a, g) => `Damage taken and damage caused decreased by 10%. Threat increased by ${Math.round((defensiveThreat(g) - 1) * 100)}%.`
    },
    /* ---------- buffs ---------- */
    battle_shout: {
      id: "battle_shout",
      name: "Battle Shout",
      icon: "ability_warrior_battleshout",
      kind: "buff",
      duration: 180,
      mods: () => [add("attackPower", 139)],
      desc: () => "Melee attack power increased by 139."
    },
    bloodrage: {
      id: "bloodrage",
      name: "Bloodrage",
      icon: "ability_racial_bloodrage",
      kind: "buff",
      duration: 10,
      period: 1,
      onTick: (g) => g.resource.gain(g, g.player, 1 + 0.25 * g.rank("improved_bloodrage")),
      mods: () => [set("forceCombat", true)],
      // Bloodrage puts you in combat for its 10 sec (Classic): no rage decay, and no Charge until it ends
      desc: () => "Generating 1 Rage every sec."
    },
    revenge_ready: { id: "revenge_ready", name: "Revenge", icon: "ability_warrior_revenge", kind: "buff", duration: 5, desc: () => "Revenge is usable." },
    overpower_ready: { id: "overpower_ready", name: "Overpower", icon: "ability_meleedamage", kind: "buff", duration: 5, desc: () => "Overpower is usable." },
    sweeping_strikes: { id: "sweeping_strikes", name: "Sweeping Strikes", icon: "ability_rogue_slicedice", kind: "buff", duration: 20, charges: 5, desc: (a) => `Your next ${a.charges} melee attacks strike an additional nearby opponent.` },
    recklessness: {
      id: "recklessness",
      name: "Recklessness",
      icon: "ability_criticalstrike",
      kind: "buff",
      duration: 15,
      mods: () => [add("critChance", 1, (ctx) => !!ctx.melee), mult("damageTaken", 1.2)],
      desc: () => "Critical strike chance increased by 100%. Damage taken increased by 20%."
    },
    death_wish: {
      id: "death_wish",
      name: "Death Wish",
      icon: "spell_shadow_deathpact",
      kind: "buff",
      duration: 30,
      mods: () => [mult("damageMult", 1.2, physical), mult("damageTaken", 1.05)],
      desc: () => "Physical damage increased by 20%. Damage taken increased by 5%."
    },
    reckless_swings: {
      id: "reckless_swings",
      name: "Reckless Swings",
      icon: "ability_warrior_endlessrage",
      kind: "buff",
      duration: 8,
      charges: 4,
      desc: (a) => `Your next ${a.charges} melee attacks generate 5 additional Rage.`
    },
    flurry: {
      id: "flurry",
      name: "Flurry",
      icon: "ability_ghoulfrenzy",
      kind: "buff",
      duration: 15,
      charges: 3,
      mods: (a, g) => [mult("attackSpeed", 1 + 0.1 * g.rank("flurry"))],
      desc: (a, g) => `Attack speed increased by ${10 * g.rank("flurry")}% for ${a.charges} more swings.`
    },
    /* ---------- debuffs on the target ---------- */
    rend: { id: "rend", name: "Rend", icon: "ability_gouge", kind: "debuff", schools: ["physical"], dot: { period: 3, ticks: 7, base: 147 } },
    deep_wounds: { id: "deep_wounds", name: "Deep Wounds", icon: "ability_backstab", kind: "debuff", schools: ["physical"], dot: { period: 3, ticks: 4, base: 0 } },
    sunder_armor: {
      id: "sunder_armor",
      name: "Sunder Armor",
      icon: "ability_warrior_sunder",
      kind: "debuff",
      maxStacks: 5,
      duration: 30,
      // Not on top of the raid's own Sunder Armor (Training Dummy with raid debuffs).
      sourceMods: (a) => [add("targetArmor", -450 * a.stacks, (ctx) => !(ctx.target.raidDebuffs || []).includes("sunder_armor"))],
      desc: (a) => `Armor reduced by ${450 * a.stacks}.`
    },
    thunder_clap: { id: "thunder_clap", name: "Thunder Clap", icon: "spell_nature_thunderclap", kind: "debuff", duration: 30, enemy: { attackSpeed: 1.2 }, desc: () => "Time between attacks increased by 20%." },
    hamstring: { id: "hamstring", name: "Hamstring", icon: "ability_shockwave", kind: "debuff", duration: 15, desc: () => "Movement slowed by 50%." },
    charge_stun: stun2("charge_stun", "Charge Stun", "ability_warrior_charge", 1),
    intercept_stun: stun2("intercept_stun", "Intercept Stun", "ability_rogue_sprint", 3),
    concussion_blow: stun2("concussion_blow", "Concussion Blow", "ability_thunderbolt", 5)
  };

  // src/classes/warrior/presets.js
  var gearRoles = { dps: "Damage", tank: "Tank" };
  var dps = (id, name, blurb, gear) => ({ id, tier: id, role: "dps", name, blurb, gear: { sta: 0, armor: 0, defense: 0, ...gear } });
  var tank = (tier, name, blurb, gear) => ({ id: `${tier}_tank`, tier, role: "tank", name, blurb, gear: { haste: 0, wdps2h: 0, odps: 0, ...gear } });
  var gearPresets3 = [
    dps("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { str: 80, agi: 50, sta: 90, ap: 0, crit: 0.01, hit: 0.01, haste: 0, wdps2h: 50, wdps: 38, odps: 34, block: 30, armor: 2800 }),
    dps("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { str: 196, agi: 69, sta: 114, ap: 110, crit: 0.08, hit: 0.089, parry: 0.01, haste: 0, wdps2h: 59, wdps: 46, odps: 46, block: 60, armor: 3788 }),
    tank("fresh", "Fresh 60", "Quest and dungeon plate with a shield.", { str: 70, agi: 50, sta: 220, ap: 0, crit: 0.01, hit: 0.02, armor: 4800, defense: 15, wdps: 40, block: 35 }),
    tank("preraid", "Pre-raid", "Best dungeon, quest and crafted tank gear before raids.", { str: 104, agi: 55, sta: 226, ap: 22, crit: 0.01, hit: 0, dodge: 0.08, parry: 0.02, armor: 6032, defense: 61, wdps: 41, block: 55 })
  ];
  var builds3 = [
    {
      id: "arms",
      name: "Arms",
      points: "37/12/2",
      gearRole: "dps",
      blurb: "A two-hander with Mortal Strike, Slam (Improved Slam keeps the swing going), Overpower and Rend; Spearing Strike and Sweeping Strikes. Fury on the side for Cruelty and Unbridled Wrath.",
      options: { mainHand: "two_hand_sword", offHand: "none" },
      talents: {
        improved_heroic_strike: 3,
        deflection: 3,
        improved_rend: 3,
        improved_charge: 2,
        improved_tactical_mastery: 3,
        improved_overpower: 2,
        anger_management: 1,
        deep_wounds: 3,
        spearing_strike: 1,
        two_handed_weapon_specialization: 3,
        impale: 2,
        bloodthrill: 2,
        sweeping_strikes: 1,
        weaponmaster: 5,
        improved_slam: 2,
        mortal_strike: 1,
        cruelty: 5,
        lingering_rage: 2,
        unbridled_wrath: 5,
        improved_bloodrage: 2
      },
      bar: ["slam", "rend", "overpower", "mortal_strike", "execute", "spearing_strike", "thunder_clap", "charge", "heroic_strike", "sweeping_strikes", "bloodrage", "recklessness"]
    },
    {
      id: "fury",
      name: "Fury",
      points: "14/37/0",
      gearRole: "dps",
      blurb: "Two weapons in Berserker Stance. Bloodthirst and Whirlwind on cooldown, Heroic Strike to spend rage, Flurry from crits and Death Wish for burst.",
      options: { mainHand: "sword", offHand: "sword", stance: "berserker" },
      talents: {
        deflection: 4,
        improved_rend: 3,
        improved_tactical_mastery: 3,
        anger_management: 1,
        deep_wounds: 3,
        cruelty: 5,
        lingering_rage: 2,
        unbridled_wrath: 5,
        furious_precision: 3,
        enrage: 5,
        dual_wield_specialization: 5,
        reckless_swings: 1,
        improved_execute: 2,
        improved_berserker_rage: 2,
        death_wish: 1,
        improved_whirlwind: 2,
        flurry: 3,
        bloodthirst: 1
      },
      bar: ["bloodthirst", "whirlwind", "heroic_strike", "rend", "execute", "slam", "hamstring", "berserker_rage", "bloodrage", "death_wish", "recklessness", "reckless_swings"]
    },
    {
      id: "protection",
      name: "Protection",
      points: "5/6/40",
      gearRole: "tank",
      scenario: "raid-boss",
      blurb: "A tank build for the Tank test: sword and shield in Defensive Stance. Shield Slam and Revenge on cooldown, Sunder Armor to fill, Heroic Strike with spare rage; Shield Block for Revenge and fewer hits, Shield Wall and Last Stand for the bad moments. Defiance raises the threat, Shield Specialization and Master of Defense turn blocks, dodges and parries into rage.",
      options: { mainHand: "sword", offHand: "shield", stance: "defensive" },
      talents: {
        deflection: 5,
        cruelty: 5,
        unbridled_wrath: 1,
        improved_bloodrage: 2,
        shield_specialization: 5,
        anticipation: 5,
        improved_revenge: 3,
        improved_thunder_clap: 3,
        last_stand: 1,
        master_of_defense: 2,
        defiance: 3,
        improved_sunder_armor: 3,
        vanguard: 1,
        improved_shield_wall: 2,
        concussion_blow: 1,
        focused_rage: 3,
        bastion: 5,
        shield_slam: 1
      },
      bar: ["heroic_strike", "revenge", "sunder_armor", "shield_slam", "shield_block", "thunder_clap", "charge", "demoralizing_shout", "taunt", "shield_wall", "last_stand", "bloodrage"]
    }
  ];

  // src/classes/warrior/warrior.js
  var MAIN_HANDS = ["two_hand_sword", "two_hand_axe", "two_hand_mace", "polearm", "sword", "axe", "mace", "dagger", "fist"];
  var OFF_HANDS = ["none", "shield", "sword", "axe", "mace", "dagger", "fist"];
  var TACTICAL_MASTERY = 10;
  var isPlayer2 = (game, ev) => ev.ctx.caster === game.player;
  var landedRes2 = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var weaponOf2 = (game, ctx) => (warrior.weapons(game) || {})[ctx.hand || "main"];
  var family = (game, ctx) => (weaponOf2(game, ctx) || {}).family;
  var NO_THREAT_HEAL = { blood_craze: { id: "blood_craze", name: "Blood Craze", threatMult: 0 }, gore_drinker: { id: "gore_drinker", name: "Gore Drinker", threatMult: 0 } };
  var directMelee = (game, ev) => !ev.periodic && ev.ctx.melee && !ev.ctx.cleave && isPlayer2(game, ev);
  var offensive = (ctx) => !!ctx.ability && !!ctx.ability.harmful && (ctx.baseCost || 0) > 0;
  var withWeapon = (ctx) => !!ctx.white || !!(ctx.ability && ctx.ability.weaponStrike);
  var readByAbility = { mods: () => [] };
  var warrior = {
    id: "warrior",
    name: "Warrior",
    roles: ["dps", "tank"],
    // the tests it can take (Damage, Tank, Healing)
    icon: "classicon_warrior",
    color: "#c79c6e",
    resource: "rage",
    gcd: 1.5,
    source: SOURCE3,
    // Level 60 Human Warrior base stats (Classic). Attack power: Strength x 2 + level x 3 - 20. 20 Agility per 1% crit.
    stats: {
      level: 60,
      canParry: true,
      base: { str: 120, agi: 80, sta: 110, int: 30, spi: 47 },
      derive(a) {
        return {
          maxHp: 1689 + Math.min(a.sta, 20) + Math.max(0, a.sta - 20) * 10 - 20,
          ap: a.str * 2 + 160,
          crit: a.agi / 20 / 100
        };
      }
    },
    // Main hand from the chosen type: a two-hander uses the two-handed weapon DPS and leaves no off hand.
    // Off hand: another weapon (dual wield), a shield (block value for Shield Slam) or nothing.
    weapons(game) {
      const o = game.loadout.options || {}, g = game.loadout.gear || {};
      const mh = MAIN_HANDS.includes(o.mainHand) ? o.mainHand : "two_hand_sword";
      if (WEAPON_TYPES[mh].twoHand) return { main: makeWeapon(mh, "main", g.wdps2h || 60), off: null };
      const oh = OFF_HANDS.includes(o.offHand) ? o.offHand : "none";
      const main = makeWeapon(mh, "main", g.wdps || 45);
      if (oh === "shield") return { main, off: null, shield: { block: g.block || 0 } };
      return { main, off: makeWeapon(oh, "off", g.odps || 40) };
    },
    // Stance bar beside the action bar.
    stanceBar: { label: "Stances", abilities: ["battle_stance", "defensive_stance", "berserker_stance"] },
    trees: trees3,
    talentHistory: talentHistory3,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities3, ...extra3.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras3, ...extra3.auras },
    gearPresets: gearPresets3,
    gearRoles,
    builds: builds3,
    gearFields: [
      { k: "str", label: "Strength", step: 5, max: 600 },
      { k: "agi", label: "Agility", step: 5, max: 400 },
      { k: "sta", label: "Stamina", step: 5, max: 700 },
      { k: "armor", label: "Armor", step: 100, max: 12e3, note: "From items, shield included. Agility adds 2 per point." },
      { k: "defense", label: "Defense skill", step: 1, max: 150, note: "From gear, on top of 300. Against a raid boss (315 attack skill) each point is 0.04% more miss, dodge, parry and block and 0.04% less crit." },
      { k: "ap", label: "Attack power", step: 10, max: 1e3, note: "From gear, on top of Strength." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." },
      { k: "wdps2h", label: "Two-hander DPS", step: 1, max: 120 },
      { k: "wdps", label: "One-hander DPS", step: 1, max: 90, note: "Main hand when it is a one-handed weapon." },
      { k: "odps", label: "Off hand DPS", step: 1, max: 90 },
      { k: "block", label: "Shield block value", step: 5, max: 300, note: "Damage a block stops (plus Strength / 20). Adds to Shield Slam." }
    ],
    options: {
      mainHand: { label: "Main hand", values: MAIN_HANDS, names: weaponNames(MAIN_HANDS), default: "two_hand_sword" },
      offHand: { label: "Off hand", values: OFF_HANDS, names: { ...weaponNames(OFF_HANDS), none: "None" }, default: "none", note: "Ignored with a two-handed weapon." },
      stance: { label: "Starting stance", values: ["battle", "defensive", "berserker"], hidden: true }
      // set by the stance bar; unset: the spec's
    },
    sheet(game, f) {
      const s = game.stats(), w = warrior.weapons(game);
      const off = w.shield ? `Shield, ${w.shield.block} block` : w.main && w.main.twoHand ? "None (two-hander)" : describeWeapon(w.off);
      return [
        ["Strength", f.int(s.str)],
        ["Agility", f.int(s.agi)],
        ["Attack power", f.int(s.ap)],
        ["Rage", f.int(game.resource.max(game))],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Main hand", describeWeapon(w.main)],
        ["Off hand", off]
      ];
    },
    // A fight starts in the last stance chosen on the stance bar (Battle Stance at first).
    // The stance: the last one taken from the stance bar, or the spec's (Fury Berserker, Protection Defensive, Arms Battle).
    onReset(game) {
      const s = (game.loadout.options || {}).stance || { fury: "berserker", protection: "defensive" }[game.mainTree()];
      game.applyPermanent(game.player, `${["defensive", "berserker"].includes(s) ? s : "battle"}_stance`);
    },
    startBuffs: () => ["battle_shout"],
    listen(game, on) {
      const p = () => game.player;
      on("cast:success", ({ ability }) => {
        if (!ability.stance) return;
        p().power = Math.min(p().power, TACTICAL_MASTERY + 5 * game.rank("improved_tactical_mastery"));
      });
      on("cast:success", ({ ability }) => {
        if (ability.id !== "slam" || game.rank("improved_slam") > 0) return;
        const w = warrior.weapons(game);
        if (w.main) p().swing.main = w.main.speed;
        if (w.off) p().swing.off = w.off.speed;
      });
      on("cast:success", ({ ability, ctx }) => {
        if (ability.id !== "execute") return;
        ctx.extraRage = p().power;
        p().power = 0;
      });
      on("hitTaken", ({ res }) => {
        if (["block", "dodge", "parry"].includes(res.outcome)) applyAura(game, p(), auras3.revenge_ready, { source: p() });
        const sb = res.outcome === "block" && findAura(p(), "shield_block");
        if (sb) useCharge(game, sb);
      });
      on("cast:success", ({ ability }) => {
        if (ability.id === "revenge") {
          const a = findAura(p(), "revenge_ready");
          if (a) removeAura(game, a, "consumed");
        }
      });
      on("damage", (ev) => {
        if (directMelee(game, ev) && ev.res.outcome === "dodge") applyAura(game, p(), auras3.overpower_ready, { source: p() });
      });
      on("cast:success", ({ ability }) => {
        if (ability.id === "overpower") {
          const a = findAura(p(), "overpower_ready");
          if (a) removeAura(game, a, "consumed");
        }
      });
      on("damage", (ev) => {
        const a = findAura(p(), "sweeping_strikes");
        if (!a || !directMelee(game, ev) || ev.res.amount <= 0) return;
        const c = ev.ctx;
        const other = game.enemies.filter((e) => e !== c.target && !e.dead && dist(e, c.target) <= 5 + e.radius).sort((x, y) => dist(x, c.target) - dist(y, c.target))[0];
        if (!other) return;
        game.reportDamage({ ...c, target: other, cleave: true }, { outcome: ev.res.outcome, amount: ev.res.amount }, { name: "Sweeping Strikes" });
        useCharge(game, a);
      });
    },
    talents: {
      /* ---------- Arms ---------- */
      improved_heroic_strike: { mods: (r) => [add("cost", -r, (ctx) => isAbility(ctx, "heroic_strike"))] },
      improved_rend: { mods: (r) => [mult("damageMult", 1 + [0.12, 0.23, 0.35][r - 1], (ctx) => !!ctx.periodic && isAbility(ctx, "rend"))] },
      improved_charge: readByAbility,
      // Charge's rage, in abilities.js
      improved_tactical_mastery: readByAbility,
      // the stance change listener above
      improved_overpower: { mods: (r) => [add("critChance", 0.25 * r, (ctx) => isAbility(ctx, "overpower"))] },
      anger_management: { mods: () => [add("rageInCombatPerSec", 1 / 3), mult("rageDecayMult", 0.7)] },
      deep_wounds: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!directMelee(game, ev) || ev.res.outcome !== "crit") return;
            const w = warrior.weapons(game).main;
            if (!w) return;
            const avg = (w.min + w.max) / 2 + attackPower(game, { caster: game.player }) / 14 * w.speed;
            applyAura(game, ev.ctx.target, auras3.deep_wounds, { source: game.player, dot: { base: 0.2 * r * avg }, data: { ability: { id: "deep_wounds", name: "Deep Wounds", icon: "ability_backstab", schools: ["physical"] } } });
          });
        }
      },
      spearing_strike: { teaches: "spearing_strike" },
      two_handed_weapon_specialization: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx, g) => !!ctx.melee && !!(warrior.weapons(g).main || {}).twoHand)] },
      impale: { mods: (r) => [mult("critBonusMult", 1 + 0.1 * r, (ctx) => !!ctx.melee && !ctx.white && !!ctx.ability)] },
      bloodthrill: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!directMelee(game, ev) || ev.ctx.hand === "off" || !landedRes2(ev.res)) return;
            if (findAura(ev.ctx.target, "rend", game.player) && game.rng() < 0.1 * r) applyAura(game, game.player, auras3.overpower_ready, { source: game.player });
          });
        }
      },
      sweeping_strikes: { teaches: "sweeping_strikes" },
      weaponmaster: {
        mods: (r) => [
          add("critChance", 0.01 * r, (ctx, g) => !!ctx.melee && ["axe", "polearm"].includes(family(g, ctx))),
          add("armorPenPct", 0.03 * r, (ctx, g) => !!ctx.melee && family(g, ctx) === "mace")
        ],
        listen(game, r, on) {
          on("damage", (ev) => {
            const c = ev.ctx;
            if (!directMelee(game, ev) || c.extra || !landedRes2(ev.res) || family(game, c) !== "sword") return;
            if (game.rng() < 0.01 * r) game.schedule(0, (g) => swing(g, c.hand || "main", c.target, "Weaponmaster"));
          });
        }
      },
      improved_slam: {
        mods: (r) => [
          add("castTime", -0.25 * r, (ctx) => isAbility(ctx, "slam")),
          add("gcd", -0.25 * r, (ctx) => isAbility(ctx, "slam")),
          add("cooldown", -2.5 * r, (ctx) => isAbility(ctx, "slam")),
          set("swingWhileCasting", true, (ctx) => isAbility(ctx, "slam"))
        ]
      },
      mortal_strike: { teaches: "mortal_strike" },
      /* ---------- Fury ---------- */
      // After a crit against you or a hit for more than 20% of your health: 1/2/3% of your health over 6 sec.
      blood_craze: {
        listen(game, r, on) {
          const proc = () => applyAura(game, game.player, auras3.blood_craze, { source: game.player, data: { perTick: game.stats().maxHp * 0.01 * r / 3, ticks: 3, ability: NO_THREAT_HEAL.blood_craze } });
          on("hitTaken", ({ res }) => {
            if (res.outcome === "crit" && res.amount > 0 && !game.player.dead) proc();
          });
          on("unitDamaged", ({ unit, amount }) => {
            if (unit === game.player && !unit.dead && amount > 0.2 * game.stats().maxHp) proc();
          });
        }
      },
      // 30% chance after any damaging attack: +2% Physical damage per rank for 12 sec.
      enrage: {
        listen(game, r, on) {
          on("unitDamaged", ({ unit, amount }) => {
            if (unit !== game.player || unit.dead || !(amount > 0) || game.rng() >= 0.3) return;
            applyAura(game, game.player, auras3.enrage_talent, { source: game.player, data: { mult: 1 + 0.02 * r } });
            if (game.rank("gore_drinker")) applyAura(game, game.player, auras3.gore_drinker, { source: game.player, charges: 3 });
          });
        }
      },
      // Enrage, Berserker Rage, Bloodrage, Death Wish and Bloodthirst: the next 3 melee attacks restore 0.5% of your health per rank.
      gore_drinker: {
        listen(game, r, on) {
          on("cast:success", ({ ability }) => {
            if (["berserker_rage", "bloodrage", "death_wish", "bloodthirst"].includes(ability.id)) applyAura(game, game.player, auras3.gore_drinker, { source: game.player, charges: 3 });
          });
          on("damage", (ev) => {
            if (ev.ctx.caster !== game.player || !ev.ctx.melee || ev.periodic || !["hit", "crit", "glance", "block"].includes(ev.res.outcome)) return;
            const a = findAura(game.player, "gore_drinker");
            if (!a || ev.ctx.goreDrunk) return;
            ev.ctx.goreDrunk = true;
            healPlayer(game, game.stats().maxHp * 5e-3 * r, { name: "Gore Drinker", icon: "ability_warrior_bloodfrenzy", self: true, ctx: { caster: game.player, ability: NO_THREAT_HEAL.gore_drinker } });
            useCharge(game, a);
          });
        }
      },
      booming_voice: { mods: (r) => [mult("cost", 1 - 0.05 * r, (ctx) => isAbility(ctx, "battle_shout", "piercing_howl"))] },
      cruelty: { mods: (r) => [add("critChance", 0.01 * r, (ctx) => !!ctx.melee)] },
      lingering_rage: { mods: (r) => [add("rageDecayDelay", 2 * r)] },
      unbridled_wrath: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!directMelee(game, ev) || !landedRes2(ev.res) || !withWeapon(ev.ctx)) return;
            if (game.rng() < 0.12 * r) game.resource.gain(game, game.player, 1);
          });
        }
      },
      furious_precision: { mods: (r) => [add("hitChance", [0.04, 0.07, 0.1][r - 1], (ctx) => !!ctx.melee && ctx.hand === "off")] },
      dual_wield_specialization: {
        mods: (r) => [
          mult("damageMult", 1 + 0.05 * r, (ctx) => !!ctx.melee && ctx.hand === "off"),
          mult("rageFromHit", 1 + 0.1 * r, (ctx) => ctx.hand === "off")
        ]
      },
      improved_execute: { mods: (r) => [add("cost", -[3, 5][r - 1], (ctx) => isAbility(ctx, "execute"))] },
      improved_berserker_rage: readByAbility,
      // Berserker Rage's rage, in abilities.js
      death_wish: { teaches: "death_wish" },
      reckless_swings: {
        teaches: "reckless_swings",
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!directMelee(game, ev) || !landedRes2(ev.res)) return;
            const a = findAura(game.player, "reckless_swings");
            if (a) {
              game.gainPower("rage", 5);
              useCharge(game, a);
            }
          });
        }
      },
      improved_whirlwind: {
        mods: (r) => [
          add("cooldown", -r, (ctx) => isAbility(ctx, "whirlwind")),
          mult("damageMult", 1 + 0.15 * r, (ctx) => isAbility(ctx, "whirlwind") && !!ctx.closest)
        ]
      },
      improved_intercept: { mods: (r) => [add("cooldown", -5 * r, (ctx) => isAbility(ctx, "intercept"))] },
      flurry: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (directMelee(game, ev) && ev.res.outcome === "crit") applyAura(game, game.player, auras3.flurry, { source: game.player, charges: 3 });
          });
          on("swing", ({ res }) => {
            const a = findAura(game.player, "flurry");
            if (a && !(res && res.outcome === "crit")) useCharge(game, a);
          });
        }
      },
      bloodthirst: { teaches: "bloodthirst" },
      deflection: { mods: (r) => [add("parryChance", 0.01 * r)] },
      /* ---------- Protection ---------- */
      improved_bloodrage: readByAbility,
      // Bloodrage's rage, in abilities.js and auras.js
      shield_specialization: {
        mods: (r) => [add("blockChance", 0.01 * r)],
        listen(game, r, on) {
          on("hitTaken", ({ res }) => {
            if (res.outcome === "block" && game.rng() < 0.2 * r) game.gainPower("rage", 5);
          });
        }
      },
      anticipation: { mods: (r) => [add("defense", 4 * r)] },
      master_of_defense: {
        listen(game, r, on) {
          on("hitTaken", ({ res }) => {
            if ((res.outcome === "dodge" || res.outcome === "parry") && warrior.weapons(game).shield && game.rng() < 0.5 * r) game.gainPower("rage", 5);
          });
        }
      },
      defiance: readByAbility,
      // Defensive Stance's threat, in auras.js
      improved_revenge: readByAbility,
      // Revenge's damage, in spellbook.js
      improved_shield_wall: { mods: (r) => [add("cooldown", -330 * r, (ctx) => isAbility(ctx, "shield_wall"))] },
      last_stand: { teaches: "last_stand" },
      improved_thunder_clap: { mods: (r) => [add("cost", -2 * r, (ctx) => isAbility(ctx, "thunder_clap"))] },
      improved_sunder_armor: { mods: (r) => [add("cost", -r, (ctx) => isAbility(ctx, "sunder_armor"))] },
      // Vanguard (Forever): Charge is usable in Defensive Stance too (still out of combat only).
      vanguard: { mods: () => [set("requiredForms", ["battle", "defensive"], (ctx) => isAbility(ctx, "charge"))] },
      concussion_blow: { teaches: "concussion_blow" },
      focused_rage: { mods: (r) => [add("cost", -r, (ctx) => offensive(ctx))] },
      bastion: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx, g) => !!warrior.weapons(g).shield)] },
      shield_slam: { teaches: "shield_slam" }
    }
  };

  // src/classes/paladin/talent-data.js
  var SOURCE4 = { site: "foreverchanges.pro/talents/paladin", build: "1.60.1.70790", extracted: "2026-11-05" };
  var trees4 = [
    {
      id: "holy",
      name: "Holy",
      icon: "spell_holy_holybolt",
      talents: [
        { id: "spiritual_focus", name: "Spiritual Focus", icon: "spell_arcane_blink", tier: 0, col: 1, max: 5, ranks: ["Gives your Flash of Light, Holy Light, and Light's Vigil spells a 14% chance to not lose casting time when you take damage.", "Gives your Flash of Light, Holy Light, and Light's Vigil spells a 28% chance to not lose casting time when you take damage.", "Gives your Flash of Light, Holy Light, and Light's Vigil spells a 42% chance to not lose casting time when you take damage.", "Gives your Flash of Light, Holy Light, and Light's Vigil spells a 56% chance to not lose casting time when you take damage.", "Gives your Flash of Light, Holy Light, and Light's Vigil spells a 70% chance to not lose casting time when you take damage."] },
        { id: "divine_strength", name: "Divine Strength", icon: "ability_golemthunderclap", tier: 0, col: 2, max: 5, ranks: ["Increases your Strength by 2%.", "Increases your Strength by 4%.", "Increases your Strength by 6%.", "Increases your Strength by 8%.", "Increases your Strength by 10%."] },
        { id: "healing_light", name: "Healing Light", icon: "spell_holy_holybolt", tier: 1, col: 0, max: 3, ranks: ["Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 4%.", "Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 8%.", "Increases the amount healed by your Holy Light, Flash of Light, and Holy Shock spells by 12%."] },
        { id: "reverence", name: "Reverence", icon: "spell_holy_divineillumination", tier: 1, col: 1, max: 2, ranks: ["Allows 15% of your Mana regeneration to continue while casting.", "Allows 30% of your Mana regeneration to continue while casting."] },
        { id: "improved_seals", name: "Improved Seals", icon: "ability_thunderbolt", tier: 1, col: 2, max: 5, ranks: ["Increases the damage done by your Seals and Judgements by 3%.", "Increases the damage done by your Seals and Judgements by 6%.", "Increases the damage done by your Seals and Judgements by 9%.", "Increases the damage done by your Seals and Judgements by 12%.", "Increases the damage done by your Seals and Judgements by 15%."] },
        { id: "purifying_power", name: "Purifying Power", icon: "spell_holy_purifyingpower", tier: 1, col: 3, max: 2, ranks: ["Reduces the mana cost of your Cleanse and Purify spells by 10% and reduces the cooldown of your Exorcism and Holy Wrath spells by 17%.", "Reduces the mana cost of your Cleanse and Purify spells by 20% and reduces the cooldown of your Exorcism and Holy Wrath spells by 33%."] },
        { id: "divine_favor", name: "Divine Favor", icon: "spell_holy_heal", tier: 2, col: 0, max: 1, active: true, ranks: ["When activated, gives your next Flash of Light, Holy Light, or Holy Shock spell a 100% critical effect chance."] },
        { id: "illumination", name: "Illumination", icon: "spell_holy_greaterheal", tier: 2, col: 1, max: 5, req: "reverence", ranks: ["After getting a critical effect from your Flash of Light, Holy Light, Light's Vigil, or Holy Shock heal spell you have a 20% chance to gain Mana equal to 50% of the base cost of the spell.", "After getting a critical effect from your Flash of Light, Holy Light, Light's Vigil, or Holy Shock heal spell you have a 40% chance to gain Mana equal to 50% of the base cost of the spell.", "After getting a critical effect from your Flash of Light, Holy Light, Light's Vigil, or Holy Shock heal spell you have a 60% chance to gain Mana equal to 50% of the base cost of the spell.", "After getting a critical effect from your Flash of Light, Holy Light, Light's Vigil, or Holy Shock heal spell you have a 80% chance to gain Mana equal to 50% of the base cost of the spell.", "After getting a critical effect from your Flash of Light, Holy Light, Light's Vigil, or Holy Shock heal spell you have a 100% chance to gain Mana equal to 50% of the base cost of the spell."] },
        { id: "holy_conduit", name: "Holy Conduit", icon: "spell_holy_devineaegis", tier: 2, col: 2, max: 2, ranks: ["Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and Hammer of Wrath spells by 20%.", "Reduces the mana cost of your Consecration, Holy Wrath, Exorcism, and Hammer of Wrath spells by 40%."] },
        { id: "divine_precision", name: "Divine Precision", icon: "spell_holy_mindsooth", tier: 3, col: 0, max: 2, ranks: ["Improves your chance to hit with Holy spells by 4%, and reduces the duration of Silence effects on you by 10%.", "Improves your chance to hit with Holy spells by 8%, and reduces the duration of Silence effects on you by 20%."] },
        { id: "infusion_of_light", name: "Infusion of Light", icon: "ability_paladin_infusionoflight", tier: 3, col: 1, max: 2, ranks: ["Your Holy Shock and Flash of Light critical hits reduce the cast time of your next Holy Light cast within 15 sec by 0.5 sec.", "Your Holy Shock and Flash of Light critical hits reduce the cast time of your next Holy Light cast within 15 sec by 1.0 sec."] },
        { id: "oath_of_light", name: "Oath of Light", icon: "spell_holy_greaterblessingoflight", tier: 3, col: 2, max: 1, active: true, ranks: ["Swear an Oath to protect target ally for 5 min, increasing the healing of your Holy Light on them by up to 400, your Flash of Light by up to 115, and your Holy Shock by up to 115. Only one Oath of Light may be sworn by the Paladin at any one time.\n\nSupposed numbers: the beta client shows 0 for all three (build 1.60.1.70707). The lab uses Blessing of Light's, which Oath of Light replaced."] },
        { id: "consecrated_ground", name: "Consecrated Ground", icon: "spell_holy_innerfire", tier: 4, col: 0, max: 2, ranks: ["Gives your Holy spells 5% increased damage against the first 4 enemies that enter your Consecration.", "Gives your Holy spells 10% increased damage against the first 4 enemies that enter your Consecration."] },
        { id: "holy_shock", name: "Holy Shock", icon: "spell_holy_searinglight", tier: 4, col: 1, max: 1, active: true, ranks: ["Blasts the target with Holy energy, causing 129 to 139 Holy damage to an enemy, or 110 to 118 healing to an ally."] },
        { id: "boundless_light", name: "Boundless Light", icon: "ability_paladin_sacredcleansing", tier: 4, col: 2, max: 2, req: "holy_shock", ranks: ["Increases the critical strike chance of your Holy Shock spell by 15% when cast on allies not affected by your Oath of Light.", "Increases the critical strike chance of your Holy Shock spell by 30% when cast on allies not affected by your Oath of Light."] },
        { id: "holy_power", name: "Holy Power", icon: "spell_holy_power", tier: 5, col: 2, max: 5, ranks: ["Increases the critical strike healing bonus of your Holy spells by 10%.", "Increases the critical strike healing bonus of your Holy spells by 20%.", "Increases the critical strike healing bonus of your Holy spells by 30%.", "Increases the critical strike healing bonus of your Holy spells by 40%.", "Increases the critical strike healing bonus of your Holy spells by 50%."] },
        { id: "lights_vigil", name: "Light's Vigil", icon: "ability_paladin_judgementofthepure", tier: 6, col: 1, max: 1, req: "holy_shock", active: true, ranks: ["Applies Light's Vigil to a friendly target for 30 sec. The caster's next Holy Shock on the target incurs no cooldown and heals the target and their party for 326 to 344. Only one Vigil per Paladin may be active in each party."] }
      ]
    },
    {
      id: "protection",
      name: "Protection",
      icon: "spell_holy_devotionaura",
      talents: [
        { id: "divine_intellect", name: "Divine Intellect", icon: "spell_nature_sleep", tier: 0, col: 1, max: 5, ranks: ["Increases your total Intellect by 2%.", "Increases your total Intellect by 4%.", "Increases your total Intellect by 6%.", "Increases your total Intellect by 8%.", "Increases your total Intellect by 10%."] },
        { id: "redoubt", name: "Redoubt", icon: "ability_defend", tier: 0, col: 2, max: 5, ranks: ["Damaging melee attacks against you have a 10% chance to increase your chance to block by 6%. Lasts 10 sec or 5 blocks.", "Damaging melee attacks against you have a 10% chance to increase your chance to block by 12%. Lasts 10 sec or 5 blocks.", "Damaging melee attacks against you have a 10% chance to increase your chance to block by 18%. Lasts 10 sec or 5 blocks.", "Damaging melee attacks against you have a 10% chance to increase your chance to block by 24%. Lasts 10 sec or 5 blocks.", "Damaging melee attacks against you have a 10% chance to increase your chance to block by 30%. Lasts 10 sec or 5 blocks."] },
        { id: "precision", name: "Precision", icon: "ability_rogue_ambush", tier: 1, col: 0, max: 3, ranks: ["Improves your chance to hit by 1%.", "Improves your chance to hit by 2%.", "Improves your chance to hit by 3%."] },
        { id: "guardians_favor", name: "Guardian's Favor", icon: "spell_holy_sealofprotection", tier: 1, col: 1, max: 2, ranks: ["Reduces the cooldown of your Blessing of Protection by 1 min and increases the duration of your Blessing of Freedom by 3 sec.", "Reduces the cooldown of your Blessing of Protection by 2 min and increases the duration of your Blessing of Freedom by 6 sec."] },
        { id: "sacred_duty", name: "Sacred Duty", icon: "spell_holy_divineintervention", tier: 1, col: 3, max: 2, ranks: ["Reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 30 sec, and reduces the duration of Forbearance by 5 sec.", "Reduces the cooldown of your Divine Shield, Divine Protection, and Templar's Bulwark spells by 60 sec, and reduces the duration of Forbearance by 10 sec."] },
        { id: "templars_bulwark", name: "Templar's Bulwark", icon: "ability_paladin_shieldofthetemplar", tier: 2, col: 0, max: 1, active: true, ranks: ["When activated, this ability grants you an absorb shield equal to 100% of your maximum health for 8 sec. Applies Forbearance for 1 min. Cannot be cast while Forbearance is active."] },
        { id: "improved_hammer_of_justice", name: "Improved Hammer of Justice", icon: "spell_holy_sealofmight", tier: 2, col: 1, max: 3, ranks: ["Decreases the cooldown of your Hammer of Justice spell by 5 sec.", "Decreases the cooldown of your Hammer of Justice spell by 10 sec.", "Decreases the cooldown of your Hammer of Justice spell by 15 sec."] },
        { id: "shield_specialization", name: "Shield Specialization", icon: "inv_shield_06", tier: 2, col: 2, max: 2, req: "redoubt", ranks: ["Increases the amount of damage absorbed by your shield by 15%, and gives your blocks a 50% chance to restore 4% of your maximum Mana. May only occur once every 3 sec.", "Increases the amount of damage absorbed by your shield by 30%, and gives your blocks a 100% chance to restore 4% of your maximum Mana. May only occur once every 3 sec."] },
        { id: "toughness", name: "Toughness", icon: "spell_holy_devotion", tier: 2, col: 3, max: 5, ranks: ["Increases your armor value from items by 2%.", "Increases your armor value from items by 4%.", "Increases your armor value from items by 6%.", "Increases your armor value from items by 8%.", "Increases your armor value from items by 10%."] },
        { id: "swift_judgement", name: "Swift Judgement", icon: "ability_paladin_judgementred", tier: 3, col: 0, max: 1, req: "templars_bulwark", active: true, ranks: ["Unleash the energy of a Seal spell upon an enemy. Does not consume the Seal. Refer to individual Seals for Judgement effect. Does not share a cooldown with your Judgement ability."] },
        { id: "improved_righteous_fury", name: "Improved Righteous Fury", icon: "spell_holy_sealoffury", tier: 3, col: 1, max: 3, ranks: ["While Righteous Fury is active, all damage taken is reduced by 3%.", "While Righteous Fury is active, all damage taken is reduced by 6%.", "While Righteous Fury is active, all damage taken is reduced by 9%."] },
        { id: "anticipation", name: "Anticipation", icon: "spell_magic_lesserinvisibilty", tier: 3, col: 2, max: 5, ranks: ["Increases your Defense Skill by 4.", "Increases your Defense Skill by 8.", "Increases your Defense Skill by 12.", "Increases your Defense Skill by 16.", "Increases your Defense Skill by 20."] },
        { id: "stoicism", name: "Stoicism", icon: "spell_holy_stoicism", tier: 4, col: 0, max: 2, ranks: ["Reduces the duration of Stun and Charm effects on you by 10%.", "Reduces the duration of Stun and Charm effects on you by 20%."] },
        { id: "holy_shield", name: "Holy Shield", icon: "spell_holy_blessingofprotection", tier: 4, col: 1, max: 1, active: true, ranks: ["Increases chance to block by 30% for 10 sec, and deals 75 Holy damage for each attack blocked while active. Damage caused by Holy Shield causes 20% additional threat. Each block expends a charge. 4 charges."] },
        { id: "reckoning", name: "Reckoning", icon: "spell_holy_blessingofstrength", tier: 4, col: 2, max: 5, ranks: ["Gives you a 8% chance after Blocking and a 20% chance after receiving a non-periodic critical strike to gain an extra attack. Stores up to 4 extra attacks. Cannot occur from Blocks more than once every 1.5 sec.", "Gives you a 16% chance after Blocking and a 40% chance after receiving a non-periodic critical strike to gain an extra attack. Stores up to 4 extra attacks. Cannot occur from Blocks more than once every 1.5 sec.", "Gives you a 24% chance after Blocking and a 60% chance after receiving a non-periodic critical strike to gain an extra attack. Stores up to 4 extra attacks. Cannot occur from Blocks more than once every 1.5 sec.", "Gives you a 32% chance after Blocking and a 80% chance after receiving a non-periodic critical strike to gain an extra attack. Stores up to 4 extra attacks. Cannot occur from Blocks more than once every 1.5 sec.", "Gives you a 40% chance after Blocking and a 100% chance after receiving a non-periodic critical strike to gain an extra attack. Stores up to 4 extra attacks. Cannot occur from Blocks more than once every 1.5 sec."] },
        { id: "iron_creed", name: "Iron Creed", icon: "spell_holy_improvedresistanceauras", tier: 5, col: 2, max: 3, ranks: ["Increases the threat generated by your Holy Strike ability by 10%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 2% for 6 sec.", "Increases the threat generated by your Holy Strike ability by 20%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 4% for 6 sec.", "Increases the threat generated by your Holy Strike ability by 30%. While Righteous Fury is active, Holy Strike also reduces your damage taken by 6% for 6 sec."] },
        { id: "shieldsworn", name: "Shieldsworn", icon: "spell_holy_greaterblessingofsanctuary", tier: 6, col: 1, max: 1, req: "holy_shield", ranks: ["Reduces the cooldown of your Holy Strike ability by 4 sec. Additionally, Holy Strike now strikes with your shield, triggering your active Holy Shield and Shield Specialization talents without consuming their charges or triggering their cooldowns, and allowing you to Block spells for 6 sec."] }
      ]
    },
    {
      id: "retribution",
      name: "Retribution",
      icon: "spell_holy_auraoflight",
      talents: [
        { id: "deflection", name: "Deflection", icon: "ability_parry", tier: 0, col: 1, max: 5, ranks: ["Increases your Parry chance by 1%.", "Increases your Parry chance by 2%.", "Increases your Parry chance by 3%.", "Increases your Parry chance by 4%.", "Increases your Parry chance by 5%."] },
        { id: "benediction", name: "Benediction", icon: "spell_frost_windwalkon", tier: 0, col: 2, max: 5, ranks: ["Reduces the Mana cost of all instant cast spells and abilities by 2%.", "Reduces the Mana cost of all instant cast spells and abilities by 4%.", "Reduces the Mana cost of all instant cast spells and abilities by 6%.", "Reduces the Mana cost of all instant cast spells and abilities by 8%.", "Reduces the Mana cost of all instant cast spells and abilities by 10%."] },
        { id: "improved_judgement", name: "Improved Judgement", icon: "spell_holy_righteousfury", tier: 1, col: 0, max: 2, ranks: ["Decreases the cooldown of your Judgement ability by 1 sec.", "Decreases the cooldown of your Judgement ability by 2 sec."] },
        { id: "conviction", name: "Conviction", icon: "spell_holy_retributionaura", tier: 1, col: 1, max: 3, ranks: ["Improves your chance to get a critical strike with all spells and attacks by 2%.", "Improves your chance to get a critical strike with all spells and attacks by 4%.", "Improves your chance to get a critical strike with all spells and attacks by 6%."] },
        { id: "sanctified_judgement", name: "Sanctified Judgement", icon: "ability_paladin_judgementblue", tier: 1, col: 2, max: 3, ranks: ["Gives your Judgement ability a 33% chance to return 20% of the Mana cost of the judged seal.", "Gives your Judgement ability a 66% chance to return 40% of the Mana cost of the judged seal.", "Gives your Judgement ability a 100% chance to return 60% of the Mana cost of the judged seal."] },
        { id: "vindication", name: "Vindication", icon: "spell_holy_vindication", tier: 2, col: 0, max: 3, ranks: ["Gives your damaging melee attacks a chance to reduce the target's Attack Power by 67 for 30 sec.", "Gives your damaging melee attacks a chance to reduce the target's Attack Power by 133 for 30 sec.", "Gives your damaging melee attacks a chance to reduce the target's Attack Power by 200 for 30 sec."] },
        { id: "unyielding_faith", name: "Unyielding Faith", icon: "spell_holy_unyieldingfaith", tier: 2, col: 1, max: 2, ranks: ["Reduces the duration of Fear and Disorient effects on you by 15%.", "Reduces the duration of Fear and Disorient effects on you by 30%."] },
        { id: "seal_of_command", name: "Seal of Command", icon: "ability_warrior_innerrage", tier: 2, col: 2, max: 1, active: true, ranks: ["Gives the Paladin a chance to deal additional Holy damage equal to 70% of normal weapon damage. Only one Seal can be active on the Paladin at any one time. Lasts 30 sec.\n\nUnleashing this Seal's energy will judge an enemy, instantly causing 69 to 73 Holy damage, 138 to 146 if the target is stunned or incapacitated."] },
        { id: "pursuit_of_justice", name: "Pursuit of Justice", icon: "spell_holy_persuitofjustice", tier: 2, col: 3, max: 2, ranks: ["Increases movement speed and mounted movement speed by 8%. This does not stack with other movement speed increasing effects.", "Increases movement speed and mounted movement speed by 15%. This does not stack with other movement speed increasing effects."] },
        { id: "eye_for_an_eye", name: "Eye for an Eye", icon: "spell_holy_eyeforaneye", tier: 3, col: 0, max: 2, ranks: ["All critical strikes against you cause 5% of the damage taken to the attacker as well. The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health.", "All critical strikes against you cause 10% of the damage taken to the attacker as well. The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health."] },
        { id: "sacred_arbiter", name: "Sacred Arbiter", icon: "inv_sword_08", tier: 3, col: 1, max: 1, ranks: ["Increases the damage of your Holy Strike ability by 20% and causes it to refresh all Judgement effects on the target."] },
        { id: "two_handed_weapon_specialization", name: "Two-Handed Weapon Specialization", icon: "inv_hammer_04", tier: 3, col: 3, max: 3, ranks: ["Increases the Physical and Holy damage you deal by 2%, and reduces all threat you generate by 7% while a two-handed melee weapon is equipped.", "Increases the Physical and Holy damage you deal by 4%, and reduces all threat you generate by 14% while a two-handed melee weapon is equipped.", "Increases the Physical and Holy damage you deal by 6%, and reduces all threat you generate by 20% while a two-handed melee weapon is equipped."] },
        { id: "turn_evil", name: "Turn Evil", icon: "spell_holy_turnundead", tier: 4, col: 0, max: 2, ranks: ["Reduces the cast time of your Turn Undead spell by 0.5 sec, its cooldown by 5 sec, and allows it to affect Demons.", "Reduces the cast time of your Turn Undead spell by 1.0 sec, its cooldown by 10 sec, and allows it to affect Demons."] },
        { id: "repentance", name: "Repentance", icon: "spell_holy_prayerofhealing", tier: 4, col: 1, max: 1, active: true, ranks: ["Puts the enemy target in a state of meditation, incapacitating them for up to 6 sec. Any damage caused will awaken the target. Only works against Humanoids."] },
        { id: "vengeance", name: "Vengeance", icon: "ability_racial_avatar", tier: 4, col: 2, max: 3, req: "seal_of_command", ranks: ["Increases your Physical and Holy damage dealt by 1% for 30 sec after landing a non-periodic critical strike. Stacks up to 5 times.", "Increases your Physical and Holy damage dealt by 2% for 30 sec after landing a non-periodic critical strike. Stacks up to 5 times.", "Increases your Physical and Holy damage dealt by 3% for 30 sec after landing a non-periodic critical strike. Stacks up to 5 times."] },
        { id: "champion_of_the_light", name: "Champion of the Light", icon: "ability_paladin_enlightenedjudgements", tier: 5, col: 2, max: 5, ranks: ["Increases your spell damage by up to 12% of your Intellect, and reduces the cast time of your Hammer of Wrath by 0.2 sec.", "Increases your spell damage by up to 24% of your Intellect, and reduces the cast time of your Hammer of Wrath by 0.4 sec.", "Increases your spell damage by up to 36% of your Intellect, and reduces the cast time of your Hammer of Wrath by 0.6 sec.", "Increases your spell damage by up to 48% of your Intellect, and reduces the cast time of your Hammer of Wrath by 0.8 sec.", "Increases your spell damage by up to 60% of your Intellect, and reduces the cast time of your Hammer of Wrath by 1.0 sec."] },
        { id: "unsealed_wrath", name: "Unsealed Wrath", icon: "spell_holy_blessedresillience", tier: 6, col: 1, max: 1, req: "repentance", ranks: ["Your melee attacks store a copy of your active Seal for 15 sec, stacking up to 3 times. Landing an attack with a different Seal consumes all stacks, giving the stored Seal its normal chance to activate once per stack."] }
      ]
    }
  ];

  // src/classes/paladin/talent-history.js
  var talentHistory4 = [
    {
      // 1.60.1.70707 (October 30): the three trees remade. Voice of Truth became Oath of Light, Improved Seal of Fury
      // became Shieldsworn and Twist of Light became Unsealed Wrath (same places in the client's trees); Instrument of
      // Law and One-Handed Weapon Specialization left; Divine Intellect went to Protection, Holy Conduit to Holy and
      // Unyielding Faith to Retribution; Reverence, Divine Precision and Shield Specialization went to 2 ranks, Iron Creed
      // and Conviction to 3.
      until: "1.60.1.70707",
      date: "October 30",
      order: [
        ["divine_strength", "divine_intellect", "healing_light", "spiritual_focus", "improved_seals", "unyielding_faith", "voice_of_truth", "reverence", "purifying_power", "infusion_of_light", "illumination", "divine_favor", "divine_precision", "holy_shock", "consecrated_ground", "holy_power", "lights_vigil"],
        ["toughness", "redoubt", "precision", "guardians_favor", "anticipation", "improved_seal_of_fury", "improved_righteous_fury", "shield_specialization", "sacred_duty", "swift_judgement", "one_handed_weapon_specialization", "improved_hammer_of_justice", "templars_bulwark", "reckoning", "iron_creed", "holy_shield"],
        ["deflection", "benediction", "improved_judgement", "holy_conduit", "conviction", "vindication", "sanctified_judgement", "seal_of_command", "pursuit_of_justice", "eye_for_an_eye", "sacred_arbiter", "two_handed_weapon_specialization", "vengeance", "repentance", "champion_of_the_light", "instrument_of_law", "twist_of_light"]
      ],
      renamed: { voice_of_truth: "oath_of_light", improved_seal_of_fury: "shieldsworn", twist_of_light: "unsealed_wrath" },
      removed: { instrument_of_law: "Instrument of Law", one_handed_weapon_specialization: "One-Handed Weapon Specialization" },
      names: { voice_of_truth: "Voice of Truth", improved_seal_of_fury: "Improved Seal of Fury", twist_of_light: "Twist of Light" }
    }
  ];

  // src/classes/paladin/spellbook-data.js
  var SPELLBOOK4 = [
    ["Holy Light", "spell_holy_holybolt", "holy", 660, 40, 2.5, 0, 0, "Heals a friendly target for 1495 to 1665."],
    ["Purify", "spell_holy_purify", "holy", "b8", 30, 0, 0, 0, "Purifies the friendly target, removing 1 disease effect and 1 poison effect."],
    ["Lay on Hands", "spell_holy_layonhands", "holy", 0, 40, 0, 1200, 0, "Heals a friendly target for an amount equal to the Paladin's maximum health and restores 550 of their mana. Drains all of the Paladin's remaining Mana when used, but does not interrupt Mana regeneration."],
    ["Flash of Light", "spell_holy_flashheal", "holy", 140, 40, 1.5, 0, 0, "Heals a friendly target for 292 to 325."],
    ["Turn Undead", "spell_holy_turnundead", "holy", 75, 20, 1.5, 30, 0, "The targeted undead enemy will be compelled to flee for up to 20 sec. Damage caused may interrupt the effect. Only one target can be turned at a time."],
    ["Seal of Light", "spell_holy_healingaura", "holy", 210, 0, 0, 0, 0, "Fills the Paladin with divine light for 30 sec, giving each melee attack a chance to heal the Paladin for 94. Only one Seal can be active on the Paladin at any one time. Unleashing this Seal's energy will judge an enemy for 40 sec, granting melee attacks made against the judged enemy a chance of healing the attacker for 61. Your melee strikes will refresh the spell's duration. Only one Judgement per Paladin can be active at any one time."],
    ["Seal of Wisdom", "spell_holy_righteousnessaura", "holy", 200, 0, 0, 0, 0, "Fills the Paladin with divine wisdom for 30 sec, giving each melee attack a chance to restore 90 of the Paladin's mana. Only one Seal can be active on the Paladin at any one time. Unleashing this Seal's energy will judge an enemy for 40 sec, granting attacks and spells used against the judged enemy a chance to restore 59 mana to the attacker. Your melee strikes will refresh the spell's duration. Only one Judgement per Paladin can be active at any one time."],
    ["Cleanse", "spell_holy_renew", "holy", "b8", 30, 0, 0, 0, "Cleanses a friendly target, removing 1 poison effect, 1 disease effect, and 1 magic effect."],
    ["Greater Blessing of Wisdom", "spell_holy_greaterblessingofwisdom", "holy", 250, 40, 0, 0, 0, "Gives all members of the raid or group that share the same class with the target the Greater Blessing of Wisdom, restoring 40 mana every 5 seconds for 1 hr. Players may only have one Blessing on them per Paladin at any one time."],
    ["Divine Protection", "spell_holy_restoration", "protection", 35, 0, 0, 300, 0, "You are protected from all physical attacks and spells for 8 sec, but during that time you cannot attack or use physical abilities yourself. Applies Forbearance for 1 min. Cannot be cast while Forbearance is active."],
    ["Blessing of Protection", "spell_holy_sealofprotection", "protection", "b7", 30, 0, 300, 0, "A targeted party member is protected from all physical attacks for 10 sec, but during that time they cannot attack or use physical abilities. Players may only have one Blessing on them per Paladin at any one time. Applies Forbearance for 1 min. Cannot be cast while Forbearance is active."],
    ["Righteous Fury", "spell_holy_sealoffury", "protection", "b30", 0, 0, 0, 0, "Increases all threat generated by 33%, and all threat generated by your Holy attacks by an additional 90%. Lasts 30 min."],
    ["Blessing of Freedom", "spell_holy_sealofvalor", "protection", "b10", 30, 0, 20, 0, "Places a Blessing on the friendly target, granting immunity to movement impairing effects for 10 sec. Players may only have one Blessing on them per Paladin at any one time."],
    ["Seal of Justice", "spell_holy_sealofwrath", "protection", "b13", 0, 0, 0, 0, "Fills the Paladin with the spirit of justice for 30 sec, giving each melee attack a chance to stun for 2 sec. Only one Seal can be active on the Paladin at any one time. Unleashing this Seal's energy will judge an enemy for 10 sec, preventing them from fleeing. Your melee strikes will refresh the spell's duration. Only one Judgement per Paladin can be active at any one time."],
    ["Divine Intervention", "spell_nature_timestop", "protection", 0, 40, 0, 3600, 0, "The paladin sacrifices himself to remove the targeted party member from harms way. Enemies will stop attacking the protected party member, who will be immune to all harmful attacks but cannot take any action for 3 min."],
    ["Divine Shield", "spell_holy_divineintervention", "protection", 110, 0, 0, 300, 0, "Protects the paladin from all damage and spells for 12 sec, but reduces all damage you deal by 50%. Applies Forbearance for 1 min. Cannot be cast while Forbearance is active."],
    ["Blessing of Sacrifice", "spell_holy_sealofsacrifice", "protection", 100, 30, 0, 0, 0, "Places a Blessing on the party member, transfering 55 damage taken per hit to the caster. Lasts 30 sec. Players may only have one Blessing on them per Paladin at any one time."],
    ["Greater Blessing of Kings", "spell_magic_greaterblessingofkings", "protection", 150, 40, 0, 0, 0, "Gives all members of the raid or group that share the same class with the target the Greater Blessing of Kings, increasing total stats by 10% for 1 hr. Players may only have one Blessing on them per Paladin at any one time."],
    ["Templar's Bulwark", "ability_paladin_shieldofthetemplar", "protection", 110, 0, 0, 300, 1, "When activated, this ability grants you an absorb shield equal to 100% of your maximum health for 8 sec. Applies Forbearance for 1 min. Cannot be cast while Forbearance is active."],
    ["Greater Blessing of Might", "spell_holy_greaterblessingofkings", "retribution", 260, 40, 0, 0, 0, "Gives all members of the raid or group that share the same class with the target the Greater Blessing of Might, increasing melee attack power by 133 for 1 hr. Players may only have one Blessing on them per Paladin at any one time."],
    ["Repentance", "spell_holy_prayerofhealing", "retribution", 60, 20, 0, 60, 1, "Puts the enemy target in a state of meditation, incapacitating them for up to 6 sec. Any damage caused will awaken the target. Only works against Humanoids."]
  ];

  // src/classes/paladin/abilities.js
  var OATH = { holy_light: 400, flash_of_light: 115, holy_shock: 115 };
  var melee3 = { range: "melee", target: "enemy", harmful: true };
  var holy = ["holy"];
  var ONE_HANDED = ["sword", "mace", "axe"];
  var basePct = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var undeadOrDemon = (t) => !!t && ["undead", "demon"].includes(t.creatureType);
  var NO_TYPE = "Only works on Undead and Demons (Enemy type, under Advanced)";
  var seal = (id, name, icon2, tree, cost, text, extra10 = {}) => ({
    id,
    name,
    icon: icon2,
    tree,
    schools: holy,
    target: "self",
    cost,
    seal: true,
    ...extra10,
    effects: [{ type: "applyAura", to: "self", aura: id }],
    text
  });
  var aura = (id, name, icon2, tree, text) => ({ id, name, icon: icon2, tree, schools: holy, target: "self", gcd: false, setsOption: ["aura", id], notSimulated: !["devotion_aura", "retribution_aura", "concentration_aura"].includes(id), effects: [{ type: "applyAura", to: "self", aura: id }], text });
  var abilities4 = [
    aura("devotion_aura", "Devotion Aura", "spell_holy_devotionaura", "protection", "Gives 735 additional armor to party members within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    aura("retribution_aura", "Retribution Aura", "spell_holy_auraoflight", "retribution", "Causes 20 Holy damage to any creature that strikes a party member within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    aura("concentration_aura", "Concentration Aura", "spell_holy_mindsooth", "protection", "Gives a 35% chance of ignoring spell interruption when damaged to all party members within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    aura("shadow_resistance_aura", "Shadow Resistance Aura", "spell_shadow_sealofkings", "protection", "Gives 60 additional Shadow resistance to all party and raid members within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    aura("frost_resistance_aura", "Frost Resistance Aura", "spell_frost_wizardmark", "protection", "Gives 60 additional Frost resistance to all party and raid members within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    aura("fire_resistance_aura", "Fire Resistance Aura", "spell_fire_sealoffire", "protection", "Gives 60 additional Fire resistance to all party and raid members within 30 yards. Players may only have one Aura on them per Paladin at any one time."),
    /* ---------- Holy ---------- */
    seal(
      "seal_of_righteousness",
      "Seal of Righteousness",
      "ability_thunderbolt",
      "holy",
      200,
      "Fills the Paladin with holy spirit for 30 sec, granting each melee attack an additional 23 to 76 Holy damage. Slower weapons cause more Holy damage per swing. Unleashing this Seal's energy will cause 170 to 186 Holy damage to an enemy."
    ),
    {
      id: "consecration",
      name: "Consecration",
      icon: "spell_holy_innerfire",
      tree: "holy",
      schools: holy,
      harmful: true,
      target: "self",
      cost: 565,
      cooldown: 8,
      effects: [{
        type: "custom",
        run: (g, ctx) => {
          const p = ctx.caster;
          g.emit("fx", { kind: "nova", x: p.x, y: p.y, r: 8, schools: holy });
          const hit2 = /* @__PURE__ */ new Set();
          const consecrate = (g2, z) => {
            for (const e of g2.enemies) {
              if (hit2.size >= 4) return;
              if (e.dead || hit2.has(e) || dist(z, e) > z.radius + e.radius) continue;
              hit2.add(e);
              applyAura(g2, e, g2.auraDef("consecration"), { source: p, duration: z.expires - g2.time, data: { ability: ctx.ability, castId: ctx.castId } });
            }
          };
          const zone = g.addZone({ kind: "area", x: p.x, y: p.y, radius: 8, duration: 8, period: 0.1, schools: holy, label: "Consecration", onTick: consecrate });
          consecrate(g, zone);
        }
      }],
      text: "Consecrates the land beneath the Paladin, doing 96 Holy damage over 8 sec to enemies who enter the area. The first 4 enemies who enter the area will take an additional 216 damage over 8 sec."
    },
    {
      id: "exorcism",
      name: "Exorcism",
      icon: "spell_holy_excorcism_02",
      tree: "holy",
      schools: holy,
      harmful: true,
      target: "enemy",
      range: 30,
      cost: 345,
      cooldown: 15,
      usable: (g, ctx) => undeadOrDemon(ctx.target) ? null : NO_TYPE,
      effects: [{ type: "damage", min: 475, max: 529, coef: 0.429 }],
      text: "Causes 475 to 529 Holy damage to an Undead or Demon target."
    },
    {
      id: "holy_shock",
      name: "Holy Shock",
      icon: "spell_holy_searinglight",
      tree: "holy",
      schools: holy,
      harmful: true,
      target: "enemy",
      range: 20,
      cost: 325,
      cooldown: 10,
      talent: "holy_shock",
      dual: true,
      tags: ["heal"],
      effects: [{
        type: "damage",
        min: 334,
        max: 362,
        coef: 0.429
        /* ESTIMATE: Classic coefficient */
      }],
      // On a friendly target: a heal, or with Light's Vigil on it (paladin.js sets ctx.vigil, no cooldown) a heal of its
      // whole party (ESTIMATE: 0.429 and 0.286, the client keeps them in spells it does not list).
      allyEffects: [
        { type: "heal", min: 307, max: 333, coef: 0.429, when: (g, ctx) => !ctx.vigil },
        { type: "party", radius: 40, when: (g, ctx) => !!ctx.vigil, effects: [{ type: "heal", min: 684, max: 724, coef: 0.286, name: "Holy Shock (Light's Vigil)" }] }
      ],
      text: "Blasts the target with Holy energy, causing 334 to 362 Holy damage to an enemy, or 307 to 333 healing to an ally."
    },
    {
      id: "lights_vigil",
      name: "Light's Vigil",
      icon: "ability_paladin_judgementofthepure",
      tree: "holy",
      schools: holy,
      harmful: false,
      target: "ally",
      range: 40,
      cost: 1340,
      castTime: 1.5,
      cooldown: 6,
      talent: "lights_vigil",
      tags: ["heal"],
      effects: [{ type: "applyAura", to: "target", aura: "lights_vigil" }],
      text: "Applies Light's Vigil to a friendly target for 30 sec. The caster's next Holy Shock on the target incurs no cooldown and heals the target and their party for 684 to 724. Only one Vigil per Paladin may be active in each party."
    },
    {
      // Oath of Light (1.60.1.70707) took the place of Blessing of Light, which left the game in the same build. The client
      // gives its three bonuses as 0: the lab SUPPOSES Blessing of Light's numbers (400 for Holy Light, 115 for Flash of
      // Light) and the same 115 for Holy Shock, an instant heal with Flash of Light's coefficient.
      id: "oath_of_light",
      name: "Oath of Light",
      icon: "spell_holy_greaterblessingoflight",
      tree: "holy",
      schools: holy,
      harmful: false,
      target: "ally",
      range: 40,
      cost: basePct(0.08),
      talent: "oath_of_light",
      tags: ["heal"],
      effects: [
        { type: "custom", run: (g, ctx) => {
          for (const u of [g.player, ...g.allies || []]) for (const a of u.auras.slice()) if (a.id === "oath_of_light" && a.source === g.player && u !== ctx.target) removeAura(g, a, "replaced");
        } },
        { type: "applyAura", to: "target", aura: "oath_of_light" }
      ],
      text: `Swear an Oath to protect target ally for 5 min, increasing the healing of your Holy Light on them by up to ${OATH.holy_light}, your Flash of Light by up to ${OATH.flash_of_light}, and your Holy Shock by up to ${OATH.holy_shock}. Only one Oath of Light may be sworn by the Paladin at any one time.

Supposed numbers: the beta client shows 0 for all three (build 1.60.1.70707). The lab uses Blessing of Light's, which Oath of Light replaced.`
    },
    {
      id: "hammer_of_wrath",
      name: "Hammer of Wrath",
      icon: "ability_thunderclap",
      tree: "holy",
      schools: holy,
      harmful: true,
      target: "enemy",
      range: 30,
      cost: 425,
      castTime: 1,
      cooldown: 6,
      usable: (g, ctx) => ctx.target && ctx.target.hp <= ctx.target.maxHp * 0.2 ? null : "Only usable on enemies that have 20% or less health",
      effects: [{ type: "damage", min: 474, max: 522, coef: 0.429 }],
      text: "Hurls a hammer that strikes an enemy for 474 to 522 Holy damage. Only usable on enemies that have 20% or less health."
    },
    {
      id: "holy_wrath",
      name: "Holy Wrath",
      icon: "spell_holy_excorcism",
      tree: "holy",
      schools: holy,
      harmful: true,
      target: "self",
      cost: 805,
      castTime: 2,
      cooldown: 60,
      usable: (g) => g.enemies.some((e) => !e.dead && undeadOrDemon(e)) ? null : NO_TYPE,
      effects: [{ type: "aoeDamage", center: "self", radius: 20, min: 490, max: 576, coef: 0.286, targetFilter: (g, e) => undeadOrDemon(e), onHit: [{ type: "applyAura", to: "target", aura: "holy_wrath_stun" }] }],
      text: "Sends bolts of holy power in all directions, causing 490 to 576 Holy damage to all Undead and Demon targets within 20 yds and stunning them for 2 sec."
    },
    {
      id: "blessing_of_wisdom",
      name: "Blessing of Wisdom",
      icon: "spell_holy_sealofwisdom",
      tree: "holy",
      schools: holy,
      target: "self",
      cost: 125,
      effects: [{ type: "applyAura", to: "self", aura: "blessing_of_wisdom" }],
      text: "Places a Blessing on the friendly target, restoring 40 mana every 5 seconds for 1 hr. Players may only have one Blessing on them per Paladin at any one time."
    },
    {
      id: "divine_favor",
      name: "Divine Favor",
      icon: "spell_holy_heal",
      tree: "holy",
      schools: holy,
      target: "self",
      cost: basePct(0.04),
      cooldown: 120,
      gcd: false,
      talent: "divine_favor",
      effects: [{ type: "applyAura", to: "self", aura: "divine_favor" }],
      text: "When activated, gives your next Flash of Light, Holy Light, or Holy Shock spell a 100% critical effect chance."
    },
    /* ---------- Protection ---------- */
    seal(
      "seal_of_fury",
      "Seal of Fury",
      "spell_holy_retributionaura",
      "protection",
      200,
      "Fills the Paladin with divine fury for 30 sec, causing melee attacks to deal an additional 35 Holy damage. While a shield is equipped, each attack also grants an absorb shield equal to 50% of the Holy damage dealt. Unleashing this Seal's energy inflicts 154 to 167 Holy damage to an enemy and taunts the target to attack you for 3 sec."
    ),
    {
      id: "hammer_of_justice",
      name: "Hammer of Justice",
      icon: "spell_holy_sealofmight",
      tree: "protection",
      schools: holy,
      harmful: true,
      startsAttack: true,
      target: "enemy",
      range: 10,
      cost: 100,
      cooldown: 60,
      effects: [{ type: "applyAura", to: "target", aura: "hammer_of_justice" }],
      text: "Stuns the target for 6 sec."
    },
    {
      id: "hammer_of_the_righteous",
      name: "Hammer of the Righteous",
      icon: "ability_paladin_hammeroftherighteous",
      tree: "protection",
      ...melee3,
      schools: holy,
      cost: basePct(0.06),
      cooldown: 6,
      requires: { mainHand: ONE_HANDED },
      // 3 x the main hand's damage per second, as Holy damage (no armor), on the target and up to 3 more nearby.
      effects: [{ type: "aoeMelee", center: "target", radius: 8, maxTargets: 4, fx: false, dynamic: (g) => {
        const w = g.cls.weapons(g).main;
        const n = w ? 3 * (w.min + w.max) / 2 / w.speed : 0;
        return { min: n, max: n };
      } }],
      text: "Hammer the current target and up to 3 additional nearby targets, causing Holy damage to each equal to 3 times the damage per second of your main hand weapon. Requires a one-handed axe, mace or sword."
    },
    {
      id: "blessing_of_kings",
      name: "Blessing of Kings",
      icon: "spell_magic_magearmor",
      tree: "protection",
      schools: holy,
      target: "self",
      cost: basePct(0.08),
      effects: [{ type: "applyAura", to: "self", aura: "blessing_of_kings" }],
      text: "Places a Blessing on the friendly target, increasing total stats by 10% for 1 hr. Players may only have one Blessing on them per Paladin at any one time."
    },
    {
      id: "holy_shield",
      name: "Holy Shield",
      icon: "spell_holy_blessingofprotection",
      tree: "protection",
      schools: holy,
      target: "self",
      cost: 240,
      cooldown: 10,
      talent: "holy_shield",
      requires: { shield: true },
      threatMult: 1.2,
      effects: [{ type: "applyAura", to: "self", aura: "holy_shield", charges: 4 }],
      text: "Increases chance to block by 30% for 10 sec, and deals 221 Holy damage for each attack blocked while active. Damage caused by Holy Shield causes 20% additional threat. Each block expends a charge. 4 charges."
    },
    {
      // A second Judgement with its own cooldown and no mana cost (1.60.1.70707).
      id: "swift_judgement",
      name: "Swift Judgement",
      icon: "ability_paladin_judgementred",
      tree: "protection",
      schools: holy,
      harmful: true,
      startsAttack: true,
      target: "enemy",
      range: 10,
      cooldown: 60,
      talent: "swift_judgement",
      usableFirst: (g) => g.player.auras.some((a) => a.def.exclusive === "seal") ? null : "You have no Seal active",
      // before "Out of range"
      effects: [{ type: "custom", run: (g, ctx) => g.cls.judge(g, ctx) }],
      text: "Unleash the energy of a Seal spell upon an enemy. Does not consume the Seal. Refer to individual Seals for Judgement effect. Does not share a cooldown with your Judgement ability."
    },
    /* ---------- Retribution ---------- */
    {
      id: "blessing_of_might",
      name: "Blessing of Might",
      icon: "spell_holy_fistofjustice",
      tree: "retribution",
      schools: holy,
      target: "self",
      cost: 130,
      effects: [{ type: "applyAura", to: "self", aura: "blessing_of_might" }],
      text: "Places a Blessing on the friendly target, increasing melee attack power by 133 for 1 hr. Players may only have one Blessing on them per Paladin at any one time."
    },
    {
      id: "judgement",
      name: "Judgement",
      icon: "spell_holy_righteousfury",
      tree: "retribution",
      schools: holy,
      harmful: true,
      startsAttack: true,
      target: "enemy",
      range: 10,
      cost: basePct(0.06),
      cooldown: 10,
      usableFirst: (g) => g.player.auras.some((a) => a.def.exclusive === "seal") ? null : "You have no Seal active",
      // before "Out of range"
      effects: [{ type: "custom", run: (g, ctx) => g.cls.judge(g, ctx) }],
      text: "Unleash the energy of a Seal spell upon an enemy. Does not consume the Seal. Refer to individual Seals for Judgement effect."
    },
    {
      id: "holy_strike",
      name: "Holy Strike",
      icon: "classicon_paladin",
      tree: "retribution",
      ...melee3,
      schools: holy,
      cost: 20,
      cooldown: 10,
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 0.5, spCoef: 0.429, dynamic: (g) => ({ flat: g.rng.range(81, 105) }) }],
      text: "An instant strike that causes 50% weapon damage plus an additional 81 to 105 as Holy damage."
    },
    seal(
      "seal_of_the_crusader",
      "Seal of the Crusader",
      "spell_holy_holysmite",
      "retribution",
      160,
      "Fills the Paladin with the spirit of a crusader for 30 sec, granting 325 melee attack power. The Paladin also attacks 40% faster, but deals less damage with each attack. Unleashing this Seal's energy will judge an enemy for 40 sec, increasing Holy damage taken by up to 161. Your melee strikes will refresh the spell's duration."
    ),
    seal(
      "seal_of_command",
      "Seal of Command",
      "ability_warrior_innerrage",
      "retribution",
      210,
      "Gives the Paladin a chance to deal additional Holy damage equal to 70% of normal weapon damage. Only one Seal can be active on the Paladin at any one time. Lasts 30 sec. Unleashing this Seal's energy will judge an enemy, instantly causing 169.5 to 186.5 Holy damage, 339 to 373 if the target is stunned or incapacitated.",
      { talent: "seal_of_command" }
    )
  ];

  // src/classes/paladin/spellbook.js
  var seal2 = { exclusive: "seal", seal: true };
  var heal = { notSimulated: false, schools: ["holy"], target: "ally", range: 40, harmful: false, tags: ["heal"] };
  var forbearance = { usable: (g) => findAura(g.player, "forbearance") ? "Cannot be cast while Forbearance is active" : null };
  var withForbearance = (aura2) => [{ type: "applyAura", to: "self", aura: aura2 }, { type: "applyAura", to: "self", aura: "forbearance" }];
  var blessing = { exclusive: "blessing", duration: 3600 };
  var extra4 = spellbookAbilities(SPELLBOOK4, {
    known: new Set(abilities4.map((a) => a.name)),
    talents: new Set(trees4.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      greater_blessing_of_might: { notSimulated: false },
      greater_blessing_of_kings: { notSimulated: false },
      greater_blessing_of_wisdom: { notSimulated: false },
      seal_of_light: { seal: true },
      seal_of_wisdom: { seal: true },
      seal_of_justice: { seal: true },
      righteous_fury: { notSimulated: false, setsOption: ["righteousFury", "on"] },
      // Repentance (talent): incapacitates a Humanoid for 6 sec, broken by damage (the enemy type is under Advanced).
      repentance: { notSimulated: false, harmful: true, schools: ["holy"], usable: (g, ctx) => (ctx.target || {}).creatureType === "humanoid" ? null : "Only works on Humanoids (Enemy type, under Advanced)", effects: [{ type: "applyAura", to: "target", aura: "repentance", spellHit: true }] },
      purify: cure(["poison", "disease"]),
      cleanse: cure(["poison", "disease", "magic"]),
      holy_light: { ...heal, effects: [{ type: "heal", min: 1495, max: 1665, coef: 0.714 }] },
      flash_of_light: { ...heal, effects: [{ type: "heal", min: 292, max: 325, coef: 0.429 }] },
      // Heals for the Paladin's maximum health and drains the Paladin's mana.
      lay_on_hands: { ...heal, effects: [{ type: "heal", fixed: (g) => g.stats().maxHp }, { type: "custom", run: (g) => {
        g.player.res.mana.power = 0;
      } }] },
      divine_protection: { notSimulated: false, ...forbearance, effects: withForbearance("divine_protection") },
      divine_shield: { notSimulated: false, ...forbearance, effects: withForbearance("divine_shield") },
      blessing_of_protection: { notSimulated: false, ...forbearance, target: "self", effects: withForbearance("blessing_of_protection") },
      templars_bulwark: {
        notSimulated: false,
        gcd: false,
        ...forbearance,
        effects: [{ type: "absorb", aura: "templars_bulwark", amount: (g) => g.stats().maxHp }, { type: "applyAura", to: "self", aura: "forbearance" }]
      }
    },
    auraOverrides: {
      repentance: { flags: { breaksOnDamage: true, stunned: true }, desc: () => "Incapacitated. Any damage will awaken the target." },
      righteous_fury: {
        notSimulated: false,
        // 1.60.1.70707: 33% more threat from everything, and Holy attacks 90% more on top. ESTIMATE: the two add up
        // (x 2.23 for Holy, x 1.33 for the rest); the tooltip does not say whether they multiply.
        mods: (a, g) => [mult("threatMult", (ctx) => hasSchool(ctx, "holy") ? 2.23 : 1.33), mult("damageTaken", 1 - 0.03 * g.rank("improved_righteous_fury"))],
        desc: (a, g) => `Threat increased by 33%, and by 90% more from Holy attacks.${g.rank("improved_righteous_fury") ? ` Damage taken reduced by ${3 * g.rank("improved_righteous_fury")}%.` : ""}`
      },
      divine_protection: { notSimulated: false, flags: { immune: true }, mods: () => [{ key: "noAttack", fn: () => true }], desc: () => "Immune to physical attacks and spells. Cannot attack or use physical abilities." },
      divine_shield: { notSimulated: false, flags: { immune: true }, mods: () => [mult("damageMult", 0.5)], desc: () => "Immune to all damage. Damage dealt reduced by 50%." },
      blessing_of_protection: { notSimulated: false, flags: { immunePhysical: true }, mods: () => [{ key: "noAttack", fn: () => true }], desc: () => "Immune to physical attacks. Cannot attack or use physical abilities." },
      templars_bulwark: { notSimulated: false, absorb: true, desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage.` },
      seal_of_light: seal2,
      seal_of_wisdom: seal2,
      seal_of_justice: seal2,
      greater_blessing_of_might: { ...blessing, notSimulated: false, mods: () => [add("attackPower", 133)], desc: () => "Melee attack power increased by 133." },
      greater_blessing_of_wisdom: { ...blessing, notSimulated: false, mods: () => [add("mp5", 40)], desc: () => "Restores 40 mana every 5 seconds." },
      greater_blessing_of_kings: { ...blessing, notSimulated: false, mods: () => [{ key: "attributes", fn: (a) => ({ str: a.str * 1.1, agi: a.agi * 1.1, sta: a.sta * 1.1, int: a.int * 1.1, spi: a.spi * 1.1 }) }], desc: () => "Total stats increased by 10%." }
    }
  });

  // src/classes/paladin/auras.js
  var holyOrPhysical = (ctx) => hasSchool(ctx, "holy") || hasSchool(ctx, "physical") || !!ctx.melee;
  var stun3 = (id, name, icon2, duration) => ({ id, name, icon: icon2, kind: "debuff", duration, flags: { stunned: true }, desc: () => "Stunned." });
  var seal3 = (id, name, icon2, desc, extra10 = {}) => ({ id, name, icon: icon2, kind: "buff", duration: 30, exclusive: "seal", seal: true, desc, ...extra10 });
  var blessing2 = (id, name, icon2, desc, extra10 = {}) => ({ id, name, icon: icon2, kind: "buff", duration: 3600, exclusive: "blessing", desc, ...extra10 });
  var auras4 = {
    /* ---------- Seals (their hits are in paladin.js) ---------- */
    seal_of_righteousness: seal3("seal_of_righteousness", "Seal of Righteousness", "ability_thunderbolt", () => "Melee attacks deal additional Holy damage."),
    seal_of_command: seal3("seal_of_command", "Seal of Command", "ability_warrior_innerrage", () => "Melee attacks have a chance to deal additional Holy damage equal to 70% of weapon damage."),
    seal_of_fury: seal3("seal_of_fury", "Seal of Fury", "spell_holy_retributionaura", () => "Melee attacks deal an additional 35 Holy damage."),
    seal_of_the_crusader: seal3("seal_of_the_crusader", "Seal of the Crusader", "spell_holy_holysmite", () => "Melee attack power increased by 325. Attacks 40% faster, but deals less damage with each attack.", {
      // Classic: 40% faster swings, each one hitting for 1 / 1.4 of the damage, so white damage stays the same while
      // the attack power and anything that procs on a hit gain.
      mods: () => [add("attackPower", 325), mult("attackSpeed", 1.4), mult("damageMult", 1 / 1.4, (ctx) => !!ctx.white)]
    }),
    // Unsealed Wrath: copies of the Seal your melee attacks landed with, up to 3 (paladin.js).
    unsealed_wrath: { id: "unsealed_wrath", name: "Unsealed Wrath", icon: "spell_holy_blessedresillience", kind: "buff", duration: 15, maxStacks: 3, desc: (a) => `${a.stacks} stored ${a.stacks > 1 ? "copies" : "copy"} of ${a.data.sealName || "your Seal"}. An attack with a different Seal sets them off.` },
    /* ---------- Auras (one at a time). Devotion and Retribution Aura matter when the fight hits back (Tank test),
       Concentration Aura when you are hit while casting: the resistance auras do nothing in the lab. ---------- */
    devotion_aura: { id: "devotion_aura", name: "Devotion Aura", icon: "spell_holy_devotionaura", kind: "buff", exclusive: "paladin_aura", duration: Infinity, mods: () => [add("armor", 735)], desc: () => "Armor increased by 735." },
    // Concentration Aura: a 35% chance to keep the casting time when damage gets through.
    concentration_aura: { id: "concentration_aura", name: "Concentration Aura", icon: "spell_holy_mindsooth", kind: "buff", exclusive: "paladin_aura", duration: Infinity, mods: () => [focus(0.35)], desc: () => "35% chance to ignore spell interruption when damaged." },
    retribution_aura: { id: "retribution_aura", name: "Retribution Aura", icon: "spell_holy_auraoflight", kind: "buff", exclusive: "paladin_aura", duration: Infinity, desc: () => "Deals 20 Holy damage to attackers who hit you in melee." },
    ...Object.fromEntries([
      ["shadow_resistance_aura", "Shadow Resistance Aura", "spell_shadow_sealofkings", "Shadow resistance increased by 60."],
      ["frost_resistance_aura", "Frost Resistance Aura", "spell_frost_wizardmark", "Frost resistance increased by 60."],
      ["fire_resistance_aura", "Fire Resistance Aura", "spell_fire_sealoffire", "Fire resistance increased by 60."]
    ].map(([id, name, icon2, d]) => [id, { id, name, icon: icon2, kind: "buff", exclusive: "paladin_aura", duration: Infinity, notSimulated: true, desc: () => d }])),
    /* ---------- Blessings ---------- */
    blessing_of_might: blessing2("blessing_of_might", "Blessing of Might", "spell_holy_fistofjustice", () => "Melee attack power increased by 133.", { mods: () => [add("attackPower", 133)] }),
    blessing_of_wisdom: blessing2("blessing_of_wisdom", "Blessing of Wisdom", "spell_holy_sealofwisdom", () => "Restores 40 mana every 5 seconds.", { mods: () => [add("mp5", 40)] }),
    blessing_of_kings: blessing2("blessing_of_kings", "Blessing of Kings", "spell_magic_magearmor", () => "Total stats increased by 10%.", {
      mods: () => [{ key: "attributes", fn: (a) => ({ str: a.str * 1.1, agi: a.agi * 1.1, sta: a.sta * 1.1, int: a.int * 1.1, spi: a.spi * 1.1 }) }]
    }),
    /* ---------- other buffs ---------- */
    divine_favor: { id: "divine_favor", name: "Divine Favor", icon: "spell_holy_heal", kind: "buff", desc: () => "Your next Holy Shock is a critical effect." },
    holy_shield: { id: "holy_shield", name: "Holy Shield", icon: "spell_holy_blessingofprotection", kind: "buff", duration: 10, charges: 4, mods: () => [add("blockChance", 0.3)], desc: (a) => `Block chance increased by 30%. Each block deals 221 Holy damage to the attacker (${a.charges} left).` },
    // Seal of Fury with a shield: half of its Holy damage becomes an absorb shield. ESTIMATE: it lasts 15 sec from the
    // last hit and keeps adding up (the tooltip gives no duration or cap).
    seal_of_fury_shield: { id: "seal_of_fury_shield", name: "Seal of Fury", icon: "spell_holy_retributionaura", kind: "buff", duration: 15, absorb: true, desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage.` },
    redoubt: {
      id: "redoubt",
      name: "Redoubt",
      icon: "ability_defend",
      kind: "buff",
      duration: 10,
      charges: 5,
      mods: (a, g) => [add("blockChance", 0.06 * g.rank("redoubt"))],
      desc: (a, g) => `Block chance increased by ${6 * g.rank("redoubt")}% for ${a.charges} more blocks.`
    },
    reckoning: { id: "reckoning", name: "Reckoning", icon: "spell_holy_blessingofstrength", kind: "buff", duration: Infinity, maxStacks: 4, desc: (a) => `Your next melee swing gives ${a.stacks} extra attack${a.stacks > 1 ? "s" : ""}.` },
    iron_creed: {
      id: "iron_creed",
      name: "Iron Creed",
      icon: "inv_shield_06",
      kind: "buff",
      duration: 6,
      mods: (a, g) => [mult("damageTaken", 1 - 0.02 * g.rank("iron_creed"))],
      desc: (a, g) => `Damage taken reduced by ${2 * g.rank("iron_creed")}%.`
    },
    infusion_of_light: {
      id: "infusion_of_light",
      name: "Infusion of Light",
      icon: "ability_paladin_infusionoflight",
      kind: "buff",
      duration: 15,
      mods: (a, g) => [add("castTime", -0.5 * g.rank("infusion_of_light"), (ctx) => isAbility(ctx, "holy_light"))],
      desc: (a, g) => `Your next Holy Light casts ${0.5 * g.rank("infusion_of_light")} sec faster.`
    },
    forbearance: { id: "forbearance", name: "Forbearance", icon: "spell_holy_removecurse", kind: "debuff", duration: 60, desc: () => "Cannot be protected by Divine Shield, Divine Protection, Blessing of Protection or Templar's Bulwark." },
    vengeance: {
      id: "vengeance",
      name: "Vengeance",
      icon: "ability_racial_avatar",
      kind: "buff",
      duration: 30,
      maxStacks: 5,
      // 5 stacks: launch notes (was 3)
      mods: (a, g) => [mult("damageMult", 1 + 0.01 * g.rank("vengeance") * a.stacks, holyOrPhysical)],
      desc: (a, g) => `Physical and Holy damage increased by ${g.rank("vengeance") * a.stacks}%.`
    },
    // Vindication (1.60.1.70707): only the enemy's attack power goes down now (the Paladin's own bonus is gone).
    vindication: {
      id: "vindication",
      name: "Vindication",
      icon: "spell_holy_vindication",
      kind: "debuff",
      duration: 30,
      enemy: (a) => ({ ap: a.data.ap || 0 }),
      // data.ap: 67 per rank, set when applied (paladin.js)
      desc: (a) => `Attack power reduced by ${a.data.ap || 0}.`
    },
    /* ---------- debuffs on the target ---------- */
    judgement_of_the_crusader: {
      id: "judgement_of_the_crusader",
      name: "Judgement of the Crusader",
      icon: "spell_holy_holysmite",
      kind: "debuff",
      duration: 40,
      // "Holy damage taken increased by up to 161": spell damage taken, so each Holy hit gains 161 x its coefficient.
      sourceMods: () => [add("spellPower", 161, (ctx) => hasSchool(ctx, "holy"))],
      desc: () => "Holy damage taken increased by up to 161."
    },
    consecration: { id: "consecration", name: "Consecration", icon: "spell_holy_innerfire", kind: "debuff", schools: ["holy"], dot: {
      period: 1,
      ticks: 8,
      base: 312,
      coef: 0.333
      /* ESTIMATE: Classic */
    } },
    lights_vigil: { id: "lights_vigil", name: "Light's Vigil", icon: "ability_paladin_judgementofthepure", kind: "buff", duration: 30, desc: () => "The Paladin's next Holy Shock on this target has no cooldown and heals their whole party." },
    // Oath of Light on a friend: the Paladin's Holy Light, Flash of Light and Holy Shock heal it for more (SUPPOSED numbers).
    oath_of_light: {
      id: "oath_of_light",
      name: "Oath of Light",
      icon: "spell_holy_greaterblessingoflight",
      kind: "buff",
      duration: 300,
      sourceMods: () => [add("healBonus", (ctx) => OATH[ctx.ability.id] || 0, (ctx) => !!ctx.heal && !ctx.periodic && isAbility(ctx, "holy_light", "flash_of_light", "holy_shock"))],
      desc: () => `Holy Light heals for up to ${OATH.holy_light} more, Flash of Light and Holy Shock for up to ${OATH.flash_of_light} more (supposed numbers: the client shows 0).`
    },
    hammer_of_justice: stun3("hammer_of_justice", "Hammer of Justice", "spell_holy_sealofmight", 6),
    holy_wrath_stun: stun3("holy_wrath_stun", "Holy Wrath", "spell_holy_excorcism", 2)
  };

  // src/classes/paladin/presets.js
  var gearRoles2 = { melee: "Melee", tank: "Tank", healer: "Healer" };
  var melee4 = (tier, name, blurb, gear) => ({ id: tier, tier, role: "melee", name, blurb, gear: { defense: 0, heal: 0, ...gear } });
  var healer = (tier, name, blurb, gear) => ({ id: `${tier}_healer`, tier, role: "healer", name, blurb, gear: { ap: 0, hit: 0, haste: 0, wdps2h: 0, defense: 0, ...gear } });
  var tank2 = (tier, name, blurb, gear) => ({ id: `${tier}_tank`, tier, role: "tank", name, blurb, gear: { haste: 0, wdps2h: 0, heal: 0, ...gear } });
  var gearPresets4 = [
    melee4("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { str: 80, agi: 40, sta: 90, int: 60, spi: 30, ap: 0, sp: 0, crit: 0.01, hit: 0.01, mp5: 0, haste: 0, wdps2h: 50, wdps: 38, block: 30, armor: 2800 }),
    melee4("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { str: 200, agi: 70, sta: 114, int: 4, spi: 10, ap: 110, sp: 0, crit: 0.08, hit: 0.079, parry: 0.01, mp5: 0, haste: 0, wdps2h: 59, wdps: 46, block: 60, armor: 3788 }),
    healer("fresh", "Fresh 60", "Quest and dungeon plate and mail for healing.", { str: 40, agi: 20, sta: 110, int: 140, spi: 50, sp: 0, heal: 150, crit: 0.01, mp5: 6, armor: 3800, wdps: 38, block: 30 }),
    healer("preraid", "Pre-raid", "Best dungeon, quest and crafted healing gear before raids.", { str: 4, agi: 4, sta: 62, int: 118, spi: 105, sp: 29, heal: 719, crit: 0, mp5: 5, armor: 3834, wdps: 15, block: 40 }),
    tank2("fresh", "Fresh 60", "Quest and dungeon plate with a shield.", { str: 70, agi: 40, sta: 210, int: 90, spi: 20, ap: 0, sp: 40, crit: 0.01, hit: 0.02, mp5: 3, armor: 4800, defense: 15, wdps: 40, block: 35 }),
    tank2("preraid", "Pre-raid", "Best dungeon, quest and crafted tank gear before raids.", { str: 108, agi: 59, sta: 217, int: 0, spi: 5, ap: 22, sp: 0, crit: 0.01, hit: 0, dodge: 0.08, parry: 0.02, mp5: 0, armor: 6032, defense: 61, wdps: 41, block: 55 })
  ];
  var builds4 = [
    {
      id: "holy",
      name: "Holy",
      points: "32/14/5",
      gearRole: "healer",
      scenario: "raid-healing",
      blurb: "A healer build for the Healing test: Oath of Light on the tank (Holy Light, Flash of Light and Holy Shock heal it for more), Holy Light on the tank, Flash of Light for cheap top-ups, Holy Shock from 20 yards; Light's Vigil on a friend turns the next Holy Shock into a heal for their whole party. Illumination gives mana back on crits, Divine Favor makes one heal crit. Lay on Hands when someone is about to die.",
      options: { mainHand: "mace", offHand: "shield", blessing: "wisdom", righteousFury: "auto", aura: "concentration_aura" },
      talents: {
        spiritual_focus: 5,
        healing_light: 3,
        reverence: 2,
        purifying_power: 2,
        divine_favor: 1,
        illumination: 5,
        divine_precision: 2,
        infusion_of_light: 2,
        oath_of_light: 1,
        holy_shock: 1,
        boundless_light: 2,
        holy_power: 5,
        lights_vigil: 1,
        divine_intellect: 5,
        precision: 3,
        guardians_favor: 2,
        sacred_duty: 2,
        toughness: 2,
        benediction: 5
      },
      bar: ["holy_light", "flash_of_light", "holy_shock", "lights_vigil", "oath_of_light", "divine_favor", "lay_on_hands", "divine_shield", "cleanse", "major_mana_potion"]
    },
    {
      id: "protection",
      name: "Protection",
      points: "0/37/14",
      gearRole: "tank",
      scenario: "raid-boss",
      blurb: "A tank build for the Tank test: one-hander and shield, Righteous Fury and Devotion Aura. Seal of Fury turns Holy damage into an absorb shield and its Judgement taunts; Swift Judgement is a second Judgement. Holy Strike (sooner with Shieldsworn, and it sets off Holy Shield), Hammer of the Righteous and Consecration for threat, Holy Shield up for blocks. Templar's Bulwark, Divine Protection and Lay on Hands for the bad moments.",
      options: { mainHand: "sword", offHand: "shield", blessing: "kings", righteousFury: "on", aura: "devotion_aura" },
      talents: {
        redoubt: 5,
        precision: 3,
        sacred_duty: 2,
        templars_bulwark: 1,
        shield_specialization: 2,
        toughness: 5,
        swift_judgement: 1,
        improved_righteous_fury: 3,
        anticipation: 5,
        holy_shield: 1,
        reckoning: 5,
        iron_creed: 3,
        shieldsworn: 1,
        deflection: 5,
        benediction: 4,
        improved_judgement: 2,
        sanctified_judgement: 3
      },
      bar: ["seal_of_fury", "judgement", "holy_strike", "hammer_of_the_righteous", "consecration", "holy_shield", "swift_judgement", "templars_bulwark", "divine_protection", "lay_on_hands", "holy_light", "major_mana_potion"]
    },
    {
      id: "retribution",
      name: "Retribution",
      points: "12/8/31",
      gearRole: "melee",
      blurb: "A two-hander with Seal of Command. Judgement and Holy Strike on cooldown; Unsealed Wrath stores copies of your Seal on each swing, and changing Seals sets them off. Vengeance stacks from crits, Champion of the Light turns Intellect into spell power and makes Hammer of Wrath faster.",
      options: { mainHand: "two_hand_mace", offHand: "none", blessing: "might", righteousFury: "auto", aura: "retribution_aura" },
      talents: {
        divine_strength: 5,
        improved_seals: 5,
        holy_conduit: 2,
        divine_intellect: 5,
        precision: 3,
        benediction: 5,
        improved_judgement: 2,
        conviction: 3,
        sanctified_judgement: 3,
        vindication: 3,
        seal_of_command: 1,
        sacred_arbiter: 1,
        two_handed_weapon_specialization: 3,
        repentance: 1,
        vengeance: 3,
        champion_of_the_light: 5,
        unsealed_wrath: 1
      },
      bar: ["seal_of_command", "judgement", "holy_strike", "seal_of_righteousness", "consecration", "hammer_of_wrath", "seal_of_the_crusader", "hammer_of_justice", "major_mana_potion"]
    }
  ];

  // src/classes/paladin/paladin.js
  var MAIN_HANDS2 = ["two_hand_mace", "two_hand_sword", "two_hand_axe", "polearm", "mace", "sword", "axe"];
  var OFF_HANDS2 = ["none", "shield"];
  var BLESSINGS = ["might", "wisdom", "kings", "none"];
  var SOC_PPM = 7;
  var SOC_GAP = 1;
  var isPlayer3 = (game, ev) => ev.ctx.caster === game.player;
  var landedRes3 = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var mainWeapon = (game) => paladin.weapons(game).main;
  var activeSeal = (game) => game.player.auras.find((a) => a.def.exclusive === "seal") || null;
  var weaponHit = (game, ev) => !ev.periodic && ev.ctx.melee && isPlayer3(game, ev) && !ev.ctx.cleave && !ev.ctx.sealProc && landedRes3(ev.res) && (ev.ctx.white || !!(ev.ctx.ability && ev.ctx.ability.weaponStrike));
  var spellCtx = (game, target, id, name, icon2, tags) => ({ castId: ++game.castSeq, caster: game.player, target, schools: ["holy"], tags, ability: { id, name, icon: icon2, schools: ["holy"], tags }, sealProc: tags.includes("seal") });
  function sealHit(game, sealId, target, stored) {
    const w = mainWeapon(game);
    if (!w || !target || target.dead) return;
    if (sealId === "seal_of_righteousness") {
      const base = 23 + (76 - 23) * clamp((w.speed - 1.5) / 2.5, 0, 1);
      spellHit(game, spellCtx(game, target, sealId, "Seal of Righteousness", "ability_thunderbolt", ["seal"]), { min: base, max: base, coef: 0.2 * w.speed / 3.6, noMiss: true, canCrit: false, name: "Seal of Righteousness" });
    } else if (sealId === "seal_of_command") {
      if (!stored && game.time - (game.player.socLast ?? -Infinity) < SOC_GAP || game.rng() >= SOC_PPM * w.speed / 60) return;
      if (!stored) game.player.socLast = game.time;
      const ctx = spellCtx(game, target, sealId, "Seal of Command", "ability_warrior_innerrage", ["seal"]);
      meleeHit(game, ctx, { hand: "main", weaponPct: 0.7, spCoef: 0.29, name: "Seal of Command" });
    } else if (sealId === "seal_of_fury") {
      const res = spellHit(game, spellCtx(game, target, sealId, "Seal of Fury", "spell_holy_retributionaura", ["seal"]), { min: 35, max: 35, coef: 0.1, noMiss: true, canCrit: false, name: "Seal of Fury" });
      if (res.amount > 0 && paladin.weapons(game).shield) {
        const p = game.player, a = findAura(p, "seal_of_fury_shield");
        const absorb2 = (a ? a.data.absorb : 0) + res.amount * 0.5;
        applyAura(game, p, auras4.seal_of_fury_shield, { source: p, data: { absorb: absorb2 } });
      }
    }
  }
  function holyShieldHit(game, target) {
    const ab = game.ability("holy_shield");
    return spellHit(game, { castId: ++game.castSeq, caster: game.player, target, schools: ["holy"], tags: [], ability: ab }, { min: 221, max: 221, coef: 0.05, noMiss: true, canCrit: false, name: "Holy Shield" });
  }
  function unsealedWrath(game, seal4, target) {
    const p = game.player, a = findAura(p, "unsealed_wrath");
    if (a && a.data.seal !== seal4.id) {
      const n = a.stacks, id = a.data.seal;
      removeAura(game, a, "consumed");
      for (let i = 0; i < n; i++) sealHit(game, id, target, true);
    }
    applyAura(game, p, auras4.unsealed_wrath, { source: p, data: { seal: seal4.id, sealName: seal4.def.name } });
  }
  var paladin = {
    id: "paladin",
    name: "Paladin",
    roles: ["dps", "tank", "healer"],
    // the tests it can take (Damage, Tank, Healing)
    icon: "classicon_paladin",
    color: "#f58cba",
    resource: "mana",
    gcd: 1.5,
    source: SOURCE4,
    // Level 60 Human Paladin base stats (Classic, approximate). Attack power: Strength x 2 + level x 3 - 20.
    // 20 Agility per 1% crit (melee formula; Forever has one crit chance for melee and spells).
    stats: {
      level: 60,
      canParry: true,
      base: { str: 105, agi: 69, sta: 101, int: 79, spi: 87 },
      baseHp: 1381,
      baseMana: 1512,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1381 + conv(a.sta, 10) - 20,
          maxMana: 1512 + conv(a.int, 15) - 20,
          ap: a.str * 2 + 160,
          crit: a.agi / 20 / 100,
          regen: (15 + a.spi / 5) / 2
          // Paladin Spirit regeneration, per second
        };
      }
    },
    // Main hand from the chosen type; a one-hander can carry a shield (block value is not used by any damage here).
    weapons(game) {
      const o = game.loadout.options || {}, g = game.loadout.gear || {};
      const mh = MAIN_HANDS2.includes(o.mainHand) ? o.mainHand : "two_hand_mace";
      if (WEAPON_TYPES[mh].twoHand) return { main: makeWeapon(mh, "main", g.wdps2h || 60), off: null };
      const main = makeWeapon(mh, "main", g.wdps || 45);
      return o.offHand === "shield" ? { main, off: null, shield: { block: g.block || 0 } } : { main, off: null };
    },
    // Aura bar beside the action bar.
    stanceBar: { label: "Auras", abilities: ["devotion_aura", "retribution_aura", "concentration_aura"] },
    // the resistance auras are not simulated
    trees: trees4,
    talentHistory: talentHistory4,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities4, ...extra4.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras4, ...extra4.auras },
    gearPresets: gearPresets4,
    gearRoles: gearRoles2,
    builds: builds4,
    gearFields: [
      { k: "str", label: "Strength", step: 5, max: 600 },
      { k: "agi", label: "Agility", step: 5, max: 400 },
      { k: "sta", label: "Stamina", step: 5, max: 700 },
      { k: "int", label: "Intellect", step: 5, max: 500 },
      { k: "armor", label: "Armor", step: 100, max: 12e3, note: "From items, shield included. Agility adds 2 per point." },
      { k: "defense", label: "Defense skill", step: 1, max: 150, note: "From gear, on top of 300. Against a raid boss (315 attack skill) each point is 0.04% more miss, dodge, parry and block and 0.04% less crit." },
      { k: "block", label: "Shield block value", step: 5, max: 300, note: "Damage a block stops (plus Strength / 20)." },
      { k: "ap", label: "Attack power", step: 10, max: 1e3, note: "From gear, on top of Strength." },
      { k: "sp", label: "Spell power", step: 10, max: 1e3, note: "Holy damage: Seals, Judgements, Holy Shock, Consecration." },
      { k: "heal", label: "Bonus healing", step: 10, max: 1500, note: "Increases healing done by up to this much and damage done by up to a third of it, for all magical spells and effects." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "mp5", label: "Mana per 5 sec", step: 1, max: 60 },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." },
      { k: "wdps2h", label: "Two-hander DPS", step: 1, max: 120 },
      { k: "wdps", label: "One-hander DPS", step: 1, max: 90 }
    ],
    options: {
      mainHand: { label: "Main hand", values: MAIN_HANDS2, names: weaponNames(MAIN_HANDS2), default: "two_hand_mace" },
      offHand: { label: "Off hand", values: OFF_HANDS2, names: { none: "None", shield: "Shield" }, default: "none", note: "Ignored with a two-handed weapon." },
      blessing: { label: "Blessing", values: ["auto", ...BLESSINGS], names: { auto: "Best for the spec", might: "Blessing of Might", wisdom: "Blessing of Wisdom", kings: "Blessing of Kings", none: "None" }, default: "auto" },
      righteousFury: { label: "Righteous Fury", values: ["auto", "off", "on"], names: { auto: "On for Protection", off: "Off", on: "On (33% more threat, 90% more from Holy damage)" }, default: "auto" },
      aura: { label: "Aura", values: ["none", "devotion_aura", "retribution_aura", "concentration_aura"], hidden: true }
      // set by the aura bar; unset: the spec's
    },
    sheet(game, f) {
      const s = game.stats(), w = paladin.weapons(game);
      const off = w.shield ? "Shield" : w.main && w.main.twoHand ? "None (two-hander)" : "None";
      return [
        ["Strength", f.int(s.str)],
        ["Intellect", f.int(s.int)],
        ["Attack power", f.int(s.ap)],
        ["Spell power", f.int(s.sp)],
        ...s.healExtra ? [["Healing power", f.int(s.sp + s.healExtra)]] : [],
        ["Mana", f.int(s.maxMana)],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Main hand", describeWeapon(w.main)],
        ["Off hand", off]
      ];
    },
    // The chosen Blessing, Righteous Fury and the last Aura picked on the aura bar are on from the start.
    onReset(game) {
      const o = game.loadout.options || {}, spec = game.mainTree();
      const SPEC = { holy: ["wisdom", "concentration_aura"], protection: ["kings", "devotion_aura"], retribution: ["might", "retribution_aura"] }[spec] || ["might", "devotion_aura"];
      const b = !o.blessing || o.blessing === "auto" ? SPEC[0] : o.blessing;
      if (b !== "none") game.applyPermanent(game.player, `blessing_of_${b}`);
      if (o.righteousFury === "on" || (!o.righteousFury || o.righteousFury === "auto") && spec === "protection") game.applyPermanent(game.player, "righteous_fury");
      const aura2 = o.aura || SPEC[1];
      if (aura2 !== "none" && paladin.auras[aura2]) game.applyPermanent(game.player, aura2);
    },
    // Judgement: unleash the active Seal on the target (the Seal stays, Forever).
    judge(game, ctx) {
      const s = activeSeal(game), t = ctx.target;
      if (!s || !t) return;
      ctx.judgedSeal = s.id;
      const hit2 = (name, min, max, coef) => meleeHit(game, { ...spellCtx(game, t, `judgement_${s.id}`, name, "spell_holy_righteousfury", ["judgement"]), castId: ctx.castId }, { hand: "ranged", min, max, spCoef: coef, name });
      if (s.id === "seal_of_righteousness") hit2("Judgement of Righteousness", 170, 186, 0.429);
      else if (s.id === "seal_of_command") {
        const k = isStunned(t) ? 2 : 1;
        hit2("Judgement of Command", 169.5 * k, 186.5 * k, 0.429 * k);
      } else if (s.id === "seal_of_fury") {
        hit2("Judgement of Fury", 154, 167, 0.429);
        taunt(game, t, 3);
      } else if (s.id === "seal_of_the_crusader") applyAura(game, t, auras4.judgement_of_the_crusader, { source: game.player });
    },
    // Baseline rules, no talent needed.
    mods() {
      return [add("critChance", 1, (ctx) => !!ctx.divineFavor)];
    },
    listen(game, on) {
      const p = () => game.player;
      on("damage", (ev) => {
        if (!weaponHit(game, ev)) return;
        const s = activeSeal(game);
        if (s) sealHit(game, s.id, ev.ctx.target, false);
        if (s && game.rank("unsealed_wrath")) unsealedWrath(game, s, ev.ctx.target);
        const jc = findAura(ev.ctx.target, "judgement_of_the_crusader", p());
        if (jc) jc.expires = game.time + jc.duration;
      });
      on("cast:success", ({ ability, ctx }) => {
        if (ability.id === "holy_light") {
          const il = findAura(p(), "infusion_of_light");
          if (il) removeAura(game, il, "consumed");
        }
        if (!["holy_shock", "flash_of_light", "holy_light"].includes(ability.id)) return;
        const df = findAura(p(), "divine_favor");
        if (df) {
          ctx.divineFavor = true;
          removeAura(game, df, "consumed");
        }
        if (ability.id !== "holy_shock") return;
        const lv = ctx.target && findAura(ctx.target, "lights_vigil", p());
        if (lv) {
          ctx.vigil = true;
          removeAura(game, lv, "consumed");
          delete p().cooldowns.holy_shock;
        }
      });
      on("hitTaken", ({ attacker, res }) => {
        if (res.outcome === "block") {
          const hs = findAura(p(), "holy_shield");
          if (hs) {
            holyShieldHit(game, attacker);
            useCharge(game, hs);
          }
          const rd = findAura(p(), "redoubt");
          if (rd) useCharge(game, rd);
        }
        if (!avoidedOutcome(res.outcome) && findAura(p(), "retribution_aura")) {
          spellHit(game, { castId: ++game.castSeq, caster: p(), target: attacker, schools: ["holy"], tags: [], ability: { id: "retribution_aura", name: "Retribution Aura", icon: "spell_holy_auraoflight", schools: ["holy"] } }, { min: 20, max: 20, noMiss: true, canCrit: false, name: "Retribution Aura" });
        }
      });
    },
    talents: {
      /* ---------- Holy ---------- */
      spiritual_focus: { mods: (r) => [focus(0.14 * r, (ctx) => isAbility(ctx, "flash_of_light", "holy_light", "lights_vigil"))] },
      divine_strength: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, str: a.str * (1 + 0.02 * r) }) }] },
      healing_light: { mods: (r) => [mult("healMult", 1 + 0.04 * r, (ctx) => isAbility(ctx, "holy_light", "flash_of_light", "holy_shock"))] },
      reverence: { mods: (r) => [add("regenWhileCasting", 0.15 * r)] },
      improved_seals: { mods: (r) => [mult("damageMult", 1 + 0.03 * r, (ctx) => !!ctx.tags && (ctx.tags.includes("seal") || ctx.tags.includes("judgement")))] },
      purifying_power: {
        mods: (r) => [
          mult("cooldown", 1 - [0.17, 0.33][r - 1], (ctx) => isAbility(ctx, "exorcism", "holy_wrath")),
          mult("cost", 1 - 0.1 * r, (ctx) => isAbility(ctx, "cleanse", "purify"))
        ]
      },
      divine_favor: { teaches: "divine_favor" },
      // A critical heal has a 20% chance per rank to give back half of the spell's base cost.
      illumination: {
        listen(game, r, on) {
          on("heal", (ev) => {
            const ab = ev.ctx && ev.ctx.ability;
            if (ev.source !== "player" || !ev.crit || ev.periodic || !ab || !["flash_of_light", "holy_light", "holy_shock", "lights_vigil"].includes(ab.id) || game.rng() >= 0.2 * r) return;
            game.gainPower("mana", 0.5 * (typeof ab.cost === "function" ? ab.cost(game) : ab.cost || 0));
          });
        }
      },
      holy_conduit: { mods: (r) => [mult("cost", 1 - 0.2 * r, (ctx) => isAbility(ctx, "consecration", "holy_wrath", "exorcism", "hammer_of_wrath"))] },
      divine_precision: { mods: (r) => [add("hitChance", 0.04 * r, (ctx) => !ctx.melee && hasSchool(ctx, "holy"))] },
      // and shorter Silences (no Silence in the lab)
      // A critical Holy Shock or Flash of Light heal makes the next Holy Light faster.
      infusion_of_light: {
        listen(game, r, on) {
          on("heal", (ev) => {
            if (ev.source === "player" && ev.crit && !ev.periodic && ev.ctx && isAbility(ev.ctx, "holy_shock", "flash_of_light")) applyAura(game, game.player, auras4.infusion_of_light, { source: game.player });
          });
        }
      },
      oath_of_light: { teaches: "oath_of_light" },
      consecrated_ground: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx, g) => !ctx.melee && hasSchool(ctx, "holy") && !!ctx.target && !!findAura(ctx.target, "consecration", g.player))] },
      holy_shock: { teaches: "holy_shock" },
      // Holy Shock heals crit more often on friends without your Oath of Light.
      boundless_light: { mods: (r) => [add("critChance", 0.15 * r, (ctx, g) => !!ctx.heal && isAbility(ctx, "holy_shock") && !!ctx.target && !findAura(ctx.target, "oath_of_light", g.player))] },
      holy_power: { mods: (r) => [mult("healCritBonusMult", 1 + 0.1 * r, (ctx) => !!ctx.heal && hasSchool(ctx, "holy"))] },
      lights_vigil: { teaches: "lights_vigil" },
      /* ---------- Protection ---------- */
      divine_intellect: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int * (1 + 0.02 * r) }) }] },
      redoubt: {
        listen(game, r, on) {
          on("hitTaken", ({ res }) => {
            if (res.amount > 0 && game.rng() < 0.1) applyAura(game, game.player, auras4.redoubt, { source: game.player, charges: 5 });
          });
        }
      },
      precision: { mods: (r) => [add("hitChance", 0.01 * r, (ctx) => !!ctx.melee)] },
      guardians_favor: { mods: (r) => [add("cooldown", -60 * r, (ctx) => isAbility(ctx, "blessing_of_protection"))] },
      // Shorter cooldowns, and a shorter Forbearance after them.
      sacred_duty: {
        mods: (r) => [add("cooldown", -30 * r, (ctx) => isAbility(ctx, "divine_shield", "divine_protection", "templars_bulwark"))],
        listen(game, r, on) {
          on("aura:apply", ({ aura: aura2, fresh }) => {
            if (fresh && aura2.id === "forbearance" && aura2.unit === game.player) {
              aura2.duration -= 5 * r;
              aura2.expires -= 5 * r;
            }
          });
        }
      },
      templars_bulwark: { teaches: "templars_bulwark" },
      improved_hammer_of_justice: { mods: (r) => [add("cooldown", -5 * r, (ctx) => isAbility(ctx, "hammer_of_justice"))] },
      shield_specialization: {
        mods: (r) => [mult("blockValue", 1 + 0.15 * r)],
        listen(game, r, on) {
          let ready = 0;
          on("hitTaken", ({ res }) => {
            if (res.outcome !== "block" || game.time < ready || game.rng() >= [0.5, 1][r - 1]) return;
            ready = game.time + 3;
            game.gainPower("mana", 0.04 * game.stats().maxMana);
          });
        }
      },
      toughness: { mods: (r) => [mult("itemArmor", 1 + 0.02 * r)] },
      swift_judgement: { teaches: "swift_judgement" },
      improved_righteous_fury: { mods: () => [] },
      // read by Righteous Fury (spellbook.js)
      anticipation: { mods: (r) => [add("defense", 4 * r)] },
      holy_shield: { teaches: "holy_shield" },
      // Extra attacks stored from blocks (once per 1.5 sec) and critical hits taken, all spent on the next melee swing.
      reckoning: {
        listen(game, r, on) {
          let blockReady = 0;
          on("hitTaken", ({ res }) => {
            const fromBlock = res.outcome === "block" && game.time >= blockReady && game.rng() < 0.08 * r;
            const fromCrit = res.outcome === "crit" && game.rng() < 0.2 * r;
            if (fromBlock) blockReady = game.time + 1.5;
            if (fromBlock || fromCrit) applyAura(game, game.player, auras4.reckoning, { source: game.player });
          });
          on("swing", ({ hand, ctx }) => {
            const a = findAura(game.player, "reckoning");
            if (!a || hand !== "main" || ctx.extra || !ctx.target) return;
            const n = a.stacks, t = ctx.target;
            removeAura(game, a, "consumed");
            for (let i = 0; i < n; i++) game.schedule(0, (g) => swing(g, "main", t, "Reckoning"));
          });
        }
      },
      iron_creed: {
        mods: (r) => [mult("threatMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "holy_strike"))],
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (ability.id === "holy_strike" && landedRes3(ctx.result) && findAura(game.player, "righteous_fury")) applyAura(game, game.player, auras4.iron_creed, { source: game.player });
          });
        }
      },
      // Holy Strike 4 sec sooner, and struck with the shield: it sets off an active Holy Shield (no charge spent) and
      // Shield Specialization (outside its 3 sec). Blocking spells for 6 sec is not simulated (no spells in the lab's fights).
      shieldsworn: {
        mods: () => [add("cooldown", -4, (ctx) => isAbility(ctx, "holy_strike"))],
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            const p = game.player, t = ctx.target;
            if (ability.id !== "holy_strike" || !landedRes3(ctx.result) || !paladin.weapons(game).shield || !t || t.dead) return;
            if (findAura(p, "holy_shield")) holyShieldHit(game, t);
            const ss = game.rank("shield_specialization");
            if (ss && game.rng() < [0.5, 1][ss - 1]) game.gainPower("mana", 0.04 * game.stats().maxMana);
          });
        }
      },
      /* ---------- Retribution ---------- */
      deflection: { mods: (r) => [add("parryChance", 0.01 * r)] },
      benediction: { mods: (r) => [mult("cost", 1 - 0.02 * r, (ctx) => !!ctx.ability && !ctx.ability.castTime && !ctx.ability.channel)] },
      improved_judgement: { mods: (r) => [add("cooldown", -r, (ctx) => isAbility(ctx, "judgement"))] },
      conviction: { mods: (r) => [add("critChance", 0.02 * r)] },
      sanctified_judgement: {
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (ability.id !== "judgement" || !ctx.judgedSeal || game.rng() >= [0.33, 0.66, 1][r - 1]) return;
            const sealAb = game.ability(ctx.judgedSeal);
            if (sealAb) game.resource.gain(game, game.player, 0.2 * r * (sealAb.cost || 0));
          });
        }
      },
      // ESTIMATE: 10% chance per melee hit that lands (the tooltip only says "a chance"). Lowers the enemy's attack power.
      vindication: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (weaponHit(game, ev) && game.rng() < 0.1) applyAura(game, ev.ctx.target, auras4.vindication, { source: game.player, data: { ap: 67 * r } });
          });
        }
      },
      seal_of_command: { teaches: "seal_of_command" },
      sacred_arbiter: {
        mods: () => [mult("damageMult", 1.2, (ctx) => isAbility(ctx, "holy_strike"))],
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (ability.id !== "holy_strike" || !landedRes3(ctx.result) || !ctx.target) return;
            for (const a of ctx.target.auras) if (a.source === game.player && a.id.startsWith("judgement_")) a.expires = game.time + a.duration;
          });
        }
      },
      // With a two-hander: more Holy and physical damage (Holy since the launch notes), less threat.
      two_handed_weapon_specialization: {
        mods: (r) => [
          mult("damageMult", 1 + 0.02 * r, (ctx, g) => (hasSchool(ctx, "physical") || hasSchool(ctx, "holy")) && !!mainWeapon(g) && mainWeapon(g).twoHand),
          mult("threatMult", 1 - [0.07, 0.13, 0.2][r - 1], (ctx, g) => !!mainWeapon(g) && mainWeapon(g).twoHand)
        ]
      },
      vengeance: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!ev.periodic && isPlayer3(game, ev) && ev.res.outcome === "crit") applyAura(game, game.player, auras4.vengeance, { source: game.player });
          });
        }
      },
      champion_of_the_light: {
        mods: (r) => [
          { key: "spellPower", fn: (v, ctx, g) => v + g.stats().int * 0.12 * r },
          add("castTime", -0.2 * r, (ctx) => isAbility(ctx, "hammer_of_wrath"))
        ]
      },
      unsealed_wrath: { mods: () => [] },
      // read by the Seals (listen above, unsealedWrath)
      repentance: { teaches: "repentance" }
    }
  };

  // src/classes/hunter/talent-data.js
  var SOURCE5 = { site: "foreverchanges.pro/talents/hunter", build: "1.60.1.70790", extracted: "2026-11-05" };
  var trees5 = [
    {
      id: "beast_mastery",
      name: "Beast Mastery",
      icon: "ability_hunter_beasttaming",
      talents: [
        { id: "deadly_aspects", name: "Deadly Aspects", icon: "spell_nature_ravenform", tier: 0, col: 1, max: 5, ranks: ["While Aspect of the Hawk is active, Auto Shot has a 2% chance of increasing ranged attack speed by 30% for 12 sec. While Aspect of the Beast is active, all melee auto attacks have a 2% chance of increasing melee attack speed by 30% for 12 sec.", "While Aspect of the Hawk is active, Auto Shot has a 4% chance of increasing ranged attack speed by 30% for 12 sec. While Aspect of the Beast is active, all melee auto attacks have a 4% chance of increasing melee attack speed by 30% for 12 sec.", "While Aspect of the Hawk is active, Auto Shot has a 6% chance of increasing ranged attack speed by 30% for 12 sec. While Aspect of the Beast is active, all melee auto attacks have a 6% chance of increasing melee attack speed by 30% for 12 sec.", "While Aspect of the Hawk is active, Auto Shot has a 8% chance of increasing ranged attack speed by 30% for 12 sec. While Aspect of the Beast is active, all melee auto attacks have a 8% chance of increasing melee attack speed by 30% for 12 sec.", "While Aspect of the Hawk is active, Auto Shot has a 10% chance of increasing ranged attack speed by 30% for 12 sec. While Aspect of the Beast is active, all melee auto attacks have a 10% chance of increasing melee attack speed by 30% for 12 sec."] },
        { id: "endurance_training", name: "Endurance Training", icon: "spell_nature_reincarnation", tier: 0, col: 2, max: 5, ranks: ["Increases the Health and Armor of your pets by 3%.", "Increases the Health and Armor of your pets by 6%.", "Increases the Health and Armor of your pets by 9%.", "Increases the Health and Armor of your pets by 12%.", "Increases the Health and Armor of your pets by 15%."] },
        { id: "focused_fire", name: "Focused Fire", icon: "inv_weapon_crossbow_10", tier: 1, col: 0, max: 2, ranks: ["Increases all damage you and your pet deal by 1% while your pet is active.", "Increases all damage you and your pet deal by 2% while your pet is active."] },
        { id: "improved_aspect_of_the_monkey", name: "Improved Aspect of the Monkey", icon: "ability_hunter_aspectofthemonkey", tier: 1, col: 1, max: 3, ranks: ["Increases the Dodge bonus of your Aspect of the Monkey by 2%. Additionally, your pet gains 50% of the effect of your Aspect of the Monkey ability.", "Increases the Dodge bonus of your Aspect of the Monkey by 4%. Additionally, your pet gains 50% of the effect of your Aspect of the Monkey ability.", "Increases the Dodge bonus of your Aspect of the Monkey by 6%. Additionally, your pet gains 50% of the effect of your Aspect of the Monkey ability."] },
        { id: "improved_revive_pet", name: "Improved Revive Pet", icon: "ability_hunter_beastsoothe", tier: 1, col: 2, max: 2, ranks: ["Revive Pet's casting time is reduced by 3 sec, mana cost is reduced by 20%, and increases the health your pet returns with by an additional 15%.", "Revive Pet's casting time is reduced by 6 sec, mana cost is reduced by 40%, and increases the health your pet returns with by an additional 30%."] },
        { id: "pathfinding", name: "Pathfinding", icon: "ability_mount_jungletiger", tier: 2, col: 0, max: 2, ranks: ["Increases the speed bonus of your Aspect of the Cheetah and Aspect of the Pack by 3%.", "Increases the speed bonus of your Aspect of the Cheetah and Aspect of the Pack by 6%."] },
        { id: "bestial_swiftness", name: "Bestial Swiftness", icon: "ability_druid_dash", tier: 2, col: 1, max: 1, ranks: ["Increases the movement speed of your pets by 30%."] },
        { id: "unleashed_fury", name: "Unleashed Fury", icon: "ability_bullrush", tier: 2, col: 2, max: 5, ranks: ["Increases the damage done by your pets and hawks by 3%.", "Increases the damage done by your pets and hawks by 6%.", "Increases the damage done by your pets and hawks by 9%.", "Increases the damage done by your pets and hawks by 12%.", "Increases the damage done by your pets and hawks by 15%."] },
        { id: "improved_mend_pet", name: "Improved Mend Pet", icon: "ability_hunter_mendpet", tier: 3, col: 0, max: 2, ranks: ["Gives your Mend Pet spell a 15% chance of cleansing 1 Curse, Disease, Magic, or Poison effect from your pet each time it heals and reduces the Mana cost by 10%.", "Gives your Mend Pet spell a 50% chance of cleansing 1 Curse, Disease, Magic, or Poison effect from your pet each time it heals and reduces the Mana cost by 20%."] },
        { id: "ferocity", name: "Ferocity", icon: "inv_misc_monsterclaw_04", tier: 3, col: 2, max: 5, ranks: ["Increases the critical strike chance of your pets and hawks by 2%.", "Increases the critical strike chance of your pets and hawks by 4%.", "Increases the critical strike chance of your pets and hawks by 6%.", "Increases the critical strike chance of your pets and hawks by 8%.", "Increases the critical strike chance of your pets and hawks by 10%."] },
        { id: "summon_hawk", name: "Summon Hawk", icon: "ability_hunter_animalhandler", tier: 3, col: 3, max: 1, active: true, ranks: ["Command a hawk to dive-bomb your targeted enemy, dealing 34 Physical damage and continuing its assault for 18 sec. Only 2 hawks can be active at once. Summon Hawk shares its cooldown with Arcane Shot."] },
        { id: "spirit_bond", name: "Spirit Bond", icon: "ability_druid_demoralizingroar", tier: 4, col: 0, max: 2, ranks: ["While your pet is active, you and your pet will regenerate 1% of total health every 10 sec.", "While your pet is active, you and your pet will regenerate 1% of total health every 5 sec."] },
        { id: "intimidation", name: "Intimidation", icon: "ability_devour", tier: 4, col: 1, max: 1, req: "bestial_swiftness", active: true, ranks: ["Command your pet to Stun the target for 3 sec on its next successful attack, which also gains 100% increased critical strike chance. Generates high threat."] },
        { id: "bestial_discipline", name: "Bestial Discipline", icon: "spell_nature_abolishmagic", tier: 4, col: 3, max: 2, ranks: ["Increases the Focus regeneration of your pets by 10% and allows 25% of your Mana regeneration to continue while casting.", "Increases the Focus regeneration of your pets by 20% and allows 50% of your Mana regeneration to continue while casting."] },
        { id: "frenzy", name: "Frenzy", icon: "inv_misc_monsterclaw_03", tier: 5, col: 2, max: 5, req: "ferocity", ranks: ["Gives your pet a 20% chance to gain a 30% attack speed increase for 8 sec after dealing a critical strike.", "Gives your pet a 40% chance to gain a 30% attack speed increase for 8 sec after dealing a critical strike.", "Gives your pet a 60% chance to gain a 30% attack speed increase for 8 sec after dealing a critical strike.", "Gives your pet a 80% chance to gain a 30% attack speed increase for 8 sec after dealing a critical strike.", "Gives your pet a 100% chance to gain a 30% attack speed increase for 8 sec after dealing a critical strike."] },
        { id: "bestial_wrath", name: "Bestial Wrath", icon: "ability_druid_ferociousbite", tier: 6, col: 1, max: 1, req: "intimidation", active: true, ranks: ["Send your pet into a rage causing 50% additional damage for 18 sec. While enraged, the beast does not feel pity or remorse or fear and it cannot be stopped unless killed."] }
      ]
    },
    {
      id: "marksmanship",
      name: "Marksmanship",
      icon: "ability_marksmanship",
      talents: [
        { id: "hawk_eye", name: "Hawk Eye", icon: "ability_townwatch", tier: 0, col: 0, max: 3, ranks: ["Increases the range of your ranged weapons by 2 yards.", "Increases the range of your ranged weapons by 4 yards.", "Increases the range of your ranged weapons by 6 yards."] },
        { id: "improved_concussive_shot", name: "Improved Concussive Shot", icon: "spell_frost_stun", tier: 0, col: 1, max: 5, ranks: ["Gives your Concussive Shot a 4% chance to stun the target for 3 sec.", "Gives your Concussive Shot a 8% chance to stun the target for 3 sec.", "Gives your Concussive Shot a 12% chance to stun the target for 3 sec.", "Gives your Concussive Shot a 16% chance to stun the target for 3 sec.", "Gives your Concussive Shot a 20% chance to stun the target for 3 sec."] },
        { id: "lethal_attacks", name: "Lethal Attacks", icon: "ability_searingarrow", tier: 0, col: 2, max: 5, ranks: ["Increases your critical strike chance with all attacks by 1%.", "Increases your critical strike chance with all attacks by 2%.", "Increases your critical strike chance with all attacks by 3%.", "Increases your critical strike chance with all attacks by 4%.", "Increases your critical strike chance with all attacks by 5%."] },
        { id: "improved_stings", name: "Improved Stings", icon: "ability_hunter_quickshot", tier: 1, col: 0, max: 3, ranks: ["Increases the damage of your Serpent Sting ability by 6%, reduces the cooldown of your Viper Sting ability by 2 sec, and increases the duration of your Scorpid Sting ability by 15 sec.", "Increases the damage of your Serpent Sting ability by 13%, reduces the cooldown of your Viper Sting ability by 4 sec, and increases the duration of your Scorpid Sting ability by 30 sec.", "Increases the damage of your Serpent Sting ability by 20%, reduces the cooldown of your Viper Sting ability by 6 sec, and increases the duration of your Scorpid Sting ability by 45 sec."] },
        { id: "efficiency", name: "Efficiency", icon: "spell_frost_wizardmark", tier: 1, col: 1, max: 5, ranks: ["Reduces the Mana cost of your Shots, Stings, and melee abilities by 3%.", "Reduces the Mana cost of your Shots, Stings, and melee abilities by 6%.", "Reduces the Mana cost of your Shots, Stings, and melee abilities by 9%.", "Reduces the Mana cost of your Shots, Stings, and melee abilities by 12%.", "Reduces the Mana cost of your Shots, Stings, and melee abilities by 15%."] },
        { id: "careful_aim", name: "Careful Aim", icon: "ability_hunter_zenarchery", tier: 1, col: 2, max: 5, ranks: ["Increases your Attack Power by 20% of your Intellect.", "Increases your Attack Power by 40% of your Intellect.", "Increases your Attack Power by 60% of your Intellect.", "Increases your Attack Power by 80% of your Intellect.", "Increases your Attack Power by 100% of your Intellect."] },
        { id: "rapid_killing", name: "Rapid Killing", icon: "ability_hunter_rapidkilling", tier: 2, col: 0, max: 2, ranks: ["Reduces the cooldown on your Rapid Fire ability by 1 min. In addition, when you kill a non-trivial enemy or it dies while afflicted by your Serpent Sting, you gain Rapid Killing, increasing the damage of your next Shot ability within 20 sec by 10%.", "Reduces the cooldown on your Rapid Fire ability by 2 min. In addition, when you kill a non-trivial enemy or it dies while afflicted by your Serpent Sting, you gain Rapid Killing, increasing the damage of your next Shot ability within 20 sec by 20%."] },
        { id: "improved_arcane_shot", name: "Improved Arcane Shot", icon: "ability_impalingbolt", tier: 2, col: 1, max: 5, ranks: ["Reduces the cooldown of your Arcane Shot by 0.3 sec. Does not affect the cooldown of abilities which share a cooldown with Arcane Shot.", "Reduces the cooldown of your Arcane Shot by 0.6 sec. Does not affect the cooldown of abilities which share a cooldown with Arcane Shot.", "Reduces the cooldown of your Arcane Shot by 0.9 sec. Does not affect the cooldown of abilities which share a cooldown with Arcane Shot.", "Reduces the cooldown of your Arcane Shot by 1.2 sec. Does not affect the cooldown of abilities which share a cooldown with Arcane Shot.", "Reduces the cooldown of your Arcane Shot by 1.5 sec. Does not affect the cooldown of abilities which share a cooldown with Arcane Shot."] },
        { id: "lone_wolf", name: "Lone Wolf", icon: "ability_mount_whitedirewolf", tier: 2, col: 3, max: 1, ranks: ["You deal 20% increased damage with all attacks while you do not have an active pet."] },
        { id: "trueshot_aura", name: "Trueshot Aura", icon: "ability_trueshot", tier: 3, col: 1, max: 1, active: true, ranks: ["Increases the Ranged Attack Power of party or raid members within 45 yds by 20."] },
        { id: "mortal_shots", name: "Mortal Shots", icon: "ability_piercedamage", tier: 3, col: 2, max: 5, req: "careful_aim", ranks: ["Increases the critical strike damage bonus on all ranged abilities by 6%.", "Increases the critical strike damage bonus on all ranged abilities by 12%.", "Increases the critical strike damage bonus on all ranged abilities by 18%.", "Increases the critical strike damage bonus on all ranged abilities by 24%.", "Increases the critical strike damage bonus on all ranged abilities by 30%."] },
        { id: "rapid_recuperation", name: "Rapid Recuperation", icon: "ability_hunter_rapidregeneration", tier: 4, col: 0, max: 2, req: "rapid_killing", ranks: ["Afflicting a target with Serpent Sting allows 25% of your Mana Regeneration to continue while casting for 15 sec, increased to 50% when Rapid Killing is consumed.", "Afflicting a target with Serpent Sting allows 50% of your Mana Regeneration to continue while casting for 15 sec, increased to 100% when Rapid Killing is consumed."] },
        { id: "barrage", name: "Barrage", icon: "ability_upgrademoonglaive", tier: 4, col: 2, max: 3, ranks: ["Increases the damage done by your Multi-Shot, Aimed Shot, and Volley abilities by 5%.", "Increases the damage done by your Multi-Shot, Aimed Shot, and Volley abilities by 10%.", "Increases the damage done by your Multi-Shot, Aimed Shot, and Volley abilities by 15%."] },
        { id: "scatter_shot", name: "Scatter Shot", icon: "ability_golemstormbolt", tier: 4, col: 3, max: 1, active: true, ranks: ["A short-range shot that deals 50% weapon damage and disorients the target for 4 sec. Any damage caused will remove the effect. Turns off your attack when used."] },
        { id: "ranged_weapon_specialization", name: "Ranged Weapon Specialization", icon: "inv_weapon_rifle_06", tier: 5, col: 2, max: 5, ranks: ["Increases the damage you deal with ranged weapons by 1%.", "Increases the damage you deal with ranged weapons by 2%.", "Increases the damage you deal with ranged weapons by 3%.", "Increases the damage you deal with ranged weapons by 4%.", "Increases the damage you deal with ranged weapons by 5%."] },
        { id: "sniper_shot", name: "Sniper Shot", icon: "hunter_pvp_snipershot", tier: 6, col: 1, max: 1, req: "trueshot_aura", active: true, ranks: ["A long-range shot that deals ranged damage plus 320 and increases the range of your next 3 Shots by 10 yards for 10 sec."] }
      ]
    },
    {
      id: "survival",
      name: "Survival",
      icon: "ability_hunter_swiftstrike",
      talents: [
        { id: "improved_tracking", name: "Improved Tracking", icon: "inv_misc_head_dragon_black", tier: 0, col: 1, max: 5, ranks: ["While tracking Beasts, Demons, Dragonkin, Elementals, Giants, Humanoids, or Undead, all damage you deal to the tracked creature type is increased by 1%.", "While tracking Beasts, Demons, Dragonkin, Elementals, Giants, Humanoids, or Undead, all damage you deal to the tracked creature type is increased by 2%.", "While tracking Beasts, Demons, Dragonkin, Elementals, Giants, Humanoids, or Undead, all damage you deal to the tracked creature type is increased by 3%.", "While tracking Beasts, Demons, Dragonkin, Elementals, Giants, Humanoids, or Undead, all damage you deal to the tracked creature type is increased by 4%.", "While tracking Beasts, Demons, Dragonkin, Elementals, Giants, Humanoids, or Undead, all damage you deal to the tracked creature type is increased by 5%."] },
        { id: "deflection", name: "Deflection", icon: "ability_parry", tier: 0, col: 2, max: 5, ranks: ["Increases your Parry chance by 1%.", "Increases your Parry chance by 2%.", "Increases your Parry chance by 3%.", "Increases your Parry chance by 4%.", "Increases your Parry chance by 5%."] },
        { id: "entrapment", name: "Entrapment", icon: "spell_nature_stranglevines", tier: 1, col: 0, max: 5, ranks: ["When your traps are triggered, all affected targets are Entrapped, preventing them from moving for 1 sec.", "When your traps are triggered, all affected targets are Entrapped, preventing them from moving for 2 sec.", "When your traps are triggered, all affected targets are Entrapped, preventing them from moving for 3 sec.", "When your traps are triggered, all affected targets are Entrapped, preventing them from moving for 4 sec.", "When your traps are triggered, all affected targets are Entrapped, preventing them from moving for 5 sec."] },
        { id: "savage_strikes", name: "Savage Strikes", icon: "ability_racial_bloodrage", tier: 1, col: 1, max: 2, ranks: ["Increases the critical strike chance of all your melee abilities by 2%.", "Increases the critical strike chance of all your melee abilities by 4%."] },
        { id: "survivalist", name: "Survivalist", icon: "spell_shadow_twilight", tier: 1, col: 2, max: 5, ranks: ["Increases your total Health by 2%.", "Increases your total Health by 4%.", "Increases your total Health by 6%.", "Increases your total Health by 8%.", "Increases your total Health by 10%."] },
        { id: "improved_wing_clip", name: "Improved Wing Clip", icon: "ability_rogue_trip", tier: 1, col: 3, max: 3, ranks: ["Gives your Wing Clip ability a 7% chance to immobilize the target for 5 sec.", "Gives your Wing Clip ability a 13% chance to immobilize the target for 5 sec.", "Gives your Wing Clip ability a 20% chance to immobilize the target for 5 sec."] },
        { id: "clever_traps", name: "Clever Traps", icon: "spell_nature_timestop", tier: 2, col: 0, max: 2, ranks: ["Increases the duration of Freezing and Frost trap effects by 15% and the damage of Immolation and Explosive trap effects by 15%.", "Increases the duration of Freezing and Frost trap effects by 30% and the damage of Immolation and Explosive trap effects by 30%."] },
        { id: "surefooted", name: "Surefooted", icon: "ability_kick", tier: 2, col: 1, max: 3, ranks: ["Increases your hit chance by 1% and reduces the duration of movement impairing effects on you by 10%.", "Increases your hit chance by 2% and reduces the duration of movement impairing effects on you by 20%.", "Increases your hit chance by 3% and reduces the duration of movement impairing effects on you by 30%."] },
        { id: "deterrence", name: "Deterrence", icon: "ability_whirlwind", tier: 2, col: 2, max: 1, active: true, ranks: ["When activated, increases your Dodge and Parry chance by 25% for 10 sec."] },
        { id: "survival_tactics", name: "Survival Tactics", icon: "ability_ensnare", tier: 3, col: 0, max: 2, ranks: ["Increases your chance to hit with your Trap and Feign Death abilities by 5%.", "Increases your chance to hit with your Trap and Feign Death abilities by 10%."] },
        { id: "predators_edge", name: "Predator's Edge", icon: "ability_dualwield", tier: 3, col: 1, max: 5, ranks: ["Increases your melee ability critical strike damage by 6% and your Off Hand weapon damage by 10%.", "Increases your melee ability critical strike damage by 12% and your Off Hand weapon damage by 20%.", "Increases your melee ability critical strike damage by 18% and your Off Hand weapon damage by 30%.", "Increases your melee ability critical strike damage by 24% and your Off Hand weapon damage by 40%.", "Increases your melee ability critical strike damage by 30% and your Off Hand weapon damage by 50%."] },
        { id: "counterattack", name: "Counterattack", icon: "ability_warrior_challange", tier: 3, col: 2, max: 1, req: "deterrence", active: true, ranks: ["A strike that becomes active after parrying an opponent's attack. This attack deals 50% weapon damage plus 26 and immobilizes the target for 5 sec. Counterattack cannot be blocked, dodged, or parried."] },
        { id: "resourcefulness", name: "Resourcefulness", icon: "ability_hunter_resourcefulness", tier: 4, col: 0, max: 2, ranks: ["Reduces the Mana cost of your Trap and melee abilities by 30%, and grants your melee and ranged ability Critical Strikes a 50% chance to allow 50% of your Mana Regeneration to continue while casting for 30 sec.", "Reduces the Mana cost of your Trap and melee abilities by 60%, and grants your melee and ranged ability Critical Strikes a 100% chance to allow 50% of your Mana Regeneration to continue while casting for 30 sec."] },
        { id: "expose_prey", name: "Expose Prey", icon: "ability_hunter_swiftstrike", tier: 4, col: 1, max: 2, ranks: ["Grants your melee and ranged attacks against enemies afflicted by Hunter's Mark a 5% chance to allow an activation of Mongoose Bite. Lasts 10 sec.", "Grants your melee and ranged attacks against enemies afflicted by Hunter's Mark a 10% chance to allow an activation of Mongoose Bite. Lasts 10 sec."] },
        { id: "survivalists_discipline", name: "Survivalist's Discipline", icon: "ability_hunter_mastertactitian", tier: 4, col: 2, max: 2, ranks: ["Reduces the cooldown of your Trap and Deterrence abilities by 20%.", "Reduces the cooldown of your Trap and Deterrence abilities by 40%."] },
        { id: "strider_kick", name: "Strider Kick", icon: "ability_hunter_pet_tallstrider", tier: 4, col: 3, max: 1, active: true, ranks: ["A powerful kick that deals 100% melee weapon damage and increases movement speed by 30% for 3 sec."] },
        { id: "lightning_reflexes", name: "Lightning Reflexes", icon: "spell_nature_invisibilty", tier: 5, col: 2, max: 5, ranks: ["Increases your Agility by 3%.", "Increases your Agility by 6%.", "Increases your Agility by 9%.", "Increases your Agility by 12%.", "Increases your Agility by 15%."] },
        { id: "lacerating_strikes", name: "Lacerating Strikes", icon: "ability_gouge", tier: 6, col: 1, max: 1, req: "expose_prey", ranks: ["Your Mongoose Bite also causes the target to Bleed for damage equal to 40% of the damage done by Mongoose Bite over 21 sec"] }
      ]
    }
  ];

  // src/classes/hunter/talent-history.js
  var talentHistory5 = [
    {
      // 1.60.1.70753 (November 3): Improved Revive Pet and Pathfinding moved.
      until: "1.60.1.70753",
      date: "November 3",
      order: [
        ["deadly_aspects", "endurance_training", "focused_fire", "improved_aspect_of_the_monkey", "pathfinding", "improved_revive_pet", "bestial_swiftness", "unleashed_fury", "improved_mend_pet", "ferocity", "summon_hawk", "spirit_bond", "intimidation", "bestial_discipline", "frenzy", "bestial_wrath"],
        ["hawk_eye", "improved_concussive_shot", "lethal_attacks", "improved_stings", "efficiency", "careful_aim", "rapid_killing", "improved_arcane_shot", "lone_wolf", "trueshot_aura", "mortal_shots", "rapid_recuperation", "barrage", "scatter_shot", "ranged_weapon_specialization", "sniper_shot"],
        ["improved_tracking", "deflection", "entrapment", "savage_strikes", "survivalist", "improved_wing_clip", "clever_traps", "surefooted", "deterrence", "survival_tactics", "predators_edge", "counterattack", "resourcefulness", "expose_prey", "survivalists_discipline", "strider_kick", "lightning_reflexes", "lacerating_strikes"]
      ],
      renamed: {},
      removed: {},
      names: {}
    }
  ];

  // src/classes/hunter/spellbook-data.js
  var SPELLBOOK5 = [
    ["Aspect of the Monkey", "ability_hunter_aspectofthemonkey", "beast_mastery", 20, 0, 0, 0, 0, "The hunter takes on the aspects of a monkey, increasing chance to dodge by 8%. Only one Aspect can be active at a time."],
    ["Mend Pet", "ability_hunter_mendpet", "beast_mastery", 480, 20, "ch", 0, 0, "Heals your pet 245 health every second while you focus. Lasts 5 sec."],
    ["Scare Beast", "ability_druid_cower", "beast_mastery", 75, 10, 1.5, 30, 0, "Scares a beast, causing it to run in fear for up to 20 sec. Damage caused may interrupt the effect. Only one beast can be feared at a time."],
    ["Aspect of the Cheetah", "ability_mount_jungletiger", "beast_mastery", 40, 0, 0, 0, 0, "The hunter takes on the aspects of a cheetah, increasing movement speed by 30%. If the hunter takes damage, he will be dazed for 4 sec. Only one Aspect can be active at a time."],
    ["Aspect of the Pack", "ability_mount_whitetiger", "beast_mastery", 100, 0, 0, 0, 0, "The hunter and group members within 30 yards take on the aspects of a pack of cheetahs, increasing movement speed by 30%. If a pack member takes damage, they will be dazed for 4 sec. Only one Aspect can be active at a time."],
    ["Aspect of the Wild", "spell_nature_protectionformnature", "beast_mastery", 115, 0, 0, 0, 0, "The hunter and all party and raid members within 30 yards take on the aspect of the wild, increasing Nature resistance by 60. Only one Aspect can be active at a time."],
    ["Tranquilizing Shot", "spell_nature_drowsy", "beast_mastery", 270, 35, 0, 20, 0, "Attempts to remove 1 Frenzy effect from an enemy creature. Requires Ranged Weapon"],
    ["Concussive Shot", "spell_frost_stun", "marksmanship", "b8", 35, 0, 12, 0, "Dazes the target, slowing movement speed by 50% for 4 sec. Requires Ranged Weapon"],
    ["Distracting Shot", "spell_arcane_blink", "marksmanship", 110, 35, 0, 8, 0, "Distract the target, causing threat. More effective than Distracting Shot (Rank 5). Requires Ranged Weapon"],
    ["Scorpid Sting", "ability_hunter_criticalshot", "marksmanship", "b9", 35, 0, 0, 0, "Stings the target, reducing the target's chance to hit with attacks by 2% for 20 sec. Only one Sting per Hunter can be active on any one target. Requires Ranged Weapon"],
    ["Flare", "spell_fire_flare", "marksmanship", 50, 30, 0, 15, 0, "Exposes all hidden and invisible enemies within 10 yards of the targeted area for 30 sec."],
    ["Viper Sting", "ability_hunter_aimedshot", "marksmanship", 215, 35, 0, 15, 0, "Stings the target, draining 1108 mana over 8 sec. Only one Sting per Hunter can be active on any one target. Requires Ranged Weapon"],
    ["Disengage", "ability_rogue_feint", "survival", 150, "m", 0, 5, 0, "Attempts to disengage from the target by reducing threat. More effective than Disengage (Rank 2). Disables auto-attack. Requires Melee Weapon"],
    ["Freezing Trap", "spell_frost_chainsofice", "survival", 100, 0, 0, 30, 0, "Place a Frost trap that freezes the first enemy that approaches, preventing all action for up to 20 sec. Any damage caused will break the ice. Trap will exist for 1 min. Only one Frost trap can be active at a time."],
    ["Counterattack", "ability_warrior_challange", "survival", 85, "m", 0, 5, 1, "A strike that becomes active after parrying an opponent's attack. This attack deals 50% weapon damage plus 110 and immobilizes the target for 5 sec. Counterattack cannot be blocked, dodged, or parried. Requires Melee Weapon"],
    ["Frost Trap", "spell_frost_freezingbreath", "survival", 60, 0, 0, 30, 0, "Place a Frost trap that creates an ice slick around itself for 30 sec when the first enemy approaches it. All enemies within 10 yards will be slowed by 60% while in the area of effect. Trap will exist for 1 min. Only one Frost trap can be active at a time."],
    ["Feign Death", "ability_rogue_feigndeath", "survival", 80, 0, 0, 30, 0, "Feign death which may trick enemies into ignoring you. Lasts 6 min. If not cancelled, after 6 min you will actually die."],
    ["Deterrence", "ability_whirlwind", "survival", 0, 0, 0, 300, 1, "When activated, increases your Dodge and Parry chance by 25% for 10 sec."]
  ];

  // src/classes/hunter/abilities.js
  var shot = { target: "enemy", harmful: true, range: 35, minRange: 5, requires: { ranged: true }, shot: true, startsAttack: true };
  var melee5 = { range: "melee", target: "enemy", harmful: true, schools: ["physical"] };
  var physical2 = ["physical"];
  var basePct2 = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var abilities5 = [
    /* ---------- Beast Mastery ---------- */
    {
      id: "aspect_of_the_hawk",
      name: "Aspect of the Hawk",
      icon: "spell_nature_ravenform",
      tree: "beast_mastery",
      schools: ["nature"],
      target: "self",
      cost: 120,
      effects: [{ type: "applyAura", to: "self", aura: "aspect_of_the_hawk" }],
      setsOption: ["aspect", "aspect_of_the_hawk"],
      text: "The hunter takes on the aspects of a hawk, increasing Ranged Attack Power by 120. Only one Aspect can be active at a time."
    },
    {
      id: "aspect_of_the_beast",
      name: "Aspect of the Beast",
      icon: "ability_mount_pinktiger",
      tree: "beast_mastery",
      schools: ["nature"],
      target: "self",
      cost: 110,
      effects: [{ type: "applyAura", to: "self", aura: "aspect_of_the_beast" }],
      setsOption: ["aspect", "aspect_of_the_beast"],
      text: "You take on the aspects of a beast, becoming untrackable and increasing Melee Attack Power by 110. Only one Aspect can be active at a time."
    },
    {
      id: "summon_hawk",
      name: "Summon Hawk",
      icon: "ability_hunter_animalhandler",
      tree: "beast_mastery",
      schools: physical2,
      harmful: true,
      target: "enemy",
      range: 35,
      cost: basePct2(0.11),
      cooldown: 6,
      cooldownGroup: "arcane_shot",
      talent: "summon_hawk",
      startsAttack: true,
      // 11% of base mana
      effects: [{ type: "custom", run: (g, ctx) => g.cls.summonHawk(g, ctx) }],
      text: "Command a hawk to dive-bomb your targeted enemy, dealing 110 Physical damage and continuing its assault for 18 sec. Only 2 hawks can be active at once. Summon Hawk shares its cooldown with Arcane Shot."
    },
    {
      id: "intimidation",
      name: "Intimidation",
      icon: "ability_devour",
      tree: "beast_mastery",
      schools: physical2,
      target: "self",
      cost: basePct2(0.08),
      cooldown: 60,
      talent: "intimidation",
      usable: (g) => g.cls.pet(g) ? null : "You have no pet",
      effects: [{ type: "custom", run: (g) => g.cls.buffPet(g, "intimidation") }],
      text: "Command your pet to Stun the target for 3 sec on its next successful attack, which also gains 100% increased critical strike chance."
    },
    {
      id: "bestial_wrath",
      name: "Bestial Wrath",
      icon: "ability_druid_ferociousbite",
      tree: "beast_mastery",
      schools: physical2,
      target: "self",
      cost: basePct2(0.12),
      cooldown: 120,
      talent: "bestial_wrath",
      usable: (g) => g.cls.pet(g) ? null : "You have no pet",
      effects: [{ type: "custom", run: (g) => g.cls.buffPet(g, "bestial_wrath") }],
      text: "Send your pet into a rage causing 50% additional damage for 18 sec."
    },
    /* ---------- Marksmanship ---------- */
    {
      id: "hunters_mark",
      name: "Hunter's Mark",
      icon: "ability_hunter_snipershot",
      tree: "marksmanship",
      schools: ["arcane"],
      harmful: true,
      target: "enemy",
      range: 100,
      cost: 60,
      effects: [{ type: "applyAura", to: "target", aura: "hunters_mark" }],
      text: "Places the Hunter's Mark on the target, increasing the Ranged Attack Power of all attackers against that target by 143. Lasts for 2 min."
    },
    {
      id: "serpent_sting",
      name: "Serpent Sting",
      icon: "ability_hunter_quickshot",
      tree: "marksmanship",
      schools: ["nature"],
      ...shot,
      speed: 45,
      sting: true,
      cost: 250,
      notes: true,
      // Launch notes: each tick gains 5% of the ranged attack power (was 3%), set when the sting lands.
      effects: [{ type: "meleeDamage", hand: "ranged", noDamage: true, name: "Serpent Sting", onHit: [{ type: "applyAura", to: "target", aura: "serpent_sting", dynamic: (g, ctx) => ({ dot: { base: 675 + 5 * 0.05 * rangedAttackPower(g, ctx) } }) }] }],
      text: "Stings the target, causing 675 Nature damage over 15 sec, plus 5% of your Ranged Attack Power per tick. Only one Sting per Hunter can be active on any one target."
    },
    {
      id: "arcane_shot",
      name: "Arcane Shot",
      icon: "ability_impalingbolt",
      tree: "marksmanship",
      schools: ["arcane"],
      ...shot,
      speed: 45,
      cost: basePct2(0.11),
      cooldown: 6,
      cooldownGroup: "arcane_shot",
      notes: true,
      effects: [{ type: "meleeDamage", hand: "ranged", min: 280, max: 280, apCoef: 0.15 }],
      // 15% of the attack power: launch notes (was 10%)
      text: "An instant shot that causes 280 Arcane damage, plus 15% of your Ranged Attack Power."
    },
    {
      id: "aimed_shot",
      name: "Aimed Shot",
      icon: "inv_spear_07",
      tree: "marksmanship",
      schools: physical2,
      ...shot,
      speed: 45,
      cost: 310,
      castTime: 2,
      cooldown: 6,
      cooldownGroup: "aimed_multi",
      effects: [{ type: "weaponDamage", hand: "ranged", normalized: true, flat: 350 }],
      text: "An aimed shot that increases ranged damage by 350. Aimed Shot shares its cooldown with Multi-Shot."
    },
    {
      id: "multi_shot",
      name: "Multi-Shot",
      icon: "ability_upgrademoonglaive",
      tree: "marksmanship",
      schools: physical2,
      ...shot,
      speed: 45,
      cost: basePct2(0.139),
      cooldown: 6,
      cooldownGroup: "aimed_multi",
      effects: [{ type: "aoeMelee", center: "target", radius: 8, maxTargets: 3, hand: "ranged", normalized: true, fx: false }],
      text: "Fires several missiles, hitting 3 targets. Multi-Shot shares its cooldown with Aimed Shot."
    },
    {
      id: "rapid_fire",
      name: "Rapid Fire",
      icon: "ability_hunter_runningshot",
      tree: "marksmanship",
      schools: physical2,
      target: "self",
      cost: 100,
      cooldown: 300,
      effects: [{ type: "applyAura", to: "self", aura: "rapid_fire" }],
      text: "Increases ranged and melee attack speed by 40% for 15 sec."
    },
    {
      id: "trueshot_aura",
      name: "Trueshot Aura",
      icon: "ability_trueshot",
      tree: "marksmanship",
      schools: physical2,
      target: "self",
      cost: 525,
      talent: "trueshot_aura",
      effects: [{ type: "applyAura", to: "self", aura: "trueshot_aura" }],
      text: "Increases the Ranged Attack Power of party or raid members within 45 yards by 100. Lasts 30 min."
    },
    {
      id: "volley",
      name: "Volley",
      icon: "ability_marksmanship",
      tree: "marksmanship",
      schools: ["arcane"],
      harmful: true,
      target: "enemy",
      range: 35,
      requires: { ranged: true },
      cost: 490,
      channel: { duration: 6, ticks: 6, tick: [{ type: "aoeDamage", center: "target", radius: 8, min: 112, max: 112, name: "Volley" }] },
      text: "Continuously fires a volley of ammo at the target area, causing 112 Arcane damage to enemy targets within 8 yards every 1 sec for 6 sec."
    },
    {
      id: "sniper_shot",
      name: "Sniper Shot",
      icon: "hunter_pvp_snipershot",
      tree: "marksmanship",
      schools: physical2,
      ...shot,
      speed: 45,
      range: 45,
      cost: 365,
      castTime: 4,
      cooldown: 15,
      talent: "sniper_shot",
      effects: [{ type: "weaponDamage", hand: "ranged", normalized: true, flat: 590 }, { type: "applyAura", to: "self", aura: "sniper_range", charges: 3 }],
      text: "A long-range shot that deals ranged damage plus 590 and increases the range of your next 3 Shots by 10 yards for 10 sec."
    },
    {
      id: "scatter_shot",
      name: "Scatter Shot",
      icon: "ability_golemstormbolt",
      tree: "marksmanship",
      schools: physical2,
      ...shot,
      range: 15,
      startsAttack: false,
      cost: basePct2(0.08),
      cooldown: 30,
      talent: "scatter_shot",
      effects: [{ type: "weaponDamage", hand: "ranged", weaponPct: 0.5 }, { type: "custom", run: (g) => g.stopAttack() }],
      text: "A short-range shot that deals 50% weapon damage and disorients the target for 4 sec. Any damage caused will remove the effect. Turns off your attack when used."
    },
    /* ---------- Survival ---------- */
    {
      id: "raptor_strike",
      name: "Raptor Strike",
      icon: "ability_meleedamage",
      tree: "survival",
      ...melee5,
      cost: 100,
      cooldown: 6,
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", flat: 70 }],
      text: "A strong attack that deals melee weapon damage plus 70."
    },
    {
      id: "mongoose_bite",
      name: "Mongoose Bite",
      icon: "ability_hunter_swiftstrike",
      tree: "survival",
      ...melee5,
      cost: 65,
      cooldown: 5,
      weaponStrike: true,
      usable: (g) => g.player.auras.some((a) => a.id === "mongoose_ready") ? null : "Can only be performed after you dodge",
      effects: [{ type: "weaponDamage", hand: "main", normalized: true, flat: 57 }],
      text: "Counterattack the enemy for melee weapon damage plus 57. Can only be performed after you dodge. (Against the dummy: after it dodges you, or with Expose Prey.)"
    },
    {
      id: "lacerate",
      name: "Lacerate",
      icon: "ability_gouge",
      tree: "survival",
      ...melee5,
      cost: 95,
      effects: [{ type: "meleeDamage", noDamage: true, name: "Lacerate", onHit: [{ type: "applyAura", to: "target", aura: "lacerate" }] }],
      text: "Wounds the target causing them to bleed for 406 damage over 21 sec."
    },
    {
      id: "wing_clip",
      name: "Wing Clip",
      icon: "ability_rogue_trip",
      tree: "survival",
      ...melee5,
      cost: 80,
      effects: [{ type: "meleeDamage", min: 50, max: 50 }],
      text: "Inflicts 50 damage and reduces the enemy target's movement speed by 60% for 10 sec."
    },
    {
      id: "strider_kick",
      name: "Strider Kick",
      icon: "ability_hunter_pet_tallstrider",
      tree: "survival",
      ...melee5,
      cost: basePct2(0.0581),
      cooldown: 8,
      talent: "strider_kick",
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", normalized: true }],
      text: "A powerful kick that deals 100% melee weapon damage and increases movement speed by 30% for 3 sec."
    },
    {
      id: "immolation_trap",
      name: "Immolation Trap",
      icon: "spell_fire_flameshock",
      tree: "survival",
      schools: ["fire"],
      target: "self",
      cost: 245,
      cooldown: 30,
      cooldownGroup: "trap",
      trap: true,
      effects: [{ type: "custom", run: (g) => g.cls.placeTrap(g, "immolation_trap") }],
      text: "Place a Fire trap that will burn the first enemy to approach for 690 Fire damage over 15 sec. Trap will exist for 1 min. Only one Fire trap can be active at a time."
    },
    {
      id: "explosive_trap",
      name: "Explosive Trap",
      icon: "spell_fire_selfdestruct",
      tree: "survival",
      schools: ["fire"],
      target: "self",
      cost: 520,
      cooldown: 30,
      cooldownGroup: "trap",
      trap: true,
      effects: [{ type: "custom", run: (g) => g.cls.placeTrap(g, "explosive_trap") }],
      text: "Place a Fire trap that explodes when an enemy approaches, causing 208 to 264 Fire damage and 330 additional Fire damage over 20 sec to all within 10 yards. Trap will exist for 1 min. Only one Fire trap can be active at a time."
    }
  ];

  // src/classes/hunter/spellbook.js
  var trap = (kind) => ({ notSimulated: false, harmful: false, target: "self", range: void 0, trap: true, cooldownGroup: "trap", schools: ["frost"], effects: [{ type: "custom", run: (g) => g.cls.placeTrap(g, kind) }] });
  var aspect = (id, extra10 = {}) => ({ id, name: id, kind: "buff", exclusive: "aspect", duration: Infinity, ...extra10 });
  var speed = { notSimulated: false, mods: () => [mult("runSpeed", 1.3)], desc: () => "Movement speed increased by 30%." };
  var extra5 = spellbookAbilities(SPELLBOOK5, {
    known: new Set(abilities5.map((a) => a.name)),
    talents: new Set(trees5.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      freezing_trap: trap("freezing_trap"),
      frost_trap: trap("frost_trap"),
      ...Object.fromEntries(["aspect_of_the_monkey", "aspect_of_the_cheetah", "aspect_of_the_pack", "aspect_of_the_wild"].map((id) => [id, { effects: [{ type: "applyAura", to: "self", aura: id }], setsOption: ["aspect", id], notSimulated: !["aspect_of_the_cheetah", "aspect_of_the_pack"].includes(id) }]))
    },
    auraOverrides: {}
  });
  var ICON = { aspect_of_the_monkey: "ability_hunter_aspectofthemonkey", aspect_of_the_cheetah: "ability_mount_jungletiger", aspect_of_the_pack: "ability_mount_whitetiger", aspect_of_the_wild: "spell_nature_protectionformnature" };
  for (const [id, icon2] of Object.entries(ICON)) {
    const ab = extra5.abilities.find((a) => a.id === id);
    extra5.auras[id] = aspect(id, { name: ab.name, icon: icon2, notSimulated: ab.notSimulated, desc: () => ab.text.split(".")[0] + ".", ...ab.notSimulated ? {} : speed });
  }

  // src/classes/hunter/auras.js
  var aspect2 = (id, name, icon2, desc, mods) => ({ id, name, icon: icon2, kind: "buff", exclusive: "aspect", desc, mods });
  var auras5 = {
    /* ---------- Aspects ---------- */
    aspect_of_the_hawk: aspect2("aspect_of_the_hawk", "Aspect of the Hawk", "spell_nature_ravenform", () => "Ranged attack power increased by 120.", () => [add("rangedAttackPower", 120)]),
    aspect_of_the_beast: aspect2("aspect_of_the_beast", "Aspect of the Beast", "ability_mount_pinktiger", () => "Melee attack power increased by 110.", () => [add("attackPower", 110)]),
    /* ---------- buffs on the Hunter ---------- */
    rapid_fire: { id: "rapid_fire", name: "Rapid Fire", icon: "ability_hunter_runningshot", kind: "buff", duration: 15, mods: () => [mult("attackSpeed", 1.4, (ctx) => !ctx.pet)], desc: () => "Ranged and melee attack speed increased by 40%." },
    trueshot_aura: { id: "trueshot_aura", name: "Trueshot Aura", icon: "ability_trueshot", kind: "buff", duration: 1800, mods: () => [add("rangedAttackPower", 100)], desc: () => "Ranged attack power increased by 100." },
    sniper_range: { id: "sniper_range", name: "Sniper Shot", icon: "hunter_pvp_snipershot", kind: "buff", duration: 10, charges: 3, mods: () => [add("range", 10, (ctx) => !!ctx.ability && !!ctx.ability.shot)], desc: (a) => `Range of your next ${a.charges} Shots increased by 10 yards.` },
    // Deadly Aspects procs.
    quick_shots: { id: "quick_shots", name: "Quick Shots", icon: "ability_warrior_innerrage", kind: "buff", duration: 12, mods: () => [mult("attackSpeed", 1.3, (ctx) => !!ctx.ranged && !ctx.pet)], desc: () => "Ranged attack speed increased by 30%." },
    beast_quickness: { id: "beast_quickness", name: "Deadly Aspect", icon: "ability_mount_pinktiger", kind: "buff", duration: 12, mods: () => [mult("attackSpeed", 1.3, (ctx) => !ctx.ranged && !ctx.pet)], desc: () => "Melee attack speed increased by 30%." },
    mongoose_ready: { id: "mongoose_ready", name: "Mongoose Bite", icon: "ability_hunter_swiftstrike", kind: "buff", duration: 5, desc: () => "Mongoose Bite is usable." },
    // Mana regeneration while casting: Rapid Recuperation (after Serpent Sting) and Resourcefulness (after an ability crit).
    rapid_recuperation: { id: "rapid_recuperation", name: "Rapid Recuperation", icon: "ability_hunter_rapidregeneration", kind: "buff", duration: 15, mods: (a, g) => [add("regenWhileCasting", 0.25 * g.rank("rapid_recuperation"))], desc: (a, g) => `${25 * g.rank("rapid_recuperation")}% of mana regeneration continues while casting.` },
    resourcefulness: { id: "resourcefulness", name: "Resourcefulness", icon: "ability_hunter_resourcefulness", kind: "buff", duration: 30, mods: () => [add("regenWhileCasting", 0.5)], desc: () => "50% of mana regeneration continues while casting." },
    /* ---------- buffs on the pet ---------- */
    bestial_wrath: { id: "bestial_wrath", name: "Bestial Wrath", icon: "ability_druid_ferociousbite", kind: "buff", duration: 18, mods: () => [mult("damageMult", 1.5)], desc: () => "Damage increased by 50%." },
    intimidation: { id: "intimidation", name: "Intimidation", icon: "ability_devour", kind: "buff", duration: 15, mods: () => [add("critChance", 1)], desc: () => "The next successful attack stuns the target and gets 100% more critical strike chance." },
    frenzy: { id: "frenzy", name: "Frenzy", icon: "inv_misc_monsterclaw_03", kind: "buff", duration: 8, mods: () => [mult("attackSpeed", 1.3)], desc: () => "Attack speed increased by 30%." },
    /* ---------- debuffs on the target ---------- */
    hunters_mark: {
      id: "hunters_mark",
      name: "Hunter's Mark",
      icon: "ability_hunter_snipershot",
      kind: "debuff",
      duration: 120,
      sourceMods: () => [add("rangedAttackPower", 143)],
      desc: () => "Ranged attack power of attackers increased by 143."
    },
    serpent_sting: { id: "serpent_sting", name: "Serpent Sting", icon: "ability_hunter_quickshot", kind: "debuff", schools: ["nature"], dot: { period: 3, ticks: 5, base: 675 } },
    lacerate: { id: "lacerate", name: "Lacerate", icon: "ability_gouge", kind: "debuff", schools: ["physical"], dot: { period: 3, ticks: 7, base: 406 } },
    lacerating_strikes: { id: "lacerating_strikes", name: "Lacerating Strikes", icon: "ability_gouge", kind: "debuff", schools: ["physical"], dot: { period: 3, ticks: 7, base: 0 } },
    freezing_trap: { id: "freezing_trap", name: "Freezing Trap", icon: "spell_frost_chainsofice", kind: "debuff", duration: 20, flags: { frozen: true, stunned: true, breaksOnDamage: true }, desc: () => "Frozen. Damage breaks the ice." },
    immolation_trap: { id: "immolation_trap", name: "Immolation Trap", icon: "spell_fire_flameshock", kind: "debuff", schools: ["fire"], dot: { period: 3, ticks: 5, base: 690 } },
    explosive_trap: { id: "explosive_trap", name: "Explosive Trap", icon: "spell_fire_selfdestruct", kind: "debuff", schools: ["fire"], dot: { period: 2, ticks: 10, base: 330 } },
    intimidation_stun: { id: "intimidation_stun", name: "Intimidation", icon: "ability_devour", kind: "debuff", duration: 3, flags: { stunned: true }, desc: () => "Stunned." }
  };

  // src/classes/hunter/presets.js
  var gearPresets5 = [
    { id: "fresh", name: "Fresh 60", blurb: "Quest and dungeon greens and blues.", gear: { agi: 90, str: 20, sta: 80, int: 30, spi: 20, ap: 30, crit: 0.01, hit: 0.01, mp5: 0, haste: 0, rdps: 38, wdps2h: 45, wdps: 35, odps: 32 } },
    { id: "preraid", name: "Pre-raid", blurb: "Best dungeon, quest and crafted gear before raids.", gear: { agi: 236, str: 42, sta: 93, int: 55, spi: 9, ap: 38, rap: 51, crit: 0.08, hit: 0.049, parry: 0.01, mp5: 0, haste: 0, rdps: 52, wdps2h: 59, wdps: 46, odps: 46, armor: 2139 } }
  ];
  var builds5 = [
    {
      id: "beast_mastery",
      name: "Beast Mastery",
      points: "31/20/0",
      blurb: "A cat at your side and two hawks in the air. Bestial Wrath and Intimidation for the pet, Frenzy from its crits, Aimed Shot, Multi-Shot and Arcane Shot from range.",
      options: { ranged: "bow", mainHand: "two_hand_axe", offHand: "none" },
      talents: {
        deadly_aspects: 5,
        endurance_training: 1,
        focused_fire: 2,
        improved_revive_pet: 2,
        bestial_swiftness: 1,
        unleashed_fury: 5,
        ferocity: 5,
        summon_hawk: 1,
        intimidation: 1,
        bestial_discipline: 2,
        frenzy: 5,
        bestial_wrath: 1,
        lethal_attacks: 5,
        improved_stings: 3,
        efficiency: 2,
        careful_aim: 5,
        mortal_shots: 5
      },
      bar: ["arcane_shot", "aimed_shot", "serpent_sting", "hunters_mark", "summon_hawk", "multi_shot", "bestial_wrath", "intimidation", "rapid_fire", "volley", "major_mana_potion"]
    },
    {
      id: "marksmanship",
      name: "Marksmanship",
      points: "5/43/3",
      blurb: "No pet (Lone Wolf, +20% damage). Aimed Shot and Multi-Shot on cooldown, Arcane Shot and Serpent Sting in between, Sniper Shot from far away, Mortal Shots for big crits.",
      options: { ranged: "bow", mainHand: "two_hand_axe", offHand: "none" },
      talents: {
        deadly_aspects: 5,
        lethal_attacks: 5,
        improved_stings: 3,
        efficiency: 5,
        careful_aim: 5,
        rapid_killing: 2,
        improved_arcane_shot: 5,
        lone_wolf: 1,
        trueshot_aura: 1,
        mortal_shots: 5,
        rapid_recuperation: 2,
        barrage: 3,
        ranged_weapon_specialization: 5,
        sniper_shot: 1,
        improved_tracking: 3
      },
      bar: ["arcane_shot", "aimed_shot", "serpent_sting", "sniper_shot", "multi_shot", "hunters_mark", "volley", "rapid_fire", "major_mana_potion"]
    },
    {
      id: "survival",
      name: "Survival",
      points: "5/11/35",
      blurb: "A melee Hunter with two axes and no pet (Lone Wolf). Raptor Strike and Strider Kick on cooldown, Lacerate up, Mongoose Bite whenever Expose Prey lights it, Explosive Trap at your feet.",
      options: { ranged: "bow", mainHand: "axe", offHand: "axe" },
      talents: {
        deadly_aspects: 5,
        lethal_attacks: 5,
        careful_aim: 5,
        lone_wolf: 1,
        improved_tracking: 5,
        savage_strikes: 2,
        survivalist: 3,
        clever_traps: 2,
        surefooted: 3,
        survival_tactics: 2,
        predators_edge: 5,
        resourcefulness: 2,
        expose_prey: 2,
        survivalists_discipline: 2,
        strider_kick: 1,
        lightning_reflexes: 5,
        lacerating_strikes: 1
      },
      bar: ["raptor_strike", "lacerate", "strider_kick", "mongoose_bite", "immolation_trap", "explosive_trap", "serpent_sting", "rapid_fire", "hunters_mark", "major_mana_potion"]
    }
  ];

  // src/classes/hunter/hunter.js
  var MAIN_HANDS3 = ["two_hand_axe", "polearm", "two_hand_sword", "axe", "sword", "dagger", "fist"];
  var OFF_HANDS3 = ["none", "axe", "sword", "dagger", "fist"];
  var RANGED = ["bow", "crossbow", "gun"];
  var AMMO_DPS = 17.5;
  var TRACKABLE = ["beast", "demon", "dragonkin", "elemental", "giant", "humanoid", "undead"];
  var TRAP_RADIUS = 5;
  var PETS = {
    cat: { id: "cat", name: "Cat (pet)", icon: "ability_hunter_pet_cat", color: "#c9a46b", speed: 2, min: 60, max: 80, crit: 0.05, special: { id: "claw", name: "Claw (pet)", icon: "ability_druid_rake", every: 4.5, min: 54, max: 76 } }
  };
  var HAWK = {
    id: "hawk",
    name: "Hawk",
    icon: "ability_hunter_animalhandler",
    color: "#e8dcc0",
    speed: 2,
    min: 54,
    max: 65,
    crit: 0.05,
    /* about 80% more since a hotfix (was 30 to 36) */
    firstHit: { id: "summon_hawk", name: "Summon Hawk", icon: "ability_hunter_animalhandler", min: 108, max: 112 }
  };
  var isPlayer4 = (game, ev) => ev.ctx.caster === game.player;
  var landedRes4 = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var isMeleeAbility = (ab) => !!ab && ab.range === "melee";
  var isPlayerHit = (ctx) => !ctx.pet;
  var hunter = {
    id: "hunter",
    name: "Hunter",
    icon: "classicon_hunter",
    color: "#abd473",
    resource: "mana",
    gcd: 1.5,
    source: SOURCE5,
    // Level 60 Human Hunter base stats (Classic, approximate). Melee attack power: Strength + Agility + level x 2 - 20;
    // ranged attack power: Agility x 2 + level x 2 - 10. 53 Agility per 1% crit.
    stats: {
      level: 60,
      canParry: true,
      base: { str: 57, agi: 121, sta: 87, int: 63, spi: 68 },
      baseHp: 1467,
      baseMana: 1720,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1467 + conv(a.sta, 10) - 20,
          maxMana: 1720 + conv(a.int, 15) - 20,
          ap: a.str + a.agi + 100,
          rap: a.agi * 2 + 110,
          crit: a.agi / 53 / 100,
          regen: (15 + a.spi / 5) / 2
        };
      }
    },
    weapons(game) {
      const o = game.loadout.options || {}, g = game.loadout.gear || {};
      const mh = MAIN_HANDS3.includes(o.mainHand) ? o.mainHand : "two_hand_axe";
      const rg = RANGED.includes(o.ranged) ? o.ranged : "bow";
      const ranged = makeWeapon(rg, "ranged", g.rdps || 40, AMMO_DPS);
      if (WEAPON_TYPES[mh].twoHand) return { main: makeWeapon(mh, "main", g.wdps2h || 50), off: null, ranged };
      const oh = OFF_HANDS3.includes(o.offHand) ? o.offHand : "none";
      return { main: makeWeapon(mh, "main", g.wdps || 40), off: makeWeapon(oh, "off", g.odps || 35), ranged };
    },
    stanceBar: { label: "Aspects", abilities: ["aspect_of_the_hawk", "aspect_of_the_beast", "aspect_of_the_cheetah", "aspect_of_the_pack"] },
    // Monkey and Wild are not simulated
    trees: trees5,
    talentHistory: talentHistory5,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities5, ...extra5.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras5, ...extra5.auras },
    gearPresets: gearPresets5,
    builds: builds5,
    gearFields: [
      { k: "agi", label: "Agility", step: 5, max: 600 },
      { k: "str", label: "Strength", step: 5, max: 300 },
      { k: "int", label: "Intellect", step: 5, max: 400, note: "Careful Aim turns it into attack power." },
      { k: "ap", label: "Attack power", step: 10, max: 1e3, note: "From gear; counts for melee and ranged." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "mp5", label: "Mana per 5 sec", step: 1, max: 60 },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." },
      { k: "rdps", label: "Ranged weapon DPS", step: 1, max: 90, note: `Plus ${AMMO_DPS} DPS from ammunition (estimate).` },
      { k: "wdps2h", label: "Two-hander DPS", step: 1, max: 120 },
      { k: "wdps", label: "One-hander DPS", step: 1, max: 90 },
      { k: "odps", label: "Off hand DPS", step: 1, max: 90 }
    ],
    options: {
      // The aspect at the start of a fight: the one picked on the aspect bar (hidden from the gear panel); unset: the spec's.
      aspect: { label: "Aspect", hidden: true, values: ["aspect_of_the_hawk", "aspect_of_the_beast", "aspect_of_the_cheetah", "aspect_of_the_pack"] },
      ranged: { label: "Ranged weapon", values: RANGED, names: weaponNames(RANGED), default: "bow" },
      mainHand: { label: "Main hand", values: MAIN_HANDS3, names: weaponNames(MAIN_HANDS3), default: "two_hand_axe" },
      offHand: { label: "Off hand", values: OFF_HANDS3, names: { ...weaponNames(OFF_HANDS3), none: "None" }, default: "none", note: "Ignored with a two-handed weapon." }
    },
    sheet(game, f) {
      const s = game.stats(), w = hunter.weapons(game);
      return [
        ["Agility", f.int(s.agi)],
        ["Intellect", f.int(s.int)],
        ["Ranged attack power", f.int(s.rap)],
        ["Melee attack power", f.int(s.ap)],
        ["Mana", f.int(s.maxMana)],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Ranged", describeWeapon(w.ranged)],
        ["Main hand", describeWeapon(w.main)],
        ["Off hand", w.main && w.main.twoHand ? "None (two-hander)" : describeWeapon(w.off)]
      ];
    },
    // The pet (a cat) is out from the start, unless the Hunter took Lone Wolf.
    // Aspect of the Beast for Survival (melee in Forever), Aspect of the Hawk for the others; Trueshot Aura when talented.
    // The aspect: the one picked last on the aspect bar, else the spec's.
    startBuffs: (game) => [(game.loadout.options || {}).aspect || (game.mainTree() === "survival" ? "aspect_of_the_beast" : "aspect_of_the_hawk"), "trueshot_aura"],
    onReset(game) {
      if (!game.rank("lone_wolf")) summonPet(game, PETS.cat);
    },
    pet(game) {
      return game.pets.find((p) => p.def.id !== "hawk") || null;
    },
    buffPet(game, auraId) {
      const p = hunter.pet(game);
      if (p) applyAura(game, p, auras5[auraId], { source: game.player });
    },
    // Summon Hawk: the hawk dives on the target (its first attack) and keeps attacking for 18 sec. Two at most.
    summonHawk(game, ctx) {
      const t = ctx.target;
      if (!t) return;
      const hawks = game.pets.filter((p) => p.def.id === "hawk");
      if (hawks.length >= 2) dismissPet(game, hawks[0]);
      const hawk = summonPet(game, HAWK, { duration: 18, firstHitIn: 0 });
      hawk.x = t.x - 1;
      hawk.y = t.y - 1;
    },
    // Traps: placed at the Hunter's feet, one Fire trap and one Frost trap at a time; the first enemy within 5 yards sets
    // it off (checked every 0.2 sec, 1 min). Freezing Trap freezes it (damage breaks the ice); Frost Trap leaves an ice slick.
    placeTrap(game, kind) {
      const p = game.player, frost2 = kind === "freezing_trap" || kind === "frost_trap", group = frost2 ? "frost" : "fire";
      p.traps = p.traps || {};
      const old = p.traps[group];
      if (old && old.zone) game.removeZone(old.zone);
      const trap2 = { kind, x: p.x, y: p.y, expires: game.time + 60 };
      trap2.zone = game.addZone({ kind: "trap", x: trap2.x, y: trap2.y, radius: TRAP_RADIUS, duration: 60, schools: frost2 ? ["frost"] : ["fire"], label: game.ability(kind).name });
      p.traps[group] = trap2;
      const check = (g) => {
        if (p.traps[group] !== trap2 || g.time > trap2.expires) return;
        const hit2 = g.enemies.filter((e) => !e.dead && dist(trap2, e) <= TRAP_RADIUS + e.radius);
        if (!hit2.length) {
          g.schedule(0.2, check);
          return;
        }
        p.traps[group] = null;
        g.removeZone(trap2.zone);
        const ability = g.ability(kind);
        if (frost2) {
          g.emit("fx", { kind: "nova", x: trap2.x, y: trap2.y, r: kind === "frost_trap" ? 10 : 3, schools: ["frost"] });
          if (kind === "freezing_trap") applyAura(g, hit2[0], auras5.freezing_trap, { source: p, duration: 20 * (1 + 0.15 * g.rank("clever_traps")), data: { ability } });
          else g.addZone({ kind: "area", x: trap2.x, y: trap2.y, radius: 10, duration: 30 * (1 + 0.15 * g.rank("clever_traps")), schools: ["frost"], label: "Frost Trap" });
          return;
        }
        g.emit("fx", { kind: "nova", x: trap2.x, y: trap2.y, r: kind === "explosive_trap" ? 10 : 3, schools: ["fire"] });
        const targets = kind === "explosive_trap" ? g.enemies.filter((e) => !e.dead && dist(trap2, e) <= 10 + e.radius) : [hit2[0]];
        for (const t of targets) {
          const ctx = { castId: ++g.castSeq, caster: p, target: t, schools: ["fire"], tags: ["trap"], ability };
          if (kind === "explosive_trap") {
            const res = spellHit(g, ctx, { min: 208, max: 264, name: "Explosive Trap" });
            if (res.outcome !== "miss") applyAura(g, t, auras5.explosive_trap, { source: p, data: { ability } });
          } else applyAura(g, t, auras5.immolation_trap, { source: p, data: { ability } });
        }
      };
      game.schedule(0.2, check);
    },
    listen(game, on) {
      const p = () => game.player;
      on("damage", (ev) => {
        if (isPlayer4(game, ev) && ev.ctx.melee && !ev.ctx.ranged && ev.res.outcome === "dodge") applyAura(game, p(), auras5.mongoose_ready, { source: p() });
      });
      on("cast:success", ({ ability }) => {
        if (ability.id === "mongoose_bite") {
          const a = findAura(p(), "mongoose_ready");
          if (a) removeAura(game, a, "consumed");
        }
        if (ability.shot) {
          const a = findAura(p(), "sniper_range");
          if (a && ability.id !== "sniper_shot") useCharge(game, a);
        }
      });
      on("damage", (ev) => {
        const pet = ev.ctx.caster;
        if (!ev.ctx.pet || !landedRes4(ev.res)) return;
        const a = findAura(pet, "intimidation");
        if (a) {
          removeAura(game, a, "consumed");
          applyAura(game, ev.ctx.target, auras5.intimidation_stun, { source: p() });
        }
      });
    },
    talents: {
      // Pet talents: Bestial Swiftness moves the pet 30% faster; the others need a pet that takes damage or dies, which
      // never happens in the lab (inert: the reason shows in the tooltip).
      bestial_swiftness: { mods: () => [mult("petRunSpeed", 1.3)] },
      endurance_training: { inert: "the pet never takes damage in the lab, so its health and armor never matter." },
      improved_revive_pet: { inert: "the pet never dies in the lab, so there is no Revive Pet." },
      /* ---------- Beast Mastery ---------- */
      deadly_aspects: {
        listen(game, r, on) {
          on("swing", ({ hand, res }) => {
            if (!landedRes4(res) || game.rng() >= 0.02 * r) return;
            const p = game.player;
            if (hand === "ranged" && findAura(p, "aspect_of_the_hawk")) applyAura(game, p, auras5.quick_shots, { source: p });
            else if (hand !== "ranged" && findAura(p, "aspect_of_the_beast")) applyAura(game, p, auras5.beast_quickness, { source: p });
          });
        }
      },
      focused_fire: { mods: (r) => [mult("damageMult", 1 + 0.01 * r, (ctx, g) => !!hunter.pet(g) && ctx.petKind !== "hawk")] },
      unleashed_fury: { mods: (r) => [mult("damageMult", 1 + 0.03 * r, (ctx) => !!ctx.pet)] },
      ferocity: { mods: (r) => [add("critChance", 0.02 * r, (ctx) => !!ctx.pet)] },
      summon_hawk: { teaches: "summon_hawk" },
      intimidation: { teaches: "intimidation" },
      bestial_discipline: { mods: (r) => [add("regenWhileCasting", 0.25 * r)] },
      frenzy: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!ev.ctx.pet || ev.ctx.petKind === "hawk" || ev.periodic || ev.res.outcome !== "crit" || game.rng() >= 0.2 * r) return;
            applyAura(game, ev.ctx.caster, auras5.frenzy, { source: game.player });
          });
        }
      },
      bestial_wrath: { teaches: "bestial_wrath" },
      /* ---------- Marksmanship ---------- */
      hawk_eye: { mods: (r) => [add("range", 2 * r, (ctx) => !!ctx.ranged || !!ctx.ability && !!ctx.ability.shot)] },
      lethal_attacks: { mods: (r) => [add("critChance", 0.01 * r, isPlayerHit)] },
      improved_stings: { mods: (r) => [mult("damageMult", 1 + [0.06, 0.13, 0.2][r - 1], (ctx) => isAbility(ctx, "serpent_sting"))] },
      efficiency: { mods: (r) => [mult("cost", 1 - 0.03 * r, (ctx) => !!ctx.ability && (!!ctx.ability.shot || !!ctx.ability.sting || isMeleeAbility(ctx.ability)))] },
      careful_aim: {
        mods: (r) => [
          { key: "attackPower", fn: (v, ctx, g) => v + g.stats().int * 0.2 * r },
          { key: "rangedAttackPower", fn: (v, ctx, g) => v + g.stats().int * 0.2 * r }
        ]
      },
      rapid_killing: { mods: (r) => [add("cooldown", -60 * r, (ctx) => isAbility(ctx, "rapid_fire"))] },
      improved_arcane_shot: { mods: (r) => [add("cooldown", -0.3 * r, (ctx) => isAbility(ctx, "arcane_shot"))] },
      lone_wolf: { mods: () => [mult("damageMult", 1.2, (ctx, g) => isPlayerHit(ctx) && !hunter.pet(g))] },
      trueshot_aura: { teaches: "trueshot_aura" },
      mortal_shots: { mods: (r) => [mult("critBonusMult", 1 + 0.06 * r, (ctx) => !!ctx.ranged && !ctx.white)] },
      rapid_recuperation: {
        listen(game, r, on) {
          on("aura:apply", ({ aura: aura2 }) => {
            if (aura2.id === "serpent_sting" && aura2.source === game.player) applyAura(game, game.player, auras5.rapid_recuperation, { source: game.player });
          });
        }
      },
      barrage: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "multi_shot", "aimed_shot", "volley"))] },
      scatter_shot: { teaches: "scatter_shot" },
      ranged_weapon_specialization: { mods: (r) => [mult("damageMult", 1 + 0.01 * r, (ctx) => !!ctx.ranged)] },
      sniper_shot: { teaches: "sniper_shot" },
      /* ---------- Survival ---------- */
      deflection: { mods: (r) => [add("parryChance", 0.01 * r)] },
      survivalist: { mods: (r) => [mult("maxHp", 1 + 0.02 * r)] },
      improved_tracking: { mods: (r) => [mult("damageMult", 1 + 0.01 * r, (ctx) => isPlayerHit(ctx) && !!ctx.target && TRACKABLE.includes(ctx.target.creatureType))] },
      savage_strikes: { mods: (r) => [add("critChance", 0.02 * r, (ctx) => isMeleeAbility(ctx.ability) && !ctx.white)] },
      clever_traps: { mods: (r) => [mult("damageMult", 1 + 0.15 * r, (ctx) => !!ctx.ability && !!ctx.ability.trap)] },
      surefooted: { mods: (r) => [add("hitChance", 0.01 * r, isPlayerHit)] },
      survival_tactics: { mods: (r) => [add("hitChance", 0.05 * r, (ctx) => !!ctx.tags && ctx.tags.includes("trap"))] },
      predators_edge: {
        mods: (r) => [
          mult("critBonusMult", 1 + 0.06 * r, (ctx) => isMeleeAbility(ctx.ability) && !ctx.white),
          mult("damageMult", 1 + 0.1 * r, (ctx) => !!ctx.melee && ctx.hand === "off")
        ]
      },
      resourcefulness: {
        mods: (r) => [mult("cost", 1 - 0.3 * r, (ctx) => !!ctx.ability && (!!ctx.ability.trap || isMeleeAbility(ctx.ability)))],
        listen(game, r, on) {
          on("damage", (ev) => {
            const ab = ev.ctx.ability;
            if (!isPlayer4(game, ev) || ev.periodic || ev.res.outcome !== "crit" || !ab || !(ab.shot || isMeleeAbility(ab)) || game.rng() >= 0.5 * r) return;
            applyAura(game, game.player, auras5.resourcefulness, { source: game.player });
          });
        }
      },
      expose_prey: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer4(game, ev) || ev.periodic || !ev.ctx.melee || !landedRes4(ev.res) || !findAura(ev.ctx.target, "hunters_mark", game.player) || game.rng() >= 0.05 * r) return;
            applyAura(game, game.player, auras5.mongoose_ready, { source: game.player, duration: 10 });
          });
        }
      },
      survivalists_discipline: { mods: (r) => [mult("cooldown", 1 - 0.2 * r, (ctx) => !!ctx.ability && !!ctx.ability.trap)] },
      strider_kick: { teaches: "strider_kick" },
      lightning_reflexes: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, agi: a.agi * (1 + 0.03 * r) }) }] },
      lacerating_strikes: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer4(game, ev) || ev.periodic || !isAbility(ev.ctx, "mongoose_bite") || !landedRes4(ev.res) || ev.res.amount <= 0) return;
            applyAura(game, ev.ctx.target, auras5.lacerating_strikes, { source: game.player, dot: { base: 0.4 * ev.res.amount }, data: { ability: { id: "lacerating_strikes", name: "Lacerating Strikes", icon: "ability_gouge", schools: ["physical"] } } });
          });
        }
      }
    }
  };

  // src/classes/warlock/talent-data.js
  var SOURCE6 = { site: "foreverchanges.pro/talents/warlock", build: "1.60.1.70790", extracted: "2026-11-05" };
  var trees6 = [
    {
      id: "affliction",
      name: "Affliction",
      icon: "spell_shadow_deathcoil",
      talents: [
        { id: "improved_life_tap", name: "Improved Life Tap", icon: "spell_shadow_burningspirit", tier: 0, col: 0, max: 2, ranks: ["Increases the amount of Mana awarded by your Life Tap spell by 10%.", "Increases the amount of Mana awarded by your Life Tap spell by 20%."] },
        { id: "suppression", name: "Suppression", icon: "spell_shadow_unsummonbuilding", tier: 0, col: 1, max: 5, ranks: ["Improves your chance to hit by 1% and reduces all threat you generate by 4%.", "Improves your chance to hit by 2% and reduces all threat you generate by 8%.", "Improves your chance to hit by 3% and reduces all threat you generate by 12%.", "Improves your chance to hit by 4% and reduces all threat you generate by 16%.", "Improves your chance to hit by 5% and reduces all threat you generate by 20%."] },
        { id: "improved_corruption", name: "Improved Corruption", icon: "spell_shadow_abominationexplosion", tier: 0, col: 2, max: 5, ranks: ["Reduces the casting time of your Corruption spell by 0.4 sec and increases the damage it deals by 2%.", "Reduces the casting time of your Corruption spell by 0.8 sec and increases the damage it deals by 4%.", "Reduces the casting time of your Corruption spell by 1.2 sec and increases the damage it deals by 6%.", "Reduces the casting time of your Corruption spell by 1.6 sec and increases the damage it deals by 8%.", "Reduces the casting time of your Corruption spell by 2 sec and increases the damage it deals by 10%."] },
        { id: "grim_reach", name: "Grim Reach", icon: "spell_shadow_callofbone", tier: 1, col: 0, max: 2, ranks: ["Increases the range of your Affliction spells by 10%.", "Increases the range of your Affliction spells by 20%."] },
        { id: "soul_harvest", name: "Soul Harvest", icon: "inv_elemental_primal_shadow", tier: 1, col: 1, max: 2, ranks: ["Killing a non-trivial target afflicted by your Drain Soul increases your Mana regeneration by 50% for 10 sec and allows 50% of normal Mana regeneration to continue while casting.", "Killing a non-trivial target afflicted by your Drain Soul increases your Mana regeneration by 100% for 10 sec and allows 100% of normal Mana regeneration to continue while casting."] },
        { id: "improved_drains", name: "Improved Drains", icon: "spell_shadow_haunting", tier: 1, col: 2, max: 3, ranks: ["Increases Health drained, damage done, or Mana drained by your Drain Life, Drain Soul, and Drain Mana spells by 7%.", "Increases Health drained, damage done, or Mana drained by your Drain Life, Drain Soul, and Drain Mana spells by 13%.", "Increases Health drained, damage done, or Mana drained by your Drain Life, Drain Soul, and Drain Mana spells by 20%."] },
        { id: "improved_bane_of_agony", name: "Improved Bane of Agony", icon: "spell_shadow_curseofsargeras", tier: 2, col: 0, max: 2, ranks: ["Increases the damage done by your Bane of Agony by 5%.", "Increases the damage done by your Bane of Agony by 10%."] },
        { id: "fel_concentration", name: "Fel Concentration", icon: "spell_shadow_fingerofdeath", tier: 2, col: 1, max: 3, ranks: ["Gives your Drain Life, Drain Mana, Drain Soul, and Wrack spells a 23% chance to not lose casting time when you take damage.", "Gives your Drain Life, Drain Mana, Drain Soul, and Wrack spells a 47% chance to not lose casting time when you take damage.", "Gives your Drain Life, Drain Mana, Drain Soul, and Wrack spells a 70% chance to not lose casting time when you take damage."] },
        { id: "amplify_curse", name: "Amplify Curse", icon: "spell_shadow_contagion", tier: 2, col: 2, max: 1, active: true, ranks: ["Increases the effect of your next Curse of Weakness or Bane of Agony by 50%, or your next Curse of Exhaustion by 20%. Lasts 30 sec."] },
        { id: "pandemic", name: "Pandemic", icon: "spell_shadow_unstableaffliction_2", tier: 2, col: 3, max: 3, ranks: ["Increases the critical strike damage bonus of your Corruption, Bane of Agony, Bane of Doom, Drain Soul, Drain Life, Siphon Life, and Wrack spells by 33%.", "Increases the critical strike damage bonus of your Corruption, Bane of Agony, Bane of Doom, Drain Soul, Drain Life, Siphon Life, and Wrack spells by 67%.", "Increases the critical strike damage bonus of your Corruption, Bane of Agony, Bane of Doom, Drain Soul, Drain Life, Siphon Life, and Wrack spells by 100%."] },
        { id: "malevolence", name: "Malevolence", icon: "spell_shadow_focusedpower", tier: 3, col: 0, max: 5, ranks: ["Increases the critical effect chance of your Shadow spells by 1%.", "Increases the critical effect chance of your Shadow spells by 2%.", "Increases the critical effect chance of your Shadow spells by 3%.", "Increases the critical effect chance of your Shadow spells by 4%.", "Increases the critical effect chance of your Shadow spells by 5%."] },
        { id: "nightfall", name: "Nightfall", icon: "spell_shadow_twilight", tier: 3, col: 1, max: 2, ranks: ["Gives your Corruption, Drain Soul, Drain Life, and Wrack spells a 2% chance to cause you to enter a Shadow Trance after damaging the opponent. The Shadow Trance reduces the casting time of your next Shadow Bolt spell by 100%.", "Gives your Corruption, Drain Soul, Drain Life, and Wrack spells a 4% chance to cause you to enter a Shadow Trance after damaging the opponent. The Shadow Trance reduces the casting time of your next Shadow Bolt spell by 100%."] },
        { id: "curse_of_exhaustion", name: "Curse of Exhaustion", icon: "spell_shadow_grimward", tier: 3, col: 2, max: 1, req: "amplify_curse", active: true, ranks: ["Reduces the target's movement speed by 30% for 12 sec. Only one Curse per Warlock can be active on any one target."] },
        { id: "siphon_life", name: "Siphon Life", icon: "spell_shadow_requiem", tier: 4, col: 1, max: 1, active: true, ranks: ["Transfers 11 health from the target to the caster every 3 sec. Lasts 30 sec."] },
        { id: "soul_siphon", name: "Soul Siphon", icon: "spell_shadow_lifedrain02", tier: 4, col: 2, max: 3, ranks: ["Increases the damage done or health drained by your Drain Life, Drain Soul, and Wrack spells by 4% per each of your other Affliction effects active on the target, up to a maximum increase of 12%.", "Increases the damage done or health drained by your Drain Life, Drain Soul, and Wrack spells by 8% per each of your other Affliction effects active on the target, up to a maximum increase of 24%.", "Increases the damage done or health drained by your Drain Life, Drain Soul, and Wrack spells by 12% per each of your other Affliction effects active on the target, up to a maximum increase of 36%."] },
        { id: "shadow_mastery", name: "Shadow Mastery", icon: "spell_shadow_shadetruesight", tier: 5, col: 2, max: 5, ranks: ["Increases the damage dealt or life drained by your Shadow spells by 2%.", "Increases the damage dealt or life drained by your Shadow spells by 4%.", "Increases the damage dealt or life drained by your Shadow spells by 6%.", "Increases the damage dealt or life drained by your Shadow spells by 8%.", "Increases the damage dealt or life drained by your Shadow spells by 10%."] },
        { id: "wrack", name: "Wrack", icon: "ability_deathknight_hemorrhagicfever", tier: 6, col: 1, max: 1, req: "siphon_life", active: true, ranks: ["Tears the target apart from within, inflicting 36 Shadow damage every 1 sec and increasing the damage they take from your other Shadow damage over time effects by 10% for 6 sec."] }
      ]
    },
    {
      id: "demonology",
      name: "Demonology",
      icon: "spell_shadow_metamorphosis",
      talents: [
        { id: "improved_health_funnel", name: "Improved Health Funnel", icon: "spell_shadow_lifedrain", tier: 0, col: 0, max: 2, ranks: ["Increases the amount of health transferred by your Health Funnel spell by 20%, reduces its health cost by 15%, and reduces all threat your Health Funnel generates by 50%. Allows Health Funnel to be used regardless of your demon's health.", "Increases the amount of health transferred by your Health Funnel spell by 40%, reduces its health cost by 30%, and reduces all threat your Health Funnel generates by 100%. Allows Health Funnel to be used regardless of your demon's health."] },
        { id: "improved_imp", name: "Improved Imp", icon: "spell_shadow_summonimp", tier: 0, col: 1, max: 3, ranks: ["Increases the damage of your Imp's Firebolt spell by 10% and the effect of its Fire Shield spell by 10%.", "Increases the damage of your Imp's Firebolt spell by 20% and the effect of its Fire Shield spell by 20%.", "Increases the damage of your Imp's Firebolt spell by 30% and the effect of its Fire Shield spell by 30%."] },
        { id: "demonic_embrace", name: "Demonic Embrace", icon: "spell_shadow_metamorphosis", tier: 0, col: 2, max: 5, ranks: ["Increases your total Stamina by 3%.", "Increases your total Stamina by 6%.", "Increases your total Stamina by 9%.", "Increases your total Stamina by 12%.", "Increases your total Stamina by 15%."] },
        { id: "unholy_power", name: "Unholy Power", icon: "spell_shadow_shadowworddominate", tier: 0, col: 3, max: 5, ranks: ["Increases all damage done by your Imp, Voidwalker, Succubus, Incubus, and Felhunter pets by 2%.", "Increases all damage done by your Imp, Voidwalker, Succubus, Incubus, and Felhunter pets by 4%.", "Increases all damage done by your Imp, Voidwalker, Succubus, Incubus, and Felhunter pets by 6%.", "Increases all damage done by your Imp, Voidwalker, Succubus, Incubus, and Felhunter pets by 8%.", "Increases all damage done by your Imp, Voidwalker, Succubus, Incubus, and Felhunter pets by 10%."] },
        { id: "demonic_aegis", name: "Demonic Aegis", icon: "spell_shadow_ragingscream", tier: 1, col: 0, max: 2, ranks: ["Increases the effectiveness of your Demon Skin and Demon Armor spells by 15%.", "Increases the effectiveness of your Demon Skin and Demon Armor spells by 30%."] },
        { id: "improved_voidwalker", name: "Improved Voidwalker", icon: "spell_shadow_summonvoidwalker", tier: 1, col: 1, max: 3, ranks: ["Increases the effectiveness of your Voidwalker's Torment, Consume Shadows, Sacrifice, and Suffering spells by 10%.", "Increases the effectiveness of your Voidwalker's Torment, Consume Shadows, Sacrifice, and Suffering spells by 20%.", "Increases the effectiveness of your Voidwalker's Torment, Consume Shadows, Sacrifice, and Suffering spells by 30%."] },
        { id: "fel_vitality", name: "Fel Vitality", icon: "spell_shadow_demonictactics", tier: 1, col: 2, max: 3, ranks: ["Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 5%, and increases your maximum Mana by 5%.", "Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 10%, and increases your maximum Mana by 10%.", "Increases the maximum health and Mana of your Imp, Voidwalker, Succubus, Incubus, and Felhunter by 15%, and increases your maximum Mana by 15%."] },
        { id: "demonic_energies", name: "Demonic Energies", icon: "spell_shadow_felmending", tier: 1, col: 3, max: 2, ranks: ["You heal your pet for 8% of all spell damage you deal. When you gain Mana from Life Tap, your summoned demon gains 50% of the Mana you gain.", "You heal your pet for 15% of all spell damage you deal. When you gain Mana from Life Tap, your summoned demon gains 100% of the Mana you gain."] },
        { id: "improved_sayaad", name: "Improved Sayaad", icon: "ability_warlock_randomizesuccubusincubus", tier: 2, col: 0, max: 3, ranks: ["Increases the effect of your Succubus' and Incubus' Lash of Pain and Soothing Kiss spells by 10%, and increases the duration of your Succubus' and Incubus' Seduction and Lesser Invisibility spells by 10%.", "Increases the effect of your Succubus' and Incubus' Lash of Pain and Soothing Kiss spells by 20%, and increases the duration of your Succubus' and Incubus' Seduction and Lesser Invisibility spells by 20%.", "Increases the effect of your Succubus' and Incubus' Lash of Pain and Soothing Kiss spells by 30%, and increases the duration of your Succubus' and Incubus' Seduction and Lesser Invisibility spells by 30%."] },
        { id: "demonic_sacrifice", name: "Demonic Sacrifice", icon: "spell_shadow_psychicscream", tier: 2, col: 1, max: 1, active: true, ranks: ["When activated, sacrifices your summoned Demon to enhance the opposing aspect of your power, granting you an effect that lasts 2 hr. The effect is canceled if any Demon is summoned.\n\nImp: Increases your Shadow damage by 15%.\n\nVoidwalker: Restores 2% of your total Mana every 4 sec.\n\nSuccubus/Incubus: Increases your Fire damage by 15%.\n\nFelhunter: Restores 3% of your total Health every 4 sec."] },
        { id: "master_summoner", name: "Master Summoner", icon: "spell_shadow_impphaseshift", tier: 2, col: 2, max: 2, ranks: ["Reduces the casting time of your Imp, Voidwalker, Succubus, Incubus, and Felhunter Summoning spells by 2 sec and the Mana cost by 20%.", "Reduces the casting time of your Imp, Voidwalker, Succubus, Incubus, and Felhunter Summoning spells by 4 sec and the Mana cost by 40%."] },
        { id: "decimation", name: "Decimation", icon: "spell_fire_fireball02", tier: 3, col: 0, max: 2, ranks: ["Reduces the cooldown of your Soul Fire spell by 45%. When you cast Shadow Bolt or Searing Pain on an enemy below 35% health, they deal 3% increased damage, and for the next 10 sec your Soul Fire spell has its cast time reduced by 20% and costs no Soul Shards.", "Reduces the cooldown of your Soul Fire spell by 90%. When you cast Shadow Bolt or Searing Pain on an enemy below 35% health, they deal 6% increased damage, and for the next 10 sec your Soul Fire spell has its cast time reduced by 40% and costs no Soul Shards."] },
        { id: "fel_domination", name: "Fel Domination", icon: "spell_nature_removecurse", tier: 3, col: 2, max: 1, req: "master_summoner", active: true, ranks: ["Your next Imp, Voidwalker, Succubus, Incubus, or Felhunter Summon spell has its casting time reduced by 5.5 sec and its Mana cost reduced by 50%."] },
        { id: "demonic_brand", name: "Demonic Brand", icon: "ability_demonhunter_chaoticimprint_fire", tier: 3, col: 3, max: 3, ranks: ["Your Searing Pain generates 17% less threat and brands the target for 10 sec. Your pet's next 2 attacks against the target deal 1 to 1 Fire or Shadow damage based on the pet. If Shadow damage is dealt, it has high threat.", "Your Searing Pain generates 33% less threat and brands the target for 10 sec. Your pet's next 4 attacks against the target deal 1 to 1 Fire or Shadow damage based on the pet. If Shadow damage is dealt, it has high threat.", "Your Searing Pain generates 50% less threat and brands the target for 10 sec. Your pet's next 6 attacks against the target deal 1 to 1 Fire or Shadow damage based on the pet. If Shadow damage is dealt, it has high threat."] },
        { id: "improved_felhunter", name: "Improved Felhunter", icon: "spell_shadow_summonfelhunter", tier: 4, col: 0, max: 3, ranks: ["Increases the Attack Power reduction of your Felhunter's Tainted Blood, the healing of its Devour Magic, and the detection level of its Paranoia by 10%, and reduces the cooldown of its Spell Lock by 2 sec.", "Increases the Attack Power reduction of your Felhunter's Tainted Blood, the healing of its Devour Magic, and the detection level of its Paranoia by 20%, and reduces the cooldown of its Spell Lock by 4 sec.", "Increases the Attack Power reduction of your Felhunter's Tainted Blood, the healing of its Devour Magic, and the detection level of its Paranoia by 30%, and reduces the cooldown of its Spell Lock by 6 sec."] },
        { id: "soul_link", name: "Soul Link", icon: "spell_shadow_gathershadows", tier: 4, col: 1, max: 1, req: "demonic_sacrifice", active: true, ranks: ["When active, 30% of all damage taken by the caster is taken by your Imp, Voidwalker, Succubus, Incubus, or Felhunter Demon instead. In addition, both the Demon and the master will inflict 3% more damage. Lasts as long as the Demon is active."] },
        { id: "demonic_knowledge", name: "Demonic Knowledge", icon: "spell_shadow_improvedvampiricembrace", tier: 4, col: 2, max: 3, ranks: ["Increases your spell damage and your Demon pet's spell damage by up to 33% of your level while you have a summoned Demon pet active.", "Increases your spell damage and your Demon pet's spell damage by up to 67% of your level while you have a summoned Demon pet active.", "Increases your spell damage and your Demon pet's spell damage by up to 100% of your level while you have a summoned Demon pet active."] },
        { id: "master_demonologist", name: "Master Demonologist", icon: "spell_shadow_shadowpact", tier: 5, col: 2, max: 5, ranks: ["Grants both the Warlock and the summoned demon an effect as long as that demon is active.\n\nImp - Increases Fire damage done by 2%.\n\nVoidwalker - Reduces Physical damage taken by 2%.\n\nSuccubus/Incubus - Increases Shadow damage done by 2%.\n\nFelhunter - Reduces Magic damage taken by 2%.", "Grants both the Warlock and the summoned demon an effect as long as that demon is active.\n\nImp - Increases Fire damage done by 4%.\n\nVoidwalker - Reduces Physical damage taken by 4%.\n\nSuccubus/Incubus - Increases Shadow damage done by 4%.\n\nFelhunter - Reduces Magic damage taken by 4%.", "Grants both the Warlock and the summoned demon an effect as long as that demon is active.\n\nImp - Increases Fire damage done by 6%.\n\nVoidwalker - Reduces Physical damage taken by 6%.\n\nSuccubus/Incubus - Increases Shadow damage done by 6%.\n\nFelhunter - Reduces Magic damage taken by 6%.", "Grants both the Warlock and the summoned demon an effect as long as that demon is active.\n\nImp - Increases Fire damage done by 8%.\n\nVoidwalker - Reduces Physical damage taken by 8%.\n\nSuccubus/Incubus - Increases Shadow damage done by 8%.\n\nFelhunter - Reduces Magic damage taken by 8%.", "Grants both the Warlock and the summoned demon an effect as long as that demon is active.\n\nImp - Increases Fire damage done by 10%.\n\nVoidwalker - Reduces Physical damage taken by 10%.\n\nSuccubus/Incubus - Increases Shadow damage done by 10%.\n\nFelhunter - Reduces Magic damage taken by 10%."] },
        { id: "demonic_pact", name: "Demonic Pact", icon: "inv_ability_soulharvesterwarlock_demonicsoul", tier: 6, col: 1, max: 1, req: "soul_link", ranks: ["Your Demonic Sacrifice effect is no longer cancelled by summoning a different Demon pet. Resummoning the sacrificed pet will still cancel the effect."] }
      ]
    },
    {
      id: "destruction",
      name: "Destruction",
      icon: "spell_shadow_rainoffire",
      talents: [
        { id: "destructive_reach", name: "Destructive Reach", icon: "spell_shadow_corpseexplode", tier: 0, col: 0, max: 2, ranks: ["Increases the range of your Destruction spells by 10%.", "Increases the range of your Destruction spells by 20%."] },
        { id: "improved_shadow_bolt", name: "Improved Shadow Bolt", icon: "spell_shadow_shadowbolt", tier: 0, col: 1, max: 5, ranks: ["Your Shadow Bolt critical strikes increase Shadow damage taken by the target from your attacks by 4% for 12 sec.", "Your Shadow Bolt critical strikes increase Shadow damage taken by the target from your attacks by 8% for 12 sec.", "Your Shadow Bolt critical strikes increase Shadow damage taken by the target from your attacks by 12% for 12 sec.", "Your Shadow Bolt critical strikes increase Shadow damage taken by the target from your attacks by 16% for 12 sec.", "Your Shadow Bolt critical strikes increase Shadow damage taken by the target from your attacks by 20% for 12 sec."] },
        { id: "bane", name: "Bane", icon: "spell_shadow_deathpact", tier: 0, col: 2, max: 5, ranks: ["Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate spells by 0.1 sec and your Soul Fire spell by 0.4 sec.", "Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate spells by 0.2 sec and your Soul Fire spell by 0.8 sec.", "Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate spells by 0.3 sec and your Soul Fire spell by 1.2 sec.", "Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate spells by 0.4 sec and your Soul Fire spell by 1.6 sec.", "Reduces the casting time of your Shadow Bolt, Immolate, and Incinerate spells by 0.5 sec and your Soul Fire spell by 2 sec."] },
        { id: "molten_skin", name: "Molten Skin", icon: "ability_mage_moltenarmor", tier: 1, col: 0, max: 5, ranks: ["Reduces all damage taken by 2%.", "Reduces all damage taken by 4%.", "Reduces all damage taken by 6%.", "Reduces all damage taken by 8%.", "Reduces all damage taken by 10%."] },
        { id: "cataclysm", name: "Cataclysm", icon: "spell_fire_windsofwoe", tier: 1, col: 1, max: 3, ranks: ["Reduces the Mana cost of your Destruction spells by 3%.", "Reduces the Mana cost of your Destruction spells by 6%.", "Reduces the Mana cost of your Destruction spells by 10%."] },
        { id: "aftermath", name: "Aftermath", icon: "spell_fire_fire", tier: 1, col: 2, max: 5, ranks: ["Increases the initial damage of your Immolate spell by 10% and your Conflagrate spell has a 20% chance to Daze the target, reducing the target's movement speed by 50% for 5 sec.", "Increases the initial damage of your Immolate spell by 20% and your Conflagrate spell has a 40% chance to Daze the target, reducing the target's movement speed by 50% for 5 sec.", "Increases the initial damage of your Immolate spell by 30% and your Conflagrate spell has a 60% chance to Daze the target, reducing the target's movement speed by 50% for 5 sec.", "Increases the initial damage of your Immolate spell by 40% and your Conflagrate spell has a 80% chance to Daze the target, reducing the target's movement speed by 50% for 5 sec.", "Increases the initial damage of your Immolate spell by 50% and your Conflagrate spell has a 100% chance to Daze the target, reducing the target's movement speed by 50% for 5 sec."] },
        { id: "ruin", name: "Ruin", icon: "spell_shadow_shadowwordpain", tier: 2, col: 1, max: 5, ranks: ["Increases the critical strike damage bonus of your Destruction spells by 20%.", "Increases the critical strike damage bonus of your Destruction spells by 40%.", "Increases the critical strike damage bonus of your Destruction spells by 60%.", "Increases the critical strike damage bonus of your Destruction spells by 80%.", "Increases the critical strike damage bonus of your Destruction spells by 100%."] },
        { id: "shadowburn", name: "Shadowburn", icon: "spell_shadow_scourgebuild", tier: 2, col: 2, max: 1, active: true, ranks: ["Instantly blasts the target for 65 to 74 Shadow damage. If a non-trivial target dies within 8 sec of being hit with Shadowburn, the caster gains a Soul Shard."] },
        { id: "intensity", name: "Intensity", icon: "spell_fire_lavaspawn", tier: 3, col: 0, max: 3, ranks: ["Gives your Destruction spells a 23% chance to not lose casting time when you take damage.", "Gives your Destruction spells a 47% chance to not lose casting time when you take damage.", "Gives your Destruction spells a 70% chance to not lose casting time when you take damage."] },
        { id: "agonizing_flames", name: "Agonizing Flames", icon: "spell_fire_soulburn", tier: 3, col: 1, max: 3, ranks: ["Increases the critical strike chance of your Searing Pain spell by 3% and the damage done by all your Destruction spells by 3%.", "Increases the critical strike chance of your Searing Pain spell by 7% and the damage done by all your Destruction spells by 7%.", "Increases the critical strike chance of your Searing Pain spell by 10% and the damage done by all your Destruction spells by 10%."] },
        { id: "conflagrate", name: "Conflagrate", icon: "spell_fire_fireball", tier: 3, col: 2, max: 1, active: true, ranks: ["Ignites a target that is already afflicted by your Immolate spell, dealing 88 to 111 Fire damage and consuming your Immolate effect."] },
        { id: "pyroclasm", name: "Pyroclasm", icon: "spell_fire_volcano", tier: 4, col: 0, max: 2, req: "intensity", ranks: ["Gives your Soul Fire spell a 13% chance to Stun the target for 3 sec, and your Rain of Fire and Hellfire spells a 13% chance over their duration to Stun targets they damage for 3 sec.", "Gives your Soul Fire spell a 26% chance to Stun the target for 3 sec, and your Rain of Fire and Hellfire spells a 26% chance over their duration to Stun targets they damage for 3 sec."] },
        { id: "bane_of_havoc", name: "Bane of Havoc", icon: "ability_warlock_baneofhavoc", tier: 4, col: 1, max: 1, active: true, ranks: ["Afflicts the target for 5 min, causing 15% of all damage done by the Warlock to other targets to also be dealt to the cursed target. Bane of Havoc is limited to 1 target, and only one Bane per Warlock can be active on any one target."] },
        { id: "fire_and_brimstone", name: "Fire and Brimstone", icon: "spell_fire_meteorstorm", tier: 4, col: 2, max: 3, req: "conflagrate", ranks: ["Increases the critical strike chance of your Conflagrate spell by 8%.", "Increases the critical strike chance of your Conflagrate spell by 17%.", "Increases the critical strike chance of your Conflagrate spell by 25%."] },
        { id: "shadow_and_flame", name: "Shadow and Flame", icon: "spell_fire_playingwithfire", tier: 5, col: 2, max: 5, ranks: ["Hitting an enemy with Conflagrate increases all Shadow damage you deal by 4% for 20 sec, and hitting an enemy with Shadowburn increases all Fire damage you deal by 4% for 20 sec. In addition, Conflagrate has a 20% chance not to consume Immolate, and Shadowburn has a 20% chance to instantly refund a Soul Shard.", "Hitting an enemy with Conflagrate increases all Shadow damage you deal by 8% for 20 sec, and hitting an enemy with Shadowburn increases all Fire damage you deal by 8% for 20 sec. In addition, Conflagrate has a 40% chance not to consume Immolate, and Shadowburn has a 40% chance to instantly refund a Soul Shard.", "Hitting an enemy with Conflagrate increases all Shadow damage you deal by 12% for 20 sec, and hitting an enemy with Shadowburn increases all Fire damage you deal by 12% for 20 sec. In addition, Conflagrate has a 60% chance not to consume Immolate, and Shadowburn has a 60% chance to instantly refund a Soul Shard.", "Hitting an enemy with Conflagrate increases all Shadow damage you deal by 16% for 20 sec, and hitting an enemy with Shadowburn increases all Fire damage you deal by 16% for 20 sec. In addition, Conflagrate has a 80% chance not to consume Immolate, and Shadowburn has a 80% chance to instantly refund a Soul Shard.", "Hitting an enemy with Conflagrate increases all Shadow damage you deal by 20% for 20 sec, and hitting an enemy with Shadowburn increases all Fire damage you deal by 20% for 20 sec. In addition, Conflagrate has a 100% chance not to consume Immolate, and Shadowburn has a 100% chance to instantly refund a Soul Shard."] },
        { id: "incinerate", name: "Incinerate", icon: "spell_fire_burnout", tier: 6, col: 1, max: 1, req: "bane_of_havoc", active: true, ranks: ["Deals 100 to 114 Fire damage to your target and an additional 25% damage if the target is afflicted by Immolate."] }
      ]
    }
  ];

  // src/classes/warlock/spellbook-data.js
  var SPELLBOOK6 = [
    ["Curse of Weakness", "spell_shadow_curseofmannoroth", "affliction", 175, 30, 0, 0, 0, "Physical damage caused by the target is reduced by 37 for 2 min. Only one Curse per Warlock can be active on any one target."],
    ["Fear", "spell_shadow_possession", "affliction", "b15", 20, 1.5, 0, 0, "Strikes fear in the enemy, causing it to run in fear for up to 20 sec. Damage caused may interrupt the effect. Only 1 target can be feared at a time."],
    ["Curse of Recklessness", "spell_shadow_unholystrength", "affliction", 115, 30, 0, 0, 0, "Curses the target with recklessness, reducing the target's armor by 505 for 2 min. Cursed enemies will not flee and will ignore Fear and Horror effects. Only one Curse per Warlock can be active on any one target."],
    ["Drain Mana", "spell_shadow_siphonmana", "affliction", 310, 20, "ch", 0, 0, "Transfers 140 Mana every 1 sec from the target to the caster. Lasts 5 sec."],
    ["Curse of Tongues", "spell_shadow_curseoftounges", "affliction", 110, 30, 0, 0, 0, "Forces the target to speak in Demonic, increasing the casting time of all spells by 60%. Only one Curse per Warlock can be active on any one target. Lasts 30 sec."],
    ["Howl of Terror", "spell_shadow_deathscream", "affliction", 200, 0, 2, 40, 0, "Howl, causing 5 enemies within 10 yds to flee in terror for 15 sec. Damage caused may interrupt the effect."],
    ["Curse of Exhaustion", "spell_shadow_grimward", "affliction", "b8", 30, 0, 0, 1, "Reduces the target's movement speed by 30% for 12 sec. Only one Curse per Warlock can be active on any one target."],
    ["Demon Skin", "spell_shadow_ragingscream", "demonology", 120, 0, 0, 0, 0, "Protects the caster, increasing armor by 120 and increases health regeneration by 5 health per 5 sec. for 30 min."],
    ["Health Funnel", "spell_shadow_lifedrain", "demonology", 0, 20, "ch", 0, 0, "Gives 153 health to the caster's pet every second for 10 sec as long as the caster channels. Generates reduced threat."],
    ["Demon Armor", "spell_shadow_ragingscream", "demonology", 1580, 0, 0, 0, 0, "Protects the caster, increasing armor by 570, Shadow resistance by 15 and increases health regeneration by 15 health per 5 sec. for 30 min."],
    ["Detect Invisibility", "spell_shadow_detectinvisibility", "demonology", 140, 30, 0, 0, 0, "Allows the friendly target to detect greater invisibility for 10 min."],
    ["Banish", "spell_shadow_cripple", "demonology", 200, 30, 1.5, 0, 0, "Banishes the enemy target, preventing all action but making it invulnerable for up to 30 sec. Only one target can be banished at a time. Only works on Demons and Elementals."],
    ["Shadow Ward", "spell_shadow_antishadow", "demonology", 320, 0, 0, 30, 0, "Absorbs 920 shadow damage. Lasts 30 sec."],
    ["Inferno", "spell_shadow_summoninfernal", "demonology", "b100", 30, 2, 3600, 0, "Summons a meteor from the Twisting Nether, causing 200 Fire damage and stunning all enemy targets in the area for 2 sec. An Infernal rises from the crater, under the command of the caster for 5 min. Once control is lost, the Infernal must be Subjugated to maintain control. Can only be used outdoors."],
    ["Hellfire", "spell_fire_incinerate", "destruction", 1300, 0, "ch", 0, 0, "Ignites the area surrounding the caster, causing 210 Fire damage to himself and 210 Fire damage to all nearby enemies every 1 sec. Lasts 15 sec."]
  ];

  // src/classes/warlock/abilities.js
  var spell2 = (schools, extra10) => ({ schools, harmful: true, target: "enemy", range: 30, ...extra10 });
  var shadow = ["shadow"];
  var fire = ["fire"];
  var basePct3 = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var shard = { id: "soul_shard", n: 1 };
  var summon = (id, demon, name, icon2, pct, text) => ({
    id,
    name,
    icon: icon2,
    tree: "demonology",
    schools: shadow,
    target: "self",
    cost: basePct3(pct),
    castTime: 10,
    summon: demon,
    setsOption: ["demon", demon],
    activeWhen: (g) => g.pets.some((p) => p.def.id === demon),
    effects: [{ type: "custom", run: (g) => g.cls.summonDemon(g, demon) }],
    text
  });
  var abilities6 = [
    /* ---------- Affliction ---------- */
    {
      id: "corruption",
      name: "Corruption",
      icon: "spell_shadow_abominationexplosion",
      tree: "affliction",
      ...spell2(shadow),
      cost: 340,
      castTime: 2,
      effects: [{ type: "applyAura", to: "target", aura: "corruption", spellHit: true }],
      text: "Corrupts the target, causing 438 Shadow damage over 18 sec."
    },
    {
      id: "bane_of_agony",
      name: "Bane of Agony",
      icon: "spell_shadow_curseofsargeras",
      tree: "affliction",
      ...spell2(shadow),
      cost: 215,
      effects: [{ type: "applyAura", to: "target", aura: "bane_of_agony", spellHit: true }],
      text: "Afflicts the target with agony, causing 552 Shadow damage over 24 sec. This damage is dealt slowly at first, and builds up as the Bane reaches its full duration. Only one Bane per Warlock can be active on any one target."
    },
    {
      id: "bane_of_doom",
      name: "Bane of Doom",
      icon: "spell_shadow_auraofdarkness",
      tree: "affliction",
      ...spell2(shadow),
      cost: 300,
      cooldown: 60,
      effects: [{ type: "applyAura", to: "target", aura: "bane_of_doom", spellHit: true }],
      text: "Afflicts the target with impending doom, causing 1742 Shadow damage after 1 min. Only one Bane per Warlock can be active on any one target."
    },
    {
      id: "curse_of_the_elements",
      name: "Curse of the Elements",
      icon: "warlock_curse_shadow",
      tree: "affliction",
      ...spell2(shadow),
      cost: 200,
      effects: [{ type: "applyAura", to: "target", aura: "curse_of_the_elements", spellHit: true }],
      text: "Curses the target for 5 min, reducing Magic resistances by 75 and increasing Magic damage taken by 10%. Only one Curse per Warlock can be active on any one target."
    },
    {
      id: "drain_life",
      name: "Drain Life",
      icon: "spell_shadow_lifedrain02",
      tree: "affliction",
      ...spell2(shadow, { range: 20 }),
      cost: 300,
      drain: true,
      channel: { duration: 5, ticks: 5, beam: true, tick: [{ type: "damage", min: 51, max: 51, coef: 0.1, binary: true, name: "Drain Life" }] },
      text: "Transfers 51 health every 1 second from the target to the caster. Lasts 5 sec."
    },
    {
      id: "drain_soul",
      name: "Drain Soul",
      icon: "spell_shadow_haunting",
      tree: "affliction",
      ...spell2(shadow),
      cost: 290,
      drain: true,
      channel: { duration: 15, ticks: 5, beam: true, tick: [{ type: "damage", min: 84, max: 84, coef: 0.1, binary: true, name: "Drain Soul" }] },
      text: "Drains the soul of the target, causing 420 Shadow damage over 15 sec. Targets damaged by Drain Soul have a chance to grant you a Soul Shard."
    },
    {
      id: "life_tap",
      name: "Life Tap",
      icon: "spell_shadow_burningspirit",
      tree: "affliction",
      schools: shadow,
      target: "self",
      usable: (g) => g.player.hp > 848 ? null : "Not enough health",
      // it never kills you
      effects: [{ type: "custom", run: (g) => g.cls.lifeTap(g) }],
      text: "Converts 848 Health into 848 Mana for you."
    },
    {
      id: "siphon_life",
      name: "Siphon Life",
      icon: "spell_shadow_requiem",
      tree: "affliction",
      ...spell2(shadow),
      cost: 365,
      talent: "siphon_life",
      effects: [{ type: "applyAura", to: "target", aura: "siphon_life", spellHit: true }],
      text: "Transfers 41 health from the target to the caster every 3 sec. Lasts 30 sec."
    },
    {
      id: "amplify_curse",
      name: "Amplify Curse",
      icon: "spell_shadow_contagion",
      tree: "affliction",
      schools: shadow,
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "amplify_curse",
      effects: [{ type: "applyAura", to: "self", aura: "amplify_curse" }],
      text: "Increases the effect of your next Curse of Weakness or Bane of Agony by 50%, or your next Curse of Exhaustion by 20%. Lasts 30 sec."
    },
    {
      id: "wrack",
      name: "Wrack",
      icon: "ability_deathknight_hemorrhagicfever",
      tree: "affliction",
      ...spell2(shadow),
      cost: 200,
      talent: "wrack",
      drain: true,
      effects: [{ type: "applyAura", to: "target", aura: "wrack" }],
      // 60 per second at level 60 (client 1.60.1.70938; was 86). ESTIMATE: the spell damage stays
      // 0.286 per second (launch notes). While it channels, the Warlock's Corruption, Siphon Life and Bane of Agony on the
      // target run twice as fast (warlock.js).
      channel: { duration: 6, ticks: 6, beam: true, tick: [{ type: "damage", min: 60, max: 60, coef: 0.286, binary: true, name: "Wrack" }] },
      text: "Tears the target apart from within for 6 sec, inflicting 60 Shadow damage every 1 sec. While channeling, your Siphon Life, Corruption, and Bane of Agony effects on the target deal their periodic damage 100% faster."
    },
    {
      id: "death_coil",
      name: "Death Coil",
      icon: "spell_shadow_deathcoil",
      tree: "affliction",
      ...spell2(shadow),
      cost: 600,
      cooldown: 120,
      effects: [{ type: "damage", min: 460, max: 460, coef: 0.214 }],
      text: "Causes the enemy target to run in horror for 3 sec and causes 460 Shadow damage. The caster gains 100% of the damage caused in health."
    },
    /* ---------- Demonology ---------- */
    summon("summon_imp", "imp", "Summon Imp", "spell_shadow_summonimp", 0.8, "Summons an Imp under the command of the Warlock."),
    summon("summon_succubus", "succubus", "Summon Succubus", "spell_shadow_summonsuccubus", 1, "Summons a Succubus under the command of the Warlock."),
    summon("summon_felhunter", "felhunter", "Summon Felhunter", "spell_shadow_summonfelhunter", 1, "Summons a Felhunter under the command of the Warlock."),
    summon("summon_incubus", "incubus", "Summon Incubus", "ability_warlock_incubus", 1, "Summons an Incubus under the command of the Warlock."),
    summon("summon_voidwalker", "voidwalker", "Summon Voidwalker", "spell_shadow_summonvoidwalker", 1, "Summons a Voidwalker under the command of the Warlock."),
    {
      id: "demonic_sacrifice",
      name: "Demonic Sacrifice",
      icon: "spell_shadow_psychicscream",
      tree: "demonology",
      schools: shadow,
      target: "self",
      talent: "demonic_sacrifice",
      usable: (g) => g.cls.demon(g) ? null : "You have no demon",
      effects: [{ type: "custom", run: (g) => g.cls.sacrifice(g) }],
      text: "Sacrifices your summoned Demon to enhance the opposing aspect of your power, granting you an effect that lasts 2 hr. Imp: Shadow damage +15%. Voidwalker: 2% of your Mana every 4 sec. Succubus/Incubus: Fire damage +15%. Felhunter: 3% of your Health every 4 sec."
    },
    {
      id: "fel_domination",
      name: "Fel Domination",
      icon: "spell_nature_removecurse",
      tree: "demonology",
      schools: shadow,
      target: "self",
      cooldown: 300,
      gcd: false,
      talent: "fel_domination",
      effects: [{ type: "applyAura", to: "self", aura: "fel_domination" }],
      text: "Your next Imp, Voidwalker, Succubus, Incubus, or Felhunter Summon spell has its casting time reduced by 5.5 sec and its Mana cost reduced by 50%."
    },
    /* ---------- Destruction ---------- */
    {
      id: "shadow_bolt",
      name: "Shadow Bolt",
      icon: "spell_shadow_shadowbolt",
      tree: "destruction",
      ...spell2(shadow),
      cost: 380,
      castTime: 3,
      speed: 20,
      effects: [{ type: "damage", min: 253, max: 283, coef: 0.857 }],
      text: "Sends a shadowy bolt at the enemy, causing 253 to 283 Shadow damage."
    },
    {
      id: "immolate",
      name: "Immolate",
      icon: "spell_fire_immolation",
      tree: "destruction",
      ...spell2(fire),
      cost: 380,
      castTime: 2,
      effects: [{ type: "damage", min: 158, max: 158, coef: 0.2, onHit: [{ type: "applyAura", to: "target", aura: "immolate" }] }],
      text: "Burns the enemy for 158 Fire damage and then an additional 275 Fire damage over 15 sec."
    },
    {
      id: "searing_pain",
      name: "Searing Pain",
      icon: "spell_fire_soulburn",
      tree: "destruction",
      ...spell2(fire),
      cost: 168,
      castTime: 1.5,
      effects: [{ type: "damage", min: 107, max: 126, coef: 0.429 }],
      text: "Inflict searing pain on the enemy target, causing 107 to 126 Fire damage. Causes a high amount of threat."
    },
    {
      id: "soul_fire",
      name: "Soul Fire",
      icon: "spell_fire_fireball02",
      tree: "destruction",
      ...spell2(fire),
      cost: 335,
      castTime: 6,
      cooldown: 60,
      reagent: shard,
      speed: 20,
      effects: [{ type: "damage", min: 390, max: 487, coef: 1 }],
      text: "Burn the enemy's soul, causing 390 to 487 Fire damage. Uses a Soul Shard."
    },
    {
      id: "rain_of_fire",
      name: "Rain of Fire",
      icon: "spell_shadow_rainoffire",
      tree: "destruction",
      ...spell2(fire),
      cost: 1185,
      channel: { duration: 8, ticks: 4, tick: [{ type: "aoeDamage", center: "target", radius: 8, min: 221, max: 221, coef: 0.083, name: "Rain of Fire" }] },
      text: "Calls down a fiery rain to burn enemies in the area of effect for 884 Fire damage over 8 sec."
    },
    {
      id: "shadowburn",
      name: "Shadowburn",
      icon: "spell_shadow_scourgebuild",
      tree: "destruction",
      ...spell2(shadow),
      cost: 365,
      cooldown: 15,
      reagent: shard,
      talent: "shadowburn",
      effects: [{ type: "damage", min: 259, max: 288, coef: 0.429 }],
      text: "Instantly blasts the target for 259 to 288 Shadow damage. If the target dies within 8 sec of Shadowburn, and yields experience or honor, the caster gains a Soul Shard. Uses a Soul Shard."
    },
    {
      id: "conflagrate",
      name: "Conflagrate",
      icon: "spell_fire_fireball",
      tree: "destruction",
      ...spell2(fire),
      cost: 255,
      cooldown: 10,
      talent: "conflagrate",
      usable: (g, ctx) => ctx.target && ctx.target.auras.some((a) => a.id === "immolate" && a.source === g.player) ? null : "Requires your Immolate on the target",
      effects: [{ type: "damage", min: 251, max: 313, coef: 0.429 }, { type: "custom", run: (g, ctx) => g.cls.consumeImmolate(g, ctx) }],
      text: "Ignites a target that is already afflicted by your Immolate spell, dealing 251 to 313 Fire damage and consuming your Immolate effect."
    },
    {
      id: "incinerate",
      name: "Incinerate",
      icon: "spell_fire_burnout",
      tree: "destruction",
      ...spell2(fire),
      cost: 325,
      castTime: 2.5,
      talent: "incinerate",
      speed: 24,
      effects: [{ type: "damage", min: 201, max: 233, coef: 0.714 }],
      text: "Deals 201 to 233 Fire damage to your target and an additional 25% damage if the target is afflicted by Immolate."
    },
    {
      id: "bane_of_havoc",
      name: "Bane of Havoc",
      icon: "ability_warlock_baneofhavoc",
      tree: "destruction",
      ...spell2(shadow),
      cost: basePct3(0.05),
      talent: "bane_of_havoc",
      effects: [{ type: "applyAura", to: "target", aura: "bane_of_havoc" }],
      tipNote: () => "It copies the damage you deal to other enemies, so it needs a second one: choose 5 dummies in the test bar.",
      text: "Afflicts the target for 5 min, causing 15% of all damage done by the Warlock to other targets to also be dealt to the cursed target. Bane of Havoc is limited to 1 target, and only one Bane per Warlock can be active on any one target."
    }
  ];

  // src/classes/warlock/spellbook.js
  var curse = { exclusive: "curse" };
  var aegis = (g) => 1 + 0.15 * g.rank("demonic_aegis");
  var extra6 = spellbookAbilities(SPELLBOOK6, {
    known: new Set(abilities6.map((a) => a.name)),
    talents: new Set(trees6.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      demon_skin: { notSimulated: false },
      demon_armor: { notSimulated: false },
      curse_of_recklessness: { notSimulated: false },
      drain_mana: { channel: { duration: 5, ticks: 5, beam: true, tick: [] } },
      // the dummy has no mana
      hellfire: {
        notSimulated: false,
        harmful: true,
        target: "self",
        schools: ["fire"],
        // Each second it also burns the Warlock for 210 Fire damage (tooltip): it can kill you, as in the game.
        channel: { duration: 15, ticks: 15, tick: [{ type: "aoeDamage", center: "self", radius: 10, min: 210, max: 210, coef: 0.095, name: "Hellfire" }, { type: "custom", run: (g) => damagePlayer(g, 210, { name: "Hellfire", schools: ["fire"] }) }] }
      },
      inferno: {
        notSimulated: false,
        harmful: true,
        target: "enemy",
        range: 30,
        schools: ["fire"],
        effects: [{ type: "aoeDamage", center: "target", radius: 8, min: 200, max: 200, coef: 0.2, name: "Inferno" }, { type: "custom", run: (g) => g.cls.summonInfernal(g) }]
      }
    },
    auraOverrides: {
      curse_of_weakness: curse,
      curse_of_tongues: curse,
      curse_of_exhaustion: curse,
      curse_of_recklessness: { ...curse, notSimulated: false, sourceMods: () => [add("targetArmor", -505, (ctx) => !(ctx.target.raidDebuffs || []).includes("curse_of_recklessness"))], desc: () => "Armor reduced by 505." },
      // Armor (more with Demonic Aegis). ESTIMATE: the health regeneration and Shadow resistance are not simulated.
      // Armor and health regeneration (5 and 15 health per 5 sec, in combat too), both 15% more per Demonic Aegis rank.
      demon_skin: { exclusive: "demon_armor", notSimulated: false, period: 5, onTick: (g, a) => regenHealth(g, a.unit, 5 * aegis(g), "Demon Skin"), mods: (a, g) => [add("armor", 120 * aegis(g))], desc: (a, g) => `Armor increased by ${Math.round(120 * aegis(g))}. Regenerating ${Math.round(5 * aegis(g))} health every 5 sec.` },
      demon_armor: { exclusive: "demon_armor", notSimulated: false, period: 5, onTick: (g, a) => regenHealth(g, a.unit, 15 * aegis(g), "Demon Armor"), mods: (a, g) => [add("armor", 570 * aegis(g))], desc: (a, g) => `Armor increased by ${Math.round(570 * aegis(g))}. Regenerating ${Math.round(15 * aegis(g))} health every 5 sec.` }
    }
  });

  // src/classes/warlock/auras.js
  var magic = (ctx) => !hasSchool(ctx, "physical");
  var agonyRamp = (g, a) => a.data.perTick * (a.tick <= 4 ? 0.5 : a.tick <= 8 ? 1 : 1.5);
  var auras6 = {
    /* ---------- on the target ---------- */
    corruption: { id: "corruption", name: "Corruption", icon: "spell_shadow_abominationexplosion", kind: "debuff", schools: ["shadow"], dot: { period: 3, ticks: 6, base: 438, coef: 1.2, canCrit: true } },
    bane_of_agony: { id: "bane_of_agony", name: "Bane of Agony", icon: "spell_shadow_curseofsargeras", kind: "debuff", exclusive: "bane", schools: ["shadow"], dot: { period: 2, ticks: 12, base: 552, coef: 1.6, canCrit: true, amount: agonyRamp } },
    bane_of_doom: { id: "bane_of_doom", name: "Bane of Doom", icon: "spell_shadow_auraofdarkness", kind: "debuff", exclusive: "bane", schools: ["shadow"], dot: { period: 60, ticks: 1, base: 1742, coef: 4, canCrit: true } },
    bane_of_havoc: { id: "bane_of_havoc", name: "Bane of Havoc", icon: "ability_warlock_baneofhavoc", kind: "debuff", exclusive: "bane", duration: 300, desc: () => "15% of the damage the Warlock deals to other targets is also dealt to this one." },
    siphon_life: { id: "siphon_life", name: "Siphon Life", icon: "spell_shadow_requiem", kind: "debuff", schools: ["shadow"], dot: { period: 3, ticks: 10, base: 410, coef: 0.5, canCrit: true } },
    immolate: { id: "immolate", name: "Immolate", icon: "spell_fire_immolation", kind: "debuff", schools: ["fire"], dot: { period: 3, ticks: 5, base: 275, coef: 0.65 } },
    curse_of_the_elements: {
      id: "curse_of_the_elements",
      name: "Curse of the Elements",
      icon: "warlock_curse_shadow",
      kind: "debuff",
      exclusive: "curse",
      duration: 300,
      // Magic damage taken +10% (for the Warlock here; in a raid, for everyone). The 75 resistance it removes does not
      // matter against the dummy, which has none.
      sourceMods: () => [mult("damageMult", 1.1, magic)],
      desc: () => "Magic damage taken increased by 10%."
    },
    wrack: {
      id: "wrack",
      name: "Wrack",
      icon: "ability_deathknight_hemorrhagicfever",
      kind: "debuff",
      duration: 6,
      desc: () => "The Warlock's Siphon Life, Corruption and Bane of Agony deal their damage 100% faster while Wrack is channeled."
    },
    improved_shadow_bolt: {
      id: "improved_shadow_bolt",
      name: "Shadow Vulnerability",
      icon: "spell_shadow_shadowbolt",
      kind: "debuff",
      duration: 12,
      sourceMods: (a, g) => [mult("damageMult", 1 + 0.04 * g.rank("improved_shadow_bolt"), (ctx) => hasSchool(ctx, "shadow"))],
      desc: (a, g) => `Shadow damage taken from the Warlock increased by ${4 * g.rank("improved_shadow_bolt")}%.`
    },
    /* ---------- on the Warlock ---------- */
    // Demonic Sacrifice: one at a time.
    sacrifice_imp: { id: "sacrifice_imp", name: "Touch of Shadow", icon: "spell_shadow_psychicscream", kind: "buff", exclusive: "sacrifice", duration: 7200, mods: () => [mult("damageMult", 1.15, (ctx) => !ctx.pet && hasSchool(ctx, "shadow"))], desc: () => "Shadow damage increased by 15%." },
    sacrifice_succubus: { id: "sacrifice_succubus", name: "Burning Wish", icon: "spell_shadow_psychicscream", kind: "buff", exclusive: "sacrifice", duration: 7200, mods: () => [mult("damageMult", 1.15, (ctx) => !ctx.pet && hasSchool(ctx, "fire"))], desc: () => "Fire damage increased by 15%." },
    sacrifice_incubus: { id: "sacrifice_incubus", name: "Burning Wish", icon: "spell_shadow_psychicscream", kind: "buff", exclusive: "sacrifice", duration: 7200, mods: () => [mult("damageMult", 1.15, (ctx) => !ctx.pet && hasSchool(ctx, "fire"))], desc: () => "Fire damage increased by 15%." },
    sacrifice_voidwalker: { id: "sacrifice_voidwalker", name: "Fel Stamina", icon: "spell_shadow_psychicscream", kind: "buff", exclusive: "sacrifice", duration: 7200, period: 4, onTick: (g) => g.resource.gain(g, g.player, 0.02 * g.stats().maxMana), desc: () => "Restores 2% of your total Mana every 4 sec." },
    sacrifice_felhunter: { id: "sacrifice_felhunter", name: "Fel Energy", icon: "spell_shadow_psychicscream", kind: "buff", exclusive: "sacrifice", duration: 7200, period: 4, onTick: (g) => regenHealth(g, g.player, 0.03 * g.stats().maxHp, "Fel Energy"), desc: () => "Restores 3% of your total Health every 4 sec." },
    shadow_trance: { id: "shadow_trance", name: "Shadow Trance", icon: "spell_shadow_twilight", kind: "buff", duration: 10, mods: () => [set("castTime", 0, (ctx) => isAbility(ctx, "shadow_bolt"))], desc: () => "Your next Shadow Bolt is instant." },
    amplify_curse: { id: "amplify_curse", name: "Amplify Curse", icon: "spell_shadow_contagion", kind: "buff", duration: 30, desc: () => "Your next Bane of Agony deals 50% more damage." },
    fel_domination: {
      id: "fel_domination",
      name: "Fel Domination",
      icon: "spell_nature_removecurse",
      kind: "buff",
      duration: 15,
      mods: () => [add("castTime", -5.5, (ctx) => !!ctx.ability && !!ctx.ability.summon), mult("cost", 0.5, (ctx) => !!ctx.ability && !!ctx.ability.summon)],
      desc: () => "Your next Summon spell is 5.5 sec faster and costs half the mana."
    },
    decimation: {
      id: "decimation",
      name: "Decimation",
      icon: "spell_fire_fireball02",
      kind: "buff",
      duration: 10,
      mods: (a, g) => [mult("castTime", 1 - 0.2 * g.rank("decimation"), (ctx) => isAbility(ctx, "soul_fire")), set("reagentCost", 0, (ctx) => isAbility(ctx, "soul_fire"))],
      desc: (a, g) => `Soul Fire casts ${20 * g.rank("decimation")}% faster and needs no Soul Shard.`
    },
    shadow_and_flame_shadow: { id: "shadow_and_flame_shadow", name: "Shadow and Flame", icon: "spell_fire_playingwithfire", kind: "buff", duration: 20, mods: (a, g) => [mult("damageMult", 1 + 0.04 * g.rank("shadow_and_flame"), (ctx) => !ctx.pet && hasSchool(ctx, "shadow"))], desc: (a, g) => `Shadow damage increased by ${4 * g.rank("shadow_and_flame")}%.` },
    shadow_and_flame_fire: { id: "shadow_and_flame_fire", name: "Shadow and Flame", icon: "spell_fire_playingwithfire", kind: "buff", duration: 20, mods: (a, g) => [mult("damageMult", 1 + 0.04 * g.rank("shadow_and_flame"), (ctx) => !ctx.pet && hasSchool(ctx, "fire"))], desc: (a, g) => `Fire damage increased by ${4 * g.rank("shadow_and_flame")}%.` }
  };

  // src/classes/warlock/presets.js
  var gearPresets6 = [
    { id: "fresh", name: "Fresh 60", blurb: "Quest and dungeon greens and blues.", gear: { int: 100, spi: 45, sta: 100, sp: 120, crit: 0.01, hit: 0.01, haste: 0 } },
    { id: "preraid", name: "Pre-raid", blurb: "Best dungeon, quest and crafted gear before raids.", gear: { int: 142, spi: 4, sta: 84, sp: 375, crit: 0.04, hit: 0, haste: 0, armor: 613, spSchool: { fire: 24, shadow: 87 } } }
  ];
  var builds6 = [
    {
      id: "affliction",
      name: "Affliction",
      points: "35/11/5",
      blurb: "Sacrifice the Imp for 15% more Shadow damage, then keep Corruption, Bane of Agony and Siphon Life up, channel Wrack to make them hurt more, and fill with Shadow Bolt (instant with Nightfall). Life Tap for mana.",
      options: { shards: 10 },
      talents: {
        suppression: 5,
        improved_corruption: 5,
        improved_drains: 3,
        improved_bane_of_agony: 2,
        pandemic: 3,
        malevolence: 5,
        nightfall: 2,
        siphon_life: 1,
        soul_siphon: 3,
        shadow_mastery: 5,
        wrack: 1,
        demonic_embrace: 5,
        demonic_aegis: 2,
        fel_vitality: 3,
        demonic_sacrifice: 1,
        improved_shadow_bolt: 5
      },
      bar: ["corruption", "bane_of_agony", "shadow_bolt", "wrack", "siphon_life", "bane_of_doom", "curse_of_the_elements", "drain_life", "death_coil", "life_tap", "demonic_sacrifice", "major_mana_potion"]
    },
    {
      id: "demonology",
      name: "Demonology",
      points: "0/32/19",
      blurb: "Sacrifice the Imp for 15% more Shadow damage, then call a Succubus with Fel Domination: Demonic Pact keeps the sacrifice, and Soul Link, Demonic Knowledge and Master Demonologist add more. Shadow Bolt and Corruption do the rest.",
      options: { shards: 10 },
      talents: {
        improved_imp: 3,
        unholy_power: 5,
        fel_vitality: 3,
        demonic_energies: 2,
        demonic_sacrifice: 1,
        master_summoner: 2,
        decimation: 2,
        fel_domination: 1,
        demonic_brand: 3,
        soul_link: 1,
        demonic_knowledge: 3,
        master_demonologist: 5,
        demonic_pact: 1,
        bane: 5,
        cataclysm: 3,
        aftermath: 2,
        ruin: 5,
        agonizing_flames: 3,
        conflagrate: 1
      },
      bar: ["conflagrate", "immolate", "soul_fire", "corruption", "bane_of_agony", "shadow_bolt", "searing_pain", "curse_of_the_elements", "life_tap", "fel_domination", "demonic_sacrifice", "major_mana_potion"]
    },
    {
      id: "destruction",
      name: "Destruction",
      points: "10/3/38",
      blurb: "Sacrifice the Succubus for 15% more Fire damage. Immolate, Conflagrate it, and fill with Incinerate (25% more on an Immolated target); Ruin doubles the crit bonus and Shadow and Flame chains the two schools.",
      options: { shards: 10, demon: "succubus" },
      talents: {
        suppression: 5,
        improved_corruption: 5,
        improved_imp: 3,
        improved_shadow_bolt: 5,
        bane: 5,
        cataclysm: 3,
        aftermath: 5,
        ruin: 5,
        shadowburn: 1,
        agonizing_flames: 3,
        conflagrate: 1,
        bane_of_havoc: 1,
        fire_and_brimstone: 3,
        shadow_and_flame: 5,
        incinerate: 1
      },
      bar: ["immolate", "incinerate", "conflagrate", "soul_fire", "shadow_bolt", "shadowburn", "bane_of_havoc", "curse_of_the_elements", "hellfire", "life_tap", "rain_of_fire", "major_mana_potion"]
    }
  ];

  // src/classes/warlock/warlock.js
  var DEMONS = {
    imp: { id: "imp", name: "Imp", icon: "spell_shadow_summonimp", color: "#e8743a", crit: 0.05, special: { id: "firebolt", name: "Firebolt (Imp)", icon: "spell_fire_firebolt", every: 2, min: 39, max: 49, spell: true, schools: ["fire"], coef: 0.571 } },
    succubus: { id: "succubus", name: "Succubus", icon: "spell_shadow_summonsuccubus", color: "#c05ac8", speed: 2, min: 55, max: 70, crit: 0.05, special: { id: "lash_of_pain", name: "Lash of Pain (Succubus)", icon: "spell_shadow_curse", every: 12, min: 99, max: 99, spell: true, schools: ["shadow"], coef: 0.429 } },
    felhunter: { id: "felhunter", name: "Felhunter", icon: "spell_shadow_summonfelhunter", color: "#6a8a3a", speed: 2, min: 50, max: 65, crit: 0.05 },
    incubus: { id: "incubus", name: "Incubus", icon: "ability_warlock_incubus", color: "#b04a8a", speed: 2, min: 55, max: 70, crit: 0.05, special: { id: "lash_of_pain", name: "Lash of Pain (Incubus)", icon: "spell_shadow_curse", every: 12, min: 99, max: 99, spell: true, schools: ["shadow"], coef: 0.429 } },
    // Forever: the Succubus's male twin, same numbers
    voidwalker: { id: "voidwalker", name: "Voidwalker", icon: "spell_shadow_summonvoidwalker", color: "#5a5ad8", speed: 2, min: 35, max: 45, crit: 0.05 }
  };
  var INFERNAL = { id: "infernal", name: "Infernal", icon: "spell_shadow_summoninfernal", color: "#7ac03a", speed: 2, min: 160, max: 210, crit: 0.05 };
  var LIFE_DRAINS = ["drain_life", "siphon_life", "death_coil"];
  var SHARD_CHANCE = 0.1;
  var DRAINS = ["drain_life", "drain_soul", "wrack"];
  var AFFLICTION_EFFECTS = ["corruption", "bane_of_agony", "siphon_life"];
  var PANDEMIC = ["corruption", "bane_of_agony", "bane_of_doom", "drain_soul", "drain_life", "siphon_life", "wrack"];
  var BRAND = {
    id: "demonic_brand",
    name: "Demonic Brand",
    icon: "ability_demonhunter_chaoticimprint_fire",
    kind: "debuff",
    duration: 10,
    desc: (a) => `Your demon's next ${a.charges} attack${a.charges === 1 ? "" : "s"} on this target deal extra damage.`
  };
  var LANDED2 = /* @__PURE__ */ new Set(["hit", "crit", "glance", "block", "crushing"]);
  var isPlayer5 = (game, ev) => ev.ctx.caster === game.player;
  var own = (ctx) => !ctx.pet;
  var treeOf = (ctx) => ctx.ability && ctx.ability.tree || null;
  var warlock = {
    id: "warlock",
    name: "Warlock",
    icon: "classicon_warlock",
    color: "#9482c9",
    resource: "mana",
    source: SOURCE6,
    // Level 60 Human Warlock base stats (Classic, approximate). 60.6 Intellect per 1% crit, 1.7% base.
    stats: {
      level: 60,
      base: { str: 47, agi: 55, sta: 77, int: 125, spi: 131 },
      baseHp: 1414,
      baseMana: 1373,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1414 + conv(a.sta, 10) - 20,
          maxMana: 1373 + conv(a.int, 15) - 20,
          crit: 0.017 + a.int / 60.6 / 100,
          regen: (8 + a.spi / 4) / 2
          // Warlock Spirit regeneration, per second
        };
      }
    },
    reagents: { soul_shard: { name: "Soul Shard", icon: "inv_misc_gem_amethyst_02", start: (g) => (g.loadout.options || {}).shards ?? 10 } },
    // Demon bar beside the action bar.
    stanceBar: { label: "Demons", abilities: ["summon_imp", "summon_voidwalker", "summon_succubus", "summon_incubus", "summon_felhunter"] },
    trees: trees6,
    abilities: [...abilities6, ...extra6.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras6, ...extra6.auras },
    gearPresets: gearPresets6,
    builds: builds6,
    gearFields: [
      { k: "int", label: "Intellect", step: 5, max: 600 },
      { k: "spi", label: "Spirit", step: 5, max: 400, note: "Spirit regeneration stops for 5 sec after spending mana; Life Tap does not count." },
      { k: "sp", label: "Spell power", step: 10, max: 1200 },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." }
    ],
    options: {
      // The demon at the start of a fight: the last one summoned from the demon bar (hidden from the gear panel).
      demon: { label: "Demon", hidden: true, values: ["imp", "succubus", "incubus", "felhunter", "voidwalker", "none"], default: "imp" },
      shards: { label: "Soul Shards at the start", values: [0, 5, 10, 20], default: 10 }
    },
    sheet(game, f) {
      const s = game.stats(), d = warlock.demon(game);
      return [
        ["Intellect", f.int(s.int)],
        ["Spirit", f.int(s.spi)],
        ["Mana", f.int(s.maxMana)],
        ["Spell power", f.int(s.sp)],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Demon", d ? d.def.name : "None"]
      ];
    },
    startBuffs: () => ["demon_armor"],
    onReset(game) {
      const d = (game.loadout.options || {}).demon || "imp";
      if (DEMONS[d]) summonPet(game, DEMONS[d]);
    },
    demon(game) {
      return game.pets.find((p) => DEMONS[p.def.id]) || null;
    },
    summonInfernal(game) {
      for (const p of game.pets.filter((x) => x.def.id === "infernal")) dismissPet(game, p);
      summonPet(game, INFERNAL, { duration: 300 });
    },
    // A new demon replaces the old one and ends Demonic Sacrifice, unless Demonic Pact and it is a different kind.
    summonDemon(game, kind) {
      const old = warlock.demon(game);
      if (old) dismissPet(game, old);
      const sac = game.player.auras.find((a) => a.def.exclusive === "sacrifice");
      if (sac && !(game.rank("demonic_pact") && sac.id !== `sacrifice_${kind}`)) removeAura(game, sac, "cancelled");
      const fd = findAura(game.player, "fel_domination");
      if (fd) removeAura(game, fd, "consumed");
      summonPet(game, DEMONS[kind]);
    },
    sacrifice(game) {
      const d = warlock.demon(game);
      if (!d) return;
      dismissPet(game, d);
      applyAura(game, game.player, auras6[`sacrifice_${d.def.id}`], { source: game.player });
    },
    // Life Tap: 848 health into 848 mana (Improved Life Tap: 10% more mana per rank). The health is spent, not damage.
    lifeTap(game) {
      spendHealth(game, game.player, 848, "Life Tap");
      game.resource.gain(game, game.player, 848 * (1 + 0.1 * game.rank("improved_life_tap")));
    },
    // Conflagrate eats the Immolate (Shadow and Flame can keep it).
    consumeImmolate(game, ctx) {
      const im = ctx.target && findAura(ctx.target, "immolate", game.player);
      if (im && !(game.rng() < 0.2 * game.rank("shadow_and_flame"))) removeAura(game, im, "consumed");
    },
    // Baseline rules, no talent needed.
    mods() {
      return [
        { key: "spellPower", fn: (v, ctx, g) => ctx.pet ? v + 0.15 * g.stats().sp : v },
        // demons: 15% of the Warlock's spell power
        mult("damageMult", 1.25, (ctx, g) => isAbility(ctx, "incinerate") && !!ctx.target && !!findAura(ctx.target, "immolate", g.player))
      ];
    },
    listen(game, on) {
      const p = () => game.player;
      on("channel:tick", ({ ability, ctx }) => {
        if (ability.id !== "wrack" || !ctx.target) return;
        for (const a of ctx.target.auras) if (a.source === p() && AFFLICTION_EFFECTS.includes(a.id)) {
          a.nextTick -= 1;
          a.expires -= 1;
        }
      });
      on("channel:end", ({ ability, ctx }) => {
        if (ability.id === "wrack" && ctx.target) {
          const w = findAura(ctx.target, "wrack", p());
          if (w) removeAura(game, w, "expired");
        }
      });
      on("damage", (ev) => {
        if (isPlayer5(game, ev) && isAbility(ev.ctx, "drain_soul") && ev.res.amount > 0 && game.rng() < SHARD_CHANCE) p().reagents.soul_shard = (p().reagents.soul_shard || 0) + 1;
      });
      on("damage", (ev) => {
        const ab = ev.ctx.ability;
        if (isPlayer5(game, ev) && ab && LIFE_DRAINS.includes(ab.id) && ev.res.amount > 0) healPlayer(game, ev.res.amount, { name: ab.name, icon: ab.icon, self: true });
      });
      on("cast:success", ({ ability }) => {
        if (ability.id === "shadow_bolt") {
          const a = findAura(p(), "shadow_trance");
          if (a) removeAura(game, a, "consumed");
        }
      });
    },
    talents: {
      demonic_energies: { inert: "your demon never takes damage and has no mana in the lab, so neither part matters." },
      /* ---------- Affliction ---------- */
      improved_life_tap: { mods: () => [] },
      // read by Life Tap above
      fel_concentration: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r], (ctx) => isAbility(ctx, "drain_life", "drain_mana", "drain_soul", "wrack"))] },
      suppression: { mods: (r) => [add("hitChance", 0.01 * r, own)] },
      improved_corruption: {
        mods: (r) => [
          add("castTime", -0.4 * r, (ctx) => isAbility(ctx, "corruption")),
          mult("damageMult", 1 + 0.02 * r, (ctx) => isAbility(ctx, "corruption"))
        ]
      },
      // Drain Life and Drain Soul (Wrack left its tooltip in 1.60.1.70753; Drain Mana is not in the fights).
      improved_drains: { mods: (r) => [mult("damageMult", 1 + [0.07, 0.13, 0.2][r - 1], (ctx) => isAbility(ctx, "drain_life", "drain_soul"))] },
      improved_bane_of_agony: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "bane_of_agony"))] },
      amplify_curse: {
        mods: () => [mult("damageMult", 1.5, (ctx) => !!ctx.aura && !!ctx.aura.data.amplified)],
        listen(game, r, on) {
          on("aura:apply", ({ aura: aura2 }) => {
            if (aura2.id !== "bane_of_agony" || aura2.source !== game.player) return;
            const a = findAura(game.player, "amplify_curse");
            aura2.data.amplified = !!a;
            if (a) removeAura(game, a, "consumed");
          });
        }
      },
      pandemic: { mods: (r) => [mult("critBonusMult", 1 + [0.33, 0.67, 1][r - 1], (ctx) => isAbility(ctx, ...PANDEMIC))] },
      malevolence: { mods: (r) => [add("critChance", 0.01 * r, (ctx) => own(ctx) && hasSchool(ctx, "shadow"))] },
      nightfall: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer5(game, ev) || ev.res.amount <= 0 || !isAbility(ev.ctx, "corruption", ...DRAINS) || game.rng() >= 0.02 * r) return;
            applyAura(game, game.player, auras6.shadow_trance, { source: game.player });
          });
        }
      },
      siphon_life: { teaches: "siphon_life" },
      soul_siphon: {
        mods: (r) => [mult("damageMult", (ctx, g) => {
          const n = ctx.target ? ctx.target.auras.filter((a) => a.source === g.player && AFFLICTION_EFFECTS.includes(a.id) && !isAbility(ctx, a.id)).length : 0;
          return 1 + 0.04 * r * Math.min(3, n);
        }, (ctx) => isAbility(ctx, ...DRAINS))]
      },
      shadow_mastery: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx) => own(ctx) && hasSchool(ctx, "shadow"))] },
      wrack: { teaches: "wrack" },
      /* ---------- Demonology ---------- */
      demonic_embrace: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, sta: a.sta * (1 + 0.03 * r) }) }] },
      demonic_aegis: { mods: () => [] },
      // read by Demon Skin and Demon Armor
      improved_imp: { mods: (r) => [mult("damageMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "firebolt"))] },
      unholy_power: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx) => !!ctx.pet)] },
      fel_vitality: { mods: (r) => [mult("maxMana", 1 + 0.05 * r)] },
      demonic_sacrifice: { teaches: "demonic_sacrifice" },
      master_summoner: {
        mods: (r) => [
          add("castTime", -2 * r, (ctx) => !!ctx.ability && !!ctx.ability.summon),
          mult("cost", 1 - 0.2 * r, (ctx) => !!ctx.ability && !!ctx.ability.summon)
        ]
      },
      decimation: {
        mods: (r) => [mult("cooldown", 1 - 0.45 * r, (ctx) => isAbility(ctx, "soul_fire"))],
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if ((ability.id === "shadow_bolt" || ability.id === "searing_pain") && ctx.target && ctx.target.hp < ctx.target.maxHp * 0.35) applyAura(game, game.player, auras6.decimation, { source: game.player });
          });
        }
      },
      fel_domination: { teaches: "fel_domination" },
      soul_link: { mods: () => [mult("damageMult", 1.03, (ctx, g) => !!warlock.demon(g))] },
      demonic_knowledge: { mods: (r) => [add("spellPower", (ctx, g) => g.player.level * r / 3, (ctx, g) => !!warlock.demon(g))] },
      master_demonologist: {
        mods: (r) => [
          mult("damageMult", 1 + 0.02 * r, (ctx, g) => hasSchool(ctx, "fire") && (warlock.demon(g) || {}).def?.id === "imp"),
          mult("damageMult", 1 + 0.02 * r, (ctx, g) => hasSchool(ctx, "shadow") && ["succubus", "incubus"].includes((warlock.demon(g) || {}).def?.id))
        ]
      },
      demonic_pact: { mods: () => [] },
      // read by summonDemon above
      demonic_brand: {
        mods: (r) => [mult("threatMult", 1 - [0.17, 0.33, 0.5][r - 1], (ctx) => own(ctx) && isAbility(ctx, "searing_pain"))],
        listen(game, r, on) {
          on("damage", (ev) => {
            const { ctx, res } = ev, t = ctx.target;
            if (!t || t.dead) return;
            if (isPlayer5(game, ev) && isAbility(ctx, "searing_pain") && LANDED2.has(res.outcome)) {
              applyAura(game, t, BRAND, { source: game.player, charges: 2 * r });
              return;
            }
            const pet = ctx.caster;
            if (!ctx.pet || !pet || pet.owner !== game.player || ctx.periodic || isAbility(ctx, "demonic_brand")) return;
            const brand = findAura(t, "demonic_brand", game.player);
            if (!brand) return;
            useCharge(game, brand);
            if (!LANDED2.has(res.outcome)) return;
            const sp = 0.78 * game.stats().sp, fire3 = pet.def.id === "imp";
            petHit(game, pet, t, { id: "demonic_brand", name: "Demonic Brand", icon: BRAND.icon, spell: true, schools: [fire3 ? "fire" : "shadow"], min: 65 + sp, max: 68 + sp, coef: 0 });
          });
        }
      },
      /* ---------- Destruction ---------- */
      molten_skin: { mods: (r) => [mult("damageTaken", 1 - 0.02 * r, (ctx) => !!ctx.incoming)] },
      intensity: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r], (ctx) => !!ctx.ability && ctx.ability.tree === "destruction")] },
      improved_shadow_bolt: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (isPlayer5(game, ev) && isAbility(ev.ctx, "shadow_bolt") && ev.res.outcome === "crit") applyAura(game, ev.ctx.target, auras6.improved_shadow_bolt, { source: game.player });
          });
        }
      },
      bane: {
        mods: (r) => [
          add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "shadow_bolt", "immolate", "incinerate")),
          add("castTime", -0.4 * r, (ctx) => isAbility(ctx, "soul_fire"))
        ]
      },
      cataclysm: { mods: (r) => [mult("cost", 1 - [0.03, 0.06, 0.1][r - 1], (ctx) => treeOf(ctx) === "destruction")] },
      aftermath: { mods: (r) => [mult("damageMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "immolate") && !ctx.periodic)] },
      ruin: { mods: (r) => [mult("critBonusMult", 1 + 0.2 * r, (ctx) => own(ctx) && treeOf(ctx) === "destruction")] },
      shadowburn: { teaches: "shadowburn" },
      agonizing_flames: {
        mods: (r) => [
          add("critChance", [0.03, 0.07, 0.1][r - 1], (ctx) => isAbility(ctx, "searing_pain")),
          mult("damageMult", 1 + [0.03, 0.07, 0.1][r - 1], (ctx) => own(ctx) && treeOf(ctx) === "destruction")
        ]
      },
      conflagrate: { teaches: "conflagrate" },
      bane_of_havoc: {
        teaches: "bane_of_havoc",
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer5(game, ev) || ev.ctx.cleave || ev.res.amount <= 0) return;
            const havoc = game.enemies.find((e) => !e.dead && e !== ev.ctx.target && findAura(e, "bane_of_havoc", game.player));
            if (havoc) game.reportDamage({ ...ev.ctx, target: havoc, cleave: true }, { outcome: "hit", amount: Math.round(ev.res.amount * 0.15) }, { name: "Bane of Havoc" });
          });
        }
      },
      fire_and_brimstone: { mods: (r) => [add("critChance", [0.08, 0.17, 0.25][r - 1], (ctx) => isAbility(ctx, "conflagrate"))] },
      shadow_and_flame: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer5(game, ev) || ev.res.amount <= 0) return;
            if (isAbility(ev.ctx, "conflagrate")) applyAura(game, game.player, auras6.shadow_and_flame_shadow, { source: game.player });
            if (isAbility(ev.ctx, "shadowburn")) {
              applyAura(game, game.player, auras6.shadow_and_flame_fire, { source: game.player });
              if (game.rng() < 0.2 * r) game.player.reagents.soul_shard = (game.player.reagents.soul_shard || 0) + 1;
            }
          });
        }
      },
      incinerate: { teaches: "incinerate" }
    }
  };

  // src/classes/priest/talent-data.js
  var SOURCE7 = { site: "foreverchanges.pro/talents/priest", build: "1.60.1.70790", extracted: "2026-11-05" };
  var per3 = (values, fn) => values.map(fn);
  var trees7 = [
    {
      id: "discipline",
      name: "Discipline",
      icon: "spell_holy_wordfortitude",
      talents: [
        { id: "power_in_light", name: "Power in Light", icon: "spell_holy_searinglight", tier: 0, col: 0, max: 5, ranks: per3([[2], [4], [6], [8], [10]], (v) => `Your Smite and Penance spells deal ${v[0]}% increased damage to targets afflicted with your Holy Fire or Shadow Word: Pain.`) },
        { id: "wand_specialization", name: "Wand Specialization", icon: "inv_wand_01", tier: 0, col: 1, max: 2, ranks: per3([[13], [25]], (v) => `Increases your damage with Wands by ${v[0]}%.`) },
        { id: "twin_disciplines", name: "Twin Disciplines", icon: "spell_holy_sealofvengeance", tier: 0, col: 2, max: 5, ranks: per3([[1], [2], [3], [4], [5]], (v) => `Increases the damage and healing of your instant cast spells by ${v[0]}%.`) },
        { id: "silent_resolve", name: "Silent Resolve", icon: "spell_nature_manaregentotem", tier: 1, col: 0, max: 3, ranks: per3([[10, 5], [20, 10], [30, 15]], (v) => `Reduces the threat generated by your spells by ${v[0]}% and reduces the duration of Stun, Fear, and Silence effects inflicted on you by ${v[1]}%.`) },
        { id: "holy_precision", name: "Holy Precision", icon: "spell_holy_divineillumination", tier: 1, col: 1, max: 3, ranks: per3([[6], [12], [18]], (v) => `Improves your chance to hit with Holy spells by ${v[0]}%.`) },
        { id: "mental_strength", name: "Mental Strength", icon: "spell_nature_enchantarmor", tier: 1, col: 2, max: 5, ranks: per3([[2], [4], [6], [8], [10]], (v) => `Increases your total Intellect by ${v[0]}%.`) },
        { id: "martyrdom", name: "Martyrdom", icon: "spell_nature_tranquility", tier: 1, col: 3, max: 2, ranks: per3([[50], [100]], (v) => `Gives you a ${v[0]}% chance to gain Focused Casting for 6 sec after being the victim of a melee or ranged critical strike. The Focused Casting effect prevents you from losing casting time when taking damage and increases your resistance to Interrupt effects by 20%.`) },
        { id: "mental_agility", name: "Mental Agility", icon: "ability_hibernation", tier: 2, col: 0, max: 3, ranks: per3([[3], [7], [10]], (v) => `Reduces the mana cost of your Smite, Holy Fire, and instant cast spells by ${v[0]}%.`) },
        { id: "inner_focus", name: "Inner Focus", icon: "spell_frost_windwalkon", tier: 2, col: 1, max: 1, active: true, ranks: ["When activated, reduces the Mana cost of your next spell by 100% and increases its critical effect chance by 25% if it is a non-periodic spell and capable of a critical effect."] },
        { id: "improved_power_word_shield", name: "Improved Power Word: Shield", icon: "spell_holy_powerwordshield", tier: 2, col: 2, max: 3, ranks: per3([[7], [14], [20]], (v) => `Increases the damage absorbed by your Power Word: Shield by ${v[0]}%.`) },
        { id: "meditation", name: "Meditation", icon: "spell_nature_sleep", tier: 2, col: 3, max: 3, ranks: per3([[17], [33], [50]], (v) => `Allows ${v[0]}% of your Mana regeneration to continue while casting.`) },
        { id: "improved_inner_fire", name: "Improved Inner Fire", icon: "spell_holy_innerfire", tier: 3, col: 0, max: 3, ranks: per3([[15, 4], [30, 8], [45, 12]], (v) => `Increases the Armor bonus of your Inner Fire spell by ${v[0]}% and increases its total charges by ${v[1]}.`) },
        { id: "improved_mana_burn", name: "Improved Mana Burn", icon: "spell_shadow_manaburn", tier: 3, col: 1, max: 2, ranks: per3([["0.5"], ["1.0"]], (v) => `Reduces the casting time of your Mana Burn spell by ${v[0]} sec.`) },
        { id: "soul_warding", name: "Soul Warding", icon: "spell_holy_pureofheart", tier: 3, col: 2, max: 1, req: "improved_power_word_shield", ranks: ["Reduces the cooldown on your Power Word: Shield spell by 4 sec and reduces its mana cost by 15%."] },
        { id: "penance", name: "Penance", icon: "spell_holy_penance", tier: 4, col: 1, max: 1, active: true, ranks: ["Launches a volley of holy light at the target, causing 45 Holy damage to an enemy, or 134 healing to an ally, instantly and every 1 sec for 2 sec."] },
        { id: "renewed_hope", name: "Renewed Hope", icon: "spell_holy_holyprotection", tier: 4, col: 2, max: 5, req: "soul_warding", ranks: ["Your heals from Flash Heal, Lesser Heal, Heal, Greater Heal, and Penance gain 2% increased critical strike chance when cast on targets with Weakened Soul, and reduce the remaining duration of Weakened Soul on their target by 1 sec.", "Your heals from Flash Heal, Lesser Heal, Heal, Greater Heal, and Penance gain 4% increased critical strike chance when cast on targets with Weakened Soul, and reduce the remaining duration of Weakened Soul on their target by 2 sec.", "Your heals from Flash Heal, Lesser Heal, Heal, Greater Heal, and Penance gain 6% increased critical strike chance when cast on targets with Weakened Soul, and reduce the remaining duration of Weakened Soul on their target by 3 sec.", "Your heals from Flash Heal, Lesser Heal, Heal, Greater Heal, and Penance gain 8% increased critical strike chance when cast on targets with Weakened Soul, and reduce the remaining duration of Weakened Soul on their target by 4 sec.", "Your heals from Flash Heal, Lesser Heal, Heal, Greater Heal, and Penance gain 10% increased critical strike chance when cast on targets with Weakened Soul, and reduce the remaining duration of Weakened Soul on their target by 5 sec."] },
        { id: "divine_aegis", name: "Divine Aegis", icon: "spell_holy_devineaegis", tier: 5, col: 2, max: 3, ranks: per3([[5], [10], [15]], (v) => `Your non-periodic critical heals create a protective shield on the target, absorbing ${v[0]}% of the amount healed. Shields up to 1200 damage and lasts 12 sec.`) },
        { id: "power_infusion", name: "Power Infusion", icon: "spell_holy_powerinfusion", tier: 6, col: 1, max: 1, req: "penance", active: true, ranks: ["Infuses the target with power, increasing their spell damage and healing done by 20% for 15 sec."] }
      ]
    },
    {
      id: "holy",
      name: "Holy",
      icon: "spell_holy_guardianspirit",
      talents: [
        { id: "twilight_focus", name: "Twilight Focus", icon: "spell_holy_healingfocus", tier: 0, col: 0, max: 3, ranks: per3([[23], [47], [70]], (v) => `Gives your spells a ${v[0]}% chance to not lose casting time when you take damage.`) },
        { id: "improved_renew", name: "Improved Renew", icon: "spell_holy_renew", tier: 0, col: 1, max: 3, ranks: per3([[5], [10], [15]], (v) => `Increases the amount healed by your Renew spell by ${v[0]}%.`) },
        { id: "holy_specialization", name: "Holy Specialization", icon: "spell_holy_sealofsalvation", tier: 0, col: 2, max: 5, ranks: per3([[1], [2], [3], [4], [5]], (v) => `Increases the critical effect chance of your Holy spells by ${v[0]}%.`) },
        { id: "spell_warding", name: "Spell Warding", icon: "spell_holy_spellwarding", tier: 1, col: 1, max: 5, ranks: per3([[2], [4], [6], [8], [10]], (v) => `Reduces all spell damage taken by ${v[0]}%.`) },
        { id: "divine_fury", name: "Divine Fury", icon: "spell_holy_sealofwrath", tier: 1, col: 2, max: 5, ranks: per3([["0.1"], ["0.2"], ["0.3"], ["0.4"], ["0.5"]], (v) => `Reduces the casting time of your Smite, Holy Fire, Heal, and Greater Heal spells by ${v[0]} sec.`) },
        { id: "holy_nova", name: "Holy Nova", icon: "spell_holy_holynova", tier: 2, col: 0, max: 1, active: true, ranks: ["Causes an explosion of holy light around the caster, causing 26 to 30 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 50 to 57. These effects cause no threat."] },
        { id: "blessed_recovery", name: "Blessed Recovery", icon: "spell_holy_blessedrecovery", tier: 2, col: 1, max: 3, ranks: per3([[8], [17], [25]], (v) => `After being struck by a melee or ranged critical hit, or suffering more than 30% of your maximum Health from a single attack, heal ${v[0]}% of the damage taken over 6 sec. Refreshing this effect carries over any remaining healing.`) },
        { id: "inspiration", name: "Inspiration", icon: "spell_holy_layonhands", tier: 2, col: 3, max: 3, ranks: per3([[8], [17], [25]], (v) => `Your non-periodic critical heals increase your target's Armor by ${v[0]}% for 15 sec.`) },
        { id: "holy_reach", name: "Holy Reach", icon: "spell_holy_purify", tier: 3, col: 0, max: 2, ranks: per3([[10], [20]], (v) => `Increases the range of your Smite and Holy Fire spells and the radius of your Prayer of Healing and Holy Nova spells by ${v[0]}%.`) },
        { id: "improved_healing", name: "Improved Healing", icon: "spell_holy_heal02", tier: 3, col: 1, max: 3, ranks: per3([[5], [10], [15]], (v) => `Reduces the Mana cost of your Lesser Heal, Heal, Greater Heal, Penance, and Prayer of Mending spells by ${v[0]}%.`) },
        { id: "searing_light", name: "Searing Light", icon: "spell_holy_searinglightpriest", tier: 3, col: 2, max: 2, req: "divine_fury", ranks: per3([[2, 5], [5, 10]], (v) => `Increases your Holy damage done by ${v[0]}%, and gives a ${v[1]}% chance each time your Holy Fire spell deals periodic damage for your next Holy Nova to cost no Mana.`) },
        { id: "holy_binding", name: "Holy Binding", icon: "spell_holy_blindingheal", tier: 3, col: 3, max: 1, active: true, ranks: ["Each time you heal a target other than yourself with Flash Heal, you are healed for 50% as much. This healing generates no threat."] },
        { id: "litany_of_light", name: "Litany of Light", icon: "inv_scroll_07", tier: 4, col: 0, max: 2, ranks: per3([[5], [10]], (v) => `When you cast a healing spell, gain Mana equal to ${v[0]}% of the base cost of the spell if your previous heal was a different spell.`) },
        { id: "spirit_of_redemption", name: "Spirit of Redemption", icon: "inv_enchant_essenceeternallarge", tier: 4, col: 1, max: 1, ranks: ["Upon death, the priest becomes the Spirit of Redemption for 15 sec. The Spirit of Redemption cannot move, attack, be attacked or targeted by any spells or effects. While in this form the priest can cast any healing spell free of cost. When the effect ends, the priest dies."] },
        { id: "spiritual_guidance", name: "Spiritual Guidance", icon: "spell_holy_spiritualguidence", tier: 4, col: 2, max: 5, ranks: per3([[5, 1], [10, 3], [15, 5], [20, 6], [25, 8]], (v) => `Increases your spell healing by up to ${v[0]}% of your total Spirit and your spell damage by up to ${v[1]}% of your total Spirit.`) },
        { id: "spiritual_healing", name: "Spiritual Healing", icon: "spell_nature_moonglow", tier: 5, col: 2, max: 3, ranks: per3([[3], [7], [10]], (v) => `Increases the amount healed by your spells by ${v[0]}%.`) },
        { id: "prayer_of_mending", name: "Prayer of Mending", icon: "spell_holy_prayerofmendingtga", tier: 6, col: 1, max: 1, req: "spirit_of_redemption", active: true, ranks: ["Places a spell on the target that heals them for 172 the next time they take damage or receive non-periodic healing. When the heal occurs, Prayer of Mending jumps to a party or raid member within 20 yards. Jumps up to 5 times and lasts 30 sec after each jump. This spell can only be placed on one target at a time per caster."] }
      ]
    },
    {
      id: "shadow_magic",
      name: "Shadow Magic",
      icon: "spell_shadow_shadowwordpain",
      talents: [
        { id: "shadow_focus", name: "Shadow Focus", icon: "spell_shadow_burningspirit", tier: 0, col: 0, max: 5, ranks: per3([[1], [2], [3], [4], [5]], (v) => `Improves your chance to hit with Shadow spells by ${v[0]}%.`) },
        { id: "blackout", name: "Blackout", icon: "spell_shadow_gathershadows", tier: 0, col: 1, max: 5, ranks: per3([[2], [4], [6], [8], [10]], (v) => `Gives your Shadow damage spells a ${v[0]}% chance to stun the target for 3 sec.`) },
        { id: "spirit_tap", name: "Spirit Tap", icon: "spell_shadow_requiem", tier: 0, col: 2, max: 5, ranks: per3([[20], [40], [60], [80], [100]], (v) => `Gives you a ${v[0]}% chance to increase your Spirit by 100% for 15 sec after killing a non-trivial target or when an enemy afflicted by your Vampiric Embrace dies. For the duration, 50% of your Mana regeneration will continue while casting.`) },
        { id: "improved_mind_blast", name: "Improved Mind Blast", icon: "spell_shadow_unholyfrenzy", tier: 1, col: 0, max: 5, ranks: per3([["0.5"], [1], ["1.5"], [2], ["2.5"]], (v) => `Reduces the cooldown of your Mind Blast spell by ${v[0]} sec.`) },
        { id: "improved_shadow_word_pain", name: "Improved Shadow Word: Pain", icon: "spell_shadow_shadowwordpain", tier: 1, col: 2, max: 2, ranks: per3([[3], [6]], (v) => `Increases the duration of your Shadow Word: Pain spell by ${v[0]} sec.`) },
        { id: "shadow_reach", name: "Shadow Reach", icon: "spell_shadow_chilltouch", tier: 1, col: 3, max: 2, ranks: per3([[10], [20]], (v) => `Increases the range of your offensive Shadow spells by ${v[0]}%.`) },
        { id: "improved_psychic_scream", name: "Improved Psychic Scream", icon: "spell_shadow_psychicscream", tier: 2, col: 1, max: 2, req: "blackout", ranks: per3([[2], [4]], (v) => `Reduces the cooldown of your Psychic Scream spell by ${v[0]} sec.`) },
        { id: "mind_flay", name: "Mind Flay", icon: "spell_shadow_siphonmana", tier: 2, col: 2, max: 1, active: true, ranks: ["Assault the target's mind with Shadow energy, causing 63 Shadow damage over 3 sec and slowing their movement speed by 50%."] },
        { id: "improved_mind_flay", name: "Improved Mind Flay", icon: "spell_shadow_soulleech_2", tier: 2, col: 3, max: 2, req: "mind_flay", ranks: per3([[10], [20]], (v) => `Each instance of damage of Mind Flay deals ${v[0]}% more damage than its previous instance of damage.`) },
        { id: "dark_inspiration", name: "Dark Inspiration", icon: "spell_warlock_demonsoul", tier: 3, col: 0, max: 5, ranks: per3([[3], [6], [9], [12], [15]], (v) => `Your Mind Blast and fully channeled Mind Flay causes Dark Inspiration, increasing yours and your party's Spirit by ${v[0]}% for 10 sec.`) },
        { id: "vampiric_embrace", name: "Vampiric Embrace", icon: "spell_shadow_unsummonbuilding", tier: 3, col: 1, max: 1, active: true, ranks: ["Afflicts your target with Shadow energy that causes all party members to be healed for 20% of any Shadow spell damage you deal for 30 sec."] },
        { id: "shadow_weaving", name: "Shadow Weaving", icon: "spell_shadow_blackplague", tier: 3, col: 2, max: 3, ranks: per3([[33], [67], [100]], (v) => `Your Shadow damage spells have a ${v[0]}% chance to increase the Shadow damage the target takes from you by 2% for 15 sec, stacking up to 5 times.`) },
        { id: "silence", name: "Silence", icon: "spell_shadow_impphaseshift", tier: 4, col: 0, max: 1, active: true, ranks: ["Silences the target, preventing them from casting spells for 5 sec and interrupting their spellcasts for 3 sec."] },
        { id: "devouring_contagion", name: "Devouring Contagion", icon: "spell_shadow_devouringplague", tier: 4, col: 2, max: 2, ranks: per3([[25, 5], [50, 10]], (v) => `Reduces the mana cost of your Devouring Plague by ${v[0]}%.

Targets that die while Devouring Plague is active spreads it, jumping to 2 nearby enemies within ${v[1]} yds for the remaining duration.`) },
        { id: "early_demise", name: "Early Demise", icon: "spell_shadow_demonicfortitude", tier: 5, col: 0, max: 2, ranks: per3([[15], [30]], (v) => `Increases Shadow Word: Death's critical strike chance on targets at or below 20% health by ${v[0]}%.`) },
        { id: "darkness", name: "Darkness", icon: "spell_shadow_twilight", tier: 5, col: 2, max: 5, ranks: per3([[2], [4], [6], [8], [10]], (v) => `Increases your Shadow damage done by ${v[0]}%.`) },
        { id: "shadowform", name: "Shadowform", icon: "spell_shadow_shadowform", tier: 6, col: 1, max: 1, req: "vampiric_embrace", active: true, ranks: ["Assume Shadowform, increasing your Shadow damage by 10%, reducing the Mana cost of all Shadow spells by 50%, increasing the critical strike damage bonus of your Shadow spells by 100%, and reducing Physical damage taken by you by 15%. However, you may not cast healing spells while in this form."] }
      ]
    }
  ];

  // src/classes/priest/talent-history.js
  var talentHistory6 = [
    {
      // 1.60.1.70753 (November 3): Binding Heal became Holy Binding, in the same place of the tree.
      until: "1.60.1.70753",
      date: "November 3",
      order: [
        ["power_in_light", "wand_specialization", "twin_disciplines", "silent_resolve", "holy_precision", "mental_strength", "martyrdom", "mental_agility", "inner_focus", "improved_power_word_shield", "meditation", "improved_inner_fire", "improved_mana_burn", "soul_warding", "penance", "renewed_hope", "divine_aegis", "power_infusion"],
        ["twilight_focus", "improved_renew", "holy_specialization", "spell_warding", "divine_fury", "holy_nova", "blessed_recovery", "inspiration", "holy_reach", "improved_healing", "searing_light", "binding_heal", "litany_of_light", "spirit_of_redemption", "spiritual_guidance", "spiritual_healing", "prayer_of_mending"],
        ["shadow_focus", "blackout", "spirit_tap", "improved_mind_blast", "improved_shadow_word_pain", "shadow_reach", "improved_psychic_scream", "mind_flay", "improved_mind_flay", "dark_inspiration", "vampiric_embrace", "shadow_weaving", "silence", "devouring_contagion", "early_demise", "darkness", "shadowform"]
      ],
      renamed: { binding_heal: "holy_binding" },
      removed: {},
      names: { binding_heal: "Binding Heal" }
    }
  ];

  // src/classes/priest/spellbook-data.js
  var SPELLBOOK7 = [
    ["Power Word: Fortitude", "spell_holy_wordfortitude", "discipline", 1695, 30, 0, 0, 0, "Power infuses the target, increasing their Stamina by 70 for 1 hr."],
    ["Power Word: Shield", "spell_holy_powerwordshield", "discipline", 500, 40, 0, 4, 0, "Draws on the soul of the party member to shield them, absorbing 928 damage. Lasts 30 sec. While the shield holds, spellcasting will not be interrupted by damage. Once shielded, the target cannot be shielded again for 15 sec."],
    ["Confounding Flash", "ability_paladin_blindinglight2", "discipline", "b3", 0, 0.5, 120, 0, "Confuses up to 5 enemies within 8 yds for 3 sec. Any damage taken will break the effect."],
    ["Inner Fire", "spell_holy_innerfire", "discipline", 315, 0, 0, 0, 0, "A burst of Holy energy fills the caster, increasing armor by 1395. Each melee or ranged damage hit against the priest will remove one charge. Lasts 10 min or until 20 charges are used."],
    ["Dispel Magic", "spell_holy_dispelmagic", "discipline", "b18", 30, 0, 0, 0, "Dispels magic on the target, removing 2 harmful spells from a friend or 2 beneficial spells from an enemy."],
    ["Contingency Plan", "ability_priest_soulwarding", "discipline", 0, 30, 0, 600, 0, "Place a Holy ward on an ally for 30 sec. The next time this ally takes damage dropping their Health below 35%, they will gain a shield absorbing 926 damage and begin healing for 670 Health over 15 sec. A target may be affected by only one Contingency Plan."],
    ["Elune's Grace", "spell_holy_elunesgrace", "discipline", "b3", 0, 0, 300, 0, "Reduces the chance you'll be hit by melee and ranged attacks by 50% for 15 sec or until you are missed 3 times."],
    ["Feedback", "spell_shadow_ritualofsacrifice", "discipline", 230, 0, 0, 180, 0, "The priest becomes surrounded with anti-magic energy. Any successful spell cast against the priest will burn 105 of the attacker's Mana, causing 1 Shadow damage for each point of Mana burned. Lasts 15 sec."],
    ["Shackle Undead", "spell_nature_slow", "discipline", 150, 30, 1.5, 0, 0, "Shackles the target undead enemy for up to 50 sec. The shackled unit is unable to move, attack or cast spells. Any damage caused will release the target. Only one target can be shackled at a time."],
    ["Mana Burn", "spell_shadow_manaburn", "discipline", 270, 30, 3, 0, 0, "Drains 746 to 788 mana from a target. For each mana drained in this way, the target takes 0.5 Shadow damage."],
    ["Divine Spirit", "spell_holy_divinespirit", "discipline", 970, 30, 0, 0, 0, "Holy power infuses the target, increasing their Spirit by 40 for 1 hr."],
    ["Prayer of Fortitude", "spell_holy_prayeroffortitude", "discipline", 3400, 40, 0, 0, 0, "Power infuses all party and raid members, increasing their Stamina by 70 for 1 hr."],
    ["Prayer of Spirit", "spell_holy_prayerofspirit", "discipline", 1940, 40, 0, 0, 0, "Power infuses all party and raid members, increasing their Spirit by 40 for 1 hr."],
    ["Lesser Heal", "spell_holy_lesserheal", "holy", 75, 40, 2.5, 0, 0, "Heal your target for 157 to 181."],
    ["Renew", "spell_holy_renew", "holy", 410, 40, 0, 0, 0, "Heals the target of 830 damage over 15 sec."],
    ["Desperate Prayer", "spell_holy_restoration", "holy", 0, 0, 0, 600, 0, "Instantly heals the caster for 1285 to 1513."],
    ["Divine Grace", "ability_priest_savinggrace", "holy", 0, 40, 0, 600, 0, "Instantly heals a friendly target below 50% Health for 1285 to 1513 and removes Weakened Soul from that target. Cannot be cast on self."],
    ["Cure Disease", "spell_holy_nullifydisease", "holy", "b15", 30, 0, 0, 0, "Removes 1 disease from the friendly target."],
    ["Heal", "spell_holy_heal02", "holy", 305, 40, 3, 0, 0, "Heal your target for 634 to 713."],
    ["Chastise", "spell_holy_chastise", "holy", 225, 20, 0, 120, 0, "Chastise the target, causing 272 to 306 Holy damage and Immobilizing them for up to 2 sec. Only works against Humanoids. This spell causes very low threat."],
    ["Fear Ward", "spell_holy_excorcism", "holy", 100, 30, 0, 180, 0, "Wards the friendly target against Fear. The next Fear effect used against the target will fail, using up the ward. Lasts 3 min."],
    ["Flash Heal", "spell_holy_flashheal", "holy", 380, 40, 1.5, 0, 0, "Heals a friendly target for 774 to 910."],
    ["Prayer of Healing", "spell_holy_prayerofhealing02", "holy", 1070, 40, 3, 0, 0, "A powerful prayer that heals the target and their party for 631 to 667. Party members must be within 40 yards of target."],
    ["Abolish Disease", "spell_nature_nullifydisease", "holy", "b15", 30, 0, 0, 0, "Attempts to cure 1 disease effect on the target, and 1 more disease effect every 5 seconds for 20 sec."],
    ["Greater Heal", "spell_holy_greaterheal", "holy", 710, 40, 3, 0, 0, "A slow casting spell that heals a single target for 1853 to 2067."],
    ["Lightwell", "spell_holy_summonlightwell", "holy", 365, 0, 1.5, 600, 0, "Creates a holy Lightwell near the priest. Members of your raid or party can click the Lightwell to restore 1600 health over 10 sec. Being attacked cancels the effect. Lightwell lasts for 3 min or 5 charges."],
    ["Prayer of Mending", "spell_holy_prayerofmendingtga", "holy", 390, 40, 0, 10, 1, "Places a spell on the target that heals them for 413 the next time they take damage or receive non-periodic healing. When the heal occurs, Prayer of Mending jumps to a party or raid member within 20 yds. Jumps up to 5 times and lasts 30 sec after each jump. This spell can only be placed on one target at a time per caster."],
    ["Fade", "spell_magic_lesserinvisibilty", "shadow_magic", 275, 0, 0, 30, 0, "Fade out, discouraging enemies from attacking you for 10 sec. More effective than Fade (rank 5)."],
    ["Hex of Weakness", "spell_shadow_fingerofdeath", "shadow_magic", 240, 30, 0, 0, 0, "Weakens the target enemy, reducing melee attack power by 204 and reducing the effectiveness of any healing by 20%. Lasts 2 min"],
    ["Touch of Weakness", "spell_shadow_deadofnight", "shadow_magic", 195, 0, 0, 0, 0, "The next melee attack on the caster will cause 56 Shadow damage and reduce the attacker's melee attack power by the attacker by 204 for 2 min."],
    ["Psychic Scream", "spell_shadow_psychicscream", "shadow_magic", 210, 0, 0, 30, 0, "The caster lets out a psychic scream, causing 5 enemies within 8 yards to flee for 8 sec. Damage caused may interrupt the effect."],
    ["Dark Sacrifice", "spell_holy_powerinfusion_shadow", "shadow_magic", 0, 0, 0, 600, 0, "Cannibalize 1600 of your own Health over 15 sec to gain 1920 Mana."],
    ["Mind Soothe", "spell_holy_mindsooth", "shadow_magic", 90, 40, 0, 0, 0, "Soothes the target, reducing the range at which it will attack you by 10 yards. Only affects Humanoid targets level 70 or lower. Lasts 15 sec."],
    ["Shadowguard", "spell_nature_lightningshield", "shadow_magic", 250, 0, 0, 0, 0, "The caster is surrounded by shadows. When a spell, melee or ranged attack hits the caster, the attacker will be struck for 96 Shadow damage. Attackers can only be damaged once every few seconds. This damage causes no threat. 3 charges. Lasts 10 min."],
    ["Mind Control", "spell_shadow_shadowworddominate", "shadow_magic", 750, 20, "ch", 0, 0, "Controls a humanoid mind up to level 64, but increases the time between attacks by 25%. Lasts up to 1 min."],
    ["Shadow Protection", "spell_shadow_antishadow", "shadow_magic", 650, 30, 0, 0, 0, "Increases the target's resistance to Shadow spells by 60 for 10 min."],
    ["Prayer of Shadow Protection", "spell_holy_prayerofshadowprotection", "shadow_magic", 1300, 40, 0, 0, 0, "Power infuses all party and raid members, increasing their Shadow resistance by 60 for 20 min."],
    ["Silence", "spell_shadow_impphaseshift", "shadow_magic", 225, 20, 0, 45, 1, "Silences the target, preventing them from casting spells for 5 sec and interrupting their spellcasts for 3 sec."]
  ];

  // src/classes/priest/abilities.js
  var spell3 = (schools, extra10) => ({ schools, harmful: true, target: "enemy", range: 30, ...extra10 });
  var holy2 = ["holy"];
  var shadow2 = ["shadow"];
  var basePct4 = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var abilities7 = [
    /* ---------- Discipline ---------- */
    {
      id: "inner_focus",
      name: "Inner Focus",
      icon: "spell_frost_windwalkon",
      tree: "discipline",
      schools: holy2,
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "inner_focus",
      effects: [{ type: "applyAura", to: "self", aura: "inner_focus" }],
      text: "When activated, reduces the Mana cost of your next spell by 100% and increases its critical effect chance by 25% if it is a non-periodic spell and capable of a critical effect."
    },
    {
      id: "power_infusion",
      name: "Power Infusion",
      icon: "spell_holy_powerinfusion",
      tree: "discipline",
      schools: holy2,
      target: "self",
      cost: basePct4(0.2),
      cooldown: 180,
      talent: "power_infusion",
      effects: [{ type: "applyAura", to: "self", aura: "power_infusion" }],
      text: "Infuses the target with power, increasing their spell damage and healing done by 20% for 15 sec."
    },
    {
      id: "penance",
      name: "Penance",
      icon: "spell_holy_penance",
      tree: "discipline",
      ...spell3(holy2, { range: 36 }),
      cost: 385,
      cooldown: 12,
      talent: "penance",
      dual: true,
      tags: ["heal"],
      effects: [{ type: "damage", min: 92, max: 92, coef: 0.229, name: "Penance" }],
      allyEffects: [{ type: "heal", min: 425, max: 425, coef: 0.229, name: "Penance" }],
      channel: { duration: 2, ticks: 2, projectile: true, tick: [{ type: "damage", min: 92, max: 92, coef: 0.229, name: "Penance" }], allyTick: [{ type: "heal", min: 425, max: 425, coef: 0.229, name: "Penance" }] },
      text: "Launches a volley of holy light at the target, causing 92 Holy damage to an enemy, or 425 healing to an ally, instantly and every 1 sec for 2 sec."
    },
    {
      id: "starshards",
      name: "Starshards",
      icon: "spell_arcane_starfire",
      tree: "discipline",
      ...spell3(["arcane"]),
      cost: 350,
      cooldown: 30,
      race: "night_elf",
      channel: { duration: 6, ticks: 6, tick: [{ type: "damage", min: 300, max: 300, coef: 0.167, binary: true, name: "Starshards" }] },
      text: "Rains starshards down on the enemy target's head, causing 1800 Arcane damage over 6 sec. Night Elf racial."
    },
    /* ---------- Holy ---------- */
    {
      id: "smite",
      name: "Smite",
      icon: "spell_holy_holysmite",
      tree: "holy",
      ...spell3(holy2),
      cost: 280,
      castTime: 2.5,
      effects: [{ type: "damage", min: 167, max: 186, coef: 0.714 }],
      text: "Smite an enemy for 167 to 186 Holy damage."
    },
    {
      id: "holy_fire",
      name: "Holy Fire",
      icon: "spell_holy_searinglight",
      tree: "holy",
      ...spell3(holy2),
      cost: 255,
      castTime: 3.5,
      effects: [{ type: "damage", min: 184, max: 232, coef: 0.75, onHit: [{ type: "applyAura", to: "target", aura: "holy_fire" }] }],
      text: "Consumes the enemy in holy flames that cause 184 to 232 Holy damage and an additional 75 Holy damage over 10 sec."
    },
    {
      id: "holy_nova",
      name: "Holy Nova",
      icon: "spell_holy_holynova",
      tree: "holy",
      schools: holy2,
      harmful: true,
      target: "self",
      cost: 750,
      talent: "holy_nova",
      threatMult: 0,
      // no threat (Forever)
      effects: [
        { type: "aoeDamage", center: "self", radius: 10, min: 174, max: 200, coef: 0.107, name: "Holy Nova" },
        // ESTIMATE: the heal uses the damage's 0.107 (the client has none for it).
        { type: "party", of: "self", center: "self", radius: 10, fx: false, effects: [{ type: "heal", min: 288, max: 334, coef: 0.107, name: "Holy Nova" }] }
      ],
      text: "Causes an explosion of holy light around the caster, causing 174 to 200 Holy damage to all enemy targets within 10 yards and healing all party members within 10 yards for 288 to 334. These effects cause no threat. Each time Holy Fire deals damage, you have a 5% chance for your next Holy Nova to cost no Mana."
    },
    /* ---------- Shadow Magic ---------- */
    {
      id: "shadow_word_pain",
      name: "Shadow Word: Pain",
      icon: "spell_shadow_shadowwordpain",
      tree: "shadow_magic",
      ...spell3(shadow2),
      cost: 470,
      // Improved Shadow Word: Pain adds 3 sec (one more tick of 127) per rank.
      effects: [{ type: "applyAura", to: "target", aura: "shadow_word_pain", spellHit: true, dynamic: (g) => {
        const n = 6 + g.rank("improved_shadow_word_pain");
        return { dot: { ticks: n, base: 127 * n, coef: 0.2 * n } };
      } }],
      text: "A word of darkness that causes 762 Shadow damage over 18 sec."
    },
    {
      id: "mind_blast",
      name: "Mind Blast",
      icon: "spell_shadow_unholyfrenzy",
      tree: "shadow_magic",
      ...spell3(shadow2),
      cost: 350,
      castTime: 1.5,
      cooldown: 8,
      effects: [{ type: "damage", min: 477, max: 503, coef: 0.429 }],
      text: "Blasts the target for 477 to 503 Shadow damage, but causes a high amount of threat."
    },
    {
      id: "mind_flay",
      name: "Mind Flay",
      icon: "spell_shadow_siphonmana",
      tree: "shadow_magic",
      ...spell3(shadow2, { range: 20 }),
      cost: 205,
      talent: "mind_flay",
      channel: { duration: 3, ticks: 3, beam: true, tick: [{ type: "damage", min: 130, max: 130, coef: 0.167, binary: true, name: "Mind Flay" }] },
      text: "Assault the target's mind with Shadow energy, causing 390 Shadow damage over 3 sec and slowing their movement speed by 50%."
    },
    {
      id: "shadow_word_death",
      name: "Shadow Word: Death",
      icon: "spell_shadow_demonicfortitude",
      tree: "shadow_magic",
      ...spell3(shadow2),
      cost: 340,
      cooldown: 18,
      effects: [{ type: "damage", min: 444, max: 472, coef: 0.429 }],
      text: "A word of dark binding that inflicts 444 to 472 Shadow damage to the target. If your target is not killed by Shadow Word: Death, you take backlash damage equal to 30% of your maximum health."
    },
    {
      id: "vampiric_embrace",
      name: "Vampiric Embrace",
      icon: "spell_shadow_unsummonbuilding",
      tree: "shadow_magic",
      ...spell3(shadow2),
      cost: 40,
      cooldown: 30,
      talent: "vampiric_embrace",
      effects: [{ type: "applyAura", to: "target", aura: "vampiric_embrace", spellHit: true }],
      text: "Afflicts your target with Shadow energy that causes all party members to be healed for 20% of any Shadow spell damage you deal for 30 sec."
    },
    {
      id: "devouring_plague",
      name: "Devouring Plague",
      icon: "spell_shadow_devouringplague",
      tree: "shadow_magic",
      ...spell3(shadow2),
      cost: 985,
      cooldown: 24,
      effects: [{ type: "applyAura", to: "target", aura: "devouring_plague", spellHit: true }],
      text: "Afflicts the target with a disease that causes 848 Shadow damage over 24 sec. Damage caused by the Devouring Plague heals the caster."
    },
    {
      id: "shadowform",
      name: "Shadowform",
      icon: "spell_shadow_shadowform",
      tree: "shadow_magic",
      schools: shadow2,
      target: "self",
      cost: basePct4(0.4),
      cooldown: 1.5,
      talent: "shadowform",
      shapeshift: "shadow",
      // pressing it again leaves Shadowform
      effects: [{ type: "setForm", aura: "shadowform" }],
      text: "Assume Shadowform, increasing your Shadow damage by 10%, reducing the Mana cost of all Shadow spells by 50%, increasing the critical strike damage bonus of your Shadow spells by 100%, and reducing Physical damage taken by you by 15%."
    },
    // The race bar (Forever's priest races). Picked before the fight starts; each race has its own racial spells.
    ...[
      ["human", "Human", "achievement_character_human_male", "Divine Grace and Feedback"],
      ["dwarf", "Dwarf", "achievement_character_dwarf_male", "Desperate Prayer and Chastise"],
      ["night_elf", "Night Elf", "achievement_character_nightelf_male", "Starshards and Elune's Grace"],
      ["gnome", "Gnome", "achievement_character_gnome_male", "Confounding Flash and Contingency Plan"],
      ["troll", "Troll", "achievement_character_troll_male", "Hex of Weakness and Shadowguard"],
      ["undead", "Undead", "achievement_character_undead_male", "Touch of Weakness and Dark Sacrifice"]
    ].map(([r, name, icon2, spells]) => ({
      id: `race_${r}`,
      name,
      icon: icon2,
      tree: "discipline",
      schools: [],
      target: "self",
      gcd: false,
      hidden: true,
      setsOption: ["race", r],
      activeWhen: (g) => ((g.loadout.options || {}).race ?? "human") === r,
      usable: () => "Pick your race before the fight starts",
      effects: [],
      text: `Play a ${name} priest. Racial spells: ${spells}. Pick it before the fight starts; your racial spells on the action bar change with it.`
    }))
  ];

  // src/classes/priest/spellbook.js
  var holy3 = ["holy"];
  var heal2 = (extra10) => ({ notSimulated: false, schools: holy3, target: "ally", range: 40, harmful: false, tags: ["heal"], ...extra10 });
  var weakened = (g) => {
    const t = g.player.friend && !g.player.friend.dead ? g.player.friend : g.player;
    return findAura(t, "weakened_soul") ? "The target has Weakened Soul" : null;
  };
  var stat = (k, n, label) => ({ notSimulated: false, mods: () => [{ key: "attributes", fn: (a) => ({ ...a, [k]: a[k] + n }) }], desc: () => `${label} increased by ${n}.` });
  var extra7 = spellbookAbilities(SPELLBOOK7, {
    known: new Set(abilities7.map((a) => a.name)),
    talents: new Set(trees7.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      // Racial spells in Forever, two per race (Blizzard's priest racials list, October 2026): Human Divine Grace and Feedback;
      // Dwarf Desperate Prayer and Chastise; Night Elf Starshards and Elune's Grace; Gnome Confounding Flash and Contingency
      // Plan; Troll Hex of Weakness and Shadowguard; Undead Touch of Weakness and Dark Sacrifice. Fear Ward and Devouring
      // Plague: every race. (The race of Divine Grace, Desperate Prayer, Contingency Plan, Chastise and Dark Sacrifice is set
      // in their own entries below.)
      feedback: { race: "human" },
      elunes_grace: { race: "night_elf" },
      confounding_flash: { race: "gnome" },
      hex_of_weakness: { race: "troll" },
      shadowguard: { race: "troll" },
      touch_of_weakness: { race: "undead" },
      inner_fire: { notSimulated: false },
      power_word_fortitude: { notSimulated: false },
      prayer_of_fortitude: { notSimulated: false, effects: [{ type: "applyAura", to: "self", aura: "power_word_fortitude" }] },
      divine_spirit: { notSimulated: false },
      prayer_of_spirit: { notSimulated: false, effects: [{ type: "applyAura", to: "self", aura: "divine_spirit" }] },
      dark_sacrifice: { race: "undead", notSimulated: false, effects: [{ type: "applyAura", to: "self", aura: "dark_sacrifice" }] },
      dispel_magic: cure(["magic"], 2),
      cure_disease: cure(["disease"]),
      abolish_disease: cure(["disease"], 1, "abolish_disease"),
      lesser_heal: heal2({ effects: [{ type: "heal", min: 157, max: 181, coef: 0.714 }] }),
      heal: heal2({ effects: [{ type: "heal", min: 634, max: 713, coef: 0.857 }] }),
      greater_heal: heal2({ effects: [{ type: "heal", min: 1853, max: 2067, coef: 0.857 }] }),
      flash_heal: heal2({ effects: [{ type: "heal", min: 774, max: 910, coef: 0.429 }] }),
      renew: heal2({ effects: [{ type: "hot", aura: "renew", base: 166, coef: 0.2 }] }),
      // Shield: 928 + 10% of spell power, more with Improved Power Word: Shield; Weakened Soul for 15 sec.
      power_word_shield: heal2({
        usable: weakened,
        effects: [
          { type: "absorb", aura: "power_word_shield", amount: (g, ctx) => (928 + g.healingPower(ctx) * 0.1) * (1 + [0, 0.07, 0.13, 0.2][g.rank("improved_power_word_shield")]) },
          { type: "applyAura", to: "target", aura: "weakened_soul" }
        ]
      }),
      prayer_of_healing: heal2({ effects: [{ type: "party", radius: 40, effects: [{ type: "heal", min: 631, max: 667, coef: 0.286 }] }] }),
      // One Prayer of Mending per Priest: a new one takes the old one off whoever has it.
      prayer_of_mending: heal2({ effects: [
        { type: "custom", run: (g) => {
          for (const u of raidMembers(g)) {
            const a = findAura(u, "prayer_of_mending", g.player);
            if (a) removeAura(g, a, "replaced");
          }
        } },
        { type: "applyAura", to: "target", aura: "prayer_of_mending", charges: 5 }
      ] }),
      divine_grace: heal2({
        race: "human",
        usable: (g) => {
          const t = g.player.friend;
          if (!t || t.dead || t === g.player) return "Cannot be cast on yourself";
          return t.hp < g.maxHpOf(t) * 0.5 ? null : "The target must be below 50% health";
        },
        effects: [{ type: "heal", min: 1285, max: 1513, coef: 0.429 }, { type: "custom", run: (g, ctx) => {
          const a = findAura(ctx.target, "weakened_soul");
          if (a) removeAura(g, a, "removed");
        } }]
      }),
      desperate_prayer: { race: "dwarf", notSimulated: false, schools: holy3, tags: ["heal"], effects: [{ type: "heal", to: "self", min: 1285, max: 1513, coef: 0.429 }] },
      contingency_plan: heal2({ race: "gnome", range: 30, effects: [{ type: "applyAura", to: "target", aura: "contingency_plan" }] }),
      chastise: {
        race: "dwarf",
        notSimulated: false,
        schools: ["holy"],
        usable: (g) => (g.player.target || {}).creatureType === "humanoid" ? null : "Only works on Humanoids (Enemy type, under Advanced)",
        effects: [{ type: "damage", min: 272, max: 306, coef: 0.429 }]
      }
    },
    auraOverrides: {
      abolish_disease: cureAura(["disease"], 5),
      // While the shield holds, spellcasting is not interrupted by damage (no pushback; only the player's own matters here).
      power_word_shield: { notSimulated: false, kind: "buff", absorb: true, duration: 30, mods: () => [focus(1)], desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage. Spellcasting is not interrupted by damage.` },
      contingency_plan: { notSimulated: false, kind: "buff", duration: 30, desc: () => "Below 35% health: a 926 shield and 670 healing over 15 sec." },
      inner_fire: { notSimulated: false, kind: "buff", duration: 600, mods: (a, g) => [add("armor", 1395 * (1 + 0.15 * g.rank("improved_inner_fire")))], desc: (a, g) => `Armor increased. ${20 + 4 * g.rank("improved_inner_fire") - (a.data.used || 0)} charges left.` },
      power_word_fortitude: stat("sta", 70, "Stamina"),
      divine_spirit: stat("spi", 40, "Spirit")
    }
  });
  extra7.auras.renew = { id: "renew", name: "Renew", icon: "spell_holy_renew", kind: "buff", hot: true, period: 3, duration: 15, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec.` };
  extra7.auras.prayer_of_mending = { id: "prayer_of_mending", name: "Prayer of Mending", icon: "spell_holy_prayerofmendingtga", kind: "buff", duration: 30, desc: (a) => `Heals the next time this target takes damage, then jumps (${a.charges} jumps left).` };
  extra7.auras.weakened_soul = { id: "weakened_soul", name: "Weakened Soul", icon: "spell_holy_ashestoashes", kind: "debuff", duration: 15, desc: () => "Cannot be shielded by Power Word: Shield." };
  extra7.auras.contingency_shield = { id: "contingency_shield", name: "Contingency Plan", icon: "ability_priest_soulwarding", kind: "buff", duration: 15, absorb: true, desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage.` };
  extra7.auras.contingency_hot = { id: "contingency_hot", name: "Contingency Plan", icon: "ability_priest_soulwarding", kind: "buff", hot: true, period: 3, duration: 15, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec.` };
  extra7.auras.divine_aegis = { id: "divine_aegis", name: "Divine Aegis", icon: "spell_holy_devineaegis", kind: "buff", duration: 12, absorb: true, desc: (a) => `Absorbs ${Math.round(a.data.absorb || 0)} damage.` };
  extra7.auras.dark_sacrifice = {
    id: "dark_sacrifice",
    name: "Dark Sacrifice",
    icon: "spell_holy_powerinfusion_shadow",
    kind: "buff",
    duration: 15,
    period: 1,
    onTick: (g, a) => {
      spendHealth(g, a.unit, 1600 / 15, "Dark Sacrifice");
      g.gainPower("mana", 128);
    },
    // 1600 health into 1920 mana over 15 sec
    desc: () => "Turning health into mana: 107 health into 128 mana every sec."
  };

  // src/classes/priest/auras.js
  var spellDamage = (ctx) => !hasSchool(ctx, "physical");
  var auras7 = {
    /* ---------- on the target ---------- */
    shadow_word_pain: { id: "shadow_word_pain", name: "Shadow Word: Pain", icon: "spell_shadow_shadowwordpain", kind: "debuff", schools: ["shadow"], dot: { period: 3, ticks: 6, base: 762, coef: 1.2 } },
    holy_fire: { id: "holy_fire", name: "Holy Fire", icon: "spell_holy_searinglight", kind: "debuff", schools: ["holy"], dot: { period: 2, ticks: 5, base: 75, coef: 0.25 } },
    devouring_plague: { id: "devouring_plague", name: "Devouring Plague", icon: "spell_shadow_devouringplague", kind: "debuff", schools: ["shadow"], dot: { period: 3, ticks: 8, base: 848, coef: 0.8 } },
    vampiric_embrace: { id: "vampiric_embrace", name: "Vampiric Embrace", icon: "spell_shadow_unsummonbuilding", kind: "debuff", duration: 30, desc: () => "The party is healed for 20% of the Priest's Shadow damage." },
    shadow_weaving: {
      id: "shadow_weaving",
      name: "Shadow Weaving",
      icon: "spell_shadow_blackplague",
      kind: "debuff",
      duration: 15,
      maxStacks: 5,
      sourceMods: (a) => [mult("damageMult", 1 + 0.02 * a.stacks, (ctx) => hasSchool(ctx, "shadow"))],
      desc: (a) => `Shadow damage taken from the Priest increased by ${2 * a.stacks}%.`
    },
    /* ---------- on the Priest ---------- */
    shadowform: {
      id: "shadowform",
      name: "Shadowform",
      icon: "spell_shadow_shadowform",
      kind: "buff",
      flags: { form: "shadow" },
      mods: () => [
        mult("damageMult", 1.1, (ctx) => hasSchool(ctx, "shadow")),
        mult("cost", 0.5, (ctx) => hasSchool(ctx, "shadow")),
        mult("critBonusMult", 2, (ctx) => hasSchool(ctx, "shadow"))
        // spell crits: 150% -> 200%
      ],
      desc: () => "Shadow damage +10%, Shadow spells cost half, Shadow crits deal 200%."
    },
    inner_focus: {
      id: "inner_focus",
      name: "Inner Focus",
      icon: "spell_frost_windwalkon",
      kind: "buff",
      mods: () => [set("cost", 0, (ctx) => !!ctx.ability && ctx.ability.id !== "inner_focus" && ctx.ability.kind !== "item")],
      // the crit: ctx.innerFocus, in priest.js
      desc: () => "Your next spell costs no mana and has 25% more critical chance."
    },
    power_infusion: { id: "power_infusion", name: "Power Infusion", icon: "spell_holy_powerinfusion", kind: "buff", duration: 15, mods: () => [mult("damageMult", 1.2, spellDamage), mult("healMult", 1.2)], desc: () => "Spell damage and healing increased by 20%." },
    dark_inspiration: {
      id: "dark_inspiration",
      name: "Dark Inspiration",
      icon: "spell_warlock_demonsoul",
      kind: "buff",
      duration: 10,
      mods: (a, g) => [{ key: "attributes", fn: (x) => ({ ...x, spi: x.spi * (1 + 0.03 * g.rank("dark_inspiration")) }) }],
      desc: (a, g) => `Spirit increased by ${3 * g.rank("dark_inspiration")}%.`
    },
    // Inspiration: a critical heal raises the target's armor (allies in the tests read data.armorMult).
    inspiration: { id: "inspiration", name: "Inspiration", icon: "inv_shield_06", kind: "buff", duration: 15, mods: (a) => [mult("armor", a.data.armorMult || 1)], desc: (a) => `Armor increased by ${Math.round(((a.data.armorMult || 1) - 1) * 100)}%.` },
    // Blessed Recovery: part of a big hit healed back over 6 sec.
    blessed_recovery: { id: "blessed_recovery", name: "Blessed Recovery", icon: "spell_holy_blessedrecovery", kind: "buff", hot: true, period: 2, duration: 6, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 2 sec.` },
    // Spirit of Redemption: 15 sec after death, healing spells free, nothing can hurt you; then you die.
    spirit_of_redemption: {
      id: "spirit_of_redemption",
      name: "Spirit of Redemption",
      icon: "inv_enchant_essenceeternallarge",
      kind: "buff",
      duration: 15,
      flags: { immune: true },
      mods: () => [set("cost", 0, (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("heal")), set("healingTaken", 0)],
      onRemove: (g, a, reason) => {
        if (reason === "expired" && !g.player.dead) g.dieNow();
      },
      desc: () => "Healing spells cost no mana. Nothing can harm you. You die when it ends."
    },
    focused_casting: { id: "focused_casting", name: "Focused Casting", icon: "spell_arcane_blink", kind: "buff", duration: 6, mods: () => [focus(1)], desc: () => "You do not lose casting time when you take damage." },
    free_holy_nova: { id: "free_holy_nova", name: "Searing Light", icon: "spell_holy_searinglightpriest", kind: "buff", duration: 15, mods: () => [set("cost", 0, (ctx) => !!ctx.ability && ctx.ability.id === "holy_nova")], desc: () => "Your next Holy Nova costs no mana." }
  };

  // src/classes/priest/presets.js
  var gearRoles3 = { healer: "Healer", caster: "Shadow" };
  var healer2 = (tier, name, blurb, gear) => ({ id: `${tier}_healer`, tier, role: "healer", name, blurb, gear: { hit: 0, haste: 0, ...gear } });
  var caster = (tier, name, blurb, gear) => ({ id: tier, tier, role: "caster", name, blurb, gear: { heal: 0, mp5: 0, haste: 0, ...gear } });
  var gearPresets7 = [
    healer2("fresh", "Fresh 60", "Quest and dungeon greens and blues for healing.", { int: 100, spi: 60, sta: 80, sp: 0, heal: 150, crit: 0.01, mp5: 0 }),
    healer2("preraid", "Pre-raid", "Best dungeon, quest and crafted healing gear before raids.", { int: 104, spi: 88, sta: 72, sp: 40, heal: 721, crit: 0, mp5: 17, armor: 603 }),
    caster("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { int: 100, spi: 60, sta: 80, sp: 120, crit: 0.01, hit: 0.01 }),
    caster("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { int: 142, spi: 4, sta: 84, sp: 375, crit: 0.04, hit: 0, haste: 0, armor: 613, spSchool: { shadow: 87 } })
  ];
  var builds7 = [
    {
      id: "discipline",
      name: "Discipline",
      points: "31/20/0",
      gearRole: "healer",
      scenario: "raid-healing",
      blurb: "A shield healer for the Healing test: Power Word: Shield on whoever is about to be hit (Soul Warding takes the cooldown away), Penance on a friend, Flash Heal and Greater Heal; Renewed Hope crits on shielded targets and Divine Aegis turns crits into more shields. Inner Focus and Power Infusion for the hard moments.",
      options: { race: "dwarf" },
      talents: {
        twin_disciplines: 5,
        mental_strength: 5,
        mental_agility: 3,
        inner_focus: 1,
        improved_power_word_shield: 3,
        meditation: 3,
        soul_warding: 1,
        penance: 1,
        renewed_hope: 5,
        divine_aegis: 3,
        power_infusion: 1,
        improved_renew: 3,
        holy_specialization: 5,
        divine_fury: 5,
        holy_nova: 1,
        inspiration: 3,
        improved_healing: 3
      },
      bar: ["power_word_shield", "penance", "flash_heal", "greater_heal", "renew", "holy_nova", "prayer_of_healing", "inner_focus", "power_infusion", "desperate_prayer", "cure_disease", "major_mana_potion"]
    },
    {
      id: "holy",
      name: "Holy",
      points: "18/33/0",
      gearRole: "healer",
      scenario: "raid-healing",
      blurb: "A healer build for the Healing test: Renew and Prayer of Mending on the tank, Greater Heal and Heal for big heals (Divine Fury makes them faster), Flash Heal when it is urgent, Prayer of Healing on a hurt party. Spiritual Guidance and Spiritual Healing add healing; Litany of Light gives mana back for mixing heals.",
      options: { race: "dwarf" },
      talents: {
        twin_disciplines: 5,
        mental_strength: 5,
        inner_focus: 1,
        improved_power_word_shield: 3,
        meditation: 3,
        soul_warding: 1,
        improved_renew: 3,
        holy_specialization: 5,
        divine_fury: 5,
        holy_nova: 1,
        inspiration: 3,
        improved_healing: 3,
        holy_binding: 1,
        litany_of_light: 2,
        spirit_of_redemption: 1,
        spiritual_guidance: 5,
        spiritual_healing: 3,
        prayer_of_mending: 1
      },
      bar: ["heal", "greater_heal", "flash_heal", "renew", "prayer_of_mending", "prayer_of_healing", "power_word_shield", "holy_nova", "inner_focus", "desperate_prayer", "dispel_magic", "major_mana_potion"]
    },
    {
      id: "shadow_magic",
      name: "Shadow",
      points: "17/0/34",
      gearRole: "caster",
      blurb: "Shadowform for 10% more damage, half-cost spells and 200% crits. Keep Shadow Word: Pain and Devouring Plague up, Mind Blast and Shadow Word: Death on cooldown, Mind Flay in between; Shadow Weaving stacks up to 10% more.",
      options: { race: "undead" },
      talents: {
        twin_disciplines: 5,
        silent_resolve: 3,
        mental_strength: 5,
        inner_focus: 1,
        meditation: 3,
        shadow_focus: 5,
        improved_mind_blast: 5,
        improved_shadow_word_pain: 2,
        mind_flay: 1,
        improved_mind_flay: 2,
        dark_inspiration: 5,
        vampiric_embrace: 1,
        shadow_weaving: 3,
        devouring_contagion: 2,
        early_demise: 2,
        darkness: 5,
        shadowform: 1
      },
      bar: ["mind_flay", "mind_blast", "shadow_word_pain", "devouring_plague", "shadow_word_death", "vampiric_embrace", "inner_focus", "dark_sacrifice", "major_mana_potion"]
    }
  ];

  // src/classes/priest/priest.js
  var isPlayer6 = (game, ev) => ev.ctx.caster === game.player;
  var isHeal = (ab) => !!ab && (ab.tags || []).includes("heal");
  var instant = (ctx) => !!ctx.ability && !ctx.ability.castTime && !ctx.ability.channel && (ctx.ability.harmful || isHeal(ctx.ability));
  var DIRECT_HEALS = ["flash_heal", "lesser_heal", "heal", "greater_heal", "penance"];
  function noHealsInShadowform(list) {
    for (const ab of list) {
      if (!(ab.tags || []).includes("heal") || ab.id === "power_word_shield") continue;
      if (ab.dual) {
        const u = ab.usable;
        ab.usable = (g, ctx) => ctx.allyMode && g.form() === "shadow" ? "Can't heal in Shadowform" : u ? u(g, ctx) : null;
        continue;
      }
      const req = ab.requires || (ab.requires = {});
      req.formNot = [.../* @__PURE__ */ new Set([...req.formNot || [], "shadow"])];
    }
    return list;
  }
  var priest = {
    id: "priest",
    name: "Priest",
    roles: ["dps", "healer"],
    // the tests it can take (Damage, Tank, Healing)
    icon: "classicon_priest",
    color: "#ffffff",
    resource: "mana",
    source: SOURCE7,
    // Level 60 Human Priest base stats (Classic, approximate). 59.5 Intellect per 1% crit, 0.8% base.
    stats: {
      level: 60,
      base: { str: 39, agi: 45, sta: 58, int: 120, spi: 135 },
      baseHp: 1397,
      baseMana: 1436,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1397 + conv(a.sta, 10) - 20,
          maxMana: 1436 + conv(a.int, 15) - 20,
          crit: 8e-3 + a.int / 59.5 / 100,
          regen: (13 + a.spi / 4) / 2
          // Priest Spirit regeneration, per second
        };
      }
    },
    stanceBar: { label: "Race", abilities: ["race_human", "race_dwarf", "race_night_elf", "race_gnome", "race_troll", "race_undead"] },
    trees: trees7,
    talentHistory: talentHistory6,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: noHealsInShadowform([...abilities7, ...extra7.abilities]),
    // the rest of the spellbook: spellbook.js
    auras: { ...auras7, ...extra7.auras },
    gearPresets: gearPresets7,
    gearRoles: gearRoles3,
    builds: builds7,
    gearFields: [
      { k: "int", label: "Intellect", step: 5, max: 600 },
      { k: "spi", label: "Spirit", step: 5, max: 500 },
      { k: "sp", label: "Spell power", step: 10, max: 1200 },
      { k: "heal", label: "Bonus healing", step: 10, max: 1500, note: "Increases healing done by up to this much and damage done by up to a third of it, for all magical spells and effects." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "mp5", label: "Mana per 5 sec", step: 1, max: 60 },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." }
    ],
    options: {
      // The race: picked on the race bar before the fight (hidden from the gear panel). Racial spells follow it.
      race: { label: "Race", hidden: true, values: ["human", "dwarf", "night_elf", "gnome", "troll", "undead"], names: { human: "Human", dwarf: "Dwarf", night_elf: "Night Elf", gnome: "Gnome", troll: "Troll", undead: "Undead" }, default: "human" }
    },
    sheet(game, f) {
      const s = game.stats();
      return [
        ["Intellect", f.int(s.int)],
        ["Spirit", f.int(s.spi)],
        ["Mana", f.int(s.maxMana)],
        ["Spell power", f.int(s.sp)],
        ...s.healExtra ? [["Healing power", f.int(s.sp + s.healExtra)]] : [],
        ["Crit chance", f.pct(s.crit)],
        ["Hit chance", f.pct(s.hit)]
      ];
    },
    // Fortitude, Divine Spirit and Inner Fire for everyone; Shadowform for Shadow.
    startBuffs: (game) => ["power_word_fortitude", "divine_spirit", "inner_fire", game.mainTree() === "shadow_magic" ? "shadowform" : null].filter(Boolean),
    // Spirit of Redemption: the first death becomes 15 sec as a spirit that heals for free.
    cheatDeath(game) {
      const p = game.player;
      if (!game.rank("spirit_of_redemption") || findAura(p, "spirit_of_redemption")) return false;
      p.hp = 1;
      if (p.cast && !(p.cast.ab.tags || []).includes("heal")) game.cancelCast("spirit");
      applyAura(game, p, auras7.spirit_of_redemption, { source: p });
      game.emit("error", "Spirit of Redemption");
      return true;
    },
    listen(game, on) {
      on("damage", (ev) => {
        const c = ev.ctx, p2 = game.player, n = ev.res.amount;
        if (c.caster !== p2 || !(n > 0) || !hasSchool(c, "shadow")) return;
        const id = c.ability && c.ability.id;
        if (id === "devouring_plague") healUnit(game, p2, n, { name: "Devouring Plague", icon: "spell_shadow_devouringplague", source: "player" });
        if (c.target && findAura(c.target, "vampiric_embrace", p2)) {
          const party = partyOf(game, p2);
          for (const u of party.includes(p2) ? party : [p2]) if (!u.dead) healUnit(game, u, 0.2 * n, { name: "Vampiric Embrace", icon: "spell_shadow_unsummonbuilding", source: "player" });
        }
        if (id === "shadow_word_death" && !c.periodic && c.target && !c.target.dead) damagePlayer(game, 0.3 * game.stats().maxHp, { name: "Shadow Word: Death", schools: ["shadow"] });
      });
      on("hitTaken", ({ res }) => {
        const a = findAura(game.player, "inner_fire");
        if (!a || ["miss", "dodge", "parry", "immune"].includes(res.outcome)) return;
        a.data.used = (a.data.used || 0) + 1;
        if (a.data.used >= 20 + 4 * game.rank("improved_inner_fire")) removeAura(game, a, "consumed");
      });
      const p = () => game.player;
      on("cast:success", ({ ability, ctx }) => {
        if (ability.id === "inner_focus" || ability.kind === "item") return;
        const a = findAura(game.player, "inner_focus");
        if (!a) return;
        if (ctx) ctx.innerFocus = true;
        removeAura(game, a, "consumed");
      });
      on("unitDamaged", ({ unit }) => {
        const pom = findAura(unit, "prayer_of_mending", p());
        if (pom && !unit.dead) {
          const left = pom.charges - 1;
          removeAura(game, pom, "consumed");
          const ab = game.ability("prayer_of_mending");
          healHit(game, { castId: ++game.castSeq, caster: p(), target: unit, ability: ab, schools: ["holy"], tags: ["heal"] }, { min: 413, max: 413, coef: 0.429, name: "Prayer of Mending" });
          if (left > 0) {
            const near = raidMembers(game).filter((u) => u !== unit && !u.dead && dist(u, unit) <= 20);
            const hurt = near.filter((u) => u.hp < game.maxHpOf(u));
            const list = hurt.length ? hurt : near;
            const next = list[Math.floor(game.rng() * list.length)];
            if (next) {
              applyAura(game, next, game.auraDef("prayer_of_mending"), { source: p(), charges: left });
              game.emit("fx", { kind: "beam", from: { x: unit.x, y: unit.y }, to: { x: next.x, y: next.y }, schools: ["holy"] });
            }
          }
        }
        const cp2 = findAura(unit, "contingency_plan", p());
        if (cp2 && !unit.dead && unit.hp < game.maxHpOf(unit) * 0.35) {
          removeAura(game, cp2, "consumed");
          const ctx = { castId: ++game.castSeq, caster: p(), target: unit, ability: game.ability("contingency_plan"), schools: ["holy"], tags: ["heal"] };
          game.runEffects([{ type: "absorb", aura: "contingency_shield", amount: () => 926 }, { type: "hot", aura: "contingency_hot", base: 134, coef: 0 }], ctx);
        }
      });
    },
    talents: {
      /* ---------- Discipline ---------- */
      power_in_light: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx, g) => isAbility(ctx, "smite", "penance") && !!ctx.target && (!!findAura(ctx.target, "holy_fire", g.player) || !!findAura(ctx.target, "shadow_word_pain", g.player)))] },
      twin_disciplines: { mods: (r) => [mult("damageMult", 1 + 0.01 * r, instant), mult("healMult", 1 + 0.01 * r, instant)] },
      holy_precision: { mods: (r) => [add("hitChance", 0.06 * r, (ctx) => hasSchool(ctx, "holy"))] },
      mental_strength: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int * (1 + 0.02 * r) }) }] },
      mental_agility: { mods: (r) => [mult("cost", 1 - [0.03, 0.07, 0.1][r - 1], (ctx) => isAbility(ctx, "smite", "holy_fire") || instant(ctx))] },
      inner_focus: { teaches: "inner_focus", mods: () => [add("critChance", 0.25, (ctx) => !!ctx.innerFocus && !ctx.periodic)] },
      // the crit of the spell Inner Focus was spent on
      meditation: { mods: (r) => [add("regenWhileCasting", [0.17, 0.33, 0.5][r - 1])] },
      penance: { teaches: "penance" },
      power_infusion: { teaches: "power_infusion" },
      improved_power_word_shield: { mods: () => [] },
      // read by Power Word: Shield (spellbook.js)
      soul_warding: { mods: () => [add("cooldown", -4, (ctx) => isAbility(ctx, "power_word_shield")), mult("cost", 0.85, (ctx) => isAbility(ctx, "power_word_shield"))] },
      // Direct heals crit more on a target with Weakened Soul and shorten it by 1 sec per rank.
      renewed_hope: {
        mods: (r) => [add("critChance", 0.02 * r, (ctx) => !!ctx.heal && !ctx.periodic && isAbility(ctx, ...DIRECT_HEALS) && !!ctx.target && !!findAura(ctx.target, "weakened_soul"))],
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            const ws = DIRECT_HEALS.includes(ability.id) && ctx.target && findAura(ctx.target, "weakened_soul");
            if (ws) ws.expires -= r;
          });
        }
      },
      // Critical direct heals leave a shield of 5% of the heal per rank (up to 1200, 12 sec).
      divine_aegis: {
        listen(game, r, on) {
          on("heal", (ev) => {
            if (ev.source !== "player" || !ev.crit || ev.periodic || ev.unit.dead) return;
            const a = findAura(ev.unit, "divine_aegis", game.player);
            const n = Math.min(1200, (a ? a.data.absorb : 0) + ev.amount * 0.05 * r);
            applyAura(game, ev.unit, game.auraDef("divine_aegis"), { source: game.player, data: { absorb: n } });
          });
        }
      },
      // Focused Casting for 6 sec after a melee or ranged critical strike against you: no pushback.
      martyrdom: {
        listen(game, r, on) {
          on("hitTaken", ({ res }) => {
            if (res.outcome === "crit" && !game.player.dead && game.rng() < 0.5 * r) applyAura(game, game.player, auras7.focused_casting, { source: game.player });
          });
        }
      },
      silent_resolve: { mods: (r) => [mult("threatMult", 1 - 0.1 * r)] },
      /* ---------- Holy ---------- */
      spell_warding: { mods: (r) => [mult("damageTaken", 1 - 0.02 * r, (ctx) => !!ctx.incoming && !(ctx.schools || []).includes("physical"))] },
      // A melee or ranged crit against you, or a hit for more than 30% of your health: 8/17/25% of it healed over 6 sec.
      blessed_recovery: {
        listen(game, r, on) {
          const pct = [0, 0.08, 0.17, 0.25][r];
          const proc = (amount) => {
            const p = game.player, old = findAura(p, "blessed_recovery");
            const left = old ? (old.data.perTick || 0) * Math.max(0, Math.ceil((old.expires - game.time) / 2 - 1e-9)) : 0;
            applyAura(game, p, auras7.blessed_recovery, { source: p, data: { perTick: (left + amount * pct) / 3, ticks: 3 } });
          };
          on("hitTaken", ({ res }) => {
            if (res.outcome === "crit" && res.amount > 0 && !game.player.dead) proc(res.amount);
          });
          on("unitDamaged", ({ unit, amount }) => {
            if (unit === game.player && !unit.dead && amount > 0.3 * game.stats().maxHp) proc(amount);
          });
        }
      },
      // A non-periodic critical heal: the target's armor +8/17/25% for 15 sec.
      inspiration: {
        listen(game, r, on) {
          on("heal", (ev) => {
            if (ev.source === "player" && ev.crit && !ev.periodic && !ev.unit.dead) applyAura(game, ev.unit, auras7.inspiration, { source: game.player, data: { armorMult: 1 + [0, 0.08, 0.17, 0.25][r] } });
          });
        }
      },
      spirit_of_redemption: { mods: () => [] },
      // cheatDeath above
      improved_inner_fire: { mods: () => [] },
      // read by Inner Fire
      twilight_focus: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r])] },
      holy_specialization: { mods: (r) => [add("critChance", 0.01 * r, (ctx) => hasSchool(ctx, "holy"))] },
      divine_fury: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "smite", "holy_fire", "heal", "greater_heal"))] },
      holy_nova: { teaches: "holy_nova" },
      holy_reach: { mods: (r) => [mult("range", 1 + 0.1 * r, (ctx) => isAbility(ctx, "smite", "holy_fire")), mult("radius", 1 + 0.1 * r, (ctx) => isAbility(ctx, "prayer_of_healing", "holy_nova"))] },
      improved_renew: { mods: (r) => [mult("healMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "renew"))] },
      improved_healing: { mods: (r) => [mult("cost", 1 - 0.05 * r, (ctx) => isAbility(ctx, "lesser_heal", "heal", "greater_heal", "penance", "prayer_of_mending"))] },
      // Holy Binding (1.60.1.70753, in Binding Heal's place): a Flash Heal on someone else heals you for 50% as much, with no threat.
      holy_binding: {
        listen(game, r, on) {
          const ability = { id: "holy_binding", name: "Holy Binding", icon: "spell_holy_blindingheal", threatMult: 0 };
          on("heal", (ev) => {
            if (ev.source !== "player" || ev.periodic || ev.unit === game.player || !ev.ctx || !isAbility(ev.ctx, "flash_heal") || !(ev.amount > 0)) return;
            healUnit(game, game.player, 0.5 * ev.amount, { name: "Holy Binding", icon: ability.icon, ctx: { caster: game.player, ability } });
          });
        }
      },
      prayer_of_mending: { teaches: "prayer_of_mending" },
      // Mana back (5% of the base cost per rank) when a heal follows a different one.
      litany_of_light: {
        listen(game, r, on) {
          let last2 = null;
          on("cast:success", ({ ability }) => {
            if (!isHeal(ability)) return;
            if (last2 && last2 !== ability.id) game.gainPower("mana", 0.05 * r * (typeof ability.cost === "function" ? ability.cost(game) : ability.cost || 0));
            last2 = ability.id;
          });
        }
      },
      spiritual_healing: { mods: (r) => [mult("healMult", 1 + 0.1 * r / 3)] },
      searing_light: {
        mods: (r) => [mult("damageMult", 1 + [0.02, 0.05][r - 1], (ctx) => hasSchool(ctx, "holy"))],
        listen(game, r, on) {
          on("damage", (ev) => {
            if (isPlayer6(game, ev) && ev.periodic && isAbility(ev.ctx, "holy_fire") && game.rng() < [0.05, 0.1][r - 1]) applyAura(game, game.player, auras7.free_holy_nova, { source: game.player });
          });
          on("cast:success", ({ ability }) => {
            if (ability.id === "holy_nova") {
              const a = findAura(game.player, "free_holy_nova");
              if (a) removeAura(game, a, "consumed");
            }
          });
        }
      },
      // Spell damage from 8% of Spirit at 5 ranks, healing from 25%.
      spiritual_guidance: { mods: (r) => [{ key: "spellPower", fn: (v, ctx, g) => v + g.stats().spi * (ctx.heal ? 0.05 * r : [0.01, 0.03, 0.05, 0.06, 0.08][r - 1]) }] },
      /* ---------- Shadow Magic ---------- */
      shadow_focus: { mods: (r) => [add("hitChance", 0.01 * r, (ctx) => hasSchool(ctx, "shadow"))] },
      improved_mind_blast: { mods: (r) => [add("cooldown", -0.5 * r, (ctx) => isAbility(ctx, "mind_blast"))] },
      improved_shadow_word_pain: { mods: () => [] },
      // read by Shadow Word: Pain (more ticks)
      shadow_reach: { mods: (r) => [mult("range", 1 + 0.1 * r, (ctx) => hasSchool(ctx, "shadow") && !!ctx.ability && !!ctx.ability.harmful)] },
      mind_flay: { teaches: "mind_flay" },
      // Each Mind Flay tick deals x% more than the one before.
      improved_mind_flay: { mods: (r) => [mult("damageMult", (ctx) => Math.pow(1 + 0.1 * r, (ctx.tick || 1) - 1), (ctx) => isAbility(ctx, "mind_flay"))] },
      dark_inspiration: {
        listen(game, r, on) {
          on("spell:resolved", ({ ability }) => {
            if (ability.id === "mind_blast") applyAura(game, game.player, auras7.dark_inspiration, { source: game.player });
          });
          on("channel:end", ({ ability, reason }) => {
            if (ability.id === "mind_flay" && reason === "done") applyAura(game, game.player, auras7.dark_inspiration, { source: game.player });
          });
        }
      },
      vampiric_embrace: { teaches: "vampiric_embrace" },
      shadow_weaving: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer6(game, ev) || ev.periodic || !hasSchool(ev.ctx, "shadow") || ev.res.outcome === "miss" || game.rng() >= [0.33, 0.67, 1][r - 1]) return;
            applyAura(game, ev.ctx.target, auras7.shadow_weaving, { source: game.player });
          });
        }
      },
      devouring_contagion: { mods: (r) => [mult("cost", 1 - 0.25 * r, (ctx) => isAbility(ctx, "devouring_plague"))] },
      early_demise: { mods: (r) => [add("critChance", 0.15 * r, (ctx) => isAbility(ctx, "shadow_word_death") && !!ctx.target && ctx.target.hp <= ctx.target.maxHp * 0.2)] },
      darkness: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx) => hasSchool(ctx, "shadow"))] },
      shadowform: { teaches: "shadowform" }
    }
  };

  // src/classes/druid/talent-data.js
  var SOURCE8 = { site: "foreverchanges.pro/talents/druid", build: "1.60.1.70790", extracted: "2026-11-05" };
  var trees8 = [
    {
      id: "balance",
      name: "Balance",
      icon: "spell_nature_starfall",
      talents: [
        { id: "improved_wrath", name: "Improved Wrath", icon: "spell_nature_abolishmagic", tier: 0, col: 1, max: 5, ranks: ["Reduces the cast time of your Wrath spell by 0.1 sec and its Mana cost by 10%.", "Reduces the cast time of your Wrath spell by 0.2 sec and its Mana cost by 20%.", "Reduces the cast time of your Wrath spell by 0.3 sec and its Mana cost by 30%.", "Reduces the cast time of your Wrath spell by 0.4 sec and its Mana cost by 40%.", "Reduces the cast time of your Wrath spell by 0.5 sec and its Mana cost by 50%."] },
        { id: "genesis", name: "Genesis", icon: "spell_arcane_arcane03", tier: 0, col: 2, max: 5, ranks: ["Increases the periodic damage and healing done by your spells and abilities by 2%.", "Increases the periodic damage and healing done by your spells and abilities by 4%.", "Increases the periodic damage and healing done by your spells and abilities by 6%.", "Increases the periodic damage and healing done by your spells and abilities by 8%.", "Increases the periodic damage and healing done by your spells and abilities by 10%."] },
        { id: "moonglow", name: "Moonglow", icon: "spell_nature_sentinal", tier: 1, col: 0, max: 3, ranks: ["Reduces the Mana cost of your damaging spells by 8%.", "Reduces the Mana cost of your damaging spells by 17%.", "Reduces the Mana cost of your damaging spells by 25%."] },
        { id: "improved_moonfire", name: "Improved Moonfire", icon: "spell_nature_starfall", tier: 1, col: 1, max: 2, ranks: ["Increases the damage and critical strike chance of your Moonfire spell by 5%.", "Increases the damage and critical strike chance of your Moonfire spell by 10%."] },
        { id: "natures_majesty", name: "Nature's Majesty", icon: "inv_staff_01", tier: 1, col: 2, max: 2, ranks: ["Increases your critical strike chance with spells and melee attacks by 2%.", "Increases your critical strike chance with spells and melee attacks by 4%."] },
        { id: "natures_reach", name: "Nature's Reach", icon: "spell_nature_naturetouchgrow", tier: 1, col: 3, max: 2, ranks: ["Increases the range of your offensive Balance spells by 10% and improves your chance to hit by 2%.", "Increases the range of your offensive Balance spells by 20% and improves your chance to hit by 4%."] },
        { id: "improved_entangling_roots", name: "Improved Entangling Roots", icon: "spell_nature_stranglevines", tier: 2, col: 0, max: 3, ranks: ["Increases the damage done by your Entangling Roots spell by 25%, and its victims can take up to 25% more damage without interrupting the effect.", "Increases the damage done by your Entangling Roots spell by 50%, and its victims can take up to 50% more damage without interrupting the effect.", "Increases the damage done by your Entangling Roots spell by 75%, and its victims can take up to 75% more damage without interrupting the effect."] },
        { id: "natures_splendor", name: "Nature's Splendor", icon: "spell_nature_natureresistancetotem", tier: 2, col: 2, max: 1, req: "natures_majesty", ranks: ["Increases the duration of your Moonfire and Rejuvenation spells by 3 sec, your Regrowth spell by 6 sec, and your Insect Swarm spell by 2 sec."] },
        { id: "insect_swarm", name: "Insect Swarm", icon: "spell_nature_insectswarm", tier: 3, col: 0, max: 1, active: true, ranks: ["The enemy target is swarmed by insects, decreasing their chance to hit with attacks by 2% and causing 48 Nature damage over 12 sec."] },
        { id: "vengeance", name: "Vengeance", icon: "spell_nature_purge", tier: 3, col: 1, max: 5, req: "improved_moonfire", ranks: ["Increases the critical strike damage bonus of your Arcane and Nature spells by 20%.", "Increases the critical strike damage bonus of your Arcane and Nature spells by 40%.", "Increases the critical strike damage bonus of your Arcane and Nature spells by 60%.", "Increases the critical strike damage bonus of your Arcane and Nature spells by 80%.", "Increases the critical strike damage bonus of your Arcane and Nature spells by 100%."] },
        { id: "improved_starfire", name: "Improved Starfire", icon: "spell_arcane_starfire", tier: 3, col: 2, max: 5, ranks: ["Reduces the cast time of Starfire by 0.1 sec and Starfire has a 3% chance to stun its target for 3 sec.", "Reduces the cast time of Starfire by 0.2 sec and Starfire has a 6% chance to stun its target for 3 sec.", "Reduces the cast time of Starfire by 0.3 sec and Starfire has a 9% chance to stun its target for 3 sec.", "Reduces the cast time of Starfire by 0.4 sec and Starfire has a 12% chance to stun its target for 3 sec.", "Reduces the cast time of Starfire by 0.5 sec and Starfire has a 15% chance to stun its target for 3 sec."] },
        { id: "overgrowth", name: "Overgrowth", icon: "inv_misc_herb_15", tier: 4, col: 0, max: 2, ranks: ["Increases the maximum number of targets you may have affected by Entangling Roots by 1.", "Increases the maximum number of targets you may have affected by Entangling Roots by 2."] },
        { id: "natures_grace", name: "Nature's Grace", icon: "spell_nature_naturesblessing", tier: 4, col: 1, max: 1, ranks: ["All non-periodic spell criticals grace you with a blessing of nature, increasing your spellcasting speed and reducing your global cooldown by 10% for 3 sec."] },
        { id: "eclipse", name: "Eclipse", icon: "ability_druid_eclipse", tier: 4, col: 2, max: 3, ranks: ["Your Wrath spell reduces the cast time of your next 2 Starfire spells by 0.17 sec. Stores up to 4 charges. Lasts 15 sec.", "Your Wrath spell reduces the cast time of your next 2 Starfire spells by 0.33 sec. Stores up to 4 charges. Lasts 15 sec.", "Your Wrath spell reduces the cast time of your next 2 Starfire spells by 0.50 sec. Stores up to 4 charges. Lasts 15 sec."] },
        { id: "moonfury", name: "Moonfury", icon: "spell_nature_moonglow", tier: 5, col: 1, max: 5, ranks: ["Increases the damage done by your Arcane and Nature spells by 2%.", "Increases the damage done by your Arcane and Nature spells by 4%.", "Increases the damage done by your Arcane and Nature spells by 6%.", "Increases the damage done by your Arcane and Nature spells by 8%.", "Increases the damage done by your Arcane and Nature spells by 10%."] },
        { id: "moonkin_form", name: "Moonkin Form", icon: "spell_nature_forceofnature", tier: 6, col: 1, max: 1, active: true, ranks: ["Shapeshift into Moonkin Form, increasing Omen of Clarity's chance to trigger by 100%, Armor contribution from items by 360%, and all party or raid members within 45 yards have their Critical Strike chance increased by 3%. Also protects the caster from Polymorph effects and prevents the use of healing spells.\n\nThe act of shapeshifting frees the caster of Polymorph and Movement Impairing effects."] }
      ]
    },
    {
      id: "feral_combat",
      name: "Feral Combat",
      icon: "ability_racial_bearform",
      talents: [
        { id: "ferocity", name: "Ferocity", icon: "ability_hunter_pet_hyena", tier: 0, col: 1, max: 5, ranks: ["Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities by 1 Rage or Energy.", "Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities by 2 Rage or Energy.", "Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities by 3 Rage or Energy.", "Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities by 4 Rage or Energy.", "Reduces the cost of your Maul, Primal Bite, Swipe, Claw, and Rake abilities by 5 Rage or Energy."] },
        { id: "furor", name: "Furor", icon: "spell_holy_blessingofstamina", tier: 0, col: 2, max: 5, ranks: ["Gives you a 20% chance to gain 10 Rage when shapeshifting into Bear Form or Dire Bear Form. Shapeshifting into Cat Form restores 20% of the Energy you had when last in Cat Form, plus 2 Energy per second spent outside Bear Form or Dire Bear Form, up to 20 Energy.", "Gives you a 40% chance to gain 10 Rage when shapeshifting into Bear Form or Dire Bear Form. Shapeshifting into Cat Form restores 40% of the Energy you had when last in Cat Form, plus 4 Energy per second spent outside Bear Form or Dire Bear Form, up to 40 Energy.", "Gives you a 60% chance to gain 10 Rage when shapeshifting into Bear Form or Dire Bear Form. Shapeshifting into Cat Form restores 60% of the Energy you had when last in Cat Form, plus 6 Energy per second spent outside Bear Form or Dire Bear Form, up to 60 Energy.", "Gives you a 80% chance to gain 10 Rage when shapeshifting into Bear Form or Dire Bear Form. Shapeshifting into Cat Form restores 80% of the Energy you had when last in Cat Form, plus 8 Energy per second spent outside Bear Form or Dire Bear Form, up to 80 Energy.", "Gives you a 100% chance to gain 10 Rage when shapeshifting into Bear Form or Dire Bear Form. Shapeshifting into Cat Form restores 100% of the Energy you had when last in Cat Form, plus 10 Energy per second spent outside Bear Form or Dire Bear Form, up to 100 Energy."] },
        { id: "feral_swiftness", name: "Feral Swiftness", icon: "spell_nature_spiritwolf", tier: 1, col: 0, max: 2, ranks: ["Increases your movement speed while in Cat Form by 15%, and increases your chance to Dodge by 2%.", "Increases your movement speed while in Cat Form by 30%, and increases your chance to Dodge by 4%."] },
        { id: "feral_instinct", name: "Feral Instinct", icon: "ability_ambush", tier: 1, col: 1, max: 3, ranks: ["Increases damage done by your Swipe ability by 10% and reduces the chance enemies have to detect you while Prowling as if you were 1 level higher.", "Increases damage done by your Swipe ability by 20% and reduces the chance enemies have to detect you while Prowling as if you were 2 levels higher.", "Increases damage done by your Swipe ability by 30% and reduces the chance enemies have to detect you while Prowling as if you were 3 levels higher."] },
        { id: "brutal_impact", name: "Brutal Impact", icon: "ability_druid_bash", tier: 1, col: 2, max: 2, ranks: ["Increases the stun duration of your Bash and Pounce abilities by 0.5 sec and reduces the cooldown of Bash by 15 sec.", "Increases the stun duration of your Bash and Pounce abilities by 1 sec and reduces the cooldown of Bash by 30 sec."] },
        { id: "thick_hide", name: "Thick Hide", icon: "inv_misc_pelt_bear_03", tier: 1, col: 3, max: 3, ranks: ["While in Bear Form, Cat Form, Dire Bear Form, or Moonkin Form, you gain 178 additional base Armor per level and another 0.67 base Armor for each point of defense skill beyond five times your level. This amount can be further increased by multipliers from those forms.", "While in Bear Form, Cat Form, Dire Bear Form, or Moonkin Form, you gain 179 additional base Armor per level and another 1.33 base Armor for each point of defense skill beyond five times your level. This amount can be further increased by multipliers from those forms.", "While in Bear Form, Cat Form, Dire Bear Form, or Moonkin Form, you gain 180 additional base Armor per level and another 2.00 base Armor for each point of defense skill beyond five times your level. This amount can be further increased by multipliers from those forms."] },
        { id: "shredding_attacks", name: "Shredding Attacks", icon: "spell_shadow_vampiricaura", tier: 2, col: 0, max: 3, ranks: ["Reduces the Energy cost of your Shred ability by 6 and reduces the Rage cost of your Lacerate ability by 1.", "Reduces the Energy cost of your Shred ability by 12 and reduces the Rage cost of your Lacerate ability by 2.", "Reduces the Energy cost of your Shred ability by 18 and reduces the Rage cost of your Lacerate ability by 3."] },
        { id: "savage_fury", name: "Savage Fury", icon: "ability_druid_ravage", tier: 2, col: 1, max: 2, ranks: ["Increases the damage caused by your Claw, Rake, Shred, Maul, and Swipe abilities by 5%.", "Increases the damage caused by your Claw, Rake, Shred, Maul, and Swipe abilities by 10%."] },
        { id: "feral_charge", name: "Feral Charge", icon: "ability_hunter_pet_bear", tier: 2, col: 2, max: 1, active: true, ranks: ["Requires Bear Form, Dire Bear Form\nCharge an enemy, immobilizing them and interrupting any spell they are casting for 4 sec.\n\nLeap behind an enemy."] },
        { id: "sharpened_claws", name: "Sharpened Claws", icon: "inv_misc_monsterclaw_04", tier: 2, col: 3, max: 2, ranks: ["Increases your critical strike chance while in Bear Form, Dire Bear Form, or Cat Form by 3%.", "Increases your critical strike chance while in Bear Form, Dire Bear Form, or Cat Form by 6%."] },
        { id: "predatory_strikes", name: "Predatory Strikes", icon: "ability_hunter_pet_cat", tier: 3, col: 0, max: 3, ranks: ["Increases your melee Attack Power in Cat Form, Bear Form, and Dire Bear Form by 50% of your level.", "Increases your melee Attack Power in Cat Form, Bear Form, and Dire Bear Form by 100% of your level.", "Increases your melee Attack Power in Cat Form, Bear Form, and Dire Bear Form by 150% of your level."] },
        { id: "lacerate", name: "Lacerate", icon: "ability_druid_lacerate", tier: 3, col: 1, max: 1, req: "savage_fury", active: true, ranks: ["Lacerates the enemy target, making them bleed for 20 damage over 15 sec plus 10% weapon damage per existing application of Lacerate on the target. Causes a high amount of threat. This effect stacks up to 5 times on the same target."] },
        { id: "predatory_discipline", name: "Predatory Discipline", icon: "spell_druid_savagery", tier: 3, col: 2, max: 1, ranks: ["Your Ferocious Bite ability no longer converts extra Energy into damage, but still deals extra damage based on your excess Energy."] },
        { id: "blood_frenzy", name: "Blood Frenzy", icon: "ability_ghoulfrenzy", tier: 3, col: 3, max: 2, req: "sharpened_claws", ranks: ["Gives you a 50% chance to gain an additional 5 Rage any time you get a critical strike while in Bear Form or Dire Bear Form. In addition, your non-periodic critical strikes from Cat Form abilities that generate Combo Points have a 50% chance to add an additional Combo Point.", "Gives you a 100% chance to gain an additional 5 Rage any time you get a critical strike while in Bear Form or Dire Bear Form. In addition, your non-periodic critical strikes from Cat Form abilities that generate Combo Points have a 100% chance to add an additional Combo Point."] },
        { id: "leader_of_the_pack", name: "Leader of the Pack", icon: "spell_nature_unyeildingstamina", tier: 4, col: 1, max: 1, ranks: ["While in Cat Form, Bear Form, or Dire Bear Form, the Leader of the Pack increases the Critical Strike chance of all party or raid members within 45 yards by 3%."] },
        { id: "natural_instinct", name: "Natural Instinct", icon: "ability_druid_predatoryinstincts", tier: 4, col: 3, max: 2, ranks: ["Increases the critical strike damage bonus of your melee abilities by 10% and increases your spell healing by 12% of your Intellect.", "Increases the critical strike damage bonus of your melee abilities by 20% and increases your spell healing by 25% of your Intellect."] },
        { id: "rend_and_tear", name: "Rend and Tear", icon: "ability_druid_primalagression", tier: 5, col: 0, max: 5, req: "predatory_strikes", ranks: ["Increases damage done by your melee abilities on Bleeding targets by 3%.", "Increases damage done by your melee abilities on Bleeding targets by 6%.", "Increases damage done by your melee abilities on Bleeding targets by 9%.", "Increases damage done by your melee abilities on Bleeding targets by 12%.", "Increases damage done by your melee abilities on Bleeding targets by 15%."] },
        { id: "natural_reaction", name: "Natural Reaction", icon: "ability_bullrush", tier: 5, col: 3, max: 5, ranks: ["Increases your dodge chance by 1%, and gives you a 20% chance to gain 5 Rage each time you dodge.", "Increases your dodge chance by 2%, and gives you a 40% chance to gain 5 Rage each time you dodge.", "Increases your dodge chance by 3%, and gives you a 60% chance to gain 5 Rage each time you dodge.", "Increases your dodge chance by 4%, and gives you a 80% chance to gain 5 Rage each time you dodge.", "Increases your dodge chance by 5%, and gives you a 100% chance to gain 5 Rage each time you dodge."] },
        { id: "primal_bite", name: "Primal Bite", icon: "ability_racial_cannibalize", tier: 6, col: 1, max: 1, req: "leader_of_the_pack", active: true, ranks: ["Bite the target, dealing 100% normal damage plus 42 and generating a high amount of threat."] },
        { id: "shifting_power", name: "Shifting Power", icon: "spell_druid_displacement", tier: 6, col: 2, max: 1, req: "predatory_discipline", active: true, ranks: ["Instantly convert 55% of base Mana into 40 Energy. Shifting Power's cost is reduced by effects that reduce the cost of Shapeshifting."] }
      ]
    },
    {
      id: "restoration",
      name: "Restoration",
      icon: "spell_nature_healingtouch",
      talents: [
        { id: "natures_focus", name: "Nature's Focus", icon: "spell_nature_healingwavegreater", tier: 0, col: 1, max: 5, ranks: ["Gives your Arcane and Nature spells a 14% chance to not lose casting time when you take damage.", "Gives your Arcane and Nature spells a 28% chance to not lose casting time when you take damage.", "Gives your Arcane and Nature spells a 42% chance to not lose casting time when you take damage.", "Gives your Arcane and Nature spells a 56% chance to not lose casting time when you take damage.", "Gives your Arcane and Nature spells a 70% chance to not lose casting time when you take damage."] },
        { id: "heart_of_the_wild", name: "Heart of the Wild", icon: "spell_holy_blessingofagility", tier: 0, col: 2, max: 5, ranks: ["Increases your Intellect by 2%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 4% and while in Cat Form your Strength is increased by 2%.", "Increases your Intellect by 4%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 8% and while in Cat Form your Strength is increased by 4%.", "Increases your Intellect by 6%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 12% and while in Cat Form your Strength is increased by 6%.", "Increases your Intellect by 8%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 16% and while in Cat Form your Strength is increased by 8%.", "Increases your Intellect by 10%. In addition, while in Bear Form or Dire Bear Form your Stamina is increased by 20% and while in Cat Form your Strength is increased by 10%."] },
        { id: "naturalist", name: "Naturalist", icon: "spell_nature_healingtouch", tier: 1, col: 0, max: 5, ranks: ["Reduces the cast time of your Healing Touch and Wild Growth spells by 0.1 sec and increases all damage you deal by 2%.", "Reduces the cast time of your Healing Touch and Wild Growth spells by 0.2 sec and increases all damage you deal by 4%.", "Reduces the cast time of your Healing Touch and Wild Growth spells by 0.3 sec and increases all damage you deal by 6%.", "Reduces the cast time of your Healing Touch and Wild Growth spells by 0.4 sec and increases all damage you deal by 8%.", "Reduces the cast time of your Healing Touch and Wild Growth spells by 0.5 sec and increases all damage you deal by 10%."] },
        { id: "reflection", name: "Reflection", icon: "spell_frost_windwalkon", tier: 1, col: 1, max: 3, ranks: ["Allows 17% of your Mana regeneration to continue while casting.", "Allows 33% of your Mana regeneration to continue while casting.", "Allows 50% of your Mana regeneration to continue while casting."] },
        { id: "natural_shapeshifter", name: "Natural Shapeshifter", icon: "spell_nature_wispsplode", tier: 1, col: 2, max: 3, ranks: ["Reduces the mana cost of all shapeshifting by 10%.", "Reduces the mana cost of all shapeshifting by 20%.", "Reduces the mana cost of all shapeshifting by 30%."] },
        { id: "subtlety", name: "Subtlety", icon: "ability_eyeoftheowl", tier: 2, col: 1, max: 3, ranks: ["Reduces the threat generated by your Nature and Arcane spells by 10%.", "Reduces the threat generated by your Nature and Arcane spells by 20%.", "Reduces the threat generated by your Nature and Arcane spells by 30%."] },
        { id: "gift_of_nature", name: "Gift of Nature", icon: "spell_nature_protectionformnature", tier: 2, col: 2, max: 5, ranks: ["Increases the effect of all your healing spells by 2%.", "Increases the effect of all your healing spells by 4%.", "Increases the effect of all your healing spells by 6%.", "Increases the effect of all your healing spells by 8%.", "Increases the effect of all your healing spells by 10%."] },
        { id: "bloom", name: "Bloom", icon: "inv_misc_herb_felblossom", tier: 2, col: 3, max: 1, ranks: ["When your Rejuvenation or Regrowth spell expires due to its duration, the target is instantly healed for an amount equal to 100% of your Spirit. If either spell expires due to being dispelled, the target is healed for 50% of your Spirit instead."] },
        { id: "tranquil_spirit", name: "Tranquil Spirit", icon: "spell_holy_elunesgrace", tier: 3, col: 1, max: 5, ranks: ["Reduces the mana cost of your Healing Touch and Tranquility spells by 2%.", "Reduces the mana cost of your Healing Touch and Tranquility spells by 4%.", "Reduces the mana cost of your Healing Touch and Tranquility spells by 6%.", "Reduces the mana cost of your Healing Touch and Tranquility spells by 8%.", "Reduces the mana cost of your Healing Touch and Tranquility spells by 10%."] },
        { id: "improved_rejuvenation", name: "Improved Rejuvenation", icon: "spell_nature_rejuvenation", tier: 3, col: 2, max: 3, ranks: ["Increases the effect of your Rejuvenation spell by 5%.", "Increases the effect of your Rejuvenation spell by 10%.", "Increases the effect of your Rejuvenation spell by 15%."] },
        { id: "swiftmend", name: "Swiftmend", icon: "inv_relics_idolofrejuvenation", tier: 3, col: 3, max: 1, active: true, ranks: ["Instantly heals a target with your active Rejuvenation or Regrowth effect for an amount equal to the full duration of the periodic effect of the consumed spell."] },
        { id: "natures_swiftness", name: "Nature's Swiftness", icon: "spell_nature_ravenform", tier: 4, col: 0, max: 1, req: "naturalist", active: true, ranks: ["When activated, your next Nature spell becomes an instant cast spell."] },
        { id: "living_spirit", name: "Living Spirit", icon: "spell_nature_giftofthewaterspirit", tier: 4, col: 1, max: 3, ranks: ["Increases your Spirit by 5%.", "Increases your Spirit by 10%.", "Increases your Spirit by 15%."] },
        { id: "improved_tranquility", name: "Improved Tranquility", icon: "spell_nature_tranquility", tier: 4, col: 3, max: 2, ranks: ["Reduces threat caused by Tranquility by 50% and its cooldown by 30%.", "Reduces threat caused by Tranquility by 100% and its cooldown by 60%."] },
        { id: "improved_regrowth", name: "Improved Regrowth", icon: "spell_nature_resistnature", tier: 5, col: 2, max: 5, req: "improved_rejuvenation", ranks: ["Increases the critical effect chance of your Regrowth spell by 10%.", "Increases the critical effect chance of your Regrowth spell by 20%.", "Increases the critical effect chance of your Regrowth spell by 30%.", "Increases the critical effect chance of your Regrowth spell by 40%.", "Increases the critical effect chance of your Regrowth spell by 50%."] },
        { id: "wild_growth", name: "Wild Growth", icon: "ability_druid_flourish", tier: 6, col: 1, max: 1, req: "living_spirit", active: true, ranks: ["Heals the target and their party for 336 over 7 sec. Party members must be within 43.5 yards of target. The amount healed is applied quickly at first, and slows down as Wild Growth reaches its full duration."] }
      ]
    }
  ];

  // src/classes/druid/talent-history.js
  var talentHistory7 = [
    {
      // 1.60.1.70707 (October 30): Feral and Restoration reorganized. In the same places of the client's trees, Primal
      // Bite became Lacerate, Berserk became Primal Bite (now the last talent of Feral), Shifting Power became Predatory
      // Discipline and Gift of the Earthmother became Bloom; Improved Shifting Power left (Shifting Power moved to the
      // last row); Furor went to Feral Combat and Heart of the Wild to Restoration.
      until: "1.60.1.70707",
      date: "October 30",
      order: [
        ["improved_wrath", "genesis", "moonglow", "improved_moonfire", "natures_majesty", "natures_reach", "improved_entangling_roots", "natures_splendor", "insect_swarm", "vengeance", "improved_starfire", "overgrowth", "natures_grace", "eclipse", "moonfury", "moonkin_form"],
        ["ferocity", "heart_of_the_wild", "feral_swiftness", "feral_instinct", "brutal_impact", "thick_hide", "shredding_attacks", "savage_fury", "feral_charge", "sharpened_claws", "shifting_power", "primal_bite", "predatory_strikes", "blood_frenzy", "improved_shifting_power", "leader_of_the_pack", "natural_instinct", "natural_reaction", "rend_and_tear", "berserk"],
        ["natures_focus", "furor", "naturalist", "subtlety", "natural_shapeshifter", "reflection", "gift_of_nature", "gift_of_the_earthmother", "tranquil_spirit", "improved_rejuvenation", "swiftmend", "natures_swiftness", "living_spirit", "improved_tranquility", "improved_regrowth", "wild_growth"]
      ],
      renamed: { primal_bite: "lacerate", berserk: "primal_bite", shifting_power: "predatory_discipline", gift_of_the_earthmother: "bloom" },
      removed: { improved_shifting_power: "Improved Shifting Power" },
      names: { primal_bite: "Primal Bite", berserk: "Berserk", shifting_power: "Shifting Power", gift_of_the_earthmother: "Gift of the Earthmother" }
    }
  ];

  // src/classes/druid/spellbook-data.js
  var SPELLBOOK8 = [
    ["Thorns", "spell_nature_thorns", "balance", 320, 30, 0, 0, 0, "Thorns sprout from the friendly target causing 18 Nature damage to attackers when hit. Lasts 10 min."],
    ["Nature's Grasp", "spell_nature_natureswrath", "balance", 125, 0, 0, 60, 0, "The next 1 melee attacks that strike the caster will afflict the attacker with Entangling Roots (Rank 6). Castable while shapeshifted. Lasts 45 sec."],
    ["Hibernate", "spell_nature_sleep", "balance", 150, 30, 1.5, 0, 0, "Forces the enemy target to sleep for up to 40 sec. Any damage will awaken the target. Only one target can be forced to hibernate at a time. Only works on Beasts and Dragonkin."],
    ["Soothe Animal", "ability_hunter_beastsoothe", "balance", 100, 40, 1.5, 0, 0, "Soothes the target beast, reducing the range at which it will attack you by 10 yards. Only affects Beast targets level 70 or lower. Lasts 15 sec."],
    ["Barkskin", "spell_nature_stoneclawtotem", "balance", 0, 0, 0, 60, 0, "Your skin becomes as tough as bark. Physical damage taken is reduced by 20%. While you are protected, damaging attacks will not cause spellcasting delays. Lasts 15 sec."],
    ["Frenzied Regeneration", "ability_bullrush", "feral_combat", 0, 0, 0, 180, 0, "Converts up to 10 Rage per second into health for 10 sec. Each point of Rage is converted into 1% health. Requires Bear Form, Dire Bear Form"],
    ["Demoralizing Roar", "ability_druid_demoralizingroar", "feral_combat", 10, 0, 0, 0, 0, "The druid roars, decreasing nearby enemies' melee attack power by 204. Lasts 30 sec. Requires Bear Form, Dire Bear Form"],
    ["Growl", "ability_physical_taunt", "feral_combat", 0, "m", 0, 8, 0, "Taunts the target to attack you, but has no effect if the target is already attacking you. Requires Bear Form, Dire Bear Form"],
    ["Bash", "ability_druid_bash", "feral_combat", 10, "m", 0, 60, 0, "Stuns the target for 4 sec. Requires Bear Form, Dire Bear Form"],
    ["Dash", "ability_druid_dash", "feral_combat", 0, 0, 0, 300, 0, "Increases movement speed by 60% for 15 sec. Does not break prowling. Requires Cat Form"],
    ["Challenging Roar", "ability_druid_challangingroar", "feral_combat", 15, 0, 0, 600, 0, "Forces all nearby enemies to focus attacks on you for 6 sec. Requires Bear Form, Dire Bear Form"],
    ["Cower", "ability_druid_cower", "feral_combat", 20, "m", 0, 10, 0, "Cower, causing no damage but lowering your threat a large amount, making the enemy less likely to attack you. Requires Cat Form"],
    ["Healing Touch", "spell_nature_healingtouch", "restoration", 840, 40, 3.5, 0, 0, "Heals a friendly target for 2139 to 2525."],
    ["Mark of the Wild", "spell_nature_regeneration", "restoration", 445, 30, 0, 0, 0, "Increases the friendly target's armor by 385, all attributes by 16 and all resistances by 27 for 1 hr."],
    ["Rejuvenation", "spell_nature_rejuvenation", "restoration", 360, 40, 0, 0, 0, "Heals the target for 776 over 12 sec."],
    ["Regrowth", "spell_nature_resistnature", "restoration", 525, 40, 2, 0, 0, "Heals a friendly target for 965 to 1077 and another 994 over 21 sec."],
    ["Cure Poison", "spell_nature_nullifypoison", "restoration", "b16", 30, 0, 0, 0, "Cures 1 poison effects on the target."],
    ["Remove Curse", "spell_holy_removecurse", "restoration", "b10", 30, 0, 0, 0, "Dispels 1 Curse or Bane from a friendly target."],
    ["Abolish Poison", "spell_nature_nullifypoison_02", "restoration", "b16", 30, 0, 0, 0, "Attempts to cure 1 poison effect on the target, and 1 more poison effect every 2 seconds for 8 sec."],
    ["Tranquility", "spell_nature_tranquility", "restoration", 925, 0, "ch", 300, 0, "Regenerates all nearby party members within 20 yards for 285 every 2 sec for 10 sec. Druid must channel to maintain the spell."],
    ["Wild Growth", "ability_druid_flourish", "restoration", 1050, 40, 3, 6, 1, "Heals the target and their party for 679 over 7 sec. Party members must be within 43.5 yds of target. The amount healed is applied quickly at first, and slows down as Wild Growth reaches its full duration."],
    ["Gift of the Wild", "spell_nature_regeneration", "restoration", 1200, 40, 0, 0, 0, "Gives the Gift of the Wild to all party and raid members, increasing armor by 385, all attributes by 16 and all resistances by 27 for 1 hr."],
    ["Swiftmend", "inv_relics_idolofrejuvenation", "restoration", "b20", 40, 0, 15, 1, "Instantly heals a target with your active Rejuvenation or Regrowth effect for an amount equal to the full duration of the periodic effect of the consumed spell."]
  ];

  // src/classes/druid/abilities.js
  var spell4 = (schools, extra10) => ({ schools, harmful: true, target: "enemy", range: 30, requires: { formNot: ["cat", "bear"] }, ...extra10 });
  var nature = ["nature"];
  var arcane = ["arcane"];
  var basePct5 = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var cat = { range: "melee", target: "enemy", harmful: true, schools: ["physical"], requires: { form: ["cat"] } };
  var bear = { range: "melee", target: "enemy", harmful: true, schools: ["physical"], requires: { form: ["bear"] } };
  var builder2 = (n) => ({ type: "addCombo", n });
  var cp = (ctx) => Math.max(1, Math.min(5, ctx.combo || 1));
  var shift = (id, name, icon2, form, aura2, pct, text, extra10) => ({
    id,
    name,
    icon: icon2,
    tree: "feral_combat",
    schools: ["physical"],
    target: "self",
    cost: basePct5(pct),
    powerType: "mana",
    shapeshift: form,
    tags: ["shapeshift"],
    effects: [{ type: "setForm", aura: aura2 }],
    setsOption: ["form", form],
    text,
    ...extra10
  });
  var abilities8 = [
    /* ---------- Balance ---------- */
    {
      id: "wrath",
      name: "Wrath",
      icon: "spell_nature_abolishmagic",
      tree: "balance",
      ...spell4(nature),
      cost: 120,
      castTime: 2,
      speed: 20,
      effects: [{ type: "damage", min: 92, max: 102, coef: 0.571 }],
      text: "Causes 92 to 102 Nature damage to the target."
    },
    {
      id: "moonfire",
      name: "Moonfire",
      icon: "spell_nature_starfall",
      tree: "balance",
      ...spell4(arcane),
      cost: 375,
      // Nature's Splendor adds 3 sec: one more tick of 60.
      effects: [{ type: "damage", min: 129, max: 150, coef: 0.15, onHit: [{ type: "applyAura", to: "target", aura: "moonfire", dynamic: (g) => {
        const n = 4 + g.rank("natures_splendor");
        return { dot: { ticks: n, base: 60 * n, coef: 0.13 * n } };
      } }] }],
      text: "Burns the enemy for 129 to 150 Arcane damage and then an additional 240 Arcane damage over 12 sec."
    },
    {
      id: "starfire",
      name: "Starfire",
      icon: "spell_arcane_starfire",
      tree: "balance",
      ...spell4(arcane),
      cost: 340,
      castTime: 3.5,
      effects: [{ type: "damage", min: 490, max: 576, coef: 1 }],
      text: "Causes 490 to 576 Arcane damage to the target."
    },
    {
      id: "insect_swarm",
      name: "Insect Swarm",
      icon: "spell_nature_insectswarm",
      tree: "balance",
      ...spell4(nature),
      cost: 160,
      talent: "insect_swarm",
      // Nature's Splendor adds 2 sec: one more tick of 31.
      effects: [{ type: "applyAura", to: "target", aura: "insect_swarm", spellHit: true, dynamic: (g) => {
        const n = 6 + g.rank("natures_splendor");
        return { dot: { ticks: n, base: 31 * n, coef: 0.158 * n } };
      } }],
      text: "The enemy target is swarmed by insects, decreasing their chance to hit with attacks by 2% and causing 186 Nature damage over 12 sec."
    },
    {
      id: "hurricane",
      name: "Hurricane",
      icon: "spell_nature_cyclone",
      tree: "balance",
      ...spell4(nature),
      cost: 1495,
      // Cast on the ground in WoW; here it is centered on your target.
      channel: { duration: 10, ticks: 10, tick: [{ type: "aoeDamage", center: "target", radius: 10, min: 132, max: 132, coef: 0.03, name: "Hurricane" }] },
      text: "Creates a violent storm in the target area causing 132 Nature damage to enemies every 1 sec, and increasing the time between attacks by 20%. Lasts 10 sec. Druid must channel to maintain the spell."
    },
    {
      id: "entangling_roots",
      name: "Entangling Roots",
      icon: "spell_nature_stranglevines",
      tree: "balance",
      ...spell4(nature),
      cost: 125,
      castTime: 1.5,
      effects: [{ type: "applyAura", to: "target", aura: "entangling_roots", spellHit: true }],
      text: "Roots the target in place and causes 234 Nature damage over 27 sec. Damage caused may interrupt the effect. You may only have 1 target Rooted at a time."
    },
    {
      id: "faerie_fire",
      name: "Faerie Fire",
      icon: "spell_nature_faeriefire",
      tree: "balance",
      ...spell4(nature),
      cost: 115,
      effects: [{ type: "applyAura", to: "target", aura: "faerie_fire", spellHit: true }],
      text: "Decrease the armor of the target by 505 for 40 sec. While affected, the target cannot stealth or turn invisible."
    },
    {
      id: "moonkin_form",
      name: "Moonkin Form",
      icon: "spell_nature_forceofnature",
      tree: "balance",
      schools: arcane,
      target: "self",
      cost: basePct5(0.35),
      powerType: "mana",
      shapeshift: "moonkin",
      tags: ["shapeshift"],
      talent: "moonkin_form",
      setsOption: ["form", "moonkin"],
      effects: [{ type: "setForm", aura: "moonkin_form" }],
      text: "Shapeshift into Moonkin Form, increasing Omen of Clarity's chance to trigger by 100%, Armor contribution from items by 360%, and all party or raid members within 45 yards have their Critical Strike chance increased by 3%. Also protects the caster from Polymorph effects and prevents the use of healing spells."
    },
    /* ---------- Feral Combat: forms ---------- */
    shift(
      "cat_form",
      "Cat Form",
      "ability_druid_catform",
      "cat",
      "cat_form",
      0.55,
      "Shapeshift into Cat Form, increasing Attack Power by 12 plus Agility. Also protects the caster from Polymorph effects and allows the use of various cat abilities. Press it again to return to caster form."
    ),
    shift(
      "dire_bear_form",
      "Dire Bear Form",
      "ability_racial_bearform",
      "bear",
      "dire_bear_form",
      0.55,
      "Shapeshift into Dire Bear Form, increasing Attack Power by 180, Armor contribution from items by 360%, and Health by 1240. Also protects the caster from Polymorph effects and allows the use of various bear abilities. Press it again to return to caster form."
    ),
    /* ---------- Feral Combat: Cat Form ---------- */
    {
      id: "prowl",
      name: "Prowl",
      icon: "ability_ambush",
      tree: "feral_combat",
      schools: ["physical"],
      target: "self",
      cooldown: 10,
      gcd: false,
      requires: { form: ["cat"], notInCombat: true },
      cancelsAura: "prowl",
      // pressing it again leaves Prowl
      usable: (g) => findAura(g.player, "prowl") ? "You are already prowling" : null,
      effects: [{ type: "applyAura", to: "self", aura: "prowl" }],
      text: "Allows the Druid to prowl around, but reduces your movement speed by 30%. Lasts until cancelled."
    },
    {
      id: "claw",
      name: "Claw",
      icon: "ability_druid_rake",
      tree: "feral_combat",
      ...cat,
      cost: 45,
      builder: true,
      weaponStrike: true,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1.4, flat: 115, onHit: [builder2(1)] }],
      text: "Claw the enemy for 140% normal damage plus 115. Awards 1 combo points."
    },
    {
      id: "shred",
      name: "Shred",
      icon: "spell_shadow_vampiricaura",
      tree: "feral_combat",
      ...cat,
      cost: 60,
      builder: true,
      weaponStrike: true,
      requires: { form: ["cat"], behind: true },
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 2, flat: 80, onHit: [builder2(1)] }],
      text: "Shred the target, causing 200% damage plus 80 to the target. Must be behind the target. Awards 1 combo points."
    },
    {
      id: "rake",
      name: "Rake",
      icon: "ability_druid_disembowel",
      tree: "feral_combat",
      ...cat,
      cost: 40,
      builder: true,
      effects: [{ type: "meleeDamage", min: 76, max: 76, name: "Rake", onHit: [{ type: "applyAura", to: "target", aura: "rake" }, builder2(1)] }],
      text: "Rake the target for 76 damage and an additional 126 damage over 9 sec. Awards 1 combo points."
    },
    {
      id: "rip",
      name: "Rip",
      icon: "ability_ghoulfrenzy",
      tree: "feral_combat",
      ...cat,
      cost: 30,
      finisher: true,
      // 113.5 + 191.5 per combo point over 6 ticks (launch client: 305 to 1071); attack power: 7.5% per combo point up to
      // 30% (ESTIMATE: the Classic share, 25% higher as the launch notes say).
      effects: [{ type: "meleeDamage", noDamage: true, name: "Rip", onHit: [{ type: "applyAura", to: "target", aura: "rip", dynamic: (g, ctx) => ({ dot: { ticks: 6, base: 113.5 + 191.5 * cp(ctx), apCoef: 1.25 * 0.06 * Math.min(4, cp(ctx)) } }) }] }],
      text: "Finishing move that causes damage over time. Damage increases per combo point and by your Attack Power:\n1 point: 305 damage over 12 sec\n2 points: 497 damage over 12 sec\n3 points: 688 damage over 12 sec\n4 points: 880 damage over 12 sec\n5 points: 1071 damage over 12 sec"
    },
    {
      id: "ferocious_bite",
      name: "Ferocious Bite",
      icon: "ability_druid_ferociousbite",
      tree: "feral_combat",
      ...cat,
      cost: 35,
      finisher: true,
      // Every point of Energy left after the cost adds 3.3 damage and is used up (kept with Predatory Discipline).
      // Attack power: 3.75% per combo point (ESTIMATE: the Classic share, 25% higher as the launch notes say).
      effects: [
        { type: "custom", run: (g) => {
          const s = g.player.res.energy;
          g.player.biteEnergy = s.power;
          if (!g.rank("predatory_discipline")) s.power = 0;
        } },
        { type: "meleeDamage", name: "Ferocious Bite", dynamic: (g, ctx) => {
          const x = 3.3 * (g.player.biteEnergy || 0);
          return { min: 64 + 181 * cp(ctx) + x, max: 140 + 181 * cp(ctx) + x, apCoef: 1.25 * 0.03 * cp(ctx) };
        } }
      ],
      text: "Finishing move that causes damage per combo point and converts each extra point of energy into 3.3 additional damage. Damage is increased by your Attack Power.\n1 point: 245-321 damage\n2 points: 426-502 damage\n3 points: 607-683 damage\n4 points: 788-864 damage\n5 points: 969-1045 damage"
    },
    {
      id: "ravage",
      name: "Ravage",
      icon: "ability_druid_ravage",
      tree: "feral_combat",
      ...cat,
      cost: 60,
      builder: true,
      weaponStrike: true,
      opener: true,
      requires: { form: ["cat"], stealth: true, behind: true },
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 4.35, flat: 98, onHit: [builder2(1)] }],
      // plus 98: the corrected tooltip (the 343 shown before was never dealt)
      text: "Ravage the target, causing 435% damage plus 98 to the target. Must be prowling and behind the target. Awards 1 combo points."
    },
    {
      id: "pounce",
      name: "Pounce",
      icon: "ability_druid_supriseattack",
      tree: "feral_combat",
      ...cat,
      cost: 50,
      builder: true,
      opener: true,
      requires: { form: ["cat"], stealth: true, behind: true },
      effects: [{ type: "meleeDamage", noDamage: true, name: "Pounce", onHit: [{ type: "applyAura", to: "target", aura: "pounce_stun" }, { type: "applyAura", to: "target", aura: "pounce" }, builder2(1)] }],
      text: "Pounce, stunning the target for 2 sec and causing 186 damage over 18 sec. Must be prowling and behind the target. Awards 1 combo points."
    },
    {
      id: "shifting_power",
      name: "Shifting Power",
      icon: "spell_druid_displacement",
      tree: "feral_combat",
      schools: ["physical"],
      target: "self",
      cost: basePct5(0.55),
      powerType: "mana",
      cooldown: 8,
      talent: "shifting_power",
      requires: { form: ["cat"] },
      tags: ["shapeshift"],
      effects: [{ type: "restorePower", resource: "energy", min: 40, max: 40 }],
      text: "Instantly convert 55% of base Mana into 40 Energy. Shifting Power's cost is reduced by effects that reduce the cost of Shapeshifting."
    },
    /* ---------- Feral Combat: Dire Bear Form ---------- */
    {
      id: "maul",
      name: "Maul",
      icon: "ability_druid_maul",
      tree: "feral_combat",
      ...bear,
      cost: 15,
      nextSwing: true,
      gcd: false,
      weaponStrike: true,
      threatMult: 1.75,
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 128, name: "Maul" }],
      text: "Increases the druid's next attack by 128 damage."
    },
    {
      id: "swipe",
      name: "Swipe",
      icon: "inv_misc_monsterclaw_03",
      tree: "feral_combat",
      ...bear,
      cost: 20,
      threatMult: 1.75,
      effects: [{ type: "aoeMelee", center: "self", radius: 5, maxTargets: 3, min: 83, max: 83, name: "Swipe" }],
      text: "Swipe 3 nearby enemies, inflicting 83 damage."
    },
    {
      id: "lacerate",
      name: "Lacerate",
      icon: "ability_druid_lacerate",
      tree: "feral_combat",
      ...bear,
      cost: 15,
      threat: 285,
      dotThreatMult: 0.5,
      talent: "lacerate",
      // ESTIMATE: TBC values
      // A hit of 10% weapon damage per application already on the target (none on the first), then one more application.
      effects: [{
        type: "weaponDamage",
        hand: "main",
        name: "Lacerate",
        dynamic: (g, ctx) => {
          const a = findAura(ctx.target, "lacerate", g.player), n = a ? a.stacks : 0;
          return n ? { weaponPct: 0.1 * n } : { noDamage: true };
        },
        onHit: [{ type: "applyAura", to: "target", aura: "lacerate" }]
      }],
      text: "Lacerates the enemy target, making them bleed for 75 damage over 15 sec plus 10% weapon damage per existing application of Lacerate on the target. Causes a high amount of threat. This effect stacks up to 5 times on the same target."
    },
    {
      id: "primal_bite",
      name: "Primal Bite",
      icon: "ability_racial_cannibalize",
      tree: "feral_combat",
      ...bear,
      cost: 20,
      cooldown: 6,
      weaponStrike: true,
      talent: "primal_bite",
      threat: 200,
      // ESTIMATE: "a high amount of threat"
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, flat: 77 }],
      text: "Bite the target, dealing 100% normal damage plus 77 and generating a high amount of threat."
    },
    {
      id: "enrage",
      name: "Enrage",
      icon: "ability_druid_enrage",
      tree: "feral_combat",
      schools: ["physical"],
      target: "self",
      cooldown: 60,
      gcd: false,
      requires: { form: ["bear"] },
      effects: [{ type: "restorePower", resource: "rage", min: 10, max: 10 }, { type: "applyAura", to: "self", aura: "enrage" }],
      text: "Instantly generates 10 Rage and another 20 Rage over 10 sec, but reduces base armor by 27% in Bear Form and 16% in Dire Bear Form. The druid is considered in combat for the duration."
    },
    /* ---------- Feral Combat: both forms ---------- */
    {
      id: "feral_charge",
      name: "Feral Charge",
      icon: "ability_hunter_pet_bear",
      tree: "feral_combat",
      schools: ["physical"],
      harmful: true,
      target: "enemy",
      range: 25,
      minRange: 8,
      cost: 5,
      cooldown: 15,
      talent: "feral_charge",
      requires: { form: ["cat", "bear"] },
      effects: [
        { type: "dashTo", when: (g) => g.form() === "bear" },
        { type: "custom", when: (g) => g.form() === "cat", run: (g, ctx) => leapBehind(g, ctx) }
      ],
      text: "Bear: charge an enemy, immobilizing them and interrupting any spell they are casting for 4 sec. Cat: leap behind an enemy."
    },
    /* ---------- Restoration ---------- */
    {
      id: "innervate",
      name: "Innervate",
      icon: "spell_nature_lightning",
      tree: "restoration",
      schools: nature,
      target: "self",
      cost: basePct5(0.05),
      powerType: "mana",
      cooldown: 360,
      requires: { formNot: ["cat", "bear"] },
      effects: [{ type: "applyAura", to: "self", aura: "innervate" }],
      text: "Increases the target's Mana regeneration by 400% and allows 100% of the target's Mana regeneration to continue while casting. Lasts 20 sec."
    },
    {
      id: "natures_swiftness",
      name: "Nature's Swiftness",
      icon: "spell_nature_ravenform",
      tree: "restoration",
      schools: nature,
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "natures_swiftness",
      requires: { formNot: ["cat", "bear"] },
      effects: [{ type: "applyAura", to: "self", aura: "natures_swiftness" }],
      text: "When activated, your next Nature spell becomes an instant cast spell."
    }
  ];
  function leapBehind(game, ctx) {
    const u = ctx.caster, t = ctx.target;
    if (!t) return;
    const from = { x: u.x, y: u.y }, back = (t.facing || 0) + Math.PI, d = t.radius + u.radius + 1;
    u.x = t.x + Math.cos(back) * d;
    u.y = t.y + Math.sin(back) * d;
    game.clampToArena(u);
    game.emit("fx", { kind: "blink", from, to: { x: u.x, y: u.y } });
  }

  // src/classes/druid/spellbook.js
  var CASTER = { formNot: ["cat", "bear", "moonkin"] };
  var heal3 = (extra10) => ({ notSimulated: false, schools: ["nature"], target: "ally", range: 40, harmful: false, tags: ["heal"], requires: CASTER, ...extra10 });
  var friend = (g) => g.player.friend && !g.player.friend.dead ? g.player.friend : g.player;
  var extra8 = spellbookAbilities(SPELLBOOK8, {
    known: new Set(abilities8.map((a) => a.name)),
    talents: new Set(trees8.flatMap((t) => t.talents.map((x) => x.id))),
    forms: { "Bear Form": "bear", "Dire Bear Form": "bear", "Cat Form": "cat" },
    overrides: {
      mark_of_the_wild: { notSimulated: false },
      thorns: { notSimulated: false },
      gift_of_the_wild: { notSimulated: false, effects: [{ type: "applyAura", to: "self", aura: "mark_of_the_wild" }] },
      dash: { notSimulated: false },
      remove_curse: cure(["curse"]),
      cure_poison: cure(["poison"]),
      abolish_poison: cure(["poison"], 1, "abolish_poison"),
      healing_touch: heal3({ effects: [{ type: "heal", min: 2139, max: 2525, coef: 1 }] }),
      rejuvenation: heal3({ effects: [{ type: "hot", aura: "rejuvenation", base: 194, coef: 0.2 }] }),
      regrowth: heal3({ effects: [{ type: "heal", min: 965, max: 1077, coef: 0.286 }, { type: "hot", aura: "regrowth", base: 142, coef: 0.071 }] }),
      wild_growth: heal3({ effects: [{ type: "party", radius: 43.5, effects: [{ type: "hot", aura: "wild_growth", base: 97, coef: 0.033 }] }] }),
      swiftmend: heal3({
        usable: (g) => {
          const t = friend(g);
          return findAura(t, "rejuvenation", g.player) || findAura(t, "regrowth", g.player) ? null : "Requires a Rejuvenation or Regrowth on the target";
        },
        effects: [{ type: "custom", run: (g, ctx) => {
          const hot = findAura(ctx.target, "rejuvenation", g.player) || findAura(ctx.target, "regrowth", g.player);
          if (!hot) return;
          const n = (hot.data.perTick || 0) * (hot.data.ticks || 1);
          removeAura(g, hot, "consumed");
          healHit(g, { ...ctx, target: ctx.target }, { min: n, max: n, coef: 0, name: "Swiftmend" });
        } }]
      }),
      tranquility: heal3({
        target: "self",
        range: void 0,
        channel: { duration: 10, ticks: 5, tick: [{ type: "party", of: "self", center: "self", radius: 20, effects: [{ type: "heal", min: 285, max: 285, coef: 0.067, name: "Tranquility" }] }] }
      }),
      growl: { notSimulated: false, harmful: true, effects: [{ type: "taunt", duration: 3 }] },
      challenging_roar: { notSimulated: false, harmful: true, effects: [{ type: "taunt", duration: 6, force: true, radius: 10 }] },
      demoralizing_roar: {
        notSimulated: false,
        harmful: true,
        effects: [{ type: "custom", run: (g, ctx) => {
          g.emit("fx", { kind: "nova", x: ctx.caster.x, y: ctx.caster.y, r: 10, schools: ["physical"] });
          for (const e of g.enemies.filter((x) => !x.dead && Math.hypot(x.x - ctx.caster.x, x.y - ctx.caster.y) <= 10 + x.radius)) {
            g.runEffects([{ type: "applyAura", to: "target", aura: "demoralizing_roar" }, { type: "threat", amount: 39 }], { ...ctx, target: e });
          }
        } }]
      },
      frenzied_regeneration: { notSimulated: false, gcd: false, effects: [{ type: "applyAura", to: "self", aura: "frenzied_regeneration", duration: 10 }] },
      barkskin: { notSimulated: false, gcd: false }
    },
    auraOverrides: {
      // Thorns: 18 Nature damage to each attacker that hits you in melee (druid.js), which also makes threat.
      thorns: { notSimulated: false, desc: () => "Causes 18 Nature damage to attackers when hit." },
      // +385 armor and +16 to every attribute (tooltip); the resistances are not simulated (no magic resistance in the lab).
      mark_of_the_wild: { notSimulated: false, mods: () => [{ key: "attributes", fn: (a) => ({ str: a.str + 16, agi: a.agi + 16, sta: a.sta + 16, int: a.int + 16, spi: a.spi + 16 }) }, add("armor", 385)], desc: () => "Armor increased by 385 and all attributes by 16." },
      abolish_poison: cureAura(["poison"], 2),
      regrowth: { notSimulated: false, kind: "buff", hot: true, period: 3, duration: 21, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec.` },
      dash: { notSimulated: false, mods: (a, g) => [mult("runSpeed", g.form() === "cat" ? 1.6 : 1)], desc: () => "Movement speed increased by 60% in Cat Form." },
      demoralizing_roar: { notSimulated: false, kind: "debuff", enemy: { ap: 204 }, desc: () => "Melee attack power reduced by 204." },
      barkskin: { notSimulated: false, mods: () => [mult("damageTaken", 0.8, (ctx) => hasSchool(ctx, "physical"))], desc: () => "Physical damage taken reduced by 20%." },
      // Every sec: up to 10 Rage becomes health, 1% of maximum health per point (Forever). Ends when leaving Bear Form.
      frenzied_regeneration: {
        notSimulated: false,
        period: 1,
        kind: "buff",
        duration: 10,
        onTick: (g) => {
          if (g.form() !== "bear") return;
          const st = g.player.res.rage, n = Math.min(10, Math.floor(st.power));
          if (n <= 0) return;
          st.power -= n;
          g.healPlayer(g.stats().maxHp * 0.01 * n, { name: "Frenzied Regeneration", icon: "ability_bullrush", self: true });
        },
        desc: () => "Converting up to 10 Rage per sec into health (1% of maximum health per point)."
      }
    }
  });
  for (const ab of extra8.abilities) {
    if (!ab.cost || ab.powerType || ab.shapeshift || ab.requires && ab.requires.form) continue;
    ab.powerType = "mana";
    if (/Castable while shapeshifted/i.test(ab.text)) continue;
    const req = ab.requires || (ab.requires = {});
    req.formNot = [.../* @__PURE__ */ new Set([...req.formNot || [], "cat", "bear"])];
  }
  extra8.auras.rejuvenation = { id: "rejuvenation", name: "Rejuvenation", icon: "spell_nature_rejuvenation", kind: "buff", hot: true, period: 3, duration: 12, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec.` };
  extra8.auras.regrowth = extra8.auras.regrowth || { id: "regrowth", name: "Regrowth", icon: "spell_nature_resistnature", kind: "buff", hot: true, period: 3, duration: 21, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec.` };
  extra8.auras.wild_growth = { id: "wild_growth", name: "Wild Growth", icon: "ability_druid_flourish", kind: "buff", hot: true, hotShape: "decay", period: 1, duration: 7, desc: () => "Healing every sec, more at first." };

  // src/classes/druid/auras.js
  var raidHas = (ctx, id) => (ctx.target && ctx.target.raidDebuffs || []).includes(id);
  var bleed = (id, name, icon2, dot, extra10) => ({ id, name, icon: icon2, kind: "debuff", schools: ["physical"], tags: ["bleed"], dot, ...extra10 });
  function enterCat(game) {
    const r = game.rank("furor"), p = game.player, f = p.furor || (p.furor = { energy: 0, left: game.time, bearTime: 0 });
    const outside = Math.max(0, game.time - f.left - f.bearTime);
    p.res.energy.power = r ? Math.min(20 * r, f.energy * 0.2 * r + 2 * r * outside) : 0;
    p.res.energy.tickIn = 2;
  }
  function leaveCat(game) {
    const p = game.player;
    p.furor = { energy: p.res.energy.power, left: game.time, bearTime: 0 };
    const prowl = findAura(p, "prowl");
    if (prowl) removeAura(game, prowl, "cancelled");
  }
  function enterBear(game) {
    const p = game.player, r = game.rank("furor");
    p.res.rage.power = r && game.rng() < 0.2 * r ? 10 : 0;
    p.bearSince = game.time;
  }
  function leaveBear(game) {
    const p = game.player;
    if (p.furor && p.bearSince != null) p.furor.bearTime += game.time - p.bearSince;
    p.bearSince = null;
  }
  var auras8 = {
    /* ---------- forms ---------- */
    cat_form: {
      id: "cat_form",
      name: "Cat Form",
      icon: "ability_druid_catform",
      kind: "buff",
      flags: { form: "cat", resource: "energy" },
      mods: () => [add("attackPower", (ctx, g) => 12 + g.stats().agi), mult("threatMult", 0.71)],
      // read lazily: the sheet itself asks for the mods
      onApply: (g) => enterCat(g),
      onRemove: (g) => leaveCat(g),
      desc: () => "Attack power increased by 12 plus Agility. Uses Energy. 1 sec global cooldown on cat abilities. Threat reduced by 29%."
    },
    dire_bear_form: {
      id: "dire_bear_form",
      name: "Dire Bear Form",
      icon: "ability_racial_bearform",
      kind: "buff",
      flags: { form: "bear", resource: "rage" },
      // Classic: armor from items x 4.6 (+360%). Threat: 115% more (launch notes, for Blessing of Salvation being gone;
      // APPROXIMATION, the client does not say it).
      mods: () => [add("attackPower", 180), mult("itemArmor", 4.6), add("maxHp", 1240), mult("threatMult", 2.15)],
      onApply: (g) => enterBear(g),
      onRemove: (g) => leaveBear(g),
      desc: () => "Attack power increased by 180, armor from items by 360% and health by 1240. Threat increased by 115%. Uses Rage."
    },
    moonkin_form: {
      id: "moonkin_form",
      name: "Moonkin Form",
      icon: "spell_nature_forceofnature",
      kind: "buff",
      flags: { form: "moonkin" },
      mods: () => [add("critChance", 0.03), mult("itemArmor", 4.6)],
      // Moonkin Aura, the Druid included (all critical strikes since 1.60.1.70707); armor from items +360%
      desc: () => "Critical strike chance increased by 3% (Moonkin Aura). Armor from items increased by 360%. Omen of Clarity's chance doubled."
    },
    /* ---------- buffs ---------- */
    prowl: {
      id: "prowl",
      name: "Prowl",
      icon: "ability_ambush",
      kind: "buff",
      duration: Infinity,
      flags: { stealth: true },
      onApply: (g) => g.stopAttack(),
      mods: () => [mult("runSpeed", 0.7)],
      desc: () => "Prowling. Movement speed reduced by 30%. Attacking breaks it."
    },
    clearcasting: {
      id: "clearcasting",
      name: "Clearcasting",
      icon: "spell_shadow_manaburn",
      kind: "buff",
      duration: 15,
      mods: () => [set("cost", 0, (ctx) => clearcastable(ctx))],
      desc: () => "Your next damage spell or offensive ability costs no Mana, Rage or Energy."
    },
    enrage: {
      id: "enrage",
      name: "Enrage",
      icon: "ability_druid_enrage",
      kind: "buff",
      duration: 10,
      period: 1,
      onTick: (g) => g.gainPower("rage", 2),
      // ESTIMATE: "16% of base armor" read as 16% of all armor in Dire Bear Form (the client has no split).
      // "Considered in combat for the duration" (tooltip): no rage decay while it lasts, even before the pull.
      mods: (a, g) => [mult("armor", g.form() === "bear" ? 0.84 : 1), set("forceCombat", true)],
      desc: () => "Gaining 2 Rage every sec. Armor reduced by 16%."
    },
    innervate: {
      id: "innervate",
      name: "Innervate",
      icon: "spell_nature_lightning",
      kind: "buff",
      duration: 20,
      mods: () => [mult("regenMult", 5), set("regenWhileCasting", 1)],
      desc: () => "Mana regeneration increased by 400%, and all of it continues while casting."
    },
    natures_swiftness: {
      id: "natures_swiftness",
      name: "Nature's Swiftness",
      icon: "spell_nature_ravenform",
      kind: "buff",
      duration: Infinity,
      mods: () => [set("castTime", 0, (ctx) => hasSchool(ctx, "nature") && !!ctx.ability && ctx.ability.castTime > 0)],
      desc: () => "Your next Nature spell is instant."
    },
    natures_grace: {
      id: "natures_grace",
      name: "Nature's Grace",
      icon: "spell_nature_naturesblessing",
      kind: "buff",
      duration: 3,
      mods: () => [mult("castTime", 1 / 1.1), mult("gcd", 0.9)],
      desc: () => "Casting speed increased by 10% and global cooldown reduced by 10%."
    },
    eclipse: {
      id: "eclipse",
      name: "Eclipse",
      icon: "ability_druid_eclipse",
      kind: "buff",
      duration: 15,
      maxStacks: 4,
      mods: (a, g) => [add("castTime", -[0.17, 0.33, 0.5][g.rank("eclipse") - 1], (ctx) => isAbility(ctx, "starfire"))],
      desc: (a, g) => `Your next ${a.stacks} Starfire spells cast ${[0.17, 0.33, 0.5][g.rank("eclipse") - 1]} sec faster.`
    },
    /* ---------- on the target ---------- */
    moonfire: { id: "moonfire", name: "Moonfire", icon: "spell_nature_starfall", kind: "debuff", schools: ["arcane"], dot: { period: 3, ticks: 4, base: 240, coef: 0.52 } },
    insect_swarm: { id: "insect_swarm", name: "Insect Swarm", icon: "spell_nature_insectswarm", kind: "debuff", schools: ["nature"], dot: { period: 2, ticks: 6, base: 186, coef: 0.948 } },
    entangling_roots: { id: "entangling_roots", name: "Entangling Roots", icon: "spell_nature_stranglevines", kind: "debuff", schools: ["nature"], dot: { period: 3, ticks: 9, base: 234, coef: 0.54 } },
    faerie_fire: {
      id: "faerie_fire",
      name: "Faerie Fire",
      icon: "spell_nature_faeriefire",
      kind: "debuff",
      duration: 40,
      // Not on top of the raid's own Faerie Fire (Training Dummy with raid debuffs).
      sourceMods: () => [add("targetArmor", -505, (ctx) => !raidHas(ctx, "faerie_fire"))],
      desc: () => "Armor reduced by 505."
    },
    rake: bleed("rake", "Rake", "ability_druid_disembowel", { period: 3, ticks: 3, base: 126 }),
    // launch client
    rip: bleed("rip", "Rip", "ability_ghoulfrenzy", { period: 2, ticks: 6, base: 1071 }),
    pounce: bleed("pounce", "Pounce Bleed", "ability_druid_supriseattack", { period: 3, ticks: 6, base: 186 }),
    // launch client
    lacerate: bleed("lacerate", "Lacerate", "ability_druid_lacerate", { period: 3, ticks: 5, base: 75, amount: (g, a) => (a.data.perTick || 0) * a.stacks }, { maxStacks: 5 }),
    pounce_stun: { id: "pounce_stun", name: "Pounce", icon: "ability_druid_supriseattack", kind: "debuff", flags: { stunned: true }, duration: 2, desc: () => "Stunned." }
  };
  function clearcastable(ctx) {
    const ab = ctx.ability;
    return !!ab && !!ab.harmful && ab.id !== "wrath" && !(ab.tags || []).includes("shapeshift") && (typeof ab.cost === "function" || (ab.cost || 0) > 0);
  }

  // src/classes/druid/presets.js
  var gearRoles4 = { cat: "Cat", bear: "Bear", caster: "Caster", healer: "Healer" };
  var cat2 = (tier, name, blurb, gear) => ({ id: `${tier}_cat`, tier, role: "cat", name, blurb, gear: { sp: 0, heal: 0, mp5: 0, haste: 0, defense: 0, ...gear } });
  var bear2 = (tier, name, blurb, gear) => ({ id: `${tier}_bear`, tier, role: "bear", name, blurb, gear: { sp: 0, heal: 0, mp5: 0, haste: 0, ...gear } });
  var caster2 = (tier, name, blurb, gear) => ({ id: `${tier}_caster`, tier, role: "caster", name, blurb, gear: { str: 0, agi: 0, ap: 0, heal: 0, haste: 0, defense: 0, wdps: 45, ...gear } });
  var healer3 = (tier, name, blurb, gear) => ({ id: `${tier}_healer`, tier, role: "healer", name, blurb, gear: { str: 0, agi: 0, ap: 0, hit: 0, haste: 0, defense: 0, wdps: 45, ...gear } });
  var gearPresets8 = [
    cat2("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { str: 40, agi: 90, sta: 90, int: 30, spi: 20, ap: 60, crit: 0.01, hit: 0.01, armor: 1300, wdps: 40 }),
    cat2("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { str: 38, agi: 226, sta: 98, int: 4, spi: 24, ap: 142, crit: 0.04, hit: 0.079, armor: 1036, wdps: 58 }),
    bear2("fresh", "Fresh 60", "Quest and dungeon leather for tanking.", { str: 50, agi: 100, sta: 160, int: 40, spi: 20, ap: 100, crit: 0.01, hit: 0.01, armor: 1900, defense: 10, wdps: 40 }),
    bear2("preraid", "Pre-raid", "Best dungeon, quest and crafted tank gear before raids.", { str: 111, agi: 153, sta: 225, int: 0, spi: 20, ap: 22, crit: 0, hit: 0.01, dodge: 0.08, armor: 1098, defense: 9, wdps: 58 }),
    caster2("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { int: 100, spi: 60, sta: 80, sp: 120, crit: 0.01, hit: 0.01, mp5: 0, armor: 700 }),
    caster2("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { int: 155, spi: 35, sta: 65, sp: 387, spSchool: { fire: 24, nature: 10 }, crit: 0.01, hit: 0, mp5: 0, armor: 1078 }),
    healer3("fresh", "Fresh 60", "Quest and dungeon greens and blues for healing.", { int: 100, spi: 60, sta: 80, sp: 0, heal: 150, crit: 0.01, mp5: 0, armor: 700 }),
    healer3("preraid", "Pre-raid", "Best dungeon, quest and crafted healing gear before raids.", { int: 105, spi: 90, sta: 91, sp: 29, heal: 708, spSchool: { nature: 24 }, crit: 0, mp5: 5, armor: 1106 })
  ];
  var builds8 = [
    {
      id: "balance",
      name: "Balance",
      points: "41/0/10",
      gearRole: "caster",
      blurb: "Moonkin Form for 3% more spell crit and twice the Omen of Clarity. Keep Insect Swarm and Moonfire up, then Wrath to store Eclipse charges and Starfire to spend them (2.5 sec casts with Improved Starfire). Vengeance doubles the crit bonus and Nature's Grace speeds up the next casts.",
      options: { form: "moonkin" },
      talents: {
        improved_wrath: 5,
        genesis: 5,
        moonglow: 3,
        improved_moonfire: 2,
        natures_majesty: 2,
        natures_reach: 2,
        natures_splendor: 1,
        insect_swarm: 1,
        vengeance: 5,
        improved_starfire: 5,
        natures_grace: 1,
        eclipse: 3,
        moonfury: 5,
        moonkin_form: 1,
        natures_focus: 5,
        naturalist: 5
      },
      bar: ["wrath", "moonfire", "insect_swarm", "starfire", "hurricane", "faerie_fire", "innervate", "major_mana_potion"]
    },
    {
      id: "bear",
      tree: "feral_combat",
      name: "Bear",
      points: "7/39/5",
      gearRole: "bear",
      scenario: "raid-boss",
      blurb: "The tank side of Feral, for the Tank test: Dire Bear Form with Thick Hide, Natural Reaction and Heart of the Wild (now in Restoration). Maul on every swing, Lacerate up to 5, Primal Bite on cooldown and Swipe to fill; Demoralizing Roar on the boss, Frenzied Regeneration and Barkskin for the bad moments, Growl if the raid pulls it away.",
      options: { form: "bear" },
      talents: {
        genesis: 5,
        natures_reach: 2,
        ferocity: 5,
        feral_swiftness: 2,
        feral_instinct: 3,
        thick_hide: 2,
        shredding_attacks: 3,
        savage_fury: 2,
        sharpened_claws: 2,
        lacerate: 1,
        predatory_strikes: 3,
        blood_frenzy: 2,
        leader_of_the_pack: 1,
        natural_instinct: 2,
        natural_reaction: 5,
        rend_and_tear: 5,
        primal_bite: 1,
        heart_of_the_wild: 5
      },
      bar: ["maul", "lacerate", "primal_bite", "swipe", "demoralizing_roar", "growl", "enrage", "frenzied_regeneration", "barkskin", "challenging_roar"]
    },
    {
      id: "cat",
      tree: "feral_combat",
      name: "Cat",
      points: "9/34/8",
      gearRole: "cat",
      blurb: "The damage side of Feral: Cat Form with Shifting Power and Furor for energy. Prowl and Ravage, keep Rake and Rip up, Shred from behind (Shredding Attacks makes it cheap), Ferocious Bite with the rest (Predatory Discipline keeps the extra Energy); Shifting Power turns mana into 40 Energy.",
      options: { form: "cat" },
      talents: {
        genesis: 5,
        natures_majesty: 2,
        natures_reach: 2,
        ferocity: 5,
        furor: 5,
        feral_swiftness: 2,
        shredding_attacks: 3,
        savage_fury: 2,
        sharpened_claws: 2,
        predatory_discipline: 1,
        predatory_strikes: 3,
        blood_frenzy: 2,
        leader_of_the_pack: 1,
        natural_instinct: 2,
        rend_and_tear: 5,
        shifting_power: 1,
        heart_of_the_wild: 5,
        natural_shapeshifter: 3
      },
      bar: ["shred", "rake", "rip", "claw", "ferocious_bite", "shifting_power", "dash", "prowl", "ravage"]
    },
    {
      id: "restoration",
      name: "Restoration",
      points: "11/0/40",
      gearRole: "healer",
      scenario: "raid-healing",
      blurb: "A healer build for the Healing test, in caster form: Rejuvenation and Regrowth on the tank and whoever is hurt (Bloom heals once more when they run out), Swiftmend to cash a heal over time in at once, Wild Growth on a hurt party, Healing Touch for big heals (instant with Nature's Swiftness), Tranquility when the whole raid is low, Innervate for mana. Gift of Nature adds 10% healing.",
      options: { form: "none" },
      talents: {
        genesis: 5,
        improved_moonfire: 1,
        natures_majesty: 2,
        natures_reach: 2,
        natures_splendor: 1,
        natures_focus: 5,
        heart_of_the_wild: 5,
        naturalist: 5,
        reflection: 3,
        gift_of_nature: 5,
        bloom: 1,
        improved_rejuvenation: 3,
        swiftmend: 1,
        natures_swiftness: 1,
        living_spirit: 3,
        improved_tranquility: 2,
        improved_regrowth: 5,
        wild_growth: 1
      },
      bar: ["rejuvenation", "regrowth", "swiftmend", "wild_growth", "healing_touch", "tranquility", "natures_swiftness", "abolish_poison", "remove_curse", "innervate", "major_mana_potion"]
    }
  ];

  // src/classes/druid/druid.js
  var isPlayer7 = (game, ev) => ev.ctx.caster === game.player;
  var inForm = (g, ...forms) => forms.includes(g.form());
  var feral = (g) => inForm(g, "cat", "bear");
  var meleeAbility = (ctx) => !!ctx.melee && !ctx.white;
  var arcaneOrNature = (ctx) => hasSchool(ctx, "arcane") || hasSchool(ctx, "nature");
  var balanceSpell = (ctx) => !!ctx.ability && ctx.ability.tree === "balance" && !!ctx.ability.harmful;
  var damageSpell = (ctx) => !!ctx.ability && !!ctx.ability.harmful && !hasSchool(ctx, "physical");
  var shapeshift = (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("shapeshift");
  var bleeding = (ctx) => !!ctx.target && ctx.target.auras.some((a) => (a.def.tags || []).includes("bleed"));
  var landedRes5 = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var BLOOM = { id: "bloom", name: "Bloom", icon: "inv_misc_herb_felblossom", schools: ["nature"], tags: ["heal"] };
  var PAW_SPEED = { cat: 1, bear: 2.5 };
  var paws = (form, dps2) => {
    const sp = PAW_SPEED[form], avg = (dps2 || 45) * sp;
    return { type: "paws", family: "paws", name: form === "cat" ? "Cat paws" : "Bear paws", speed: sp, min: Math.round(avg * 0.85), max: Math.round(avg * 1.15), twoHand: false, ranged: false, ammo: 0 };
  };
  var OMEN_CHANCE = 0.1;
  var OMEN_COOLDOWN = 10;
  var meleeCrit = (s) => 9e-3 + s.agi / 20 / 100;
  var spellCrit = (s) => 0.018 + s.int / 60 / 100;
  var druid = {
    id: "druid",
    name: "Druid",
    roles: ["dps", "tank", "healer"],
    // the tests it can take (Damage, Tank, Healing)
    icon: "classicon_druid",
    color: "#ff7d0a",
    resource: "mana",
    resources: ["mana", "energy", "rage"],
    gcd: 1.5,
    comboPoints: true,
    source: SOURCE8,
    // Level 60 Night Elf Druid base stats (Classic, approximate). Attack power: Strength x 2 - 20, plus the form's.
    stats: {
      level: 60,
      base: { str: 62, agi: 65, sta: 69, int: 100, spi: 110 },
      baseHp: 1483,
      baseMana: 1244,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1483 + conv(a.sta, 10) - 20,
          maxMana: 1244 + conv(a.int, 15) - 20,
          ap: a.str * 2 - 20,
          crit: 0,
          // added per attack or spell below (mods)
          regen: (15 + a.spi / 5) / 2
          // Druid Spirit regeneration, per second
        };
      }
    },
    // Paws in Cat and Bear Form; no weapon attacks in caster or Moonkin Form.
    weapons(game) {
      const f = game.form();
      return PAW_SPEED[f] ? { main: paws(f, (game.loadout.gear || {}).wdps), off: null } : {};
    },
    // Form bar beside the action bar (press a form again to return to caster form).
    stanceBar: { label: "Forms", abilities: ["dire_bear_form", "cat_form", "moonkin_form"] },
    trees: trees8,
    talentHistory: talentHistory7,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities8, ...extra8.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras8, ...extra8.auras },
    gearPresets: gearPresets8,
    gearRoles: gearRoles4,
    builds: builds8,
    gearFields: [
      { k: "agi", label: "Agility", step: 5, max: 600 },
      { k: "str", label: "Strength", step: 5, max: 400 },
      { k: "sta", label: "Stamina", step: 5, max: 700 },
      { k: "armor", label: "Armor", step: 50, max: 6e3, note: "From items. Dire Bear Form multiplies it by 4.6. Agility adds 2 per point." },
      { k: "defense", label: "Defense skill", step: 1, max: 150, note: "From gear, on top of 300. Against a raid boss (315 attack skill) each point is 0.04% more miss and dodge and 0.04% less crit." },
      { k: "ap", label: "Attack power", step: 10, max: 1200 },
      { k: "wdps", label: "Weapon DPS", step: 1, max: 90, note: "In Cat and Bear Form your attacks deal the DPS of your weapon." },
      { k: "int", label: "Intellect", step: 5, max: 600 },
      { k: "spi", label: "Spirit", step: 5, max: 500 },
      { k: "sp", label: "Spell power", step: 10, max: 1200 },
      { k: "heal", label: "Bonus healing", step: 10, max: 1500, note: "Increases healing done by up to this much and damage done by up to a third of it, for all magical spells and effects." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "mp5", label: "Mana per 5 sec", step: 1, max: 60 },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." }
    ],
    sheet(game, f) {
      const s = game.stats(), form = game.form();
      const ap = attackPower(game, { caster: game.player });
      return [
        ["Form", form ? game.formName(form) : "Caster form"],
        ["Agility", f.int(s.agi)],
        ["Strength", f.int(s.str)],
        ["Intellect", f.int(s.int)],
        ["Mana", f.int(s.maxMana)],
        ["Attack power", f.int(ap)],
        ["Spell power", f.int(s.sp)],
        ...s.healExtra ? [["Healing power", f.int(s.sp + s.healExtra)]] : [],
        ["Attack crit", f.pct(meleeCrit(s) + s.crit)],
        ["Spell crit", f.pct(spellCrit(s) + s.crit)],
        ["Hit chance", f.pct(s.hit)]
      ];
    },
    // A Druid starting the fight has been out of Cat Form for long (Furor fills up to its cap).
    options: {
      // The form at the start of a fight: the build's, or the last one taken from the form bar (hidden from the gear panel).
      form: { label: "Form", hidden: true, values: ["none", "bear", "cat", "moonkin"] }
    },
    onReset(game) {
      game.player.furor = { energy: 100, left: -999, bearTime: 0 };
    },
    // Mark of the Wild, and the spec's form: the one taken last from the form bar or chosen by the build, else Moonkin for
    // Balance, caster form for Restoration, and for Feral the form its action bar uses most (Bear abilities or Cat
    // abilities), then its talents (Thick Hide and Natural Reaction mean Bear), then the test (Dire Bear in the Tank test).
    startBuffs(game) {
      const o = game.loadout.options || {}, spec = game.mainTree();
      const feralForm = () => {
        const n = (f) => (game.loadout.bar || []).filter((id) => {
          const ab = id && game.ability(id);
          return ab && ab.requires && (ab.requires.form || []).length === 1 && ab.requires.form[0] === f;
        }).length;
        const bear3 = n("bear"), cat3 = n("cat");
        if (bear3 !== cat3) return bear3 > cat3 ? "bear" : "cat";
        if (game.rank("thick_hide") || game.rank("natural_reaction")) return "bear";
        return game.scenario.role === "tank" ? "bear" : "cat";
      };
      const form = o.form || (spec === "balance" ? "moonkin" : spec === "feral_combat" ? feralForm() : "none");
      return ["mark_of_the_wild", form === "bear" && game.scenario.attacks ? "thorns" : null, { bear: "dire_bear_form", cat: "cat_form", moonkin: "moonkin_form" }[form]].filter(Boolean);
    },
    mods() {
      return [
        add("critChance", (ctx, g) => ctx.melee ? meleeCrit(g.stats()) : spellCrit(g.stats())),
        // Cat Form abilities have a 1 sec global cooldown (Classic).
        mult("gcd", (ctx, g) => g.form() === "cat" && ctx.ability && !ctx.ability.shapeshift ? 1 / 1.5 : 1),
        // Poised (level 32): at full Energy in Cat Form and out of combat, the next ability costs 10 less Energy.
        add("cost", -10, (ctx, g) => ctx.baseCost > 0 && g.form() === "cat" && !ctx.ability.shapeshift && !g.inCombat() && g.player.res.energy.power >= g.resource.max(g))
      ];
    },
    listen(game, on) {
      on("hitTaken", ({ attacker, res }) => {
        if (!attacker || attacker.dead || ["miss", "dodge", "parry", "immune"].includes(res.outcome) || !findAura(game.player, "thorns")) return;
        const ab = { id: "thorns", name: "Thorns", icon: "spell_nature_thorns", schools: ["nature"] };
        spellHit(game, { castId: ++game.castSeq, caster: game.player, target: attacker, schools: ["nature"], ability: ab }, { min: 18, max: 18, coef: 0, noMiss: true, canCrit: false, name: "Thorns" });
      });
      const p = () => game.player;
      let omenReady = 0;
      const omen = () => {
        if (game.time < omenReady) return;
        if (game.rng() >= OMEN_CHANCE * (game.form() === "moonkin" ? 2 : 1)) return;
        omenReady = game.time + OMEN_COOLDOWN;
        applyAura(game, p(), auras8.clearcasting, { source: p() });
      };
      on("cast:success", ({ ability, ctx }) => {
        const cc = findAura(p(), "clearcasting");
        if (cc && clearcastable(ctx)) removeAura(game, cc, "consumed");
        if (ability.harmful && !hasSchool(ctx, "physical") && !ability.channel) omen();
        const ns = findAura(p(), "natures_swiftness");
        if (ns && ability.id !== "natures_swiftness" && hasSchool(ctx, "nature") && ability.castTime > 0) removeAura(game, ns, "consumed");
      });
      on("damage", (ev) => {
        if (isPlayer7(game, ev) && ev.ctx.melee && !ev.periodic && landedRes5(ev.res)) omen();
      });
    },
    talents: {
      /* ---------- Balance ---------- */
      improved_wrath: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "wrath")), mult("cost", 1 - 0.1 * r, (ctx) => isAbility(ctx, "wrath"))] },
      genesis: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx) => !!ctx.periodic), mult("healMult", 1 + 0.02 * r, (ctx) => !!ctx.periodic)] },
      moonglow: { mods: (r) => [mult("cost", 1 - [0.08, 0.17, 0.25][r - 1], (ctx) => damageSpell(ctx) && !shapeshift(ctx))] },
      improved_moonfire: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "moonfire")), add("critChance", 0.05 * r, (ctx) => isAbility(ctx, "moonfire") && !ctx.periodic)] },
      natures_majesty: { mods: (r) => [add("critChance", 0.02 * r)] },
      natures_reach: { mods: (r) => [mult("range", 1 + 0.1 * r, balanceSpell), add("hitChance", 0.02 * r, balanceSpell)] },
      improved_entangling_roots: { mods: (r) => [mult("damageMult", 1 + 0.25 * r, (ctx) => isAbility(ctx, "entangling_roots"))] },
      // Moonfire and Insect Swarm read it (one more tick each); Rejuvenation 3 sec and Regrowth 6 sec longer (more ticks).
      natures_splendor: { mods: () => [add("auraDuration", 3, (ctx) => ctx.auraId === "rejuvenation"), add("auraDuration", 6, (ctx) => ctx.auraId === "regrowth")] },
      insect_swarm: { teaches: "insect_swarm" },
      vengeance: { mods: (r) => [mult("critBonusMult", 1 + 0.2 * r, (ctx) => arcaneOrNature(ctx) && !ctx.melee)] },
      improved_starfire: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "starfire"))] },
      natures_grace: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (isPlayer7(game, ev) && !ev.periodic && !ev.ctx.melee && ev.res.outcome === "crit") applyAura(game, game.player, auras8.natures_grace, { source: game.player });
          });
        }
      },
      // Every Wrath stores 2 charges (up to 4); every Starfire uses one.
      eclipse: {
        listen(game, r, on) {
          on("cast:success", ({ ability }) => {
            const p = game.player;
            if (ability.id === "wrath") applyAura(game, p, auras8.eclipse, { source: p, stacks: 2 });
            else if (ability.id === "starfire") {
              const a = findAura(p, "eclipse");
              if (a) {
                a.stacks--;
                if (a.stacks <= 0) removeAura(game, a, "consumed");
              }
            }
          });
        }
      },
      moonfury: { mods: (r) => [mult("damageMult", 1 + 0.02 * r, (ctx) => arcaneOrNature(ctx))] },
      moonkin_form: { teaches: "moonkin_form" },
      /* ---------- Feral Combat ---------- */
      ferocity: { mods: (r) => [add("cost", -r, (ctx) => isAbility(ctx, "maul", "primal_bite", "swipe", "claw", "rake"))] },
      furor: { mods: () => [] },
      // read by Cat Form and Dire Bear Form (auras.js)
      feral_instinct: { mods: (r) => [mult("damageMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "swipe"))] },
      shredding_attacks: { mods: (r) => [add("cost", -6 * r, (ctx) => isAbility(ctx, "shred")), add("cost", -r, (ctx) => isAbility(ctx, "lacerate"))] },
      savage_fury: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "claw", "rake", "shred", "maul", "swipe"))] },
      feral_charge: { teaches: "feral_charge" },
      sharpened_claws: { mods: (r) => [add("critChance", 0.03 * r, (ctx, g) => feral(g))] },
      // ESTIMATE: read as 177 + rank base armor in total (the tooltip says "per level", which would be over 10,000), plus
      // 0.67 per rank for each Defense point over 300, then x 4.6 in Dire Bear Form like item armor.
      thick_hide: {
        mods: (r) => [add("armor", (ctx, g) => {
          if (!inForm(g, "cat", "bear", "moonkin")) return 0;
          const n = 177 + r + 2 * r / 3 * ((g.loadout.gear || {}).defense || 0);
          return g.form() === "bear" ? n * 4.6 : n;
        })]
      },
      feral_swiftness: { mods: (r) => [add("dodgeChance", 0.02 * r, (ctx, g) => feral(g)), mult("runSpeed", 1 + 0.15 * r, (ctx, g) => g.form() === "cat")] },
      natural_reaction: {
        mods: (r) => [add("dodgeChance", 0.01 * r)],
        listen(game, r, on) {
          on("hitTaken", ({ res }) => {
            if (res.outcome === "dodge" && game.form() === "bear" && game.rng() < 0.2 * r) game.gainPower("rage", 5);
          });
        }
      },
      lacerate: { teaches: "lacerate" },
      predatory_discipline: { mods: () => [] },
      // read by Ferocious Bite (abilities.js): the extra Energy is not used up
      shifting_power: { teaches: "shifting_power" },
      primal_bite: { teaches: "primal_bite" },
      predatory_strikes: { mods: (r, g) => [add("attackPower", 0.5 * r * g.cls.stats.level, (ctx, g2) => feral(g2))] },
      // Bear: a chance at 5 more Rage on a crit. Cat: a chance at one more combo point on a builder's crit.
      blood_frenzy: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer7(game, ev) || ev.periodic || !ev.ctx.melee || ev.res.outcome !== "crit" || game.rng() >= 0.5 * r) return;
            if (game.form() === "bear") game.gainPower("rage", 5);
            else if (game.form() === "cat" && ev.ctx.ability && ev.ctx.ability.builder) addCombo(game, ev.ctx.target, 1);
          });
        }
      },
      leader_of_the_pack: { mods: () => [add("critChance", 0.03, (ctx, g) => feral(g))] },
      natural_instinct: { mods: (r) => [mult("critBonusMult", 1 + 0.1 * r, meleeAbility)] },
      rend_and_tear: { mods: (r) => [mult("damageMult", 1 + 0.03 * r, (ctx) => meleeAbility(ctx) && bleeding(ctx))] },
      /* ---------- Restoration ---------- */
      subtlety: { mods: (r) => [mult("threatMult", 1 - 0.1 * r, (ctx) => hasSchool(ctx, "nature") || hasSchool(ctx, "arcane"))] },
      natures_focus: { mods: (r) => [focus(0.14 * r, (ctx) => hasSchool(ctx, "arcane") || hasSchool(ctx, "nature"))] },
      heart_of_the_wild: {
        mods: (r, g) => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int * (1 + 0.02 * r), str: g.form() === "cat" ? a.str * (1 + 0.02 * r) : a.str, sta: g.form() === "bear" ? a.sta * (1 + 0.04 * r) : a.sta }) }]
      },
      naturalist: { mods: (r) => [mult("damageMult", 1 + 0.02 * r), add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "healing_touch", "wild_growth"))] },
      gift_of_nature: { mods: (r) => [mult("healMult", 1 + 0.02 * r)] },
      // A Rejuvenation or Regrowth that runs its full time heals once more, for the Druid's Spirit (half when dispelled:
      // nothing in the lab dispels a friend's buff).
      bloom: {
        listen(game, r, on) {
          on("aura:remove", ({ aura: aura2, unit, reason }) => {
            if (reason !== "expired" || aura2.source !== game.player || !["rejuvenation", "regrowth"].includes(aura2.id) || !unit || unit.dead) return;
            const n = game.stats().spi;
            healHit(game, { castId: ++game.castSeq, caster: game.player, target: unit, schools: ["nature"], ability: BLOOM }, { min: n, max: n, coef: 0, canCrit: false, name: "Bloom" });
          });
        }
      },
      tranquil_spirit: { mods: (r) => [mult("cost", 1 - 0.02 * r, (ctx) => isAbility(ctx, "healing_touch", "tranquility"))] },
      improved_rejuvenation: { mods: (r) => [mult("healMult", 1 + 0.05 * r, (ctx) => isAbility(ctx, "rejuvenation"))] },
      swiftmend: { teaches: "swiftmend" },
      improved_tranquility: { mods: (r) => [mult("cooldown", 1 - 0.3 * r, (ctx) => isAbility(ctx, "tranquility"))] },
      improved_regrowth: { mods: (r) => [add("critChance", 0.1 * r, (ctx) => isAbility(ctx, "regrowth") && !ctx.periodic)] },
      wild_growth: { teaches: "wild_growth" },
      natural_shapeshifter: { mods: (r) => [mult("cost", 1 - 0.1 * r, shapeshift)] },
      reflection: { mods: (r) => [add("regenWhileCasting", [0.17, 0.33, 0.5][r - 1])] },
      natures_swiftness: { teaches: "natures_swiftness" },
      living_spirit: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, spi: a.spi * (1 + 0.05 * r) }) }] }
    }
  };

  // src/classes/shaman/talent-data.js
  var SOURCE9 = { site: "foreverchanges.pro/talents/shaman", build: "1.60.1.70790", extracted: "2026-11-05" };
  var per4 = (values, fn) => values.map(fn);
  var trees9 = [
    {
      id: "elemental_combat",
      name: "Elemental Combat",
      icon: "spell_nature_lightning",
      talents: [
        { id: "convection", name: "Convection", icon: "spell_nature_wispsplode", tier: 0, col: 1, max: 5, ranks: ["Reduces the mana cost of your Shock, Lightning Bolt, and Chain Lightning spells by 2%.", "Reduces the mana cost of your Shock, Lightning Bolt, and Chain Lightning spells by 4%.", "Reduces the mana cost of your Shock, Lightning Bolt, and Chain Lightning spells by 6%.", "Reduces the mana cost of your Shock, Lightning Bolt, and Chain Lightning spells by 8%.", "Reduces the mana cost of your Shock, Lightning Bolt, and Chain Lightning spells by 10%."] },
        { id: "concussion", name: "Concussion", icon: "spell_nature_earthshock", tier: 0, col: 2, max: 5, ranks: per4([[1], [2], [3], [4], [5]], (v) => `Increases the damage done by your Lightning Bolt, Chain Lightning, and Earth Shock spells by ${v[0]}%.`) },
        { id: "elemental_devastation", name: "Elemental Devastation", icon: "spell_fire_elementaldevastation", tier: 1, col: 0, max: 3, ranks: per4([[3], [6], [9]], (v) => `Your Critical Strikes with direct damage spells increase your chance to get a Critical Strike with melee attacks by ${v[0]}% for 10 sec.`) },
        { id: "reverberation", name: "Reverberation", icon: "spell_frost_frostward", tier: 1, col: 1, max: 5, ranks: per4([["0.2"], ["0.4"], ["0.6"], ["0.8"], ["1.0"]], (v) => `Reduces the cooldown of your Shock spells by ${v[0]} sec.`) },
        { id: "elemental_alacrity", name: "Elemental Alacrity", icon: "spell_lightning_lightningbolt01", tier: 1, col: 2, max: 3, ranks: ["Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.17 sec.", "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.33 sec.", "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.50 sec."] },
        { id: "call_of_flame", name: "Call of Flame", icon: "spell_fire_immolation", tier: 1, col: 3, max: 3, ranks: ["Increases the damage done by your Fire Totems and by your Flame Shock and Fire Nova spells by 5%, as well as increases the duration of your Flame Shock spell by 3 sec.", "Increases the damage done by your Fire Totems and by your Flame Shock and Fire Nova spells by 10%, as well as increases the duration of your Flame Shock spell by 6 sec.", "Increases the damage done by your Fire Totems and by your Flame Shock and Fire Nova spells by 15%, as well as increases the duration of your Flame Shock spell by 9 sec."] },
        { id: "elemental_focus", name: "Elemental Focus", icon: "spell_shadow_manaburn", tier: 2, col: 0, max: 1, ranks: ["Gives you a 10% chance to enter a Clearcasting state after casting any Fire, Frost, or Nature damage spell. The Clearcasting state reduces the mana cost of your next damage spell by 100%."] },
        { id: "elemental_warding", name: "Elemental Warding", icon: "spell_nature_spiritarmor", tier: 2, col: 1, max: 3, ranks: per4([[3], [7], [10]], (v) => `Reduces damage taken from Fire, Frost, and Nature effects by ${v[0]}%.`) },
        { id: "trial_by_fire", name: "Trial by Fire", icon: "spell_fire_sealoffire", tier: 3, col: 0, max: 2, ranks: per4([[10, 2], [20, 4]], (v) => `Increases the damage done by your Fire Nova spell by ${v[0]}% and reduces its cooldown by ${v[1]} sec, and increases the duration of your Magma Totem by ${v[0]} sec.`) },
        { id: "eye_of_the_storm", name: "Eye of the Storm", icon: "spell_nature_eyeofthestorm", tier: 3, col: 1, max: 3, ranks: ["Gives your Lightning Bolt and Chain Lightning spells a 23% chance to not lose casting time when you take damage.", "Gives your Lightning Bolt and Chain Lightning spells a 47% chance to not lose casting time when you take damage.", "Gives your Lightning Bolt and Chain Lightning spells a 70% chance to not lose casting time when you take damage."] },
        { id: "earthbound", name: "Earthbound", icon: "spell_nature_stranglevines", tier: 3, col: 3, max: 1, ranks: ["Your Earthbind Totem Immobilizes nearby targets for 5 sec when cast."] },
        { id: "elemental_reach", name: "Elemental Reach", icon: "spell_nature_stormreach", tier: 4, col: 0, max: 2, ranks: ["Increases the range of your Lightning Bolt, Chain Lightning, and Fire Nova spells by 3 yards.", "Increases the range of your Lightning Bolt, Chain Lightning, and Fire Nova spells by 6 yards."] },
        { id: "call_of_thunder", name: "Call of Thunder", icon: "spell_nature_callstorm", tier: 4, col: 1, max: 1, ranks: ["Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by 5%."] },
        { id: "lightning_overload", name: "Lightning Overload", icon: "spell_nature_lightningoverload", tier: 4, col: 2, max: 3, req: "elemental_alacrity", ranks: ["Gives your Lightning Bolt and Chain Lightning spells a 10% chance to cast a second, similar spell on the same target at no additional cost that causes half damage and no threat.", "Gives your Lightning Bolt and Chain Lightning spells a 20% chance to cast a second, similar spell on the same target at no additional cost that causes half damage and no threat.", "Gives your Lightning Bolt and Chain Lightning spells a 30% chance to cast a second, similar spell on the same target at no additional cost that causes half damage and no threat."] },
        { id: "elemental_fury", name: "Elemental Fury", icon: "spell_fire_volcano", tier: 5, col: 2, max: 5, req: "lightning_overload", ranks: per4([[20], [40], [60], [80], [100]], (v) => `Increases the critical strike damage bonus of your Searing and Magma Totems and your Fire, Frost, and Nature spells by ${v[0]}%.`) },
        { id: "lightning_mastery", name: "Lightning Mastery", icon: "spell_nature_wispheal", tier: 6, col: 1, max: 1, req: "call_of_thunder", active: true, ranks: ["Gain mastery over Lightning, reducing the cast time of Lightning Bolt by 0.5 sec, and removing the cooldown from Chain Lightning. Lasts 15 sec."] }
      ]
    },
    {
      id: "enhancement",
      name: "Enhancement",
      icon: "spell_nature_lightningshield",
      talents: [
        { id: "earths_grasp", name: "Earth's Grasp", icon: "spell_nature_stoneclawtotem", tier: 0, col: 0, max: 2, ranks: per4([[25, 10], [50, 20]], (v) => `Increases the health of your Stoneclaw Totem by ${v[0]}% and the radius of your Earthbind Totem by ${v[1]}%.`) },
        { id: "thundering_strikes", name: "Thundering Strikes", icon: "ability_thunderbolt", tier: 0, col: 1, max: 5, ranks: per4([[1], [2], [3], [4], [5]], (v) => `Improves your chance to get a critical strike with all spells and attacks by ${v[0]}%.`) },
        { id: "ancestral_knowledge", name: "Ancestral Knowledge", icon: "spell_shadow_grimward", tier: 0, col: 2, max: 5, ranks: per4([[2], [4], [6], [8], [10]], (v) => `Increases your Intellect by ${v[0]}%.`) },
        { id: "guardian_totems", name: "Guardian Totems", icon: "spell_nature_stoneskintotem", tier: 1, col: 0, max: 2, ranks: per4([[10, 1], [20, 2]], (v) => `Increases the amount of damage reduced by your Stoneskin Totem and Windwall Totem by ${v[0]}% and reduces the cooldown of your Grounding Totem by ${v[1]} sec.`) },
        { id: "mental_dexterity", name: "Mental Dexterity", icon: "spell_nature_mentalquickness", tier: 1, col: 1, max: 3, ranks: ["Increases your Attack Power by an amount equal to 50% of your Intellect.", "Increases your Attack Power by an amount equal to 100% of your Intellect.", "Increases your Attack Power by an amount equal to 150% of your Intellect."] },
        { id: "improved_lightning_shield", name: "Improved Lightning Shield", icon: "spell_nature_lightningshield", tier: 1, col: 2, max: 3, ranks: per4([[5], [10], [15]], (v) => `Increases the damage done by your Lightning Shield orbs by ${v[0]}%.`) },
        { id: "elemental_weapons", name: "Elemental Weapons", icon: "spell_fire_flametounge", tier: 2, col: 0, max: 3, ranks: per4([[7, 13, 5], [13, 27, 10], [20, 40, 15]], (v) => `Increases the melee attack power bonus of your Rockbiter Weapon by ${v[0]}%, your Windfury Weapon effect by ${v[1]}% and increases the damage caused by your Flametongue Weapon and Frostbrand Weapon by ${v[2]}%.`) },
        { id: "shamanistic_focus", name: "Shamanistic Focus", icon: "spell_nature_elementalabsorption", tier: 2, col: 2, max: 1, ranks: ["Reduces the mana cost of your Shock and Lightning Shield spells by 45%."] },
        { id: "anticipation", name: "Anticipation", icon: "spell_nature_mirrorimage", tier: 2, col: 3, max: 3, ranks: per4([[2], [4], [6]], (v) => `Increases your chance to dodge by an additional ${v[0]}%.`) },
        { id: "toughness", name: "Toughness", icon: "spell_holy_devotion", tier: 3, col: 0, max: 5, ranks: per4([[2], [4], [6], [8], [10]], (v) => `Increases your Stamina by ${v[0]}%.`) },
        { id: "flurry", name: "Flurry", icon: "ability_ghoulfrenzy", tier: 3, col: 1, max: 5, req: "mental_dexterity", ranks: ["Increases your attack speed by 6% for your next 3 swings after dealing a melee critical strike.", "Increases your attack speed by 12% for your next 3 swings after dealing a melee critical strike.", "Increases your attack speed by 18% for your next 3 swings after dealing a melee critical strike.", "Increases your attack speed by 24% for your next 3 swings after dealing a melee critical strike.", "Increases your attack speed by 30% for your next 3 swings after dealing a melee critical strike."] },
        { id: "stormstrike", name: "Stormstrike", icon: "ability_shaman_stormstrike", tier: 3, col: 2, max: 1, ranks: ["Instantly strike for 150% weapon damage and increase the damage you deal to the target with your next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec."] },
        { id: "improved_ghost_wolf", name: "Improved Ghost Wolf", icon: "spell_nature_spiritwolf", tier: 3, col: 3, max: 2, ranks: per4([["1.0"], ["3.0"]], (v) => `Reduces the cast time of your Ghost Wolf spell by ${v[0]} sec, and Ghost Wolf may be used indoors.`) },
        { id: "spirit_weapons", name: "Spirit Weapons", icon: "ability_parry", tier: 4, col: 0, max: 1, ranks: ["Gives a chance to parry enemy melee attacks, reduces all threat generated by your attacks by 30% while Rockbiter Weapon is not active, and increases all threat generated by 30% while Rockbiter Weapon is active."] },
        { id: "mental_quickness", name: "Mental Quickness", icon: "spell_nature_sleep", tier: 4, col: 1, max: 2, ranks: per4([[15], [30]], (v) => `Increases your spell damage and healing by up to ${v[0]}% of your Intellect.`) },
        { id: "improved_stormstrike", name: "Improved Stormstrike", icon: "spell_shaman_improvedstormstrike", tier: 4, col: 2, max: 2, req: "stormstrike", ranks: per4([[50], [100]], (v) => `When you Stormstrike, you have a ${v[0]}% chance to gain 50% mana regeneration while casting spells for 15 sec, and Stormstrike's cooldown has a ${v[0]}% chance to reset each time you Dodge or Parry.`) },
        { id: "maelstrom_weapon", name: "Maelstrom Weapon", icon: "spell_shaman_maelstromweapon", tier: 5, col: 2, max: 5, notes: "approx", ranks: per4([[4], [8], [12], [16], [20]], (v) => `When you deal damage with a melee attack, you have a chance to reduce the cast time and Mana cost of your next Lightning Bolt spell by ${v[0]}%. Stacks up to 5 times. Lasts 30 sec.`) },
        { id: "rage_of_the_farseer", name: "Rage of the Farseer", icon: "spell_nature_bloodlust", tier: 6, col: 1, max: 1, req: "mental_quickness", ranks: ["Increases your attack speed by 30% for 25 sec."] }
      ]
    },
    {
      id: "restoration",
      name: "Restoration",
      icon: "spell_nature_magicimmunity",
      talents: [
        { id: "improved_healing_wave", name: "Improved Healing Wave", icon: "spell_nature_magicimmunity", tier: 0, col: 1, max: 5, ranks: per4([["0.1"], ["0.2"], ["0.3"], ["0.4"], ["0.5"]], (v) => `Reduces the casting time of your Healing Wave spell by ${v[0]} sec.`) },
        { id: "tidal_focus", name: "Tidal Focus", icon: "spell_frost_manarecharge", tier: 0, col: 2, max: 5, ranks: per4([[1], [2], [3], [4], [5]], (v) => `Reduces the Mana cost of your healing spells by ${v[0]}% and improves your chance to hit by ${v[0]}%.`) },
        { id: "mindfulness", name: "Mindfulness", icon: "spell_nature_sleep", tier: 1, col: 0, max: 3, ranks: per4([[17], [33], [50]], (v) => `Allows ${v[0]}% of your Mana regeneration to continue while casting.`) },
        { id: "natural_grace", name: "Natural Grace", icon: "spell_nature_healingtouch", tier: 1, col: 1, max: 3, ranks: per4([[5], [10], [15]], (v) => `Reduces the threat generated by your spells by ${v[0]}%.`) },
        { id: "totemic_focus", name: "Totemic Focus", icon: "spell_nature_moonglow", tier: 1, col: 2, max: 5, ranks: per4([[5], [10], [15], [20], [25]], (v) => `Reduces the Mana cost of your totems and any spells that summon or move them by ${v[0]}%.`) },
        { id: "improved_reincarnation", name: "Improved Reincarnation", icon: "spell_nature_reincarnation", tier: 1, col: 3, max: 2, ranks: per4([[10, 2], [20, 4]], (v) => `Reduces the cooldown of your Reincarnation spell by ${v[0]} min, increases your maximum health by ${v[1]}%, and increases the amount of health and Mana you reincarnate with by an additional ${v[0]}%.`) },
        { id: "ancestral_healing", name: "Ancestral Healing", icon: "spell_nature_undyingstrength", tier: 2, col: 0, max: 3, ranks: per4([[8], [17], [25]], (v) => `Increases your target's armor value by ${v[0]}% for 15 sec after getting a critical effect from one of your healing spells.`) },
        { id: "healing_focus", name: "Healing Focus", icon: "spell_nature_healingwavelesser", tier: 2, col: 1, max: 3, ranks: per4([[23], [47], [70]], (v) => `Gives your healing spells a ${v[0]}% chance to not lose casting time when you take damage.`) },
        { id: "water_shield", name: "Water Shield", icon: "ability_shaman_watershield", tier: 2, col: 2, max: 1, ranks: ["The caster is surrounded by 3 globes of water. When a spell, melee, or ranged attack hits the caster or when one of the caster's spells gets a critical result, 2% of maximum mana is restored to the caster, expending one water globe. Only one globe will activate every few seconds. Lasts 10 min.\n\nOnly one Elemental Shield can be active on the Shaman at any one time."] },
        { id: "tidal_mastery", name: "Tidal Mastery", icon: "spell_nature_tranquility", tier: 3, col: 0, max: 5, ranks: per4([[1], [2], [3], [4], [5]], (v) => `Increases the critical effect chance of your healing spells by ${v[0]}%.`) },
        { id: "restorative_totems", name: "Restorative Totems", icon: "spell_nature_manaregentotem", tier: 3, col: 1, max: 5, ranks: per4([[5, 10], [10, 20], [15, 30], [20, 40], [25, 50]], (v) => `Increases the effect of your Mana Spring Totem by ${v[0]}% and increases the effect of your Healing Stream Totem by ${v[1]}%.`) },
        { id: "mana_tide_totem", name: "Mana Tide Totem", icon: "spell_frost_summonwaterelemental", tier: 3, col: 2, max: 1, ranks: ["Summons a Mana Tide Totem with 5 health at the feet of the caster for 12 sec that restores 88 mana every 3 seconds to group members within 30 yards."] },
        { id: "healing_way", name: "Healing Way", icon: "spell_nature_healingway", tier: 4, col: 1, max: 3, ranks: per4([[8], [17], [25]], (v) => `Increases the amount healed by your Healing Wave spell by ${v[0]}%.`) },
        { id: "natures_swiftness", name: "Nature's Swiftness", icon: "spell_nature_ravenform", tier: 4, col: 2, max: 1, ranks: ["When activated, your next Nature spell with a casting time less than 10 sec. becomes an instant cast spell."] },
        { id: "purification", name: "Purification", icon: "spell_frost_wizardmark", tier: 5, col: 2, max: 5, ranks: per4([[2], [4], [6], [8], [10]], (v) => `Increases the effectiveness of your healing spells by ${v[0]}%.`) },
        { id: "riptide", name: "Riptide", icon: "spell_nature_riptide", tier: 6, col: 1, max: 1, req: "healing_way", ranks: ["Heals a friendly target for 445 over 15 sec, and increases the effectiveness of your Chain Heal casts directly on that target by 25%."] }
      ]
    }
  ];

  // src/classes/shaman/talent-history.js
  var talentHistory8 = [
    {
      // 1.60.1.70753 (November 3): Elemental Mastery became Lightning Mastery, Lava Burst left and Call of Thunder took its
      // place, and Improved Ghost Wolf moved (Blizzard's launch notes).
      until: "1.60.1.70753",
      date: "November 3",
      order: [
        ["convection", "concussion", "elemental_devastation", "reverberation", "elemental_alacrity", "call_of_flame", "elemental_focus", "elemental_warding", "trial_by_fire", "eye_of_the_storm", "earthbound", "elemental_reach", "lava_burst", "lightning_overload", "elemental_fury", "elemental_mastery"],
        ["earths_grasp", "thundering_strikes", "ancestral_knowledge", "guardian_totems", "mental_dexterity", "improved_ghost_wolf", "improved_lightning_shield", "elemental_weapons", "shamanistic_focus", "anticipation", "toughness", "flurry", "stormstrike", "spirit_weapons", "mental_quickness", "improved_stormstrike", "maelstrom_weapon", "rage_of_the_farseer"],
        ["improved_healing_wave", "tidal_focus", "mindfulness", "natural_grace", "totemic_focus", "improved_reincarnation", "ancestral_healing", "healing_focus", "water_shield", "tidal_mastery", "restorative_totems", "mana_tide_totem", "healing_way", "natures_swiftness", "purification", "riptide"]
      ],
      renamed: { elemental_mastery: "lightning_mastery" },
      removed: { lava_burst: "Lava Burst" },
      names: { elemental_mastery: "Elemental Mastery" }
    }
  ];

  // src/classes/shaman/spellbook-data.js
  var SPELLBOOK9 = [
    ["Earthbind Totem", "spell_nature_strengthofearthtotem02", "elemental_combat", "b6", 0, 0, 15, 0, "Summons an Earthbind Totem with 5 health at the feet of the caster for 45 sec that slows the movement speed of enemies within 10 yards."],
    ["Stoneclaw Totem", "spell_nature_stoneclawtotem", "elemental_combat", 140, 0, 0, 30, 0, "Summons a Stoneclaw Totem with 480 health at the feet of the caster for 15 sec that taunts creatures within 8 yards to attack it."],
    ["Purge", "spell_nature_purge", "elemental_combat", "b10", 30, 0, 0, 0, "Purges the enemy target, removing 2 beneficial magic effects."],
    ["Call of the Elements", "spell_shaman_dropall_01", "elemental_combat", 0, 0, 3, 0, 0, "Simultaneously places up to 4 totems specified in the Totem Bar."],
    ["Call of the Ancestors", "spell_shaman_dropall_02", "elemental_combat", 0, 0, 3, 0, 0, "Simultaneously places up to 4 totems specified in the Totem Bar. Can call different totems than Call of the Elements."],
    ["Call of the Spirits", "spell_shaman_dropall_03", "elemental_combat", 0, 0, 3, 0, 0, "Simultaneously places up to 4 totems specified in the Totem Bar. Can call different totems than Call of the Elements or Call of the Ancestors."],
    ["Totemic Recall", "spell_shaman_totemrecall", "elemental_combat", 0, 0, 0, 0, 0, "Returns your totems to the earth, giving you 25% of the mana required to cast each totem destroyed by Totemic Recall."],
    ["Stoneskin Totem", "spell_nature_stoneskintotem", "enhancement", 210, 0, 0, 0, 0, "Summons a Stoneskin Totem with 5 health at the feet of the caster. The totem protects party members within 30 yards, reducing Physical damage taken by 30. Lasts 5 min."],
    ["Lightning Shield", "spell_nature_lightningshield", "enhancement", 370, 0, 0, 0, 0, "The caster is surrounded by 3 balls of lightning. When a spell, melee or ranged attack hits the caster, the attacker will be struck for 178 Nature damage. This expends one lightning ball. Only one ball will fire every few seconds. Lasts 10 min."],
    ["Totemic Call", "ability_shaman_totemrelocation", "enhancement", "b25", 30, 0, 30, 0, "Relocates your active totems to your location."],
    ["Frost Resistance Totem", "spell_frostresistancetotem_01", "enhancement", 180, 0, 0, 0, 0, "Summons a Frost Resistance Totem with 5 health at the feet of the caster for 5 min. The totem increases party and raid members' frost resistance by 60, if within 30 yards."],
    ["Fire Resistance Totem", "spell_fireresistancetotem_01", "enhancement", 180, 0, 0, 0, 0, "Summons a Fire Resistance Totem with 5 health at the feet of the caster for 5 min that increases the fire resistance of party or raid members within 30 yards by 60."],
    ["Grounding Totem", "spell_nature_groundingtotem", "enhancement", "b6", 0, 0, 15, 0, "Summons a Grounding Totem with 5 health at the feet of the caster that will redirect one harmful spell cast on a nearby party member to itself every 10 seconds. Will not redirect area of effect spells. Lasts 45 sec."],
    ["Nature Resistance Totem", "spell_nature_natureresistancetotem", "enhancement", 180, 0, 0, 0, 0, "Summons a Nature Resistance Totem with 5 health at the feet of the caster for 5 min that increases the nature resistance of party and raid members within 30 yards by 60."],
    ["Windwall Totem", "spell_nature_earthbind", "enhancement", 225, 0, 0, 0, 0, "Summons a Windwall Totem with 5 health at the feet of the caster. The totem protects party members within 30 yards, reducing ranged damage taken by 64. Lasts 5 min."],
    ["Healing Wave", "spell_nature_magicimmunity", "restoration", 620, 40, 3, 0, 0, "Heals a friendly target for 1508 to 1722."],
    ["Cure Poison", "spell_nature_nullifypoison", "restoration", "b9", 30, 0, 0, 0, "Cures 1 poison effects on the target."],
    ["Tremor Totem", "spell_nature_tremortotem", "restoration", 60, 0, 0, 0, 0, "Summons a Tremor Totem with 5 health at the feet of the caster that shakes the ground around it, removing Fear, Charm and Sleep effects from party members within 30 yards. Lasts 5 min."],
    ["Healing Stream Totem", "inv_spear_04", "restoration", 80, 0, 0, 0, 0, "Summons a Healing Stream Totem with 5 health at the feet of the caster for 5 min that heals group members within 30 yards for 11 every 2 seconds."],
    ["Lesser Healing Wave", "spell_nature_healingwavelesser", "restoration", 380, 40, 1.5, 0, 0, "Heals a friendly target for 775 to 865."],
    ["Cure Disease", "spell_nature_removedisease", "restoration", "b9", 30, 0, 0, 0, "Cures 1 disease on the target."],
    ["Poison Cleansing Totem", "spell_nature_poisoncleansingtotem", "restoration", "b10", 0, 0, 0, 0, "Summons a Poison Cleansing Totem with 5 health at the feet of the caster that attempts to remove 1 poison effect from party members within 30 yards every 5 seconds. Lasts 5 min."],
    ["Disease Cleansing Totem", "spell_nature_diseasecleansingtotem", "restoration", "b10", 0, 0, 0, 0, "Summons a Disease Cleansing Totem with 5 health at the feet of the caster that attempts to remove 1 disease effect from party members within 30 yards every 5 seconds. Lasts 5 min."],
    ["Chain Heal", "spell_nature_healingwavegreater", "restoration", 405, 40, 2.5, 0, 0, "Heals the friendly target for 474 to 539, then jumps to heal additional nearby targets. If cast on a party member, the heal will only jump to other party members. Each jump is 50% as effective as the previous target. Heals 3 total targets."],
    ["Riptide", "spell_nature_riptide", "restoration", 230, 40, 0, 12, 1, "Heals a friendly target for 805 over 15 sec, and increases the effectiveness of your Chain Heal casts directly on that target by 25%."]
  ];

  // src/classes/shaman/abilities.js
  var spell5 = (schools, extra10) => ({ schools, harmful: true, target: "enemy", range: 30, ...extra10 });
  var nature2 = ["nature"];
  var fire2 = ["fire"];
  var frost = ["frost"];
  var basePct6 = (pct) => (g) => Math.round(g.stats().baseMana * pct);
  var shock = { cooldown: 6, cooldownGroup: "shock", range: 20, tags: ["shock"] };
  var totem = (id, name, icon2, tree, cost, text, extra10) => ({
    id,
    name,
    icon: icon2,
    tree,
    schools: ["physical"],
    target: "self",
    cost,
    tags: ["totem"],
    effects: [{ type: "totem", totem: id }],
    text,
    ...extra10
  });
  var imbue = (id, name, icon2, cost, text) => ({
    id,
    name,
    icon: icon2,
    tree: "enhancement",
    schools: ["physical"],
    target: "self",
    cost,
    tags: ["imbue"],
    setsOption: ["imbue", id],
    effects: [{ type: "applyAura", to: "self", aura: id, duration: 3600 }],
    text
  });
  var abilities9 = [
    /* ---------- Elemental Combat ---------- */
    {
      id: "lightning_bolt",
      name: "Lightning Bolt",
      icon: "spell_nature_lightning",
      tree: "elemental_combat",
      ...spell5(nature2),
      cost: 220,
      castTime: 2.5,
      speed: 40,
      effects: [{ type: "damage", min: 342, max: 381, coef: 0.714 }],
      text: "Casts a bolt of lightning at the target for 342 to 381 Nature damage."
    },
    {
      id: "chain_lightning",
      name: "Chain Lightning",
      icon: "spell_nature_chainlightning",
      tree: "elemental_combat",
      ...spell5(nature2),
      cost: 495,
      castTime: 2.5,
      cooldown: 6,
      // 2.5 sec: the launch realms do not send the notes' 2 sec
      effects: [{ type: "chain", targets: 3, radius: 10, falloff: 0.7, min: 495, max: 552, coef: 0.571 }],
      text: "Hurls a lightning bolt at the enemy, dealing 495 to 552 Nature damage and then jumping to additional nearby enemies. Each jump reduces the damage by 30%. Affects 3 total targets."
    },
    {
      id: "earth_shock",
      name: "Earth Shock",
      icon: "spell_nature_earthshock",
      tree: "elemental_combat",
      ...spell5(nature2, shock),
      cost: 450,
      effects: [{ type: "damage", min: 517, max: 545, coef: 0.386 }],
      text: "Instantly shocks the target with concussive force, causing 517 to 545 Nature damage. It also interrupts spellcasting and prevents any spell in that school from being cast for 2 sec. Causes a high amount of threat."
    },
    {
      id: "flame_shock",
      name: "Flame Shock",
      icon: "spell_fire_flameshock",
      tree: "elemental_combat",
      ...spell5(fire2, shock),
      cost: 410,
      // Call of Flame adds 3 sec (one more tick of 80) per rank.
      effects: [{ type: "damage", min: 292, max: 292, coef: 0.214, onHit: [{ type: "applyAura", to: "target", aura: "flame_shock", dynamic: (g) => {
        const n = 4 + g.rank("call_of_flame");
        return { dot: { ticks: n, base: 80 * n, coef: 0.1 * n } };
      } }] }],
      text: "Instantly sears the target with fire, causing 292 Fire damage immediately and 320 Fire damage over 12 sec."
    },
    {
      id: "frost_shock",
      name: "Frost Shock",
      icon: "spell_frost_frostshock",
      tree: "elemental_combat",
      ...spell5(frost, shock),
      cost: 430,
      effects: [{ type: "damage", min: 495, max: 524, coef: 0.386 }],
      text: "Instantly shocks the target with frost, causing 495 to 524 Frost damage and slowing movement speed by 50%. Lasts 8 sec."
    },
    {
      id: "fire_nova",
      name: "Fire Nova",
      icon: "spell_fire_sealoffire",
      tree: "elemental_combat",
      schools: fire2,
      harmful: true,
      target: "self",
      cost: 375,
      cooldown: 10,
      usable: (g) => {
        const t = totemOf(g, "fire");
        return !t ? "Requires an active Fire totem" : g.enemies.some((e) => !e.dead && dist(t, e) - e.radius <= 10) ? null : "No enemy within 10 yards of your Fire totem";
      },
      effects: [{ type: "aoeDamage", center: (g) => totemOf(g, "fire"), radius: 10, min: 232, max: 259, coef: 0.143, name: "Fire Nova" }],
      text: "Instantly inflicts 232 to 259 fire damage to enemies within 10 yd of your active Fire totem."
    },
    totem(
      "searing_totem",
      "Searing Totem",
      "spell_fire_searingtotem",
      "elemental_combat",
      170,
      "Summons a Searing Totem with 5 health at your feet for 55 sec that repeatedly attacks an enemy within 20 yards for 40 to 54 Fire damage."
    ),
    totem(
      "magma_totem",
      "Magma Totem",
      "spell_fire_selfdestruct",
      "elemental_combat",
      650,
      "Summons a Magma Totem with 5 health at the feet of the caster for 20 sec that causes 73 Fire damage to creatures within 8 yards every 2 seconds."
    ),
    {
      id: "lightning_mastery",
      name: "Lightning Mastery",
      icon: "spell_nature_wispheal",
      tree: "elemental_combat",
      schools: nature2,
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "lightning_mastery",
      effects: [{ type: "applyAura", to: "self", aura: "lightning_mastery" }],
      text: "Gain mastery over Lightning, reducing the cast time of Lightning Bolt by 0.5 sec, and removing the cooldown from Chain Lightning. Lasts 15 sec."
    },
    /* ---------- Enhancement ---------- */
    {
      id: "stormstrike",
      name: "Stormstrike",
      icon: "ability_shaman_stormstrike",
      tree: "enhancement",
      range: "melee",
      target: "enemy",
      harmful: true,
      schools: ["physical"],
      cost: basePct6(0.08),
      cooldown: 8,
      weaponStrike: true,
      talent: "stormstrike",
      // 100% and 8 sec (was 150% and 6 sec)
      effects: [{ type: "weaponDamage", hand: "main", weaponPct: 1, normalized: true, onHit: [{ type: "applyAura", to: "target", aura: "stormstrike" }] }],
      text: "Instantly strike for 100% weapon damage and increase the damage you deal to the target with your next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec."
    },
    {
      id: "rage_of_the_farseer",
      name: "Rage of the Farseer",
      icon: "spell_nature_bloodlust",
      tree: "enhancement",
      schools: ["physical"],
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "rage_of_the_farseer",
      effects: [{ type: "applyAura", to: "self", aura: "rage_of_the_farseer" }],
      text: "Increases your attack speed by 30% for 25 sec."
    },
    imbue(
      "windfury_weapon",
      "Windfury Weapon",
      "spell_nature_cyclone",
      165,
      "Imbue the Shaman's weapon with wind. Each hit has a 20% chance of granting you 2 extra attacks with 333 extra melee attack power. When applied to main hand, disables any benefit you personally receive from Windfury Totem. Lasts for 60 minutes."
    ),
    imbue(
      "rockbiter_weapon",
      "Rockbiter Weapon",
      "spell_nature_rockbiter",
      150,
      "Imbue the Shaman's weapon, increasing melee attack power by 653 and allowing melee attacks to cause additional threat when using that weapon. Lasts for 60 minutes."
    ),
    imbue(
      "flametongue_weapon",
      "Flametongue Weapon",
      "spell_fire_flametounge",
      155,
      "Imbue the Shaman's weapon with fire. Each hit causes 35 to 112 additional Fire damage, based on the speed of the weapon. Slower weapons cause more fire damage per swing. When applied to main hand, disables any benefit you personally receive from Flametongue Totem. Lasts for 60 minutes."
    ),
    imbue(
      "frostbrand_weapon",
      "Frostbrand Weapon",
      "spell_frost_frostbrand",
      160,
      "Imbue the Shaman's weapon with frost. Each hit has a chance of causing 169 additional Frost damage and slowing the target's movement speed by 25% for 8 sec. Lasts for 60 minutes."
    ),
    totem(
      "strength_of_earth_totem",
      "Strength of Earth Totem",
      "spell_nature_earthbindtotem",
      "enhancement",
      275,
      "Summons a Strength of Earth Totem with 5 health at the feet of the caster. The totem increases the strength of party or raid members within 30 yards by 53. Lasts 5 min."
    ),
    totem(
      "grace_of_air_totem",
      "Grace of Air Totem",
      "spell_nature_invisibilitytotem",
      "enhancement",
      310,
      "Summons a Grace of Air Totem with 5 health at the feet of the caster. The totem increases the agility of party or raid members within 30 yards by 89. Lasts 5 min."
    ),
    totem(
      "windfury_totem",
      "Windfury Totem",
      "spell_nature_windfury",
      "enhancement",
      250,
      "Summons a Windfury Totem with 5 health at the feet of the caster. The totem enhances the melee attacks of all party or raid members within 30 yards. Each main hand hit has a 20% chance of granting the attacker 1 extra attack with 246 extra melee attack power. Lasts 5 min."
    ),
    totem(
      "flametongue_totem",
      "Flametongue Totem",
      "spell_nature_guardianward",
      "enhancement",
      275,
      "Summons a Flametongue Totem with 5 health at the feet of the caster. The totem enhances the melee attacks of all party or raid members within 30 yards. Each main hand hit causes 17 to 55 additional Fire damage, based on the speed of the weapon. Lasts 5 min."
    ),
    /* ---------- Restoration ---------- */
    totem(
      "mana_spring_totem",
      "Mana Spring Totem",
      "spell_nature_manaregentotem",
      "restoration",
      100,
      "Summons a Mana Spring Totem with 5 health at the feet of the caster for 5 min that restores 10 mana every 2 seconds to group members within 30 yards."
    ),
    totem(
      "mana_tide_totem",
      "Mana Tide Totem",
      "spell_frost_summonwaterelemental",
      "restoration",
      60,
      "Summons a Mana Tide Totem with 5 health at the feet of the caster for 12 sec that restores 290 mana every 3 seconds to group members within 30 yards.",
      { cooldown: 300, talent: "mana_tide_totem" }
    ),
    {
      id: "water_shield",
      name: "Water Shield",
      icon: "ability_shaman_watershield",
      tree: "restoration",
      schools: frost,
      target: "self",
      talent: "water_shield",
      effects: [{ type: "applyAura", to: "self", aura: "water_shield", charges: 3 }],
      text: "The caster is surrounded by 3 globes of water. When a spell, melee, or ranged attack hits the caster or when one of the caster's spells gets a critical result, 2% of maximum mana is restored to the caster, expending one water globe. Only one globe will activate every few seconds. Lasts 10 min."
    },
    {
      id: "natures_swiftness",
      name: "Nature's Swiftness",
      icon: "spell_nature_ravenform",
      tree: "restoration",
      schools: nature2,
      target: "self",
      cooldown: 180,
      gcd: false,
      talent: "natures_swiftness",
      effects: [{ type: "applyAura", to: "self", aura: "natures_swiftness" }],
      text: "When activated, your next Nature spell with a casting time less than 10 sec. becomes an instant cast spell."
    }
  ];

  // src/classes/shaman/spellbook.js
  var totem2 = (id) => ({ tags: ["totem"], harmful: false, target: "self", range: void 0, effects: [{ type: "totem", totem: id }] });
  var UTILITY = ["earthbind_totem", "stoneclaw_totem", "stoneskin_totem", "tremor_totem", "frost_resistance_totem", "fire_resistance_totem", "healing_stream_totem", "poison_cleansing_totem", "disease_cleansing_totem", "nature_resistance_totem", "grounding_totem", "windwall_totem"];
  var heal4 = (extra10) => ({ notSimulated: false, schools: ["nature"], target: "ally", range: 40, harmful: false, tags: ["heal"], ...extra10 });
  var costOf = (g, id) => {
    const ab = g.ability(id);
    return ab ? g.costOf(ab) : 0;
  };
  var CALLS = ["call_of_the_elements", "call_of_the_ancestors", "call_of_the_spirits"];
  var totemSet = (g, call) => TOTEM_ELEMENTS.map((el) => (g.loadout.options || {})[`${call}_${el}`] ?? (g.cls.options[`${call}_${el}`] || {}).default).filter((t) => t && t !== "none" && g.ability(t) && g.isKnown(g.ability(t)));
  var extra9 = spellbookAbilities(SPELLBOOK9, {
    known: new Set(abilities9.map((a) => a.name)),
    talents: new Set(trees9.flatMap((t) => t.talents.map((x) => x.id))),
    overrides: {
      ...Object.fromEntries(UTILITY.map((id) => [id, totem2(id)])),
      healing_stream_totem: { ...totem2("healing_stream_totem"), notSimulated: false },
      poison_cleansing_totem: { ...totem2("poison_cleansing_totem"), notSimulated: false, dispels: ["poison"] },
      disease_cleansing_totem: { ...totem2("disease_cleansing_totem"), notSimulated: false, dispels: ["disease"] },
      cure_poison: cure(["poison"]),
      cure_disease: cure(["disease"]),
      healing_wave: heal4({ effects: [{ type: "heal", min: 1508, max: 1722, coef: 0.857 }] }),
      lesser_healing_wave: heal4({ effects: [{ type: "heal", min: 775, max: 865, coef: 0.429 }] }),
      chain_heal: heal4({ effects: [{ type: "chainHeal", targets: 3, radius: 12.5, falloff: 0.5, min: 474, max: 539, coef: 0.714, bonus: (g, ctx) => findAura(ctx.target, "riptide", g.player) ? 1.25 : 1 }] }),
      riptide: heal4({ effects: [{ type: "hot", aura: "riptide", base: 161, coef: 0.1 }] }),
      // heal over time only (launch client)
      totemic_recall: {
        notSimulated: false,
        effects: [{ type: "custom", run: (g) => {
          for (const t of g.totems.slice()) {
            g.gainPower("mana", 0.25 * costOf(g, t.def.id));
            removeTotem(g, t, "recalled");
          }
        } }]
      },
      ...Object.fromEntries(CALLS.map((id) => [id, {
        notSimulated: false,
        tags: ["totem"],
        cost: (g) => totemSet(g, id).reduce((n, t) => n + costOf(g, t), 0),
        usable: (g) => totemSet(g, id).length ? null : "No totems set for it (Gear and options, Totem bar)",
        tipNote: (g) => `Totem bar: ${totemSet(g, id).map((t) => g.ability(t).name).join(", ") || "empty"}.`,
        effects: [{ type: "custom", run: (g, ctx) => {
          for (const t of totemSet(g, id)) placeTotem(g, g.totemDef(t), ctx);
        } }]
      }]))
    },
    auraOverrides: { lightning_shield: { exclusive: "elemental_shield", charges: 3 } }
  });
  extra9.auras.riptide = { id: "riptide", name: "Riptide", icon: "spell_nature_riptide", kind: "buff", hot: true, period: 3, duration: 15, desc: (a) => `Healing ${Math.round(a.data.perTick || 0)} every 3 sec. Your Chain Heal on this target heals 25% more.` };

  // src/classes/shaman/auras.js
  var imbueAura = (id, name, icon2, desc, extra10) => ({ id, name, icon: icon2, kind: "buff", exclusive: "imbue", desc, ...extra10 });
  var auras9 = {
    // Ancestral Healing: a critical heal raises the target's armor (allies in the tests read data.armorMult).
    ancestral_fortitude: { id: "ancestral_fortitude", name: "Ancestral Fortitude", icon: "spell_nature_undyingstrength", kind: "buff", duration: 15, mods: (a) => [mult("armor", a.data.armorMult || 1)], desc: (a) => `Armor increased by ${Math.round(((a.data.armorMult || 1) - 1) * 100)}%.` },
    /* ---------- weapon imbues (one at a time on the weapon) ---------- */
    windfury_weapon: imbueAura(
      "windfury_weapon",
      "Windfury Weapon",
      "spell_nature_cyclone",
      (a, g) => `20% chance per hit for 2 extra attacks with ${Math.round(333 * (1 + [0, 0.13, 0.27, 0.4][g.rank("elemental_weapons")]))} more attack power.`
    ),
    rockbiter_weapon: imbueAura(
      "rockbiter_weapon",
      "Rockbiter Weapon",
      "spell_nature_rockbiter",
      (a, g) => `Melee attack power increased by ${Math.round(653 * (1 + [0, 0.07, 0.13, 0.2][g.rank("elemental_weapons")]))}.`,
      { mods: () => [add("attackPower", (ctx, g) => 653 * (1 + [0, 0.07, 0.13, 0.2][g.rank("elemental_weapons")]))] }
    ),
    flametongue_weapon: imbueAura("flametongue_weapon", "Flametongue Weapon", "spell_fire_flametounge", () => "Each hit causes additional Fire damage, more with slower weapons."),
    frostbrand_weapon: imbueAura("frostbrand_weapon", "Frostbrand Weapon", "spell_frost_frostbrand", () => "Hits have a chance to cause 169 additional Frost damage."),
    /* ---------- totem auras (on the Shaman while in range of the totem) ---------- */
    strength_of_earth: { id: "strength_of_earth", name: "Strength of Earth", icon: "spell_nature_earthbindtotem", kind: "buff", mods: () => [{ key: "attributes", fn: (a) => ({ ...a, str: a.str + 53 }) }], desc: () => "Strength increased by 53." },
    grace_of_air: { id: "grace_of_air", name: "Grace of Air", icon: "spell_nature_invisibilitytotem", kind: "buff", mods: () => [{ key: "attributes", fn: (a) => ({ ...a, agi: a.agi + 89 }) }], desc: () => "Agility increased by 89." },
    windfury_totem: { id: "windfury_totem", name: "Windfury Totem", icon: "spell_nature_windfury", kind: "buff", desc: () => "Main hand hits have a 20% chance of 1 extra attack with 246 more attack power (not with Windfury Weapon)." },
    flametongue_totem: { id: "flametongue_totem", name: "Flametongue Totem", icon: "spell_nature_guardianward", kind: "buff", desc: () => "Main hand hits cause 17 to 55 additional Fire damage (not with Flametongue Weapon)." },
    mana_spring: {
      id: "mana_spring",
      name: "Mana Spring",
      icon: "spell_nature_manaregentotem",
      kind: "buff",
      period: 2,
      onTick: (g) => g.gainPower("mana", 10 * (1 + 0.05 * g.rank("restorative_totems"))),
      desc: () => "Restores mana every 2 sec."
    },
    mana_tide: { id: "mana_tide", name: "Mana Tide", icon: "spell_frost_summonwaterelemental", kind: "buff", period: 3, onTick: (g) => g.gainPower("mana", 290), desc: () => "Restores 290 mana every 3 sec." },
    /* ---------- buffs ---------- */
    clearcasting: {
      id: "clearcasting",
      name: "Clearcasting",
      icon: "spell_shadow_manaburn",
      kind: "buff",
      duration: 15,
      mods: () => [set("cost", 0, (ctx) => !!ctx.ability && !!ctx.ability.harmful && !hasSchool(ctx, "physical"))],
      desc: () => "Your next damage spell costs no mana."
    },
    elemental_devastation: {
      id: "elemental_devastation",
      name: "Elemental Devastation",
      icon: "spell_fire_elementaldevastation",
      kind: "buff",
      duration: 10,
      mods: (a, g) => [add("critChance", 0.03 * g.rank("elemental_devastation"), (ctx) => !!ctx.melee)],
      desc: (a, g) => `Melee critical strike chance increased by ${3 * g.rank("elemental_devastation")}%.`
    },
    lightning_mastery: {
      id: "lightning_mastery",
      name: "Lightning Mastery",
      icon: "spell_nature_wispheal",
      kind: "buff",
      duration: 15,
      mods: () => [add("castTime", -0.5, (ctx) => isAbility(ctx, "lightning_bolt")), set("cooldown", 0, (ctx) => isAbility(ctx, "chain_lightning"))],
      desc: () => "Lightning Bolt casts 0.5 sec faster; Chain Lightning has no cooldown."
    },
    flurry: {
      id: "flurry",
      name: "Flurry",
      icon: "ability_ghoulfrenzy",
      kind: "buff",
      duration: 15,
      charges: 3,
      mods: (a, g) => [mult("attackSpeed", 1 + 0.06 * g.rank("flurry"))],
      desc: (a, g) => `Attack speed increased by ${6 * g.rank("flurry")}% for ${a.charges} more swings.`
    },
    maelstrom_weapon: {
      id: "maelstrom_weapon",
      name: "Maelstrom Weapon",
      icon: "spell_shaman_maelstromweapon",
      kind: "buff",
      duration: 30,
      maxStacks: 5,
      mods: (a, g) => {
        const k = 1 - Math.min(1, 0.2 * a.stacks);
        return [mult("castTime", k, (ctx) => isAbility(ctx, "lightning_bolt")), mult("cost", k, (ctx) => isAbility(ctx, "lightning_bolt"))];
      },
      desc: (a) => `Your next Lightning Bolt has ${Math.min(100, 20 * a.stacks)}% less cast time and mana cost.`
    },
    rage_of_the_farseer: { id: "rage_of_the_farseer", name: "Rage of the Farseer", icon: "spell_nature_bloodlust", kind: "buff", duration: 25, mods: () => [mult("attackSpeed", 1.3)], desc: () => "Attack speed increased by 30%." },
    improved_stormstrike: { id: "improved_stormstrike", name: "Improved Stormstrike", icon: "spell_shaman_improvedstormstrike", kind: "buff", duration: 15, mods: () => [add("regenWhileCasting", 0.5)], desc: () => "50% of your mana regeneration continues while casting." },
    water_shield: { id: "water_shield", name: "Water Shield", icon: "ability_shaman_watershield", kind: "buff", duration: 600, charges: 3, exclusive: "elemental_shield", desc: (a) => `${a.charges} water globes. A spell critical strike restores 2% of maximum mana.` },
    natures_swiftness: {
      id: "natures_swiftness",
      name: "Nature's Swiftness",
      icon: "spell_nature_ravenform",
      kind: "buff",
      duration: Infinity,
      mods: () => [set("castTime", 0, (ctx) => hasSchool(ctx, "nature") && !!ctx.ability && ctx.ability.castTime > 0 && ctx.ability.castTime < 10)],
      desc: () => "Your next Nature spell is instant."
    },
    /* ---------- on the target ---------- */
    flame_shock: { id: "flame_shock", name: "Flame Shock", icon: "spell_fire_flameshock", kind: "debuff", schools: ["fire"], dot: { period: 3, ticks: 4, base: 320, coef: 0.4 } },
    stormstrike: {
      id: "stormstrike",
      name: "Stormstrike",
      icon: "ability_shaman_stormstrike",
      kind: "debuff",
      duration: 12,
      sourceMods: () => [mult("damageMult", 1.2, (ctx) => !ctx.periodic && isAbility(ctx, "lightning_bolt", "chain_lightning", "earth_shock"))],
      desc: () => "Next Lightning Bolt, Chain Lightning or Earth Shock from the Shaman deals 20% more damage."
    }
  };
  var totems = {
    searing_totem: { id: "searing_totem", name: "Searing Totem", icon: "spell_fire_searingtotem", element: "fire", duration: 55, attack: { every: 2.2, range: 20, min: 40, max: 54, coef: 0.017, schools: ["fire"], name: "Searing Totem" } },
    magma_totem: { id: "magma_totem", name: "Magma Totem", icon: "spell_fire_selfdestruct", element: "fire", duration: 20, firstIn: 2, pulse: { every: 2, radius: 8, min: 73, max: 73, coef: 0.033, schools: ["fire"], name: "Magma Totem" } },
    flametongue_totem: { id: "flametongue_totem", name: "Flametongue Totem", icon: "spell_nature_guardianward", element: "fire", duration: 300, radius: 30, aura: "flametongue_totem" },
    strength_of_earth_totem: { id: "strength_of_earth_totem", name: "Strength of Earth Totem", icon: "spell_nature_earthbindtotem", element: "earth", duration: 300, radius: 30, aura: "strength_of_earth" },
    grace_of_air_totem: { id: "grace_of_air_totem", name: "Grace of Air Totem", icon: "spell_nature_invisibilitytotem", element: "air", duration: 300, radius: 30, aura: "grace_of_air" },
    windfury_totem: { id: "windfury_totem", name: "Windfury Totem", icon: "spell_nature_windfury", element: "air", duration: 300, radius: 30, aura: "windfury_totem" },
    mana_spring_totem: { id: "mana_spring_totem", name: "Mana Spring Totem", icon: "spell_nature_manaregentotem", element: "water", duration: 300, radius: 30, aura: "mana_spring" },
    // Utility totems: they take their element's place; their effects do nothing in the lab.
    ...Object.fromEntries([
      ["earthbind_totem", "Earthbind Totem", "spell_nature_strengthofearthtotem02", "earth", 45],
      ["stoneclaw_totem", "Stoneclaw Totem", "spell_nature_stoneclawtotem", "earth", 15],
      ["stoneskin_totem", "Stoneskin Totem", "spell_nature_stoneskintotem", "earth", 300],
      ["tremor_totem", "Tremor Totem", "spell_nature_tremortotem", "earth", 300],
      ["frost_resistance_totem", "Frost Resistance Totem", "spell_frostresistancetotem_01", "fire", 300],
      ["fire_resistance_totem", "Fire Resistance Totem", "spell_fireresistancetotem_01", "water", 300],
      ["nature_resistance_totem", "Nature Resistance Totem", "spell_nature_natureresistancetotem", "air", 300],
      ["grounding_totem", "Grounding Totem", "spell_nature_groundingtotem", "air", 45],
      ["windwall_totem", "Windwall Totem", "spell_nature_earthbind", "air", 300]
    ].map(([id, name, icon2, element, duration]) => [id, { id, name, icon: icon2, element, duration }])),
    poison_cleansing_totem: { id: "poison_cleansing_totem", name: "Poison Cleansing Totem", icon: "spell_nature_poisoncleansingtotem", element: "water", duration: 300, cleansePulse: { every: 5, radius: 30, types: ["poison"] } },
    disease_cleansing_totem: { id: "disease_cleansing_totem", name: "Disease Cleansing Totem", icon: "spell_nature_diseasecleansingtotem", element: "water", duration: 300, cleansePulse: { every: 5, radius: 30, types: ["disease"] } },
    healing_stream_totem: { id: "healing_stream_totem", name: "Healing Stream Totem", icon: "inv_spear_04", element: "water", duration: 300, healPulse: { every: 2, radius: 30, amount: 11 } },
    mana_tide_totem: { id: "mana_tide_totem", name: "Mana Tide Totem", icon: "spell_frost_summonwaterelemental", element: "water", duration: 12, radius: 30, aura: "mana_tide" }
  };

  // src/classes/shaman/presets.js
  var gearRoles5 = { melee: "Melee", caster: "Caster", healer: "Healer" };
  var melee6 = (tier, name, blurb, gear) => ({ id: `${tier}_melee`, tier, role: "melee", name, blurb, gear: { sp: 0, heal: 0, haste: 0, ...gear } });
  var caster3 = (tier, name, blurb, gear) => ({ id: `${tier}_caster`, tier, role: "caster", name, blurb, gear: { str: 0, agi: 0, ap: 0, heal: 0, haste: 0, wdps2h: 50, wdps: 40, ...gear } });
  var healer4 = (tier, name, blurb, gear) => ({ id: `${tier}_healer`, tier, role: "healer", name, blurb, gear: { str: 0, agi: 0, ap: 0, hit: 0, haste: 0, wdps2h: 50, wdps: 40, ...gear } });
  var gearPresets9 = [
    melee6("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { str: 80, agi: 50, sta: 90, int: 50, spi: 20, ap: 30, crit: 0.01, hit: 0.01, mp5: 0, wdps2h: 50, wdps: 38 }),
    melee6("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { str: 148, agi: 98, sta: 111, int: 36, spi: 0, ap: 150, sp: 33, crit: 0.08, hit: 0.049, parry: 0.01, mp5: 0, wdps2h: 59, wdps: 46, armor: 2156 }),
    caster3("fresh", "Fresh 60", "Quest and dungeon greens and blues.", { int: 100, spi: 50, sta: 90, sp: 120, crit: 0.01, hit: 0.01, mp5: 2 }),
    caster3("preraid", "Pre-raid", "Best dungeon, quest and crafted gear before raids.", { int: 115, spi: 10, sta: 59, sp: 384, spSchool: { fire: 24 }, crit: 0.01, hit: 0.02, mp5: 0, armor: 2146 }),
    healer4("fresh", "Fresh 60", "Quest and dungeon greens and blues for healing.", { int: 100, spi: 50, sta: 90, sp: 0, heal: 150, crit: 0.01, mp5: 2 }),
    healer4("preraid", "Pre-raid", "Best dungeon, quest and crafted healing gear before raids.", { int: 68, spi: 57, sta: 97, sp: 29, heal: 736, crit: 0, mp5: 9, armor: 2118 })
  ];
  var builds9 = [
    {
      id: "elemental_combat",
      name: "Elemental",
      points: "31/9/11",
      gearRole: "caster",
      blurb: "Searing Totem down, Flame Shock up, Lightning Bolt as the main spell (2 sec casts with Elemental Alacrity, more crits with Call of Thunder), Earth Shock when Flame Shock has time left. Elemental Fury doubles the crit bonus, Lightning Overload adds free half bolts and Lightning Mastery speeds a burst. Water Shield gives mana back on crits.",
      options: { mainHand: "mace", offHand: "shield", imbue: "flametongue_weapon", call_of_the_elements_earth: "none", call_of_the_elements_air: "none" },
      talents: {
        convection: 5,
        concussion: 5,
        elemental_alacrity: 3,
        call_of_flame: 3,
        elemental_focus: 1,
        trial_by_fire: 2,
        eye_of_the_storm: 2,
        call_of_thunder: 1,
        lightning_overload: 3,
        elemental_fury: 5,
        lightning_mastery: 1,
        thundering_strikes: 5,
        ancestral_knowledge: 4,
        tidal_focus: 5,
        mindfulness: 3,
        natural_grace: 2,
        water_shield: 1
      },
      bar: ["lightning_bolt", "flame_shock", "earth_shock", "searing_totem", "chain_lightning", "lightning_mastery", "water_shield", "mana_spring_totem", "magma_totem", "fire_nova", "call_of_the_elements", "major_mana_potion"]
    },
    {
      id: "enhancement",
      name: "Enhancement",
      points: "8/34/9",
      gearRole: "melee",
      blurb: "A two-hander with Windfury Weapon, Strength of Earth and Windfury totems. Stormstrike on cooldown, then Earth Shock into its 20%; Flurry speeds swings after crits and Maelstrom Weapon turns the hits into instant Lightning Bolts. Rage of the Farseer for 30% attack speed. Mental Dexterity turns Intellect into attack power.",
      options: { mainHand: "two_hand_mace", offHand: "none", imbue: "windfury_weapon" },
      talents: {
        concussion: 5,
        elemental_devastation: 3,
        thundering_strikes: 5,
        ancestral_knowledge: 5,
        mental_dexterity: 3,
        elemental_weapons: 3,
        shamanistic_focus: 1,
        flurry: 5,
        stormstrike: 1,
        spirit_weapons: 1,
        mental_quickness: 2,
        improved_stormstrike: 2,
        maelstrom_weapon: 5,
        rage_of_the_farseer: 1,
        tidal_focus: 5,
        mindfulness: 3,
        natural_grace: 1
      },
      bar: ["stormstrike", "flame_shock", "earth_shock", "lightning_bolt", "searing_totem", "rage_of_the_farseer", "strength_of_earth_totem", "mana_spring_totem", "magma_totem", "fire_nova", "call_of_the_elements", "major_mana_potion"]
    },
    {
      id: "restoration",
      name: "Restoration",
      points: "0/5/46",
      gearRole: "healer",
      scenario: "raid-healing",
      blurb: "A healer build for the Healing test: Riptide on the tank, Chain Heal into hurt groups (25% more on a Riptide target), Healing Wave for big heals and Lesser Healing Wave when it is urgent; Nature's Swiftness for an instant one. Water Shield and Mana Tide Totem keep the mana up; Mana Spring or Healing Stream is your one water totem.",
      options: { mainHand: "mace", offHand: "shield", imbue: "flametongue_weapon", call_of_the_elements_earth: "none", call_of_the_elements_fire: "none", call_of_the_elements_water: "healing_stream_totem", call_of_the_elements_air: "none" },
      talents: {
        ancestral_knowledge: 5,
        improved_healing_wave: 5,
        tidal_focus: 5,
        mindfulness: 3,
        totemic_focus: 5,
        ancestral_healing: 3,
        healing_focus: 3,
        water_shield: 1,
        tidal_mastery: 5,
        restorative_totems: 5,
        mana_tide_totem: 1,
        healing_way: 3,
        natures_swiftness: 1,
        purification: 5,
        riptide: 1
      },
      bar: ["healing_wave", "lesser_healing_wave", "chain_heal", "riptide", "natures_swiftness", "water_shield", "mana_spring_totem", "healing_stream_totem", "mana_tide_totem", "cure_poison", "call_of_the_elements", "major_mana_potion"]
    }
  ];

  // src/classes/shaman/shaman.js
  var MAIN_HANDS4 = ["two_hand_mace", "two_hand_axe", "mace", "axe", "fist", "dagger"];
  var OFF_HANDS4 = ["none", "shield"];
  var TOTEM_DEFAULTS = {
    call_of_the_elements: { earth: "strength_of_earth_totem", fire: "searing_totem", water: "mana_spring_totem", air: "windfury_totem" },
    call_of_the_ancestors: { earth: "stoneskin_totem", fire: "magma_totem", water: "healing_stream_totem", air: "grace_of_air_totem" },
    call_of_the_spirits: {}
  };
  var totemBarOptions = () => Object.fromEntries(CALLS.flatMap((call) => ["earth", "fire", "water", "air"].map((el) => {
    const list = Object.values(totems).filter((t) => t.element === el).map((t) => t.id);
    return [`${call}_${el}`, { label: el, hidden: true, values: ["none", ...list], names: { none: "None", ...Object.fromEntries(list.map((id) => [id, totems[id].name])) }, default: TOTEM_DEFAULTS[call][el] || "none" }];
  })));
  var IMBUES = ["windfury_weapon", "rockbiter_weapon", "flametongue_weapon", "frostbrand_weapon", "none"];
  var isPlayer8 = (game, ev) => ev.ctx.caster === game.player;
  var landedRes6 = (res) => res && (res.outcome === "hit" || res.outcome === "crit" || res.outcome === "glance");
  var mainHit = (game, ev) => isPlayer8(game, ev) && !ev.periodic && ev.ctx.melee && ev.ctx.hand === "main" && landedRes6(ev.res);
  var imbueOn = (game, id) => !!findAura(game.player, id);
  var elementalSpell = (ctx) => !ctx.melee && (hasSchool(ctx, "fire") || hasSchool(ctx, "frost") || hasSchool(ctx, "nature"));
  var damageSpell2 = (ctx) => !!ctx.ability && !!ctx.ability.harmful && !hasSchool(ctx, "physical");
  var isShock = (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("shock");
  var fireTotem = (ctx) => !!ctx.totem && ctx.totem.def.element === "fire";
  var EW = (g, list) => list[g.rank("elemental_weapons")];
  var ftDamage = (w, lo, hi) => lo + (hi - lo) * clamp((w.speed - 1.2) / 2.8, 0, 1);
  var FROSTBRAND_PPM = 9;
  var MAELSTROM_PPM = [6, 7, 8, 9, 10];
  var WATER_SHIELD_GAP = 3.5;
  var meleeCrit2 = (s) => 0.017 + s.agi / 20 / 100;
  var spellCrit2 = (s) => 0.022 + s.int / 59.5 / 100;
  var procCtx = (game, target, id, name, icon2, schools) => ({ castId: ++game.castSeq, caster: game.player, target, schools, tags: ["imbue"], ability: { id, name, icon: icon2, schools, harmful: true } });
  var shaman = {
    id: "shaman",
    name: "Shaman",
    // The tests it can take. No Tank test for now: the Shaman can tank in Forever (Rockbiter, Spirit Weapons, a shield),
    // but the lab still lacks its tank gear (armor, defense, block) and threat (Earth Shock, Lightning Shield).
    roles: ["dps", "healer"],
    icon: "classicon_shaman",
    color: "#0070de",
    resource: "mana",
    gcd: 1.5,
    source: SOURCE9,
    // Level 60 Orc Shaman base stats (Classic, approximate). Attack power: Strength x 2 + level x 2 - 20.
    stats: {
      level: 60,
      base: { str: 85, agi: 52, sta: 94, int: 90, spi: 107 },
      baseHp: 1280,
      baseMana: 1520,
      derive(a) {
        const conv = (v, per5) => Math.min(v, 20) + Math.max(0, v - 20) * per5;
        return {
          maxHp: 1280 + conv(a.sta, 10) - 20,
          maxMana: 1520 + conv(a.int, 15) - 20,
          ap: a.str * 2 + 100,
          crit: 0,
          // added per attack or spell below (mods)
          regen: (17 + a.spi / 5) / 2
          // Shaman Spirit regeneration, per second
        };
      }
    },
    // Main hand from the chosen type; a one-hander can carry a shield.
    weapons(game) {
      const o = game.loadout.options || {}, g = game.loadout.gear || {};
      const mh = MAIN_HANDS4.includes(o.mainHand) ? o.mainHand : "two_hand_mace";
      if (WEAPON_TYPES[mh].twoHand) return { main: makeWeapon(mh, "main", g.wdps2h || 60), off: null };
      const main = makeWeapon(mh, "main", g.wdps || 45);
      return o.offHand === "shield" ? { main, off: null, shield: { block: 0 } } : { main, off: null };
    },
    // Weapon imbue bar beside the action bar.
    totemBar: { calls: CALLS, elements: ["earth", "fire", "water", "air"] },
    // shown in Gear and options
    stanceBar: { label: "Weapon imbues", abilities: ["windfury_weapon", "rockbiter_weapon", "flametongue_weapon", "frostbrand_weapon"] },
    trees: trees9,
    talentHistory: talentHistory8,
    // earlier trees, so older build links still open (talent-history.js)
    abilities: [...abilities9, ...extra9.abilities],
    // the rest of the spellbook: spellbook.js
    auras: { ...auras9, ...extra9.auras },
    totems,
    gearPresets: gearPresets9,
    gearRoles: gearRoles5,
    builds: builds9,
    gearFields: [
      { k: "str", label: "Strength", step: 5, max: 600 },
      { k: "agi", label: "Agility", step: 5, max: 400 },
      { k: "ap", label: "Attack power", step: 10, max: 1e3, note: "From gear, on top of Strength." },
      { k: "int", label: "Intellect", step: 5, max: 600 },
      { k: "spi", label: "Spirit", step: 5, max: 500 },
      { k: "sp", label: "Spell power", step: 10, max: 1200 },
      { k: "heal", label: "Bonus healing", step: 10, max: 1500, note: "Increases healing done by up to this much and damage done by up to a third of it, for all magical spells and effects." },
      { k: "crit", label: "Crit %", step: 0.5, max: 30, pct: true },
      { k: "hit", label: "Hit %", step: 1, max: 20, pct: true },
      { k: "expertise", label: "Expertise %", step: 0.5, max: 15, pct: true, note: "Reduces the chance for your attacks to be dodged or parried by this much. A raid boss dodges 6.5% and, from the front, parries 14%." },
      { k: "mp5", label: "Mana per 5 sec", step: 1, max: 60 },
      { k: "haste", label: "Haste %", step: 1, max: 30, pct: true, note: "No Forever gear has haste yet (beta). Only racials and buffs." },
      { k: "wdps2h", label: "Two-hander DPS", step: 1, max: 120 },
      { k: "wdps", label: "One-hander DPS", step: 1, max: 90 }
    ],
    options: {
      mainHand: { label: "Main hand", values: MAIN_HANDS4, names: weaponNames(MAIN_HANDS4), default: "two_hand_mace" },
      offHand: { label: "Off hand", values: OFF_HANDS4, names: { none: "None", shield: "Shield" }, default: "none", note: "Ignored with a two-handed weapon." },
      // The imbue at the start of a fight: the last one cast from the imbue bar (hidden from the gear panel).
      imbue: { label: "Weapon imbue", hidden: true, values: IMBUES, names: { windfury_weapon: "Windfury Weapon", rockbiter_weapon: "Rockbiter Weapon", flametongue_weapon: "Flametongue Weapon", frostbrand_weapon: "Frostbrand Weapon", none: "None" } },
      // unset: the spec's
      ...totemBarOptions()
    },
    sheet(game, f) {
      const s = game.stats(), w = shaman.weapons(game);
      return [
        ["Strength", f.int(s.str)],
        ["Agility", f.int(s.agi)],
        ["Intellect", f.int(s.int)],
        ["Mana", f.int(s.maxMana)],
        ["Attack power", f.int(s.ap)],
        ["Spell power", f.int(s.sp)],
        ...s.healExtra ? [["Healing power", f.int(s.sp + s.healExtra)]] : [],
        ["Attack crit", f.pct(meleeCrit2(s) + s.crit)],
        ["Spell crit", f.pct(spellCrit2(s) + s.crit)],
        ["Hit chance", f.pct(s.hit)],
        ["Main hand", describeWeapon(w.main)],
        ["Off hand", w.shield ? "Shield" : "None"]
      ];
    },
    // The chosen weapon imbue is on from the start (it lasts an hour); casting another one replaces it.
    onReset(game) {
      const im = (game.loadout.options || {}).imbue || (game.mainTree() === "enhancement" ? "windfury_weapon" : "flametongue_weapon");
      if (im !== "none") game.applyPermanent(game.player, im);
    },
    startBuffs(game) {
      return [game.rank("water_shield") ? "water_shield" : "lightning_shield"];
    },
    mods() {
      return [
        add("critChance", (ctx, g) => ctx.melee ? meleeCrit2(g.stats()) : spellCrit2(g.stats())),
        add("attackPower", (ctx, g) => g.player.extraAttackAp || 0)
        // Windfury attacks
      ];
    },
    listen(game, on) {
      const p = () => game.player;
      let lastGlobe = -99;
      on("damage", (ev) => {
        if (!mainHit(game, ev)) return;
        const w = weaponsOf(game).main, t = ev.ctx.target;
        if (!w || !t || t.dead) return;
        if (imbueOn(game, "flametongue_weapon")) {
          const n = ftDamage(w, 35, 112) * (1 + EW(game, [0, 0.05, 0.1, 0.15]));
          spellHit(game, procCtx(game, t, "flametongue_attack", "Flametongue Attack", "spell_fire_flametounge", ["fire"]), { min: n, max: n, coef: 0.1, name: "Flametongue Attack" });
        } else if (findAura(p(), "flametongue_totem")) {
          const n = ftDamage(w, 17, 55);
          spellHit(game, procCtx(game, t, "flametongue_totem_attack", "Flametongue Totem", "spell_nature_guardianward", ["fire"]), { min: n, max: n, coef: 0.05, name: "Flametongue Totem" });
        }
        if (imbueOn(game, "frostbrand_weapon") && game.rng() < FROSTBRAND_PPM * w.speed / 60) {
          const n = 169 * (1 + EW(game, [0, 0.05, 0.1, 0.15]));
          spellHit(game, procCtx(game, t, "frostbrand_attack", "Frostbrand Attack", "spell_frost_frostbrand", ["frost"]), { min: n, max: n, coef: 0.1, name: "Frostbrand Attack" });
        }
        if (p().extraAttackAp) return;
        const procs = [];
        if (imbueOn(game, "windfury_weapon") && game.rng() < 0.2) procs.push([2, 333 * (1 + EW(game, [0, 0.13, 0.27, 0.4]))]);
        if (findAura(p(), "windfury_totem") && game.rng() < 0.2) procs.push([1, 246]);
        for (const [n, ap] of procs) {
          p().extraAttackAp = ap;
          for (let i = 0; i < n && !t.dead; i++) swing(game, "main", t, "Windfury Attack");
        }
        p().extraAttackAp = 0;
      });
      on("cast:success", ({ ability, ctx }) => {
        const cc = findAura(p(), "clearcasting");
        if (cc && damageSpell2(ctx) && ctx.baseCost > 0) removeAura(game, cc, "consumed");
        const ns = findAura(p(), "natures_swiftness");
        if (ns && ability.id !== "natures_swiftness" && hasSchool(ctx, "nature") && ability.castTime > 0) removeAura(game, ns, "consumed");
        if (ability.id === "lightning_bolt") {
          const m = findAura(p(), "maelstrom_weapon");
          if (m) removeAura(game, m, "consumed");
        }
      });
      on("damage", (ev) => {
        if (!isPlayer8(game, ev) || ev.periodic || ev.ctx.melee) return;
        if (isAbility(ev.ctx, "lightning_bolt", "chain_lightning", "earth_shock") && !ev.ctx.chainJump) {
          const ss = findAura(ev.ctx.target, "stormstrike", p());
          if (ss && landedRes6(ev.res)) removeAura(game, ss, "consumed");
        }
        const ws = findAura(p(), "water_shield");
        if (ws && ev.res.outcome === "crit" && game.time - lastGlobe >= WATER_SHIELD_GAP && !(ev.ctx.tags || []).includes("totem")) {
          lastGlobe = game.time;
          game.gainPower("mana", 0.02 * game.stats().maxMana);
          useCharge(game, ws);
        }
      });
      const globe = () => {
        const ws = findAura(p(), "water_shield");
        if (!ws || game.time - lastGlobe < WATER_SHIELD_GAP) return;
        lastGlobe = game.time;
        game.gainPower("mana", 0.02 * game.stats().maxMana);
        useCharge(game, ws);
      };
      on("heal", (ev) => {
        if (ev.source === "player" && ev.crit && !ev.periodic) globe();
      });
      on("unitDamaged", ({ unit }) => {
        if (unit === p()) globe();
      });
    },
    talents: {
      /* ---------- Elemental Combat ---------- */
      elemental_warding: { mods: (r) => [mult("damageTaken", 1 - [0, 0.03, 0.07, 0.1][r], (ctx) => !!ctx.incoming && ["fire", "frost", "nature"].some((s) => (ctx.schools || []).includes(s)))] },
      eye_of_the_storm: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r], (ctx) => isAbility(ctx, "lightning_bolt", "chain_lightning"))] },
      convection: { mods: (r) => [mult("cost", 1 - 0.02 * r, (ctx) => isShock(ctx) || isAbility(ctx, "lightning_bolt", "chain_lightning"))] },
      concussion: { mods: (r) => [mult("damageMult", 1 + 0.01 * r, (ctx) => isAbility(ctx, "lightning_bolt", "chain_lightning", "earth_shock"))] },
      elemental_devastation: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (isPlayer8(game, ev) && !ev.periodic && !ev.ctx.melee && ev.res.outcome === "crit" && !(ev.ctx.tags || []).includes("totem")) applyAura(game, game.player, auras9.elemental_devastation, { source: game.player });
          });
        }
      },
      reverberation: { mods: (r) => [add("cooldown", -0.2 * r, isShock)] },
      elemental_alacrity: { mods: (r) => [add("castTime", -[0.17, 0.33, 0.5][r - 1], (ctx) => isAbility(ctx, "lightning_bolt", "chain_lightning"))] },
      call_of_flame: { mods: (r) => [mult("damageMult", 1 + 0.05 * r, (ctx) => fireTotem(ctx) || isAbility(ctx, "flame_shock", "fire_nova"))] },
      // Flame Shock's longer duration: abilities.js
      elemental_focus: {
        listen(game, r, on) {
          on("cast:success", ({ ability, ctx }) => {
            if (ability.harmful && elementalSpell(ctx) && game.rng() < 0.1) applyAura(game, game.player, auras9.clearcasting, { source: game.player });
          });
        }
      },
      trial_by_fire: {
        mods: (r) => [
          mult("damageMult", 1 + 0.1 * r, (ctx) => isAbility(ctx, "fire_nova")),
          add("cooldown", -2 * r, (ctx) => isAbility(ctx, "fire_nova")),
          add("totemDuration", 10 * r, (ctx) => ctx.totemId === "magma_totem")
        ]
      },
      elemental_reach: { mods: (r) => [add("range", 3 * r, (ctx) => isAbility(ctx, "lightning_bolt", "chain_lightning", "fire_nova"))] },
      call_of_thunder: { mods: () => [add("critChance", 0.05, (ctx) => isAbility(ctx, "lightning_bolt", "chain_lightning"))] },
      // A second bolt at half damage on the same target, free.
      lightning_overload: {
        listen(game, r, on) {
          on("spell:resolved", ({ ability, ctx }) => {
            if (!isAbility(ctx, "lightning_bolt", "chain_lightning") || ctx.overload || !ctx.target || ctx.target.dead) return;
            if (game.rng() >= [0.1, 0.2, 0.3][r - 1]) return;
            const ef = ability.effects[0];
            spellHit(game, { ...ctx, castId: ++game.castSeq, overload: true, chainJump: 0 }, { min: ef.min / 2, max: ef.max / 2, coef: ef.coef / 2, name: `${ability.name} (Overload)` });
          });
        }
      },
      elemental_fury: { mods: (r) => [mult("critBonusMult", 1 + 0.2 * r, elementalSpell)] },
      lightning_mastery: { teaches: "lightning_mastery" },
      /* ---------- Enhancement ---------- */
      anticipation: { mods: (r) => [add("dodgeChance", 0.02 * r)] },
      toughness: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, sta: a.sta * (1 + 0.02 * r) }) }] },
      // The Shaman can parry (the base 5%), and the threat changes with Rockbiter Weapon.
      spirit_weapons: { mods: () => [set("canParry", true), mult("threatMult", 0.7, (ctx, g) => !findAura(g.player, "rockbiter_weapon")), mult("threatMult", 1.3, (ctx, g) => !!findAura(g.player, "rockbiter_weapon"))] },
      thundering_strikes: { mods: (r) => [add("critChance", 0.01 * r)] },
      ancestral_knowledge: { mods: (r) => [{ key: "attributes", fn: (a) => ({ ...a, int: a.int * (1 + 0.02 * r) }) }] },
      mental_dexterity: { mods: (r) => [add("attackPower", (ctx, g) => g.stats().int * [0.33, 0.66, 1][r - 1])] },
      // was 50/100/150%
      elemental_weapons: { mods: () => [] },
      // read by the imbues (auras.js and the procs above)
      shamanistic_focus: { mods: () => [mult("cost", 0.55, isShock)] },
      flurry: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (isPlayer8(game, ev) && !ev.periodic && ev.ctx.melee && ev.res.outcome === "crit") applyAura(game, game.player, auras9.flurry, { source: game.player, charges: 3 });
          });
          on("swing", ({ res }) => {
            const a = findAura(game.player, "flurry");
            if (a && !(res && res.outcome === "crit")) useCharge(game, a);
          });
        }
      },
      stormstrike: { teaches: "stormstrike" },
      mental_quickness: { mods: (r) => [add("spellPower", (ctx, g) => g.stats().int * 0.15 * r)] },
      improved_stormstrike: {
        listen(game, r, on) {
          on("cast:success", ({ ability }) => {
            if (ability.id === "stormstrike" && game.rng() < 0.5 * r) applyAura(game, game.player, auras9.improved_stormstrike, { source: game.player });
          });
          on("hitTaken", ({ res }) => {
            if ((res.outcome === "dodge" || res.outcome === "parry") && game.rng() < 0.5 * r) delete game.player.cooldowns.stormstrike;
          });
        }
      },
      maelstrom_weapon: {
        listen(game, r, on) {
          on("damage", (ev) => {
            if (!isPlayer8(game, ev) || ev.periodic || !ev.ctx.melee || !landedRes6(ev.res)) return;
            const w = weaponsOf(game).main;
            if (w && game.rng() < MAELSTROM_PPM[r - 1] * w.speed / 60) applyAura(game, game.player, auras9.maelstrom_weapon, { source: game.player });
          });
        }
      },
      rage_of_the_farseer: { teaches: "rage_of_the_farseer" },
      /* ---------- Restoration ---------- */
      natural_grace: { mods: (r) => [mult("threatMult", 1 - 0.05 * r, (ctx) => !ctx.melee)] },
      improved_reincarnation: { mods: (r) => [mult("maxHp", 1 + 0.02 * r)] },
      ancestral_healing: {
        listen(game, r, on) {
          on("heal", (ev) => {
            if (ev.source === "player" && ev.crit && !ev.unit.dead) applyAura(game, ev.unit, auras9.ancestral_fortitude, { source: game.player, data: { armorMult: 1 + [0, 0.08, 0.17, 0.25][r] } });
          });
        }
      },
      healing_focus: { mods: (r) => [focus([0, 0.23, 0.47, 0.7][r], (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("heal"))] },
      tidal_focus: { mods: (r) => [add("hitChance", 0.01 * r), mult("cost", 1 - 0.01 * r, (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("heal"))] },
      improved_healing_wave: { mods: (r) => [add("castTime", -0.1 * r, (ctx) => isAbility(ctx, "healing_wave"))] },
      tidal_mastery: { mods: (r) => [add("critChance", 0.01 * r, (ctx) => !!ctx.heal)] },
      healing_way: { mods: (r) => [mult("healMult", 1 + 0.25 * r / 3, (ctx) => isAbility(ctx, "healing_wave"))] },
      purification: { mods: (r) => [mult("healMult", 1 + 0.02 * r)] },
      riptide: { teaches: "riptide" },
      mindfulness: { mods: (r) => [add("regenWhileCasting", [0.17, 0.33, 0.5][r - 1])] },
      // The Calls cost what their totems cost, already lowered: not lowered a second time.
      totemic_focus: { mods: (r) => [mult("cost", 1 - 0.05 * r, (ctx) => !!ctx.ability && (ctx.ability.tags || []).includes("totem") && !CALLS.includes(ctx.ability.id))] },
      restorative_totems: { mods: (r) => [mult("totemHeal", 1 + 0.1 * r, (ctx) => ctx.totemId === "healing_stream_totem")] },
      // and Mana Spring (auras.js)
      water_shield: { teaches: "water_shield" },
      mana_tide_totem: { teaches: "mana_tide_totem" },
      natures_swiftness: { teaches: "natures_swiftness" }
    }
  };

  // src/classes/registry.js
  var CLASSES = { mage, rogue, warrior, paladin, hunter, warlock, priest, druid, shaman };
  var DEFAULT_CLASS = "mage";

  // src/scenarios/target-dummy.js
  var DUMMY_HP = 3e4;
  var usesMana = (cls) => (cls.resources || [cls.resource]).includes("mana");
  var targetDummy = {
    id: "target-dummy",
    name: "Damage",
    title: "Damage test",
    role: "dps",
    blurb: "Dummies that never hit back. You are hit capped.",
    options: {
      count: { label: "Enemies", values: [1, 5], default: 1, names: { 1: "1 dummy", 5: "5 dummies" } },
      infiniteMana: { label: "Infinite mana", type: "toggle", default: false, showIf: usesMana }
    },
    setup(game, opts = {}) {
      const count = +opts.count === 5 ? 5 : 1;
      const arena = { width: 60, height: 40 };
      const cx = 40, cy = 20;
      const spots = [[0, 0], [1.6, -3], [1.6, 3], [3.6, -1.4], [3.6, 1.4]];
      const enemies = spots.slice(0, count).map(([dx, dy], i) => ({
        id: "dummy" + (i + 1),
        kind: "enemy",
        name: "Training Dummy",
        level: 63,
        immortal: true,
        creatureType: "mechanical",
        maxHp: DUMMY_HP,
        hp: DUMMY_HP,
        resetHp: DUMMY_HP,
        x: cx + dx,
        y: cy + dy,
        radius: 1.1,
        facing: Math.PI,
        armor: 336,
        raidDebuffs: ["sunder_armor", "faerie_fire", "curse_of_recklessness"],
        resist: {},
        auras: [],
        portrait: "assets/img/training-dummy.png"
      }));
      return {
        arena,
        enemies,
        playerStart: { x: cx - 26, y: cy },
        // 26 yards from the main dummy (Frostbolt and Fireball range)
        rules: { hitCapped: true, infiniteMana: !!opts.infiniteMana }
      };
    }
  };

  // src/scenarios/raid-boss.js
  var BOSS = { name: "Generic raid boss", min: 1300, max: 1700, hp: 1e6 };
  var ROGUE_TPS = 340;
  var HEALER_HPS = 330;
  var raidBoss = {
    id: "raid-boss",
    name: "Tank",
    title: "Tank test",
    role: "tank",
    blurb: "Hold the boss while a Rogue races you for threat. A Priest heals.",
    attacks: true,
    // the fight hits back: the sheet shows the player's defense and the target frame the threat
    options: {
      threatBot: { label: "Rogue", type: "toggle", default: true },
      healer: { label: "Priest", type: "toggle", default: true },
      immortal: { label: "Immortal", type: "toggle", default: false }
    },
    setup(game, opts = {}) {
      const arena = { width: 60, height: 40 };
      const cx = 40, cy = 20, rogue2 = opts.threatBot !== false, healer5 = opts.healer !== false;
      const boss = {
        id: "boss",
        kind: "enemy",
        name: "Raid Boss",
        level: 63,
        immortal: true,
        creatureType: "dragonkin",
        boss: true,
        ccImmune: true,
        maxHp: BOSS.hp,
        hp: BOSS.hp,
        resetHp: BOSS.hp,
        x: cx,
        y: cy,
        radius: 1.5,
        facing: Math.PI,
        armor: 336,
        raidDebuffs: ["sunder_armor", "faerie_fire", "curse_of_recklessness"],
        resist: {},
        auras: [],
        portraitIcon: "inv_misc_head_dragon_black",
        subtitle: BOSS.name,
        ai: {
          min: BOSS.min,
          max: BOSS.max,
          speed: 2,
          moveSpeed: 7,
          aggroRadius: 10,
          special: { every: 15, first: 8, mult: 2.5, name: "Heavy Strike" },
          raidTps: rogue2 ? ROGUE_TPS : 0,
          raidDelay: 4
        }
      };
      const ally = (id, name, cls, color, role, x, y, maxHp, extra10 = {}) => ({ id, kind: "ally", name, cls, color, role, party: 1, x, y, radius: 0.6, maxHp, hp: maxHp, auras: [], dead: false, ...extra10 });
      const allies = [];
      const bot = rogue2 ? ally("rogue", "Rogue", "rogue", "#fff569", "dps", cx + 2.6, cy, 4600, { mitigation: 0.7, swingEvery: 1.6 }) : null;
      if (bot) allies.push(bot);
      if (healer5) allies.push(ally("priest", "Priest (healer)", "priest", "#ffffff", "healer", cx - 20, cy + 9, 4100, { healEvery: 2.5 }));
      return {
        arena,
        enemies: [boss],
        allies,
        playerParty: 1,
        playerStart: { x: cx - 26, y: cy },
        raid: bot,
        // the boss turns on the Rogue when it out-threatens you
        rules: { immortal: !!opts.immortal },
        state: { healIn: 1, swingIn: 1 }
      };
    },
    // The Priest heals whoever is lower (you first when both are hurt the same); the Rogue swings at the boss (picture).
    update(game, h2) {
      const boss = game.enemies[0], st = game.scenarioState;
      if (!boss || !boss.engaged) return;
      const rogue2 = game.allies.find((u) => u.id === "rogue" && !u.dead);
      if (rogue2) {
        st.swingIn -= h2;
        if (st.swingIn <= 0) {
          st.swingIn += rogue2.swingEvery;
          rogue2.facing = Math.atan2(boss.y - rogue2.y, boss.x - rogue2.x);
          game.emit("fx", { kind: "swipe", unit: rogue2, facing: rogue2.facing, small: true });
        }
      }
      const priest2 = game.allies.find((u) => u.id === "priest" && !u.dead);
      if (!priest2) return;
      st.healIn -= h2;
      if (st.healIn > 0) return;
      st.healIn += priest2.healEvery;
      const hurt = [game.player, ...game.allies].filter((u) => !u.dead && u.hp < game.maxHpOf(u)).sort((a, b) => a.hp / game.maxHpOf(a) - b.hp / game.maxHpOf(b));
      if (!hurt.length) return;
      game.emit("fx", { kind: "beam", from: { x: priest2.x, y: priest2.y }, to: { x: hurt[0].x, y: hurt[0].y }, schools: ["holy"] });
      healUnit(game, hurt[0], HEALER_HPS * priest2.healEvery * game.rng.range(0.85, 1.15), { name: "Priest", icon: "spell_holy_greaterheal", source: "raid" });
    }
  };

  // src/scenarios/raid-healing.js
  var T = { swing: [900, 1125], wave: [315, 405], fireball: [315, 450], dot: 63, tankArmor: 8904, hp: { tank: 8500, dps: 3900 } };
  var armorMultOf = (u) => (u.auras || []).reduce((k, a) => k * (a.data && a.data.armorMult || 1), 1);
  var DEBUFFS = {
    magic: { id: "molten_flame", name: "Molten Flame", icon: "spell_fire_incinerate", schools: ["fire"] },
    curse: { id: "curse_of_ash", name: "Curse of Ash", icon: "spell_shadow_curseofsargeras", schools: ["shadow"] },
    poison: { id: "searing_venom", name: "Searing Venom", icon: "spell_nature_corrosivebreath", schools: ["nature"] },
    disease: { id: "creeping_rot", name: "Creeping Rot", icon: "spell_shadow_creepingplague", schools: ["shadow"] }
  };
  var debuffAura = (type, d) => ({
    id: d.id,
    name: d.name,
    icon: d.icon,
    kind: "debuff",
    dispelType: type,
    schools: d.schools,
    period: 2,
    duration: 30,
    onTick: (g, a) => damageUnit(g, a.unit, T.dot, { name: d.name, schools: d.schools }),
    desc: () => `${type[0].toUpperCase()}${type.slice(1)}. Taking ${T.dot} damage every 2 sec.`
  });
  var dispelTypes = (game) => {
    const bar = (game.loadout.bar || []).filter(Boolean), o = game.loadout.options || {};
    const calls = (game.cls.totemBar || { calls: [] }).calls.filter((c) => bar.includes(c));
    const ids = [...bar, ...calls.flatMap((c) => game.cls.totemBar.elements.map((el) => o[`${c}_${el}`] ?? (game.cls.options[`${c}_${el}`] || {}).default))];
    return [...new Set(ids.map((id) => id && game.ability(id)).filter((ab) => ab && game.isKnown(ab)).flatMap((ab) => ab.dispels || []))];
  };
  var raidHealing = {
    id: "raid-healing",
    name: "Healing",
    title: "Healing test",
    role: "healer",
    blurb: "Keep a tank and a Mage alive against the boss.",
    heals: true,
    // the HUD shows the group frames
    options: {
      infiniteMana: { label: "Infinite mana", type: "toggle", default: false },
      immortal: { label: "Everyone immortal", type: "toggle", default: false },
      debuffs: { label: "Dispellable debuffs", type: "toggle", default: true }
    },
    auras: Object.fromEntries(Object.entries(DEBUFFS).map(([type, d]) => [d.id, debuffAura(type, d)])),
    setup(game, opts = {}) {
      const ally = (id, name, cls, color, role, x, y) => ({ id, kind: "ally", name, cls, color, role, party: 1, x, y, radius: 0.6, maxHp: T.hp[role], hp: T.hp[role], auras: [], dead: false, immortal: !!opts.immortal, mainTank: role === "tank" });
      const allies = [ally("tank", "Warrior (tank)", "warrior", "#c79c6e", "tank", 36.6, 20), ally("mage", "Mage", "mage", "#69ccf0", "dps", 27, 24)];
      const boss = {
        id: "boss",
        kind: "enemy",
        name: "Raid Boss",
        level: 63,
        immortal: true,
        creatureType: "dragonkin",
        boss: true,
        ccImmune: true,
        maxHp: 1e6,
        hp: 1e6,
        resetHp: 1e6,
        x: 40,
        y: 20,
        radius: 1.5,
        facing: Math.PI,
        armor: 336,
        raidDebuffs: ["sunder_armor", "faerie_fire", "curse_of_recklessness"],
        resist: {},
        auras: [],
        portraitIcon: "inv_misc_head_dragon_black",
        subtitle: "Healing test"
      };
      return {
        arena: { width: 60, height: 40 },
        enemies: [boss],
        allies,
        playerParty: 1,
        playerStart: { x: 28, y: 18 },
        // within 10 yd of the tank and the Mage (Holy Nova)
        rules: { infiniteMana: !!opts.infiniteMana, immortal: !!opts.immortal },
        state: { debuffs: opts.debuffs !== false, pullAt: 3, pulled: false, swingIn: 0, specialIn: 8, waveIn: 12, fireballIn: 6, debuffIn: 7 }
      };
    },
    update(game, h2) {
      const st = game.scenarioState, p = game.player, m = game.meter, boss = game.enemies[0];
      if (!st || !boss) return;
      if (!st.pulled) {
        if (game.time < st.pullAt) return;
        st.pulled = true;
        if (m.first == null) m.first = game.time;
        game.emit("error", "The tank pulls the boss");
      }
      const alive = raidMembers(game).filter((u) => !u.dead);
      if (!alive.length) return;
      if (!p.dead) m.last = game.time;
      const roll = (r) => game.rng.range(r[0], r[1]);
      const tank3 = game.allies.find((u) => u.role === "tank" && !u.dead) || alive[Math.floor(game.rng() * alive.length)];
      boss.facing = Math.atan2(tank3.y - boss.y, tank3.x - boss.x);
      st.swingIn -= h2;
      st.specialIn -= h2;
      if (st.swingIn <= 0) {
        const special = st.specialIn <= 0;
        if (special) st.specialIn = 15;
        st.swingIn += 2;
        let dmg = roll(T.swing) * (special ? 2.5 : 1);
        const r = game.rng();
        if (tank3.role === "tank") {
          const k = 1 - armorReduction(T.tankArmor * armorMultOf(tank3), boss.level);
          if (r < 0.31) dmg = 0;
          else if (r < 0.51) dmg = Math.max(0, dmg * k - 90);
          else if (!special && r < 0.54) dmg *= 2 * k;
          else if (!special && r < 0.69) dmg *= 1.5 * k;
          else dmg *= k;
        } else dmg *= 0.7;
        game.emit("enemySwing", { enemy: boss, special, target: tank3 });
        if (dmg > 0) damageUnit(game, tank3, dmg, { name: special ? "Heavy Strike" : "Melee", attacker: boss });
        else game.emit("allyHit", { unit: tank3, amount: 0, avoided: true, name: "Melee" });
      }
      st.waveIn -= h2;
      if (st.waveIn <= 0) {
        st.waveIn += 20;
        game.emit("fx", { kind: "nova", x: boss.x, y: boss.y, r: 30, schools: ["fire"] });
        for (const u of alive) damageUnit(game, u, roll(T.wave), { name: "Flame Wave", schools: ["fire"], attacker: boss });
      }
      st.fireballIn -= h2;
      if (st.fireballIn <= 0) {
        st.fireballIn += 10;
        const list = alive.filter((u) => u.role !== "tank");
        const t = list[Math.floor(game.rng() * list.length)];
        if (t) {
          game.emit("fx", { kind: "shot", from: { x: boss.x, y: boss.y }, to: t, schools: ["fire"], duration: 0.4 });
          damageUnit(game, t, roll(T.fireball), { name: "Fireball", schools: ["fire"], attacker: boss });
        }
      }
      st.debuffIn -= h2;
      if (st.debuffIn <= 0) {
        st.debuffIn += 15;
        const types = st.debuffs ? dispelTypes(game) : [];
        const targets = game.allies.filter((u) => !u.dead);
        if (types.length && targets.length) {
          const type = types[Math.floor(game.rng() * types.length)], t = targets[Math.floor(game.rng() * targets.length)];
          game.applyAuraTo(t, game.auraDef(DEBUFFS[type].id), { source: boss });
        }
      }
    }
  };

  // src/scenarios/index.js
  var ENEMY_TYPES = ["beast", "demon", "dragonkin", "elemental", "giant", "humanoid", "mechanical", "undead"];
  var enemyType = {
    label: "Enemy type",
    advanced: true,
    default: "default",
    values: ["default", ...ENEMY_TYPES],
    names: { default: "Test default (Mechanical dummy, Dragonkin boss)", ...Object.fromEntries(ENEMY_TYPES.map((t) => [t, t[0].toUpperCase() + t.slice(1)])) }
  };
  for (const sc of [targetDummy, raidBoss, raidHealing]) {
    sc.options = { ...sc.options, enemyType };
    const setup = sc.setup;
    sc.setup = (game, opts = {}) => {
      const r = setup(game, opts);
      if (ENEMY_TYPES.includes(opts.enemyType)) for (const e of r.enemies) e.creatureType = opts.enemyType;
      return r;
    };
  }
  var SCENARIOS = { [targetDummy.id]: targetDummy, [raidBoss.id]: raidBoss, [raidHealing.id]: raidHealing };
  var DEFAULT_SCENARIO = targetDummy.id;
  var testsFor = (cls) => Object.values(SCENARIOS).filter((s) => (cls.roles || ["dps"]).includes(s.role));
  var scenarioFor = (cls, id) => {
    const s = SCENARIOS[id];
    return s && testsFor(cls).includes(s) ? s : SCENARIOS[DEFAULT_SCENARIO];
  };

  // src/common/consumables.js
  var consumableAbilities = [
    {
      id: "major_mana_potion",
      name: "Major Mana Potion",
      icon: "inv_potion_76",
      kind: "item",
      gcd: false,
      cooldown: 120,
      cooldownGroup: "potion",
      target: "self",
      resource: "mana",
      text: "Restores 1350 to 2250 mana.",
      effects: [{ type: "restorePower", min: 1350, max: 2250 }]
    }
  ];
  var consumableAuras = {};

  // src/ui/dom.js
  var $ = (sel, root = document) => root.querySelector(sel);
  var $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "html") el.innerHTML = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  var esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var ICON_LOCAL = "assets/icons/";
  var ICON_CDN = "https://wow.zamimg.com/images/wow/icons/large/";
  var iconUrl = (name) => !name ? "" : name.startsWith("assets/") ? name : `${ICON_LOCAL}${name}.jpg`;
  var cdnUrl = (name) => `${ICON_CDN}${name}.jpg`;
  function setIcon(img, name) {
    img.dataset.icon = name || "";
    img.onerror = null;
    if (!name) {
      img.removeAttribute("src");
      return;
    }
    img.classList.remove("icon-missing");
    img.onerror = () => {
      if (img.dataset.icon !== name) return;
      if (!name.startsWith("assets/") && img.src.includes(ICON_LOCAL)) {
        img.src = cdnUrl(name);
        return;
      }
      img.onerror = null;
      img.removeAttribute("src");
      img.classList.add("icon-missing");
    };
    img.src = iconUrl(name);
  }
  function icon(name, cls = "icon", alt = "") {
    const img = h("img", { class: cls, alt, draggable: "false", loading: "lazy" });
    setIcon(img, name);
    return img;
  }
  var tip;
  var tipAnchor = null;
  var tipMake = null;
  function refreshTip() {
    if (tip && !tip.hidden && tipAnchor && tipMake && tipAnchor.isConnected) showTip(tipMake(), tipAnchor);
  }
  function showTip(html, anchor) {
    if (!tip) {
      tip = h("div", { class: "tooltip", role: "tooltip" });
      document.body.append(tip);
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const r = anchor.getBoundingClientRect(), t = tip.getBoundingClientRect();
    let x = r.right + 10, y = r.top;
    if (x + t.width > innerWidth - 8) x = r.left - t.width - 10;
    if (x < 8) {
      x = Math.min(innerWidth - t.width - 8, Math.max(8, r.left));
      y = r.bottom + 8;
    }
    if (y + t.height > innerHeight - 8) y = Math.max(8, innerHeight - t.height - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }
  function hideTip() {
    if (tip) tip.hidden = true;
    tipAnchor = null;
  }
  var lastPointer = "mouse";
  var lastTouchAt = -1e9;
  addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    if (e.pointerType !== "mouse") lastTouchAt = performance.now();
  }, true);
  var isTouchInput = () => lastPointer !== "mouse";
  var LONG_PRESS = 450;
  function bindTip(el, html) {
    const make = () => typeof html === "function" ? html() : html;
    const show = () => {
      tipAnchor = el;
      tipMake = make;
      showTip(make(), el);
    };
    el.addEventListener("mouseenter", () => {
      if (performance.now() - lastTouchAt > 900) show();
    });
    el.addEventListener("focus", () => {
      if (performance.now() - lastTouchAt > 900) show();
    });
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("blur", hideTip);
    let timer = 0, x0 = 0, y0 = 0;
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      x0 = e.clientX;
      y0 = e.clientY;
      el._longPress = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        el._longPress = true;
        show();
      }, LONG_PRESS);
    });
    const cancel = () => clearTimeout(timer);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointermove", (e) => {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel();
    });
    el.addEventListener("click", (e) => {
      if (el._longPress) {
        el._longPress = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
    el.addEventListener("contextmenu", (e) => {
      if (isTouchInput()) e.preventDefault();
    });
  }
  addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" && tipAnchor && !tipAnchor.contains(e.target)) hideTip();
  }, true);
  var fmt = {
    int: (n) => Math.round(n).toLocaleString("en-US"),
    pct: (n, d = 1) => `${(n * 100).toFixed(d)}%`,
    sec: (n) => n >= 60 ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}` : `${n.toFixed(n < 10 ? 1 : 0)}`
  };

  // src/ui/tooltips.js
  var NAMES = /* @__PURE__ */ new WeakMap();
  function spellNames(game) {
    let m = NAMES.get(game.cls);
    if (!m) {
      const byName = /* @__PURE__ */ new Map();
      for (const ab of game.abilityList) if (!ab.hidden && ab.icon && ab.name && ab.name.length > 3 && !byName.has(ab.name)) byName.set(ab.name, ab.icon);
      const list = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      m = { byName, re: list.length ? new RegExp(`(?<![A-Za-z'])(${list.join("|")})(?![A-Za-z'])`, "g") : null };
      NAMES.set(game.cls, m);
    }
    return m;
  }
  function withIcons(game, text, self = null) {
    const html = esc(text || ""), { byName, re } = spellNames(game);
    if (!re) return html;
    return html.replace(re, (name) => {
      const plain = name.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
      const ic = byName.get(plain);
      if (!ic || plain === self) return name;
      return `<span class="spell-ref"><img src="${iconUrl(ic)}" alt="" onerror="this.onerror=null;this.src='${ICON_CDN}${ic}.jpg'">${name}</span>`;
    });
  }
  var SCHOOL_NAMES = { arcane: "Arcane", fire: "Fire", frost: "Frost", shadow: "Shadow", nature: "Nature", holy: "Holy", physical: "Physical" };
  var NOTES_LINE = `<div class="tt-notes">From Blizzard's launch notes: the game client does not show it yet.</div>`;
  var APPROX_LINE = `<div class="tt-notes">Approximation based on Blizzard's launch notes: the game client does not show it yet.</div>`;
  var notesLine = (n) => n === "approx" ? APPROX_LINE : n ? NOTES_LINE : "";
  function abilityTip(game, ab) {
    const ctx = game.newCtx(ab);
    const cost = game.costOf(ab, ctx), cast = game.castTimeOf(ab, ctx), range = game.rangeOf(ab, ctx), cd = game.cooldownOf(ab, ctx);
    const left = [], right = [];
    if (cost > 0) left.push(`${cost} ${game.resourceOf(ab).label}`);
    if (range) right.push(`${Math.round(range)} yd range`);
    const castText = ab.channel ? "Channeled" : cast > 0 ? `${cast.toFixed(2).replace(/\.?0+$/, "")} sec cast` : "Instant";
    const cdText = cd > 0 ? cd >= 60 ? `${+(cd / 60).toFixed(1)} min cooldown` : `${+cd.toFixed(1)} sec cooldown` : "";
    const known = game.isKnown(ab);
    return `
    <div class="tt-title">${esc(ab.name)}</div>
    ${ab.kind === "item" ? '<div class="tt-sub">Consumable</div>' : `<div class="tt-sub">${(ab.schools || []).map((s) => SCHOOL_NAMES[s]).join(" and ")}</div>`}
    ${left.length || right.length ? `<div class="tt-row"><span>${left.join(" ")}</span><span>${right.join(" ")}</span></div>` : ""}
    <div class="tt-row"><span>${castText}</span><span>${cdText}</span></div>
    ${requirements(game, ab).map((r) => `<div class="tt-req-line">${esc(r)}</div>`).join("")}
    <div class="tt-text">${withIcons(game, ab.text, ab.name)}</div>
    ${ab.tipNote ? `<div class="tt-sub">${esc(ab.tipNote(game))}</div>` : ""}
    ${threatLine(ab) ? `<div class="tt-sub">${threatLine(ab)}</div>` : ""}
    ${!known ? `<div class="tt-req">Requires the talent ${esc(talentName(game.cls, ab.talent))}</div>` : ""}
    ${notesLine(ab.notes)}
    ${ab.notSimulated ? '<div class="tt-notsim">Not simulated in the lab</div>' : ""}`;
  }
  function threatLine(ab) {
    const parts = [];
    if (typeof ab.threat === "number") parts.push(`+${ab.threat} threat when it lands`);
    if (ab.threatMult && ab.threatMult !== 1) parts.push(`${Math.round(ab.threatMult * 100)}% threat from its damage`);
    return parts.join(", ");
  }
  var TOUCH = typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches || /[?&]touch=1\b/.test(location.search);
  var WEAPON = { dagger: "a Dagger", sword: "a Sword", mace: "a Mace", axe: "an Axe", fist: "a Fist Weapon" };
  var or = (list) => list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0];
  function requirements(game, ab) {
    const r = ab.requires || {}, out = [];
    const forms = game.requiredForms(ab);
    if (forms) out.push(`Requires ${or(forms.map((f) => game.formName(f)))}`);
    if (r.formNot) out.push(`Not in ${or(r.formNot.map((f) => game.formName(f)))}`);
    if (r.stealth) out.push("Requires Stealth");
    if (r.behind) out.push("Must be behind the target");
    if (r.notInCombat) out.push("Out of combat only");
    if (r.mainHand) out.push(`Requires ${or(r.mainHand.map((t) => WEAPON[t] || t))} in the main hand`);
    if (r.shield) out.push("Requires a Shield");
    if (r.ranged) out.push("Requires a Ranged Weapon");
    return out;
  }
  function findTalent(cls, id) {
    for (const tree of cls.trees) for (const t of tree.talents) if (t.id === id) return t;
    return null;
  }
  function talentName(cls, id) {
    const t = findTalent(cls, id);
    return t ? t.name : id;
  }
  function talentTip(game, t, rank, reason, broken = false) {
    const next = rank < t.max ? t.ranks[rank] : null;
    const simulated = game.isSimulatedTalent(t.id);
    let req = "";
    if (t.req) {
      const p = findTalent(game.cls, t.req), have = (game.loadout.talents || {})[t.req] || 0;
      if (p) req = `Requires ${p.max} point${p.max > 1 ? "s" : ""} in ${p.name}${have < p.max ? ` (${have}/${p.max})` : ""}`;
      if (p && reason === `Requires ${p.max} points in ${p.name}`) reason = null;
      req = `<div class="${p && have < p.max ? "tt-req" : "tt-sub"}">${esc(req)}</div>`;
    }
    return `
    <div class="tt-title">${esc(t.name)}</div>
    <div class="tt-sub">Rank ${rank}/${t.max}</div>
    ${rank > 0 ? `<div class="tt-text">${withIcons(game, t.ranks[rank - 1], t.name)}</div>` : ""}
    ${next ? `${rank > 0 ? '<div class="tt-next">Next rank:</div>' : ""}<div class="tt-text">${withIcons(game, next, t.name)}</div>` : ""}
    ${req}
    ${reason && rank < t.max ? `<div class="tt-req">${esc(reason)}</div>` : ""}
    ${broken ? '<div class="tt-req">Lost a requirement in the new talent trees: it does not count until you fix the tree, or remove it.</div>' : ""}
    ${(game.cls.talents[t.id] || {}).teaches ? `<div class="tt-sub">The talent shows the spell's first rank; at level 60 you have its highest rank, the one in the Spellbook.</div>` : ""}
    ${notesLine(t.notes)}
    ${simulated ? "" : `<div class="tt-notsim">Not simulated in the lab${(game.cls.talents[t.id] || {}).inert ? `: ${esc(game.cls.talents[t.id].inert)}` : ""}</div>`}
    <div class="tt-hint">${TOUCH ? "Tap to add or remove a point (the switch above the trees)." : "Left click to learn. Right click to unlearn."}</div>`;
  }
  function auraTip(game, a) {
    const left = isFinite(a.expires) ? Math.max(0, a.expires - game.time) : null;
    const desc = a.def.desc ? a.def.desc(a, game) : "";
    return `
    <div class="tt-title">${esc(a.def.name)}</div>
    ${desc ? `<div class="tt-text">${withIcons(game, desc, a.def.name)}</div>` : ""}
    ${a.def.notSimulated ? '<div class="tt-notsim">Not simulated in the lab</div>' : ""}
    ${left != null ? `<div class="tt-sub">${left >= 60 ? `${Math.ceil(left / 60)} min` : `${left.toFixed(1)} sec`} remaining</div>` : ""}`;
  }

  // src/ui/talents.js
  var TIERS = 7;
  var COLS = 4;
  function renderTalents(root, app) {
    const { cls } = app;
    root.innerHTML = "";
    const mode = h(
      "div",
      { class: "seg tal-touch", role: "radiogroup", "aria-label": "Tap to" },
      ...[["add", "Add points"], ["remove", "Remove points"]].map(([k, label]) => {
        const b = h("button", { class: `seg-btn${(app.talentTap || "add") === k ? " on" : ""}`, role: "radio", "aria-checked": String((app.talentTap || "add") === k) }, label);
        b.addEventListener("click", () => {
          app.talentTap = k;
          for (const x of mode.children) {
            x.classList.toggle("on", x === b);
            x.setAttribute("aria-checked", String(x === b));
          }
        });
        return b;
      })
    );
    const head = h(
      "div",
      { class: "tal-head" },
      h("div", { class: "tal-sum", id: "talSum" }),
      mode,
      h("button", { class: "ghost small", onclick: () => app.setTalents({}) }, "Reset")
    );
    const wrap = h("div", { class: "tal-trees" });
    const notice = h(
      "div",
      { class: "tal-notice", id: "talNotice", role: "status", hidden: true },
      h("p", { class: "tal-notice-text" }),
      h("button", { class: "ghost small", onclick: () => {
        if (app.buildNotice) app.buildNotice.closed = true;
        app.noticeClosed = true;
        updateTalents(root, app);
      } }, "Got it")
    );
    root.append(head, notice, wrap);
    cls.trees.forEach((tree, ti) => {
      const grid = h("div", { class: "tal-grid", style: { gridTemplateRows: `repeat(${TIERS}, var(--tal))` } });
      const col = h(
        "section",
        { class: `tal-tree tree-${tree.id}`, style: { "--tree-icon": `url("${new URL(`${ICON_LOCAL}${tree.icon}.jpg`, location.href).href}")` } },
        h(
          "header",
          {},
          icon(tree.icon, "icon tal-tree-icon"),
          h("span", { class: "tal-tree-name" }, tree.name),
          h("span", { class: "tal-tree-pts", "data-tree": ti }, "0"),
          h("button", { class: "link small", title: `Reset ${tree.name}`, "aria-label": `Reset ${tree.name}`, onclick: () => {
            const r = { ...app.talents };
            for (const t of tree.talents) delete r[t.id];
            app.setTalents(r);
          } }, "\u2715")
        ),
        grid
      );
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "tal-arrows");
      svg.setAttribute("viewBox", `0 0 ${COLS * 100} ${TIERS * 100}`);
      svg.setAttribute("preserveAspectRatio", "none");
      grid.append(svg);
      for (const t of tree.talents) {
        const cell = h(
          "button",
          { class: "tal", "data-id": t.id, style: { gridRow: t.tier + 1, gridColumn: t.col + 1 }, "aria-label": t.name },
          icon(t.icon),
          h("span", { class: "tal-rank" })
        );
        cell.addEventListener("click", (e) => {
          e.preventDefault();
          if (app.talentTap === "remove") app.removeTalent(t.id);
          else app.addTalent(t.id);
        });
        cell.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (!isTouchInput()) app.removeTalent(t.id);
        });
        bindTip(cell, () => talentTip(app.game, t, app.talents[t.id] || 0, cannotAdd(cls.trees, app.talents, t.id), placeBuild(cls.trees, app.talents).broken.has(t.id)));
        grid.append(cell);
        if (t.req) {
          const r = tree.talents.find((o) => o.id === t.req);
          const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
          const x1 = r.col * 100 + 50, y1 = r.tier * 100 + 82, x2 = t.col * 100 + 50, y2 = t.tier * 100 + 18;
          line.setAttribute("d", x1 === x2 ? `M${x1} ${y1} V${y2}` : `M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}`);
          line.setAttribute("data-req", t.id);
          svg.append(line);
        }
      }
      wrap.append(col);
    });
    updateTalents(root, app);
  }
  function updateTalents(root, app) {
    const { cls, talents } = app;
    const used = totalPoints(talents);
    const { broken } = placeBuild(cls.trees, talents);
    cls.trees.forEach((tree, ti) => {
      const pts = root.querySelector(`.tal-tree-pts[data-tree="${ti}"]`);
      if (pts) pts.textContent = treePoints(cls.trees, talents, ti);
      for (const t of tree.talents) {
        const cell = root.querySelector(`.tal[data-id="${t.id}"]`);
        const rank = talents[t.id] || 0;
        const canAdd = !cannotAdd(cls.trees, talents, t.id);
        cell.classList.toggle("maxed", rank >= t.max);
        cell.classList.toggle("open", canAdd || rank > 0);
        cell.classList.toggle("locked", !canAdd && rank === 0);
        cell.classList.toggle("sim-off", !app.game.isSimulatedTalent(t.id));
        cell.classList.toggle("broken", broken.has(t.id));
        cell.querySelector(".tal-rank").textContent = `${rank}/${t.max}`;
        const line = root.querySelector(`path[data-req="${t.id}"]`);
        if (line) line.classList.toggle("on", (talents[t.req] || 0) > 0);
      }
    });
    const box = root.querySelector("#talNotice"), n = app.buildNotice;
    if (box) {
      const show = n && !n.closed || broken.size > 0 && !app.noticeClosed;
      box.hidden = !show;
      if (show) {
        const names = [...broken].map((id) => cls.trees.flatMap((x) => x.talents).find((x) => x.id === id).name);
        const parts = [];
        if (n) parts.push(`This build was made before the ${n.cls} talent changes of ${n.date}.${n.notes.length ? ` ${n.notes.join(". ")}.` : ""}`);
        if (broken.size) parts.push(`${names.join(", ")} lost a requirement in the new trees (the points below ${broken.size === 1 ? "it" : "them"} or the talent above) and ${broken.size === 1 ? "does" : "do"} not count until you fix the tree.`);
        else parts.push("Check your talents.");
        box.querySelector(".tal-notice-text").textContent = parts.join(" ");
      }
    }
    const split = cls.trees.map((_, ti) => treePoints(cls.trees, talents, ti)).join("/");
    const sum = $("#talSum", root);
    if (sum) sum.innerHTML = `Unspent talents <b>${RULES.talentPoints - used}</b> <span>${split}</span>`;
  }

  // src/ui/hud.js
  var KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  function buildHud(root, app) {
    root.innerHTML = "";
    const player = h(
      "div",
      { class: "frame frame-player" },
      h("div", { class: "auras", id: "playerAuras" }),
      h("div", { class: "bar hp" }, h("i"), h("span")),
      h("div", { class: "bar power" }, h("i"), h("span")),
      ...app.game.resourceIds.length > 1 ? [h("div", { class: "power-others" })] : [],
      ...Object.entries(app.cls.reagents || {}).map(([id, r]) => h("div", { class: "reagent", "data-id": id, title: r.name }, icon(r.icon), h("span"))),
      // Totems (classes with cls.totems): one slot per element with the time left.
      app.cls.totems ? h("div", { class: "totems", "aria-label": "Totems" }, ...TOTEM_ELEMENTS.map((el) => h("div", { class: `totem-slot el-${el}`, "data-el": el, title: `${el[0].toUpperCase()}${el.slice(1)} totem` }, h("img", { alt: "", draggable: "false" }), h("small")))) : null,
      h("div", { class: "frame-name" }, app.cls.name, h("small", {}, ` ${app.cls.stats.level}`))
    );
    const target = h(
      "div",
      { class: "frame frame-target" },
      h("div", { class: "auras", id: "targetAuras" }),
      h("div", { class: "bar hp" }, h("i"), h("span")),
      app.cls.comboPoints ? h("div", { class: "combo", "aria-label": "Combo points" }, ...Array.from({ length: COMBO_MAX }, () => h("i"))) : null,
      // Threat against an enemy that fights back: who it attacks and how close the other side is.
      h("div", { class: "threat", hidden: true, "aria-label": "Threat" }, h("i"), h("span")),
      h("div", { class: "frame-name", id: "targetName" })
    );
    const death = h("div", { class: "death-note", hidden: true, role: "status" }, "You died. ", h("kbd", {}, "R"), " starts a new fight.");
    const raid = app.game.allies.length ? buildRaidFrames(app) : null;
    const cast = h("div", { class: "castbar", hidden: true }, h("i"), h("span", { class: "cast-name" }), h("span", { class: "cast-time" }));
    const w0 = weaponsOf(app.game), forms = app.game.resourceIds.length > 1;
    const swings = w0.main || w0.ranged || forms ? h("div", { class: "swings" }, ...["main", "off", "ranged"].filter((k) => w0[k] || forms && k === "main").map((k) => h("div", { class: "swing", "data-hand": k }, h("i")))) : null;
    const barHint = h("div", { class: "bar-hint" }, app.touch ? "Empty bar. Tap a slot to pick a spell for it." : "Empty bar. Click or drag spells from the Spellbook tab.");
    const error = h("div", { class: "error-text", "aria-live": "polite" });
    const bar = h("div", { class: "actionbar", id: "actionbar" });
    KEYS.forEach((key, i) => {
      const slot = h("button", { class: "slot", "data-i": i, "aria-label": `Action ${key}` }, h("span", { class: "slot-key" }, key), h("span", { class: "slot-cd" }), h("span", { class: "slot-cd-text" }));
      slot.addEventListener("click", () => app.pressSlot(i));
      slot.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (!isTouchInput()) app.setBarSlot(i, null);
      });
      slot.addEventListener("dragover", (e) => {
        e.preventDefault();
        slot.classList.add("drop");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("drop"));
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        slot.classList.remove("drop");
        const id = e.dataTransfer.getData("text/ability"), from = e.dataTransfer.getData("text/slot");
        if (from !== "") app.swapSlots(+from, i);
        else if (id) app.setBarSlot(i, id);
      });
      slot.addEventListener("dragstart", (e) => {
        hideTip();
        e.dataTransfer.setData("text/slot", String(i));
      });
      bindTip(slot, () => {
        const ab = app.game.ability(app.bar[i]);
        return ab ? abilityTip(app.game, ab) : '<div class="tt-sub">Empty. Drag a spell here.</div>';
      });
      bar.append(slot);
    });
    const sb = app.cls.stanceBar;
    const stance = sb ? h("div", { class: "stancebar", "aria-label": sb.label }, ...sb.abilities.map((id, i) => {
      const ab = app.game.ability(id);
      if (!ab) return null;
      const b = h("button", { class: "slot stance", "data-id": id, "aria-label": ab.name }, icon(ab.icon), h("span", { class: "slot-key" }, `\u21E7${i + 1}`), ab.barTag ? h("span", { class: "slot-tag" }, ab.barTag) : null, h("span", { class: "slot-cd" }));
      b.addEventListener("click", () => app.stanceClick(id));
      bindTip(b, () => abilityTip(app.game, ab));
      return b;
    })) : null;
    const castZone = h("div", { class: "cast-zone" }, ...swings ? [swings] : [], cast);
    const units = h("div", { class: "unit-row" }, player, target);
    const mid = h("div", { class: "bars-mid" }, castZone, units, bar);
    const bars = h("div", { class: "bars" }, stance || h("span"), mid, h("span"));
    root.append(error, death, bars, barHint, ...raid ? [raid] : []);
    app.game.on("error", (msg) => showError(root, msg));
    fillBar(root, app);
  }
  function fillBar(root, app) {
    $$slots(root).forEach((slot, i) => {
      const id = app.bar[i], ab = id && app.game.ability(id);
      const old = slot.querySelector("img");
      if (old) old.remove();
      slot.classList.toggle("empty", !ab);
      slot.draggable = !!ab;
      if (ab) slot.prepend(icon(ab.icon));
    });
  }
  var $$slots = (root) => [...root.querySelectorAll(".actionbar .slot")];
  function stanceActive(g, ab) {
    if (ab.activeWhen) return !!ab.activeWhen(g);
    if (ab.shapeshift) return g.form() === ab.shapeshift;
    const ef = (ab.effects || []).find((e) => e.type === "setForm" || e.type === "applyAura" && e.to === "self");
    return !!ef && g.player.auras.some((a) => a.id === ef.aura);
  }
  var errTimer = 0;
  function showError(root, msg) {
    const el = root.querySelector(".error-text");
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(errTimer);
    errTimer = setTimeout(() => el.classList.remove("on"), Math.max(1400, msg.length * 45));
  }
  function setBar(el, cur, max, text) {
    el.querySelector("i").style.width = `${max > 0 ? Math.max(0, Math.min(1, cur / max)) * 100 : 0}%`;
    el.querySelector("span").textContent = text;
  }
  function renderAuras(el, game, unit, filter) {
    const list = unit.auras.filter((a) => !a.def.hidden && filter(a));
    const key = list.map((a) => `${a.id}:${a.stacks}:${a.charges}`).join("|");
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      el.innerHTML = "";
      for (const a of list) {
        const n = a.def.charges ? a.charges : a.stacks;
        const chip = h("div", { class: `aura ${a.def.kind || "buff"}`, "data-id": a.id, tabindex: 0 }, icon(a.def.icon), n > 1 ? h("b", {}, n) : null, h("small"));
        chip._aura = a;
        bindTip(chip, () => auraTip(game, chip._aura));
        el.append(chip);
      }
    }
    [...el.children].forEach((chip) => {
      const a = chip._aura, left = a.expires - game.time;
      chip.querySelector("small").textContent = isFinite(left) ? left >= 60 ? `${Math.ceil(left / 60)}m` : `${Math.ceil(left)}` : "";
    });
  }
  function buildRaidFrames(app) {
    const g = app.game, members = raidMembers(g);
    const parties = [...new Set(members.map((u) => u.party))].sort((a, b) => a - b);
    const wrap = h(
      "div",
      { class: `raid-frames${parties.length === 1 ? " one" : ""}`, id: "raidFrames", "aria-label": "Raid frames" },
      ...parties.map((n) => h(
        "div",
        { class: "raid-group" },
        h("div", { class: "raid-group-name" }, `Group ${n}`),
        ...members.filter((u) => u.party === n).map((u) => {
          const el = h(
            "button",
            { class: `rf${u === g.player ? " me" : ""}`, style: { "--c": u.color || app.cls.color }, "aria-label": u === g.player ? "You" : u.name },
            h("i", { class: "rf-hp" }),
            h("b", { class: "rf-shield" }),
            h("span", { class: "rf-name" }, u === g.player ? "You" : u.name.replace(/ \((main|off) tank\)/, " (tank)")),
            h("span", { class: "rf-hots" }),
            h("small", { class: "rf-def" })
          );
          el._unit = u;
          el.addEventListener("click", () => {
            g.setFriend(u);
          });
          return el;
        })
      ))
    );
    return wrap;
  }
  function updateRaidFrames(root, g) {
    const p = g.player;
    for (const el of root.querySelectorAll(".rf")) {
      const u = el._unit, max = maxHpOf(g, u), k = Math.max(0, Math.min(1, u.hp / max));
      el.querySelector(".rf-hp").style.width = `${k * 100}%`;
      const shield = u.auras.reduce((s, a) => s + (a.def.absorb ? a.data.absorb || 0 : 0), 0);
      el.querySelector(".rf-shield").style.width = `${Math.min(1, shield / max) * 100}%`;
      el.classList.toggle("dead", !!u.dead);
      el.classList.toggle("low", !u.dead && k < 0.35);
      el.classList.toggle("sel", p.friend === u || !p.friend && u === p);
      el.classList.toggle("far", u !== p && g.edgeDistance(p, u) > 40);
      el.querySelector(".rf-def").textContent = u.dead ? "dead" : u.hp < max ? `-${fmt.int(max - u.hp)}` : "";
      const mine = u.auras.filter((a) => a.source === p && isFinite(a.expires) && (a.def.hot || a.def.absorb || a.def.kind === "buff" && a.duration <= 60)).slice(0, 3);
      const hots = el.querySelector(".rf-hots"), key = mine.map((a) => a.id).join("|");
      if (hots.dataset.key !== key) {
        hots.dataset.key = key;
        hots.innerHTML = "";
        for (const a of mine) hots.append(icon(a.def.icon));
      }
    }
  }
  function updateThreat(el, g, t) {
    const show = !!t.ai && !!t.engaged && !g.player.dead && !!g.raid;
    el.hidden = !show;
    if (!show) return;
    const P = t.threat.player, R = t.threat.raid, mine = t.aggro === "player";
    const need = mine ? 1.1 : g.edgeDistance(g.player, t) <= 3 ? 1.1 : 1.3;
    const k = mine ? R / Math.max(1, P * need) : P / Math.max(1, R * need);
    el.querySelector("i").style.width = `${Math.min(1, k) * 100}%`;
    el.classList.toggle("lost", !mine);
    el.classList.toggle("close", mine && k > 0.85);
    const other = g.raid && g.raid.name ? g.raid.name : "the raid";
    el.querySelector("span").textContent = mine ? k > 0.85 ? `On you \xB7 ${other} is about to pull it` : `On you \xB7 ${other} behind` : `On ${other} \xB7 taunt it back!`;
  }
  function updateHud(root, app) {
    const g = app.game, p = g.player, s = g.stats();
    root.querySelector(".death-note").hidden = !p.dead;
    if (g.allies.length) updateRaidFrames(root, g);
    root.querySelector(".frame-player").classList.toggle("dead", !!p.dead);
    setBar(root.querySelector(".frame-player .hp"), p.hp, s.maxHp, fmt.int(p.hp));
    const pw = root.querySelector(".frame-player .power");
    setBar(pw, p.power, g.resource.max(g), fmt.int(p.power));
    pw.style.setProperty("--fill", g.resource.color);
    const others = root.querySelector(".power-others");
    if (others) others.textContent = g.resourceIds.filter((id) => id !== g.resourceId() && RESOURCES[id].keepsWhenInactive).map((id) => `${RESOURCES[id].label} ${fmt.int(p.res[id].power)}`).join(" \xB7 ");
    root.querySelector(".bar-hint").hidden = app.bar.some(Boolean);
    const pips = root.querySelectorAll(".combo i"), cp2 = g.combo();
    pips.forEach((pip, i) => pip.classList.toggle("on", i < cp2));
    const w = weaponsOf(g);
    for (const sw of root.querySelectorAll(".swing")) {
      const hand = sw.dataset.hand, wp = w[hand];
      const left = p.swing ? p.swing[hand] : 0;
      sw.querySelector("i").style.width = `${wp ? (1 - Math.min(1, left / wp.speed)) * 100 : 0}%`;
      sw.classList.toggle("idle", !p.autoAttack);
      sw.hidden = !wp;
    }
    for (const el of root.querySelectorAll(".totem-slot")) {
      const t2 = totemOf(g, el.dataset.el), img = el.querySelector("img"), name = t2 ? t2.def.icon : "";
      if ((img.dataset.icon || "") !== name) setIcon(img, name);
      el.classList.toggle("on", !!t2);
      el.title = t2 ? t2.def.name : `${el.dataset.el[0].toUpperCase()}${el.dataset.el.slice(1)} totem`;
      el.querySelector("small").textContent = t2 ? fmt.sec(Math.max(0, t2.expires - g.time)) : "";
    }
    for (const el of root.querySelectorAll(".reagent")) el.querySelector("span").textContent = `${p.reagents[el.dataset.id] || 0} ${g.cls.reagents[el.dataset.id].name}s`;
    renderAuras(root.querySelector("#playerAuras"), g, p, (a) => true);
    const t = p.target, tf = root.querySelector(".frame-target");
    tf.classList.toggle("empty", !t);
    if (t) {
      root.querySelector("#targetName").innerHTML = `${t.name} <small>${t.level === 63 ? "??" : t.level}</small>`;
      tf.classList.toggle("hostile", !!t.ai);
      setBar(tf.querySelector(".hp"), t.hp, t.maxHp, fmt.int(t.hp));
      updateThreat(tf.querySelector(".threat"), g, t);
      renderAuras(root.querySelector("#targetAuras"), g, t, (a) => a.source === p);
    }
    const cb = root.querySelector(".castbar"), c = p.cast || p.channel;
    cb.hidden = !c;
    if (c) {
      const k = p.cast ? (g.time - c.start) / c.total : (c.end - g.time) / c.total;
      cb.querySelector("i").style.width = `${Math.max(0, Math.min(1, k)) * 100}%`;
      cb.classList.toggle("channel", !p.cast);
      cb.querySelector(".cast-name").textContent = c.ab.name;
      cb.querySelector(".cast-time").textContent = `${Math.max(0, c.end - g.time).toFixed(1)}`;
    }
    const gcdLeft = g.gcdLeft();
    for (const b of root.querySelectorAll(".stancebar .slot")) {
      const ab = g.ability(b.dataset.id), known = g.isKnown(ab);
      b.hidden = !known;
      if (!known) continue;
      b.classList.toggle("on", stanceActive(g, ab));
      const cd = g.cooldownLeft(ab), left = Math.max(cd, ab.gcd !== false ? gcdLeft : 0), total = cd > 0 ? (p.cooldowns[ab.cooldownGroup || ab.id] || {}).total || cd : p.gcdTotal || 1.5;
      b.querySelector(".slot-cd").style.setProperty("--cd", left > 0 ? `${left / total * 360}deg` : "0deg");
      b.classList.toggle("active", !!c && c.ab === ab);
    }
    $$slots(root).forEach((slot, i) => {
      const ab = app.bar[i] && g.ability(app.bar[i]);
      if (!ab) return;
      const known = g.isKnown(ab);
      const cd = g.cooldownLeft(ab);
      const ctxA = g.newCtx(ab);
      const left = Math.max(cd, ab.gcd !== false ? gcdLeft : 0);
      const total = cd > 0 ? (p.cooldowns[ab.cooldownGroup || ab.id] || {}).total || cd : p.gcdTotal || 1.5;
      slot.querySelector(".slot-cd").style.setProperty("--cd", left > 0 ? `${left / total * 360}deg` : "0deg");
      slot.querySelector(".slot-cd-text").textContent = cd > 1.5 ? fmt.sec(cd) : "";
      slot.classList.toggle("unknown", !known);
      slot.classList.toggle("nomana", known && !g.hasPower(ab, g.costOf(ab, ctxA)));
      const tgt = ctxA.allyMode ? ctxA.target : ab.target === "enemy" ? p.target : null;
      slot.classList.toggle("oor", known && !!tgt && tgt !== p && g.edgeDistance(p, tgt) > g.rangeOf(ab, ctxA));
      const why = known ? g.blockReason(ab, ctxA) : null;
      slot.classList.toggle("blocked", !!why && why !== "Out of range" && !/^Not enough /.test(why));
      slot.classList.toggle("free", known && (ab.cost || 0) !== 0 && g.costOf(ab, ctxA) === 0);
      slot.classList.toggle("queued", p.queued === ab.id);
      slot.classList.toggle("armed", p.nextSwing === ab.id);
      slot.classList.toggle("active", !!c && c.ab === ab);
    });
  }

  // src/ui/spellbook.js
  function groupOf(cls, ab) {
    if (ab.kind === "item") return "Consumables";
    const tree = cls.trees.find((t) => t.id === ab.tree) || ab.talent && cls.trees.find((t) => t.talents.some((x) => x.id === ab.talent));
    return tree ? tree.name : "General";
  }
  function renderSpellbook(root, app) {
    const { game } = app;
    root.innerHTML = "";
    if (app.touch) root.append(barEditor(app));
    else root.append(h("p", { class: "hint" }, "Click a spell to add it to your bar, or drag it onto a slot. Right click a slot to clear it. Talent spells unlock when you learn the talent. Spells that are not simulated yet cannot go on the bar."));
    const byGroup = /* @__PURE__ */ new Map();
    for (const name of [...game.cls.trees.map((t) => t.name), "General", "Consumables"]) byGroup.set(name, []);
    const extraBar = new Set((game.cls.stanceBar || {}).abilities || []);
    for (const ab of game.abilityList) if (!ab.hidden && !extraBar.has(ab.id) && game.hasRace(ab)) byGroup.get(groupOf(game.cls, ab)).push(ab);
    const names = [...byGroup.keys()].filter((n) => byGroup.get(n).length);
    for (const name of names) {
      const list = byGroup.get(name), grp = { name };
      const grid = h("div", { class: "book-grid" });
      for (const ab of list) {
        const known = game.isKnown(ab), onBar = app.bar.includes(ab.id);
        const el = h(
          "button",
          { class: `book-spell${known ? "" : " unknown"}${onBar ? " on-bar" : ""}`, draggable: known ? "true" : "false", "aria-label": ab.name },
          icon(ab.icon),
          h("span", { class: "book-name" }, ab.name)
        );
        el.addEventListener("click", () => {
          if (!known) return;
          if (app.pickSlot != null) app.setBarSlot(app.pickSlot, ab.id);
          else app.addToBar(ab.id);
        });
        el.addEventListener("dragstart", (e) => {
          hideTip();
          e.dataTransfer.setData("text/ability", ab.id);
          e.dataTransfer.effectAllowed = "copy";
        });
        bindTip(el, () => abilityTip(game, ab));
        grid.append(el);
      }
      root.append(h("h3", { class: "label" }, grp.name), grid);
    }
  }
  function barEditor(app) {
    const { game } = app, sel = app.pickSlot;
    const slots = h("div", { class: "bar-edit-slots" }, ...KEYS.map((key, i) => {
      const ab = app.bar[i] && game.ability(app.bar[i]);
      const b = h(
        "button",
        { class: `slot${ab ? "" : " empty"}${sel === i ? " picked" : ""}`, "aria-label": ab ? `${ab.name}, slot ${key}` : `Empty slot ${key}`, "aria-pressed": String(sel === i) },
        ab ? icon(ab.icon) : null,
        h("span", { class: "slot-key" }, key)
      );
      b.addEventListener("click", () => app.pickForSlot(sel === i ? null : i, true));
      return b;
    }));
    const status = sel == null ? "Tap a slot to choose it, then tap a spell. Or tap a spell to fill the first empty slot." : `Slot ${KEYS[sel]}: tap a spell for it.`;
    return h(
      "div",
      { class: "bar-edit" },
      h(
        "div",
        { class: "bar-edit-head" },
        h("h3", { class: "label" }, "Your bar"),
        sel != null && app.bar[sel] ? h("button", { class: "ghost small", onclick: () => {
          app.pickReturn = false;
          app.setBarSlot(sel, null);
        } }, "Clear slot") : null
      ),
      slots,
      h("p", { class: "hint" }, status)
    );
  }

  // src/ui/gear.js
  function renderGear(root, app) {
    const { cls } = app;
    root.innerHTML = "";
    const roles = [...new Set(cls.gearPresets.map((p) => p.role).filter(Boolean))];
    const presetBtn = (p) => h("button", { class: `seg-btn${app.gearId === p.id ? " on" : ""}`, title: p.blurb, onclick: () => app.setGear(p.id) }, p.name);
    const custom = h("button", { class: `seg-btn${app.gearId === "custom" ? " on" : ""}`, onclick: () => app.setGear("custom") }, "Custom");
    let presets;
    if (!roles.length) presets = h("div", { class: "seg" }, ...cls.gearPresets.map(presetBtn), custom);
    else presets = h(
      "div",
      { class: "seg-rows" },
      ...roles.map((r) => h("div", { class: "seg-row" }, h("span", { class: "seg-label" }, (cls.gearRoles || {})[r] || r), h("div", { class: "seg" }, ...cls.gearPresets.filter((p) => p.role === r).map(presetBtn)))),
      h("div", { class: "seg-row" }, h("span", { class: "seg-label" }, ""), h("div", { class: "seg" }, custom))
    );
    const fields = h("div", { class: "gear-fields" });
    for (const f of cls.gearFields) {
      const val = app.gear[f.k] || 0, shown = f.pct ? +(val * 100).toFixed(1) : val;
      const input = h("input", { type: "range", min: 0, max: f.max, step: f.step, value: shown, "aria-label": f.label });
      const out = h("output", {}, f.pct ? `${shown}%` : shown);
      input.addEventListener("input", () => {
        out.textContent = f.pct ? `${input.value}%` : input.value;
      });
      input.addEventListener("change", () => app.setGearValue(f.k, f.pct ? +input.value / 100 : +input.value));
      fields.append(h("label", { class: "gear-field", title: f.note || "" }, h("span", {}, f.label, f.note ? h("sup", {}, "*") : ""), input, out));
    }
    const opts = h("div", { class: "opt-list" });
    const addOpt = (def, key, value, set2) => {
      if (def.type === "toggle") {
        const cb = h("input", { type: "checkbox", checked: value !== false });
        cb.addEventListener("change", () => set2(key, cb.checked));
        opts.append(h("label", { class: "opt" }, cb, h("span", {}, def.label)));
      } else {
        const sel = h("select", { "aria-label": def.label });
        for (const v of def.values) sel.append(h("option", { value: v, selected: String(v) === String(value) }, def.names ? def.names[v] : String(v)));
        sel.addEventListener("change", () => set2(key, isNaN(+sel.value) ? sel.value : +sel.value));
        opts.append(h("label", { class: "opt" }, h("span", {}, def.label), sel));
      }
    };
    for (const [k, def] of Object.entries(cls.options || {})) if (!def.hidden) addOpt(def, k, app.options[k] ?? def.default, (key, v) => app.setOption(key, v));
    let totemBar = null;
    if (cls.totemBar) {
      const g = app.game;
      totemBar = h(
        "div",
        { class: "totem-grid" },
        h("span"),
        ...cls.totemBar.elements.map((el) => h("span", { class: `seg-label el-${el}` }, el[0].toUpperCase() + el.slice(1))),
        ...cls.totemBar.calls.flatMap((call) => {
          const ab = g.ability(call);
          return [
            h("span", { class: "totem-call" }, ab ? ab.name : call),
            ...cls.totemBar.elements.map((el) => {
              const key = `${call}_${el}`, def = cls.options[key], value = app.options[key] ?? def.default;
              const sel = h("select", { "aria-label": `${ab ? ab.name : call}: ${el}` });
              for (const v of def.values) if (v === "none" || g.isKnown(g.ability(v)) || v === value) sel.append(h("option", { value: v, selected: v === value }, def.names[v].replace(/ Totem$/, "")));
              sel.addEventListener("change", () => app.setOption(key, sel.value));
              return sel;
            })
          ];
        })
      );
    }
    const advOpts = h("div", { class: "opt-list" });
    for (const [k, def] of Object.entries(app.scenario.options || {})) {
      if (!def.advanced) continue;
      const sel = h("select", { "aria-label": def.label });
      const value = app.scenarioOptions[k] ?? def.default;
      for (const v of def.values) sel.append(h("option", { value: v, selected: String(v) === String(value) }, def.names ? def.names[v] : String(v)));
      sel.addEventListener("change", () => app.setScenarioOption(k, sel.value));
      advOpts.append(h("label", { class: "opt" }, h("span", {}, def.label), sel));
    }
    const cur = cls.gearPresets.find((p) => p.id === app.gearId);
    const adv = h(
      "details",
      { class: "advanced" },
      h("summary", {}, "Advanced: gear and enemy type"),
      h("h3", { class: "label" }, "Gear level"),
      presets,
      h("p", { class: "hint" }, "Pre-raid adds up a real list of WoW: Forever items (some still carry their Classic numbers); Fresh 60 is an approximate stand-in. Move any slider to make it your own."),
      fields,
      ...advOpts.childNodes.length ? [
        h("h3", { class: "label" }, "Enemy type"),
        h("p", { class: "hint" }, "The creature type of the dummies and the boss. Some spells and talents only work on some types, like Exorcism on Undead and Demons."),
        advOpts
      ] : []
    );
    root.append(
      h("p", { class: "hint" }, `Gear: ${cur ? `${cur.name} level` : "custom"}. Everyone starts with pre-raid gear: no raid is open in WoW: Forever yet.`),
      ...opts.childNodes.length ? [h("h3", { class: "label" }, "Options"), opts] : [],
      ...totemBar ? [h("h3", { class: "label" }, "Totem bar"), h("p", { class: "hint" }, "The totems each call sets down at once."), totemBar] : [],
      h("h3", { class: "label" }, "Character sheet"),
      h("div", { class: "sheet", id: "sheet" }),
      adv
    );
    updateSheet(root, app);
  }
  function updateSheet(root, app) {
    const el = root.querySelector("#sheet");
    if (!el) return;
    const g = app.game;
    const rows = app.cls.sheet ? app.cls.sheet(g, fmt) : [];
    const def = app.scenario.attacks ? defenseSheet(g, fmt, 63) : [];
    el.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("") + (def.length ? `<div class="sheet-head"><span>Against a raid boss</span></div>` + def.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("") : "");
  }

  // src/ui/panel.js
  function buildPanel(root, app) {
    const sc = app.scenario, cls = app.cls;
    root.innerHTML = "";
    const tests = h(
      "div",
      { class: "test-pick", role: "tablist", "aria-label": "Test" },
      ...testsFor(cls).map((s) => h("button", {
        class: `test-btn${s === sc ? " on" : ""}`,
        role: "tab",
        "aria-selected": String(s === sc),
        title: s.blurb,
        onclick: () => app.setScenario(s.id)
      }, s.name))
    );
    const opts = h("div", { class: "test-opts" });
    for (const [k, def] of Object.entries(sc.options || {})) {
      if (def.showIf && !def.showIf(cls)) continue;
      if (def.advanced) continue;
      const val = app.scenarioOptions[k] ?? def.default;
      if (def.type === "toggle") {
        const cb = h("input", { type: "checkbox", checked: val !== false });
        cb.addEventListener("change", () => app.setScenarioOption(k, cb.checked));
        opts.append(h("label", { class: "test-opt" }, cb, h("span", {}, def.label)));
      } else {
        const seg = h("div", { class: "seg" }, ...def.values.map((v) => h("button", { class: `seg-btn${String(v) === String(val) ? " on" : ""}`, onclick: () => app.setScenarioOption(k, v) }, def.names ? def.names[v] : String(v))));
        opts.append(h("div", { class: "test-opt" }, seg));
      }
    }
    root.append(
      h("div", { class: "test-row" }, tests, h("button", { class: "ghost small reset-btn", onclick: () => app.resetFight() }, "Reset ", h("kbd", {}, "R"))),
      h("div", { class: "test-row sub" }, h("p", { class: "test-blurb" }, sc.blurb), opts)
    );
  }

  // src/ui/picker.js
  var classesByName = () => Object.values(CLASSES).sort((a, b) => a.name.localeCompare(b.name));
  var specTree = (cls, b) => cls.trees.find((t) => t.id === (b.tree || b.id)) || null;
  var buildTip = (b) => `<div class="tt-title">${b.name} <span class="tt-sub">${b.points}</span></div><div class="tt-sub">My build of this spec: talents, bar and weapons. Change anything after.</div>`;
  function renderClassMenu(root, app) {
    root.innerHTML = "";
    root.setAttribute("role", "radiogroup");
    for (const c of classesByName()) {
      const on = c === app.cls;
      const b = h("button", { class: `class-btn${on ? " on" : ""}`, role: "radio", "aria-checked": String(on), "aria-label": c.name, style: { "--c": c.color } }, icon(c.icon, "class-icon"));
      b.addEventListener("click", () => {
        if (c === app.cls) return;
        app.setClass(c.id);
        if ((app.cls.builds || []).length) app.setBuild(app.cls.builds[0]);
      });
      bindTip(b, () => `<div class="tt-title" style="color:${c.color}">${c.name}</div>`);
      root.append(b);
    }
    const cur = h("span", { class: "class-name", style: { color: app.cls.color } }, app.cls.name);
    root.append(cur);
  }
  function renderSpecButtons(root, app) {
    const active = app.activeBuild();
    root.innerHTML = "";
    root.append(h("span", { class: "builds-class", style: { color: app.cls.color } }, app.cls.name));
    const builds10 = app.cls.builds || [];
    if (!builds10.length) return;
    for (const b of builds10) {
      const t = specTree(app.cls, b);
      const el = h(
        "button",
        { class: `build-btn${b === active ? " on" : ""}`, "aria-pressed": String(b === active), onclick: () => app.setBuild(b) },
        t ? icon(t.icon, "spec-icon") : null,
        b.name
      );
      bindTip(el, () => buildTip(b));
      root.append(el);
    }
    const blank = h("button", { class: "build-btn blank", onclick: () => app.clearBuild() }, "Blank");
    bindTip(blank, () => '<div class="tt-sub">No talents, empty bar.</div>');
    root.append(blank);
  }

  // src/ui/mobile.js
  var MIN_ARENA = 200;
  var CAM_SPAN = 26;
  var body = () => document.body;
  var isLandscape = () => innerWidth > innerHeight && innerHeight <= 500;
  function applyMobile(app) {
    if (!app.touch) return;
    const b = body();
    b.classList.toggle("land", isLandscape());
    const compact = b.dataset.view === "play";
    b.classList.toggle("m-compact", compact);
    if (!compact) closeMenus();
    treeTabs(app);
    refreshMini(app);
    if (app.arena) requestAnimationFrame(() => app.arena.resize());
  }
  var MENUS = { "top-cls-open": "miniCls", "top-spec-open": "miniSpec", "top-more-open": "miniMore" };
  function closeMenus() {
    body().classList.remove(...Object.keys(MENUS));
    for (const id of Object.values(MENUS)) {
      const el = document.getElementById(id);
      if (el) el.setAttribute("aria-expanded", "false");
    }
  }
  function openMenu(cls) {
    closeMenus();
    body().classList.add(cls);
    const btn = document.getElementById(MENUS[cls]);
    if (btn) btn.setAttribute("aria-expanded", "true");
  }
  function refreshMini(app) {
    const c = document.getElementById("miniCls"), s = document.getElementById("miniSpec");
    if (!c || !s) return;
    const b = app.activeBuild(), t = b && specTree(app.cls, b);
    const caret = () => h("span", { class: "mini-caret", "aria-hidden": "true" }, "\u25BE");
    c.replaceChildren(icon(app.cls.icon, "class-icon"), h("span", { class: "mini-name", style: { color: app.cls.color } }, app.cls.name), caret());
    s.replaceChildren(t ? icon(t.icon, "spec-icon") : "", h("span", { class: "mini-spec" }, b ? b.name : "Custom"), caret());
  }
  function treeTabs(app) {
    const root = document.getElementById("tab-talents"), wrap = root && root.querySelector(".tal-trees");
    if (!wrap) return;
    const trees10 = [...wrap.querySelectorAll(".tal-tree")];
    const pts = trees10.map((_, i) => treePoints(app.cls.trees, app.talents, i));
    const b = app.activeBuild(), key = `${app.cls.id}:${b ? b.name : ""}`;
    if (app._treeKey !== key || app._tree == null || app._tree >= trees10.length) {
      app._treeKey = key;
      app._tree = Math.max(0, pts.indexOf(Math.max(...pts)));
    }
    let bar = root.querySelector(".tree-tabs");
    if (!bar) {
      bar = h("div", { class: "tree-tabs", role: "tablist", "aria-label": "Talent tree" });
      wrap.before(bar);
    }
    bar.replaceChildren(...trees10.map((t, i) => {
      const img = t.querySelector(".tal-tree-icon"), name = t.querySelector(".tal-tree-name");
      const tab = h(
        "button",
        { class: `tree-tab${i === app._tree ? " on" : ""}`, role: "tab", "aria-selected": String(i === app._tree) },
        img ? img.cloneNode() : null,
        h("span", { class: "tree-tab-name" }, name ? name.textContent : ""),
        h("b", {}, String(pts[i]))
      );
      tab.addEventListener("click", () => {
        app._tree = i;
        treeTabs(app);
      });
      return tab;
    }));
    trees10.forEach((t, i) => {
      t.hidden = i !== app._tree;
    });
  }
  function afterHud(app) {
    if (!app.touch) return;
    for (const f of $$(".hud .frame")) {
      const name = f.querySelector(".frame-name"), hp = f.querySelector(".bar.hp");
      if (name && hp && name.parentElement !== hp) hp.append(name);
    }
  }
  function afterPanels(app) {
    if (app.touch) {
      treeTabs(app);
      refreshMini(app);
    }
  }
  function mountMobile(app) {
    if (!app.touch) return;
    const toggle = (cls) => {
      if (body().classList.contains(cls)) closeMenus();
      else openMenu(cls);
    };
    for (const [cls, id] of Object.entries(MENUS)) {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", () => toggle(cls));
    }
    $("#topPick").addEventListener("click", (e) => {
      if (e.target.closest(".class-btn") && body().classList.contains("top-cls-open")) setTimeout(() => openMenu("top-spec-open"), 0);
      else if (e.target.closest(".build-btn")) setTimeout(closeMenus, 0);
    });
    $(".links").addEventListener("click", (e) => {
      if (e.target.closest("#shareBtn, #feedbackBtn")) setTimeout(closeMenus, 0);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".top") && !e.target.closest(".link-box")) closeMenus();
      const box = $("#linkBox");
      if (box && !box.hidden && !e.target.closest(".link-box") && !e.target.closest("#linkBtn")) closeLinkBox();
    });
    $("#linkClose").addEventListener("click", closeLinkBox);
    $("#linkBtn").addEventListener("click", closeMenus);
    addEventListener("resize", () => applyMobile(app));
    applyMobile(app);
  }
  function closeLinkBox() {
    const box = $("#linkBox");
    if (box) box.hidden = true;
    const b = $("#linkBtn");
    if (b) b.setAttribute("aria-expanded", "false");
  }
  var last = {};
  var put = (el, k, v) => {
    if (last[k] !== v) {
      last[k] = v;
      el.style.setProperty(k, v);
    }
  };
  function layoutMobile(app) {
    if (!app.touch) return;
    const b = body(), stage = $(".stage"), hud = app.hudRoot;
    if (!stage || !hud || b.dataset.view !== "play") return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const bars = hud.querySelector(".bars"), sb = hud.querySelector(".stancebar");
    let stanceW = 0;
    if (sb) {
      const n = [...sb.children].filter((x) => !x.hidden).length, slot = app._slot || 44;
      const rows = Math.max(1, Math.min(n, 3)), cols = Math.max(1, Math.ceil(n / 3));
      const s = Math.min(Math.round(slot * 0.72), Math.floor((2 * slot + 2 - (rows - 1) * 2) / rows));
      stanceW = cols * s + (cols - 1) * 2 + 14;
      put(hud, "--stance-rows", String(rows));
      put(hud, "--stance-s", `${s}px`);
      const bw = bars ? bars.clientWidth : sw - 24, barW = 6 * slot + 10;
      put(hud, "--bar-shift", `${Math.max(0, Math.ceil(stanceW - (bw - barW) / 2))}px`);
    }
    const meter = $("#meter"), raid = $("#raidFrames");
    const rh = raid && raid.offsetHeight ? raid.offsetHeight + 6 : 0;
    const mh = !meter || b.classList.contains("fighting") && !rh ? 0 : meter.offsetHeight;
    const top = mh + rh + 2, bh = bars ? bars.offsetHeight + 8 : 0;
    const max = Math.max(34, Math.min(50, Math.floor((sw - 34 - stanceW) / 6)));
    const cur = app._slot || max, free = sh - top - bh;
    const next = Math.max(34, Math.min(max, cur + Math.floor((free - MIN_ARENA) / 2)));
    app._slot = next;
    put(hud, "--slot", `${next}px`);
    put(stage, "--cv-top", `${top}px`);
    put(stage, "--cv-bot", `${bh}px`);
  }

  // src/ui/arena.js
  var SCHOOL = { arcane: "#d79bff", fire: "#ff8a2a", frost: "#8fd8ff", shadow: "#a58bff", nature: "#7bd36a", holy: "#ffe58a", physical: "#ffe27a" };
  var LANES = [[0, 0], [-46, -12], [46, -12], [-24, -30], [24, -30], [-70, -2], [70, -2], [0, -46], [-48, -46], [48, -46]];
  var schoolColor = (schools) => !schools || !schools.length ? "#ffffff" : schools.length > 1 ? "#c99bff" : SCHOOL[schools[0]] || "#fff";
  var Arena = class {
    constructor(canvas, app) {
      this.cv = canvas;
      this.ctx = canvas.getContext("2d");
      this.app = app;
      this.texts = [];
      this.fx = [];
      this.images = {};
      this.reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
    }
    clear() {
      this.texts = [];
      this.fx = [];
    }
    // Combat text in lanes, so numbers that land together (a swing and its Seal of Righteousness, a crit and a proc, ticks
    // of several DoTs) never sit on top of each other: each new number on a unit takes the first lane free among that
    // unit's numbers of the last 0.65 sec. Lanes fan out to the sides and up, in screen pixels (see draw).
    addText(unit, tx) {
      const now = this.app.game.time;
      const busy = new Set(this.texts.filter((o) => o.unit === unit && now - o.born < 0.65).map((o) => o.lane));
      let lane = 0;
      while (busy.has(lane) && lane < LANES.length - 1) lane++;
      this.texts.push({ ...tx, unit, lane });
    }
    attach(game) {
      this.clear();
      for (const off of this.subs || []) off();
      this.subs = [];
      const on = (evt, fn) => this.subs.push(game.on(evt, fn));
      on("damage", ({ ctx, res, periodic }) => {
        const t = ctx.target;
        const avoided = { miss: "Miss", dodge: "Dodge", parry: "Parry" }[res.outcome];
        const text = avoided || String(res.amount);
        const white = ctx.white && !avoided;
        this.addText(t, { x: t.x, y: t.y - 1.4, text, color: avoided ? "#bbbbbb" : white ? "#ffffff" : schoolColor(ctx.schools), crit: res.outcome === "crit", small: periodic || white, born: game.time });
      });
      on("fx", (f) => this.fx.push({ ...f, born: game.time }));
      on("error", (msg) => {
        if (/range/i.test(String(msg))) this.rangeFlash = game.time;
      });
      const TAKEN = { miss: "Miss", dodge: "Dodge", parry: "Parry", immune: "Immune" };
      on("hitTaken", ({ res }) => {
        const p = game.player, label = TAKEN[res.outcome];
        const text = label || (res.outcome === "block" && res.amount === 0 ? "Block" : `-${res.amount}${res.outcome === "block" ? " (blocked)" : res.outcome === "crushing" ? " (crushing)" : ""}`);
        this.addText(p, { x: p.x, y: p.y - 1, text, color: label ? "#d8d8d8" : "#ff5a4a", crit: res.outcome === "crit" || res.outcome === "crushing", small: false, born: game.time });
      });
      on("healthCost", ({ unit, amount }) => this.addText(unit, { x: unit.x, y: unit.y - 1, text: `-${amount}`, color: "#b07ce8", small: true, born: game.time }));
      on("heal", ({ unit, effective, crit: crit2, source }) => {
        if (!(effective > 0) || !unit || source !== "player" && unit !== game.player) return;
        this.addText(unit, { x: unit.x, y: unit.y - 0.4, text: `+${effective}`, color: "#59d97b", crit: crit2, small: source !== "player" || !crit2 && unit.kind === "ally", born: game.time });
      });
      on("allyHit", ({ unit, amount, avoided }) => {
        if (unit.role === "tank") this.addText(unit, { x: unit.x, y: unit.y - 1, text: avoided ? "Avoid" : `-${amount}`, color: avoided ? "#bbbbbb" : "#ff7a6a", small: true, born: game.time });
      });
      on("raidHit", ({ amount }) => {
        const r = game.raid;
        if (r) this.addText(r, { x: r.x, y: r.y - 1.5, text: `-${amount}`, color: "#9a9a9a", small: true, born: game.time });
      });
      on("wouldDie", ({ unit }) => this.addText(unit, { x: unit.x, y: unit.y - 1.6, text: "Would have died", color: "#ff4a3d", small: false, born: game.time }));
      on("dispel", ({ unit, auras: auras10 }) => this.addText(unit, { x: unit.x, y: unit.y - 1.2, text: `${auras10.join(", ")} removed`, color: "#cfe8ff", small: true, born: game.time }));
      on("immune", ({ unit }) => this.addText(unit, { x: unit.x, y: unit.y - 1.4, text: "Immune", color: "#d8d8d8", small: true, born: game.time }));
      on("taunt", ({ enemy }) => this.fx.push({ kind: "nova", x: enemy.x, y: enemy.y, r: enemy.radius + 1.5, schools: ["fire"], born: game.time }));
      on("enemySwing", ({ enemy, special }) => this.fx.push({ kind: "swipe", unit: enemy, facing: enemy.facing, special, born: game.time }));
      on("aura:apply", ({ aura: aura2, fresh }) => {
        if (fresh && aura2.def.flags && aura2.def.flags.frozen) this.fx.push({ kind: "freeze", unit: aura2.unit, born: game.time });
      });
    }
    resize() {
      const dpr = Math.min(this.app.touch ? 1.5 : 2, devicePixelRatio || 1), r = this.cv.getBoundingClientRect();
      this.cv.width = Math.max(1, Math.round(r.width * dpr));
      this.cv.height = Math.max(1, Math.round(r.height * dpr));
      this.dpr = dpr;
    }
    img(src) {
      if (!this.images[src]) {
        const im2 = new Image();
        im2.src = src;
        this.images[src] = im2;
      }
      const im = this.images[src];
      return im.complete && im.naturalWidth ? im : null;
    }
    // A WoW icon as a picture (the boss's portrait): the local file, else the CDN.
    iconImg(name) {
      const key = `icon:${name}`;
      if (!this.images[key]) {
        const im2 = new Image();
        im2.onerror = () => {
          if (!im2.src.startsWith(ICON_CDN)) im2.src = `${ICON_CDN}${name}.jpg`;
        };
        im2.src = `${ICON_LOCAL}${name}.jpg`;
        this.images[key] = im2;
      }
      const im = this.images[key];
      return im.complete && im.naturalWidth ? im : null;
    }
    draw() {
      const g = this.app.game, c = this.ctx, W = this.cv.width, H = this.cv.height, A = g.arena;
      this.updateCam();
      const { s, ox, oy } = this.view();
      const X = (x) => ox + x * s, Y = (y) => oy + y * s;
      this.plates = /* @__PURE__ */ new Map();
      const V = 1;
      c.clearRect(0, 0, W, H);
      c.fillStyle = "#121110";
      c.fillRect(0, 0, W, H);
      for (let x = 0; x < A.width; x += 5) for (let y = 0; y < A.height; y += 5) {
        const n = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
        c.fillStyle = `rgba(255,236,210,${8e-3 + n * 0.022})`;
        c.fillRect(X(x) + 1.5 * this.dpr, Y(y) + 1.5 * this.dpr, 5 * s - 3 * this.dpr, 5 * s - 3 * this.dpr);
      }
      const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);
      const t = g.player.target;
      const ring = (yd, alpha, label) => {
        const r = (yd + t.radius + g.player.radius) * s;
        c.strokeStyle = `rgba(255,255,255,${0.22 * alpha})`;
        c.setLineDash([4 * this.dpr, 6 * this.dpr]);
        c.beginPath();
        c.arc(X(t.x), Y(t.y), r, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        if (label) {
          c.font = `${11 * this.dpr}px "Barlow Condensed", sans-serif`;
          c.textAlign = "center";
          c.fillStyle = `rgba(255,255,255,${0.5 * alpha})`;
          c.fillText(`${yd} yd`, X(t.x), Y(t.y) - r - 4 * this.dpr);
        }
      };
      if (t) {
        const since = g.time - (this.rangeFlash ?? -99);
        if (since < 2) {
          const a = since < 1.4 ? 1 : (2 - since) / 0.6;
          for (const yd of [10, 20, 30]) ring(yd, a, true);
        }
        const cast = g.player.cast || g.player.channel;
        if (cast && cast.ctx && cast.ctx.target === t) {
          const yd = Math.round(g.rangeOf(cast.ab, cast.ctx));
          if (yd > 5) ring(yd, 0.6, false);
        }
      }
      const mt = this.app.moveTarget;
      if (mt && !mt.unit) {
        c.strokeStyle = "rgba(255,255,255,0.7)";
        c.lineWidth = 1.5 * this.dpr;
        c.beginPath();
        c.arc(X(mt.x), Y(mt.y), 0.6 * s, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 1;
      }
      for (const z of g.zones) {
        const col = schoolColor(z.schools), left = z.expires - g.time, fade = isFinite(left) && left < 1 ? Math.max(0, left) : 1;
        if (z.kind === "trap") {
          c.strokeStyle = col;
          c.globalAlpha = fade * 0.35;
          c.setLineDash([3 * this.dpr, 5 * this.dpr]);
          c.beginPath();
          c.arc(X(z.x), Y(z.y), z.radius * s, 0, Math.PI * 2);
          c.stroke();
          c.setLineDash([]);
          const r = 0.7 * s;
          c.globalAlpha = fade;
          c.fillStyle = col;
          c.strokeStyle = "#0b0f0d";
          c.lineWidth = 1.5 * this.dpr;
          c.beginPath();
          c.arc(X(z.x), Y(z.y), r, 0, Math.PI * 2);
          c.fill();
          c.stroke();
          c.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 + Math.PI / 4;
            c.moveTo(X(z.x), Y(z.y));
            c.lineTo(X(z.x) + Math.cos(a) * r, Y(z.y) + Math.sin(a) * r);
          }
          c.stroke();
        } else {
          const pulse = this.reducedMotion ? 0 : 0.04 * Math.sin(g.time * 6);
          c.fillStyle = col;
          c.globalAlpha = fade * (0.14 + pulse);
          c.beginPath();
          c.arc(X(z.x), Y(z.y), z.radius * s, 0, Math.PI * 2);
          c.fill();
          c.globalAlpha = fade * 0.6;
          c.strokeStyle = col;
          c.lineWidth = 2 * this.dpr;
          c.stroke();
        }
        c.globalAlpha = 1;
        c.lineWidth = 1;
      }
      const ch = g.player.channel;
      if (ch && ch.ab.channel.tick.some((e) => e.type === "aoeDamage" && e.center === "target") && ch.ctx.target) {
        const e = ch.ab.channel.tick.find((x) => x.type === "aoeDamage");
        c.fillStyle = "rgba(143,216,255,0.12)";
        c.strokeStyle = "rgba(143,216,255,0.5)";
        c.beginPath();
        c.arc(X(ch.ctx.target.x), Y(ch.ctx.target.y), e.radius * s, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      }
      const fxLife = (f) => f.kind === "shot" ? f.duration : f.kind === "freeze" ? 0.6 : f.kind === "swipe" ? 0.3 : 0.5;
      this.fx = this.fx.filter((f) => g.time - f.born < fxLife(f));
      for (const f of this.fx) {
        const k = (g.time - f.born) / fxLife(f), col = schoolColor(f.schools);
        if (f.kind === "shot") {
          const x = f.from.x + (f.to.x - f.from.x) * k, y = f.from.y + (f.to.y - f.from.y) * k;
          c.fillStyle = col;
          c.shadowColor = col;
          c.shadowBlur = 10 * this.dpr;
          c.beginPath();
          c.arc(X(x), Y(y), Math.max(2.5 * this.dpr, 0.25 * s), 0, Math.PI * 2);
          c.fill();
          c.shadowBlur = 0;
          continue;
        }
        c.globalAlpha = Math.max(0, 1 - k);
        if (f.kind === "nova") {
          c.strokeStyle = col;
          c.lineWidth = 3 * this.dpr;
          c.beginPath();
          c.arc(X(f.x), Y(f.y), f.r * s * (0.3 + 0.7 * k), 0, Math.PI * 2);
          c.stroke();
        } else if (f.kind === "cone") {
          c.fillStyle = col;
          c.globalAlpha *= 0.35;
          const half = f.cone * Math.PI / 360;
          c.beginPath();
          c.moveTo(X(f.x), Y(f.y));
          c.arc(X(f.x), Y(f.y), f.r * s, f.facing - half, f.facing + half);
          c.closePath();
          c.fill();
        } else if (f.kind === "beam") {
          c.strokeStyle = col;
          c.lineWidth = 2 * this.dpr;
          c.globalAlpha = 1 - k;
          c.beginPath();
          c.moveTo(X(f.from.x), Y(f.from.y));
          c.lineTo(X(f.to.x), Y(f.to.y));
          c.stroke();
          c.globalAlpha = 1;
        } else if (f.kind === "blink") {
          c.strokeStyle = "#d79bff";
          c.lineWidth = 2 * this.dpr;
          c.beginPath();
          c.moveTo(X(f.from.x), Y(f.from.y));
          c.lineTo(X(f.to.x), Y(f.to.y));
          c.stroke();
        } else if (f.kind === "swipe") {
          const u = f.unit, r = (u.radius + (f.small ? 0.8 : 1.4)) * s, half = f.special ? 1.1 : f.small ? 0.5 : 0.7;
          c.strokeStyle = f.special ? "#ff4a3d" : "#f0e2c0";
          c.lineWidth = (f.special ? 5 : f.small ? 2 : 3) * this.dpr;
          c.beginPath();
          c.arc(X(u.x), Y(u.y), r, f.facing - half, f.facing + half);
          c.stroke();
        } else if (f.kind === "freeze") {
          c.fillStyle = "rgba(180,230,255,0.5)";
          c.beginPath();
          c.arc(X(f.unit.x), Y(f.unit.y), f.unit.radius * s * (1 + k), 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 1;
        c.lineWidth = 1;
      }
      if (g.raid && g.raid.kind !== "ally") {
        const r = g.raid, n = r.members || 12, onRaid = g.enemies.some((e) => e.aggro === "raid");
        for (let i = 0; i < n; i++) {
          const a = i * 2.39996, d = Math.sqrt((i + 0.5) / n) * r.radius;
          c.fillStyle = onRaid ? "#c9a27a" : "#7e8a9a";
          c.beginPath();
          c.arc(X(r.x + Math.cos(a) * d), Y(r.y + Math.sin(a) * d), 0.32 * s, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = "rgba(200,210,225,0.55)";
        c.font = `${11 * this.dpr}px "Barlow Condensed", sans-serif`;
        c.textAlign = "center";
        c.fillText("Raid", X(r.x), Y(r.y + r.radius) + 14 * this.dpr);
      }
      const fr = g.player.friend;
      for (const u of g.allies) {
        c.globalAlpha = u.dead ? 0.35 : 1;
        c.fillStyle = u.dead ? "#555" : u.color || "#aaa";
        c.beginPath();
        c.arc(X(u.x), Y(u.y), u.radius * s * V, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = !u.dead && u.hp < u.maxHp * 0.35 ? "#ff4a3d" : "#0b0f0d";
        c.lineWidth = 1.5 * this.dpr;
        c.stroke();
        if (g.allies.length <= 4) {
          c.fillStyle = "rgba(220,225,235,0.75)";
          c.font = `${11 * this.dpr}px "Barlow Condensed", sans-serif`;
          c.textAlign = "center";
          c.strokeStyle = "rgba(0,0,0,0.9)";
          c.lineWidth = 3 * this.dpr;
          c.lineJoin = "round";
          c.strokeText(u.name, X(u.x), Y(u.y + u.radius * V) + 13 * this.dpr);
          c.fillStyle = "rgba(225,230,240,0.9)";
          c.fillText(u.name, X(u.x), Y(u.y + u.radius * V) + 13 * this.dpr);
        }
        if (u === fr) {
          c.strokeStyle = "#59d97b";
          c.lineWidth = 2 * this.dpr;
          c.beginPath();
          c.arc(X(u.x), Y(u.y), (u.radius * V + 0.35) * s, 0, Math.PI * 2);
          c.stroke();
        }
        if (u.dead) {
          c.strokeStyle = "#ddd";
          c.beginPath();
          const r = u.radius * s * V * 0.7;
          c.moveTo(X(u.x) - r, Y(u.y) - r);
          c.lineTo(X(u.x) + r, Y(u.y) + r);
          c.moveTo(X(u.x) + r, Y(u.y) - r);
          c.lineTo(X(u.x) - r, Y(u.y) + r);
          c.stroke();
        }
        c.globalAlpha = 1;
        c.lineWidth = 1;
      }
      if (fr === g.player) {
        c.strokeStyle = "#59d97b";
        c.lineWidth = 2 * this.dpr;
        c.beginPath();
        c.arc(X(g.player.x), Y(g.player.y), Math.max(g.player.radius * s, 13 * this.dpr) * V + 0.4 * s, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 1;
      }
      for (const e of g.enemies) {
        const frozen = e.auras.some((a) => a.def.flags && a.def.flags.frozen);
        const er = e.radius * V;
        if (e === t) {
          c.strokeStyle = e.ai ? "#e03a2a" : "#f0d040";
          c.lineWidth = 2 * this.dpr;
          c.beginPath();
          c.arc(X(e.x), Y(e.y), (er + 0.35) * s, 0, Math.PI * 2);
          c.stroke();
        }
        const im = e.portrait ? this.img(e.portrait) : e.portraitIcon ? this.iconImg(e.portraitIcon) : null;
        c.save();
        c.beginPath();
        c.arc(X(e.x), Y(e.y), er * s, 0, Math.PI * 2);
        c.clip();
        if (im) c.drawImage(im, X(e.x - er), Y(e.y - er), er * 2 * s, er * 2 * s);
        else {
          c.fillStyle = "#8a6a45";
          c.fill();
        }
        if (frozen) {
          c.fillStyle = "rgba(150,215,255,0.45)";
          c.fillRect(X(e.x - er), Y(e.y - er), er * 2 * s, er * 2 * s);
        }
        c.restore();
        c.strokeStyle = frozen ? "#bfe9ff" : "#3a2c1d";
        c.lineWidth = 2 * this.dpr;
        c.beginPath();
        c.arc(X(e.x), Y(e.y), er * s, 0, Math.PI * 2);
        c.stroke();
        const f = e.facing || 0, r0 = er * s;
        c.fillStyle = "#e2b04b";
        c.beginPath();
        c.moveTo(X(e.x) + Math.cos(f) * (r0 + 9 * this.dpr), Y(e.y) + Math.sin(f) * (r0 + 9 * this.dpr));
        c.lineTo(X(e.x) + Math.cos(f + 0.35) * (r0 + 2), Y(e.y) + Math.sin(f + 0.35) * (r0 + 2));
        c.lineTo(X(e.x) + Math.cos(f - 0.35) * (r0 + 2), Y(e.y) + Math.sin(f - 0.35) * (r0 + 2));
        c.closePath();
        c.fill();
        if (g.cls.weapons && e === t) {
          c.strokeStyle = "rgba(255,255,255,0.14)";
          c.lineWidth = 5 * this.dpr;
          c.beginPath();
          c.arc(X(e.x), Y(e.y), r0 + 1.6 * s, f + Math.PI / 2, f + Math.PI * 1.5);
          c.stroke();
        }
        c.lineWidth = 1;
        this.nameplate(e, X(e.x), Y(e.y) - r0 - 10 * this.dpr, e === t);
      }
      const ELEMENT = { fire: "#ff7a3d", earth: "#5bb84a", water: "#4fa3ff", air: "#cfe8ff" };
      for (const tm of g.totems) {
        const r = 0.45 * s * V;
        c.fillStyle = ELEMENT[tm.def.element] || "#ccc";
        c.beginPath();
        c.moveTo(X(tm.x), Y(tm.y) - r);
        c.lineTo(X(tm.x) + r * 0.7, Y(tm.y));
        c.lineTo(X(tm.x), Y(tm.y) + r);
        c.lineTo(X(tm.x) - r * 0.7, Y(tm.y));
        c.closePath();
        c.fill();
        c.strokeStyle = "#0b0f0d";
        c.lineWidth = 1.5 * this.dpr;
        c.stroke();
        c.lineWidth = 1;
      }
      for (const pet of g.pets) {
        c.fillStyle = pet.color;
        c.beginPath();
        c.arc(X(pet.x), Y(pet.y), pet.radius * s * V, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#0b0f0d";
        c.lineWidth = 2 * this.dpr;
        c.stroke();
        c.lineWidth = 1;
        if (pet.casting) {
          const k = 1 - pet.casting.left / Math.max(0.01, pet.casting.total);
          c.strokeStyle = schoolColor(pet.casting.schools);
          c.lineWidth = 2 * this.dpr;
          c.beginPath();
          c.arc(X(pet.x), Y(pet.y), (pet.radius * V + 0.25) * s, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
          c.stroke();
          c.lineWidth = 1;
        }
      }
      const chb = g.player.channel;
      if (chb && chb.ab.channel.beam && chb.ctx.target && !chb.ctx.target.dead) {
        const tg = chb.ctx.target, col = schoolColor(chb.ab.schools);
        c.strokeStyle = col;
        c.shadowColor = col;
        c.shadowBlur = 8 * this.dpr;
        c.lineWidth = (2 + (this.reducedMotion ? 0 : Math.sin(g.time * 18))) * this.dpr;
        c.beginPath();
        c.moveTo(X(g.player.x), Y(g.player.y));
        c.lineTo(X(tg.x), Y(tg.y));
        c.stroke();
        c.shadowBlur = 0;
        c.lineWidth = 1;
      }
      const p = g.player;
      if (isStealthed(p)) c.globalAlpha = 0.4;
      const shadow3 = g.form() === "shadow";
      if (p.dead) c.globalAlpha = 0.45;
      const pr = Math.max(p.radius * s, 13 * this.dpr) * V, cx = X(p.x), cy = Y(p.y), face = this.iconImg(g.cls.icon);
      c.fillStyle = "#000";
      c.beginPath();
      c.arc(cx, cy, pr + 2 * this.dpr, 0, Math.PI * 2);
      c.fill();
      c.save();
      c.beginPath();
      c.arc(cx, cy, pr, 0, Math.PI * 2);
      c.clip();
      if (face && !p.dead) {
        c.drawImage(face, cx - pr * 1.18, cy - pr * 1.18, pr * 2.36, pr * 2.36);
        if (shadow3) {
          c.fillStyle = "rgba(90,47,176,0.55)";
          c.fill();
        }
      } else {
        c.fillStyle = p.dead ? "#6a6a6a" : p.color;
        c.fill();
      }
      c.restore();
      c.strokeStyle = p.dead ? "#6a6a6a" : p.color;
      c.lineWidth = 2 * this.dpr;
      c.beginPath();
      c.arc(cx, cy, pr, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = p.dead ? "#6a6a6a" : p.color;
      c.beginPath();
      c.moveTo(cx + Math.cos(p.facing) * (pr + 8 * this.dpr), cy + Math.sin(p.facing) * (pr + 8 * this.dpr));
      c.lineTo(cx + Math.cos(p.facing + 0.4) * (pr + 1), cy + Math.sin(p.facing + 0.4) * (pr + 1));
      c.lineTo(cx + Math.cos(p.facing - 0.4) * (pr + 1), cy + Math.sin(p.facing - 0.4) * (pr + 1));
      c.closePath();
      c.fill();
      if (p.cast) {
        c.strokeStyle = schoolColor(p.cast.ab.schools);
        c.lineWidth = 2 * this.dpr;
        c.globalAlpha = 0.5 + 0.3 * Math.sin(g.time * 12);
        c.beginPath();
        c.arc(cx, cy, pr + 5 * this.dpr, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
        c.lineWidth = 1;
      }
      if (p.auras.some((a) => a.def.flags && a.def.flags.encased)) {
        c.fillStyle = "rgba(170,225,255,0.55)";
        c.fillRect(X(p.x - 0.9), Y(p.y - 0.9), 1.8 * s, 1.8 * s);
      }
      c.globalAlpha = 1;
      for (const pr2 of g.projectiles) {
        const k = Math.min(1, (g.time - pr2.start) / Math.max(0.01, pr2.end - pr2.start));
        const x = pr2.from.x + (pr2.target.x - pr2.from.x) * k, y = pr2.from.y + (pr2.target.y - pr2.from.y) * k;
        const style = pr2.ability && pr2.ability.projectileStyle, r = Math.max(3 * this.dpr, 0.35 * s);
        const col = style ? style.edge : schoolColor(pr2.schools);
        c.fillStyle = col;
        c.shadowColor = col;
        c.shadowBlur = 8 * this.dpr;
        c.beginPath();
        c.arc(X(x), Y(y), style ? r * 1.35 : r, 0, Math.PI * 2);
        c.fill();
        if (style) {
          c.shadowBlur = 0;
          c.fillStyle = style.core;
          c.beginPath();
          c.arc(X(x), Y(y), r * 0.8, 0, Math.PI * 2);
          c.fill();
        }
        c.shadowBlur = 0;
      }
      const life = 1.3;
      this.texts = this.texts.filter((tx) => g.time - tx.born < life);
      c.textAlign = "center";
      c.lineJoin = "round";
      for (const tx of this.texts) {
        const k = (g.time - tx.born) / life;
        const size = (tx.crit ? 26 : tx.small ? 13 : 17) * this.dpr * (tx.crit && k < 0.12 ? 1.25 : 1);
        c.font = `700 ${size}px "Barlow Condensed", sans-serif`;
        c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        const [lx, ly] = LANES[tx.lane || 0];
        const plate = this.plates.get(tx.unit), rise = this.reducedMotion ? 0 : k * 40 * this.dpr;
        const xx = X(tx.x) + lx * 1.2 * this.dpr, yy = (plate !== void 0 ? plate - 4 * this.dpr + ly * this.dpr : Y(tx.y) + (ly - 14) * this.dpr) - rise;
        c.strokeStyle = "rgba(0,0,0,0.85)";
        c.lineWidth = 4 * this.dpr;
        c.strokeText(tx.text, xx, yy);
        c.fillStyle = tx.color;
        c.fillText(tx.text, xx, yy);
      }
      c.globalAlpha = 1;
    }
    // Where the arena sits on the canvas: between the HUD rows (frames on top, bar below) and left of the meter.
    view() {
      const W = this.cv.width, H = this.cv.height, A = this.app.game.arena, d = this.dpr;
      const meter = document.getElementById("meter"), raid = document.getElementById("raidFrames"), bars = document.querySelector(".hud .bars");
      const mh = `${meter ? meter.offsetHeight : 64}px`, stage = this.cv.parentElement;
      if (stage && stage.style.getPropertyValue("--meter-h") !== mh) stage.style.setProperty("--meter-h", mh);
      const rh = `${this.app.touch && raid && raid.offsetHeight ? raid.offsetHeight + 6 : 0}px`;
      if (stage && stage.style.getPropertyValue("--raid-h") !== rh) stage.style.setProperty("--raid-h", rh);
      let padR = 16 * d;
      const raidTop = this.app.touch && raid && raid.offsetHeight ? raid.offsetHeight + 8 : 0;
      const gapT = this.app.touch ? 26 : 36, gapB = this.app.touch ? 26 : 50;
      let padTop = ((meter ? meter.offsetHeight : 60) + gapT + raidTop) * d, padBot = ((bars ? bars.offsetHeight : 140) + gapB) * d;
      let padL = (!this.app.touch && raid && raid.offsetWidth ? raid.offsetWidth + 24 : 16) * d;
      if (this.app.touch) {
        padTop = 24 * d;
        padBot = 6 * d;
        padL = padR = 8 * d;
      }
      const aw = W - padR - padL, ah = H - padTop - padBot;
      const fit = Math.max(1, Math.min(aw / A.width, ah / A.height));
      const cam = this.cam;
      if (!cam) return { s: fit, ox: padL + (aw - A.width * fit) / 2, oy: padTop + (ah - A.height * fit) / 2 };
      const s = Math.max(fit, Math.min(aw / cam.w, ah / cam.h));
      const place = (lo, span, len, c) => len * s <= span ? lo + (span - len * s) / 2 : Math.min(lo, Math.max(lo + span - len * s, lo + span / 2 - c * s));
      return { s, ox: place(padL, aw, A.width, cam.cx), oy: place(padTop, ah, A.height, cam.cy) };
    }
    // Phone camera: follows you, your target and who is near, smoothly, showing at least CAM_SPAN yards.
    updateCam() {
      const g = this.app.game;
      if (!this.app.touch || !g) {
        this.cam = null;
        return;
      }
      const p = g.player, pts = [p], near = (u) => u && !u.dead && Math.hypot(u.x - p.x, u.y - p.y) < 32;
      if (p.target && !p.target.dead) pts.push(p.target);
      for (const u of [...g.enemies, ...g.allies || []]) if (near(u)) pts.push(u);
      const mt = this.app.moveTarget;
      if (mt && mt.x != null) pts.push(mt);
      const xs = pts.map((u) => u.x), ys = pts.map((u) => u.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const want = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(x1 - x0 + 10, CAM_SPAN), h: Math.max(y1 - y0 + 10, CAM_SPAN * 0.6) };
      const now = performance.now(), c = this.cam;
      if (!c) {
        this.cam = { ...want, t: now };
        return;
      }
      const k = 1 - Math.exp(-(now - c.t) / 280);
      for (const key of ["cx", "cy", "w", "h"]) c[key] += (want[key] - c[key]) * k;
      c.t = now;
    }
    // A nameplate over an enemy, like the game's: its name and a thin health bar (red if it fights back, yellow if not).
    nameplate(e, x, y, isTarget) {
      const c = this.ctx, d = this.dpr, w = 64 * d, hgt = 5 * d;
      this.plates.set(e, y - 5 * d - 11 * d);
      c.globalAlpha = isTarget ? 1 : 0.75;
      c.fillStyle = "rgba(0,0,0,0.75)";
      c.fillRect(x - w / 2 - d, y - d, w + 2 * d, hgt + 2 * d);
      const bw = w * Math.max(0, Math.min(1, e.hp / e.maxHp));
      c.fillStyle = e.ai ? "#c8281e" : "#e0c030";
      c.fillRect(x - w / 2, y, bw, hgt);
      const lg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      lg.addColorStop(0, "rgba(0,0,0,0.32)");
      lg.addColorStop(0.5, "rgba(0,0,0,0.08)");
      lg.addColorStop(1, "rgba(0,0,0,0.32)");
      c.fillStyle = lg;
      c.fillRect(x - w / 2, y, w, hgt);
      c.font = `${12 * d}px "Marcellus", Georgia, serif`;
      c.textAlign = "center";
      c.lineJoin = "round";
      c.strokeStyle = "rgba(0,0,0,0.9)";
      c.lineWidth = 3 * d;
      c.strokeText(e.name, x, y - 5 * d);
      c.fillStyle = isTarget ? "#ffffff" : "#d8d2c4";
      c.fillText(e.name, x, y - 5 * d);
      c.globalAlpha = 1;
    }
    // A screen point in arena yards (tap to move).
    toWorld(clientX, clientY) {
      const r = this.cv.getBoundingClientRect(), { s, ox, oy } = this.view(), A = this.app.game.arena;
      const x = ((clientX - r.left) * this.dpr - ox) / s, y = ((clientY - r.top) * this.dpr - oy) / s;
      return { x: Math.max(0, Math.min(A.width, x)), y: Math.max(0, Math.min(A.height, y)) };
    }
    // Canvas click to target the enemy under the cursor.
    pick(clientX, clientY) {
      const g = this.app.game, r = this.cv.getBoundingClientRect();
      const { s, ox, oy } = this.view();
      const x = ((clientX - r.left) * this.dpr - ox) / s, y = ((clientY - r.top) * this.dpr - oy) / s;
      const V = 1, slack = this.app.touch ? 1 : 0.4;
      return g.enemies.find((e) => Math.hypot(e.x - x, e.y - y) <= e.radius * V + slack) || (g.allies || []).find((u) => Math.hypot(u.x - x, u.y - y) <= u.radius * V + slack) || null;
    }
  };

  // src/ui/links.js
  function parseBuildLink(text) {
    const s = String(text || "").trim();
    const tf = s.match(/talentsforever\.com\/([a-z_-]+)\/\d+\/([0-9-]+)/i);
    if (tf) return { kind: "tf", cls: tf[1].toLowerCase().replace(/-/g, "_"), code: tf[2].split("-").slice(0, 3).join("-") };
    const i = s.indexOf("#");
    const q = new URLSearchParams(i >= 0 ? s.slice(i + 1) : s);
    if (q.get("c") && (i >= 0 || /^c=/.test(s))) return { kind: "lab", hash: i >= 0 ? s.slice(i + 1) : s };
    return null;
  }
  var B64 = {
    enc: (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    dec: (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
  };
  var pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  async function buildCode(query) {
    const q = new URLSearchParams(query);
    q.delete("f");
    q.delete("s");
    const bytes = new TextEncoder().encode(q.toString());
    if (typeof CompressionStream === "undefined") return `FCL0-${B64.enc(bytes)}`;
    return `FCL1-${B64.enc(await pipe(bytes, new CompressionStream("deflate-raw")))}`;
  }
  async function readBuild(text) {
    const s = String(text || "").trim();
    const m = s.match(/FCL([01])-([A-Za-z0-9_-]+)/);
    if (m) {
      try {
        let bytes = B64.dec(m[2]);
        if (m[1] === "1") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
        const q = new URLSearchParams(new TextDecoder().decode(bytes));
        return q.get("c") ? q.toString() : null;
      } catch {
        return null;
      }
    }
    const l = parseBuildLink(s);
    return l && l.kind === "lab" ? l.hash : null;
  }

  // src/ui/feedback.js
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbyD4KyupgtqzbUrPFqYsL2QyKIzRU8CQX-Lynns8npvwXPIF77Iam6RfBCoLiNTQPS3/exec";
  var EMAIL = "daniel.manginelli.o@gmail.com";
  var store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch {
      }
    }
  };
  function clientId() {
    let id = store.get("fcl-cid");
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = crypto.randomUUID && crypto.randomUUID() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      store.set("fcl-cid", id);
    }
    return id;
  }
  function context(app) {
    app.writeUrl();
    const b = app.activeBuild();
    return {
      cls: app.cls.name,
      build: b ? b.name : "own build",
      test: app.scenario.name,
      link: location.href,
      words: `${b ? `${b.name} ${app.cls.name}` : `${app.cls.name} (your own build)`}, ${app.scenario.name} test, and the link to this build`
    };
  }
  function openFeedback(app) {
    if ($(".feedback-back")) return;
    const ctx = context(app);
    const kind = h("div", { class: "seg fb-kind", role: "radiogroup", "aria-label": "What is it about" });
    let chosen = "feel";
    const KINDS = { feel: "How it feels", wrong: "Something is wrong", idea: "An idea" };
    for (const [k, label] of Object.entries(KINDS)) {
      const b = h("button", { type: "button", class: `seg-btn${k === chosen ? " on" : ""}`, role: "radio", "aria-checked": String(k === chosen) }, label);
      b.addEventListener("click", () => {
        chosen = k;
        for (const x of kind.children) {
          x.classList.toggle("on", x === b);
          x.setAttribute("aria-checked", String(x === b));
        }
        msg.placeholder = HINT[k];
      });
      kind.append(b);
    }
    const HINT = {
      feel: "Does this feel like your class? What feels right, what feels off?",
      wrong: "What happened, and what did you expect? A number, a tooltip, an ability that does not work...",
      idea: "What would make the lab more useful to you?"
    };
    const msg = h("textarea", { rows: 5, maxlength: 3e3, placeholder: HINT.feel, "aria-label": "Your message" });
    const beta = h(
      "select",
      { "aria-label": "Did you play this class in the beta?" },
      h("option", { value: "" }, "-"),
      h("option", {}, "Yes"),
      h("option", {}, "No")
    );
    const contact = h("input", { type: "text", maxlength: 200, autocomplete: "email", placeholder: "Discord, Reddit or email" });
    const trap2 = h("input", { type: "text", class: "trap", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    const status = h("p", { class: "fb-status", role: "status", "aria-live": "polite" });
    const send = h("button", { type: "submit", class: "ghost on", disabled: true }, "Send");
    const close = () => {
      back.remove();
      removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const form = h(
      "form",
      { class: "modal fb", "aria-labelledby": "fbTitle" },
      h("h2", { class: "modal-title", id: "fbTitle" }, "Feedback"),
      h("p", { class: "modal-sub" }, "Tell me what feels right or wrong about your class. Every message is read."),
      kind,
      h("label", { class: "fb-field" }, h("span", {}, "Your message"), msg),
      h(
        "div",
        { class: "fb-row" },
        h("label", { class: "fb-field" }, h("span", {}, "Did you play this class in the beta?"), beta),
        h("label", { class: "fb-field" }, h("span", {}, "Contact (optional)"), contact)
      ),
      trap2,
      h("p", { class: "fb-attached" }, `Attached: ${ctx.words}.`),
      h("div", { class: "fb-actions" }, send, h("button", { type: "button", class: "ghost", onclick: close }, "Cancel")),
      status,
      h("p", { class: "fb-privacy" }, "Your message and what is attached are stored privately and used only to improve the lab. Contact is optional and never shared.")
    );
    const back = h("div", { class: "modal-back feedback-back" }, form);
    back.addEventListener("click", (e) => {
      if (e.target === back) close();
    });
    addEventListener("keydown", onKey, true);
    msg.addEventListener("input", () => {
      send.disabled = !msg.value.trim();
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!msg.value.trim()) return;
      const body2 = { cid: clientId(), type: "feedback", kind: chosen, message: msg.value, beta: beta.value, contact: contact.value, website: trap2.value, cls: ctx.cls, build: ctx.build, test: ctx.test, link: ctx.link };
      if (!ENDPOINT) {
        const text = `${KINDS[chosen]}

${msg.value}

Played it in the beta: ${beta.value || "-"}
Contact: ${contact.value || "-"}
${ctx.cls}, ${ctx.build}, ${ctx.test} test
${ctx.link}`;
        location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Forever Class Lab: ${KINDS[chosen]}`)}&body=${encodeURIComponent(text)}`;
        status.textContent = "Your email app should open with the message ready to send.";
        return;
      }
      send.disabled = true;
      status.classList.remove("is-error");
      status.textContent = "Sending...";
      const post = () => fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body2) }).then((r) => r.json());
      try {
        let r = await post();
        if (!r.ok && r.error === "busy") {
          await new Promise((res) => setTimeout(res, 4e3));
          r = await post();
        }
        if (!r.ok) throw new Error(r.error || "failed");
        form.replaceChildren(h("h2", { class: "modal-title" }, "Thank you!"), h("p", { class: "modal-sub" }, "Your message arrived. It helps the lab get closer to the real game."), h("div", { class: "fb-actions" }, h("button", { type: "button", class: "ghost on", onclick: close }, "Close")));
      } catch (err) {
        send.disabled = false;
        status.classList.add("is-error");
        status.textContent = err.message === "busy" ? "Too many messages right now. Please wait a moment and try again." : "It did not go through. Please try again in a moment.";
      }
    });
    document.body.append(back);
    msg.focus();
  }

  // src/ui/app.js
  var COMMON = { abilities: consumableAbilities, auras: consumableAuras };
  var DEFAULT_GEAR = "preraid";
  var OLD_TIERS = /^(mc|bwl)(?=_|$)/;
  var TOUCH2 = typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches || /[?&]touch=1\b/.test(location.search);
  var App = class {
    constructor() {
      this.scenario = SCENARIOS[DEFAULT_SCENARIO];
      this.keys = /* @__PURE__ */ new Set();
      this.touch = TOUCH2;
      this.moveTarget = null;
      this.pickSlot = null;
      document.body.classList.toggle("touch", TOUCH2);
      document.body.classList.toggle("bars-v1", /[?&]bars=v1\b/.test(location.search));
      if (TOUCH2) document.body.dataset.view = "play";
      const firstVisit = !new URLSearchParams(location.hash.slice(1)).get("c");
      this.readUrl();
      this.newGame();
      this.mount();
      this.bindKeys();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
      if (firstVisit && (this.cls.builds || []).length) this.setBuild(this.cls.builds[0]);
    }
    /* ---------- state and URL ---------- */
    // A fresh character of the current class: no talents, an empty bar, the default gear and options.
    freshState() {
      const cls = this.cls;
      this.talents = {};
      this.buildNotice = null;
      this.noticeClosed = false;
      this.bar = KEYS.map(() => null);
      const start = gearPresetFor(cls.gearPresets, DEFAULT_GEAR) || cls.gearPresets[0];
      this.gearId = start.id;
      this.gear = { ...start.gear };
      this.options = {};
      for (const [k, d] of Object.entries(cls.options || {})) this.options[k] = d.default;
      this.fillScenarioOptions();
    }
    // Every option of the current fight has a value (its default unless chosen).
    fillScenarioOptions() {
      this.scenarioOptions = this.scenarioOptions || {};
      for (const [k, d] of Object.entries(this.scenario.options || {})) if (this.scenarioOptions[k] == null) this.scenarioOptions[k] = d.default;
    }
    readUrl() {
      const q = new URLSearchParams(location.hash.slice(1));
      this.cls = CLASSES[q.get("c")] || CLASSES[DEFAULT_CLASS];
      this.scenario = scenarioFor(this.cls, q.get("f"));
      this.freshState();
      const cls = this.cls;
      if (q.get("t")) {
        const from = q.get("v") ? `${DATA_BUILD.split(".").slice(0, 3).join(".")}.${q.get("v")}` : LINK_DEFAULT;
        const m = migrateBuild(cls.trees, cls.talentHistory, q.get("t"), from);
        this.talents = m.ranks;
        this.buildNotice = m.step ? { cls: cls.name, date: m.step.date, notes: m.notes, touched: false, closed: false } : null;
      }
      const ids = new Set(this.abilityIds());
      if (q.get("b")) {
        const bar = q.get("b").split(".");
        this.bar = KEYS.map((_, i) => ids.has(bar[i]) ? bar[i] : null);
      }
      const g = (q.get("g") || "").replace(OLD_TIERS, "preraid") || null;
      const bySpec = (cls.builds || []).find((b) => encodeBuild(cls.trees, b.talents) === encodeBuild(cls.trees, this.talents));
      const preset = g && (cls.gearPresets.find((p) => p.id === g) || gearPresetFor(cls.gearPresets, g, bySpec && bySpec.gearRole));
      if (preset) {
        this.gearId = preset.id;
        this.gear = { ...preset.gear };
      }
      if (g === "custom" && q.get("gc")) {
        this.gearId = "custom";
        for (const kv of q.get("gc").split(",")) {
          const [k, v] = kv.split(":");
          if (cls.gearFields.some((f) => f.k === k)) this.gear[k] = +v || 0;
        }
      }
      const parse = (s, into, defs) => {
        for (const kv of (s || "").split(",")) {
          const [k, v] = kv.split(":");
          if (!defs[k]) continue;
          into[k] = defs[k].type === "toggle" ? v === "1" : isNaN(+v) ? v : +v;
        }
      };
      parse(q.get("o"), this.options, cls.options || {});
      parse(q.get("s"), this.scenarioOptions, this.scenario.options || {});
    }
    writeUrl() {
      const q = new URLSearchParams();
      q.set("c", this.cls.id);
      q.set("v", DATA_BUILD.split(".").pop());
      const code = encodeBuild(this.cls.trees, this.talents).replace(/-+$/, "");
      if (code) q.set("t", code);
      const bar = this.bar.map((x) => x || "").join(".").replace(/\.+$/, "");
      if (bar) q.set("b", bar);
      q.set("g", this.gearId);
      if (this.scenario.id !== DEFAULT_SCENARIO) q.set("f", this.scenario.id);
      if (this.gearId === "custom") q.set("gc", this.cls.gearFields.map((f) => `${f.k}:${+(this.gear[f.k] || 0).toFixed(3)}`).join(","));
      const ser = (o2, defs) => Object.entries(o2).filter(([k, v]) => defs[k] && v !== defs[k].default).map(([k, v]) => `${k}:${v === true ? 1 : v === false ? 0 : v}`).join(",");
      const o = ser(this.options, this.cls.options || {}), s = ser(this.scenarioOptions, this.scenario.options || {});
      if (o) q.set("o", o);
      if (s) q.set("s", s);
      history.replaceState(null, "", `#${q.toString()}`);
      this.refreshCode();
    }
    // The build code in Import / Export follows every change (talents, bar, gear, options, the extra bar's choice).
    async refreshCode() {
      const out = document.getElementById("codeOut");
      if (!out) return;
      const hash = location.hash.slice(1), code = await buildCode(hash);
      if (location.hash.slice(1) === hash) out.value = code;
    }
    // What can be on the action bar: the simulated abilities of the class and the consumables.
    abilityIds() {
      return [...this.cls.abilities, ...consumableAbilities].filter((a) => !a.notSimulated).map((a) => a.id);
    }
    // What the tree rules let the build use (`active`) and the talents that lost a requirement (`broken`).
    talentState() {
      return placeBuild(this.cls.trees, this.talents);
    }
    loadout() {
      return { talents: { ...this.talentState().active }, bar: this.bar.slice(), gear: { ...this.gear }, options: { ...this.options } };
    }
    newGame() {
      this.game = new Game({ cls: this.cls, scenario: this.scenario, scenarioOptions: { ...this.scenarioOptions }, common: COMMON, loadout: this.loadout() });
      this.waitForStart();
      this.game.on("cast:success", ({ ability }) => {
        if (!ability.setsOption) return;
        const [k, v] = ability.setsOption;
        this.options[k] = v;
        this.game.loadout.options = { ...this.game.loadout.options, [k]: v };
        this.writeUrl();
      });
      this.game.on("aggro", ({ from, to }) => {
        if (from === "player" && to === "raid" && !this.game.player.dead) this.game.emit("error", "The boss turned to the raid. Taunt it back!");
      });
      if (this.arena) this.arena.attach(this.game);
      if (this.hudRoot) {
        buildHud(this.hudRoot, this);
        afterHud(this);
      }
    }
    // Talents and gear change the character, so the fight starts over (like a respec).
    rebuild() {
      this.newGame();
      this.refreshPanels();
      this.writeUrl();
      this.mountClass();
    }
    /* ---------- actions ---------- */
    setClass(id) {
      if (this.cls.id === id) return;
      this.cls = CLASSES[id];
      this.useScenario(this.scenario.id);
      this.freshState();
      this.newGame();
      $("#tab-talents").innerHTML = "";
      this.mountClass();
      this.refreshPanels();
      this.writeUrl();
    }
    setTalents(ranks) {
      this.talents = ranks;
      if (!Object.keys(ranks).length) this.buildNotice = null;
      else this.touchNotice();
      this.rebuild();
    }
    // A build from a pasted build code or lab link (Import / Export). The whole build opens in the test you are in; with
    // `barOnly`, only its action bar comes in and your talents stay. Returns a message for the player.
    async importBuild(text, barOnly = false) {
      const hash = await readBuild(text);
      if (!hash) return "That is not a Forever Class Lab build code or link.";
      const q = new URLSearchParams(hash);
      if (barOnly) {
        const cls = CLASSES[q.get("c")];
        if (cls !== this.cls) return `That action bar is for a ${cls ? cls.name : "class the lab does not have"}. Pick that class first.`;
        const ids = new Set(this.abilityIds()), bar = (q.get("b") || "").split(".");
        this.bar = KEYS.map((_, i) => ids.has(bar[i]) ? bar[i] : null);
        this.barChanged();
        return "Action bar imported.";
      }
      if (this.cls.id === q.get("c")) {
        const now = new URLSearchParams(location.hash.slice(1));
        for (const k of ["f", "s"]) {
          q.delete(k);
          if (now.get(k)) q.set(k, now.get(k));
        }
      }
      location.hash = q.toString();
      location.reload();
      return "Opening the build...";
    }
    // A suggested build: its talents, its bar and its options (weapons, poisons...). Gear keeps its level; a build that
    // names a gear role (Druid: feral or caster) switches to that role's preset of the same level.
    // A tank build (b.scenario) fights the Raid Boss; the others the Training Dummy.
    setBuild(b) {
      this.useScenario(b.scenario || DEFAULT_SCENARIO);
      const cur = this.cls.gearPresets.find((p) => p.id === this.gearId);
      if (b.gearRole && cur && cur.role && cur.role !== b.gearRole) {
        const next = gearPresetFor(this.cls.gearPresets, presetTier(cur), b.gearRole);
        if (next) {
          this.gearId = next.id;
          this.gear = { ...next.gear };
        }
      }
      this.talents = { ...b.talents };
      this.buildNotice = null;
      this.noticeClosed = false;
      this.bar = KEYS.map((_, i) => b.bar[i] || null);
      this.options = {};
      for (const [k, d] of Object.entries(this.cls.options || {})) this.options[k] = d.default;
      Object.assign(this.options, b.options || {});
      this.rebuild();
    }
    clearBuild() {
      this.talents = {};
      this.buildNotice = null;
      this.bar = KEYS.map(() => null);
      this.rebuild();
    }
    activeBuild() {
      const code = encodeBuild(this.cls.trees, this.talents);
      return (this.cls.builds || []).find((b) => encodeBuild(this.cls.trees, b.talents) === code) || null;
    }
    // The notice about a build from older trees goes away once the player has fixed the tree (or closes it).
    touchNotice() {
      const n = this.buildNotice;
      if (!n) return;
      n.touched = true;
      const { broken } = this.talentState();
      if (!broken.size && Object.values(this.talents).reduce((a, r) => a + r, 0) >= RULES.talentPoints) n.closed = true;
    }
    addTalent(id) {
      const why = cannotAdd(this.cls.trees, this.talents, id);
      if (why) {
        this.game.emit("error", why);
        return;
      }
      this.talents = { ...this.talents, [id]: (this.talents[id] || 0) + 1 };
      this.touchNotice();
      const taught = this.cls.abilities.find((a) => a.talent === id);
      if (taught && !this.bar.includes(taught.id)) {
        const i = this.bar.indexOf(null);
        if (i >= 0) this.bar[i] = taught.id;
      }
      this.rebuild();
    }
    removeTalent(id) {
      const { active, broken } = this.talentState();
      const why = broken.has(id) ? this.talents[id] > 0 ? null : "No points" : cannotRemove(this.cls.trees, active, id);
      if (why) {
        this.game.emit("error", why);
        return;
      }
      const r = { ...this.talents, [id]: this.talents[id] - 1 };
      if (!r[id]) delete r[id];
      this.talents = r;
      this.touchNotice();
      this.rebuild();
    }
    // Only simulated spells go on the action bar: one that is not simulated would do nothing in the fight.
    simulated(id) {
      const ab = this.game.ability(id);
      return !!ab && !ab.notSimulated;
    }
    notSimulatedError(id) {
      this.game.emit("error", `${this.game.ability(id)?.name || "That spell"} is not simulated yet`);
    }
    addToBar(id) {
      if (!this.simulated(id)) {
        this.notSimulatedError(id);
        return;
      }
      if (this.bar.includes(id)) return;
      const i = this.bar.indexOf(null);
      if (i < 0) {
        this.game.emit("error", this.touch ? "Your action bar is full. Pick a slot in the bar above to replace it." : "Your action bar is full. Right click a slot to clear it.");
        return;
      }
      this.setBarSlot(i, id);
    }
    setBarSlot(i, id) {
      if (id && !this.simulated(id)) {
        this.notSimulatedError(id);
        return;
      }
      if (id) {
        const j = this.bar.indexOf(id);
        if (j >= 0) this.bar[j] = null;
      }
      this.bar[i] = id;
      this.barChanged();
    }
    swapSlots(a, b) {
      [this.bar[a], this.bar[b]] = [this.bar[b], this.bar[a]];
      this.barChanged();
    }
    barChanged() {
      this.game.loadout.bar = this.bar.slice();
      fillBar(this.hudRoot, this);
      if (this.pickSlot != null) {
        const back = this.pickReturn;
        this.pickSlot = null;
        if (back) this.showView("play");
      }
      renderSpellbook($("#tab-spells"), this);
      this.writeUrl();
    }
    pressSlot(i) {
      const id = this.bar[i];
      if (!id) {
        if (this.touch) this.pickForSlot(i);
        return;
      }
      if (!this.game.frozen) this.game.useAbility(id);
    }
    // Touch: an empty slot (or a slot chosen in the spellbook's bar) waits for a spell; the next spell tapped goes there.
    pickForSlot(i, stay = false) {
      this.pickSlot = i;
      this.pickReturn = !stay;
      renderSpellbook($("#tab-spells"), this);
      if (!stay) this.showView("spells");
    }
    // Touch: one view at a time (the game, or one tab of the builder), switched by the bar at the bottom.
    showView(view) {
      hideTip();
      document.body.dataset.view = view;
      for (const b of $$(".touch-nav button")) b.setAttribute("aria-current", String(b.dataset.view === view));
      if (view !== "play") this.showTab(view);
      if (view !== "spells" && this.pickSlot != null) {
        this.pickSlot = null;
        renderSpellbook($("#tab-spells"), this);
      }
      if (view === "play") requestAnimationFrame(() => this.arena.resize());
      applyMobile(this);
    }
    setGear(id) {
      this.gearId = id;
      if (id !== "custom") this.gear = { ...this.cls.gearPresets.find((p) => p.id === id).gear };
      this.rebuild();
    }
    setGearValue(k, v) {
      this.gearId = "custom";
      this.gear = { ...this.gear, [k]: v };
      this.rebuild();
    }
    setOption(k, v) {
      this.options = { ...this.options, [k]: v };
      if (k === "race") this.swapRacials();
      this.rebuild();
    }
    // A new race: the racial abilities of the old one on the bar become the new race's (in order), or leave the bar.
    swapRacials() {
      const race = this.options.race, find = (id) => this.cls.abilities.find((a) => a.id === id);
      const fits = (a) => [].concat(a.race).includes(race);
      const free = this.cls.abilities.filter((a) => a.race && fits(a) && !a.notSimulated && !this.bar.includes(a.id)).map((a) => a.id);
      this.bar = this.bar.map((id) => {
        const ab = id && find(id);
        return ab && ab.race && !fits(ab) ? free.shift() || null : id;
      });
    }
    setScenarioOption(k, v) {
      this.scenarioOptions = { ...this.scenarioOptions, [k]: v };
      this.rebuild();
    }
    useScenario(id) {
      const sc = scenarioFor(this.cls, id);
      if (sc === this.scenario) return;
      const keep = Object.fromEntries(Object.entries(this.scenarioOptions).filter(([k]) => ((this.scenario.options || {})[k] || {}).advanced));
      this.scenario = sc;
      this.scenarioOptions = { ...keep };
      this.fillScenarioOptions();
    }
    setScenario(id) {
      this.useScenario(id);
      this.rebuild();
    }
    resetFight() {
      this.game.reset();
      this.arena.clear();
      this.waitForStart();
    }
    // Every fight waits behind the start window: the bar, the talents, the stance bar and the test options can change, but
    // nothing moves until Start (or Enter).
    waitForStart() {
      this.game.frozen = true;
      const box = document.getElementById("startOverlay");
      if (!box) return;
      box.hidden = false;
      $("#startTest").textContent = `${this.scenario.name} test`;
      this.moveTarget = null;
      document.body.classList.remove("fighting");
      applyMobile(this);
    }
    start() {
      if (!this.game.frozen) return;
      this.game.frozen = false;
      $("#startOverlay").hidden = true;
      document.body.classList.add("fighting");
      applyMobile(this);
      const cv = $("#arena");
      if (cv) cv.focus({ preventScroll: true });
    }
    // A stance bar button: in the fight it is the ability; before Start it picks how the fight begins (the stance, aura,
    // form, armor, poison, race...), through the option the ability remembers.
    stanceClick(id) {
      const ab = this.game.ability(id);
      if (!ab) return;
      if (!this.game.frozen) {
        this.game.useAbility(id);
        return;
      }
      if (!ab.setsOption || !this.game.isKnown(ab)) return;
      const [k, v] = ab.setsOption;
      if (this.options[k] === v) {
        const def = (this.cls.options || {})[k];
        if (def && def.values.includes("none")) this.setOption(k, "none");
        return;
      }
      this.setOption(k, v);
    }
    /* ---------- page ---------- */
    mount() {
      $("#startBtn").addEventListener("click", () => this.start());
      $("#feedbackBtn").addEventListener("click", () => openFeedback(this));
      $("#footFeedback").addEventListener("click", () => openFeedback(this));
      $("#shareBtn").addEventListener("click", async () => {
        this.writeUrl();
        try {
          await navigator.clipboard.writeText(location.href);
          $("#shareBtn").textContent = "Link copied";
        } catch {
          $("#shareBtn").textContent = "Copy the address bar";
        }
        setTimeout(() => {
          $("#shareBtn").textContent = "Copy link";
        }, 1800);
      });
      const box = $("#linkBox"), note = $("#linkNote"), input = $("#linkInput"), out = $("#codeOut");
      const showCode = async () => {
        this.writeUrl();
        await this.refreshCode();
      };
      $("#linkBtn").addEventListener("click", () => {
        box.hidden = !box.hidden;
        $("#linkBtn").setAttribute("aria-expanded", String(!box.hidden));
        if (!box.hidden) {
          note.textContent = "";
          showCode();
        }
      });
      $("#codeCopy").addEventListener("click", async () => {
        await showCode();
        try {
          await navigator.clipboard.writeText(out.value);
          note.textContent = "Build code copied.";
        } catch {
          out.select();
          note.textContent = "Select the code and copy it.";
        }
      });
      const open = async () => {
        note.textContent = await this.importBuild(input.value, $("#barOnly").checked);
        if (/imported/.test(note.textContent)) {
          input.value = "";
          showCode();
        }
      };
      $("#linkGo").addEventListener("click", open);
      for (const el of [input, out]) {
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && el === input) open();
          e.stopPropagation();
        });
        el.addEventListener("keyup", (e) => e.stopPropagation());
      }
      document.addEventListener("paste", async (e) => {
        if (e.target.closest && e.target.closest("input, textarea")) return;
        const text = e.clipboardData && e.clipboardData.getData("text");
        if (!/FCL[01]-|#c=|^c=/.test(String(text || "").trim())) return;
        e.preventDefault();
        const msg = await this.importBuild(text);
        if (this.game) this.game.emit("error", msg);
      });
      for (const tab of $$(".tab")) tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
      this.hudRoot = $("#hud");
      this.arena = new Arena($("#arena"), this);
      this.arena.attach(this.game);
      $("#arena").addEventListener("contextmenu", (e) => e.preventDefault());
      $("#arena").addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
        const t = this.arena.pick(e.clientX, e.clientY), touch = e.pointerType !== "mouse";
        if (t && t.kind === "ally") {
          this.game.setFriend(t);
          return;
        }
        if (t) {
          if (touch && t === this.game.player.target && !this.game.frozen) this.moveTarget = { unit: t };
          this.game.setFriend(null);
          this.game.engage(t);
          return;
        }
        if (touch && !this.game.frozen) {
          const w = this.arena.toWorld(e.clientX, e.clientY);
          this.moveTarget = { x: w.x, y: w.y };
        }
      });
      for (const b of $$(".touch-nav button")) b.addEventListener("click", () => this.showView(b.dataset.view));
      buildHud(this.hudRoot, this);
      afterHud(this);
      this.mountClass();
      this.refreshPanels();
      this.showTab("talents");
      this.writeUrl();
      mountMobile(this);
    }
    mountClass() {
      document.title = `${this.cls.name} \xB7 Forever Class Lab`;
      document.documentElement.style.setProperty("--cls", this.cls.color);
      renderClassMenu($("#classPick"), this);
      const foe = this.scenario.attacks || this.scenario.heals ? "the boss" : "the dummy";
      const hintTouch = document.getElementById("startHintTouch");
      if (hintTouch) hintTouch.textContent = this.scenario.heals ? "Tap a frame, then a heal. Tap the ground to walk." : "Tap the ground to walk. Tap your target again to walk up to it.";
      $("#keysHint").innerHTML = this.touch ? this.scenario.heals ? "Tap a frame, then a heal \xB7 tap the ground to walk" : "Tap the ground to walk \xB7 tap your target again to walk up to it" : this.scenario.heals ? "<kbd>1</kbd>-<kbd>=</kbd> spells \xB7 click a frame to heal it \xB7 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move \xB7 <kbd>R</kbd> reset" : this.cls.stats && this.cls.weapons ? `<kbd>1</kbd>-<kbd>=</kbd> abilities \xB7 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move \xB7 click ${foe} to attack \xB7 <kbd>Tab</kbd> target \xB7 <kbd>R</kbd> reset` : `<kbd>1</kbd>-<kbd>=</kbd> spells \xB7 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move \xB7 <kbd>Tab</kbd> target \xB7 <kbd>Esc</kbd> stop casting \xB7 <kbd>R</kbd> reset`;
    }
    showTab(id) {
      for (const t of $$(".tab")) t.setAttribute("aria-selected", String(t.dataset.tab === id));
      for (const p of $$(".tab-panel")) p.hidden = p.id !== `tab-${id}`;
    }
    renderBuilds() {
      renderSpecButtons($("#builds"), this);
      buildPanel($("#meter"), this);
    }
    refreshPanels() {
      this.renderBuilds();
      const tal = $("#tab-talents");
      if (!tal.firstChild) renderTalents(tal, this);
      else updateTalents(tal, this);
      renderSpellbook($("#tab-spells"), this);
      renderGear($("#tab-gear"), this);
      updateSheet($("#tab-gear"), this);
      afterPanels(this);
      refreshTip();
    }
    bindKeys() {
      const typing = (e) => /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "range" && e.target.type !== "checkbox";
      const MOVE = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] };
      const applyMove = () => {
        let x = 0, y = 0;
        for (const k of this.keys) if (MOVE[k]) {
          x += MOVE[k][0];
          y += MOVE[k][1];
        }
        this.game.player.input = { x, y };
      };
      addEventListener("keydown", (e) => {
        if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (e.shiftKey && digit && this.cls.stanceBar) {
          e.preventDefault();
          const id = this.cls.stanceBar.abilities.filter((x) => this.game.isKnown(this.game.ability(x)))[+digit[1] - 1];
          if (id && !e.repeat) this.stanceClick(id);
          return;
        }
        if (this.game.frozen) {
          if ((k === "enter" || k === " ") && (!/^(BUTTON|A)$/.test(e.target.tagName) || e.target.closest(".hud"))) {
            e.preventDefault();
            this.start();
          }
          return;
        }
        const slot = KEYS.indexOf(e.key);
        if (slot >= 0) {
          e.preventDefault();
          if (!e.repeat) this.pressSlot(slot);
          return;
        }
        if (k === "tab") {
          e.preventDefault();
          this.game.tabTarget();
          return;
        }
        if (MOVE[k]) {
          e.preventDefault();
          this.moveTarget = null;
          this.keys.add(k);
          applyMove();
          return;
        }
        if (k === "r" && !e.repeat) this.resetFight();
        if (k === "escape") {
          this.game.cancelCast("cancelled");
          this.game.endChannel("cancelled");
          this.game.stopAttack();
        }
      });
      addEventListener("keyup", (e) => {
        const k = e.key.toLowerCase();
        if (this.keys.delete(k)) applyMove();
      });
      addEventListener("blur", () => {
        this.keys.clear();
        applyMove();
      });
    }
    frame(now) {
      const dt = Math.min(0.1, (now - this.last) / 1e3);
      this.last = now;
      this.stepMove();
      this.game.update(dt);
      layoutMobile(this);
      this.arena.draw();
      updateHud(this.hudRoot, this);
      requestAnimationFrame((t) => this.frame(t));
    }
  };
  App.prototype.stepMove = function() {
    const m = this.moveTarget, g = this.game, p = g.player;
    if (!m) return;
    if (g.frozen || p.dead || m.unit && m.unit.dead) {
      this.moveTarget = null;
      p.input = { x: 0, y: 0 };
      return;
    }
    const tx = m.unit ? m.unit.x : m.x, ty = m.unit ? m.unit.y : m.y;
    const done = m.unit ? g.edgeDistance(p, m.unit) <= RULES.meleeRange - 0.5 : Math.hypot(tx - p.x, ty - p.y) < 0.3;
    if (done) {
      this.moveTarget = null;
      p.input = { x: 0, y: 0 };
      return;
    }
    const dx = tx - p.x, dy = ty - p.y, len = Math.hypot(dx, dy) || 1;
    p.input = { x: dx / len, y: dy / len };
  };
  window.lab = new App();
})();
