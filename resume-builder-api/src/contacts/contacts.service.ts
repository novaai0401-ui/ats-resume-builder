import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CONTACT_RELATIONSHIPS, type ContactRelationship, type NetworkContactInput } from 'resume-builder-shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * R-092 — networking / referral mini-CRM. Relationship values and the
 * input shape are the single source of truth in resume-builder-shared.
 */
export { CONTACT_RELATIONSHIPS };
export type { ContactRelationship, NetworkContactInput };

function coerceRelationship(raw: unknown): ContactRelationship {
  if (typeof raw !== 'string') return 'other';
  return (CONTACT_RELATIONSHIPS as readonly string[]).includes(raw)
    ? (raw as ContactRelationship)
    : 'other';
}

function coerceDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value instanceof Date) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function trimString(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.slice(0, max);
}

function sanitize(input: NetworkContactInput, { partial }: { partial: boolean }) {
  const data: Record<string, unknown> = {};

  const name = trimString(input.name, 120);
  if (name !== undefined) data.name = name;
  if (!partial && !name) throw new BadRequestException('name is required');

  if ('company' in input) data.company = trimString(input.company, 200);
  if ('title' in input) data.title = trimString(input.title, 200);
  if ('email' in input) data.email = trimString(input.email, 500);
  if ('linkedinUrl' in input) data.linkedinUrl = trimString(input.linkedinUrl, 500);
  if ('phone' in input) data.phone = trimString(input.phone, 100);
  if ('notes' in input) data.notes = trimString(input.notes, 2000);
  if ('relationship' in input) data.relationship = coerceRelationship(input.relationship);

  for (const key of ['lastContactedAt', 'nextFollowUpAt'] as const) {
    if (key in input) {
      const d = coerceDate(input[key]);
      if (d !== undefined) data[key] = d;
    }
  }

  if (!partial && data.relationship === undefined) data.relationship = 'other';

  return data;
}

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.networkContact.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /**
   * "Follow up with these people" — contacts whose nextFollowUpAt falls
   * within the next `days` (default 7), soonest first. Contacts with no
   * follow-up date are intentionally excluded.
   */
  async upcoming(userId: string, days = 7) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);
    return this.prisma.networkContact.findMany({
      where: {
        userId,
        nextFollowUpAt: { not: null, lte: horizon },
      },
      orderBy: { nextFollowUpAt: 'asc' },
      take: 50,
    });
  }

  /**
   * Keep the referral link honest: a contact may only point at a
   * JobApplication that the same user owns. Throws 400 otherwise.
   */
  private async assertJobOwned(userId: string, jobApplicationId: unknown) {
    if (jobApplicationId === undefined || jobApplicationId === null || jobApplicationId === '') {
      return;
    }
    const job = await this.prisma.jobApplication.findFirst({
      where: { id: String(jobApplicationId), userId },
    });
    if (!job) throw new BadRequestException('Linked job application not found');
  }

  async create(userId: string, input: NetworkContactInput) {
    const data = sanitize(input, { partial: false });
    if ('jobApplicationId' in input && input.jobApplicationId) {
      await this.assertJobOwned(userId, input.jobApplicationId);
      data.jobApplicationId = String(input.jobApplicationId);
    } else {
      data.jobApplicationId = null;
    }
    return this.prisma.networkContact.create({
      data: { ...data, userId } as never,
    });
  }

  async update(userId: string, id: string, input: NetworkContactInput) {
    const existing = await this.prisma.networkContact.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Contact not found');
    const data = sanitize(input, { partial: true });
    if ('jobApplicationId' in input) {
      const jid = input.jobApplicationId;
      if (jid) {
        await this.assertJobOwned(userId, jid);
        data.jobApplicationId = String(jid);
      } else {
        data.jobApplicationId = null;
      }
    }
    return this.prisma.networkContact.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.networkContact.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Contact not found');
    await this.prisma.networkContact.delete({ where: { id } });
    return { ok: true };
  }
}
