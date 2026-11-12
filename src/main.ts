import { createElement, createRoot } from 'octane'
import { RouterProvider } from '@octanejs/tanstack-router'
import { router } from './lib/routing/router'
import './style.css'

const container = document.getElementById('app')
if (container === null) throw new Error('Missing #app container.')

createRoot(container).render(() => createElement(RouterProvider, { router }))
