export type ThemeId = 'default' | 'doom' | 'soft-pop'
export type ThemeMode = 'light' | 'dark'

export interface ThemeOption {
  id: ThemeId
  name: string
  blurb: string
}

/** Registering a theme here is the last step; the token file in src/styles
 *  scopes itself to [data-theme='<id>'] and style.css imports it. */
export const THEMES: ThemeOption[] = [
  { id: 'default', name: 'Default', blurb: 'Quiet sage and cream' },
  { id: 'doom', name: 'Doom', blurb: 'Hard red, square edges' },
  { id: 'soft-pop', name: 'Soft Pop', blurb: 'Violet, round, loud' },
]

export const DEFAULT_THEME: ThemeId = 'default'
export const DEFAULT_MODE: ThemeMode = 'dark'

const STORAGE_KEY = 'lucky-pick:theme'

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some(t => t.id === value)
}

export interface ThemeState {
  theme: ThemeId
  mode: ThemeMode
}

/** Storage can throw in private mode, so every read and write is guarded. */
export function readStoredTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeState>
      return {
        theme: isThemeId(parsed.theme) ? parsed.theme : DEFAULT_THEME,
        mode: parsed.mode === 'light' ? 'light' : 'dark',
      }
    }
  } catch {}
  return { theme: DEFAULT_THEME, mode: DEFAULT_MODE }
}

export function storeTheme(state: ThemeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

export function applyTheme({ theme, mode }: ThemeState) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
}
