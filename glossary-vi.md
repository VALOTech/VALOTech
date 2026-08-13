# VALO Tech — Vietnamese brand & site terminology (skeleton — VI pending owner approval)

The writing and translation skills under `.claude/skills/` treat `glossary-vi.json` as the authoritative Vietnamese glossary for this site once the owner fills it in. The machine-checkable form is `glossary-vi.json` (repo root); run the bundled checker against any output:

```
python3 .claude/skills/translate-english-to-native-locales/scripts/check_glossary.py <output-file> glossary-vi.json
```

**Voice.** VALO Tech speaks to corporate leaders, partners, and candidates evaluating a regulated-industry AI vendor: on-brand, clear, confident but honest — never hyped, every claim structurally defensible. Product and brand names stay in English in every locale.

This file is a **skeleton**: every concept below is grounded in copy actually read from the site (cited by i18n key), but no Vietnamese term is decided yet. `glossary-vi.json` ships with `preferred` blank for every entry — the owner fills it in; nothing here should be treated as approved.

## To decide (owner to approve)

### Brand & product names (proper nouns — keep as-is in every locale)

| Concept (EN) | VI (blank) | Note |
|---|---|---|
| VALO | | Ecosystem/company name. Proper noun — keep as-is. Appears in nav brand mark, footer, JSON-LD `organization` block. |
| VALO Tech | | This product — the corporate hub. Proper noun — keep as-is. Page `<title>`, footer brand, org name. |
| ValoLab | | The AI-workforce delivery platform/methodology. Proper noun — keep as-is; current site never translates it (`cap.h2`: "Why corporate leaders trust ValoLab" → "Vì sao lãnh đạo doanh nghiệp tin tưởng ValoLab"). |
| ValoStack | | The cross-client shared-learning network. Proper noun — keep as-is; current site never translates it (`valostack.h2` renders "ValoStack. Bộ não càng dùng càng thông minh."). |
| VALO Ads | | Sibling product (valoads.io). Proper noun — keep as-is. |
| VALO Pocket | | Sibling product (valopocket.io). Proper noun — keep as-is. |
| Pridwen | | Sibling product, B2B GRC platform (pridwen.io), marked "New" on-site. Proper noun — keep as-is. |
| Shimmra | | Sibling product (shimmra.live). Proper noun — keep as-is. |
| Amavo | | Sibling product (amavo.app). Proper noun — keep as-is. |
| Farola | | Sibling product (farola.io), marked "New" on-site. Proper noun — keep as-is. |

All ten names are hardcoded directly in `index.html` markup (not routed through `assets/i18n.js`), so they already render identically in every locale today — this row confirms that behavior is intentional, not an oversight to fix.

### Navigation & UI chrome

| Concept (EN) | VI (blank) | Note |
|---|---|---|
| Approach (nav) | | `nav.approach`. Current site: "Phương pháp". |
| Workforce (nav) | | `nav.workforce`, bare noun (no "AI" in the English label). Current site: "Đội ngũ AI" — adds "AI" not present in the English source. See "labels needing a decision" below. |
| Trust (nav) | | `nav.trust`. Current site: "Niềm tin" (literal "trust/faith"). market ref: VN B2B/enterprise sites more often label this kind of section "Cam kết" or "Bảo mật & Tuân thủ" (verify). |
| Ecosystem (nav) | | `nav.ecosystem`. Current site: "Hệ sinh thái" — matches common VN tech usage (e.g. "hệ sinh thái Viettel/FPT"). |
| Pricing (nav) | | `nav.pricing`. Current site: "Chi phí" (cost), not the more conventional "Bảng giá" (price list) — the page explicitly says pricing is "not a published menu" (`close.big`), so this may be a deliberate register choice, not an oversight. market ref: VN SaaS/corporate sites typically use "Bảng giá" for a pricing nav item (verify). Market ref: not verified (no credible source found) — FPT's corporate site (fpt.com) carries no pricing nav item at all, consistent with typical B2B technology-vendor sites and with VALO Tech's own anti-menu positioning; VNG's and Viettel's equivalents were not confirmed to carry one either this session. Since none of the three reference corporates expose a comparable pricing nav item to check against, the "Chi phí" vs. "Bảng giá" question has no B2B-conglomerate precedent to verify from this source set — it would need a VN SaaS-specific reference rather than a corporate conglomerate. |
| Language (switcher label) | | `lang.label`. Current site: "Ngôn ngữ". |
| Theme toggle — Light / Dark / Match system | | `theme.light` / `theme.dark` / `theme.auto`. Current site: "Giao diện sáng" / "Giao diện tối" / "Theo hệ thống". |
| Skip to content | | `a11y.skip` — accessibility skip link, visible on keyboard focus (called out specifically in README as localized). Current site: "Đến nội dung chính". |
| Back to top | | `a11y.top`. Current site: "Lên đầu trang". |

