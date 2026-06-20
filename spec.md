# THE ROUGE CASINO — Design Specification

*Eight roguelite casino games. One house. The house is you.*

**Version 0.1 — 2026-06-11**

---

## 1. Pitch

The Rouge Casino is a suite of eight roguelite score-attack games built on a single
shared engine — Balatro's architecture generalized into a module contract. Every game
speaks the same language: **chips × mult**, **8 antes × 3 blinds**, **boss effects**,
**a shop of charms, consumables, vouchers, and packs**, and an **interest economy**.

What differs per game is exactly two things, declared up front in each game's section:

1. **The atomic object** — the single thing the player collects, thins, and enhances
   (the playing card of that game). All object-targeting content (enhancements, seals,
   editions, Omens, Standard packs) operates on this interface.
2. **The scoring-event ladder** — the ranked list of in-game events that set base
   chips × base mult, leveled up by Markers (the planet-card analog).

A run is played in **one** game, start to finish. *Grand Tour* (each ante a different
game) is a stretch mode; charms are game-agnostic by design, so it falls out of the
architecture nearly for free.

The eight games:

| # | Game | Atomic object | One-line identity |
|---|------|---------------|-------------------|
| 1 | Roulette Rouge | Pocket | Bet the wheel you built |
| 2 | Blackjack Noir | Card | Beat a house that cheats first |
| 3 | Slot Syndicate | Symbol | Rig your own machine |
| 4 | Craps Crimson | Die face | Carve the dice, chase the point |
| 5 | Bingo Baroque | Cell | One card, daubed to the bone |
| 6 | Darts & Deals | Dart | A quiver of crooked arrows |
| 7 | Domino Dynasty | Bone | Build the line, hit the fives |
| 8 | Mahjong Méchant | Tile | A wicked wall, a perfect hand |

---

## 2. Shared Architecture (the Spine)

### 2.1 Core loop

```
Blind start → up to N PLAYS (+ discard-analog uses) → target met?
  yes → cash out (reward + interest at shop) → SHOP → next blind
  no  → run over
Small Blind → Big Blind → BOSS BLIND → next ante. Beat Ante 8's boss to win.
```

### 2.2 Scoring

- A **play** is the game's native action (a spin, a deal, a pull, a visit…).
- A play emits one or more **scoring events** from that game's ladder.
- Each event resolves independently:
  `event score = (event base chips + Σ chips of participating objects) × (event base mult, then ± / × modifiers)`
- Events resolve in **ascending rung order**; charm hooks fire per event.
- The play's score is the **sum of its event scores**; the blind accumulates plays.
- Per play, each ladder rung fires at most once **per qualifying instance** as defined
  by the game (e.g., per winning bet, per payline, per meld).

### 2.3 Run structure — 8 antes × 3 blinds

Score targets (base stake):

| Ante | Small | Big | Boss |
|------|-------|-----|------|
| 1 | 300 | 450 | 600 |
| 2 | 800 | 1,200 | 1,600 |
| 3 | 2,000 | 3,000 | 4,000 |
| 4 | 5,000 | 7,500 | 10,000 |
| 5 | 11,000 | 16,500 | 22,000 |
| 6 | 20,000 | 30,000 | 40,000 |
| 7 | 35,000 | 52,500 | 70,000 |
| 8 | 50,000 | 75,000 | 100,000 |

Small and Big Blinds may be **skipped** for a **Tag** (deferred reward: e.g., *Velvet
Tag* — next shop has a free Charm; *Ledger Tag* — gain an instant Marker; *Comp Tag* —
+$8 after the next boss). Boss Blinds cannot be skipped.

### 2.4 Boss effects

Bosses attack the shared abstractions, so one roster serves all eight games. Each game
also contributes **two signature bosses** (defined in its section).

**Universal roster:**

