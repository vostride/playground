import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { colors } from './theme';

const paths = {
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plane: 'm22 2-7 20-4-9-9-4Z M11 13 22 2',
  ticket: 'M3 7V4h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6Z M15 4v2m0 3v2m0 3v2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 5 7 7-7 7',
  arrowLeft: 'M20 12H4m6-6-6 6 6 6',
  arrowRight: 'M4 12h16m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  x: 'm6 6 12 12M6 18 18 6',
  calendar: 'M4 5h16v16H4Z M4 10h16M8 3v4m8-4v4M8 14h1m3 0h1m3 0h1m-9 4h1m3 0h1',
  clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
  settings: 'M5 4v16M12 4v16M19 4v16M2 9h6m1 6h6m1-7h6',
  grid: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  shoppingBag: 'M4 7h16l1 14H3ZM8 7V6a4 4 0 0 1 8 0v5M8 7v4',
  cart: 'M2 3h3l3 12h11l3-9H6M10 20a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0',
  box: 'm12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5M12 12v10M7.5 4.5l9 5',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1',
  columns: 'M3 3h18v18H3ZM9 3v18m6-18v18',
  activity: 'M2 12h4l3-8 6 16 3-8h4',
  terminal: 'm4 5 6 7-6 7m9 0h8',
  gitBranch:
    'M6 3v12a6 6 0 0 0 12 0V9M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0m12 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  filter: 'M3 5h18l-7 8v7l-4-2v-5Z',
  sliders: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  arrowUpDown: 'M8 3v18M4 7l4-4 4 4M16 21V3m-4 14 4 4 4-4',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  color = colors.ink,
  strokeWidth = 1.75,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
