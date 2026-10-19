import React, { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ScrollView,
  Keyboard,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button as PrimitiveButton } from './components/ui/button';
import { Input } from './components/ui/input';
import { Text } from './components/ui/text';
import { colors } from './components/ui/theme';
import { Icon, type IconName } from './components/ui/icons';
export { Text, colors, Icon };
export type { IconName };
export type AppId = 'home' | 'shop' | 'flights' | 'tasks' | 'observability';
export interface MobileScreenProps {
  navigationKey?: number;
  route: string;
  bug: string;
  navigate: (app: AppId, route?: string) => void;
}
const session = new Map<string, unknown>();
export function resetSession() {
  session.clear();
}
export function useSessionState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    session.has(key)
      ? (session.get(key) as T)
      : typeof initial === 'function'
        ? (initial as () => T)()
        : initial,
  );
  return [
    value,
    (next) =>
      setValue((previous) => {
        const updated = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
        session.set(key, updated);
        return updated;
      }),
  ];
}
export function Screen({
  children,
  contentContainerStyle,
  scrollRef,
  ...props
}: ScrollViewProps & { scrollRef?: React.Ref<ScrollView> }) {
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, contentContainerStyle]}
      {...props}
    >
      {children}
    </ScrollView>
  );
}
// Native modals own a separate window; measure its insets instead of reusing the
// app window's padding (page sheets can have different safe areas on iOS).
export function SafeModalArea({ children, style, ...props }: ViewProps) {
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <SafeAreaView style={[{ flex: 1 }, style]} {...props}>
        <KeyboardDismissButton />
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
export function KeyboardDismissButton() {
  const [visible, setVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  if (!visible) return null;
  return (
    <View style={styles.keyboardToolbar}>
      <TouchableOpacity
        testID="keyboard-dismiss-button"
        accessibilityRole="button"
        accessibilityLabel="Hide keyboard"
        onPress={Keyboard.dismiss}
        style={styles.keyboardDismiss}
      >
        <Text style={styles.keyboardDismissText}>Done typing</Text>
      </TouchableOpacity>
    </View>
  );
}
export function Card({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}
export function Row({ children, style, ...props }: ViewProps) {
  return (
    <View style={[styles.row, style]} {...props}>
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <PrimitiveButton
      variant={
        variant === 'secondary' ? 'outline' : variant === 'danger' ? 'destructive' : 'default'
      }
      testID={
        testID ||
        `button-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`
      }
      onPress={onPress}
      disabled={disabled}
    >
      <Text>{title}</Text>
    </PrimitiveButton>
  );
}
export function Field({
  label,
  style,
  hideLabel,
  ...props
}: TextInputProps & { label: string; hideLabel?: boolean }) {
  return (
    <View style={styles.field}>
      {!hideLabel && <Text style={styles.label}>{label}</Text>}
      <Input
        testID={`field-${label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`}
        accessibilityLabel={label}
        returnKeyType={props.multiline ? 'default' : 'done'}
        submitBehavior={props.multiline ? 'newline' : 'blurAndSubmit'}
        style={style}
        {...props}
      />
    </View>
  );
}
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      testID={`chip-${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && { color: colors.ink, fontWeight: '600' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  testID,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <PrimitiveButton
      variant="ghost"
      size="icon"
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
    >
      <Icon name={icon} />
    </PrimitiveButton>
  );
}

export function BottomTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; icon: IconName; testID?: string; badge?: number }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.id}
          testID={tab.testID || `tab-${tab.id}`}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: active === tab.id }}
          onPress={() => {
            Keyboard.dismiss();
            onSelect(tab.id);
          }}
          style={({ pressed }) => [styles.tab, pressed && { backgroundColor: colors.soft }]}
        >
          <View style={styles.tabIcon}>
            <Icon name={tab.icon} color={active === tab.id ? colors.ink : colors.muted} />
            {!!tab.badge && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.tabLabel, active === tab.id && styles.tabSelected]}>
            {tab.label}
          </Text>
          {active === tab.id && <View style={styles.tabIndicator} />}
        </Pressable>
      ))}
    </View>
  );
}
export function Heading({
  title,
  subtitle,
  testID,
}: {
  title: string;
  subtitle?: string;
  testID?: string;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text testID={testID} accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}
export function Empty({ title, detail }: { title: string; detail?: string }) {
  return (
    <Card style={{ paddingVertical: 24, alignItems: 'center' }}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail && <Text style={[styles.subtitle, { textAlign: 'center' }]}>{detail}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  keyboardToolbar: {
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  keyboardDismiss: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center' },
  keyboardDismissText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  field: { gap: 7, marginBottom: 10 },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: colors.ink },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { borderColor: colors.muted, backgroundColor: colors.soft },
  chipText: { fontSize: 12, lineHeight: 18, fontWeight: '500', color: colors.muted },
  heading: {
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.5,
    fontWeight: '600',
    color: colors.ink,
  },
  subtitle: { fontSize: 13, lineHeight: 20, color: colors.muted, marginTop: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  tab: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 3,
  },
  tabIcon: { position: 'relative' },
  tabLabel: { fontSize: 12, lineHeight: 16, color: colors.muted, fontWeight: '500' },
  tabSelected: { color: colors.ink, fontWeight: '600' },
  tabIndicator: {
    position: 'absolute',
    top: -1,
    width: 24,
    height: 2,
    backgroundColor: colors.ink,
  },
  tabBadge: {
    position: 'absolute',
    right: -12,
    top: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    backgroundColor: colors.ink,
  },
  tabBadgeText: { color: colors.background, fontSize: 10, lineHeight: 14, fontWeight: '700' },
});
