/** Corkboard's deterministic, platform-independent board model. */
export type TaskStatus = 'backlog' | 'todo' | 'progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export interface TaskChecklistItem {
  id: string;
  title: string;
  done: boolean;
}
export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  labels: string[];
  assignees: string[];
  priority: TaskPriority;
  dueDate: string;
  checklist: TaskChecklistItem[];
}
export interface TaskBoard {
  id: string;
  name: string;
  description: string;
  color: string;
}
export interface TasksState {
  boards: TaskBoard[];
  tasks: Task[];
  nextId: number;
}
export interface TasksHistory {
  present: TasksState;
  past: TasksState[];
}

export const TASK_COLUMNS: { id: TaskStatus; name: string; color: string }[] = [
  { id: 'backlog', name: 'Backlog', color: '#9297a6' },
  { id: 'todo', name: 'To do', color: '#8294b1' },
  { id: 'progress', name: 'In progress', color: '#d2a24c' },
  { id: 'review', name: 'In review', color: '#9f83c5' },
  { id: 'done', name: 'Done', color: '#78a58d' },
];
export const TASK_LABELS = [
  { id: 'design', name: 'Design', color: '#a18acb' },
  { id: 'engineering', name: 'Engineering', color: '#79a9cb' },
  { id: 'research', name: 'Research', color: '#bd9a67' },
  { id: 'product', name: 'Product', color: '#79aa94' },
  { id: 'bug', name: 'Bug', color: '#ce8b88' },
];
export const TASK_MEMBERS = [
  { id: 'maya', name: 'Maya Chen', initials: 'MC', color: '#dcc8bb' },
  { id: 'alex', name: 'Alex Morgan', initials: 'AM', color: '#bbccdf' },
  { id: 'sam', name: 'Sam Rivera', initials: 'SR', color: '#d0c6de' },
  { id: 'jordan', name: 'Jordan Ellis', initials: 'JE', color: '#c1d4c6' },
  { id: 'robin', name: 'Robin Park', initials: 'RP', color: '#e3d5b3' },
];

const firstTitles = [
  'Explore a more useful empty state',
  'Map the onboarding journey',
  'Audit keyboard navigation',
  'Document our component principles',
  'Review customer interview notes',
  'Define workspace permissions',
  'Refresh the workspace switcher',
  'Build the notification preferences',
  'Write welcome email copy',
  'Update the account settings page',
  'Design the invite teammates flow',
  'Add project archive controls',
  'Refine the project overview',
  'Ship the new search experience',
  'Connect activity to the timeline',
  'Improve the mobile navigation',
  'Build reusable date picker',
  'Improve board rendering performance',
  'Review the new color palette',
  'Test invitation edge cases',
  'Polish the command menu',
  'Validate the responsive layouts',
  'Review the accessibility audit',
  'Proofread release notes',
  'Create the icon library',
  'Set up the design token system',
  'Add loading skeletons',
  'Introduce workspace avatars',
  'Fix the search focus state',
  'Ship the profile settings',
];

export function createTasksState(): TasksState {
  let seed = 42719;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const projects = [
    'Platform',
    'Growth',
    'Customer experience',
    'Design system',
    'Developer tools',
    'Operations',
    'Mobile',
    'Integrations',
  ];
  const efforts = ['Improve', 'Design', 'Review', 'Document', 'Build', 'Validate'];
  const topics = [
    'account recovery',
    'workspace navigation',
    'search filters',
    'activity history',
    'notification settings',
    'member permissions',
    'project templates',
    'data exports',
    'error messages',
    'onboarding checklist',
  ];
  const boards = Array.from(
    { length: 80 },
    (_, index): TaskBoard => ({
      id: `board-${index + 1}`,
      name:
        index === 0
          ? 'Product launch'
          : `${projects[(index - 1) % projects.length]} · Cycle ${Math.floor((index - 1) / projects.length) + 1}`,
      description:
        index === 0
          ? 'A considered workspace, ready for what’s next.'
          : `Planned work, improvements, and follow-through for the ${projects[(index - 1) % projects.length].toLowerCase()} team.`,
      color: ['#9088ba', '#8cac9a', '#c0a685', '#89a4bc'][index % 4],
    }),
  );
  const tasks = boards.flatMap((board, boardIndex) =>
    Array.from({ length: 30 }, (_, index): Task => {
      const number = boardIndex * 30 + index + 1;
      const member = TASK_MEMBERS[Math.floor(random() * TASK_MEMBERS.length)];
      return {
        id: `CKB-${String(number).padStart(3, '0')}`,
        boardId: board.id,
        title:
          boardIndex === 0
            ? firstTitles[index]
            : `${efforts[Math.floor(random() * efforts.length)]} ${topics[Math.floor(random() * topics.length)]}`,
        description:
          'Make the experience feel clear and consistent from the first interaction. Review the existing patterns, explore the smallest useful improvement, and share the result with the team.\n\nSuccess means a thoughtful, accessible experience that works just as well on a small screen.',
        status: TASK_COLUMNS[Math.floor(index / 6)].id,
        position: index % 6,
        labels: [TASK_LABELS[Math.floor(random() * TASK_LABELS.length)].id],
        assignees: index % 7 === 0 ? [] : [member.id],
        priority: (['low', 'medium', 'medium', 'high', 'urgent'] as TaskPriority[])[
          Math.floor(random() * 5)
        ],
        dueDate: index % 4 === 0 ? '' : `2026-10-${String(20 + (index % 10)).padStart(2, '0')}`,
        checklist: [
          { id: `${number}-1`, title: 'Review requirements with the team', done: index >= 12 },
          { id: `${number}-2`, title: 'Complete the first iteration', done: index >= 18 },
          { id: `${number}-3`, title: 'Verify keyboard and mobile behavior', done: index >= 24 },
        ],
      };
    }),
  );
  return { boards, tasks, nextId: tasks.length + 1 };
}

