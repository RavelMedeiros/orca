import type {
  BrowserPage,
  BrowserViewportPresetId
} from '../../../../../shared/browser-workspace-types'

export type BrowserResponsivePairStoreState = {
  browserPagesByWorkspace: Record<string, readonly BrowserPage[]>
  setBrowserPageUrl: (pageId: string, url: string) => void
  setBrowserPageViewportPreset: (pageId: string, presetId: BrowserViewportPresetId | null) => void
}

export type BrowserResponsivePairStore = {
  getState: () => BrowserResponsivePairStoreState
  subscribe: (
    listener: (
      state: BrowserResponsivePairStoreState,
      prev: BrowserResponsivePairStoreState
    ) => void
  ) => () => void
}

type PairedPage = {
  partnerPageId: string
  workspaceId: string
  pendingPresetId: BrowserViewportPresetId | null
  pushedUrl: string | null
  pushedAt: number
}

// Why: a page that redirects right after we push a URL into it (auth, trailing slash, mobile
// site) must not bounce that redirect back into its partner.
export const BROWSER_RESPONSIVE_REDIRECT_WINDOW_MS = 2000

const pairs = new Map<string, PairedPage>()
let unsubscribe: (() => void) | null = null

function findPage(
  pagesByWorkspace: Record<string, readonly BrowserPage[]>,
  workspaceId: string,
  pageId: string
): BrowserPage | null {
  return pagesByWorkspace[workspaceId]?.find((page) => page.id === pageId) ?? null
}

function unpair(pageId: string): void {
  const entry = pairs.get(pageId)
  pairs.delete(pageId)
  if (entry) {
    pairs.delete(entry.partnerPageId)
  }
  if (pairs.size === 0) {
    unsubscribe?.()
    unsubscribe = null
  }
}

function syncPairs(
  state: BrowserResponsivePairStoreState,
  prev: BrowserResponsivePairStoreState,
  now: number
): void {
  if (state.browserPagesByWorkspace === prev.browserPagesByWorkspace) {
    return
  }
  for (const [pageId, entry] of pairs) {
    if (!pairs.has(pageId)) {
      continue
    }
    const page = findPage(state.browserPagesByWorkspace, entry.workspaceId, pageId)
    if (!page) {
      const existed = findPage(prev.browserPagesByWorkspace, entry.workspaceId, pageId)
      // Why: a page created through main can land a few commits after its tab, so only a page
      // that was there and left (its tab closed) breaks the pair.
      if (existed || entry.pendingPresetId === null) {
        unpair(pageId)
      }
      continue
    }
    if (entry.pendingPresetId !== null) {
      const presetId = entry.pendingPresetId
      entry.pendingPresetId = null
      if (page.viewportPresetId !== presetId) {
        state.setBrowserPageViewportPreset(pageId, presetId)
      }
    }
    const prevUrl = findPage(prev.browserPagesByWorkspace, entry.workspaceId, pageId)?.url
    if (prevUrl === undefined || prevUrl === page.url) {
      continue
    }
    if (
      page.url === entry.pushedUrl ||
      now - entry.pushedAt < BROWSER_RESPONSIVE_REDIRECT_WINDOW_MS
    ) {
      continue
    }
    const partner = pairs.get(entry.partnerPageId)
    if (!partner) {
      continue
    }
    const partnerPage = findPage(
      state.browserPagesByWorkspace,
      partner.workspaceId,
      entry.partnerPageId
    )
    if (!partnerPage || partnerPage.url === page.url) {
      continue
    }
    partner.pushedUrl = page.url
    partner.pushedAt = now
    state.setBrowserPageUrl(entry.partnerPageId, page.url)
  }
}

/** Keeps two browser pages on the same URL: navigating either one navigates the other. */
export function pairBrowserResponsivePages(
  store: BrowserResponsivePairStore,
  primary: { pageId: string; workspaceId: string },
  secondary: {
    pageId: string
    workspaceId: string
    viewportPresetId: BrowserViewportPresetId
  },
  now: () => number = Date.now
): void {
  unpair(primary.pageId)
  unpair(secondary.pageId)
  pairs.set(primary.pageId, {
    partnerPageId: secondary.pageId,
    workspaceId: primary.workspaceId,
    pendingPresetId: null,
    pushedUrl: null,
    pushedAt: 0
  })
  const secondaryEntry: PairedPage = {
    partnerPageId: primary.pageId,
    workspaceId: secondary.workspaceId,
    pendingPresetId: secondary.viewportPresetId,
    pushedUrl: null,
    pushedAt: 0
  }
  pairs.set(secondary.pageId, secondaryEntry)
  const state = store.getState()
  if (findPage(state.browserPagesByWorkspace, secondary.workspaceId, secondary.pageId)) {
    secondaryEntry.pendingPresetId = null
    state.setBrowserPageViewportPreset(secondary.pageId, secondary.viewportPresetId)
  }
  unsubscribe ??= store.subscribe((next, prev) => syncPairs(next, prev, now()))
}

export function resetBrowserResponsivePairsForTests(): void {
  pairs.clear()
  unsubscribe?.()
  unsubscribe = null
}
