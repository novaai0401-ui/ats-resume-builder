
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useFeatureFlags from '@/src/hooks/use-feature-flags';
import { RESUME_CREATE_RATE_LIMIT_CODE, api, Resume, ResumeImportResult, UploadResumeResponse, getAccessToken, isApiRequestError } from '@/src/lib/api';
import { useResumeStore } from '@/src/lib/resume-store';
import {
  REQUIRED_FLOW_SEQUENCE,
  buildReviewAtsRoute,
  buildTemplateSelectionRoute,
  buildResumePayload,
  clearActiveResumeSelection,
  clearPendingUploadSession,
  createUploadSummary,
  savePendingUploadSession,
  createScratchEditorState,
  canContinueToAts,
  detectExperienceLevelFromResume,
  getNavigationGateState,
  persistActiveResumeSelection,
  readPendingUploadSession,
  resolveEditorUploadNavigation,
  resolveCurrentSessionResumeId,
  resumeFromApi as resumeFromImportedApi,
  type UploadSummary as UploadSummaryState,
} from '@/src/lib/resume-flow';
import { ingestResumeFile } from '@/src/lib/resume-ingest';
import { buildReviewAtsAttentionItems, REVIEW_ATS_DEBOUNCE_MS } from '@/src/lib/review-ats';
import { checkAtsScore } from '@/src/lib/review-ats-action';
import { toFieldErrorMap } from '@/src/lib/validation-errors';
import { ACTION_VERB_REQUIRED_RATIO, createActionVerbRuleState, getActionVerbFailure, replaceBulletStarter, type ActionVerbRuleState, type ExperienceBulletEntry } from '@/src/lib/action-verb-rule';
import { addEmptyExperience, removeExperienceAt } from '@/src/lib/experience-editor';
import { addEmptyProject, EMPTY_PROJECT, ensureAtLeastOneProject, isValidProjectUrl, moveProject } from '@/src/lib/project-editor';
import { CompanyAutocomplete } from '@/src/components/CompanyAutocomplete';
import { AutocompleteInput } from '@/src/components/AutocompleteInput';
import { compareYearMonth, isPresentToken, isYearMonth, toMonthInputValue, toYearMonth } from '@/src/lib/date-utils';
import {
  buildCompanySuggestions,
  mergeCompanyPools,
  persistRecentCompanies,
  readRecentCompanies,
} from '@/src/lib/company-suggestions';
import { validateExperienceEntries } from '@/src/lib/experience-validation';
import { addLanguageTag, addSkillTag, normalizeSkillCategories, removeLanguageTag, removeSkillTag } from '@/src/lib/skill-tags';
import {
  CERTIFICATION_FALLBACK,
  EDUCATION_INSTITUTION_FALLBACK,
  SOFT_SKILL_FALLBACK,
  TECHNICAL_SKILL_FALLBACK,
} from '@/src/lib/suggestion-seeds';
import { LANGUAGE_SUGGESTIONS, normalizeLanguageTag } from '@/src/lib/languages';
import { TkxButton, TkxCard, TkxCardBody, TkxInput, TkxBadge, TkxAlert, TkxFileUpload } from 'tekivex-ui';

type ContactInfo = {
  fullName: string;
  email?: string;
  phone?: string;
  location?: string;
  links?: string[];
};

type ExperienceItem = {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  highlights: string[];
};

type EducationItem = {
  institution: string;
  degree: string;
  startDate: string;
  endDate: string;
  details?: string[];
  gpa?: number | null;
  percentage?: number | null;
};

type ProjectItem = {
  name: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  highlights: string[];
};

type CertificationItem = {
  name: string;
  issuer?: string;
  date?: string;
  details?: string[];
};

type ResumeDraft = {
  title: string;
  contact: ContactInfo;
  summary: string;
  skills: string[];
  technicalSkills?: string[];
  softSkills?: string[];
  languages?: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
  projects: ProjectItem[];
  certifications: CertificationItem[];
  templateId?: string;
};

type SectionType =
  | 'contact'
  | 'summary'
  | 'skills'
  | 'languages'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications';

type SectionState = {
  id: string;
  type: SectionType;
  enabled: boolean;
  required: boolean;
};

type FeedbackLevel = 'good' | 'warn' | 'error';
type UploadSummary = UploadSummaryState;

const emptyEducation: EducationItem = { institution: '', degree: '', startDate: '', endDate: '', details: [], gpa: null, percentage: null };
const emptyCertification: CertificationItem = { name: '', issuer: '', date: '', details: [''] };

type QuotaState = {
  resumeBlocked: boolean;
  atsBlocked: boolean;
  message: string;
};

const SECTION_LABELS: Record<SectionType, string> = {
  contact: 'Header & Contact',
  summary: 'Summary',
  skills: 'Skills',
  languages: 'Languages',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  certifications: 'Certifications',
};

const SECTION_NAV_ORDER: SectionType[] = [
  'contact',
  'summary',
  'experience',
  'education',
  'skills',
  'projects',
  'certifications',
  'languages',
];

const SECTION_NAV_LABELS: Record<SectionType, string> = {
  contact: 'Header',
  summary: 'Summary',
  skills: 'Skills',
  languages: 'Languages',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  certifications: 'Certifications',
};

const SECTION_GUIDANCE: Record<SectionType, { tip: string; helper?: string }> = {
  contact: {
    tip: 'Use the name and contact info you want recruiters to see.',
    helper: 'Include at least one way to contact you (email or phone).',
  },
  summary: {
    tip: '2-3 sentences focused on role, scope, and results.',
    helper: 'Mention your target role, years of experience, and a clear outcome.',
  },
  skills: {
    tip: 'List 6-12 ATS-friendly skills aligned to the role.',
    helper: 'Add technical and soft skills as tags. You can still add custom skills.',
  },
  languages: {
    tip: 'Add spoken languages separately from technical skills.',
    helper: 'Examples: English, Hindi, Spanish. You can add custom languages too.',
  },
  experience: {
    tip: 'Each bullet should be one line with action + impact.',
    helper: 'Aim for 2-5 bullets per role and include numbers when possible.',
  },
  education: {
    tip: 'Include degree, institution, and dates.',
    helper: 'Add honors, coursework, or certifications if relevant.',
  },
  projects: {
    tip: 'Great for early-career or role-specific work.',
    helper: 'Highlight outcomes, tech stack, and measurable impact.',
  },
  certifications: {
    tip: 'Add current, relevant certifications.',
    helper: 'Include issuer and date for credibility.',
  },
};

const SECTION_ID_PREFIX = 'resume-section-';
export const SECTION_FOCUS_OVERRIDE_MS = 1500;
export const SECTION_FOCUS_CLEAR_MS = 50;
type SectionChangeReason = 'focusin' | 'pointerdown' | 'keydown' | 'intersection' | 'click' | 'scroll' | 'initial';
const SECTION_KEYS: SectionType[] = SECTION_NAV_ORDER;

const BULLET_WORD_LIMIT = 28;
const BULLET_LENGTH_WARNING = 'Experience bullets must be 28 words or fewer.';

const defaultQuotaState: QuotaState = {
  resumeBlocked: false,
  atsBlocked: false,
  message: '',
};

export function shouldShowQuotaBanner(paymentFeatureEnabled: boolean, message: string) {
  return paymentFeatureEnabled && Boolean(String(message || '').trim());
}

