import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { PlaygroundNotice, SafeModalArea, useSessionState, type MobileScreenProps } from '../ui';

const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const theme = {
  ink: '#473c50',
  muted: '#82718e',
  purple: '#7c6593',
  pale: '#f2edf6',
  border: '#e6deec',
  background: '#f8f6fa',
  danger: '#ac6477',
};

function TaskButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, secondary && styles.secondaryButton, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.buttonText, secondary && { color: theme.purple }]}>{title}</Text>
    </Pressable>
  );
}
function Choice({
  title,
  selected,
  onPress,
  testID,
}: {
  title: string;
  selected?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.selectedChoice]}
    >
      <Text style={[styles.choiceText, selected && styles.selectedChoiceText]}>
        {selected ? '✓ ' : ''}
        {title}
      </Text>
    </Pressable>
  );
}
function Avatar({ id }: { id: string }) {
  const member = TASK_MEMBERS.find((item) => item.id === id);
  return member ? (
    <View
      accessibilityLabel={member.name}
      style={[styles.avatar, { backgroundColor: member.color }]}
    >
      <Text style={styles.avatarText}>{member.initials}</Text>
    </View>
  ) : null;
}
function Sheet({
  title,
  onClose,
  children,
  scroll = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <SafeModalArea style={styles.modalOuter}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            accessibilityLabel="Close panel"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <PlaygroundNotice />
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${title}`}
                onPress={onClose}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            {scroll ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.sheetContent}
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeModalArea>
    </Modal>
  );
}

type DragCallbacks = {
  onStart: (task: Task, x: number, y: number) => void;
  onDrag: (x: number, y: number) => void;
  onDrop: (id: string, x: number, y: number) => void;
  onCancel: () => void;
};
function DraggableTask({
  task,
  open,
  rename,
  dragging,
  callbacks,
  register,
  accessibleMove,
}: {
  task: Task;
  open: () => void;
  rename: (title: string) => void;
  dragging: boolean;
  callbacks: DragCallbacks;
  register: (node: View | null) => void;
  accessibleMove: (direction: string) => void;
}) {
  const active = useRef(false);
  const captured = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;
  const taskRef = useRef(task);
  taskRef.current = task;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  useEffect(() => setTitle(task.title), [task.title]);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => active.current,
      onMoveShouldSetPanResponderCapture: () => active.current,
      onPanResponderGrant: () => {
        captured.current = true;
      },
      onPanResponderMove: (_, gesture) => callbacksRef.current.onDrag(gesture.moveX, gesture.moveY),
      onPanResponderRelease: (_, gesture) => {
        if (active.current)
          callbacksRef.current.onDrop(
            taskRef.current.id,
            gesture.moveX || gesture.x0,
            gesture.moveY || gesture.y0,
          );
        active.current = false;
        captured.current = false;
      },
      onPanResponderTerminate: () => {
        active.current = false;
        captured.current = false;
        callbacksRef.current.onCancel();
      },
      onPanResponderTerminationRequest: () => !active.current,
    }),
  ).current;
  const done = task.checklist.filter((item) => item.done).length;
  return (
    <View
      ref={register}
      collapsable={false}
      style={[styles.taskCard, dragging && { opacity: 0.35 }]}
      {...pan.panHandlers}
    >
      <Pressable
        testID={`task-card-${task.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${task.id}: ${task.title}`}
        accessibilityHint="Opens task details. Long press and drag to move. Accessibility actions also move the task."
        accessibilityActions={[
          { name: 'moveLeft', label: 'Move to previous column' },
          { name: 'moveRight', label: 'Move to next column' },
          { name: 'moveUp', label: 'Move earlier in column' },
          { name: 'moveDown', label: 'Move later in column' },
        ]}
        onAccessibilityAction={(event) => accessibleMove(event.nativeEvent.actionName)}
        onPress={() => {
          if (!active.current) open();
        }}
        onLongPress={(event) => {
          if (editing) return;
          active.current = true;
          callbacks.onStart(task, event.nativeEvent.pageX, event.nativeEvent.pageY);
        }}
        delayLongPress={400}
        onPressOut={() => {
          if (active.current && !captured.current)
            setTimeout(() => {
              if (active.current && !captured.current) {
                active.current = false;
                callbacksRef.current.onCancel();
              }
            }, 160);
        }}
        style={styles.cardPressable}
      >
        <View style={styles.cardTop}>
          <Text style={styles.taskId}>{task.id}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rename ${task.id}`}
            hitSlop={9}
            onPress={() => setEditing(!editing)}
          >
            <Text style={styles.pencil}>✎</Text>
          </Pressable>
        </View>
        {editing ? (
          <TextInput
            autoFocus
            accessibilityLabel={`Title for ${task.id}`}
            value={title}
            onChangeText={setTitle}
            style={styles.inlineInput}
            onSubmitEditing={() => {
              if (title.trim()) rename(title.trim());
              setEditing(false);
            }}
            onBlur={() => {
              if (title.trim()) rename(title.trim());
              setEditing(false);
            }}
            returnKeyType="done"
          />
        ) : (
          <Text numberOfLines={2} style={styles.cardTitle}>
            {task.title}
          </Text>
        )}
        <View style={styles.row}>
          {task.labels.map((id) => {
            const label = TASK_LABELS.find((item) => item.id === id);
            return label ? (
              <View
                key={id}
                style={[
                  styles.taskLabel,
                  { borderColor: `${label.color}70`, backgroundColor: `${label.color}12` },
                ]}
              >
                <Text style={[styles.labelText, { color: label.color }]}>●</Text>
                <Text style={styles.labelText}>{label.name}</Text>
              </View>
            ) : null;
          })}
        </View>
        <View style={styles.cardBottom}>
          <Text style={[styles.cardMeta, task.priority === 'urgent' && { color: theme.danger }]}>
            {task.priority === 'high' || task.priority === 'urgent' ? '▂▅█' : '▂▃'}{' '}
            {task.dueDate ? formatDate(task.dueDate) : 'No date'}
            {task.checklist.length ? `  ·  ${done}/${task.checklist.length}` : ''}
          </Text>
          <View style={styles.row}>
            {task.assignees.slice(0, 2).map((id) => (
              <Avatar key={id} id={id} />
            ))}
          </View>
        </View>
      </Pressable>
    </View>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
function measured(node: View): Promise<{ x: number; y: number; width: number; height: number }> {
  // Touch pageX/pageY are React-root-relative. Window measurements include a
  // different viewport offset under Android edge-to-edge system bars.
  return new Promise((resolve) =>
    node.measure((_x, _y, width, height, pageX, pageY) =>
      resolve({ x: pageX, y: pageY, width, height }),
    ),
  );
}

export default function TasksScreen({ route, bug, navigate }: MobileScreenProps) {
  const [state, setState] = useSessionState<TasksState>('corkboard-state-v1', createTasksState);
  const currentState = useRef(state);
  currentState.current = state;
  const [boardId, setBoardId] = useSessionState('corkboard-board-v1', 'board-1');
  const [past, setPast] = useState<TasksState[]>([]);
  const [filters, setFilters] = useState<TaskFilters>({});
  const [view, setView] = useState<'board' | 'list'>('board');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'boards' | 'filters' | 'new' | null>(null);
  const [newStatus, setNewStatus] = useState<TaskStatus>('todo');
  const [boardQuery, setBoardQuery] = useState('');
  const [showDone, setShowDone] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(route === 'error');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragTask, setDragTask] = useState<Task | null>(null);
  const dragPosition = useRef(new Animated.ValueXY()).current;
  const screenRef = useRef<View>(null);
  const screenTop = useRef(0);
  const screenWidth = useRef(390);
  const boardScroll = useRef<ScrollView>(null);
  const horizontalOffset = useRef(0);
  const columns = useRef(new Map<TaskStatus, View>());
  const columnScrolls = useRef(new Map<TaskStatus, ScrollView>());
  const verticalOffsets = useRef(new Map<TaskStatus, number>());
  const columnViewport = useRef<{ top: number; height: number } | null>(null);
  const dragPointer = useRef<{ x: number; y: number } | null>(null);
  const cards = useRef(new Map<string, View>());
  const board = state.boards.find((item) => item.id === boardId) ?? state.boards[0];
  const boardTasks = getBoardTasks(state, board.id);
  const visible = boardTasks.filter(
    (task) =>
      matchesTask(
        task,
        bug === 'filter-ignores-assignee' ? { ...filters, assignee: '' } : filters,
      ) &&
      (showDone || task.status !== 'done'),
  );
  const selected = state.tasks.find((task) => task.id === selectedId);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 350);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (route.startsWith('task/')) {
      const id = decodeURIComponent(route.slice(5));
      const task = state.tasks.find((item) => item.id === id);
      if (task) {
        setBoardId(task.boardId);
        setSelectedId(id);
      }
    } else setSelectedId(null);
    if (route.startsWith('board/')) {
      const id = decodeURIComponent(route.slice(6));
      if (state.boards.some((item) => item.id === id)) setBoardId(id);
    }
    if (route === 'empty') {
      setFilters({ query: 'No seeded task matches this phrase' });
    }
    if (route === 'error') setError(true);
  }, [route]);
  useEffect(() => {
    if (!notice) return;
    AccessibilityInfo.announceForAccessibility(notice);
    const timer = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!dragTask) return;
    const timer = setInterval(() => {
      const pointer = dragPointer.current;
      if (!pointer) return;
      const available = TASK_COLUMNS.filter((column) => showDone || column.id !== 'done');
      if (pointer.x < 40 || pointer.x > screenWidth.current - 40) {
        const maximum = available.length * 285 + 19 - screenWidth.current;
        horizontalOffset.current = Math.max(
          0,
          Math.min(maximum, horizontalOffset.current + (pointer.x < 40 ? -16 : 16)),
        );
        boardScroll.current?.scrollTo({ x: horizontalOffset.current, animated: false });
      }
      const viewport = columnViewport.current;
      if (!viewport) return;
      const index = Math.max(
        0,
        Math.min(
          available.length - 1,
          Math.floor((pointer.x + horizontalOffset.current - 17) / 285),
        ),
      );
      const status = available[index].id;
      const direction =
        pointer.y > viewport.top + viewport.height - 55
          ? 1
          : pointer.y < viewport.top + 65
            ? -1
            : 0;
      if (direction) {
        const offset = Math.max(0, (verticalOffsets.current.get(status) ?? 0) + direction * 16);
        columnScrolls.current.get(status)?.scrollTo({ y: offset, animated: false });
      }
    }, 40);
    return () => clearInterval(timer);
  }, [dragTask?.id, showDone]);

  function commit(next: TasksState, message = 'Task updated') {
    const previous = currentState.current;
    if (next === previous) return;
    setPast((items) => [...items.slice(-19), previous]);
    currentState.current = next;
    setState(next);
    setNotice(message);
  }
  function undo() {
    if (!past.length) return;
    currentState.current = past[past.length - 1];
    setState(past[past.length - 1]);
    setPast(past.slice(0, -1));
    setNotice('Change undone');
  }
  function move(
    id: string,
    status: TaskStatus,
    position: number,
    draft?: Pick<Task, 'title' | 'description'>,
  ) {
    // Save draft fields before recording the move. React batches the render, while
    // undoing the move restores the edited card instead of discarding its draft.
    const saved = draft ? updateTask(currentState.current, id, draft) : currentState.current;
    commit(saved);
    let next = moveTask(saved, id, status, position);
    if (bug === 'move-drops-label' && saved.tasks.find((task) => task.id === id)?.status !== status)
      next = updateTask(next, id, { labels: [] });
    commit(next, `${id} moved to ${TASK_COLUMNS.find((column) => column.id === status)?.name}`);
  }
  function refresh() {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setError(false);
      setNotice('Board is up to date');
    }, 600);
  }
  function openTask(task: Task) {
    setSelectedId(task.id);
    navigate('tasks', `task/${task.id}`);
  }
  function closeTask() {
    setSelectedId(null);
    navigate('tasks', `board/${board.id}`);
  }
  function positionDrag(x: number, y: number) {
    dragPosition.setValue({ x: x - 120, y: y - screenTop.current - 35 });
    dragPointer.current = { x, y };
  }
  const dragCallbacks: DragCallbacks = {
    onStart: (task, x, y) => {
      columns.current.get(task.status)?.measure((_x, _y, _width, height, _pageX, pageY) => {
        columnViewport.current = { top: pageY, height };
      });
      setDragTask(task);
      positionDrag(x, y);
      setNotice(`${task.id} picked up. Drag to a new position or column.`);
    },
    onDrag: positionDrag,
    onCancel: () => {
      dragPointer.current = null;
      setDragTask(null);
    },
    onDrop: async (id, x, y) => {
      dragPointer.current = null;
      const columnPositions = await Promise.all(
        [...columns.current.entries()].map(async ([status, node]) => ({
          status,
          ...(await measured(node)),
        })),
      );
      const target = columnPositions.find(
        (item) =>
          x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height,
      );
      if (target) {
        const ordered = getBoardTasks(state, board.id, target.status).filter(
          (task) => task.id !== id,
        );
        const positions = await Promise.all(
          ordered.map(async (task) => ({
            task,
            bounds: cards.current.get(task.id) ? await measured(cards.current.get(task.id)!) : null,
          })),
        );
        const before = positions.find(
          (item) => item.bounds && y < item.bounds.y + item.bounds.height / 2,
        );
        move(
          id,
          target.status,
          before ? ordered.findIndex((task) => task.id === before.task.id) : ordered.length,
        );
      }
      setDragTask(null);
    },
  };
  function accessibleMove(task: Task, action: string) {
    const column = TASK_COLUMNS.findIndex((item) => item.id === task.status);
    const status =
      TASK_COLUMNS[
        Math.max(
          0,
          Math.min(4, column + (action === 'moveLeft' ? -1 : action === 'moveRight' ? 1 : 0)),
        )
      ].id;
    move(
      task.id,
      status,
      task.position + (action === 'moveUp' ? -1 : action === 'moveDown' ? 1 : 0),
    );
  }
  function renderTask(task: Task) {
    return (
      <DraggableTask
        key={task.id}
        task={task}
        open={() => openTask(task)}
        rename={(title) =>
          commit(updateTask(currentState.current, task.id, { title }), 'Task renamed')
        }
        dragging={dragTask?.id === task.id}
        callbacks={dragCallbacks}
        register={(node) => {
          if (node) cards.current.set(task.id, node);
          else cards.current.delete(task.id);
        }}
        accessibleMove={(action) => accessibleMove(task, action)}
      />
    );
  }

  return (
    <View
      ref={screenRef}
      onLayout={(event) => {
        screenWidth.current = event.nativeEvent.layout.width;
        screenRef.current?.measure((_x, _y, _width, _height, _pageX, pageY) => {
          screenTop.current = pageY;
        });
      }}
      style={styles.screen}
    >
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>▦</Text>
            </View>
            <Text style={styles.brandText}>Corkboard</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Browse all boards"
            onPress={() => setSheet('boards')}
            style={styles.browseButton}
          >
            <Text style={styles.browseText}>All boards ↗</Text>
          </Pressable>
        </View>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.boardTitle}>
            {board.name}
          </Text>
          <Pressable
            testID="task-new-button"
            accessibilityRole="button"
            accessibilityLabel="New task"
            onPress={() => setSheet('new')}
            style={styles.newButton}
          >
            <Text style={styles.newButtonText}>＋</Text>
          </Pressable>
        </View>
        <Text style={styles.boardDescription}>{board.description}</Text>
        <View style={styles.headerBottom}>
          <View style={styles.row}>
            <Choice title="Board" selected={view === 'board'} onPress={() => setView('board')} />
            <Choice title="List" selected={view === 'list'} onPress={() => setView('list')} />
          </View>
          <Text style={styles.progressText}>
            {boardTasks.filter((task) => task.status === 'done').length} of {boardTasks.length}{' '}
            complete
          </Text>
        </View>
      </View>
      <View style={styles.toolbar}>
        <TextInput
          accessibilityLabel="Search tasks"
          placeholder="Search tasks…"
          placeholderTextColor="#a798b2"
          value={filters.query ?? ''}
          onChangeText={(query) => setFilters({ ...filters, query })}
          style={styles.search}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter tasks"
          onPress={() => setSheet('filters')}
          style={styles.filterButton}
        >
          <Text style={styles.filterText}>
            Filter
            {[filters.label, filters.assignee, filters.priority].filter(Boolean).length
              ? ` (${[filters.label, filters.assignee, filters.priority].filter(Boolean).length})`
              : ''}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo last change"
          disabled={!past.length}
          accessibilityState={{ disabled: !past.length }}
          onPress={undo}
          style={styles.undoButton}
        >
          <Text style={[styles.undoText, !past.length && { opacity: 0.3 }]}>↶</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.purple} />
          <Text style={styles.emptyDetail}>Loading board…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>This board couldn’t load</Text>
          <Text style={styles.emptyDetail}>
            Your work is still here. Try loading the board again.
          </Text>
          <TaskButton
            title="Try again"
            onPress={() => {
              setError(false);
              refresh();
            }}
          />
        </View>
      ) : visible.length === 0 && Object.values(filters).some(Boolean) ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <Text style={styles.emptyTitle}>No tasks match your filters</Text>
          <Text style={styles.emptyDetail}>
            Try another search or clear your filters to see the whole board.
          </Text>
          <TaskButton title="Clear filters" secondary onPress={() => setFilters({})} />
        </ScrollView>
      ) : view === 'list' ? (
        <FlatList
          data={visible}
          keyExtractor={(task) => task.id}
          renderItem={({ item }) => renderTask(item)}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={refresh}
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          ListEmptyComponent={
            <View style={styles.emptyColumn}>
              <Text style={styles.emptyTitle}>A fresh start</Text>
              <Text style={styles.emptyDetail}>
                Add a task to give your next idea a place to grow.
              </Text>
              <TaskButton title="New task" onPress={() => setSheet('new')} />
            </View>
          }
        />
      ) : (
        <ScrollView
          ref={boardScroll}
          horizontal
          onScroll={(event) => {
            horizontalOffset.current = event.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          scrollEnabled={!dragTask}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.boardColumns}
          removeClippedSubviews={false}
        >
          {TASK_COLUMNS.filter((column) => showDone || column.id !== 'done').map((column) => (
            <View
              key={column.id}
              ref={(node) => {
                if (node) columns.current.set(column.id, node);
                else columns.current.delete(column.id);
              }}
              collapsable={false}
              style={styles.column}
            >
              <View style={styles.columnHeading}>
                <View style={[styles.statusDot, { backgroundColor: column.color }]} />
                <Text style={styles.columnTitle}>{column.name}</Text>
                <Text style={styles.columnCount}>
                  {visible.filter((task) => task.status === column.id).length}
                </Text>
              </View>
              <ScrollView
                ref={(node) => {
                  if (node) columnScrolls.current.set(column.id, node);
                  else columnScrolls.current.delete(column.id);
                }}
                onScroll={(event) => {
                  verticalOffsets.current.set(column.id, event.nativeEvent.contentOffset.y);
                }}
                scrollEventThrottle={16}
                nestedScrollEnabled
                scrollEnabled={!dragTask}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={refresh}
                    tintColor={theme.purple}
                  />
                }
                contentContainerStyle={styles.columnContent}
              >
                {visible.filter((task) => task.status === column.id).map(renderTask)}
                {!visible.some((task) => task.status === column.id) && (
                  <View style={styles.emptyColumn}>
                    <Text style={styles.emptyDetail}>No tasks here yet</Text>
                    <Text style={styles.emptyHint}>Drop a task here or add a new one.</Text>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add task to ${column.name}`}
                  onPress={() => {
                    setNewStatus(column.id);
                    setSheet('new');
                  }}
                  style={styles.addTask}
                >
                  <Text style={styles.addTaskText}>＋ Add task</Text>
                </Pressable>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
      {dragTask && (
        <Animated.View
          pointerEvents="none"
          style={[styles.dragPreview, { transform: dragPosition.getTranslateTransform() }]}
        >
          <Text style={styles.taskId}>{dragTask.id} · Moving</Text>
          <Text style={styles.cardTitle}>{dragTask.title}</Text>
        </Animated.View>
      )}
      {notice && !selected && (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <Text numberOfLines={2} style={styles.noticeText}>
            {notice}
          </Text>
          {past.length > 0 && (
            <Pressable accessibilityRole="button" onPress={undo}>
              <Text style={styles.noticeUndo}>Undo</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={() => setNotice('')}
          >
            <Text style={styles.noticeUndo}>×</Text>
          </Pressable>
        </View>
      )}
      {sheet === 'boards' && (
        <Sheet title="Find your next focus" onClose={() => setSheet(null)} scroll={false}>
          <View style={styles.boardSearch}>
            <TextInput
              accessibilityLabel="Search boards"
              placeholder="Search 80 boards…"
              value={boardQuery}
              onChangeText={setBoardQuery}
              style={styles.input}
            />
          </View>
          <FlatList
            data={state.boards.filter((item) =>
              item.name.toLowerCase().includes(boardQuery.toLowerCase()),
            )}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.boardList}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setBoardId(item.id);
                  setFilters({});
                  setSheet(null);
                  navigate('tasks', `board/${item.id}`);
                }}
                style={styles.boardOption}
              >
                <View style={[styles.boardOptionIcon, { backgroundColor: `${item.color}20` }]}>
                  <Text style={{ color: item.color, fontSize: 22 }}>▦</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boardOptionTitle}>{item.name}</Text>
                  <Text style={styles.boardOptionDetail}>
                    {state.tasks.filter((task) => task.boardId === item.id).length} tasks
                  </Text>
                </View>
                <Text style={styles.boardOptionDetail}>{board.id === item.id ? '✓' : '›'}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyDetail}>No boards match your search.</Text>
            }
          />
        </Sheet>
      )}
      {sheet === 'filters' && (
        <Sheet title="Filter tasks" onClose={() => setSheet(null)}>
          <Text style={styles.sectionLabel}>ASSIGNEE</Text>
          <View style={styles.choices}>
            <Choice
              title="Everyone"
              selected={!filters.assignee}
              onPress={() => setFilters({ ...filters, assignee: '' })}
            />
            <Choice
              title="Unassigned"
              selected={filters.assignee === 'unassigned'}
              onPress={() => setFilters({ ...filters, assignee: 'unassigned' })}
            />
            {TASK_MEMBERS.map((member) => (
              <Choice
                key={member.id}
                title={member.name}
                selected={filters.assignee === member.id}
                onPress={() => setFilters({ ...filters, assignee: member.id })}
              />
            ))}
          </View>
          <Text style={styles.sectionLabel}>LABEL</Text>
          <View style={styles.choices}>
            <Choice
              title="All labels"
              selected={!filters.label}
              onPress={() => setFilters({ ...filters, label: '' })}
            />
            {TASK_LABELS.map((label) => (
              <Choice
                key={label.id}
                title={label.name}
                selected={filters.label === label.id}
                onPress={() => setFilters({ ...filters, label: label.id })}
              />
            ))}
          </View>
          <Text style={styles.sectionLabel}>PRIORITY</Text>
          <View style={styles.choices}>
            <Choice
              title="All priorities"
              selected={!filters.priority}
              onPress={() => setFilters({ ...filters, priority: '' })}
            />
            {priorityOptions.map((priority) => (
              <Choice
                key={priority}
                title={priority[0].toUpperCase() + priority.slice(1)}
                selected={filters.priority === priority}
                onPress={() => setFilters({ ...filters, priority })}
              />
            ))}
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Show completed</Text>
            <Switch
              accessibilityLabel="Show completed"
              value={showDone}
              onValueChange={setShowDone}
              trackColor={{ true: theme.purple }}
            />
          </View>
          <TaskButton
            title={`Show ${visible.length} matching tasks`}
            onPress={() => setSheet(null)}
          />
          <TaskButton title="Clear filters" secondary onPress={() => setFilters({})} />
        </Sheet>
      )}
      {sheet === 'new' && (
        <NewTaskSheet
          status={newStatus}
          onClose={() => {
            setSheet(null);
            setNewStatus('todo');
          }}
          onCreate={(title, description, status, priority) => {
            const next = createTask(state, board.id, title, status);
            const created = next.tasks[next.tasks.length - 1];
            commit(
              updateTask(next, created.id, { description, priority }),
              `${created.id} created`,
            );
            setSheet(null);
            setNewStatus('todo');
          }}
        />
      )}
      {selected && (
        <TaskDetail
          task={selected}
          onClose={closeTask}
          onPatch={(patch) => commit(updateTask(currentState.current, selected.id, patch))}
          onMove={(status, index, draft) =>
            move(
              selected.id,
              status,
              index ?? getBoardTasks(currentState.current, board.id, status).length,
              draft,
            )
          }
          onDelete={() => {
            commit(deleteTask(currentState.current, selected.id), `${selected.id} deleted`);
            closeTask();
          }}
          onUndo={undo}
          canUndo={past.length > 0}
        />
      )}
    </View>
  );
}

function NewTaskSheet({
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
  return (
    <Sheet title="New task" onClose={onClose}>
      <Text style={styles.fieldLabel}>Title</Text>
      <TextInput
        testID="task-create-title"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        autoFocus
        accessibilityLabel="Title"
        placeholder="What needs to be done?"
        value={title}
        onChangeText={(value) => {
          setTitle(value);
          setError('');
        }}
        style={styles.input}
      />
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      <Text style={styles.fieldLabel}>Description</Text>
      <TextInput
        accessibilityLabel="Description"
        multiline
        placeholder="Add details, context, or an idea…"
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.multiline]}
      />
      <Text style={styles.sectionLabel}>STATUS</Text>
      <View style={styles.choices}>
        {TASK_COLUMNS.map((column) => (
          <Choice
            key={column.id}
            title={column.name}
            selected={status === column.id}
            onPress={() => setStatus(column.id)}
          />
        ))}
      </View>
      <Text style={styles.sectionLabel}>PRIORITY</Text>
      <View style={styles.choices}>
        {priorityOptions.map((item) => (
          <Choice
            key={item}
            title={item[0].toUpperCase() + item.slice(1)}
            selected={priority === item}
            onPress={() => setPriority(item)}
          />
        ))}
      </View>
      <TaskButton
        testID="task-create-submit"
        title="Create task"
        onPress={() => {
          if (!title.trim()) {
            setError('Give your task a title.');
            return;
          }
          onCreate(title.trim(), description.trim(), status, priority);
        }}
      />
    </Sheet>
  );
}

function TaskDetail({
  task,
  onClose,
  onPatch,
  onMove,
  onDelete,
  onUndo,
  canUndo,
}: {
  task: Task;
  onClose: () => void;
  onPatch: (patch: Parameters<typeof updateTask>[2]) => void;
  onMove: (status: TaskStatus, index?: number, draft?: Pick<Task, 'title' | 'description'>) => void;
  onDelete: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [item, setItem] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
  }, [task.title, task.description]);
  function draft() {
    return { title: title.trim() || task.title, description };
  }
  function close() {
    onPatch(draft());
    onClose();
  }
  function moveTo(status: TaskStatus, index?: number) {
    onMove(status, index, draft());
  }
  function remove() {
    onPatch(draft());
    onDelete();
  }
  function undoChange() {
    if (title !== task.title || description !== task.description) {
      setTitle(task.title);
      setDescription(task.description);
    } else onUndo();
  }
  return (
    <Sheet title={task.id} onClose={close}>
      <Text style={styles.fieldLabel}>Task title</Text>
      <TextInput
        testID="task-detail-title"
        accessibilityLabel="Task title"
        multiline
        value={title}
        onChangeText={setTitle}
        onEndEditing={(event) => {
          const nextTitle = event.nativeEvent.text.trim() || task.title;
          setTitle(nextTitle);
          onPatch({ ...draft(), title: nextTitle });
        }}
        style={[styles.input, styles.detailTitle]}
      />
      <Text style={styles.sectionLabel}>STATUS</Text>
      <View style={styles.choices}>
        {TASK_COLUMNS.map((column) => (
          <Choice
            testID={`task-status-${column.id}`}
            key={column.id}
            title={column.name}
            selected={task.status === column.id}
            onPress={() => {
              if (task.status !== column.id) moveTo(column.id);
            }}
          />
        ))}
      </View>
      <View style={styles.row}>
        <TaskButton
          title="Move earlier"
          secondary
          disabled={task.position === 0}
          onPress={() => moveTo(task.status, task.position - 1)}
        />
        <TaskButton
          title="Move later"
          secondary
          onPress={() => moveTo(task.status, task.position + 1)}
        />
      </View>
      <Text style={styles.sectionLabel}>PRIORITY</Text>
      <View style={styles.choices}>
        {priorityOptions.map((priority) => (
          <Choice
            key={priority}
            title={priority[0].toUpperCase() + priority.slice(1)}
            selected={task.priority === priority}
            onPress={() => onPatch({ priority })}
          />
        ))}
      </View>
      <Text style={styles.sectionLabel}>ASSIGNEES</Text>
      <View style={styles.choices}>
        {TASK_MEMBERS.map((member) => (
          <Choice
            key={member.id}
            title={member.name}
            selected={task.assignees.includes(member.id)}
            onPress={() =>
              onPatch({
                assignees: task.assignees.includes(member.id)
                  ? task.assignees.filter((id) => id !== member.id)
                  : [...task.assignees, member.id],
              })
            }
          />
        ))}
      </View>
      <Text style={styles.sectionLabel}>LABELS</Text>
      <View style={styles.choices}>
        {TASK_LABELS.map((label) => (
          <Choice
            key={label.id}
            title={label.name}
            selected={task.labels.includes(label.id)}
            onPress={() =>
              onPatch({
                labels: task.labels.includes(label.id)
                  ? task.labels.filter((id) => id !== label.id)
                  : [...task.labels, label.id],
              })
            }
          />
        ))}
      </View>
      <Text style={styles.sectionLabel}>DUE DATE</Text>
      <TaskButton
        title={
          task.dueDate
            ? `Due ${formatDate(task.dueDate)}, ${task.dueDate.slice(0, 4)}`
            : 'Set due date'
        }
        secondary
        onPress={() => setDateOpen(!dateOpen)}
      />
      {dateOpen && (
        <TaskCalendar
          value={task.dueDate}
          onChange={(dueDate) => {
            onPatch({ dueDate });
            setDateOpen(false);
          }}
        />
      )}
      {task.dueDate && (
        <Pressable accessibilityRole="button" onPress={() => onPatch({ dueDate: '' })}>
          <Text style={styles.textButton}>Remove due date</Text>
        </Pressable>
      )}
      <Text style={styles.sectionLabel}>DESCRIPTION</Text>
      <TextInput
        accessibilityLabel="Description"
        multiline
        value={description}
        onChangeText={setDescription}
        onEndEditing={(event) => onPatch({ ...draft(), description: event.nativeEvent.text })}
        placeholder="Add a little context…"
        style={[styles.input, styles.multiline]}
      />
      <View style={styles.spreadRow}>
        <Text style={styles.sectionLabel}>CHECKLIST</Text>
        <Text style={styles.progressText}>
          {task.checklist.filter((current) => current.done).length} / {task.checklist.length}
        </Text>
      </View>
      {task.checklist.map((current) => (
        <View key={current.id} style={styles.checklistRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: current.done }}
            accessibilityLabel={current.title}
            onPress={() =>
              onPatch({
                checklist: task.checklist.map((check) =>
                  check.id === current.id ? { ...check, done: !check.done } : check,
                ),
              })
            }
            style={styles.checklistToggle}
          >
            <View style={[styles.checkbox, current.done && styles.checkedBox]}>
              {current.done && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={[styles.checklistText, current.done && styles.completedText]}>
              {current.title}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete checklist item ${current.title}`}
            hitSlop={9}
            onPress={() =>
              onPatch({ checklist: task.checklist.filter((check) => check.id !== current.id) })
            }
          >
            <Text style={styles.textButton}>×</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.row}>
        <TextInput
          testID="task-checklist-new"
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          accessibilityLabel="New checklist item"
          placeholder="Add a checklist item…"
          value={item}
          onChangeText={setItem}
          style={[styles.input, { flex: 1 }]}
        />
        <TaskButton
          testID="task-checklist-add"
          title="Add"
          disabled={!item.trim()}
          secondary
          onPress={() => {
            onPatch({
              checklist: [
                ...task.checklist,
                {
                  id: `${task.id}-item-${Math.max(0, ...task.checklist.map((check) => Number(check.id.split('-').at(-1)) || 0)) + 1}`,
                  title: item.trim(),
                  done: false,
                },
              ],
            });
            setItem('');
          }}
        />
      </View>
      <Text style={styles.detailNote}>Changes save automatically for this session.</Text>
      {canUndo && (
        <TaskButton
          testID="task-detail-undo"
          title="Undo last change"
          secondary
          onPress={undoChange}
        />
      )}
      {confirmDelete ? (
        <View style={styles.deleteBox}>
          <Text style={styles.fieldLabel}>Delete this task?</Text>
          <Text style={styles.emptyDetail}>You can undo this change.</Text>
          <View style={styles.row}>
            <TaskButton title="Cancel" secondary onPress={() => setConfirmDelete(false)} />
            <TaskButton title="Delete task" onPress={remove} />
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmDelete(true)}
          style={styles.deleteButton}
        >
          <Text style={styles.error}>Delete task</Text>
        </Pressable>
      )}
      <TaskButton title="Done" onPress={close} />
    </Sheet>
  );
}

function TaskCalendar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [month, setMonth] = useState(() => new Date(`${value || '2026-10-01'}T12:00:00`));
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return (
    <View style={styles.calendar}>
      <View style={styles.spreadRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          style={styles.calendarArrow}
        >
          <Text style={styles.closeText}>‹</Text>
        </Pressable>
        <Text style={styles.fieldLabel}>
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          style={styles.calendarArrow}
        >
          <Text style={styles.closeText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calendarGrid}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
          <Text key={`day-${index}`} style={styles.calendarWeekday}>
            {day}
          </Text>
        ))}
        {Array.from({ length: start }, (_, index) => (
          <View key={`blank-${index}`} style={styles.calendarCell} />
        ))}
        {Array.from({ length: days }, (_, index) => {
          const iso = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={iso}
              accessibilityState={{ selected: value === iso }}
              key={iso}
              style={[styles.calendarCell, value === iso && styles.calendarSelected]}
              onPress={() => onChange(iso)}
            >
              <Text style={[styles.calendarDay, value === iso && { color: '#fff' }]}>
                {index + 1}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.background },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 15 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: {
    backgroundColor: theme.pale,
    width: 27,
    height: 27,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: { color: theme.purple, fontSize: 22 },
  brandText: { color: theme.ink, fontWeight: '700', fontSize: 17, letterSpacing: -0.5 },
  browseButton: { padding: 8 },
  browseText: { color: theme.muted, fontSize: 11 },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  boardTitle: { color: theme.ink, fontSize: 26, fontWeight: '600', letterSpacing: -0.8, flex: 1 },
  newButton: {
    width: 36,
    height: 36,
    borderRadius: 7,
    backgroundColor: theme.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonText: { color: '#fff', fontSize: 25, lineHeight: 28 },
  boardDescription: {
    color: theme.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
    marginBottom: 20,
  },
  headerBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  spreadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { color: theme.muted, fontSize: 10 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fefdfF',
  },
  search: { flex: 1, fontSize: 12, color: theme.ink, paddingVertical: 8 },
  filterButton: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 5,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  filterText: { fontSize: 11, color: theme.muted },
  undoButton: { width: 30, alignItems: 'center', paddingVertical: 4 },
  undoText: { fontSize: 25, color: theme.purple },
  boardColumns: { paddingHorizontal: 17, paddingTop: 19, paddingBottom: 15, gap: 15 },
  column: { width: 270 },
  columnHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  columnTitle: { fontSize: 12, fontWeight: '600', color: theme.ink },
  columnCount: { fontSize: 11, color: theme.muted },
  columnContent: { paddingBottom: 40, gap: 10 },
  taskCard: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 2,
  },
  cardPressable: { padding: 13, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskId: { fontSize: 10, color: theme.muted, letterSpacing: 0.3 },
  pencil: { color: '#b4a5bf', fontSize: 16 },
  cardTitle: { fontSize: 14, fontWeight: '500', lineHeight: 21, color: theme.ink, minHeight: 42 },
  taskLabel: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    gap: 5,
  },
  labelText: { fontSize: 9, color: theme.muted },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 25,
  },
  cardMeta: { color: theme.muted, fontSize: 10 },
  avatar: {
    height: 25,
    width: 25,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 9, color: '#5b5064', fontWeight: '600' },
  addTask: { padding: 12 },
  addTaskText: { fontSize: 12, color: theme.muted },
  emptyColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 25,
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.border,
    borderRadius: 8,
  },
  emptyTitle: { color: theme.ink, fontSize: 19, fontWeight: '600', textAlign: 'center' },
  emptyDetail: { color: theme.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  emptyHint: { color: theme.muted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 30 },
  listContent: { padding: 17, gap: 12 },
  dragPreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 245,
    padding: 15,
    borderWidth: 2,
    borderColor: '#b59bc9',
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 14,
    shadowColor: '#3b2450',
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    gap: 7,
  },
  notice: {
    position: 'absolute',
    bottom: 12,
    left: 15,
    right: 15,
    backgroundColor: '#fff',
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 7,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 5,
  },
  noticeText: { flex: 1, fontSize: 11, color: theme.muted },
  noticeUndo: { color: theme.purple, fontSize: 12 },
  button: {
    minHeight: 43,
    backgroundColor: theme.purple,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  secondaryButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: theme.border },
  choice: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fff',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  choiceText: { color: theme.muted, fontSize: 11 },
  selectedChoice: { backgroundColor: theme.pale, borderColor: '#b7a1c8' },
  selectedChoiceText: { color: theme.purple, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  modalOuter: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#25183066' },
  sheet: {
    maxHeight: '93%',
    minHeight: '55%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 35,
    height: 4,
    backgroundColor: '#d6ccde',
    borderRadius: 3,
    alignSelf: 'center',
    marginVertical: 10,
  },
  sheetHeader: {
    paddingHorizontal: 22,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { fontSize: 20, fontWeight: '600', color: theme.ink, letterSpacing: -0.4 },
  closeButton: { paddingHorizontal: 8 },
  closeText: { fontSize: 25, color: theme.muted },
  sheetContent: { padding: 22, paddingBottom: 30, gap: 13 },
  sectionLabel: {
    fontSize: 10,
    color: theme.muted,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginTop: 7,
  },
  fieldLabel: { fontSize: 12, color: theme.ink, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: '#fefdfF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.ink,
    minHeight: 44,
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: '#b39bc7',
    padding: 5,
    borderRadius: 4,
    color: theme.ink,
    fontSize: 14,
  },
  multiline: { minHeight: 120, textAlignVertical: 'top', lineHeight: 21 },
  detailTitle: { fontSize: 21, fontWeight: '500', lineHeight: 29, minHeight: 80 },
  boardSearch: { padding: 17 },
  boardList: { paddingHorizontal: 16, paddingBottom: 35 },
  boardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2edf6',
  },
  boardOptionIcon: {
    width: 37,
    height: 37,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  boardOptionTitle: { fontSize: 13, color: theme.ink, marginBottom: 5 },
  boardOptionDetail: { fontSize: 10, color: theme.muted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  checklistRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checklistToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 9,
    paddingVertical: 5,
  },
  checkbox: {
    height: 19,
    width: 19,
    borderWidth: 1,
    borderColor: '#b9a6c7',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: { backgroundColor: theme.purple, borderColor: theme.purple },
  checkboxCheck: { color: '#fff', fontSize: 13 },
  checklistText: { flex: 1, fontSize: 12, lineHeight: 19, color: theme.muted },
  completedText: { textDecorationLine: 'line-through', color: '#ac9cb7' },
  textButton: { color: theme.purple, fontSize: 12, padding: 3 },
  detailNote: {
    color: theme.muted,
    fontSize: 10,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 10,
  },
  deleteButton: { alignItems: 'center', padding: 9 },
  error: { color: theme.danger, fontSize: 12 },
  deleteBox: {
    backgroundColor: '#fbf3f5',
    borderRadius: 8,
    padding: 15,
    gap: 14,
    alignItems: 'center',
  },
  calendar: { borderWidth: 1, borderColor: theme.border, borderRadius: 8, padding: 10 },
  calendarArrow: { paddingHorizontal: 14, paddingVertical: 4 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: {
    width: '14.2857%',
    paddingVertical: 10,
    textAlign: 'center',
    color: theme.muted,
    fontSize: 11,
  },
  calendarCell: {
    width: '14.2857%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  calendarSelected: { backgroundColor: theme.purple },
  calendarDay: { fontSize: 13, color: theme.ink },
});
