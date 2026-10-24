import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPage } from '../../../../../shared/browser-workspace-types'
import {
  BROWSER_RESPONSIVE_REDIRECT_WINDOW_MS,
  pairBrowserResponsivePages,
  resetBrowserResponsivePairsForTests,
  type BrowserResponsivePairStore,
  type BrowserResponsivePairStoreState
} from './browser-responsive-pair'

function page(id: string, workspaceId: string, url: string): BrowserPage {
  return {
    id,
    workspaceId,
    worktreeId: 'wt',
    url,
    title: url,
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 0
  }
}

function createStore(initial: Record<string, BrowserPage[]>) {
  let clock = 10_000
  const listeners = new Set<
    (s: BrowserResponsivePairStoreState, p: BrowserResponsivePairStoreState) => void
  >()
  let state: BrowserResponsivePairStoreState
  const setPages = (next: Record<string, BrowserPage[]>): void => {
    const prev = state
    state = { ...state, browserPagesByWorkspace: next }
    listeners.forEach((listener) => listener(state, prev))
  }
  const updatePage = (pageId: string, patch: Partial<BrowserPage>): void => {
    setPages(
      Object.fromEntries(
        Object.entries(state.browserPagesByWorkspace).map(([workspaceId, pages]) => [
          workspaceId,
          pages.map((entry) => (entry.id === pageId ? { ...entry, ...patch } : entry))
        ])
      )
    )
  }
  const setBrowserPageUrl = vi.fn((pageId: string, url: string) => updatePage(pageId, { url }))
  const setBrowserPageViewportPreset = vi.fn(
    (pageId: string, viewportPresetId: BrowserPage['viewportPresetId']) =>
      updatePage(pageId, { viewportPresetId })
  )
  state = {
    browserPagesByWorkspace: initial,
    setBrowserPageUrl,
    setBrowserPageViewportPreset
  }
  const store: BrowserResponsivePairStore = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
  return {
    store,
    now: () => clock,
    advance: (ms: number) => {
      clock += ms
    },
    setPages,
    navigate: (pageId: string, url: string) => updatePage(pageId, { url }),
    urlOf: (pageId: string) =>
      Object.values(state.browserPagesByWorkspace)
        .flat()
        .find((entry) => entry.id === pageId)?.url,
    setBrowserPageUrl,
    setBrowserPageViewportPreset
  }
}

const desktop = { pageId: 'desktop', workspaceId: 'ws-desktop' }
const mobile = {
  pageId: 'mobile',
  workspaceId: 'ws-mobile',
  viewportPresetId: 'mobile-m' as const
}

describe('pairBrowserResponsivePages', () => {
  afterEach(() => resetBrowserResponsivePairsForTests())

  it('navigates each page when its partner navigates, without echoing back', () => {
    const rig = createStore({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')],
      'ws-mobile': [page('mobile', 'ws-mobile', 'http://localhost:3000/')]
    })
    pairBrowserResponsivePages(rig.store, desktop, mobile, rig.now)
    expect(rig.setBrowserPageViewportPreset).toHaveBeenCalledWith('mobile', 'mobile-m')

    rig.navigate('desktop', 'http://localhost:3000/login')
    expect(rig.urlOf('mobile')).toBe('http://localhost:3000/login')
    expect(rig.setBrowserPageUrl).toHaveBeenCalledTimes(1)

    rig.advance(BROWSER_RESPONSIVE_REDIRECT_WINDOW_MS)
    rig.navigate('mobile', 'http://localhost:3000/cart')
    expect(rig.urlOf('desktop')).toBe('http://localhost:3000/cart')
    expect(rig.setBrowserPageUrl).toHaveBeenCalledTimes(2)
  })

  it('keeps a redirect right after a pushed navigation on its own page', () => {
    const rig = createStore({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')],
      'ws-mobile': [page('mobile', 'ws-mobile', 'http://localhost:3000/')]
    })
    pairBrowserResponsivePages(rig.store, desktop, mobile, rig.now)

    rig.navigate('desktop', 'http://localhost:3000/app')
    rig.advance(300)
    rig.navigate('mobile', 'http://localhost:3000/m/app')
    expect(rig.urlOf('desktop')).toBe('http://localhost:3000/app')
  })

  it('stops syncing once either page closes', () => {
    const rig = createStore({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')],
      'ws-mobile': [page('mobile', 'ws-mobile', 'http://localhost:3000/')]
    })
    pairBrowserResponsivePages(rig.store, desktop, mobile, rig.now)

    rig.setPages({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')]
    })
    rig.navigate('desktop', 'http://localhost:3000/about')
    expect(rig.setBrowserPageUrl).not.toHaveBeenCalled()
  })

  it('applies the mobile viewport once a late-created page appears', () => {
    const rig = createStore({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')]
    })
    pairBrowserResponsivePages(rig.store, desktop, mobile, rig.now)
    expect(rig.setBrowserPageViewportPreset).not.toHaveBeenCalled()

    rig.setPages({
      'ws-desktop': [page('desktop', 'ws-desktop', 'http://localhost:3000/')],
      'ws-mobile': [page('mobile', 'ws-mobile', 'http://localhost:3000/')]
    })
    expect(rig.setBrowserPageViewportPreset).toHaveBeenCalledWith('mobile', 'mobile-m')
  })
})
