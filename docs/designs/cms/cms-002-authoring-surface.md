---
code: CMS-002
title: Authoring surface
domain: cms
prd_refs: [CMS-002, CMS-R04, A11Y-R01, A11Y-R02]
depends_on: [CMS-001, ADMIN-002]
depended_by: [RPT-001, POST-001, DECK-001]
layers_touched: [service, api, frontend, ui]
cross_cutting_rules: [CMS-R04, A11Y-R01, A11Y-R02, A11Y-R03, I18N-R01]
status: design-ready
---

# `CMS-002` — Authoring surface

## 1. Purpose and PRD refs

The editor an admin writes in. Realizes `CMS-002` and carries `CMS-R04`.

Its test is the one PRD §7.3 sets: **can the person who knows what happened this
month put it in front of investors, correctly, without asking a developer?** An
editor that requires knowing Markdown, or that silently loses a paragraph when a
paste goes wrong, fails that test while being fully built.

## 2. Layer walkthrough

**Down.** The editor produces the block array `CMS-001` defines and nothing else.
The same validator runs in the browser, so an invalid document is impossible to
compose, and on the server, because a browser-side validator is a convenience and
never a boundary.

**Up.** A block list, keyboard-first, with the block type visible on each block
rather than inferred from how it looks. Saving is explicit and the unsaved state
is stated — an editor that autosaves silently is one where an author cannot tell
whether their work is safe.

## 3. Contracts

### The blocks, as controls

| Block | How it is added | What it demands |
|---|---|---|
| `heading` | `/h2`, `/h3`, or the block menu | Text |
| `paragraph` | typing | Text; marks by selection |
| `list` | `/list`, `/numbers` | At least one item |
| `quote` | `/quote` | Text; attribution optional |
| `image` | `/image`, or dropping a file | **Alternative text, required before the block can be saved** |
| `figure` | `/figure` | A caption and the numbers behind it |
| `divider` | `/---` | — |

**An image block without alternative text does not save.** Not a warning, not a
lint — the save is refused with the field focused. Every other placement of this
rule in the industry produces documents full of empty `alt`, because a warning
at the end of a long piece of writing is a warning nobody reads (`A11Y-R02`).

### Marks

Bold, italic, code and link, applied to a selection and stored as offsets over
the paragraph's plain text (`CMS-001`). The editor never holds a DOM as its
model; it holds the block array and renders it. That is what keeps a paste from
importing a foreign stylesheet, and it is why paste is **plain text plus
recognised structure** — headings, lists and links survive, everything else
becomes a paragraph.

### Saving

    POST /admin/content/<id>/draft   { blocks }

Explicit, on a control and on `Ctrl/Cmd-S`. The unsaved state is visible in a
persistent line rather than a toast that has already disappeared by the time an
author looks up. Leaving the page with unsaved blocks warns.

Between saves, the block array is kept in the browser's local storage under the
item's id, and offered back if the tab is closed and reopened. That is a
convenience and is stated as one — the server's draft is the truth, and the local
copy is discarded the moment a save succeeds.

### Validation, twice

The same schema module runs in both places. The server's answer is
authoritative and names the block index and the field, so an error is actionable
rather than "invalid document". The browser's answer exists so the author never
reaches the server with something it will refuse.

### Accessibility

The editor is a list of blocks and is operated as one: arrow keys move between
blocks, `Enter` makes a new one, `Backspace` at the start merges. Every control
has a name from the dictionary (`I18N-R01`, `A11Y-R02`), focus is visible on the
block being edited, and the block-type menu is reachable without a pointer
(`A11Y-R01`). This is an admin surface and the two roles are small, and none of
that is a reason to build a surface one of them could not use.

## 4. Integration

**`CMS-001`** defines the blocks and owns the validator this surface shares.
**`ADMIN-002`** is the console this lives inside. **`CMS-003`** handles the
image a `/image` block references. **`CMS-004`** is where the finished draft is
previewed and published — this surface never publishes.

## 5. Cross-cutting compliance

- **`CMS-R04`** — structured blocks; no markup crosses the form.
- **`A11Y-R01`**, **`A11Y-R02`** — keyboard-operable, named controls, and a
  required alternative text that blocks the save rather than warning.
- **`A11Y-R03`** — the editor is on the same dark ground as the room and its
  contrast is measured there.
- **`I18N-R01`** — every label from the dictionary.

## 6. Open questions and trade-offs

- **A block editor is a large thing to build.** A textarea of Markdown would be
  a tenth of the work. It is rejected in `CMS-001` for reasons that are about
  translation and search, and the cost lands here. The mitigation is scope: seven
  block types, no tables, no columns, no embeds.
- **No collaborative editing.** One draft, one author at a time
  (`CMS-001` §6). A second admin opening the same item sees the draft
  read-only with who has it open, which is a lock rather than a merge and is
  honest about being one.

## 7. Task list

- `CMS-002/T1` — A block list the author operates by keyboard, with each block's type visible
- `CMS-002/T2` — The seven block types, each with the fields its schema requires
- `CMS-002/T3` — An image block cannot be saved without alternative text
- `CMS-002/T4` — Marks by selection, stored as offsets, with the editor's model the block array and not the DOM
- `CMS-002/T5` — Paste imports plain text plus recognised structure and nothing else
- `CMS-002/T6` — Explicit save, a visible unsaved state, and a local copy offered back after a closed tab
- `CMS-002/T7` — One schema module validates in the browser and on the server, and the server's error names the block and the field
