# Pocket Resume — Session pin

> Read me before doing anything. The next three files are non-negotiable
> context for every change in this repo.

## Pinned reading order

1. **`docs/REQUIREMENTS.md`** — the master, dependency-ordered build
   plan with stable IDs (R-001, R-002, …) and status flags. Before
   writing code, find the requirement ID this work belongs to.
   Update its `Status` line and append your commit SHA in the same
   commit. Don't silently expand an existing requirement; if the work
   doesn't fit, add a new ID at the correct dependency position with
   acceptance criteria written BEFORE the code.

2. **`docs/TEMPLATE_SPEC.md`** — the template architecture spec.
   Anything under `resume-builder-web/components/templates/`,
   `resume-builder-shared/src/templates/`, or the section catalogue
   in `resume-builder-shared/src/resume-normalization.ts` must conform
   to it. The non-negotiables are listed in §9 of that file — recite
   them before editing a template.

3. **`docs/PRODUCT_STRATEGY.md`** — the moat thesis and the kill list.
   Use this to push back on requests that don't compound the Outcome
   Graph or that violate the trust layer.

## Companion files (read on demand)

- **`docs/PRE_LAUNCH_TESTING.md`** — page-by-page test matrix and
  capacity assessment. Open before any change that touches auth, the
  editor, or export.
- **`docs/SMOKE_TEST_CHECKLIST.md`** — the human smoke-test script
  the founder runs against prod URL.

## Workflow rules (non-negotiable)

- **Cross-cutting constants** are in `REQUIREMENTS.md §6` (C-001 to
  C-007). Violations are bugs by definition. The most-relevant ones
  to keep in working memory:
  - C-001 Schema source of truth is `packages/resume-schemas`.
  - C-002 ATS section catalogue lives in `resume-builder-shared/src/resume-normalization.ts`.
  - C-003 No privacy copy claims the code doesn't deliver.
  - C-004 No silent quota bypass — typed exceptions only.
  - C-007 Every `ResumeVersion` and `JobApplication` keeps the
    outcome-attribution link intact. This is the moat.

- **Trust over polish.** If a feature is half-built (vault, social-
  login error map, Cloud-sync toggle), the user must NOT be told it
  works. Either ship it end-to-end or keep it behind an admin flag.

- **Status hygiene.** A commit that touches code mapped to a tracked
  requirement without updating `REQUIREMENTS.md` is itself a bug.
  Reviewers should reject.

- **Test the contract, not the implementation.** Every fix in this
  branch's history has a pinning unit test next to it (see
  `tests/security-headers.test.ts`, `tests/editor-reset-gate.test.ts`,
  `tests/export-quota.unit.test.cjs`, etc.). Follow the pattern.

## Decisions log

`REQUIREMENTS.md §7` is the running log of waivers and scope changes.
When you change a decision, add a row there with the date and reason.
Don't rewrite history.

## What goes in `docs/`

- Pinned specs (this file, REQUIREMENTS, TEMPLATE_SPEC, STRATEGY).
- Operational runbooks (PRE_LAUNCH_TESTING, SMOKE_TEST_CHECKLIST).
- Nothing transient. Working notes go in PR descriptions or the
  decisions log, not in `docs/`.
