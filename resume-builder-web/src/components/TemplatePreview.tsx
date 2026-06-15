'use client';

import type { CSSProperties } from 'react';
import type { ResumeImportResult } from 'resume-builder-shared';
import { designCssVars } from 'resume-builder-shared';
import { defaultTemplateId, resolveTemplateId, templateList, templateRegistry, type TemplateId } from '@/shared/templateRegistry';

export type TemplateVariant = TemplateId;

export const templates = templateList;
export type { TemplateId };

export function TemplatePreview({
  templateId,
  resume,
  fontOverride,
  spacing,
  accentOverride,
}: {
  templateId: TemplateId | string;
  resume: ResumeImportResult;
  compact?: boolean;
  accentOverride?: string;
  fontOverride?: string;
  spacing?: 'compact' | 'normal' | 'airy';
}) {
  const resolvedTemplateId = resolveTemplateId(String(templateId || ''), defaultTemplateId);
  const TemplateComponent = templateRegistry[resolvedTemplateId].component;

  // R-045 — apply font/density/accent as CSS custom properties on a wrapper.
  // When the design is default, designCssVars returns {} so nothing is emitted
  // and the template renders byte-for-byte as before (zero-regression).
  const vars = designCssVars({
    fontFamily: fontOverride ?? null,
    density: spacing ?? null,
    accentColor: accentOverride ?? null,
  });
  if (Object.keys(vars).length === 0) {
    return <TemplateComponent resumeData={resume} />;
  }
  return (
    <div className="rb-design-scope" style={vars as CSSProperties}>
      <TemplateComponent resumeData={resume} />
    </div>
  );
}

