# Cel Blade — UI/UX change plan (PC and mobile)

> **Audience:** Claude (Claude Code or chat) making UI changes one task at a time. Readable by humans too.
> **Created:** 2026-10-15 from a hands-on review of the offline game (`python serve.py 5173`) in a browser at desktop and phone sizes, plus a read of `style.css` and `src/ui/`. Online-only screens (sign-in, chat, social, party, trade, raid frames) were reviewed from code only. No real phone or tablet was used.
> **Paths** are repo-root (`src/ui/HUD.js`, `style.css`). Line numbers are as of commit `68a666c`; search for the quoted code if they've moved.
> **`(check)`** marks something not verified in the running game. Verify it, fix the text, drop the tag.
> **Sizes:** S = a few rules or lines in one or two files, M = a component reworked, L = a cross-cutting system (type scale, settings).
> **Relation to WORK_PLAN.md:** its working agreement says "don't restyle the HUD". This plan *is* HUD and menu work, so it runs as its own lane and only with the user's go-ahead (DEC-UX-1). Everything else in WORK_PLAN's working agreement still applies: keep `npm test` green, keep it playable, no unrelated refactors.

---

## 1. How to use this file

1. Read sections 1–4 before any work. For a task, read the task and the files it names.
2. **Pick** the highest-priority task whose `depends` are all `done` and whose `needs` decisions are `decided` (section 3).
3. **Claim it:** set `- status: doing` and add `- owner: <session id>`.
4. Tick acceptance items (`- [ ]` → `- [x]`) as they become true. `(user)` items are ticked only by the user.
5. **Finish:** `done` (all ticked), `review` (a `(user)` item remains), or `blocked` (one-line reason in notes).
6. Append dated notes under the task. If this file disagrees with the code, trust the code and correct the file.
7. Verify every task with the method in section 4 at **every** viewport it names, and attach before/after numbers from the audit snippet to the notes.

Tasks are `### UX-NN Title` headings; `grep -n "^- status:" docs/UI_UX_PLAN.md` lists their states.

| Status | Meaning |
| --- | --- |
| `todo` | Not started. |
| `doing` | In progress, with an `- owner:` line. |
| `review` | Built and checked; waiting on the user (a playtest on a real phone, a judgement call). |
| `blocked` | Can't continue; reason in notes. |
| `done` | Finished and confirmed. |

### Priorities

- **P1** — blocks or seriously hurts play for one platform (unreadable text, untappable controls, one-tap loss of items).
- **P2** — friction that every player hits regularly.
- **P3** — polish and consistency.

---

## 2. The critique

### Overall impression

The visual identity is strong and consistent: chamfered dark-glass panels, teal energy and gilt accents, condensed caps, a clear token set in `:root`. On a 1440×900 desktop the HUD reads well and stays out of the way. The biggest problem is **scale**. Small screens are handled by CSS `zoom` on whole containers (`--hz` 0.56 on the touch HUD, 0.58–0.66 on menus, title and dialogue), which shrinks text to 5–9 px and buttons to 17–29 px on every phone in landscape. The second is **input-mode copy and affordances**: touch players are told to hover, click and press keys. The third is **destructive actions without a safety net**.

### What works well (keep these)

- **One design system.** Colours, panel shapes and type are tokens in `style.css` `:root` and used everywhere. New work should extend the tokens, not add literals.
- **Touch HUD architecture.** The touch layout reuses the HUD's own prompts as buttons (interaction prompt, loot card, weapon slots, minimap, tracker). The floating stick, drag-to-look and safe-area handling are well thought out (`src/ui/TouchControls.js`, `style.css` ~1043–1103).
- **Portrait handling.** Phones in portrait get a clear "Turn your device sideways" screen.
- **Item cards.** Rarity colour, ▲/▼ comparisons (arrow *and* colour, not colour alone), perks and set bonuses lit by pieces worn.
- **Live menu with health.** The game menu shows live health on desktop because the world keeps running. Good honesty about the design; see UX-08 for the phone gap.
- **Quest markers.** Gold, green and teal NPC markers and the compass and minimap waypoints make the next step findable.
- **Death screen.** Short, clear, one action.

### Usability

| Finding | Severity | Task |
|---|---|---|
| Phone text renders at 5–9 px across HUD, menus, dialogue and title (zoomed containers). | 🔴 Critical | UX-01 |
| Phone tap targets in menus/settings/dialogue are 17–29 px tall. | 🔴 Critical | UX-02 |
| Scrap, Sell and Drop act on one click or tap, legendaries included; no confirm, no undo. | 🔴 Critical | UX-03 |
| No UI/HUD scale setting; desktop menus at 1280×720 drop 84 text elements under 10 px. | 🟡 Moderate | UX-05 |
| Touch players see keyboard/mouse copy ("Hover an item", "Click a talent", "Press R", "X, G and T"). | 🟡 Moderate | UX-06 |
| Talent nodes learn on a single tap or click, aren't keyboard focusable, and explain locks only in `title` tooltips (invisible on touch). | 🟡 Moderate | UX-07 |
| After the opening moment the HUD gives no objective until the player finds Warden Maren. | 🟡 Moderate | UX-12 |
| In towns, NPC labels overlap each other, the quest tracker and banners. | 🟡 Moderate | UX-09 |
| Left-hand Fire/Aim sits where the left thumb rests to move. `(check on a device)` | 🟡 Moderate | UX-04 |
| The interaction prompt stays visible behind an open dialogue on desktop. | 🟢 Minor | UX-10 |
| Dialogue options have no number-key shortcuts. | 🟢 Minor | UX-11 |