### CTAs

| Concept (EN) | VI (blank) | Note |
|---|---|---|
| Start the conversation | | `cta.start` — primary CTA, `mailto:` link, appears 3× identically on the page. Current site: "Bắt đầu trao đổi". |
| See the approach | | `cta.approach` — secondary CTA. Current site: "Xem phương pháp". |

### Marketing phrases / value props / positioning

| Concept (EN) | VI (blank) | Note |
|---|---|---|
| Trustworthy AI for the real world. | | `brand.slogan` — the company tagline. Current site: "AI đáng tin cậy cho thế giới thực." |
| AI workforce | | Core recurring positioning term (`hero.h1`, `workforce.h2`, dozens of occurrences). Current site: consistently "đội ngũ AI". No VN market convention exists for this term yet — competitors (FPT Smart Cloud, VNG Cloud, Viettel AI) do not use an equivalent phrase, so this is closer to original coinage than a lookup. market ref: verify how VN/regional enterprise-AI vendors phrase this, if at all. |
| Clean data / clean data foundation | | Recurring term (`hero.h1`, `problem.lede`, `answer.big`, `phases.5o`). Current site: consistently "dữ liệu sạch". |
| Audit-defensible | | Recurring differentiator (`hero.m2`, `hero.sub`, `eco.lede`, meta description). **Current site uses three different renderings**: `hero.m2` → "Vững trước kiểm toán"; `hero.sub` → "...sẵn sàng đứng vững trước mọi cuộc kiểm toán ngay từ ngày đầu tiên"; `eco.lede` → "...vững vàng trước kiểm toán ngay từ trong thiết kế...". This is the clearest existing terminology fork on the site — flagged for owner resolution. |
| Audit trail | | Recurring term (`trust.2t`, `cap.7t`). Current site: consistently "Nhật ký kiểm toán". |
| Mechanical governance / mechanically enforced | | Recurring term (`trust.1t`, `cap.1t`, `cap.4c`). Current site: consistently anchored on "cơ chế" ("thực thi bằng cơ chế", "quản trị bằng cơ chế"). |
| Regulated industries / regulated-industry | | Recurring descriptor (`hero.eyebrow`, `cap.lede`, `foot.tagline`). Current site: "các ngành chịu quản lý chặt chẽ" in two places, shortened to "chịu quản lý chặt" in `cap.lede` — minor inconsistency, worth leveling. |
| Your data, your cloud / yours to keep | | Data-sovereignty pledge (`trust.3t`, `hero.m3`, `custom.keept`/`custom.keepd`). Current site: "Dữ liệu của bạn, cloud của bạn" / "Thuộc về bạn". Likely to carry legal weight for VN buyers under PDPL data-residency expectations — worth extra care once decided. |
| Domain-tuned / customized to your business | | Recurring differentiator (`phases.5t`, `deliver.p2m1t`, `custom` section). Current site: anchored on "tùy biến" (customized/tuned). |
| Foundation / data platform / runway | | Recurring infrastructure metaphor (`deliver.*` section, `phases.3t`). Current site: "nền tảng" (foundation/platform) and "bệ phóng" (runway/launchpad) used as a paired metaphor. |
| Stage vs. Phase | | English distinguishes two structural terms: 2 **Stages** (Digitalization; AI and Data Platform) each containing some of the 5 **Phases** (`deliver.s1tag`/`s2tag` vs `phases.1l`-`5l`). **Current site collapses both to "Giai đoạn"**, losing the English distinction — flagged for owner resolution alongside the audit-defensible fork above. |
| Stage / parallel-track names (3) | | `deliver.tab1`-`tab3`: Digitalization / AI and Data Platform / Software Engineering. Current site: "Số hóa" / "Nền tảng AI và Dữ liệu" / "Kỹ thuật phần mềm". |
| Phase names (5) | | `phases.1l`-`5l`: Exploratory / Architecture and PoC / Build / Platform training / Workforce deployment. Current site: "Khảo sát" / "Kiến trúc và PoC" / "Xây dựng" / "Đào tạo nền tảng" / "Triển khai đội ngũ AI". |
| Workforce department names (9) | | `workforce.1t`-`9t`: Product and Strategy / Design and Experience / Engineering / Quality and Security / Operations and Delivery / Customer Success / Finance and Compliance / Executive Office / Marketing and Growth. Current site: "Sản phẩm và Chiến lược" / "Thiết kế và Trải nghiệm" / "Kỹ thuật" / "Chất lượng và Bảo mật" / "Vận hành và Bàn giao" / "Thành công của Khách hàng" / "Tài chính và Tuân thủ" / "Văn phòng Điều hành" / "Marketing và Tăng trưởng" — note "Marketing" itself is kept as an English loanword even in the Vietnamese name. Review as a set: the nine names should stay grammatically parallel. |
| What we deliver (section title) | | `deliver.h2`. Current site: "Những gì chúng tôi bàn giao". |
| And how we deliver it (section title) | | `phases.h2`. Current site: "Và chúng tôi thực hiện điều đó ra sao". |
| How your people fit in (section title) | | `people.h2`. Current site: "Con người của bạn đứng ở đâu trong bức tranh này". |
| The problem corporate leaders face today (section title) | | `problem.h2`. Current site: "Bài toán mà lãnh đạo doanh nghiệp đang đối mặt". |

