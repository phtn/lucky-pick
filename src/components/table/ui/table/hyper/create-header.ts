import { createElement } from 'octane'

export const createHeader = (header: string) => Object.assign(
  () => createElement('div', { className: 'ps-4 capitalize' }, header),
  { headerText: header }
)
