import type { ComponentType } from 'react';
import type { ResumeImportResult, TemplateCatalogId, TemplateCatalogItem } from 'resume-builder-shared';
import { DEFAULT_TEMPLATE_ID, TEMPLATE_CATALOG, resolveTemplateCatalogId } from 'resume-builder-shared';
import AcademicCV from '@/components/templates/AcademicCV';
import ClassicATS from '@/components/templates/ClassicATS';
import ConsultantClean from '@/components/templates/ConsultantClean';
import CreativePortfolio from '@/components/templates/CreativePortfolio';
import HealthcareCV from '@/components/templates/HealthcareCV';
import MinimalClean from '@/components/templates/MinimalClean';
import ModernProfessional from '@/components/templates/ModernProfessional';
import TechnicalCompact from '@/components/templates/TechnicalCompact';
import SidebarBold from '@/components/templates/SidebarBold';
import AccentHeader from '@/components/templates/AccentHeader';
import { presetTemplateComponent } from '@/components/templates/PresetTemplate';
import { visualTemplateComponent } from '@/components/templates/VisualTemplate';

export type TemplateComponentProps = {
  resumeData: ResumeImportResult;
};

export type TemplateConfig = TemplateCatalogItem & {
  component: ComponentType<TemplateComponentProps>;
};

type TemplateComponentKey = TemplateCatalogItem['componentKey'];

const templateComponents: Record<TemplateComponentKey, ComponentType<TemplateComponentProps>> = {
  classic: ClassicATS,
  modern: ModernProfessional,
  technical: TechnicalCompact,
  minimal: MinimalClean,
  consultant: ConsultantClean,
  academic: AcademicCV,
  healthcare: HealthcareCV,
  // R-077 — Medical Coder reuses the healthcare component on-screen; the
  // coder-specific labels live in the export renderer + catalog metadata.
  'medical-coder': HealthcareCV,
  // R-081 — profession-tuned templates reuse a proven component on-screen;
  // the role-specific export labels live in the API export renderer.
  'ai-ml-engineer': TechnicalCompact,
  'product-manager': ConsultantClean,
  creative: CreativePortfolio,
  'sidebar-bold': SidebarBold,
  'accent-header': AccentHeader,
  // R-110 — 2026 intake. These share ONE renderer driven by the shared
  // preset (resume-builder-shared/templates/presets.ts); the API export
  // renderer reads the same preset, so preview and PDF cannot diverge.
  'skills-first': presetTemplateComponent('skills-first'),
  'impact-metrics': presetTemplateComponent('impact-metrics'),
  'ai-native': presetTemplateComponent('ai-native'),
  'executive-brief': presetTemplateComponent('executive-brief'),
  'compact-dense': presetTemplateComponent('compact-dense'),
  'career-switch': presetTemplateComponent('career-switch'),
  'early-talent': presetTemplateComponent('early-talent'),
  'federal-detailed': presetTemplateComponent('federal-detailed'),
  'revenue-sales': presetTemplateComponent('revenue-sales'),
  'data-analytics': presetTemplateComponent('data-analytics'),
  'open-source': presetTemplateComponent('open-source'),
  'remote-global': presetTemplateComponent('remote-global'),
  // nb-visual family — one component, variant per id (see VisualTemplate.tsx).
  'sidebar-elegant': visualTemplateComponent('sidebar-elegant'),
  'icon-accent': visualTemplateComponent('icon-accent'),
  'banner-modern': visualTemplateComponent('banner-modern'),
  'initials-classic': visualTemplateComponent('initials-classic'),
  'photo-banner': visualTemplateComponent('photo-banner'),
  'timeline-pro': visualTemplateComponent('timeline-pro'),
  'elegant-serif': visualTemplateComponent('elegant-serif'),
  'bold-header': visualTemplateComponent('bold-header'),
};

const templateEntries = TEMPLATE_CATALOG.map((template) => {
  return [template.id, { ...template, component: templateComponents[template.componentKey] }] as const;
});

export const templateRegistry = Object.fromEntries(templateEntries) as Record<TemplateCatalogId, TemplateConfig>;
export type TemplateId = keyof typeof templateRegistry;
export const templateList = TEMPLATE_CATALOG.map((template) => templateRegistry[template.id]);
export const defaultTemplateId: TemplateId = DEFAULT_TEMPLATE_ID;

export function resolveTemplateId(value: string, fallback: TemplateId = defaultTemplateId): TemplateId {
  return resolveTemplateCatalogId(value, fallback);
}

