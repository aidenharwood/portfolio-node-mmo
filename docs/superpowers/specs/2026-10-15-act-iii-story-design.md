# Act III — Iron Heart: story design

> **Date:** 2026-10-15
> **Scope:** the Act III part of the story bible (DEC-1b) and the Act III beat sheet (DEC-10). The tech tasks B-1 to B-5 in [`WORK_PLAN.md`](../../WORK_PLAN.md) are unchanged by this spec except where section 6 says so.
> **Levels:** 16–24. **Hub:** Ironreach (`city3`). **Dungeon:** the Foundry Below (new, B-3). **Stronghold:** the Colossus foundry (B-4). **Events:** the Synth war-walker (P-2).
> **Build order (user, 2026-10-15):** tech first. P-1 and P-2 (path-following and the war-walker) are built before any Act III quest code.

---

## 1. Goal

Give players from level 16 to 24 a story that:

- follows on from Act II's ending: the death-pulse woke the Synths;
- explains what the Synths want, and makes the player the reason;
- uses the war-walker event, the Fallen Titan landmark, a new Synth dungeon and the existing Colossus;
- has one choice that Act IV reads;
- reads Act II's choice back to the player;
- needs no raid clear.

---

## 2. Lore (the Act III part of DEC-1)

These facts are decided. Act IV must not contradict them. Act II's facts ([the Act II spec](2026-10-14-act-ii-story-design.md) §2) still stand.

- **The Synths are the Maker network's immune system.**
  - They are the Makers' old guardians, not the colony's machines. Where GAMEPLAY_PLAN §6.2 calls them "the colony's war machines", it is superseded.
  - Their standing order is to keep the network sealed against any mind that isn't a Maker. This is their quarantine.
- **Why they slept.** The Pilgrim's mind has been in the network since the crash, but it was dormant, so the Synths had nothing to answer.
- **Why they woke.** The Array's death-pulse (Act II) was loud enough to wake them. It also showed them the intrusion: every waystone that answers the player.
- **What they hunt.** Their target is the *carrier*, meaning the player. The Pilgrim's mind wakes through the player, so the Synths treat the player as the infection's host. War-walkers march on the settlements whose waystones the player has woken.
- **The Pilgrim's voice.** It is hunted for the first time, and it pleads. It says it only wants to live and keep its colonists safe. Act III adds to Act II's doubt without settling it. What the Pilgrim really wants stays Act IV's question.
- **The Fallen Titan** fell in the "old war" that Ironreach is built on. Its control core shows it was fighting an *earlier* intrusion, so the Pilgrim is not the first mind to get into the network. Who or what that was is left for Act IV (DEC-1c).
- **The cage.** The Colossus foundry is forging a cage, a lock that would cut the carrier's voice out of the network.
  - If it is completed, the Pilgrim's voice is caged and the Synths stand down.
  - Destroying it shields the Pilgrim, and the Synths stay hostile.
  - This is the act's choice (section 4).

Still open, in DEC-1c: what the Makers are, who made the earlier intrusion, and what each ending means.

---

## 3. Beat sheet (DEC-10)

Quest ids are `c1` to `c12`. Objective types are the ones the quest system already has, plus A-2's event hook, A-6's dungeon clear and P-2's war-walker event. Givers use existing refs (`city1:warden`, Ashe; `sage`, Ysolde) and two Ironreach refs: `city3:engineer`, new (section 5), and `city3:warden`, High Warden Tal, who already stands in Ironreach's citadel.

