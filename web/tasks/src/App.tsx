import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleHelp,
  Columns3,
  Folder,
  GripVertical,
  LayoutGrid,
  List,
  ListChecks,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  BrandMark,
  PlaygroundBanner,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
  useSessionState,
} from '@playground/ui';
import {
  createTask,
  createTasksState,
  deleteTask,
  getBoardTasks,
  matchesTask,
  moveTask,
  TASK_COLUMNS,
  TASK_LABELS,
  TASK_MEMBERS,
  updateTask,
  type Task,
  type TaskFilters,
  type TaskPriority,
  type TasksState,
  type TaskStatus,
} from '@playground/core/tasks';

const BUGS = [
  {
    id: 'move-drops-label',
    label: 'Moving removes labels',
    description: 'Moving a task to another column unexpectedly clears its labels.',
  },
  {
    id: 'filter-ignores-assignee',
    label: 'Assignee filter is ignored',
    description: 'Selecting an assignee leaves other teammates’ tasks visible.',
  },
];
const activeBugs = new URLSearchParams(window.location.search)
  .getAll('bug')
  .flatMap((value) => value.split(','));
const STORAGE_KEY = 'playground:corkboard-state-v1';
const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

function initialState(): TasksState {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as TasksState;
      if (
        Array.isArray(parsed.boards) &&
        parsed.boards.length &&
        Array.isArray(parsed.tasks) &&
        Number.isInteger(parsed.nextId)
      )
        return parsed;
    }
  } catch {
    /* An unavailable or corrupt store starts a clean, repeatable session. */
  }
  const initial = createTasksState();
  if (new URLSearchParams(window.location.search).get('state') === 'empty')
    initial.tasks = initial.tasks.filter((task) => task.boardId !== 'board-1');
  return initial;
}

function Avatar({ memberId, small = false }: { memberId: string; small?: boolean }) {
  const member = TASK_MEMBERS.find((person) => person.id === memberId);
  if (!member) return null;
  return (
    <span
      className={`avatar ${small ? 'avatar-small' : ''}`}
      style={{ '--avatar-color': member.color } as CSSProperties}
      title={member.name}
      aria-label={member.name}
    >
      {member.initials}
    </span>
  );
}

function PriorityIcon({ value }: { value: TaskPriority }) {
  return (
    <span
      className={`priority-icon priority-${value}`}
      aria-label={`${value} priority`}
      title={`${value[0].toUpperCase()}${value.slice(1)} priority`}
    >
      <i />
      <i />
      <i />
    </span>
  );
}

