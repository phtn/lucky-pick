import type { ComponentBody, OctaneNode } from 'octane'
import { lazy } from 'octane'

export type LazyComponent<P> = ((props: P) => OctaneNode) & { displayName?: string }
export const lazyComponent = <P = unknown>(
  load: () => Promise<{ default?: unknown }>
): LazyComponent<P> =>
  lazy(() => load().then((module) => ({ default: module.default as ComponentBody<P> }))) as unknown as LazyComponent<P>

type Component<P = object> = (props: P) => OctaneNode
export type ComponentProps<T> = T extends Component<infer P> ? P : never
export type RefObject<T> = { current: T | null }
