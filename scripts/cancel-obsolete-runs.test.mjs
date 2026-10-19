import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelObsoleteRuns } from './cancel-obsolete-runs.mjs';

const repository = { full_name: 'vostride/playground' };
const statuses = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];

function run(id, changes = {}) {
  return {
    id,
    head_sha: `old-commit-${id}`,
    head_branch: 'main',
    status: 'in_progress',
    repository,
    head_repository: repository,
    ...changes,
  };
}

function fixture({ pages = {}, tips = ['current'], cancel, getRun } = {}) {
  const calls = { queries: [], cancellations: [], refs: [], reads: [], logs: [] };
  const context = {
    eventName: 'push',
    repo: { owner: 'vostride', repo: 'playground' },
    ref: 'refs/heads/main',
    sha: 'current',
    runId: 1000,
    payload: { repository, deleted: false },
  };
  const github = {
    rest: {
      git: {
        async getRef(parameters) {
          calls.refs.push(parameters);
          return {
            data: { object: { sha: tips[Math.min(calls.refs.length - 1, tips.length - 1)] } },
          };
        },
      },
      actions: {
        listWorkflowRunsForRepo() {},
        async cancelWorkflowRun(parameters) {
          calls.cancellations.push(parameters.run_id);
          if (cancel) await cancel(parameters.run_id);
          return { status: 202 };
        },
        async getWorkflowRun(parameters) {
          calls.reads.push(parameters.run_id);
          return { data: getRun ? await getRun(parameters.run_id) : { status: 'completed' } };
        },
      },
    },
    paginate: {
      async *iterator(method, parameters) {
        assert.equal(method, github.rest.actions.listWorkflowRunsForRepo);
        calls.queries.push(parameters);
        for (const workflow_runs of pages[parameters.status] ?? [[]]) {
          assert.deepEqual(calls.cancellations, [], 'Read every page before cancelling');
          // Match Octokit's normalized iterator, not the raw REST response.
          yield { data: workflow_runs };
        }
      },
    },
  };
  const core = {
    info(message) {
      calls.logs.push(message);
    },
  };
  return { github, context, core, calls };
}

test('cancels older active workflows while preserving all current-commit siblings', async () => {
  const f = fixture({
    pages: {
      queued: [[run(201, { status: 'queued' }), run(202, { head_sha: 'current' })]],
      in_progress: [[run(203), run(204, { head_sha: 'current' })]],
      waiting: [[run(205, { status: 'waiting' })]],
      pending: [[run(206, { status: 'pending' })]],
      requested: [[run(207, { status: 'requested' })]],
    },
  });
  const result = await cancelObsoleteRuns(f);
  assert.deepEqual(result.cancelledRunIds, [201, 203, 205, 206, 207]);
  assert.deepEqual(f.calls.cancellations, result.cancelledRunIds);
  assert.equal(result.scannedRuns, 7);
  assert.equal(result.skippedReason, null);
  assert.deepEqual(
    f.calls.queries.map(({ status }) => status),
    statuses,
  );
  for (const query of f.calls.queries) {
    assert.equal(query.owner, 'vostride');
    assert.equal(query.repo, 'playground');
    assert.equal(query.branch, 'main');
    assert.equal(query.per_page, 100);
  }
});

test('preserves newer runs, its own run, other branches, forks and completed runs', async () => {
  const f = fixture({
    pages: {
      in_progress: [
        [
          run(1001),
          run(1000),
          run(100, { head_branch: 'feature' }),
          run(101, { head_repository: { full_name: 'someone/playground' } }),
          run(102, { repository: { full_name: 'vostride/other' } }),
          run(103, { status: 'completed' }),
          run(104, { head_repository: null }),
          run(105, { repository: null }),
          run('106'),
          run(107, { status: 'unknown' }),
        ],
      ],
    },
  });
  const result = await cancelObsoleteRuns(f);
  assert.deepEqual(result.cancelledRunIds, []);
  assert.equal(result.scannedRuns, 10);
});

test('reads later pages and deduplicates runs that changed active status during listing', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => run(index + 1, { status: 'queued' }));
  const f = fixture({
    pages: {
      queued: [firstPage, [run(101, { status: 'queued' })]],
      in_progress: [[run(101), run(102)]],
    },
  });
  const result = await cancelObsoleteRuns(f);
  assert.equal(result.scannedRuns, 103);
  assert.deepEqual(
    result.cancelledRunIds,
    Array.from({ length: 102 }, (_, index) => index + 1),
  );
});

test('a delayed push canceller does nothing when its commit is no longer the branch tip', async () => {
  const f = fixture({ tips: ['newer'], pages: { in_progress: [[run(10)]] } });
  const result = await cancelObsoleteRuns(f);
  assert.match(result.skippedReason, /newer push/i);
  assert.deepEqual(f.calls.queries, []);
  assert.deepEqual(f.calls.cancellations, []);
});

