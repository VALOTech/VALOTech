# VALO Tech — Vietnamese brand & site terminology (decided)

The writing and translation skills under `.claude/skills/` treat `glossary-vi.json` as the authoritative Vietnamese glossary for this site. The machine-checkable form is `glossary-vi.json` (repo root); run the bundled checker against any output:

```
python3 .claude/skills/translate-english-to-native-locales/scripts/check_glossary.py <output-file> glossary-vi.json
```

**Voice.** VALO Tech speaks to corporate leaders, partners, and candidates evaluating a regulated-industry AI vendor: on-brand, clear, confident but honest — never hyped, every claim structurally defensible. Product and brand names stay in English in every locale.

This file records where each Vietnamese rendering in `glossary-vi.json` comes from, so a reviewer can audit a decision instead of re-deriving it. Every concept is grounded in copy actually read from the site (cited by i18n key). All 45 concepts carry a decided term. Four of them were genuine forks rather than lookups — the pricing nav label, "audit-defensible", the Stage/Phase distinction, and Verdiq's slogan — and the owner settled each; the reasoning behind all four is recorded under "Owner decisions" below.

## Vietnamese terminology

### Brand & product names (proper nouns — keep as-is in every locale)

| Concept (EN) | VI | Note |
|---|---|---|
| VALO | VALO | Ecosystem/company name. Proper noun — keep as-is. Appears in nav brand mark, footer, JSON-LD `organization` block. |
| VALO Tech | VALO Tech | This product — the corporate hub. Proper noun — keep as-is. Page `<title>`, footer brand, org name. |
| ValoLab | ValoLab | The AI-workforce delivery platform/methodology. Proper noun — keep as-is; current site never translates it (`cap.h2`: "Why corporate leaders trust ValoLab" → "Vì sao lãnh đạo doanh nghiệp tin tưởng ValoLab"). |
| ValoStack | ValoStack | The cross-client shared-learning network. Proper noun — keep as-is; current site never translates it (`valostack.h2` renders "ValoStack. Bộ não càng dùng càng thông minh."). |
| VALO Ads | VALO Ads | Sibling product (valoads.io). Proper noun — keep as-is. |
| VALO Pocket | VALO Pocket | Sibling product (valopocket.io). Proper noun — keep as-is. |
| Verdiq | Verdiq | Sibling product, B2B GRC platform (verdiq.io), marked "New" on-site. Proper noun — keep as-is. |
| Shimmra | Shimmra | Sibling product (shimmra.live). Proper noun — keep as-is. |
| Amavo | Amavo | Sibling product (amavo.app). Proper noun — keep as-is. |
| Farola | Farola | Sibling product (farola.io), marked "New" on-site. Proper noun — keep as-is. |

All ten names are hardcoded directly in `index.html` markup (not routed through `assets/i18n.js`), so they already render identically in every locale today — this row confirms that behavior is intentional, not an oversight to fix.

### Navigation & UI chrome

| Concept (EN) | VI | Note |
|---|---|---|
| Approach (nav) | Phương pháp | `nav.approach`. Matches the current site — a clean, unambiguous rendering with no competing convention to weigh against. |
| Workforce (nav) | Đội ngũ AI | `nav.workforce`, bare noun in English (no "AI"). The current site adds "AI" — kept deliberately: the page's own People section fixes "Đội ngũ AI" as one half of a named pair against "Con người của bạn" (`people.h.l`/`people.h.r`); a bare "Đội ngũ" nav item would read as pointing at the human-team content instead of the AI-workforce content it actually opens. Vietnamese "đội ngũ" alone lacks the branded "AI workforce" meaning that English "Workforce" inherits from the page's own repeated framing. |
| Trust (nav) | Niềm tin | `nav.trust`. Checked against three major Vietnamese B2B platforms (MISA AMIS, Base.vn, Haravan) for a comparable nav item — none carries one; each surfaces security/compliance through footer certification badges (ISO 27001, CSA STAR) instead of a dedicated "Trust" menu concept. No competing convention stands against "Niềm tin", and it is standard, natural Vietnamese for the concept. |
| Ecosystem (nav) | Hệ sinh thái | `nav.ecosystem`. Matches common VN tech usage (e.g. "hệ sinh thái Viettel/FPT"). |
| Pricing (nav) | Chi phí | `nav.pricing`. A considered divergence from the verified market default ("Bảng giá"), not an oversight: `close.big` states outright that cost is part of the design conversation and not a posted price list, so the nav label and the page's own claim agree. See "Owner decisions" §1. |
| Language (switcher label) | Ngôn ngữ | `lang.label`. Standard. |
| Theme toggle — Light / Dark / Match system | Giao diện sáng / Giao diện tối / Theo hệ thống | `theme.light` / `theme.dark` / `theme.auto`. Standard Vietnamese app convention for a three-way theme control. |
| Skip to content | Đến nội dung chính | `a11y.skip` — accessibility skip link, visible on keyboard focus (called out specifically in README as localized). Standard Vietnamese a11y phrasing. |
| Back to top | Lên đầu trang | `a11y.top`. Standard. |

