const DH_MANA = {
  light: "#cfe6ff",
  mid: "#6fb4ff",
  deep: "#2f7bff",
  glow: "111,180,255"
};

function dhRuptureActive(g) {
  const p = g.player;
  return p && p.breakStacks > 0 && g.time < p.breakUntil;
}

function dhChargeStacks(g) {
  return dhRuptureActive(g) ? g.player.breakStacks : 0;
}

function dhAddRupture(g, target, n) {
  const t = g.tune.specs.spellbreaker, p = g.player;
  if (!dhRuptureActive(g)) p.breakStacks = 0;
  p.breakStacks = Math.min(t.breakMaxStacks, p.breakStacks + n);
  p.breakUntil = g.time + t.breakDuration;
  g.floater(p, "Mana Charge " + p.breakStacks, p.breakStacks >= (t.scarStacks || t.breakMaxStacks) ? DH_MANA.light : DH_MANA.mid, {
    small: true
  });
}

function dhHasOffHand(g) {
  const o = g.tune.weapons.offHand;
  return !!o && !o.none;
}

function dhManaScar(g, target) {
  const t = g.tune.abilities.mana_scar, n = dhChargeStacks(g), p = g.player, hits = t.hits || 2;
  for (let i = 0; i < hits; i++) {
    const hand = i % 2 === 0 ? "main" : "off";
    g.schedule(i * (t.hitDelay || .15), g2 => {
      if (target.dead) {
        if (i === hits - 1 && n) {
          g2.player.breakStacks = 0;
          g2.addLog(`Mana Scar consumes ${n} Mana Charge stacks.`, DH_MANA.light);
        }
        return;
      }
      const res = g2.playerHit(target, {
        amount: t.weaponDps * g2.weaponDps(hand),
        school: "arcane",
        name: `Mana Scar ${i + 1}/${hits}`,
        ability: "mana_scar",
        melee: true,
        weapon: true,
        hand: hand,
        spCoef: t.spCoef / hits,
        hugeText: i === hits - 1
      });
      const a = Math.atan2(target.y - p.y, target.x - p.x) + (i % 2 ? -.7 : 0);
      g2.fx({
        kind: "iai",
        x: target.x,
        y: target.y,
        a: a,
        len: 8 + n * .5,
        color: DH_MANA.mid,
        core: "#ffffff",
        life: .45,
        max: .45
      });
      g2.emit("shake", .25);
      if (i === hits - 1) {
        g2.fx({
          kind: "ring",
          x: target.x,
          y: target.y,
          r: 2.4,
          color: DH_MANA.light,
          life: .35,
          max: .35
        });
        if (n) {
          g2.player.breakStacks = 0;
          g2.addLog(`Mana Scar consumes ${n} Mana Charge stacks.`, DH_MANA.light);
        }
      }
    });
  }
}

function dhScarFx(target, a) {
  const R = TL.util.rand, pts = [], branches = [], n = 9;
  let v = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    v += R(-.06, .06);
    pts.push({
      u: u,
      v: v,
      w: Math.pow(Math.sin(Math.PI * u), .7) * R(.6, 1.3)
    });
  }
  for (let i = 2; i < n - 1; i++) if (Math.random() < .45) branches.push({
    u: pts[i].u,
    v: pts[i].v,
    a: (Math.random() < .5 ? -1 : 1) * R(.6, 1.2),
    l: R(.08, .18)
  });
  return {
    kind: "scar",
    x: target.x,
    y: target.y,
    a: a + .35,
    len: Math.max(3.2, target.radius * 3.4),
    pts: pts,
    branches: branches,
    life: .9,
    max: .9
  };
}

function dhShackle(g, target) {
  const t = g.tune.abilities.shackle_demon;
  for (const e of g.enemies) if (e !== target && e.shackledUntil > g.time) {
    e.shackledUntil = 0;
    g.addLog(`${e.name} is no longer shackled.`, "#9aa39b");
  }
  if (target.cast) {
    g.floater(target, "Interrupted", DH_MANA.light, {
      small: true
    });
    g.addLog(`Shackle Demon interrupts ${target.name}'s ${target.cast.name}.`, DH_MANA.light);
    target.cast = null;
  }
  target.shackledUntil = g.time + t.duration;
  if (g.target === target) g.player.attacking = false;
  g.aggro(target);
  g.floater(target, "Shackled", DH_MANA.light, {
    small: true
  });
  g.fx({
    kind: "ring",
    x: target.x,
    y: target.y,
    r: 1.8,
    color: DH_MANA.mid,
    life: .45,
    max: .45
  });
  g.addLog(`Shackle Demon: ${target.name} is shackled for ${t.duration} sec.`, DH_MANA.light);
}

function dhPct(v) {
  const x = Math.round(v * 1e3) / 10;
  return (Number.isInteger(x) ? x : x.toFixed(1)) + "%";
}

function dhMomentumMove(g) {
  const s = g.specStates && g.specStates.martial, t = g.tune.specs.martial;
  return g.passiveOn("momentum") && s && s.stacks && g.time <= s.momUntil ? s.stacks * (t.momentumMove || 0) : 0;
}

function dhFel(g) {
  return g.specStates && g.specStates.felblood ? g.specStates.felblood : {};
}

function dhFireCrit(g, o, target) {
  const s = dhFel(g), fb = g.tune.specs.felblood;
  const share = g.passiveOn("felThirst") ? fb.felThirstBaseMana : g.passiveOn("demonicThirst") ? fb.thirstBaseMana * dhRank(g, "demonicThirst", 3) / 3 : 0;
  if (!share) return;
  const key = (o.ability || o.name || "") + "@" + g.time;
  if (s.thirstKey === key) return;
  s.thirstKey = key;
  const p = g.player, gain = Math.round(g.tune.player.baseMana * share);
  if (gain > 0) {
    p.mana = Math.min(g.maxMana(p), p.mana + gain);
    g.floater(p, "+" + gain + " mana", "#7fb2ff", {
      small: true
    });
    g.addLog(`Demonic Thirst: +${gain} mana.`, "#7fb2ff");
  }
}

function dhBladesAura(g) {
  return g.player.auras.find(a => a.id === "burning_blades");
}

function dhBladeStage(g) {
  const a = dhBladesAura(g);
  return a ? a.stage || 0 : 0;
}

const DH_BLADE_COLORS = [ "#ffb347", "#ff8a2a", "#ff5a1a" ];

function dhSetBladeStage(g, a, stage) {
  const t = g.tune.abilities.burning_blades;
  a.stage = stage;
  a.name = `Burning Blades (stage ${stage})`;
  a.mods = {
    attackSpeed: -t.speedPerStage * stage
  };
}

function dhStokeBlades(g) {
  const t = g.tune.abilities.burning_blades, p = g.player;
  let a = dhBladesAura(g);
  if (!a) {
    g.addAura(p, "burning_blades", t);
    a = dhBladesAura(g);
    dhSetBladeStage(g, a, 1);
  } else {
    a.remaining = t.duration;
    a.duration = t.duration;
    if (a.stage < t.maxStage) dhSetBladeStage(g, a, a.stage + 1);
  }
  const full = a.stage >= t.maxStage;
  g.floater(p, full ? "Burning Blades 3!" : "Burning Blades " + a.stage, DH_BLADE_COLORS[Math.min(2, a.stage - 1)], {
    small: !full
  });
  g.addLog(`Burning Blades: stage ${a.stage}${full ? " (refreshed at the last stage)" : ""}, ${t.duration} sec.`, "#ffb347");
}

TL.effects.burningBlades = g => dhStokeBlades(g);

function dhBladesFire(g, target, o, res) {
  const n = dhBladeStage(g);
  if (!n || !o.white || !res || !res.amount || target.dead) return;
  const t = g.tune.abilities.burning_blades, amount = (o.amount || 0) * t.firePerStage * n;
  if (amount <= 0) return;
  g.playerHit(target, {
    amount: amount,
    school: "fire",
    name: "Burning Blades",
    ability: "burning_blades",
    roll: res.roll === "crit" ? "crit" : "hit",
    attack: false,
    bladesFire: true
  });
}

function dhEruption(g, target) {
  const ab = g.abilityById.eruption, t = g.abilityTune("eruption"), p = g.player;
  const amount = (t.apPercent || 0) * g.attackPower() + TL.util.rand(t.min, t.max) + (t.weaponPercent ? g.weaponRoll("main") * t.weaponPercent : 0);
  const res = g.playerHit(target, {
    amount: amount,
    school: "fire",
    ability: "eruption",
    melee: true,
    weapon: true,
    name: "Eruption",
    spCoef: t.spCoef,
    hugeText: true
  });
  g.strikeLanded(ab, res);
  const n = dhBladeStage(g);
  p.auras = p.auras.filter(a => a.id !== "burning_blades");
  const embers = [];
  for (let i = 0; i < 34; i++) embers.push({
    a: Math.random() * Math.PI * 2,
    sp: .5 + Math.random() * .9,
    c: [ "#fff1c2", "#ffd36b", "#ff7a2e", "#d4241a" ][i % 4]
  });
  g.fx({
    kind: "blast",
    x: target.x,
    y: target.y,
    r: 2.8,
    life: .7,
    max: .7,
    embers: embers,
    palette: {
      core: "255,240,200",
      mid: "255,120,40",
      edge: "200,30,20",
      ring: "#ffb347",
      ring2: "#d4241a"
    }
  });
  g.emit("shake", .5);
  g.addLog(`Eruption consumes Burning Blades (stage ${n}). Your weapons cool down.`, "#ffb347");
}

function dhImmolationBlast(g, name, share) {
  const t = g.abilityTune("immolation"), amt = t.max * share, p = g.player;
  if (p.dead) return;
  const hit = [];
  for (const e of g.alive()) if (g.inMelee(p, e)) {
    const r = g.playerHit(e, {
      min: amt,
      max: amt,
      school: "fire",
      name: name,
      attack: false,
      kind: "spell",
      spCoef: t.spCoef * share
    });
    if (r && r.amount > 0) hit.push(e);
  }
  g.engageFrom(hit);
  const embers = [];
  for (let i = 0; i < 28; i++) embers.push({
    a: Math.random() * Math.PI * 2,
    sp: .5 + Math.random() * .8,
    c: [ "#fff1c2", "#ffd36b", "#ff9a2e", "#ff5a1a" ][i % 4]
  });
  g.fx({
    kind: "blast",
    x: p.x,
    y: p.y,
    r: g.tune.melee.attackDistance,
    life: .7,
    max: .7,
    embers: embers
  });
  g.emit("shake", .45);
}

function dhDetonate(g) {
  const p = g.player, a = p.auras.find(x => x.id === "immolation");
  if (!a || p.dead) return false;
  const t = g.abilityTune("immolation"), f = g.tune.specs.felblood, ticks = t.duration / t.tick;
  const secs = Math.max(0, Math.floor(a.duration - a.remaining + 1e-6)), bonus = f.detonatePerSecond * secs;
  p.auras = p.auras.filter(x => x !== a);
  g.addLog(`Infernal Release: Immolation explodes after ${secs} sec (+${Math.round(bonus * 100)}% damage).`, "#ffb347");
  dhImmolationBlast(g, "Infernal Release", ticks * f.detonateBase * (1 + bonus));
  return true;
}

const DH_BLOODS = [ "imps_blood", "satyrs_blood", "felhunters_blood", "dreadlords_blood", "pit_lords_blood" ];

function dhRank(g, id, max) {
  if (!g.passiveOn(id)) return 0;
  const r = g.passiveRanks && g.passiveRanks[id];
  return r != null ? Math.min(r, max) : max;
}

function dhBloodLimit(g) {
  return g.passiveOn("mixedBlood") ? 2 : 1;
}

function dhActiveBloods(g) {
  return (g.bloods || []).slice(-dhBloodLimit(g));
}

function dhBloodOn(g, id) {
  return dhActiveBloods(g).includes(id);
}

function dhSurging(g) {
  return g.passiveOn("surgingBlood") && g.classState && g.classState.surgeUntil > g.time;
}

function dhBloodVal(g, id, key) {
  return dhBloodOn(g, id) ? (g.tune.abilities[id][key] || 0) * (dhSurging(g) ? g.tune.specs.felblood.surgeMult : 1) : 0;
}