### Visual hierarchy

- **What draws the eye first (desktop play):** the weapon card (bottom right, 44 px ammo numerals) and the minimap. That's right for a shooter. The quest tracker is the weakest element on screen (12.5 px on glass) even though it carries the "what now".
- **What draws the eye first (phone play):** the right-hand action cluster, then the event/level banner when one shows. Vitals and the tracker are too small to read at a glance.
- **Reading flow in menus:** header → tabs → two cards. On desktop this works. The Journal adds two more rows of tabs styled like option toggles, so it reads as filters, not navigation (UX-16).
- **Emphasis problems:** locked talent tiers are stacked opacities (0.55 × 0.6 × 0.55 = 0.18) and become unreadable rather than "quieter" (UX-07). Settings' choice buttons always look "on", so the eye can't tell state (UX-13).

### Consistency

| Element | Issue | Recommendation |
|---|---|---|
| Type scale | 20+ distinct sizes from 8.5 to 54 px; many one-offs (10.5, 11.5, 12.5, 13.5). | Define a type scale in tokens (UX-01) and map existing sizes to it. |
| Small-screen strategy | Two strategies coexist: `zoom` on containers and `@media (max-width: 700px)` re-layouts. | One strategy: responsive layout plus a minimum type floor; `zoom` only for the user's UI scale setting (UX-01, UX-05). |
| Tabs | Top tabs (`.gm-tab`), journal sub-tabs (`.filter button`) and quest sub-tabs (`.filter.qtabs`) look different. | One tab component, two sizes (UX-16). |
| Toggles vs. choices | `.pm-toggle` is used for on/off and for cycling choices; choices always render `on`. | Segmented control for choices (UX-13). |
| Focus styles | `.gm-btn`, `.gm-tab`, `.tt-menu button` have `:focus-visible`; `.dlg-options`, `.filter`, `.tile`, `#overlay-buttons` don't. | Shared focus ring token (UX-11, UX-07). |
| Empty weapon slot | "Empty" label is `color: var(--rc)` = transparent, so only its text-shadow shows as a smudge. | UX-20. |

### Accessibility (WCAG 2.1 AA as a yardstick; it's a game, so play-critical text matters most)

**Contrast** (computed against the panel colour `rgb(13,17,27)`; HUD text over the 3D world varies and relies on text-shadow):

| Element | Foreground | Ratio | Needs | Pass? |
|---|---|---|---|---|
| Body text `#e9f1ff` | full opacity | 16.6:1 | 4.5:1 | ✅ |
| Gilt headings `#f0c674` | full opacity | 11.7:1 | 4.5:1 | ✅ |
| `.hint` text | opacity 0.55 | 5.6:1 | 4.5:1 | ✅ |
| `.tt-foot`, done quest objectives | opacity 0.45 | 4.1:1 | 4.5:1 | ❌ (small text) |
| Empty inventory tile label | opacity 0.28 | 2.3:1 | 4.5:1 | ❌ |
| Locked talent node text | opacity ≈0.33 | 2.8:1 | 4.5:1 | ❌ |
| Locked talent meta line | opacity ≈0.18 | 1.6:1 | 4.5:1 | ❌ |

**Touch targets** (phone, 667×375): touch action buttons 43–75 px ✅; menu tabs 27 px, Resume/Quit 23 px, settings toggles 41×17, sliders 11 px tall, dialogue options 26 px, title buttons 29 px, weapon slots 34 px, interaction prompt 23 px ❌ (target 44 px; never under 24).

**Text size** (effective px, size × zoom), measured:

| Screen | Viewport | Smallest text | Notes |
|---|---|---|---|
| HUD | 1440×900 desktop | 8.5 px (slot type), 10 px (XP) | Fine elsewhere. |
| Menus | 1280×720 desktop | 8.6 px; 84 elements < 10 px | `zoom: 0.86` from `@media (max-height: 760px)`. |
| HUD | 667×375 phone | 6.2 px (LV, MP), 7 px (quest objective), 7.3 px (zone), 9 px (HP) | `--hz: 0.56`. |
| Game menu | 667×375 phone | 6.9 px; 38 elements < 8 px | `zoom: 0.66`. |
| Dialogue | 667×375 phone | 5.2 px (eyebrows), 7 px (options), 9.3 px (line) | `zoom: 0.58`. |
| Title | 667×375 phone | 6.4 px (footnote), 6.7 px (Continue details) | `zoom: 0.58`. |

Every phone in landscape is ≤ 440 px tall (iPhone SE 375, iPhone 15 393, Pro Max 430, Pixel 412), so every phone gets the smallest zoom.

**Other:** rarity in the inventory grid is colour-only (UX-15); talent nodes are `<div>`s with `data-act`, not focusable (UX-07); nights get very dark with no brightness setting (UX-14); no reduce-motion or flash setting beyond camera shake (UX-14).

### Priority recommendations (short version)

