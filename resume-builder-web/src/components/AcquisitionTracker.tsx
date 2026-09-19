'use client';

import { useEffect } from 'react';
import { captureFirstTouch } from '@/src/lib/acquisition';

/**
 * R-110 — records the first source a visitor arrived from.
 *
 * Mounted in the root layout because a UTM-tagged link can land on ANY
 * page: an assistant's get_download_link goes straight to
 * /resume/template, not to the home page. Capturing only on the login
 * page (where the R-037 referral code is read) would miss almost every
 * assistant-referred visit.
 *
 * Renders nothing, writes one localStorage entry on first tagged visit,
 * and never throws — attribution must not be able to break a page.
 */
export default function AcquisitionTracker() {
  useEffect(() => {
    try {
      captureFirstTouch(
        new URLSearchParams(window.location.search),
        window.location.pathname,
      );
    } catch {
      /* attribution is best-effort by design */
    }
  }, []);

  return null;
}
