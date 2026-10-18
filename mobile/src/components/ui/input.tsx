// Adapted from React Native Reusables' input component (MIT).
// Native StyleSheet replaces class utilities, retaining focus/disabled behavior.
import React, { useState } from 'react';
import { TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius } from './theme';

export function Input({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.ring}
      keyboardAppearance="dark"
      style={[
        styles.input,
        focused && styles.focused,
        props.editable === false && styles.disabled,
        style,
      ]}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      {...props}
    />
  );
}
const styles = StyleSheet.create({
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.foreground,
    backgroundColor: colors.surface,
    fontSize: 14,
    lineHeight: 20,
  },
  focused: { borderColor: colors.ring },
  disabled: { opacity: 0.5 },
});
