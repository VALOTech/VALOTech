# The VALO Ecosystem

> **VALO** is a family of five consumer products built by **VALO TECH PTE. LTD.**
> (Singapore), serving Southeast Asia first. One identity, one wallet, one ledger
> discipline, one engineering regime — five distinct surfaces. This document is the
> shared map: what each product is, how they connect, how money moves, and where the
> repository you are reading sits in the whole.
>
> Every VALO repository carries an identical copy of this map. Only the
> **"This repository"** section differs — it marks where you are.

## The company

**VALO TECH PTE. LTD.** — incorporated in Singapore, SEA-first (Singapore · Vietnam ·
Thailand · Indonesia · Malaysia · Philippines as the priority markets, with a global
tier behind). Parent site: **valotech.org**. Every product is solo-maintained under one
engineering doctrine, **ValoLab** — VALO Tech's AI-native, audit-defensible build
regime in which a governed multi-agent workforce delivers on a data foundation the
client owns (see *Shared foundations*). VALO Tech builds its own products with ValoLab
and offers the same regime to regulated enterprises, so this ecosystem is at once what
that regime runs and the proof of how it builds. The name **VALO** means "light" in
Finnish; each product re-skins a single folded-**V** mark to its own palette.

## The five products

| Product | Repository | What it is | Surface | Floor | Theme | Home |
|---|---|---|---|---|---|---|
| **VALO Ads** | `VALOAds` | Ad network + digital hub (advertise · affiliate · sell). Also the upstream **platform** the others reuse. | Web + mobile | — | Aurora (violet→pink) | valoads.io |
| **VALO Pocket** | `VALOPocket` | Ecosystem e-wallet — top up, hold stored value, pay across VALO + SGQR, send, withdraw. The **money + identity layer**. | Mobile-first | — | Verdant (green) | valopocket.io |
| **Shimmra** | `Shimmra` | Video social network for idols & fans — live + always-on video, gifting, ads, commerce, affiliate. | Mobile-first | 16+ | Halo (azure) | shimmra.live |
| **Amavo** | `Amavo` | Play-together dating — meet by playing, 1:1 video dates + gifts. | Mobile-first | 18+ | Ember (rose) | amavo.app |
| **Farola** | `VALOEURelocate` | Vietnam ↔ Europe mobility — documents, study, work, welfare, money, carried across years as one household relationship. | Web-first | 18+ | Beacon (amber) | farola.io |

**VALO Ads** — *"Advertise. Affiliate. Sell. One ledger."* The folded V cradles a cent
of aurora light: three business lines converging into one ledger. Beyond its own product
surface, VALO Ads is the **platform substrate + the authoritative development regime** the
siblings inherit.

**VALO Pocket** — *"All of VALO, in one pocket."* A regulated stored-value wallet pursuing
a MAS Major Payment Institution licence in-house. It is to VALO what GrabPay is to Grab:
the default way money moves across every product and out to any SGQR merchant.

**Shimmra** — *"Shine together."* A video social network where idols and fans meet — live and always-on: fans follow, watch, message, and gift while creators broadcast live, post video, and earn through gifts, ads, live commerce, and affiliate. Luminous azure orbit-star mark.

**Amavo** — *"Sparks start with play."* Play-together dating for Southeast Asia (strict 18+): members meet through icebreaker games, symmetric live rooms, and speed-dating that lead to intimate 1:1 video dates and warm gifts. A two-tone ember play-heart mark; safety, privacy, and minor-protection override convenience — play is a bridge to connection, never a substitute.

**Farola** — *"The far shore, in plain sight."* The Vietnam ↔ Europe mobility platform: one household relationship carried across years and across service lines — documents, study, vocational training, work placement, travel, remittance, investment — with the people who care able to see it. A lighthouse names the job: visible across distance, it makes a dangerous crossing safe, and it is a public signal that cannot lie. Farola's two moats are exactly that — consent-scoped family visibility, and a public welfare-transparency record audited by someone other than Farola.

## The sixth — Verdiq (B2B)

Distinct from the five consumer products above, **Verdiq** (`VALOCompliance`, homepage **verdiq.io**) is the portfolio's **sixth** product and its **B2B** line: a multi-tenant GRC, risk, privacy, and security-validation platform where a business maps its controls to the frameworks and laws it must satisfy, runs an enterprise risk register, manages privacy obligations, and **proves** its security posture with tamper-evident evidence rather than a checkbox.

