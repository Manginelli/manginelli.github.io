(function() {
  const links = [ ...document.querySelectorAll('.page-nav a[href^="#"]') ];
  const targets = links.map(a => document.getElementById(a.getAttribute("href").slice(1)));
  let current = null, queued = false;
  const spy = () => {
    queued = false;
    const line = window.innerHeight / 3;
    let idx = -1;
    targets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top <= line) idx = i;
    });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) idx = targets.length - 1;
    const next = idx >= 0 ? links[idx] : null;
    if (next === current) return;
    if (current) {
      current.classList.remove("is-current");
      current.removeAttribute("aria-current");
    }
    if (next) {
      next.classList.add("is-current");
      next.setAttribute("aria-current", "location");
    }
    current = next;
  };
  const queue = () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(spy);
    }
  };
  window.addEventListener("scroll", queue, {
    passive: true
  });
  window.addEventListener("resize", queue);
  spy();
  const SPEC = {
    martial: "Martial Arts",
    spellbreaker: "Spellbreaker",
    felblood: "Felblood"
  };
  window.addEventListener("message", e => {
    const frame = document.querySelector(".stage-frame iframe");
    if (frame && e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type !== "tl-stage-result" || !d.result) return;
    const r = d.result, form = document.getElementById("feedbackForm");
    if (!form) return;
    document.getElementById("runData").value = JSON.stringify(r);
    form.querySelectorAll('input[name="spec"]').forEach(c => {
      if (c.value === SPEC[r.spec]) c.checked = true;
    });
    form.elements.won.value = r.win ? "Yes" : "No";
    const note = document.getElementById("runNote");
    note.textContent = `Your last run is attached: ${SPEC[r.spec] || r.spec}, wave ${r.wave} of ${r.waves}, ${r.win ? "victory" : "defeat"}, ${r.dps} DPS.`;
    note.hidden = false;
  });
  const ENDPOINT = "";
  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (err) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (err) {}
    }
  };
  let cid = store.get("tl-dh-cid");
  if (!cid || !/^[A-Za-z0-9-]{8,64}$/.test(cid)) {
    cid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    store.set("tl-dh-cid", cid);
  }
  const send = body => fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(Object.assign({
      cid: cid
    }, body))
  }).then(r => r.json());
  const say = (el, text, error) => {
    el.textContent = text;
    el.classList.toggle("is-error", !!error);
  };
  const FAIL = {
    busy: "Too many messages right now. Please wait a moment and try again."
  };
  const poll = document.getElementById("poll");
  if (poll && ENDPOINT) {
    const btn = poll.querySelector('button[type="submit"]'), status = document.getElementById("pollStatus");
    const total = document.getElementById("pollTotal");
    const showTotal = n => {
      if (typeof n === "number") total.textContent = n;
    };
    let saved = null;
    try {
      saved = JSON.parse(store.get("tl-dh-vote") || "null");
    } catch (err) {}
    if (saved) {
      poll.querySelectorAll("input").forEach(i => {
        i.checked = i.name === "vote" && i.value === saved.vote || i.name === "spec" && i.value === saved.spec;
      });
      btn.textContent = "Change vote";
    }
    const ready = () => {
      btn.disabled = !poll.elements.vote.value;
    };
    poll.addEventListener("change", ready);
    ready();
    fetch(ENDPOINT + "?action=totals").then(r => r.json()).then(r => showTotal(r.total)).catch(() => {});
    poll.addEventListener("submit", e => {
      e.preventDefault();
      const vote = poll.elements.vote.value, spec = poll.elements.spec.value;
      if (!vote) return;
      btn.disabled = true;
      say(status, "Sending...");
      send({
        type: "vote",
        vote: vote,
        spec: spec
      }).then(r => {
        if (!r.ok) throw new Error(r.error);
        store.set("tl-dh-vote", JSON.stringify({
          vote: vote,
          spec: spec
        }));
        showTotal(r.total);
        btn.textContent = "Change vote";
        say(status, "Thanks! Your vote is in. You can change it anytime.");
      }).catch(err => say(status, FAIL[err.message] || "Your vote could not be sent. Please try again later.", true)).finally(ready);
    });
  }
  const form = document.getElementById("feedbackForm");
  if (form && ENDPOINT) {
    const btn = form.querySelector('button[type="submit"]'), status = document.getElementById("feedbackStatus");
    const filled = () => [ "best", "worst", "ideas" ].some(n => form.elements[n].value.trim());
    const ready = () => {
      btn.disabled = !filled();
    };
    form.addEventListener("input", ready);
    form.addEventListener("change", ready);
    ready();
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!filled()) return;
      let run = null;
      try {
        run = JSON.parse(document.getElementById("runData").value || "null");
      } catch (err) {}
      const el = form.elements;
      btn.disabled = true;
      say(status, "Sending...");
      send({
        type: "feedback",
        website: el.website.value,
        specs: [ ...form.querySelectorAll('input[name="spec"]:checked') ].map(c => c.value),
        won: el.won.value,
        best: el.best.value,
        worst: el.worst.value,
        ideas: el.ideas.value,
        contact: el.contact.value,
        run: run
      }).then(r => {
        if (!r.ok) throw new Error(r.error);
        form.reset();
        document.getElementById("runData").value = "";
        document.getElementById("runNote").hidden = true;
        say(status, "Thanks! Your feedback was sent.");
      }).catch(err => say(status, FAIL[err.message] || "Your feedback could not be sent. Please try again later.", true)).finally(ready);
    });
  }
  document.querySelectorAll('a.cta[href="#play"]').forEach(a => a.addEventListener("click", () => {
    const f = document.querySelector(".stage-frame iframe");
    if (f) setTimeout(() => {
      try {
        f.focus();
      } catch (err) {}
    }, 500);
  }));
})();