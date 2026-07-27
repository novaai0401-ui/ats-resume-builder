'use client';

import { useEffect, useState } from 'react';
import FreeTrialLimitModal from './FreeTrialLimitModal';
import { FREE_TRIAL_BLOCK_EVENT, type FreeTrialBlock } from '@/src/lib/free-trial';

/**
 * R-098 — app-wide host for the "free run already used" popup.
 *
 * Mounted once in the root layout (next to TrainingConsentModal) so every AI
 * surface gets the same modal from a single line in its catch block
 * (`handleFreeTrialError(err)`), instead of each page wiring its own dialog
 * and drifting in copy.
 *
 * Renders nothing until an event arrives, so it adds no DOM on SSR.
 */
export default function FreeTrialLimitModalHost() {
  const [block, setBlock] = useState<FreeTrialBlock | null>(null);

  useEffect(() => {
    const onBlock = (event: Event) => {
      const detail = (event as CustomEvent<FreeTrialBlock>).detail;
      if (detail) setBlock(detail);
    };
    window.addEventListener(FREE_TRIAL_BLOCK_EVENT, onBlock);
    return () => window.removeEventListener(FREE_TRIAL_BLOCK_EVENT, onBlock);
  }, []);

  if (!block) return null;
  return <FreeTrialLimitModal block={block} onClose={() => setBlock(null)} />;
}