### CTAs

| Concept (EN) | VI | Note |
|---|---|---|
| Start the conversation | Bắt đầu trao đổi | `cta.start` — primary CTA, `mailto:` link, appears 3× identically on the page. "Trao đổi" (discuss/exchange) fits the page's professional B2B register better than the more casual "trò chuyện" (chat). |
| See the approach | Xem phương pháp | `cta.approach` — secondary CTA. Mirrors the "Approach" nav rendering. |

### Marketing phrases / value props / positioning

| Concept (EN) | VI | Note |
|---|---|---|
| Trustworthy AI for the real world. | AI đáng tin cậy cho thế giới thực. | `brand.slogan` — the company tagline. Direct, unhyped, no unsubstantiated claim — matches the tone policy below. |
| Enter the Era of Absolute Compliance. | Bước vào kỷ nguyên tuân thủ trọn vẹn. | `eco.compliance` — Verdiq's brand slogan, shown as its one-line description in the ecosystem list beside the five sibling slogans. "trọn vẹn" carries the promise; the literal "tuyệt đối" would be the unsubstantiated absolute the tone policy forbids, and is recorded as forbidden in `glossary-vi.json`. See "Owner decisions" §4. |
| AI workforce | đội ngũ AI | Core recurring positioning term (`hero.h1`, `workforce.h2`, dozens of occurrences). Checked FPT Smart Cloud, VNG, and Viettel AI for an established Vietnamese category term — found none; Vietnamese-language coverage of these vendors uses "nhân sự AI" only in the generic journalistic sense of AI reducing headcount, not as a product-category term matching VALO Tech's meaning (a deployed multi-agent system standing in for a department). "Đội ngũ AI" remains closer to original coinage than a lookup, and is already used consistently everywhere on the current site. |
| Clean data / clean data foundation | dữ liệu sạch / nền tảng dữ liệu sạch | Recurring term (`hero.h1`, `problem.lede`, `answer.big`, `phases.5o`). Current site renders both consistently: bare "clean data" → "dữ liệu sạch"; the compound "clean data foundation" → "nền tảng dữ liệu sạch". |
| Audit-defensible | vững vàng trước kiểm toán | Recurring differentiator (`hero.m2`, `hero.sub`, `eco.lede`; the meta description is English-only and not localized). One fixed term now stands in all three places — the site previously carried three near-synonymous renderings of a single English term. See "Owner decisions" §2. |
| Audit trail | nhật ký kiểm toán | Recurring term (`trust.2t`, `cap.7t`). Both instances render the English "Full audit trail" as "Nhật ký kiểm toán đầy đủ" — consistent; "đầy đủ" (full) composes onto the base term as needed elsewhere. |
| Mechanical governance / mechanically enforced | quản trị bằng cơ chế / thực thi bằng cơ chế | Recurring term (`trust.1t`, `cap.1t`, `cap.4c`). The site keeps the two English phrasings distinct and internally consistent: "mechanical governance" → "quản trị bằng cơ chế" (`cap.1t`: "Quản trị bằng cơ chế, không phải bằng hướng dẫn"); "mechanically enforced" → "thực thi bằng cơ chế" (`trust.1t`, `cap.4c`). |
| Regulated industries / regulated-industry | ngành chịu quản lý chặt chẽ | Recurring descriptor (`hero.eyebrow`, `cap.lede`, `foot.tagline`). `cap.lede` currently shortens this to "chịu quản lý chặt", dropping "chẽ" — "chặt chẽ" (rigorous/strict) is the complete, standard collocation for regulatory strictness in Vietnamese; bare "chặt" (tight) alone is colloquial shorthand. `cap.lede` should level up to match `hero.eyebrow` and `foot.tagline`, which already use the full form. |
| Your data, your cloud / yours to keep | Dữ liệu của bạn, cloud của bạn / Thuộc về bạn | Data-sovereignty pledge (`trust.3t`, `hero.m3`, `custom.keept`/`custom.keepd`). "Your data, your cloud" → "Dữ liệu của bạn, cloud của bạn" (`trust.3t`); the short tag "yours to keep" → "Thuộc về bạn" (`hero.m3`). Both are settled, consistent renderings; the wording is not in question, but the pledge is likely to carry legal weight for VN buyers under PDPL data-residency expectations, so the underlying claim — not the phrase — deserves legal review before the site is treated as a binding representation. |
| Domain-tuned / customized to your business | tùy biến theo lĩnh vực / tùy biến theo doanh nghiệp | Recurring differentiator (`phases.5t`, `deliver.p2m1t`, `custom` section). Both phrasings anchor on "tùy biến" (tuned/customized): "domain-tuned" → "tùy biến theo lĩnh vực" (`deliver.p2c`); "customized to your business" → "tùy biến theo doanh nghiệp" (`answer.big`). |
| Foundation / data platform / runway | nền tảng / nền tảng dữ liệu / bệ phóng | Recurring infrastructure metaphor (`deliver.*` section, `phases.3t`). "Foundation" → "nền tảng"; "data platform" → "nền tảng dữ liệu" (`phases.3t`: "Xây nền tảng dữ liệu"); "runway" → "bệ phóng", paired consistently with "nền tảng" throughout (`deliver.s2d`: "Nền tảng trở thành bệ phóng"). |
| Stage vs. Phase | Chặng / Giai đoạn | English distinguishes two structural terms: 2 **Stages** (Digitalization; AI and Data Platform) each containing some of the 5 **Phases**. Vietnamese now marks the same two tiers: **Chặng** for Stage (`deliver.s1tag`/`s2tag`, `deliver.lede`, `deliver.p2a`), **Giai đoạn** for Phase (`phases.1l`-`5l`, and every other reference to a numbered step). |
| Stage / parallel-track names (3) | Số hóa / Nền tảng AI và Dữ liệu / Kỹ thuật phần mềm | `deliver.tab1`-`tab3`: Digitalization / AI and Data Platform / Software Engineering. These three names hold regardless of how the Stage-vs-Phase container word above resolves. |
| Phase names (5) | Khảo sát / Kiến trúc và PoC / Xây dựng / Đào tạo nền tảng / Triển khai đội ngũ AI | `phases.1l`-`5l`: Exploratory / Architecture and PoC / Build / Platform training / Workforce deployment — the bare names, with the "Giai đoạn N ·" / "Phase N ·" prefix stripped. These five names hold regardless of how the Stage-vs-Phase question above resolves. |
| Workforce department names (9) | Sản phẩm và Chiến lược / Thiết kế và Trải nghiệm / Kỹ thuật / Chất lượng và Bảo mật / Vận hành và Bàn giao / Thành công của Khách hàng / Tài chính và Tuân thủ / Văn phòng Điều hành / Marketing và Tăng trưởng | `workforce.1t`-`9t`: Product and Strategy / Design and Experience / Engineering / Quality and Security / Operations and Delivery / Customer Success / Finance and Compliance / Executive Office / Marketing and Growth. "Marketing" itself is kept as an English loanword even in the Vietnamese name, consistent with how the word is used across Vietnamese business register generally — not an inconsistency to fix. The nine names are grammatically parallel as a set. |
| What we deliver (section title) | Những gì chúng tôi bàn giao | `deliver.h2`. |
| And how we deliver it (section title) | Và chúng tôi thực hiện điều đó ra sao | `phases.h2`. |
| How your people fit in (section title) | Con người của bạn đứng ở đâu trong bức tranh này | `people.h2`. |
| The problem corporate leaders face today (section title) | Bài toán mà lãnh đạo doanh nghiệp đang đối mặt | `problem.h2`. |

