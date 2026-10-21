# Hearth Wall Panel — Design system

The look is defined once in [`src/styles/hearth.css`](src/styles/hearth.css), ported
verbatim from the approved prototype. Change a token there and the whole UI follows.

## Principles
- **Fixed 1280×800 landscape stage**, scaled to fit with `transform: scale()`. No responsive
  reflow; portrait phones get a rotate hint.
- **Never scroll the main view.** Content fits the area above the dock.
- **Flat and solid**: no borders/outlines, no blur, no gradients, no shadows. Solid card fills.
- **One corner radius** `--R: 22px`; inner buttons `calc(var(--R) - 6px)`.
- **No top bar, no brand.** The bottom **dock** is the only navigation.
- **Touch targets ≥ 60px.** Large type (cards 20–28px, values up to ~54px).
- **Monochrome on-states.** Accent is reserved for light colour and live indicators.
- **Dark first**; light theme via `prefers-color-scheme` or `[data-theme]`.

## Tokens (`:root`)
`--outer --bg --card --card-2 --sel --track --ink --ink-2 --ink-3 --accent --accent-ink --glow --glow-ink --R`
Surfaces use `--card`; buttons/tiles inside cards use `--card-2`; selected state `--sel`;
text hierarchy `--ink / --ink-2 / --ink-3`.

- Dark: `--bg #0D1111`, `--card #171D1D`, `--card-2 #212929`, `--sel #2C3636`, `--ink #ECF1F0`,
  `--accent #8DBFB4`, `--glow #E8C27A`.
- Fonts: Bricolage Grotesque (display), Figtree (body), DM Mono (numbers/times).
- Icons: Lucide, inline SVG `<symbol>` sprite, used via `<Icon n="name" />`.

## Information architecture
Five tabs, one shared dock: **Home, Rooms, Lights, Media, Scenes**.
- Swipe left/right between tabs (commits past ~120px or a fast flick); arrow keys too.
- **Rooms** is special: the dock button opens the tab *and* a room picker above the dock;
  tapping again toggles the picker; picking a room closes it and the dock shows the room name.
- After 120s idle, an **ambient sleep** screen (clock, date, summary, slow drift). Any tap wakes.

## Components
`Icon`, `Slider` (drag-to-set `.rng`), `Switch` (`.sw`), `Raw` (album art / charts).
Views: `Home`, `Rooms`, `Lights`, `Media`, `Scenes` under [`src/ui/views/`](src/ui/views/).

## Media naming rule
Never show the name "Music Assistant". Use **Speakers / Playlists / Tracks / Radio**.

## Accessibility
`aria-label`, `aria-pressed`, `role` and `aria-current` kept from the prototype;
focus-visible rings in accent. Contrast to be verified at milestone 5.
