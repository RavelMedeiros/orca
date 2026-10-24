import { WorktreeFetchFullHistoryForLocalBaseRef } from '../../../../shared/rpc-contract/worktree-create-params'
import { defineMethod } from '../core'

export const WORKTREE_FETCH_FULL_HISTORY_FOR_LOCAL_BASE_REF_METHOD = defineMethod({
  name: 'worktree.fetchFullHistoryForLocalBaseRef',
  permission: 'workspace',
  params: WorktreeFetchFullHistoryForLocalBaseRef,
  handler: async (params, { runtime }) =>
    runtime.fetchFullHistoryForLocalBaseRef({
      repoSelector: params.repo,
      baseRef: params.baseRef
    })
})
