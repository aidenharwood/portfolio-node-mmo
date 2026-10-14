# Act II — The Brood: story design

> **Date:** 2026-10-14
> **Scope:** the Act II slice of the story bible (DEC-1), and the Act II beat sheet (DEC-9). The tech tasks A-1 to A-4 in [`WORK_PLAN.md`](../../WORK_PLAN.md) are unchanged by this spec except where noted in section 6.
> **Levels:** 8–16. **Hub:** Farcall (`city2`). **Dungeon:** the Brood Pits (exists). **Raid:** the Brood Mother (exists; the story opens its gate).

---

## 1. Goal

Give players past level 8 an authored arc that:

- answers Act I's cliffhanger (the Sunken Vault "was never a door, it was a lid");
- uses the Hive Surge event and the Brood Pits that already exist;
- ends at the Brood Mother's raid gate without requiring a raid clear;
- sets the flags Acts III and IV read, and seeds Act III (the Synths waking).

---

## 2. Lore (Act II slice of DEC-1)

These facts are decided. Acts III and IV must not contradict them.

- **The Hive** came down on the Pilgrim as sealed cargo: spores.
- **The first Wardens:**
  - When the Hive got loose after the landing, the founding Wardens found a Maker listening station at Farcall, the **Farcall Array**.
  - They re-tuned it to broadcast a **lullaby**, a signal that keeps the Hive dormant.
  - They hid the Array's controls behind a Maker seal: the **Sunken Vault**.
- **The fail-safe:**
  - The seal was a dead-man's switch. Opening it flips the Array from hush to *call*.
  - It was a safeguard against anyone taking over the station.
- **The Wardens' forgotten purpose:**
  - The order was founded to guard the seals. Over generations that purpose became ritual, and then it was forgotten.
  - Warden Maren and High Warden Ashe know the Wardens only as a militia.
  - **Old Ysolde** is the last keeper of the true history. She suspected what the vault was, and let the player go anyway, half-hoping she was wrong.
- **Act I recast:**
  - Ironjaw dug up a seal, and the player turned the key.
  - The fail-safe tripped, and the Array began calling the Hive up onto the settlements.
  - The Pilgrim's "No — seven, wait" was a warning: it knew.
- **The Pilgrim's voice:**
  - It is still on the player's side, but it holds back. It knew about the seals and didn't explain in time.
  - Act II seeds doubt without making it a villain. What the Pilgrim wants is Act IV's question.
- **Act III seed:**
  - Destroying the Array sends a death-pulse up the Maker network.
  - The Makers' old guardians, the **Synths**, take it as an attack, and they wake.

Still open in DEC-1: what the Synths' true orders are, what the Makers are, and what each ending means.

---

## 3. Beat sheet (DEC-9)

Objective types are ones the quest system already has, plus A-2's event hook and A-6's dungeon clear. Givers use the existing NPC ids: `warden` (Maren), `sage` (Ysolde) and `city1:warden` (Ashe). The Farcall captain is new (`city2:warden`, name open, section 5).

| # | Quest | Lvl | Giver | Objectives | What happens |
|---|---|---|---|---|---|
| 1 | **The Road to Farcall** | 8 | `city1:warden` | talk, goto | Ashe has had no word from Farcall for weeks and sends the player there. Farcall's hub opens, and its Warden captain becomes the act's local giver. |
| 2 | **Gone Quiet** | 9 | `city2:warden` | goto, use, kill | Three hamlets past Farcall have gone silent, with spore pods rooted outside them. Burn the pods. A survivor says the masts "started singing wrong". |
| 3 | **Hold the Line** | 10 | `city2:warden` | event hook (A-2) | A quest-started Hive Surge on a named settlement. Taking part counts. Afterwards: the Hive is moving *toward* something. |
| 4 | **The Farcall Array** | 11 | `city2:warden` | goto, use, defend | Follow the swarms to the Array. Power down the first console while holding off waves. Moment `array`: Warden sigils welded onto Maker machinery. The Pilgrim: *"They built a lullaby. You woke it screaming."* |
| 5 | **Ysolde's Confession** | 11 | `sage` | talk, choose | In Brightwater, Ysolde tells the truth about the Wardens' founding. **Choice** (section 4). Her opening line depends on Act I's `trusted_ysolde` / `kept_secret`. |
| 6 | **Voice in the Chitin** | 12 | `city2:warden` | kill named foe, collect | A Hive Psion is directing the swarms. Kill it, and its chitin carries the Brood Pits' coordinates. |
| 7 | **Into the Brood Pits** | 13 | `city2:warden` | dungeon clear | The existing dungeon, down to the Brood Matron. |
| 8 | **What the Matron Knew** | 14 | `city2:warden` | talk, use | Reading the Matron's nest-node shows the Array's call feeding a deeper nest: the Brood Mother's. |
| 9 | **Silence the Array** | 15 | `city2:warden` | defend, use | Destroy the transmitter under heavy waves. Moment `deathpulse`: every waystone flickers red, and far off something metal answers. The Array's fate is fixed; there is no choice here. |
| 10 | **Marshal the Wardens** | 15 | `city1:warden` | talk | The war table, which introduces raid groups. Varies by the section 4 choice. |
| 11 | **The Gate Opens** | 16 | `city1:warden` | goto | Sets the flag that opens the Brood Mother raid gate (rule: DEC-4). |
| 12 | **Report to Ashe** | 16 | `city1:warden` | talk, moment | Act II closes with moment `act2end`, and Act III is seeded: reports of Synth movement in the highlands. |

