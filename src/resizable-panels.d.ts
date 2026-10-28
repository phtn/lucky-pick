declare module '@octanejs/resizable-panels' {
  import type { ComponentBody, OctaneNode } from 'octane'
  import type { Octane } from 'octane/jsx-runtime'

  export type Orientation = 'horizontal' | 'vertical'
  export type Layout = Record<string, number>
  export type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>
  export type LayoutChangedMeta = { isUserInteraction: boolean }

  export interface GroupImperativeHandle {
    getLayout(): Layout
    setLayout(layout: Layout): Layout
  }

  type GroupDivProps = Omit<Octane.JSX.IntrinsicElements['div'], 'children' | 'id' | 'ref' | 'style'>

  export type GroupProps = GroupDivProps & {
    children?: OctaneNode
    defaultLayout?: Layout
    disableCursor?: boolean
    disabled?: boolean
    elementRef?: Octane.Ref<HTMLDivElement | null>
    groupRef?: Octane.Ref<GroupImperativeHandle | null>
    id?: string | number
    onLayoutChange?: (layout: Layout) => void
    onLayoutChanged?: (layout: Layout, meta: LayoutChangedMeta) => void
    orientation?: Orientation
    resizeTargetMinimumSize?: { coarse: number; fine: number }
    style?: Octane.JSX.IntrinsicElements['div']['style']
  }

  export const Group: ComponentBody<GroupProps>

  export type GroupResizeBehavior = 'preserve-relative-size' | 'preserve-pixel-size'
  export type PanelSize = { asPercentage: number; inPixels: number }
  export type SizeUnit = 'px' | '%' | 'em' | 'rem' | 'vh' | 'vw'

  export interface PanelImperativeHandle {
    collapse(): void
    expand(): void
    getSize(): PanelSize
    isCollapsed(): boolean
    resize(size: number | string): void
  }

  type PanelDivProps = Omit<Octane.JSX.IntrinsicElements['div'], 'children' | 'id' | 'ref' | 'onResize' | 'style'>

  export type PanelProps = PanelDivProps & {
    children?: OctaneNode
    collapsedSize?: number | string
    collapsible?: boolean
    defaultSize?: number | string
    disabled?: boolean
    elementRef?: Octane.Ref<HTMLDivElement | null>
    groupResizeBehavior?: GroupResizeBehavior
    id?: string | number
    maxSize?: number | string
    minSize?: number | string
    onResize?: (size: PanelSize, id: string | number | undefined, previousSize: PanelSize | undefined) => void
    panelRef?: Octane.Ref<PanelImperativeHandle | null>
    style?: Octane.JSX.IntrinsicElements['div']['style']
  }

  export const Panel: ComponentBody<PanelProps>

  type SeparatorDivProps = Omit<
    Octane.JSX.IntrinsicElements['div'],
    'children' | 'id' | 'ref' | 'role' | 'tabIndex' | 'style'
  >

  export type SeparatorProps = SeparatorDivProps & {
    children?: OctaneNode
    disabled?: boolean
    disableDoubleClick?: boolean
    elementRef?: Octane.Ref<HTMLDivElement | null>
    id?: string | number
    style?: Octane.JSX.IntrinsicElements['div']['style']
  }

  export const Separator: ComponentBody<SeparatorProps>

  export function useGroupCallbackRef(): [
    GroupImperativeHandle | null,
    (
      next: GroupImperativeHandle | null | ((previous: GroupImperativeHandle | null) => GroupImperativeHandle | null)
    ) => void,
    () => GroupImperativeHandle | null
  ]
  export function useGroupRef(): { current: GroupImperativeHandle | null }
  export function usePanelCallbackRef(): [
    PanelImperativeHandle | null,
    (
      next: PanelImperativeHandle | null | ((previous: PanelImperativeHandle | null) => PanelImperativeHandle | null)
    ) => void,
    () => PanelImperativeHandle | null
  ]
  export function usePanelRef(): { current: PanelImperativeHandle | null }

  export function useDefaultLayout(
    options: {
      debounceSaveMs?: number
      onlySaveAfterUserInteractions?: boolean
      panelIds?: string[]
      storage?: LayoutStorage
    } & ({ groupId: string } | { id: string })
  ): {
    defaultLayout: Layout | undefined
    onLayoutChange: (layout: Layout) => void
    onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
  }

  export function isCoarsePointer(): boolean
}
