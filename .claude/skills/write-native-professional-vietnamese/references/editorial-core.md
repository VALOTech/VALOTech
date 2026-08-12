# Editorial operating model

## 1. Establish the communication contract
Before writing, infer or construct an internal brief. Do not expose it unless requested.

```yaml
brief:
  audience:
  audience_knowledge:
  reader_question_or_concern:
  communication_goal:
  desired_decision_or_action:
  source_of_truth:
  facts_and_evidence:
  assumptions:
  output_surface:
  genre:
  locale_and_market:
  register_and_formality:
  revision_mode:
  main_message:
  supporting_points:
  counterarguments:
  material_qualifications:
  approved_terminology:
  terms_to_retain_in_english:
  protected_content:
  prohibited_or_unsupported_claims:
  length_and_format_constraints:
```

If context is incomplete, use the safest reasonable interpretation. Do not invent facts, evidence, ownership, legal effect, terminology status, or intended meaning.

## 2. Select the revision mode

- `copyedit`: preserve claims, structure, and legal or technical effect; correct language, consistency, and local clarity.
- `substantive-edit`: preserve facts and intent; restructure paragraphs, remove repetition, test claims, and improve progression.
- `rebuild`: treat the draft as a fact pack; discard weak organization and rebuild the argument.

Default to `copyedit` for legal, regulatory, contractual, policy, control, and requirements text. Default to `substantive-edit` for weak AI-generated prose. Use `rebuild` only when preserving the structure would preserve the defects.

## 3. Design the argument before the prose
For substantive content, build only the elements that matter:

```yaml
argument:
  main_claim:
  reasons:
  evidence:
  implication:
  counterargument:
  response:
  recommendation:
  qualification:
```

Assign one primary function to each paragraph: context, claim, cause, evidence, impact, counterargument, response, recommendation, qualification, or transition.

## 4. Challenge the draft
Before finalizing substantive professional content, test:

```yaml
challenge:
  strongest_counterargument:
  unsupported_assumption:
  missing_or_weak_evidence:
  alternative_interpretation:
  likely_reader_objection:
  claim_to_remove_or_qualify:
```

Do not manufacture objections merely to complete the checklist. When sources conflict, do not create false consensus. State the conflict, how it affects the conclusion, and what would resolve it.

## 5. Write with sentence and paragraph discipline

- Every sentence must add information or advance the paragraph.
- Every transition must express a real relation: cause, contrast, consequence, narrowing, sequence, or conclusion.
- Remove repeated meaning, decorative openings, generic praise, and prose that exists only to sound professional.
- Do not imitate human writing by adding errors, slang, fragments, idioms, or arbitrary variation.
- Preserve direct quotations exactly unless quotation editing is explicitly authorized.
- Do not use brevity constraints to remove a material actor, action, condition, exception, qualification, uncertainty, or obligation.

## 6. Resolve terminology conservatively
Use this order:

1. Explicit user decision or approved glossary.
2. Controlling source artifact.
3. Verified professional usage in the target market.
4. Common native usage.
5. Conservative retention of English for uncertain technical names.

Classify material choices internally as `approved`, `artifact-supported`, `market-verified`, `common-usage`, or `uncertain`. Never call wording an industry standard without support. Flag uncertain high-risk terminology for qualified review.

## 7. Protect content and structure
Preserve as applicable:

- facts, names, numbers, dates, units, currencies, references, and quotations;
- actors, ownership, permissions, obligations, prohibitions, exceptions, conditions, certainty, and time scope;
- file keys, identifiers, API names, enum values, variables, placeholders, tags, code, URLs, and locked segments;
- meaningful line breaks, list hierarchy, and non-translatable regions;
- official capitalization of organizations, products, laws, standards, frameworks, and acronyms.

Treat Unicode normalization differences, bidirectional controls, invisible characters, and script mixing as review risks in keys, identifiers, legal names, and code-adjacent text.

## 8. Handle ambiguity

- Resolve ambiguity from the controlling artifact, glossary, adjacent content, and supplied context.
- If ambiguity is not material, choose the most conservative interpretation and continue.
- If ambiguity may change legal effect, responsibility, safety, factual meaning, or a public commitment, do not resolve it silently. Preserve it or identify the exact decision required.
- Never fabricate context to make a string, claim, or paragraph easier to write.

## 9. Review by risk

- Low risk: routine internal drafts and complete-context strings. Automated review may suffice.
- Medium risk: internal presentations, training, documentation, and web content. Use structured review and sampling.
- High risk: client-facing, executive, legal, regulatory, external publication, commitments, and capability claims. Require qualified human approval before publication.

## 10. Learn from corrections
Capture material reviewer decisions:

```yaml
language_decision:
  concept:
  locale:
  surface:
  preferred_wording:
  discouraged_wording:
  rationale:
  scope:
  approved_example:
```

Apply prior approved decisions before generating new wording.
