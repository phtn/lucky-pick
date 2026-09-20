# Changelog

All notable changes to `lucky-pick` will be recorded here.

## [Unreleased]

- Repriced the match-all pick bets onto a single paytable at a flat 62.718% return, anchored on 6/42 pick 3 = ×360. Payouts are now a multiple of the stake, so a ₱20 ticket collects proportionally less than a ₱25 one.
- Pick bets no longer reuse the jackpot ticket's tier prizes. Pick 3 previously paid ₱20 at 1 in 574, which made it strictly worse than pick 2 on both odds and payout; no pick bet is dominated now.
- Split the prize panel in two: a jackpot ladder (6/6 down to 3/6, PCSO tier odds) when the jackpot bet is selected, and the pick paytable (5/5 down to 1/1, match-all odds) otherwise. The single mixed table stated two different odds models in one column.

- Added a colour theme system: `src/styles/default.css` is the default token set, with Doom and Soft Pop selectable from the header, plus a light/dark toggle. The choice persists and is applied before first paint, so it never flashes.
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
