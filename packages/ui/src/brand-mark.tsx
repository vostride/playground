import { useId, type ReactNode, type SVGProps } from 'react';

export type BrandApp = 'shop' | 'flights' | 'observability' | 'tasks';

export type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  app: BrandApp;
  size?: number | string;
  title?: string;
};

// Original PepaPog sprite from vostride.com's Connector Hell article.
// Keep its 16×12 pixel grid and palette intact across every product surface.
const pepaPogRows = [
  '....PPPPPPPP....',
  '...P........P...',
  '..DDFFFFFFFFDD..',
  '.DDDFFFFFFFFDDD.',
  'PPDDFFFFFFFFDDPP',
  'PPDDFfFFFFfFDDPP',
  '..DDWKFFFFKWDDp.',
  '..DDFFDDDDFFDDp.',
  '...DFFDKKDFFD.p.',
  '...FFFDDDDFFFpp.',
  '....FFDTTDFF....',
  '.....FFFFFF.....',
];
const pepaPogColors: Record<string, string> = {
  P: '#7c5cff',
  p: '#a08cff',
  D: '#4a342a',
  F: '#e4b97f',
  f: '#f2d3a0',
  K: '#1f1b16',
  W: '#ffffff',
  T: '#ff7b9c',
};

const marks: Record<BrandApp, ReactNode> = {
  shop: (
    <>
      <path fill="#eea36b" d="M1 1h22v22H1z" />
      <path
        fill="#302319"
        d="M6.2 4h5.2L9.6 12l5-4h4.8l-.3 1.3h-1.6l-4.1 3.3 3 6.1h1.8l-.3 1.3h-5.1l-3.2-6.4L8.2 20H3.5l.3-1.3h1.5l3-13.4H5.9L6.2 4Z"
      />
    </>
  ),
  flights: (
    <>
      <path fill="#48c9b8" d="M1 15.5C8.6 14.8 14.9 9.7 23 3c-2.7 8.1-9.5 14.4-18.3 15.4L1 15.5Z" />
      <path
        fill="#168579"
        d="M5.4 20.3c6.1-1.5 11.8-5.9 15.5-11.1-1.8 5.9-6.3 10.6-12.1 12.3l-3.4-1.2Z"
      />
    </>
  ),
  observability: (
    <g transform="translate(0 3) scale(1.5)" shapeRendering="crispEdges">
      {pepaPogRows.flatMap((row, y) =>
        [...row].flatMap((pixel, x) =>
          pepaPogColors[pixel] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={pepaPogColors[pixel]} />
          ) : (
            []
          ),
        ),
      )}
    </g>
  ),
  tasks: (
    <>
      <path fill="#707de8" d="M2 2h5v20H2z" />
      <path fill="#b3baff" fillRule="evenodd" d="M8 2h10l3 3v4l-3 2H8V2Zm4 3v3h4l1-1V6l-1-1h-4Z" />
      <path
        fill="#8b96f5"
        fillRule="evenodd"
        d="M8 12h11l3 3v4l-3 3H8V12Zm4 3v4h4.5l1.5-1.5v-1L16.5 15H12Z"
      />
    </>
  ),
};

/** Product marks, decorative by default when accompanied by brand text. */
export function BrandMark({ app, size = 24, title, className, ...props }: BrandMarkProps) {
  const titleId = useId();
  const hasName = Boolean(title || props['aria-label'] || props['aria-labelledby']);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={hasName ? 'img' : undefined}
      aria-hidden={hasName ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {marks[app]}
    </svg>
  );
}
