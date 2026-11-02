/**
 * Type-level only: no runtime export, nothing imports this, and nothing should.
 * It exists so `bun run typecheck:ts` fails the moment the stored shape and the
 * shape the page reads stop agreeing.
 *
 * `plays.q.mine` returns `Doc<'practicePlays'>` rows, and `profile-page.btsx`
 * hands them straight to `readPracticeStats` as `PracticePlayRow`, which is
 * declared from the writer's input instead of from the schema. That assignment
 * crosses the Convex boundary and is checked nowhere else: rsbuild strips types
 * without checking them and `bun test` does too, so a field renamed on one side
 * would ship and only surface as an empty figure on the dashboard.
 */
import type { Doc } from '../../../convex/_generated/dataModel'
import type { PracticePlayRow } from './record'

/** Compiles only while `Source` is assignable to `Target`. */
type Assignable<Source extends Target, Target> = Source

/**
 * A stored row is readable as a `PracticePlayRow`. `userId` is extra on the
 * document and that is fine: the page has no use for its own id.
 */
type StoredRowIsAPracticePlayRow = Assignable<Doc<'practicePlays'>, PracticePlayRow>

/**
 * ...and the fields the page actually reads carry the document's own types, so
 * the two cannot agree merely by one of them having widened to `any`.
 */
type PageReadsTheStoredFields = Assignable<
  Pick<StoredRowIsAPracticePlayRow, 'game' | 'mode' | 'isOfficial' | 'drawnBalls' | 'ticketCount' | 'spent' | 'won' | 'winCount' | 'bestHits' | 'drawnAt'>,
  Pick<PracticePlayRow, 'game' | 'mode' | 'isOfficial' | 'drawnBalls' | 'ticketCount' | 'spent' | 'won' | 'winCount' | 'bestHits' | 'drawnAt'>
>

/** The capped ticket detail is the other half of what the stats read. */
type StoredTicketDetailIsReadable = Assignable<
  Doc<'practicePlays'>['tickets'][number],
  PracticePlayRow['tickets'][number]
>