export default function ResumeEditor() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedResumeId = searchParams.get('id') || '';
  const templateParam = searchParams.get('template') || '';
  const normalizedTemplateParam = String(templateParam || '').trim();
  const flowParam = (searchParams.get('flow') || '').trim().toLowerCase();
  const isReviewAtsPage = pathname === '/resume/review';
  const isReviewFlow = isReviewAtsPage || flowParam === 'upload' || flowParam === 'review';
  const hasPendingReviewUpload = !requestedResumeId && isReviewFlow && Boolean(readPendingUploadSession());
  const shouldIgnoreSessionResume = flowParam === 'scratch' || hasPendingReviewUpload;
  const effectiveResumeId = shouldIgnoreSessionResume
    ? String(requestedResumeId || '').trim()
    : resolveCurrentSessionResumeId(requestedResumeId);
  const [resumeId, setResumeId] = useState(effectiveResumeId);
  const resume = useResumeStore((state) => state.resume as unknown as ResumeDraft);
  const uploadedFileName = useResumeStore((state) => state.uploadedFileName);
  const atsReview = useResumeStore((state) => state.atsReview);
  const setResumeStore = useResumeStore((state) => state.setResume);
  const setUploadedFileName = useResumeStore((state) => state.setUploadedFileName);
  const setAtsReview = useResumeStore((state) => state.setAtsReview);
  const resetAtsReview = useResumeStore((state) => state.resetAtsReview);
  const resetResumeStore = useResumeStore((state) => state.resetResume);
  const setResume = (updater: ResumeDraft | ((prev: ResumeDraft) => ResumeDraft)) => {
    setResumeStore(updater as any);
  };
  const [sections, setSections] = useState<SectionState[]>(() => getDefaultSections());
  const [jdText, setJdText] = useState('');
  const [message, setMessage] = useState('');
  const [loadingUpload, setLoadingUpload] = useState(false);
  const [loadingAtsNavigation, setLoadingAtsNavigation] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [importNotes, setImportNotes] = useState('');
  const [importRoleLevel, setImportRoleLevel] = useState<'FRESHER' | 'MID' | 'SENIOR' | ''>('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportIssues, setExportIssues] = useState<string[]>([]);
  const [exportApproved, setExportApproved] = useState(false);
  const [exportSummary, setExportSummary] = useState<string>('');
  const [guidedNavigation, setGuidedNavigation] = useState(true);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isImportedMode, setIsImportedMode] = useState(false);
  const [pendingUploadFileName, setPendingUploadFileName] = useState('');
  const [recentCompanies, setRecentCompanies] = useState<string[]>([]);
  const [technicalSkillInput, setTechnicalSkillInput] = useState('');
  const [softSkillInput, setSoftSkillInput] = useState('');
  const [languageInput, setLanguageInput] = useState('');
  const { paymentFeatureEnabled } = useFeatureFlags();
  const [quotaState, setQuotaState] = useState<QuotaState>(() => ({ ...defaultQuotaState }));
  const [snackbar, setSnackbar] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [aiCritiqueResult, setAiCritiqueResult] = useState<import('resume-builder-shared').AiCritiqueResult | null>(null);
  const [aiCritiqueLoading, setAiCritiqueLoading] = useState(false);
  const [aiCritiqueError, setAiCritiqueError] = useState('');
  const [techGapResult, setTechGapResult] = useState<import('@/src/lib/api').TechGapResult | null>(null);
  const [techGapLoading, setTechGapLoading] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumOptimizing, setPremiumOptimizing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastValidationCode, setLastValidationCode] = useState('');
  const [actionVerbRule, setActionVerbRule] = useState<ActionVerbRuleState>(() => createActionVerbRuleState([]));
  const [activeSectionId, setActiveSectionId] = useState<SectionType>('contact');
  const [showTemplatePromptModal, setShowTemplatePromptModal] = useState(false);
  const [templatePromptHref, setTemplatePromptHref] = useState('');
  const activeSectionIdRef = useRef<SectionType>('contact');
  const editorRef = useRef<HTMLElement | null>(null);
  const editingSectionRef = useRef<SectionType | null>(null);
  const lastFocusTsRef = useRef(0);
  const focusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewAtsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionVerbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewAtsRunRef = useRef(0);
  const snackbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTemplateSaveRef = useRef<Promise<void> | null>(null);
  const templateSaveRunRef = useRef(0);
  const sectionDebugEnabled = process.env.NEXT_PUBLIC_SECTION_DEBUG === '1';
  const resumeQuotaBlocked = paymentFeatureEnabled && quotaState.resumeBlocked;
  const atsQuotaBlocked = paymentFeatureEnabled && quotaState.atsBlocked;
  const quotaMessage = paymentFeatureEnabled ? quotaState.message : '';
  const showQuotaBanner = shouldShowQuotaBanner(paymentFeatureEnabled, quotaMessage);

  const logSectionChange = useCallback((next: SectionType, reason: SectionChangeReason) => {
    if (!sectionDebugEnabled) return;
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug(`[section-nav] active=${next} via ${reason}`);
    }
  }, [sectionDebugEnabled]);

  const setActiveSection = useCallback((next: SectionType, reason: SectionChangeReason) => {
    if (activeSectionIdRef.current === next) return;
    activeSectionIdRef.current = next;
    logSectionChange(next, reason);
    setActiveSectionId(next);
  }, [logSectionChange]);

  useEffect(() => {
    setResumeId(effectiveResumeId);
  }, [effectiveResumeId]);

  useEffect(() => {
    // Skip the blanket reset when a pending upload session exists — the restore
    // effect that follows will populate the store from sessionStorage.
    if (!effectiveResumeId && isReviewFlow && readPendingUploadSession()) {
      return;
    }
    resetResumeStore();
    setImportNotes('');
    setImportRoleLevel('');
    setUploadSummary(null);
    setIsImportedMode(false);
    setActiveStepIndex(0);
  }, [effectiveResumeId, flowParam, resetResumeStore, templateParam, isReviewFlow]);

  useEffect(() => {
    setRecentCompanies(readRecentCompanies());
  }, []);

  useEffect(() => () => {
    if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    if (actionVerbTimerRef.current) clearTimeout(actionVerbTimerRef.current);
  }, []);

  useEffect(() => {
    if (!paymentFeatureEnabled) {
      setQuotaState({ ...defaultQuotaState });
    }
  }, [paymentFeatureEnabled]);

  useEffect(() => {
    if (!isReviewAtsPage) return;
    const win: any = globalThis;
    const editor = editorRef.current;
    if (!editor) return;
    const enabledSections = new Set(sections.filter((s) => s.enabled).map((s) => s.type));
    const trackedSections: Array<{ type: SectionType; element: HTMLElement }> = [];
    SECTION_NAV_ORDER.forEach((type) => {
      if (!enabledSections.has(type)) return;
      const el = document.getElementById(`resume-section-${type}`);
      if (!el) return;
      trackedSections.push({ type, element: el });
    });
    if (!trackedSections.length) return;

    setActiveSection(trackedSections[0].type, 'initial');

    const sectionMeta = buildSectionMetaMap(trackedSections);

    const shouldSkipForEditing = () => {
      if (typeof document === 'undefined') return false;
      const activeElement = document.activeElement as HTMLElement | null;
      const activeInside = editor.contains(activeElement);
      return shouldRespectEditingOverride(
        editingSectionRef.current,
        lastFocusTsRef.current,
        SECTION_FOCUS_OVERRIDE_MS,
        activeInside,
      );
    };

    const clearEditingSectionIfStale = () => {
      if (!editingSectionRef.current) return;
      const now = Date.now();
      if (now - lastFocusTsRef.current >= SECTION_FOCUS_OVERRIDE_MS) {
        editingSectionRef.current = null;
      }
    };

    const observeSections = () => {
      const observer = new IntersectionObserver(
        (entries) => {
          const next = getActiveSectionFromObserverEntries(entries, sectionMeta);
          if (!next) return;
          if (shouldSkipForEditing()) return;
          clearEditingSectionIfStale();
          setActiveSection(next, 'intersection');
        },
        { root: editor, rootMargin: '-20% 0px -70% 0px', threshold: [0.25, 0.5, 0.75] },
      );
      trackedSections.forEach(({ element }) => observer.observe(element));
      return () => observer.disconnect();
    };

    if ('IntersectionObserver' in win) {
      const cleanup = observeSections();
      return cleanup;
    }

    let scrollTimer: number | null = null;
    const checkScroll = () => {
      scrollTimer = null;
      const viewportHeight = win.innerHeight || 0;
      let candidateType: SectionType | null = null;
      let candidateTop = Number.POSITIVE_INFINITY;
      let pastCandidateType: SectionType | null = null;
      let pastCandidateTop = Number.NEGATIVE_INFINITY;
      trackedSections.forEach(({ type, element }) => {
        const rect = element.getBoundingClientRect();
        if (rect.top >= 0 && rect.top <= viewportHeight * 0.6) {
          if (rect.top < candidateTop) {
            candidateType = type;
            candidateTop = rect.top;
          }
        }
        if (rect.top < 0) {
          if (rect.top > pastCandidateTop) {
            pastCandidateType = type;
            pastCandidateTop = rect.top;
          }
        }
      });
      const next = candidateType ?? pastCandidateType ?? trackedSections[0]?.type;
      if (!next) return;
      if (shouldSkipForEditing()) return;
      clearEditingSectionIfStale();
      setActiveSection(next, 'scroll');
    };
    const handleScroll = () => {
      if (scrollTimer) return;
      scrollTimer = win.setTimeout(checkScroll, 120);
    };
    checkScroll();
    win.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      win.removeEventListener('scroll', handleScroll);
      if (scrollTimer) {
        win.clearTimeout(scrollTimer);
      }
    };
  }, [isReviewAtsPage, sections, setActiveSection]);

  useEffect(() => {
    if (!isReviewAtsPage) return;
    const win: any = globalThis;
    const editor = editorRef.current;
    if (!editor) return;
    const handleEditorInteraction = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const sectionKey = getSectionKeyFromNode(target);
      if (!sectionKey) return;
      editingSectionRef.current = sectionKey;
      lastFocusTsRef.current = Date.now();
      let reason: SectionChangeReason = 'focusin';
      if (event.type === 'pointerdown') reason = 'pointerdown';
      if (event.type === 'keydown') reason = 'keydown';
      setActiveSection(sectionKey, reason);
    };
    const handleFocusOut = (event: FocusEvent) => {
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (relatedTarget && editor.contains(relatedTarget)) return;
      if (focusClearTimerRef.current) {
        clearTimeout(focusClearTimerRef.current);
      }
      focusClearTimerRef.current = win.setTimeout(() => {
        editingSectionRef.current = null;
        lastFocusTsRef.current = 0;
      }, SECTION_FOCUS_CLEAR_MS);
    };

    editor.addEventListener('focusin', handleEditorInteraction, true);
    editor.addEventListener('pointerdown', handleEditorInteraction, true);
    editor.addEventListener('keydown', handleEditorInteraction, true);
    editor.addEventListener('focusout', handleFocusOut, true);
    return () => {
      editor.removeEventListener('focusin', handleEditorInteraction, true);
      editor.removeEventListener('pointerdown', handleEditorInteraction, true);
      editor.removeEventListener('keydown', handleEditorInteraction, true);
      editor.removeEventListener('focusout', handleFocusOut, true);
      if (focusClearTimerRef.current) {
        clearTimeout(focusClearTimerRef.current);
      }
    };
  }, [isReviewAtsPage, setActiveSection]);

  const handleSectionNavClick = (type: SectionType, enabled: boolean) => {
    if (!enabled) return;
    setActiveSection(type, 'click');
    scrollToSection(type);
  };

  useEffect(() => {
    if (!getAccessToken()) {
      setMessage('Please sign in to edit resumes.');
      return;
    }
    if (effectiveResumeId) {
      api.getResume(effectiveResumeId)
        .then((r) => {
          setResumeId(r.id);
          persistActiveResumeSelection(r.id);
          const loadedResume = resumeFromImportedApi(r);
          setResume(loadedResume);
        })
        .catch((err) => setMessage(err instanceof Error ? err.message : 'Failed to load resume'));
      return;
    }
  }, [effectiveResumeId, normalizedTemplateParam]);

  useEffect(() => {
    if (effectiveResumeId) return;
    if (isReviewFlow) {
      const pending = readPendingUploadSession();
      if (pending) {
        clearActiveResumeSelection();
        setResume(() => pending.resume);
        setImportNotes(pending.importNotes || '');
        setImportRoleLevel(pending.roleLevel || '');
        setUploadSummary(pending.uploadSummary);
        setIsImportedMode(true);
        if (pending.fileName) setUploadedFileName(pending.fileName);
        const targetStep = REQUIRED_FLOW_SEQUENCE.indexOf(pending.uploadSummary.reviewTarget);
        const nextStepIndex = targetStep >= 0 ? targetStep : 0;
        setActiveStepIndex(nextStepIndex);
        requestAnimationFrame(() => scrollToSection(pending.uploadSummary.reviewTarget as SectionType));
        setMessage(`Upload processed. Review ${SECTION_LABELS[pending.uploadSummary.reviewTarget as SectionType]} before moving ahead.`);
        resetAtsReview();
        markDirty();
        return;
      }

      setMessage(
        isReviewAtsPage
          ? 'Select a saved resume or upload a new one to continue to Review & ATS.'
          : 'Select a saved resume or upload a new one to continue.',
      );
      return;
    }
    if (flowParam === 'scratch') {
      clearActiveResumeSelection();
      clearPendingUploadSession();
      const scratch = createScratchEditorState();
      setResume(() => scratch.resume as ResumeDraft);
      setImportNotes(scratch.importNotes);
      setImportRoleLevel(scratch.roleLevel);
      setUploadSummary(scratch.uploadSummary);
      setUploadedFileName('');
      setIsImportedMode(false);
      resetAtsReview();
      setActiveStepIndex(0);
      setMessage('');
    }
  }, [effectiveResumeId, flowParam, isReviewAtsPage, isReviewFlow, resetAtsReview, setUploadedFileName]);

  const experienceValidation = useMemo(
    () => validateExperienceEntries(resume.experience as any),
    [resume.experience],
  );
  const educationValidation = useMemo(
    () => validateEducationEntries(resume.education as any),
    [resume.education],
  );
  const validation = useMemo(() => validateResumeDraft(resume, sections), [resume, sections]);

  const showBulletLengthWarning = shouldShowBulletLengthWarning(message);
  const firstTooLongHighlightMeta = useMemo(() => findFirstTooLongHighlight(resume.experience), [resume.experience]);
  const firstTooLongHighlightId = firstTooLongHighlightMeta
    ? `experience-highlight-${firstTooLongHighlightMeta.expIndex}-${firstTooLongHighlightMeta.highlightIndex}`
    : '';
  const scrollToFirstInvalidHighlight = useCallback(() => {
    focusHighlightById(firstTooLongHighlightId);
  }, [firstTooLongHighlightId]);

  const companySuggestionPool = useMemo(
    () => mergeCompanyPools(
      resume.experience.map((item) => item.company || ''),
      recentCompanies,
    ),
    [recentCompanies, resume.experience],
  );
  const skillCategories = useMemo(
    () => normalizeSkillCategories({
      skills: resume.skills || [],
      technicalSkills: resume.technicalSkills || [],
      softSkills: resume.softSkills || [],
      languages: resume.languages || [],
    }),
    [resume.languages, resume.skills, resume.softSkills, resume.technicalSkills],
  );
  const technicalSkills = skillCategories.technicalSkills;
  const softSkills = skillCategories.softSkills;
  const languages = skillCategories.languages;
  const allSkills = skillCategories.skills;
  const institutionSuggestionPool = useMemo(
    () => mergeCompanyPools(
      EDUCATION_INSTITUTION_FALLBACK,
      resume.education.map((item) => item.institution || ''),
    ),
    [resume.education],
  );
  const technicalSkillSuggestionPool = useMemo(
    () => mergeCompanyPools(
      TECHNICAL_SKILL_FALLBACK,
      technicalSkills,
      resume.skills,
    ),
    [resume.skills, technicalSkills],
  );
  const softSkillSuggestionPool = useMemo(
    () => mergeCompanyPools(
      SOFT_SKILL_FALLBACK,
      softSkills,
    ),
    [softSkills],
  );
  const languageSuggestionPool = useMemo(
    () => mergeCompanyPools(
      LANGUAGE_SUGGESTIONS,
      languages,
    ),
    [languages],
  );
  const certificationSuggestionPool = useMemo(
    () => mergeCompanyPools(
      CERTIFICATION_FALLBACK,
      resume.certifications.map((item) => item.name || ''),
    ),
    [resume.certifications],
  );
  const fetchCompanySuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) return [];
    try {
      const response = await api.companySuggest(query);
      return Array.isArray(response.suggestions) ? response.suggestions : [];
    } catch {
      return [];
    }
  }, []);
  const fetchInstitutionSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) return [];
    try {
      const response = await api.suggestInstitutions(query, 10);
      return Array.isArray(response.items) ? response.items : [];
    } catch {
      return [];
    }
  }, []);
  const fetchTechnicalSkillSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) return [];
    try {
      const response = await api.suggestSkills(query, 'technical', 10);
      return Array.isArray(response.items) ? response.items : [];
    } catch {
      return [];
    }
  }, []);
  const fetchSoftSkillSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) return [];
    try {
      const response = await api.suggestSkills(query, 'soft', 10);
      return Array.isArray(response.items) ? response.items : [];
    } catch {
      return [];
    }
  }, []);
  const fetchCertificationSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) return [];
    try {
      const response = await api.suggestCertifications(query, 10);
      return Array.isArray(response.items) ? response.items : [];
    } catch {
      return [];
    }
  }, []);
  const navigationGate = useMemo(
    () => getNavigationGateState(validation.sections, activeStepIndex),
    [validation.sections, activeStepIndex],
  );
  useEffect(() => {
    if (activeStepIndex !== navigationGate.activeStepIndex) {
      setActiveStepIndex(navigationGate.activeStepIndex);
    }
  }, [activeStepIndex, navigationGate.activeStepIndex]);
  const summaryCharCount = resume.summary.trim().length;
  const skillsCount = allSkills.length;
  const experienceBullets = resume.experience.flatMap((e) => e.highlights).filter(Boolean);
  const longExperienceBullets = experienceBullets.filter((b) => countWords(b) > BULLET_WORD_LIMIT);
  const hasExperienceMetrics = experienceBullets.some((b) => /\d/.test(b));
  const actionVerbEntries = useMemo<ExperienceBulletEntry[]>(
    () => buildActionVerbEntries(resume.experience),
    [resume.experience],
  );
  const actionVerbRuleText = useMemo(() => {
    if (!actionVerbRule.totalBullets) return '';
    if (actionVerbRule.passes) {
      return `Good: ${actionVerbRule.percentage}% (${actionVerbRule.strongBullets}/${actionVerbRule.totalBullets}) bullets start with strong action verbs.`;
    }
    const threshold = Math.round(actionVerbRule.requiredRatio * 100);
    return `Currently ${actionVerbRule.percentage}% (${actionVerbRule.strongBullets}/${actionVerbRule.totalBullets}) bullets start with strong verbs. Fix ${actionVerbRule.remainingToPass} more bullet${actionVerbRule.remainingToPass === 1 ? '' : 's'} to reach ${threshold}%.`;
  }, [actionVerbRule]);
  const missingContact = resume.contact && !resume.contact.email && !resume.contact.phone;
  const experienceCount = resume.experience.filter(isMeaningfulExperience).length;
  const detectedExperience = useMemo(
    () => detectExperienceLevelFromResume(resume as any),
    [resume],
  );
  const detectedRoleLevel = detectedExperience.level || 'MID';
  const guidance = useMemo(() => buildGuidance({
    summaryCharCount,
    skillsCount,
    hasExperienceMetrics,
    longBulletCount: longExperienceBullets.length,
    missingContact: Boolean(missingContact),
    experienceCount,
    roleLevel: detectedRoleLevel,
  }), [summaryCharCount, skillsCount, hasExperienceMetrics, longExperienceBullets.length, missingContact, experienceCount, detectedRoleLevel]);

  useEffect(() => {
    if (actionVerbTimerRef.current) clearTimeout(actionVerbTimerRef.current);
    actionVerbTimerRef.current = setTimeout(() => {
      setActionVerbRule(createActionVerbRuleState(actionVerbEntries, ACTION_VERB_REQUIRED_RATIO));
    }, 320);
    return () => {
      if (actionVerbTimerRef.current) clearTimeout(actionVerbTimerRef.current);
    };
  }, [actionVerbEntries]);

  useEffect(() => {
    if (lastValidationCode !== 'ATS_ACTION_VERB_RATIO') return;
    if (!actionVerbRule.passes) return;
    setLastValidationCode('');
    setFieldErrors((prev) => {
      const next: Record<string, string> = {};
      for (const [path, text] of Object.entries(prev)) {
        if (/^experience(\[|\.)/.test(path) && /highlights/.test(path)) {
          continue;
        }
        next[path] = text;
      }
      return next;
    });
    setMessage((prev) => {
      if (/strong action verb|60%/i.test(prev || '')) return '';
      return prev;
    });
  }, [actionVerbRule.passes, lastValidationCode]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    if (!getAccessToken()) return;
    if (!validation.canAutoSave) {
      setStatus('idle');
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(true).catch(() => undefined);
    }, 1200);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [resume, sections, validation.canAutoSave]);

  useEffect(() => {
    if (!resumeId || !getAccessToken()) return;
    const timer = setTimeout(() => {
      api.recomputeResume(resumeId)
        .then((result) => setImportRoleLevel(result.roleLevel))
        .catch((err) => {
          if (process.env.NODE_ENV !== 'production') {
            console.error('[recomputeResume] failed', err);
          }
        });
    }, 900);
    return () => clearTimeout(timer);
  }, [resume, resumeId]);

  useEffect(() => {
    if (!isReviewAtsPage) {
      if (reviewAtsTimerRef.current) clearTimeout(reviewAtsTimerRef.current);
      resetAtsReview();
      return;
    }
    if (!hasResumeDraftContent(resume)) return;
    if (reviewAtsTimerRef.current) clearTimeout(reviewAtsTimerRef.current);
    reviewAtsTimerRef.current = setTimeout(() => {
      refreshReviewAts(resumeId ? 'debounce' : 'initial').catch(() => undefined);
    }, REVIEW_ATS_DEBOUNCE_MS);
    return () => {
      if (reviewAtsTimerRef.current) clearTimeout(reviewAtsTimerRef.current);
    };
  }, [isReviewAtsPage, jdText, resetAtsReview, resume, resumeId, validation.canAutoSave]);

  const showSnackbar = useCallback((type: 'success' | 'error', text: string) => {
    setSnackbar({ type, text });
    if (snackbarTimerRef.current) clearTimeout(snackbarTimerRef.current);
    snackbarTimerRef.current = setTimeout(() => setSnackbar(null), 3200);
  }, []);

  const persistTemplateId = useCallback(
    async (nextTemplateId: string, options?: { silent?: boolean }) => {
      const targetTemplateId = String(nextTemplateId || '').trim();
      if (!resumeId || !targetTemplateId) return;
      const runId = ++templateSaveRunRef.current;
      const savePromise = api.updateResume(resumeId, { templateId: targetTemplateId })
        .then(() => undefined)
        .catch((err: unknown) => {
          if (!options?.silent) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to save selected template.';
            setMessage(errorMessage);
            showSnackbar('error', errorMessage);
          }
          throw err;
        })
        .finally(() => {
          if (templateSaveRunRef.current === runId) {
            pendingTemplateSaveRef.current = null;
          }
        });
      pendingTemplateSaveRef.current = savePromise;
      await savePromise;
    },
    [resumeId, showSnackbar],
  );

  useEffect(() => {
    const nextTemplateId = normalizedTemplateParam;
    const currentTemplateId = String(resume.templateId || '').trim();
    if (!nextTemplateId || nextTemplateId === currentTemplateId) return;

    setResume((prev) => ({ ...prev, templateId: nextTemplateId }));
    if (!resumeId) return;

    persistTemplateId(nextTemplateId).catch(() => {
      setResume((prev) => {
        if (String(prev.templateId || '').trim() !== nextTemplateId) return prev;
        return { ...prev, templateId: currentTemplateId || undefined };
      });
    });
  }, [normalizedTemplateParam, persistTemplateId, resume.templateId, resumeId]);

  const ensureTemplateSavedForExport = useCallback(async () => {
    const desiredTemplateId = String(normalizedTemplateParam || resume.templateId || '').trim();
    if (!desiredTemplateId) {
      if (pendingTemplateSaveRef.current) {
        await pendingTemplateSaveRef.current;
      }
      return;
    }
    const currentTemplateId = String(resume.templateId || '').trim();
    if (currentTemplateId !== desiredTemplateId) {
      setResume((prev) => ({ ...prev, templateId: desiredTemplateId }));
      await persistTemplateId(desiredTemplateId, { silent: true });
      return;
    }
    if (pendingTemplateSaveRef.current) {
      await pendingTemplateSaveRef.current;
    }
  }, [normalizedTemplateParam, persistTemplateId, resume.templateId]);

  const rememberRecentCompanies = useCallback((values: string[]) => {
    const next = persistRecentCompanies({ companies: values });
    setRecentCompanies(next);
  }, []);

  const getFieldError = useCallback((path: string) => {
    return fieldErrors[path] || '';
  }, [fieldErrors]);

  async function saveDraft(isAuto = false) {
    setStatus('saving');
    setMessage('');
    if (!isAuto) {
      setFieldErrors({});
      setLastValidationCode('');
    }
    const payload = buildResumePayload({
      ...resume,
      templateId: normalizedTemplateParam || resume.templateId,
    }, sections);
    try {
      let result: Resume;
      if (resumeId) {
        result = await api.updateResume(resumeId, payload);
      } else {
        result = await api.createResume(payload);
        setResumeId(result.id);
      }
      persistActiveResumeSelection(result.id);
      clearPendingUploadSession();
      setStatus('saved');
      dirtyRef.current = false;
      setLastSavedAt(new Date().toLocaleTimeString());
      rememberRecentCompanies(
        resume.experience
          .map((item) => item.company)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      if (!isAuto) {
        setMessage('Saved');
        showSnackbar('success', 'Changes saved.');
        const targetResumeId = resumeId || result.id;
        if (targetResumeId) {
          setTemplatePromptHref(buildTemplateSelectionRoute(targetResumeId));
          setShowTemplatePromptModal(true);
        }
      }
      setFieldErrors({});
      setLastValidationCode('');
      if (paymentFeatureEnabled) {
        setQuotaState((prev) => ({ ...prev, resumeBlocked: false, message: prev.atsBlocked ? prev.message : '' }));
      }
      return result;
    } catch (err: unknown) {
      setStatus('error');
      const errorMessage = err instanceof Error ? err.message : 'Save failed';
      const isResumeRateLimited = isApiRequestError(err) && err.status === 429 && err.code === RESUME_CREATE_RATE_LIMIT_CODE;
      if (!isAuto && isApiRequestError(err)) {
        setLastValidationCode(err.code || '');
        if (err.fields.length) {
          setFieldErrors(toFieldErrorMap(err.fields));
        }
      }
      const quota = detectQuotaState(err);
      const quotaActive = paymentFeatureEnabled && (quota.resumeBlocked || quota.atsBlocked);
      if (quotaActive) {
        setQuotaState((prev) => ({
          resumeBlocked: prev.resumeBlocked || quota.resumeBlocked,
          atsBlocked: prev.atsBlocked || quota.atsBlocked,
          message: quota.message || prev.message,
        }));
      }
      if (!isAuto) {
        if (isResumeRateLimited) {
          setMessage('');
          showSnackbar('error', quotaActive ? (quota.message || errorMessage) : errorMessage);
        } else {
          setMessage(errorMessage);
          showSnackbar('error', errorMessage);
        }
      }
      throw err;
    }
  }

  async function refreshReviewAts(source: 'initial' | 'debounce' | 'manual' = 'manual') {
    if (!isReviewAtsPage) return;
    if (!getAccessToken()) return;
    const hasContent = hasResumeDraftContent(resume);
    if (!hasContent) return;
    const runId = ++reviewAtsRunRef.current;
    setAtsReview((prev) => ({ ...prev, loading: true, error: source === 'manual' ? '' : prev.error }));
    try {
      let activeResumeId = resumeId;
      if (!activeResumeId) {
        if (!validation.canAutoSave) {
          if (runId === reviewAtsRunRef.current) {
            setAtsReview((prev) => ({
              ...prev,
              loading: false,
              error: 'Complete required sections to compute ATS score.',
            }));
          }
          return;
        }
        const saved = await saveDraft(true);
        activeResumeId = saved.id;
      }
      const outcome = await checkAtsScore({
        resumeId: activeResumeId,
        jdText: jdText || undefined,
        previousScore: atsReview.result,
        score: api.atsScore,
      });
      if (runId !== reviewAtsRunRef.current) return;
      if (outcome.ok) {
        setAtsReview({
          loading: false,
          error: '',
          result: outcome.score,
          lastCheckedAt: new Date().toISOString(),
        });
        if (paymentFeatureEnabled) {
          setQuotaState((prev) => ({ ...prev, atsBlocked: false, message: prev.resumeBlocked ? prev.message : '' }));
        }
        return;
      }
      const quota = detectQuotaState(outcome.error);
      const quotaActive = paymentFeatureEnabled && (quota.resumeBlocked || quota.atsBlocked);
      if (quotaActive) {
        setQuotaState((prev) => ({
          resumeBlocked: prev.resumeBlocked || quota.resumeBlocked,
          atsBlocked: prev.atsBlocked || quota.atsBlocked,
          message: quota.message || prev.message,
        }));
      }
      setAtsReview((prev) => ({
        ...prev,
        loading: false,
        error: outcome.error,
        result: outcome.score,
      }));
    } catch {
      if (runId !== reviewAtsRunRef.current) return;
      setAtsReview((prev) => ({
        ...prev,
        loading: false,
        error: 'Could not compute ATS score.',
      }));
    } finally {
      if (runId === reviewAtsRunRef.current) {
        setAtsReview((prev) => ({ ...prev, loading: false }));
      }
    }
  }

  function markDirty() {
    dirtyRef.current = true;
    if (status !== 'saving') setStatus('idle');
  }

  async function score() {
    if (!resumeId) {
      setMessage('Save first to score');
      return;
    }
    try {
      const result = await api.atsScore(resumeId, jdText.trim() || undefined);
      // Build a human-readable ATS summary using structured guidance when available
      const g = result.guidance;
      let summaryText: string;
      if (g) {
        const parts: string[] = [
          `ATS Score: ${result.roleAdjustedScore}/100 (${result.roleLevel}).`,
        ];
        if (g.scoreExplanation) parts.push(g.scoreExplanation);
        if (g.topImpactActions.length) {
          parts.push('Top fixes: ' + g.topImpactActions.map((a, i) => `${i + 1}) ${a}`).join(' '));
        }
        if (g.missingKeywords.length) {
          parts.push('Missing keywords: ' + g.missingKeywords.slice(0, 6).join(', ') + '.');
        }
        summaryText = parts.join(' ');
      } else {
        summaryText = `ATS Score: ${result.roleAdjustedScore}/100 (${result.roleLevel}). ` +
          (result.missingKeywords.length ? `Missing keywords: ${result.missingKeywords.slice(0, 6).join(', ')}.` : 'No major missing keywords.');
      }
      setMessage(summaryText);
      // Also update atsReview so the guidance panel renders
      setAtsReview({ loading: false, error: '', result: { ...result, resumeId: resumeId }, lastCheckedAt: new Date().toISOString() });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Scoring failed';
      const quota = detectQuotaState(err);
      const isResumeRateLimited = isApiRequestError(err) && err.status === 429 && err.code === RESUME_CREATE_RATE_LIMIT_CODE;
      const quotaActive = paymentFeatureEnabled && (quota.resumeBlocked || quota.atsBlocked);
      if (quotaActive) {
        setQuotaState((prev) => ({
          resumeBlocked: prev.resumeBlocked || quota.resumeBlocked,
          atsBlocked: prev.atsBlocked || quota.atsBlocked,
          message: quota.message || prev.message,
        }));
      }
      if (isResumeRateLimited) {
        setMessage('');
      } else {
        setMessage(errorMessage);
      }
    }
  }

  async function parseJd() {
    if (!jdText.trim()) {
      setMessage('Paste a job description first.');
      return;
    }
    try {
      const result = await api.parseJd(jdText);
      setMessage(`JD skills: ${result.skills.slice(0, 8).join(', ')}.`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'JD parsing failed');
    }
  }

  async function critique() {
    setAiCritiqueLoading(true);
    setAiCritiqueError('');
    setAiCritiqueResult(null);
    try {
      const result = await api.aiCritique({
        summary: resume.summary,
        skills: allSkills,
        experience: resume.experience.map((e) => ({
          company: e.company || '',
          role: e.role || '',
          startDate: e.startDate || '',
          endDate: e.endDate || '',
          highlights: (e.highlights || []).filter(Boolean),
        })),
        education: resume.education.map((e) => ({
          institution: e.institution || '',
          degree: e.degree || '',
          startDate: e.startDate || '',
          endDate: e.endDate || '',
        })),
        jdText: jdText || undefined,
        atsWeaknesses: atsReview.result?.improvementSuggestions,
        missingKeywords: atsReview.result?.missingKeywords,
        currentScore: atsReview.result?.atsScore,
      });
      setAiCritiqueResult(result);
      if (result.provider === 'fallback') {
        showSnackbar('error', 'AI provider unavailable — showing rule-based suggestions.');
      } else {
        showSnackbar('success', 'AI critique ready.');
      }
    } catch (err: unknown) {
      // Fallback: call original rule-based critique
      const errorMsg = err instanceof Error ? err.message : 'AI critique failed';
      setAiCritiqueError(errorMsg);
      showSnackbar('error', errorMsg);
      try {
        const resumeText = [resume.summary, allSkills.join(' '), JSON.stringify(resume.experience), JSON.stringify(resume.education)].join(' ');
        const fallback = await api.critique(resumeText, jdText || undefined);
        const text = `Highlights: ${fallback.highlights.slice(0, 3).join(' ')} | Weaknesses: ${fallback.weaknesses.slice(0, 3).join(' ')}`;
        setMessage(text);
      } catch {
        // both failed — error already shown
      }
    } finally {
      setAiCritiqueLoading(false);
    }
  }

  async function analyzeTechGap() {
    setTechGapLoading(true);
    setTechGapResult(null);
    try {
      const result = await api.techGap({
        summary: resume.summary,
        skills: allSkills,
        experience: resume.experience.map((e) => ({
          company: e.company || '',
          role: e.role || '',
          startDate: e.startDate || '',
          endDate: e.endDate || '',
          highlights: (e.highlights || []).filter(Boolean),
        })),
        education: resume.education.map((e) => ({
          institution: e.institution || '',
          degree: e.degree || '',
        })),
        certifications: resume.certifications?.map((c) => ({ name: c.name || '' })),
        targetRole: jdText ? undefined : resume.title,
        jdText: jdText || undefined,
      });
      setTechGapResult(result);
      showSnackbar('success', 'Technology gap analysis complete.');
    } catch (err: unknown) {
      showSnackbar('error', err instanceof Error ? err.message : 'Technology gap analysis failed.');
    } finally {
      setTechGapLoading(false);
    }
  }

  async function handlePremiumOptimization() {
    // Case A: Not logged in → redirect to login with return intent
    if (!getAccessToken()) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('rb_return_to', window.location.pathname + window.location.search);
        sessionStorage.setItem('rb_premium_intent', 'PREMIUM_OPTIMIZE');
      }
      showSnackbar('error', 'Sign in to unlock premium optimization.');
      return;
    }
    // Case D: Missing required data
    if (!resumeId || !aiCritiqueResult) {
      showSnackbar('error', 'Run AI Critique first to get optimization suggestions.');
      return;
    }
    // Check entitlement
    try {
      const access = await api.checkPremiumAccess();
      if (access.allowed) {
        // Case C: Has entitlement → run premium optimization
        if (access.reason === 'credits') {
          await api.consumePremiumCredit('PREMIUM_OPTIMIZE');
        }
        await runPremiumOptimization();
      } else {
        // Case B: No entitlement → show upgrade modal
        setShowPremiumModal(true);
      }
    } catch {
      setShowPremiumModal(true);
    }
  }

  async function runPremiumOptimization() {
    setPremiumOptimizing(true);
    try {
      const result = await api.aiCritique({
        summary: resume.summary,
        skills: allSkills,
        experience: resume.experience.map((e) => ({
          company: e.company || '', role: e.role || '',
          startDate: e.startDate || '', endDate: e.endDate || '',
          highlights: (e.highlights || []).filter(Boolean),
        })),
        education: resume.education.map((e) => ({
          institution: e.institution || '', degree: e.degree || '',
          startDate: e.startDate || '', endDate: e.endDate || '',
        })),
        jdText: jdText || undefined,
        atsWeaknesses: atsReview.result?.improvementSuggestions,
        missingKeywords: atsReview.result?.missingKeywords,
        currentScore: atsReview.result?.atsScore,
      });
      setAiCritiqueResult(result as any);
      showSnackbar('success', 'Premium optimization complete. Review and apply suggestions.');
    } catch (err: unknown) {
      showSnackbar('error', err instanceof Error ? err.message : 'Premium optimization failed.');
    } finally {
      setPremiumOptimizing(false);
    }
  }

  async function exportPdf() {
    if (!resumeId) {
      setMessage('Save first to export.');
      return;
    }
    setExportOpen(true);
    setExportApproved(false);
    setExportIssues([]);
    setExportSummary('');
    setExportLoading(true);
    try {
      const ats = await api.atsScore(resumeId, jdText || undefined);
      const issues = [
        ...getSectionIssues(validation),
        ...ats.rejectionReasons,
      ];
      setExportIssues(issues);
      setExportSummary(`ATS score: ${ats.roleAdjustedScore}. ${ats.rejectionReasons.length ? 'Resolve blockers before export.' : 'Good to export.'}`);
    } catch (err: unknown) {
      setExportIssues(getSectionIssues(validation));
      setExportSummary(err instanceof Error ? err.message : 'Could not run ATS check. You can still export.');
    } finally {
      setExportLoading(false);
    }
  }

  async function onUpload(file?: File) {
    if (!file) return;
    setPendingUploadFileName(file.name);
    setLoadingUpload(true);
    setMessage('');
    try {
      // No baseResume — re-upload fully replaces previous resume data
      const ingested = await ingestResumeFile(file);
      const nextResume = ingested.resume as ResumeDraft;
      setResume(() => nextResume);
      setImportNotes(ingested.importNotes);
      setImportRoleLevel(ingested.roleLevel);
      const summary = createUploadSummary(nextResume, ingested.roleLevel);
      const targetSection = summary.reviewTarget as SectionType;
      setUploadSummary(summary);
      setIsImportedMode(true);
      setUploadedFileName(ingested.raw.fileName || file.name);
      rememberRecentCompanies(
        nextResume.experience
          .map((item) => item.company)
          .map((item) => item.trim())
          .filter(Boolean),
      );
      // Persist to sessionStorage so the data survives page refreshes
      savePendingUploadSession({
        createdAt: Date.now(),
        resume: nextResume,
        importNotes: ingested.importNotes,
        fileName: ingested.raw.fileName || file.name,
        roleLevel: ingested.roleLevel as any,
        uploadSummary: summary,
      });
      const targetStep = REQUIRED_FLOW_SEQUENCE.indexOf(targetSection);
      if (targetStep >= 0) setActiveStepIndex(targetStep);
      requestAnimationFrame(() => scrollToSection(targetSection));
      const navigation = resolveEditorUploadNavigation(flowParam, templateParam);
      setMessage(`Upload processed. ${summary.companyCount} companies detected. Detected level: ${formatRoleLevel(summary.roleLevel)}.`);
      if (navigation.shouldReplace) {
        router.replace(navigation.href);
      }
      markDirty();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoadingUpload(false);
    }
  }

  async function continueToAts() {
    if (!requiredSectionsValid) return;
    setLoadingAtsNavigation(true);
    setMessage('');
    try {
      const saved = await saveDraft(false);
      router.push(`/resume/ats?id=${encodeURIComponent(saved.id)}`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Could not continue to ATS.');
    } finally {
      setLoadingAtsNavigation(false);
    }
  }

  function goToReviewAts() {
    router.push(reviewRouteHref);
  }

  function updateSkillCategories(nextTechnical: string[], nextSoft: string[], nextLanguages: string[] = languages) {
    const next = normalizeSkillCategories({
      skills: [],
      technicalSkills: nextTechnical,
      softSkills: nextSoft,
      languages: nextLanguages,
    });
    setResume((prev) => ({
      ...prev,
      technicalSkills: next.technicalSkills,
      softSkills: next.softSkills,
      languages: next.languages,
      skills: next.skills,
    }));
    markDirty();
  }

  function addSkill(category: 'technical' | 'soft', value: string) {
    const next = addSkillTag(
      {
        technicalSkills,
        softSkills,
      },
      category,
      value,
    );
    updateSkillCategories(next.technicalSkills, next.softSkills);
    if (category === 'technical') {
      setTechnicalSkillInput('');
    } else {
      setSoftSkillInput('');
    }
  }

  function removeSkill(category: 'technical' | 'soft', value: string) {
    const next = removeSkillTag(
      {
        technicalSkills,
        softSkills,
      },
      category,
      value,
    );
    updateSkillCategories(next.technicalSkills, next.softSkills);
  }

  function addLanguage(value: string) {
    const nextLanguages = addLanguageTag(languages, value);
    updateSkillCategories(technicalSkills, softSkills, nextLanguages);
    setLanguageInput('');
  }

  function removeLanguage(value: string) {
    const target = normalizeLanguageTag(value).toLowerCase();
    if (!target) return;
    const filteredTechnical = technicalSkills.filter((item) => normalizeLanguageTag(item).toLowerCase() !== target);
    const filteredLegacySkills = (resume.skills || []).filter((item) => normalizeLanguageTag(item).toLowerCase() !== target);
    const nextLanguages = removeLanguageTag(languages, value);
    const next = normalizeSkillCategories({
      skills: filteredLegacySkills,
      technicalSkills: filteredTechnical,
      softSkills,
      languages: nextLanguages,
    });
    setResume((prev) => ({
      ...prev,
      technicalSkills: next.technicalSkills,
      softSkills: next.softSkills,
      languages: next.languages,
      skills: next.skills,
    }));
    markDirty();
  }

  function updateSectionOrder(index: number, direction: -1 | 1) {
    setSections((prev) => {
      const enabled = prev.filter((s) => s.enabled);
      const target = enabled[index];
      const swapIndex = index + direction;
      if (!enabled[swapIndex]) return prev;
      const targetIndex = prev.findIndex((s) => s.id === target.id);
      const swapTarget = enabled[swapIndex];
      const swapIndexAll = prev.findIndex((s) => s.id === swapTarget.id);
      const next = [...prev];
      next[targetIndex] = swapTarget;
      next[swapIndexAll] = target;
      return next;
    });
    markDirty();
  }

  function disableSection(type: SectionType) {
    setSections((prev) => prev.map((s) => (s.type === type ? { ...s, enabled: false } : s)));
    markDirty();
  }

  function enableSection(type: SectionType) {
    setSections((prev) => prev.map((s) => (s.type === type ? { ...s, enabled: true } : s)));
    if (type === 'projects' && !resume.projects.length) {
      setResume((prev) => ({ ...prev, projects: ensureAtLeastOneProject(prev.projects) }));
    }
    markDirty();
  }

  function goToRequiredStep(nextIndex: number) {
    const maxIndex = guidedNavigation ? navigationGate.furthestUnlockedIndex : REQUIRED_FLOW_SEQUENCE.length - 1;
    const clamped = Math.max(0, Math.min(nextIndex, maxIndex));
    setActiveStepIndex(clamped);
    scrollToSection(REQUIRED_FLOW_SEQUENCE[clamped] as SectionType);
  }

  function goToNextRequiredStep() {
    if (guidedNavigation && !navigationGate.canProceedCurrent) return;
    if (navigationGate.activeStepIndex >= REQUIRED_FLOW_SEQUENCE.length - 1) return;
    goToRequiredStep(navigationGate.activeStepIndex + 1);
  }

  function goToPreviousRequiredStep() {
    if (navigationGate.activeStepIndex <= 0) return;
    goToRequiredStep(navigationGate.activeStepIndex - 1);
  }

  const enabledSections = sections.filter((s) => s.enabled);
  const hiddenSections = sections.filter((s) => !s.enabled && !s.required);
  const completedSectionCount = enabledSections.filter((s) => validation.sections[s.type].level === 'good').length;
  const completionPercent = enabledSections.length ? Math.round((completedSectionCount / enabledSections.length) * 100) : 0;
  const requiredSectionsValid = canContinueToAts(validation.sections as any);
  const reviewAtsAttentionItems = useMemo(() => buildReviewAtsAttentionItems(atsReview.result), [atsReview.result]);
  // Only show the leadership hint when we have structured guidance confirming
  // a real role alignment gap — not just because a generic suggestion mentions "leadership"
  const hasLeadershipAttention = useMemo(() => {
    const g = atsReview.result?.guidance;
    if (!g) return false;
    // Only flag if there are actual missing role signals AND weak signals detected
    return g.roleAlignmentSummary.length > 0 && g.weakSignals.length > 0;
  }, [atsReview.result]);
  const reviewRouteTemplate = templateParam && templateParam !== 'classic' ? templateParam : '';
  const reviewRouteHref = buildReviewAtsRoute(reviewRouteTemplate, resumeId);
  const editorUploadLabel = loadingUpload
    ? `Processing ${pendingUploadFileName || 'upload'}...`
    : uploadedFileName
      ? `Uploaded: ${uploadedFileName}`
      : pendingUploadFileName
        ? `Selected: ${pendingUploadFileName}`
        : 'Upload Resume';
  const editorColumnClass = isReviewAtsPage ? 'col-7' : 'col-12';

  const handleTemplatePromptClose = () => {
    setShowTemplatePromptModal(false);
  };

  const handleTemplatePromptConfirm = () => {
    if (!templatePromptHref) return;
    setShowTemplatePromptModal(false);
    router.push(templatePromptHref);
  };

  return (
    <main className={isReviewAtsPage ? 'grid review-grid' : 'grid'}>
      <TkxCard as="section" padding="md" ref={editorRef} className={editorColumnClass}><TkxCardBody>
        <div className="editor-header">
          <div>
            <h2>Resume Editor</h2>
            <p style={{ fontSize: '0.9rem' }}>{getStatusText(status, lastSavedAt, validation.canAutoSave)}</p>
          </div>
          <div className="editor-actions">
            <TkxBadge variant="primary">{formatRoleLevel(detectedRoleLevel)}</TkxBadge>
            {isImportedMode && <TkxBadge variant="primary">Imported resume</TkxBadge>}
            <StatusPill status={status} canAutoSave={validation.canAutoSave} lastSavedAt={lastSavedAt} />
            {!isReviewAtsPage && (
              <TkxButton variant="outline" onClick={goToReviewAts}>
                Review & ATS
              </TkxButton>
            )}
            <TkxFileUpload
              variant="button"
              label={editorUploadLabel}
              accept=".pdf,.docx,.doc,.txt,.html,.htm,.rtf"
              onChange={(files) => onUpload(files[0])}
            />
          </div>
        </div>
        {loadingUpload && <p style={{ fontSize: '0.9rem' }}>Importing...</p>}

        {isReviewAtsPage && (
          <TkxCard padding="md" className="review-ats-panel" style={{ marginTop: 16 }} data-testid="review-ats-panel"><TkxCardBody>
            <div className="review-ats-panel__head">
              <div>
                <h3 style={{ margin: 0 }}>ATS Score</h3>
                <p style={{ fontSize: '0.9rem' }}>Live ATS checks update while you edit this resume.</p>
              </div>
              <TkxButton
                variant="outline"
                onClick={() => refreshReviewAts('manual')}
                disabled={atsReview.loading || atsQuotaBlocked}
                isLoading={atsReview.loading}
                loadingText="Checking ATS..."
                data-testid="check-ats-score-button"
              >
                Check ATS Score
              </TkxButton>
            </div>
            <div className="review-ats-panel__score" data-testid="review-ats-score">
              <strong>{atsReview.result ? atsReview.result.roleAdjustedScore : '--'}</strong>
              <span style={{ fontSize: '0.9rem' }}>/ 100</span>
            </div>
            <p style={{ fontSize: '0.9rem' }}>Role level: {atsReview.result?.roleLevel || detectedRoleLevel || 'Not detected'}</p>
            {atsReview.error && (
              <p className="hint warn" style={{ marginTop: 6 }}>{atsReview.error}</p>
            )}
            <h4 style={{ marginBottom: 6 }}>Needs attention</h4>
            <ul className="review-ats-panel__list">
              {reviewAtsAttentionItems.length
                ? reviewAtsAttentionItems.map((item, idx) => (
                  <li key={`review-ats-item-${idx}`} style={{ fontSize: '0.9rem' }}>{item}</li>
                ))
                : <li style={{ fontSize: '0.9rem' }}>No blocking ATS issues detected.</li>}
            </ul>
            {hasLeadershipAttention && (
              <div className="leadership-hint">
                <p className="hint warn" style={{ margin: 0 }}>
                  {atsReview.result?.guidance?.roleAlignmentSummary || 'Experience bullets could be strengthened with leadership, ownership, or delivery signals relevant to your target role.'}
                </p>
                <TkxButton variant="outline" onClick={() => scrollToSection('experience')}>
                  Go to Experience
                </TkxButton>
              </div>
            )}
            {atsReview.result?.guidance && (
              <div className="ats-guidance" data-testid="ats-guidance-panel">
                {atsReview.result.guidance.scoreExplanation && (
                  <div className="ats-guidance__section">
                    <h4>Why your score is {atsReview.result.roleAdjustedScore}</h4>
                    <p style={{ fontSize: '0.9rem' }}>{atsReview.result.guidance.scoreExplanation}</p>
                  </div>
                )}
                {atsReview.result.guidance.roleAlignmentSummary && (
                  <div className="ats-guidance__section">
                    <h4>Role Alignment</h4>
                    <p style={{ fontSize: '0.9rem' }}>{atsReview.result.guidance.roleAlignmentSummary}</p>
                  </div>
                )}
                {atsReview.result.guidance.topImpactActions.length > 0 && (
                  <div className="ats-guidance__section">
                    <h4>Top Improvements</h4>
                    <ol className="ats-guidance__list">
                      {atsReview.result.guidance.topImpactActions.map((action, i) => (
                        <li key={i} style={{ fontSize: '0.9rem' }}>{action}</li>
                      ))}
                    </ol>
                  </div>
                )}
                <div className="ats-guidance__keywords">
                  {atsReview.result.guidance.matchedKeywords.length > 0 && (
                    <div className="ats-guidance__section">
                      <h4>Matched Keywords</h4>
                      <div className="ats-guidance__chips">
                        {atsReview.result.guidance.matchedKeywords.map((kw, i) => (
                          <span key={i} className="ats-chip ats-chip--match">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {atsReview.result.guidance.missingKeywords.length > 0 && (
                    <div className="ats-guidance__section">
                      <h4>Missing Keywords</h4>
                      <div className="ats-guidance__chips">
                        {atsReview.result.guidance.missingKeywords.map((kw, i) => (
                          <span
                            key={i}
                            className="ats-chip ats-chip--missing"
                            title="Click to add to skills"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (!allSkills.includes(kw)) {
                                setResume((prev) => ({ ...prev, skills: [...prev.skills, kw] }));
                                showSnackbar('success', `Added "${kw}" to skills.`);
                              }
                            }}
                          >
                            + {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {atsReview.result.guidance.sectionSuggestions.summary.length > 0 && (
                  <div className="ats-guidance__section">
                    <h4>Summary Improvements</h4>
                    <ul className="ats-guidance__list">
                      {atsReview.result.guidance.sectionSuggestions.summary.map((s, i) => (
                        <li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {atsReview.result.guidance.sectionSuggestions.experience.length > 0 && (
                  <div className="ats-guidance__section">
                    <h4>Experience Improvements</h4>
                    <ul className="ats-guidance__list">
                      {atsReview.result.guidance.sectionSuggestions.experience.map((s, i) => (
                        <li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {atsReview.result.guidance.sectionSuggestions.skills.length > 0 && (
                  <div className="ats-guidance__section">
                    <h4>Suggested Skills</h4>
                    <div className="ats-guidance__chips">
                      {atsReview.result.guidance.sectionSuggestions.skills.map((skill, i) => (
                        <span
                          key={i}
                          className="ats-chip ats-chip--suggestion"
                          style={{ cursor: 'pointer' }}
                          title="Click to add"
                          onClick={() => {
                            if (!allSkills.includes(skill)) {
                              setResume((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
                              showSnackbar('success', `Added "${skill}" to skills.`);
                            }
                          }}
                        >
                          + {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {atsReview.result.guidance.weakSignals.length > 0 && (
                  <div className="ats-guidance__section">
                    <h4>Weak Signals</h4>
                    <ul className="ats-guidance__list">
                      {atsReview.result.guidance.weakSignals.map((s, i) => (
                        <li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {atsReview.result.guidance.addOnlyIfTrue.length > 0 && (
                  <div className="ats-guidance__section ats-guidance__section--caution">
                    <h4>Add Only If True</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--fg-muted, #888)', marginBottom: 6 }}>These terms appear in the job description but are not clearly supported by your resume. Add them only if they reflect your actual experience.</p>
                    <div className="ats-guidance__chips">
                      {atsReview.result.guidance.addOnlyIfTrue.map((term, i) => (
                        <span key={i} className="ats-chip ats-chip--caution">{term}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {uploadSummary && (
              <div className="review-ats-panel__upload">
                <div>
                  <strong>Upload processed</strong>
                  <p style={{ fontSize: '0.9rem' }}>Detected experience level: {formatRoleLevel(uploadSummary.roleLevel)}.</p>
                  <p style={{ fontSize: '0.9rem' }}>Companies found: {uploadSummary.companyCount}. Experience entries: {uploadSummary.experienceCount}.</p>
                  <p style={{ fontSize: '0.9rem' }}>
                    Signals: roles {uploadSummary.experienceSignals?.roleCount ?? 0}, dated roles {uploadSummary.experienceSignals?.rolesWithDateCount ?? 0}, estimated months {uploadSummary.experienceSignals?.estimatedTotalMonths ?? 0}.
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>
                    Sections populated: {uploadSummary.sectionsPopulated.length
                      ? uploadSummary.sectionsPopulated.map((type) => SECTION_LABELS[type]).join(', ')
                      : 'None'}.
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>Next step: review {SECTION_LABELS[uploadSummary.reviewTarget as SectionType]}.</p>
                </div>
                <div className="review-ats-panel__upload-actions">
                  <TkxButton
                    onClick={() => {
                      const step = REQUIRED_FLOW_SEQUENCE.indexOf('experience');
                      if (step >= 0) setActiveStepIndex(step);
                      scrollToSection('experience');
                    }}
                  >
                    Review Experience
                  </TkxButton>
                  <TkxButton
                    variant="outline"
                    onClick={() => (isReviewAtsPage ? refreshReviewAts('manual') : continueToAts())}
                    disabled={isReviewAtsPage ? (atsReview.loading || atsQuotaBlocked) : (!requiredSectionsValid || loadingAtsNavigation || atsQuotaBlocked)}
                    isLoading={isReviewAtsPage ? atsReview.loading : loadingAtsNavigation}
                    loadingText={isReviewAtsPage ? 'Checking ATS...' : 'Preparing ATS...'}
                  >
                    Check ATS Score
                  </TkxButton>
                  <TkxButton variant="outline" onClick={() => setUploadSummary(null)}>Dismiss</TkxButton>
                </div>
              </div>
            )}
          </TkxCardBody></TkxCard>
        )}

        {!isReviewAtsPage && uploadSummary && (
          <div className="upload-summary-panel" style={{ marginTop: 16 }}>
            <div>
              <strong>Upload processed</strong>
              <p style={{ fontSize: '0.9rem' }}>Detected experience level: {formatRoleLevel(uploadSummary.roleLevel)}.</p>
              <p style={{ fontSize: '0.9rem' }}>Companies found: {uploadSummary.companyCount}. Experience entries: {uploadSummary.experienceCount}.</p>
              <p style={{ fontSize: '0.9rem' }}>
                Signals: roles {uploadSummary.experienceSignals?.roleCount ?? 0}, dated roles {uploadSummary.experienceSignals?.rolesWithDateCount ?? 0}, estimated months {uploadSummary.experienceSignals?.estimatedTotalMonths ?? 0}.
              </p>
              <p style={{ fontSize: '0.9rem' }}>
                Sections populated: {uploadSummary.sectionsPopulated.length
                  ? uploadSummary.sectionsPopulated.map((type) => SECTION_LABELS[type]).join(', ')
                  : 'None'}.
              </p>
              <p style={{ fontSize: '0.9rem' }}>Next step: review {SECTION_LABELS[uploadSummary.reviewTarget as SectionType]}.</p>
            </div>
            <div className="upload-summary-panel__actions">
              <TkxButton
                onClick={() => {
                  const step = REQUIRED_FLOW_SEQUENCE.indexOf('experience');
                  if (step >= 0) setActiveStepIndex(step);
                  scrollToSection('experience');
                }}
              >
                Review Experience
              </TkxButton>
              <TkxButton
                variant="outline"
                onClick={() => (isReviewAtsPage ? refreshReviewAts('manual') : continueToAts())}
                disabled={isReviewAtsPage ? (atsReview.loading || atsQuotaBlocked) : (!requiredSectionsValid || loadingAtsNavigation || atsQuotaBlocked)}
                isLoading={isReviewAtsPage ? atsReview.loading : loadingAtsNavigation}
                loadingText={isReviewAtsPage ? 'Checking ATS...' : 'Preparing ATS...'}
              >
                Check ATS Score
              </TkxButton>
              <TkxButton variant="outline" onClick={() => setUploadSummary(null)}>Dismiss</TkxButton>
            </div>
          </div>
        )}

        {importRoleLevel && (
          <TkxCard padding="md" style={{ marginTop: 16 }}>
            <TkxCardBody>
            <h3 style={{ marginTop: 0 }}>Detected experience level</h3>
            <p style={{ fontSize: '0.9rem' }}>Upload detection returned {formatRoleLevel(importRoleLevel)}. Current editor state is {formatRoleLevel(detectedRoleLevel)}.</p>
            </TkxCardBody>
          </TkxCard>
        )}

        {importNotes && (
          <TkxCard padding="md" className="section-card" style={{ marginTop: 16 }}>
            <TkxCardBody>
            <h3 style={{ marginTop: 0 }}>From Upload (Unsorted)</h3>
            <p style={{ fontSize: '0.9rem' }}>Review this content and paste it into the right section.</p>
            <textarea
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 120 }}
              value={importNotes}
              onChange={(e) => setImportNotes(e.target.value)}
            />
            <div className="field-meta">
              <TkxButton
                variant="outline"
                onClick={() => {
                  if (!importNotes.trim()) return;
                  setResume((prev) => ({
                    ...prev,
                    summary: prev.summary ? `${prev.summary} ${importNotes}`.trim() : importNotes.trim(),
                  }));
                  setImportNotes('');
                  markDirty();
                }}
              >
                Append to summary
              </TkxButton>
              <TkxButton variant="outline" onClick={() => setImportNotes('')}>Clear</TkxButton>
            </div>
            </TkxCardBody>
          </TkxCard>
        )}

        <div className="section-card" style={{ marginTop: 16 }}>
          <TkxInput
            label="Resume title"
            placeholder="e.g., Senior Product Designer Resume"
            value={resume.title}
            onChange={(e) => {
              setResume((prev) => ({ ...prev, title: e.target.value }));
              markDirty();
            }}
          />
          <p style={{ fontSize: '0.9rem', marginTop: 8 }}>This is for your dashboard. It does not appear on the resume.</p>
        </div>

        <TkxCard padding="md" style={{ marginTop: 16 }}>
          <TkxCardBody>
          <div className="completion-header">
            <strong>Section completion</strong>
            <span style={{ fontSize: '0.9rem' }}>{completedSectionCount}/{enabledSections.length} complete ({completionPercent}%)</span>
          </div>
          <div className="completion-track">
            <div className="completion-fill" style={{ width: `${completionPercent}%` }} />
          </div>
          </TkxCardBody>
        </TkxCard>

        <TkxCard padding="md" className="step-nav" style={{ marginTop: 16 }}><TkxCardBody>
          <div className="step-nav__head">
            <div>
              <h3 style={{ margin: 0 }}>Guided section flow</h3>
              <p style={{ fontSize: '0.9rem' }}>Complete required sections in order. Next unlocks only after required fields pass validation.</p>
            </div>
            <label className="step-nav__toggle" style={{ fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={guidedNavigation}
                onChange={(e) => setGuidedNavigation(e.target.checked)}
              />
              Guided mode
            </label>
          </div>
          <div className="step-nav__steps">
            {REQUIRED_FLOW_SEQUENCE.map((type, idx) => {
              const feedback = validation.sections[type as SectionType];
              const isLocked = guidedNavigation && idx > navigationGate.furthestUnlockedIndex;
              const isActive = idx === navigationGate.activeStepIndex;
              const stateClass = feedback.level === 'error' ? 'error' : feedback.level === 'warn' ? 'warn' : 'good';
              return (
                <button
                  key={`required-step-${type}`}
                  className={`step-chip ${isActive ? 'active' : ''} ${stateClass}`}
                  disabled={isLocked}
                  onClick={() => goToRequiredStep(idx)}
                >
                  {idx + 1}. {SECTION_LABELS[type as SectionType]}
                </button>
              );
            })}
          </div>
          <div className="step-nav__actions">
            <TkxButton
              variant="outline"
              onClick={goToPreviousRequiredStep}
              disabled={navigationGate.activeStepIndex <= 0}
            >
              Previous section
            </TkxButton>
            <TkxButton
              onClick={goToNextRequiredStep}
              disabled={navigationGate.activeStepIndex >= REQUIRED_FLOW_SEQUENCE.length - 1 || (guidedNavigation && !navigationGate.canProceedCurrent)}
            >
              Next section
            </TkxButton>
            {!navigationGate.canProceedCurrent && (
              <span className="hint error">Complete {SECTION_LABELS[navigationGate.activeStepType as SectionType]} to continue.</span>
            )}
          </div>
        </TkxCardBody></TkxCard>

        <TkxCard padding="md" style={{ marginTop: 16 }}><TkxCardBody>
          <div className="guidance-header">
            <div>
              <h3 style={{ margin: 0 }}>ATS Guidance</h3>
              <p style={{ fontSize: '0.9rem' }}>Live feedback to keep your resume ATS-safe and high-impact.</p>
            </div>
            <TkxBadge variant="primary">{guidance.statusLabel}</TkxBadge>
          </div>
          <div className="guidance-grid">
            {guidance.items.map((item, idx) => (
              <div
                key={`guidance-${idx}`}
                className={`guidance-item ${item.level}${item.section ? ' guidance-item--clickable' : ''}`}
                role={item.section ? 'button' : undefined}
                tabIndex={item.section ? 0 : undefined}
                onClick={() => {
                  if (item.section) {
                    const el = document.getElementById(`resume-section-${item.section}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                onKeyDown={(e) => {
                  if (item.section && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    const el = document.getElementById(`resume-section-${item.section}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              >
                <div className="guidance-item__header">
                  <strong>{item.title}</strong>
                  {item.section && (
                    <span className="guidance-item__section-badge">{SECTION_LABELS[item.section]}</span>
                  )}
                </div>
                <p style={{ fontSize: '0.9rem' }}>{item.message}</p>
              </div>
            ))}
          </div>
        </TkxCardBody></TkxCard>

        {enabledSections.map((section, idx) => {
          const feedback = validation.sections[section.type];
          const sectionStepIndex = REQUIRED_FLOW_SEQUENCE.indexOf(section.type);
          const sectionLocked = guidedNavigation && sectionStepIndex >= 0 && navigationGate.isStepLocked(section.type);
          const sectionActive = sectionStepIndex >= 0 && sectionStepIndex === navigationGate.activeStepIndex;
          return (
            <TkxCard
              key={section.id}
              id={`resume-section-${section.type}`}
              padding="md"
              className={`section-card${sectionActive ? ' section-card--active' : ''}${sectionLocked ? ' section-card--locked' : ''}${section.type === activeSectionId ? ' section-card--current' : ''}`}
              data-section-id={section.type}
              style={{ marginTop: 16 }}
              onFocusCapture={() => {
                if (sectionStepIndex < 0 || sectionLocked) return;
                setActiveStepIndex(sectionStepIndex);
              }}
            ><TkxCardBody>
              <div className="section-header">
                <div>
                  <h3 style={{ margin: 0 }}>{SECTION_LABELS[section.type]}</h3>
                  <div className="section-sub">
                    <SectionBadge level={feedback.level} text={feedback.text} />
                    {section.type === 'experience' && actionVerbRule.totalBullets > 0 && !actionVerbRule.passes && (
                      <span className="hint warn">Needs attention</span>
                    )}
                    <span style={{ fontSize: '0.9rem' }}>{SECTION_GUIDANCE[section.type].tip}</span>
                  </div>
                </div>
                <div className="section-actions">
                  <TkxButton variant="outline" onClick={() => updateSectionOrder(idx, -1)} disabled={sectionLocked || idx === 0} aria-label="Move section up">Up</TkxButton>
                  <TkxButton variant="outline" onClick={() => updateSectionOrder(idx, 1)} disabled={sectionLocked || idx === enabledSections.length - 1} aria-label="Move section down">Down</TkxButton>
                  {!section.required && (
                    <TkxButton variant="outline" onClick={() => disableSection(section.type)} disabled={sectionLocked}>Remove</TkxButton>
                  )}
                </div>
              </div>
              {sectionLocked && (
                <p className="hint warn" style={{ marginTop: 10 }}>
                  Complete earlier required sections to unlock this step.
                </p>
              )}
              <fieldset className="section-fieldset" disabled={sectionLocked}>
              {section.type === 'contact' && (
                <div style={{ marginTop: 12 }}>
                  <TkxInput
                    label="Full name"
                    value={resume.contact.fullName}
                    onChange={(e) => {
                      setResume((prev) => ({ ...prev, contact: { ...prev.contact, fullName: e.target.value } }));
                      markDirty();
                    }}
                  />
                  {!resume.contact.fullName.trim() && (
                    <p className="hint error">Required to enable autosave.</p>
                  )}
                  <div className="grid" style={{ marginTop: 10 }}>
                    <div className="col-6">
                      <TkxInput
                        label="Email"
                        value={resume.contact.email || ''}
                        onChange={(e) => {
                          setResume((prev) => ({ ...prev, contact: { ...prev.contact, email: e.target.value } }));
                          markDirty();
                        }}
                      />
                    </div>
                    <div className="col-6">
                      <TkxInput
                        label="Phone"
                        value={resume.contact.phone || ''}
                        onChange={(e) => {
                          setResume((prev) => ({ ...prev, contact: { ...prev.contact, phone: e.target.value } }));
                          markDirty();
                        }}
                      />
                    </div>
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>{SECTION_GUIDANCE.contact.helper}</p>
                  {missingContact && <p className="hint warn">ATS risk: Add at least one direct contact method.</p>}
                  <div className="grid" style={{ marginTop: 10 }}>
                    <div className="col-6">
                      <TkxInput
                        label="Location"
                        value={resume.contact.location || ''}
                        onChange={(e) => {
                          setResume((prev) => ({ ...prev, contact: { ...prev.contact, location: e.target.value } }));
                          markDirty();
                        }}
                      />
                    </div>
                    <div className="col-6">
                      <TkxInput
                        label="Links (comma separated)"
                        value={(resume.contact.links || []).join(', ')}
                        onChange={(e) => {
                          const links = e.target.value.split(',').map((l) => l.trim()).filter(Boolean);
                          setResume((prev) => ({ ...prev, contact: { ...prev.contact, links } }));
                          markDirty();
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {section.type === 'summary' && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Summary</label>
                  <textarea
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 120 }}
                    value={resume.summary}
                    onChange={(e) => {
                      setResume((prev) => ({ ...prev, summary: e.target.value }));
                      markDirty();
                    }}
                  />
                  <div className="field-meta">
                    <span className={summaryCharCount >= 40 ? 'hint good' : 'hint warn'}>
                      {summaryCharCount} characters
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.summary.helper}</span>
                  </div>
                  {detectedRoleLevel === 'SENIOR' && (
                    <p className="hint">Senior tip: call out scope, team size, and strategic impact.</p>
                  )}
                  {detectedRoleLevel === 'FRESHER' && (
                    <p className="hint">Entry tip: highlight transferable skills and project outcomes.</p>
                  )}
                </div>
              )}

              {section.type === 'skills' && (
                <div className="skills-section" style={{ marginTop: 12 }}>
                  <div className="field-meta">
                    <span className={skillsCount >= 6 ? 'hint good' : skillsCount >= 3 ? 'hint warn' : 'hint error'}>
                      {skillsCount} skills
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.skills.helper}</span>
                  </div>
                  <div className="skills-grid" style={{ marginTop: 8 }}>
                    <div className="skills-group">
                      <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Technical skills</span>
                      <div className="skills-entry-row">
                        <AutocompleteInput
                          value={technicalSkillInput}
                          onChange={setTechnicalSkillInput}
                          onSelect={(value) => addSkill('technical', value)}
                          fetchSuggestions={fetchTechnicalSkillSuggestions}
                          localSuggestions={technicalSkillSuggestionPool}
                          placeholder="Add a technical skill"
                          testId="technical-skills-autocomplete"
                        />
                        <TkxButton
                          variant="outline"
                          onClick={() => addSkill('technical', technicalSkillInput)}
                          disabled={!technicalSkillInput.trim()}
                        >
                          Add
                        </TkxButton>
                      </div>
                      <div className="skills-chips" data-testid="technical-skills-chips">
                        {technicalSkills.map((skill) => (
                          <button
                            type="button"
                            key={`technical-skill-${skill}`}
                            className="skill-chip"
                            onClick={() => removeSkill('technical', skill)}
                            title={`Remove ${skill}`}
                          >
                            {skill} <span aria-hidden>×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="skills-group">
                      <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Soft skills</span>
                      <div className="skills-entry-row">
                        <AutocompleteInput
                          value={softSkillInput}
                          onChange={setSoftSkillInput}
                          onSelect={(value) => addSkill('soft', value)}
                          fetchSuggestions={fetchSoftSkillSuggestions}
                          localSuggestions={softSkillSuggestionPool}
                          placeholder="Add a soft skill"
                          testId="soft-skills-autocomplete"
                        />
                        <TkxButton
                          variant="outline"
                          onClick={() => addSkill('soft', softSkillInput)}
                          disabled={!softSkillInput.trim()}
                        >
                          Add
                        </TkxButton>
                      </div>
                      <div className="skills-chips" data-testid="soft-skills-chips">
                        {softSkills.map((skill) => (
                          <button
                            type="button"
                            key={`soft-skill-${skill}`}
                            className="skill-chip soft"
                            onClick={() => removeSkill('soft', skill)}
                            title={`Remove ${skill}`}
                          >
                            {skill} <span aria-hidden>×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {detectedRoleLevel === 'FRESHER' && (
                    <p className="hint">Entry tip: include tools and coursework-relevant technical skills.</p>
                  )}
                </div>
              )}

              {section.type === 'languages' && (
                <div className="skills-section" style={{ marginTop: 12 }}>
                  <div className="field-meta">
                    <span className={languages.length ? 'hint good' : 'hint warn'}>
                      {languages.length} languages
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.languages.helper}</span>
                  </div>
                  <div className="skills-group" style={{ marginTop: 8 }}>
                    <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Languages</span>
                    <div className="skills-entry-row">
                      <AutocompleteInput
                        value={languageInput}
                        onChange={setLanguageInput}
                        onSelect={(value) => addLanguage(value)}
                        localSuggestions={languageSuggestionPool}
                        placeholder="Add a language"
                        testId="languages-autocomplete"
                      />
                      <TkxButton
                        variant="outline"
                        onClick={() => addLanguage(languageInput)}
                        disabled={!languageInput.trim()}
                      >
                        Add
                      </TkxButton>
                    </div>
                    <div className="skills-chips" data-testid="languages-chips">
                      {languages.map((language) => (
                        <button
                          type="button"
                          key={`language-${language}`}
                          className="skill-chip soft"
                          onClick={() => removeLanguage(language)}
                          title={`Remove ${language}`}
                        >
                          {language} <span aria-hidden>x</span>
                        </button>
                      ))}
                    </div>
                    {!languages.length && (
                      <p className="hint">Known spoken languages are kept here and removed from technical skills.</p>
                    )}
                  </div>
                </div>
              )}

              {section.type === 'experience' && (
                <div className="experience-section" style={{ marginTop: 12 }}>
                  <div className="field-meta" style={{ marginBottom: 8 }}>
                    <span className={hasExperienceMetrics ? 'hint good' : 'hint warn'}>
                      {hasExperienceMetrics ? 'Metrics included' : 'Add numbers to show impact'}
                    </span>
                    <span className={longExperienceBullets.length ? 'hint warn' : 'hint good'}>
                      {longExperienceBullets.length ? `${longExperienceBullets.length} long bullets` : 'Bullets are concise'}
                    </span>
                  </div>
                  {detectedRoleLevel === 'SENIOR' && (
                    <p className="hint">Senior tip: emphasize leadership, org-wide impact, and strategic initiatives.</p>
                  )}
                  {detectedRoleLevel === 'FRESHER' && (
                    <p className="hint">Entry tip: 2-3 bullets per role are enough if results are clear.</p>
                  )}
                  {actionVerbRule.totalBullets > 0 && (
                    <TkxAlert variant="warning" data-testid="action-verb-banner" style={{ marginBottom: 10 }}>
                      {actionVerbRuleText}
                    </TkxAlert>
                  )}
                  {resume.experience.map((exp, expIdx) => {
                    const expErrors = experienceValidation.entries[expIdx] || {};
                    const endIsPresent = isPresentToken(exp.endDate);
                    const summary = [exp.role.trim(), exp.company.trim()].filter(Boolean).join(' @ ') || 'New experience';
                    const companyError = expErrors.company || getFieldError(`experience[${expIdx}].company`) || getFieldError(`experience.${expIdx}.company`);
                    const roleError = expErrors.role || getFieldError(`experience[${expIdx}].role`) || getFieldError(`experience.${expIdx}.role`);
                    const startError = expErrors.startDate || getFieldError(`experience[${expIdx}].startDate`) || getFieldError(`experience.${expIdx}.startDate`);
                    const endError = expErrors.endDate || getFieldError(`experience[${expIdx}].endDate`) || getFieldError(`experience.${expIdx}.endDate`);
                    const highlightRows = exp.highlights.length ? exp.highlights : [''];
                    return (
                      <TkxCard as="article" key={`exp-${expIdx}`} padding="md" className="experience-entry"><TkxCardBody>
                        <div className="experience-entry__head">
                          <div>
                            <strong>Experience #{expIdx + 1}</strong>
                            <p style={{ fontSize: '0.9rem' }}>{summary}</p>
                          </div>
                          <TkxButton
                            variant="outline"
                            onClick={() => {
                              setResume((prev) => removeExperienceAt(prev as any, expIdx) as any);
                              markDirty();
                            }}
                          >
                            Remove
                          </TkxButton>
                        </div>
                        <div className="experience-entry__grid">
                          <div className="experience-entry__field">
                            <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Company</span>
                            <CompanyAutocomplete
                              value={exp.company}
                              suggestions={buildCompanySuggestions({
                                query: exp.company,
                                localCompanies: companySuggestionPool,
                                recentCompanies,
                                limit: 10,
                              })}
                              fetchSuggestions={fetchCompanySuggestions}
                              className={`input${companyError ? ' input-error' : ''}`}
                              onChange={(value) => {
                                const copy = [...resume.experience];
                                copy[expIdx] = { ...copy[expIdx], company: value };
                                setResume((prev) => ({ ...prev, experience: copy }));
                                markDirty();
                              }}
                              onSelect={(value) => {
                                rememberRecentCompanies([value]);
                              }}
                              testId={`company-autocomplete-${expIdx}`}
                            />
                            {companyError && <p className="hint error">{companyError}</p>}
                          </div>
                          <div className="experience-entry__field">
                            <TkxInput
                              label="Role"
                              className={roleError ? 'input-error' : ''}
                              value={exp.role}
                              onChange={(e) => {
                                const copy = [...resume.experience];
                                copy[expIdx] = { ...copy[expIdx], role: e.target.value };
                                setResume((prev) => ({ ...prev, experience: copy }));
                                markDirty();
                              }}
                            />
                            {roleError && <p className="hint error">{roleError}</p>}
                          </div>
                          <div className="experience-entry__field">
                            <TkxInput
                              label="Start (YYYY-MM)"
                              className={startError ? 'input-error' : ''}
                              type="month"
                              placeholder="YYYY-MM"
                              value={toMonthInputValue(exp.startDate)}
                              onChange={(e) => {
                                const copy = [...resume.experience];
                                copy[expIdx] = { ...copy[expIdx], startDate: toYearMonth(e.target.value) };
                                setResume((prev) => ({ ...prev, experience: copy }));
                                markDirty();
                              }}
                            />
                            {startError && <p className="hint error">{startError}</p>}
                          </div>
                          <div className="experience-entry__field">
                            <div className="experience-entry__date-head">
                              <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>End (YYYY-MM or Present)</span>
                              <label className="experience-entry__present-toggle" style={{ fontSize: '0.9rem' }}>
                                <input
                                  type="checkbox"
                                  checked={endIsPresent}
                                  onChange={(e) => {
                                    const copy = [...resume.experience];
                                    copy[expIdx] = { ...copy[expIdx], endDate: e.target.checked ? 'Present' : '' };
                                    setResume((prev) => ({ ...prev, experience: copy }));
                                    markDirty();
                                  }}
                                />
                                Present
                              </label>
                            </div>
                            <TkxInput
                              label=""
                              className={endError ? 'input-error' : ''}
                              type="month"
                              placeholder="YYYY-MM"
                              value={toMonthInputValue(exp.endDate)}
                              disabled={endIsPresent}
                              onChange={(e) => {
                                const copy = [...resume.experience];
                                copy[expIdx] = { ...copy[expIdx], endDate: toYearMonth(e.target.value) };
                                setResume((prev) => ({ ...prev, experience: copy }));
                                markDirty();
                              }}
                            />
                            {endError && <p className="hint error">{endError}</p>}
                          </div>
                          <div className="experience-entry__field experience-entry__field--full">
                            <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Highlights</span>
                            {highlightRows.map((line, highlightIdx) => {
                              const highlightPath = `experience[${expIdx}].highlights[${highlightIdx}]`;
                              const payloadHighlightIndex = line.trim()
                                ? exp.highlights.slice(0, highlightIdx + 1).filter((item) => item.trim()).length - 1
                                : -1;
                              const localFailure = getActionVerbFailure(actionVerbRule, expIdx, highlightIdx);
                              const backendHighlightError =
                                getFieldError(highlightPath) ||
                                getFieldError(`experience.${expIdx}.highlights.${highlightIdx}`) ||
                                (payloadHighlightIndex >= 0
                                  ? (
                                    getFieldError(`experience[${expIdx}].highlights[${payloadHighlightIndex}]`) ||
                                    getFieldError(`experience.${expIdx}.highlights.${payloadHighlightIndex}`)
                                  )
                                  : '');
                              const highlightError = backendHighlightError ||
                                (localFailure
                                  ? localFailure.reason === 'weak_starter'
                                    ? 'Replace weak starter phrases with a strong action verb.'
                                    : 'Start this bullet with a strong action verb.'
                                  : '');
                              const highlightLengthState = getHighlightLengthState(line || '', showBulletLengthWarning);
                              const showLengthError = highlightLengthState.showError;
                              const lengthHelperText = highlightLengthState.helperText;
                              const highlightHasInputError = Boolean(highlightError || showLengthError);
                              // Find AI critique suggestion for this specific bullet
                              const aiSuggestion = aiCritiqueResult?.critique?.sectionSuggestions?.experience?.find(
                                (s) => s.expIndex === expIdx && s.bulletIndex === highlightIdx,
                              );
                              const bulletNeedsAttention = Boolean(localFailure || aiSuggestion || highlightError);
                              const bulletLooksGood = line.trim().length > 0 && !bulletNeedsAttention && !showLengthError;
                              return (
                                <div key={`exp-highlight-${expIdx}-${highlightIdx}`} style={{ marginBottom: 8 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    {line.trim() && (
                                      <span
                                        className={`bullet-status-badge ${bulletNeedsAttention ? 'bullet-status-badge--attention' : bulletLooksGood ? 'bullet-status-badge--good' : ''}`}
                                        title={bulletNeedsAttention ? 'Needs attention' : bulletLooksGood ? 'Looks good' : ''}
                                      >
                                        {bulletNeedsAttention ? '!' : bulletLooksGood ? '\u2713' : ''}
                                      </span>
                                    )}
                                    <TkxInput
                                      label=""
                                      className={highlightHasInputError ? 'input-error' : ''}
                                      placeholder="Improved checkout conversion by 18% by redesigning the flow."
                                      value={line}
                                      data-testid={`experience-highlight-${expIdx}-${highlightIdx}`}
                                      data-highlight-id={`experience-highlight-${expIdx}-${highlightIdx}`}
                                      onChange={(e) => {
                                        const copy = [...resume.experience];
                                        const nextHighlights = [...(copy[expIdx].highlights || [])];
                                        nextHighlights[highlightIdx] = e.target.value;
                                        copy[expIdx] = { ...copy[expIdx], highlights: nextHighlights };
                                        setResume((prev) => ({ ...prev, experience: copy }));
                                        setActionVerbRule(createActionVerbRuleState(buildActionVerbEntries(copy), ACTION_VERB_REQUIRED_RATIO));
                                        markDirty();
                                      }}
                                    />
                                    <TkxButton
                                      variant="outline"
                                      onClick={() => {
                                        const copy = [...resume.experience];
                                        const nextHighlights = [...(copy[expIdx].highlights || [])];
                                        nextHighlights.splice(highlightIdx, 1);
                                        copy[expIdx] = { ...copy[expIdx], highlights: nextHighlights };
                                        setResume((prev) => ({ ...prev, experience: copy }));
                                        setActionVerbRule(createActionVerbRuleState(buildActionVerbEntries(copy), ACTION_VERB_REQUIRED_RATIO));
                                        markDirty();
                                      }}
                                      disabled={highlightRows.length <= 1}
                                    >
                                      Remove
                                    </TkxButton>
                                  </div>
                                  {highlightError && <p className="hint error">{highlightError}</p>}
                                  {showLengthError && (
                                    <p className="hint error" style={{ marginTop: 4 }}>{lengthHelperText}</p>
                                  )}
                                  {localFailure && localFailure.suggestions.length > 0 && (
                                    <div className="field-meta" style={{ marginTop: 6 }}>
                                      {localFailure.suggestions.map((suggestion) => (
                                        <TkxButton
                                          key={`verb-suggestion-${expIdx}-${highlightIdx}-${suggestion}`}
                                          variant="outline"
                                          data-testid={`verb-suggestion-${expIdx}-${highlightIdx}`}
                                          onClick={() => {
                                            const copy = [...resume.experience];
                                            const nextHighlights = [...(copy[expIdx].highlights || [])];
                                            nextHighlights[highlightIdx] = replaceBulletStarter(nextHighlights[highlightIdx] || '', suggestion);
                                            copy[expIdx] = { ...copy[expIdx], highlights: nextHighlights };
                                            setResume((prev) => ({ ...prev, experience: copy }));
                                            setActionVerbRule(createActionVerbRuleState(buildActionVerbEntries(copy), ACTION_VERB_REQUIRED_RATIO));
                                            markDirty();
                                          }}
                                        >
                                          {suggestion}
                                        </TkxButton>
                                      ))}
                                    </div>
                                  )}
                                  {aiSuggestion && line.trim() !== aiSuggestion.suggested && (
                                    <div className="bullet-ai-suggestion">
                                      <span className="bullet-ai-suggestion__label">AI suggestion:</span>
                                      <p className="bullet-ai-suggestion__text" style={{ fontSize: '0.9rem' }}>{aiSuggestion.suggested}</p>
                                      <TkxButton
                                        variant="outline"
                                        style={{ fontSize: '0.7rem', padding: '3px 8px', marginTop: 2 }}
                                        onClick={() => {
                                          const copy = [...resume.experience];
                                          const entry = copy[expIdx];
                                          if (entry) {
                                            const highlights = [...entry.highlights];
                                            highlights[highlightIdx] = aiSuggestion.suggested;
                                            copy[expIdx] = { ...entry, highlights };
                                            setResume((prev) => ({ ...prev, experience: copy }));
                                            setActionVerbRule(createActionVerbRuleState(buildActionVerbEntries(copy), ACTION_VERB_REQUIRED_RATIO));
                                            markDirty();
                                            showSnackbar('success', 'Bullet updated.');
                                          }
                                        }}
                                      >
                                        Apply
                                      </TkxButton>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <TkxButton
                              variant="outline"
                              onClick={() => {
                                const copy = [...resume.experience];
                                const nextHighlights = [...(copy[expIdx].highlights || []), ''];
                                copy[expIdx] = { ...copy[expIdx], highlights: nextHighlights };
                                setResume((prev) => ({ ...prev, experience: copy }));
                                setActionVerbRule(createActionVerbRuleState(buildActionVerbEntries(copy), ACTION_VERB_REQUIRED_RATIO));
                                markDirty();
                              }}
                            >
                              Add bullet
                            </TkxButton>
                            {expErrors.highlights && <p className="hint error">{expErrors.highlights}</p>}
                          </div>
                        </div>
                      </TkxCardBody></TkxCard>
                    );
                  })}
                  <div className="experience-section__footer">
                    <TkxButton
                      data-testid="add-experience-button"
                      onClick={() => {
                        setResume((prev) => addEmptyExperience(prev as any) as any);
                        markDirty();
                      }}
                    >
                      Add new experience
                    </TkxButton>
                  </div>
                </div>
              )}

              {section.type === 'education' && (
                <div className="education-section" style={{ marginTop: 12 }}>
                  <div className="field-meta" style={{ marginBottom: 8 }}>
                    <span className={resume.education.length ? 'hint good' : 'hint error'}>
                      {resume.education.length} entries
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.education.helper}</span>
                  </div>
                  {resume.education.map((edu, eduIdx) => {
                    const eduErrors = educationValidation.entries[eduIdx] || {};
                    return (
                      <TkxCard key={`edu-${eduIdx}`} padding="md" className="education-entry"><TkxCardBody>
                        <div className="education-entry__grid">
                          <div className="education-entry__field">
                            <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Institution</span>
                            <AutocompleteInput
                              value={edu.institution}
                              onChange={(value) => {
                                const copy = [...resume.education];
                                copy[eduIdx] = { ...copy[eduIdx], institution: value };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                              fetchSuggestions={fetchInstitutionSuggestions}
                              localSuggestions={institutionSuggestionPool}
                              placeholder="Start typing institution name"
                              className={`input${eduErrors.institution ? ' input-error' : ''}`}
                              testId={`institution-autocomplete-${eduIdx}`}
                            />
                            {eduErrors.institution && <p className="hint error">{eduErrors.institution}</p>}
                          </div>
                          <div className="education-entry__field">
                            <TkxInput
                              label="Degree"
                              className={eduErrors.degree ? 'input-error' : ''}
                              value={edu.degree}
                              onChange={(e) => {
                                const copy = [...resume.education];
                                copy[eduIdx] = { ...copy[eduIdx], degree: e.target.value };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                            />
                            {eduErrors.degree && <p className="hint error">{eduErrors.degree}</p>}
                          </div>
                          <div className="education-entry__field">
                            <TkxInput
                              label="Start (YYYY-MM)"
                              className={eduErrors.startDate ? 'input-error' : ''}
                              type="month"
                              value={toMonthInputValue(edu.startDate)}
                              onChange={(e) => {
                                const copy = [...resume.education];
                                copy[eduIdx] = { ...copy[eduIdx], startDate: toYearMonth(e.target.value) };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                            />
                            {eduErrors.startDate && <p className="hint error">{eduErrors.startDate}</p>}
                          </div>
                          <div className="education-entry__field">
                            <TkxInput
                              label="End (YYYY-MM)"
                              className={eduErrors.endDate ? 'input-error' : ''}
                              type="month"
                              value={toMonthInputValue(edu.endDate)}
                              onChange={(e) => {
                                const copy = [...resume.education];
                                copy[eduIdx] = { ...copy[eduIdx], endDate: toYearMonth(e.target.value) };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                            />
                            {eduErrors.endDate && <p className="hint error">{eduErrors.endDate}</p>}
                          </div>
                          <div className="education-entry__field">
                            <TkxInput
                              label="GPA (0-10)"
                              className={eduErrors.gpa ? 'input-error' : ''}
                              type="number"
                              min={0}
                              max={10}
                              step={0.1}
                              inputMode="decimal"
                              value={edu.gpa ?? ''}
                              placeholder="e.g. 8.6"
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                const nextGpa = raw === '' ? null : Number(raw);
                                const copy = [...resume.education];
                                copy[eduIdx] = {
                                  ...copy[eduIdx],
                                  gpa: Number.isFinite(nextGpa as number) ? nextGpa : null,
                                  percentage: raw === '' ? copy[eduIdx].percentage ?? null : null,
                                };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                            />
                            {eduErrors.gpa && <p className="hint error">{eduErrors.gpa}</p>}
                          </div>
                          <div className="education-entry__field">
                            <TkxInput
                              label="Percentage (0-100)"
                              className={eduErrors.percentage ? 'input-error' : ''}
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              inputMode="decimal"
                              value={edu.percentage ?? ''}
                              placeholder="e.g. 82.4"
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                const nextPercentage = raw === '' ? null : Number(raw);
                                const copy = [...resume.education];
                                copy[eduIdx] = {
                                  ...copy[eduIdx],
                                  percentage: Number.isFinite(nextPercentage as number) ? nextPercentage : null,
                                  gpa: raw === '' ? copy[eduIdx].gpa ?? null : null,
                                };
                                setResume((prev) => ({ ...prev, education: copy }));
                                markDirty();
                              }}
                            />
                            {eduErrors.percentage && <p className="hint error">{eduErrors.percentage}</p>}
                          </div>
                        </div>
                        <p className="hint" style={{ marginTop: 8 }}>
                          Optional. Enter GPA (10-scale) or percentage.
                        </p>
                        <div className="education-entry__actions">
                          <TkxButton
                            variant="outline"
                            onClick={() => {
                              const copy = resume.education.filter((_, i) => i !== eduIdx);
                              setResume((prev) => ({ ...prev, education: copy.length ? copy : [structuredClone(emptyEducation)] }));
                              markDirty();
                            }}
                          >
                            Remove
                          </TkxButton>
                        </div>
                      </TkxCardBody></TkxCard>
                    );
                  })}
                  <div className="education-section__footer">
                    <TkxButton
                      onClick={() => {
                        setResume((prev) => ({ ...prev, education: [...prev.education, structuredClone(emptyEducation)] }));
                        markDirty();
                      }}
                    >
                      Add education
                    </TkxButton>
                  </div>
                </div>
              )}
              {section.type === 'projects' && (
                <div style={{ marginTop: 12 }}>
                  <div className="field-meta" style={{ marginBottom: 8 }}>
                    <span className={resume.projects.length ? 'hint good' : 'hint warn'}>
                      {resume.projects.length} projects
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.projects.helper}</span>
                  </div>
                  {resume.projects.map((proj, projIdx) => (
                    <TkxCard key={`proj-${projIdx}`} padding="sm" style={{ marginBottom: 12 }}><TkxCardBody>
                      <div className="section-actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                        <strong>Project #{projIdx + 1}</strong>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <TkxButton
                            variant="outline"
                            onClick={() => {
                              setResume((prev) => moveProject(prev as any, projIdx, -1) as any);
                              markDirty();
                            }}
                            disabled={projIdx === 0}
                            aria-label="Move project up"
                          >
                            Up
                          </TkxButton>
                          <TkxButton
                            variant="outline"
                            onClick={() => {
                              setResume((prev) => moveProject(prev as any, projIdx, 1) as any);
                              markDirty();
                            }}
                            disabled={projIdx >= resume.projects.length - 1}
                            aria-label="Move project down"
                          >
                            Down
                          </TkxButton>
                          <TkxButton variant="outline" onClick={() => {
                            const copy = resume.projects.filter((_, i) => i !== projIdx);
                            setResume((prev) => ({ ...prev, projects: copy.length ? copy : [structuredClone(EMPTY_PROJECT)] }));
                            markDirty();
                          }}>Remove</TkxButton>
                        </div>
                      </div>
                      <TkxInput label="Project name" value={proj.name} onChange={(e) => {
                        const copy = [...resume.projects];
                        copy[projIdx] = { ...copy[projIdx], name: e.target.value };
                        setResume((prev) => ({ ...prev, projects: copy }));
                        markDirty();
                      }} />
                      <TkxInput label="Role (optional)" style={{ marginTop: 8 }} value={proj.role || ''} onChange={(e) => {
                        const copy = [...resume.projects];
                        copy[projIdx] = { ...copy[projIdx], role: e.target.value };
                        setResume((prev) => ({ ...prev, projects: copy }));
                        markDirty();
                      }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <TkxInput
                          label="Start (YYYY-MM)"
                          type="month"
                          placeholder="Start (YYYY-MM)"
                          value={toMonthInputValue(proj.startDate || '')}
                          onChange={(e) => {
                            const copy = [...resume.projects];
                            copy[projIdx] = { ...copy[projIdx], startDate: toYearMonth(e.target.value) };
                            setResume((prev) => ({ ...prev, projects: copy }));
                            markDirty();
                          }}
                        />
                        <TkxInput
                          label="End (YYYY-MM)"
                          type="month"
                          placeholder="End (YYYY-MM)"
                          value={toMonthInputValue(proj.endDate || '')}
                          onChange={(e) => {
                            const copy = [...resume.projects];
                            copy[projIdx] = { ...copy[projIdx], endDate: toYearMonth(e.target.value) };
                            setResume((prev) => ({ ...prev, projects: copy }));
                            markDirty();
                          }}
                        />
                      </div>
                      <TkxInput
                        label="Project URL (optional)"
                        style={{ marginTop: 8 }}
                        className={isValidProjectUrl(proj.url || '') ? '' : (proj.url || '').trim() ? 'input-error' : ''}
                        placeholder="https://github.com/yourname/repo"
                        value={proj.url || ''}
                        onChange={(e) => {
                          const copy = [...resume.projects];
                          copy[projIdx] = { ...copy[projIdx], url: e.target.value };
                          setResume((prev) => ({ ...prev, projects: copy }));
                          markDirty();
                        }}
                      />
                      {(proj.url || '').trim() && !isValidProjectUrl(proj.url || '') && (
                        <p className="hint error">Project URL must start with `https://` and be a valid link.</p>
                      )}
                      <div className="field-meta">
                        <TkxButton
                          variant="outline"
                          onClick={() => {
                            const copy = [...resume.projects];
                            copy[projIdx] = { ...copy[projIdx], url: 'https://github.com/' };
                            setResume((prev) => ({ ...prev, projects: copy }));
                            markDirty();
                          }}
                        >
                          GitHub
                        </TkxButton>
                        <TkxButton
                          variant="outline"
                          onClick={() => {
                            const copy = [...resume.projects];
                            copy[projIdx] = { ...copy[projIdx], url: 'https://bitbucket.org/' };
                            setResume((prev) => ({ ...prev, projects: copy }));
                            markDirty();
                          }}
                        >
                          Bitbucket
                        </TkxButton>
                      </div>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem', marginTop: 8 }}>Highlights (one per line)</label>
                      <textarea style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 80 }} placeholder="Built a scheduling app used by 200+ users" value={proj.highlights.join('\n')} onChange={(e) => {
                        const copy = [...resume.projects];
                        copy[projIdx] = { ...copy[projIdx], highlights: e.target.value.split('\n') };
                        setResume((prev) => ({ ...prev, projects: copy }));
                        markDirty();
                      }} />
                    </TkxCardBody></TkxCard>
                  ))}
                  <TkxButton data-testid="add-another-project-button" onClick={() => {
                    setResume((prev) => addEmptyProject(prev as any) as any);
                    markDirty();
                  }}>Add another project</TkxButton>
                </div>
              )}

              {section.type === 'certifications' && (
                <div style={{ marginTop: 12 }}>
                  <div className="field-meta" style={{ marginBottom: 8 }}>
                    <span className={resume.certifications.length ? 'hint good' : 'hint warn'}>
                      {resume.certifications.length} certifications
                    </span>
                    <span className="hint">{SECTION_GUIDANCE.certifications.helper}</span>
                  </div>
                  {resume.certifications.map((cert, certIdx) => (
                    <TkxCard key={`cert-${certIdx}`} padding="sm" style={{ marginBottom: 12 }}><TkxCardBody>
                      <span style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Certification</span>
                      <AutocompleteInput
                        value={cert.name}
                        onChange={(value) => {
                          const copy = [...resume.certifications];
                          copy[certIdx] = { ...copy[certIdx], name: value };
                          setResume((prev) => ({ ...prev, certifications: copy }));
                          markDirty();
                        }}
                        fetchSuggestions={fetchCertificationSuggestions}
                        localSuggestions={certificationSuggestionPool}
                        placeholder="Search certifications or add custom"
                        testId={`certification-autocomplete-${certIdx}`}
                      />
                      <p className="hint" style={{ marginTop: 6 }}>
                        Suggestions are optional. If you do not find yours, keep typing to add a custom certification.
                      </p>
                      <div className="grid" style={{ marginTop: 8 }}>
                        <div className="col-6">
                          <TkxInput label="Issuer" value={cert.issuer || ''} onChange={(e) => {
                            const copy = [...resume.certifications];
                            copy[certIdx] = { ...copy[certIdx], issuer: e.target.value };
                            setResume((prev) => ({ ...prev, certifications: copy }));
                            markDirty();
                          }} />
                        </div>
                        <div className="col-6">
                          <TkxInput
                            label="Date"
                            type="month"
                            value={toMonthInputValue(cert.date || '')}
                            onChange={(e) => {
                              const copy = [...resume.certifications];
                              copy[certIdx] = { ...copy[certIdx], date: toYearMonth(e.target.value) };
                              setResume((prev) => ({ ...prev, certifications: copy }));
                              markDirty();
                            }}
                          />
                        </div>
                      </div>
                      <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem', marginTop: 8 }}>Details (one per line)</label>
                      <textarea style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 80 }} placeholder="Specialization, score, renewal" value={(cert.details || []).join('\n')} onChange={(e) => {
                        const copy = [...resume.certifications];
                        copy[certIdx] = { ...copy[certIdx], details: e.target.value.split('\n') };
                        setResume((prev) => ({ ...prev, certifications: copy }));
                        markDirty();
                      }} />
                      <p className="hint" style={{ marginTop: 6 }}>
                        Examples: Credential ID, score, specialization, relevant modules, renewal date.
                      </p>
                      <TkxButton variant="outline" style={{ marginTop: 8 }} onClick={() => {
                        const copy = resume.certifications.filter((_, i) => i !== certIdx);
                        setResume((prev) => ({ ...prev, certifications: copy.length ? copy : [structuredClone(emptyCertification)] }));
                        markDirty();
                      }}>Remove</TkxButton>
                    </TkxCardBody></TkxCard>
                  ))}
                  <TkxButton onClick={() => {
                    setResume((prev) => ({ ...prev, certifications: [...prev.certifications, structuredClone(emptyCertification)] }));
                    markDirty();
                  }}>Add certification</TkxButton>
                </div>
              )}
              </fieldset>
            </TkxCardBody></TkxCard>
          );
        })}

        {hiddenSections.length > 0 && (
          <TkxCard padding="md" style={{ marginTop: 16 }}><TkxCardBody>
            <h3 style={{ marginTop: 0 }}>Add section</h3>
            <p style={{ fontSize: '0.9rem' }}>Optional sections are hidden until you add them.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hiddenSections.map((section) => (
                <TkxButton key={section.id} variant="outline" onClick={() => enableSection(section.type)}>
                  Add {SECTION_LABELS[section.type]}
                </TkxButton>
              ))}
            </div>
          </TkxCardBody></TkxCard>
        )}

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem', marginTop: 16 }}>Target Job Description (optional)</label>
        <textarea style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #d9e3ec', fontSize: '0.9rem', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', minHeight: 120 }} value={jdText} onChange={(e) => setJdText(e.target.value)} />
        <p className="hint" style={{ marginTop: 8 }}>
          Paste the job description to get ATS match suggestions. Leaving it blank won&apos;t affect your resume score.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <TkxButton
            onClick={() => saveDraft(false).catch(() => undefined)}
            disabled={!validation.canAutoSave || status === 'saving' || (resumeQuotaBlocked && !resumeId)}
            isLoading={status === 'saving'}
            loadingText="Saving..."
            data-testid="save-changes-button"
          >
            Save changes
          </TkxButton>
          <TkxButton variant="outline" onClick={score} disabled={!requiredSectionsValid || atsQuotaBlocked}>ATS Score</TkxButton>
          <TkxButton
            onClick={continueToAts}
            disabled={!requiredSectionsValid || loadingAtsNavigation || atsQuotaBlocked}
            isLoading={loadingAtsNavigation}
            loadingText="Preparing ATS..."
          >
            Continue to ATS
          </TkxButton>
          <TkxButton variant="outline" onClick={exportPdf} disabled={!requiredSectionsValid}>Export</TkxButton>
          <TkxButton variant="outline" onClick={parseJd} disabled={!requiredSectionsValid}>Parse JD</TkxButton>
          <TkxButton variant="outline" onClick={critique} disabled={!requiredSectionsValid || aiCritiqueLoading} isLoading={aiCritiqueLoading} loadingText="Analyzing...">AI Critique</TkxButton>
          <TkxButton variant="outline" onClick={analyzeTechGap} disabled={!requiredSectionsValid || techGapLoading} isLoading={techGapLoading} loadingText="Analyzing gaps...">Tech Gap</TkxButton>
        </div>
        {!requiredSectionsValid && (
          <p className="hint warn" style={{ marginTop: 8 }}>
            Complete all required sections before continuing to ATS.
          </p>
        )}
        {message && (
          <TkxAlert variant="warning" style={{ marginTop: 12 }}>
            {message}
            {showBulletLengthWarning && firstTooLongHighlightId && (
              <TkxButton
                variant="outline"
                style={{ marginTop: 6, fontSize: '0.75rem' }}
                onClick={scrollToFirstInvalidHighlight}
              >
                Jump to first issue
              </TkxButton>
            )}
          </TkxAlert>
        )}
        {showQuotaBanner && (
          <TkxAlert variant="warning" style={{ marginTop: 12 }}>
            {quotaMessage}
          </TkxAlert>
        )}
        {snackbar && (
          <div className={`snackbar ${snackbar.type}`} role="status" aria-live="polite">
            {snackbar.text}
          </div>
        )}
        {aiCritiqueResult && (
          <div className="ai-critique-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>AI Critique {aiCritiqueResult.provider !== 'fallback' && <span className="ai-badge">AI-assisted</span>}</h3>
              <TkxButton variant="outline" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setAiCritiqueResult(null)}>Close</TkxButton>
            </div>
            {aiCritiqueResult.critique.summary && (
              <p style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--fg-muted, #555)' }}>{aiCritiqueResult.critique.summary}</p>
            )}

            {aiCritiqueResult.critique.topIssues.length > 0 && (
              <div className="ai-critique-section">
                <h4>Top Issues</h4>
                {aiCritiqueResult.critique.topIssues.map((issue, i) => (
                  <div key={i} className={`ai-issue ai-issue--${issue.severity}`}>
                    <span className="ai-issue__type">{issue.type}</span>
                    <span className="ai-issue__severity">{issue.severity}</span>
                    <p className="ai-issue__message">{issue.message}</p>
                  </div>
                ))}
              </div>
            )}

            {aiCritiqueResult.critique.missingKeywords.length > 0 && (
              <div className="ai-critique-section">
                <h4>Missing Keywords</h4>
                <div className="ai-keywords">
                  {aiCritiqueResult.critique.missingKeywords.map((kw, i) => (
                    <span key={i} className="ai-keyword-chip">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {aiCritiqueResult.critique.sectionSuggestions.summary.length > 0 && (
              <div className="ai-critique-section">
                <h4>Summary Improvement</h4>
                {aiCritiqueResult.critique.sectionSuggestions.summary.map((suggestion, i) => (
                  <div key={i} className="ai-suggestion">
                    <p style={{ fontSize: '0.9rem' }}>{suggestion}</p>
                    <TkxButton
                      variant="outline"
                      style={{ fontSize: '0.7rem', padding: '3px 8px', marginTop: 4 }}
                      onClick={() => {
                        setResume((prev) => ({ ...prev, summary: suggestion }));
                        showSnackbar('success', 'Summary updated.');
                      }}
                    >
                      Apply
                    </TkxButton>
                  </div>
                ))}
              </div>
            )}

            {aiCritiqueResult.critique.sectionSuggestions.skills.length > 0 && (
              <div className="ai-critique-section">
                <h4>Suggested Skills</h4>
                <div className="ai-keywords">
                  {aiCritiqueResult.critique.sectionSuggestions.skills.map((skill, i) => (
                    <span
                      key={i}
                      className="ai-keyword-chip ai-keyword-chip--clickable"
                      onClick={() => {
                        if (!allSkills.includes(skill)) {
                          setResume((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
                          showSnackbar('success', `Added "${skill}" to skills.`);
                        }
                      }}
                      title="Click to add"
                    >
                      + {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {aiCritiqueResult.critique.sectionSuggestions.experience.length > 0 && (
              <div className="ai-critique-section">
                <h4>Bullet Rewrites</h4>
                {aiCritiqueResult.critique.sectionSuggestions.experience.map((sug, i) => (
                  <div key={i} className="ai-bullet-suggestion">
                    <div className="ai-bullet-original">
                      <span className="ai-label">Original:</span> {sug.original}
                    </div>
                    <div className="ai-bullet-suggested">
                      <span className="ai-label">Suggested:</span> {sug.suggested}
                    </div>
                    <TkxButton
                      variant="outline"
                      style={{ fontSize: '0.7rem', padding: '3px 8px', marginTop: 4 }}
                      onClick={() => {
                        setResume((prev) => {
                          const exp = [...prev.experience];
                          const entry = exp[sug.expIndex];
                          if (entry) {
                            const highlights = [...entry.highlights];
                            if (sug.bulletIndex < highlights.length) {
                              highlights[sug.bulletIndex] = sug.suggested;
                              exp[sug.expIndex] = { ...entry, highlights };
                            }
                          }
                          return { ...prev, experience: exp };
                        });
                        showSnackbar('success', 'Bullet updated.');
                      }}
                    >
                      Apply
                    </TkxButton>
                  </div>
                ))}
              </div>
            )}

            {aiCritiqueResult.critique.atsSafetyWarnings.length > 0 && (
              <div className="ai-critique-section">
                <h4>ATS Safety Warnings</h4>
                <ul style={{ fontSize: '0.9rem', margin: 0, paddingLeft: 16 }}>
                  {aiCritiqueResult.critique.atsSafetyWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiCritiqueResult.critique.estimatedImprovementBand && (
              <div className="ai-critique-section">
                <h4>Estimated Improvement</h4>
                <p style={{ fontSize: '0.9rem' }}>Current: {aiCritiqueResult.critique.estimatedImprovementBand.current}</p>
                <p style={{ fontSize: '0.9rem' }}>Free optimization: {aiCritiqueResult.critique.estimatedImprovementBand.possibleFree}</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--fg-muted, #888)' }}>{aiCritiqueResult.critique.estimatedImprovementBand.premium}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <TkxButton
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  const c = aiCritiqueResult.critique;
                  setResume((prev) => {
                    let updated = { ...prev };
                    if (c.sectionSuggestions.summary[0]) {
                      updated = { ...updated, summary: c.sectionSuggestions.summary[0] };
                    }
                    if (c.sectionSuggestions.skills.length > 0) {
                      const newSkills = c.sectionSuggestions.skills.filter((s) => !prev.skills.includes(s));
                      updated = { ...updated, skills: [...prev.skills, ...newSkills] };
                    }
                    if (c.sectionSuggestions.experience.length > 0) {
                      const exp = [...updated.experience];
                      for (const sug of c.sectionSuggestions.experience) {
                        const entry = exp[sug.expIndex];
                        if (entry) {
                          const highlights = [...entry.highlights];
                          if (sug.bulletIndex < highlights.length) {
                            highlights[sug.bulletIndex] = sug.suggested;
                            exp[sug.expIndex] = { ...entry, highlights };
                          }
                        }
                      }
                      updated = { ...updated, experience: exp };
                    }
                    return updated;
                  });
                  showSnackbar('success', 'All free suggestions applied.');
                }}
              >
                Apply All Free Suggestions
              </TkxButton>
              {(() => {
                const isLoggedIn = Boolean(getAccessToken());
                const plan = typeof window !== 'undefined' ? localStorage.getItem('rb_plan') || 'FREE' : 'FREE';
                const isPaid = plan === 'STUDENT' || plan === 'PRO';
                const missingData = !resumeId || !aiCritiqueResult;
                const label = !isLoggedIn
                  ? 'Sign in to Unlock Premium'
                  : isPaid
                    ? 'Run Premium Optimization'
                    : 'Unlock Premium Optimization';
                return (
                  <TkxButton
                    style={{ fontSize: '0.8rem', background: '#2f5f8f' }}
                    disabled={premiumOptimizing || (isLoggedIn && isPaid && missingData)}
                    isLoading={premiumOptimizing}
                    loadingText="Optimizing..."
                    onClick={handlePremiumOptimization}
                  >
                    {label}
                  </TkxButton>
                );
              })()}
            </div>
          </div>
        )}
        {techGapResult && (
          <div className="ai-critique-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Technology Gap Analysis</h3>
              <TkxButton variant="outline" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setTechGapResult(null)}>Close</TkxButton>
            </div>
            {techGapResult.roleAlignmentSummary && (
              <p style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--fg-muted, #555)' }}>{techGapResult.roleAlignmentSummary}</p>
            )}

            {techGapResult.strongSkills.length > 0 && (
              <div className="ai-critique-section">
                <h4>Strong Skills</h4>
                <div className="ai-keywords">{techGapResult.strongSkills.map((s, i) => (<span key={i} className="ats-chip ats-chip--match">{s}</span>))}</div>
              </div>
            )}
            {techGapResult.missingCriticalSkills.length > 0 && (
              <div className="ai-critique-section">
                <h4>Missing Critical Skills</h4>
                <div className="ai-keywords">{techGapResult.missingCriticalSkills.map((s, i) => (<span key={i} className="ats-chip ats-chip--missing" style={{ cursor: 'pointer' }} onClick={() => { if (!allSkills.includes(s)) { setResume((prev) => ({ ...prev, skills: [...prev.skills, s] })); showSnackbar('success', `Added "${s}".`); } }}>+ {s}</span>))}</div>
              </div>
            )}
            {techGapResult.missingSecondarySkills.length > 0 && (
              <div className="ai-critique-section">
                <h4>Missing Secondary Skills</h4>
                <div className="ai-keywords">{techGapResult.missingSecondarySkills.map((s, i) => (<span key={i} className="ats-chip ats-chip--suggestion" style={{ cursor: 'pointer' }} onClick={() => { if (!allSkills.includes(s)) { setResume((prev) => ({ ...prev, skills: [...prev.skills, s] })); showSnackbar('success', `Added "${s}".`); } }}>+ {s}</span>))}</div>
              </div>
            )}
            {techGapResult.leadershipGap.length > 0 && (
              <div className="ai-critique-section">
                <h4>Leadership Gap</h4>
                <ul className="ats-guidance__list">{techGapResult.leadershipGap.map((s, i) => (<li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>))}</ul>
              </div>
            )}
            {techGapResult.architectureGap.length > 0 && (
              <div className="ai-critique-section">
                <h4>Architecture Gap</h4>
                <ul className="ats-guidance__list">{techGapResult.architectureGap.map((s, i) => (<li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>))}</ul>
              </div>
            )}
            {techGapResult.toolsGap.length > 0 && (
              <div className="ai-critique-section">
                <h4>Tools Gap</h4>
                <div className="ai-keywords">{techGapResult.toolsGap.map((s, i) => (<span key={i} className="ats-chip ats-chip--missing">{s}</span>))}</div>
              </div>
            )}
            {techGapResult.addOnlyIfTrue.length > 0 && (
              <div className="ai-critique-section ats-guidance__section--caution">
                <h4>Add Only If True</h4>
                <div className="ai-keywords">{techGapResult.addOnlyIfTrue.map((s, i) => (<span key={i} className="ats-chip ats-chip--caution">{s}</span>))}</div>
              </div>
            )}
            {techGapResult.resumeImprovementSuggestions.length > 0 && (
              <div className="ai-critique-section">
                <h4>Resume Improvements</h4>
                <ul className="ats-guidance__list">{techGapResult.resumeImprovementSuggestions.map((s, i) => (<li key={i} style={{ fontSize: '0.9rem' }}>{s}</li>))}</ul>
              </div>
            )}
            {techGapResult.learningRoadmap.length > 0 && (
              <div className="ai-critique-section">
                <h4>Learning Roadmap</h4>
                {techGapResult.learningRoadmap.map((item, i) => (
                  <div key={i} className="ai-bullet-suggestion" style={{ marginBottom: 6 }}>
                    <span className={`ats-chip ats-chip--${item.priority === 'high' ? 'missing' : item.priority === 'medium' ? 'suggestion' : 'match'}`} style={{ marginRight: 6 }}>{item.priority}</span>
                    <strong style={{ fontSize: '0.9rem' }}>{item.skill}</strong>
                    <p style={{ fontSize: '0.9rem', margin: '2px 0 0', color: 'var(--fg-muted, #666)' }}>{item.reason}</p>
                  </div>
                ))}
              </div>
            )}
            {techGapResult.estimatedRoleReadiness && (
              <div className="ai-critique-section">
                <h4>Role Readiness</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ fontSize: '0.9rem' }}><strong>Overall:</strong> {techGapResult.estimatedRoleReadiness.overall}</div>
                  <div style={{ fontSize: '0.9rem' }}><strong>Technical:</strong> {techGapResult.estimatedRoleReadiness.technical}</div>
                  <div style={{ fontSize: '0.9rem' }}><strong>Leadership:</strong> {techGapResult.estimatedRoleReadiness.leadership}</div>
                  <div style={{ fontSize: '0.9rem' }}><strong>Domain:</strong> {techGapResult.estimatedRoleReadiness.domain}</div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ─── Premium Upgrade Modal ─── */}
        {showPremiumModal && (
          <div className="session-warning-overlay" onClick={() => setShowPremiumModal(false)}>
            <div className="session-warning-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: 460 }}>
              <h3 style={{ marginBottom: 8 }}>Unlock Premium Optimization</h3>
              <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: 14 }}>
                Take your resume from good to exceptional with AI-powered premium optimization.
              </p>
              <ul style={{ fontSize: '0.9rem', margin: '0 0 16px', paddingLeft: 18, lineHeight: 2 }}>
                <li><strong>ATS score boost from 90 to 100</strong></li>
                <li>Job gap & technology gap insights</li>
                <li>Premium career guidance & best courses</li>
                <li>Advanced job materials & role matching</li>
              </ul>
              <div style={{ display: 'grid', gap: 10 }}>
                <TkxButton
                  style={{ width: '100%', background: '#2f5f8f' }}
                  onClick={() => {
                    setShowPremiumModal(false);
                    window.location.href = '/billing';
                  }}
                >
                  View Plans & Upgrade
                </TkxButton>
                <TkxButton variant="ghost" style={{ width: '100%', fontSize: '0.8rem' }} onClick={() => setShowPremiumModal(false)}>
                  Continue with free features
                </TkxButton>
              </div>
            </div>
          </div>
        )}
      </TkxCardBody></TkxCard>
      {isReviewAtsPage && (
        <TkxCard as="section" padding="md" className="col-5 section-navigator">
          <div className="section-navigator__head">
            <h3>Sections</h3>
            <p style={{ fontSize: '0.9rem' }}>Jump directly to each section.</p>
          </div>
            <nav className="section-navigator__list">
              {SECTION_NAV_ORDER.map((type) => {
                const section = sections.find((item) => item.type === type);
                const enabled = section?.enabled ?? false;
                return (
                    <button
                      key={type}
                      type="button"
                      className={getSectionNavItemClass(type, activeSectionId, enabled)}
                      aria-current={activeSectionId === type ? 'true' : undefined}
                      onClick={() => handleSectionNavClick(type, enabled)}
                      disabled={!enabled}
                    >
                      {SECTION_NAV_LABELS[type]}
                    </button>
                  );
                })}
            </nav>
        </TkxCard>
      )}
      {exportOpen && (
        <div className="modal">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Export & Finalize</h3>
                <p style={{ fontSize: '0.9rem' }}>Review ATS checks and finalize your resume export.</p>
              </div>
              <TkxButton variant="outline" onClick={() => setExportOpen(false)}>Close</TkxButton>
            </div>
            {exportLoading ? (
              <p style={{ fontSize: '0.9rem' }}>Running ATS checks...</p>
            ) : (
              <>
                {exportSummary && <p style={{ fontSize: '0.9rem' }}>{exportSummary}</p>}
                {exportIssues.length ? (
                  <div className="export-issues">
                    <h4 style={{ margin: 0 }}>Export checks</h4>
                    <ul>
                      {exportIssues.map((issue, idx) => (
                        <li key={`issue-${idx}`} style={{ fontSize: '0.9rem' }}>{issue}</li>
                      ))}
                    </ul>
                    <label className="export-ack">
                      <input
                        type="checkbox"
                        checked={exportApproved}
                        onChange={(e) => setExportApproved(e.target.checked)}
                      />
                      <span style={{ fontSize: '0.9rem' }}>I understand the risks and want to export anyway.</span>
                    </label>
                  </div>
                ) : (
                  <div className="export-issues success">
                    <strong>Looks good.</strong>
                    <p style={{ fontSize: '0.9rem' }}>No blockers detected. You're ready to export.</p>
                  </div>
                )}
                <div className="export-actions">
                  <TkxButton
                    disabled={exportIssues.length > 0 && !exportApproved}
                    onClick={async () => {
                      if (!resumeId) return;
                      try {
                        await ensureTemplateSavedForExport();
                        const exportTemplateId = String(normalizedTemplateParam || resume.templateId || '').trim() || undefined;
                        await api.downloadPdf(resumeId, exportTemplateId);
                        setMessage('PDF downloaded.');
                        setExportOpen(false);
                      } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : 'PDF export failed';
                        setMessage(errorMessage);
                        showSnackbar('error', errorMessage);
                      }
                    }}
                  >
                    Download PDF
                  </TkxButton>
                  <TkxButton
                    variant="outline"
                    disabled={exportIssues.length > 0 && !exportApproved}
                    onClick={async () => {
                      if (!resumeId) return;
                      try {
                        await ensureTemplateSavedForExport();
                        const exportTemplateId = String(normalizedTemplateParam || resume.templateId || '').trim() || undefined;
                        const blob = await api.getPdfBlob(resumeId, exportTemplateId);
                        const url = window.URL.createObjectURL(blob);
                        window.open(url, '_blank');
                      } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : 'Print preview failed';
                        setMessage(errorMessage);
                        showSnackbar('error', errorMessage);
                      }
                    }}
                  >
                    Print preview
                  </TkxButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showTemplatePromptModal && (
        <div className="modal" data-testid="template-choice-modal">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Resume saved</h3>
                <p style={{ fontSize: '0.9rem' }}>Do you want to choose template now?</p>
              </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <TkxButton variant="outline" onClick={handleTemplatePromptClose}>Not now</TkxButton>
              <TkxButton onClick={handleTemplatePromptConfirm} disabled={!templatePromptHref}>OK</TkxButton>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusPill({ status, canAutoSave, lastSavedAt }: { status: 'idle' | 'saving' | 'saved' | 'error'; canAutoSave: boolean; lastSavedAt: string }) {
  const label = !canAutoSave
    ? 'Autosave off'
    : status === 'saving'
      ? 'Saving...'
      : status === 'saved'
        ? `Saved ${lastSavedAt ? `at ${lastSavedAt}` : ''}`.trim()
        : status === 'error'
          ? 'Save failed'
          : 'Autosave on';
  const state = !canAutoSave ? 'off' : status;
  return (
    <div className={`status-pill ${state}`}>
      {label}
    </div>
  );
}

function SectionBadge({ level, text }: { level: FeedbackLevel; text: string }) {
  const label = level === 'good' ? 'Good' : level === 'warn' ? 'Improve' : 'Required';
  return (
    <div className="badge-row">
      <span className={`badge ${level}`}>{label}</span>
      <span style={{ fontSize: '0.9rem' }}>{text}</span>
    </div>
  );
}

function sanitizeContact(contact: ContactInfo): ContactInfo {
  const fullName = contact.fullName?.trim() || '';
  const email = contact.email?.trim() || undefined;
  const phone = contact.phone?.trim() || undefined;
  const location = contact.location?.trim() || undefined;
  const links = (contact.links || []).map((link) => link.trim()).filter(Boolean);
  return {
    fullName,
    email,
    phone,
    location,
    links: links.length ? links : undefined,
  };
}

export function buildSectionMetaMap(trackedSections: Array<{ type: SectionType; element: Element }>) {
  const map = new Map<Element, { type: SectionType; order: number }>();
  trackedSections.forEach(({ type, element }, index) => {
    map.set(element, { type, order: index });
  });
  return map;
}

export function getActiveSectionFromObserverEntries(
  entries: IntersectionObserverEntry[],
  sectionMeta: Map<Element, { type: SectionType; order: number }>,
) {
  let best: { type: SectionType; ratio: number; order: number } | null = null;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const meta = sectionMeta.get(entry.target);
    if (!meta) continue;
    if (
      !best ||
      entry.intersectionRatio > best.ratio ||
      (entry.intersectionRatio === best.ratio && meta.order < best.order)
    ) {
      best = { type: meta.type, ratio: entry.intersectionRatio, order: meta.order };
    }
  }
  return best ? best.type : null;
}

export function getSectionKeyFromNode(node: HTMLElement | null): SectionType | null {
  let cursor: HTMLElement | null = node;
  while (cursor) {
    const dataAttr = cursor.getAttribute('data-section-id');
    if (dataAttr && SECTION_KEYS.includes(dataAttr as SectionType)) {
      return dataAttr as SectionType;
    }
    const id = cursor.id;
    if (id && id.startsWith(SECTION_ID_PREFIX)) {
      const candidate = id.slice(SECTION_ID_PREFIX.length) as SectionType;
      if (SECTION_KEYS.includes(candidate)) {
        return candidate;
      }
    }
    cursor = cursor.parentElement;
  }
  return null;
}

export function getSectionNavItemClass(type: SectionType, activeSectionId: SectionType, enabled: boolean) {
  return `section-navigator__item${activeSectionId === type ? ' active' : ''}${!enabled ? ' disabled' : ''}`;
}

export function shouldRespectEditingOverride(
  editingSection: SectionType | null,
  lastFocusTs: number,
  overrideDurationMs: number,
  activeElementInsideEditor: boolean,
  now = Date.now(),
) {
  if (!editingSection) return false;
  if (!activeElementInsideEditor) return false;
  return now - lastFocusTs < overrideDurationMs;
}

function scrollToSection(type: SectionType) {
  if (typeof window === 'undefined') return;
  const el = document.getElementById(`resume-section-${type}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function chooseUploadReviewTarget(resume: ResumeDraft): SectionType {
  if (resume.experience.some(isMeaningfulExperience)) return 'experience';
  if (resume.education.some((item) => isMeaningfulEducation(item))) return 'education';
  if (!resume.summary.trim()) return 'summary';
  if (!normalizeSkillCategories({
    skills: resume.skills || [],
    technicalSkills: resume.technicalSkills || [],
    softSkills: resume.softSkills || [],
    languages: resume.languages || [],
  }).skills.length) return 'skills';
  return 'contact';
}

function draftFromImport(parsed: ResumeImportResult): { resume: ResumeDraft; unmappedText: string } {
  const experience = parsed.experience
    .map((item) => ({
      company: item.company.trim(),
      role: item.role.trim(),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
      highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
    }))
    .filter((item) => isStrictExperience(item) || captureImportBlock(item));

  const strictExperience = experience.filter(isStrictExperience);
  const droppedExperience = experience
    .filter((item) => !isStrictExperience(item))
    .map((item) => captureImportBlock(item));

  const education = parsed.education
    .map((item) => ({
      institution: item.institution.trim(),
      degree: item.degree.trim(),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
      details: (item.details || []).map((line) => line.trim()).filter(Boolean),
      gpa: typeof item.gpa === 'number' ? item.gpa : null,
      percentage: typeof item.percentage === 'number' ? item.percentage : null,
    }))
    .filter((item) => isStrictEducation(item) || captureImportBlock(item));

  const strictEducation = education.filter(isStrictEducation);
  const droppedEducation = education
    .filter((item) => !isStrictEducation(item))
    .map((item) => captureImportBlock(item));

  const projects = (parsed.projects || [])
    .map((item) => ({
      name: item.name.trim(),
      role: item.role?.trim(),
      startDate: item.startDate?.trim(),
      endDate: item.endDate?.trim(),
      url: item.url?.trim(),
      highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
    }))
    .filter((item) => item.name || item.highlights.length || item.url);

  const certifications = (parsed.certifications || [])
    .map((item) => ({
      name: item.name.trim(),
      issuer: item.issuer?.trim(),
      date: item.date?.trim(),
      details: (item.details || []).map((line) => line.trim()).filter(Boolean),
    }))
    .filter((item) => item.name);

  const importNotes = [
    parsed.unmappedText || '',
    ...droppedExperience,
    ...droppedEducation,
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  const parsedSkillCategories = normalizeSkillCategories({
    skills: (parsed.skills || []).map((skill) => skill.trim()).filter(Boolean),
    technicalSkills: (parsed.technicalSkills || []).map((skill) => skill.trim()).filter(Boolean),
    softSkills: (parsed.softSkills || []).map((skill) => skill.trim()).filter(Boolean),
    languages: (parsed.languages || []).map((language) => language.trim()).filter(Boolean),
  });

  return {
    resume: {
      title: parsed.title?.trim() || '',
      contact: sanitizeContact(parsed.contact || { fullName: '' }),
      summary: parsed.summary?.trim() || '',
      skills: parsedSkillCategories.skills,
      technicalSkills: parsedSkillCategories.technicalSkills,
      softSkills: parsedSkillCategories.softSkills,
      languages: parsedSkillCategories.languages,
      experience: strictExperience,
      education: strictEducation,
      projects,
      certifications,
    },
    unmappedText: importNotes,
  };
}

function isStrictExperience(item: ExperienceItem) {
  return (
    item.company.length >= 2 &&
    item.role.length >= 2 &&
    item.startDate.length >= 4 &&
    item.endDate.length >= 4 &&
    item.highlights.length >= 1
  );
}

function isStrictEducation(item: EducationItem) {
  return (
    item.institution.length >= 2 &&
    item.degree.length >= 2 &&
    item.startDate.length >= 4 &&
    item.endDate.length >= 4
  );
}

function captureImportBlock(item: { [key: string]: string | string[] | number | null | undefined }) {
  const fragments = Object.values(item)
    .flatMap((value) => Array.isArray(value) ? value : [value || ''])
    .map((value) => String(value).trim())
    .filter(Boolean);
  return fragments.length ? `From Upload: ${fragments.join(' | ')}` : '';
}

function getEmptyResume(): ResumeDraft {
  return {
    title: '',
    contact: { fullName: '' },
    summary: '',
    skills: [],
    technicalSkills: [],
    softSkills: [],
    languages: [],
    experience: [],
    education: [],
    projects: [],
    certifications: [],
  };
}

function getDefaultSections(): SectionState[] {
  return [
    { id: 'sec-contact', type: 'contact', enabled: true, required: true },
    { id: 'sec-summary', type: 'summary', enabled: true, required: true },
    { id: 'sec-experience', type: 'experience', enabled: true, required: true },
    { id: 'sec-education', type: 'education', enabled: true, required: true },
    { id: 'sec-skills', type: 'skills', enabled: true, required: true },
    { id: 'sec-languages', type: 'languages', enabled: true, required: false },
    { id: 'sec-projects', type: 'projects', enabled: false, required: false },
    { id: 'sec-certifications', type: 'certifications', enabled: false, required: false },
  ];
}

function buildPayload(resume: ResumeDraft, sections: SectionState[]) {
  const enabled = new Set(sections.filter((s) => s.enabled).map((s) => s.type));
  const trimmedContact = sanitizeContact(resume.contact);
  const skills = normalizeSkillCategories({
    skills: resume.skills || [],
    technicalSkills: resume.technicalSkills || [],
    softSkills: resume.softSkills || [],
    languages: resume.languages || [],
  });
  return {
    title: resume.title.trim() || resume.contact.fullName.trim() || 'Resume',
    contact: enabled.has('contact') ? trimmedContact : undefined,
    summary: enabled.has('summary') ? resume.summary.trim() : '',
    skills: enabled.has('skills') ? skills.skills : [],
    technicalSkills: enabled.has('skills') ? skills.technicalSkills : [],
    softSkills: enabled.has('skills') ? skills.softSkills : [],
    languages: enabled.has('languages') || skills.languages.length ? skills.languages : [],
    experience: enabled.has('experience')
      ? resume.experience.map((item) => ({
        company: item.company.trim(),
        role: item.role.trim(),
        startDate: item.startDate.trim(),
        endDate: item.endDate.trim(),
        highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
      }))
      : [],
    education: enabled.has('education')
      ? resume.education.map((item) => ({
        institution: item.institution.trim(),
        degree: item.degree.trim(),
        startDate: item.startDate.trim(),
        endDate: item.endDate.trim(),
        details: (item.details || []).map((line) => line.trim()).filter(Boolean),
        gpa: item.gpa ?? null,
        percentage: item.percentage ?? null,
      }))
      : [],
    projects: enabled.has('projects')
      ? resume.projects.map((item) => ({
        name: item.name.trim(),
        role: item.role?.trim(),
        startDate: item.startDate?.trim(),
        endDate: item.endDate?.trim(),
        url: item.url?.trim(),
        highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
      }))
      : [],
    certifications: enabled.has('certifications')
      ? resume.certifications.map((item) => ({
        name: item.name.trim(),
        issuer: item.issuer?.trim(),
        date: item.date?.trim(),
        details: (item.details || []).map((line) => line.trim()).filter(Boolean),
      }))
      : [],
  };
}

function resumeFromApi(resume: Resume): ResumeDraft {
  const skillCategories = normalizeSkillCategories({
    skills: (resume.skills || []).map((item) => item.trim()).filter(Boolean),
    technicalSkills: (resume.technicalSkills || []).map((item) => item.trim()).filter(Boolean),
    softSkills: (resume.softSkills || []).map((item) => item.trim()).filter(Boolean),
    languages: (resume.languages || []).map((item) => item.trim()).filter(Boolean),
  });
  return {
    title: resume.title?.trim() || '',
    contact: sanitizeContact(resume.contact || { fullName: '' }),
    summary: resume.summary?.trim() || '',
    skills: skillCategories.skills,
    technicalSkills: skillCategories.technicalSkills,
    softSkills: skillCategories.softSkills,
    languages: skillCategories.languages,
    experience: (resume.experience || []).map((item) => ({
      company: item.company.trim(),
      role: item.role.trim(),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
      highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
    })),
    education: (resume.education || []).map((item) => ({
      institution: item.institution.trim(),
      degree: item.degree.trim(),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
      details: (item.details || []).map((line) => line.trim()).filter(Boolean),
      gpa: typeof item.gpa === 'number' ? item.gpa : null,
      percentage: typeof item.percentage === 'number' ? item.percentage : null,
    })),
    projects: (resume.projects || []).map((item) => ({
      name: item.name.trim(),
      role: item.role?.trim(),
      startDate: item.startDate?.trim(),
      endDate: item.endDate?.trim(),
      url: item.url?.trim(),
      highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
    })),
    certifications: (resume.certifications || []).map((item) => ({
      name: item.name.trim(),
      issuer: item.issuer?.trim(),
      date: item.date?.trim(),
      details: (item.details || []).map((line) => line.trim()).filter(Boolean),
    })),
  };
}

function validateResumeDraft(resume: ResumeDraft, sections: SectionState[]) {
  const enabled = new Set(sections.filter((s) => s.enabled).map((s) => s.type));
  const sectionFeedback: Record<SectionType, { level: FeedbackLevel; text: string }> = {
    contact: { level: 'good', text: 'Contact details are clear.' },
    summary: { level: 'good', text: '2-3 sentences focused on impact.' },
    skills: { level: 'good', text: 'Skills are concise and relevant.' },
    languages: { level: 'good', text: 'Languages are listed separately.' },
    experience: { level: 'good', text: 'Bullets show action and impact.' },
    education: { level: 'good', text: 'Education is complete.' },
    projects: { level: 'good', text: 'Project outcomes are listed.' },
    certifications: { level: 'good', text: 'Certifications add credibility.' },
  };

  let canAutoSave = true;

  if (enabled.has('contact')) {
    if (!resume.contact.fullName || resume.contact.fullName.trim().length < 2) {
      sectionFeedback.contact = { level: 'error', text: 'Add your full name.' };
      canAutoSave = false;
    } else if (!resume.contact.email && !resume.contact.phone) {
      sectionFeedback.contact = { level: 'warn', text: 'Add an email or phone number.' };
    }
  }

  if (enabled.has('summary')) {
    const summaryLength = resume.summary.trim().length;
    if (summaryLength < 20) {
      sectionFeedback.summary = { level: 'error', text: 'Summary must be at least 20 characters.' };
      canAutoSave = false;
    } else if (summaryLength < 40) {
      sectionFeedback.summary = { level: 'warn', text: 'Add 2-3 sentences (40+ characters).' };
    }
  }

  if (enabled.has('skills')) {
    const skillCategories = normalizeSkillCategories({
      skills: resume.skills || [],
      technicalSkills: resume.technicalSkills || [],
      softSkills: resume.softSkills || [],
      languages: resume.languages || [],
    });
    if (skillCategories.skills.length < 3) {
      sectionFeedback.skills = { level: 'warn', text: 'Add at least 3 skills.' };
    }
  }

  if (enabled.has('languages')) {
    const languageItems = (resume.languages || []).map((item) => item.trim()).filter(Boolean);
    if (!languageItems.length) {
      sectionFeedback.languages = { level: 'warn', text: 'Add languages if they are relevant for your target role.' };
    }
  }

  if (enabled.has('experience')) {
    const normalizedExperience = resume.experience.map((item) => ({
      company: item.company.trim(),
      role: item.role.trim(),
      startDate: item.startDate.trim(),
      endDate: item.endDate.trim(),
      highlights: item.highlights.map((line) => line.trim()).filter(Boolean),
    }));
    const experienceValidation = validateExperienceEntries(normalizedExperience as any);
    const strictErrors = experienceValidation.hasErrors;
    const bullets = normalizedExperience.flatMap((e) => e.highlights).filter(Boolean);
    const tooLong = bullets.filter((b) => countWords(b) > BULLET_WORD_LIMIT);
    const hasMetric = bullets.some((b) => /\d/.test(b));
    if (strictErrors) {
      sectionFeedback.experience = { level: 'error', text: 'Fix experience dates and required role/company fields.' };
      canAutoSave = false;
    } else if (resume.experience.length === 0 || !bullets.length) {
      sectionFeedback.experience = { level: 'error', text: 'Add a role with bullet highlights.' };
      canAutoSave = false;
    } else if (!hasMetric) {
      sectionFeedback.experience = { level: 'warn', text: 'Add measurable impact (numbers or percentages).' };
    } else if (tooLong.length) {
      sectionFeedback.experience = { level: 'warn', text: 'Trim bullets to 8-22 words.' };
    }
  }

  if (enabled.has('education')) {
    const educationValidation = validateEducationEntries(resume.education);
    if (educationValidation.hasErrors) {
      sectionFeedback.education = { level: 'error', text: 'Fix education degree, institution, and date fields.' };
      canAutoSave = false;
    } else if (!resume.education.some(isMeaningfulEducation)) {
      sectionFeedback.education = { level: 'error', text: 'Add education details.' };
      canAutoSave = false;
    }
  }

  if (enabled.has('projects')) {
    const projectDateError = resume.projects.some((item) => {
      const start = (item.startDate || '').trim();
      const end = (item.endDate || '').trim();
      if (start && !isYearMonth(toYearMonth(start))) return true;
      if (end && !isYearMonth(toYearMonth(end))) return true;
      if (start && end && isYearMonth(toYearMonth(start)) && isYearMonth(toYearMonth(end))) {
        return compareYearMonth(toYearMonth(end), toYearMonth(start)) < 0;
      }
      return false;
    });
    const projectUrlError = resume.projects.some((item) => {
      const url = (item.url || '').trim();
      if (!url) return false;
      return !isValidProjectUrl(url);
    });
    if (projectDateError) {
      sectionFeedback.projects = { level: 'error', text: 'Project dates must be valid YYYY-MM values.' };
      canAutoSave = false;
    } else if (projectUrlError) {
      sectionFeedback.projects = { level: 'error', text: 'Project URLs must start with https:// and be valid links.' };
      canAutoSave = false;
    } else if (!resume.projects.length || !resume.projects.some((p) => p.name.trim())) {
      sectionFeedback.projects = { level: 'warn', text: 'Add a project or remove this section.' };
    }
  }

  if (enabled.has('certifications')) {
    const certificationDateError = resume.certifications.some((item) => {
      const token = (item.date || '').trim();
      if (!token) return false;
      return !isYearMonth(toYearMonth(token));
    });
    if (certificationDateError) {
      sectionFeedback.certifications = { level: 'error', text: 'Certification date must use YYYY-MM.' };
      canAutoSave = false;
    } else if (!resume.certifications.length || !resume.certifications.some((c) => c.name.trim())) {
      sectionFeedback.certifications = { level: 'warn', text: 'Add a certification or remove this section.' };
    }
  }

  return { canAutoSave, sections: sectionFeedback };
}

function buildActionVerbEntries(experience: ExperienceItem[]): ExperienceBulletEntry[] {
  return (experience || []).flatMap((exp, expIndex) =>
    (exp.highlights || []).map((text, highlightIndex) => ({
      expIndex,
      highlightIndex,
      text: String(text || ''),
    })),
  );
}

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function shouldShowBulletLengthWarning(message: string | null | undefined) {
  return Boolean(message && message.trim() === BULLET_LENGTH_WARNING);
}

export function getHighlightLengthState(line: string, warningActive: boolean) {
  const words = countWords(line);
  const isTooLong = words > BULLET_WORD_LIMIT;
  const showError = warningActive && isTooLong;
  return {
    words,
    isTooLong,
    showError,
    helperText: showError ? `Too long: ${words} words (max ${BULLET_WORD_LIMIT}).` : '',
  };
}

export function findFirstTooLongHighlight(experience: ExperienceItem[]) {
  for (let expIndex = 0; expIndex < experience.length; expIndex++) {
    const highlights = experience[expIndex].highlights || [];
    for (let highlightIndex = 0; highlightIndex < highlights.length; highlightIndex++) {
      if (countWords(highlights[highlightIndex] || '') > BULLET_WORD_LIMIT) {
        return { expIndex, highlightIndex };
      }
    }
  }
  return null;
}

export function focusHighlightById(highlightId: string | null) {
  if (!highlightId || typeof document === 'undefined') return false;
  const element = document.querySelector(`[data-highlight-id="${highlightId}"]`) as HTMLElement | null;
  if (!element || typeof element.scrollIntoView !== 'function') return false;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return true;
}

function detectQuotaState(error: unknown) {
  if (isApiRequestError(error) && error.status === 429 && error.code === RESUME_CREATE_RATE_LIMIT_CODE) {
    return {
      resumeBlocked: true,
      atsBlocked: false,
      message: 'Rate limit exceeded for resume creation.',
    };
  }
  const raw = isApiRequestError(error) ? String(error.message || '') : String(error instanceof Error ? error.message : error || '');
  if (/FREE_PLAN_RESUME_LIMIT_EXCEEDED/i.test(raw)) {
    return {
      resumeBlocked: true,
      atsBlocked: false,
      message: 'Free plan limit reached: you can create up to 2 resumes. Upgrade to create more.',
    };
  }
  if (/FREE_PLAN_ATS_LIMIT_EXCEEDED/i.test(raw)) {
    return {
      resumeBlocked: false,
      atsBlocked: true,
      message: 'Free plan ATS limit reached after 2 scans. Upgrade to continue ATS checks.',
    };
  }
  return { resumeBlocked: false, atsBlocked: false, message: '' };
}

function getStatusText(status: 'idle' | 'saving' | 'saved' | 'error', lastSavedAt: string, canAutoSave: boolean) {
  if (!canAutoSave) return 'Complete required sections to enable autosave.';
  if (status === 'saving') return 'Saving...';
  if (status === 'saved') return `Saved ${lastSavedAt ? `at ${lastSavedAt}` : ''}`.trim();
  if (status === 'error') return 'Save failed. Check required sections.';
  return 'Changes are saved automatically.';
}

function getSectionIssues(validation: { sections: Record<SectionType, { level: FeedbackLevel; text: string }> }) {
  return Object.values(validation.sections)
    .filter((section) => section.level === 'error')
    .map((section) => section.text);
}

function formatRoleLevel(level: 'FRESHER' | 'MID' | 'SENIOR' | '') {
  if (level === 'FRESHER') return 'Fresher / Entry';
  if (level === 'SENIOR') return 'Senior';
  if (level === 'MID') return 'Mid-level';
  return 'Not detected';
}

function isMeaningfulExperience(item: ExperienceItem) {
  return Boolean(
    item.company.trim() ||
    item.role.trim() ||
    item.startDate.trim() ||
    item.endDate.trim() ||
    item.highlights.some((h) => h.trim().length > 0),
  );
}

function isMeaningfulEducation(item: EducationItem) {
  return Boolean(
    item.institution.trim() ||
    item.degree.trim() ||
    item.startDate.trim() ||
    item.endDate.trim() ||
    (item.details || []).some((line) => line.trim().length > 0) ||
    item.gpa != null ||
    item.percentage != null,
  );
}

function validateEducationEntries(entries: EducationItem[]) {
  const output: Array<{
    institution?: string;
    degree?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
    percentage?: string;
  }> = [];
  let hasErrors = false;

  for (const item of entries || []) {
    const errors: {
      institution?: string;
      degree?: string;
      startDate?: string;
      endDate?: string;
      gpa?: string;
      percentage?: string;
    } = {};
    const meaningful = isMeaningfulEducation(item);

    if (meaningful) {
      if (item.institution.trim().length < 2) {
        errors.institution = 'Institution is required.';
      }
      if (item.degree.trim().length < 2) {
        errors.degree = 'Degree is required.';
      }

      const normalizedStart = toYearMonth(item.startDate || '');
      const normalizedEnd = toYearMonth(item.endDate || '');
      if (!isYearMonth(normalizedStart)) {
        errors.startDate = 'Start date must be YYYY-MM.';
      }
      if (!isYearMonth(normalizedEnd)) {
        errors.endDate = 'End date must be YYYY-MM.';
      }
      if (isYearMonth(normalizedStart) && isYearMonth(normalizedEnd) && compareYearMonth(normalizedEnd, normalizedStart) < 0) {
        errors.endDate = 'End date must be on or after start date.';
      }

      const hasGpa = typeof item.gpa === 'number' && !Number.isNaN(item.gpa);
      const hasPercentage = typeof item.percentage === 'number' && !Number.isNaN(item.percentage);
      if (hasGpa && ((item.gpa as number) < 0 || (item.gpa as number) > 10)) {
        errors.gpa = 'GPA must be between 0 and 10.';
      }
      if (hasPercentage && ((item.percentage as number) < 0 || (item.percentage as number) > 100)) {
        errors.percentage = 'Percentage must be between 0 and 100.';
      }
      if (hasGpa && hasPercentage) {
        errors.gpa = 'Use GPA or percentage, not both.';
        errors.percentage = 'Use GPA or percentage, not both.';
      }
    }

    if (Object.keys(errors).length > 0) {
      hasErrors = true;
    }
    output.push(errors);
  }

  return {
    hasErrors,
    entries: output,
  };
}

function hasResumeDraftContent(resume: ResumeDraft) {
  const skillCategories = normalizeSkillCategories({
    skills: resume.skills || [],
    technicalSkills: resume.technicalSkills || [],
    softSkills: resume.softSkills || [],
    languages: resume.languages || [],
  });
  return Boolean(
    resume.title.trim() ||
    resume.summary.trim() ||
    skillCategories.skills.length ||
    (resume.languages || []).length ||
    resume.experience.some(isMeaningfulExperience) ||
    resume.education.some((item) => isMeaningfulEducation(item)) ||
    resume.projects.some((item) => item.name.trim() || (item.url || '').trim() || item.highlights.some(Boolean)) ||
    resume.certifications.some((item) => item.name.trim()) ||
    resume.contact.fullName.trim() ||
    (resume.contact.email || '').trim() ||
    (resume.contact.phone || '').trim(),
  );
}

function parseDateToken(token: string, end = false) {
  if (!token) return null;
  if (/present|current|now/i.test(token)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const clean = token.trim().toLowerCase();
  const monthMap: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  const monthYear = clean.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})/i);
  if (monthYear) {
    const month = monthMap[monthYear[1].slice(0, 4)] || monthMap[monthYear[1].slice(0, 3)] || 1;
    return { year: Number(monthYear[2]), month };
  }
  const monthYearNumeric = clean.match(/\b(\d{1,2})[-/](19\d{2}|20\d{2})\b/);
  if (monthYearNumeric) {
    return { year: Number(monthYearNumeric[2]), month: Math.max(1, Math.min(12, Number(monthYearNumeric[1]))) };
  }
  const yearMonth = clean.match(/\b(19\d{2}|20\d{2})[-/](\d{1,2})\b/);
  if (yearMonth) {
    return { year: Number(yearMonth[1]), month: Math.max(1, Math.min(12, Number(yearMonth[2]))) };
  }
  const yearOnly = clean.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), month: end ? 12 : 1 };
  }
  return null;
}

function dateSortValue(token: string, end = false) {
  const parsed = parseDateToken(token, end);
  if (!parsed) return 0;
  return parsed.year * 100 + parsed.month;
}

function estimateExperienceMonths(experience: ExperienceItem[]) {
  let total = 0;
  for (const item of experience) {
    const start = parseDateToken(item.startDate, false);
    if (!start) continue;
    const end = parseDateToken(item.endDate, true) || start;
    const startIndex = start.year * 12 + (start.month - 1);
    const endIndex = end.year * 12 + (end.month - 1);
    total += Math.max(1, endIndex - startIndex + 1);
  }
  return total;
}

function detectExperienceLevelFromDraft(resume: ResumeDraft) {
  const skillCategories = normalizeSkillCategories({
    skills: resume.skills || [],
    technicalSkills: resume.technicalSkills || [],
    softSkills: resume.softSkills || [],
    languages: resume.languages || [],
  });
  const meaningful = resume.experience.filter(isMeaningfulExperience);
  const roleCount = meaningful.length;
  const distinctCompanies = new Set(
    meaningful.map((item) => item.company.toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean),
  ).size;
  const rolesWithDate = meaningful.filter((item) => {
    const hasStart = parseDateToken(item.startDate, false);
    const hasEnd = parseDateToken(item.endDate, true);
    return Boolean(hasStart || hasEnd || /present/i.test(item.endDate));
  }).length;
  const roleCompanyPatterns = meaningful.filter((item) => item.role.trim() && item.company.trim()).length;
  const totalMonths = estimateExperienceMonths(meaningful);
  const text = `${resume.summary} ${skillCategories.skills.join(' ')} ${meaningful.map((item) => `${item.role} ${item.company}`).join(' ')}`.toLowerCase();

  if (roleCount === 0) return 'FRESHER';
  if (roleCount >= 2 || distinctCompanies >= 2 || totalMonths > 36) return 'SENIOR';
  if (roleCount >= 1 && roleCount <= 2 && rolesWithDate >= 1) return 'MID';
  if (roleCount <= 1 && totalMonths <= 12 && roleCompanyPatterns === 0) return 'FRESHER';
  if (/(intern|internship|student|fresher|entry level|entry-level|junior)/.test(text) && totalMonths < 24) return 'FRESHER';
  return 'MID';
}

function normalizeUploadParsed(result: UploadResumeResponse): ResumeImportResult {
  const parsed = result.parsed;
  if (!parsed || typeof parsed !== 'object') {
    return result;
  }
  return {
    ...result,
    ...parsed,
    unmappedText: parsed.unmappedText || result.unmappedText,
  };
}

function mergeImportedResume(current: ResumeDraft, parsed: ResumeImportResult): ResumeDraft {
  const skillCategories = normalizeSkillCategories({
    skills: mergeList(current.skills, parsed.skills || []),
    technicalSkills: mergeList(current.technicalSkills || [], parsed.technicalSkills || []),
    softSkills: mergeList(current.softSkills || [], parsed.softSkills || []),
    languages: mergeList(current.languages || [], parsed.languages || []),
  });
  return {
    title: current.title.trim() ? current.title : (parsed.title || current.title),
    contact: mergeContact(current.contact, parsed.contact),
    summary: current.summary.trim() ? current.summary : (parsed.summary || current.summary),
    skills: skillCategories.skills,
    technicalSkills: skillCategories.technicalSkills,
    softSkills: skillCategories.softSkills,
    languages: skillCategories.languages,
    experience: mergeExperience(current.experience, parsed.experience || []),
    education: mergeEducation(current.education, parsed.education || []),
    projects: mergeProjects(current.projects, parsed.projects || []),
    certifications: mergeCertifications(current.certifications, parsed.certifications || []),
  };
}

function mergeContact(current: ContactInfo, incoming?: ContactInfo): ContactInfo {
  if (!incoming) return current;
  return {
    fullName: current.fullName || incoming.fullName || '',
    email: current.email || incoming.email,
    phone: current.phone || incoming.phone,
    location: current.location || incoming.location,
    links: mergeList(current.links || [], incoming.links || []),
  };
}

function mergeList(current: string[], incoming: string[]) {
  const merged = [...current, ...incoming].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(merged));
}

function mergeExperience(current: ExperienceItem[], incoming: ExperienceItem[]) {
  const currentMeaningful = current.filter(isMeaningfulExperience);
  const incomingMeaningful = incoming.filter(isMeaningfulExperience);
  if (!incomingMeaningful.length) return current;
  if (!currentMeaningful.length) return sortExperience(incomingMeaningful);
  const map = new Map<string, ExperienceItem>();
  for (const item of currentMeaningful) {
    map.set(experienceKey(item), { ...item, highlights: item.highlights.filter(Boolean) });
  }
  for (const item of incomingMeaningful) {
    const key = experienceKey(item);
    if (!map.has(key)) {
      map.set(key, { ...item, highlights: item.highlights.filter(Boolean) });
      continue;
    }
    const merged = map.get(key)!;
    merged.highlights = mergeList(merged.highlights, item.highlights || []);
    merged.startDate = merged.startDate || item.startDate;
    merged.endDate = merged.endDate || item.endDate;
    merged.role = merged.role || item.role;
    merged.company = merged.company || item.company;
    map.set(key, merged);
  }
  return sortExperience(Array.from(map.values()));
}

function experienceKey(item: ExperienceItem) {
  const company = item.company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const role = item.role.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${company}|${role}|${item.startDate}|${item.endDate}`;
}

function sortExperience(items: ExperienceItem[]) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const endA = dateSortValue(a.endDate || a.startDate, true);
    const endB = dateSortValue(b.endDate || b.startDate, true);
    if (endB !== endA) return endB - endA;
    return dateSortValue(b.startDate, false) - dateSortValue(a.startDate, false);
  });
  return sorted;
}

function mergeEducation(current: EducationItem[], incoming: EducationItem[]) {
  const currentMeaningful = current.filter((item) => isMeaningfulEducation(item));
  const incomingMeaningful = incoming.filter((item) => isMeaningfulEducation(item));
  if (!incomingMeaningful.length) return current;
  if (!currentMeaningful.length) return incomingMeaningful;
  const map = new Map<string, EducationItem>();
  for (const item of currentMeaningful) map.set(`${item.institution}|${item.degree}`, item);
  for (const item of incomingMeaningful) {
    const key = `${item.institution}|${item.degree}`;
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function mergeProjects(current: ProjectItem[], incoming: ProjectItem[]) {
  const currentMeaningful = current.filter((item) => item.name.trim() || (item.url || '').trim() || item.highlights.some(Boolean));
  const incomingMeaningful = incoming.filter((item) => item.name.trim() || (item.url || '').trim() || item.highlights.some(Boolean));
  if (!incomingMeaningful.length) return current;
  if (!currentMeaningful.length) return incomingMeaningful;
  const map = new Map<string, ProjectItem>();
  for (const item of currentMeaningful) map.set(projectKey(item), item);
  for (const item of incomingMeaningful) {
    const key = projectKey(item);
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function projectKey(item: ProjectItem) {
  const name = (item.name || '').trim().toLowerCase();
  const url = (item.url || '').trim().toLowerCase();
  return `${name}|${url}`;
}

function mergeCertifications(current: CertificationItem[], incoming: CertificationItem[]) {
  const currentMeaningful = current.filter((item) => item.name.trim());
  const incomingMeaningful = incoming.filter((item) => item.name.trim());
  if (!incomingMeaningful.length) return current;
  if (!currentMeaningful.length) return incomingMeaningful;
  const map = new Map<string, CertificationItem>();
  for (const item of currentMeaningful) map.set(item.name.toLowerCase(), item);
  for (const item of incomingMeaningful) {
    const key = item.name.toLowerCase();
    if (!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function buildGuidance(input: {
  summaryCharCount: number;
  skillsCount: number;
  hasExperienceMetrics: boolean;
  longBulletCount: number;
  missingContact: boolean;
  experienceCount: number;
  roleLevel: 'FRESHER' | 'MID' | 'SENIOR';
}) {
  const items: Array<{ level: 'good' | 'warn' | 'error'; title: string; message: string; section: SectionType | null }> = [];
  if (input.missingContact) {
    items.push({ level: 'error', title: 'Contact Info', message: 'Add an email or phone number so recruiters can reach you.', section: 'contact' });
  } else {
    items.push({ level: 'good', title: 'Contact Info', message: 'Clear contact details detected.', section: 'contact' });
  }
  if (input.summaryCharCount < 40) {
    items.push({ level: 'warn', title: 'Summary', message: 'Add 2-3 sentences focused on role, scope, and impact.', section: 'summary' });
  } else {
    items.push({ level: 'good', title: 'Summary', message: 'Summary length is ATS-friendly.', section: 'summary' });
  }
  if (input.skillsCount < 3) {
    items.push({ level: 'error', title: 'Skills', message: 'Add at least 3 role-relevant skills.', section: 'skills' });
  } else if (input.skillsCount < 6) {
    items.push({ level: 'warn', title: 'Skills', message: 'Add 6-12 skills aligned to the job description.', section: 'skills' });
  } else {
    items.push({ level: 'good', title: 'Skills', message: 'Solid skill coverage for ATS parsing.', section: 'skills' });
  }
  if (input.experienceCount < 1) {
    items.push({ level: 'error', title: 'Experience', message: 'Add at least one experience entry.', section: 'experience' });
  } else if (!input.hasExperienceMetrics) {
    items.push({ level: 'warn', title: 'Impact', message: 'Add metrics to at least one bullet (%, $, time).', section: 'experience' });
  } else {
    items.push({ level: 'good', title: 'Impact', message: 'Metrics detected in experience bullets.', section: 'experience' });
  }
  if (input.longBulletCount > 0) {
    items.push({ level: 'warn', title: 'Bullet Length', message: 'Trim long bullets to 8-22 words for readability.', section: 'experience' });
  } else {
    items.push({ level: 'good', title: 'Bullet Length', message: 'Bullet length is ATS-friendly.', section: 'experience' });
  }

  if (input.roleLevel === 'FRESHER') {
    items.push({ level: 'warn', title: 'Entry Tip', message: 'Projects and coursework can strengthen early-career resumes.', section: 'projects' });
  }
  if (input.roleLevel === 'SENIOR') {
    items.push({ level: 'warn', title: 'Leadership Tip', message: 'Highlight scope, team size, and cross-functional impact.', section: 'experience' });
  }

  const errorCount = items.filter((i) => i.level === 'error').length;
  const warnCount = items.filter((i) => i.level === 'warn').length;
  const status = errorCount ? 'risk' : warnCount ? 'improve' : 'good';
  const statusLabel = errorCount ? 'Needs Attention' : warnCount ? 'Room to Improve' : 'Strong ATS Fit';
  return { items, status, statusLabel };
}
