---
name: write-native-professional-english
description: Write or rebuild original professional English for slides, reports, web, UI, documentation, and code text. Use when English is the requested output and no source-language translation is required.
---

# Write native professional English

## Trigger boundary
Use this skill for the workflow stated in the description. Do not use an original-language writing skill for translation, or the translation skill for original-language composition.
Improving text that already exists in this skill's language, with no source document supplied to match, is original-language revision — use this skill (even when the text was clearly machine-translated and reads awkwardly). Route to the translation skill only when a source-language document is provided and fidelity to it governs the task.

## Choose a proportional path

Do not apply the same amount of process to every task.

### Fast path
Use for a label, title, CTA, error message, short paragraph, or straightforward copyedit with complete context.

1. Confirm target language, locale, surface, intended meaning, protected content, and hard constraints.
2. Apply the language-specific rules and the relevant surface profile.
3. Draft once, then check meaning, terminology, capitalization, register, and fit.
4. Run an integrity script when structured content or protected syntax is present.

### Standard path
Use for ordinary reports, proposals, slides, documentation, web content, and multi-paragraph revision.

1. Read `references/editorial-core.md` and select revision mode, surface, locale, and risk.
2. Establish facts, source of truth, terminology, audience, purpose, and desired decision.
3. Build the minimum useful argument and paragraph plan.
4. Draft in the target language using the relevant surface profile.
5. Review examples, anti-patterns, and the multidimensional rubric.
6. Run applicable integrity scripts.

### High-assurance path
Use for legal, regulatory, contractual, external, executive, commitment-bearing, safety-sensitive, or structurally complex content.

1. Complete the standard path.
2. Run the challenge pass and explicitly test conflicting sources, unsupported claims, ambiguity, qualifications, obligations, exceptions, and ownership.
3. Compare the final output with the controlling source or fact pack.
4. Run repository-native validation in addition to bundled checks when structured files are involved.
5. Preserve unresolved review issues and require the appropriate qualified approval before publication.

Escalate to the more rigorous path whenever a material risk appears. Do not perform hidden ceremony that does not improve the requested output.

## English-specific rules

Load `references/native-english.md` and apply it for any English authoring or revision. It names the AI-signature tics (with fixes), the US/UK conventions, and the realization rules (heading case, numbers, punctuation). A clean style-lint is not proof the writing sounds human — the tell list in that guide is the real check.

- Determine and apply one English convention, such as US or UK English, from the controlling artifact or user context.
- Prefer concrete subjects and verbs over noun-heavy corporate prose.
- Use collocations that are natural in the relevant profession and genre.
- Professionalism comes from precise scope, evidence, implications, actions, and controlled qualifications, not inflated vocabulary.
- Flag repeated reliance on words such as `ensure`, `enable`, `enhance`, `leverage`, `utilize`, `robust`, `seamless`, `pivotal`, `comprehensive`, and `transformative`. These words are not prohibited; retain them when they are exact and necessary.
- Flag formulaic connectors such as `furthermore`, `moreover`, and `in conclusion` when they do not express a necessary relation.
- Keep direct quotations unchanged unless explicitly authorized.
- Preserve uncertainty and avoid converting forecasts, possibilities, or incomplete evidence into commitments.

## Conflict priority

1. Factual accuracy and protected meaning.
2. Intended communication goal.
3. Logical coherence and evidence.
4. Audience comprehension.
5. Genre and register fit.
6. Native idiomaticity.
7. Stylistic elegance.


## Output behavior

- Return only the requested final content unless the user requests alternatives, rationale, issue report, or review data.
- For short-form writing, provide materially different alternatives when appropriate.
- For long-form writing, provide one coherent final document.
- Preserve requested file, markup, key, and code structure.
- Do not add a generic disclaimer to every output. Surface a review warning only when publication readiness is requested or a material risk would otherwise remain hidden.