export function getBoardTasks(state: TasksState, boardId: string, status?: TaskStatus): Task[] {
  return state.tasks
    .filter((task) => task.boardId === boardId && (!status || task.status === status))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** index is the card's final zero-based position in the destination column. */
export function moveTask(
  state: TasksState,
  taskId: string,
  status: TaskStatus,
  index: number,
): TasksState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !TASK_COLUMNS.some((column) => column.id === status)) return state;
  const destination = getBoardTasks(state, task.boardId, status).filter(
    (item) => item.id !== taskId,
  );
  const finalIndex = Math.max(
    0,
    Math.min(Math.trunc(Number.isFinite(index) ? index : destination.length), destination.length),
  );
  if (task.status === status && task.position === finalIndex) return state;
  destination.splice(finalIndex, 0, { ...task, status });
  const replacements = new Map(
    destination.map((item, position) => [item.id, { ...item, position }]),
  );
  if (task.status !== status) {
    getBoardTasks(state, task.boardId, task.status)
      .filter((item) => item.id !== taskId)
      .forEach((item, position) => replacements.set(item.id, { ...item, position }));
  }
  return { ...state, tasks: state.tasks.map((item) => replacements.get(item.id) ?? item) };
}

export function updateTask(
  state: TasksState,
  taskId: string,
  patch: Partial<
    Pick<
      Task,
      'title' | 'description' | 'labels' | 'assignees' | 'priority' | 'dueDate' | 'checklist'
    >
  >,
): TasksState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  if (patch.title !== undefined && !patch.title.trim()) return state;
  if (patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) return state;
  const nextPatch = patch.title === undefined ? patch : { ...patch, title: patch.title.trim() };
  if (Object.entries(nextPatch).every(([key, value]) => task[key as keyof Task] === value))
    return state;
  return {
    ...state,
    tasks: state.tasks.map((item) => (item.id === taskId ? { ...item, ...nextPatch } : item)),
  };
}

export function createTask(
  state: TasksState,
  boardId: string,
  title: string,
  status: TaskStatus = 'todo',
): TasksState {
  if (!title.trim() || !state.boards.some((board) => board.id === boardId)) return state;
  const task: Task = {
    id: `CKB-${String(state.nextId).padStart(3, '0')}`,
    boardId,
    title: title.trim(),
    description: '',
    status,
    position: getBoardTasks(state, boardId, status).length,
    labels: [],
    assignees: [],
    priority: 'medium',
    dueDate: '',
    checklist: [],
  };
  return { ...state, nextId: state.nextId + 1, tasks: [...state.tasks, task] };
}

export function deleteTask(state: TasksState, taskId: string): TasksState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  const tasks = state.tasks.filter((item) => item.id !== taskId);
  return {
    ...state,
    tasks: tasks.map((item) =>
      item.boardId === task.boardId && item.status === task.status && item.position > task.position
        ? { ...item, position: item.position - 1 }
        : item,
    ),
  };
}

export function changeTasks(history: TasksHistory, next: TasksState): TasksHistory {
  return next === history.present
    ? history
    : { present: next, past: [...history.past.slice(-19), history.present] };
}
export function undoTasks(history: TasksHistory): TasksHistory {
  return history.past.length
    ? { present: history.past[history.past.length - 1], past: history.past.slice(0, -1) }
    : history;
}

export interface TaskFilters {
  query?: string;
  label?: string;
  assignee?: string;
  priority?: string;
}
export function matchesTask(task: Task, filters: TaskFilters): boolean {
  const query = (filters.query ?? '').trim().toLowerCase();
  return (
    (!query || `${task.id} ${task.title} ${task.description}`.toLowerCase().includes(query)) &&
    (!filters.label || task.labels.includes(filters.label)) &&
    (!filters.assignee ||
      (filters.assignee === 'unassigned'
        ? !task.assignees.length
        : task.assignees.includes(filters.assignee))) &&
    (!filters.priority || task.priority === filters.priority)
  );
}