### Footer / legal

| Concept (EN) | VI | Note |
|---|---|---|
| Product / Company / Legal (column headers) | Sản phẩm / Công ty / Pháp lý | `foot.product` / `foot.company` / `foot.legal`. Standard. |
| About / Careers / Press / Contact | Về VALO Tech / Tuyển dụng / Báo chí / Liên hệ | `foot.about` / `foot.careers` / `foot.press` / `foot.contact`. Careers and Contact are solidly corroborated as-is: FPT's main site, its recruitment subsite, and Viettel's site all converge on "Tuyển dụng"; "Liên hệ" for Contact is identical across FPT, VNG, and Viettel. About is the brand-specific "Về VALO Tech" rather than the generic "Giới thiệu": FPT's main corporate site uses "Về FPT" for About, and VNG's main site uses "Về VNG" for the same slot — both confirmed directly against the live sites. (FPT's separate recruitment subsite uses "Giới Thiệu" as its own distinct label, but that subsite is a narrower recruiting funnel, not the structural analog to VALO Tech's single corporate hub — the two main corporate sites are the closer comparison.) Press has no direct competitor precedent: VNG nests press content under "Tin tức mới nhất" (news) and "Thông cáo báo chí" (press releases) rather than a standalone footer link. "Báo chí" is standard Vietnamese for the concept and shares its root with "thông cáo báo chí" — kept. |
| Privacy / Terms / Cookies | Chính sách bảo mật / Điều khoản sử dụng / Cookie | `foot.privacy` / `foot.terms` / `foot.cookies`. The fuller legal-register forms are used rather than the bare "Quyền riêng tư" / "Điều khoản", verified against two independent VN B2B platforms: Haravan uses "Chính sách bảo mật và bảo vệ dữ liệu cá nhân" and "Điều khoản dịch vụ"; MISA AMIS uses "Chính sách bảo vệ dữ liệu cá nhân". "Chính sách bảo mật" is the shared, most-recognized root across both and across the wider Vietnamese web. "Điều khoản sử dụng" (Terms of Use) is kept over the more transactional "Điều khoản dịch vụ" (Terms of Service) since this footer link covers use of the marketing site itself, not an active service login. "Cookie" stays an English loanword — universal Vietnamese convention, no naturalized alternative in use anywhere observed. |
| All rights reserved. (copyright line) | Bảo lưu mọi quyền. | `foot.rights`, combined with year + entity. Only the translatable tail is the glossary term; "VALO Tech Pte. Ltd." and the year are data, not vocabulary. |
| Explore the VALO ecosystem (footer link) | Khám phá hệ sinh thái VALO | `foot.eco`. |