function Modal({
  children,
  onClose,
  label,
  panel = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  panel?: boolean;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={
          panel
            ? 'task-panel top-[36px] bottom-0 left-auto right-0 flex h-[calc(100dvh-36px)] w-full max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-[560px]'
            : 'modal block max-h-[calc(100dvh-48px)] overflow-y-auto rounded-[2px] p-0 sm:max-w-[560px]'
        }
        aria-label={label}
        aria-describedby={undefined}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  const [state, setState] = useState<TasksState>(initialState);
  const [past, setPast] = useState<TasksState[]>([]);
  const [boardId, setBoardId] = useSessionState('corkboard-board-v1', 'board-1');
  const [filters, setFilters] = useState<TaskFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);
  const [showBoards, setShowBoards] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [boardQuery, setBoardQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useSessionState<string[]>('corkboard-favorites-v1', [
    'board-1',
    'board-4',
  ]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [keyboardMove, setKeyboardMove] = useState<{ id: string; before: TasksState } | null>(null);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(
    new URLSearchParams(window.location.search).get('state') === 'error',
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingCardFocus = useRef<string | null>(null);
  const board = state.boards.find((item) => item.id === boardId) ?? state.boards[0];
  const selected = state.tasks.find((task) => task.id === selectedId);
  const boardTasks = getBoardTasks(state, board.id);
  const effectiveFilters = activeBugs.includes('filter-ignores-assignee')
    ? { ...filters, assignee: '' }
    : filters;
  const visibleTasks = boardTasks.filter(
    (task) => matchesTask(task, effectiveFilters) && (showDone || task.status !== 'done'),
  );
  const filterCount = [filters.label, filters.assignee, filters.priority].filter(Boolean).length;
  const completed = boardTasks.filter((task) => task.status === 'done').length;

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.title = `${selected ? selected.title : board.name} · Brello`;
  }, [board.name, selected?.title]);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }, [state]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message]);
  useLayoutEffect(() => {
    const id = pendingCardFocus.current;
    if (!id) return;
    // Changing columns remounts the card. Restore focus in the same commit so
    // the next key reaches it even when animation frames are delayed.
    document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus();
    pendingCardFocus.current = null;
  }, [state, keyboardMove]);

  function commit(next: TasksState, notice = 'Task updated') {
    if (next === state) return;
    setPast((items) => [...items.slice(-19), state]);
    setState(next);
    setMessage(notice);
  }
  function undo() {
    if (!past.length) return;
    setState(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setMessage('Change undone');
  }
  function patch(id: string, changes: Parameters<typeof updateTask>[2], notice?: string) {
    commit(updateTask(state, id, changes), notice);
  }
  function move(id: string, status: TaskStatus, position: number, from = state) {
    let next = moveTask(from, id, status, position);
    if (
      activeBugs.includes('move-drops-label') &&
      from.tasks.find((task) => task.id === id)?.status !== status
    )
      next = updateTask(next, id, { labels: [] });
    return next;
  }
  function chooseBoard(id: string) {
    setBoardId(id);
    setFilters({});
    setShowBoards(false);
    setSidebarOpen(false);
    setSelectedId(null);
    setKeyboardMove(null);
  }
  function focusCard(id: string) {
    pendingCardFocus.current = id;
  }
  function cardKey(event: KeyboardEvent<HTMLElement>, task: Task) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      return;
    if (
      event.target !== event.currentTarget &&
      !(event.target as HTMLElement).closest('[data-drag-handle]')
    )
      return;
    if (keyboardMove?.id === task.id) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setState(keyboardMove.before);
        setKeyboardMove(null);
        setMessage('Move cancelled');
        focusCard(task.id);
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        setPast((items) => [...items.slice(-19), keyboardMove.before]);
        setKeyboardMove(null);
        setMessage(
          `${task.id} placed in ${TASK_COLUMNS.find((column) => column.id === task.status)?.name}, position ${task.position + 1}`,
        );
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault();
        const availableColumns = TASK_COLUMNS.filter((column) => showDone || column.id !== 'done');
        const columnIndex = availableColumns.findIndex((column) => column.id === task.status);
        const status =
          availableColumns[
            Math.max(
              0,
              Math.min(
                availableColumns.length - 1,
                columnIndex + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0),
              ),
            )
          ].id;
        const position =
          event.key === 'ArrowUp'
            ? task.position - 1
            : event.key === 'ArrowDown'
              ? task.position + 1
              : task.position;
        const next = move(task.id, status, position);
        setState(next);
        const moved = next.tasks.find((item) => item.id === task.id)!;
        setMessage(
          `${task.id}, ${TASK_COLUMNS.find((column) => column.id === moved.status)?.name}, position ${moved.position + 1}`,
        );
        focusCard(task.id);
      }
    } else if (event.key === ' ') {
      event.preventDefault();
      setKeyboardMove({ id: task.id, before: state });
      setMessage(`${task.id} picked up. Use arrow keys to move, Space to place, Escape to cancel.`);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setSelectedId(task.id);
    }
  }
  function drop(id: string, status: TaskStatus, beforeId?: string) {
    const source = state.tasks.find((task) => task.id === id);
    if (!source) return;
    const columnTasks = getBoardTasks(state, board.id, status).filter((task) => task.id !== id);
    const index =
      beforeId && beforeId !== id
        ? columnTasks.findIndex((task) => task.id === beforeId)
        : columnTasks.length;
    if (beforeId !== id)
      commit(
        move(id, status, index < 0 ? columnTasks.length : index),
        `${id} moved to ${TASK_COLUMNS.find((column) => column.id === status)?.name}`,
      );
    setDraggingId(null);
    setDropTarget(null);
  }
  function saveInline(task: Task) {
    if (editTitle.trim()) patch(task.id, { title: editTitle }, 'Task renamed');
    setEditingId(null);
  }

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (
        (event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      if (keyboardMove || document.querySelector('[role="dialog"][data-state="open"]')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'c') {
        event.preventDefault();
        setNewTaskStatus('todo');
      }
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === '?') {
        event.preventDefault();
        setShowHelp(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [past, keyboardMove]);

  function renderCard(task: Task) {
    const doneCount = task.checklist.filter((item) => item.done).length;
    return (
      <Card
        role="article"
        key={task.id}
        data-task-id={task.id}
        className={`task-card gap-0 ${draggingId === task.id ? 'is-dragging' : ''} ${keyboardMove?.id === task.id ? 'is-lifted' : ''} ${dropTarget === task.id ? 'drop-before' : ''}`}
        tabIndex={0}
        aria-label={`${task.id}: ${task.title}. ${task.status === 'done' ? 'Completed. ' : ''}Press Enter to open or Space to move.`}
        aria-describedby="drag-instructions"
        draggable={!editingId && !keyboardMove}
        onClick={() => {
          if (!editingId && !keyboardMove) setSelectedId(task.id);
        }}
        onKeyDown={(event) => cardKey(event, task)}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', task.id);
          event.dataTransfer.effectAllowed = 'move';
          setDraggingId(task.id);
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDropTarget(null);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          setDropTarget(task.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          drop(event.dataTransfer.getData('text/plain'), task.status, task.id);
        }}
      >
        <div className="card-top">
          <span className="task-id">{task.id}</span>
          <div className="card-controls">
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button tiny"
              aria-label={`Rename ${task.id}`}
              onClick={(event) => {
                event.stopPropagation();
                setEditingId(task.id);
                setEditTitle(task.title);
              }}
            >
              <Pencil size={12} />
            </Button>
            <span data-drag-handle className="drag-handle" aria-hidden="true">
              <GripVertical size={14} />
            </span>
          </div>
        </div>
        {editingId === task.id ? (
          <Input
            autoFocus
            aria-label={`Title for ${task.id}`}
            className="inline-title"
            value={editTitle}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setEditTitle(event.target.value)}
            onBlur={() => saveInline(task)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') saveInline(task);
              if (event.key === 'Escape') setEditingId(null);
            }}
          />
        ) : (
          <h3
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditingId(task.id);
              setEditTitle(task.title);
            }}
          >
            {task.title}
          </h3>
        )}
        <div className="card-labels">
          {task.labels.map((id) => {
            const label = TASK_LABELS.find((item) => item.id === id);
            return label ? (
              <Badge
                variant="outline"
                key={id}
                className="task-label rounded-none border-0 px-0 py-0 text-xs font-medium"
                style={{ '--label-color': label.color } as CSSProperties}
              >
                <span />
                {label.name}
              </Badge>
            ) : null;
          })}
        </div>
        <div className="card-footer">
          <div className="card-meta">
            <PriorityIcon value={task.priority} />
            {task.dueDate && (
              <span className="due-date">
                <CalendarDays size={12} />
                {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            )}
            {task.checklist.length > 0 && (
              <span
                className={`checklist-count ${doneCount === task.checklist.length ? 'complete' : ''}`}
                title={`${doneCount} of ${task.checklist.length} checklist items complete`}
              >
                <ListChecks size={13} />
                {doneCount}/{task.checklist.length}
              </span>
            )}
          </div>
          <div className="card-assignees">
            {task.assignees.map((id) => (
              <Avatar key={id} memberId={id} small />
            ))}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="corkboard-app">
      <PlaygroundBanner app="Brello" bugs={BUGS} />
      <div className="app-shell">
        {sidebarOpen && (
          <Button
            variant="ghost"
            className="sidebar-scrim fixed inset-0 h-full w-full rounded-none"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}
          aria-label="Workspace navigation"
        >
          <a className="brand" href="/tasks/">
            <span className="brand-mark">
              <BrandMark app="tasks" size={24} className="size-6" />
            </span>
            Brello<span className="brand-dot">.</span>
          </a>
          <div className="workspace-label">
            <span className="workspace-icon">S</span>
            <div>
              <strong>Studio workspace</strong>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button sidebar-close hidden max-[800px]:inline-flex"
              aria-label="Close navigation"
              onClick={() => setSidebarOpen(false)}
            >
              <PanelLeftClose size={16} />
            </Button>
          </div>
          <nav className="primary-nav">
            <Button
              variant="ghost"
              className="justify-start"
              onClick={() => {
                setShowBoards(true);
                setBoardQuery('');
              }}
            >
              <LayoutGrid size={17} />
              All boards<span className="nav-number">80</span>
            </Button>
            <Button
              variant="ghost"
              className={`justify-start ${filters.assignee === 'maya' ? 'active' : ''}`}
              onClick={() =>
                setFilters({ ...filters, assignee: filters.assignee === 'maya' ? '' : 'maya' })
              }
            >
              <CheckCheck size={17} />
              My tasks
            </Button>
          </nav>
          <div className="nav-section-label">
            WORKSPACE BOARDS
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button tiny"
              aria-label="Browse all boards"
              onClick={() => {
                setShowBoards(true);
                setBoardQuery('');
              }}
            >
              <MoreHorizontal size={16} />
            </Button>
          </div>
          <nav className="board-navigation">
            {state.boards.slice(0, 6).map((item) => (
              <Button
                variant="ghost"
                key={item.id}
                className={`justify-start ${item.id === board.id ? 'active' : ''}`}
                aria-current={item.id === board.id ? 'page' : undefined}
                onClick={() => chooseBoard(item.id)}
              >
                <span className="board-dot" style={{ background: item.color }} />
                <span>{item.name}</span>
                {favoriteIds.includes(item.id) && <Star size={12} fill="currentColor" />}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="browse-boards justify-start"
              onClick={() => {
                setShowBoards(true);
                setBoardQuery('');
              }}
            >
              <Plus size={15} />
              Browse all boards
            </Button>
          </nav>
          <div className="sidebar-bottom">
            <Button
              variant="ghost"
              className="sidebar-help w-full justify-start"
              onClick={() => setShowHelp(true)}
            >
              <CircleHelp size={16} />
              Keyboard shortcuts
            </Button>
            <Button
              variant="ghost"
              className="profile-button rounded-none"
              onClick={() => {
                setFilters({ ...filters, assignee: 'maya' });
                setMessage('Showing tasks assigned to Maya Chen');
              }}
            >
              <Avatar memberId="maya" />
              <span>
                <strong>Maya Chen</strong>
              </span>
              <ChevronDown size={14} />
            </Button>
          </div>
        </aside>
        <main className="main-content">
          <header className="topbar">
            <div className="breadcrumb">
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button mobile-menu hidden max-[800px]:inline-flex"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <LayoutGrid size={18} />
              </Button>
              <Folder size={15} />
              <Button
                variant="ghost"
                onClick={() => {
                  setShowBoards(true);
                  setBoardQuery('');
                }}
              >
                Workspace
              </Button>
              <ChevronRight size={13} />
              <span>{board.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button"
              aria-label="Keyboard shortcuts and help"
              onClick={() => setShowHelp(true)}
            >
              <CircleHelp size={18} />
            </Button>
          </header>
          <section className="board-header">
            <div className="board-title-row">
              <div className="board-heading">
                <span
                  className="board-symbol"
                  style={{ '--board-color': board.color } as CSSProperties}
                >
                  <Columns3 size={23} />
                </span>
                <h1>{board.name}</h1>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={`icon-button favorite-button max-[550px]:hidden ${favoriteIds.includes(board.id) ? 'is-favorite' : ''}`}
                  aria-label={
                    favoriteIds.includes(board.id)
                      ? 'Remove board from favorites'
                      : 'Add board to favorites'
                  }
                  aria-pressed={favoriteIds.includes(board.id)}
                  onClick={() =>
                    setFavoriteIds((ids) =>
                      ids.includes(board.id)
                        ? ids.filter((id) => id !== board.id)
                        : [...ids, board.id],
                    )
                  }
                >
                  <Star size={18} fill={favoriteIds.includes(board.id) ? 'currentColor' : 'none'} />
                </Button>
              </div>
              <div className="board-actions">
                <div className="avatar-stack" aria-label="5 workspace members">
                  {TASK_MEMBERS.slice(0, 3).map((member) => (
                    <Avatar key={member.id} memberId={member.id} small />
                  ))}
                  <span>+2</span>
                </div>
                <Button
                  variant="default"
                  className="primary-button"
                  onClick={() => setNewTaskStatus('todo')}
                >
                  <Plus size={16} />
                  New task
                </Button>
              </div>
            </div>
            <div className="board-tabs">
              <Tabs value={view} onValueChange={(value) => setView(value as 'board' | 'list')}>
                <TabsList variant="line" aria-label="Board view" className="board-view-tabs">
                  <TabsTrigger value="board" className="px-3 font-semibold">
                    <Columns3 size={16} />
                    Board
                  </TabsTrigger>
                  <TabsTrigger value="list" className="px-3 font-semibold">
                    <List size={16} />
                    List
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="board-progress">
                <span>
                  <i
                    style={{
                      width: `${boardTasks.length ? (completed / boardTasks.length) * 100 : 0}%`,
                    }}
                  />
                </span>
                {completed} of {boardTasks.length} complete
              </span>
            </div>
          </section>
          <div className="board-toolbar">
            <div className="toolbar-left">
              <div className="search-field">
                <Search size={15} />
                <Input
                  ref={searchRef}
                  className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  aria-label="Search tasks"
                  placeholder="Search tasks…"
                  value={filters.query ?? ''}
                  onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                />
                <kbd>/</kbd>
                {filters.query && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="icon-button tiny"
                    aria-label="Clear search"
                    onClick={() => setFilters({ ...filters, query: '' })}
                  >
                    <X size={13} />
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                className={`secondary-button filter-button ${showFilters || filterCount ? 'filter-active' : ''}`}
                aria-expanded={showFilters}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal size={14} />
                Filter{filterCount > 0 && <span>{filterCount}</span>}
              </Button>
            </div>
            <div className="toolbar-right">
              <label className="completed-toggle">
                <input
                  type="checkbox"
                  checked={showDone}
                  onChange={(event) => setShowDone(event.target.checked)}
                />
                Show completed
              </label>
              <Separator
                orientation="vertical"
                className="toolbar-divider h-5 max-[550px]:hidden"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="icon-button"
                aria-label="Undo last change"
                title="Undo last change (⌘/Ctrl Z)"
                disabled={!past.length || !!keyboardMove}
                onClick={undo}
              >
                <Undo2 size={17} />
              </Button>
            </div>
          </div>
          {showFilters && (
            <div className="filter-panel">
              <label>
                Label
                <select
                  value={filters.label ?? ''}
                  onChange={(event) => setFilters({ ...filters, label: event.target.value })}
                >
                  <option value="">All labels</option>
                  {TASK_LABELS.map((label) => (
                    <option value={label.id} key={label.id}>
                      {label.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={filters.assignee ?? ''}
                  onChange={(event) => setFilters({ ...filters, assignee: event.target.value })}
                >
                  <option value="">Everyone</option>
                  <option value="unassigned">Unassigned</option>
                  {TASK_MEMBERS.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={filters.priority ?? ''}
                  onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
                >
                  <option value="">All priorities</option>
                  {priorities.map((priority) => (
                    <option value={priority} key={priority}>
                      {priority[0].toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="ghost" className="text-button" onClick={() => setFilters({})}>
                Clear filters
              </Button>
              <span>{visibleTasks.length} matching tasks</span>
            </div>
          )}
          {saveError && (
            <div className="inline-error" role="alert">
              Your browser could not save this session. Changes remain available until you reload.
            </div>
          )}
          <p id="drag-instructions" className="sr-only">
            To move a task with the keyboard, focus it and press Space, use up and down arrows to
            reorder or left and right arrows to change columns, then press Space to place it. Press
            Escape to cancel.
          </p>
          {keyboardMove && (
            <div className="move-instructions">
              <GripVertical size={15} />
              <strong>Moving {keyboardMove.id}</strong>
              <span>Arrow keys to move · Space to place · Esc to cancel</span>
            </div>
          )}
          {loading ? (
            <div className="loading-board" role="status" aria-label="Loading board">
              {TASK_COLUMNS.map((column) => (
                <div className="skeleton-column" key={column.id}>
                  <div />
                  {[1, 2, 3].map((number) => (
                    <span key={number} />
                  ))}
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="board-state" role="alert">
              <CircleHelp size={32} />
              <h2>This board couldn’t load</h2>
              <p>Your work is still here. Try loading the board again.</p>
              <Button
                variant="default"
                className="primary-button"
                onClick={() => {
                  setLoading(true);
                  setLoadError(false);
                  window.setTimeout(() => setLoading(false), 350);
                }}
              >
                Try again
              </Button>
            </div>
          ) : visibleTasks.length === 0 && (filters.query || filterCount) ? (
            <div className="board-state">
              <Search size={32} />
              <h2>No tasks match your filters</h2>
              <p>Try another search or clear your filters to see the whole board.</p>
              <Button variant="outline" className="secondary-button" onClick={() => setFilters({})}>
                Clear filters
              </Button>
            </div>
          ) : view === 'board' ? (
            <div className="kanban" aria-label={`${board.name} board`}>
              {TASK_COLUMNS.filter((column) => showDone || column.id !== 'done').map((column) => {
                const tasks = visibleTasks.filter((task) => task.status === column.id);
                return (
                  <section
                    key={column.id}
                    className={`kanban-column ${dropTarget === column.id ? 'column-drop' : ''}`}
                    aria-label={`${column.name} column`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDropTarget(column.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      drop(event.dataTransfer.getData('text/plain'), column.id);
                    }}
                  >
                    <div className="column-header">
                      <span
                        className={`status-dot status-${column.id}`}
                        style={{ '--status-color': column.color } as CSSProperties}
                      >
                        {column.id === 'done' ? <Check size={10} /> : null}
                      </span>
                      <h2>{column.name}</h2>
                      <span className="column-count">{tasks.length}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="icon-button tiny"
                        aria-label={`Add task to ${column.name}`}
                        onClick={() => setNewTaskStatus(column.id)}
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                    <div className="column-cards">
                      {tasks.map(renderCard)}
                      {tasks.length === 0 && (
                        <div className="empty-column">
                          <Circle size={18} />
                          <p>No tasks here yet</p>
                          <span>Drop a task here or add a new one.</span>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        className="add-task"
                        onClick={() => setNewTaskStatus(column.id)}
                      >
                        <Plus size={15} />
                        Add task
                      </Button>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="list-view">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => (
                    <tr key={task.id}>
                      <td>
                        <Button
                          variant="ghost"
                          className="h-auto justify-start gap-4 whitespace-normal text-left"
                          onClick={() => setSelectedId(task.id)}
                        >
                          <span className="task-id">{task.id}</span>
                          <strong>{task.title}</strong>
                        </Button>
                      </td>
                      <td>
                        <select
                          aria-label={`Status for ${task.id}`}
                          value={task.status}
                          onChange={(event) =>
                            commit(
                              move(
                                task.id,
                                event.target.value as TaskStatus,
                                getBoardTasks(state, board.id, event.target.value as TaskStatus)
                                  .length,
                              ),
                              `${task.id} moved`,
                            )
                          }
                        >
                          {TASK_COLUMNS.map((column) => (
                            <option key={column.id} value={column.id}>
                              {column.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="list-priority">
                          <PriorityIcon value={task.priority} />
                          {task.priority}
                        </span>
                      </td>
                      <td>
                        <div className="list-assignees">
                          {task.assignees.length ? (
                            task.assignees.map((id) => <Avatar key={id} memberId={id} small />)
                          ) : (
                            <span className="muted">Unassigned</span>
                          )}
                        </div>
                      </td>
                      <td>
                        {task.dueDate ? (
                          new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        ) : (
                          <span className="muted">No date</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleTasks.length && (
                <div className="board-state">
                  <h2>No tasks in this board</h2>
                  <p>Create a task to get started.</p>
                  <Button
                    variant="default"
                    className="primary-button"
                    onClick={() => setNewTaskStatus('todo')}
                  >
                    <Plus size={16} />
                    New task
                  </Button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {message}
      </div>
      {message && !keyboardMove && (
        <div className="toast">
          <Check size={16} />
          <span>{message}</span>
          {past.length > 0 && (
            <Button variant="ghost" onClick={undo}>
              Undo
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="icon-button tiny"
            aria-label="Dismiss notification"
            onClick={() => setMessage('')}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {selected && (
        <TaskPanel
          task={selected}
          onClose={() => setSelectedId(null)}
          patch={(changes) => patch(selected.id, changes)}
          onMove={(status) =>
            commit(
              move(selected.id, status, getBoardTasks(state, board.id, status).length),
              `${selected.id} moved to ${TASK_COLUMNS.find((column) => column.id === status)?.name}`,
            )
          }
          onDelete={() => {
            commit(deleteTask(state, selected.id), `${selected.id} deleted`);
            setSelectedId(null);
          }}
        />
      )}
      {newTaskStatus && (
        <NewTaskModal
          status={newTaskStatus}
          onClose={() => setNewTaskStatus(null)}
          onCreate={(title, description, status, priority) => {
            const next = createTask(state, board.id, title, status);
            const created = next.tasks[next.tasks.length - 1];
            commit(
              updateTask(next, created.id, { description, priority }),
              `${created.id} created`,
            );
            setNewTaskStatus(null);
          }}
        />
      )}
      {showBoards && (
        <Modal label="Browse boards" onClose={() => setShowBoards(false)}>
          <div className="modal-header">
            <div>
              <h2>Workspace boards</h2>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button"
              aria-label="Close board browser"
              onClick={() => setShowBoards(false)}
            >
              <X size={20} />
            </Button>
          </div>
          <div className="boards-search search-field">
            <Search size={16} />
            <Input
              autoFocus
              className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              aria-label="Search boards"
              placeholder="Search 80 boards…"
              value={boardQuery}
              onChange={(event) => setBoardQuery(event.target.value)}
            />
          </div>
          <div className="boards-browser">
            {state.boards
              .filter((item) => item.name.toLowerCase().includes(boardQuery.toLowerCase()))
              .map((item) => (
                <Button variant="ghost" key={item.id} onClick={() => chooseBoard(item.id)}>
                  <span
                    className="browse-board-icon"
                    style={{ background: `${item.color}20`, color: item.color }}
                  >
                    <Columns3 size={19} />
                  </span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {state.tasks.filter((task) => task.boardId === item.id).length} tasks
                    </small>
                  </span>
                  {board.id === item.id ? <Check size={16} /> : <ChevronRight size={16} />}
                </Button>
              ))}
            {!state.boards.some((item) =>
              item.name.toLowerCase().includes(boardQuery.toLowerCase()),
            ) && <p className="no-boards">No boards match “{boardQuery}”.</p>}
          </div>
        </Modal>
      )}
      {showHelp && (
        <Modal label="Brello help" onClose={() => setShowHelp(false)}>
          <div className="modal-header">
            <div>
              <h2>Keyboard shortcuts</h2>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              className="icon-button"
              aria-label="Close help"
              onClick={() => setShowHelp(false)}
            >
              <X size={20} />
            </Button>
          </div>
          <p className="help-intro">
            Open a task to edit it. Drag tasks between columns to change their status or within a
            column to reorder them.
          </p>
          <dl className="shortcut-list">
            <div>
              <dt>Create a task</dt>
              <dd>
                <kbd>C</kbd>
              </dd>
            </div>
            <div>
              <dt>Search the current board</dt>
              <dd>
                <kbd>/</kbd>
              </dd>
            </div>
            <div>
              <dt>Undo a change</dt>
              <dd>
                <kbd>⌘ / Ctrl</kbd>
                <kbd>Z</kbd>
              </dd>
            </div>
            <div>
              <dt>Open a focused task</dt>
              <dd>
                <kbd>Enter</kbd>
              </dd>
            </div>
            <div>
              <dt>Pick up / place a focused task</dt>
              <dd>
                <kbd>Space</kbd>
              </dd>
            </div>
            <div>
              <dt>Move a picked-up task</dt>
              <dd>
                <kbd>←</kbd>
                <kbd>↑</kbd>
                <kbd>↓</kbd>
                <kbd>→</kbd>
              </dd>
            </div>
            <div>
              <dt>Cancel a move / close a panel</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </div>
  );
}

function TaskPanel({
  task,
  onClose,
  patch,
  onMove,
  onDelete,
}: {
  task: Task;
  onClose: () => void;
  patch: (changes: Parameters<typeof updateTask>[2]) => void;
  onMove: (status: TaskStatus) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [itemTitle, setItemTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
  }, [task.id, task.title, task.description]);
  const completed = task.checklist.filter((item) => item.done).length;
  return (
    <Modal label={`Task ${task.id}`} onClose={onClose} panel>
      <div className="panel-header">
        <div>
          <Columns3 size={16} />
          <span>{task.id}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="icon-button"
          aria-label="Close task details"
          onClick={onClose}
        >
          <X size={20} />
        </Button>
      </div>
      <div className="panel-body">
        <label className="sr-only" htmlFor="task-title">
          Task title
        </label>
        <Textarea
          id="task-title"
          className="panel-title min-h-0 border-transparent bg-transparent px-0 text-xl font-semibold leading-snug shadow-none md:text-xl"
          rows={2}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            if (title.trim()) patch({ title });
            else setTitle(task.title);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <div className="task-properties">
          <label>
            <span>
              <Circle size={15} />
              Status
            </span>
            <select
              aria-label="Status"
              value={task.status}
              onChange={(event) => onMove(event.target.value as TaskStatus)}
            >
              {TASK_COLUMNS.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              <PriorityIcon value={task.priority} />
              Priority
            </span>
            <select
              aria-label="Priority"
              value={task.priority}
              onChange={(event) => patch({ priority: event.target.value as TaskPriority })}
            >
              {priorities.map((priority) => (
                <option key={priority} value={priority}>
                  {priority[0].toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <div className="property-row">
            <span>
              <Users size={15} />
              Assignees
            </span>
            <details className="property-picker">
              <summary>
                {task.assignees.length ? (
                  <span className="selected-assignees">
                    {task.assignees.map((id) => (
                      <Avatar key={id} memberId={id} small />
                    ))}
                    <span>
                      {task.assignees
                        .map(
                          (id) =>
                            TASK_MEMBERS.find((member) => member.id === id)?.name.split(' ')[0],
                        )
                        .join(', ')}
                    </span>
                  </span>
                ) : (
                  'Unassigned'
                )}
                <ChevronDown size={14} />
              </summary>
              <div>
                {TASK_MEMBERS.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      aria-label={member.name}
                      checked={task.assignees.includes(member.id)}
                      onChange={(event) =>
                        patch({
                          assignees: event.target.checked
                            ? [...task.assignees, member.id]
                            : task.assignees.filter((id) => id !== member.id),
                        })
                      }
                    />
                    <Avatar memberId={member.id} small />
                    {member.name}
                  </label>
                ))}
              </div>
            </details>
          </div>
          <label>
            <span>
              <CalendarDays size={15} />
              Due date
            </span>
            <Input
              type="date"
              aria-label="Due date"
              value={task.dueDate}
              onChange={(event) => patch({ dueDate: event.target.value })}
            />
          </label>
          <div className="property-row">
            <span>
              <Folder size={15} />
              Labels
            </span>
            <details className="property-picker">
              <summary>
                <span className="selected-labels">
                  {task.labels.length
                    ? task.labels.map((id) => {
                        const label = TASK_LABELS.find((item) => item.id === id);
                        return label ? (
                          <Badge
                            variant="outline"
                            key={id}
                            className="task-label rounded-none border-0 px-0 py-0 text-xs font-medium"
                            style={{ '--label-color': label.color } as CSSProperties}
                          >
                            <span />
                            {label.name}
                          </Badge>
                        ) : null;
                      })
                    : 'Add labels'}
                </span>
                <ChevronDown size={14} />
              </summary>
              <div>
                {TASK_LABELS.map((label) => (
                  <label key={label.id}>
                    <input
                      type="checkbox"
                      aria-label={label.name}
                      checked={task.labels.includes(label.id)}
                      onChange={(event) =>
                        patch({
                          labels: event.target.checked
                            ? [...task.labels, label.id]
                            : task.labels.filter((id) => id !== label.id),
                        })
                      }
                    />
                    <span className="label-dot" style={{ background: label.color }} />
                    {label.name}
                  </label>
                ))}
              </div>
            </details>
          </div>
        </div>
        <section className="detail-section">
          <h3>Description</h3>
          <label className="sr-only" htmlFor="task-description">
            Description
          </label>
          <Textarea
            id="task-description"
            className="description-input leading-7"
            placeholder="Add a description…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => patch({ description })}
            rows={6}
          />
        </section>
        <section className="detail-section">
          <div className="checklist-heading">
            <h3>Checklist</h3>
            <span>
              {completed} / {task.checklist.length}
            </span>
          </div>
          {task.checklist.length > 0 && (
            <div className="checklist-progress">
              <span style={{ width: `${(completed / task.checklist.length) * 100}%` }} />
            </div>
          )}
          <div className="checklist-items">
            {task.checklist.map((item) => (
              <div key={item.id}>
                <label className={item.done ? 'checked-item' : ''}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) =>
                      patch({
                        checklist: task.checklist.map((current) =>
                          current.id === item.id
                            ? { ...current, done: event.target.checked }
                            : current,
                        ),
                      })
                    }
                  />
                  <span>{item.title}</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="icon-button tiny"
                  aria-label={`Delete checklist item ${item.title}`}
                  onClick={() =>
                    patch({ checklist: task.checklist.filter((current) => current.id !== item.id) })
                  }
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
          </div>
          <form
            className="checklist-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!itemTitle.trim()) return;
              patch({
                checklist: [
                  ...task.checklist,
                  {
                    id: `${task.id}-item-${Math.max(0, ...task.checklist.map((item) => Number(item.id.split('-').at(-1)) || 0)) + 1}`,
                    title: itemTitle.trim(),
                    done: false,
                  },
                ],
              });
              setItemTitle('');
            }}
          >
            <Plus size={15} />
            <Input
              aria-label="New checklist item"
              placeholder="Add a checklist item…"
              value={itemTitle}
              onChange={(event) => setItemTitle(event.target.value)}
            />
            <Button variant="ghost" type="submit" disabled={!itemTitle.trim()}>
              Add
            </Button>
          </form>
        </section>
      </div>
      <div className="panel-footer">
        {confirmDelete ? (
          <div className="delete-confirm">
            <span>Delete this task?</span>
            <Button variant="ghost" className="text-button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="danger-button" onClick={onDelete}>
              Delete task
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="ghost"
              className="text-button delete-button"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
              Delete task
            </Button>
            <Button variant="outline" className="secondary-button" onClick={onClose}>
              Done
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

function NewTaskModal({
  status: initialStatus,
  onClose,
  onCreate,
}: {
  status: TaskStatus;
  onClose: () => void;
  onCreate: (
    title: string,
    description: string,
    status: TaskStatus,
    priority: TaskPriority,
  ) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Give your task a title.');
      return;
    }
    onCreate(title.trim(), description.trim(), status, priority);
  }
  return (
    <Modal label="New task" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>New task</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            className="icon-button"
            aria-label="Close new task"
            onClick={onClose}
          >
            <X size={20} />
          </Button>
        </div>
        <div className="new-task-fields">
          <label>
            Title
            <Input
              autoFocus
              placeholder="Task title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError('');
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'new-task-error' : undefined}
            />
          </label>
          {error && (
            <span id="new-task-error" className="field-error" role="alert">
              {error}
            </span>
          )}
          <label>
            Description <span className="optional">optional</span>
            <Textarea
              rows={4}
              placeholder="Describe the work and acceptance criteria…"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className="form-two-columns">
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as TaskStatus)}
              >
                {TASK_COLUMNS.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
              >
                {priorities.map((item) => (
                  <option key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <Button variant="outline" type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="default" className="primary-button" type="submit">
            <Plus size={15} />
            Create task
          </Button>
        </div>
      </form>
    </Modal>
  );
}
