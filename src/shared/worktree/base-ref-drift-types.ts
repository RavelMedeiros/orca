export type LocalBaseRefRefreshResult = {
  status: 'updated' | 'skipped_dirty_worktree' | 'skipped_not_fast_forward' | 'skipped_error'
  baseRef: string
  localBranch: string
  ownerWorktreePath?: string
  /** A shallow clone hides the shared history, so Git cannot prove local is only behind. */
  shallowHistory?: true
}

// Why: downloading a clone's missing history is far larger than a routine fetch.
export const LOCAL_BASE_REF_HISTORY_FETCH_TIMEOUT_MS = 10 * 60_000
// Covers the host's fetch budget plus its bounded fast-forward wait.
export const LOCAL_BASE_REF_HISTORY_FETCH_REPLY_TIMEOUT_MS =
  LOCAL_BASE_REF_HISTORY_FETCH_TIMEOUT_MS + 60_000

export type LocalBaseRefHistoryFetchResult =
  | { ok: true; refresh?: LocalBaseRefRefreshResult }
  | { ok: false; reason: 'not_remote_base' | 'fetch_failed'; detail?: string }

export type LocalBaseRefUpdateSuggestion = {
  baseRef: string
  localBranch: string
  behind: number
}

export type WorktreeBaseStatusKind = 'checking' | 'current' | 'drift' | 'base_changed' | 'unknown'

export type WorktreeBaseStatusEvent = {
  repoId: string
  worktreeId: string
  status: WorktreeBaseStatusKind
  base: string
  /** Configured remote name parsed from `base` (longest-prefix match). Absent
   *  when classification skipped optimistic reconcile (e.g. legacy fallback). */
  remote?: string
  behind?: number
  recentSubjects?: string[]
}

export type WorktreeRemoteBranchConflictEvent = {
  repoId: string
  worktreeId: string
  remote: string
  branchName: string
}
