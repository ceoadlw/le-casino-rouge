"use strict";
/* ====================================================================
   THE ROUGE CASINO — shared runtime spine (rouge-spine.js)

   Extracted 2026-06-13 from the four per-game copies, which were
   byte-identical here apart from the save key, the initial run-state
   shape, and the audio sound list. Each game now loads this file and
   calls Rouge.run.configure({ key, createState }) at parse time to plug
   in its save key and run-state factory; everything else (PRNG, save
   layer, speed, router, run lifecycle, boot scaffolding) lives here once.

   Load BEFORE the game's inline <script>:
     <script src="rouge-spine.js"></script>
   ==================================================================== */
const Rouge = (() => {

  /* ---------------- RNG — seeded mulberry32 ---------------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  const RNG = {
    seedStr: null,
    state: 0,
    init(seed) {
      this.seedStr = String(seed ?? Date.now());
      this.state = xmur3(this.seedStr)() | 0; // signed 32-bit, same as every later step — state round-trips exactly
      return this;
    },
    random() {
      if (this.seedStr === null) this.init();
      this.state = (this.state + 0x6D2B79F5) | 0;
      let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { return Math.floor(this.random() * (max - min + 1)) + min; },
    pick(arr) { return arr[this.int(0, arr.length - 1)]; },
    chance(p) { return this.random() < p; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    getState() { return { seed: this.seedStr, state: this.state }; },
    setState(s) { this.seedStr = s.seed; this.state = s.state | 0; },
    guard() {
      const orig = Math.random.bind(Math);
      let warned = 0;
      Math.random = () => {
        if (warned++ < 3) console.warn("[Rouge] Math.random() called — route ALL randomness through Rouge.rng");
        return orig();
      };
    }
  };

  /* ---------------- Store — versioned localStorage layer ---------------- */
  const Store = {
    NS: "rouge-casino",
    VERSION: 1,
    _key(k) { return `${this.NS}:${k}`; },
    save(key, value) {
      try {
        localStorage.setItem(this._key(key), JSON.stringify({ v: this.VERSION, data: value }));
        return true;
      } catch (e) {
        console.warn("[Rouge] Store.save failed:", e);
        return false;
      }
    },
    load(key, fallback = null) {
      try {
        const raw = localStorage.getItem(this._key(key));
        if (raw === null) return fallback;
        const parsed = JSON.parse(raw);
        if (parsed.v !== this.VERSION) {
          const migrated = this._migrate(key, parsed);
          return migrated === null ? fallback : migrated;
        }
        return parsed.data;
      } catch (e) {
        console.warn("[Rouge] Store.load failed:", e);
        return fallback;
      }
    },
    remove(key) { try { localStorage.removeItem(this._key(key)); } catch (e) { /* private mode */ } },
    clearAll() {
      const mine = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this.NS + ":")) mine.push(k);
      }
      mine.forEach(k => localStorage.removeItem(k));
    },
    _migrate(key, old) { return null; }
  };

  /* ---------------- AudioMgr — silent stub ---------------- */
  const AudioMgr = {
    debug: false,
    muted: false,
    volume: 1,
    _sounds: Object.create(null),
    register(name, src = null) { this._sounds[name] = { src }; },
    play(name) {
      if (!(name in this._sounds)) { console.warn(`[Rouge] AudioMgr: unknown sound "${name}"`); return; }
      if (this.muted) return;
      if (this.debug) console.log(`[Rouge] audio: ${name}`);
    },
    setVolume(v) { this.volume = Math.min(1, Math.max(0, v)); },
    setMuted(m) { this.muted = !!m; }
  };

  /* ---------------- Settings ---------------- */
  const Settings = {
    defaults: { speed: 1, muted: false },
    current: {},
    load() { this.current = Object.assign({}, this.defaults, Store.load("settings", {})); },
    set(key, value) { this.current[key] = value; Store.save("settings", this.current); }
  };

  /* ---------------- Speed — 1× / 2× / 4× ---------------- */
  const Speed = {
    STEPS: [1, 2, 4],
    get() { return Settings.current.speed; },
    set(s) {
      if (!this.STEPS.includes(s)) s = 1;
      Settings.set("speed", s);
      document.documentElement.style.setProperty("--speed", s);
      const btn = document.getElementById("btn-speed");
      if (btn) btn.innerHTML = `${s}&times;`;
    },
    cycle() {
      const next = this.STEPS[(this.STEPS.indexOf(this.get()) + 1) % this.STEPS.length];
      this.set(next);
      return next;
    },
    ms(base) { return base / this.get(); }
  };

  /* ---------------- Router ---------------- */
  const Router = {
    SCREENS: ["menu", "blind-select", "table", "shop"],
    current: null,
    go(name) {
      if (!this.SCREENS.includes(name)) { console.warn(`[Rouge] Router: unknown screen "${name}"`); return; }
      if (name === this.current) return;
      document.querySelectorAll(".screen.active").forEach(el => el.classList.remove("active"));
      document.getElementById(`screen-${name}`).classList.add("active");
      document.body.dataset.screen = name;
      this.current = name;
      window.dispatchEvent(new CustomEvent("rouge:screen", { detail: { screen: name } }));
    }
  };

  /* ---------------- Run — game-agnostic lifecycle ----------------
     Each game calls Run.configure({ key, createState }) at parse time:
       key         — localStorage save key, unique per game so all the
                     games' runs coexist (settings stay shared)
       createState — (seedStr) => the game's initial run object (ante 1,
                     $4, empty charms/consumables, its own stats shape and
                     atomic-object field)
     Mid-blind table state is NOT persisted: resuming from 'table' lands on
     blind-select and the interrupted blind restarts. */
  const Run = {
    KEY: null,
    createState: null,
    current: null,
    configure(cfg) { this.KEY = cfg.key; this.createState = cfg.createState; },
    exists() { return Store.load(this.KEY) !== null; },
    start(seedText) {
      const seed = seedText && String(seedText).trim() !== "" ? String(seedText).trim() : undefined;
      RNG.init(seed);
      this.current = this.createState(RNG.seedStr);
      this.persist();
      updateSeedChip();
      Router.go("blind-select");
    },
    resume() {
      const saved = Store.load(this.KEY);
      if (!saved) return false;
      RNG.setState({ seed: saved.seed, state: saved.rngState });
      if (saved.screen === "table") saved.screen = "blind-select"; // interrupted blind restarts
      this.current = saved;
      updateSeedChip();
      if (Router.current === saved.screen) window.dispatchEvent(new CustomEvent("rouge:screen", { detail: { screen: saved.screen } }));
      else Router.go(saved.screen);
      return true;
    },
    persist() {
      if (!this.current) return;
      this.current.rngState = RNG.state;
      this.current.screen = Router.current === "menu" || Router.current === null
        ? this.current.screen
        : Router.current;
      Store.save(this.KEY, this.current);
    },
    abandon() { this.current = null; Store.remove(this.KEY); updateSeedChip(); }
  };

  function updateSeedChip() {
    const chip = document.getElementById("seed-chip");
    if (chip) chip.textContent = Run.current ? `SEED · ${Run.current.seed}` : "NO RUN";
  }

  function boot() {
    RNG.guard();
    Settings.load();
    Speed.set(Settings.current.speed);
    AudioMgr.setMuted(Settings.current.muted);
    syncMuteButton();

    // union of every game's sound names — the stub is silent, so registering
    // them all just keeps AudioMgr.play() from warning on a sibling's name
    ["click", "chip", "spin", "land", "deal", "flip", "dice", "point", "draw", "daub", "win", "boss", "cashout"]
      .forEach(n => AudioMgr.register(n));

    document.addEventListener("click", e => {
      const btn = e.target.closest("button");
      if (!btn || btn.disabled) return;
      AudioMgr.play("click");
      if (btn.dataset.go) Router.go(btn.dataset.go);
    });

    document.getElementById("btn-new-run").addEventListener("click", () => {
      Run.start(document.getElementById("seed-input").value);
    });
    document.getElementById("btn-continue").addEventListener("click", () => Run.resume());
    document.getElementById("btn-speed").addEventListener("click", () => Speed.cycle());
    document.getElementById("btn-mute").addEventListener("click", () => {
      AudioMgr.setMuted(!AudioMgr.muted);
      Settings.set("muted", AudioMgr.muted);
      syncMuteButton();
    });

    window.addEventListener("rouge:screen", () => Run.persist());

    document.getElementById("btn-continue").disabled = !Run.exists();
    updateSeedChip();
    Router.go("menu");
  }

  function syncMuteButton() {
    const btn = document.getElementById("btn-mute");
    if (btn) btn.textContent = AudioMgr.muted ? "SOUND OFF" : "SOUND ON";
  }

  document.addEventListener("DOMContentLoaded", boot);

  return { rng: RNG, store: Store, audio: AudioMgr, settings: Settings, speed: Speed, router: Router, run: Run };
})();
window.Rouge = Rouge;
