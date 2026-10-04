import { describe, expect, test } from 'bun:test'
import { iconMarkup, icons, type IconName } from './icons'

describe('icon registry', () => {
  test('includes icons required by account switchers and dropdown menus', () => {
    const required: IconName[] = [
      'person', 'account', 'key', 'goog', 'signout', 'circle-plus',
      'select-caret', 'check', 'plus', 'chevrons-right',
    ]
    for (const name of required) {
      expect(iconMarkup(name, 'account-menu')).toBeString()
      expect(icons[name].length).toBeGreaterThan(0)
    }
  })

  test('every registered icon renders with instance-scoped SVG definitions', () => {
    for (const name of Object.keys(icons) as IconName[]) {
      const markup = iconMarkup(name, 'first')
      expect(markup.length).toBeGreaterThan(0)
      if (markup.includes('id="')) {
        expect(iconMarkup(name, 'second')).not.toBe(markup)
      }
    }
  })
})
