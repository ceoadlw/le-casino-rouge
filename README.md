# The Rouge Casino

*Eight roguelite casino games. One house. The house is you.*

**▶ Play live: https://ceoadlw.github.io/le-casino-rouge/**

A suite of eight single-file, score-attack roguelites built on a shared Balatro-style
engine — **chips × mult**, 8 antes × 3 blinds, boss effects, a shop of charms /
consumables, and an interest economy. What differs per game is exactly two things: the
**atomic object** you collect, thin, and enhance, and the **scoring-event ladder**.

## Play

Open **`index.html`** — the lobby — and pick a table. Each game runs entirely in the
browser (no build, no server); your run is saved to `localStorage` per game, so you can
resume any of the eight independently.

| # | Game | Atomic object | Identity |
|---|------|---------------|----------|
| 1 | Roulette Rouge | Pocket | Bet the wheel you built |
| 2 | Blackjack Noir | Card | Beat a house that cheats first |
| 3 | Slot Syndicate | Symbol | Rig your own machine |
| 4 | Craps Crimson | Die face | Carve the dice, chase the point |
| 5 | Bingo Baroque | Cell | One card, daubed to the bone |
| 6 | Darts & Deals | Dart | A quiver of crooked arrows |
| 7 | Domino Dynasty | Bone | Build the line, hit the fives |
| 8 | Mahjong Méchant | Tile | A wicked wall, a perfect hand |

## Architecture

- **`rouge-spine.js`** — shared runtime: seeded PRNG (mulberry32), versioned
  `localStorage` save layer, speed setting, screen router, run lifecycle.
- **`rouge-engine.js`** — shared UI / economy: shop, charm bar, omen bar, ladder
  readout, blind select, and the cash-out / blind-progression flow. Each game calls
  `RougeUI.configure({ … })` with its registries and a few hooks.
- **`<game>.html`** — each game is its own page: the table layer (board / reels / wall),
  scoring, and a headless balance simulator (`GAME.simulate(50)`).

Every game is seeded and deterministic; each ships a 50-run headless balance harness used
to tune it (see `balance-report.md`). Design spec: `spec.md`. Build log: `journal.txt`.

## Built with [Claude Code](https://claude.com/claude-code)
