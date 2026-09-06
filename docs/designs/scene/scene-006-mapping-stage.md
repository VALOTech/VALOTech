---
code: SCENE-006
title: The mapping stage
domain: scene
prd_refs: [SCENE-006, SCENE-R03, SCENE-R04, SCENE-R05]
depends_on: [SCENE-001]
depended_by: []
layers_touched: [scene, frontend, ui]
cross_cutting_rules: [SCENE-R03, SCENE-R04, SCENE-R05, A11Y-R01]
status: implemented
---

# `SCENE-006` — The mapping stage

## 1. Purpose and PRD refs

*How your people fit in* is the chapter the whole argument turns on: it is where
a reader who has been told about an AI workforce finds out what is left for them
to do. It is composed as three columns — your people on one side, the AI
workforce on the other, one world between them — and it is the only chapter whose
station is the centre of the frame. Realizes `SCENE-006`.

It is also the chapter the owner singled out as already right, which is why its
composition is described here in the terms that make it right rather than in the
terms that make it easy to change.

## 2. Layer walkthrough

**Down.** Above 1120px the chapter becomes a scroll stage — 440vh tall, its panel
sticky — and the two columns hold a centre channel of `min(33vw, 440px)` that
belongs to the planet. The chapter's scrim opens in the middle to match, so the
argument sits on solid ground either side and the channel stays open sky.

**Up.** Nothing reads from the stage.

## 3. Contracts

### The channel

`min(33vw, 440px)`, held open by the two columns and matched by a gap in the
chapter's own scrim. The world's station is the centre of the frame for this
chapter and no other: the reader is being shown two columns that belong on either
side of it, and a world parked to one side would make one column the near one
(`SCENE-R05` — it stays in sight, and here it stays in the middle).

### The pairs

Five correspondences, arriving one at a time. Stage is `floor(progress × 5)` over
the chapter's own travel; a pair at or below the stage is revealed, the pair at
the stage is lit. Each side enters from its own edge, un-blurring as it lands, so
the reader takes in one correspondence before the next appears instead of meeting
five at once.

The arriving-from-its-own-side detail is the point rather than the decoration:
the composition is an argument about two parties, and a pair that arrived from
one side would say the two are the same party.

### Below the breakpoint

No channel and no stage. The arrow does the joining, and every pair is simply
present. Under reduced motion at any width the same is true (`SCENE-R04`).

## 4. Integration

**`SCENE-001`** parks the world at the centre station for this chapter's length,
which is what the channel is for. **`SITE-003`** places the chapter third in the
sequence — after the answer and before the reasons to believe it — because the
reader's own place in the story is what makes the reasons worth reading.

## 5. Cross-cutting compliance

- **`SCENE-R03`** — the stepping is driven by scroll; nothing is scheduled between
  scrolls.
- **`SCENE-R04`** — reduced motion shows every pair at once. The chapter is
  complete without the stepping, which is the test: an effect the argument
  depends on is not an effect.
- **`SCENE-R05`** — the world stays in the channel for the chapter's whole length.
- **`A11Y-R01`** — the pairs are in document order and reachable regardless of
  which stage is lit; a keyboard does not have to scroll to reach a row.

## 6. Open questions and trade-offs

- **440vh.** Long enough that five arrivals are not a scramble, short enough that
  a reader who has understood the point is not held. The figure came from reading
  it at a viewport a second, not from a rule.

## 7. Task list

- `SCENE-006/T1` — A sticky three-column stage with a centre channel the world stands in
- `SCENE-006/T2` — Five pairs arriving one at a time, each side from its own edge
