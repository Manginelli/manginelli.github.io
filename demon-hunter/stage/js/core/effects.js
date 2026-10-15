(function(TL) {
  const {rand: rand, dist: dist} = TL.util;
  TL.effects.strike = (g, ab, ef, t, target) => {
    const w = g.tune.weapons;
    let lastRoll = null;
    ef.hits.forEach((h, i) => {
      if (target.dead) return;
      const o = {
        name: ab.name,
        school: h.school || ab.school
      };
      if (h.weapon === "main") {
        o.amount = g.weaponRoll("main");
      } else {
        o.min = t.min;
        o.max = t.max;
      }
      if (h.linked) {
        if (![ "hit", "crit" ].includes(lastRoll)) return;
        o.roll = lastRoll;
      }
      const res = g.playerHit(target, o);
      lastRoll = res ? res.roll : "miss";
    });
    g.fx({
      kind: "slash",
      x: target.x,
      y: target.y,
      a: g.player.facing,
      color: TL.SCHOOL_COLORS[g.schoolOverride(g.player) || ab.school],
      life: .22,
      max: .22,
      big: true
    });
  };
  TL.effects.weaponStrikes = (g, ab, ef, t, target) => {
    const w = g.tune.weapons;
    ef.hands.forEach((hand, i) => {
      const hit = g2 => {
        if (target.dead) {
          const ghost = {
            roll: "hit",
            amount: 0,
            ghost: true
          };
          g2.strikeLanded(ab, ghost);
          if (ab.tag === "strike" && ab.tranceHit) g2.countAsSwing(hand, ghost);
          g2.fx({
            kind: "slash",
            x: target.x,
            y: target.y,
            a: g2.player.facing + (i ? -.7 : .7),
            color: TL.SCHOOL_COLORS[g2.schoolOverride(g2.player) || t.school || ab.school],
            life: .22,
            max: .22,
            big: true
          });
          return;
        }
        const amount = g2.weaponRoll(hand) * t.weaponPercent + TL.util.rand(t.min, t.max);
        const res = g2.playerHit(target, {
          amount: amount,
          school: t.school || ab.school,
          ability: ab.id,
          melee: true,
          weapon: true,
          hand: hand,
          name: `${ab.name} (${hand === "main" ? "main hand" : "off hand"})`
        });
        g2.strikeLanded(ab, res);
        if (ab.tag === "strike") g2.strikeWeaponHit(target, hand, res, ab);
        g2.fx({
          kind: "slash",
          x: target.x,
          y: target.y,
          a: g2.player.facing + (i ? -.7 : .7),
          color: TL.SCHOOL_COLORS[g2.schoolOverride(g2.player) || t.school || ab.school],
          life: .22,
          max: .22,
          big: true
        });
      };
      if (i === 0) hit(g); else g.schedule(t.delay * i, hit);
    });
  };
  TL.effects.dash = (g, ab, ef, t) => {
    const p = g.player;
    const dir = p.moving ? p.lastDir : {
      x: Math.cos(p.facing),
      y: Math.sin(p.facing)
    };
    const to = {
      x: p.x + dir.x * t.distance,
      y: p.y + dir.y * t.distance
    };
    const hit = new Set, damaged = [];
    p.motion = {
      kind: "dash",
      from: {
        x: p.x,
        y: p.y
      },
      to: to,
      t: 0,
      dur: .2,
      onEnd(g) {
        g.engageFrom(damaged);
      },
      onStep(g) {
        for (const e of g.alive()) {
          if (hit.has(e.id)) continue;
          if (dist(g.player, e) <= t.width + e.radius) {
            hit.add(e.id);
            const amount = (t.weaponPercent != null ? (g.weaponRoll("main") + g.weaponRoll("off")) * t.weaponPercent : 0) + (t.max ? TL.util.rand(t.min, t.max) : 0);
            const res = g.playerHit(e, {
              amount: amount,
              school: ab.school,
              ability: ab.id,
              melee: true,
              weapon: true,
              noMiss: true,
              noParry: true,
              noDodge: true,
              name: ab.name
            });
            if (res && res.amount > 0) damaged.push(e);
            g.weaponImbues(e, res, true);
            if (t.countsAsSwing) g.countAsSwing("main", res);
          }
        }
      }
    };
  };
  TL.effects.leapBehind = (g, ab, ef, t, target) => {
    const p = g.player;
    const dx = target.x - p.x, dy = target.y - p.y, len = Math.hypot(dx, dy) || 1;
    const off = target.radius + p.radius + .8;
    const to = {
      x: target.x + dx / len * off,
      y: target.y + dy / len * off
    };
    p.motion = {
      kind: "leap",
      from: {
        x: p.x,
        y: p.y
      },
      to: to,
      t: 0,
      dur: .28,
      hop: .45,
      spin: true,
      onEnd(g) {
        if (!target.dead) g.playerHit(target, {
          min: t.min,
          max: t.max,
          school: ab.school,
          name: ab.name,
          ability: ab.id
        });
        g.fx({
          kind: "ring",
          x: g.player.x,
          y: g.player.y,
          r: .9,
          color: "rgba(201,162,255,0.7)",
          life: .18,
          max: .18
        });
        if (g.specStates && g.specStates.martial && g.specStates.martial.diveMult > 1) {
          g.fx({
            kind: "ring",
            x: target.x,
            y: target.y,
            r: 2.2,
            color: "#e8e2ff",
            life: .4,
            max: .4
          });
          g.emit("shake", .3);
        }
      }
    };
  };
  TL.effects.hunt = (g, ab, ef, t, target) => {
    const p = g.player;
    const dx = target.x - p.x, dy = target.y - p.y, len = Math.hypot(dx, dy) || 1;
    const off = target.radius + p.radius + .3;
    const to = {
      x: target.x - dx / len * off,
      y: target.y - dy / len * off
    };
    const travel = Math.max(0, len - off);
    p.motion = {
      kind: "leap",
      from: {
        x: p.x,
        y: p.y
      },
      to: to,
      t: 0,
      dur: Math.min(.6, Math.max(.2, travel / 45)),
      hop: .7,
      onEnd(g) {
        if (target.dead) return;
        g.stun(target, t.stun);
        g.emit("shake", .2);
        const off = g.tune.weapons.offHand && !g.tune.weapons.offHand.none;
        for (let i = 0; i < t.hits; i++) {
          const hand = off && i % 2 === 1 ? "off" : "main";
          g.schedule(i * t.interval, g2 => {
            if (target.dead) return;
            g2.swing(hand, target, ab.name);
            g2.fx({
              kind: "slash",
              x: target.x,
              y: target.y,
              a: g2.player.facing + (hand === "main" ? .8 : -.8),
              color: "#c9a2ff",
              life: .2,
              max: .2,
              big: true
            });
          });
        }
      }
    };
  };
  TL.effects.interrupt = (g, ab, ef, t, target) => {
    const c = target.cast;
    if (!c) {
      g.floater(target, "No spell to interrupt", "#b8b8b8", {
        small: true
      });
      g.addLog(`${ab.name} found no spell to interrupt.`, "#8a8f89");
      return;
    }
    if (c.uninterruptible) {
      g.floater(target, "Immune", "#c9c9c9", {
        small: true
      });
      g.addLog(`${ab.name}: ${c.name} cannot be interrupted.`, "#8a8f89");
      return;
    }
    const roll = g.rollTable(target, false, "spell");
    if (roll === "resist") {
      g.floater(target, "Resist", "#c9c9c9", {
        small: true
      });
      g.addLog(`${ab.name} fails: ${target.name} resists. ${c.name} continues.`, "#8a8f89");
      return;
    }
    target.cast = null;
    target.schoolLocks[c.school] = g.time + t.schoolLock;
    const burn = Math.min(target.mana, c.cost);
    target.mana -= burn;
    g.floater(target, "Interrupted", "#8fd8ff", {
      big: true,
      life: 1.4
    });
    g.addLog(`${ab.name} interrupts ${c.name} and burns ${Math.round(burn)} mana.`, "#8fd8ff");
    g.playerHit(target, {
      amount: burn * t.damageRatio,
      school: "arcane",
      name: ab.name,
      roll: roll,
      kind: "spell"
    });
    g.fx({
      kind: "ring",
      x: target.x,
      y: target.y,
      r: 1.8,
      color: "#8fd8ff",
      life: .35,
      max: .35
    });
  };
  TL.effects.specCast = (g, ab, ef, t, target) => {
    const sp = ef.spec && (g.cls.specs || []).find(s => s.id === ef.spec) || g.spec;
    if (sp && sp.cast) sp.cast(g, g.specStates[sp.id], ab, t, target);
  };
  TL.effects.castTime = (g, ab, ef, t, target) => {
    const ct = ab.noHaste ? t.castTime : t.castTime / g.castHasteMult();
    g.player.channel = {
      ab: ab,
      kind: "cast",
      isCast: true,
      remaining: ct,
      total: ct,
      tickTimer: Infinity,
      spin: 0,
      cost: t.cost,
      target: target,
      onDone: g2 => {
        const p = g2.player;
        if (ab.target !== "self") {
          if (!target || target.dead) {
            g2.emit("error", "Your target is dead");
            return;
          }
          if (ab.range === "melee" && !g2.inMelee(p, target)) {
            g2.emit("error", "Out of range");
            p.mana = Math.min(g2.maxMana(p), p.mana + (t.cost || 0));
            return;
          }
          if (ab.range === "ranged" && g2.edgeDistance(p, target) > t.maxRange) {
            g2.emit("error", "Out of range");
            p.mana = Math.min(g2.maxMana(p), p.mana + (t.cost || 0));
            return;
          }
        }
        ef.onDone(g2, target);
      }
    };
  };
  TL.effects.aura = (g, ab, ef, t) => {
    const def = g.cls.auras[ef.aura];
    g.addAura(g.player, ef.aura, def && def.tuneKey ? g.abilityTune(def.tuneKey) : t);
    if (ef.engage) {
      const a = g.player.auras.find(x => x.id === ef.aura);
      if (a) a.engage = true;
    }
    g.addLog(`You gain ${g.cls.auras[ef.aura].name}.`, "#e0c7ff");
    if (ef.aura === "metamorphosis") g.emit("shake", .35);
  };
  TL.effects.channel = (g, ab, ef, t) => {
    g.player.channel = {
      ab: ab,
      kind: ef.tick,
      remaining: t.duration,
      total: t.duration,
      tickTimer: ef.firstTickDelay ? t.tick : 0,
      spin: 0,
      ownRegen: !!ef.ownRegen,
      onDone: ef.onDone ? TL.channelDone[ef.onDone] : null
    };
  };
  TL.channelTicks = {
    aoe(g, c, t) {
      for (const e of g.alive()) if (dist(g.player, e) <= t.radius + e.radius) g.playerHit(e, {
        min: t.min,
        max: t.max,
        school: c.ab.school,
        name: c.ab.name
      });
    },
    restoreMana(g, c, t) {
      const p = g.player, gain = Math.round(g.maxMana(p) * t.manaPerTick);
      p.mana = Math.min(g.maxMana(p), p.mana + gain);
      g.floater(p, "+" + gain + " mana", "#7fb2ff", {
        small: true
      });
    }
  };
  TL.channelTicks.regen = (g, c, t) => {
    const p = g.player, gain = Math.round(g.regenPerSecond() * (1 + t.regenIncrease) * t.tick);
    c.ticks = (c.ticks || 0) + 1;
    p.mana = Math.min(g.maxMana(p), p.mana + gain);
    g.floater(p, "+" + gain + " mana", "#7fb2ff", {
      small: true
    });
  };
  TL.channelDone = {
    regenFinish(g, c, t) {
      const want = Math.round((t.duration - (c.lost || 0)) / t.tick);
      while ((c.ticks || 0) < want) TL.channelTicks.regen(g, c, t);
    }
  };
  TL.effects.weaponStrike = (g, ab, ef, t, target) => {
    const amount = g.weaponRoll("main") * (t.weaponPercent != null ? t.weaponPercent : 1) + (t.weaponDps ? t.weaponDps * g.weaponDps("main") : 0) + (t.apPercent ? t.apPercent * g.attackPower() : 0) + (t.max ? TL.util.rand(t.min, t.max) : 0);
    const res = g.playerHit(target, {
      amount: amount,
      school: ab.school,
      ability: ab.id,
      melee: true,
      weapon: true,
      name: ab.name,
      spCoef: t.spCoef,
      roll: t.alwaysCrit ? "crit" : undefined
    });
    g.strikeLanded(ab, res);
    if (ab.tag === "strike") g.strikeWeaponHit(target, "main", res, ab);
    if (res && res.amount > 0 && t.manaBurn && target.def.hasMana && target.mana > 0 && !target.dead) {
      const burn = Math.min(target.mana, Math.round(res.amount * t.manaBurn));
      target.mana -= burn;
      g.playerHit(target, {
        amount: burn * (t.manaBurnDamage != null ? t.manaBurnDamage : 1),
        roll: "hit",
        school: ab.school,
        name: ab.name + " (mana burn)",
        attack: false
      });
      g.floater(target, "-" + burn + " mana", "#7fb2ff", {
        small: true
      });
    }
    g.fx({
      kind: "slash",
      x: target.x,
      y: target.y,
      a: g.player.facing,
      color: TL.SCHOOL_COLORS[g.schoolOverride(g.player) || ab.school],
      life: .22,
      max: .22,
      big: true
    });
  };
  TL.effects.hybridStrike = (g, ab, ef, t, target) => {
    const res = g.playerHit(target, {
      amount: g.weaponRoll("main") * t.weaponPercent,
      school: "physical",
      ability: ab.id,
      melee: true,
      weapon: true,
      name: ab.name
    });
    if (res && [ "hit", "crit" ].includes(res.roll) && !target.dead) {
      g.playerHit(target, {
        min: t.fireMin,
        max: t.fireMax,
        roll: res.roll,
        school: ef.school || "fire",
        ability: ab.id,
        part: "magic",
        name: ab.name + " (fire)",
        spCoef: t.fireSpCoef
      });
    }
    g.strikeLanded(ab, res);
    if (ab.tag === "strike") g.strikeWeaponHit(target, "main", res, ab);
    g.fx({
      kind: "slash",
      x: target.x,
      y: target.y,
      a: g.player.facing,
      color: TL.SCHOOL_COLORS[g.schoolOverride(g.player) || ab.school],
      life: .22,
      max: .22,
      big: true
    });
  };
})(window.TL);