import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { resolveWorktreeDisplayName } from '@/lib/worktree-default-display-name'
import type {
  LocalBaseRefHistoryFetchResult,
  LocalBaseRefRefreshResult
} from '../../../../../../shared/worktree/base-ref-drift-types'
import type { Worktree } from '../../../../../../shared/worktree/types'

type CreatedWorktree = Pick<Worktree, 'id' | 'repoId' | 'displayName' | 'branch' | 'path'>

export type FetchFullHistoryForLocalBaseRef = () => Promise<LocalBaseRefHistoryFetchResult>

export function localBaseRefRefreshFailureDetail(result: LocalBaseRefRefreshResult): string {
  const ownerWorktreePath = result.ownerWorktreePath?.trim()
  switch (result.status) {
    case 'skipped_dirty_worktree':
      // Create already succeeded — guide cleanup + manual base update, not "try again".
      return ownerWorktreePath
        ? translate(
            'auto.store.slices.worktrees.localBaseRefRefreshFailedDetailDirtyNamed',
            'The worktree at {{value0}} (where local {{value1}} is checked out) has uncommitted changes. Commit, stash, or discard those changes, then update local {{value1}} manually.',
            { value0: ownerWorktreePath, value1: result.localBranch }
          )
        : translate(
            'auto.store.slices.worktrees.localBaseRefRefreshFailedDetailDirty',
            'The worktree where local {{value0}} is checked out has uncommitted changes. Commit, stash, or discard those changes, then update local {{value0}} manually.',
            { value0: result.localBranch }
          )
    case 'skipped_not_fast_forward':
      return translate(
        'auto.store.slices.worktrees.localBaseRefRefreshFailedDetailNotFastForward',
        'Local {{value0}} does not exist or cannot be fast-forwarded cleanly from the remote base. Check for local-only commits before updating it manually.',
        { value0: result.localBranch }
      )
    case 'skipped_error':
      return translate(
        'auto.store.slices.worktrees.localBaseRefRefreshFailedDetailError',
        'Git returned an error while updating local {{value0}}. Check the repo for locked refs or unusual worktree state, then update local {{value0}} manually.',
        { value0: result.localBranch }
      )
    case 'updated':
      return ''
  }
}

function toastId(result: LocalBaseRefRefreshResult, createdWorktree?: CreatedWorktree): string {
  return `local-base-ref-refresh-failed:${createdWorktree?.repoId ?? 'unknown'}:${result.localBranch}`
}

