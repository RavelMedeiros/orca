import { useAppStore } from '@/store'
import type {
  BrowserPage,
  BrowserViewportPresetId
} from '../../../../../shared/browser-workspace-types'
import { pairBrowserResponsivePages } from './browser-responsive-pair'

export const BROWSER_RESPONSIVE_MOBILE_PRESET_ID: BrowserViewportPresetId = 'mobile-m'

// Why local only: remote and streamed pages are created through their runtime, not createBrowserTab.
export function canOpenBrowserResponsiveSplit(page: BrowserPage | null | undefined): boolean {
  return !!page && !page.browserRuntimeEnvironmentId && !page.remoteBrowserPageId
}

/** Opens the page again in a split to the right at a mobile viewport, navigating in step with it. */
export function openBrowserResponsiveSplit(browserPageId: string): void {
  const state = useAppStore.getState()
  const page = Object.values(state.browserPagesByWorkspace)
    .flat()
    .find((entry) => entry.id === browserPageId)
  if (!page || !canOpenBrowserResponsiveSplit(page)) {
    return
  }
  const workspace = state.browserTabsByWorktree[page.worktreeId]?.find(
    (entry) => entry.id === page.workspaceId
  )
  const unifiedTab = state.unifiedTabsByWorktree[page.worktreeId]?.find(
    (tab) => tab.contentType === 'browser' && tab.entityId === page.workspaceId
  )
  if (!workspace || !unifiedTab) {
    return
  }
  // Why the same profile: the mobile copy must share the desktop page's cookies and logins.
  const mobileTab = state.createBrowserTab(page.worktreeId, page.url, {
    split: {
      sourceGroupId: unifiedTab.groupId,
      splitDirection: 'right',
      activate: false
    },
    activate: true,
    sessionProfileId: workspace.sessionProfileId ?? null,
    sessionPartition: workspace.sessionPartition ?? null,
    ...(unifiedTab.executionHostId ? { executionHostId: unifiedTab.executionHostId } : {}),
    ...(page.docLocation ? { docLocation: page.docLocation } : {})
  })
  if (!mobileTab.activePageId) {
    return
  }
  pairBrowserResponsivePages(
    useAppStore,
    { pageId: page.id, workspaceId: page.workspaceId },
    {
      pageId: mobileTab.activePageId,
      workspaceId: mobileTab.id,
      viewportPresetId: BROWSER_RESPONSIVE_MOBILE_PRESET_ID
    }
  )
}