function dhDrink(g, id) {
  const before = dhActiveBloods(g);
  g.bloods = (g.bloods || []).filter(x => x !== id).concat(id);
  g.bloods = g.bloods.slice(-dhBloodLimit(g));
  const gone = before.filter(x => !g.bloods.includes(x));
  const name = g.abilityById[id].name;
  g.addLog(`You drink ${name}.${gone.length ? ` ${gone.map(x => g.abilityById[x].name).join(" and ")} fades.` : ""}`, "#ff8a8a");
  g.floater(g.player, name, "#ff8a8a", {
    small: true
  });
  g.emit("bloods", g.bloods);
}

function dhBloodRequires(g, id) {
  if (dhBloodOn(g, id)) return "Already active";
  if (g.inCombat()) return "Cannot be used in combat";
  return null;
}

function dhStats(g) {
  const P = g.tune.player, M = g.tune.mana, F = g.tune.specs.felblood, MA = g.tune.specs.martial, SB = g.tune.specs.spellbreaker, on = id => g.passiveOn(id);
  const staMult = 1 + (on("infernalConstitution") ? F.infernalConstitution : 0) + (on("demonicReflexes") ? F.reflexesStamina || 0 : 0);
  const wp = 1 + dhRank(g, "willpower", 5) / 5 * (SB.willpower || 0);
  const strMult = 1 + (on("infernalConstitution") ? F.infernalConstitution : 0);
  const str = Math.round(P.strength * strMult), agi = P.agility, sta = Math.round(P.stamina * staMult), int = Math.round(P.intellect * wp), spi = Math.round(P.spirit * wp);
  const conv = (v, per) => Math.min(v, 20) + Math.max(0, v - 20) * per;
  const ap = 2 * P.level + str + agi - 20 + Math.round(str * F.demonicStrength * dhRank(g, "demonicStrength", 3) / 3) + (P.gearAttackPower || 0);
  const crit = P.baseCrit + agi / P.agiPerCrit / 100 + (P.gearCrit || 0) + (on("burningHatred") ? F.burningHatred : 0) + (on("demonicReflexes") ? F.reflexesCrit : 0);
  const regen = (M.regenBase + spi / M.spiritPerRegen) / M.tickInterval;
  const hregen = spi * M.healthPerSpirit / M.tickInterval * (1 + dhBloodVal(g, "satyrs_blood", "healthRegen"));
  return {
    str: str,
    agi: agi,
    sta: sta,
    int: int,
    spi: spi,
    ap: ap,
    sp: P.spellPower || 0,
    crit: crit,
    maxHealth: P.baseHealth + conv(sta, 10),
    maxMana: P.baseMana + conv(int, 15),
    regenPerSecond: regen,
    healthRegenPerSecond: hregen,
    dodge: agi / P.agiPerDodge / 100 + (on("improvedReflexes") ? MA.improvedReflexes : 0) + (on("uncannySwiftness") ? MA.swiftnessDodge : 0),
    parry: P.parry + (on("vengefulParry") ? F.vengefulParry : 0) + (on("demonicReflexes") ? F.reflexesParry : 0),
    armor: P.gearArmor + 2 * agi
  };
}

TL.effects.brand = (g, ab, ef, t, target) => {
  target.brandUntil = g.time + t.duration;
  g.floater(target, "Branded", "#9dff6a", {
    small: true
  });
  g.fx({
    kind: "ring",
    x: target.x,
    y: target.y,
    r: 1.4,
    color: "#9dff6a",
    life: .4,
    max: .4
  });
  g.addLog(`Brand Prey: ${target.name} takes ${Math.round(t.bonus * 100)}% more damage from you for ${t.duration} sec.`, "#9dff6a");
};

const DH_L40 = {
  dmgScale: 1.8,
  costScale: 2.55,
  player: {
    level: 40,
    baseHealth: 840,
    baseMana: 945,
    agiPerCrit: 20,
    agiPerDodge: 10,
    gearArmor: 900,
    hastePercent: 0
  },
  weapons: {
    mainHand: {
      speed: 2.4,
      min: 42,
      max: 78
    },
    offHand: {
      speed: 1.8,
      min: 30,
      max: 60
    }
  },
  enemies: {
    dummy: {
      armor: 1700
    },
    satyr: {
      maxHealth: 1300,
      maxMana: 720,
      armor: 1e3,
      shadowBolt: {
        cost: 180,
        min: 170,
        max: 210
      },
      melee: {
        min: 62,
        max: 80
      }
    },
    imp: {
      maxHealth: 650,
      armor: 1e3,
      min: 30,
      max: 40
    }
  }
};

const DH_PROFILES = {
  base: null,
  martial: {
    player: {
      strength: 70,
      agility: 170,
      stamina: 112,
      intellect: 45,
      spirit: 42,
      spellPower: 0,
      gearCrit: .01
    }
  },
  spellbreaker: {
    player: {
      strength: 50,
      agility: 80,
      stamina: 92,
      intellect: 100,
      spirit: 82,
      spellPower: 50,
      gearCrit: 0
    }
  },
  felblood: {
    player: {
      strength: 105,
      agility: 125,
      stamina: 112,
      intellect: 45,
      spirit: 42,
      spellPower: 15,
      gearCrit: 0
    }
  }
};

const DH_SCALE_DMG = [ "min", "max", "reduction" ];

function dhApplyProfile(g, specId) {
  const prof = DH_PROFILES[specId], U = TL.util, D = g.defaults;
  for (const k of [ "player", "weapons", "mana", "abilities", "enemies", "specs" ]) g.tune[k] = U.clone(D[k]);
  if (!prof) return;
  const L = DH_L40;
  U.merge(g.tune.player, L.player);
  U.merge(g.tune.player, prof.player);
  U.merge(g.tune.weapons, L.weapons);
  U.merge(g.tune.enemies, L.enemies);
  for (const id in g.tune.abilities) {
    const t = g.tune.abilities[id];
    for (const k of DH_SCALE_DMG) if (typeof t[k] === "number") t[k] = +(t[k] * L.dmgScale).toFixed(1);
    if (typeof t.cost === "number" && t.cost > 0) t.cost = Math.round(t.cost * L.costScale);
  }
  const sb = g.tune.specs.spellbreaker;
  sb.deepMin = Math.round(sb.deepMin * L.dmgScale);
  sb.deepMax = Math.round(sb.deepMax * L.dmgScale);
}

const DH_BLOOD_META = [ "10 sec cast", "Self" ];

