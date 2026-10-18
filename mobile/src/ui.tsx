import React, { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ScrollView,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
export type AppId = 'home' | 'shop' | 'flights' | 'tasks' | 'observability';
export interface MobileScreenProps {
  route: string;
  bug: string;
  navigate: (app: AppId, route?: string) => void;
}
export const colors = {
  ink: '#233a35',
  muted: '#6c7b75',
  background: '#f7f8f4',
  surface: '#ffffff',
  border: '#dfe5dc',
  primary: '#1b5149',
  accent: '#df7953',
  danger: '#a84f3d',
  soft: '#eaf0e5',
  white: '#ffffff',
  text: '#233a35',
  subtle: '#edf1e9',
};
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
export function Screen({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <ScrollView
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
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID={
        testID ||
        `button-${title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`
      }
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && { color: colors.primary }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}
export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={`field-${label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')}`}
        accessibilityLabel={label}
        placeholderTextColor="#93a18e"
        returnKeyType={props.multiline ? 'default' : 'done'}
        submitBehavior={props.multiline ? 'newline' : 'blurAndSubmit'}
        style={[styles.input, style]}
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
      <Text style={[styles.chipText, selected && { color: colors.primary, fontWeight: '600' }]}>
        {label}
      </Text>
    </TouchableOpacity>
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
    backgroundColor: '#f0f3ef',
    borderBottomWidth: 1,
    borderBottomColor: '#dfe5dc',
  },
  keyboardDismiss: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center' },
  keyboardDismissText: { color: '#1b5149', fontSize: 14, fontWeight: '600' },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 24, gap: 10 },
  card: {
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  button: {
    minHeight: 46,
    borderRadius: 2,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#b8c9b1' },
  danger: { backgroundColor: colors.danger },
  buttonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  field: { gap: 7, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '500', color: colors.ink },
  input: {
    height: 47,
    borderWidth: 1,
    borderColor: '#cad6c4',
    borderRadius: 2,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: colors.ink,
    fontSize: 15,
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: '#eaf1e5' },
  chipText: { fontSize: 11, color: colors.muted },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -1,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: { fontSize: 13, lineHeight: 21, color: colors.muted, marginTop: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
});
