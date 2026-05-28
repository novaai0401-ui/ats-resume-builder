import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Encrypted-resume service — accepts and returns ONLY ciphertext blobs.
 * The server never sees plaintext under this path.
 *
 * Design choices:
 *  - This service runs in parallel with the existing plaintext resume
 *    service. Migration happens row-by-row as clients re-save resumes
 *    via the encrypted endpoint. We never bulk-translate on the server
 *    (we can't — we don't have the keys).
 *  - The schema keeps the legacy plaintext columns for now; this service
 *    nulls them out on encrypted writes so a row is unambiguously
 *    "encrypted" or "legacy plaintext", never both.
 *  - List view returns ciphertexts. The client decrypts.
 */

export interface EncryptedResumeWrite {
  /** Resume ID. For create, the client picks the ID (cuid-shaped string). */
  id: string;
  ciphertext: string;
  iv: string;
  titleCipher: string;
  titleIv: string;
}

const MAX_CIPHERTEXT_LEN = 256 * 1024; // 256 KB cap — real resumes are ~5-20 KB
const MAX_IV_LEN = 64;
const MAX_TITLE_CIPHER_LEN = 4096;

@Injectable()
export class EncryptedResumeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.resume.findMany({
      where: { userId, ciphertext: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        ciphertext: true,
        iv: true,
        titleCipher: true,
        titleIv: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  async get(userId: string, id: string) {
    const row = await this.prisma.resume.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        ciphertext: true,
        iv: true,
        titleCipher: true,
        titleIv: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row) throw new NotFoundException('Resume not found');
    if (row.userId !== userId) throw new ForbiddenException('Not your resume');
    if (!row.ciphertext) throw new NotFoundException('No encrypted payload for this resume');
    return row;
  }

  async upsert(userId: string, payload: unknown) {
    const write = this.validateWrite(payload);
    const existing = await this.prisma.resume.findUnique({
      where: { id: write.id },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Not your resume');
    }
    // Title column is required by the legacy schema (NOT NULL). Use a
    // stable placeholder so the row is operable for joins (JobApplication,
    // ResumeVersion) without leaking anything sensitive. The real title
    // lives in `titleCipher`.
    const placeholderTitle = '[encrypted]';
    if (existing) {
      return this.prisma.resume.update({
        where: { id: write.id },
        data: {
          ciphertext: write.ciphertext,
          iv: write.iv,
          titleCipher: write.titleCipher,
          titleIv: write.titleIv,
          // Null out legacy plaintext columns so the row is unambiguous.
          contact: Prisma.JsonNull,
          summary: '',
          skills: [],
          experience: Prisma.JsonNull,
          education: Prisma.JsonNull,
          projects: Prisma.JsonNull,
          certifications: Prisma.JsonNull,
          title: placeholderTitle,
        },
        select: { id: true, updatedAt: true },
      });
    }
    return this.prisma.resume.create({
      data: {
        id: write.id,
        userId,
        title: placeholderTitle,
        summary: '',
        skills: [],
        experience: [],
        education: [],
        ciphertext: write.ciphertext,
        iv: write.iv,
        titleCipher: write.titleCipher,
        titleIv: write.titleIv,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async destroy(userId: string, id: string) {
    const existing = await this.prisma.resume.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundException('Resume not found');
    if (existing.userId !== userId) throw new ForbiddenException('Not your resume');
    await this.prisma.resume.delete({ where: { id } });
  }

  private validateWrite(payload: unknown): EncryptedResumeWrite {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Body must be an object');
    }
    const p = payload as Record<string, unknown>;
    const id = String(p.id || '').trim();
    if (!id || id.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException('Invalid resume id');
    }
    return {
      id,
      ciphertext: assertString(p.ciphertext, 'ciphertext', MAX_CIPHERTEXT_LEN),
      iv: assertString(p.iv, 'iv', MAX_IV_LEN),
      titleCipher: assertString(p.titleCipher, 'titleCipher', MAX_TITLE_CIPHER_LEN),
      titleIv: assertString(p.titleIv, 'titleIv', MAX_IV_LEN),
    };
  }
}

function assertString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  if (value.length > max) {
    throw new BadRequestException(`${field} exceeds size limit`);
  }
  return value;
}
