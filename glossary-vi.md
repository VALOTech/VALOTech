# VALO Tech — Vietnamese brand & site terminology (decided — 3 items pending owner)

The writing and translation skills under `.claude/skills/` treat `glossary-vi.json` as the authoritative Vietnamese glossary for this site. The machine-checkable form is `glossary-vi.json` (repo root); run the bundled checker against any output:

```
python3 .claude/skills/translate-english-to-native-locales/scripts/check_glossary.py <output-file> glossary-vi.json
```

**Voice.** VALO Tech speaks to corporate leaders, partners, and candidates evaluating a regulated-industry AI vendor: on-brand, clear, confident but honest — never hyped, every claim structurally defensible. Product and brand names stay in English in every locale.

This file records where each Vietnamese rendering in `glossary-vi.json` comes from, so a reviewer can audit a decision instead of re-deriving it. Every concept is grounded in copy actually read from the site (cited by i18n key). 41 of the 44 concepts below now carry a decided term; the remaining 3 are genuine forks or open structural questions, not lookups — see "To confirm with owner" — and ship with `preferred: []` until the owner picks.

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
| Pridwen | Pridwen | Sibling product, B2B GRC platform (pridwen.io), marked "New" on-site. Proper noun — keep as-is. |
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
| Pricing (nav) | *(pending — see "To confirm with owner")* | `nav.pricing`. The current site's "Chi phí" is a considered divergence from the verified market default, not an oversight. |
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
| AI workforce | đội ngũ AI | Core recurring positioning term (`hero.h1`, `workforce.h2`, dozens of occurrences). Checked FPT Smart Cloud, VNG, and Viettel AI for an established Vietnamese category term — found none; Vietnamese-language coverage of these vendors uses "nhân sự AI" only in the generic journalistic sense of AI reducing headcount, not as a product-category term matching VALO Tech's meaning (a deployed multi-agent system standing in for a department). "Đội ngũ AI" remains closer to original coinage than a lookup, and is already used consistently everywhere on the current site. |
| Clean data / clean data foundation | dữ liệu sạch / nền tảng dữ liệu sạch | Recurring term (`hero.h1`, `problem.lede`, `answer.big`, `phases.5o`). Current site renders both consistently: bare "clean data" → "dữ liệu sạch"; the compound "clean data foundation" → "nền tảng dữ liệu sạch". |
| Audit-defensible | *(pending — see "To confirm with owner")* | Recurring differentiator (`hero.m2`, `hero.sub`, `eco.lede`, meta description — the meta description itself is English-only, not localized). The clearest internal terminology fork on the site. |
| Audit trail | nhật ký kiểm toán | Recurring term (`trust.2t`, `cap.7t`). Both instances render the English "Full audit trail" as "Nhật ký kiểm toán đầy đủ" — consistent; "đầy đủ" (full) composes onto the base term as needed elsewhere. |
| Mechanical governance / mechanically enforced | quản trị bằng cơ chế / thực thi bằng cơ chế | Recurring term (`trust.1t`, `cap.1t`, `cap.4c`). The site keeps the two English phrasings distinct and internally consistent: "mechanical governance" → "quản trị bằng cơ chế" (`cap.1t`: "Quản trị bằng cơ chế, không phải bằng hướng dẫn"); "mechanically enforced" → "thực thi bằng cơ chế" (`trust.1t`, `cap.4c`). |
| Regulated industries / regulated-industry | ngành chịu quản lý chặt chẽ | Recurring descriptor (`hero.eyebrow`, `cap.lede`, `foot.tagline`). `cap.lede` currently shortens this to "chịu quản lý chặt", dropping "chẽ" — "chặt chẽ" (rigorous/strict) is the complete, standard collocation for regulatory strictness in Vietnamese; bare "chặt" (tight) alone is colloquial shorthand. `cap.lede` should level up to match `hero.eyebrow` and `foot.tagline`, which already use the full form. |
| Your data, your cloud / yours to keep | Dữ liệu của bạn, cloud của bạn / Thuộc về bạn | Data-sovereignty pledge (`trust.3t`, `hero.m3`, `custom.keept`/`custom.keepd`). "Your data, your cloud" → "Dữ liệu của bạn, cloud của bạn" (`trust.3t`); the short tag "yours to keep" → "Thuộc về bạn" (`hero.m3`). Both are settled, consistent renderings; the wording is not in question, but the pledge is likely to carry legal weight for VN buyers under PDPL data-residency expectations, so the underlying claim — not the phrase — deserves legal review before the site is treated as a binding representation. |
| Domain-tuned / customized to your business | tùy biến theo lĩnh vực / tùy biến theo doanh nghiệp | Recurring differentiator (`phases.5t`, `deliver.p2m1t`, `custom` section). Both phrasings anchor on "tùy biến" (tuned/customized): "domain-tuned" → "tùy biến theo lĩnh vực" (`deliver.p2c`); "customized to your business" → "tùy biến theo doanh nghiệp" (`answer.big`). |
| Foundation / data platform / runway | nền tảng / nền tảng dữ liệu / bệ phóng | Recurring infrastructure metaphor (`deliver.*` section, `phases.3t`). "Foundation" → "nền tảng"; "data platform" → "nền tảng dữ liệu" (`phases.3t`: "Xây nền tảng dữ liệu"); "runway" → "bệ phóng", paired consistently with "nền tảng" throughout (`deliver.s2d`: "Nền tảng trở thành bệ phóng"). |
| Stage vs. Phase | *(pending — see "To confirm with owner")* | English distinguishes two structural terms: 2 **Stages** (Digitalization; AI and Data Platform) each containing some of the 5 **Phases** (`deliver.s1tag`/`s2tag`: "Stage 1"/"Stage 2" vs `phases.1l`-`5l`: "Phase 1 · Exploratory" etc.). Current site collapses both to "Giai đoạn" — confirmed directly in `assets/i18n.js`. |
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
| About / Careers / Press / Contact | Về VALO Tech / Tuyển dụng / Báo chí / Liên hệ | `foot.about` / `foot.careers` / `foot.press` / `foot.contact`. Careers and Contact are solidly corroborated as-is: FPT's main site, its recruitment subsite, and Viettel's site all converge on "Tuyển dụng"; "Liên hệ" for Contact is identical across FPT, VNG, and Viettel. About is upgraded from the current site's generic "Giới thiệu" to the brand-specific "Về VALO Tech": FPT's main corporate site uses "Về FPT" for About, and VNG's main site uses "Về VNG" for the same slot — both re-confirmed directly against the live sites this session. (FPT's separate recruitment subsite uses "Giới Thiệu" as its own distinct label, but that subsite is a narrower recruiting funnel, not the structural analog to VALO Tech's single corporate hub — the two main corporate sites are the closer comparison.) Press has no direct competitor precedent: VNG nests press content under "Tin tức mới nhất" (news) and "Thông cáo báo chí" (press releases) rather than a standalone footer link. "Báo chí" is standard Vietnamese for the concept and shares its root with "thông cáo báo chí" — kept. |
| Privacy / Terms / Cookies | Chính sách bảo mật / Điều khoản sử dụng / Cookie | `foot.privacy` / `foot.terms` / `foot.cookies`. Upgraded from the current site's short forms ("Quyền riêng tư" / "Điều khoản") to the fuller legal-register forms verified against two independent VN B2B platforms: Haravan uses "Chính sách bảo mật và bảo vệ dữ liệu cá nhân" and "Điều khoản dịch vụ"; MISA AMIS uses "Chính sách bảo vệ dữ liệu cá nhân". "Chính sách bảo mật" is the shared, most-recognized root across both and across the wider Vietnamese web. "Điều khoản sử dụng" (Terms of Use) is kept over the more transactional "Điều khoản dịch vụ" (Terms of Service) since this footer link covers use of the marketing site itself, not an active service login. "Cookie" stays an English loanword — universal Vietnamese convention, no naturalized alternative in use anywhere observed. |
| All rights reserved. (copyright line) | Bảo lưu mọi quyền. | `foot.rights`, combined with year + entity. Only the translatable tail is the glossary term; "VALO Tech Pte. Ltd." and the year are data, not vocabulary. |
| Explore the VALO ecosystem (footer link) | Khám phá hệ sinh thái VALO | `foot.eco`. |

