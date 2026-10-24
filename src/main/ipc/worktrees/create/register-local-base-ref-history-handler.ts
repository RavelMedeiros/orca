import { ipcMain } from 'electron'
import type { LocalBaseRefHistoryFetchResult } from '../../../../shared/worktree/base-ref-drift-types'
import type { WorktreeIpcContext } from '../worktree-ipc-context'

export function registerLocalBaseRefHistoryHandler(context: WorktreeIpcContext): void {
  ipcMain.handle(
    'worktrees:fetchFullHistoryForLocalBaseRef',
    async (
      _event,
      args: { repoId: string; baseRef: string }
    ): Promise<LocalBaseRefHistoryFetchResult> =>
      context.runtime.fetchFullHistoryForLocalBaseRef({
        repoSelector: args.repoId,
        baseRef: args.baseRef
      })
  )
}
