---
name: write-native-professional-chinese
description: 撰写或重写原生专业中文，适用于幻灯片、报告、网页、UI、技术文档和代码文本。原始输出为中文时使用；英文翻译任务不要使用。
---

# 撰写自然、专业的中文

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

## 中文专属规则

撰写或改写中文时，先加载并应用 `references/native-chinese.md`：它逐一点名翻译腔／AI 腔（含改法）、「的地得」与量词、语域（你／您）、陆台港地区变体，以及排版细节（全角标点、中西文空格，最易错于 UI／按钮）。lint 干净不等于自然——该文件的病症清单才是真正的检验。

- 明确或保守推断目标市场：`zh-CN`、`zh-TW` 或 `zh-HK`。沿用现有文本的字形和规范。高风险内容不得擅自选择法域术语。
- 根据内容 brief 直接用中文组织表达，不得先想象英文原文再逐句改写。
- 优先采用目标市场当前、常用且专业的表达。
- 产品名、framework 名称、solution 名称、API、代码标识符和通行缩写，在本地译法不常用或有歧义时保留英文。
- 不得把英文隐喻机械翻成带有过重法律、政治、宗教或行政色彩的词语，除非原意确实如此。
- 不得在同一文本中混用中国大陆、台湾和香港的术语、简繁体、标点和排版规范。
- 产品与开发者场景优先采用简洁、功能明确的命名，不使用妨碍理解的文学化隐喻。
- 检查官样表达、英文式长句、反复对仗口号、空泛创新主张，以及不自然的主语或所属结构重复。

## 冲突优先级

1. 事实准确与受保护含义。
2. 交际目标。
3. 已批准且符合目标市场的专业术语。
4. 逻辑连贯与受众理解。
5. 目标市场的母语表达。
6. 文体、语域与文化适配。
7. 组织语调。
8. 文辞润色。


## Output behavior

- Return only the requested final content unless the user requests alternatives, rationale, issue report, or review data.
- For short-form writing, provide materially different alternatives when appropriate.
- For long-form writing, provide one coherent final document.
- Preserve requested file, markup, key, and code structure.
- Do not add a generic disclaimer to every output. Surface a review warning only when publication readiness is requested or a material risk would otherwise remain hidden.
