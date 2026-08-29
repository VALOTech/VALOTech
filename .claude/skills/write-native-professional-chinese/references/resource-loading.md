# Resource loading map

Load only what the task needs.

| Task condition | Required resources |
|---|---|
| Microcopy or single short unit | `surface-profiles.md`; the native-language guide (`native-*.md`) — §3 realization and §2 register; language rules in `SKILL.md` |
| Multi-paragraph authoring or revision | `editorial-core.md`; the native-language guide (`native-*.md`); relevant surface profile; `review-rubric.md` |
| Weak, repetitive, translated-sounding, or AI-like source | `editorial-core.md`; the native-language guide (`native-*.md`); `examples.md`; `anti-patterns.md` |
| Legal, regulatory, contractual, or commitment-bearing content | `editorial-core.md`; `surface-profiles.md`; `review-rubric.md`; qualified review |
| Structured localization file | translation workflow; the target native-language guide; integrity scripts; `vendor-parser-policy.md` when applicable |
| Revising a document that already exists, or writing one that will be read later | `editorial-core.md` §8; `anti-patterns.md`; the artifact each claim refers to, reopened |
| Repeated terminology decisions | approved glossary and recorded language decisions |
| Formal evaluation | `evaluation-protocol.md` and the top-level evaluation kit |

The native-language guide names the translation-tics and AI-tics specific to the target language, together with its register, pronoun, and typography rules. It is the primary lever for native-sounding output — load it for any authoring, revision, or localization into that language, not just for long-form work.

A clean style-lint is not proof of naturalness: the linter matches a fixed pattern list, and text can pass it while still reading as translated or machine-written. Treat the native-language guide's tell list as the real check and the lint as a coarse backstop. Do not run style lint when a direct review against the guide is faster and more reliable.
