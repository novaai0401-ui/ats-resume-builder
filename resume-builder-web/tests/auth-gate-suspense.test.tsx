/**
 * R-123 — AuthGate must put a Suspense boundary above `useSearchParams()`.
 *
 * Why this test exists, in one sentence: without that boundary the entire
 * web production build fails, and no unit test caught it.
 *
 * R-107 added `useSearchParams()` to AuthGate so the post-login return path
 * would keep its query string. `useSearchParams()` opts its component out of
 * static prerendering, and Next fails `next build` outright —
 * "useSearchParams() should be wrapped in a suspense boundary at page
 * /admin" — for any statically rendered page that reaches one with no
 * boundary above it. Seventeen pages wrap themselves in AuthGate, so the
 * build died on the first of them to prerender and the Docker image never
 * got built.
 *
 * The contract pinned here is structural on purpose: the failure is a
 * BUILD-TIME property of the component tree, not a runtime behaviour, so
 * asserting "AuthGate hands React a Suspense boundary" is the honest
 * statement of what must stay true. Deleting the Suspense wrapper fails
 * this test; so does moving the hook up into the boundary component.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React, { Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthGate from '../src/components/AuthGate';

test('AuthGate renders a Suspense boundary as its outermost element', () => {
  const tree = AuthGate({ children: React.createElement('div', null, 'gated') });

  assert.equal(
    (tree as React.ReactElement).type,
    Suspense,
    'AuthGate must return a <Suspense> boundary. Without it, every statically ' +
      'prerendered page wrapped in AuthGate fails `next build` because the ' +
      'gate calls useSearchParams().',
  );
});

test('the Suspense boundary has a fallback, so the gate never renders blank', () => {
  const tree = AuthGate({ children: React.createElement('div', null, 'gated') }) as React.ReactElement<{
    fallback?: React.ReactNode;
    children?: React.ReactNode;
  }>;

  assert.ok(
    tree.props.fallback,
    'The boundary needs a fallback — a bare <Suspense> would flash empty ' +
      'markup into the prerendered HTML of all 17 gated pages.',
  );
});

test('the loading fallback is an announced live region (C-005)', () => {
  // C-005: `role="status"` + `aria-live` on loading states. This panel is
  // the loading state for all seventeen gated pages, so without the live
  // region a screen-reader user gets silence on every gated route.
  const tree = AuthGate({ children: React.createElement('div', null, 'gated') }) as React.ReactElement<{
    fallback?: React.ReactElement;
  }>;

  const html = renderToStaticMarkup(tree.props.fallback as React.ReactElement);
  assert.match(html, /role="status"/, 'loading fallback needs role="status" (C-005)');
  assert.match(html, /aria-live="polite"/, 'loading fallback needs aria-live (C-005)');

  // And explicitly NOT aria-busy. On a live region that attribute defers
  // announcements until it flips to false; this region never flips (it
  // unmounts when auth resolves), so a held announcement would be dropped
  // and the user would hear nothing — the exact silence the live region is
  // here to prevent. An earlier version of this file asserted the opposite
  // and so would have locked the bug in place.
  assert.doesNotMatch(
    html,
    /aria-busy/,
    'loading fallback must NOT set aria-busy: it never clears, so the announcement would be suppressed',
  );
});

test('the gate body is inside the boundary, not the boundary itself', () => {
  // The component that calls useSearchParams must be a DESCENDANT of the
  // boundary. If someone "fixes" a future build error by calling the hook
  // in the same component that renders <Suspense>, the boundary stops
  // protecting anything and the build breaks again — this catches that.
  const tree = AuthGate({ children: React.createElement('div', null, 'gated') }) as React.ReactElement<{
    children?: React.ReactNode;
  }>;

  const inner = tree.props.children as React.ReactElement;
  assert.ok(inner, 'Suspense must wrap the gate body.');
  assert.equal(
    typeof inner.type,
    'function',
    'The gate body inside the boundary should be a component (it is the one ' +
      'that reads the search params), not raw markup.',
  );
});
