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
  View,
  type TextInputProps,
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
import {
  BottomTabs,
  Button as SharedButton,
  colors,
  Icon,
  IconButton,
  SafeModalArea,
  useSessionState,
  type MobileScreenProps,
} from '../ui';
import { Input } from '../components/ui/input';

const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const theme = colors;

function TaskInput(props: TextInputProps) {
  return (
    <Input
      placeholderTextColor={theme.muted}
      selectionColor={theme.primary}
      keyboardAppearance="dark"
      {...props}
    />
  );
}

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
    <SharedButton
      title={title}
      onPress={onPress}
      variant={secondary ? 'secondary' : 'primary'}
      disabled={disabled}
      testID={testID}
    />
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
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selectedChoice,
        pressed && { opacity: 0.65 },
      ]}
    >
      {selected && <Icon name="check" size={14} color={theme.ink} />}
      <Text style={[styles.choiceText, selected && styles.selectedChoiceText]}>{title}</Text>
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
      <SafeModalArea accessibilityViewIsModal style={styles.modalOuter}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            accessibilityLabel="Close panel"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {title}
              </Text>
              <IconButton icon="x" label={`Close ${title}`} onPress={onClose} />
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
            style={styles.renameButton}
            onPress={() => setEditing(!editing)}
          >
            <Text style={styles.pencil}>Edit</Text>
          </Pressable>
        </View>
        {editing ? (
          <TaskInput
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
              <View key={id} style={styles.taskLabel}>
                <View style={[styles.labelDot, { backgroundColor: label.color }]} />
                <Text style={styles.labelText}>{label.name}</Text>
              </View>
            ) : null;
          })}
        </View>
        <View style={styles.cardBottom}>
          <View style={styles.metaGroup}>
            <View accessibilityLabel={`${task.priority} priority`} style={styles.priorityMark}>
              {[4, 8, 12].map((height, index) => (
                <View
                  key={height}
                  style={{
                    width: 3,
                    height,
                    backgroundColor:
                      index <= priorityOptions.indexOf(task.priority)
                        ? task.priority === 'urgent'
                          ? theme.danger
                          : theme.muted
                        : theme.border,
                  }}
                />
              ))}
            </View>
            <Text style={styles.cardMeta}>
              {task.dueDate ? formatDate(task.dueDate) : 'No date'}
            </Text>
            {!!task.checklist.length && (
              <>
                <Icon name="check" size={13} color={theme.muted} />
                <Text style={styles.cardMeta}>
                  {done}/{task.checklist.length}
                </Text>
              </>
            )}
          </View>
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
      setFilters({ query: 'No matching task' });
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
        <View style={styles.boardHeading}>
          <Text
            testID="task-board-title"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.boardTitle}
          >
            {board.name}
          </Text>
          <Text style={styles.progressText}>
            {boardTasks.filter((task) => task.status === 'done').length} of {boardTasks.length}{' '}
            complete
          </Text>
        </View>
        <IconButton icon="grid" label="Browse all boards" onPress={() => setSheet('boards')} />
        <Pressable
          testID="task-new-button"
          accessibilityRole="button"
          accessibilityLabel="New task"
          onPress={() => setSheet('new')}
          style={({ pressed }) => [styles.newButton, pressed && { opacity: 0.7 }]}
        >
          <Icon name="plus" size={20} color={theme.primaryForeground} />
        </Pressable>
      </View>
      <View style={styles.toolbar}>
        <View style={styles.searchField}>
          <Icon name="search" size={17} color={theme.muted} />
          <TaskInput
            testID="task-search"
            accessibilityLabel="Search tasks"
            placeholder="Search tasks…"
            value={filters.query ?? ''}
            onChangeText={(query) => setFilters({ ...filters, query })}
            style={styles.search}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Filter tasks"
          onPress={() => setSheet('filters')}
          style={styles.filterButton}
        >
          <Icon name="filter" size={18} color={theme.ink} />
          {!![filters.label, filters.assignee, filters.priority].filter(Boolean).length && (
            <Text style={styles.filterText}>
              {[filters.label, filters.assignee, filters.priority].filter(Boolean).length}
            </Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo last change"
          disabled={!past.length}
          accessibilityState={{ disabled: !past.length }}
          onPress={undo}
          style={[styles.undoButton, !past.length && { opacity: 0.35 }]}
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
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
          <TaskButton
            testID="task-clear-filters"
            title="Clear filters"
            secondary
            onPress={() => setFilters({})}
          />
        </ScrollView>
      ) : view === 'list' ? (
        <FlatList
          style={styles.contentArea}
          testID="task-list"
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
              <Text style={styles.emptyTitle}>No tasks in this board</Text>
              <Text style={styles.emptyDetail}>Create a task to get started.</Text>
              <TaskButton title="New task" onPress={() => setSheet('new')} />
            </View>
          }
        />
      ) : (
        <ScrollView
          style={styles.contentArea}
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
                    tintColor={theme.primary}
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
                  <Icon name="plus" size={16} color={theme.muted} />
                  <Text style={styles.addTaskText}>Add task</Text>
                </Pressable>
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
      <BottomTabs
        tabs={[
          { id: 'board', label: 'Board', icon: 'columns', testID: 'task-view-board' },
          { id: 'list', label: 'List', icon: 'list', testID: 'task-view-list' },
        ]}
        active={view}
        onSelect={(id) => setView(id as 'board' | 'list')}
      />
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
            <Pressable accessibilityRole="button" onPress={undo} style={styles.noticeAction}>
              <Text style={styles.noticeUndo}>Undo</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            onPress={() => setNotice('')}
            style={styles.noticeAction}
          >
            <Icon name="x" size={18} color={theme.ink} />
          </Pressable>
        </View>
      )}
      {sheet === 'boards' && (
        <Sheet title="All boards" onClose={() => setSheet(null)} scroll={false}>
          <View style={styles.boardSearch}>
            <TaskInput
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
                testID={`task-board-option-${item.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: board.id === item.id }}
                onPress={() => {
                  setBoardId(item.id);
                  setFilters({});
                  setSheet(null);
                  navigate('tasks', `board/${item.id}`);
                }}
                style={styles.boardOption}
              >
                <View style={[styles.boardOptionIcon, { backgroundColor: `${item.color}20` }]}>
                  <Icon name="columns" size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boardOptionTitle}>{item.name}</Text>
                  <Text style={styles.boardOptionDetail}>
                    {state.tasks.filter((task) => task.boardId === item.id).length} tasks
                  </Text>
                </View>
                <Icon
                  name={board.id === item.id ? 'check' : 'chevronRight'}
                  size={18}
                  color={theme.muted}
                />
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
          <Text style={styles.sectionLabel}>Assignee</Text>
          <View style={styles.choices}>
            <Choice
              testID="task-filter-assignee-everyone"
              title="Everyone"
              selected={!filters.assignee}
              onPress={() => setFilters({ ...filters, assignee: '' })}
            />
            <Choice
              testID="task-filter-assignee-unassigned"
              title="Unassigned"
              selected={filters.assignee === 'unassigned'}
              onPress={() => setFilters({ ...filters, assignee: 'unassigned' })}
            />
            {TASK_MEMBERS.map((member) => (
              <Choice
                testID={`task-filter-assignee-${member.id}`}
                key={member.id}
                title={member.name}
                selected={filters.assignee === member.id}
                onPress={() => setFilters({ ...filters, assignee: member.id })}
              />
            ))}
          </View>
          <Text style={styles.sectionLabel}>Label</Text>
          <View style={styles.choices}>
            <Choice
              testID="task-filter-label-all"
              title="All labels"
              selected={!filters.label}
              onPress={() => setFilters({ ...filters, label: '' })}
            />
            {TASK_LABELS.map((label) => (
              <Choice
                testID={`task-filter-label-${label.id}`}
                key={label.id}
                title={label.name}
                selected={filters.label === label.id}
                onPress={() => setFilters({ ...filters, label: label.id })}
              />
            ))}
          </View>
          <Text style={styles.sectionLabel}>Priority</Text>
          <View style={styles.choices}>
            <Choice
              title="All priorities"
              selected={!filters.priority}
              onPress={() => setFilters({ ...filters, priority: '' })}
            />
            {priorityOptions.map((priority) => (
              <Choice
                testID={`task-filter-priority-${priority}`}
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
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor={theme.background}
            />
          </View>
          <TaskButton
            testID="task-filter-apply"
            title={`Show ${visible.length} matching tasks`}
            onPress={() => setSheet(null)}
          />
          <TaskButton
            testID="task-clear-filters"
            title="Clear filters"
            secondary
            onPress={() => setFilters({})}
          />
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
      <TaskInput
        testID="task-create-title"
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
        autoFocus
        accessibilityLabel="Title"
        placeholder="Task title"
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
      <TaskInput
        accessibilityLabel="Description"
        multiline
        placeholder="Add a description…"
        value={description}
        onChangeText={setDescription}
        style={[styles.input, styles.multiline]}
      />
      <Text style={styles.sectionLabel}>Status</Text>
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
      <Text style={styles.sectionLabel}>Priority</Text>
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
      <TaskInput
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
      <Text style={styles.sectionLabel}>Status</Text>
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
      <Text style={styles.sectionLabel}>Priority</Text>
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
      <Text style={styles.sectionLabel}>Assignees</Text>
      <View style={styles.choices}>
        {TASK_MEMBERS.map((member) => (
          <Choice
            testID={`task-detail-assignee-${member.id}`}
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
      <Text style={styles.sectionLabel}>Labels</Text>
      <View style={styles.choices}>
        {TASK_LABELS.map((label) => (
          <Choice
            testID={`task-detail-label-${label.id}`}
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
      <Text style={styles.sectionLabel}>Due date</Text>
      <TaskButton
        testID="task-detail-due-date"
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
        <Pressable
          accessibilityRole="button"
          style={styles.inlineAction}
          onPress={() => onPatch({ dueDate: '' })}
        >
          <Text style={styles.textButton}>Remove due date</Text>
        </Pressable>
      )}
      <Text style={styles.sectionLabel}>Description</Text>
      <TaskInput
        accessibilityLabel="Description"
        multiline
        value={description}
        onChangeText={setDescription}
        onEndEditing={(event) => onPatch({ ...draft(), description: event.nativeEvent.text })}
        placeholder="Add a description…"
        style={[styles.input, styles.multiline]}
      />
      <View style={styles.spreadRow}>
        <Text style={styles.sectionLabel}>Checklist</Text>
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
              {current.done && <Icon name="check" size={14} color={theme.primaryForeground} />}
            </View>
            <Text style={[styles.checklistText, current.done && styles.completedText]}>
              {current.title}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete checklist item ${current.title}`}
            style={styles.closeButton}
            onPress={() =>
              onPatch({ checklist: task.checklist.filter((check) => check.id !== current.id) })
            }
          >
            <Icon name="x" size={16} color={theme.muted} />
          </Pressable>
        </View>
      ))}
      <View style={styles.row}>
        <TaskInput
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
      <TaskButton testID="task-detail-done" title="Done" onPress={close} />
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
          <Icon name="arrowLeft" size={18} color={theme.ink} />
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
          <Icon name="arrowRight" size={18} color={theme.ink} />
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
              <Text
                style={[styles.calendarDay, value === iso && { color: theme.primaryForeground }]}
              >
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
  contentArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.background,
  },
  boardHeading: { flex: 1, minWidth: 0, gap: 4 },
  boardTitle: { color: theme.ink, fontSize: 20, fontWeight: '600', letterSpacing: -0.5 },
  newButton: {
    width: 44,
    height: 44,
    borderRadius: 2,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  spreadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressText: { color: theme.muted, fontSize: 12, lineHeight: 17 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.background,
  },
  searchField: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 2,
    backgroundColor: theme.surface,
  },
  search: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    flex: 1,
    fontSize: 14,
    color: theme.ink,
    paddingVertical: 9,
    paddingHorizontal: 0,
    minHeight: 44,
  },
  filterButton: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 2,
    paddingHorizontal: 10,
    backgroundColor: theme.surface,
  },
  filterText: { fontSize: 12, fontWeight: '600', color: theme.ink },
  undoButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: { fontSize: 12, fontWeight: '600', color: theme.ink },
  // Keep the column width, gap and horizontal padding aligned with existing edge-scroll calculations.
  boardColumns: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 16 },
  column: { width: 270 },
  columnHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    minHeight: 44,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  columnTitle: { fontSize: 13, fontWeight: '600', color: theme.ink },
  columnCount: { fontSize: 12, color: theme.muted },
  columnContent: { paddingTop: 8, paddingBottom: 24, gap: 8 },
  taskCard: {
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 2,
  },
  cardPressable: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  taskId: { fontSize: 12, color: theme.muted, fontWeight: '500' },
  renameButton: {
    position: 'absolute',
    right: -8,
    top: -8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pencil: { color: theme.muted, fontSize: 12, fontWeight: '500' },
  cardTitle: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: theme.ink, minHeight: 20 },
  taskLabel: {
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: theme.soft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  labelDot: { width: 5, height: 5, borderRadius: 3 },
  labelText: { fontSize: 12, lineHeight: 16, color: theme.muted },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 26,
    gap: 6,
  },
  cardMeta: { color: theme.muted, fontSize: 12, lineHeight: 18 },
  metaGroup: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  priorityMark: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, width: 14, height: 12 },
  avatar: {
    height: 26,
    width: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, color: '#27272a', fontWeight: '600' },
  addTask: {
    paddingHorizontal: 10,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  addTaskText: { fontSize: 13, color: theme.muted },
  emptyColumn: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  emptyTitle: { color: theme.ink, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyDetail: { color: theme.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyHint: { color: theme.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  center: {
    flex: 1,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  listContent: { padding: 12, gap: 8, flexGrow: 1 },
  dragPreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 245,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.ink,
    borderRadius: 2,
    backgroundColor: theme.soft,
    elevation: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    gap: 8,
  },
  notice: {
    position: 'absolute',
    bottom: 72,
    left: 12,
    right: 12,
    backgroundColor: theme.soft,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 2,
    paddingLeft: 12,
    paddingRight: 4,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    elevation: 5,
  },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, color: theme.ink },
  noticeAction: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeUndo: { color: theme.ink, fontSize: 12, fontWeight: '600' },
  choice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  choiceText: { color: theme.muted, fontSize: 13 },
  selectedChoice: { backgroundColor: theme.soft, borderColor: theme.ink },
  selectedChoiceText: { color: theme.ink, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  modalOuter: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000000b3' },
  sheet: {
    maxHeight: '94%',
    minHeight: '55%',
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderColor: theme.border,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  sheetHandle: {
    width: 32,
    height: 3,
    backgroundColor: theme.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  sheetTitle: { fontSize: 18, fontWeight: '600', color: theme.ink, letterSpacing: -0.3 },
  closeButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sheetContent: { padding: 16, paddingBottom: 24, gap: 10 },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.muted,
    fontWeight: '600',
    marginTop: 8,
  },
  fieldLabel: { fontSize: 13, color: theme.ink, fontWeight: '500' },
  input: {
    borderWidth: 1,
    backgroundColor: theme.surface,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: theme.ink,
    minHeight: 44,
  },
  inlineInput: {
    borderWidth: 1,
    borderColor: theme.ink,
    padding: 8,
    minHeight: 44,
    borderRadius: 2,
    color: theme.ink,
    backgroundColor: theme.background,
    fontSize: 14,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top', lineHeight: 21 },
  detailTitle: {
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 25,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  boardSearch: { padding: 16 },
  boardList: { paddingHorizontal: 16, paddingBottom: 24 },
  boardOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  boardOptionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  boardOptionTitle: { fontSize: 14, color: theme.ink, fontWeight: '500', marginBottom: 3 },
  boardOptionDetail: { fontSize: 12, color: theme.muted },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderBottomWidth: 1,
    borderColor: theme.border,
  },
  checklistToggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
    paddingVertical: 8,
  },
  checkbox: {
    height: 18,
    width: 18,
    borderWidth: 1,
    borderColor: theme.muted,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkedBox: { backgroundColor: theme.primary, borderColor: theme.primary },
  checklistText: { flex: 1, fontSize: 14, lineHeight: 20, color: theme.ink },
  completedText: { textDecorationLine: 'line-through', color: theme.muted },
  inlineAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  textButton: { color: theme.ink, fontSize: 13, fontWeight: '500' },
  deleteButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: 10 },
  error: { color: theme.danger, fontSize: 13, lineHeight: 19 },
  deleteBox: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 2,
    padding: 14,
    gap: 10,
    alignItems: 'center',
  },
  calendar: {
    borderTopWidth: 1,
    borderColor: theme.border,
    paddingVertical: 8,
    marginHorizontal: -10,
  },
  calendarArrow: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: {
    width: '14.2857%',
    paddingVertical: 10,
    textAlign: 'center',
    color: theme.muted,
    fontSize: 12,
  },
  calendarCell: {
    width: '14.2857%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
  },
  calendarSelected: { backgroundColor: theme.primary },
  calendarDay: { fontSize: 14, color: theme.ink },
});
