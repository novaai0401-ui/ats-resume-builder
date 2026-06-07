'use client';

import { type ReactNode } from 'react';

/**
 * DataLoader — the single loading surface every data-fetching page
 * should use. Replaces ad-hoc "Loading…" paragraphs scattered across
 * the app with one consistent look + accessibility behaviour.
 *
 * Why one component:
 *   - Visual consistency. Every page shows the same calm spinner with
 *     the same copy hierarchy, so users learn the pattern once.
 *   - Accessibility. role="status" + aria-busy + aria-live="polite"
 *     are set correctly in one place; ad-hoc <p>Loading…</p> across
 *     the app was missing all three.
 *   - Reduced-motion support. The spin animation respects the
 *     prefers-reduced-motion media query out of the box.
 *
 * Three modes:
 *   - 'block'   — fullscreen / large card area (Dashboard, Outcomes…)
 *   - 'inline'  — small badge ("checking…" inside a button etc.)
 *   - 'skeleton'— renders the `skeleton` prop instead of a spinner
 *                 for content-shape preserving placeholders
 */

export type DataLoaderMode = 'block' | 'inline' | 'skeleton';

export interface DataLoaderProps {
  /** Shown to screen readers and below the spinner. */
  label?: string;
  /** Visual variant. Defaults to 'block'. */
  mode?: DataLoaderMode;
  /** Required for mode='skeleton'. Rendered in place of the spinner. */
  skeleton?: ReactNode;
  /** Test hook. */
  dataTestId?: string;
}

const DEFAULT_LABEL = 'Loading…';

export default function DataLoader({
  label = DEFAULT_LABEL,
  mode = 'block',
  skeleton,
  dataTestId,
}: DataLoaderProps) {
  if (mode === 'skeleton') {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={label}
        data-testid={dataTestId}
      >
        {skeleton}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  if (mode === 'inline') {
    return (
      <span
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={label}
        data-testid={dataTestId}
        style={inlineWrapStyle}
      >
        <span aria-hidden style={inlineSpinnerStyle} />
        <span style={{ fontSize: 13, color: '#5a6778' }}>{label}</span>
      </span>
    );
  }

  // mode === 'block'
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
      data-testid={dataTestId}
      style={blockWrapStyle}
    >
      <div aria-hidden style={blockSpinnerStyle} />
      <p style={{ margin: 0, fontSize: 14, color: '#5a6778' }}>{label}</p>
      <style>{`
        @keyframes rb-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          [data-rb-spinner] { animation: none !important; opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}

const blockWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  padding: '48px 24px',
  textAlign: 'center',
};

const blockSpinnerStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  border: '3px solid #e6ebf1',
  borderTopColor: '#1a3a5c',
  borderRadius: '50%',
  animation: 'rb-spin 0.8s linear infinite',
  // Reduced-motion media query targets the [data-rb-spinner] attribute
  // (see the <style> tag above) so the wheel stays still for users who
  // ask for less animation.
  ['data-rb-spinner' as string]: true,
};

const inlineWrapStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  verticalAlign: 'middle',
};

const inlineSpinnerStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  border: '2px solid #cbd5e1',
  borderTopColor: '#1a3a5c',
  borderRadius: '50%',
  animation: 'rb-spin 0.8s linear infinite',
  display: 'inline-block',
  ['data-rb-spinner' as string]: true,
};

/**
 * Convenience skeleton block — a soft pulsing bar callers can compose
 * into shape-preserving placeholders. e.g.
 *   <DataLoader mode="skeleton" skeleton={
 *     <>
 *       <SkeletonBar w="40%" />
 *       <SkeletonBar w="80%" />
 *       <SkeletonBar w="65%" />
 *     </>
 *   } />
 */
export function SkeletonBar({
  w = '100%',
  h = 12,
  mt = 8,
}: { w?: string | number; h?: string | number; mt?: string | number }) {
  return (
    <div
      aria-hidden
      style={{
        width: w,
        height: h,
        marginTop: mt,
        borderRadius: 6,
        background:
          'linear-gradient(90deg, #eef2f6 0%, #f6f9fc 50%, #eef2f6 100%)',
        backgroundSize: '200% 100%',
        animation: 'rb-shimmer 1.4s linear infinite',
      }}
    />
  );
}