It is the five products' **protector, not a peer**. Dogfooding Verdiq against the ecosystem's own posture — a MAS-pursuing regulated wallet, an ad network with a fraud-and-privacy surface, two 16+/18+ minor-safety products (Shimmra, Amavo) — is its first customer and credibility proof, and it is sold standalone to external businesses. It sits **outside** the consumer one-identity-one-wallet flywheel the sections below describe: its customers are businesses (its identity model is organization + member + role, not the VALO Pocket consumer identity), it holds no wallet, and where it observes a sibling's posture it reads only signed, **metadata-only** control + evidence signal across the privacy firewall — never the consumer data behind it.

## One identity

A person is **one VALO identity**, and everything they do across the five products hangs
off it. **VALO Pocket is the identity provider**: each product authenticates its users
through Pocket's federated sign-on, so a single VALO account opens all of VALO.

The identity is **minimal** — it holds only what must be shared: credentials, contact,
age-assurance, identity verification, and the wallet. Each product keeps its **own
profile**, and profiles never cross: a dating profile on Amavo is never visible on Shimmra.
Privacy is the floor, not a feature.

Joining any product **transparently provisions** the VALO identity — a person who signs up
through Shimmra gets a VALO account with no detour. When a second product later sees the
same verified email, it links the existing identity **only with the person's explicit
consent** — never silently, because a silent merge is an account-takeover path.

Identity comes **before money**: a VALO identity signs a person in across products with no
wallet attached, and the wallet activates when the regulated rails are licensed.
Verification done once is honored everywhere — **age-assurance, identity verification,
sanctions and anti-money-laundering screening, and fraud signals live once at the identity
layer** and are read as a single risk view across every product. Clearing a higher bar for
one product satisfies the lower bar of another; a risk flagged in one place is known in all.

## How the products connect

```
                  ┌─────────────────────────────────┐
                  │           VALO POCKET           │
                  │       identity + money layer     │
                  │  sign-on · shared risk · wallet  │
                  │   · exchange · settlement · spend │
                  └──┬────────┬────────┬────────┬─────┘
       sign-on ·        │        │        │        │
       top-up ·         │        │        │        │
       settle           ▼        ▼        ▼        ▼
        ┌─────────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
        │  VALO Ads   │ │ Shimmra │ │ Amavo  │ │  Farola  │
        │ads·affiliate│ │  live   │ │ dating │ │ mobility │
        │ · commerce  │ │+gifting │ │ +dates │ │ +welfare │
        └──────┬──────┘ └─────────┘ └────────┘ └──────────┘
               │
               └──► VALO Ads is also the platform + ad surface:
                    Shimmra and Amavo build on its published
                    contracts and carry its house advertising.

        Farola takes sign-on and, where the corridor allows, settlement.
        It carries no house advertising and holds no stored value of
        its own — the remittance line runs on a licensed rail.
```

**Autonomy with signed contracts.** Each product is its own service — its own data, its own
deployment, its own release cadence — and products never run inside one another. They speak
only at the seams where identity or money crosses, and only through **signed, scoped,
versioned service contracts**. Each capability's provider owns its contract: **Pocket
publishes the identity and money contracts** (sign-on, wallet, settlement, exchange rate,
the shared risk checks); **VALO Ads publishes the advertising and platform contracts**. A
consumer builds against the published contract, not against another product's internals.

**Advertising — VALO Ads is the hub.** A product that wants ads does not build ad serving: it registers as an
ecosystem publisher, registers its surfaces as zones, and asks the published contract to fill a slot. What crosses
is deliberately thin — a coarse region, an app language, and a three-valued audience verdict the consumer computed
on its own side — and what comes back is a reviewed creative carrying the safety properties the consumer re-checks
before it renders. No product sends an identity, a birth date or an age to sell an impression, and a request that
declares no audience is served as though a minor were watching. Revenue settles home through the same publisher
rev-share every VALO publisher earns, confirmed one impression at a time rather than counted twice.

