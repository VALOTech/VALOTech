/* VALO Tech - i18n engine + dictionaries.
   20 ecosystem locales (order/RTL/endonyms synced with the VALO standard).
   English + Vietnamese authored in full; the other 18 are seeded and fall back
   to English until translated through the ecosystem LibreTranslate + review path. */
(function (w) {
  "use strict";

  var locales = ["en","zh","zt","vi","th","id","ms","tl","hi","es","ar","fr","bn","pt","ru","ur","de","ja","tr","ko"];
  var rtl = ["ar","ur"];
  var bcp47 = {en:"en",zh:"zh-Hans",zt:"zh-Hant",vi:"vi",th:"th",id:"id",ms:"ms",tl:"fil",hi:"hi",es:"es",ar:"ar",fr:"fr",bn:"bn",pt:"pt",ru:"ru",ur:"ur",de:"de",ja:"ja",tr:"tr",ko:"ko"};
  var labels = {en:"English",zh:"简体中文",zt:"繁體中文",vi:"Tiếng Việt",th:"ภาษาไทย",id:"Bahasa Indonesia",ms:"Bahasa Melayu",tl:"Filipino",hi:"हिन्दी",es:"Español",ar:"العربية",fr:"Français",bn:"বাংলা",pt:"Português",ru:"Русский",ur:"اردو",de:"Deutsch",ja:"日本語",tr:"Türkçe",ko:"한국어"};

  var flag = {en:"us",zh:"cn",zt:"tw",vi:"vn",th:"th",id:"id",ms:"my",tl:"ph",hi:"in",es:"es",ar:"sa",fr:"fr",bn:"bd",pt:"pt",ru:"ru",ur:"pk",de:"de",ja:"jp",tr:"tr",ko:"kr"};

  function match(prefs) {
    for (var i = 0; i < prefs.length; i++) {
      var tag = String(prefs[i]).toLowerCase(), base = tag.split("-")[0];
      if (base === "zh") return (tag.indexOf("hant") >= 0 || tag.indexOf("tw") >= 0 || tag.indexOf("hk") >= 0 || tag.indexOf("mo") >= 0) ? "zt" : "zh";
      if (base === "fil" || base === "tl") return "tl";
      if (locales.indexOf(base) >= 0) return base;
    }
    return "en";
  }

  var en = {
    "nav.approach":"Approach","nav.workforce":"Workforce","nav.trust":"Trust","nav.ecosystem":"Ecosystem","nav.pricing":"Pricing",
    "cta.start":"Start the conversation","cta.approach":"See the approach",
    "lang.label":"Language","theme.light":"Light theme","theme.dark":"Dark theme","theme.auto":"Match system",
    "brand.slogan":"Trustworthy AI for the real world.",

    "hero.eyebrow":"AI workforce · regulated industries",
    "hero.h1":"An AI workforce, deployed on your own <span class=\"grad-text\">clean data.</span>",
    "hero.sub":"A multi-agent workforce that runs on a data foundation we build inside your environment. Audit-defensible from day one.",
    "hero.m1":"Built in your environment","hero.m2":"Audit-defensible","hero.m3":"Yours to keep",

    "trust.1t":"Mechanical enforcement","trust.1d":"Agents cannot break the rules. Governance runs in code, outside the agent.",
    "trust.2t":"Full audit trail","trust.2d":"Every action logged, every claim traceable to a live source.",
    "trust.3t":"Your data, your cloud","trust.3d":"The platform lives in your environment. You keep and operate it.",

    "stats.1l":"phases, foundation to workforce","stats.2l":"AI departments, customized","stats.3l":"governance capabilities","stats.4l":"products in the ecosystem",

    "problem.h2":"The problem corporate leaders face today",
    "problem.lede":"You do not need another AI tool. You need an AI workforce, and the clean data foundation underneath it.",
    "problem.1t":"Hiring is slow and expensive","problem.1d":"Product, design, engineering, QA, ops, support, finance, marketing. Every hire takes months. Every departure walks knowledge out the door.",
    "problem.2t":"Point AI tools do not connect","problem.2d":"One AI for writing, another for code, another for analysis. None share context, understand your business, or remember last week.",
    "problem.3t":"Your data is scattered","problem.3d":"A portfolio system, a CRM, an ERP, accounting, and a dozen spreadsheets. Until that data is consolidated and labeled, no AI can work reliably on it.",

    "answer.eyebrow":"The answer",
    "answer.big":"A complete AI workforce running on your own clean data, customized to your business.",
    "answer.sub":"Not a chatbot. Not a generic license. A five-phase engagement that understands your business, builds the data foundation your AI needs, and deploys a domain-tuned workforce your team directs.",

    "deliver.h2":"What we deliver",
    "deliver.lede":"Two sequential stages and one parallel track, on a foundation you own.",
    "deliver.s1tag":"Stage 1","deliver.s1t":"Digitalization","deliver.s1d":"Your systems and manual processes become one digitalized environment.",
    "deliver.s2tag":"Stage 2","deliver.s2t":"AI and Data Platform","deliver.s2d":"The foundation becomes the runway, then the AI workforce deploys on top.",
    "deliver.track":"Software Engineering runs in parallel, building the systems that fit your environment, under the same governance.",
    "deliver.tab1":"Digitalization","deliver.tab2":"AI and Data Platform","deliver.tab3":"Software Engineering",
    "deliver.p1lead":"The technology usually arrives before the data, people, and regulatory ground are ready. We lay that foundation first, mechanically enforced and reviewable from day one.",
    "deliver.p1a":"Modernize without ripping out what already works.","deliver.p1b":"Put governance infrastructure in place before anything runs on it.","deliver.p1c":"Absorb scattered systems and manual processes into one environment.",
    "deliver.p1foot":"Not four products. One foundation, what every later phase runs on.",
    "deliver.p2lead":"Most AI programs fail because the data underneath is scattered and untrusted. We deliver the other way around: the foundation becomes the runway, the workforce deploys on top.",
    "deliver.p2a":"Train your team to operate the platform Stage 1 built.","deliver.p2b":"Deploy the workforce on it, with audit logging from day one.","deliver.p2c":"Customize the workforce to your domain, not the generic model.",
    "deliver.p2foot":"One runway and one workforce, yours to operate after Phase 4.",
    "deliver.p3lead":"Custom software fails when the operating context was never inside the build. The same workforce that runs your operations writes the software, under the same governance.",
    "deliver.p3a":"Built inside your workforce, not a separate dev silo.","deliver.p3b":"The same mechanical quality gates as every other agent action.","deliver.p3c":"Shaped to your domain, not a generic template.",
    "deliver.p3foot":"Agent definitions and code remain yours, to keep, fork, or extend.",
    "deliver.meanh":"What this means in your business",
    "deliver.p1m1t":"From scattered systems to one foundation","deliver.p1m1d":"A portfolio system, a CRM, an ERP, accounting, and a dozen spreadsheets, plus the manual processes that bridge them. Phases 1 to 3 absorb all of it into one environment, every record on infrastructure you own.",
    "deliver.p1m2t":"Manual processes, digitalized","deliver.p1m2d":"We map every manual process around your systems and decide what gets digitalized, connected, or left as-is. By Phase 3 the operational seams are gone.",
    "deliver.p1m3t":"Governance before anything runs on it","deliver.p1m3d":"Audit logging, risk-tier classification, regulatory clause tracing, and quality gates are built in during Phases 2 and 3, not bolted on later.",
    "deliver.p1m4t":"A proof of concept on your real data","deliver.p1m4d":"Phase 2 produces an approved technical design plus a working PoC on a slice of your actual data, end to end, before any production commitment.",
    "deliver.p2m1t":"Configured to your business","deliver.p2m1d":"The workforce arrives in Phase 5 already shaped for your departments, processes, regulatory context, and vocabulary. Each deployment is your deployment.",
    "deliver.p2m2t":"A workforce, not a model","deliver.p2m2d":"An integrated multi-agent system with shared memory, vocabulary, and governance across departments. The workforce is the product; the model is the substrate.",
    "deliver.p2m3t":"Your team operates it from Phase 4","deliver.p2m3d":"By Phase 4 your users run queries, connect BI tools, and operate simple AI without our day-to-day involvement.",
    "deliver.p2m4t":"Every engagement compounds","deliver.p2m4d":"The workforce gets smarter across engagements via ValoStack. With informed consent, validated domain logic feeds the network; your data stays yours.",
    "deliver.p3m1t":"Built by your AI workforce","deliver.p3m1d":"The Engineering department designs, codes, and ships. No second vendor, no handoff seam. The agents that decide what to build are the ones that build it.",
    "deliver.p3m2t":"Mechanical quality gates","deliver.p3m2d":"Every change passes the same audit-logged gates as every other agent action. Security, performance, accessibility, and compliance verified before merge.",
    "deliver.p3m3t":"Shaped to your operations","deliver.p3m3d":"Designed for your processes, regulatory context, and vocabulary. Customization is the default, never a templated SaaS dropped on top.",
    "deliver.p3m4t":"Code and agents remain yours","deliver.p3m4d":"The agents are markdown files. The code is yours. The deployment runs on your cloud. You can keep, fork, or extend everything we deliver.",

    "phases.h2":"And how we deliver it",
    "phases.lede":"Five phases, each building on the last. The first four lay the runway. The fifth is when your AI workforce takes off.",
    "phases.1l":"Phase 1 · Exploratory","phases.1t":"Discovery and roadmap","phases.1d":"We survey your source systems, processes, data quality, and regulatory context, then prioritize the use cases that unlock the most value first.","phases.1o":"A strategic roadmap with prioritized use cases and a target architecture. You decide whether and how to proceed.",
    "phases.2l":"Phase 2 · Architecture and PoC","phases.2t":"Architecture and proof of concept","phases.2d":"We design the data platform foundation, then build a working proof of concept on a slice of your real data, end to end.","phases.2o":"An approved technical design plus a working PoC on your actual systems, before any production commitment.",
    "phases.3l":"Phase 3 · Build","phases.3t":"Build the data platform","phases.3d":"We implement ingestion, transformation, layers, orchestration, and monitoring in your environment. Every record ends up cleaned, labeled, and queryable.","phases.3o":"A production-ready data platform on your own cloud, the runway your workforce operates on.",
    "phases.4l":"Phase 4 · Platform training","phases.4t":"Train your team to operate it","phases.4d":"Your internal users learn to connect BI tools, query the centralized data, and run simple AI without our day-to-day involvement.","phases.4o":"Internal users running the platform end to end, on their own.",
    "phases.5l":"Phase 5 · Workforce deployment","phases.5t":"Deploy your customized AI workforce","phases.5d":"We tune the multi-agent workforce to your departments, processes, and vocabulary, deploy ValoStack, and train your team to direct it.","phases.5o":"A domain-tuned AI workforce running on your clean data, with your team trained to operate it.",

    "workforce.h2":"What your AI workforce does",
    "workforce.lede":"Nine departments, mapped to the real functions of a modern company and customized to how you already operate. Live once Phase 5 deploys.",
    "workforce.1n":"Decide what to build next","workforce.1t":"Product and Strategy","workforce.1d":"Writes requirements, prioritizes your roadmap, models pricing.",
    "workforce.2n":"Make the experience loved","workforce.2t":"Design and Experience","workforce.2d":"Designs interfaces, writes content, keeps the brand consistent.",
    "workforce.3n":"Build the software","workforce.3t":"Engineering","workforce.3d":"Designs architecture, writes code, deploys to production.",
    "workforce.4n":"Make sure nothing breaks","workforce.4t":"Quality and Security","workforce.4d":"Reviews code, tests performance, checks security, verifies compliance.",
    "workforce.5n":"Run daily operations","workforce.5t":"Operations and Delivery","workforce.5d":"Plans production, manages vendors, forecasts demand, monitors operations.",
    "workforce.6n":"Keep and grow customers","workforce.6t":"Customer Success","workforce.6d":"Onboards users, handles support, collects feedback, coaches on your domain.",
    "workforce.7n":"Stay legal and profitable","workforce.7t":"Finance and Compliance","workforce.7d":"Financial analysis, risk assessment, regulatory monitoring.",
    "workforce.8n":"Keep leadership informed","workforce.8t":"Executive Office","workforce.8d":"Daily briefings, on-demand research, tracking of industry changes.",
    "workforce.9n":"Reach new customers","workforce.9t":"Marketing and Growth","workforce.9d":"Runs campaigns, creates content, tests growth tactics, measures results.",

    "valostack.h2":"ValoStack. The brain that compounds.",
    "valostack.lede":"Every deployment makes the next one smarter. With your consent.",
    "valostack.b1":"Each deployment captures your workflows, decisions, and domain logic into typed, timestamped, expert-validated memory.",
    "valostack.b2":"With informed consent, that knowledge feeds ValoStack, our cross-client brain. Every partner inherits cross-industry intelligence from day one.",
    "valostack.b3":"Your data stays yours. Patterns and validated domain logic become a shared advantage.",
    "valostack.cap":"A workforce that retains every prior engagement's learning, and produces an audit trail explaining how each output was reached.",

    "cap.h2":"Why corporate leaders trust ValoLab",
    "cap.lede":"Regulated-industry buyers ask one question first: how do we defend this to the auditor? The answer is structural. Every action is mechanically governed, logged, and reviewable.",
    "cap.1t":"Mechanical governance, not guidelines","cap.1h":"Rules enforced by code outside the agent. The agent does not get a choice.",
    "cap.1a":"Hard deny: dangerous actions are blocked before they happen, no override without a human.","cap.1b":"Risk tiers: every task is classified before work begins; high-risk needs approval.","cap.1c":"Independent auditor and circuit breaker review every response and halt on violations.",
    "cap.2t":"Institutional memory that compounds","cap.2h":"Knowledge captured once is available everywhere, typed and trust-labeled.",
    "cap.2a":"Six structured memory categories, from decisions to evaluated research.","cap.2b":"Cross-project compounding: new agents inherit the full knowledge on day one.","cap.2c":"Freshness control: stale knowledge is flagged before anyone acts on it.",
    "cap.3t":"Information quality engine","cap.3h":"Every external claim is evaluated before it reaches you.",
    "cap.3a":"Three-axis source evaluation plus GRADE downgrade assessment.","cap.3b":"Training data is banned: every point traces to a live, verifiable source.","cap.3c":"Per-finding labels: Verified, Indicated, or Suggested. No speculation as fact.",
    "cap.4t":"Quality gate pipeline","cap.4h":"Blocking checkpoints from requirements to production.",
    "cap.4a":"Eight gates; work cannot advance until each passes.","cap.4b":"Code review runs security, performance, compliance, and quality in parallel.","cap.4c":"Mechanically enforced: an agent cannot mark work done without passing them.",
    "cap.5t":"Pluggable domain knowledge","cap.5h":"Industry expertise is modular. Switch domains without rebuilding.",
    "cap.5a":"Rules, regulations, and ontology stored separately from the org structure.","cap.5b":"Each domain defines its own evidence types and weighting.","cap.5c":"Regulatory override: law is never overridden by the research.",
    "cap.6t":"Three-layer architecture for reuse","cap.6h":"The whole organization transfers to every new engagement.",
    "cap.6a":"Layer 1 Org, Layer 2 Domain, Layer 3 Client; only the last changes per engagement.","cap.6b":"Starting a new engagement means adding Layer 3 only.","cap.6c":"No rebuilding from scratch; every prior engagement makes the next one smarter.",
    "cap.7t":"Full audit trail on every action","cap.7h":"Who did what, when, and under what authority.",
    "cap.7a":"Every tool call logged with type, tier, timestamp, and session.","cap.7b":"Automated compliance review every 20 actions.","cap.7c":"No silent failures: when something is blocked, the human sees why.",
    "cap.gatesh":"Eight blocking gates, requirements to production",
    "cap.g1n":"Requirements","cap.g1c":"Right thing to build?",
    "cap.g2n":"Design","cap.g2c":"Will customers get it?",
    "cap.g3n":"Architecture","cap.g3c":"Will it scale?",
    "cap.g4n":"Code review","cap.g4c":"Security, performance, compliance, quality",
    "cap.g5n":"Acceptance","cap.g5c":"Meets requirements?",
    "cap.g6n":"Production","cap.g6c":"Safe to release?",
    "cap.lay1l":"Layer 1 · Org","cap.lay1d":"Departments, roles, playbooks. Generic, works for any client.",
    "cap.lay2l":"Layer 2 · Domain","cap.lay2d":"Industry expertise. Shared across clients in the same industry.",
    "cap.lay3l":"Layer 3 · Client","cap.lay3d":"Client-specific config. Only this changes per engagement.",

    "people.h2":"How your people fit in",
    "people.lede":"This is not about replacing your team. It is about what your team directs.",
    "people.h.l":"Your people","people.h.r":"The AI workforce",
    "people.1l":"Set strategy and priorities","people.1r":"Execute against those priorities",
    "people.2l":"Make high-stakes decisions","people.2r":"Prepare options with analysis",
    "people.3l":"Approve what ships","people.3r":"Run the review and QA process",
    "people.4l":"Own customer relationships","people.4r":"Handle support volume and feedback",
    "people.5l":"Define the brand","people.5r":"Apply brand rules consistently",
    "people.tag":"Your people decide. The AI workforce delivers.",

    "custom.leadt":"Every deployment is yours, not ours","custom.leadd":"The platform ships as a framework. The version that lives in your company is built specifically for you.",
    "custom.1t":"Your departments","custom.1d":"The nine departments map to your real org chart. No function you do not need.",
    "custom.2t":"Your source systems","custom.2d":"The platform integrates with your actual stack. We ingest where your data lives.",
    "custom.3t":"Your regulatory context","custom.3d":"The domain layer is configured to your jurisdiction and industry.",
    "custom.keept":"And if we ever stop existing?","custom.keepd":"Your data platform lives in your cloud. Your team operates it after Phase 4. The agent definitions are markdown files, yours to keep, fork, or extend. Your operation never depends on us continuing to exist.",

    "eco.eyebrow":"VALO Ecosystem",
    "eco.h2":"One company. A family of products.",
    "eco.lede":"VALO Tech builds and operates an ecosystem of products for the digital economy. ValoLab is how we build them, audit-defensible by design, on a foundation every product shares.",
    "eco.ads":"Ad network and digital hub for publishers, advertisers, affiliates, and merchants.",
    "eco.pocket":"One regulated wallet and identity for the whole ecosystem.",
    "eco.compliance":"A compliance shield for legal, security, and privacy.",
    "eco.shimmra":"Idol live-streaming with gifting and live shopping.",
    "eco.amavo":"Video-first dating for real connections in Southeast Asia.",
    "eco.soon":"New",
    "eco.hubcap":"VALO Tech at the center. Every product runs on the same governed foundation.",

    "close.eyebrow":"Pricing and engagement",
    "close.h2":"Designed with you, priced for what we build together",
    "close.big":"Pricing is part of the design conversation, not a published menu.",
    "close.p1":"Every engagement reflects your systems, your regulatory context, and which phases suit you now. We understand what you are working on first, then design something that fits.",
    "close.p2":"The first step is a short call. We come back with a written read-out you can share with your team.",
    "close.fine":"A 30-minute exploratory conversation. No proposal pressure, no sales script.",

    "foot.eco":"Explore the VALO ecosystem",
    "foot.tagline":"VALO Tech Pte. Ltd. builds an AI-native ecosystem for regulated, real-world business.",
    "foot.product":"Product","foot.company":"Company","foot.legal":"Legal",
    "foot.about":"About","foot.careers":"Careers","foot.press":"Press","foot.contact":"Contact",
    "foot.privacy":"Privacy","foot.terms":"Terms","foot.cookies":"Cookies",
    "foot.rights":"© 2026 VALO Tech Pte. Ltd. All rights reserved.","foot.loc":"Singapore"
  };

  var vi = {
    "nav.approach":"Phương pháp","nav.workforce":"Lực lượng","nav.trust":"Niềm tin","nav.ecosystem":"Hệ sinh thái","nav.pricing":"Chi phí",
    "cta.start":"Bắt đầu trao đổi","cta.approach":"Xem phương pháp",
    "lang.label":"Ngôn ngữ","theme.light":"Giao diện sáng","theme.dark":"Giao diện tối","theme.auto":"Theo hệ thống",
    "brand.slogan":"AI đáng tin cho thế giới thực.",

    "hero.eyebrow":"Lực lượng AI · ngành được quản lý",
    "hero.h1":"Một lực lượng AI, vận hành trên <span class=\"grad-text\">dữ liệu sạch của bạn.</span>",
    "hero.sub":"Một lực lượng đa tác nhân vận hành trên nền tảng dữ liệu mà chúng tôi dựng ngay trong môi trường của bạn. Vững vàng trước kiểm toán ngay từ ngày đầu.",
    "hero.m1":"Dựng trong môi trường của bạn","hero.m2":"Vững vàng trước kiểm toán","hero.m3":"Thuộc về bạn",

    "trust.1t":"Thực thi bằng cơ chế","trust.1d":"Tác nhân không thể phá luật. Quản trị chạy bằng mã, nằm ngoài tầm tác nhân.",
    "trust.2t":"Nhật ký kiểm toán đầy đủ","trust.2d":"Mọi hành động đều được ghi lại, mọi khẳng định đều truy được về một nguồn trực tiếp.",
    "trust.3t":"Dữ liệu của bạn, đám mây của bạn","trust.3d":"Nền tảng nằm trong môi trường của bạn. Bạn giữ và vận hành nó.",

    "stats.1l":"giai đoạn, từ nền tảng đến lực lượng","stats.2l":"phòng ban AI, tùy biến","stats.3l":"năng lực quản trị","stats.4l":"sản phẩm trong hệ sinh thái",

    "problem.h2":"Vấn đề lãnh đạo doanh nghiệp đang đối mặt",
    "problem.lede":"Bạn không cần thêm một công cụ AI. Bạn cần một lực lượng AI, và nền tảng dữ liệu sạch bên dưới nó.",
    "problem.1t":"Tuyển dụng chậm và tốn kém","problem.1d":"Sản phẩm, thiết kế, kỹ thuật, QA, vận hành, hỗ trợ, tài chính, marketing. Mỗi lần tuyển mất hàng tháng. Mỗi lần có người rời đi, tri thức cũng đi theo.",
    "problem.2t":"Các công cụ AI rời rạc không kết nối","problem.2d":"Một AI để viết, một cho mã, một cho phân tích. Không cái nào chia sẻ ngữ cảnh, hiểu doanh nghiệp, hay nhớ tuần trước.",
    "problem.3t":"Dữ liệu của bạn phân tán","problem.3d":"Một hệ quản lý danh mục, một CRM, một ERP, kế toán, và hàng chục bảng tính. Chưa hợp nhất và gắn nhãn thì không AI nào làm việc đáng tin trên đó.",

    "answer.eyebrow":"Lời giải",
    "answer.big":"Một lực lượng AI hoàn chỉnh chạy trên dữ liệu sạch của chính bạn, tùy biến theo doanh nghiệp.",
    "answer.sub":"Không phải chatbot. Không phải giấy phép chung chung. Một quá trình năm giai đoạn: hiểu doanh nghiệp, dựng nền tảng dữ liệu mà AI cần, rồi triển khai lực lượng được tinh chỉnh theo lĩnh vực để đội ngũ của bạn điều hành.",

    "deliver.h2":"Chúng tôi mang lại điều gì",
    "deliver.lede":"Hai giai đoạn tuần tự và một nhánh song song, trên nền tảng bạn sở hữu.",
    "deliver.s1tag":"Giai đoạn 1","deliver.s1t":"Số hóa","deliver.s1d":"Hệ thống và quy trình thủ công của bạn hợp nhất thành một môi trường số hóa.",
    "deliver.s2tag":"Giai đoạn 2","deliver.s2t":"Nền tảng AI và Dữ liệu","deliver.s2d":"Nền tảng trở thành đường băng, rồi lực lượng AI triển khai bên trên.",
    "deliver.track":"Kỹ thuật phần mềm chạy song song, xây các hệ thống vừa khít môi trường của bạn, dưới cùng một cơ chế quản trị.",
    "deliver.tab1":"Số hóa","deliver.tab2":"Nền tảng AI và Dữ liệu","deliver.tab3":"Kỹ thuật phần mềm",
    "deliver.p1lead":"Công nghệ thường đến trước khi dữ liệu, con người và nền pháp lý kịp sẵn sàng. Chúng tôi dựng nền móng đó trước, thực thi bằng cơ chế và rà soát được ngay từ ngày đầu.",
    "deliver.p1a":"Hiện đại hóa mà không gỡ bỏ những gì đang chạy tốt.","deliver.p1b":"Đặt hạ tầng quản trị vào chỗ trước khi bất cứ gì chạy trên đó.","deliver.p1c":"Thu gom các hệ thống rời rạc và quy trình thủ công vào một môi trường.",
    "deliver.p1foot":"Không phải bốn sản phẩm. Một nền tảng, là thứ mọi giai đoạn sau chạy trên đó.",
    "deliver.p2lead":"Hầu hết chương trình AI thất bại vì dữ liệu bên dưới phân tán và không đáng tin. Chúng tôi làm ngược lại: nền tảng thành đường băng, lực lượng triển khai bên trên.",
    "deliver.p2a":"Huấn luyện đội ngũ vận hành nền tảng mà Giai đoạn 1 đã dựng.","deliver.p2b":"Triển khai lực lượng trên đó, có nhật ký kiểm toán từ ngày đầu.","deliver.p2c":"Tùy biến lực lượng theo lĩnh vực của bạn, không phải mô hình chung.",
    "deliver.p2foot":"Một đường băng và một lực lượng, của bạn để vận hành sau Giai đoạn 4.",
    "deliver.p3lead":"Phần mềm đặt riêng thất bại khi ngữ cảnh vận hành chưa từng nằm trong bản dựng. Chính lực lượng vận hành công việc của bạn viết phần mềm, dưới cùng cơ chế quản trị.",
    "deliver.p3a":"Dựng ngay trong lực lượng của bạn, không phải một đội tách rời.","deliver.p3b":"Cùng các cổng chất lượng bằng cơ chế như mọi hành động khác.","deliver.p3c":"Định hình theo lĩnh vực của bạn, không phải khuôn mẫu chung.",
    "deliver.p3foot":"Định nghĩa tác nhân và mã nguồn vẫn thuộc về bạn, để giữ, rẽ nhánh hay mở rộng.",
    "deliver.meanh":"Điều này nghĩa là gì với doanh nghiệp bạn",
    "deliver.p1m1t":"Từ hệ thống rời rạc thành một nền tảng","deliver.p1m1d":"Một hệ quản lý danh mục, một CRM, một ERP, kế toán và hàng chục bảng tính, cùng các quy trình thủ công nối chúng. Giai đoạn 1 đến 3 thu tất cả vào một môi trường, mọi bản ghi trên hạ tầng bạn sở hữu.",
    "deliver.p1m2t":"Quy trình thủ công, được số hóa","deliver.p1m2d":"Chúng tôi rà từng quy trình thủ công quanh hệ thống của bạn và quyết định cái gì số hóa, kết nối hay giữ nguyên. Hết Giai đoạn 3, các đường nối vận hành biến mất.",
    "deliver.p1m3t":"Quản trị trước khi bất cứ gì chạy","deliver.p1m3d":"Nhật ký kiểm toán, phân tầng rủi ro, truy vết điều khoản pháp lý và cổng chất lượng được dựng ngay trong Giai đoạn 2 và 3, không chắp vá sau.",
    "deliver.p1m4t":"Bằng chứng khả thi trên dữ liệu thật","deliver.p1m4d":"Giai đoạn 2 cho ra thiết kế kỹ thuật được duyệt cùng bản PoC chạy trên một lát dữ liệu thật của bạn, đầu cuối, trước mọi cam kết sản xuất.",
    "deliver.p2m1t":"Cấu hình theo doanh nghiệp của bạn","deliver.p2m1d":"Lực lượng đến ở Giai đoạn 5 đã định hình theo phòng ban, quy trình, bối cảnh pháp lý và từ vựng của bạn. Mỗi lần triển khai là của riêng bạn.",
    "deliver.p2m2t":"Một lực lượng, không phải một mô hình","deliver.p2m2d":"Một hệ đa tác nhân tích hợp với bộ nhớ, từ vựng và quản trị dùng chung giữa các phòng ban. Lực lượng là sản phẩm; mô hình là nền.",
    "deliver.p2m3t":"Đội ngũ vận hành từ Giai đoạn 4","deliver.p2m3d":"Đến Giai đoạn 4, người dùng của bạn chạy truy vấn, kết nối công cụ BI và vận hành AI đơn giản mà không cần chúng tôi can dự hằng ngày.",
    "deliver.p2m4t":"Mỗi lần triển khai tích lũy thêm","deliver.p2m4d":"Lực lượng thông minh hơn qua từng lần nhờ ValoStack. Với sự đồng ý có hiểu biết, logic lĩnh vực đã thẩm định nuôi mạng lưới; dữ liệu của bạn vẫn là của bạn.",
    "deliver.p3m1t":"Do lực lượng AI của bạn xây","deliver.p3m1d":"Phòng Kỹ thuật thiết kế, viết mã và phát hành. Không nhà cung cấp thứ hai, không đường bàn giao. Tác nhân quyết định xây gì cũng là tác nhân xây nó.",
    "deliver.p3m2t":"Cổng chất lượng bằng cơ chế","deliver.p3m2d":"Mọi thay đổi qua cùng các cổng có nhật ký kiểm toán như mọi hành động khác. Bảo mật, hiệu năng, khả năng tiếp cận và tuân thủ được kiểm trước khi gộp.",
    "deliver.p3m3t":"Định hình theo vận hành của bạn","deliver.p3m3d":"Thiết kế theo quy trình, bối cảnh pháp lý và từ vựng của bạn. Tùy biến là mặc định, không phải SaaS khuôn mẫu đặt lên trên.",
    "deliver.p3m4t":"Mã và tác nhân vẫn của bạn","deliver.p3m4d":"Tác nhân là các tệp markdown. Mã là của bạn. Triển khai chạy trên đám mây của bạn. Bạn có thể giữ, rẽ nhánh hay mở rộng mọi thứ.",

    "phases.h2":"Và chúng tôi thực hiện ra sao",
    "phases.lede":"Năm giai đoạn, mỗi giai đoạn xây trên giai đoạn trước. Bốn giai đoạn đầu lát đường băng. Giai đoạn thứ năm là khi lực lượng AI cất cánh.",
    "phases.1l":"Giai đoạn 1 · Khảo sát","phases.1t":"Khám phá và lộ trình","phases.1d":"Chúng tôi khảo sát hệ thống nguồn, quy trình, chất lượng dữ liệu và bối cảnh pháp lý, rồi ưu tiên các tình huống mở khóa giá trị lớn nhất trước.","phases.1o":"Một lộ trình chiến lược với các tình huống được ưu tiên và kiến trúc mục tiêu. Bạn quyết định có và làm thế nào để tiếp tục.",
    "phases.2l":"Giai đoạn 2 · Kiến trúc và PoC","phases.2t":"Kiến trúc và bằng chứng khả thi","phases.2d":"Chúng tôi thiết kế nền tảng dữ liệu, rồi dựng một bản PoC hoạt động trên một lát dữ liệu thật của bạn, đầu cuối.","phases.2o":"Một thiết kế kỹ thuật được duyệt cùng bản PoC chạy trên hệ thống thật, trước mọi cam kết sản xuất.",
    "phases.3l":"Giai đoạn 3 · Xây dựng","phases.3t":"Xây nền tảng dữ liệu","phases.3d":"Chúng tôi triển khai thu nạp, biến đổi, phân tầng, điều phối và giám sát trong môi trường của bạn. Mọi bản ghi được làm sạch, gắn nhãn và truy vấn được.","phases.3o":"Một nền tảng dữ liệu sẵn sàng sản xuất trên đám mây của bạn, đường băng mà lực lượng sẽ vận hành.",
    "phases.4l":"Giai đoạn 4 · Đào tạo nền tảng","phases.4t":"Đào tạo đội ngũ vận hành","phases.4d":"Người dùng nội bộ học cách kết nối công cụ BI, truy vấn dữ liệu tập trung và chạy AI đơn giản mà không cần chúng tôi can dự hằng ngày.","phases.4o":"Người dùng nội bộ vận hành nền tảng đầu cuối, một cách độc lập.",
    "phases.5l":"Giai đoạn 5 · Triển khai lực lượng","phases.5t":"Triển khai lực lượng AI tùy biến","phases.5d":"Chúng tôi tinh chỉnh lực lượng đa tác nhân theo phòng ban, quy trình và từ vựng của bạn, triển khai ValoStack và đào tạo đội ngũ điều hành.","phases.5o":"Một lực lượng AI tinh chỉnh theo lĩnh vực chạy trên dữ liệu sạch của bạn, với đội ngũ được đào tạo để vận hành.",

    "workforce.h2":"Lực lượng AI của bạn làm gì",
    "workforce.lede":"Chín phòng ban, ánh xạ tới các chức năng thật của một công ty hiện đại và tùy biến theo cách bạn đang vận hành. Hoạt động khi Giai đoạn 5 triển khai.",
    "workforce.1n":"Quyết định xây gì tiếp","workforce.1t":"Sản phẩm và Chiến lược","workforce.1d":"Viết yêu cầu, ưu tiên lộ trình, mô hình hóa giá.",
    "workforce.2n":"Khiến trải nghiệm được yêu thích","workforce.2t":"Thiết kế và Trải nghiệm","workforce.2d":"Thiết kế giao diện, viết nội dung, giữ thương hiệu nhất quán.",
    "workforce.3n":"Xây phần mềm","workforce.3t":"Kỹ thuật","workforce.3d":"Thiết kế kiến trúc, viết mã, triển khai sản xuất.",
    "workforce.4n":"Đảm bảo không hỏng hóc","workforce.4t":"Chất lượng và Bảo mật","workforce.4d":"Rà soát mã, kiểm thử hiệu năng, kiểm tra bảo mật, xác minh tuân thủ.",
    "workforce.5n":"Vận hành hằng ngày","workforce.5t":"Vận hành và Giao nhận","workforce.5d":"Lập kế hoạch, quản lý nhà cung cấp, dự báo nhu cầu, giám sát vận hành.",
    "workforce.6n":"Giữ và phát triển khách hàng","workforce.6t":"Thành công Khách hàng","workforce.6d":"Đón người dùng, xử lý hỗ trợ, thu phản hồi, huấn luyện theo lĩnh vực.",
    "workforce.7n":"Tuân thủ và sinh lời","workforce.7t":"Tài chính và Tuân thủ","workforce.7d":"Phân tích tài chính, đánh giá rủi ro, theo dõi pháp lý.",
    "workforce.8n":"Cập nhật cho lãnh đạo","workforce.8t":"Văn phòng Điều hành","workforce.8d":"Báo cáo hằng ngày, nghiên cứu theo yêu cầu, theo dõi biến động ngành.",
    "workforce.9n":"Tiếp cận khách hàng mới","workforce.9t":"Marketing và Tăng trưởng","workforce.9d":"Chạy chiến dịch, tạo nội dung, thử chiến thuật, đo kết quả.",

    "valostack.h2":"ValoStack. Bộ não càng dùng càng thông minh.",
    "valostack.lede":"Mỗi lần triển khai làm cho lần sau thông minh hơn. Với sự đồng ý của bạn.",
    "valostack.b1":"Mỗi lần triển khai thu lại quy trình, quyết định và logic lĩnh vực của bạn thành bộ nhớ có kiểu, có dấu thời gian, được chuyên gia thẩm định.",
    "valostack.b2":"Với sự đồng ý có hiểu biết, tri thức đó nuôi ValoStack, bộ não liên khách hàng. Mỗi đối tác kế thừa trí tuệ liên ngành ngay từ ngày đầu.",
    "valostack.b3":"Dữ liệu của bạn vẫn là của bạn. Các khuôn mẫu và logic lĩnh vực đã thẩm định trở thành lợi thế chung.",
    "valostack.cap":"Một lực lượng giữ lại bài học của mọi lần triển khai trước, và tạo nhật ký kiểm toán giải thích mỗi kết quả đạt được ra sao.",

    "cap.h2":"Vì sao lãnh đạo doanh nghiệp tin ValoLab",
    "cap.lede":"Khách hàng ngành được quản lý hỏi một câu trước tiên: làm sao bảo vệ điều này trước kiểm toán? Câu trả lời nằm ở cấu trúc. Mọi hành động được quản trị bằng cơ chế, ghi lại và rà soát được.",
    "cap.1t":"Quản trị bằng cơ chế, không phải hướng dẫn","cap.1h":"Luật được cưỡng chế bằng mã bên ngoài tác nhân. Tác nhân không có lựa chọn.",
    "cap.1a":"Chặn cứng: hành động nguy hiểm bị chặn trước khi xảy ra, không vượt quyền nếu thiếu con người.","cap.1b":"Phân tầng rủi ro: mọi tác vụ được phân loại trước khi bắt đầu; rủi ro cao cần phê duyệt.","cap.1c":"Kiểm toán độc lập và bộ ngắt mạch rà soát mọi phản hồi và dừng khi vi phạm.",
    "cap.2t":"Trí nhớ tổ chức tích lũy","cap.2h":"Tri thức ghi một lần, có mặt khắp nơi, có kiểu và gắn nhãn tin cậy.",
    "cap.2a":"Sáu loại bộ nhớ có cấu trúc, từ quyết định đến nghiên cứu đã thẩm định.","cap.2b":"Tích lũy liên dự án: tác nhân mới kế thừa toàn bộ tri thức ngay ngày đầu.","cap.2c":"Kiểm soát độ tươi: tri thức cũ bị đánh dấu trước khi ai đó hành động.",
    "cap.3t":"Cỗ máy chất lượng thông tin","cap.3h":"Mọi khẳng định bên ngoài được đánh giá trước khi đến tay bạn.",
    "cap.3a":"Đánh giá nguồn theo ba trục, kèm thang hạ cấp GRADE.","cap.3b":"Cấm dùng dữ liệu huấn luyện: mọi dữ kiện đều truy về một nguồn trực tiếp, kiểm chứng được.","cap.3c":"Gắn nhãn từng phát hiện: Đã xác minh, Có chỉ dấu, hay Gợi ý. Không suy đoán thành sự thật.",
    "cap.4t":"Chuỗi cổng chất lượng","cap.4h":"Các điểm chặn từ yêu cầu đến sản xuất.",
    "cap.4a":"Tám cổng; công việc không thể tiến tiếp cho tới khi từng cổng được thông qua.","cap.4b":"Rà soát mã chạy song song trên bảo mật, hiệu năng, tuân thủ và chất lượng.","cap.4c":"Thực thi bằng cơ chế: tác nhân không thể đánh dấu hoàn thành nếu chưa qua cổng.",
    "cap.5t":"Tri thức lĩnh vực gắn-tháo được","cap.5h":"Chuyên môn ngành theo mô-đun. Đổi lĩnh vực mà không cần dựng lại.",
    "cap.5a":"Luật, quy định và ontology lưu tách khỏi cấu trúc tổ chức.","cap.5b":"Mỗi lĩnh vực định nghĩa loại bằng chứng và trọng số riêng.","cap.5c":"Ưu tiên pháp lý: luật không bao giờ bị nghiên cứu ghi đè.",
    "cap.6t":"Kiến trúc ba tầng để tái dùng","cap.6h":"Toàn bộ tổ chức chuyển sang mỗi lần triển khai mới.",
    "cap.6a":"Tầng 1 Tổ chức, Tầng 2 Lĩnh vực, Tầng 3 Khách hàng; chỉ tầng cuối đổi mỗi lần.","cap.6b":"Bắt đầu một lần triển khai mới chỉ là thêm Tầng 3.","cap.6c":"Không dựng lại từ đầu; mỗi lần trước làm lần sau thông minh hơn.",
    "cap.7t":"Nhật ký kiểm toán đầy đủ mọi hành động","cap.7h":"Ai làm gì, khi nào, dưới thẩm quyền nào.",
    "cap.7a":"Mọi lệnh gọi công cụ được ghi với loại, tầng, dấu thời gian và phiên.","cap.7b":"Tự động rà soát tuân thủ mỗi 20 hành động.","cap.7c":"Không lỗi âm thầm: khi có gì bị chặn, con người thấy lý do.",
    "cap.gatesh":"Tám cổng chặn, từ yêu cầu đến sản xuất",
    "cap.g1n":"Yêu cầu","cap.g1c":"Đúng thứ cần xây?",
    "cap.g2n":"Thiết kế","cap.g2c":"Khách hàng có hiểu?",
    "cap.g3n":"Kiến trúc","cap.g3c":"Có mở rộng được?",
    "cap.g4n":"Rà soát mã","cap.g4c":"Bảo mật, hiệu năng, tuân thủ, chất lượng",
    "cap.g5n":"Nghiệm thu","cap.g5c":"Đạt yêu cầu?",
    "cap.g6n":"Sản xuất","cap.g6c":"An toàn để phát hành?",
    "cap.lay1l":"Tầng 1 · Tổ chức","cap.lay1d":"Phòng ban, vai trò, sổ tay. Tổng quát, dùng cho mọi khách hàng.",
    "cap.lay2l":"Tầng 2 · Lĩnh vực","cap.lay2d":"Chuyên môn ngành. Dùng chung giữa các khách hàng cùng ngành.",
    "cap.lay3l":"Tầng 3 · Khách hàng","cap.lay3d":"Cấu hình riêng khách hàng. Chỉ tầng này đổi mỗi lần triển khai.",

    "people.h2":"Đội ngũ của bạn giữ vai trò gì",
    "people.lede":"Không phải để thay thế đội ngũ, mà để đội ngũ của bạn dẫn dắt.",
    "people.h.l":"Con người của bạn","people.h.r":"Lực lượng AI",
    "people.1l":"Định chiến lược và ưu tiên","people.1r":"Thực thi theo các ưu tiên đó",
    "people.2l":"Ra quyết định trọng yếu","people.2r":"Chuẩn bị phương án kèm phân tích",
    "people.3l":"Phê duyệt những gì phát hành","people.3r":"Chạy quy trình rà soát và QA",
    "people.4l":"Sở hữu quan hệ khách hàng","people.4r":"Xử lý khối lượng hỗ trợ và phản hồi",
    "people.5l":"Định nghĩa thương hiệu","people.5r":"Áp dụng quy tắc thương hiệu nhất quán",
    "people.tag":"Con người quyết định. Lực lượng AI thực thi.",

    "custom.leadt":"Mỗi lần triển khai là của bạn, không phải của chúng tôi","custom.leadd":"Nền tảng giao như một khung. Phiên bản sống trong công ty bạn được dựng riêng cho bạn.",
    "custom.1t":"Phòng ban của bạn","custom.1d":"Chín phòng ban ánh xạ tới sơ đồ tổ chức thật. Không chức năng nào bạn không cần.",
    "custom.2t":"Hệ thống nguồn của bạn","custom.2d":"Nền tảng tích hợp với hệ thống thực tế của bạn. Chúng tôi thu nạp ngay tại nơi dữ liệu của bạn đang nằm.",
    "custom.3t":"Bối cảnh pháp lý của bạn","custom.3d":"Tầng lĩnh vực được cấu hình theo khu vực tài phán và ngành của bạn.",
    "custom.keept":"Còn nếu một ngày chúng tôi không còn?","custom.keepd":"Nền tảng dữ liệu sống trong đám mây của bạn. Đội ngũ vận hành nó sau Giai đoạn 4. Định nghĩa tác nhân là các tệp markdown, của bạn để giữ, rẽ nhánh hay mở rộng. Vận hành của bạn không bao giờ phụ thuộc vào sự tồn tại của chúng tôi.",

    "eco.eyebrow":"Hệ sinh thái VALO",
    "eco.h2":"Một công ty. Cả một hệ sản phẩm.",
    "eco.lede":"VALO Tech xây và vận hành cả một hệ sinh thái sản phẩm cho nền kinh tế số. ValoLab là cách chúng tôi tạo ra chúng: vững vàng trước kiểm toán theo thiết kế, trên một nền tảng dùng chung cho mọi sản phẩm.",
    "eco.ads":"Mạng quảng cáo và sàn số cho nhà xuất bản, nhà quảng cáo, affiliate và nhà bán hàng.",
    "eco.pocket":"Một ví và định danh được cấp phép cho toàn hệ sinh thái.",
    "eco.compliance":"Tấm khiên tuân thủ cho pháp lý, bảo mật và quyền riêng tư.",
    "eco.shimmra":"Phát trực tiếp thần tượng với quà tặng và mua sắm trực tiếp.",
    "eco.amavo":"Hẹn hò ưu tiên video cho những kết nối thật ở Đông Nam Á.",
    "eco.soon":"Mới",
    "eco.hubcap":"VALO Tech ở trung tâm. Mọi sản phẩm chạy trên cùng một nền tảng được quản trị.",

    "close.eyebrow":"Chi phí và hợp tác",
    "close.h2":"Thiết kế cùng bạn, định giá theo điều ta xây cùng nhau",
    "close.big":"Chi phí là một phần của cuộc trao đổi thiết kế, không phải bảng giá công khai.",
    "close.p1":"Mỗi lần hợp tác phản ánh hệ thống, bối cảnh pháp lý của bạn, và giai đoạn nào hợp với bạn lúc này. Chúng tôi hiểu bạn đang làm gì trước, rồi thiết kế thứ vừa khít.",
    "close.p2":"Bước đầu là một cuộc gọi ngắn. Chúng tôi trở lại với bản tóm tắt viết để bạn chia sẻ với đội ngũ.",
    "close.fine":"Một cuộc trao đổi thăm dò 30 phút. Không áp lực đề xuất, không kịch bản bán hàng.",

    "foot.eco":"Khám phá hệ sinh thái VALO",
    "foot.tagline":"VALO Tech Pte. Ltd. xây dựng một hệ sinh thái thuần AI cho doanh nghiệp thực tế trong các ngành được quản lý.",
    "foot.product":"Sản phẩm","foot.company":"Công ty","foot.legal":"Pháp lý",
    "foot.about":"Giới thiệu","foot.careers":"Tuyển dụng","foot.press":"Báo chí","foot.contact":"Liên hệ",
    "foot.privacy":"Quyền riêng tư","foot.terms":"Điều khoản","foot.cookies":"Cookie",
    "foot.rights":"© 2026 VALO Tech Pte. Ltd. Bảo lưu mọi quyền.","foot.loc":"Singapore"
  };

  w.VALO_I18N = {
    locales: locales, rtl: rtl, bcp47: bcp47, labels: labels, flag: flag, defaultLocale: "en",
    match: match, dict: { en: en, vi: vi }
  };
})(window);