## To confirm with owner

Three items resist a lookup — each is a real fork or an open structural question, not a translation choice with a settled answer. `glossary-vi.json` ships `preferred: []` for all three.

### 1. Pricing nav — "Chi phí" vs. "Bảng giá"

**Decision:** should `nav.pricing` keep the current site's "Chi phí" (cost), or switch to "Bảng giá" (price list), the verified Vietnamese B2B SaaS default?

**Market ref (verified):** "Bảng giá" is the settled convention among major Vietnamese B2B software vendors — confirmed directly against three live sites this session. MISA AMIS (amis.misa.vn) carries a standalone top-nav item labeled "Bảng giá". Haravan (haravan.com) uses "Bảng giá" for its pricing page. Base.vn (base.vn) uses the hybrid "Giải pháp & Giá". None of FPT's, VNG's, or Viettel's main corporate sites carry a comparable pricing nav item at all, so the strongest signal comes from the B2B SaaS tier rather than the large-conglomerate tier.

**Situation:** the divergence looks deliberate, not an oversight. `close.big` states outright that "Chi phí là một phần của cuộc trao đổi về thiết kế, chứ không phải một bảng giá niêm yết sẵn" (cost is part of the design conversation, not a posted price list) — directly contradicting the connotation "Bảng giá" carries (a published, browsable list). Adopting the market-standard word would undercut the page's own stated positioning.

**Options:**
- **A.** Keep "Chi phí" — consistent with the anti-menu positioning stated in `close.big`; costs some immediate recognizability as "click here for pricing" to a visitor scanning the nav the way they would on MISA or Haravan.
- **B.** Switch to "Bảng giá" — matches the settled market convention and is what a pricing-seeking visitor scans for; costs the anti-menu framing, unless `close.big` is reworded to resolve the tension at the same time.

