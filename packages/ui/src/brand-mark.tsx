import { useId, type ReactNode, type SVGProps } from 'react';

export type BrandApp = 'shop' | 'flights' | 'observability' | 'tasks';

export type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  app: BrandApp;
  size?: number | string;
  title?: string;
};

const marks: Record<BrandApp, ReactNode> = {
  shop: (
    <path
      fill="currentColor"
      d="M3 5.5 8 3v7.3L17.5 3 21 6.5 13.8 12l7.2 5.5-3.5 3.5L8 13.7V21l-5-2.5V5.5Z"
    />
  ),
  flights: (
    <>
      <path
        d="M16 13.5A6.5 6.5 0 1 1 9.5 7m4.7 11.2 5.3 3.3"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path fill="currentColor" d="M13.5 2.5H22V11l-3.1-3.1-7 7-2.8-2.8 7-7-2.6-2.6Z" />
    </>
  ),
  observability: (
    <>
      <rect x="2" y="7" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="2.2" />
      <rect x="14" y="3" width="8" height="13" rx="4" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M6 13h4l2-4 2 8 2-4h2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  tasks: (
    <>
      <rect x="3" y="3" width="5" height="18" rx="2" fill="currentColor" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 5h4a5 5 0 0 1 5 5c0 1.3-.5 2.5-1.4 3.4.9.8 1.4 1.9 1.4 3.1a4.5 4.5 0 0 1-4.5 4.5H12a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm1.5 3v3H16a1.5 1.5 0 0 0 0-3h-2.5Zm0 7v3H16a1.5 1.5 0 0 0 0-3h-2.5Z"
      />
    </>
  ),
};

/** Original product marks. Decorative by default when accompanied by brand text. */
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