| Boss | Effect |
|------|--------|
| The Velvet Rope | Only events at rung 4 or higher may score |
| The Pit Boss | Your most-leveled scoring event is banned this blind |
| The Manacle | Play size −1 |
| The Eye in the Sky | No scoring event may fire twice this blind |
| The Counterfeiter | Enhanced objects are debuffed (enhancements suppressed) |
| The Rake | Each play costs $1 (floor $0) |
| Madame Noir | Objects arrive concealed; identity revealed only when scored |
| The Blacklist | One random object class is debuffed all blind |
| **The House Always Wins** *(Ante 8 finisher)* | Base chips and base mult of all events are halved |
| **The Final Audit** *(Ante 8 finisher)* | Only your three leftmost charms function |

**Translation table** (proof the abstraction holds — three universal bosses across all
eight games):

| Game | The Manacle (play size −1) | The Blacklist (class debuffed) | Madame Noir (concealed) |
|------|---------------------------|-------------------------------|------------------------|
| Roulette Rouge | 1 fewer bet token per spin | One color (rouge/noir/zéro) | Wheel numbers hidden while betting |
| Blackjack Noir | Hand cap −1 card | One suit | You play your hand face-down |
| Slot Syndicate | 1 payline disabled | One symbol class | Reels stay dark until lines resolve |
| Craps Crimson | 1 fewer roll per hand | One pip value | Dice resolve under the cup |
| Bingo Baroque | 1 fewer ball per calling | One column (B/I/N/G/O) | Balls called face-down |
| Darts & Deals | 2 darts per visit | One scoring ring | Board unlit until the visit ends |
| Domino Dynasty | Chain cap −1 bone | One pip value | Hand bones drawn face-down |
| Mahjong Méchant | Rack size −1 | One suit | Drawn tiles stay face-down in the rack |

### 2.5 Object modification (the atomic-object interface)

Every atomic object carries: an **identity** (game-specific fields), a **chip value**,
and optional **enhancement / seal / edition** slots. All of the following work in all
eight games:

**Enhancements** (one per object):

| Enhancement | Effect when scored |
|-------------|--------------------|
| Gilded | +30 chips |
| Crimson | +4 mult |
| Mirrored | Retriggers once |
| Champagne | ×2 mult; 1 in 4 chance to shatter (object destroyed) |
| Loaded | This object is twice as likely to be drawn / hit / landed on |
| Bronze | ×1.5 mult while in the game's **reserve zone** (unscored but in play; defined per game) |
| Lucky | 1 in 5: +20 mult; 1 in 15: +$20 |
| Wild | Counts as any identity (any number, suit, class, pip count…) |

**Seals:**

| Seal | Effect |
|------|--------|
| Gold | +$3 when scored |
| Scarlet | Retrigger once |
| Cobalt | When scored, creates a Marker for the highest event of this play |
| Violet | When consumed by the discard-analog, creates an Omen |

