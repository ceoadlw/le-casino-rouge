"use strict";
/* ====================================================================
   THE ROUGE CASINO — shared UI / economy engine (rouge-engine.js)

   Extracted 2026-06-16 from the eight per-game copies. The runtime spine
   (rouge-spine.js) already owns PRNG / save layer / speed / router / run
   lifecycle. This file owns the next duplicated-but-coupled layer: the
   shop, the charm bar, the omen bar, the ladder readout, the blind-select
   screen, and the cash-out / blind-progression flow — all game-agnostic
   apart from each game's registries, its play-unit wording, and a few
   hooks. The per-game atomic-object surface (the table, scoring, the omen
   targeting modal, renderRail, ensureRunShape, the simulator) stays in the
   game module.

   Each game calls RougeUI.configure({ ... }) once at parse time (inside its
   module, where its registries and callbacks are in scope), then delegates
   its render and shop calls here. Load AFTER rouge-spine.js and BEFORE the
   game's inline <script>:
     <script src="rouge-spine.js"></script>
     <script src="rouge-engine.js"></script>

   Contract (cfg):
     registries  CHARMS, OMENS, LADDER, TAGS, BOSSES, TIER_NAMES
     counts      CHARM_SLOTS, OMEN_SLOTS, TARGETS, REWARDS, BLIND_NAMES,
                 INTEREST_STEP, INTEREST_CAP, omenShare (default .4)
     helpers     sellValue(id), omenSellValue(id), newCharm(id),
                 bossPool(ante)
     wording     playField (blind field, e.g. "spinsLeft"), playWord
                 ("spins"), ladderLabel ("Ladder")
     callbacks   ensureRunShape(run), renderRail(), startBlind(idx),
                 canUseOmen(o), useOmen(idx), onVictory(), getBlind(),
                 isLocked()  [optional, default false]
     charm hooks read here: onReroll, onBlindBeaten, cashOutItem, interestCap
   ==================================================================== */