**Money + identity — Pocket is the hub.** Every product tops up, settles, and authenticates
through Pocket. A person funds a balance once and spends it on ads, gifts, or dates anywhere
in VALO; a creator's earnings settle home through the same wallet. Pocket is offered first
and most prominently wherever money moves, yet it is **one rail among several** — every
product also accepts outside wallets and gateways, so Pocket is the preferred path, never a
hard dependency. Pocket is itself an aggregator, topping up and withdrawing across the
popular external rails: outside money flows in through Pocket, then moves freely across VALO.

**Advertising — VALO Ads is the shared ad surface.** Shimmra and Amavo carry advertising
drawn from VALO Ads — house inventory shown to free viewers and between live rooms — and
each product is a **first-party publisher** of its own ad surface. On Shimmra a creator may
also opt to run advertising on their own stream and earns as a publisher in their own right,
alongside an affiliate account created with every creator. Advertising never reads sensitive
data: targeting uses only coarse, non-sensitive signals, never the dating or under-18 data
the products hold.

**Platform — VALO Ads is the substrate.** VALO Ads owns the reusable foundations the
siblings build on rather than reinventing: authentication, the int64 double-entry ledger,
ad serving, fraud, data isolation, and self-trained AI; where the reuse is a live
integration, it runs through a published VALO Ads contract. Its **ad-compliance corpus**
is its own — the body of ad-specific policy VALO Ads needs for its own business — not a
shared foundation the others inherit: each product carries the compliance corpus its own
domain demands (a dating product its safety, special-category-privacy, and
minor-protection body; a wallet its payments-and-AML body).

## How money moves

Money in VALO has one shape: it enters through a product or the wallet, it **rests where it
is earned**, and it leaves **only through the wallet** — and two laws hold it together.

**The wallet is the hub.** VALO Pocket holds regulated stored value in Singapore dollars.
People fund it from outside rails or fund a product directly, with Pocket the prioritized
path. When money crosses a currency boundary — the wallet in SGD, ad balances in USD —
**Pocket owns the exchange rate**, and a settlement carries the amount, the currency, and
the rate so both ledgers agree. Movement **inside** the ecosystem is free; Pocket earns only
on the outside rails it bridges and the exchange it provides.

```
        EXTERNAL  (PayNow · card · bank · outside wallets)
              │                               │
       top-up │ (Pocket aggregates)           │ direct top-up
              ▼                               │ (Pocket offered first)
        ┌─────────────────┐                   │
        │   VALO POCKET   │◄──────────────────┘
        │  wallet · SGD   │
        │  identity · FX  │
        └──┬───────────▲──┘
   fund /  │           │  withdraw earnings
   spend   │           │  (on demand · FX → SGD)
  (free)   ▼           │  (free)
   ┌───────────────────────────────────────────────┐
   │          PRODUCTS   (earnings rest here)        │
   │   VALO ADS       SHIMMRA          AMAVO         │
   │   credit →       bean → gift →    rose → gift   │
   │   campaigns →    gold (cashable)  (interaction) │
   │   earnings       dew (free →      sunbeam       │
   │                  discovery)       (free → self) │
   └───────────────────────────────────────────────┘
        restricted goods (adult · gambling):
        USDT — settled outside the wallet
```

**Earnings rest where they are made.** A creator's gifting income lives in Shimmra; a
publisher's, affiliate's, or merchant's income lives in VALO Ads. The wallet is the
**consolidation and cash-out point**: a person withdraws to the wallet when they choose, and
Pocket converts to Singapore dollars on the way in. One identity can earn across several
roles at once — a creator who is also a publisher, an affiliate, and an advertiser — and
every stream comes home to the same wallet.

**Each economy.** VALO Ads runs on advertiser credit and creator earnings: advertisers fund
campaigns; publishers, affiliates, and merchants earn from them. Shimmra runs a gifting
economy on a beanstalk theme — a **purchased bean**, given as a gift, becomes **cashable
gold** for the creator with the platform taking its share, while a **free dew**, earned by
showing up, is given as encouragement that lifts a creator's discovery without ever becoming
money. Amavo runs on **roses and sunbeam** — a **purchased rose** is a courtship gift that
opens a real interaction between two people, while **free sunbeam**, earned through
good-faith use, buys only small conveniences for the giver; no value ever leaves Amavo as
cash.

**Two laws keep the money honest.**