1. **Replace container zoom with a type floor and responsive layouts on phones** (UX-01, UX-02). Nothing else on mobile matters until text is readable and buttons are tappable.
2. **Put a safety net on destructive item actions** (UX-03). One mis-tap currently destroys a legendary.
3. **Add a UI scale setting** (UX-05) so desktop players on 720p-equivalent laptops and 1440p monitors can fix size themselves.
4. **Say the right thing for the input in use** (UX-06), and fix the talent tree's interaction and legibility (UX-07).

---

## 3. Decisions needed from the user

### DEC-UX-1 Run this plan as a lane
- status: open
- question: WORK_PLAN.md says not to restyle the HUD. May sessions work through this plan as its own lane, alongside the content lanes?
- default if "use your defaults": yes, P1 tasks first, one session at a time touching `style.css`.

### DEC-UX-2 Key rebinding
- status: open
- question: Add key rebinding to Settings › Controls (UX-18 stretch), or keep the controls reference read-only for now?
- default: read-only now; rebinding goes to the backlog.

### DEC-UX-3 Left-hand Fire default on phones
- status: open
- question: Keep the left-hand Fire/Aim pair on by default, move it, or make it opt-in (UX-04)?
- default: keep it on, move it up out of the stick's rest area, and add an on/off setting.

