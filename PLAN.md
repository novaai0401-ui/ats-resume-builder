# Implementation Plan - Next-Gen Features

## Phase 1: Repository Scan - DONE

## Phase 2: Product Gap Analysis

### Existing Features
- Email OTP auth (with SMTP)
- Google OAuth (Drive integration only, not login)
- Resume CRUD with parsing (PDF, DOCX)
- ATS scoring engine with JD support
- AI critique (Groq/XAI providers)
- Template system with preview
- PDF export
- Admin panel
- Billing (Stripe)
- Structured ATS guidance with JD-aware suggestions
- Session warning modal

### Missing Features (Priority Order)
1. Social Login (Google/LinkedIn/Yahoo) - HIGH
2. Technology/Skill Gap Analysis - HIGH
3. Password-based auth + forgot/reset password - HIGH
4. Mobile auth integration - MEDIUM
5. Job Tracker / Application Tracker - DONE (2026-04-24)
6. AI Cover Letter Studio - DONE (2026-04-24)
7. Resume versioning - MEDIUM
8. Interview prep - LOW
9. Career path guidance - LOW

## Phase 3: Implementation Order
1. Backend: Social OAuth providers (Google login, LinkedIn, Yahoo)
2. Backend: Password auth + forgot/reset password
3. Backend: Technology gap analysis endpoint
4. Frontend: Social login buttons + password auth UI
5. Frontend: Technology gap analysis UI
6. Mobile: Auth integration
7. Mobile: Native UX improvements
8. Env/docs updates

## Phase 4: Job Tracker + Cover Letter Studio (DONE 2026-04-24)
Two premium-tier features competitors (Huntr, Teal, Rezi) gate behind
$9–$30/month. Shipped behind standard plan gating + BYOK fallback.

### JobApplication (Kanban + pipeline stats)
- Prisma model `JobApplication` with status/funnel fields, linked tailored
  resumes/cover letters, `nextActionAt` follow-up reminders.
- NestJS `/jobs` controller: CRUD, `/jobs/stats` (response + offer rates),
  `/jobs/upcoming?days=N`.
- Next.js `/jobs` page: Kanban board, inline status moves, follow-up chip
  strip, modal editor with JD paste-in for AI matching.
- Auto-stamps `appliedAt` and `closedAt` on status transitions.

### CoverLetter (AI-tailored, resume-grounded)
- Prisma model `CoverLetter` with tone, body (markdown), wordCount, provider.
- NestJS endpoint `POST /ai/cover-letter` reuses Groq/XAI providers with a
  dedicated JSON-only prompt and rule-based fallback. `GET /ai/cover-letters`
  for history.
- Next.js `/cover-letter` page: resume picker, 4 tone presets, JD textarea,
  live preview with copy-to-clipboard, saved letters history.
- Gated to paid plans (BYOK AI key unlocks for free users) when the payment
  feature flag is enabled.
