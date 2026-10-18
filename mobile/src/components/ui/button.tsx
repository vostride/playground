// Adapted from React Native Reusables' button component (MIT).
// Variant and text-context behavior use native styles instead of NativeWind/cva.
import React from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { TextStyleContext } from './text';
import { colors, radius } from './theme';

export type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive';
type Props = Omit<PressableProps, 'style'> & {
  variant?: ButtonVariant;
  size?: 'default' | 'icon';
  style?: StyleProp<ViewStyle>;
};
export function Button({
  variant = 'default',
  size = 'default',
  style,
  disabled,
  children,
  ...props
}: Props) {
  return (
    <TextStyleContext.Provider
      value={{
        color:
          variant === 'default'
            ? colors.primaryForeground
            : variant === 'destructive'
              ? colors.danger
              : colors.foreground,
        fontSize: 14,
        fontWeight: '600',
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          styles[variant],
          size === 'icon' && styles.icon,
          pressed && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
        {...props}
      >
        {children}
      </Pressable>
    </TextStyleContext.Provider>
  );
}
const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  default: { backgroundColor: colors.primary },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.input },
  secondary: { backgroundColor: colors.secondary },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: '#56242c' },
  icon: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
});
