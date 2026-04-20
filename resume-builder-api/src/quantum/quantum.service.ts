import { Injectable } from '@nestjs/common';
import {
  INDUSTRIES,
  recommendNextSkills,
  type IndustryId,
  type QuantumInput,
  type QuantumResult,
} from 'resume-builder-shared';

/**
 * Thin wrapper around the pure quantum engine. Kept as a service so we can
 * later bolt on persistence (quota tracking, history) without touching the
 * controller or the pure function.
 */
@Injectable()
export class QuantumService {
  listIndustries() {
    return INDUSTRIES.map((i) => ({
      id: i.id,
      label: i.label,
      tagline: i.tagline,
      roles: i.roles.map((r) => ({ id: r.id, title: r.title, seniority: r.seniority })),
    }));
  }

  recommend(input: QuantumInput): QuantumResult {
    return recommendNextSkills(input);
  }

  listSupportedIndustryIds(): IndustryId[] {
    return INDUSTRIES.map((i) => i.id);
  }
}