/** `origin/main` → `origin`; undefined when the base does not end in the local branch name. */
function remoteNameForBaseRef(result: LocalBaseRefRefreshResult): string | undefined {
  const shortBaseRef = result.baseRef.replace(/^refs\/remotes\//, '')
  const suffix = `/${result.localBranch}`
  return shortBaseRef.endsWith(suffix) && shortBaseRef.length > suffix.length
    ? shortBaseRef.slice(0, -suffix.length)
    : undefined
}

function historyFetchFailureMessage(
  result: Extract<LocalBaseRefHistoryFetchResult, { ok: false }>,
  remote: string | undefined
): string {
  if (result.reason === 'not_remote_base') {
    return translate(
      'auto.store.slices.worktrees.localBaseRefHistoryFetchNoRemote',
      'Orca could not find the remote for this base. Run the command above in a terminal instead.'
    )
  }
  const remoteLabel = remote ?? 'the remote'
  return result.detail
    ? translate(
        'auto.store.slices.worktrees.localBaseRefHistoryFetchFailedDetail',
        'Could not fetch history from {{value0}}: {{value1}}',
        { value0: remoteLabel, value1: result.detail }
      )
    : translate(
        'auto.store.slices.worktrees.localBaseRefHistoryFetchFailed',
        'Could not fetch history from {{value0}}. Check your connection and try again.',
        { value0: remoteLabel }
      )
}

type ShallowHistoryToastProps = {
  result: LocalBaseRefRefreshResult
  worktreeName: string
  id: string
  onFetchFullHistory?: FetchFullHistoryForLocalBaseRef
  createdWorktree?: CreatedWorktree
  error?: string
}

// Why a custom body: sonner's native action slot can't hold the busy state, command hint, or inline retry error.
function ShallowHistoryToastBody(props: ShallowHistoryToastProps): React.JSX.Element {
  const { result, worktreeName, id, onFetchFullHistory, createdWorktree, error } = props
  const [fetching, setFetching] = useState(false)
  const remote = remoteNameForBaseRef(result)
  const command = remote ? `git fetch --unshallow ${remote}` : 'git fetch --unshallow'

  const fetchFullHistory = (): void => {
    if (!onFetchFullHistory || fetching) {
      return
    }
    setFetching(true)
    void onFetchFullHistory()
      .catch((): LocalBaseRefHistoryFetchResult => ({ ok: false, reason: 'fetch_failed' }))
      .then((outcome) => {
        if (!outcome.ok) {
          setFetching(false)
          // Why re-issue: sonner measures height only when the toast's content prop changes.
          showShallowHistoryToast({ ...props, error: historyFetchFailureMessage(outcome, remote) })
          return
        }
        toast.dismiss(id)
        if (outcome.refresh && outcome.refresh.status !== 'updated') {
          // Full history can reveal real local-only commits; report that, not the shallow cause.
          showLocalBaseRefRefreshToast(outcome.refresh, createdWorktree)
          return
        }
        toast.success(
          translate(
            'auto.store.slices.worktrees.localBaseRefHistoryFetchSucceeded',
            'Local {{value0}} is up to date',
            { value0: result.localBranch }
          ),
          {
            description: translate(
              'auto.store.slices.worktrees.localBaseRefHistoryFetchSucceededDescription',
              'Fetched the full history, so new workspaces will keep local {{value0}} current.',
              { value0: result.localBranch }
            )
          }
        )
      })
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <p className="text-sm leading-5 text-popover-foreground/80">
        {worktreeName
          ? translate(
              'auto.store.slices.worktrees.localBaseRefShallowHistoryNamed',
              '"{{value0}}" is ready and based on {{value1}}. Local {{value2}} was left alone because this clone only has recent history, so Git cannot confirm it is just behind. Fetch the full history once to fix this for every new workspace.',
              { value0: worktreeName, value1: result.baseRef, value2: result.localBranch }
            )
          : translate(
              'auto.store.slices.worktrees.localBaseRefShallowHistory',
              'Your workspace is ready and based on {{value0}}. Local {{value1}} was left alone because this clone only has recent history, so Git cannot confirm it is just behind. Fetch the full history once to fix this for every new workspace.',
              { value0: result.baseRef, value1: result.localBranch }
            )}
      </p>
      <p className="text-xs leading-4 text-muted-foreground">
        {translate('auto.store.slices.worktrees.localBaseRefShallowHistoryCommand', 'Runs')}{' '}
        <code className="rounded bg-accent px-1 py-px font-mono text-[11px] [overflow-wrap:anywhere]">
          {command}
        </code>
        {'. '}
        {translate(
          'auto.store.slices.worktrees.localBaseRefShallowHistoryDuration',
          'Large repositories can take a few minutes.'
        )}
      </p>
      {error ? (
        <p role="alert" className="text-xs leading-4 text-destructive [overflow-wrap:anywhere]">
          {error}
        </p>
      ) : null}
      {onFetchFullHistory ? (
        <div className="flex justify-end">
          <Button size="sm" onClick={fetchFullHistory} disabled={fetching}>
            {fetching ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {fetching
              ? translate(
                  'auto.store.slices.worktrees.localBaseRefHistoryFetching',
                  'Fetching history…'
                )
              : error
                ? translate(
                    'auto.store.slices.worktrees.localBaseRefHistoryFetchRetry',
                    'Try again'
                  )
                : translate(
                    'auto.store.slices.worktrees.localBaseRefHistoryFetch',
                    'Fetch full history'
                  )}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function showShallowHistoryToast(props: ShallowHistoryToastProps): void {
  toast.warning(
    translate(
      'auto.store.slices.worktrees.localBaseRefShallowHistoryTitle',
      'Local {{value0}} not updated: shallow clone',
      { value0: props.result.localBranch }
    ),
    {
      id: props.id,
      description: <ShallowHistoryToastBody {...props} />,
      duration: Infinity,
      dismissible: true
    }
  )
}

export function showLocalBaseRefRefreshToast(
  result: LocalBaseRefRefreshResult | undefined,
  createdWorktree?: CreatedWorktree,
  onFetchFullHistory?: FetchFullHistoryForLocalBaseRef
): void {
  if (!result || result.status === 'updated') {
    return
  }

  const worktreeName = createdWorktree ? resolveWorktreeDisplayName(createdWorktree).trim() : ''
  const id = toastId(result, createdWorktree)

  if (result.shallowHistory) {
    showShallowHistoryToast({ result, worktreeName, id, onFetchFullHistory, createdWorktree })
    return
  }

  const detail = localBaseRefRefreshFailureDetail(result)

  // Why: Infinity so create-time failures aren't buried; one id per repo and branch because creates toward one target share a run, so its result is one fact, not one per create.
  toast.warning(
    worktreeName
      ? translate(
          'auto.store.slices.worktrees.localBaseRefRefreshFailedForWorktree',
          'Local {{value0}} was not refreshed for "{{value1}}"',
          { value0: result.localBranch, value1: worktreeName }
        )
      : translate('auto.store.slices.worktrees.14bc053a47', 'Local {{value0}} was not refreshed', {
          value0: result.localBranch
        }),
    {
      id,
      description: worktreeName
        ? translate(
            'auto.store.slices.worktrees.localBaseRefRefreshFailedDescriptionNamed',
            'Workspace "{{value0}}" was created from {{value1}}, but Orca could not fast-forward local {{value2}}. {{value3}}',
            {
              value0: worktreeName,
              value1: result.baseRef,
              value2: result.localBranch,
              value3: detail
            }
          )
        : translate(
            'auto.store.slices.worktrees.903b51c2ed',
            'Workspace created from {{value0}}, but Orca could not fast-forward local {{value1}}. {{value2}}',
            { value0: result.baseRef, value1: result.localBranch, value2: detail }
          ),
      duration: Infinity,
      dismissible: true
    }
  )
}
