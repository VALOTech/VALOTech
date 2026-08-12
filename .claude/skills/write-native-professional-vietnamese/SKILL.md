---
name: write-native-professional-vietnamese
description: Viết mới hoặc viết lại nội dung tiếng Việt tự nhiên cho slide, báo cáo, web, UI, tài liệu kỹ thuật và code text. Dùng khi đầu ra gốc là tiếng Việt, không phải bản dịch.
---

# Viết tiếng Việt tự nhiên và chuyên nghiệp

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

## Quy tắc riêng cho tiếng Việt

Nạp `references/native-vietnamese.md` và áp dụng cho mọi tác vụ viết hoặc viết lại tiếng Việt: file này gọi tên các dấu vết dịch máy/AI cụ thể (kèm bản sửa), hệ xưng hô theo register, và quy tắc trình bày (dấu câu, số, chữ hoa cho text UI/button). Lint sạch không phải bằng chứng tự nhiên — bảng dấu vết trong file đó mới là bài kiểm tra thật.

- Viết trực tiếp bằng tiếng Việt từ brief và lập luận; không mô phỏng trật tự thông tin, nhịp đoạn hoặc phép tu từ tiếng Anh.
- Ưu tiên chủ thể và động từ cụ thể khi trách nhiệm hoặc hành động là quan trọng. Có thể lược chủ thể nếu tự nhiên và không gây mơ hồ.
- Dùng từ phổ thông nếu vẫn chính xác. Chỉ dùng thuật ngữ chuyên môn đã được kiểm chứng trong cộng đồng nghề nghiệp hoặc tài liệu kiểm soát.
- Không cố Việt hóa tên sản phẩm, framework, giải pháp, danh từ riêng hoặc thuật ngữ tiếng Anh nếu bản dịch ít dùng, dài, lạ hoặc làm mất khả năng nhận diện.
- Có thể giữ thuật ngữ tiếng Anh và giải thích ngắn gọn ở lần xuất hiện đầu tiên.
- Không mặc định dùng “bạn”, “Quý khách”, “chúng ta” hoặc “người dùng”. Chọn đại từ theo quan hệ và loại tài liệu.
- Rà soát danh từ hóa dày đặc, bị động với nhiều “được”, cấu trúc “giúp ... có thể”, từ Hán Việt nặng, cấu trúc ba vế lặp lại và câu mang logic tiếng Anh.
- Rà soát các từ như “bảo đảm”, “tăng cường”, “nâng cao”, “tối ưu hóa”, “toàn diện”, “liền mạch”, “linh hoạt”, “bền vững” và “xuyên suốt” khi không có cơ chế, căn cứ hoặc kết quả cụ thể. Không cấm máy móc.
- Dùng sentence case cho tiêu đề, trừ khi template yêu cầu khác. Không viết hoa danh từ chung để tạo cảm giác quan trọng.

## Thứ tự ưu tiên khi có xung đột

1. Tính chính xác và nội dung được bảo vệ.
2. Ý định giao tiếp.
3. Thuật ngữ đã duyệt hoặc cách dùng chuyên ngành đã kiểm chứng.
4. Logic, bằng chứng và khả năng hiểu của người đọc.
5. Độ tự nhiên của tiếng Việt theo đúng register.
6. Văn phong tổ chức.
7. Sự trau chuốt.


## Output behavior

- Return only the requested final content unless the user requests alternatives, rationale, issue report, or review data.
- For short-form writing, provide materially different alternatives when appropriate.
- For long-form writing, provide one coherent final document.
- Preserve requested file, markup, key, and code structure.
- Do not add a generic disclaimer to every output. Surface a review warning only when publication readiness is requested or a material risk would otherwise remain hidden.
