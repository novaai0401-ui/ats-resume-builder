/**
 * R-045 Phase 1 — resume design customization (font family + density).
 *
 * Single source of truth shared by the web preview and the server-side export
 * renderer so the two stay in lock-step (TEMPLATE_SPEC §1.4/§5/§9). Design is
 * applied as CSS custom properties on a wrapper:
 *   --rb-font      font-family stack
 *   --rb-fs-scale  font-size multiplier (templates use calc(base * scale))
 *   --rb-lh        line-height
 * Templates read these with their *current* value as the fallback, so an
 * unset design renders byte-for-byte as today (zero regression).
 */

export type ResumeDensity = 'compact' | 'normal' | 'airy';

export interface ResumeDesign {
  fontFamily?: string | null;
  density?: ResumeDensity | null;
  /** Accent colour as a #rgb / #rrggbb hex string. Null/empty = template default. */
  accentColor?: string | null;
}

/** Curated, ATS-safe accent presets surfaced as swatches in the picker. */
export const ACCENT_PRESETS: readonly { id: string; label: string; value: string }[] = [
  { id: 'navy', label: 'Navy', value: '#1a2e4a' },
  { id: 'blue', label: 'Blue', value: '#2563a8' },
  { id: 'teal', label: 'Teal', value: '#0f766e' },
  { id: 'green', label: 'Green', value: '#1e7d4f' },
  { id: 'plum', label: 'Plum', value: '#6d3a6b' },
  { id: 'maroon', label: 'Maroon', value: '#7a2e3a' },
  { id: 'charcoal', label: 'Charcoal', value: '#2b3a55' },
] as const;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate + normalize an accent colour. Returns null when invalid/empty. */
export function normalizeAccentColor(value?: string | null): string | null {
  const v = String(value || '').trim();
  if (!HEX_RE.test(v)) return null;
  return v.toLowerCase();
}

export interface FontOption {
  /** Stable id stored on the resume + used as the <select> value. */
  id: string;
  /** Human label for the picker. */
  label: string;
  /** Full CSS font-family stack (always ends in a generic family). */
  stack: string;
  /** Google Fonts family name for preload (omitted for system fonts). */
  google?: string;
}

const SANS_FALLBACK = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const SERIF_FALLBACK = `Georgia, 'Times New Roman', 'Liberation Serif', serif`;

/**
 * Curated, expanded allow-list (maintainer chose "add more Google Fonts").
 * Keep this in sync with the preload <link> in app/layout.tsx and the CSP
 * font-src. The first entry is the default ("System sans" = no webfont).
 */
export const FONT_OPTIONS: readonly FontOption[] = [
  { id: 'system-sans', label: 'System Sans (default)', stack: SANS_FALLBACK },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', stack: `'IBM Plex Sans', ${SANS_FALLBACK}`, google: 'IBM Plex Sans' },
  { id: 'inter', label: 'Inter', stack: `'Inter', ${SANS_FALLBACK}`, google: 'Inter' },
  { id: 'work-sans', label: 'Work Sans', stack: `'Work Sans', ${SANS_FALLBACK}`, google: 'Work Sans' },
  { id: 'source-sans-3', label: 'Source Sans 3', stack: `'Source Sans 3', ${SANS_FALLBACK}`, google: 'Source Sans 3' },
  { id: 'lato', label: 'Lato', stack: `'Lato', ${SANS_FALLBACK}`, google: 'Lato' },
  { id: 'literata', label: 'Literata (serif)', stack: `'Literata', ${SERIF_FALLBACK}`, google: 'Literata' },
  { id: 'merriweather', label: 'Merriweather (serif)', stack: `'Merriweather', ${SERIF_FALLBACK}`, google: 'Merriweather' },
  { id: 'source-serif-4', label: 'Source Serif 4 (serif)', stack: `'Source Serif 4', ${SERIF_FALLBACK}`, google: 'Source Serif 4' },
] as const;

export const DENSITY_OPTIONS: readonly { id: ResumeDensity; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Normal (default)' },
  { id: 'airy', label: 'Airy' },
] as const;

const DENSITY_MAP: Record<ResumeDensity, { scale: number; lineHeight: number }> = {
  compact: { scale: 0.92, lineHeight: 1.3 },
  normal: { scale: 1, lineHeight: 1.4 },
  airy: { scale: 1.08, lineHeight: 1.55 },
};

export interface ResolvedDesign {
  fontId: string;
  fontStack: string | null; // null = use the template's default font
  density: ResumeDensity;
  fontScale: number;
  lineHeight: number;
  /** Normalized accent hex, or null = use the template's default colour. */
  accentColor: string | null;
  /** True when everything is at its default (no vars need to be emitted). */
  isDefault: boolean;
}

/** Validate + resolve a stored design into render-ready values. */
export function resolveDesign(design?: ResumeDesign | null): ResolvedDesign {
  const fontId = String(design?.fontFamily || '').trim();
  const font = FONT_OPTIONS.find((f) => f.id === fontId);
  const isSystemOrUnknown = !font || font.id === 'system-sans';

  const densityRaw = String(design?.density || '').trim() as ResumeDensity;
  const density: ResumeDensity = densityRaw in DENSITY_MAP ? densityRaw : 'normal';
  const { scale, lineHeight } = DENSITY_MAP[density];

  const accentColor = normalizeAccentColor(design?.accentColor);

  return {
    fontId: font ? font.id : 'system-sans',
    fontStack: isSystemOrUnknown ? null : font!.stack,
    density,
    fontScale: scale,
    lineHeight,
    accentColor,
    isDefault: isSystemOrUnknown && density === 'normal' && accentColor === null,
  };
}

/**
 * CSS custom properties to set on the render wrapper. Returns an empty object
 * when the design is default, so no vars are emitted and templates fall back
 * to their built-in look (the zero-regression guarantee).
 */
export function designCssVars(design?: ResumeDesign | null): Record<string, string> {
  const r = resolveDesign(design);
  if (r.isDefault) return {};
  const vars: Record<string, string> = {};
  if (r.fontStack) vars['--rb-font'] = r.fontStack;
  if (r.fontScale !== 1) vars['--rb-fs-scale'] = String(r.fontScale);
  if (r.density !== 'normal') vars['--rb-lh'] = String(r.lineHeight);
  if (r.accentColor) vars['--rb-accent'] = r.accentColor;
  return vars;
}

/** Serialize the vars to an inline `style="..."` fragment (for the export HTML). */
export function designCssText(design?: ResumeDesign | null): string {
  return Object.entries(designCssVars(design))
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
}

/** Google families that must be loaded for the chosen font (for preload). */
export function googleFontFamilies(): string[] {
  return FONT_OPTIONS.map((f) => f.google).filter((g): g is string => Boolean(g));
}
