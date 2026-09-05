# VALO Tech — "Gateway" design system

The corporate homepage at [valotech.org](https://valotech.org) is a deep-space
page: a planet that begins as dead lunar rock and becomes a living Earth as the
reader scrolls, with the argument told in glass panels held in its orbit. The
visual language is the one our product designer authored as `v5.gateway`; this
document records it so the site can be maintained and extended without guessing
at the intent.

The page is still a static site. There is no build step and no package manager
at runtime: the repository is the artifact GitHub Pages serves, verbatim. One
graphics library is vendored under `assets/scene/` and one dev-time generator
writes the English copy into the markup.

## 1. Ground and palette

The page is dark and has one theme. The planet, the star field and the glass
panels are all lit against a near-black ground; there is no light variant,
because a white page would leave every one of them without a reason to exist.

| Token | Value | Where it is used |
|---|---|---|
| `--void` | `#080a10` | The page ground behind the scene |
| `--indigo-0` | `#07071a` | Deepest panel wells, footer ground |
| `--indigo-1` | `#0b0a23` | Section grounds that lift off the void |
| `--indigo-2` | `#14123a` | Raised chrome — header, dialogs |
| `--accent` | `#8c9eff` | Links, focus, active nav, mono eyebrows |
| `--accent-bright` | `#b9c2ff` | Hover, primary CTA fill |
| `--text` | `rgba(248,248,255,.98)` | Headings and body |
| `--text-muted` | `rgba(228,232,248,.86)` | Supporting paragraphs |
| `--text-dim` | `rgba(210,215,240,.68)` | Meta, captions, disabled |
| `--glass-bg` | `rgba(24,32,62,.58)` | Panel fill |
| `--glass-border` | `rgba(170,195,255,.42)` | Panel edge |
| `--glass-border-strong` | `rgba(200,220,255,.62)` | Panel edge, emphasised |
| `--glass-glow` | `rgba(120,160,255,.22)` | Panel outer glow |

Panel fill is deliberately opaque enough that the planet's bright limb never
reads through the right-hand side of a paragraph. Glass is a material, not a
transparency effect: where `backdrop-filter` is unavailable the fill alone still
separates text from sky.

### The six product marks

The ecosystem section carries six sibling brands whose own palettes — violet,
green, azure, rose, amber, platinum — would fight an indigo ground if they were
used as fills. Each product therefore sits in a recessed tray: the ground goes
darker, not lighter, and the product's colour appears only in its mark and a
single hairline edge. The brand stays recognisable and the page stays one page.

## 2. Type

| Role | Face | Treatment |
|---|---|---|
| Hero display | Roboto Condensed | `clamp(52px, 4.35vw, 84px)`, weight 400, leading `1.15` |
| Feature heading | Roboto Condensed | `clamp(34px, 4.2vw, 58px)`, tracking `-0.02em`, leading `1.03` |
| Chapter heading | Roboto Condensed | `clamp(30px, 3.6vw, 44px)` |
| Body | Roboto Condensed | 16px / 1.6; intro paragraphs 17px |
| Marker, eyebrow, annotation | DM Mono | 11–13px, `0.22em` tracking on eyebrows, uppercase |

One face carries the whole page. That is what makes it read as one surface
rather than as a headline sitting on top of a document, and it is why the
narrow-screen scale is a separate set of clamps rather than the same ones: at
390px the display clamp alone pushes the call to action off the first screen.

Roboto Condensed and DM Mono are self-hosted as `woff2` and cover Latin,
Latin-ext, Cyrillic and Vietnamese. Thai, Arabic, the Indic scripts, Korean and
the CJK locales fall back to a per-script stack declared in `assets/site.css`;
a condensed display face that does not cover a script is worse than a system
face that does.

Mono is a voice, not a decoration. It carries what the machine knows — a phase
label, a marker on the planet, an aside such as `// the cost — every AI
initiative stalls at the data layer`. Prose is never set in it.

## 3. The scene

Everything the scene places vertically is measured from the middle of what a
reader can actually see, which is half a header below the middle of the window.
The world and the star it is lit by both sit there; measuring from the window
instead left the world about thirty pixels high at every size.

`assets/scene/planet.js` builds one WebGL scene, 48vw square and capped at
760px, centred and moved by CSS transform rather than by re-rendering.

- Lunar sphere, radius `1.32`, 160 × 120 segments, with seven crater
  displacements applied to the vertex positions.
- Earth sphere, radius `1.322`, 128 × 96, sharing the scene, camera and parent
  transform so the two surfaces stay registered through the transition.
- Cloud shell at `radius × (1 + 15 / 6371)` and atmosphere shell at
  `radius × (1 + 100 / 6371)` — the 15 km cloud base and the 100 km Kármán
  line at true scale against a 6371 km mean radius.
- 3,600 instanced moss blades, surface-aligned, revealed with the Earth.
- Camera: 36° field of view at `z = 5.25`. ACES filmic tone mapping, exposure
  `1.34`, device pixel ratio capped at `1.75`.

Earth's 0.335% polar flattening is below a visible silhouette change at this
size, so the mesh stays spherical and the geometry budget goes to map detail.

### What scroll drives

A single scrub, `growth = smoothstep((scroll − 0.06) / 0.84)`, drives every
layer; there is no second timeline.

| Layer | Revealed over |
|---|---|
| Lunar → Earth surface | `0.08 – 0.68` |
| Frontier heat | with the surface, peaking mid-crossing |
| Atmosphere | `0.46 – 0.92` |
| Clouds | `0.54 – 0.88` |

The crust does not arrive where it is now either. While the world is young its
longitudes are drawn in toward one meridian, so the visible face carries nearly
all of the land at once and the far side is open ocean — one mass, which is
what it was. As the drift runs the pull relaxes and the land parts into the
continents we have, opening the seas between them as it goes; crust still on
its way is tinted warmer and barer than the ground it will become. It runs
behind the surface rather than with it, from a scrub of 0.52 to 0.96, so the
world finishes becoming a world before it starts becoming *this* world.

The two surfaces meet along a dithered frontier, and the frontier itself is
lit: a band of heat runs with the advancing edge, strongest exactly on the line
and gone a little either side, on both surfaces so they share one edge rather
than meeting at a seam. It fades in over the first sixth of the crossing and
out over the last, so the world neither arrives already glowing nor leaves
still lit. Without it the change was silent — one surface simply replaced the
other, pixel by pixel, with nothing to watch.

The planet also moves, between stations written in viewport units — full size at the top, small and to the right through the argument,
back to centre at *How your people fit in*, where the reader is being shown two
columns that belong on either side of it, and away again for the close.

**The journey is measured in chapters, not in page fractions.** A station is
written as a fraction, but the page is not one length: reduced motion collapses
the two scroll-driven chapters and the mapping chapter to their plain stacked
height — three and a half thousand pixels shorter — and a locale with longer
sentences stretches it the other way. Each chapter's measured top is therefore
mapped onto the fraction the journey was tuned against, piecewise-linearly
between them, and re-measured whenever the document's own height changes. The
table always sees the page it was written for.

Without that mapping the failure is not drift, it is the wrong story: a reader
with animation turned off met the bare rock parked on the left through a
chapter that had asked for a finished world on the right, with no moon, no
satellites and no labels, because the scrub and the reveal were reading a
position two chapters behind the one on screen.

The planet follows a moving target, so while the reader scrolls it trails by
roughly the target's speed times the easing's time constant. That is why a
chapter can be reached before the planet is in the space it left, and why no
amount of moving the stations earlier fixes it: moving a station moves the
target and the trail with it.

**The journey is therefore read a little ahead of the reader.** The lead is the
same product — the measured scroll rate times the easing's constant — so the two
subtract. It falls to nothing the moment scrolling stops, so a settled planet
sits exactly on its station rather than past it; the measured rate is smoothed,
because a wheel delivers scroll in steps, and capped, because a flick would
otherwise read the journey most of a page ahead. Only the journey is read
ahead: the growth scrub and the star's bearing stay honest to where the reader
actually is.

**A crossing is timed to the hand-over, and stays in sight.** Two arguments
face each other across one: the chapter being left holds one side and the
chapter being entered holds the other. They are on opposite sides, though, and
the incoming heading arrives at the bottom of the frame rather than in the
world’s own band — so between the moment the first argument scrolls off and
the moment the second rises level with the world there is a gap of about half a
second of reading, and the crossing is timed to it. It begins at the end of the
pair it is leaving and is finished before the next pair is entered, which is
what makes a change of side read as one movement rather than as a scramble.

Taking the world below the frame instead solves the collision and loses the
world, which is worse: a reader who looks up and cannot find it has been shown
a page that broke, not a planet that moved.

**The first crossing also passes low, and arrives late.** The chapter it leaves
pins its argument on the right for its whole length, and the world's
destination is that same side, so on a level path the disc slides behind the
outgoing heading and reads as sinking into the text rather than travelling
past it — measured, and photographed. Dropping through the lower part of the
frame takes it under that heading, and holding the arrival until the heading
has left clears the last of it. The world stays in sight the whole way, which
is the difference between a world that travels and one that disappears.

Legs still want a real span of page, because a lead cannot cancel a trail
larger than the leg itself. Measured at a reading pace of a viewport a second,
every chapter’s disc now stands clear of its own argument from the moment that
chapter’s heading can be read, not merely from the moment its top line arrives.

Self-rotation is 7.5° per second — a forty-eight second revolution. The
reference turns at 1.5°, which measures as motion and reads as a photograph;
3.2 and then 5 were both still slow enough to be reported as a world that does
not turn. It turns about its own axis and the axis leans by Earth's 23.44°,
which is two groups rather than one: the outer holds the obliquity and never
spins, the inner spins and never leans. Collapsing them wobbles the pole around
the sky once a revolution.

The face follows its target on a **time constant, not a per-frame fraction**.
A per-frame follow closes the same share of the remaining travel thirty-five
times a second on a machine drawing sixty and four times a second on one
drawing six — so the surface turned at a fraction of its stated rate on slower
hardware, and a reader on such a machine saw a world that did not move. The
same correction applies to the placement easing and the scroll boost.

The satellites' orbit is **sized from the planet rather than from the
viewport**: the two named bodies keep a vertical semi-axis wider than the drawn
disc, so they are never behind it. Sized from the viewport, their semi-axis
came out smaller than the planet's radius and both spent half of every
revolution occluded — which is what "the satellites do not orbit" looks like to
someone watching the cover. The third is deliberately close in and does cross;
one body passing behind is what makes the ring read as an orbit.

The spin runs on its own clock, so the world turns whether or not anyone
scrolls, and it turns faster while someone does — scroll speed, measured as
page-fractions per second, becomes a bounded multiplier that the satellites
share. Both easings on this path are time constants rather than per-frame
fractions. A frame-counted easing follows at one speed on a machine drawing
sixty frames and another on a machine drawing six, so the same page reads as a
different animation on slower hardware; measured at four frames a second, the
scroll boost could not build at all.

### The sun

The star crosses the sky once over the page, from one shoulder of the world to
the other by way of directly above it {0} a hundred and eight degrees, and its
distance breathes by a fifth as it goes. A narrow arc at a fixed radius reads
as a lamp clipped to the planet rather than as a star the planet is going
round, which is the whole point of putting the reader on the surface. Both ends
stay well above the horizontal, because a sun level with the world grazes its
limb and the surface goes to silhouette, and the drawn position is clamped
inside the frame: a star pushed past an edge is a light source the reader
cannot find, which is worse than a bearing a few degrees off its arc. The
surface is lit from where the glow is actually drawn, so the two never
disagree, and the field slides against the same bearing so the sky moves as
the star does.

There is a star, and it is the same star the surfaces are lit by. It is drawn
in CSS — the scene's canvas is 48vw wide and a light source has to be able to
sit outside it, and a body this far away is a soft disc, which is what a radial
gradient is. A few pixels of core; everything else is corona.

**The planet is the origin.** The camera rides with it, so the planet goes where
the layout asks and the orbit is carried by everything else: the star is placed
from the planet on a bearing that sweeps once down the page — 280° to 340°,
screen axes, 270° being straight overhead — at a fixed stand-off, and the star
field slides against that same bearing, each depth tier by its own share, which
is the parallax a year of orbiting produces.

Two other framings were built and measured first. A sun on an independent
course ends up behind the header at one end of the page and grazing the limb at
the other. Curving the planet's own path around a fixed star reads as the
reader standing outside the system, and it costs the layout every station it
asked for, because a station on an arc is not the station that was written.

The arc is chosen against the page rather than against the sky: the bearing is
checked at every station for a collision with anything being read. A phone gets
its own shorter arc, and then does not draw the disc at all — the copy runs the
full width there, so wherever the star went it went behind something — keeping
only its light, which is what the reader is actually looking at.

The direction is then **derived from where the sun landed**, never set beside
it, so the two cannot disagree. One `uSun` vector reaches the lunar terminator,
the Earth's day and night, the cloud shading and the lit limb of the
atmosphere. Move the disc and the whole sky agrees; that agreement is the
effect, and a light that only moves the lamp is one nobody believes.

### Meteors

One crosses every few seconds, at a random time, from a random edge, on a
shallow angle — rare enough to stay an event rather than a shower. They are
drawn on their own 2D canvas, behind the planet, so a streak vanishes behind it
and the sky gains a depth the star field alone cannot give. Half of them are
aimed at the world.

An aimed one that reaches the drawn limb ends there, and what happens next is
the whole point of aiming it. On the bare rock it **detonates**: an expanding
shock ring, a warm flash, and debris thrown along the shallow angle it arrived
on, never back through the body it just struck. On the living world it is
**drunk in** — a cool bloom that swells and fades, no debris. It is the
atmosphere doing it: a world with air takes the strike rather than shattering
under it, so the ending is pinned to the atmosphere's own arrival, changing at
a scrub of 0.55, just after the shell begins to appear at 0.46. The two read
apart at a glance and measure apart too: warm pixels outnumber cool by an order
of magnitude on the first, and cool outnumber warm by more on the second.

The sky **quiets** rather than emptying as the world comes alive — the gap
between meteors stretches with the growth scrub, so the dead sky is the busy
one and the living world is met by the occasional arrival. It never reaches
nothing. A sky with nothing crossing it cannot deliver the second ending, and
what the atmosphere does to an arrival is the reason the meteor was aimed.

The strike radius is measured from the planet element rather than restated from
its stylesheet numbers, so resizing the world cannot leave meteors striking a
circle that is no longer where it is.

Some of the field twinkles: about a fifth of the stars, each on its own period
of three to nine seconds and on two rates at once, because a single sine is a
metronome and a sky is not. It runs on a tenth-of-a-second tick rather than a
frame loop — a sky does not need sixty of them a second — and stops entirely
for a hidden tab or a reader who asked for less motion, which is where the
promise of no idle animation actually matters.

Their loop exists only while one is in flight or an impact is still fading.
Between meteors nothing is scheduled, which is what lets the star field keep
its own promise of no idle animation. Reduced motion suppresses them entirely,
and a hidden tab stops scheduling them.

### The satellites

Three bodies on three distinct paths about the planet, evenly spaced a third of
a turn apart so that at any moment they stand apart rather than clustering —
each one has to have room beside it for the label anchored to it. **No rings
are drawn.** Two rings for three bodies was the visible half of a deeper
problem: a drawn path is a promise about where a body will be, and the moment
one body strays from it the whole system reads as decoration. Without them the
motion alone says orbit, and each body is free to take its own path.

Every path clears the drawn disc at every point, in both axes, by at least
twenty pixels at each of the five chapters that anchor labels. That is a sizing
constraint, not an aesthetic one: sized from the viewport, the vertical
semi-axis came out smaller than the planet's radius and a body spent half of
every revolution behind the disc, which is what "the satellites do not orbit"
looks like to someone watching. Sized from the planet, the innermost path is
nearly face-on and the outermost is flattened; the trio still reads as a system
seen at an angle.

The orbit's outermost reach is **published** as one custom property, computed
from the same table that draws the bodies, because everything else that needs
it is deciding whether the orbit clears something — and a second copy of the
number stays true exactly until one of the two is tuned.

All three share **one period**, and that is the whole of what keeps them apart.
On separate periods the phase offsets drift: three bodies written a third of a
turn apart closed to thirty-five degrees inside a minute, which is the clumping
that makes an orbit read as three unrelated dots. One period holds the third of
a turn for as long as the page is open, and the period is the planet's own, so
the system reads as one thing. What tells them apart is radius, size and
colour, never speed.

**They arrive in the order the story does, and they are drawn as what they
are.** The cover's sky has a world in it and nothing else, because nothing
orbits a bare rock. A moon arrives with the surface it belongs to, on the
widest of the three paths, drawn grey with its seas — a plain ball is a bead,
and the maria are what make a reader recognise *this* moon rather than a
generic one. The two the argument is about are built rather than found, so they
arrive last, where the page first needs something to pin a label to, and they
are drawn as machinery: a lit hull between two striped arrays on a boom, with a
dish looking back at the world. At four pixels across a shaded sphere reads as
another planet, which is the one thing these two are not.

What each carries follows from what it is: the moon is the oldest thing in the
sky, so it names the oldest thing the organisation has, its people, and the two
that were built name what is being built.

What a label has to clear is therefore the drawn object rather than the radius
it was sized from: a craft's arrays reach well past its hull, and the published
span says so.

They keep their own clock, so they circle whether or not anyone scrolls, and
faster while someone does — the same multiplier the planet's spin uses.

Two of the three are named — *your people* and *AI*, the page's argument in
orbit — and only on the near half of the path. The box is split into halves and
stacked either side of the planet, so a body on the far half is drawn under it
and on the near half over it; a name that survived that would read as a clipped
word rather than as something passing behind. Each name sits on a chip rather
than bare on the sky, because a label crossing a lit surface needs a ground of
its own.

### The reading side

One rule, applied to every chapter: **the argument holds one side and the
planet takes what is left.** Measured against the designer's own build, that
is what she does everywhere — copy and cards to about fifty-five percent, the
world clear beside them, never printed under a block of text. Six chapters
declare `chapter--aside` and are held to `min(58% of the max width, 47vw)` on
the reading-start side; three-across grids become two inside it, and
ValoStack's second text column folds into the first, since that column was the
paragraph sitting on the planet.

**The column is capped against the frame as well as against the measure.** Held
only at a share of the max content width it keeps 719px however narrow the
window gets, so as the frame shrinks the column takes more of it until the
orbit no longer clears the argument — which is the condition the labels are
gated on. Measured across widths, that clearance is +22px at 1600, +11 at 1500
and negative from 1440 down, and two of the five label chapters showed no
labels at all below 1440. The second cap does nothing above 1530px and yields
from there, which keeps every label chapter working down to 1024.

The planet's journey follows from the rule rather than being tuned against it,
and it holds a side for **two chapters at a time**: left for the two that open
the argument, right for the two that follow, left again for the two after
those, centred for the mapping chapter, right for the two that close. A station
is a place the planet settles into and stays, so a crossing is an event rather
than the page's usual state. Half the chapters therefore hold their argument on
the right, which is what `chapter--aside-end` is: the same column against the
other edge, with the ground swapping to match.

The cost of the rhythm is a straight measurement rather than a matter of taste.
A right-hand station has to clear its column by the orbit's whole reach and so
does a left-hand one, which puts the two about fifty viewport-widths apart; a
crossing therefore takes about a second of scrolling, and neither chapter can
name its bodies while it is under way. Where the page is long that costs
nothing. Between the two shortest chapters on the site it costs half of one
chapter's labels, and the stations there are pulled as close together as their
arguments allow for exactly that reason.

Where a chapter puts content on **both** sides, the planet takes the channel
between them. That is the same rule with a different empty space, and it is
what the mapping chapter is.

### Annotation chips

Short labels pinned around the world, connected by a small lit square, rather
than a column of prose beside it — the designer's own device, and the reason
her planet is never covered. Fifteen of them across five chapters. Each is
pinned to **one body** and follows it round, measured at thirty to fifty pixels
from it at every point of every orbit, because a label that drifts from the
thing it names stops naming it.

**Only one chapter names the bodies at a time.** Two chapters in frame together
pin their labels to the same three bodies, so six labels land on three
positions and print on top of each other — which reads as one line split in
half rather than as two chapters overlapping. The chapter the reader is level
with wins; the rest go dark.

That chapter shows its labels only when three further things hold: it holds the
frame, the planet has stopped, and the planet stands in the space this chapter
left for it. The third is not implied by the second. The planet parks at one chapter's
station and is perfectly motionless there while the next chapter comes into
frame, and labels lit at that moment point at bodies orbiting somewhere else
entirely. The test is written against the **whole orbit** rather than the
planet's centre: what prints itself over a sentence is the body swinging out to
the far side of its path, and the label chasing it.

Within that space a label opens away from the planet, and takes the near side
when the far one has no room — never a clamp. Clamping is what leaves a label
at the edge of the allowed space pointing at nothing, which is worse than
opening on the unexpected side.

A label carries the same near-black ground as a chapter card rather than the
lighter glass the panels use. Glass is right for a panel sitting on a chapter's
own dark scrim; a label sits on the lit world itself, and the blue in the glass
reads as a second colour against it.

Their text is drawn from strings the dictionary already carried and no chapter
rendered: the three architecture layers, the phase outcomes, the ownership
promises. Nothing new had to be written or translated, and content the business
team had already written stopped being orphaned.

### The investor gate

Two views of the trust chapter, as the design has them. The **general view** is
the seven answers and what each one is. The **detail view** — the three
mechanisms under each — opens behind a sign-in reached from the nav, which
sits between the language control and the call to action.

The bar carries six links, that control, the sign-in and the call to action,
and below about a thousand pixels that is more than fits. The whole set folds
into the menu at 1080px. It has to fold as a set: leaving the sign-in in a bar
that had already dropped its call to action pushed the menu button outside the
frame on a phone, which cost the reader the only way into the navigation, and
the page reports no overflow when that happens because the row clips rather
than scrolls.

**It is a demonstration, not a security control.** This is a static site with
no server: the detail ships inside the page and anyone reading the source can
find it. Nothing may be put behind it that would matter if read. It exists so
the two views are separate, as the design intends, and so a real gate has
somewhere to go when there is a server to hold it.

### The orbiting chapters

*The problem corporate leaders face today* and *The answer* are the designer's
own composition, and the one her note was about: the cards travel **around**
the world rather than sitting in a list beside it. Above 950px each chapter is
a 340vh stage with its argument pinned to the reading-start side, and each
card rides an ellipse about the planet — `90° + i·(360/n)° − progress·240°`,
two thirds of a revolution across the chapter, so every card passes behind the
world once.

A chapter opts in by declaring `data-orbit`, and its cards by
`data-orbit-card`. The mechanism knows nothing about either chapter; adding a
third is two attributes.

Depth drives everything else: `depth = (sin θ + 1) / 2` gives scale
`0.74 + 0.26·depth`, opacity `0.48 + 0.52·depth` and blur `(1 − depth)·1.2px`.

**A far card cannot be put behind the planet with z-index.** The planet lives
in a fixed layer at the bottom of the page's stacking order and every chapter
sits above it, so stacking can only ever put a card in front. A rear card is
masked instead: a radial-gradient cut-out the size of the drawn disc, at the
disc's position expressed in the card's own coordinates — offset and radius
both divided by the card's scale, because the mask is applied before it.

The ellipse is **bounded by the frame, not by a constant**: its horizontal
radius is the smaller of the design value, the room between the planet and
the pinned column, and the room between the planet and the window edge. A
card can therefore never land on the argument or leave the page, at any
viewport, without a breakpoint being tuned for it.

Below 950px, and under reduced motion at any width, the chapter is the plain
stacked list it is underneath — same cards, same order, staggered indents,
marker squares back.

**The whole composition mirrors with the reading direction.** Under Arabic and
Urdu the argument is pinned to the right, so the journey's stations and the
star's bearing are reflected about the vertical axis and the orbit measures
its room against whichever side of the column the planet is on. The scene
still paints in physical coordinates — it has no reading order of its own —
but where it *stands* follows the page.

### The mapping stage

*How your people fit in* is a three-column composition: your people on one
side, the AI workforce on the other, one world between them. Above 1120px the
chapter becomes a scroll stage — 440vh tall, its panel sticky — and the two
columns hold a centre channel of `min(33vw, 440px)` that belongs to the planet.
The chapter's scrim opens in the middle to match, so the argument sits on solid
ground either side and the channel stays open sky.

The pairs arrive one at a time. Stage is `floor(progress × 5)` over the
chapter's own travel; a pair at or below the stage is revealed, the pair at the
stage is lit. Each side enters from its own edge, un-blurring as it lands, so
the reader takes in one correspondence before the next appears instead of
meeting five at once. Below the breakpoint there is no channel and no stage:
the arrow does the joining, and every pair is simply present.

### When it does not run

The scene is loaded asynchronously and only where WebGL is available; a
browser without it, or without module support, never requests the graphics
library at all. What it keeps is a sky rather than a gap: stars, meteors, the
sun, and a still frame of the planet in the scene's place. The still carries an
alpha channel for that reason — baked opaque it is a rectangle that hides the
sun behind it, which is exactly what happened before it was measured.

The placement runs whether or not the scene does, because the sun and the still
belong to the page's choreography too. Where nothing is rendering it runs on
scroll and resize rather than every frame.

Reduced motion does not remove the planet, and does not freeze it either. The
world keeps turning at 0.9°/s — a six-minute revolution — and the satellites
keep circling at a sixth of their pace, both slow enough that nothing appears
to move without being watched for, which is the threshold the setting is
about. What stops is everything with velocity in it: the scroll boost, the
intro approach, the pointer drift, the orbiting chapters' travel and the
mapping stage's stepping, each of which shows its content at once instead.
Nothing in the argument depends on any of it.

### What the frame costs

The scene hands its per-frame state to the page as **one plain object**,
`window.VALO_STAGE`, and not as custom properties on the root element. That is
the single largest performance decision on the page, and it was not obvious
until it was measured: a custom property set on `:root` is inherited by every
element in the document, so writing eighteen of them per frame invalidates the
whole tree's computed style, and every consumer that read them back through
`getComputedStyle` forced the recalculation to complete.

Measured on an integrated GPU at 1600x900, idle: **sixteen frames a second with
those writes, a hundred and twenty without them.** Nothing else came close.
Halving the pixel ratio, turning off antialiasing and cutting the sphere from
thirty-eight thousand triangles to six moved the figure by less than the noise,
because the cost was never on the GPU at all — removing the whole WebGL scene
left it at sixteen.

Two consequences worth keeping. The only stylesheet consumers are the two orbit
layers, and they are given the properties **on themselves**, so the rules that
read them go on working and the invalidation stops at two elements. And the
page-side readers — the labels, the orbiting chapters, the meteors — read the
object rather than resolving style, which removes about twenty
`getComputedStyle` calls a frame along with the writes that made them expensive.

### Markers### Markers

The cover's three markers are placed from the planet's own published position,
arced down the side the copy does not take, and the copy is capped at
`min(36vw, 560px)` so the two lanes cannot meet.

The cover is also the one section whose composition is measured against the
**frame** rather than against the reading column, so its own column is nearly
the frame — `min(94vw, 1520px)`. Holding the copy inside the centred 1240px
column while the world and the markers are placed in viewport units is what
separates the two systems on a wide screen: the copy is pulled inward, the art
is not, and the result is a dead strip down the left with everything else
pressed into the right of it. Measured at 1915px, that strip was 366px against
235 on the other side; it is 226 against 235 now. Anchoring them to the viewport
instead is what the reference does, and at 1440 it puts two of them on the
headline; anchoring them inward from the planet, which this build did while the
cover's world was cropped by the right edge, does the same thing from the other
direction. Anchoring them outward from a world that stands clear of the copy is
the only arrangement with no collision to place.

Below 900px the section collapses to one column and they become a plain list
under the heading, where a marker cannot cover anything.

## 4. Chapters

| # | Chapter | What it does |
|---|---|---|
| 1 | Hero | The claim, three trust markers, one call to action |
| 2 | The Problem | Three panels in orbit — hiring, disconnected tools, scattered data |
| 3 | The Answer | Three services and the phases each covers |
| 4 | How we deliver | Five phases, each with its outcome |
| 5 | The workforce | Nine departments, what each one does |
| 6 | ValoStack | The cross-engagement brain, and the consent it runs on |
| 7 | Why leaders trust ValoLab | Seven structural answers |
| 8 | How your people fit in | What your team directs against what the workforce delivers |
| 9 | One company, a family of products | The six products, in recessed trays |
| 10 | Pricing and engagement | How an engagement is priced, and the first step |
| — | Footer | Contact, company, legal |

## 5. Language

Twenty locales, English as the source of truth. The served markup carries the
English text, generated from the dictionary by `scripts/sync-static-copy.mjs`,
so a reader without JavaScript gets the whole page rather than empty headings;
`site.js` swaps every `data-i18n` node on load. The pre-push hook fails if the
markup and the dictionary drift apart or if the twenty dictionaries fall out of
parity.

**Every locale is authored, not machine output**, and each is held to the way
its own language reads rather than to the shape of the English. Three rules
carry most of that:

- **The register is the market's.** Every locale addresses a company, formally
  and consistently: usted, vous, Sie, です/ます, Anda, आप, คุณ. Korean addresses
  the reader as 귀사 and drops the pronoun wherever the language naturally
  would, because a literal second person reads there as a translation rather
  than as address.
- **A technical noun is written in the locale's own script.** The keep-list is
  nineteen tokens and no more: the brands, the acronyms (PoC, CRM, ERP, BI, QA,
  SaaS), the legal entity, `markdown`, and the three glossary terms every
  locale leaves in English. Where a native word carries the sense it is used
  — رازداری, تعمیل, ماخذ — and where the loan is the standard professional term
  it is transliterated — ڈیٹا, डेटा, ডেটা. Latin words inside a right-to-left
  page are the worst case: they turn one sentence into a dozen direction
  switches.
- **Typography follows the locale.** French takes a no-break space before
  `: ; ! ?`, Japanese and Chinese take full-width punctuation, Arabic takes ،
  and Urdu takes ۔.

## 6. Accessibility

- Every interactive element is reachable by keyboard with a visible focus ring
  that meets contrast against the panel it sits on, not against the void.
- Text contrast is measured against the painted pixel — panel fill over planet,
  not token over token.
- `prefers-reduced-motion` slows the planet's rotation to 0.9°/s and the
  satellites to a sixth of their pace, and disables the scroll boost, the
  intro approach, the pointer parallax, the orbiting chapters, the mapping
  stage's stepping and every scroll-driven reveal. Every chapter shows its
  full content as a stacked list.
- A block the scroll flew past is revealed anyway. An observer is notified only
  when a ratio crosses a threshold, so a flick of the wheel that carries a
  block from below the fold to above it in one frame crosses nothing, and the
  block would stay invisible for the rest of the session. The same blindness
  left the nav's current-chapter mark pointing at wherever the reader used to
  be; both now read position directly.
- The scene is `aria-hidden`; it carries no information the text does not.
- A print stylesheet puts the page on paper in black on white.
