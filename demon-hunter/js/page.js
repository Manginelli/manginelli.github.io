(function() {
  const links = [ ...document.querySelectorAll('.page-nav a[href^="#"]') ];
  const targets = links.map(a => document.getElementById(a.getAttribute("href").slice(1)));
  let current = null, queued = false;
  const spy = () => {
    queued = false;
    const line = window.innerHeight / 3;
    let idx = -1;
    targets.forEach((t, i) => {
      if (t && t.offsetParent !== null && t.getBoundingClientRect().top <= line) idx = i;
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
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbz1YrPKSUE5BigJiyEMTpjlz6ErRigVTsavYnHp0QjulcbakFY3CsqjCJx3Ka2mYm4I/exec";
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
  const sendWithRetry = body => send(body).then(r => {
    if (r.ok || r.error !== "busy") return r;
    return new Promise(res => setTimeout(res, 4e3)).then(() => send(body));
  }).then(r => {
    if (!r.ok) throw new Error(r.error);
    return r;
  });
  const poll = document.getElementById("poll");
  if (poll && ENDPOINT) {
    const btn = poll.querySelector('button[type="submit"]'), status = document.getElementById("pollStatus");
    const total = document.getElementById("pollTotal");
    let known = Number(store.get("tl-dh-total"));
    if (!Number.isFinite(known) || store.get("tl-dh-total") === null) known = null;
    const showTotal = n => {
      if (typeof n !== "number") return;
      known = n;
      total.textContent = n;
      store.set("tl-dh-total", String(n));
    };
    if (known !== null) total.textContent = known;
    let saved = null, sending = false;
    try {
      saved = JSON.parse(store.get("tl-dh-vote") || "null");
    } catch (err) {}
    const pick = v => poll.querySelectorAll("input").forEach(i => {
      i.checked = !!v && (i.name === "vote" && i.value === v.vote || i.name === "spec" && i.value === v.spec);
    });
    if (saved) {
      pick(saved);
      btn.textContent = "Change vote";
    }
    const ready = () => {
      btn.disabled = sending || !poll.elements.vote.value;
    };
    poll.addEventListener("change", ready);
    ready();
    fetch(ENDPOINT + "?action=totals").then(r => r.json()).then(r => showTotal(r.total)).catch(() => {});
    poll.addEventListener("submit", e => {
      e.preventDefault();
      const vote = poll.elements.vote.value, spec = poll.elements.spec.value;
      if (!vote || sending) return;
      const before = saved, first = !saved;
      saved = {
        vote: vote,
        spec: spec
      };
      store.set("tl-dh-vote", JSON.stringify(saved));
      if (first && known !== null) showTotal(known + 1);
      btn.textContent = "Change vote";
      say(status, "Thanks! Your vote is in. You can change it anytime.");
      sending = true;
      ready();
      sendWithRetry({
        type: "vote",
        vote: vote,
        spec: spec
      }).then(r => showTotal(r.total)).catch(err => {
        saved = before;
        store.set("tl-dh-vote", before ? JSON.stringify(before) : "");
        if (first && known !== null) showTotal(known - 1);
        pick(before);
        btn.textContent = before ? "Change vote" : "Vote";
        say(status, FAIL[err.message] || "Your vote could not be sent. Please try again later.", true);
      }).finally(() => {
        sending = false;
        ready();
      });
    });
  }
  const form = document.getElementById("feedbackForm");
  if (form && ENDPOINT) {
    const btn = form.querySelector('button[type="submit"]'), status = document.getElementById("feedbackStatus");
    const runData = document.getElementById("runData"), runNote = document.getElementById("runNote");
    const filled = () => [ "best", "worst", "ideas" ].some(n => form.elements[n].value.trim());
    let sending = false;
    const ready = () => {
      btn.disabled = sending || !filled();
    };
    form.addEventListener("input", ready);
    form.addEventListener("change", ready);
    ready();
    form.addEventListener("submit", e => {
      e.preventDefault();
      if (!filled() || sending) return;
      let run = null;
      try {
        run = JSON.parse(runData.value || "null");
      } catch (err) {}
      const el = form.elements, checked = [ ...form.querySelectorAll('input[name="spec"]:checked') ];
      const body = {
        type: "feedback",
        website: el.website.value,
        specs: checked.map(c => c.value),
        won: el.won.value,
        best: el.best.value,
        worst: el.worst.value,
        ideas: el.ideas.value,
        contact: el.contact.value,
        run: run
      };
      const keep = {
        won: el.won.value,
        best: el.best.value,
        worst: el.worst.value,
        ideas: el.ideas.value,
        contact: el.contact.value,
        run: runData.value,
        note: runNote.textContent,
        noteHidden: runNote.hidden
      };
      form.reset();
      runData.value = "";
      runNote.hidden = true;
      say(status, "Thanks! Your feedback was sent.");
      sending = true;
      ready();
      sendWithRetry(body).catch(err => {
        [ "won", "best", "worst", "ideas", "contact" ].forEach(n => {
          el[n].value = keep[n];
        });
        checked.forEach(c => {
          c.checked = true;
        });
        runData.value = keep.run;
        runNote.textContent = keep.note;
        runNote.hidden = keep.noteHidden;
        say(status, FAIL[err.message] || "Your feedback could not be sent. Please try again later.", true);
      }).finally(() => {
        sending = false;
        ready();
      });
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