### DEC-UX-4 Confirm style for destructive actions
- status: open
- question: For Scrap/Sell/Drop of rare-or-better items: a hold-to-confirm button, a confirm step, or an undo toast?
- default: hold-to-confirm (matches the loot card's existing "Hold F" swap) for rare and up; an undo toast for Drop.

---

## 4. How to verify (every task)

**Start the game:** use the `game` preview (`.claude/launch.json` runs `python serve.py 5173`), or `python serve.py 5173` and open `http://localhost:5173`.

**Viewports.** Check each viewport a task names. Phone sizes need touch emulation (width < 768 in the browser pane emulates a phone; **reload after resizing**, because `TOUCH_DEVICE` in `src/core/Device.js` is read at load). For a larger phone (≥ 768 wide) set Settings › Touch controls › On instead.

| Name | Size | Touch |
|---|---|---|
| Laptop (125–150 % OS scaling) | 1280×720 | no |
| Desktop | 1440×900 | no |
| Full HD | 1920×1080 | no |
| Small phone, landscape | 667×375 | emulated (reload) |
| Large phone, landscape | 844×390 | Settings › Touch controls › On |
| Phone, portrait | 390×844 | emulated (reload): expect the rotate screen |
| Tablet, landscape | 1024×768 | Settings › Touch controls › On `(check: not reviewed)` |

**Getting to states quickly** (browser console; the game object is `window.game`, the dev panel is `game.dev`):

```js
game.titleMenu.act('continue')            // or 'new' — from the title
game.openGameMenu('talents')              // 'character' | 'inventory' | 'journal' | 'map' | 'settings' | 'controls'
game.dev.forge('weapon', 'legendary', 3, 'pack')   // fill the backpack ('drop' drops it in front)
game.dev.flags.god = true
game.dev.teleport(60, 60)                 // open ground outside Brightwater
game.dev.spawn('cutter', 2, 3, false)     // enemies at the reticle
game.interact(game.interactables().find((i) => i.name === 'Warden Maren'))   // open a dialogue
```

Note: in an automated browser without pointer lock, the game flips to the menu when the mouse isn't locked. Use `game.closeMenus()`; the "click to take back the mouse" hint will show, which is expected.

**Audit snippet** — paste into the console; it lists visible text with its *effective* size (font-size × every ancestor's `zoom`) and opacity, and button sizes. Record the before/after numbers in the task notes.

```js
window.uxAudit = (sel = 'body') => {
  const out = []; const seen = new Set();
  const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const el = w.currentNode.parentElement; const txt = w.currentNode.textContent.trim();
    if (!txt || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    let e = el, zoom = 1, op = 1, hidden = false;
    for (; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
      zoom *= parseFloat(cs.zoom) || 1; op *= parseFloat(cs.opacity);
    }
    if (hidden || op < 0.05) continue;
    out.push({ px: +(parseFloat(getComputedStyle(el).fontSize) * zoom).toFixed(1), op: +op.toFixed(2), txt: txt.slice(0, 40) });
  }
  return out.sort((a, b) => a.px - b.px);
};
window.uxTargets = (sel) => [...document.querySelectorAll(sel)].map((b) => b.getBoundingClientRect())
  .filter((r) => r.width && r.height).map((r) => `${Math.round(r.width)}x${Math.round(r.height)}`);
// uxAudit('#hud').slice(0, 15); uxAudit('#menu').filter((t) => t.px < 11).length; uxTargets('#menu button')
```

**Global acceptance bar** (what "fixed" means for UX-01/02/05):
- Play-critical text (vitals numbers, ammo, quest objective, prompt, dialogue line and options, menu body text) ≥ 12 px effective on phones and ≥ 12 px on desktop at UI scale 100 %.
- Secondary text (labels, meta lines, footnotes) ≥ 10 px effective everywhere; nothing under 9 px.
- Touch targets ≥ 44×44 px on touch layouts; never under 24 px in any dimension anywhere.
- Text at rest ≥ 4.5:1 against its panel (use colour tokens rather than stacked opacity to dim).

---

## 5. Tasks

### UX-01 Mobile type floor instead of container zoom
- status: todo
- priority: P1 · size: L · platform: mobile (and desktop short windows)
- depends: —
- files: `style.css` (`:root`; "small screens" block ~983–993; touch block ~1049–1052, ~1134–1142; `.tt-*`, `.gm-*`, `#dialogue`, `.quest`, `.bar`), `src/ui/HUD.js`, `src/ui/GameMenu.js`
- problem: Small screens shrink whole containers with CSS `zoom`: `body.touch #hud { zoom: var(--hz) }` (0.56 at ≤ 440 px tall), `body.touch #menu .gm-frame` 0.66, and `#title .tt-col, #dialogue, #overlay .panel, #trade > *, …` 0.58. Measured at 667×375: quest objective 7 px, HP numbers 9 px, LV and MP 6.2 px, dialogue options 7 px, dialogue eyebrows 5.2 px, title footnote 6.4 px, 38 menu elements under 8 px.
- change:
  1. Add a type scale to `:root` (e.g. `--fs-xs: 11px; --fs-sm: 12px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 28px; --fs-display: 54px`) and move existing literals onto it. Keep the display/condensed families.
  2. Remove the container `zoom` rules for touch and short screens. Instead, at `body.touch` and `@media (max-height: 600px)`/`(max-height: 440px)`: tighten spacing and widths, drop secondary content, and keep font sizes at or above the floor (section 4).
  3. Touch HUD: show less, larger. Vitals: HP bar with numbers at ≥ 12 px, no MP text (keep the bar), LV badge ≥ 12 px label. Tracker: title + current objective only, ≥ 12 px, max two lines with ellipsis. Zone name may hide on phones (the map tab has it).
  4. Phone menu, dialogue and title: re-lay out for 375 px height (e.g. dialogue as a full-width bottom sheet with the line at 14 px and options at 13 px in two columns; title menu items at 16 px with the logo shrunk, not everything zoomed).
  5. Keep the safe-area offsets (`--sal`, `--sar`, `--sat`) working once offsets are no longer divided by `--hz`.
- acceptance:
  - [ ] At 667×375 and 844×390 (touch), `uxAudit('#hud')`, `uxAudit('#menu')`, `uxAudit('#dialogue')` and `uxAudit('#title')` return nothing under 10 px, and play-critical text is ≥ 12 px.
  - [ ] No container on a touch layout has a computed `zoom` other than 1 (except the user's UI scale from UX-05).
  - [ ] At 667×375 the HUD leaves the centre third of the screen clear (no HUD element overlaps a box from 33 %–67 % width × 25 %–75 % height except the reticle, prompt and loot card).
  - [ ] Desktop 1440×900 looks unchanged (screenshot before/after in notes).
  - [ ] `(user)` Read on a real phone at arm's length.
- notes:

### UX-02 Touch targets on phones
- status: todo
- priority: P1 · size: M · platform: mobile
- depends: UX-01 (do them together if one session)
- files: `style.css` (`.gm-tab`, `.gm-btn`, `.pm-toggle`, `.pm-set input[type=range]`, `.dlg-options button`, `.tt-menu button`, `body.touch .slot`, `body.touch #prompt`, `.filter button`, `.tl-slot`, `.tt-look button`)
- problem: At 667×375: menu tabs 27 px tall, Resume/Quit 23 px, Open talents 23 px, Title "None" 32×17, settings toggles 41×17, sliders 11 px tall, dialogue options 26 px, title buttons 29 px, weapon slots 34 px, interaction prompt 23 px.
- change: Under `body.touch`, give every interactive control a ≥ 44 px hit area (min-height and padding; for the range input a taller track and a ≥ 28 px thumb via `::-webkit-slider-thumb`/`::-moz-range-thumb`). Where the visual should stay slim, extend the hit area with a transparent `::before`. Space adjacent targets ≥ 8 px apart. Move Quit/Leave away from Resume or give it a confirm (UX-03).
- acceptance:
  - [ ] `uxTargets('#menu button, #menu input, #dialogue button, #title button, #hud .slot, #prompt')` at 667×375 shows no dimension under 44.
  - [ ] The menu header still fits in one row at 667 px wide (tabs scroll sideways as today).
  - [ ] `(user)` Tapping each settings control on a real phone hits on the first try.
- notes:

### UX-03 Safety net for destructive item actions
- status: todo
- priority: P1 · size: M · platform: both
- needs: DEC-UX-4
- files: `src/ui/InventoryUI.js` (`render` actions ~214–232, `onClick` ~284–295, drag-to-drop/sell ~108–130), `src/ui/TradeUI.js` `(check)`, `src/ui/GameMenu.js` (`quit` ~295), `style.css`
- problem: "Scrap +233G" on a legendary, "Sell", and "Drop" act on one click or tap, styled like neutral buttons. Dragging onto the drop zone or a trader's stock also acts immediately. On touch, a mis-tap loses the item. "Quit to Title" sits next to "Resume" in the phone header at 23 px tall.
- change: For rare-or-better items: Scrap and Sell become hold-to-confirm (reuse the loot card's hold progress pattern, `.lc-hold i`), styled as danger (`.gm-quit` colours). Drop shows an undo toast for ~5 s (re-pick from the ground counts as undo if simpler — say which in notes). Drag-to-sell of rare+ asks once. Leave/Quit to Title on touch: a confirm step. Commons stay one-tap.
- acceptance:
  - [ ] Scrapping or selling a rare/epic/legendary needs a deliberate hold (or confirm) by mouse and by touch.
  - [ ] A dropped item can be recovered from the undo (or the toast says where it lies).
  - [ ] Destructive buttons are visually distinct from Equip/Unequip.
  - [ ] Online, every action still goes through `game.charLink.do` exactly once.
- notes:

### UX-04 Touch action layout: left-hand Fire and button labels
- status: todo
- priority: P2 · size: M · platform: mobile
- needs: DEC-UX-3
- files: `src/ui/TouchControls.js` (markup ~57–79, `STICK_ZONE`), `style.css` (~1012–1041, ~1156–1161), `src/core/Prefs.js`, `src/ui/GameMenu.js` (settings)
- problem: The left-hand Fire (56 px) and Aim sit at `top: 68%` on the left, inside the stick zone (left 42 %) and where a left thumb naturally rests to move, so a thumb going down to move can fire instead `(check on a device)`. The right cluster uses uppercase text labels (FIRE, AIM, DASH, JUMP, RELOAD, SLIDE, MELEE) that are hard to read at a glance and crowd the cluster.
- change: Move the left-hand pair up (e.g. top 34–44 %, still clear of party frames and chat) or make it a setting "Left-hand fire: On/Off". Use line icons (the file already has an `ICON` set and `icon()` helper) with a short label under or inside each button; keep text for abilities.
- acceptance:
  - [ ] No touch button overlaps the band from 55 %–95 % height × 0–30 % width on phones, so the stick has a clear rest area.
  - [ ] Each action button has an icon and an `aria-label`.
  - [ ] `(user)` Moving with the left thumb never fires in a two-minute play on a phone.
- notes:

### UX-05 UI scale setting
- status: todo
- priority: P2 · size: M · platform: both
- depends: UX-01
- files: `src/core/Prefs.js`, `src/ui/GameMenu.js` (`settingsHTML`, `FMT`), `src/main.js` (`applyPrefs`), `style.css`
- problem: HUD and menus use fixed pixel sizes. At 1920×1080 the HUD is small; on 1440p it's smaller still. At 1280×720 (a 1080p laptop at 150 %) menus are zoomed to 0.86 by `@media (max-height: 760px)` and 84 text elements fall under 10 px. Players can't fix either.
- change: Add `uiScale` (e.g. 80–150 %, step 5, default 100 %; default 110 % on touch) to prefs and Settings › Display. Apply it as one CSS variable used by the type scale and spacing (or one `zoom` on `#hud`, `#menu`, `#dialogue`, `#title` — but then the UX-01 floor must hold at 100 % and 80 % may go under it; say so in the setting's help). Drop the automatic `max-height: 760px` zoom.
- acceptance:
  - [ ] Changing UI scale applies live in play and in the menu, and persists per device.
  - [ ] At 1280×720 and 100 %, `uxAudit('#menu')` has nothing under 10 px.
  - [ ] At 150 % on 1280×720 nothing important is clipped off-screen (vitals, weapon card, minimap, tracker).
- notes:

### UX-06 Copy and controls that match the input in use
- status: todo
- priority: P2 · size: S · platform: mobile (and touchscreen laptops)
- files: `src/ui/InventoryUI.js` (hint ~247), `src/ui/TalentsUI.js` (hint ~70, node titles ~39), `src/main.js` (`onPlayerDeath` overlay ~2016), `src/ui/GameMenu.js` (`characterHTML` abilities ~360, `settingsHTML` ~551–558, `CONTROLS`), `src/ui/HUD.js` (`forScreen`), `style.css` (`.kb-only`, `.touch-only`)
- problem: On touch: "Hover an item for its details. Drag items…", "Click a talent to learn a rank… Abilities go on X, G and T", "Press R or click below" on the death screen, and the Character tab's ability list renders as "EMPTY EMPTY EMPTY" because the `<kbd>` labels are hidden on touch. Settings shows Mouse sensitivity and Invert vertical look on phones; desktop shows touch settings.
- change: Route these strings through the existing `.kb-only`/`.touch-only` classes or `forScreen()`. Touch versions: "Tap an item for details; drag to move it", "Tap a talent to see it; tap Learn to spend a point", "Tap Rise again". Ability slots get a label on touch ("Ability 1/2/3", or the touch button's icon). In Settings, show the input-relevant group first and hide the other unless that input has been seen (`game.touchActive`, `touchSeen`).
- acceptance:
  - [ ] With touch controls on, no visible string mentions hover, click, a mouse button or a key letter (grep the rendered text: `/hover|click|press [A-Z]|\bLMB|\bRMB|\b[XGT]\b/`).
  - [ ] With touch off, desktop copy is unchanged.
- notes:

### UX-07 Talent tree: legibility, focus and a learn step
- status: todo
- priority: P2 · size: M · platform: both
- depends: UX-06 (copy)
- files: `src/ui/TalentsUI.js`, `src/ui/GameMenu.js` (`onClick` `learn`), `style.css` (~767–807)
- problem: Locked tiers stack opacity (`.tl-tier.closed` 0.55 × `.tl-node.locked` 0.6 × `.tl-meta` 0.55 ≈ 0.18 → 1.6:1 contrast); at 1280×720 those lines are 8.6 px. Nodes are `<div data-act>`, so keyboard users can't reach them. Why a node is locked is only in a `title` tooltip (never shown on touch). One click or tap spends a point immediately; after level 10 undoing costs gold at a smith.
- change: Render nodes as `<button>`s with `aria-disabled` when locked and a visible focus ring. Dim locked content with a muted colour token (≥ 4.5:1) instead of nested opacity. Selecting a node shows a small detail strip (in place or pinned under the head) with current → next rank, the lock reason, and a **Learn** button; on desktop, double-click or Enter on a focused node may learn directly. Show which tree/tier unlocks next ("3 more points in Vanguard").
- acceptance:
  - [ ] Every node is reachable by Tab and learnable with Enter/Space; focus is visible.
  - [ ] Locked text is ≥ 4.5:1 against its card (check with a contrast tool, record the ratio).
  - [ ] The lock reason is visible without hover.
  - [ ] Spending a point takes two deliberate taps on touch.
- notes:

### UX-08 Health stays visible in the phone menu
- status: todo
- priority: P2 · size: S · platform: mobile
- files: `style.css` (`@media (max-width: 700px)` ~813–819: `.gm-hp { display: none }`; `body.touch .gm-hp` ~1127)
- problem: The world keeps running under the menu, and the desktop header shows live health for that reason. Under 700 px wide (most phones in landscape at 667–700) the health bar is hidden, so a player in the menu can be killed without warning.
- change: Keep `.gm-hp` on touch layouts (narrower, e.g. 72–96 px, numbers ≥ 11 px); if space is tight, hide the tabs' labels before health. Optional: pulse the header edge red while taking damage in the menu.
- acceptance:
  - [ ] At 667×375 with the menu open, health is visible and updates when hurt (`game.player.hp -= 20`).
- notes:

### UX-09 World labels: declutter and keep clear of the HUD
- status: todo
- priority: P2 · size: M · platform: both (worse on phones)
- files: `src/ui/WorldLabels.js`, `src/ui/HUD.js` (`banner`), `style.css` (world labels ~323–359, `#banner` ~236–242, touch labels ~1096–1100)
- problem: In Brightwater, five or more NPC names and titles overlap each other, the quest tracker and the "Talent points" banner (seen at 667×375 and 1440×900). Enemy nameplates overlap when enemies stand together. A world-space POI marker drew over the zone name under the minimap. Banners at `top: 20%` cover the area where enemies and NPCs appear.
- change: Label budget: full name + title only for the nearest few NPCs (or the one under the reticle); others collapse to their marker; townsfolk titles only within a short range (already partly done on touch with `.far`). Simple screen-space de-overlap for nameplates (nudge vertically or hide the farther one). Fade labels that fall under HUD element rectangles. Move banners higher (just under the compass) and smaller on touch; queue them while in combat.
- acceptance:
  - [ ] Standing at Brightwater's hearth (0, 4) at 667×375, no two visible labels overlap and none overlaps the tracker, vitals or minimap.
  - [ ] Three enemies standing 2 m apart show readable, non-overlapping nameplates.
- notes:

### UX-10 Prompt and hint hygiene
- status: todo
- priority: P3 · size: S · platform: desktop
- files: `src/main.js` (`updateInteraction` ~1381–1391, `openGameMenu`, dialogue open paths), `src/ui/HUD.js` (`setPrompt`), `style.css` (`#mouse-hint` ~809, `#prompt` ~248)
- problem: Talking to Warden Maren on desktop, the "[E] Talk to Warden Maren" prompt stayed visible behind the dialogue. The "Click or press any key to take back the mouse" hint sits at 50 % + 46 px and the prompt at 63 %, so both stack over the character.
- change: Clear the prompt (and loot card) whenever a dialogue, menu or moment opens. Move the mouse hint above the reticle or make it a slim top-centre bar.
- acceptance:
  - [ ] With a dialogue open, `#prompt` is hidden.
  - [ ] Mouse hint and prompt never overlap at 1280×720 and 1920×1080.
- notes:

### UX-11 Dialogue: keyboard, focus, labels, placement
- status: todo
- priority: P2 · size: S · platform: both
- depends: UX-01 (phone layout part)
- files: `src/ui/DialogueUI.js`, `src/main.js` (keydown ~667–718), `style.css` (~390–425)
- problem: Options can only be clicked: no 1–9 shortcuts, no focus style on `.dlg-options button`. After accepting "Cold Sleep" from Warden Maren, the eyebrow switched to "Warden Contract" while she was talking about the story quest. The 660 px panel overlaps the right end of the HP bar at 1440×900. "Choose a response" adds noise.
- change: Number keys pick options (show the number in a small keycap on desktop; hide on touch). Arrow keys move focus; Enter picks; Esc leaves (already). Add the shared focus ring. Base the eyebrow on the line being spoken (or drop it after the first choice). Raise the panel above the vitals (or hide the bottom HUD during dialogue). Drop "Choose a response".
- acceptance:
  - [ ] Every option can be chosen by number key and by Tab + Enter, with visible focus.
  - [ ] The eyebrow never names a quest kind the line isn't about.
  - [ ] At 1440×900 and 1280×720 the dialogue doesn't cover the vitals.
- notes:

### UX-12 First-minute guidance
- status: todo
- priority: P2 · size: S · platform: both
- files: `src/ui/HUD.js` (`renderQuests`), `src/ui/GameMenu.js` (`storyNext`), `src/main.js` (`trackedOrder`, `questWaypoint`)
- problem: After the opening moment, the tracker is empty. The Journal knows "Next: Cold Sleep — Warden Maren has it", but the HUD doesn't say it; the player has to notice a small gold diamond over Maren.
- change: When no quest is active (or none tracked), show a "Next" card in the tracker with the story's next step and its giver (reuse `storyNext()` logic; move it somewhere both HUD and menu can call). Point the compass/waypoint at the giver. Tapping it on touch opens the journal (already wired for `#quests`).
- acceptance:
  - [ ] On a new game, right after the moment, the tracker reads "Next: Cold Sleep · Talk to Warden Maren" (or similar) and the compass points to her.
  - [ ] The card disappears once a quest is active.
- notes:

### UX-13 Settings: controls that show their state, help next to each setting
- status: todo
- priority: P3 · size: M · platform: both
- depends: UX-02
- files: `src/ui/GameMenu.js` (`settingsHTML`, `choice`, `toggle`, `CHOICES`, `onClick`), `style.css` (`.pm-*`)
- problem: Choice settings (Graphics quality, Antialiasing, Shadow map quality, Touch controls) are buttons that cycle on click and always render in the "on" style, so they look like toggles stuck on and hide the other options. The help is one long paragraph at the bottom of Display, far from the settings it explains. Columns are unbalanced (Sound has two rows, Display fourteen).
- change: Segmented controls (radio group semantics: `role="radiogroup"`, arrow keys) for choices. A one-line description under each setting that needs one; split the paragraph. Regroup: Sound · Controls (input-specific, see UX-06) · Graphics · Accessibility (UX-14).
- acceptance:
  - [ ] Every choice's options are visible and the current one is distinguishable without colour alone (fill + weight or a check).
  - [ ] No settings help text longer than two lines sits away from its setting.
- notes:

### UX-14 Accessibility and comfort options
- status: todo
- priority: P3 · size: M · platform: both
- depends: UX-05, UX-13
- files: `src/core/Prefs.js`, `src/ui/GameMenu.js`, `src/render/PostFX.js` `(check: where brightness/gamma fits)`, `style.css`
- problem: Nights get very dark (enemies and the player become near-black silhouettes at 1440×900; observed outside Brightwater). Rarity is shown by colour alone in the inventory grid, the hot bar and drop beams. Only camera shake can be reduced; low-health vignette pulsing, hit flashes, speed lines and banner animations have no reduce-motion option.
- change: Add Brightness (or night brightness), a Reduce motion/flashes toggle (honour `prefers-reduced-motion` as its default), and a rarity marker that isn't only colour (a letter or pip count on tiles and slots — see UX-15). Optionally subtitle/dialogue text size (covered by UI scale if UX-05 scales dialogue).
- acceptance:
  - [ ] A night scene at Brightness max shows enemy silhouettes and NPC faces clearly (before/after screenshots).
  - [ ] With Reduce motion on, no element pulses or flashes more than once per second.
- notes:

### UX-15 Inventory layout
- status: todo
- priority: P2 · size: M · platform: both (worse on phones)
- depends: UX-03
- files: `src/ui/InventoryUI.js` (`render`), `style.css` (~427–470, ~880–891)
- problem: Weapons and Armour are vertical columns of 82 px tiles, leaving most of the left panel empty on desktop and pushing the backpack below the fold on phones (at 667×375 the first screen shows no backpack at all). The detail panel says "Select an item." instead of showing something useful. Rarity in tiles is the bottom edge colour only.
- change: Lay equipment out in rows (weapons row, armour row) so the backpack starts on the first screen at 667×375 and 1280×720. Default the detail panel to the active weapon. Add a rarity pip/letter to tiles (`C U R E L` or 1–5 pips) and to the HUD weapon slots. Keep drag-and-drop and its glow targets.
- acceptance:
  - [ ] At 667×375 (touch) and 1280×720 the first row of the backpack is visible without scrolling.
  - [ ] Opening Inventory shows the active weapon's card.
  - [ ] Rarity is identifiable in a greyscale screenshot.
- notes:

### UX-16 Journal navigation
- status: todo
- priority: P3 · size: S · platform: both
- files: `src/ui/GameMenu.js` (`journalHTML`, `questsHTML`), `src/ui/JournalUI.js`, `style.css` (`.jr-tabs`, `.qtabs`, `.gm-wide`)
- problem: Three tiers of tabs (menu tabs → Quests/Achievements/Codex → Story/Side/Contracts), the lower two styled as `.filter` option buttons, and misaligned: the journal row spans 1280 px while the quest card is centred at 900 px.
- change: One secondary tab style (underline or pill) for both sub-rows, same width as the content below. Consider merging into one row: Story · Side · Contracts · Achievements · Codex.
- acceptance:
  - [ ] Sub-navigation looks different from option toggles (Threat, Loot filter).
  - [ ] Sub-tabs align with the content column at 1440×900.
- notes:

### UX-17 Map controls
- status: todo
- priority: P3 · size: S · platform: both
- files: `src/ui/MapUI.js`, `style.css` (~821–827, touch ~1131–1133)
- problem: Zoom, recentre and marker actions are gestures only, explained by one long line that's truncated with an ellipsis on phones ("…Tap an attuned waystone to fast trav…"). A single tap places a marker, easy to do by accident while panning. No legend for markers and colours.
- change: On-screen buttons: zoom in, zoom out, centre on me, clear marker. Short help in a collapsible "?" panel with a legend. On touch, place a marker with a long-press (or a "Place marker" mode) and use tap to select/inspect.
- acceptance:
  - [ ] Every map action has a visible control at 667×375 and 1440×900.
  - [ ] No instruction text is truncated.
- notes:

### UX-18 Controls reference
- status: todo
- priority: P3 · size: S (M with rebinding) · platform: both
- needs: DEC-UX-2
- files: `src/ui/GameMenu.js` (`CONTROLS`, `controlsHTML`), `style.css`
- problem: Four equal columns (Movement, Combat, World, Touch) wrap long sentences into narrow columns; keys are plain text. Desktop players see the Touch column first-class, touch players see three keyboard columns.
- change: Show the current input's controls first (or only, with a toggle for the other). Render keys as `<kbd>` keycaps. For touch, a small labelled diagram of the button layout beats prose. Rebinding only if DEC-UX-2 says so.
- acceptance:
  - [ ] Touch players land on touch controls; desktop players on keyboard/mouse.
  - [ ] Keys render as keycaps.
- notes:

### UX-19 Title screen on phones
- status: todo
- priority: P3 · size: S · platform: mobile
- depends: UX-01, UX-02
- files: `src/ui/TitleMenu.js`, `style.css` (~534–599, ~1114–1117)
- problem: At 667×375 the logo takes the top half, menu items are 148×29 px and the Continue details ("Level 3 · Brightwater Vale · 54g") are 6.7 px.
- change: Logo smaller on short screens; menu items ≥ 44 px tall at ≥ 16 px; Continue details ≥ 12 px; the menu may sit beside a smaller logo rather than under it.
- acceptance:
  - [ ] At 667×375, `uxAudit('#title')` minimum ≥ 11 px and `uxTargets('#title button')` heights ≥ 44.
- notes:

### UX-20 Small fixes
- status: todo
- priority: P3 · size: S · platform: both
- files: `style.css`, `src/ui/HUD.js`, `src/ui/GameMenu.js`
- change and acceptance:
  - [ ] Empty weapon slot: `.slot .name` uses `color: var(--rc)`, which is `transparent` for an empty slot, so only its shadow shows. Give empty slots a muted label colour (or no label) — `style.css` ~284, `HUD.renderSlots`.
  - [ ] HUD weapon slot type label is 8.5 px at 0.7 opacity on desktop; raise to the type floor or drop it (the weapon card already names the type).
  - [ ] XP text under the bar is 10 px at 0.8 opacity; raise to ≥ 11 px or show it on hover/level-up only.
  - [ ] `GameMenu.onClick` `respec` case has an unreachable `this.renderTab(); break;` after the block's `break` (~311–313). Harmless (`refreshMenus` redraws), but remove it.
  - [ ] Done quest objectives use opacity 0.45 (4.1:1) plus strike-through; use a muted colour token at ≥ 4.5:1.
- notes:

### UX-21 Online screens pass (not reviewed live)
- status: todo
- priority: P3 · size: M · platform: both
- depends: UX-01, UX-02
- files: `src/ui/TitleMenu.js` (sign-in, character list, creator), `src/ui/ChatUI.js`, `src/ui/SocialUI.js`, `src/ui/PartyUI.js`, `src/ui/TradeUI.js`, `src/ui/RaidUI.js`, `style.css` (~570–626, ~893–981, ~1187–1227)
- problem: These screens weren't exercised in the browser. From the code they share the same risks: `.tt-look button` 26×26, `.tr-panel` and invite bars zoomed on short screens, chat at 12–13 px, raid frames at 12.5 px names and 3 px health bars, character delete as a 44 px "✕" next to Play.
- change: Run sections 2 and 4 against a local server (`npm start`, port 8080, **never the user's running one** — start a throwaway one on another port with its own `DATA_DIR`) and append findings here as new tasks.
- acceptance:
  - [ ] Sign-in, character create/delete, chat open/closed, party invite, trade and raid frames checked at 1440×900 and 667×375; findings filed as tasks.
- notes:

---

## 6. Suggested order

1. **UX-01 + UX-02** together (one session owns `style.css` while doing them). Then UX-19 and UX-08, which are small once the type scale exists.
2. **UX-03** (independent of styling; can run in parallel with 1 if it stays in `InventoryUI.js` and touches only new CSS rules).
3. **UX-06**, **UX-12**, **UX-10** — small, high-value, mostly JS.
4. **UX-05**, **UX-07**, **UX-11**, **UX-15**, **UX-04**, **UX-09**.
5. **UX-13**, **UX-14**, **UX-16**, **UX-17**, **UX-18**, **UX-20**, **UX-21**.

Two sessions must not edit `style.css` at the same time.

---

## 7. Progress log

- 2026-10-15 — Plan created from a review at 1280×720, 1440×900, 1920×1080, 667×375 (touch emulated), 390×844 portrait. `.claude/launch.json` pointed at an old checkout (`C:/Users/aiden/Documents/cel-blade/serve.py`); fixed to `serve.py` so the `game` preview starts.