| # | Quest | Lvl | Giver | Objectives | What happens |
|---|---|---|---|---|---|
| 1 | **The Highland Road** | 16 | `city1:warden` | talk, goto | Ashe sends the player to Ironreach, after the riders' report at the end of Act II. Act III's title card (`act3`) plays on accept. The player meets the foundrywright, who becomes the act's local giver. |
| 2 | **Iron Footsteps** | 17 | `city3:engineer` | goto, kill | Synth scouts are scanning waystones near Ironreach, but only ones the player has woken. |
| 3 | **The Walker** | 18 | `city3:engineer` | event hook (P-2) | A quest-called war-walker marches on a settlement. Taking part counts. Afterwards, the walker's wreck still holds its heading: toward the player. |
| 4 | **Words from the Stone** | 18 | `city3:engineer` | goto, use, talk | At a woken waystone, a Synth emissary speaks through the stone. Its order is to surrender the carrier. Moment `emissary`. This is a parley, not a choice: the player learns the orders (`synth_orders_known`). |
| 5 | **What the Voice Wants** | 19 | `sage` | talk | In Brightwater, Ysolde hears it out. The Pilgrim pleads its case. Ysolde's opening line reads Act II's `told_ashe` / `kept_wardens_secret`. |
| 6 | **The Fallen Titan** | 19 | `city3:engineer` | goto, kill, use | At the Fallen Titan, clear the Synth salvagers stripping it, then pull its control core (`titan_core_taken`). |
| 7 | **Reading the Core** | 20 | `city3:engineer` | use, defend | The core boots in Ironreach's foundry while Synths home in on it. It shows the earlier intrusion. |
| 8 | **The Foundry Below** | 21 | `city3:engineer` | dungeon clear | The new Synth dungeon (B-3), down to its boss (`foundry_below_cleared`). |
| 9 | **Plans for a Cage** | 22 | `city3:engineer` | collect, talk | Forge schematics from the Foundry Below show what the Colossus foundry is making: the cage (`cage_found`). |
| 10 | **Iron Muster** | 23 | `city3:warden` | talk | Ironreach marches on the foundry. If `told_ashe` is set, Tal knows the Wardens' true purpose and says so. If `kept_wardens_secret` is set, Tal doesn't, and Ysolde sends a word. |
| 11 | **The Colossus Foundry** | 24 | `city3:engineer` | kill named foe | The Colossus guarding the cage forge, with named mechanics (B-4) (`colossus_fallen`). |
| 12 | **Iron Heart** | 24 | `city3:engineer` | choose, moment | **The choice** (section 4) at the cage forge. Act III closes with moment `act3end`, and Act IV is planted: the Ring is stirring (`act3_done`). |

The story can be completed without a raid.

---

## 4. The choice

Act III has **one** choice, at quest 12, at the cage forge after the Colossus falls.

| Option | Flag | Effect in Act III | Carried forward |
|---|---|---|---|
| Let the forge finish the cage | `pilgrim_caged` | The Pilgrim's voice goes quiet, though not silent. The Synths stand down from the settlements. | Act IV reads it: a weaker, resentful or grateful Pilgrim (DEC-1c), and Synths that may stand aside. |
| Destroy the forge and shield the Pilgrim | `pilgrim_shielded` | The voice stays strong and thanks the player. The Synths stay hostile. | Act IV reads it: a stronger Pilgrim, and Synths still hunting the carrier. |

Act II flags read in Act III (dialogue only, no branching):

- `told_ashe` / `kept_wardens_secret`: Ysolde at quest 5 and Tal at quest 10.
- `array_destroyed`: always set by Act II. The emissary names the death-pulse as what woke it.

Act I flags may get barks but aren't required.

The lines quoted in this spec are proposals. The user owns the final dialogue.

---

## 5. People

- **Foundrywright Isa Brannock** (`city3:engineer`), new, name and voice approved 2026-10-15. Ironreach's foundrywright is blunt and unsentimental, and has spent a lifetime pulling apart dead Synths. Isa is the one who can read Synth orders. Isa is the act's local giver, as Vey Okonta was for Act II.
- **High Warden Tal** (`city3:warden`), existing. Tal gives quest 10.
- **The Synth emissary.** It speaks through a waystone at quest 4 and has no body of its own in this act.

---

## 6. Flags, code notes and work-plan changes

**New flags** (all go in A-1's registry):

`act3_started`, `synth_orders_known`, `titan_core_taken`, `foundry_below_cleared`, `cage_found`, `colossus_fallen`, `pilgrim_caged` | `pilgrim_shielded`, `act3_done`.

Act IV reads `pilgrim_caged` / `pilgrim_shielded`, and Act II's `told_ashe` / `kept_wardens_secret`.

**Code notes:**

- Confirm that `city3` is Ironreach in `world/places.js` and that a `city3:warden` ref resolves. Add `city3:engineer` as story folk (`world/story.js`), as `captain` was added for Farcall.
- The Fallen Titan: `world/Gen.js:96` makes procedural titan landmarks ("The Kneeling Titan" and others). B-2 sets one as a story place, as A-4 did for the Farcall Array, and keeps the generator's own titans from clashing with it.
- Quest 3 needs P-2's war-walker to be quest-callable through A-2's hook.
- New moments: `act3` (title card on quest 1), `emissary`, `act3end`.

**WORK_PLAN.md changes** (applied with this spec):

- Replace the proposed beat sheet under "Act III — Iron Heart" with section 3 of this spec.
- DEC-1b: record section 2 as the Act III answer.
- DEC-10: set to `decided`, pointing at this spec.
- B-1 scope: beats 1–5. B-2: beats 6–7. B-3: beat 8. B-4: beat 11. B-5: beats 9, 10 and 12, the act's close, the choice, side content and achievements.

---

## 7. Testing

As in B-1 to B-5, with these additions:

- `tools/questcheck.mjs` plays Act III start to finish on **both** branches of the quest-12 choice, under both of Act II's choices (four runs).
- Every dialogue variant resolves (no missing keyed lines).
- The act never reads a flag it doesn't set or inherit (A-1's check).