### Footer / legal

| Concept (EN) | VI (blank) | Note |
|---|---|---|
| Product / Company / Legal (column headers) | | `foot.product` / `foot.company` / `foot.legal`. Current site: "Sản phẩm" / "Công ty" / "Pháp lý". |
| About / Careers / Press / Contact | | `foot.about` / `foot.careers` / `foot.press` / `foot.contact`. Current site: "Giới thiệu" / "Tuyển dụng" / "Báo chí" / "Liên hệ". market ref: FPT/VNG/Viettel/MoMo corporate footers commonly render About as "Về chúng tôi" (current site uses the shorter "Giới thiệu" — both are standard; verify which register fits VALO Tech's enterprise-buyer audience) and Careers/Contact align with "Tuyển dụng"/"Liên hệ" already. Market ref (verified): checked FPT's and VNG's own live corporate sites directly. Both converge on a brand-specific "Về <Brand>" pattern for their primary About nav item — neither the generic "Giới thiệu" nor generic "Về chúng tôi" this row originally weighed. FPT's main site (fpt.com) uses "Về FPT" for About while its separate recruitment subsite uses "Giới Thiệu" as its own distinct label; VNG's main site (vng.com.vn) uses "Về VNG" for the same nav slot (its About page's own title separately reads "Giới thiệu về VNG", but that is a page title, not the nav label). Sources: https://fpt.com/vi/ve-fpt, https://vng.com.vn/aboutvng.html. For Careers and Contact: FPT's main site nav uses "Cơ hội nghề nghiệp" while its dedicated recruitment site and Viettel's site (viettel.com.vn, confirmed via site-restricted search) both show "Tuyển dụng"; VNG's main site nav also uses "Cơ hội nghề nghiệp". "Liên hệ" for Contact is confirmed identically across FPT, VNG, and Viettel. This is competitor market wording only, not an approved VALO Tech term — net effect: "Tuyển dụng" / "Liên hệ" are solidly corroborated as-is, while "About" gains a third candidate ("Về VALO Tech") the original "Giới thiệu" vs. "Về chúng tôi" framing hadn't considered. |
| Privacy / Terms / Cookies | | `foot.privacy` / `foot.terms` / `foot.cookies`. Current site: "Quyền riêng tư" / "Điều khoản" / "Cookie" — note "Cookie" is kept as an English loanword. market ref: VN corporate/legal footers often use the fuller "Chính sách bảo mật" / "Điều khoản sử dụng" (verify which register the owner wants — short-form vs. full-form affects perceived legal weight). |
| All rights reserved. (copyright line) | | `foot.rights`, combined with year + entity. Current site: "© 2026 VALO Tech Pte. Ltd. Bảo lưu mọi quyền." |
| Explore the VALO ecosystem (footer link) | | `foot.eco`. Current site: "Khám phá hệ sinh thái VALO". |

