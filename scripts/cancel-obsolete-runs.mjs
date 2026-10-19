const activeStatuses = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

// Runs on a new branch push, separately from the workflows it may cancel.
export async function cancelObsoleteRuns({ github, context, core }) {
  const { owner, repo } = context.repo;
  const repository = `${owner}/${repo}`.toLowerCase();
  const result = {
    scannedRuns: 0,
    cancelledRunIds: [],
    completedRunIds: [],
    skippedReason: null,
  };
  const finish = () => {
    core.info(JSON.stringify(result));
    return result;
  };

  if (
    context.eventName !== 'push' ||
    !context.ref.startsWith('refs/heads/') ||
    context.payload.deleted ||
    context.payload.repository?.full_name?.toLowerCase() !== repository
  ) {
    result.skippedReason = 'Not a live branch push in this repository';
    return finish();
  }
  if (!Number.isSafeInteger(context.runId) || context.runId <= 0) {
    throw new Error('The cancellation workflow requires its own numeric run ID');
  }

  const branch = context.ref.slice('refs/heads/'.length);
  const stillCurrent = async () => {
    const { data } = await github.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    return data.object.sha === context.sha;
  };
  if (!(await stillCurrent())) {
    result.skippedReason = 'A newer push has already moved this branch';
    return finish();
  }

  const candidates = new Map();
  // Collect every page before changing statuses so cancellation cannot shift
  // pagination. Separate active-status queries avoid scanning completed history.
  for (const status of activeStatuses) {
    for await (const { data } of github.paginate.iterator(
      github.rest.actions.listWorkflowRunsForRepo,
      { owner, repo, branch, status, per_page: 100 },
    )) {
      // Octokit normalizes workflow_runs into response.data for pagination.
      for (const run of data) {
        result.scannedRuns += 1;
        if (
          Number.isSafeInteger(run.id) &&
          run.id > 0 &&
          run.id < context.runId &&
          run.head_sha !== context.sha &&
          run.head_branch === branch &&
          run.repository?.full_name?.toLowerCase() === repository &&
          run.head_repository?.full_name?.toLowerCase() === repository &&
          activeStatuses.has(run.status)
        ) {
          candidates.set(run.id, run);
        }
      }
    }
  }

  for (const run of candidates.values()) {
    // A delayed cancellation job must never act for a superseded push.
    if (!(await stillCurrent())) {
      result.skippedReason = 'A newer push arrived during cancellation';
      break;
    }
    const parameters = { owner, repo, run_id: run.id };
    try {
      await github.rest.actions.cancelWorkflowRun(parameters);
      result.cancelledRunIds.push(run.id);
      core.info(`Requested cancellation of obsolete run ${run.id}`);
    } catch (error) {
      // GitHub documents 409 when cancellation conflicts with run state. Only
      // ignore a race after confirming the run actually finished meanwhile.
      if (error.status !== 409) throw error;
      const { data } = await github.rest.actions.getWorkflowRun(parameters);
      if (data.status !== 'completed') throw error;
      result.completedRunIds.push(run.id);
      core.info(`Obsolete run ${run.id} completed before cancellation`);
    }
  }
  return finish();
}
