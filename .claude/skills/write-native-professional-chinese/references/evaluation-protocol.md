# Evaluation protocol

## Baselines
Compare the same test case under:

1. No skill.
2. The relevant skill enabled.
3. The relevant skill enabled plus approved glossary and exemplars.

Randomize output order for reviewers. Do not reveal the generating condition.

## Auto-trigger measurement
Use positive, negative, and boundary prompts. Record:

- true positive: correct skill invoked;
- false positive: skill invoked when it should not be;
- false negative: relevant skill not invoked;
- correct rejection: no irrelevant skill invoked.

Report precision, recall, and confusion among the four skills.

## Instruction-compliance measurement
Score each atomic requirement as `pass`, `fail`, or `not applicable`. Include protected meaning, paragraph purpose, real transitions, terminology, capitalization, register, uncertainty, surface constraints, and technical integrity.

## Native preference study
Use at least two qualified native reviewers for each target market when available. Reviewers compare outputs pairwise for naturalness, clarity, register, terminology, and overall preference. Keep factual fidelity as a separate gate.

## Legal review
Legal or regulatory cases require a qualified reviewer for the relevant jurisdiction. Language quality cannot substitute for legal validation.

## Acceptance gates
A candidate fails if it changes protected meaning, invents evidence, breaks file syntax, loses a material qualification, or uses unapproved terminology where an approved term exists. Preference scores are considered only after all gates pass.
