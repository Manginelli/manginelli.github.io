(function(TL) {
  TL.KEY_LABELS = [ "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Q", "E" ];
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const on = (sel, evt, fn) => {
    const x = $(sel);
    if (x) x.addEventListener(evt, fn);
  };
  class HUD {
    constructor(game) {
      this.g = game;
      this.buildBar();
      this.buildBloodBar();
      this.buildPassives();
      this.errorTimer = 0;
      game.on("error", msg => this.error(msg));
      game.on("experiment", () => this.syncExperiment());
      game.on("abilities", () => this.buildBar());
      game.on("spec", () => this.buildPassives());
      game.on("passives", () => this.buildPassives());
      this.pp = $("#passivesPanel");
      on("#openPassives", "click", () => {
        this.pp.hidden = !this.pp.hidden;
        if (!this.pp.hidden) this.renderPassivePanel();
      });
      on("#passivesClose", "click", () => {
        this.pp.hidden = true;
      });
      this.bp = $("#barPanel");
      on("#openBar", "click", () => {
        this.bp.hidden = !this.bp.hidden;
        if (!this.bp.hidden) this.renderBarPanel();
      });
      on("#barClose", "click", () => {
        this.bp.hidden = true;
      });
      on("#barReset", "click", () => {
        this.g.setBarLayout(null);
      });
      const refreshBar = () => {
        if (this.bp && !this.bp.hidden) this.renderBarPanel();
      };
      game.on("abilities", refreshBar);
      game.on("spec", refreshBar);
      game.on("passives", () => {
        if (this.pp && !this.pp.hidden) this.renderPassivePanel();
      });
      on("#meterReset", "click", () => game.resetMeter());
      this.graph = $("#meterGraph");
      this.gctx = this.graph ? this.graph.getContext("2d") : null;
      this.logEl = $("#log");
      this.lastLogLen = -1;
      const bz = $("#buffs");
      if (bz) {
        const pick = e => {
          const d = e.target.closest && e.target.closest(".buff");
          this.buffTip = d ? d.dataset.k : null;
          if (!d) this.hideTip();
        };
        bz.addEventListener("mouseover", pick);
        bz.addEventListener("focusin", pick);
        bz.addEventListener("mouseleave", () => {
          this.buffTip = null;
          this.hideTip();
        });
        bz.addEventListener("focusout", () => {
          this.buffTip = null;
          this.hideTip();
        });
      }
    }
    static buffTime(r) {
      if (r == null || r === Infinity) return "";
      return r >= 60 ? Math.ceil(r / 60) + "m" : Math.max(0, Math.ceil(r)) + "s";
    }
    showBuffTip() {
      const k = this.buffTip, b = k && this.buffData && this.buffData[k], tip = $("#tip");
      if (!b) {
        if (k) {
          this.buffTip = null;
          this.hideTip();
        }
        return;
      }
      const anchor = $("#buffs").querySelector(`[data-k="${k}"]`);
      if (!anchor) return;
      const left = b.remaining == null || b.remaining === Infinity ? "" : b.remaining >= 60 ? `${Math.ceil(b.remaining / 60)} min remaining` : `${Math.max(0, Math.ceil(b.remaining))} sec remaining`;
      const html = `<div class="tt-name">${b.name}${b.stacks ? ` <span class="tt-stk">${b.stacks}</span>` : ""}</div>${b.desc ? `<div class="tt-text">${b.desc}</div>` : ""}${left ? `<div class="tt-row"><span>${left}</span><span></span></div>` : ""}`;
      if (tip._buff !== html) {
        tip.innerHTML = html;
        tip._buff = html;
      }
      tip.hidden = false;
      const r = anchor.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left)) + "px";
      tip.style.top = r.bottom + 8 + "px";
    }
    buildBar() {
      const bar = $("#actionBar");
      bar.innerHTML = "";
      this.slots = this.g.abilities.map((ab, i) => {
        const b = el("button", "slot");
        b.type = "button";
        const key = TL.KEY_LABELS[i] || "";
        b.setAttribute("aria-label", `${ab.name}${key ? ", key " + key : ""}`);
        b.innerHTML = `<img src="${ab.icon}" alt=""><span class="cd"></span><span class="cdt"></span><span class="key">${key}</span>`;
        b.addEventListener("click", () => {
          this.g.useAbility(ab.id);
        });
        b.addEventListener("mouseenter", () => this.showTip(ab, b));
        b.addEventListener("mouseleave", () => this.hideTip());
        b.addEventListener("focus", () => this.showTip(ab, b));
        b.addEventListener("blur", () => this.hideTip());
        bar.appendChild(b);
        return {
          ab: ab,
          b: b,
          cd: $(".cd", b),
          cdt: $(".cdt", b)
        };
      });
    }
    buildBloodBar() {
      const bar = $("#bloodBar");
      if (!bar) return;
      bar.innerHTML = "";
      this.bloodSlots = this.g.cls.abilities.filter(a => a.bar === "blood").map((ab, i) => {
        const b = el("button", "slot blood");
        b.type = "button";
        b.setAttribute("aria-label", `${ab.name}, Shift ${i + 1}`);
        b.innerHTML = `<img src="${ab.icon}" alt=""><span class="cd"></span><span class="cdt"></span><span class="key">⇧${i + 1}</span><span class="lvl">${ab.level}</span>`;
        b.addEventListener("click", () => {
          this.g.useAbility(ab.id);
        });
        b.addEventListener("mouseenter", () => this.showTip(ab, b));
        b.addEventListener("mouseleave", () => this.hideTip());
        b.addEventListener("focus", () => this.showTip(ab, b));
        b.addEventListener("blur", () => this.hideTip());
        bar.appendChild(b);
        return {
          ab: ab,
          b: b,
          cd: $(".cd", b),
          cdt: $(".cdt", b)
        };
      });
    }
    showTip(ab, anchor) {
      const t = this.g.abilityTune(ab.id), tip = $("#tip");
      const cost = t.cost > 0 ? `${t.cost} Mana` : "";
      const cdLen = this.g.cooldownFor(ab.id), cd = cdLen > 0 ? cdLen >= 60 && cdLen % 60 === 0 ? `${cdLen / 60} min cooldown` : `${cdLen} sec cooldown` : "";
      tip.innerHTML = `\n        <div class="tt-name">${ab.name}</div>\n        <div class="tt-row"><span>${cost}</span><span>${ab.meta[1] || ""}</span></div>\n        <div class="tt-row"><span>${ab.meta[0]}</span><span>${cd}</span></div>\n        <div class="tt-text">${ab.stageText ? ab.stageText(this.g) : ab.text}</div>\n        <div class="tt-proto">${ab.proto(t, this.g)}</div>`;
      tip.hidden = false;
      const r = anchor.getBoundingClientRect(), tr = tip.getBoundingClientRect();
      let left = r.left + r.width / 2 - tr.width / 2;
      left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, left));
      tip.style.left = left + "px";
      tip.style.top = r.top - tr.height - 10 + "px";
    }
    hideTip() {
      const t = $("#tip");
      t.hidden = true;
      t._buff = null;
    }
    buildPassives() {
      const bar = $("#passiveBar");
      if (!bar) return;
      bar.innerHTML = "";
      const ex = this.g.experiment;
      this.passiveSlot = null;
      if (ex && ex.icon && (!ex.enabled || ex.enabled(this.g))) {
        const b = el("button", "slot passive");
        b.type = "button";
        b.setAttribute("aria-label", ex.name + ", passive");
        b.innerHTML = `<img src="${ex.icon}" alt=""><span class="stk"></span>`;
        const show = () => {
          const tip = $("#tip");
          tip.innerHTML = `<div class="tt-name">${ex.name}</div><div class="tt-row"><span>Passive</span><span></span></div><div class="tt-text">${ex.blurb(this.g.tune.experiments)}</div>`;
          tip.hidden = false;
          const r = b.getBoundingClientRect(), tr = tip.getBoundingClientRect();
          tip.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + "px";
          tip.style.top = r.top - tr.height - 10 + "px";
        };
        b.addEventListener("mouseenter", show);
        b.addEventListener("focus", show);
        b.addEventListener("mouseleave", () => this.hideTip());
        b.addEventListener("blur", () => this.hideTip());
        bar.appendChild(b);
        this.passiveSlot = b;
      }
      const sp = this.g.spec;
      if (sp && sp.icon) {
        const s2 = el("button", "slot passive");
        s2.type = "button";
        s2.setAttribute("aria-label", sp.passiveName + ", " + sp.name + " passive");
        s2.innerHTML = `<img src="${sp.icon}" alt="">`;
        const show2 = () => {
          const tip = $("#tip");
          tip.innerHTML = `<div class="tt-name">${sp.passiveName}</div><div class="tt-row"><span>Passive</span><span>${sp.name} test</span></div><div class="tt-text">${sp.blurb(this.g.tune)}</div>`;
          tip.hidden = false;
          const r = s2.getBoundingClientRect(), tr = tip.getBoundingClientRect();
          tip.style.left = Math.max(8, Math.min(window.innerWidth - tr.width - 8, r.left + r.width / 2 - tr.width / 2)) + "px";
          tip.style.top = r.top - tr.height - 10 + "px";
        };
        s2.addEventListener("mouseenter", show2);
        s2.addEventListener("focus", show2);
        s2.addEventListener("mouseleave", () => this.hideTip());
        s2.addEventListener("blur", () => this.hideTip());
        bar.appendChild(s2);
      }
    }
    renderPassivePanel() {
      const g = this.g, body = $("#passivesBody"), names = {
        martial: "Martial Arts",
        spellbreaker: "Spellbreaker",
        felblood: "Felblood"
      };
      body.innerHTML = "";
      const d = g.stats();
      if (d) {
        const P = g.tune.player, pct = v => (v * 100).toFixed(1) + "%";
        body.appendChild(el("div", "pstats", `<b>Level ${P.level}</b> · Str ${d.str} · Agi ${d.agi} · Sta ${d.sta} · Int ${d.int} · Spi ${d.spi}<br>` + `Attack power ${Math.round(g.attackPower())} · Spell power ${Math.round(g.spellPower())} · Crit ${pct(d.crit)} · Dodge ${pct(d.dodge)} · Parry ${pct(d.parry)}<br>` + `Health ${g.maxHp(g.player)} · Mana ${g.maxMana(g.player)} · Mana regen ${(d.regenPerSecond * 2).toFixed(1)} per 2 sec · Armor ${d.armor}`));
      }
      for (const spec of [ "martial", "spellbreaker", "felblood" ]) {
        const grp = el("div", "pgrp");
        grp.appendChild(el("div", "pgrp-h", names[spec] + (g.specId === spec ? " <small>(selected spec)</small>" : "")));
        for (const p of g.cls.passives.filter(x => x.spec === spec)) {
          const row = el("label", "prow");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = g.passiveOn(p.id);
          cb.addEventListener("change", () => g.setPassive(p.id, cb.checked));
          row.appendChild(cb);
          row.appendChild(el("span", "", p.name + (p.needs ? ` <small>needs ${p.needs}</small>` : "") + (p.note ? ` <small>(${p.note})</small>` : "")));
          grp.appendChild(row);
        }
        body.appendChild(grp);
      }
    }
    renderBarPanel() {
      const g = this.g, body = $("#barBody"), {list: list, hidden: hidden} = g.barOrder();
      $("#barSpecLabel").textContent = (g.spec ? g.spec.name : "Base") + " bar";
      body.innerHTML = "";
      const ids = list.map(a => a.id);
      const save = (order, hid) => g.setBarLayout({
        order: order,
        hidden: hid
      });
      let slot = 0;
      list.forEach((ab, i) => {
        const on = !hidden.includes(ab.id), key = on ? TL.KEY_LABELS[slot++] || "" : "";
        const li = el("li", "brow" + (on ? "" : " off"));
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = on;
        cb.id = "bar-" + ab.id;
        cb.setAttribute("aria-label", `${ab.name} on the bar`);
        cb.addEventListener("change", () => save(ids, cb.checked ? hidden.filter(x => x !== ab.id) : hidden.concat(ab.id)));
        const img = document.createElement("img");
        img.src = ab.icon;
        img.alt = "";
        const name = el("label", "", `${ab.name}`);
        name.htmlFor = cb.id;
        const k = el("span", "bkey", key);
        const moves = el("span", "");
        const mk = (txt, dir, label) => {
          const b = el("button", "", txt);
          b.type = "button";
          b.setAttribute("aria-label", `Move ${ab.name} ${label}`);
          const j = i + dir;
          b.disabled = j < 0 || j >= ids.length;
          b.addEventListener("click", () => {
            const o = ids.slice();
            [o[i], o[j]] = [ o[j], o[i] ];
            save(o, hidden);
          });
          return b;
        };
        moves.appendChild(mk("▲", -1, "up"));
        moves.appendChild(mk("▼", 1, "down"));
        li.append(cb, img, name, k, moves);
        body.appendChild(li);
      });
    }
    syncExperiment() {
      if (!this.passiveSlot) return;
    }
    error(msg) {
      const e = $("#errorMsg");
      e.textContent = msg;
      e.classList.add("show");
      this.errorTimer = 1.4;
    }
    setBar(fill, txt, cur, max) {
      fill.style.width = (max > 0 ? Math.max(0, Math.min(1, cur / max)) * 100 : 0) + "%";
      txt.textContent = `${fmt(cur)} / ${fmt(max)}`;
    }
    update(dt) {
      const g = this.g, p = g.player, T = g.tune;
      this.setBar($("#pHp .fill"), $("#pHp .txt"), p.hp, g.maxHp(p));
      this.setBar($("#pMana .fill"), $("#pMana .txt"), p.mana, g.maxMana(p));
      const rule = T.mana.fiveSecondRule, inRule = p.sinceSpend < rule;
      if ($("#rule")) {
        $("#ruleFill").style.width = (inRule ? p.sinceSpend / rule * 100 : 100) + "%";
        $("#ruleTxt").textContent = inRule ? `Regen paused ${(rule - p.sinceSpend).toFixed(1)} sec` : `Regenerating +${Math.round(g.regenPerSecond() * T.mana.tickInterval)} mana every ${T.mana.tickInterval} sec`;
        $("#rule").classList.toggle("active", !inRule);
      }
      const buffs = $("#buffs"), list = [];
      for (const a of p.auras) list.push({
        k: "a-" + a.id,
        name: a.def.name || a.name,
        icon: a.icon,
        stacks: a.def.stacks ? a.def.stacks(a) : a.stacks,
        remaining: a.remaining,
        desc: a.def.desc ? a.def.desc(g, a) : ""
      });
      const eb = g.expBuff();
      if (eb) list.push(Object.assign({
        k: "x-" + eb.name.replace(/\W/g, "")
      }, eb));
      for (const sb of g.specBuffs()) list.push(Object.assign({
        k: "s-" + sb.name.replace(/\W/g, "")
      }, sb));
      if (p.autoSwinging) list.push({
        k: "auto",
        name: "Auto Attack",
        glyph: "⚔",
        desc: "You are attacking your target with your weapons."
      });
      this.buffData = Object.fromEntries(list.map(x => [ x.k, x ]));
      let html = "";
      for (const x of list) {
        const pic = x.icon ? `<img src="${x.icon}" alt="">` : `<span class="glyph" style="--c:${x.color || "#d9c9a0"}">${x.glyph || x.name[0]}</span>`;
        html += `<div class="buff" data-k="${x.k}" tabindex="0" aria-label="${x.name}"><div class="bi">${pic}${x.stacks ? `<b class="bs">${x.stacks}</b>` : ""}</div><span class="bt">${HUD.buffTime(x.remaining)}</span></div>`;
      }
      if (buffs._h !== html) {
        buffs.innerHTML = html;
        buffs._h = html;
      }
      if (this.buffTip) this.showBuffTip();
      if (this.passiveSlot) {
        const eb = g.expBuff();
        this.passiveSlot.querySelector(".stk").textContent = eb ? eb.stacks : "";
      }
      const tf = $("#targetFrame"), tg = g.target;
      tf.hidden = !tg;
      if (tg) {
        $("#tName").textContent = tg.name;
        this.setBar($("#tHp .fill"), $("#tHp .txt"), tg.hp, g.maxHp(tg));
        const tm = $("#tMana");
        tm.hidden = !tg.def.hasMana;
        if (tg.def.hasMana) this.setBar($("#tMana .fill"), $("#tMana .txt"), tg.mana, g.maxMana(tg));
        const tc = $("#tCast");
        tc.hidden = !tg.cast;
        if (tg.cast) {
          const k = tg.cast.elapsed / tg.cast.total;
          $("#tCast .fill").style.width = (tg.cast.channel ? 1 - k : k) * 100 + "%";
          $("#tCast .txt").textContent = tg.cast.name;
        }
        tc.classList.toggle("locked", !!(tg.cast && tg.cast.uninterruptible));
        const lock = (tg.schoolLocks.shadow || 0) - g.time;
        $("#tLock").hidden = !(lock > 0);
        if (lock > 0) $("#tLock").textContent = `Shadow locked ${lock.toFixed(1)} sec`;
      }
      const swb = $("#swingBars");
      if (swb) {
        const w = T.weapons, h = g.hasteMult();
        const hand = (sel, timer, wpn, label) => {
          const el = $(sel), has = !!wpn && !wpn.none;
          el.hidden = !has;
          if (!has) return;
          const k = wpn.speed ? 1 - Math.min(1, Math.max(0, timer) / wpn.speed) : 1;
          el.firstElementChild.style.width = k * 100 + "%";
          el.lastElementChild.textContent = `${label} ${timer > 0 ? (timer / h).toFixed(1) : (wpn.speed / h).toFixed(2)}`;
        };
        hand("#swMain", p.mhTimer, w.mainHand, "Main hand");
        hand("#swOff", p.ohTimer, w.offHand, "Off hand");
        swb.classList.toggle("idle", !p.autoSwinging);
        swb.classList.toggle("fire", g.autoSchool() === "fire" || p.auras.some(a => a.id === "burning_blades"));
      }
      const cb = $("#channelBar");
      cb.hidden = !p.channel;
      if (p.channel) {
        const k = Math.max(0, p.channel.remaining / p.channel.total);
        $("#channelBar .fill").style.width = (p.channel.isCast ? 1 - k : k) * 100 + "%";
        $("#channelBar .txt").textContent = p.channel.ab.name;
      }
      for (const s of this.slots) {
        const t = g.abilityTune(s.ab.id);
        const cd = p.cooldowns[s.ab.id] || 0;
        const free = g.offGcd(s.ab);
        const gcdLeft = s.ab.gcd && !free ? p.gcd : 0;
        const left = Math.max(cd, gcdLeft), total = cd >= gcdLeft ? p.cdTotals && p.cdTotals[s.ab.id] || g.cooldownFor(s.ab.id) : p.gcdTotal || T.gcd;
        s.cd.style.setProperty("--p", left > 0 && total > 0 ? left / total * 360 + "deg" : "0deg");
        s.cdt.textContent = cd >= 60 ? Math.ceil(cd / 60) + "m" : cd > 1.5 ? Math.ceil(cd) : cd > 0 ? cd.toFixed(1) : "";
        const chk = g.canUse(s.ab);
        s.b.classList.toggle("oom", p.mana < t.cost && !g.options.infiniteMana || !!chk.req);
        s.b.classList.toggle("range", !!chk.range);
        s.b.classList.toggle("active", p.channel && p.channel.ab.id === s.ab.id || p.auras.some(a => a.id === s.ab.id));
        const glow = g.abilityGlow(s.ab) + (free ? " empowered" : "");
        if (s.glow !== glow) {
          s.b.classList.remove("empowered", "emp-mana", "emp-fire");
          for (const c of glow.split(" ")) if (c) s.b.classList.add(c);
          s.glow = glow;
        }
      }
      for (const s of this.bloodSlots || []) {
        const gcdLeft = p.gcd, total = p.gcdTotal || T.gcd;
        s.cd.style.setProperty("--p", gcdLeft > 0 && total > 0 ? gcdLeft / total * 360 + "deg" : "0deg");
        const on = p.auras.some(a => a.id === s.ab.id), drinking = p.channel && p.channel.ab.id === s.ab.id;
        s.b.classList.toggle("active", on || !!drinking);
        s.b.classList.toggle("oom", !on && !drinking && !!g.canUse(s.ab).req);
      }
      if ($("#dpsNow")) {
        $("#dpsNow").textContent = fmt(g.dps(10));
        $("#dpsFight").textContent = fmt(g.dps());
        $("#dmgTotal").textContent = fmt(g.meter.total);
        {
          const h = g.hasteMult(), w = g.tune.weapons;
          $("#hasteNow").textContent = "+" + Math.round((h - 1) * 100) + "%";
          $("#mhSwing").textContent = (w.mainHand.speed / h).toFixed(2);
          $("#ohSwing").textContent = (w.offHand.speed / h).toFixed(2);
        }
        this.drawGraph();
      }
      if (this.logEl && (g.log.length !== this.lastLogLen || g.log[g.log.length - 1] !== this.lastLogItem)) {
        this.lastLogLen = g.log.length;
        this.lastLogItem = g.log[g.log.length - 1];
        this.logEl.innerHTML = g.log.slice(-9).map(l => `<li style="color:${l.color}">${l.text}</li>`).join("");
      }
      if (this.errorTimer > 0) {
        this.errorTimer -= dt;
        if (this.errorTimer <= 0) $("#errorMsg").classList.remove("show");
      }
      if ($("#deathOverlay")) $("#deathOverlay").hidden = !p.dead;
    }
    drawGraph() {
      const c = this.graph, ctx = this.gctx, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const n = 12, b = this.g.buckets(5, n);
      const max = Math.max(500, ...b);
      ctx.strokeStyle = "rgba(232,196,106,0.12)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, h - 12 - (h - 12) * i / 4 + .5);
        ctx.lineTo(w, h - 12 - (h - 12) * i / 4 + .5);
        ctx.stroke();
      }
      const bw = w / n;
      b.forEach((v, i) => {
        const bh = (h - 12) * v / max;
        ctx.fillStyle = i === n - 1 ? "#c07ae0" : "#9848b3";
        ctx.fillRect(i * bw + 2, h - 12 - bh, bw - 4, bh);
      });
      ctx.fillStyle = "rgba(200,210,200,0.55)";
      ctx.font = '11px "Barlow Condensed", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText("60 sec ago", 2, h - 1);
      ctx.textAlign = "right";
      ctx.fillText("now", w - 2, h - 1);
      ctx.textAlign = "right";
      ctx.fillText(fmt(max), w - 2, 10);
    }
  }
  TL.HUD = HUD;
})(window.TL);