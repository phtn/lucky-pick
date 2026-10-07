# LUCKY PICK

Historical results are maintained as CSV files in `public/results/`. `bun run
dev` and `bun run build` parse them with Papa Parse, validate each record, and
generate one JSON dataset per game in `public/results/generated/`. These
generated files are ignored by Git. The Results tab loads and caches only the
selected game's data, with all valid records available for search and pagination.

The Results tab's **Deep dive** drawer ranks the top 20 singles, unordered pairs,
and unordered triples from the selected game's full recorded history. It opens
from the right on desktop and from the bottom below 768px. Counts measure draws
containing each group, once per draw, with draw share and last-seen dates. Table
filters and prize-winner counts do not affect these rankings. Records without
winning numbers are omitted from the denominator. Repeated digits are supported
for digit games, with positions ignored; triples are unavailable for 2D.

Dates are normalized to `YYYY-MM-DD`; amounts are stored as integer centavos.
Winning-number text preserves leading zeros and draw order. Missing winning
numbers or winner counts remain unknown. Malformed rows and conflicting or
duplicate draws are excluded and reported with the source filename and line in
the build output and a downloadable data report. The Results tab shows how many
source records were excluded for the selected game.

Run `bun run results:build` after editing CSVs to regenerate the datasets. Run
`bun run results:check` to validate strictly without writing output; it exits
with an error if any records would be excluded. A missing file or invalid header
always stops generation. Raw CSVs remain available for download under `/results/`.

To update every CSV from copied PCSO text, save it to `public/results/raw.txt`
and run `bun run results:import`. Use `--check` for a dry run or pass another text
file path. Each line has a game name, winning numbers, M/D/YYYY date, jackpot,
and winner count, separated by tabs or spaces. Timed game names include `2PM`,
`5PM`, or `9PM`. The importer validates the whole batch, prepends only new draws,
preserves existing rows, and regenerates the JSON datasets. Existing game/date/time
identities are skipped even when their other source fields are invalid.

The **Import results** drawer accepts pasted text or loads `raw.txt`, previews
new and skipped draws, and lets any Firebase-signed-in user save new results to
Convex. Everyone can read these additions without signing in. CSVs remain the
baseline; online additions are merged into Results and Deep dive automatically.
Online imports do not modify deployed static assets. Malformed or conflicting
batches are rejected entirely, and existing draws are never overwritten.

Set `PUBLIC_CONVEX_URL` to the same deployment used by the backend. Authentication
uses the existing Firebase project `lucky-pick-345`. After CSV changes, run
`bun run results:build` before pushing Convex so its generated `csvBaseline.ts`
draw-identity index stays in sync. Run `bun run test` for parser, history, and
authenticated backend checks.
