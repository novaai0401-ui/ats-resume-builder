export type User = {
  id: string;
  email: string;
  fullName: string;
};

export type ContactInfo = {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
};

export type Resume = {
  id: string;
  userId: string;
  title: string;
  contact?: ContactInfo;
  summary: string;
  skills: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects?: ProjectItem[];
  certifications?: CertificationItem[];
  achievements?: string[];
  templateId?: string;
  /** R-045 — design customization (font family id + density + accent). */
  fontFamily?: string | null;
  density?: string | null;
  accentColor?: string | null;
  /** R-045 Phase 2 — per-resume body-section order (ATS family). */
  sectionOrder?: string[] | null;
  /** R-045 Phase 3 — profile photo (base64 data URI; visual templates only). */
  photoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResumeImportResult = {
  title: string;
  contact?: ContactInfo;
  summary: string;
  skills: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects?: ProjectItem[];
  certifications?: CertificationItem[];
  achievements?: string[];
  /** R-045 Phase 2 — body-section order override carried into templates. */
  sectionOrder?: string[] | null;
  /** R-045 Phase 3 — profile photo data URI carried into templates. */
  photoUrl?: string | null;
  roleLevel?: 'FRESHER' | 'MID' | 'SENIOR';
  unmappedText?: string;
  text?: string;
  parsed?: {
    title: string;
    contact?: ContactInfo;
    summary: string;
    skills: string[];
    technicalSkills?: string[];
    softSkills?: string[];
    languages?: string[];
    experience: ExperienceItem[];
    education: EducationItem[];
    projects?: ProjectItem[];
    certifications?: CertificationItem[];
  achievements?: string[];
    roleLevel?: 'FRESHER' | 'MID' | 'SENIOR';
    unmappedText?: string;
  };
};

export type ExperienceItem = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights: string[];
};

export type EducationItem = {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  details?: string[];
  gpa?: number | null;
  percentage?: number | null;
};

export type ProjectItem = {
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  highlights: string[];
};

export type CertificationItem = {
  name: string;
  issuer?: string;
  date?: string;
  details?: string[];
};

export type AtsIssuePointer = {
  resumeSectionId?: string;
  itemId?: string;
  bulletId?: string;
  field?: string;
};

export type AtsIssue = {
  code: 'EXP_BULLET_ACTION_VERB' | 'JD_SUGGESTION';
  severity: 'error' | 'warning' | 'info';
  message: string;
  section: 'experience' | 'projects' | 'jobDescription';
  pointer?: AtsIssuePointer;
};

export type AtsScoreResult = {
  resumeId: string;
  atsScore: number;
  roleLevel: 'FRESHER' | 'MID' | 'SENIOR';
  roleAdjustedScore: number;
  rejectionReasons: string[];
  improvementSuggestions: string[];
  details: string[];
  missingKeywords: string[];
  actionVerbRule?: {
    requiredRatio: number;
    percentage: number;
    strongBullets: number;
    totalBullets: number;
    requiredStrongBullets: number;
    remainingToPass: number;
    passes: boolean;
    failedBullets: Array<{
      index: number;
      reason: 'weak_starter' | 'not_strong_enough';
      suggestions: string[];
    }>;
    message: string;
  };
  issues: AtsIssue[];
  meta: {
    jobDescriptionUsed: boolean;
  };
  guidance?: AtsGuidance;
};

export type AtsGuidance = {
  roleAlignmentSummary: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  weakSignals: string[];
  sectionSuggestions: {
    summary: string[];
    experience: string[];
    skills: string[];
  };
  addOnlyIfTrue: string[];
  topImpactActions: string[];
  scoreExplanation: string;
};

export type DuplicateResumeResult = Resume;

export type JobDescriptionSummary = {
  skills: string[];
  responsibilities: string[];
  seniority: string;
};

export type ResumeScoreResult = {
  score: number;
  suggestions: string[];
  matchedSkills: string[];
  missingSkills: string[];
};

export type JdParseResult = {
  skills: string[];
  responsibilities: string[];
  seniority: string;
};

export type ResumeCritiqueResult = {
  highlights: string[];
  weaknesses: string[];
  rewrittenSummary: string;
};

export type SkillGapResult = {
  missingSkills: string[];
  recommendedKeywords: string[];
};

export type AiCritiqueRequest = {
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate: string;
    highlights: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    startDate: string;
    endDate: string;
  }>;
  jdText?: string;
  atsWeaknesses?: string[];
  missingKeywords?: string[];
  currentScore?: number;
  /** Resume being critiqued — flags our-AI assist for the per-download fee. */
  resumeId?: string;
};

export type AiCritiqueSuggestion = {
  summary: string;
  topIssues: Array<{ type: string; severity: string; message: string }>;
  missingKeywords: string[];
  sectionSuggestions: {
    summary: string[];
    skills: string[];
    experience: Array<{
      expIndex: number;
      bulletIndex: number;
      original: string;
      suggested: string;
    }>;
  };
  atsSafetyWarnings: string[];
  estimatedImprovementBand: {
    current: string;
    possibleFree: string;
    premium: string;
  };
};

export type AiCritiqueResult = {
  success: boolean;
  provider: string;
  plan: 'free' | 'premium';
  critique: AiCritiqueSuggestion;
};

export type Plan = 'FREE' | 'STUDENT' | 'PRO';

export type DuplicateResumeDto = {
  title?: string;
};

export const JOB_STATUS_VALUES = [
  'wishlist',
  'applied',
  'phone_screen',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export type JobStatus = (typeof JOB_STATUS_VALUES)[number];

export type JobApplication = {
  id: string;
  userId: string;
  company: string;
  role: string;
  jdUrl: string | null;
  jdText: string | null;
  location: string | null;
  salaryRange: string | null;
  status: JobStatus;
  source: string | null;
  referral: string | null;
  resumeId: string | null;
  coverLetterId: string | null;
  notes: string | null;
  nextActionAt: string | null;
  appliedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobApplicationInput = {
  company: string;
  role: string;
  jdUrl?: string | null;
  jdText?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  status?: JobStatus;
  source?: string | null;
  referral?: string | null;
  resumeId?: string | null;
  coverLetterId?: string | null;
  notes?: string | null;
  nextActionAt?: string | null;
  appliedAt?: string | null;
  closedAt?: string | null;
};

export type JobStats = {
  total: number;
  active: number;
  closed: number;
  byStatus: Record<JobStatus, number>;
  responseRate: number;
  offerRate: number;
};

export type CoverLetterTone = 'professional' | 'enthusiastic' | 'concise' | 'formal';

export type CoverLetter = {
  id: string;
  userId: string;
  resumeId: string | null;
  company: string;
  role: string;
  jdText: string | null;
  tone: CoverLetterTone;
  body: string;
  wordCount: number;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoverLetterGenerateRequest = {
  resumeId?: string;
  company: string;
  role: string;
  tone?: CoverLetterTone;
  jdText?: string;
  candidate?: {
    fullName?: string;
    summary?: string;
    skills?: string[];
    experience?: Array<{
      company: string;
      role: string;
      startDate?: string;
      endDate?: string;
      highlights: string[];
    }>;
    education?: Array<{ institution: string; degree: string }>;
  };
};

export type ResumeVersionSummary = {
  id: string;
  resumeId: string;
  label: string | null;
  atsScoreSnapshot: number | null;
  createdAt: string;
};

export type CoverLetterGenerateResponse = {
  id: string;
  body: string;
  wordCount: number;
  provider: string;
  tone: CoverLetterTone;
  company: string;
  role: string;
};
