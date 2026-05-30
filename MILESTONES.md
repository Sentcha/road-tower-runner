# Road Tower Runner — Development Milestones

## Design Overview

A scrolling top-down road runner with a pixel-art aesthetic.
The player drives through three distinct environments (city → highway → desert),
dodging traffic and avoiding tower enemies that shoot from the roadside.
Powerups spawn on the road to help the player survive longer and score higher.

---

## Milestone 1 — Pixel Art Foundation

**Goal:** Establish the pixel-art visual language and make the road feel alive before adding new mechanics.

### Tasks
- [ ] Switch all rendering to pixel-art style: crisp edges, no anti-aliasing (`ctx.imageSmoothingEnabled = false`), limited palette
- [ ] Redraw player car and traffic cars as pixel-art sprites (drawn programmatically with pixel blocks)
- [ ] Add scrolling roadside scenery: lamp posts, road signs, kerb markings
- [ ] Add animated grass texture on the verges (subtle colour variation scrolling downward)
- [ ] Introduce a skid-mark trail behind the player car when turning hard
- [ ] Refine HUD font to a monospace / pixel-style web font

### Acceptance Criteria
- Game looks consistently pixel-art from start screen to game over
- Road scenery scrolls in sync with road speed
- No blurry or anti-aliased edges anywhere on the canvas

---

## Milestone 2 — Tower Enemies

**Goal:** Add the core tower mechanic — stationary turrets on the roadside that fire projectiles at the player.

### Design Decisions
- Towers appear on the **grass verges** (left and/or right of the road), never on the road itself
- They scroll into view from the top just like traffic cars
- Each tower fires a **single projectile** at the player's current position when the tower is level with the player's Y position
- Projectiles travel at a fixed speed across the road; they despawn when they exit the canvas
- Towers come in two variants:
  - **Basic tower** (single slow shot, low HP — later upgradeable)
  - **Rapid tower** (bursts of 3 fast shots in quick succession)
- Towers are destroyed after firing (they're one-shot structures, not persistent)
- Hitting a projectile costs 1 life (same as a car collision); invincibility frames apply

### Tasks
- [ ] Tower data structure and spawn logic (spawns on verge, not on road)
- [ ] Projectile system: spawn, travel, collision with player, despawn
- [ ] Basic tower variant (single shot)
- [ ] Rapid tower variant (3-shot burst)
- [ ] Pixel-art sprites for both tower variants and the projectile
- [ ] Tower frequency scales with level and scroll speed

### Acceptance Criteria
- Towers scroll in from top, fire when aligned with player, then scroll off-screen
- Projectile hits register with the same collision/invincibility system as traffic
- Both tower variants are visually distinct

---

## Milestone 3 — Powerups

**Goal:** Spawn collectible powerups on the road that give the player a temporary edge.

### Powerup Types

| Powerup   | Effect | Duration |
|-----------|--------|----------|
| **Coin**  | +50 bonus score; no timed effect | Instant |
| **Shield**| Invincibility bubble; absorbs one hit without losing a life | 5 s |
| **Slow-mo**| All traffic and projectiles move at 40 % speed | 4 s |

### Design Decisions
- Powerups spawn in a **random lane** and scroll down with the road
- At most **2 powerups** on screen at once
- Powerups are mutually exclusive — picking up a new one replaces the active effect
- A HUD icon + countdown bar shows the active powerup and remaining duration
- Spawn rate is independent of traffic spawn rate; roughly one powerup every 15–20 seconds

### Tasks
- [ ] Powerup entity: spawn, scroll, player pickup detection
- [ ] Coin: instant score bonus, satisfying pixel-art pickup animation
- [ ] Shield: visual bubble around player car, absorbs one collision
- [ ] Slow-mo: tints screen slightly blue, slows `scrollSpeed` and projectile speeds temporarily
- [ ] HUD element: active powerup icon + duration bar
- [ ] Pixel-art sprites for each powerup icon on the road

### Acceptance Criteria
- All three powerups spawn, can be collected, and apply their effect correctly
- Shield correctly absorbs exactly one hit
- Slow-mo affects both traffic cars and tower projectiles
- HUD shows active effect with a draining timer bar

---

## Milestone 4 — Level Chapters (City → Highway → Desert)

**Goal:** Give the run a sense of journey across three visually and mechanically distinct environments.

### Chapter Breakdown

| # | Chapter  | Length     | Key visual changes | Mechanic tweak |
|---|----------|------------|--------------------|----------------|
| 1 | **City**     | 0 – 90 s   | Brick buildings on verges, lamp posts, traffic lights | Baseline difficulty, towers introduced late in chapter |
| 2 | **Highway**  | 90 – 210 s | Open tarmac, crash barriers, distant hills | Higher base speed; rapid towers appear |
| 3 | **Desert**   | 210 s +    | Sand dunes, cacti, heat shimmer overlay | Maximum speed; both tower types active; tighter traffic |

### Transitions
- A **chapter transition banner** ("Entering Highway…") slides in and fades over 2 seconds
- Scroll speed gets a one-time bump at each chapter boundary
- Background palette cross-fades over ~3 seconds (no hard cut)

### Tasks
- [ ] Chapter timer / chapter state machine
- [ ] Unique scrolling scenery objects per chapter (pixel-art sprites)
- [ ] Background colour palette per chapter (grass colour, sky strip at top)
- [ ] Transition banner UI element
- [ ] Tower unlock gating per chapter (basic in city, rapid added on highway)
- [ ] Per-chapter traffic density curve

### Acceptance Criteria
- Player clearly notices a visual and difficulty shift at each chapter boundary
- Transition banner appears and dismisses cleanly
- Tower variants appear at the correct chapters

---

## Milestone 5 — Audio & Final Polish

**Goal:** Add sound and tie everything together for a shippable v1.0.

### Tasks
- [ ] Synthesised sound effects via Web Audio API (no external files):
  - Engine hum (pitch scales with scroll speed)
  - Collision crunch
  - Projectile whoosh
  - Powerup pickup chime
  - Chapter transition sting
- [ ] Start screen animated preview (car driving in the background)
- [ ] Game-over screen shows chapter reached + time survived
- [ ] Persist best score per chapter in `localStorage`
- [ ] Mobile touch controls: left/right swipe zones + on-screen arrows
- [ ] Full accessibility pass: keyboard-navigable menus, sufficient contrast

### Acceptance Criteria
- All major game events have audio feedback
- Game is playable on a mobile browser with touch controls
- No regressions from earlier milestones
