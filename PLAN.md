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
5. Job Tracker / Application Tracker - MEDIUM
6. Resume versioning - MEDIUM
7. Interview prep - LOW
8. Career path guidance - LOW

## Phase 3: Implementation Order
1. Backend: Social OAuth providers (Google login, LinkedIn, Yahoo)
2. Backend: Password auth + forgot/reset password
3. Backend: Technology gap analysis endpoint
4. Frontend: Social login buttons + password auth UI
5. Frontend: Technology gap analysis UI
6. Mobile: Auth integration
7. Mobile: Native UX improvements
8. Env/docs updates