## Market reference

Vietnamese corporate/marketing-site convention referenced from general knowledge (not yet web-verified — see flagged labels below): major VN tech corporate sites (**FPT**, **VNG**, **Viettel**, **MoMo**) typically render About us → "Về chúng tôi", Careers → "Tuyển dụng", Contact → "Liên hệ", a pricing nav item → "Bảng giá", and commonly keep certain international business/tech acronyms as English loanwords (CRM, ERP, PoC, BI, QA) — a pattern VALO Tech's own current site already follows (`problem.3d` keeps "CRM"/"ERP"; the deliver/people sections keep "PoC"/"BI"/"QA").

**Labels flagged to web-verify later** (no browsing was done for this skeleton):
1. "Pricing" nav → current site "Chi phí" vs. the more conventional "Bảng giá" — verify actual FPT/VNG/Viettel/MoMo nav wording and whether VALO Tech's anti-menu positioning justifies the divergence.
2. "Trust" nav → current site "Niềm tin" vs. a more typical enterprise register ("Cam kết", "Bảo mật & Tuân thủ") — verify how VN B2B/regulated-industry vendors label an equivalent section.
3. "Press" footer → current site "Báo chí" vs. alternatives ("Truyền thông", "Tin tức") — verify actual FPT/VNG/Viettel footer wording.
4. "Privacy" / "Terms" footer → current site's short forms ("Quyền riêng tư" / "Điều khoản") vs. fuller legal-register forms ("Chính sách bảo mật" / "Điều khoản sử dụng") — verify which register VN consumer-protection/footer convention expects.
5. "About" footer → current site "Giới thiệu" vs. the common alternative "Về chúng tôi" — verify which register best fits an enterprise-buyer audience.
6. "AI workforce" → verify whether any VN or regional enterprise-AI vendor (FPT Smart Cloud, VNG Cloud, Viettel AI) has already established a category term in Vietnamese, or whether "đội ngũ AI" remains original coinage.

## Tone policy

Marketing claims stay **honest and bounded**. Never render a claim as absolute ("tuyệt đối", "100%", "số một" / "#1", "duy nhất") unless the source copy already substantiates it — the current English copy itself makes no such claims, and Vietnamese advertising law (Luật Quảng cáo) exposes unsubstantiated superlative claims to regulatory risk. Where English uses a structural, falsifiable claim ("mechanically enforced", "audit-defensible", "every action logged"), the Vietnamese must preserve that specificity rather than soften it into vague reassurance, and must not inflate it into an unconditional guarantee either.

## Status

Skeleton generated from `README.md`, `assets/i18n.js` (`en` and `vi` dictionaries, both read in full), and `index.html` (brand-name markup, JSON-LD block). Vietnamese terms in `glossary-vi.json` are pending owner fill — every `preferred` array is blank by design. The current live `vi` dictionary in `assets/i18n.js` is cited throughout as a starting reference, not as a pre-approved answer. Chinese (`zh`/`zt`) is deferred to a later translator pass, per the standing ecosystem convention.