- **Promotional value is never cashable.** Every free or promotional currency — dew,
  sunbeam, and any reward that follows — lives in a non-cashable class recorded in a shared
  currency registry, and every cash-out and cross-product boundary refuses anything not
  marked cashable. Free value can lift a creator's ranking or unlock a convenience; it can
  never be minted into cash.
- **Product currencies never cross products.** A rose is spent in Amavo, a bean in Shimmra;
  the only value that crosses a product boundary is the wallet's real money. Each economy's
  accounting stays clean, and every path a promotional currency might use to slip into a
  cash-out elsewhere is closed.

**The regulated wallet stays clean.** Two different things wear the word "crypto." As a
**funding rail**, crypto is a planned VALO Pocket capability — the ecosystem's licensed
crypto/DPT on- and off-ramp, where a person tops up or withdraws in stablecoin that converts
to clean SGD e-money at the regulated boundary, the licensed custody held once by Pocket and
reused by the siblings (fiat-only today; the rail is licensed before it goes live). As a
**spending category**, restricted goods — adult, gambling, and the like — never settle
through the regulated wallet; they fund and settle in USDT outside it, on both ends. The
rail converts to clean money; the restricted categories stay out.

## How the ecosystem compounds

Five products under one identity are worth more than five products apart, and VALO is built
to compound that.

**House cross-promotion.** The ad surface that carries outside advertising also carries
VALO's own: a Shimmra viewer meets Amavo, an Amavo user meets Pocket. This is house
inventory — VALO promoting VALO — and it turns every product into a doorway to the others.

**One referral, the whole family.** An invitation is to **VALO**, not to a single app: a
person who brings a friend is rewarded, and so is the friend, wherever they land. Because
each economy is sealed, the reward is always granted in the destination product's own
non-cashable currency — a friend who joins Shimmra is welcomed with Shimmra's free currency,
never with value carried across from elsewhere. Growth flows between products; value never
leaks between them.

**The wallet pulls.** A balance funded once is a standing invitation to spend it anywhere in
VALO. Pocket is the home base — where a person sees everything they hold and everywhere they
can use it — so money in the wallet is a reason to open the next product.

## Safety across VALO

One identity carries one reputation, and VALO treats safety as a property of the person, not
of a single product.

The shared layer that verifies a person once — age, identity, sanctions — also **remembers
how they behave**. A serious safety breach is never a local matter: predation, exploitation
of minors, fraud, threats, and sanctioned conduct **follow the identity across every
product**, suspend it everywhere, and flag it against the verification and device that
created it, so a banned actor cannot reappear next door. Child-safety violations are
reported, never merely blocked.

Ordinary product matters stay where they happen — a spam strike on one surface is not a
sentence across the family. The line is severity: the graver the harm, the wider it travels.
A predator turned away from one product can never walk into another.

## Shared foundations

Every VALO repository is built and governed identically — read the repository's own
`.claude/CLAUDE.md` for the binding detail:

- **No phases.** Work is a matrix of **layers × features**; each feature carries a domain
  code and stays coherent vertically (every layer) and horizontally (every neighbour).
- **Stack.** Go 1.26+ (Fiber) · Next.js 16+ (TypeScript) · Flutter 3.44+ (Dart) · PostgreSQL ·
  Redis/Dragonfly · ClickHouse · NATS · Docker/K8s on AWS EKS. Each repository states its own
  floor in `.claude/CLAUDE.md`; a repository may sit above the shared floor and never below it.
- **Money is never a float** — int64 cents, double-entry ledger, every cent reconciled.
- **AI is self-trained** — no external LLM/AI provider touches product code.
- **Twenty locales** — eight SEA-priority (`en zh zt vi th id ms tl`) plus twelve global,
  default `en`, RTL for `ar` and `ur`.
- **Truth in artifacts** — PRD ⇄ designs ⇄ tasks ⇄ code stay in sync; evidence closes a
  task, validators gate the commit.
- **One contract registry across the boundary.** Every seam where one repository calls
  another is declared from **both** ends — the provider that owns the contract and each
  consumer that builds against it — and a validator checks each declaration against the
  tree, both ends at once when the sibling repositories are checked out beside each other.
  It exists because every other gate stops at the repository boundary: a design's
  `depends_on` cannot name a code that lives in another clone, so without it a provider and
  a consumer can each stay green while disagreeing about the wire between them.
  **This repository declares no contract and carries neither file.** Nothing here calls a
  sibling and no sibling calls the gateway; the only thing crossing the boundary is the
  ecosystem's shared vocabulary, which is prose in this document rather than a wire.

