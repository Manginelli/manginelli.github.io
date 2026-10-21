(function(TL) {
  const $ = s => document.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const clock = s => {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  };
  const BARS = {
    martial: [ "double_strike", "blade_dash", "dive", "immolation", "wind_walk", "disrupt", "shackle_demon", "the_hunt", "metamorphosis", "deep_breaths" ],
    spellbreaker: [ "mana_strike", "mana_breaker", "mana_scar", "immolation", "wind_walk", "disrupt", "shackle_demon", "mirror_image", "metamorphosis", "deep_breaths" ],
    felblood: [ "flame_strike", "eruption", "immolation", "blade_dash", "dive", "disrupt", "shackle_demon", "demonic_skin", "metamorphosis", "deep_breaths" ]
  };
  const SPECS = [ {
    id: "martial",
    name: "Martial Arts",
    line: "Speed and Steel in a rhythmic dance around the battlefield. Draw blood and rip flesh with a flurry of attacks."
  }, {
    id: "spellbreaker",
    name: "Spellbreaker",
    line: "Magic and Mind, charge your mana and unleash a devastating slash, breaking their body and soul."
  }, {
    id: "felblood",
    name: "Felblood",
    line: "Fire and Blood, use your demonic powers to unleash powerful flaming blows, leaving only ash in your wake."
  } ];
  const HOW_TO = {
    martial: "Keep building Momentum with Double Strike. When at 4 stacks, unleash your combo: Blade Dash, then Dive right back where you began. Keep attacking to make sure your Double Strike recharges faster.",
    spellbreaker: "Accumulate Mana Charges by using your Mana Strike and Mana Breaker. Keep attacking to reset Mana Strike's cooldown and regenerate mana. Unleash 8 stacks of Mana Charges with your Mana Scar.",
    felblood: "Set your blades aflame with Flame Strike. At 3 stacks of burning Blade, unleash an Eruption for high damage. Keep Immolation up, and unleash its power with an explosion by pressing it again, but be careful not to take too long and miss your chance."
  };
  const TEACHES = {
    martial: [ "theHunt" ],
    spellbreaker: [ "mirrorImage", "manaBreaker", "manaScar" ],
    felblood: [ "eruption" ]
  };
  const dhPctLocal = v => Math.round(v * 100) + "%";
  const pct = v => {
    const x = Math.round(v * 1e3) / 10;
    return (Number.isInteger(x) ? x : x.toFixed(1)) + "%";
  };
  const PASSIVES = {
    all: [ {
      id: "battleRhythm",
      name: "Battle Rhythm",
      icon: "icons/battle-rhythm.webp",
      text: t => `Each of your melee weapon hits that lands reduces the remaining cooldown of your ${{
        martial: "Double Strike",
        spellbreaker: "Mana Strike",
        felblood: "Flame Strike"
      }[run.spec] || "Double Strike, Mana Strike and Flame Strike"} by ${t.specs.martial.rhythmReduction} sec.`
    } ],
    martial: [ {
      id: "uncannySwiftness",
      name: "Uncanny Swiftness",
      icon: "icons/uncanny-swiftness.webp",
      text: t => {
        const m = t.specs.martial;
        return `Increases your movement speed by ${pct(m.uncannySwiftness)}, your chance to dodge by ${pct(m.swiftnessDodge)} and your haste by ${pct(m.swiftnessHaste)}.`;
      }
    }, {
      id: "improvedBladeDash",
      name: "Improved Blade Dash",
      icon: "icons/blade-dash.webp",
      text: t => `Reduces the cooldown of your Blade Dash by ${t.specs.martial.bladeDashReduction * 2} sec.`
    }, {
      id: "momentum",
      name: "Momentum",
      icon: "icons/momentum.webp",
      text: t => {
        const m = t.specs.martial;
        return `Each hit of your Double Strike that lands grants you a stack of Momentum, increasing your movement speed by ${pct(m.momentumMove)}. Stacks up to ${m.maxStacks} times. Lasts ${m.momentumDuration} sec. Your Blade Dash consumes up to ${m.sweepConsumes} stacks of Momentum, increasing its damage by ${pct(m.sweepBonusPerStack)} for each stack consumed.`;
      }
    }, {
      id: "muscleMemory",
      name: "Muscle Memory",
      icon: "icons/muscle-memory.webp",
      text: t => `Gives your melee auto attacks a ${pct(t.specs.martial.muscleMemoryChance)} chance to make your next ability cost no mana. That ability does not interrupt your mana regeneration.`
    }, {
      id: "huntPrey",
      name: "Hunt Prey",
      icon: "icons/dive.webp",
      text: t => {
        const m = t.specs.martial, dv = T("dive"), k = 1 + m.diveBonus;
        return `When your Blade Dash consumes ${m.diveStacksNeeded} stacks of Momentum, the cooldown of your Dive is reset and your next Dive within ${m.diveWindow} sec has no minimum range, costs no mana, deals ${dhPctLocal(m.diveBonus)} additional damage and does not trigger the global cooldown.`;
      }
    } ],
    spellbreaker: [ {
      id: "cognitiveAcuity",
      name: "Cognitive Acuity",
      icon: "icons/cognitive-acuity.webp",
      text: t => `Increases your movement speed by ${pct(t.specs.martial.uncannySwiftness)} and your chance to hit with attacks and spells by ${pct(t.specs.spellbreaker.acuityHit)}.`
    }, {
      id: "mentalClarity",
      name: "Mental Clarity",
      icon: "icons/mental-clarity.webp",
      text: t => {
        const b = t.specs.spellbreaker;
        return `Gives your melee auto attacks a ${pct(b.clarityChance)} chance to restore ${N(game.regenPerSecond() * b.claritySeconds)} mana (${b.claritySeconds} sec of your mana regeneration).`;
      }
    }, {
      id: "clarityWeaving",
      name: "Mana Weaving",
      icon: "icons/mana-weaving.webp",
      text: t => {
        const c = t.specs.spellbreaker.weaveCost;
        return `Each time Mental Clarity restores mana, the cooldown of your Mana Strike is reset and your next Mana Strike ${c ? `costs ${pct(1 - c)} less mana` : "costs no mana and does not interrupt your mana regeneration"}.`;
      }
    }, {
      id: "manaRupture",
      name: "Mana Charge",
      icon: "icons/mana-charge.webp",
      text: t => {
        const b = t.specs.spellbreaker;
        return `Each of your Mana Strikes that lands grants you a stack of Mana Charge, increasing the magic damage you deal by ${pct(b.breakPerStack)}. Stacks up to ${b.breakMaxStacks} times. Lasts ${b.breakDuration} sec, and each new stack refreshes the duration.`;
      }
    } ],
    felblood: [ {
      id: "demonicReflexes",
      name: "Demonic Augmentation",
      icon: "icons/demonic-augmentation.webp",
      text: t => {
        const f = t.specs.felblood;
        return `Increases your movement speed by ${pct(t.specs.martial.uncannySwiftness)}, your Stamina by ${pct(f.reflexesStamina)}, your chance to parry by ${pct(f.reflexesParry)} and your chance to get a critical strike with all attacks and spells by ${pct(f.reflexesCrit)}.`;
      }
    }, {
      id: "infernalRelease",
      name: "Infernal Release",
      icon: "icons/immolation.webp",
      text: t => {
        const im = T("immolation"), f = t.specs.felblood, base = im.duration / im.tick * f.detonateBase, last = Math.floor(im.duration - im.tick), dmg = im.max * base + sp(im.spCoef * base);
        return `While your Immolation is active, using it again makes it explode for ${N(dmg)} Fire damage, increased by ${pct(f.detonatePerSecond)} for each second it has been active (${N(dmg * (1 + f.detonatePerSecond * last))} after ${last} sec), hitting all enemies within melee range. Ends the Immolation and does not trigger the global cooldown. If the Immolation ends on its own, it does not explode.`;
      }
    }, {
      id: "felThirst",
      name: "Demonic Thirst",
      icon: "icons/demonic-thirst.webp",
      text: t => `Your Fire critical strikes restore ${N(t.player.baseMana * t.specs.felblood.felThirstBaseMana)} mana (${pct(t.specs.felblood.felThirstBaseMana)} of your base mana).`
    }, {
      id: "mixedBlood",
      name: "Mixed Blood",
      icon: "icons/mixed-blood.webp",
      text: () => "Allows you to have two Demon Bloods active at the same time."
    } ]
  };
  const passivesOf = spec => PASSIVES.all.concat(PASSIVES[spec] || []);
  const PAUSE_RECOVERY = .25;
  const POTIONS = {
    health: {
      key: "Q",
      code: "KeyQ",
      name: "Superior Healing Potion",
      icon: "icons/potion-health.webp",
      amount: 800,
      stat: "hp",
      text: "Restores 800 health."
    },
    mana: {
      key: "E",
      code: "KeyE",
      name: "Greater Mana Potion",
      icon: "icons/potion-mana.webp",
      amount: 800,
      stat: "mana",
      text: "Restores 800 mana."
    }
  };
  const POTION_CD = 120;
  const BLOODS = [ "imps_blood", "satyrs_blood", "felhunters_blood" ];
  const PAUSE = 10, COUNTDOWN = 3;
  const game = new TL.Game("demon-hunter", "burningwoods-hollow");
  game.options.infiniteMana = false;
  game.options.sharedStrikeCd = false;
  const canvas = $("#world");
  const renderer = new TL.Renderer(canvas, game);
  const hud = new TL.HUD(game);
  TL.game = game;
  TL.renderer = renderer;
  const R = (lo, hi) => Math.round(lo) === Math.round(hi) ? `${Math.round(lo)}` : `${Math.round(lo)} to ${Math.round(hi)}`;
  const N = v => `${Math.round(v)}`;
  function weapon(hand) {
    const w = game.tune.weapons[hand === "main" ? "mainHand" : "offHand"], ap = game.attackPower() / 14 * w.speed;
    return [ w.min + ap, w.max + ap ];
  }
  const sp = coef => game.spellPower() * (coef || 0);
  const T = id => game.abilityTune(id);
  function strikeRange(t, hand = "main") {
    const [a, b] = weapon(hand), wp = t.weaponPercent || 0, ap = (t.apPercent || 0) * game.attackPower(), f = sp(t.spCoef) + (t.weaponDps ? t.weaponDps * game.weaponDps(hand) : 0) + ap;
    return [ a * wp + (t.min || 0) + f, b * wp + (t.max || 0) + f ];
  }
  const BLOOD_END = "";
  const STAGE_TEXT = {
    double_strike: () => {
      const t = T("double_strike"), m = strikeRange(t, "main"), o = strikeRange(t, "off");
      return `Strikes twice in quick succession, first with your main hand for ${R(...m)} Physical damage and then with your off-hand weapon for ${R(...o)} Physical damage.`;
    },
    blade_dash: () => {
      const t = T("blade_dash"), [a, b] = weapon("main"), [c, d] = weapon("off");
      return `Dashes ${t.distance} yds forward, striking all enemies in your path for ${R((a + c) * t.weaponPercent + t.min, (b + d) * t.weaponPercent + t.max)} Physical damage. Cannot miss, be dodged or be parried.`;
    },
    dive: () => {
      const t = T("dive"), ms = game.specStates && game.specStates.martial, k = ms && ms.diveEmpowered ? 1 + game.tune.specs.martial.diveBonus : 1;
      return `Dives at the target and lands on its other side, causing ${R(t.min * k, t.max * k)} Physical damage.`;
    },
    immolation: () => {
      const t = T("immolation"), f = sp(t.spCoef);
      return `Engulfs you in flames, causing ${R(t.min + f, t.max + f)} Fire damage every ${t.tick} sec to all enemies in melee range. Lasts ${t.duration} sec.`;
    },
    disrupt: () => {
      const t = T("disrupt"), sb = game.tune.enemies.satyr.shadowBolt;
      return `Interrupts the target's spellcasting, burning mana equal to the interrupted spell's cost and causing Arcane damage equal to half of the mana burned (a Satyr Hellcaller's Shadow Bolt: ${sb.cost} mana burned, ${N(sb.cost * t.damageRatio)} damage). Prevents any spell in that school from being cast for ${t.schoolLock} sec.`;
    },
    the_hunt: () => {
      const t = T("the_hunt"), [a, b] = weapon("main"), [c, d] = weapon("off"), k = game.tune.weapons.offHand.damageMultiplier;
      return `Leaps at the target and stuns it for ${t.stun} sec. During the stun, you make ${t.hits} extra melee attacks, alternating between your main hand (${R(a, b)} Physical damage) and off-hand weapons (${R(c * k, d * k)} Physical damage).`;
    },
    demonic_skin: () => {
      const t = T("demonic_skin");
      return `Hardens your skin with demonic power, reducing all damage you take by ${N(t.reduction)} for ${t.duration} sec.`;
    },
    metamorphosis: () => {
      const t = T("metamorphosis"), p = game.player, armor = game.playerArmor() * t.armor, hp = game.maxHp(p) / game.modMult(p, "maxHealthMult") * t.health;
      return `Transforms you into a half-demon for ${t.duration} sec, increasing your haste by ${Math.round(t.haste * 100)}%, your armor by ${N(armor)} and your maximum health by ${N(hp)}.`;
    },
    deep_breaths: () => {
      const t = T("deep_breaths"), gain = game.regenPerSecond() * (1 + t.regenIncrease) * t.duration;
      return `Try to focus your mind for ${t.duration} sec, restoring ${N(gain)} mana. Your mana regeneration is active while channeling.`;
    },
    mana_strike: () => {
      const n = strikeRange(T("mana_strike"))[0], t = T("mana_strike");
      return `An instant strike that causes ${N(n)} Arcane damage. If the target has mana, also burns ${N(n * t.manaBurn)} mana and causes ${N(n * t.manaBurn * t.manaBurnDamage)} additional Arcane damage.`;
    },
    mana_breaker: () => {
      const t = T("mana_breaker"), n = strikeRange(t)[0];
      return `Breaks the target's defenses with a blade of arcane energy, causing ${N(n)} Arcane damage and granting you ${t.ruptureStacks} stacks of Mana Charge. If the target has mana, also burns ${N(n * t.manaBurn)} mana and causes ${N(n * t.manaBurn * t.manaBurnDamage)} additional Arcane damage.`;
    },
    mana_scar: () => {
      const t = T("mana_scar"), b = game.tune.specs.spellbreaker, cut = h => t.weaponDps * game.weaponDps(h) + sp(t.spCoef / t.hits);
      return `Gathers your focus, then cuts the target twice in quick succession with blades of mana: ${N(cut("main"))} Arcane damage with your main hand, then ${N(cut("off"))} with your off-hand weapon. Can only be used while you have ${b.scarStacks || b.breakMaxStacks} stacks of Mana Charge, and consumes them after the second cut.`;
    },
    mirror_image: () => {
      const t = T("mirror_image"), p = game.player, hp = game.maxHp(p) * t.health, [a, b] = weapon("main"), ms = strikeRange(T("mana_strike"))[0];
      return `Splits your form into ${t.images} images of yourself for ${t.duration} sec, causing enemies to lose track of you and removing all your threat. Each image has up to ${N(hp)} health, starting at the same share of health as you. The images surround your target, attack it (${R(a * t.damage, b * t.damage)} Physical damage with the main hand) and use Mana Strike (${N(ms * t.damage)} Arcane damage). If you have Mana Charge, each Mana Strike they land grants you a stack of it.`;
    },
    flame_strike: () => {
      const t = T("flame_strike"), b = T("burning_blades");
      return `An instant strike that causes ${R(...strikeRange(t))} Fire damage and sets your weapons ablaze with Burning Blades, reducing your attack speed by ${pct(b.speedPerStage)} and causing your melee auto attacks to deal an additional ${pct(b.firePerStage)} of weapon damage as Fire damage per stack. Can be applied up to ${b.maxStage} times. Lasts ${b.duration} sec.`;
    },
    eruption: () => {
      const t = T("eruption"), b = T("burning_blades");
      return `Makes the flames on your weapons erupt into the target, causing ${R(...strikeRange(t))} Fire damage. Requires ${b.maxStage} stacks of Burning Blades, and consumes them.`;
    },
    imps_blood: () => {
      const t = T("imps_blood");
      return `Drinks the blood of an imp, increasing your Fire resistance by ${t.fireResist} and causing ${R(t.min, t.max)} Fire damage to enemies that strike you in melee. ${BLOOD_END}`;
    },
    felhunters_blood: () => {
      const t = T("felhunters_blood");
      return `Drinks the blood of a felhunter, increasing your resistance to all magic by ${t.resistAll} and allowing ${pct(t.regenWhileCasting)} of your mana regeneration to continue while casting. ${BLOOD_END}`;
    }
  };
  for (const id in STAGE_TEXT) if (game.abilityById[id]) game.abilityById[id].stageText = STAGE_TEXT[id];
  if (game.cls.auras && game.cls.auras.felhunters_blood) game.cls.auras.felhunters_blood.desc = g => {
    const t = g.tune.abilities.felhunters_blood;
    return `Resistance to all magic increased by ${t.resistAll}. ${pct(t.regenWhileCasting)} of your mana regeneration continues while casting.`;
  };
  const waves = game.enc.waves;
  let resultTimer = 0;
  const rawUse = game.useAbility.bind(game);
  game.useAbility = id => {
    if (run.state === "menu") return false;
    return rawUse(id);
  };
  const run = {
    state: "menu",
    spec: null,
    bloods: [],
    wave: -1,
    waveEnemies: [],
    startAt: 0,
    endAt: 0,
    nextAt: 0,
    bannerUntil: 0
  };
  function show(id) {
    for (const o of [ "#introOverlay", "#specOverlay", "#bloodOverlay", "#resultOverlay" ]) $(o).hidden = o !== id;
  }
  const specCards = $("#specCards");
  for (const s of SPECS) {
    const def = game.cls.specs.find(x => x.id === s.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "spec-card spec-card--" + s.id;
    b.innerHTML = `<img src="${def.icon}" alt=""><b>${s.name}</b><span>${s.line}</span>`;
    b.addEventListener("click", () => pickSpec(s.id));
    specCards.appendChild(b);
  }
  function bloodLimit() {
    return game.passiveOn("mixedBlood") ? 2 : 1;
  }
  function pickSpec(id) {
    run.spec = id;
    game.setSpec(id);
    game.passives = {};
    for (const p of passivesOf(id)) game.passives[p.id] = true;
    const s = SPECS.find(x => x.id === id);
    $("#bloodSpec").textContent = s.name;
    const two = bloodLimit() > 1, note = $("#bloodNote");
    $("#bloodTitle").textContent = two ? "Drink Two Demon Bloods" : "Drink a Demon Blood";
    note.classList.toggle("double", two);
    note.textContent = two ? "A demon hunter can acquire a demon's trait by drinking their blood in a secret ritual. Felbloods' bodies can endure two bloods at the same time. Choose two before entering the Hollow." : "A demon hunter can acquire a demon's trait by drinking their blood in a secret ritual. Choose which one suits you, before entering the Hollow.";
    run.bloods = run.bloods.filter(b => BLOODS.includes(b)).slice(-bloodLimit());
    renderBloods();
    show("#bloodOverlay");
  }
  function renderBloods() {
    const list = $("#bloodList");
    list.innerHTML = "";
    for (const id of BLOODS) {
      const ab = game.abilityById[id], on = run.bloods.includes(id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "blood";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      const txt = (ab.stageText ? ab.stageText(game) : ab.text).replace(" Remains active until another Demon Blood is drunk.", "").replace(" Cannot be used in combat.", "").trim();
      b.innerHTML = `<img src="${ab.icon}" alt=""><div><b>${ab.name}</b><small>${txt}</small></div>`;
      b.addEventListener("click", () => {
        if (run.bloods.includes(id)) run.bloods = run.bloods.filter(x => x !== id); else run.bloods = run.bloods.concat(id).slice(-bloodLimit());
        renderBloods();
      });
      list.appendChild(b);
    }
    $("#enterBtn").disabled = run.bloods.length !== bloodLimit();
    $("#bloodCount").textContent = `${run.bloods.length} of ${bloodLimit()} chosen`;
    $("#bloodCount").classList.toggle("ready", run.bloods.length === bloodLimit());
  }
  $("#bloodBack").addEventListener("click", () => show("#specOverlay"));
  $("#enterBtn").addEventListener("click", () => startRun());
  $("#resAgain").addEventListener("click", () => startRun());
  $("#resOther").addEventListener("click", () => {
    run.state = "menu";
    show("#specOverlay");
    hideHud();
    $("#prepBar").hidden = true;
  });
  function hideHud() {
    $("#waveTracker").hidden = true;
    $("#stageTimer").hidden = true;
    $("#banner").hidden = true;
  }
  function startRun() {
    clearTimeout(resultTimer);
    show(null);
    game.setSpec(run.spec);
    game.passives = {};
    for (const id of TEACHES[run.spec]) game.passives[id] = true;
    for (const p of passivesOf(run.spec)) game.passives[p.id] = true;
    game.passiveRanks = {};
    game.emit("passives");
    const avail = game.availableAbilities().map(a => a.id), order = BARS[run.spec].filter(id => avail.includes(id));
    game.barLayouts = {
      [run.spec]: {
        order: order,
        hidden: avail.filter(id => !order.includes(id))
      }
    };
    game.refreshAbilities();
    game.emit("abilities");
    game.bloods = run.bloods.slice();
    game.player.dead = true;
    game.reset();
    const st = game.enc.playerStart;
    game.player.x = st.x;
    game.player.y = st.y;
    game.player.facing = 0;
    game.enemies = [];
    game.setTarget(null);
    game.resetMeter();
    $("#pName").textContent = SPECS.find(x => x.id === run.spec).name + " Demon Hunter";
    run.wave = -1;
    run.waveEnemies = [];
    run.endAt = 0;
    run.lastT = null;
    run.potionReadyAt = 0;
    buildPassives();
    run.state = "prep";
    $("#banner").hidden = true;
    run.bannerUntil = 0;
    $("#prepSpec").textContent = SPECS.find(x => x.id === run.spec).name + " · " + run.bloods.map(id => game.abilityById[id].name).join(" + ");
    $("#prepHow").textContent = HOW_TO[run.spec] || "";
    spawn({
      type: "dummy",
      x: 32,
      y: 20
    }).aggro = false;
    $("#prepBar").hidden = false;
    $("#waveTracker").hidden = true;
    $("#stageTimer").hidden = true;
    canvas.focus();
  }
  function begin() {
    if (run.state !== "prep") return;
    game.player.dead = true;
    game.reset();
    const st = game.enc.playerStart;
    game.player.x = st.x;
    game.player.y = st.y;
    game.player.facing = 0;
    game.enemies = [];
    game.setTarget(null);
    game.resetMeter();
    run.potionReadyAt = 0;
    held.clear();
    syncInput();
    $("#prepBar").hidden = true;
    hideTip();
    run.state = "countdown";
    run.nextAt = game.time + COUNTDOWN;
    run.startAt = game.time + COUNTDOWN;
    banner("Burningwoods Hollow", "Wave 1 · " + waves[0].name, COUNTDOWN);
    updateTracker();
    $("#waveTracker").hidden = false;
    $("#stageTimer").hidden = false;
    canvas.focus();
  }
  $("#startBtn").addEventListener("click", begin);
  const tip = $("#tip");
  function showTip(html, anchor) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = anchor.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + "px";
    tip.style.top = Math.max(8, r.top - tr.height - 10) + "px";
  }
  function hideTip() {
    tip.hidden = true;
  }
  const potionSlots = {};
  for (const [id, P] of Object.entries(POTIONS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot potion";
    b.setAttribute("aria-label", `${P.name}, key ${P.key}`);
    b.innerHTML = `<img src="${P.icon}" alt=""><span class="cd"></span><span class="cdt"></span><span class="key">${P.key}</span>`;
    b.addEventListener("click", () => drinkPotion(id));
    const html = `<div class="tt-name">${P.name}</div><div class="tt-row"><span>Potion</span><span>Requires Level ${id === "health" ? 35 : 31}</span></div><div class="tt-text">Use: ${P.text} (2 Min Cooldown)</div>`;
    b.addEventListener("mouseenter", () => showTip(html, b));
    b.addEventListener("mouseleave", hideTip);
    b.addEventListener("focus", () => showTip(html, b));
    b.addEventListener("blur", hideTip);
    $("#potionBar").appendChild(b);
    potionSlots[id] = {
      b: b,
      cd: b.querySelector(".cd"),
      cdt: b.querySelector(".cdt")
    };
  }
  function drinkPotion(id) {
    const p = game.player, P = POTIONS[id];
    if (!(playing() || run.state === "prep") || p.dead) return;
    if (game.time < run.potionReadyAt) {
      game.emit("error", "Item is not ready yet");
      return;
    }
    const max = P.stat === "hp" ? game.maxHp(p) : game.maxMana(p);
    if (p[P.stat] >= max) {
      game.emit("error", P.stat === "hp" ? "You are already at full health" : "You are already at full mana");
      return;
    }
    const gain = Math.min(P.amount, max - p[P.stat]);
    p[P.stat] += gain;
    run.potionReadyAt = game.time + POTION_CD;
    game.fx({
      kind: "restore",
      follow: true,
      x: p.x,
      y: p.y,
      r: p.radius,
      rgb: P.stat === "hp" ? "110,224,122" : "127,178,255",
      motes: Array.from({
        length: 18
      }, () => ({
        a: Math.random() * Math.PI * 2,
        r: .5 + Math.random() * 1.1,
        ph: Math.random(),
        z: Math.random() * 1.5
      })),
      life: 1.4,
      max: 1.4
    });
    game.floater(p, `+${Math.round(gain)}${P.stat === "mana" ? " mana" : ""}`, P.stat === "hp" ? "#6ee07a" : "#7fb2ff", {
      big: true
    });
    game.addLog(`${P.name}: +${Math.round(gain)} ${P.stat === "hp" ? "health" : "mana"}.`, P.stat === "hp" ? "#6ee07a" : "#7fb2ff");
  }
  function updatePotions() {
    const left = Math.max(0, (run.potionReadyAt || 0) - game.time);
    for (const sl of Object.values(potionSlots)) {
      sl.cd.style.setProperty("--p", left > 0 ? left / POTION_CD * 360 + "deg" : "0deg");
      sl.cdt.textContent = left >= 60 ? Math.ceil(left / 60) + "m" : left > 0 ? Math.ceil(left) : "";
    }
  }
  function buildPassives() {
    const col = $("#passiveList");
    col.innerHTML = "";
    for (const p of passivesOf(run.spec)) {
      const el = document.createElement("div");
      el.className = "talent";
      el.tabIndex = 0;
      el.setAttribute("aria-label", p.name);
      el.innerHTML = `<img src="${p.icon || "icons/talent-placeholder.svg"}" alt="">`;
      const html = () => `<div class="tt-name">${p.name}</div><div class="tt-row"><span>Passive</span></div><div class="tt-text">${p.text(game.tune)}</div>`;
      el.addEventListener("mouseenter", () => showTip(html(), el));
      el.addEventListener("mouseleave", hideTip);
      el.addEventListener("focus", () => showTip(html(), el));
      el.addEventListener("blur", hideTip);
      col.appendChild(el);
    }
  }
  function startWave(i) {
    run.wave = i;
    run.state = "wave";
    run.waveEnemies = waves[i].spawns.map(sp => spawn(sp));
    run.boss = waves[i].boss ? run.waveEnemies.find(e => e.type === waves[i].boss) : null;
    run.nextReinforce = waves[i].reinforce ? game.time + waves[i].reinforce.every : 0;
    run.reinforceCount = 0;
    banner("Wave " + (i + 1) + " of " + waves.length, waves[i].name, 2);
    updateTracker();
  }
  const area = {
    x: 32,
    y: 20,
    r: 999
  };
  function spawn(sp) {
    const e = game.spawnEnemy(sp, area);
    e.aggro = true;
    game.enemies.push(e);
    return e;
  }
  function reinforce() {
    const w = waves[run.wave], r = w.reinforce;
    if (!r || !run.boss || run.boss.dead || game.time < run.nextReinforce) return;
    const at = r.at[run.reinforceCount++ % r.at.length];
    const e = spawn({
      type: r.type,
      x: at.x,
      y: at.y
    });
    run.waveEnemies.push(e);
    game.floater(e, "Answers the call", "#c9a8ff", {
      small: true
    });
    game.addLog(`A ${e.name} answers the call.`, "#c9a8ff");
    banner(e.name, "Reinforcements", 1.6);
    run.nextReinforce = game.time + r.every;
  }
  function updateBossBar() {
    const bb = $("#bossBar"), b = run.boss, on = !!(b && run.state === "wave");
    bb.hidden = !on;
    if (!on) return;
    const k = Math.max(0, b.hp / game.maxHp(b));
    $("#bossFill").style.width = k * 100 + "%";
    $("#bossName").textContent = b.name + (b.veiled ? " · Shadow Veil" : "");
    $("#bossPct").textContent = Math.ceil(k * 100) + "%";
    bb.classList.toggle("veiled", !!b.veiled);
  }
  function updateTracker() {
    const i = Math.max(0, run.wave), w = waves[run.state === "countdown" ? 0 : i];
    $("#wtPips").innerHTML = waves.map((_, k) => `<i class="${k < run.wave || k === run.wave && run.state !== "wave" && run.state !== "countdown" ? "done" : k === run.wave || run.state === "countdown" && k === 0 ? "now" : ""}"></i>`).join("");
    $("#wtName").textContent = run.state === "pause" ? "Wave cleared" : w.name;
    $("#wtHint").textContent = run.state === "pause" ? `Wave ${run.wave + 2} in ${Math.ceil(run.nextAt - game.time)} sec.` : w.hint;
  }
  function banner(kicker, title, secs) {
    $("#bKicker").textContent = kicker;
    $("#bTitle").textContent = title;
    const b = $("#banner");
    b.hidden = true;
    void b.offsetWidth;
    b.hidden = false;
    run.bannerUntil = game.time + secs;
  }
  function finish(win) {
    run.state = win ? "victory" : "defeat";
    run.endAt = game.time;
    const time = run.endAt - run.startAt, s = SPECS.find(x => x.id === run.spec);
    const result = {
      win: win,
      spec: run.spec,
      bloods: run.bloods.slice(),
      wave: run.wave + 1,
      waves: waves.length,
      time: Math.round(time),
      dps: Math.round(game.dps()),
      damage: Math.round(game.meter.total)
    };
    TL.lastRun = result;
    try {
      if (window.parent !== window) window.parent.postMessage({
        type: "tl-stage-result",
        result: result
      }, "*");
    } catch (e) {}
    resultTimer = setTimeout(() => {
      $("#resTitle").textContent = win ? "Victory" : "Defeat";
      $("#resTitle").className = win ? "win" : "";
      $("#resLine").textContent = win ? "Congratulations, the Hollow is now clear of demonic influence!" : `You fell on wave ${run.wave + 1}: ${waves[run.wave].name}.`;
      const names = run.bloods.map(id => game.abilityById[id].name).join(" + ");
      $("#resStats").innerHTML = `<dt>Specialization</dt><dd>${s.name}</dd><dt>Demon Blood</dt><dd>${names}</dd>` + `<dt>Wave reached</dt><dd>${result.wave} of ${result.waves}</dd><dt>Time</dt><dd>${clock(time)}</dd>` + `<dt>DPS</dt><dd>${fmt(result.dps)}</dd><dt>Total damage</dt><dd>${fmt(result.damage)}</dd>`;
      $("#resAgain").textContent = win ? "Play again" : "Try again";
      show("#resultOverlay");
      $("#resAgain").focus();
    }, win ? 900 : 1400);
  }
  game.on("death", () => {
    if (run.state === "wave" || run.state === "pause" || run.state === "countdown") finish(false);
  });
  const app = $("#app");
  function tick() {
    const dtp = run.lastT == null ? 0 : Math.max(0, game.time - run.lastT);
    run.lastT = game.time;
    if (run.state === "pause" && !game.player.dead) {
      const p = game.player, k = PAUSE_RECOVERY / PAUSE * dtp;
      p.hp = Math.min(game.maxHp(p), p.hp + game.maxHp(p) * k);
      p.mana = Math.min(game.maxMana(p), p.mana + game.maxMana(p) * k);
    }
    if (run.state === "countdown" && game.time >= run.nextAt) startWave(0); else if (run.state === "wave" && run.boss && run.boss.dead) {
      for (const e of game.enemies) if (!e.dead) {
        e.dead = true;
        e.cast = null;
      }
      banner("Burningwoods Hollow", "Victory", 3);
      finish(true);
    } else if (run.state === "wave" && !run.boss && run.waveEnemies.every(e => e.dead)) {
      if (run.wave === waves.length - 1) {
        banner("Burningwoods Hollow", "Victory", 3);
        finish(true);
      } else {
        run.state = "pause";
        run.nextAt = game.time + PAUSE;
        banner("Wave " + (run.wave + 1) + " cleared", "Next wave in " + PAUSE + " sec", 2.2);
      }
    } else if (run.state === "pause" && game.time >= run.nextAt) startWave(run.wave + 1);
    if (run.state === "wave") reinforce();
    updatePotions();
    updateBossBar();
    if (run.state !== "menu") {
      if (run.state === "wave" || run.state === "pause" || run.state === "countdown") updateTracker();
      $("#stageTimer").textContent = clock((run.endAt || game.time) - run.startAt);
      if (run.bannerUntil && game.time >= run.bannerUntil) {
        $("#banner").hidden = true;
        run.bannerUntil = 0;
      }
    }
  }
  const held = new Set;
  const MOVE = {
    KeyW: [ 0, -1 ],
    ArrowUp: [ 0, -1 ],
    KeyS: [ 0, 1 ],
    ArrowDown: [ 0, 1 ],
    KeyA: [ -1, 0 ],
    ArrowLeft: [ -1, 0 ],
    KeyD: [ 1, 0 ],
    ArrowRight: [ 1, 0 ]
  };
  const playing = () => run.state === "countdown" || run.state === "wave" || run.state === "pause";
  const canMove = () => playing() || run.state === "prep";
  function syncInput() {
    let x = 0, y = 0;
    for (const k of held) if (MOVE[k]) {
      x += MOVE[k][0];
      y += MOVE[k][1];
    }
    game.player.input = {
      x: x,
      y: y
    };
  }
  window.addEventListener("keydown", e => {
    if (paused && !$("#restartConfirm").hidden) {
      if (e.code === "Escape") askRestart(false);
      return;
    }
    if (paused) {
      if ((e.code === "Enter" || e.code === "Space") && !e.repeat) {
        e.preventDefault();
        if (wantFull && !fsEl() && !fsBtn.hidden) enterFullscreen(true);
        resume();
      }
      return;
    }
    if (e.code === "Escape") {
      escape();
      return;
    }
    if (!canMove() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (run.state === "prep") {
      if (e.code === "Enter" && !e.repeat) {
        e.preventDefault();
        begin();
        return;
      }
    }
    if (e.code === "Tab") {
      e.preventDefault();
      if (!e.repeat) game.tabTarget();
      return;
    }
    if (MOVE[e.code]) {
      e.preventDefault();
      held.add(e.code);
      syncInput();
      return;
    }
    const m = /^(Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      if (!e.repeat) {
        const ab = game.abilities[(+m[2] + 9) % 10];
        if (ab) game.useAbility(ab.id);
      }
      return;
    }
    for (const [id, P] of Object.entries(POTIONS)) if (e.code === P.code) {
      e.preventDefault();
      if (!e.repeat) drinkPotion(id);
      return;
    }
    const extra = {
      Minus: 10,
      NumpadSubtract: 10,
      Equal: 11,
      NumpadAdd: 11
    }[e.code];
    if (extra != null) {
      e.preventDefault();
      if (!e.repeat) {
        const ab = game.abilities[extra];
        if (ab) game.useAbility(ab.id);
      }
      return;
    }
    if (e.code === "Space") e.preventDefault();
  });
  window.addEventListener("keyup", e => {
    if (MOVE[e.code]) {
      held.delete(e.code);
      syncInput();
    }
  });
  window.addEventListener("blur", () => {
    held.clear();
    syncInput();
    if (embedded) pause("blur");
  });
  canvas.addEventListener("mousedown", ev => {
    if (!canMove()) return;
    const r = canvas.getBoundingClientRect(), w = renderer.toWorld(ev.clientX - r.left, ev.clientY - r.top);
    let best = null, bd = 1e9;
    for (const en of game.alive()) {
      const d = Math.hypot(en.x - w.x, en.y - w.y);
      if (d < en.radius + 1 && d < bd) {
        best = en;
        bd = d;
      }
    }
    game.clickTarget(best);
    canvas.focus();
  });
  canvas.addEventListener("contextmenu", e => e.preventDefault());
  const embedded = window.parent !== window || /[?&]embed\b/.test(location.search);
  if (embedded) app.classList.add("embedded");
  let paused = false, onScreen = true;
  function pause(why) {
    if (paused || !playing()) return;
    paused = true;
    held.clear();
    syncInput();
    hideTip();
    $("#pauseOverlay").hidden = false;
  }
  function resume() {
    if (!paused) return;
    paused = false;
    $("#pauseOverlay").hidden = true;
    askRestart(false);
    canvas.focus();
  }
  $("#pauseOverlay").addEventListener("click", e => {
    if (!e.target.closest("#restartBtn, #restartConfirm")) resume();
  });
  function askRestart(on) {
    $("#restartConfirm").hidden = !on;
    $("#pauseActions").hidden = on;
    if (on) $("#restartCancel").focus();
  }
  $("#restartBtn").addEventListener("click", () => askRestart(true));
  $("#restartCancel").addEventListener("click", () => askRestart(false));
  $("#restartYes").addEventListener("click", () => {
    if (!fsBtn.hidden && !fsEl()) {
      wantFull = true;
      enterFullscreen(true);
    }
    clearTimeout(resultTimer);
    paused = false;
    $("#pauseOverlay").hidden = true;
    askRestart(false);
    run.state = "menu";
    game.setTarget(null);
    hideHud();
    $("#prepBar").hidden = true;
    show("#specOverlay");
  });
  function releasePage() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try {
      window.parent.focus();
      window.parent.postMessage({
        type: "tl-stage-release"
      }, "*");
    } catch (e) {}
  }
  function escape() {
    if (canMove() && game.target) {
      game.setTarget(null);
      return;
    }
    if (playing()) pause("esc");
    if (embedded) releasePage();
  }
  if ("IntersectionObserver" in window) new IntersectionObserver(([en]) => {
    onScreen = en.intersectionRatio > 0;
    if (en.intersectionRatio < .5) pause("away");
  }, {
    threshold: [ 0, .5 ]
  }).observe(app);
  const fsBtn = $("#fullscreenBtn"), root = document.documentElement;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  fsBtn.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  let wantFull = false;
  function enterFullscreen(quiet) {
    const req = root.requestFullscreen || root.webkitRequestFullscreen, pr = req && req.call(root);
    if (pr && pr.catch) pr.catch(() => {
      if (!quiet) game.emit("error", "Fullscreen is not available");
    });
  }
  fsBtn.addEventListener("click", () => {
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else {
      wantFull = true;
      enterFullscreen();
    }
    if (canMove()) canvas.focus();
  });
  $("#playBtn").addEventListener("click", () => {
    if (!fsBtn.hidden) {
      wantFull = true;
      enterFullscreen(true);
    }
    show("#specOverlay");
  });
  for (const ev of [ "fullscreenchange", "webkitfullscreenchange" ]) document.addEventListener(ev, () => {
    const full = !!fsEl();
    app.classList.toggle("is-fullscreen", full);
    if (!full && wantFull) pause("fullscreen");
  });
  $("#pauseOverlay").addEventListener("click", () => {
    if (wantFull && !fsEl() && !fsBtn.hidden) enterFullscreen(true);
  });
  const pauseBtn = $("#pauseBtn");
  pauseBtn.addEventListener("click", () => pause("button"));
  TL.stage = {
    run: run,
    tick: tick,
    startRun: startRun,
    begin: begin,
    pickSpec: pickSpec,
    pause: pause,
    resume: resume,
    isPaused: () => paused,
    PASSIVES: PASSIVES,
    TEACHES: TEACHES
  };
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1e3);
    last = now;
    if (run.state !== "menu" && !document.hidden && !paused) {
      game.update(dt);
      tick();
    }
    pauseBtn.hidden = !playing();
    if (app.dataset.state !== run.state) app.dataset.state = run.state;
    if (onScreen) {
      renderer.draw(paused ? 0 : dt);
      hud.update(dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.TL);