**Editions** (objects *and* charms): Foil +50 chips · Holographic +10 mult ·
Polychrome ×1.5 mult · Negative (doesn't occupy a pool/charm slot).

### 2.6 Shop

Opens after every blind. Stock: 2 charm/consumable slots, 1 voucher, 2 booster packs.
**Reroll** $5, +$1 per reroll within a shop.

- **Charms** — the joker analog. Up to **5 slots**. Game-agnostic: charms hook shared
  engine events (`onPlayStart`, `onEventScored`, `onObjectScored`, `onPlayEnd`,
  `onBlindStart/End`, `onDiscardAnalog`, `onMoneyChanged`, `onShopEnter`). Rarities:
  Common / Uncommon / Rare / Legendary. Examples:
  - *Doorman* (Common): +4 mult per unused discard-analog charge remaining.
  - *Lounge Singer* (Common): +30 chips for each scoring event already fired this play.
  - *Card Counter* (Uncommon): first object scored each play retriggers.
  - *High Roller* (Uncommon): +1 mult per $5 held (caps at +10).
  - *The Twin* (Rare): the highest event of each play fires a second time at half value.
  - *Maître D'* (Legendary): every scoring event resolves as if one rung higher.
- **Consumables** (2 carry slots, +1 via voucher):
  - **Omens** — tarot analog; modify atomic objects. Examples: *The Gilder* (Gilded → 2
    objects), *La Mort* (destroy up to 2 objects — pool thinning), *The Wildmaker*
    (Wild → 1 object), *Le Rouge* (convert 1 object's identity to another), *The Mirror*
    (copy one object including modifications), *The Loaded Hand* (Loaded → 1 object, +$3).
  - **Markers** — planet analog (a marker is the house's credit slip). Each Marker
    levels one rung of the **current game's** ladder by its listed increment. Marker
    packs draw only from the active game's ladder.
- **Vouchers** — one permanent run upgrade per ante shop. Shared pool (*Overstock*:
  +1 shop slot; *Velvet Carpet*: rerolls −$2; *Compound Interest*: interest cap +$5;
  *Member's Card*: packs −$1) plus a per-game pool (e.g., Slot Syndicate's *Fourth
  Reel*, Blackjack Noir's *Split & Double*, Craps Crimson's *Third Die*, Mahjong
  Méchant's *Wider Rack*).
- **Booster packs** — *Standard* (atomic objects for the current game), *Omen*,
  *Marker*, *Charm*; each in normal / Jumbo / Mega sizes; pick 1 (or 2 from Mega).

### 2.7 Economy

- Blind rewards: Small **$3**, Big **$4**, Boss **$5**, plus **+$1 per unused play**.
- **Interest**: $1 per $5 held, paid at shop entry, capped **+$5** (raisable by voucher).
- Charms/consumables sell for half cost (rounded up). Tags, rerolls, and Gold-seal
  income complete the money faucets. Money never goes below $0.

### 2.8 Module contract (engineering view)

```
GameModule {
  id, title
  AtomicObject     { identityFields, baseChips }
  startingPool:    AtomicObject[]
  ladder:          ScoringEvent[]   // name, baseChips, baseMult,
                                    // levelUp {chips, mult}, detector(play)
  playsPerBlind, playSize
  discardAnalog    { name, charges, action }
  reserveZone      // where Bronze-style held effects apply
  signatureBosses: Boss[2]
  bossTranslations // hooks for Manacle, Blacklist, Madame Noir, …
  stage            // render + interaction for the play surface
}
```

The shared engine owns: run state, ante/blind progression, the scoring resolver, shop,
economy, modifier system (enhancements/seals/editions), charm hooks, consumables,
saves. A game module never touches money or targets directly.

---

## 3. The Eight Games

Ladder format: **Base** = base chips × base mult. **Level-up** = per Marker level.
Plays/discard charges are per blind. All games: **4 plays** unless stated.

### 3.1 Roulette Rouge

- **Atomic object: the Pocket.** Your wheel is your deck — 37 pockets (0–36; 18 rouge,
  18 noir, 1 zéro). Chip value = the pocket's number (zéro = 25). Omens recolor,
  renumber, duplicate, or **remove** pockets — a thinned wheel makes every remaining
  pocket likelier (deck-thinning analog). Loaded pockets are magnetized.
- **Play — the Spin** (play size: up to 5 bet tokens). Place tokens, spin. Every
  winning bet emits its ladder event. The **landed pocket** is the participating
  object, scoring once per winning bet that covers it (a built-in retrigger for
  stacked coverage).
- **Discard analog — Croupier's Nudge** (3): after the ball lands, shift it ±1 pocket.
- **Reserve zone:** pockets adjacent to the landed pocket.

| Rung | Event (bet type) | Base | Level-up |
|------|------------------|------|----------|
| 1 | Even-Money (rouge/noir, pair/impair, manque/passe) | 45 × 2 | +10 / +2 |
| 2 | Dozen / Column | 50 × 2 | +15 / +2 |
| 3 | Six Line | 55 × 3 | +20 / +2 |
| 4 | Corner | 65 × 3 | +20 / +3 |
| 5 | Street | 70 × 4 | +25 / +3 |
| 6 | Split | 85 × 5 | +30 / +3 |
| 7 | Straight Up | 110 × 7 | +40 / +4 |
| 8 | Zéro (straight up on 0) | 140 × 9 | +50 / +5 |
| 9 | Plein Rouge (landed number covered by straight + split + street + corner + line in one spin) | 160 × 12 | +60 / +6 |

*Rebased in the 2026-06-11 hardening pass (see balance-report.md): the original bases
left no consistent strategy able to clear Ante 1. Low rungs now form a playable floor;
Plein Rouge remains the jackpot.*

**Signature bosses:** *La Roue Voilée* — wheel numbers are hidden while betting.
*Le Zéro Fatal* — zéro's landing weight is tripled and it scores nothing.

### 3.2 Blackjack Noir

- **Atomic object: the Card.** A 52-card deck, fully customizable. Chip value = rank
  (face cards 10, ace 11). Omens re-rank, re-suit, duplicate, destroy.
- **Play — the Deal.** You versus the house; hit or stand freely (hand cap 8 cards);
  dealer hits to 16, stands on 17. The deal's outcome emits one ladder event;
  participating objects = the cards in your final hand. Bust = the deal scores 0.
  Splitting and doubling are unlocked by the *Split & Double* voucher.
- **Discard analog — the Burn** (3): burn the next card of the shoe, unseen, before
  any hit or deal.
- **Reserve zone:** your hole card (first card dealt) until it scores.

| Rung | Event (outcome) | Base | Level-up |
|------|-----------------|------|----------|
| 1 | Push | 5 × 1 | +10 / +1 |
| 2 | Win | 15 × 2 | +15 / +1 |
| 3 | Dealer Bust | 25 × 2 | +20 / +1 |
| 4 | Hard Twenty | 35 × 3 | +25 / +2 |
| 5 | Twenty-One | 50 × 4 | +30 / +2 |
| 6 | Natural Noir (blackjack) | 70 × 6 | +40 / +3 |
| 7 | Five-Card Charlie | 90 × 7 | +45 / +3 |
| 8 | Six-Card Charlie | 120 × 9 | +55 / +4 |
| 9 | Blackout (21, all clubs/spades, suited) | 160 × 12 | +60 / +5 |

**Signature bosses:** *The Cardsharp* — dealer wins pushes and hits to 18.
*The Shoe* — your deck is shuffled into the dealer's shoe; your enhanced cards can be
dealt to the house, where they score nothing.

### 3.3 Slot Syndicate

- **Atomic object: the Symbol.** Your machine's reel strips are your deck: 3 reels ×
  12 symbol instances (grid shows 3 rows; 5 paylines: 3 rows + 2 diagonals). Classes:
  Cherry (5), Lemon (8), Bell (12), Bar (18), Seven (24), Diamond (30) — chip value in
  parentheses. Omens add, remove, copy, or reclass symbols on specific strips
  (Luck-be-a-Landlord-style pool building). Vouchers add the 4th and 5th reels,
  unlocking the higher rungs.
- **Play — the Pull.** Reels spin; each winning payline emits the **highest** rung it
  qualifies for; pull-wide rungs (Double Cross, Full Grid) fire additionally.
  Participating objects = symbols on that line (grid, for pull-wide rungs).
- **Discard analog — the Nudge** (3): step one reel ±1 position after it stops.
- **Reserve zone:** symbols visible on the grid but not on a winning line.

| Rung | Event | Base | Level-up |
|------|-------|------|----------|
| 1 | Deuce (2 of a kind from left) | 5 × 1 | +10 / +1 |
| 2 | Fruit Salad (3 mixed fruit on a line) | 15 × 2 | +15 / +1 |
| 3 | Trio (3 of a kind line) | 30 × 3 | +20 / +2 |
| 4 | Double Cross (2+ winning lines, one pull) | 45 × 4 | +25 / +2 |
| 5 | Quad (4 of a kind; needs 4th reel) | 70 × 6 | +35 / +3 |
| 6 | Sevens (a full line of Sevens) | 90 × 8 | +45 / +3 |
| 7 | Jackpot (5 of a kind; needs 5th reel) | 110 × 9 | +50 / +4 |
| 8 | Full Grid (every visible cell same class) | 160 × 13 | +60 / +5 |

**Signature bosses:** *The Mechanic* — only the middle payline pays.
*The Jammed Reel* — one random reel doesn't spin; it shows last pull's symbols.

### 3.4 Craps Crimson

- **Atomic object: the Die Face.** You carry two dice — 12 faces, each an object
  (chip value = pip count × 5). Omens **re-pip** faces (a die with two sixes), gild
  them, load them. The *Third Die* voucher adds 6 more faces and rolls the best pair.
- **Play — the Hand.** A come-out roll, then up to 4 more rolls chasing the point
  (5 rolls max). Every roll can emit events; participating objects = the two faces
  showing. Seven-out ends the hand immediately (remaining rolls are lost, no penalty).
- **Discard analog — Dice Setting** (3): before any roll, set one die to a chosen face.
- **Reserve zone:** the faces on the underside (opposite the rolled faces).

| Rung | Event | Base | Level-up |
|------|-------|------|----------|
| 1 | Field (3, 4, 9, 10, 11, 12) | 5 × 1 | +10 / +1 |
| 2 | Point Set (point established) | 15 × 2 | +15 / +1 |
| 3 | Yo (11, any time) | 30 × 3 | +20 / +2 |
| 4 | Natural (7 or 11 on the come-out) | 40 × 3 | +25 / +2 |
| 5 | Hard Way (doubles totaling 4, 6, 8, 10) | 50 × 4 | +30 / +2 |
| 6 | Snake Eyes / Boxcars (1-1 or 6-6) | 60 × 5 | +35 / +3 |
| 7 | Point Made | 80 × 6 | +40 / +3 |
| 8 | Hard Point (point made on doubles) | 120 × 9 | +55 / +4 |
| 9 | Crimson Streak (2+ points made in one hand) | 160 × 12 | +60 / +5 |

**Signature bosses:** *The Seven Itself* — every 7-combination's roll weight is
doubled. *The Cold Table* — doubles count as easy ways (Hard rungs can't fire).

### 3.5 Bingo Baroque

- **Atomic object: the Cell.** Your single 5×5 card is your deck: 24 numbered cells +
  a free center (permanently Gilded). Chip value = cell number ÷ 3 (rounded up).
  Omens renumber cells, daub a cell on demand, make cells Wild. Daubs **persist
  across the blind**; the card resets each blind.
- **Play — the Calling.** The caller draws 10 balls from 75; matching cells are
  daubed. Each pattern completed this calling emits its event (each pattern fires
  once per blind); participating objects = the cells of that pattern.
- **Discard analog — the Re-call** (3): void a called ball; the caller draws another.
- **Reserve zone:** daubed cells not yet part of any completed pattern.

| Rung | Event (pattern) | Base | Level-up |
|------|-----------------|------|----------|
| 1 | Postage Stamp (2×2 corner block) | 5 × 1 | +10 / +1 |
| 2 | Single Line (row / column / diagonal) | 20 × 2 | +15 / +1 |
| 3 | Four Corners | 35 × 3 | +25 / +2 |
| 4 | Double Line | 50 × 4 | +30 / +2 |
| 5 | The Cross (center row + center column) | 65 × 5 | +35 / +3 |
| 6 | The X (both diagonals) | 80 × 6 | +40 / +3 |
| 7 | The Frame (outer ring) | 110 × 8 | +50 / +4 |
| 8 | Blackout (all 25) | 170 × 13 | +65 / +5 |

**Signature bosses:** *The Mute Caller* — balls are called face-down; daubs reveal at
the calling's end. *Baroque Decay* — each calling begins by erasing one random daub.

### 3.6 Darts & Deals

- **Atomic object: the Dart.** A quiver of 9 darts; each has a chip value (base 10)
  and an **Accuracy** stat (base 70%) governing scatter around your aimed segment.
  Omens sharpen (accuracy +), weight (chips +), or feather (a missed dart deflects
  toward the nearest scoring ring) individual darts.
- **Play — the Visit** (3 darts thrown per visit). Ring results and visit-wide combos
  emit events; participating objects = the darts involved in that event.
- **Discard analog — the Pull** (3): yank one landed dart and rethrow it.
- **Reserve zone:** darts still in the quiver during a visit.

| Rung | Event | Base | Level-up |
|------|-------|------|----------|
| 1 | Single | 5 × 1 | +10 / +1 |
| 2 | Outer Bull (25) | 20 × 2 | +15 / +1 |
| 3 | Double Ring | 30 × 3 | +20 / +2 |
| 4 | Treble Ring | 40 × 4 | +25 / +2 |
| 5 | Bullseye (inner 50) | 55 × 5 | +30 / +2 |
| 6 | Low Ton (visit total ≥ 100) | 70 × 6 | +35 / +3 |
| 7 | Shanghai (single + double + treble of one number, one visit) | 100 × 8 | +45 / +3 |
| 8 | Hat Trick (three bulls, one visit) | 130 × 10 | +55 / +4 |
| 9 | Ton 80 (three treble-20s) | 170 × 13 | +65 / +5 |

**Signature bosses:** *The Tremor* — all accuracy halved. *The Turning Board* — the
board's segment numbers shuffle between throws.

### 3.7 Domino Dynasty

- **Atomic object: the Bone.** A double-six set: 28 bones; chip value = total pips
  (double-blank = 10). Each lay, draw a hand of 7 from your set. Omens re-pip ends,
  gild bones, or forge **twins** (duplicate bones — illegal in dominoes, delightful
  here). The table layout persists across the blind, resets each blind.
- **Play — the Lay.** Place a chain of up to 6 bones from hand, each legally matching
  an open end (first lay opens the table). Events fire per qualifying placement and
  per lay; participating objects = the bones placed for that event.
- **Discard analog — the Boneyard Swap** (3): exchange up to 3 hand bones with the
  boneyard.
- **Reserve zone:** bones remaining in hand after the lay.

| Rung | Event | Base | Level-up |
|------|-------|------|----------|
| 1 | Link (a legal placement, when nothing higher fires) | 5 × 1 | +10 / +1 |
| 2 | Double (play any double) | 15 × 2 | +15 / +1 |
| 3 | Fiver (open ends total 5) | 30 × 3 | +20 / +2 |
| 4 | Tenner (open ends total 10) | 45 × 4 | +25 / +2 |
| 5 | Quincer (open ends total 15) | 65 × 5 | +35 / +3 |
| 6 | Spinner Bloom (all four arms of the spinner open) | 75 × 6 | +40 / +3 |
| 7 | Vingt (open ends total 20) | 90 × 7 | +45 / +3 |
| 8 | Dynasty Out (empty your hand in one lay) | 130 × 10 | +55 / +4 |
| 9 | Perfect Dynasty (empty hand AND final ends a multiple of 5) | 170 × 13 | +65 / +5 |

**Signature bosses:** *The Bone Collector* — the highest-pip bone in each hand is
debuffed. *The Locked Table* — chains longer than 3 bones are forbidden.

### 3.8 Mahjong Méchant

- **Atomic object: the Tile.** A 72-tile wall: 2 copies each of three suits 1–9
  (54), 2 each of the four winds (8), 2 each of the three dragons (6), 4 flowers.
  Chip value = face value × 3 (honors 15, flowers 20). Omens re-suit, re-rank,
  duplicate, or vanish tiles. Rack of 14, refilled from the wall each declaration.
- **Play — the Declaration.** From your rack, declare any set of non-overlapping
  melds (and optionally a pair). Each meld emits its event; complete-hand patterns
  emit **additionally** (participating objects: the meld's tiles, or all 14 for hand
  patterns). Partial declarations are legal — declaring a lone pung is the "playing
  a pair" of this game.
- **Discard analog — the Exchange** (3): swap up to 5 rack tiles with the wall.
- **Reserve zone:** rack tiles not declared.

| Rung | Event | Base | Level-up |
|------|-------|------|----------|
| 1 | Eyes (a pair) | 5 × 1 | +10 / +1 |
| 2 | Chow (suited run of 3) | 12 × 2 | +15 / +1 |
| 3 | Pung (triplet) | 25 × 3 | +20 / +2 |
| 4 | Dragon Pung (dragon triplet) | 40 × 4 | +25 / +2 |
| 5 | Kong (four of a kind) | 55 × 5 | +30 / +2 |
| 6 | Mahjong (4 melds + pair) | 80 × 6 | +40 / +3 |
| 7 | All Pungs (mahjong, no chows) | 100 × 8 | +45 / +3 |
| 8 | Demi-Couleur (half flush hand) | 120 × 9 | +50 / +4 |
| 9 | Pleine Couleur (full flush hand) | 150 × 12 | +60 / +5 |
| 10 | Treize Méchant (thirteen orphans) | 200 × 15 | +75 / +6 |

**Signature bosses:** *Le Vent Contraire* — after each declaration, four random rack
tiles are blown back into the wall. *Le Dragon Jaloux* — honor tiles cannot be melded.

---

## 4. Visual Identity — Art Deco, Gold on Crimson

### 4.1 Palette

| Token | Hex | Use |
|-------|-----|-----|
| `--noir-velvet` | `#120D0A` | App background |
| `--noir-panel` | `#1E1611` | Panels, cards, shop stalls |
| `--gold-leaf` | `#C9A24B` | Primary metal: borders, rules, icons |
| `--champagne` | `#EFD9A7` | Highlights, hover, leveled-up glints |
| `--crimson-velvet` | `#8A1B2B` | Primary accent: blinds, mult, seals |
| `--lipstick` | `#C42847` | Hot states: boss warnings, mult flares |
| `--ivory` | `#F3E9D2` | Body text on dark |
| `--smoke` | `#8C8278` | Muted text, disabled |

Chips render in gold; mult in crimson — the two halves of every score readout.

### 4.2 Typography

- **Cinzel** (700/900): display — game titles, blind names, ante numerals, the
  chips × mult readout, shop marquee. ALL CAPS, +4% letterspacing.
- **EB Garamond** (400/500): body — descriptions, rules text, tooltips; *italic* for
  flavor text. Lining figures in tables; Cinzel figures only in the score readout.

### 4.3 Motifs & layout

- Stepped-chevron dividers; double-rule gold borders; sunburst fan behind boss
  introductions; scalloped corner brackets on charm cards; geometric inlay frames on
  vouchers. Gold leaf is *drawn*, never gradient-glossy.
- **Layout (all games):** Balatro-style left rail — target, running score, plays and
  discard-analog charges, money, ante/blind — in a gold-framed noir panel. Center
  stage hosts the game surface (wheel, table, reels, board, wall). Bottom rack holds
  the player's objects in hand/queue. The shop is a brass marquee with a velvet
  curtain that parts on entry.
- **Motion:** gold shimmer sweep on editions; crimson pulse on boss effects; score
  ticks ratchet upward with a mechanical counter feel.

---

## 5. Open Questions (deliberately deferred)

1. Stake ladder (difficulty tiers above base) — port Balatro's stake modifiers or
   design house-specific ones?
2. Grand Tour mode: how do per-game object pools persist when the ante's game changes?
3. Per-game charm sub-pools (charms that read game-specific state) — allowed, or keep
   the charm pool 100% agnostic?
4. Endless mode scaling curve past Ante 8.
