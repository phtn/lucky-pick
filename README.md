# lucky-pick

A [Beast](https://www.npmjs.com/package/beast-tsrx) project powered by
[TSRX](https://tsrx.dev/) and [Octane](https://octanejs.dev/).

```bash
bun install
bun run dev
```

Edit `src/App.btsx` to get started. Declare typed props at the top of the BTSX
file; the Beast bundler adapter compiles it into native TSRX and then lets Octane
produce the browser module.

The starter pins the tested `octane@0.2.13` toolchain. Run the complete local
verification before shipping:

```bash
bun run check
```

Use `scope` when setup belongs to an exact child position instead of the whole
component:

```btsx
scope
  setup const label = "Owned by this child";
  p #{label}
```

Octane signals need no build option. Import `octane/signals` in a module to
enable native signal reads there:

```btsx
import { createScope } from "octane/signals"
```

Record application changes in [CHANGELOG.md](CHANGELOG.md).

## Project layout

`src/App.btsx` owns the application state — the draw, the tickets, the players,
the audio and the theme — and its template is the page outline, one component
per section. Every section lives in `src/components/`, takes plain props, and
raises callbacks rather than reaching for state; a panel that needs its own hook
(the chat scroller, the leaderboard sort) keeps it locally.

Shared code sits in `src/lib/`: `games.ts` holds the game table and the odds
maths, `lotto.ts` the tickets, players, prize tables and room helpers, and
`format.ts` the peso formatters. A component imports what it needs from those
rather than receiving it through props.

## Selected stack

- Bundler: rsbuild
- UI: shadcn (@octanejs/shadcn)
- Styling: Tailwind CSS v4

```ts
import { Button } from "@octanejs/shadcn/Button";
import "@octanejs/shadcn/theme.css";
```

## Theming

Themes change **colour only**. Corner radius, spacing, shadows and typography
belong to the app, so every theme keeps the same component shapes and the same
Manrope / IBM Plex Mono type. Theme files carry no `--font-*`, `--radius`,
`--spacing` or `--shadow-*` declarations; those are stripped when a theme is
added, and `style.css` owns them via a plain `@theme` block.

`src/styles/default.css` holds the default token set; `doom.css` and `soft-pop.css`
are the alternatives. Each file carries only tokens, scoped to its own id:

```css
[data-theme='doom']      { /* light tokens  */ }
[data-theme='doom'].dark { /* dark tokens   */ }
```

Tailwind, the `@theme inline` mapping and the base layer live once in
`src/style.css`, which imports every theme file. All three ship in one bundle, so
switching is a single attribute on `<html>` — no extra request, no flash. A small
inline script in `index.html` applies the stored choice before first paint.

The UI is written against tokens rather than fixed colours: `bg-card`,
`text-foreground`, `border-border`, `text-primary`, and the derived `--lp-*` set
in `style.css` for surfaces the shadcn vocabulary does not cover (`bg-sunken`,
`bg-raised`, `bg-elevated`, `bg-ball`). Anything painted to a canvas
resolves its colours through `src/lib/theme-colors.ts`, which pushes each token
through a 1x1 canvas so it comes back as sRGB regardless of the syntax the build
pipeline emitted.

### Adding a theme

1. Drop a [tweakcn](https://tweakcn.com) export into `src/styles/`.
2. Scope its `:root` to `[data-theme='<id>']` and its `.dark` to
   `[data-theme='<id>'].dark`, and delete the `@import`, `@theme inline` and
   `@layer base` blocks — `style.css` already provides those.
3. Strip its `--font-*`, `--radius`, `--spacing`, `--tracking-*` and `--shadow-*`
   declarations, keeping only colour tokens, so the theme cannot alter shape or
   type.
4. `@import` the file in `src/style.css`.
5. Register the id, name and blurb in `THEMES` in `src/lib/theme.ts`.

Nothing else needs touching; the picker, the canvas palette and the player ramp
all read from the tokens.

## Bet pricing

Two separate structures, deliberately:

- **Jackpot ticket** (`betType` 6) holds six numbers and collects on partial
  matches. Its 5/6, 4/6 and 3/6 payouts are `GameConfig.secondary`, the fixed
  amounts PCSO publishes, and the top prize is the rolling jackpot.
- **Match-all pick bets** (`betType` 1-5) win only if every number held is
  drawn. They pay `GameConfig.payout[k]` times the stake actually wagered.

The paytable is priced at a flat return, `PAYOUT_RTP`, so no pick bet is a worse
deal than another. It is anchored on 6/42 pick 3 = x360 at 1 in 574, which gives
360/574 = 62.718%; every other cell is its own odds times that constant, rounded
to a clean number (all land within 1% of target). To retune the whole table,
move the anchor: x320 is about 55.7%, x290 about 50.5%.

The jackpot bet cannot take a fixed multiplier, because it also collects the
lower tiers. At the base jackpot it returns roughly 18%; it reaches the same
62.7% once the pot rolls to about P64.5M on 6/42.