test('stops before the first cancellation if a new push arrives during listing', async () => {
  const f = fixture({ tips: ['current', 'newer'], pages: { in_progress: [[run(10)]] } });
  const result = await cancelObsoleteRuns(f);
  assert.match(result.skippedReason, /newer push/i);
  assert.deepEqual(f.calls.cancellations, []);
});

test('rechecks the branch tip before each cancellation', async () => {
  const f = fixture({
    tips: ['current', 'current', 'newer'],
    pages: { in_progress: [[run(10), run(11)]] },
  });
  const result = await cancelObsoleteRuns(f);
  assert.deepEqual(result.cancelledRunIds, [10]);
  assert.deepEqual(f.calls.cancellations, [10]);
  assert.match(result.skippedReason, /newer push/i);
  assert.equal(f.calls.refs.length, 3);
});

test('ignores a documented cancellation conflict only when the run is now completed', async () => {
  const f = fixture({
    pages: { in_progress: [[run(10), run(11)]] },
    cancel(id) {
      if (id === 10) throw Object.assign(new Error('Conflict'), { status: 409 });
    },
  });
  const result = await cancelObsoleteRuns(f);
  assert.deepEqual(result.completedRunIds, [10]);
  assert.deepEqual(result.cancelledRunIds, [11]);
  assert.deepEqual(f.calls.reads, [10]);
});

test('does not hide conflicts for active runs, validation failures, permission errors or server failures', async () => {
  for (const status of [409, 422, 403, 500]) {
    const error = Object.assign(new Error(`API failure ${status}`), { status });
    const f = fixture({
      pages: { in_progress: [[run(10)]] },
      cancel() {
        throw error;
      },
      getRun() {
        return { status: 'in_progress' };
      },
    });
    await assert.rejects(cancelObsoleteRuns(f), (actual) => actual === error);
    assert.deepEqual(f.calls.reads, status === 409 ? [10] : []);
  }
});

test('propagates failure to read run state after a cancellation conflict', async () => {
  const readError = Object.assign(new Error('Read forbidden'), { status: 403 });
  const f = fixture({
    pages: { in_progress: [[run(10)]] },
    cancel() {
      throw Object.assign(new Error('Conflict'), { status: 409 });
    },
    getRun() {
      throw readError;
    },
  });
  await assert.rejects(cancelObsoleteRuns(f), (error) => error === readError);
});

test('does not cancel a partial listing when pagination fails', async () => {
  const error = Object.assign(new Error('Listing unavailable'), { status: 503 });
  const f = fixture();
  f.github.paginate.iterator = async function* () {
    yield { data: [run(10)] };
    throw error;
  };
  await assert.rejects(cancelObsoleteRuns(f), (actual) => actual === error);
  assert.deepEqual(f.calls.cancellations, []);
});

test('does not cancel without a successful branch-tip lookup', async () => {
  const error = Object.assign(new Error('Branch unavailable'), { status: 403 });
  const f = fixture({ pages: { in_progress: [[run(10)]] } });
  f.github.rest.git.getRef = async () => {
    throw error;
  };
  await assert.rejects(cancelObsoleteRuns(f), (actual) => actual === error);
  assert.deepEqual(f.calls.queries, []);
  assert.deepEqual(f.calls.cancellations, []);
});

test('ignores tags, deleted branches, other repositories and non-push events', async () => {
  for (const changes of [
    { eventName: 'workflow_dispatch' },
    { ref: 'refs/tags/mobile-current' },
    { payload: { repository, deleted: true } },
    { payload: { repository: { full_name: 'someone/playground' } } },
  ]) {
    const f = fixture();
    Object.assign(f.context, changes);
    const result = await cancelObsoleteRuns(f);
    assert.ok(result.skippedReason);
    assert.deepEqual(f.calls.refs, []);
    assert.deepEqual(f.calls.queries, []);
    assert.deepEqual(f.calls.cancellations, []);
  }
});

test('supports slash-containing branch names and case-insensitive repository names', async () => {
  const f = fixture({
    pages: {
      in_progress: [
        [
          run(10, {
            head_branch: 'feature/qa',
            repository: { full_name: 'Vostride/Playground' },
            head_repository: { full_name: 'Vostride/Playground' },
          }),
        ],
      ],
    },
  });
  f.context.ref = 'refs/heads/feature/qa';
  f.context.payload.repository = { full_name: 'Vostride/Playground' };
  const result = await cancelObsoleteRuns(f);
  assert.deepEqual(result.cancelledRunIds, [10]);
  assert.equal(f.calls.refs[0].ref, 'heads/feature/qa');
  assert.equal(f.calls.queries[0].branch, 'feature/qa');
});

test('requires a valid current run ID before issuing API calls', async () => {
  const f = fixture();
  f.context.runId = undefined;
  await assert.rejects(cancelObsoleteRuns(f), /numeric run ID/);
  assert.deepEqual(f.calls.refs, []);
  assert.deepEqual(f.calls.queries, []);
});
