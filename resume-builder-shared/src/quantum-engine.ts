/**
 * Quantum-inspired career recommendation engine.
 *
 * This is classical code, not real quantum computing. We borrow a few ideas
 * from quantum mechanics because they map neatly onto "which skill should I
 * learn next given what I already know":
 *
 *  1. Superposition — a candidate skill sits in a weighted superposition of
 *     "already have it", "relevant to target role", and "bridges two of my
 *     clusters". We represent that as a complex-valued amplitude vector.
 *  2. Interference — amplitudes from different clusters combine. Two weak
 *     signals from related clusters (e.g. React + TypeScript) constructively
 *     reinforce; unrelated signals (Chef skills for a DevOps target)
 *     destructively cancel.
 *  3. Measurement / collapse — we square the amplitude magnitudes to get
 *     probabilities and pick the top N. This gives deterministic rankings
 *     for a given input, so the engine is easy to test.
 *
 * Everything here is pure: same input -> same output, no randomness, no IO.
 */

import type { Industry, IndustryRole, IndustryId } from './industry.js';
import { getIndustry, findRole, INDUSTRIES } from './industry.js';

export type QuantumInput = {
  industryId: IndustryId;
  roleId: string;
  currentSkills: string[];
  /** Optional: where the user wants to go. Defaults to same industry/role. */
  targetIndustryId?: IndustryId;
  targetRoleId?: string;
  /** How many recommendations to return. Clamped to [1, 20]. */
  limit?: number;
};

export type QuantumRecommendation = {
  skill: string;
  probability: number;
  reason: string;
  cluster?: string;
};

export type QuantumResult = {
  industry: string;
  role: string;
  targetIndustry?: string;
  targetRole?: string;
  recommendations: QuantumRecommendation[];
  /** Bridge industries the user is well-positioned to pivot into. */
  pivots: { industryId: IndustryId; label: string; alignment: number }[];
  /** 0..1 measure of how prepared the user is for the target role. */
  readiness: number;
};

type Amplitude = { re: number; im: number };

const zero: Amplitude = { re: 0, im: 0 };

function add(a: Amplitude, b: Amplitude): Amplitude {
  return { re: a.re + b.re, im: a.im + b.im };
}

function scale(a: Amplitude, k: number): Amplitude {
  return { re: a.re * k, im: a.im * k };
}

function magSq(a: Amplitude): number {
  return a.re * a.re + a.im * a.im;
}

function normalizeSkill(s: string): string {
  return s.trim().toLowerCase();
}

function hasSkill(set: Set<string>, skill: string): boolean {
  return set.has(normalizeSkill(skill));
}

/**
 * Deterministic "phase" for a skill within a cluster. We want related
 * skills to produce phases that interfere constructively; unrelated skills
 * destructively. A simple approach: hash the cluster name to a base phase
 * and offset by the skill's position in that cluster.
 */
function phaseFor(cluster: string, skill: string, position: number): number {
  let hash = 0;
  for (let i = 0; i < cluster.length; i++) {
    hash = (hash * 31 + cluster.charCodeAt(i)) | 0;
  }
  for (let i = 0; i < skill.length; i++) {
    hash = (hash * 17 + skill.charCodeAt(i)) | 0;
  }
  const base = (hash & 0xffff) / 0xffff;
  return (base + position * 0.03) * Math.PI * 2;
}

function polar(magnitude: number, phase: number): Amplitude {
  return { re: magnitude * Math.cos(phase), im: magnitude * Math.sin(phase) };
}

/**
 * Core engine. Ranks candidate skills for a target (industry, role) given
 * what the user already has.
 */
