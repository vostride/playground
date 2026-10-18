// Adapted from React Native Reusables' text component (MIT).
// Native StyleSheet variants replace NativeWind/cva/Slot dependencies.
import React, { createContext, useContext } from 'react';
import {
  Text as NativeText,
  StyleSheet,
  type TextProps,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { colors } from './theme';

export const TextStyleContext = createContext<StyleProp<TextStyle>>(undefined);
export function Text({ style, ...props }: TextProps) {
  const context = useContext(TextStyleContext);
  return <NativeText style={[styles.text, context, style]} {...props} />;
}
const styles = StyleSheet.create({
  text: { color: colors.foreground, fontSize: 14, lineHeight: 20, fontWeight: '400' },
});
