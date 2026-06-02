'use client';

import { memo } from 'react';
import type { ResumeImportResult } from 'resume-builder-shared';
import ResumeTemplateRender from '@/src/components/ResumeTemplateRender';
import type { TemplateRecommendation } from '@/src/lib/template-recommendation';
import type { TemplateConfig, TemplateId } from '@/shared/templateRegistry';

type TemplateCardThumbnailProps = {
  templateId: TemplateId;
  previewResume: ResumeImportResult | null;
  previewLoading?: boolean;
};

const TemplateCardThumbnailLoading = memo(function TemplateCardThumbnailLoading() {
  return (
    <div
      className="template-card__thumbnail template-card__thumbnail--loading"
      data-preview-kind="thumbnail"
      data-thumbnail-state="loading"
      data-thumbnail-component="TemplateCardThumbnailLoading"
    >
      <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 8 }} />
    </div>
  );
});

TemplateCardThumbnailLoading.displayName = 'TemplateCardThumbnailLoading';

const TemplateCardThumbnail = memo(function TemplateCardThumbnail({
  templateId,
  previewResume,
  previewLoading = false,
}: TemplateCardThumbnailProps) {
  if (!previewResume) {
    return previewLoading ? <TemplateCardThumbnailLoading /> : null;
  }

  return (
    <div
      className="template-card__thumbnail"
      data-preview-kind="thumbnail"
      data-thumbnail-state="live"
      data-thumbnail-component="ResumeTemplateRender"
    >
      <ResumeTemplateRender templateId={templateId} resumeData={previewResume} mode="thumbnail" />
    </div>
  );
});

TemplateCardThumbnail.displayName = 'TemplateCardThumbnail';

type TemplateCatalogGridProps = {
  templates: TemplateConfig[];
  previewResume: ResumeImportResult | null;
  selectedTemplate: TemplateId | '';
  recommendation?: TemplateRecommendation | null;
  hoveredTemplate?: TemplateId | '';
  onHoverTemplate?: (templateId: TemplateId | '') => void;
  onPreviewTemplate?: (templateId: TemplateId) => void;
  onSelectTemplate: (templateId: TemplateId) => void;
  primaryActionLabel?: string;
  layoutVariant?: 'list' | 'gallery';
  disabled?: boolean;
  previewLoading?: boolean;
  dataTestId?: string;
};