## Owner decisions

Four renderings resisted a lookup — each a real fork or an open structural question rather than a translation with a settled answer. The owner ruled on all four; the reasoning is preserved here so a later reader can audit the call instead of reopening it.

### 1. Pricing nav — "Chi phí", not "Bảng giá"

**Market ref (verified):** "Bảng giá" is the settled convention among major Vietnamese B2B software vendors — confirmed directly against three live sites. MISA AMIS (amis.misa.vn) carries a standalone top-nav item labeled "Bảng giá". Haravan (haravan.com) uses "Bảng giá" for its pricing page. Base.vn uses the hybrid "Giải pháp & Giá". None of FPT's, VNG's, or Viettel's main corporate sites carry a comparable pricing nav item at all, so the strongest signal comes from the B2B SaaS tier rather than the large-conglomerate tier.

**Why the site diverges from it:** `close.big` states outright that "Chi phí là một phần của cuộc trao đổi về thiết kế, chứ không phải một bảng giá niêm yết sẵn" — cost is part of the design conversation, not a posted price list. That contradicts the connotation "Bảng giá" carries. Adopting the market-standard word would leave the page arguing with its own navigation, so the nav label follows the claim the page actually makes. The cost is some immediate recognizability to a visitor scanning the nav the way they would on MISA or Haravan.

### 2. Audit-defensible — "vững vàng trước kiểm toán"

The site previously rendered one English differentiator three ways: "Vững trước kiểm toán" (`hero.m2`), "sẵn sàng đứng vững trước mọi cuộc kiểm toán" (`hero.sub`), and "vững vàng trước kiểm toán" (`eco.lede`). English uses one fixed term throughout; only the Vietnamese had drifted, which cost the differentiator its recognizability.

**Decision:** "vững vàng trước kiểm toán" stands everywhere. The fuller adjective reads finished in the two sentence-form instances, and the short tag at `hero.m2` carries the extra syllable without crowding its stat-tile siblings ("Xây ngay trong hệ thống của bạn", "Thuộc về bạn").

### 3. Stage vs. Phase — "Chặng" for Stage, "Giai đoạn" for Phase

English keeps two structural tiers distinct: 2 **Stages** (Digitalization; AI and Data Platform) containing the 5 **Phases** (Exploratory through Workforce deployment). Vietnamese had collapsed both to "Giai đoạn", so a reader could not tell from the Vietnamese alone that "Giai đoạn 1" the stage and "Giai đoạn 1" the phase were different tiers of the same word.

**Decision:** reserve "Giai đoạn" for Phase — the smaller, more frequently referenced unit — and mark Stage as "Chặng". The two-tier structure is a real piece of the page's information architecture (the tab layout literally groups 5 phases under 2 stages), English marks it on purpose with two words, and "Chặng" reads naturally beside the "bệ phóng" (runway) metaphor the page already uses. Applied at `deliver.s1tag`, `deliver.s2tag`, `deliver.lede`, and `deliver.p2a`; every other numbered reference is a Phase and keeps "Giai đoạn".

