# R-045 — Resume Design Customization (Adobe-class) — Implementation Plan

> Status: **PLANNED** (acceptance criteria written before code, per CLAUDE.md).
> Goal: make Pocket Resume templates feel "standard"/pro — user-controlled
> accent colour, font family, and density, plus section reordering and an
> optional region-aware photo. Three phases.

## Why this is a plan, not a one-shot change

Confirmed during investigation:

- Templates (10) style themselves via **className-based CSS in
  `app/globals.css`** (e.g. `.nb-accent-header__band`), not inline tokens.
  `components/templates/templateUtils.tsx` exists but exposes **data helpers
  only — no `tokens`** (the layer `TEMPLATE_SPEC §9.6` references was never
  built).
- There are **two renderers** that must stay in lock-step
  (`TEMPLATE_SPEC §1.4`, §5, §9): the React preview (`TemplatePreview` →
  `templateRegistry[id].component`) and the **server-side export**
  (`renderResumeTemplateHtml` in `resume-builder-api/src/resume/resume.service.ts`).
  Regression tests pin preview↔export parity.
- `TemplatePreview` already declares `accentOverride`/`fontOverride`/`spacing`
  props but **ignores them** (dead stub). `§9.1` forbids adding a second
  template prop, so design must flow via **CSS variables on a wrapper** +
  a `tokens` layer, not new props on `TemplateComponentProps`.

So this is a cross-cutting, migration-bearing, spec-governed feature. Doing it
hastily risks breaking PDF export and the parity tests.

---

## Phase 1 — Accent colour + font family + density

### Data + types
- Prisma `Resume` += `accentColor String?`, `fontFamily String?`,
  `density String?` (`'compact'|'normal'|'airy'`). New migration
  `2026xxxx_add_resume_design`. `prisma generate`.
- `resume-builder-shared`: add the three optional fields to the resume
  type(s) + `ResumeDraft` (web store) + any update DTO/zod schema. A pure
  `resolveDesign()` helper: validates accent (hex), font (allow-list),
  density (enum) → safe defaults. **Single source of truth, used by both
  renderers.**

### Token layer (the missing `templateUtils.tokens`)
- Add `designTokens(design)` to `templateUtils.tsx` returning the CSS-var map
  `{ '--rb-accent', '--rb-font', '--rb-gap', '--rb-line' }` from a resolved
  design (with each template's existing colour as the fallback).
- Refactor the 10 template CSS blocks in `globals.css`: replace hardcoded
  accent colours with `var(--rb-accent, <existing-default>)`; replace the
  font stack with `var(--rb-font, <existing-default>)`; replace section gaps /
  line-height with `var(--rb-gap)` / `var(--rb-line)`. **Defaults preserve
  today's look exactly** when no design is set (zero visual regression).

### Apply in both renderers (parity)
- Preview: wire `TemplatePreview` to wrap `<TemplateComponent>` in a
  `<div style={designTokens(design)}>` (resolve from the resume). Delete the
  dead `accentOverride`/`fontOverride` props or route them through `resolveDesign`.
- Export: `renderResumeTemplateHtml` emits the same CSS vars on the root
  wrapper element. One shared `designTokens` map → guaranteed parity.

### Fonts (per maintainer decision: expand beyond the 4)
- Curated allow-list (e.g. IBM Plex Sans, Literata, Source Sans 3, Work Sans,
  Inter, Lato, Merriweather, Roboto Slab). Update the Google Fonts preload in
  `app/layout.tsx` **and** `font-src` / `style-src` in `next.config.mjs` CSP.
  Allow-list lives in `resume-builder-shared` so server export validates the
  same set.

### Editor UI
- A "Design" panel in `ResumeEditor` (or its own collapsible card): accent
  colour picker, font `<select>`, density `<select>` → patch the resume
  (`updateResume`) + live preview. Mobile-friendly.

### Tests + governance
- Unit: `resolveDesign` (hex/font/density validation + fallbacks);
  `designTokens` mapping.
- Parity: extend the existing preview/export snapshot test to assert the same
  CSS vars appear in both outputs.
- `REQUIREMENTS.md`: flip R-045 Status to DONE + commit SHA in the same commit.

### Acceptance (Phase 1)
- [ ] A user can set accent/font/density on a resume; preview updates live.
- [ ] The exported PDF/DOCX reflects the same accent/font/density (parity).
- [ ] No design set → byte-for-byte today's output (no regression).
- [ ] Only allow-listed fonts accepted (client + server); CSP updated.
- [ ] ATS-export variant stays single-column/plain (`§9.5`) — density/accent
      may apply, decorative imagery may not.

## Phase 2 — Drag-to-reorder sections
- Prisma `Resume += sectionOrder String[]?`. A per-resume override read by
  `getAtsSectionOrder` (`§9.2`) — unknown/missing sections fall back to the
  canonical order (`§9.4`). Editor: drag handles on the Sections navigator.
  Both renderers honour the override. Tests for the merge (override ∪ canonical).

## Phase 3 — Region-aware photo / header
- Prisma `Resume += photoUrl String?`, `headerStyle String?`. Upload via the
  existing Files path. **Default OFF for US / ATS-strict templates**
  (photos hurt ATS parsing); ON for India/EU visual templates. Export
  embeds the image; ATS-export variant always omits it.

---

## Rollout
- Phase 1 is one PR (migration + tokens + 10 CSS refactors + 2 renderers +
  fonts/CSP + editor panel + tests). Phases 2 and 3 follow as separate PRs.
- Each phase: zero-regression default, preview↔export parity, spec §9 intact.
