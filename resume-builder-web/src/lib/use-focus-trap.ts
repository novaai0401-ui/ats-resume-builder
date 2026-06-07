'use client';

import { useEffect, useRef } from 'react';

/**
 * Focus trap for modal-like surfaces.
 *
 * What this fixes: every modal in the app (TrainingConsentModal,
 * PostDownloadSubscriptionPopup, DownloadChargeModal, template-prompt
 * modal, …) was a simple <div role="dialog">. Tabbing through it
 * eventually moved focus to the background content behind the dim
 * backdrop — keyboard users could navigate the page beneath the modal
 * without the dialog ever closing. WCAG 2.1 Success Criterion 2.4.3
 * (Focus Order) wants focus contained within an open dialog.
 *
 * Behaviour, in priority order:
 *   1. On mount, remember the previously-focused element and move
 *      focus to the first tabbable element inside the container.
 *   2. On Tab / Shift+Tab, wrap focus around the container.
 *   3. On Escape, call onClose (if provided) — standard dialog UX.
 *   4. On unmount, restore focus to the previously-focused element.
 *
 * Pure DOM — no React state, no portal coupling — so it can wrap any
 * existing modal markup by attaching the returned ref to its outer
 * element.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface UseFocusTrapOptions {
  /** Whether the trap is active. Defaults to true. */
  active?: boolean;
  /** Called when the user presses Escape inside the trap. */
  onClose?: () => void;
  /** Optional initial-focus element selector inside the container. */
  initialFocus?: string;
}

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {},
) {
  const containerRef = useRef<T | null>(null);
  const { active = true, onClose, initialFocus } = options;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = (typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null);

    const focusFirst = () => {
      const target = initialFocus
        ? container.querySelector<HTMLElement>(initialFocus)
        : null;
      if (target) {
        target.focus();
        return;
      }
      const tabbables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = tabbables[0];
      if (first) {
        first.focus();
      } else {
        // No interactive child — focus the container itself so screen
        // readers still announce the dialog.
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    };

    // requestAnimationFrame so React has finished painting before we
    // move focus — otherwise focusing a not-yet-rendered button is a
    // no-op.
    const raf = typeof window !== 'undefined'
      ? window.requestAnimationFrame(focusFirst)
      : (focusFirst(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const tabbables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
      if (tabbables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !container.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (raf && typeof window !== 'undefined') {
        window.cancelAnimationFrame(raf);
      }
      // Restore focus to the element that had it before the trap
      // opened, but only if focus is still inside our container (so
      // we don't yank focus from somewhere the user has since moved
      // it intentionally).
      if (
        previouslyFocused
        && previouslyFocused.focus
        && container.contains(document.activeElement)
      ) {
        try { previouslyFocused.focus(); } catch { /* gone */ }
      }
    };
  }, [active, onClose, initialFocus]);

  return containerRef;
}

/**
 * Pure helper used by the hook AND by the tests. Returns the list of
 * tabbable descendants of a container, in document order. Mirrors
 * the same selector and disabled-filter the hook uses so the tests
 * can pin the exact contract.
 */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
}