function TemplateCard({
  template,
  previewResume,
  selectedTemplate,
  recommendation,
  hoveredTemplate,
  onHoverTemplate,
  onPreviewTemplate,
  onSelectTemplate,
  primaryActionLabel,
  disabled,
  previewLoading,
}: {
  template: TemplateConfig;
  previewResume: ResumeImportResult | null;
  selectedTemplate: TemplateId | '';
  recommendation?: TemplateRecommendation | null;
  hoveredTemplate: TemplateId | '';
  onHoverTemplate?: (id: TemplateId | '') => void;
  onPreviewTemplate?: (id: TemplateId) => void;
  onSelectTemplate: (id: TemplateId) => void;
  primaryActionLabel: string;
  disabled: boolean;
  previewLoading: boolean;
}) {
  const isApplied = Boolean(selectedTemplate) && template.id === selectedTemplate;
  const isRecommended = template.id === recommendation?.primaryTemplateId;
  const showRecommendedReason = Boolean(isRecommended && recommendation?.reasons[0]);
  const isPreviewing = template.id === hoveredTemplate;
  const previewHandler = onPreviewTemplate || onSelectTemplate;
  const showPreviewAction = Boolean(onPreviewTemplate);

  const handlePreview = () => {
    if (disabled) return;
    previewHandler(template.id);
  };

  const handlePrimaryAction = () => {
    if (disabled) return;
    onSelectTemplate(template.id);
  };

  return (
    <article
      key={template.id}
      className={`template-card ${isApplied ? 'active' : ''}`}
      data-template-id={template.id}
      onClick={() => {
        if (disabled) return;
        previewHandler(template.id);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          previewHandler(template.id);
        }
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => onHoverTemplate?.(template.id)}
      onMouseLeave={() => onHoverTemplate?.('')}
    >
      <div
        className="template-card__preview template-card__preview--interactive"
        onClick={(event) => {
          event.stopPropagation();
          handlePreview();
        }}
      >
        <TemplateCardThumbnail templateId={template.id} previewResume={previewResume} previewLoading={previewLoading} />
        <button
          type="button"
          className="template-card__preview-overlay template-card__preview-overlay-button"
          onClick={(event) => {
            event.stopPropagation();
            handlePreview();
          }}
          disabled={disabled}
        >
          Open preview
        </button>
      </div>
      <div className="template-card__meta">
        <div>
          <strong>{template.name}</strong>
          <div className="small">{template.description}</div>
          <div className="small template-card__availability">{template.tags.join(' | ')}</div>
          {showRecommendedReason && (
            <p className="small template-card__reason">
              Why recommended? {recommendation?.reasons[0]}
            </p>
          )}
        </div>
        <div className="template-card__meta-badges">
          <span className="pill">{isApplied ? 'Applied' : isPreviewing ? 'Previewing' : 'Available'}</span>
          {/* Honest ATS-safety badge so the user knows up-front whether a
             template will survive a real ATS upload. We previously tagged
             everything not explicitly "Visual" as ATS-safe, which
             overstated parser compatibility for academic / healthcare /
             creative layouts. */}
          {template.atsSafety === 'high' && (
            <span
              className="pill recommended"
              title="Plain single-column layout. Tested to parse cleanly across Workday, Greenhouse, iCIMS, Taleo, BambooHR."
            >
              ATS-safe
            </span>
          )}
          {template.atsSafety === 'medium' && (
            <span
              className="pill"
              style={{ background: '#fff7e0', color: '#7a5a00', borderColor: '#e9d27a' }}
              title="Single-column with light styling. Content parses, but some ATS may drop the styled bits — preview your upload before applying."
            >
              Recruiter-friendly
            </span>
          )}
          {template.atsSafety === 'low' && (
            <span
              className="pill"
              style={{ background: '#ffe8e8', color: '#a02020', borderColor: '#e9a0a0' }}
              title="Visual / multi-column / chip-style. ATS scrapers often drop sections. Use for direct networking or printed CVs — switch to a Classic / Minimal variant before uploading to a job portal."
            >
              Not ATS-safe
            </span>
          )}
          {isRecommended && (
            <span className="pill recommended" title={(recommendation?.reasons || []).join(' ')}>
              Recommended
            </span>
          )}
        </div>
        <div className="template-card__actions">
          {showPreviewAction && (
            <button
              type="button"
              className="btn secondary template-card__action"
              onClick={(event) => {
                event.stopPropagation();
                handlePreview();
              }}
              disabled={disabled}
            >
              Preview
            </button>
          )}
          <button
            type="button"
            className="btn template-card__action"
            onClick={(event) => {
              event.stopPropagation();
              handlePrimaryAction();
            }}
            disabled={disabled}
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function TemplateCatalogGrid({
  templates,
  previewResume,
  selectedTemplate,
  recommendation,
  hoveredTemplate = '',
  onHoverTemplate,
  onPreviewTemplate,
  onSelectTemplate,
  primaryActionLabel = 'Preview',
  layoutVariant = 'list',
  disabled = false,
  previewLoading = false,
  dataTestId,
}: TemplateCatalogGridProps) {
  const atsTemplates = templates.filter((t) => t.tags.includes('ATS-safe'));
  const visualTemplates = templates.filter((t) => !t.tags.includes('ATS-safe'));

  const cardProps = {
    previewResume,
    selectedTemplate,
    recommendation,
    hoveredTemplate,
    onHoverTemplate,
    onPreviewTemplate,
    onSelectTemplate,
    primaryActionLabel,
    disabled,
    previewLoading,
  };

  const gridClass = `template-grid ${layoutVariant === 'gallery' ? 'template-grid--gallery' : 'template-grid--list'}`;

  return (
    <div data-testid={dataTestId} data-layout-variant={layoutVariant}>
      {atsTemplates.length > 0 && (
        <div className="template-catalog-section">
          <div className="template-catalog-section__header">
            <span className="template-catalog-section__badge template-catalog-section__badge--ats">ATS-Safe</span>
            <h3 className="template-catalog-section__title">ATS-Optimised Templates</h3>
            <p className="template-catalog-section__desc">Parsed correctly by applicant tracking systems. Safe to submit to job portals.</p>
          </div>
          <div className={gridClass}>
            {atsTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} {...cardProps} />
            ))}
          </div>
        </div>
      )}

      {visualTemplates.length > 0 && (
        <div className="template-catalog-section">
          <div className="template-catalog-section__header">
            <span className="template-catalog-section__badge template-catalog-section__badge--visual">Visual</span>
            <h3 className="template-catalog-section__title">Visual / Showcase Templates</h3>
            <p className="template-catalog-section__desc">Designed for portfolios, direct networking, and printed CVs. Not optimised for ATS parsing.</p>
          </div>
          <div className="template-catalog-section__warning">
            Not ATS-safe — avoid submitting through job portals or automated hiring systems.
          </div>
          <div className={gridClass}>
            {visualTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} {...cardProps} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
