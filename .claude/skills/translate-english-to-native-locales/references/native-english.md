# Native English — suppressing the AI tells and writing like a person

This file makes "write English like a competent human" *repeatable* rather than *lucky*. English is the model's strongest language, so the failure mode is rarely grammar — it is the **AI signature**: the tics that make competent, correct prose read as machine-generated. A reader who has seen a lot of LLM output recognizes it in one paragraph. This guide names those tics so they can be suppressed on purpose.

`lint_style_patterns.py` catches only a slice of them (a handful of words). **A clean lint is not proof the writing sounds human.** The list below is the real check; the linter is a coarse net.

## 1. The AI tells — name them and cut them

Each row: the tic → why it reads as machine → the fix. Not an absolute ban; keep any of these when it is genuinely the most precise choice. But default to cutting.

| Tell | Why it reads as AI | Fix |
|---|---|---|
| Signpost padding: "It's worth noting that", "It's important to note", "Keep in mind that" | Pure filler; delays the point. | Delete the frame, state the point. |
| Grand openers: "In today's fast-paced world / digital age / ever-evolving landscape" | Empty throat-clearing. | Delete; open on the actual subject. |
| Register/verb inflation: leverage, utilize, facilitate, empower, unlock, elevate, foster, harness, streamline, spearhead | Corporate thesaurus; hollow. | Plain verbs: use, help, let, run, build, lead. |
| Vibe adjectives: robust, seamless, comprehensive, cutting-edge, transformative, pivotal, holistic, world-class | Say nothing verifiable. | Replace with the concrete fact, or cut. |
| "delve into", "navigate the complexities of", "tapestry", "realm", "testament to", "at the forefront", "underscore" | The most-flagged LLM vocabulary. | Say it plainly: look at, handle, area, shows, highlight. |
| Tricolon addiction — three parallel items in almost every sentence ("fast, reliable, and scalable") | Rhythm gives the machine away. | Keep three only when all three carry weight; otherwise one or two. |
| "Not only … but also" as decoration | Inflates a plain point. | Split into two clauses, or state directly. |
| Em-dash overuse — one or more per sentence — as the default connector | A known LLM habit. | Vary: comma, colon, full stop, parentheses. Reserve the dash. |
| "By [verb]-ing X, you can Y" opening many sentences | Repetitive calqued cause frame. | Vary sentence openings; use a plain subject–verb. |
| "This means that" / "What this means is" | Padding before the consequence. | Join to the prior clause, or "So …". |
| Hedge-then-overclaim ("This may help you completely eliminate…") | Contradictory; a certainty tell. | Pick one honest level (see §5). |
| Signposting overload: "Firstly… Furthermore… Moreover… In conclusion" | Mechanical scaffolding. | Use a connector only when it marks a real relation. |
| "That being said", "At the end of the day", "When it comes to X" | Verbal filler. | Delete or replace with the real relation. |
| "Whether you're X or Y, …" audience-catch-all | Marketing template. | Address the actual reader directly. |
| "simply", "just", "effortlessly", "with ease" | False-ease tell; often untrue. | Cut; if it is genuinely simple, the steps show it. |
| Corporate nouns: solutions, offerings, verticals, synergy, ecosystem (as filler) | Brochure-speak. | Name the actual thing: the platform, the tool, the feature. |

## 2. Pick one English convention and hold it

Determine US or UK (or another) from the controlling artifact or context, then stay consistent — mixing is a tell.

| Axis | US | UK |
|---|---|---|
| Spelling | color, organize, center, license (n/v) | colour, organise, centre, licence (n) / license (v) |
| Date | Month D, YYYY / MM/DD/YYYY | D Month YYYY / DD/MM/YYYY |
| Quotes | double "…", period **inside** quotes | single '…' common, punctuation **outside** unless part of quote |
| Oxford comma | usually yes ("a, b, and c") | often no ("a, b and c") — follow house style |
| Vocabulary | apartment, elevator, fall, gotten | flat, lift, autumn, got |

## 3. Realization mechanics (UI / HTML / buttons)

- **Heading/button case:** follow the product's house style. Sentence case ("Start video date") is the modern default; Title Case ("Start Video Date") is common in US product UI. Do not mix both in one surface. Never ALL-CAPS unless the template calls for it.
- **Numbers:** thousands separator "1,000"; decimals "3.5"; percent attached "20%".
- **Currency:** "$1,000", "£1,000".
- **Quotes/apostrophes:** use typographic " " ' ' when the surface supports them; be consistent.
- **UI length:** English is usually the shortest of these three languages — do not pad a button to fill space. Buttons are verbs ("Retry", "Send", "Start").
- **Error messages:** say what happened and the next useful action; do not blame the user ("We couldn't connect — check your connection and try again").

## 4. Sentence and paragraph discipline

- **Vary sentence length.** Uniform medium-length sentences are an AI rhythm. Mix short and long on purpose.
- **One job per paragraph;** lead with the point, then support it.
- **Every transition earns its place** — cause, contrast, consequence, sequence, or narrowing. A connector with no relation behind it is noise.
- **Cut sentences that only exist to sound professional.** If a sentence adds no information, delete it.
- **Do not fake humanity** with slang, errors, or forced quirk. Natural ≠ sloppy. The goal is a competent human writer, not a performance of one.

## 5. Calibrate certainty honestly

English makes over-claiming easy. Keep the modal honest:
- `will` = commitment/guarantee. Use only when true.
- `reduces / helps / supports` = real but bounded effect.
- `may / can` = possibility.

Weak: "The control **will eliminate** unauthorized access."
Honest: "The control **reduces** unauthorized-access risk by enforcing role-based approvals; its effect still depends on policy coverage."

## 6. Before → after (paragraph level)

**AI-inflated source:**
> Amavo leverages a robust and comprehensive trust and safety framework that enables organizations to seamlessly enhance member protection while optimizing operational efficiency. Furthermore, our transformative approach ensures that harmful content is eliminated, fostering a safe environment for all users.

Diagnosis: leverages · robust · comprehensive · enables · seamlessly · enhance · optimizing · Furthermore (cosmetic) · transformative · **"ensures … eliminated" and "for all users" (false certainty)**.

**Rewrite (plain, honest, no invented specifics):**
> Amavo helps trust and safety teams find and act on harmful content. It pairs automated detection with human review, so moderators aren't checking every post by hand — the system surfaces what needs a closer look, and the team decides what to do. It fits into your existing moderation workflow rather than replacing it.

Note what changed: the false guarantee ("eliminated", "for all users") became a bounded, honest claim ("find and act on", "surfaces what needs a closer look"), and no specific capability, number, or integration was invented. That line — writing well without over-claiming — is the one that matters most for regulated or safety-facing copy.
