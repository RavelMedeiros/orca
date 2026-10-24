import { callRuntimeRpc } from '../../../../runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../../../shared/runtime-client-target'
import {
  LOCAL_BASE_REF_HISTORY_FETCH_REPLY_TIMEOUT_MS,
  type LocalBaseRefHistoryFetchResult
} from '../../../../../../shared/worktree/base-ref-drift-types'

/** Routes to the host that created the workspace; only that host reports shallow history. */
export function fetchFullHistoryForLocalBaseRef(
  target: RuntimeClientTarget,
  repoId: string,
  baseRef: string
): Promise<LocalBaseRefHistoryFetchResult> {
  return target.kind === 'local'
    ? window.api.worktrees.fetchFullHistoryForLocalBaseRef({ repoId, baseRef })
    : callRuntimeRpc<LocalBaseRefHistoryFetchResult>(
        target,
        'worktree.fetchFullHistoryForLocalBaseRef',
        { repo: repoId, baseRef },
        { timeoutMs: LOCAL_BASE_REF_HISTORY_FETCH_REPLY_TIMEOUT_MS }
      )
}
