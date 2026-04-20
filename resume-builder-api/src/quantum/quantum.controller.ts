import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import type { IndustryId, QuantumInput } from 'resume-builder-shared';
import { QuantumService } from './quantum.service';

/**
 * Public-read / authenticated-write surface for the Quantum Career Navigator.
 *
 * Design note: the `GET /quantum/industries` endpoint is intentionally public
 * so the landing page (and a logged-out user filling out the "what industry
 * are you in?" picker) can render without a token. The recommendation
 * endpoint uses POST and validates strictly — no server-side persistence
 * yet, so no auth guard is required to call it. When we wire quota tracking
 * to the subscription tiers we'll add JwtAuthGuard here.
 */
@Controller('quantum')
export class QuantumController {
  constructor(private readonly quantum: QuantumService) {}

  @Get('industries')
  listIndustries() {
    return { items: this.quantum.listIndustries() };
  }

  @Post('recommend')
  recommend(@Body() body: unknown) {
    const input = validate(body);
    try {
      return this.quantum.recommend(input);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid request');
    }
  }
}

function validate(body: unknown): QuantumInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body is required');
  }
  const b = body as Record<string, unknown>;
  const industryId = b.industryId;
  const roleId = b.roleId;
  const currentSkills = b.currentSkills;
  if (typeof industryId !== 'string' || industryId.length === 0) {
    throw new BadRequestException('industryId is required');
  }
  if (typeof roleId !== 'string' || roleId.length === 0) {
    throw new BadRequestException('roleId is required');
  }
  if (!Array.isArray(currentSkills) || !currentSkills.every((s) => typeof s === 'string')) {
    throw new BadRequestException('currentSkills must be an array of strings');
  }
  if (currentSkills.length > 200) {
    throw new BadRequestException('currentSkills is too large (max 200)');
  }
  const input: QuantumInput = {
    industryId: industryId as IndustryId,
    roleId,
    currentSkills,
  };
  if (typeof b.targetIndustryId === 'string' && b.targetIndustryId.length > 0) {
    input.targetIndustryId = b.targetIndustryId as IndustryId;
  }
  if (typeof b.targetRoleId === 'string' && b.targetRoleId.length > 0) {
    input.targetRoleId = b.targetRoleId;
  }
  if (typeof b.limit === 'number' && Number.isFinite(b.limit)) {
    input.limit = b.limit;
  }
  return input;
}