export function recommendNextSkills(input: QuantumInput): QuantumResult {
  const industry = getIndustry(input.industryId);
  if (!industry) {
    throw new Error(`Unknown industry: ${input.industryId}`);
  }
  const role = findRole(input.industryId, input.roleId);
  if (!role) {
    throw new Error(`Unknown role '${input.roleId}' in industry '${input.industryId}'`);
  }

  const targetIndustry =
    input.targetIndustryId && input.targetIndustryId !== input.industryId
      ? getIndustry(input.targetIndustryId)
      : industry;
  if (input.targetIndustryId && !targetIndustry) {
    throw new Error(`Unknown target industry: ${input.targetIndustryId}`);
  }
  const targetRole =
    input.targetRoleId
      ? findRole((targetIndustry ?? industry).id, input.targetRoleId)
      : role;
  if (input.targetRoleId && !targetRole) {
    throw new Error(`Unknown target role '${input.targetRoleId}'`);
  }

  const resolvedTargetIndustry = targetIndustry ?? industry;
  const resolvedTargetRole = targetRole ?? role;

  const have = new Set(input.currentSkills.map(normalizeSkill));

  // Build amplitude for every candidate skill in the target industry's
  // clusters. Skills the user already has get zeroed out at the end.
  const amplitudes = new Map<string, Amplitude>();
  const clusterHit = new Map<string, string>();

  // 1) base signal from target role's core skills
  for (let i = 0; i < resolvedTargetRole.coreSkills.length; i++) {
    const skill = resolvedTargetRole.coreSkills[i];
    const phase = phaseFor('__role__', skill, i);
    amplitudes.set(
      skill,
      add(amplitudes.get(skill) ?? zero, polar(1.0, phase))
    );
    clusterHit.set(skill, 'role');
  }

  // 2) signal from every cluster in the target industry, weighted by how
  //    many of the user's current skills are already in that cluster
  //    (a higher count means more "momentum" toward that cluster).
  for (const [clusterName, clusterSkills] of Object.entries(resolvedTargetIndustry.skillClusters)) {
    const userSkillsInCluster = clusterSkills.filter((s) => hasSkill(have, s)).length;
    const momentum = 0.35 + 0.15 * userSkillsInCluster; // 0.35 baseline, grows with alignment
    for (let i = 0; i < clusterSkills.length; i++) {
      const skill = clusterSkills[i];
      const phase = phaseFor(clusterName, skill, i);
      amplitudes.set(
        skill,
        add(amplitudes.get(skill) ?? zero, polar(momentum, phase))
      );
      if (!clusterHit.has(skill)) clusterHit.set(skill, clusterName);
    }
  }

  // 3) destructive interference: subtract a small anti-amplitude for every
  //    skill the user already has, so owned skills don't show up as
  //    recommendations but *adjacent* skills get a small constructive bump.
  for (const owned of input.currentSkills) {
    const ownedLower = normalizeSkill(owned);
    for (const [clusterName, clusterSkills] of Object.entries(resolvedTargetIndustry.skillClusters)) {
      const idx = clusterSkills.findIndex((s) => normalizeSkill(s) === ownedLower);
      if (idx === -1) continue;
      // boost neighbors in the same cluster
      for (let j = 0; j < clusterSkills.length; j++) {
        if (j === idx) continue;
        const neighbor = clusterSkills[j];
        const distance = Math.abs(j - idx);
        const boost = 0.2 / distance;
        const phase = phaseFor(clusterName, neighbor, j);
        amplitudes.set(
          neighbor,
          add(amplitudes.get(neighbor) ?? zero, polar(boost, phase))
        );
      }
    }
  }

  // 4) collapse: compute probabilities and filter out already-owned skills
  const ranked: QuantumRecommendation[] = [];
  let totalProb = 0;
  for (const [skill, amp] of amplitudes) {
    if (hasSkill(have, skill)) continue;
    const p = magSq(amp);
    totalProb += p;
    ranked.push({
      skill,
      probability: p,
      reason: buildReason(skill, resolvedTargetRole, clusterHit.get(skill)),
      cluster: clusterHit.get(skill),
    });
  }
  if (totalProb > 0) {
    for (const r of ranked) r.probability = r.probability / totalProb;
  }
  ranked.sort((a, b) => b.probability - a.probability || a.skill.localeCompare(b.skill));

  const limit = Math.min(Math.max(input.limit ?? 6, 1), 20);
  const recommendations = ranked.slice(0, limit);

  // 5) readiness: share of the target role's core skills the user already has
  const targetCore = resolvedTargetRole.coreSkills;
  const ownedCore = targetCore.filter((s) => hasSkill(have, s)).length;
  const readiness = targetCore.length === 0 ? 0 : ownedCore / targetCore.length;

  // 6) pivots: for every other industry, compute alignment = fraction of
  //    its clusters whose skills overlap with what the user has.
  const pivots = INDUSTRIES
    .filter((i) => i.id !== input.industryId)
    .map((i) => ({
      industryId: i.id,
      label: i.label,
      alignment: alignmentWithIndustry(have, i),
    }))
    .sort((a, b) => b.alignment - a.alignment)
    .slice(0, 3)
    .filter((p) => p.alignment > 0);

  return {
    industry: industry.label,
    role: role.title,
    targetIndustry:
      resolvedTargetIndustry.id !== industry.id ? resolvedTargetIndustry.label : undefined,
    targetRole:
      resolvedTargetRole.id !== role.id ? resolvedTargetRole.title : undefined,
    recommendations,
    pivots,
    readiness,
  };
}

function buildReason(
  skill: string,
  targetRole: IndustryRole,
  cluster: string | undefined
): string {
  if (targetRole.coreSkills.some((s) => normalizeSkill(s) === normalizeSkill(skill))) {
    return `Listed as a core skill for ${targetRole.title}.`;
  }
  if (cluster) {
    return `Reinforces your ${cluster} cluster — useful alongside what you already know.`;
  }
  return `Broadens the skill base for ${targetRole.title}.`;
}

function alignmentWithIndustry(have: Set<string>, industry: Industry): number {
  const allSkills: string[] = [];
  for (const skills of Object.values(industry.skillClusters)) {
    for (const s of skills) allSkills.push(s);
  }
  if (allSkills.length === 0) return 0;
  const matched = allSkills.filter((s) => hasSkill(have, s)).length;
  return matched / allSkills.length;
}