**Recommendation:** **A** — keep "Chi phí". The nav label and the `close.*` section content should agree with each other, and `close.big` is a considered piece of copy making a real claim about how VALO Tech prices engagements; changing only the nav word would leave the page arguing with its own navigation. If the owner wants the recognizability of "Bảng giá", the fix is to revisit `close.big`'s framing at the same time, not the nav label alone.

**Decision owner:** owner/BA — this is brand positioning, not a lookup.

### 2. Audit-defensible — three-way fork

**Decision:** which single Vietnamese rendering should stand for "audit-defensible" everywhere it recurs?

**Situation:** the current site renders the same English term three different ways in three places. `hero.m2` (a short stat-tile tag) → "Vững trước kiểm toán". `hero.sub` (full sentence) → "...sẵn sàng đứng vững trước mọi cuộc kiểm toán ngay từ ngày đầu tiên". `eco.lede` (full sentence) → "...vững vàng trước kiểm toán ngay từ trong thiết kế...". This is the clearest internal inconsistency on the site — three near-synonymous renderings of one differentiator, which undermines it as a fixed, recognizable term.

**Options:**
- **A.** Standardize on "vững trước kiểm toán" (from `hero.m2`) — the one place the term already functions as a short, repeatable tag, alongside its parallel stat-tile siblings `hero.m1` ("Xây ngay trong hệ thống của bạn") and `hero.m3` ("Thuộc về bạn"); the two sentence-form instances would tighten to reuse it directly.
- **B.** Standardize on "vững vàng trước kiểm toán" (from `eco.lede`) — a slightly fuller adjective that reads more finished in full-sentence contexts, at the cost of one extra syllable in the short-tag use.
- **C.** Keep the tag form short and let prose instances elaborate freely around it, rather than forcing byte-identical wording everywhere — most Vietnamese marketing copy already varies surface phrasing sentence-to-sentence while keeping the underlying term recognizable.

**Recommendation:** **A** — anchor on "vững trước kiểm toán" as the fixed short-form term, since it is the only one of the three actually functioning as a tag rather than prose; let `hero.sub` and `eco.lede` fold it into their sentences instead of inventing a new adjective each time.

**Decision owner:** owner/BA — a wording-consistency call across live marketing copy, not a translation lookup, since the English source uses one fixed term throughout and only the Vietnamese has drifted.

### 3. Stage vs. Phase — collapsed to one word

**Decision:** does the Vietnamese site need two distinct container words, matching English "Stage" vs. "Phase", or is collapsing both to "Giai đoạn" acceptable?

**Situation:** verified directly in `assets/i18n.js`. English keeps the two levels distinct — `deliver.s1tag`/`s2tag`: "Stage 1"/"Stage 2"; `phases.1l`-`5l`: "Phase 1 · Exploratory" etc., 5 phases nested inside 2 stages. The current Vietnamese renders both as "Giai đoạn N", losing the containment relationship: a reader cannot tell from the Vietnamese alone that "Giai đoạn 1" the stage and "Giai đoạn 1" the phase are different tiers of the same word.

**Options:**
- **A.** Keep "Giai đoạn" for both — it is the natural, unmarked Vietnamese word for a sequential step, and the containment relationship stays legible from context (the two-stage tab layout and the five-phase timeline are visually distinct sections); a second technical word for "stage" risks sounding over-engineered for a distinction most visitors will not consciously track.
- **B.** Reserve "Giai đoạn" for Phase (the smaller, member-facing unit) and introduce a second word for Stage — candidates: "Chặng" (leg/segment of a journey — pairs well with the runway/foundation metaphor already on the page) or "Nhóm giai đoạn" (phase-group — transparent but literal, slightly bureaucratic).

**Recommendation:** **B**, with "Chặng" — the two-tier structure is a real piece of the page's information architecture (the tab layout literally groups 5 phases under 2 stages), and English marks that on purpose with two words; "Chặng" reads naturally next to the existing "bệ phóng" (runway) metaphor rather than adding a bureaucratic-sounding compound.

**Decision owner:** owner/BA — introducing a new structural term is a small but real content decision, not a pure lookup.

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

`glossary-vi.json` carries a decided Vietnamese term for 41 of the 44 concepts. Sources, in priority order: verified market reference, checked directly against live competitor sites this session (see "Market references" above); the site's own live `vi` dictionary in `assets/i18n.js`, verified key-by-key against the source file rather than against an earlier paraphrase; standard Vietnamese usage per `write-native-professional-vietnamese`. The remaining 3 — Pricing nav, "Audit-defensible", and Stage-vs-Phase — are genuine forks or open structural questions, not lookups; they carry `preferred: []` and are filed under "To confirm with owner" above with researched options and a recommendation each.

Two renderings intentionally depart from the current live site, each on verified market grounds set out in its row above: About ("Giới thiệu" → "Về VALO Tech") and Privacy/Terms ("Quyền riêng tư"/"Điều khoản" → "Chính sách bảo mật"/"Điều khoản sử dụng"). The current site remains a starting reference, not a ceiling. Chinese (`zh`/`zt`) stays deferred to a later translator pass, per the standing ecosystem convention.
