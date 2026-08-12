---
name: translate-english-to-native-locales
description: Translate English into native target-language content for slides, reports, web, UI, documentation, and code text. Use whenever English is the source and another language is required.
---

# Translate English into native target-language content

## Trigger boundary
Use this skill for the workflow stated in the description. Do not use an original-language writing skill for translation, or the translation skill for original-language composition.
Improving text that already exists in the target language, with no source document supplied, is original-language revision — use that language's writing skill, not this one (even when the text was clearly machine-translated). Use this skill when a source-language document is provided and fidelity to it governs the task.

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

## Select the translation lane

Use the least permissive lane that fits the purpose.

1. `strict-translation`: contracts, law, regulation, controls, policies, and specifications. Fidelity and legal or technical effect take priority.
2. `professional-localization`: reports, proposals, documentation, training, and business communication. Preserve meaning while restructuring for native readability.
3. `transcreation`: campaigns, taglines, onboarding, and persuasive narratives. Preserve core meaning, intent, and effect; material departures must be reviewable.

## Source-readiness gate
Before translating, identify:

```yaml
source_readiness:
  meaning_clear:
  actors_clear:
  obligations_and_certainty_clear:
  terminology_validated:
  claims_supported:
  ambiguities_identified:
  protected_syntax_identified:
  structure_usable:
```

Do not silently improve a weak or ambiguous source into a stronger claim.

## Translation-unit model
For each material unit identify:

```yaml
unit:
  source:
  intended_meaning:
  actor:
  action:
  object:
  certainty_or_obligation:
  conditions_and_exceptions:
  temporal_scope:
  implication:
  tone_and_effect:
  terminology:
  adjacent_context:
  surface:
  length_limit:
  protected_syntax:
```

For UI and i18n strings, include screen, component role, call site, neighboring strings, and user action. Do not guess the meaning of an ambiguous standalone label.

## Target-language realization

- Apply the native-language guide for the target locale — `references/native-vietnamese.md` or `references/native-chinese.md` (and `references/native-english.md` when English is the target). Each names that language's translation-tics, register and pronoun system, and typography. This is the primary lever for output that does not read as translated, and a clean style-lint does not replace it.
- Do not preserve English word order, sentence boundaries, metaphor, punctuation, paragraph cadence, or heading style unless natural and permitted by the lane.
- Do not force English technical terms, product names, solution names, framework names, or proper nouns into rare local-language wording.
- After native editing, perform a bilingual fidelity pass to detect lost qualifications, changed certainty, altered ownership, or omitted conditions.
- Back-translation may be a diagnostic aid but is not proof of quality.

## Conflict priority

1. Protected meaning, legal effect, and factual accuracy.
2. Completeness.
3. Actors, obligations, certainty, conditions, exceptions, and scope.
4. Approved terminology.
5. Target-locale suitability and native readability.
6. Genre and surface fit.
7. Organizational voice.
8. Stylistic elegance.

## File integrity
For supported localization files, run the bundled integrity checker. Treat syntax and protected-token failures as blocking defects. Style-pattern findings are advisory.


## Output behavior

- Return only the requested final content unless the user requests alternatives, rationale, issue report, or review data.
- For short-form writing, provide materially different alternatives when appropriate.
- For long-form writing, provide one coherent final document.
- Preserve requested file, markup, key, and code structure.
- Do not add a generic disclaimer to every output. Surface a review warning only when publication readiness is requested or a material risk would otherwise remain hidden.