**Extended to the rest of the catalogue.** Seven locales had the same collapse — zh, zt, ko, th, hi, ar, ur — while the other thirteen already marked the two tiers. The same shape was applied to all seven at the same four keys, keeping each locale's established Phase word and minting a distinct one for Stage: 板块 (zh), 板塊 (zt), 파트 (ko), ช่วง (th), खंड (hi), القسم (ar), حصہ (ur). The ~21 prose strings per locale that carry the Phase word are untouched, which is where a rename would have cost the most and been reviewed the least.

### 4. Verdiq's slogan — translated, without "tuyệt đối"

"Enter the Era of Absolute Compliance." is Verdiq's registered brand slogan (`brand/tokens.json` in the VALOCompliance repository), and it was the only one of the six product slogans left in English in all nineteen non-English locales while the other five were translated.

**Decision:** translate it, like its siblings. The literal Vietnamese — "tuân thủ tuyệt đối" — is exactly the unsubstantiated absolute claim the tone policy below forbids, and it carries real exposure under Luật Quảng cáo. **"Bước vào kỷ nguyên tuân thủ trọn vẹn."** keeps the register and the promise without the superlative; "tuân thủ tuyệt đối" is recorded as forbidden in `glossary-vi.json`. Locales outside Vietnam are not bound by that constraint and render the slogan directly.

## Market references

Vietnamese corporate/marketing-site convention, verified this session against live sites:

- **MISA AMIS** (amis.misa.vn) — leading Vietnamese-domestic B2B SaaS (accounting/ERP/CRM). Top nav carries a standalone "Bảng giá" item. No Trust/Security nav item — certifications (ISO 27001:2022, ISO 9001:2015, ISO 27017:2015, CMMI DEV/3, CSA STAR) surface in the footer instead, alongside "Chính sách bảo vệ dữ liệu cá nhân", "Về MISA", "Tin tức", "Tuyển dụng", "Liên hệ".
- **Haravan** (haravan.com) — Vietnamese e-commerce SaaS platform. Footer: "Bảng giá" (pricing), "Chính sách bảo mật và bảo vệ dữ liệu cá nhân" (privacy), "Điều khoản dịch vụ" (terms), plus ISO 27001 and Ministry of Industry and Trade registration badges. No Trust/Security nav item.
- **Base.vn** — Vietnamese workspace/enterprise-management SaaS. Nav: "Sản phẩm", "Giải pháp & Giá", "Lĩnh vực", "Tin tức", "Khách hàng", "Về chúng tôi". No Trust/Security nav item.
- **FPT** (fpt.com) — main corporate site uses "Về FPT" for About; its separate recruitment subsite uses "Giới Thiệu" as its own distinct label. Source: https://fpt.com/vi/ve-fpt.
- **VNG** (vng.com.vn) — main site footer uses "Về VNG" for About; "Tin tức mới nhất" and "Thông cáo báo chí" for news/press coverage, with no standalone "Press" footer link; "Liên hệ" for Contact. Source: https://vng.com.vn/.
- **Viettel** (viettel.com.vn) — "Tuyển dụng" for Careers.
- **AI workforce as a category term:** checked FPT Smart Cloud, VNG, and Viettel AI directly — none has coined an equivalent Vietnamese category term. Vietnamese coverage of these vendors uses "nhân sự AI" only in the generic journalistic sense (AI reducing headcount, AI hiring pushes), never as a product-category term for a deployed multi-agent system. "Đội ngũ AI" is closer to original coinage than a lookup.

## Tone policy

Marketing claims stay **honest and bounded**. Never render a claim as absolute ("tuyệt đối", "100%", "số một" / "#1", "duy nhất") unless the source copy already substantiates it — the current English copy itself makes no such claims, and Vietnamese advertising law (Luật Quảng cáo) exposes unsubstantiated superlative claims to regulatory risk. Where English uses a structural, falsifiable claim ("mechanically enforced", "audit-defensible", "every action logged"), the Vietnamese must preserve that specificity rather than soften it into vague reassurance, and must not inflate it into an unconditional guarantee either.

## Status

`glossary-vi.json` carries a decided Vietnamese term for all 45 concepts, and the live `vi` dictionary in `assets/i18n.js` matches it key for key. Sources, in priority order: verified market reference, checked directly against live competitor sites (see "Market references" above); the owner's ruling, for the four forks recorded under "Owner decisions"; standard Vietnamese usage per `write-native-professional-vietnamese`.

Run the checker against any Vietnamese output before it ships:

```
python3 .claude/skills/translate-english-to-native-locales/scripts/check_glossary.py <output-file> glossary-vi.json
```