TL.registerClass({
  id: "demon-hunter",
  name: "Demon Hunter",
  portrait: "icons/portrait-demon-hunter.webp",
  color: "#9848b3",
  passive: "battle_trance",
  applyProfile(g, specId) {
    dhApplyProfile(g, specId);
  },
  derivedStats(g) {
    return dhStats(g);
  },
  state: () => ({
    surgeUntil: 0,
    surgeReady: 0,
    healAcc: 0,
    healShownAt: 0
  }),
  passives: [ {
    id: "improvedReflexes",
    spec: "martial",
    name: "Improved Reflexes (tier 1)",
    ranks: 5,
    desc: "Increases your chance to dodge by 1/2/3/4/5%."
  }, {
    id: "multistrike",
    spec: "martial",
    name: "Multistrike (tier 1)",
    ranks: 5,
    desc: "Each hit of your Double Strike has a 1/2/3/4/5% chance to make it strike again 0.5 sec later for 50% of its damage, at no mana cost. Cannot trigger itself."
  }, {
    id: "dualWield",
    spec: "martial",
    name: "Dual Wield Mastery (tier 2)",
    ranks: 5,
    desc: "Increases the damage done by your off-hand weapon by 10/20/30/40/50%."
  }, {
    id: "eternalPursuit",
    spec: "martial",
    name: "Eternal Pursuit (tier 2)",
    ranks: 2,
    note: "no slows or fears in the training grounds yet",
    desc: "Reduces the duration of movement impairing and fear effects on you by 20/40%."
  }, {
    id: "improvedBladeDash",
    spec: "martial",
    name: "Improved Blade Dash (tier 2)",
    ranks: 2,
    desc: "Reduces the cooldown of your Blade Dash by 2/4 sec."
  }, {
    id: "friendOrFoe",
    spec: "martial",
    name: "Friend or Foe (tier 3)",
    ranks: 1,
    note: "only the cooldown: no allies to dive to",
    desc: "Your Dive can now also be used on friendly targets, causing no damage, and its cooldown is reduced by 5 sec."
  }, {
    id: "muscleMemory",
    spec: "martial",
    name: "Muscle Memory (tier 3)",
    ranks: 5,
    desc: "Gives your melee auto attacks a 2/4/6/8/10% chance to make your next ability cost no mana. That ability does not interrupt your mana regeneration."
  }, {
    id: "battleTrance",
    spec: "martial",
    name: "Battle Trance (tier 4)",
    ranks: 5,
    desc: "Each of your melee auto attacks, Double Strike hits and Blade Dash hits that lands increases your haste and movement speed by 1%, stacking up to 2/4/6/8/10 times. One stack is lost for every 2.5 sec without landing a melee attack."
  }, {
    id: "fervorOfTheHunt",
    spec: "martial",
    name: "Fervor of the Hunt (tier 4)",
    ranks: 1,
    desc: "Your relentless pace inspires your allies, increasing the melee, ranged and spellcasting haste of all party members within 45 yards by 3%."
  }, {
    id: "momentum",
    spec: "martial",
    name: "Momentum (tier 5)",
    ranks: 5,
    desc: "Each hit of your Double Strike that lands grants you a stack of Momentum, increasing your movement speed by 0.5/1/1.5/2/2.5%, stacking up to 4 times and lasting 30 sec. Your Blade Dash consumes up to 4 stacks and deals 20% additional damage for each stack consumed."
  }, {
    id: "theHunt",
    spec: "martial",
    name: "The Hunt (tier 5, teaches The Hunt)",
    ranks: 1,
    teaches: "the_hunt",
    desc: "Teaches The Hunt."
  }, {
    id: "battleRhythm",
    spec: "martial",
    name: "Battle Rhythm (Martial Arts trainer passive)",
    ranks: 1,
    desc: "Each of your melee weapon hits that lands reduces the remaining cooldown of your Double Strike, Mana Strike and Flame Strike by 0.5 sec."
  }, {
    id: "huntPrey",
    spec: "martial",
    name: "Hunt Prey (tier 7)",
    ranks: 1,
    needs: "Momentum 5/5",
    desc: "When your Blade Dash consumes 4 stacks of Momentum, the cooldown of your Dive is reset and your next Dive within 5 sec has no minimum range, costs no mana, deals 500% additional damage and does not trigger the global cooldown."
  }, {
    id: "improvedManaStrike",
    spec: "spellbreaker",
    name: "Improved Mana Strike (tier 1)",
    ranks: 5,
    desc: "Increases the damage of your Mana Strike by 2/4/6/8/10% and reduces its mana cost by 5/10/15/20/25%."
  }, {
    id: "willpower",
    spec: "spellbreaker",
    name: "Willpower (tier 1)",
    ranks: 5,
    desc: "Increases your Intellect and Spirit by 1/2/3/4/5%."
  }, {
    id: "improvedArcaneInk",
    spec: "spellbreaker",
    name: "Improved Arcane Ink (tier 2)",
    ranks: 3,
    desc: "Reduces all magic damage you take by 2/4/6%."
  }, {
    id: "stillnessOfMind",
    spec: "spellbreaker",
    name: "Focused Mind (tier 2)",
    ranks: 3,
    note: "no effect: the specs are hit capped",
    desc: "Increases your chance to hit with all attacks and spells by 1/2/3%."
  }, {
    id: "mentalClarity",
    spec: "spellbreaker",
    name: "Mental Clarity (tier 3)",
    ranks: 5,
    desc: "Gives your melee auto attacks a 3/5/8/11/13% chance to restore mana equal to 5 sec of your mana regeneration."
  }, {
    id: "deepMeditation",
    spec: "spellbreaker",
    name: "Deep Meditation (tier 4)",
    ranks: 5,
    needs: "Mental Clarity 5/5",
    desc: "Your Mental Clarity effects have a 20/40/60/80/100% chance to also deal a small amount of Arcane damage to your target."
  }, {
    id: "manaWeaving",
    spec: "spellbreaker",
    name: "Mana Weaving (tier 5)",
    ranks: 1,
    needs: "Deep Meditation 5/5",
    desc: "Each time your Deep Meditation deals damage, the cooldown of your Mana Strike is reset and your next Mana Strike costs 50% less mana."
  }, {
    id: "manaRupture",
    spec: "spellbreaker",
    name: "Mana Charge (tier 5)",
    ranks: 5,
    desc: "Each of your Mana Strikes that lands has a 20/40/60/80/100% chance to grant you a stack of Mana Charge, increasing the magic damage you deal by 1%. Stacks up to 8 times. Lasts 15 sec, and each new stack refreshes the duration."
  }, {
    id: "mirrorImage",
    spec: "spellbreaker",
    name: "Mirror Image (tier 5, teaches Mirror Image)",
    ranks: 1,
    teaches: "mirror_image",
    desc: "Teaches Mirror Image."
  }, {
    id: "manaBreaker",
    spec: "spellbreaker",
    name: "Mana Breaker (tier 6, teaches Mana Breaker)",
    ranks: 1,
    needs: "Mana Charge",
    teaches: "mana_breaker",
    desc: "Teaches Mana Breaker."
  }, {
    id: "manaScar",
    spec: "spellbreaker",
    name: "Mana Scar (tier 7, teaches Mana Scar)",
    ranks: 1,
    needs: "Mana Charge",
    teaches: "mana_scar",
    desc: "Teaches Mana Scar."
  }, {
    id: "improvedFlameStrike",
    spec: "felblood",
    name: "Improved Flame Strike (tier 1)",
    ranks: 5,
    desc: "Increases the damage of your Flame Strike by 5/10/15/20/25%."
  }, {
    id: "burningHatred",
    spec: "felblood",
    name: "Hatred (tier 1)",
    ranks: 5,
    desc: "Increases your chance to get a critical strike with all attacks and spells by 1/2/3/4/5%."
  }, {
    id: "vengefulParry",
    spec: "felblood",
    name: "Vengeful Parry (tier 1)",
    ranks: 5,
    desc: "Increases your chance to parry an attack by 1/2/3/4/5%."
  }, {
    id: "improvedImmolation",
    spec: "felblood",
    name: "Improved Immolation (tier 2)",
    ranks: 2,
    desc: "Increases the duration of your Immolation by 1/2 sec."
  }, {
    id: "infernalConstitution",
    spec: "felblood",
    name: "Infernal Constitution (tier 2)",
    ranks: 5,
    desc: "Increases your Strength and Stamina by 1/2/3/4/5%."
  }, {
    id: "demonicThirst",
    spec: "felblood",
    name: "Demonic Thirst (tier 3)",
    ranks: 3,
    desc: "Your Fire critical strikes restore mana equal to 1.3/2.7/4% of your base mana."
  }, {
    id: "infernalRelease",
    spec: "felblood",
    name: "Infernal Release (tier 4)",
    ranks: 1,
    needs: "Improved Immolation 2/2",
    desc: "While your Immolation is active, using it again makes it explode for 50% of the total damage it deals to one target over its full duration, increased by 5% for each second it has been active, hitting all enemies within melee range. Ends the Immolation and does not trigger the global cooldown. If the Immolation ends on its own, it does not explode."
  }, {
    id: "mixedBlood",
    spec: "felblood",
    name: "Mixed Blood (tier 4)",
    ranks: 1,
    desc: "Allows you to have two Demon Bloods active at the same time."
  }, {
    id: "eruption",
    spec: "felblood",
    name: "Eruption (tier 6, teaches Eruption)",
    ranks: 1,
    teaches: "eruption",
    desc: "Teaches Eruption."
  }, {
    id: "demonicStrength",
    spec: "felblood",
    name: "Demonic Strength (tier 6)",
    ranks: 3,
    desc: "Increases your attack power by an amount equal to 33/66/100% of your Strength."
  }, {
    id: "infernalMetamorphosis",
    spec: "felblood",
    name: "Infernal Metamorphosis (tier 7)",
    ranks: 1,
    desc: "Reduces the cooldown of your Metamorphosis by 1 min, and all damage you deal while transformed becomes Fire damage."
  } ],
  permanentAuras: g => dhActiveBloods(g),
  hasteBonus(g) {
    const m = g.tune.specs.martial;
    return (g.passiveOn("fervorOfTheHunt") ? m.fervorHaste : 0) + (g.passiveOn("uncannySwiftness") ? m.swiftnessHaste : 0);
  },
  hitBonus(g) {
    return g.passiveOn("cognitiveAcuity") ? g.tune.specs.spellbreaker.acuityHit : 0;
  },
  parryHaste() {
    return .4;
  },
  decoys(g) {
    const s = g.specStates && g.specStates.spellbreaker;
    return s && s.images ? s.images.filter(m => !m.dead) : [];
  },
  hitDecoy(g, m, src, amount, school, name, kind) {
    const c = g.tune.combat, p = g.player;
    amount *= c.enemyDamage || 1;
    if (kind === "spell" && Math.random() < c.spellMiss) {
      g.floater(m, "Resist", "#c9c9c9", {
        small: true
      });
      return;
    }
    if (kind === "melee") {
      const r = Math.random();
      if (r < c.mobMiss) {
        g.floater(m, "Miss", "#c9c9c9", {
          small: true
        });
        return;
      }
      if (r < c.mobMiss + c.mobCrit) amount *= 2;
    }
    if (school === "physical") {
      const armor = g.playerArmor() * g.modMult(p, "armorMult");
      amount *= 1 - armor / (armor + 400 + 85 * g.tune.player.level);
    } else {
      const res = this.resistance ? this.resistance(g, school) : 0;
      if (res > 0) amount *= 1 - Math.min(.75, res / (g.tune.player.level * 5) * .75);
    }
    amount = Math.round(amount);
    m.hp -= amount;
    m.flash = .08;
    g.floater(m, "-" + amount, "#ff9a8a", {
      small: true
    });
    if (m.hp <= 0) {
      m.hp = 0;
      m.dead = true;
      g.fx({
        kind: "ring",
        x: m.x,
        y: m.y,
        r: 1.6,
        color: DH_MANA.mid,
        life: .4,
        max: .4
      });
      g.addLog(`${src.name}'s ${name} destroys a Mirror Image.`, "#9aa39b");
    }
  },
  moveMult(g) {
    return (1 + dhBloodVal(g, "satyrs_blood", "moveSpeed")) * (1 + dhMomentumMove(g)) * (1 + ([ "uncannySwiftness", "cognitiveAcuity", "demonicReflexes" ].some(id => g.passiveOn(id)) ? g.tune.specs.martial.uncannySwiftness || 0 : 0));
  },
  regenWhileCasting(g) {
    return dhBloodVal(g, "felhunters_blood", "regenWhileCasting");
  },
  resistance(g, school) {
    return (school === "fire" ? dhBloodVal(g, "imps_blood", "fireResist") : 0) + dhBloodVal(g, "felhunters_blood", "resistAll");
  },
  damageTakenMult(g, src, school, kind) {
    let m = 1;
    if (school !== "physical" && g.passiveOn("improvedArcaneInk")) m *= 1 - g.tune.specs.spellbreaker.arcaneInk;
    if (dhBloodOn(g, "pit_lords_blood")) {
      const t = g.tune.abilities.pit_lords_blood, k = dhSurging(g) ? g.tune.specs.felblood.surgeMult : 1;
      const n = g.alive().filter(e => e.aggro && !e.evading && g.edgeDistance(g.player, e) <= t.radius).length;
      m *= 1 - Math.min(t.maxReduction * k, n * t.perEnemy * k);
    }
    return m;
  },
  onPlayerDamaged(g, src, amount, school, kind) {
    const p = g.player, cs = g.classState;
    if (kind === "melee" && src && !src.dead && dhBloodOn(g, "imps_blood")) {
      const t = g.tune.abilities.imps_blood, k = dhSurging(g) ? g.tune.specs.felblood.surgeMult : 1;
      g.playerHit(src, {
        min: t.min * k,
        max: t.max * k,
        school: "fire",
        name: "Imp's Blood",
        kind: "spell",
        attack: false,
        shield: true
      });
    }
    const f = g.tune.specs.felblood;
    if (g.passiveOn("surgingBlood") && p.hp > 0 && p.hp < g.maxHp(p) * f.surgeThreshold && g.time >= cs.surgeReady && dhActiveBloods(g).length) {
      cs.surgeUntil = g.time + f.surgeDuration;
      cs.surgeReady = g.time + f.surgeCooldown;
      g.floater(p, "Surging Blood", "#ff5a5a", {
        big: true
      });
      g.addLog(`Surging Blood: your Demon Bloods are tripled for ${f.surgeDuration} sec.`, "#ff8a8a");
    }
  },
  onDealtDamage(g, target, o, res) {
    if (!res.amount) return;
    const sh = g.tune.abilities.shackle_demon;
    if (target.shackledUntil > g.time && Math.random() < sh.breakChance) {
      target.shackledUntil = 0;
      g.floater(target, "Shackle broken", "#c9c9c9", {
        small: true
      });
      g.addLog(`Damage breaks the Shackle Demon on ${target.name}.`, "#9aa39b");
    }
    if (o.weapon && g.passiveOn("battleRhythm")) {
      const r = g.tune.specs.martial.rhythmReduction, cds = g.player.cooldowns;
      const ids = [ "double_strike", "mana_strike", "flame_strike" ];
      for (const id of ids) if (cds[id] > 0) cds[id] = Math.max(0, cds[id] - r);
    }
    if ((o.weapon || o.imbue) && !o.specExtra && dhBloodOn(g, "dreadlords_blood")) {
      const p = g.player, heal = res.amount * dhBloodVal(g, "dreadlords_blood", "lifesteal"), cs = g.classState;
      p.hp = Math.min(g.maxHp(p), p.hp + heal);
      cs.healAcc += heal;
      if (g.time - cs.healShownAt >= 1 && cs.healAcc >= 1) {
        g.floater(p, "+" + Math.round(cs.healAcc), TL.SCHOOL_COLORS.heal, {
          small: true
        });
        cs.healAcc = 0;
        cs.healShownAt = g.time;
      }
    }
  },
  onWhiteHit(g, target, hand) {
    if (!g.passiveOn("mentalClarity")) return;
    const t = g.tune.specs.spellbreaker;
    if (Math.random() >= (t.clarityChance || 0) * dhRank(g, "mentalClarity", 5) / 5) return;
    const p = g.player, gain = Math.round(g.regenPerSecond() * t.claritySeconds);
    p.mana = Math.min(g.maxMana(p), p.mana + gain);
    g.floater(p, "+" + gain + " mana", "#7fb2ff", {
      small: true
    });
    g.addLog(`Mental Clarity restores ${gain} mana.`, "#7fb2ff");
    let dm = null;
    if (g.passiveOn("deepMeditation") && target && !target.dead && Math.random() < (t.deepChance != null ? t.deepChance : 1)) dm = g.playerHit(target, {
      min: t.deepMin,
      max: t.deepMax,
      school: "arcane",
      name: "Deep Meditation",
      kind: "spell",
      attack: false,
      spCoef: t.deepSpCoef
    });
    if (g.passiveOn("manaWeaving") && dm && dm.amount > 0 || g.passiveOn("clarityWeaving")) {
      const s = g.specStates.spellbreaker || {};
      g.player.cooldowns.mana_strike = 0;
      s.weaveReady = true;
      g.floater(g.player, "Mana Strike ready!", DH_MANA.light, {
        small: true
      });
      g.addLog("Mana Weaving: Mana Strike is ready.", DH_MANA.light);
    }
  },
  damageMult(g, s, o, school, target) {
    return target && target.brandUntil > g.time ? 1 + (g.tune.abilities.brand_prey.bonus || 0) : 1;
  },
  buff(g, s) {
    return dhSurging(g) ? {
      name: "Surging Blood",
      icon: "icons/immolation.webp",
      remaining: s.surgeUntil - g.time,
      desc: "The effects of your Demon Bloods are tripled.",
      color: "#ff5a5a"
    } : null;
  },
  tuning: {
    player: {
      level: 20,
      strength: 50,
      agility: 63,
      stamina: 53,
      intellect: 35,
      spirit: 35,
      baseHealth: 233,
      baseMana: 370,
      gearArmor: 424,
      gearCrit: 0,
      gearAttackPower: 0,
      spellPower: 0,
      hastePercent: 0,
      baseCrit: .05,
      agiPerCrit: 10.8,
      agiPerDodge: 5.4,
      parry: .05,
      critMultiplier: 2,
      runSpeed: 7,
      boundingRadius: .78,
      combatReach: 1.5
    },
    combat: {
      enemyDamage: 1.05,
      mobDodge: .05,
      mobParry: .05,
      glanceChance: .1,
      glanceMin: .91,
      glanceMax: .99,
      spellMiss: .04,
      mobMiss: .05,
      mobCrit: .05
    },
    mana: {
      fiveSecondRule: 5,
      regenInsideRule: 0,
      tickInterval: 2,
      regenBase: 15,
      spiritPerRegen: 5,
      healthPerSpirit: .25
    },
    melee: {
      attackDistance: 5,
      reachOffset: 1.33,
      movingLeeway: 2.67
    },
    weapons: {
      mainHand: {
        speed: 1.8,
        min: 17,
        max: 32
      },
      offHand: {
        speed: 1.6,
        min: 15,
        max: 28,
        damageMultiplier: .5
      },
      whiteMissChance: .24,
      specialMissChance: .05
    },
    gcd: 1.5,
    gcdMin: 1,
    abilities: {
      double_strike: {
        cost: 27,
        cooldown: 8,
        weaponPercent: .64,
        min: 7.65,
        max: 10.2,
        delay: .25
      },
      mana_strike: {
        cost: 52.8,
        cooldown: 8,
        weaponPercent: 0,
        weaponDps: 3,
        spCoef: .429,
        manaBurn: 1,
        manaBurnDamage: .5
      },
      flame_strike: {
        cost: 43,
        cooldown: 8,
        weaponPercent: .3564,
        min: 4.905,
        max: 6.237,
        spCoef: .1908,
        improvedMult: 1.25
      },
      burning_blades: {
        duration: 9,
        maxStage: 3,
        speedPerStage: .05,
        firePerStage: .1
      },
      blade_dash: {
        cost: 20,
        cooldown: 12,
        distance: 7,
        width: 2,
        weaponPercent: .26,
        min: 15.3,
        max: 22.1,
        countsAsSwing: 1
      },
      dive: {
        cost: 18,
        cooldown: 30,
        minRange: 7,
        maxRange: 20,
        min: 14,
        max: 20
      },
      disrupt: {
        cost: 24,
        cooldown: 15,
        minRange: 0,
        maxRange: 10,
        schoolLock: 4,
        damageRatio: .5
      },
      wind_walk: {
        cost: 30,
        cooldown: 30,
        duration: 5,
        moveSpeed: .4,
        dodge: .4
      },
      brand_prey: {
        cost: 22,
        cooldown: 30,
        duration: 8,
        bonus: .05
      },
      shackle_demon: {
        cost: 52,
        cooldown: 15,
        castTime: 1.5,
        minRange: 0,
        maxRange: 25,
        duration: 30,
        breakChance: 1
      },
      deep_breaths: {
        cost: 0,
        cooldown: 180,
        duration: 2,
        tick: .5,
        regenIncrease: 14,
        moveSpeed: 0
      },
      immolation: {
        cost: 28.5,
        cooldown: 20,
        duration: 10,
        tick: 1,
        meleeArea: true,
        min: 7.035,
        max: 8.085,
        spCoef: .2688
      },
      mana_breaker: {
        cost: 81.4,
        cooldown: 12,
        weaponPercent: 0,
        weaponDps: 6.75,
        spCoef: .965,
        manaBurn: 1,
        manaBurnDamage: .5,
        ruptureStacks: 2
      },
      mana_scar: {
        cost: 61.6,
        cooldown: 0,
        castTime: .5,
        hits: 2,
        hitDelay: .15,
        weaponDps: 12.6,
        spCoef: .45
      },
      eruption: {
        cost: 48,
        cooldown: 0,
        castTime: 1,
        weaponPercent: 0,
        apPercent: .32062,
        min: 64.125,
        max: 74.8125,
        spCoef: .4585
      },
      the_hunt: {
        cost: 30,
        cooldown: 180,
        minRange: 0,
        maxRange: 45,
        stun: 1,
        hits: 5,
        interval: .2
      },
      mirror_image: {
        cost: 30,
        cooldown: 300,
        duration: 15,
        images: 3,
        damage: .12,
        moveSpeed: 14,
        health: .25
      },
      demonic_skin: {
        cost: 0,
        cooldown: 180,
        duration: 15,
        reduction: 16.67
      },
      metamorphosis: {
        cost: 0,
        cooldown: 300,
        duration: 15,
        haste: .2,
        armor: .5,
        health: .25,
        infernalCooldown: 240
      },
      imps_blood: {
        castTime: 10,
        fireResist: 30,
        min: 9.6,
        max: 12
      },
      satyrs_blood: {
        castTime: 10,
        moveSpeed: .05,
        healthRegen: .5
      },
      felhunters_blood: {
        castTime: 10,
        resistAll: 20,
        regenWhileCasting: .25
      },
      dreadlords_blood: {
        castTime: 10,
        lifesteal: .03
      },
      pit_lords_blood: {
        castTime: 10,
        perEnemy: .02,
        maxReduction: .1,
        radius: 8
      }
    },
    experiments: {
      battleTrance: {
        hastePerStack: .01,
        speedPerStack: .01,
        maxStacks: 10,
        decayInterval: 2.5
      }
    },
    specs: {
      martial: {
        maxStacks: 4,
        sweepConsumes: 4,
        sweepBonusPerStack: .2,
        momentumDuration: 30,
        momentumMove: .025,
        diveStacksNeeded: 4,
        diveBonus: 5,
        diveWindow: 5,
        diveResetOnEmpower: 1,
        diveOffGcd: 1,
        friendOrFoe: 5,
        bladeDashReduction: 2,
        offHandAuto: .75,
        muscleMemoryChance: .1,
        improvedReflexes: .05,
        multistrikeChance: .05,
        multistrikeScale: .5,
        multistrikeDelay: .5,
        rhythmReduction: .5,
        uncannySwiftness: .2,
        swiftnessDodge: .05,
        swiftnessHaste: .1,
        fervorHaste: .03,
        eternalPursuit: .4
      },
      spellbreaker: {
        manaStrikeDamage: 1.1,
        manaStrikeCost: .75,
        willpower: .05,
        clarityChance: .15,
        claritySeconds: 5,
        deepChance: 1,
        deepMin: 24,
        deepMax: 30,
        deepSpCoef: .1,
        acuityHit: .05,
        breakPerStack: .01,
        breakMaxStacks: 8,
        scarStacks: 8,
        weaveCost: 0,
        breakDuration: 15,
        ruptureChance: 1,
        ruptureStacks: 1,
        arcaneInk: .06,
        stillnessHit: .03
      },
      felblood: {
        reflexesParry: .05,
        reflexesCrit: .12,
        reflexesStamina: .1,
        detonateBase: .5,
        detonatePerSecond: .05,
        improvedImmolationDuration: 2,
        infernalConstitution: .05,
        vengefulParry: .05,
        burningHatred: .05,
        demonicStrength: 1,
        thirstBaseMana: .04,
        felThirstBaseMana: .04,
        surgeThreshold: .35,
        surgeMult: 3,
        surgeDuration: 8,
        surgeCooldown: 120
      }
    }
  },
  abilities: [ {
    id: "double_strike",
    name: "Double Strike",
    icon: "icons/double-strike.webp",
    school: "physical",
    type: "instant",
    target: "enemy",
    range: "melee",
    gcd: true,
    tag: "strike",
    tranceHit: true,
    meta: [ "Instant", "Melee Range" ],
    text: "Strikes twice in quick succession, first with your main hand and then with your off-hand weapon. Each strike causes 64% weapon damage plus a small amount of additional damage.",
    requires: g => dhHasOffHand(g) ? null : "Requires an off-hand weapon",
    proto: (t, g) => {
      const w = g.tune.weapons, pc = t.weaponPercent;
      const a = [ Math.round(w.mainHand.min * pc + t.min), Math.round(w.mainHand.max * pc + t.max) ];
      const b = [ Math.round(w.offHand.min * pc + t.min), Math.round(w.offHand.max * pc + t.max) ];
      return `Prototype: main hand hit for ${Math.round(pc * 100)}% weapon damage + ${t.min} to ${t.max} (${a[0]} to ${a[1]} before attack power), then off hand hit for ${Math.round(pc * 100)}% weapon damage + ${t.min} to ${t.max} (${b[0]} to ${b[1]}), ${t.delay} sec apart. Each hit counts for Battle Trance.`;
    },
    effects: [ {
      type: "weaponStrikes",
      hands: [ "main", "off" ]
    } ]
  }, {
    id: "mana_strike",
    name: "Mana Strike",
    icon: "icons/mana-strike.webp",
    school: "arcane",
    type: "instant",
    target: "enemy",
    range: "melee",
    gcd: true,
    tag: "strike",
    meta: [ "Instant", "Melee Range" ],
    text: "An instant strike that causes Arcane damage equal to 3 times your main hand weapon's damage per second. If the target has mana, also burns mana equal to 100% of the damage dealt and causes 50% of that amount as additional Arcane damage.",
    proto: (t, g) => `Prototype: ${t.weaponDps} x main hand DPS (${g.weaponDps("main").toFixed(1)}) = ${Math.round(t.weaponDps * g.weaponDps("main"))} Arcane damage (ignores armor)${g.spellPower() ? ` + ${Math.round(g.spellPower() * t.spCoef)} from spell power` : ""}${g.passiveOn("improvedManaStrike") ? ` (Improved Mana Strike: +${Math.round((g.tune.specs.spellbreaker.manaStrikeDamage - 1) * 100)}% damage, ${Math.round((1 - g.tune.specs.spellbreaker.manaStrikeCost) * 100)}% cheaper)` : ""}. Against a target with mana, burns mana equal to ${Math.round(t.manaBurn * 100)}% of the damage and deals ${Math.round((t.manaBurnDamage != null ? t.manaBurnDamage : 1) * 100)}% of the burned mana as Arcane damage.`,
    effects: [ {
      type: "weaponStrike"
    } ]
  }, {
    id: "flame_strike",
    name: "Flame Strike",
    icon: "icons/flame-strike.webp",
    school: "fire",
    type: "instant",
    target: "enemy",
    range: "melee",
    gcd: true,
    tag: "strike",
    meta: [ "Instant", "Melee Range" ],
    text: "An instant strike that causes 36% weapon damage plus an additional small amount as Fire damage, and sets your weapons ablaze for 9 sec. Each Flame Strike raises the flames by one stage, up to 3. Each stage reduces your attack speed by 5%, and your melee auto attacks deal an additional 10% of weapon damage as Fire damage per stage.",
    proto: (t, g) => {
      const b = g.tune.abilities.burning_blades;
      return `Prototype: all Fire, one hit: ${Math.round(t.weaponPercent * 100)}% of main hand weapon damage (with attack power) + ${+t.min.toFixed(1)} to ${+t.max.toFixed(1)}${g.spellPower() ? ` + ${Math.round(g.spellPower() * t.spCoef)} from spell power` : ""}${g.passiveOn("improvedFlameStrike") ? " (Improved Flame Strike)" : ""}. Ignores armor. Burning Blades: +1 stage (up to ${b.maxStage}), ${b.duration} sec, refreshed by every Flame Strike. Per stage: -${Math.round(b.speedPerStage * 100)}% attack speed and +${Math.round(b.firePerStage * 100)}% of each auto attack's weapon damage as a separate Fire hit (same roll: a critical swing burns critically). The weapon hit stays Physical.`;
    },
    effects: [ {
      type: "weaponStrike"
    }, {
      type: "burningBlades"
    } ]
  }, {
    id: "immolation",
    name: "Immolation",
    icon: "icons/immolation.webp",
    school: "fire",
    type: "instant",
    target: "self",
    gcd: true,
    meta: [ "Instant", "Melee Range" ],
    text: "Engulfs you in flames, causing a very small amount of Fire damage every 1 sec to all enemies in melee range. Lasts 10 sec.",
    proto: (t, g) => `Prototype: ${+t.min.toFixed(1)} to ${+t.max.toFixed(1)} Fire damage${g.spellPower() ? ` + ${(g.spellPower() * t.spCoef).toFixed(1)} from spell power` : ""} every ${t.tick} sec to every enemy inside your melee reach, for ${t.duration} sec${g.passiveOn("improvedImmolation") ? " (Improved Immolation)" : ""}.`,
    effects: [ {
      type: "aura",
      aura: "immolation",
      engage: true
    } ]
  }, {
    id: "blade_dash",
    name: "Blade Dash",
    icon: "icons/blade-dash.webp",
    school: "physical",
    type: "instant",
    target: "none",
    gcd: true,
    meta: [ "Instant", "7 yd dash" ],
    text: "Dashes 7 yds forward, striking all enemies in your path for 26% of your main hand and off-hand weapon damage plus a moderate amount of additional damage. Cannot miss, be dodged or be parried.",
    proto: t => `Prototype: dashes ${t.distance} yd in the direction you move. Each enemy hit takes ${Math.round(t.weaponPercent * 100)}% of main hand plus ${Math.round(t.weaponPercent * 100)}% of off hand weapon damage, plus ${t.min} to ${t.max} physical damage. Each enemy hit counts as a hit for Battle Trance.`,
    effects: [ {
      type: "dash"
    } ]
  }, {
    id: "disrupt",
    name: "Disrupt",
    icon: "icons/disrupt.webp",
    school: "arcane",
    type: "instant",
    target: "enemy",
    range: "ranged",
    gcd: true,
    meta: [ "Instant", "10 yd range" ],
    text: "Interrupts the target's spellcasting, burning mana equal to the interrupted spell's cost and causing Arcane damage equal to 50% of the mana burned. Prevents any spell in that school from being cast for 4 sec.",
    proto: (t, g) => `Prototype: locks the school for ${t.schoolLock} sec. Rolls like a spell (Counterspell, Earth Shock): ${Math.round(g.tune.combat.spellMiss * 100)}% chance to be resisted, never dodged or parried.`,
    effects: [ {
      type: "interrupt"
    } ]
  }, {
    id: "dive",
    name: "Dive",
    icon: "icons/dive.webp",
    school: "physical",
    type: "instant",
    target: "enemy",
    range: "dive",
    gcd: true,
    meta: [ "Instant", "7-20 yd range" ],
    text: "Dives at the target and lands on its other side, causing a small amount of damage.",
    proto: t => `Prototype: ${t.min} to ${t.max} damage on landing.`,
    effects: [ {
      type: "leapBehind"
    } ]
  }, {
    id: "wind_walk",
    name: "Wind Walk",
    icon: "icons/wind-walk.webp",
    school: "physical",
    type: "instant",
    target: "self",
    gcd: true,
    meta: [ "Instant", "Self" ],
    text: "Increases your movement speed by 40% and your chance to dodge attacks and spells by 40% for 5 sec. Using any ability or attacking ends the effect.",
    proto: t => `Prototype (trainer, every spec): +${Math.round(t.moveSpeed * 100)}% movement speed, +${Math.round(t.dodge * 100)}% dodge against melee attacks and spells for ${t.duration} sec. Your auto attacks pause while it lasts; using any ability ends it. ${t.cooldown / 60} min cooldown.`,
    effects: [ {
      type: "aura",
      aura: "wind_walk"
    } ]
  }, {
    id: "brand_prey",
    name: "Brand Prey",
    icon: "icons/brand-prey.webp",
    school: "fire",
    startsAttack: false,
    type: "instant",
    target: "enemy",
    range: "melee",
    gcd: true,
    autoTarget: true,
    meta: [ "Instant", "Melee Range" ],
    text: "Brands the target with demon fire, increasing the damage it takes from you by 5%. Lasts 8 sec.",
    proto: t => `Prototype (Felblood trainer, level 22, every spec): +${Math.round(t.bonus * 100)}% damage from you, every school, for ${t.duration} sec. ${t.cooldown} sec cooldown.`,
    effects: [ {
      type: "brand"
    } ]
  }, {
    id: "shackle_demon",
    name: "Shackle Demon",
    icon: "icons/shackle-demon.webp",
    school: "arcane",
    startsAttack: false,
    type: "cast",
    target: "enemy",
    range: "ranged",
    gcd: true,
    pushback: true,
    meta: [ "1.5 sec cast", "25 yd range" ],
    text: "Shackles the target demon for up to 30 sec. The shackled demon is unable to move, attack or cast spells, and any spell it is casting is interrupted. You stop attacking the target until you click on it or attack it again. Any damage caused will break the effect. Only one target can be shackled at a time.",
    requires: (g, tg) => !(tg && tg.def && tg.def.isDemon) ? "Invalid target: demons only" : tg.def.boss ? "Target is immune" : null,
    requiresFirst: true,
    proto: t => `Prototype (Spellbreaker trainer, level 20, every spec): ${t.castTime} sec cast, ${t.duration} sec. ${t.breakChance >= 1 ? "Any damage on the shackled demon breaks it." : `Every hit on the shackled demon has a ${Math.round(t.breakChance * 100)}% chance to break it.`} Shackling a new demon frees the old one. Moving cancels the cast.`,
    effects: [ {
      type: "castTime",
      onDone: (g, target) => dhShackle(g, target)
    } ]
  }, {
    id: "deep_breaths",
    name: "Still Mind",
    icon: "icons/deep-breaths.webp",
    school: "arcane",
    type: "channel",
    target: "self",
    gcd: true,
    pushback: true,
    meta: [ "Channeled (2 sec)", "Self" ],
    text: "Try to focus your mind for 2 sec. While channeling, your mana regeneration is active and increased by 1400%.",
    proto: (t, g) => `Prototype (Spellbreaker trainer, level 20, every spec): Spirit regeneration (${g.regenPerSecond().toFixed(1)} mana per sec) is active during the channel and increased by ${Math.round(t.regenIncrease * 100)}%: about ${Math.round(g.regenPerSecond() * (1 + t.regenIncrease) * t.duration)} mana over ${t.duration} sec. Moving cancels it. Can be used in combat. ${t.cooldown / 60} min cooldown.`,
    effects: [ {
      type: "channel",
      tick: "regen",
      ownRegen: true,
      firstTickDelay: true,
      onDone: "regenFinish"
    } ]
  }, {
    id: "mana_breaker",
    name: "Mana Breaker",
    icon: "icons/mana-breaker.webp",
    school: "arcane",
    talent: "manaBreaker",
    type: "instant",
    target: "enemy",
    range: "melee",
    gcd: true,
    autoTarget: true,
    meta: [ "Instant", "Melee Range" ],
    text: "Breaks the target's defenses with a blade of arcane energy, causing Arcane damage equal to 6.75 times your main hand weapon's damage per second and granting you 2 stacks of Mana Charge. If the target has mana, also burns mana equal to 100% of the damage dealt and causes 50% of that amount as additional Arcane damage.",
    proto: (t, g) => `Prototype (Spellbreaker tier 6 talent): ${t.weaponDps} x main hand DPS = ${Math.round(t.weaponDps * g.weaponDps("main"))} Arcane damage${g.spellPower() ? ` + ${Math.round(g.spellPower() * t.spCoef)} from spell power` : ""}. Grants you ${t.ruptureStacks} Mana Charge stacks. Burns mana like Mana Strike. Not a strike: outside Battle Trance. ${t.cooldown} sec cooldown.`,
    effects: [ {
      type: "weaponStrike"
    } ]
  }, {
    id: "mana_scar",
    name: "Mana Scar",
    icon: "icons/mana-scar.webp",
    school: "arcane",
    talent: "manaScar",
    type: "cast",
    target: "enemy",
    range: "melee",
    gcd: true,
    pushback: true,
    meta: [ "0.5 sec cast", "Melee Range" ],
    text: "Gathers your focus, then cuts the target twice in quick succession with blades of mana, first with your main hand and then with your off-hand weapon. Each cut causes Arcane damage equal to 12.6 times that weapon's damage per second. Can only be used while you have 8 stacks of Mana Charge, and consumes them after the second cut.",
    requires: (g, tg) => {
      if (!dhHasOffHand(g)) return "Requires an off-hand weapon";
      const m = g.tune.specs.spellbreaker.scarStacks || g.tune.specs.spellbreaker.breakMaxStacks;
      return dhChargeStacks(g) >= m ? null : `Requires ${m} stacks of Mana Charge`;
    },
    proto: (t, g) => `Prototype (Spellbreaker tier 7 talent): ${t.castTime} sec cast (shortened by haste), then ${t.hits} cuts ${t.hitDelay} sec apart: main hand ${Math.round(t.weaponDps * g.weaponDps("main"))} and off hand ${Math.round(t.weaponDps * g.weaponDps("off"))} (${t.weaponDps} x each weapon's DPS)${g.spellPower() ? `, each + ${Math.round(g.spellPower() * t.spCoef / t.hits)} from spell power` : ""}, before the bonus from Mana Charge. While casting, other keys do nothing; moving cancels the cast and refunds the mana. ${t.cooldown ? t.cooldown + " sec cooldown." : "No cooldown besides the global cooldown (to define)."}`,
    effects: [ {
      type: "castTime",
      onDone: (g, target) => dhManaScar(g, target)
    } ]
  }, {
    id: "eruption",
    name: "Eruption",
    icon: "icons/eruption.webp",
    school: "fire",
    talent: "eruption",
    type: "cast",
    target: "enemy",
    range: "melee",
    gcd: true,
    pushback: true,
    autoTarget: true,
    meta: [ "1 sec cast", "Melee Range" ],
    text: "Makes the flames on your weapons erupt into the target, causing Fire damage equal to 32% of your attack power plus a large amount. Can only be used while your weapons are ablaze at stage 3, and consumes the flames.",
    requires: g => dhBladeStage(g) >= g.tune.abilities.burning_blades.maxStage ? null : `Requires ${g.tune.abilities.burning_blades.maxStage} stacks of Burning Blades`,
    ready: g => dhBladeStage(g) >= g.tune.abilities.burning_blades.maxStage,
    proto: (t, g) => `Prototype (Felblood tier 6 talent): ${t.castTime} sec cast (shortened by haste, moving cancels it, pushback). ${Math.round(t.apPercent * 100)}% of attack power (${Math.round(t.apPercent * g.attackPower())}) + ${t.min} to ${t.max} Fire damage${g.spellPower() ? ` + ${Math.round(g.spellPower() * t.spCoef)} from spell power` : ""}. Needs Burning Blades at the last stage and puts the flames out. Not a strike: outside Battle Trance. No cooldown.`,
    effects: [ {
      type: "castTime",
      onDone: (g, target) => dhEruption(g, target)
    } ]
  }, {
    id: "the_hunt",
    name: "The Hunt",
    icon: "icons/the-hunt.webp",
    school: "physical",
    talent: "theHunt",
    type: "instant",
    target: "enemy",
    range: "dive",
    gcd: true,
    meta: [ "Instant", "45 yd range" ],
    text: "Leaps at the target and stuns it for 1 sec. During the stun, you make 5 extra melee attacks, alternating between your main hand and off-hand weapons.",
    proto: t => `Prototype (Martial Arts tier 5 talent): stun starts when you land. ${t.hits} extra auto attacks ${t.interval} sec apart (main, off, main, off, main; main hand only without an off-hand weapon). They are normal auto attacks: off-hand penalty, Dual Wield Mastery, Burning Blades, Battle Trance, Battle Rhythm, Muscle Memory and Mental Clarity all apply. Stunned targets cannot dodge or parry. ${t.cooldown / 60} min cooldown.`,
    effects: [ {
      type: "hunt"
    } ]
  }, {
    id: "mirror_image",
    name: "Mirror Image",
    icon: "icons/mirror-image.webp",
    school: "arcane",
    talent: "mirrorImage",
    type: "instant",
    target: "self",
    gcd: true,
    meta: [ "Instant", "Self" ],
    text: "Splits your form into 3 images of yourself for 15 sec, causing enemies to lose track of you and removing all your threat. Each image has 25% of your maximum health, starting at the same share of health as you. The images surround your target, attack it and use Mana Strike. If you have Mana Charge, each Mana Strike they land grants you a stack of it.",
    proto: t => `Prototype (Spellbreaker tier 5 talent): ${t.images} images for ${t.duration} sec, each dealing ${Math.round(t.damage * 100)}% of your damage, with ${Math.round((t.health || .25) * 100)}% of your max health (at your current health share). Enemies attack the images first. Each image attacks with both weapons and uses Mana Strike when its own cooldown is ready. With Battle Trance, each image has its own, starting at your stacks (haste only). The images cannot be attacked. ${t.cooldown / 60} min cooldown.`,
    effects: [ {
      type: "specCast",
      spec: "spellbreaker"
    } ]
  }, {
    id: "demonic_skin",
    name: "Demonic Skin",
    icon: "icons/demonic-skin.webp",
    school: "fire",
    type: "instant",
    target: "self",
    gcd: true,
    meta: [ "Instant", "Self" ],
    text: "Hardens your skin with demonic power, reducing all damage you take by a moderate amount for 15 sec.",
    proto: t => `Prototype (Felblood trainer, 2026-10-11): every hit you take is reduced by ${Math.round(t.reduction)} after armor, resistances and other reductions, never below 0. Every source: melee, spells and area. ${t.duration} sec, ${t.cooldown / 60} min cooldown. `,
    effects: [ {
      type: "aura",
      aura: "demonic_skin"
    } ]
  }, {
    id: "metamorphosis",
    name: "Metamorphosis",
    icon: "icons/metamorphosis.webp",
    school: "fire",
    type: "instant",
    target: "self",
    gcd: true,
    meta: [ "Instant", "Self" ],
    text: "Transforms you into a half-demon, increasing your haste by 20%, armor by 50% and health by 25%. Lasts 15 sec.",
    proto: (t, g) => `Prototype (Felblood trainer, level 40, every spec): +${Math.round(t.haste * 100)}% haste (auto attacks and casts), +${Math.round(t.armor * 100)}% armor, +${Math.round(t.health * 100)}% health for ${t.duration} sec. ${t.fireForm ? "Infernal Metamorphosis: all damage you deal becomes Fire." : "Does not change your damage school (Infernal Metamorphosis does)."} ${t.cooldown / 60} min cooldown.`,
    effects: [ {
      type: "aura",
      aura: "metamorphosis"
    } ]
  }, {
    id: "imps_blood",
    bar: "blood",
    name: "Imp's Blood",
    icon: "icons/imps-blood.webp",
    school: "fire",
    level: 1,
    type: "cast",
    target: "self",
    gcd: true,
    noHaste: true,
    meta: DH_BLOOD_META,
    text: "Drinks the blood of an imp, increasing your Fire resistance by 30 and causing a very small amount of Fire damage to enemies that strike you in melee. Remains active until another Demon Blood is drunk. Cannot be used in combat.",
    requires: g => dhBloodRequires(g, "imps_blood"),
    proto: t => `Prototype (class quest, level 1): +${t.fireResist} Fire resistance (nothing in the training grounds deals Fire). Melee attackers take ${t.min} to ${t.max} Fire damage, which cannot crit and triggers nothing.`,
    effects: [ {
      type: "castTime",
      onDone: g => dhDrink(g, "imps_blood")
    } ]
  }, {
    id: "satyrs_blood",
    bar: "blood",
    name: "Satyr's Blood",
    icon: "icons/satyrs-blood.webp",
    school: "physical",
    level: 20,
    type: "cast",
    target: "self",
    gcd: true,
    noHaste: true,
    meta: DH_BLOOD_META,
    text: "Drinks the blood of a satyr, increasing your movement speed by 5% and your health regeneration rate by 50% out of combat. Remains active until another Demon Blood is drunk. Cannot be used in combat.",
    requires: g => dhBloodRequires(g, "satyrs_blood"),
    proto: t => `Prototype (class quest, level 20): +${Math.round(t.moveSpeed * 100)}% movement speed (multiplies with Battle Trance and Wind Walk), +${Math.round(t.healthRegen * 100)}% health regeneration, which only works out of combat.`,
    effects: [ {
      type: "castTime",
      onDone: g => dhDrink(g, "satyrs_blood")
    } ]
  }, {
    id: "felhunters_blood",
    bar: "blood",
    name: "Felhunter's Blood",
    icon: "icons/felhunters-blood.webp",
    school: "arcane",
    level: 40,
    type: "cast",
    target: "self",
    gcd: true,
    noHaste: true,
    meta: DH_BLOOD_META,
    text: "Drinks the blood of a felhunter, increasing your resistance to all magic by 20, increasing your stealth detection and allowing 25% of your mana regeneration to continue while casting. Remains active until another Demon Blood is drunk. Cannot be used in combat.",
    requires: g => dhBloodRequires(g, "felhunters_blood"),
    proto: (t, g) => `Prototype (class quest, level 40): +${t.resistAll} resistance to all magic, about ${(Math.min(.75, t.resistAll / (g.tune.player.level * 5) * .75) * 100).toFixed(1)}% less Shadow Bolt damage at your level. Stealth detection has nothing to test here.`,
    effects: [ {
      type: "castTime",
      onDone: g => dhDrink(g, "felhunters_blood")
    } ]
  }, {
    id: "dreadlords_blood",
    bar: "blood",
    name: "Dreadlord's Blood",
    icon: "icons/dreadlords-blood.webp",
    school: "shadow",
    level: 50,
    type: "cast",
    target: "self",
    gcd: true,
    noHaste: true,
    meta: DH_BLOOD_META,
    text: "Drinks the blood of a dreadlord, causing your melee attacks to heal you for 3% of the damage they deal. Remains active until another Demon Blood is drunk. Cannot be used in combat.",
    requires: g => dhBloodRequires(g, "dreadlords_blood"),
    proto: t => `Prototype (class quest, level 50): auto attacks, strikes, Blade Dash, The Hunt, Mana Breaker, Eruption and Mana Scar heal you for ${Math.round(t.lifesteal * 100)}% of their damage. Immolation, Infernal Release, Deep Meditation, Imp's Blood and the images do not.`,
    effects: [ {
      type: "castTime",
      onDone: g => dhDrink(g, "dreadlords_blood")
    } ]
  }, {
    id: "pit_lords_blood",
    bar: "blood",
    name: "Pit Lord's Blood",
    icon: "icons/pit-lords-blood.webp",
    school: "fire",
    level: 60,
    type: "cast",
    target: "self",
    gcd: true,
    noHaste: true,
    meta: DH_BLOOD_META,
    text: "Drinks the blood of a pit lord, reducing all damage you take by 2% for each enemy within 8 yds of you, up to 10%. Remains active until another Demon Blood is drunk. Cannot be used in combat.",
    requires: g => dhBloodRequires(g, "pit_lords_blood"),
    proto: t => `Prototype (class quest chain, level 60): -${Math.round(t.perEnemy * 100)}% damage taken for each enemy in combat within ${t.radius} yds, up to -${Math.round(t.maxReduction * 100)}%.`,
    effects: [ {
      type: "castTime",
      onDone: g => dhDrink(g, "pit_lords_blood")
    } ]
  } ],
  auras: {
    immolation: {
      name: "Immolation",
      icon: "icons/immolation.webp",
      tuneKey: "immolation",
      desc: g => {
        const t = g.abilityTune("immolation"), f = g.spellPower() * t.spCoef;
        return `Deals ${Math.round(t.min + f)} to ${Math.round(t.max + f)} Fire damage every ${t.tick} sec to all enemies in melee range.${g.passiveOn("infernalRelease") ? " Use Immolation again to make it explode." : ""}`;
      },
      periodic: {
        school: "fire",
        aoe: true
      }
    },
    wind_walk: {
      name: "Wind Walk",
      icon: "icons/wind-walk.webp",
      tuneKey: "wind_walk",
      desc: g => {
        const t = g.abilityTune("wind_walk");
        return `Movement speed increased by ${dhPct(t.moveSpeed)}. Chance to dodge attacks and spells increased by ${dhPct(t.dodge)}. Using any ability or attacking ends the effect.`;
      },
      mods: t => ({
        moveMult: 1 + t.moveSpeed,
        dodge: t.dodge,
        spellDodge: t.dodge,
        noAutoAttack: true,
        breakOnAbility: true
      })
    },
    metamorphosis: {
      name: "Metamorphosis",
      icon: "icons/metamorphosis.webp",
      tuneKey: "metamorphosis",
      desc: g => {
        const t = g.abilityTune("metamorphosis");
        return `Haste increased by ${dhPct(t.haste)}. Armor increased by ${dhPct(t.armor)}. Maximum health increased by ${dhPct(t.health)}.${t.fireForm ? " All damage you deal is Fire damage." : ""}`;
      },
      mods: t => ({
        schoolOverride: t.fireForm ? "fire" : null,
        attackSpeed: t.haste,
        castHaste: t.haste,
        armorMult: 1 + t.armor,
        maxHealthMult: 1 + t.health
      })
    },
    burning_blades: {
      name: "Burning Blades",
      icon: "icons/flame-strike.webp",
      tuneKey: "burning_blades",
      durationKey: "duration",
      stacks: a => a.stage || 0,
      desc: (g, a) => {
        const t = g.abilityTune("burning_blades"), n = a.stage || 0;
        return `Attack speed reduced by ${dhPct(t.speedPerStage * n)}. Melee auto attacks deal an additional ${dhPct(t.firePerStage * n)} of weapon damage as Fire damage.${n >= t.maxStage ? " Eruption is ready." : ""}`;
      }
    },
    demonic_skin: {
      name: "Demonic Skin",
      icon: "icons/demonic-skin.webp",
      tuneKey: "demonic_skin",
      mods: t => ({
        damageTakenFlat: Math.round(t.reduction)
      }),
      desc: g => `All damage taken reduced by ${Math.round(g.abilityTune("demonic_skin").reduction)}.`
    },
    imps_blood: {
      name: "Imp's Blood",
      icon: "icons/imps-blood.webp",
      tuneKey: "imps_blood",
      desc: g => {
        const t = g.tune.abilities.imps_blood;
        return `Fire resistance increased by ${t.fireResist}. Enemies that strike you in melee take ${Math.round(t.min)} to ${Math.round(t.max)} Fire damage.`;
      }
    },
    satyrs_blood: {
      name: "Satyr's Blood",
      icon: "icons/satyrs-blood.webp",
      tuneKey: "satyrs_blood",
      desc: g => {
        const t = g.tune.abilities.satyrs_blood;
        return `Movement speed increased by ${dhPct(t.moveSpeed)}. Health regeneration increased by ${dhPct(t.healthRegen)} out of combat.`;
      }
    },
    felhunters_blood: {
      name: "Felhunter's Blood",
      icon: "icons/felhunters-blood.webp",
      tuneKey: "felhunters_blood",
      desc: g => {
        const t = g.tune.abilities.felhunters_blood;
        return `Resistance to all magic increased by ${t.resistAll}. Stealth detection increased. ${dhPct(t.regenWhileCasting)} of your mana regeneration continues while casting.`;
      }
    },
    dreadlords_blood: {
      name: "Dreadlord's Blood",
      icon: "icons/dreadlords-blood.webp",
      tuneKey: "dreadlords_blood",
      desc: g => `Your melee attacks heal you for ${dhPct(g.tune.abilities.dreadlords_blood.lifesteal)} of the damage they deal.`
    },
    pit_lords_blood: {
      name: "Pit Lord's Blood",
      icon: "icons/pit-lords-blood.webp",
      tuneKey: "pit_lords_blood",
      desc: g => {
        const t = g.tune.abilities.pit_lords_blood;
        return `Damage taken reduced by ${dhPct(t.perEnemy)} for each enemy within ${t.radius} yds, up to ${dhPct(t.maxReduction)}.`;
      }
    }
  },
  specs: [ {
    id: "base",
    name: "Base",
    blurb: () => "The class as currently played, without talents."
  }, {
    id: "martial",
    name: "Martial Arts",
    icon: "icons/blade-dash.webp",
    passiveName: "Martial Arts talents",
    blurb: tu => {
      const t = tu.specs.martial, fof = tu.abilities.dive.cooldown - (t.friendOrFoe || 0);
      return `Dual Wield Mastery: off-hand auto attacks deal ${Math.round(t.offHandAuto * 100)}% damage.` + ` Improved Reflexes: +${Math.round(t.improvedReflexes * 100)}% dodge.` + ` Multistrike: each Double Strike hit has a ${Math.round(t.multistrikeChance * 100)}% chance to strike again for ${Math.round(t.multistrikeScale * 100)}% damage at no mana cost.` + ` Eternal Pursuit: slows and fears on you last ${Math.round(t.eternalPursuit * 100)}% less (none in the training grounds yet).` + ` Friend or Foe: Dive cooldown reduced by ${t.friendOrFoe} sec (${fof} sec).` + ` Improved Blade Dash: cooldown -${t.bladeDashReduction * 2} sec.` + ` Muscle Memory: each auto attack that lands has a ${Math.round(t.muscleMemoryChance * 100)}% chance to make your next ability free (it does not stop your mana regeneration).` + ` Fervor of the Hunt: +${Math.round(t.fervorHaste * 100)}% haste.` + ` Momentum: each Double Strike hit that lands adds a stack (up to ${t.maxStacks}, ${t.momentumDuration} sec), each +${dhPct(t.momentumMove)} movement speed. Blade Dash consumes up to ${t.sweepConsumes} stacks and deals +${Math.round(t.sweepBonusPerStack * 100)}% damage per stack consumed.` + ` Battle Trance (tier 5): see the passive.` + ` The Hunt (tier 5): teaches The Hunt.` + ` Battle Rhythm (trainer passive): each melee weapon hit that lands takes ${t.rhythmReduction} sec off the cooldown of Double Strike, Mana Strike and Flame Strike.` + ` Hunt Prey (tier 7): consuming ${t.diveStacksNeeded} Momentum stacks resets your Dive and empowers it for ${t.diveWindow} sec: no minimum range, +${Math.round(t.diveBonus * 100)}% damage, no mana cost${t.diveOffGcd ? ", off the global cooldown" : ""}.`;
    },
    state: () => ({
      stacks: 0,
      momUntil: 0,
      sweepMult: 1,
      diveEmpowered: false,
      diveMult: 1,
      repeatHits: 0,
      repeatPending: false,
      muscle: false
    }),
    onStrike(g, s, ab, res) {
      const t = g.tune.specs.martial;
      const landed = res && [ "hit", "crit", "glance" ].includes(res.roll);
      if (ab.id === "double_strike" && landed && g.passiveOn("momentum")) {
        if (g.time > s.momUntil) s.stacks = 0;
        s.stacks = Math.min(t.maxStacks, s.stacks + 1);
        s.momUntil = g.time + t.momentumDuration;
      }
      if (ab.id === "double_strike" && s.repeatHits > 0) {
        s.repeatHits--;
        return;
      }
      if (ab.id === "double_strike" && landed && g.passiveOn("multistrike") && t.multistrikeChance && !s.repeatPending && Math.random() < t.multistrikeChance) {
        s.repeatPending = true;
        g.schedule(t.multistrikeDelay, g2 => {
          s.repeatPending = false;
          const p = g2.player, tg = g2.target, dt = g2.abilityTune("double_strike");
          if (p.dead || !tg || tg.dead || !g2.inMelee(p, tg)) return;
          g2.floater(p, "Multistrike!", "#e8e2ff", {
            small: true
          });
          g2.addLog("Multistrike: Double Strike strikes again.", "#e8e2ff");
          s.repeatHits = 2;
          const half = Object.assign({}, dt, {
            weaponPercent: dt.weaponPercent * t.multistrikeScale,
            min: dt.min * t.multistrikeScale,
            max: dt.max * t.multistrikeScale
          });
          TL.effects.weaponStrikes(g2, ab, {
            type: "weaponStrikes",
            hands: [ "main", "off" ]
          }, half, tg);
        });
      }
    },
    onAbility(g, s, ab) {
      const t = g.tune.specs.martial;
      const raw = g.tune.abilities[ab.id] || {};
      const freeDive = ab.id === "dive" && s.diveEmpowered && g.time <= s.diveUntil && g.passiveOn("huntPrey");
      if (s.muscle && !freeDive && raw.cost > 0) {
        s.muscle = false;
        g.addLog(`Muscle Memory: ${ab.name} costs no mana.`, "#e8e2ff");
      }
      if (ab.id === "blade_dash" && !g.passiveOn("momentum")) s.sweepMult = 1;
      if (ab.id === "blade_dash" && g.passiveOn("momentum")) {
        if (g.time > s.momUntil) s.stacks = 0;
        const used = Math.min(s.stacks, t.sweepConsumes);
        s.sweepMult = 1 + t.sweepBonusPerStack * used;
        if (g.passiveOn("huntPrey") && t.diveStacksNeeded && used >= t.diveStacksNeeded) {
          s.diveEmpowered = true;
          s.diveUntil = g.time + t.diveWindow;
          if (t.diveResetOnEmpower) g.player.cooldowns.dive = 0;
        }
        s.stacks -= used;
      }
      if (ab.id === "dive") {
        s.diveMult = s.diveEmpowered && g.time <= s.diveUntil ? 1 + t.diveBonus : 1;
        s.diveEmpowered = false;
      }
    },
    afterHit(g, s, target, o, res) {
      if (!o.white || !res.amount || !g.passiveOn("muscleMemory") || s.muscle) return;
      if (Math.random() < g.tune.specs.martial.muscleMemoryChance) {
        s.muscle = true;
        g.floater(g.player, "Muscle Memory", "#e8e2ff", {
          small: true
        });
      }
    },
    tuneMod(g, s, id, base) {
      if (!base || !(base.cost > 0)) return null;
      if (s.muscle) return Object.assign({}, base, {
        cost: 0
      });
      if (id === "dive" && s.diveEmpowered && g.time <= s.diveUntil && g.passiveOn("huntPrey")) return Object.assign({}, base, {
        cost: 0
      });
      return null;
    },
    damageMult(g, s, o) {
      return o.ability === "blade_dash" ? s.sweepMult : o.ability === "dive" ? s.diveMult : 1;
    },
    cooldown(g, id, base) {
      const t = g.tune.specs.martial;
      if (id === "dive" && g.passiveOn("friendOrFoe") && t.friendOrFoe) return base - t.friendOrFoe;
      if (id === "blade_dash" && g.passiveOn("improvedBladeDash")) return Math.max(0, base - (t.bladeDashReduction || 0) * dhRank(g, "improvedBladeDash", 2));
      return base;
    },
    minRange(g, s, ab, base) {
      return ab.id === "dive" && s.diveEmpowered && g.time <= s.diveUntil ? 0 : base;
    },
    offGcd(g, s, ab) {
      return ab.id === "dive" && s.diveEmpowered && g.time <= s.diveUntil && g.passiveOn("huntPrey") && g.tune.specs.martial.diveOffGcd;
    },
    glow(g, s, ab) {
      if (ab.id === "blade_dash" && g.passiveOn("momentum") && s.stacks >= g.tune.specs.martial.sweepConsumes) return "empowered";
      return ab.id === "dive" && s.diveEmpowered && g.time <= s.diveUntil ? "empowered" : null;
    },
    offHandAuto(g, base) {
      return g.passiveOn("dualWield") ? Math.max(base, g.tune.specs.martial.offHandAuto || base) : base;
    },
    buff(g, s) {
      const out = [];
      const t = g.tune.specs.martial;
      if (s.muscle) out.push({
        name: "Muscle Memory",
        icon: "icons/muscle-memory.webp",
        desc: "Your next ability costs no mana.",
        color: "#e8e2ff"
      });
      if (s.diveEmpowered && g.time > s.diveUntil) s.diveEmpowered = false;
      if (s.diveEmpowered) out.push({
        name: "Hunt Prey",
        icon: "icons/dive.webp",
        remaining: s.diveUntil - g.time,
        desc: `Your next Dive has no minimum range, costs no mana, deals ${dhPct(t.diveBonus)} additional damage and does not trigger the global cooldown.`,
        color: "#e8e2ff"
      });
      if (s.stacks && g.time > s.momUntil) s.stacks = 0;
      if (s.stacks) out.push({
        name: "Momentum",
        icon: "icons/momentum.webp",
        stacks: s.stacks,
        remaining: s.momUntil - g.time,
        desc: `Movement speed increased by ${dhPct(t.momentumMove * s.stacks)}. Your Blade Dash consumes up to ${t.sweepConsumes} stacks and deals ${dhPct(t.sweepBonusPerStack)} additional damage for each.`,
        color: "#b0b8c0"
      });
      return out;
    }
  }, {
    id: "spellbreaker",
    name: "Spellbreaker",
    icon: "icons/mana-strike.webp",
    passiveName: "Spellbreaker talents",
    barFirst: [ "mana_breaker", "mana_strike", "mana_scar" ],
    barHide: [ "double_strike", "flame_strike" ],
    blurb: tu => {
      const t = tu.specs.spellbreaker;
      return `Improved Mana Strike: your Mana Strike deals ${Math.round((t.manaStrikeDamage - 1) * 100)}% more damage and costs ${Math.round((1 - t.manaStrikeCost) * 100)}% less mana.` + ` Willpower: +${Math.round(t.willpower * 100)}% Intellect and Spirit.` + ` Improved Arcane Ink: ${Math.round(t.arcaneInk * 100)}% less magic damage taken.` + ` Focused Mind: +${Math.round(t.stillnessHit * 100)}% hit (no effect here: the specs are hit capped).` + ` Mental Clarity: each melee auto attack has a ${Math.round(t.clarityChance * 100)}% chance to restore ${t.claritySeconds} sec of mana regeneration.` + ` Deep Meditation: each Mental Clarity proc has a ${Math.round((t.deepChance != null ? t.deepChance : 1) * 100)}% chance to deal ${t.deepMin} to ${t.deepMax} Arcane damage to the target.` + ` Mana Weaving: each time Deep Meditation deals damage, the cooldown of your Mana Strike is reset and that Mana Strike costs ${Math.round((1 - t.weaveCost) * 100)}% less mana.` + ` Mana Charge: each Mana Strike that lands has a ${Math.round(t.ruptureChance * 100)}% chance to grant you ${t.ruptureStacks} stack, each increasing the magic damage (all schools except physical) you deal by ${Math.round(t.breakPerStack * 100)}%, up to ${t.breakMaxStacks} stacks. Lasts ${t.breakDuration} sec; each new stack refreshes it.` + ` Mirror Image (tier 5): teaches Mirror Image. Mana Breaker (tier 6): teaches Mana Breaker (grants ${tu.abilities.mana_breaker.ruptureStacks} Mana Charge stacks). Mana Scar (tier 7): teaches Mana Scar (needs ${t.scarStacks || t.breakMaxStacks} Mana Charge stacks and consumes them).`;
    },
    tuneMod(g, s, id, base) {
      if (id !== "mana_strike" || !(base.cost > 0)) return null;
      const t = g.tune.specs.spellbreaker;
      let m = g.passiveOn("improvedManaStrike") ? t.manaStrikeCost : 1;
      if (s.weaveReady && (g.passiveOn("manaWeaving") || g.passiveOn("clarityWeaving"))) m *= t.weaveCost != null ? t.weaveCost : 1;
      return m === 1 ? null : Object.assign({}, base, {
        cost: Math.round(base.cost * m)
      });
    },
    damageMult(g, s, o, school, target) {
      const t = g.tune.specs.spellbreaker;
      const ims = o.ability === "mana_strike" && g.passiveOn("improvedManaStrike") ? t.manaStrikeDamage || 1 : 1;
      if (school === "physical") return ims;
      return ims * (1 + (g.passiveOn("manaRupture") ? dhChargeStacks(g) * t.breakPerStack : 0));
    },
    state: () => ({
      weaveReady: false
    }),
    onAbility(g, s, ab) {
      if (ab.id === "mana_strike") s.weaveReady = false;
    },
    glow(g, s, ab) {
      if (ab.id === "mana_strike" && s.weaveReady && !(g.player.cooldowns.mana_strike > 0)) return "empowered emp-mana";
      if (ab.id === "mana_scar" && g.target && !ab.requires(g, g.target)) return "empowered emp-mana";
      return null;
    },
    cast(g, s, ab, t) {
      if (ab.id !== "mirror_image") return;
      const p = g.player, trance = g.passiveOn("battleTrance"), st = trance ? g.expState.stacks || 0 : 0;
      s.images = [];
      const maxHp = Math.max(1, Math.round(g.maxHp(p) * (t.health || .25))), hp = Math.max(1, Math.round(maxHp * p.hp / g.maxHp(p)));
      for (let i = 0; i < t.images; i++) s.images.push({
        kind: "image",
        name: "Mirror Image",
        x: p.x,
        y: p.y,
        radius: p.radius,
        facing: p.facing,
        slot: i * Math.PI * 2 / t.images + Math.PI / 3,
        until: g.time + t.duration,
        hp: hp,
        maxHp: maxHp,
        dead: false,
        flash: 0,
        stacks: st,
        idle: 0,
        mh: .3 + i * .25,
        oh: .6 + i * .25,
        msCd: .4 + i * .4
      });
      g.fx({
        kind: "ring",
        x: p.x,
        y: p.y,
        r: 2.4,
        color: DH_MANA.mid,
        life: .5,
        max: .5
      });
      g.addLog(`Mirror Image: 3 images join the hunt${trance ? ` with ${st} Battle Trance stack${st === 1 ? "" : "s"}` : ""}.`, DH_MANA.light);
    },
    update(g, s, dt) {
      if (!s.images || !s.images.length) return;
      const T = g.tune.abilities.mirror_image, sb = g.tune.specs.spellbreaker, ms = g.tune.abilities.mana_strike, bt = g.tune.experiments.battleTrance, w = g.tune.weapons;
      const trance = g.passiveOn("battleTrance"), cap = bt.maxStacks;
      for (const m of s.images) if (!m.dead && (g.time >= m.until || g.player.dead)) m.dead = true;
      s.images = s.images.filter(m => !m.dead);
      for (const m of s.images) m.flash = Math.max(0, (m.flash || 0) - dt);
      for (const m of s.images) {
        if (m.stacks) {
          m.idle += dt;
          if (m.idle >= bt.decayInterval) {
            m.idle -= bt.decayInterval;
            m.stacks--;
          }
        }
        let tg = g.target && !g.target.dead ? g.target : null;
        if (!tg) {
          let bd = Infinity;
          for (const e of g.alive()) {
            const d = Math.hypot(e.x - m.x, e.y - m.y);
            if (d < bd) {
              bd = d;
              tg = e;
            }
          }
        }
        if (!tg) continue;
        const r = tg.radius + .9, gx = tg.x + Math.cos(m.slot) * r, gy = tg.y + Math.sin(m.slot) * r, dx = gx - m.x, dy = gy - m.y, d = Math.hypot(dx, dy);
        if (d > .05) {
          const step = Math.min(d, T.moveSpeed * dt);
          m.x += dx / d * step;
          m.y += dy / d * step;
        }
        m.facing = Math.atan2(tg.y - m.y, tg.x - m.x);
        if (d >= .6) continue;
        const landed = res => {
          if (trance && res && [ "hit", "crit", "glance" ].includes(res.roll)) {
            m.stacks = Math.min(cap, m.stacks + 1);
            m.idle = 0;
          }
        };
        const haste = 1 + (trance ? m.stacks * bt.hastePerStack : 0);
        m.mh -= dt * haste;
        m.oh -= dt * haste;
        m.msCd -= dt;
        for (const hand of [ "main", "off" ]) {
          const key = hand === "main" ? "mh" : "oh";
          if (m[key] > 0 || tg.dead) continue;
          m[key] += hand === "main" ? w.mainHand.speed : w.offHand.speed;
          let mult = 1;
          if (hand === "off") {
            mult = w.offHand.damageMultiplier;
            g.eachSpec("offHandAuto", sp => {
              mult = sp.offHandAuto(g, mult);
            });
          }
          landed(g.playerHit(tg, {
            amount: g.weaponRoll(hand) * mult * T.damage,
            school: "physical",
            name: `Mirror Image: ${hand === "main" ? "Main hand" : "Off hand"}`,
            specExtra: true
          }));
        }
        if (m.msCd <= 0 && !tg.dead) {
          m.msCd = ms.cooldown;
          const base = (ms.weaponDps * g.weaponDps("main") + g.spellPower() * ms.spCoef) * (g.passiveOn("improvedManaStrike") ? sb.manaStrikeDamage || 1 : 1);
          const res = g.playerHit(tg, {
            amount: base * T.damage,
            school: "arcane",
            name: "Mirror Image: Mana Strike",
            attack: false,
            specExtra: true
          });
          landed(res);
          if (res && res.amount && !tg.dead && g.passiveOn("manaRupture") && Math.random() < (sb.ruptureChance != null ? sb.ruptureChance : 1)) dhAddRupture(g, tg, 1);
          g.fx({
            kind: "slash",
            x: tg.x,
            y: tg.y,
            a: m.facing,
            color: DH_MANA.mid,
            life: .22,
            max: .22,
            big: true
          });
        }
      }
    },
    afterHit(g, s, target, o, res) {
      if (!res.amount || target.dead) return;
      const stacking = g.passiveOn("manaRupture") || g.passiveOn("manaScar") || g.passiveOn("manaBreaker");
      if (stacking && o.ability === "mana_strike" && o.name === "Mana Strike" && Math.random() < (g.tune.specs.spellbreaker.ruptureChance != null ? g.tune.specs.spellbreaker.ruptureChance : 1)) dhAddRupture(g, target, g.tune.specs.spellbreaker.ruptureStacks || 1);
      if (o.ability === "mana_breaker" && o.name === "Mana Breaker") dhAddRupture(g, target, g.tune.abilities.mana_breaker.ruptureStacks || 2);
    },
    buff(g, s) {
      const out = [], n = dhChargeStacks(g), t = g.tune.specs.spellbreaker;
      if (n) out.push({
        name: "Mana Charge",
        icon: "icons/mana-charge.webp",
        stacks: n,
        remaining: g.player.breakUntil - g.time,
        desc: `Magic damage you deal increased by ${dhPct(t.breakPerStack * n)}.${n >= (t.scarStacks || t.breakMaxStacks) ? " Mana Scar is ready." : ""}`,
        color: DH_MANA.mid
      });
      if (s.weaveReady) out.push({
        name: "Mana Weaving",
        icon: "icons/mana-weaving.webp",
        desc: "Your Mana Strike is ready and costs no mana.",
        color: DH_MANA.light
      });
      return out;
    }
  }, {
    id: "felblood",
    name: "Felblood",
    icon: "icons/immolation.webp",
    passiveName: "Felblood talents",
    state: () => ({
      thirstKey: null
    }),
    onAbility(g, s, ab) {
      if (ab.id !== "eruption") return;
      const a = dhBladesAura(g), c = g.player.channel;
      if (a && c) a.remaining = Math.max(a.remaining, c.remaining + .3);
    },
    blurb: tu => {
      const t = tu.specs.felblood, b = tu.abilities.burning_blades;
      return `Flame Strike sets your weapons ablaze in ${b.maxStage} stages (${b.duration} sec, refreshed by each Flame Strike): each stage -${Math.round(b.speedPerStage * 100)}% attack speed and +${Math.round(b.firePerStage * 100)}% of weapon damage as Fire on each auto attack (the weapon hit stays Physical).` + ` Improved Flame Strike: all of your Flame Strike's damage +${Math.round((tu.abilities.flame_strike.improvedMult - 1) * 100)}%.` + ` Hatred: +${Math.round(t.burningHatred * 100)}% crit. Vengeful Parry: +${Math.round(t.vengefulParry * 100)}% parry.` + ` Improved Immolation: your Immolation lasts ${t.improvedImmolationDuration} sec longer.` + ` Infernal Constitution: +${Math.round(t.infernalConstitution * 100)}% Strength and Stamina.` + ` Demonic Thirst: each Fire critical strike restores mana equal to ${dhPct(t.thirstBaseMana)} of your base mana.` + ` Infernal Release: press Immolation again to detonate it for ${Math.round(t.detonateBase * 100)}% of its full damage on one target, +${Math.round(t.detonatePerSecond * 100)}% per second it burned (off the global cooldown).` + ` Mixed Blood: two Demon Bloods can be active at the same time.` + ` Eruption (tier 6): teaches Eruption (${tu.abilities.eruption.castTime} sec cast, needs the last stage of Burning Blades and consumes it). Demonic Strength: +${Math.round(t.demonicStrength * 100)}% of your Strength as attack power.` + ` Infernal Metamorphosis (tier 7): Metamorphosis has a ${tu.abilities.metamorphosis.infernalCooldown / 60} min cooldown and turns all your damage into Fire.`;
    },
    tuneMod(g, s, id, base) {
      const f = g.tune.specs.felblood;
      if (id === "immolation" && g.passiveOn("improvedImmolation")) return Object.assign({}, base, {
        duration: base.duration + (f.improvedImmolationDuration || 0) * dhRank(g, "improvedImmolation", 2) / 2
      });
      if (id === "flame_strike" && g.passiveOn("improvedFlameStrike")) {
        const k = base.improvedMult || 1;
        return Object.assign({}, base, {
          weaponPercent: base.weaponPercent * k,
          min: base.min * k,
          max: base.max * k,
          spCoef: base.spCoef * k
        });
      }
      if (id === "metamorphosis" && g.passiveOn("infernalMetamorphosis")) return Object.assign({}, base, {
        cooldown: base.infernalCooldown || base.cooldown,
        fireForm: 1
      });
      return null;
    },
    reuse(g, s, ab) {
      return ab.id === "immolation" && g.passiveOn("infernalRelease") && g.player.auras.some(a => a.id === "immolation") ? dhDetonate(g) : false;
    },
    glow(g, s, ab) {
      if (ab.id === "eruption" && ab.ready(g)) return "empowered emp-fire";
      if (ab.id === "immolation" && g.passiveOn("infernalRelease") && g.player.auras.some(a => a.id === "immolation")) return "empowered emp-fire";
      return null;
    },
    afterHit(g, s, target, o, res) {
      const fire = (g.schoolOverride(g.player) || o.school) === "fire";
      if (res.roll === "crit" && res.amount && fire) dhFireCrit(g, o, target);
      if (o.white) dhBladesFire(g, target, o, res);
    },
    buff() {
      return null;
    }
  } ],
  experiments: [ {
    id: "battle_trance",
    name: "Battle Trance",
    pt: "Transe",
    icon: "icons/battle-trance.webp",
    enabled: g => g.passiveOn("battleTrance"),
    blurb: t => {
      const b = t.battleTrance;
      return `Each of your melee auto attacks, Double Strike hits and Blade Dash hits that lands increases your haste and movement speed by ${Math.round(b.hastePerStack * 100)}%, stacking up to ${b.maxStacks} times. One stack is lost for every ${b.decayInterval} sec without landing a melee attack.`;
    },
    state: () => ({
      stacks: 0,
      idle: 0
    }),
    onSwing(g, s, hand, landed) {
      if (!landed || !g.passiveOn("battleTrance")) return;
      s.stacks = Math.min(g.tune.experiments.battleTrance.maxStacks, s.stacks + 1);
      s.idle = 0;
    },
    update(g, s, dt) {
      if (!g.passiveOn("battleTrance")) {
        s.stacks = 0;
        s.idle = 0;
        return;
      }
      if (!s.stacks) {
        s.idle = 0;
        return;
      }
      s.idle += dt;
      const t = g.tune.experiments.battleTrance;
      if (s.idle >= t.decayInterval) {
        s.idle -= t.decayInterval;
        s.stacks--;
      }
    },
    hasteBonus(g, s) {
      return g.passiveOn("battleTrance") ? s.stacks * g.tune.experiments.battleTrance.hastePerStack : 0;
    },
    moveBonus(g, s) {
      return g.passiveOn("battleTrance") ? s.stacks * g.tune.experiments.battleTrance.speedPerStack : 0;
    },
    buff(g, s) {
      return s.stacks && g.passiveOn("battleTrance") ? {
        name: "Battle Trance",
        icon: "icons/battle-trance.webp",
        stacks: s.stacks,
        desc: `Haste and movement speed increased by ${dhPct(s.stacks * g.tune.experiments.battleTrance.hastePerStack)}.`,
        color: "#d4ac0d"
      } : null;
    }
  } ]
});