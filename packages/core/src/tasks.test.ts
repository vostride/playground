import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeTasks,
  createTask,
  createTasksState,
  deleteTask,
  getBoardTasks,
  matchesTask,
  moveTask,
  undoTasks,
  updateTask,
} from './tasks.ts';

test('Brello generates 2,400 repeatable tasks across 80 boards', () => {
  const first = createTasksState();
  assert.equal(first.tasks.length, 2400);
  assert.equal(first.boards.length, 80);
  assert.deepEqual(first, createTasksState());
  assert.equal(new Set(first.tasks.map((task) => task.id)).size, 2400);
});

test('moving across columns preserves metadata and normalizes both orders', () => {
  const before = createTasksState();
  const task = before.tasks[1];
  const after = moveTask(before, task.id, 'progress', 2);
  const destination = getBoardTasks(after, task.boardId, 'progress');
  assert.equal(destination[2].id, task.id);
  assert.deepEqual(
    destination.map((item) => item.position),
    [0, 1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    getBoardTasks(after, task.boardId, 'backlog').map((item) => item.position),
    [0, 1, 2, 3, 4],
  );
  assert.deepEqual({ ...destination[2], status: task.status, position: task.position }, task);
  assert.equal(before.tasks[1].status, 'backlog');
  assert.equal(
    after.tasks.find((item) => item.id === 'CKB-031'),
    before.tasks.find((item) => item.id === 'CKB-031'),
  );
});

test('reordering within a column moves in both directions without duplicates', () => {
  const before = createTasksState();
  const down = moveTask(before, 'CKB-001', 'backlog', 4);
  assert.deepEqual(
    getBoardTasks(down, 'board-1', 'backlog').map((task) => task.id),
    ['CKB-002', 'CKB-003', 'CKB-004', 'CKB-005', 'CKB-001', 'CKB-006'],
  );
  const up = moveTask(down, 'CKB-001', 'backlog', 1);
  assert.deepEqual(
    getBoardTasks(up, 'board-1', 'backlog').map((task) => task.id),
    ['CKB-002', 'CKB-001', 'CKB-003', 'CKB-004', 'CKB-005', 'CKB-006'],
  );
  assert.equal(new Set(up.tasks.map((task) => task.id)).size, before.tasks.length);
  assert.deepEqual(
    getBoardTasks(up, 'board-1', 'backlog').map((task) => task.position),
    [0, 1, 2, 3, 4, 5],
  );
});

test('moving clamps bounds and ignores missing tasks and no-op moves', () => {
  const before = createTasksState();
  assert.equal(moveTask(before, 'missing', 'done', 0), before);
  assert.equal(moveTask(before, 'CKB-001', 'backlog', 0), before);
  const top = moveTask(before, 'CKB-005', 'backlog', -10);
  assert.equal(getBoardTasks(top, 'board-1', 'backlog')[0].id, 'CKB-005');
  const bottom = moveTask(before, 'CKB-001', 'done', 10000);
  assert.equal(getBoardTasks(bottom, 'board-1', 'done').at(-1)?.id, 'CKB-001');
});

test('undo restores the exact board state after edits and movement', () => {
  const before = createTasksState();
  const edited = updateTask(before, 'CKB-001', {
    title: 'An edited task',
    labels: ['design', 'product'],
    dueDate: '2026-11-02',
  });
  const first = changeTasks({ present: before, past: [] }, edited);
  const second = changeTasks(first, moveTask(edited, 'CKB-001', 'done', 3));
  assert.equal(undoTasks(second).present, edited);
  assert.equal(undoTasks(undoTasks(second)).present, before);
  assert.equal(undoTasks({ present: before, past: [] }).present, before);
  assert.equal(changeTasks(first, edited), first);
});

test('creation and deletion keep unique identifiers and ordered columns; blank titles are rejected', () => {
  const before = createTasksState();
  assert.equal(createTask(before, 'board-1', '   '), before);
  assert.equal(createTask(before, 'missing-board', 'A task'), before);
  const created = createTask(before, 'board-1', '  Draft a launch plan  ', 'review');
  const task = created.tasks.at(-1)!;
  assert.equal(task.id, 'CKB-2401');
  assert.equal(task.title, 'Draft a launch plan');
  assert.equal(task.position, 6);
  const removed = deleteTask(created, 'CKB-020');
  assert.equal(
    removed.tasks.some((item) => item.id === 'CKB-020'),
    false,
  );
  assert.deepEqual(
    getBoardTasks(removed, 'board-1', 'review').map((item) => item.position),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(updateTask(created, task.id, { title: ' ' }), created);
  assert.equal(updateTask(created, task.id, { dueDate: 'not-a-date' }), created);
});

test('filters combine query, assignee, label, and priority with AND semantics', () => {
  const task = {
    ...createTasksState().tasks[0],
    labels: ['design'],
    assignees: ['maya'],
    priority: 'high' as const,
  };
  assert.equal(
    matchesTask(task, {
      query: 'empty state',
      label: 'design',
      assignee: 'maya',
      priority: 'high',
    }),
    true,
  );
  assert.equal(
    matchesTask(task, { query: 'empty state', label: 'design', assignee: 'sam' }),
    false,
  );
  assert.equal(matchesTask(task, { query: 'empty state', priority: 'low' }), false);
  assert.equal(matchesTask(task, { label: 'engineering' }), false);
  assert.equal(matchesTask(task, { assignee: 'unassigned' }), false);
  assert.equal(matchesTask({ ...task, assignees: [] }, { assignee: 'unassigned' }), true);
});

test('undo restores deleted task and its checklist, assignees, labels and due date', () => {
  const before = createTasksState();
  const after = changeTasks({ present: before, past: [] }, deleteTask(before, 'CKB-002'));
  assert.deepEqual(
    undoTasks(after).present.tasks.find((task) => task.id === 'CKB-002'),
    before.tasks[1],
  );
});
