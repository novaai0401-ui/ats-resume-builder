import React from 'react';
import { templatePreset, type TemplatePreset } from 'resume-builder-shared';
import {
  contactLine,
  fullNameOrTitle,
  normalizeTemplateResume,
  OrderedAtsSections,
  type TemplateProps,
} from './templateUtils';

/**
 * Renders any template whose layout is described by a shared preset
 * (resume-builder-shared/templates/presets.ts).
 *
 * The API has a mirror of this — renderPresetTemplateArticle in resume.service.ts —
 * that emits the same markup from the same preset. Keeping the layout decisions in
 * shared data rather than in each renderer is what stops the exported PDF drifting
 * from the previewed document; see the header comment in presets.ts for why the
 * older per-template approach kept producing that mismatch.
 *
 * Everything here is expressed with the existing `.ats-*` class vocabulary, which
 * is declared identically in globals.css and ATS_TEMPLATE_EXPORT_CSS, so these
 * templates export correctly without adding a single CSS rule.
 */
export default function PresetTemplate({
  resumeData,
  templateId,
}: TemplateProps & { templateId: string }) {
  const preset: TemplatePreset | undefined = templatePreset(templateId);
  const normalized = normalizeTemplateResume(resumeData);

  // A preset should always resolve — the registry only routes preset ids here.
  // Falling back to a sane single-column layout rather than throwing keeps a
  // stale saved templateId from blanking the user's preview.
  const effective: TemplatePreset = preset || {
    companyJoiner: ' | ',
    divided: true,
    headerBar: true,
    defaultBody: [
      'summary', 'skills', 'experience', 'projects', 'achievements',
      'education', 'certifications', 'licenses', 'publications', 'languages',
    ],
  };

  const headerClasses = ['ats-template__header'];
  if (effective.headerBar) headerClasses.push('ats-template__header--bar');

  const line = contactLine(normalized);

  return (
    <article className={`ats-template ats-template--${templateId}`}>
      <header className={headerClasses.join(' ')}>
        <h1>{fullNameOrTitle(normalized)}</h1>
        {line ? <p>{line}</p> : null}
      </header>

      <OrderedAtsSections
        resumeData={normalized}
        options={{
          companyJoiner: effective.companyJoiner,
          tight: effective.tight,
          divided: effective.divided,
          uppercaseHeadings: effective.uppercaseHeadings,
          defaultBody: effective.defaultBody,
          labels: effective.labels,
          summaryPlaceholder: effective.summaryPlaceholder,
          skillsPlaceholder: effective.skillsPlaceholder,
        }}
      />
    </article>
  );
}

/** Bind a preset id to a component with the registry's `{ resumeData }` shape. */
export function presetTemplateComponent(templateId: string) {
  function BoundPresetTemplate({ resumeData }: TemplateProps) {
    return <PresetTemplate resumeData={resumeData} templateId={templateId} />;
  }
  BoundPresetTemplate.displayName = `PresetTemplate(${templateId})`;
  return BoundPresetTemplate;
}
