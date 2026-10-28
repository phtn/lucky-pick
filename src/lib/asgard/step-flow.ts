/**
 * The shared vocabulary of the console's step pipelines.
 *
 * The tones and the motion live here rather than inside a component because
 * `.btsx` modules cannot export to one another, which is why this is a `.ts`
 * sibling.
 */

/**
 * A step is `done` once the operator has settled it, `active` while it is the
 * one thing left to do, and `idle` while an earlier step still blocks it.
 */
export type StepState = 'idle' | 'active' | 'done'

export const STEP_TILE_CLASS = {
  idle: 'border border-border/40 bg-muted/40 text-muted-foreground/50',
  active: 'bg-active text-white shadow-[0_1px_2px_-1px_var(--color-active)]',
  done: 'border border-[#01bf7c]/96 bg-[#01bf7c]/96 text-white'
} as const satisfies Record<StepState, string>

export const STEP_TITLE_CLASS = {
  idle: 'text-muted-foreground/50',
  active: 'text-foreground',
  done: 'text-foreground'
} as const satisfies Record<StepState, string>

/**
 * Settling one step usually settles the ones after it in the same frame. The
 * stagger spreads that into a run down the rail so the operator sees the
 * pipeline advance rather than a column of tiles flipping at once.
 */
export const STEP_FLOW_MS = 110

/**
 * Every branch that swaps in when a step settles enters the same way, so the
 * pipeline reads as one motion rather than several unrelated ones.
 */
export const ENTER_CLASS = 'animate-in fade-in-0 slide-in-from-top-1 duration-300 ease-out motion-reduce:animate-none'

export const fieldLabelClassName = 'font-mono text-2xs uppercase tracking-[0.14em] text-muted-foreground'
export const errorTextClassName = 'font-mono text-2xs text-destructive'
