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
  document.querySelectorAll('a.cta[href="#play"]').forEach(a => a.addEventListener("click", () => {
    const f = document.querySelector(".stage-frame iframe");
    if (f) setTimeout(() => {
      try {
        f.focus();
      } catch (err) {}
    }, 500);
  }));
})();