## This repository — **VALO Tech** (`VALOTech`)

You are **VALO Tech** itself: not one of the six products, but the company's own front
door and its investor room. Two surfaces live here.

- **The gateway** at **valotech.org** — the public page a regulated-industry buyer reads.
  It makes the ValoLab argument: an AI workforce is worth having, it needs a clean data
  foundation underneath it, and VALO Tech builds both inside the buyer's own environment.
  It is a static page today, served verbatim by GitHub Pages, in twenty languages,
  carrying a WebGL scene designed under [docs/designs/scene/](designs/scene/).
- **The investor room** behind its sign-in — the deeper case: how delivery works, what the
  portfolio is, where each product stands, and the presentation an investor is asked to
  read. It does not exist yet; building it is what turns this repository from a page into
  a product, and it is the work the ledger describes.

The doctrine here is **inherited from VALO Ads and cut to size**. The products' domain
rules — a double-entry ledger, minor protection, ad serving, wallet custody — have no
subject in this repository, and copying them would be ceremony. What is kept is the part
that is about how work is done rather than what the work is: the layer×feature matrix,
the decision register, the task ledger with evidence, the axis review, the comment
hygiene, and the branch protocol.

One thing here has no sibling: **the published branch is the public internet.** `main` is
what Pages serves, so every path committed to it is fetched by anyone who asks. The
planning documents live on `development` for that reason, and `main` carries only the
site.

## Local development ports

Several products' stacks run on one machine, so their published host ports are
allocated here rather than discovered by collision. A product's own
`docker-compose.yml` and `env.example` carry its row; this table is where a
sibling repository looks before claiming a port. The rule is VALO Ads' decision `INFRA-DEC-11`, recorded in that repository's register; every other copy of this map inherits it rather than restating it.

| Product | Postgres | Redis | Other |
|---|---|---|---|
| VALO Ads | **5433** (test **15432**) | **6380** financial, **6381** cache (test **16380** / **16381**) | ClickHouse 8123 / 9000 · NATS 4222 / 8222 · API 8080 · web 3000 |
| VALO Compliance (Verdiq) | **5432** | **6379** | — |
| VALO Tech | **5434** | — | web **3100** · static gateway **3101** |
| VALO Pocket · Shimmra · Amavo · Farola | unallocated | unallocated | claim a row here before publishing a port |

The engine ports are deliberately not the defaults for every product but one.
A default is a value two compose files reach for independently, and the second
one to start then either fails to bind or is silently remapped — which is what
happened here: VALO Ads' Postgres ran on 5433 for a day under a local
`docker-compose.override.yml` that was later deleted, so the running stack could
not be reproduced from any tree and every host-side tool that trusted
`DB_PORT=5432` reached the compliance database instead. It failed closed only
because the two engines' credentials differ, and nothing enforces that.

A port that is wrong announces itself now rather than arriving disguised as an
authentication error: `make migrate` and the seeder both print
`Target: host:port/database as user` before they connect.

## Quick reference

| | VALO Ads | VALO Pocket | Shimmra | Amavo | Farola |
|---|---|---|---|---|---|
| Repo | `VALOAds` | `VALOPocket` | `Shimmra` | `Amavo` | `VALOEURelocate` |
| Slogan | Advertise. Affiliate. Sell. One ledger. | All of VALO, in one pocket. | Shine together. | Sparks start with play. | The far shore, in plain sight. |
| Theme | Aurora | Verdant | Halo | Ember | Beacon |
| Primary accent | `#6D5CFF` violet | `#0A7E50` green | `#3B86FF` azure | `#FF5777` rose | `#F5A524` amber |
| Mark | folded V + cent of light | folded V opening to a pocket | orbit-star in a halo | ember play-heart | a light above the far shore, reflected |
| Surface | web + mobile | mobile-first | mobile-first | mobile-first | web-first |

Verdiq (`VALOCompliance`) — *"Enter the Era of Absolute Compliance."* — is the sixth, B2B line, endorsed by VALO Tech: web-first, homepage **verdiq.io**, theme **Sterling** (struck platinum), its validation engine **Vindex**, and sits outside this consumer group as the portfolio's compliance backbone.
