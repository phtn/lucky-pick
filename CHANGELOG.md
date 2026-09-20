# Changelog

All notable changes to `lucky-pick` will be recorded here.

## [Unreleased]

- Replaced the default palette with a neutral greyscale set (`src/styles/new-default.css`); the old warm-cream/green `default.css` is gone. `--primary` is now near-black in light and near-white in dark, so every accent that reads from it — the selected game chip, the drawn balls, `--lp-glow` — is monochrome by default.
- Took the strokes out of the interface. Surfaces now separate by fill, a single top-lit inner edge (`--lp-edge`) and shadow instead of 1px borders — every `border border-border` is gone from the components, and the accent cards carry their tint in the fill rather than an outline.
- Added the surface vocabulary the sections share: `.well` for sunken blocks, `.pill` / `.pill--solid` / `.pill--muted` for action rows, `.icon-button--accent` for a filled control among soft ones, and `.meta-chip` for quiet labels. Radii are tokens (`--lp-r-panel`, `--lp-r-well`, `--lp-r-pill`) so shape stays consistent across breakpoints.
- Rebuilt the game switcher as a scroll-snapping rail of soft chips with the selected game filled in the theme accent, replacing the bordered grid that left a ragged empty cell on narrow screens.
- Reworked mobile: panels keep their radius instead of flattening to a 2px slab, the game rail bleeds to the page edge with its gutter and snap offset in step, the page gutter is an even 16px, controls hold a 44px touch target, and the three selection shortcuts stay on one line at 375px.

- Split `src/App.btsx` into one file per interface section under `src/components/`: header, game switcher, live board (official result, next draw, play-vs-real), room panel, bet panel (paytable, number grid, random bets), session stats, draw stage (jackpot banner, winners list, draw history, how it works), ticket list, leaderboard, player tickets, party chat and prize note, plus the shared `Ball` and `Youtube` marks. `App.btsx` keeps the application state and now reads as the page outline.
- Moved the domain types, tables and constants the sections share out of the `App.btsx` module block into `src/lib/lotto.ts`, and the peso formatters into `src/lib/format.ts`. `BetType` is no longer declared twice; every file uses the one from `src/lib/games.ts`.
- Gave `PartyChat` its own scroll ref and effect, and `Leaderboard` its own sort, so neither needs the application to own it.
- The ticket panel and the bet button now build the party-player suffix from one value, so a heading can no longer read "• undefined" between a player leaving and the next selection.

- Repriced the match-all pick bets onto a single paytable at a flat 62.718% return, anchored on 6/42 pick 3 = ×360. Payouts are now a multiple of the stake, so a ₱20 ticket collects proportionally less than a ₱25 one.
- Pick bets no longer reuse the jackpot ticket's tier prizes. Pick 3 previously paid ₱20 at 1 in 574, which made it strictly worse than pick 2 on both odds and payout; no pick bet is dominated now.
- Split the prize panel in two: a jackpot ladder (6/6 down to 3/6, PCSO tier odds) when the jackpot bet is selected, and the pick paytable (5/5 down to 1/1, match-all odds) otherwise. The single mixed table stated two different odds models in one column.

- Added a colour theme system: `src/styles/new-default.css` is the default token set, with Doom and Soft Pop selectable from the header, plus a light/dark toggle. The choice persists and is applied before first paint, so it never flashes.
- Re-skinned the interface onto theme tokens — every hard-coded colour in `App.btsx` and `style.css` now resolves from the active theme, including the canvas drum, the confetti and the lottery balls.
- Themes change colour only. Corner radius, spacing, shadows and typography stay the app's own, so every theme keeps the original component shapes and Manrope/IBM Plex Mono type.
- Player and game accents read from the theme's chart ramp, with per-fill text colour chosen by luminance so chips stay legible in any palette.

- Added the four larger PCSO draws alongside 6/42 — Mega Lotto 6/45, Super Lotto 6/49, Grand Lotto 6/55, and Ultra Lotto 6/58 — each with its own ball pool, draw nights, base jackpot, rolling pot, and prize ladder.
- Tickets and draws now record the game they belong to, so a draw only settles tickets bought for that game.
- Added random bet multipliers (×1, ×10, ×20, ×50, ×100, ×200) that buy machine picks in bulk, with a 600 open-ticket cap and a capped ticket list render.
- Replaced the hard-coded 6/42 odds table with computed combinatorics, so every game shows correct jackpot, tier, and match-all odds.
- The drum now mixes the selected game's full pool, shrinking the balls as the pool grows.

- Reworked the interface into a quieter, premium glass-and-champagne visual system with a new wordmark, unified surfaces, focus treatment, and responsive polish.
- Replaced the floating DOM draw balls with a fixed-step, collision-aware canvas chamber inspired by the Compelling worker demo.
- Added live chamber status, refined draw-result slots, reduced-motion support, and a more tactile draw action.