const RougeUI = (() => {
  let cfg = null;
  const configure = c => { cfg = c; };
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString("en-US");
  const locked = () => !!(cfg.isLocked && cfg.isLocked());

  /* ---------------- charm bar ---------------- */
  function renderCharms() {
    const run = Rouge.run.current;
    if (!run) return;
    cfg.ensureRunShape(run);
    const { CHARMS, CHARM_SLOTS, sellValue } = cfg;
    ["charm-bar", "shop-charms"].forEach(cid => {
      const el = $(cid); if (!el) return; el.innerHTML = "";
      run.charms.forEach((inst, i) => {
        const ch = CHARMS[inst.id];
        const card = document.createElement("div");
        card.className = `charm-card r-${ch.rarity.toLowerCase()}`;
        card.innerHTML = `<div class="charm-top"><button class="mv mv-l" title="Move left" ${i === 0 ? "disabled" : ""}>&#9664;</button>` +
          `<span class="charm-name">${ch.name}</span><button class="mv mv-r" title="Move right" ${i === run.charms.length - 1 ? "disabled" : ""}>&#9654;</button></div>` +
          `<div class="charm-type">${ch.type} · ${ch.rarity}</div><div class="charm-desc">${ch.desc(inst.state)}</div>` +
          `<button class="sell">Sell $${sellValue(inst.id)}</button>`;
        card.querySelector(".mv-l").addEventListener("click", () => moveCharm(i, -1));
        card.querySelector(".mv-r").addEventListener("click", () => moveCharm(i, 1));
        card.querySelector(".sell").addEventListener("click", () => sellCharm(i));
        el.appendChild(card);
      });
    });
    const count = `CHARMS ${run.charms.length} / ${CHARM_SLOTS}`;
    ["table-charm-count", "shop-charm-count"].forEach(cid => { const el = $(cid); if (el) el.textContent = count; });
  }
  function sellCharm(idx) {
    if (locked()) return;
    const run = Rouge.run.current;
    if (!run || !run.charms[idx]) return;
    run.money += cfg.sellValue(run.charms[idx].id); run.charms.splice(idx, 1);
    Rouge.audio.play("cashout");
    Rouge.run.persist(); renderCharms(); cfg.renderRail();
    if (Rouge.router.current === "shop") renderShop();
  }
  function moveCharm(idx, dir) {
    if (locked()) return;
    const run = Rouge.run.current;
    const j = idx + dir;
    if (!run || j < 0 || j >= run.charms.length) return;
    [run.charms[idx], run.charms[j]] = [run.charms[j], run.charms[idx]];
    Rouge.run.persist(); renderCharms();
  }

  /* ---------------- omen bar ---------------- */
  function renderOmens() {
    const run = Rouge.run.current;
    if (!run) return;
    cfg.ensureRunShape(run);
    const { OMENS, OMEN_SLOTS, TIER_NAMES, omenSellValue, canUseOmen } = cfg;
    ["omen-bar", "shop-omens"].forEach(cid => {
      const el = $(cid); if (!el) return; el.innerHTML = "";
      run.consumables.forEach((id, i) => {
        const o = OMENS[id];
        const card = document.createElement("div");
        card.className = `charm-card t-${TIER_NAMES[o.tier].toLowerCase()}`;
        card.innerHTML = `<span class="charm-name">${o.name}</span><div class="charm-type">${TIER_NAMES[o.tier]} Omen</div>` +
          `<div class="charm-desc">${o.desc}</div><div style="display:flex;gap:.3rem;justify-content:center">` +
          `<button class="primary use" ${canUseOmen(o) ? "" : "disabled"} ${o.use === "target" || o.tableOnly ? 'title="Use at the table"' : ""}>Use</button>` +
          `<button class="sell">Sell $${omenSellValue(id)}</button></div>`;
        card.querySelector(".use").addEventListener("click", () => cfg.useOmen(i));
        card.querySelector(".sell").addEventListener("click", () => sellOmen(i));
        el.appendChild(card);
      });
    });
    const count = `OMENS ${run.consumables.length} / ${OMEN_SLOTS}`;
    ["table-omen-count", "shop-omen-count"].forEach(cid => { const el = $(cid); if (el) el.textContent = count; });
  }
  function sellOmen(idx) {
    if (locked()) return;
    const run = Rouge.run.current;
    if (!run?.consumables[idx]) return;
    run.money += cfg.omenSellValue(run.consumables[idx]); run.consumables.splice(idx, 1);
    Rouge.audio.play("cashout");
    Rouge.run.persist(); renderOmens(); cfg.renderRail();
    if (Rouge.router.current === "shop") renderShop();
  }

  /* ---------------- shop ---------------- */
  function pickStock(count, run = Rouge.run.current) {
    const { CHARMS, OMENS } = cfg, share = cfg.omenShare ?? 0.4;
    const exclude = new Set(run.charms.map(c => "c:" + c.id));
    const out = [];
    for (let n = 0; n < count; n++) {
      const kind = Rouge.rng.random() < share ? "omen" : "charm";
      const pool = (kind === "omen" ? Object.keys(OMENS) : Object.keys(CHARMS)).filter(id => !exclude.has((kind === "omen" ? "o:" : "c:") + id));
      if (pool.length === 0) { out.push(null); continue; }
      const id = Rouge.rng.pick(pool); exclude.add((kind === "omen" ? "o:" : "c:") + id); out.push({ kind, id });
    }
    return out;
  }
  function rollShop() { Rouge.run.current.shop = { stock: pickStock(2), rerolls: 0 }; Rouge.run.persist(); }
  function rerollShop() {
    const run = Rouge.run.current;
    if (!run?.shop) return;
    const cost = 5 + run.shop.rerolls;
    if (run.money < cost) return;
    run.money -= cost; run.shop.rerolls++; run.shop.stock = pickStock(2);
    run.charms.forEach(inst => cfg.CHARMS[inst.id].onReroll?.(inst)); // e.g. Dust Collector
    Rouge.run.persist(); renderShop(); renderCharms();
  }
  function buyStock(slotIdx) {
    const run = Rouge.run.current;
    const entry = run?.shop?.stock[slotIdx];
    if (!entry) return;
    const { CHARMS, OMENS, CHARM_SLOTS, OMEN_SLOTS, newCharm } = cfg;
    if (entry.kind === "charm") { if (run.money < CHARMS[entry.id].cost || run.charms.length >= CHARM_SLOTS) return; run.money -= CHARMS[entry.id].cost; run.charms.push(newCharm(entry.id)); }
    else { if (run.money < OMENS[entry.id].cost || run.consumables.length >= OMEN_SLOTS) return; run.money -= OMENS[entry.id].cost; run.consumables.push(entry.id); }
    run.shop.stock[slotIdx] = null;
    Rouge.audio.play("chip");
    Rouge.run.persist(); renderShop(); renderCharms(); renderOmens();
  }
  function renderShop() {
    const run = Rouge.run.current;
    if (!run?.shop) return;
    const { CHARMS, OMENS, CHARM_SLOTS, OMEN_SLOTS, TIER_NAMES } = cfg;
    $("shop-money").textContent = `Money $${run.money}`;
    const wrap = $("shop-stock"); wrap.innerHTML = "";
    run.shop.stock.forEach((entry, idx) => {
      const card = document.createElement("div");
      if (!entry) { card.className = "charm-card sold"; card.textContent = "SOLD"; }
      else if (entry.kind === "charm") {
        const ch = CHARMS[entry.id];
        card.className = `charm-card stock r-${ch.rarity.toLowerCase()}`;
        const full = run.charms.length >= CHARM_SLOTS, afford = run.money >= ch.cost;
        card.innerHTML = `<div class="charm-name">${ch.name}</div><div class="charm-type">${ch.type} · ${ch.rarity}</div>` +
          `<div class="charm-desc">${ch.desc(ch.newState ? ch.newState() : {})}</div>` +
          `<button class="primary buy" ${full || !afford ? "disabled" : ""}>${full ? "Charms Full" : `Buy $${ch.cost}`}</button>`;
        card.querySelector(".buy").addEventListener("click", () => buyStock(idx));
      } else {
        const o = OMENS[entry.id];
        card.className = `charm-card stock t-${TIER_NAMES[o.tier].toLowerCase()}`;
        const full = run.consumables.length >= OMEN_SLOTS, afford = run.money >= o.cost;
        card.innerHTML = `<div class="charm-name">${o.name}</div><div class="charm-type">${TIER_NAMES[o.tier]} Omen</div>` +
          `<div class="charm-desc">${o.desc}</div>` +
          `<button class="primary buy" ${full || !afford ? "disabled" : ""}>${full ? "Omens Full" : `Buy $${o.cost}`}</button>`;
        card.querySelector(".buy").addEventListener("click", () => buyStock(idx));
      }
      wrap.appendChild(card);
    });
    const cost = 5 + run.shop.rerolls;
    const btn = $("btn-reroll"); btn.textContent = `Reroll $${cost}`; btn.disabled = run.money < cost;
  }

  /* ---------------- ladder readout (rail) ---------------- */
  function renderLadder() {
    const lv = Rouge.run.current?.ladderLevels ?? {};
    const { LADDER } = cfg, label = cfg.ladderLabel || "Ladder";
    $("rail-ladder").innerHTML =
      `<div class="label" style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--smoke)">${label}</div>` +
      "<table>" + LADDER.map(e => { const l = lv[e.key] ?? 0;
        return `<tr><td>${e.name}${l ? ` <span style="color:var(--champagne)">lv${l + 1}</span>` : ""}</td>` +
               `<td><span class="c">${e.chips + l * e.up.c}</span>×<span class="m">${e.mult + l * e.up.m}</span></td></tr>`; }).join("") + "</table>";
  }

  /* ---------------- blind select ---------------- */
  function renderBlindSelect() {
    const run = Rouge.run.current;
    if (!run) return;
    cfg.ensureRunShape(run);
    const { TAGS, BOSSES, TARGETS, REWARDS, BLIND_NAMES, bossPool } = cfg;
    if (!run.tags) { const ids = Object.keys(TAGS); run.tags = { small: Rouge.rng.pick(ids), big: Rouge.rng.pick(ids) }; Rouge.run.persist(); }
    if (!run.boss) { run.boss = Rouge.rng.pick(bossPool(run.ante)); Rouge.run.persist(); }
    $("ante-heading").textContent = `Ante ${run.ante} / 8`;
    $("blind-money").textContent = `Money $${run.money}`;
    $("blind-tags").textContent = run.activeTags.length ? "Tags in play: " + run.activeTags.map(t => TAGS[t].name).join(" · ") : "";
    const row = $("blind-cards"); row.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      const card = document.createElement("div");
      const st = run.blindStatus[i];
      card.className = "blind-card panel" + (i === 2 ? " boss" : "") + (st === "beaten" ? " beaten" : "");
      const status = st === "beaten" ? "BEATEN ✦" : st === "skipped" ? "SKIPPED ◇" : i > run.blind ? "LOCKED" : "";
      card.innerHTML = `<h3>${BLIND_NAMES[i]}</h3>` +
        (i === 2 ? `<div class="boss-desc"><b>${BOSSES[run.boss].name}</b> — ${BOSSES[run.boss].desc}</div>` : "") +
        `<p>Score ${fmt(TARGETS[run.ante - 1][i])}</p><p class="reward">Reward $${REWARDS[i]}</p>` +
        (status ? `<div class="status">${status}</div>` : "");
      if (i === run.blind) {
        const play = document.createElement("button"); play.className = "primary"; play.textContent = "Play"; play.addEventListener("click", () => cfg.startBlind(i)); card.appendChild(play);
        if (i < 2) { const tagId = run.tags[i === 0 ? "small" : "big"]; const skip = document.createElement("button"); skip.className = "skip-btn"; skip.textContent = `Skip — ${TAGS[tagId].name}`; skip.title = TAGS[tagId].desc; skip.addEventListener("click", () => skipBlind(i)); card.appendChild(skip); }
        else { const noSkip = document.createElement("button"); noSkip.className = "skip-btn"; noSkip.disabled = true; noSkip.textContent = "Cannot be skipped"; card.appendChild(noSkip); }
      }
      row.appendChild(card);
    }
  }
  function skipBlind(idx) {
    const run = Rouge.run.current;
    if (!run || idx !== run.blind || idx === 2) return;
    const tagId = run.tags?.[idx === 0 ? "small" : "big"];
    if (tagId) run.activeTags.push(tagId);
    run.blindStatus[idx] = "skipped"; run.stats.skips++; run.blind = idx + 1;
    Rouge.audio.play("chip");
    Rouge.run.persist();
    renderBlindSelect();
  }

  /* ---------------- cash out / blind progression ---------------- */
  function buildCashout(run, blindState) {
    const { BLIND_NAMES, REWARDS, INTEREST_STEP, INTEREST_CAP, CHARMS, playField, playWord } = cfg;
    const consumed = [...blindState.usedTags];
    const items = [];
    items.push([`${BLIND_NAMES[blindState.idx]} reward${blindState.rewardMult > 1 ? " ×2 (High-Roller Tag)" : ""}`,
                REWARDS[blindState.idx] * blindState.rewardMult]);
    const left = cfg.unusedPlays ? cfg.unusedPlays(blindState) : blindState[playField];
    if (left > 0) items.push([`Unused ${playWord} (${left})`, left]);
    if (blindState.idx === 2) {
      const comps = run.activeTags.filter(t => t === "comp").length;
      if (comps > 0) { items.push([`Comp Tag${comps > 1 ? ` ×${comps}` : ""}`, 8 * comps]); for (let i = 0; i < comps; i++) consumed.push("comp"); }
    }
    run.charms.forEach(inst => { const item = CHARMS[inst.id].cashOutItem?.(inst, run, blindState); if (item) items.push(item); });
    const cap = run.charms.reduce((c, inst) => Math.max(c, CHARMS[inst.id].interestCap ?? 0), INTEREST_CAP);
    const interest = Math.min(cap, Math.floor(run.money / INTEREST_STEP));
    if (interest > 0) items.push([`Interest ($1 per $${INTEREST_STEP}, cap $${cap})`, interest]);
    return { items, total: items.reduce((s, [, v]) => s + v, 0), consumed };
  }
  function winBlind(blindState) {
    const blind = blindState || cfg.getBlind();
    blind.won = true;
    blind.cashout = buildCashout(Rouge.run.current, blind);
    Rouge.audio.play("win");
    const banner = $("win-banner");
    banner.innerHTML = `<div class="wb-title">BLIND BEATEN</div>` +
      `<ul class="wb-items">${blind.cashout.items.map(([l, v]) => `<li><span>${l}</span><b>$${v}</b></li>`).join("")}</ul>` +
      `<button class="primary" id="btn-collect">Collect $${blind.cashout.total} &rarr; Shop</button>`;
    banner.querySelector("#btn-collect").addEventListener("click", cashOut);
    banner.classList.add("show");
  }
  function cashOut() {
    const blind = cfg.getBlind();
    if (!blind || !blind.won) return;
    const run = Rouge.run.current;
    run.money += blind.cashout.total;
    blind.cashout.consumed.forEach(id => { const i = run.activeTags.indexOf(id); if (i >= 0) run.activeTags.splice(i, 1); });
    run.stats.beaten++;
    run.blindStatus[blind.idx] = "beaten";
    run.charms.forEach(inst => cfg.CHARMS[inst.id].onBlindBeaten?.(inst));
    Rouge.audio.play("cashout");
    if (blind.idx === 2) {
      if (run.ante === 8) { cfg.onVictory(); return; }
      run.ante++; run.blind = 0; run.blindStatus = [null, null, null]; run.tags = null; run.boss = null;
    } else run.blind = blind.idx + 1;
    Rouge.run.persist();
    Rouge.router.go("shop");
  }

  return { configure, renderCharms, sellCharm, moveCharm, renderOmens, sellOmen,
           pickStock, rollShop, rerollShop, buyStock, renderShop, renderLadder,
           renderBlindSelect, skipBlind, buildCashout, winBlind, cashOut };
})();
window.RougeUI = RougeUI;
