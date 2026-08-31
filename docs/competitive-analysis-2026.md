# Competitive analysis — August 2026

External assessment of CallbackCV vs. Rezi / Teal / Jobscan, received 2026-08-31,
plus the engineering triage of it. Kept verbatim in spirit; trimmed to what is
actionable.

## The assessment (summary)

Positioning: India-first, ATS-optimized builder. Free forever editing, ₹49/export,
₹199 STUDENT / ₹499 PRO. Differentiators: **Outcome Loop** (real response /
interview / offer rates per resume version) and **simulators** (Recruiter-AI +
ATS extracted-text). Honest AI (no invented metrics), privacy-first, skill-gap
analysis, application tracker.

### Gaps it identified vs. competitors

| Gap | Competitor benchmark | Triage |
|---|---|---|
| Chrome extension / one-click job capture | Teal, Jobscan extensions | **REAL — top priority.** See job-capture-roadmap.md |
| Named ATS identification per employer | Jobscan identifies Workday/Greenhouse per job | **REAL — cheap win.** Detect ATS from `JobApplication.jdUrl` hostname |
| Outcome Loop depends on user diligence | — | **REAL.** Needs nudges; see roadmap |
| LinkedIn optimizer not a core differentiator | Jobscan LinkedIn audit | Partially stale — exists as a free tool; a marketing-depth question |
| Cover letter / interview prep depth | Teal/Kickresume | Mostly stale — multi-tone cover letters + interview prep are built; public pages undersell them |
| Visual template variety | Kickresume/Enhancv | Accepted trade-off — ATS-safety-first is the positioning |
| Auto-apply / volume automation | adjacent tools | **Deliberately skipped** — contradicts honest-AI positioning; recruiter backlash on AI spam favors us |
| Human review add-ons | Rezi higher tiers | Skip until revenue funds an ops function |
| Global localization depth | — | Later; India-first is the moat right now |

### What it undersells

The **aggregate** Outcome Loop: once enough users log outcomes, anonymized
"resumes like X got 2× callbacks for Y roles" insights become a data moat no
competitor can copy without the data. Protect and invest early — which makes
fixing logging friction the prerequisite for everything.

## Priority order (engineering view)

1. **Outcome logging nudges** — smallest, unlocks the moat.
2. **ATS detection from job URL** — trivial detection, credible marketing.
3. **Chrome extension (job clipper)** — biggest build, biggest retention lever.

Details for all three: [job-capture-roadmap.md](job-capture-roadmap.md).