The story is completable without the raid. It ends when the gate opens, and Act III must not require a raid clear.

---

## 4. The choice

Act II has **one** choice, at quest 5.

| Option | Flag | Effect in Act II | Carried forward |
|---|---|---|---|
| Tell Ashe the Wardens' true purpose | `told_ashe` | Ashe is shaken, and Ysolde loses standing. At quest 10 Ashe leads the war table openly on the truth; Ysolde is absent. | The Wardens act knowingly in Act III. |
| Keep it between you and Ysolde | `kept_wardens_secret` | Ysolde stays the player's confidante. At quest 10 Ashe leads, and Ysolde quietly sends a token. | Ysolde is an ally; the secret is leverage later. |

Act I flags read in Act II (dialogue only, no branching):

- `trusted_ysolde`: Ysolde comes to the player ("You told me about the voice. I owe you the same.").
- `kept_secret`: the player confronts her with what they saw at the Array.
- `krell_freed`: Krell appears at quest 2 as a scav whose crew was also hit, and gives a bark and a hint.
- `krell_captured`: Ashe mentions at quest 1 or 12 that Krell spoke of other "lids".

Lines quoted in this spec are proposals. The user owns the final dialogue.

---

## 5. Open items (not decided here)

- The Farcall Warden captain's name and voice.
- The name of the founding Warden whose sigil is on the Array, if one is named at all.
- The rest of DEC-1: what the Synths' true orders are, what the Makers are, and the meaning of the endings.
- DEC-4, the raid gate rule (tech, task A-3).

---

## 6. Flags, code notes and work-plan changes

**New flags** (all go in A-1's registry):

`act2_started`, `hamlets_cleared`, `array_found`, `told_ashe` | `kept_wardens_secret`, `psion_slain`, `matron_read`, `array_destroyed`, `broodgate_open`, `act2_done`.

Acts III and IV read `told_ashe` / `kept_wardens_secret` and `array_destroyed`.

**Code notes:**

- `src/world/Gen.js:118` can randomly name a procedural landmark "Farcall Array". Task A-4 removes "Farcall" from that pool so it can't clash with the story place.
- Confirm that a Hive Psion enemy tag and the Brood Matron boss tag exist before A-6. Add named-foe tags if they don't.
- New moments: `array`, `deathpulse`, `act2end`, plus an `act2` title card on quest 1.

**WORK_PLAN.md changes** (apply when this spec is approved):

- Replace the proposed beat sheet under "Act II — The Brood" with section 3 of this spec.
- A-7: change "both Act II choices" to "the Act II choice".
- DEC-1: record section 2 as the Act II answer. The rest stays open.
- DEC-9: set to `decided`, pointing at this spec.

---

## 7. Testing

Unchanged from A-5 to A-7, with these additions:

- `tools/questcheck.mjs` plays Act II start to finish on **both** branches of the quest-5 choice.
- It also covers each Act I flag combination (`trusted_ysolde` / `kept_secret` × `krell_captured` / `krell_freed`), to check that every dialogue variant resolves (no missing keyed lines).
- The act never reads a flag it doesn't set or inherit from Act I (A-1's check).
