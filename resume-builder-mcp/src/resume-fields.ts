import { z } from 'zod';

/**
 * R-107 — the resume section shapes an assistant may send, mirroring
 * `resume-builder-shared/src/schemas/index.ts` field for field.
 *
 * Why this file exists: the tool schemas used to declare `startDate`,
 * `endDate` and `highlights` as OPTIONAL while the API requires all three,
 * and made `contact` wholly optional while the API requires `fullName` on
 * any contact object it receives. An assistant that gathered exactly what
 * the tool asked for got a 400 it was never warned about — and the model
 * has no way to recover from a rejection it cannot predict.
 *
 * These cannot import the shared package at runtime: the MCP ships to npm
 * as a standalone binary whose only dependencies are the SDK and zod, so a
 * workspace import would break `npx @tekivex/callbackcv-mcp`. Instead the
 * shapes are mirrored here and `tests/schema-parity.test.mjs` imports the
 * real shared schemas and fails if the two ever drift. The test is the
 * enforcement; this file is the copy it checks.
 */

export const ContactFields = z.object({
  // Required by the API on any contact object it receives.
  fullName: z.string().min(2).describe('Full name — required whenever contact is provided'),
  email: z.string().optional().describe('Email address'),
  phone: z.string().optional().describe('Phone number, with country code where relevant'),
  location: z.string().optional().describe('City, or city and country'),
  links: z.array(z.string().min(3)).optional().describe('LinkedIn, portfolio, GitHub URLs'),
});

export const ExperienceFields = z.object({
  company: z.string().min(2),
  role: z.string().min(2),
  // All three are REQUIRED by the API. Ask the user rather than guessing:
  // an invented date is a fabricated fact on a hiring document.
  startDate: z.string().min(1).describe('e.g. "Jan 2022" — required; ask the user, never guess'),
  endDate: z.string().min(1).describe('e.g. "Present" or "Dec 2024" — required'),
  highlights: z.array(z.string()).min(1).describe('At least one outcome bullet — include numbers where the user gives them'),
});

export const EducationFields = z.object({
  institution: z.string().min(2),
  degree: z.string().min(2),
  startDate: z.string().min(1).describe('Required'),
  endDate: z.string().min(1).describe('Required'),
  details: z.array(z.string()).optional(),
  gpa: z.number().min(0).max(10).nullish().describe('Provide GPA or percentage, never both'),
  percentage: z.number().min(0).max(100).nullish(),
});

export const ProjectFields = z.object({
  name: z.string().min(2),
  role: z.string().min(2).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  url: z.string().optional().describe('Must start with https://'),
  highlights: z.array(z.string()).min(1).describe('At least one bullet — required'),
});

export const CertificationFields = z.object({
  name: z.string().min(2),
  issuer: z.string().min(2).optional(),
  date: z.string().optional(),
  details: z.array(z.string()).optional(),
});

/** R-077 profession sections — licensed and academic roles depend on these. */
export const LicenseFields = z.object({
  name: z.string().min(1),
  authority: z.string().optional(),
  licenseNumber: z.string().optional(),
  region: z.string().optional(),
  validTill: z.string().optional(),
});

export const PublicationFields = z.object({
  title: z.string().min(1),
  venue: z.string().optional(),
  year: z.string().optional(),
  url: z.string().optional(),
  type: z.enum(['publication', 'patent']).optional(),
});

/**
 * Every section an assistant can write, shared by create_resume and
 * update_resume so the two cannot drift from each other either.
 */
export const resumeSectionFields = {
  contact: ContactFields.optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  experience: z.array(ExperienceFields).optional(),
  education: z.array(EducationFields).optional(),
  projects: z.array(ProjectFields).optional(),
  certifications: z.array(CertificationFields).optional(),
  licenses: z.array(LicenseFields).optional().describe('Professional licences — nurses, doctors, engineers'),
  publications: z.array(PublicationFields).optional().describe('Papers and patents'),
  achievements: z.array(z.string()).optional().describe('Awards and recognitions'),
  templateId: z.string().optional().describe('Template id, e.g. "classic" (default), "modern", "skills-first"'),
};
