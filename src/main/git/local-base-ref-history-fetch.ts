import {
  LOCAL_BASE_REF_HISTORY_FETCH_TIMEOUT_MS,
  type LocalBaseRefHistoryFetchResult
} from '../../shared/worktree/base-ref-drift-types'
import { normalizeRuntimePathForComparison } from '../../shared/cross-platform-path'
import { readGitCommandFailureStderr } from '../../shared/git-command-failure-text'
import { gitExecFileAsync } from './runner'
import { runWithGitReadCacheInvalidation } from './status'
import { refreshLocalBaseRefForWorktreeCreate } from './worktree-base-refresh'

const FAILURE_DETAIL_MAX_CHARS = 300

type HistoryFetchGitOptions = { wslDistro?: string }
type RemoteTrackingBase = { remote: string; branch: string; ref: string; base: string }

const inflightByRepo = new Map<string, Promise<LocalBaseRefHistoryFetchResult>>()

/** Completes a shallow clone's history from the base's remote, then retries the local fast-forward. */
export function fetchFullHistoryAndRefreshLocalBaseRef(args: {
  repoPath: string
  baseRef: string
  gitOptions: HistoryFetchGitOptions
  resolveRemoteTrackingBase: (
    repoPath: string,
    baseRef: string,
    gitOptions?: HistoryFetchGitOptions
  ) => Promise<RemoteTrackingBase | null>
}): Promise<LocalBaseRefHistoryFetchResult> {
  const key = `${args.gitOptions.wslDistro ?? ''}\0${normalizeRuntimePathForComparison(args.repoPath)}\0${args.baseRef}`
  const existing = inflightByRepo.get(key)
  if (existing) {
    return existing
  }
  const run = fetchAndRefresh(args).finally(() => inflightByRepo.delete(key))
  inflightByRepo.set(key, run)
  return run
}

async function fetchAndRefresh(
  args: Parameters<typeof fetchFullHistoryAndRefreshLocalBaseRef>[0]
): Promise<LocalBaseRefHistoryFetchResult> {
  const { repoPath, baseRef, gitOptions } = args
  // Why: resolving against configured remotes keeps a client from steering fetch at a URL.
  const base = await args.resolveRemoteTrackingBase(repoPath, baseRef, gitOptions)
  if (!base) {
    return { ok: false, reason: 'not_remote_base' }
  }
  const execOptions = { cwd: repoPath, ...gitOptions }
  try {
    const { stdout } = await gitExecFileAsync(['rev-parse', '--is-shallow-repository'], execOptions)
    // Why: the user may have deepened it already; `--unshallow` rejects a complete repository.
    if (stdout.trim() === 'true') {
      await runWithGitReadCacheInvalidation(() =>
        gitExecFileAsync(['fetch', '--unshallow', base.remote], {
          ...execOptions,
          timeout: LOCAL_BASE_REF_HISTORY_FETCH_TIMEOUT_MS
        })
      )
    }
  } catch (error) {
    return { ok: false, reason: 'fetch_failed', detail: summarizeGitFailure(error) }
  }
  const refresh = await refreshLocalBaseRefForWorktreeCreate(
    repoPath,
    baseRef,
    base.ref,
    base,
    gitOptions
  )
  return refresh ? { ok: true, refresh } : { ok: true }
}

// Why the first fatal/error line: Git ends network failures with generic advice lines.
function summarizeGitFailure(error: unknown): string | undefined {
  const text = readGitCommandFailureStderr(error) ?? (error instanceof Error ? error.message : '')
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const line = lines.find((candidate) => /^(fatal|error):/i.test(candidate)) ?? lines[0]
  return line?.replace(/^(fatal|error):\s*/i, '').slice(0, FAILURE_DETAIL_MAX_CHARS) || undefined
}
