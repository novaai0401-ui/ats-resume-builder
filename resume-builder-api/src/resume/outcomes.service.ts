import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeOutcomeReport, type OutcomeReport } from './outcome-stats';

@Injectable()
export class OutcomesService {
  constructor(private readonly prisma: PrismaService) {}

  async forResume(userId: string, resumeId: string): Promise<OutcomeReport> {
    const resume = await this.prisma.resume.findUnique({ where: { id: resumeId }, select: { id: true, userId: true } });
    if (!resume) throw new NotFoundException('Resume not found');
    if (resume.userId !== userId) throw new ForbiddenException('Not your resume');

    const [versions, applications] = await Promise.all([
      this.prisma.resumeVersion.findMany({
        where: { resumeId, userId },
        select: { id: true, label: true, createdAt: true, atsScoreSnapshot: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.jobApplication.findMany({
        where: { userId, resumeId },
        select: { resumeVersionId: true, status: true, createdAt: true },
      }),
    ]);

    return computeOutcomeReport(
      versions.map((v) => ({ id: v.id, label: v.label, createdAt: v.createdAt, atsScore: v.atsScoreSnapshot })),
      applications,
    );
  }
}
