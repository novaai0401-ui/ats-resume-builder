import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ResumeService } from '../resume/resume.service';
import { buildAutofillProfile } from './autofill.util';

/**
 * R-093 — the browser extension calls this to autofill ATS application
 * forms. Returns a flat profile derived from the user's MOST RECENTLY
 * UPDATED resume (ResumeService.list orders updatedAt desc), so "the
 * resume I'm actively working on" is what fills the form.
 */
@Controller('me')
@UseGuards(JwtAuthGuard)
export class AutofillController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get('autofill-profile')
  async autofillProfile(@Req() req: { user: { userId: string } }) {
    const resumes = await this.resumeService.list(req.user.userId);
    if (!resumes.length) {
      throw new NotFoundException('No resume yet — create one to enable autofill.');
    }
    return buildAutofillProfile(resumes[0] as unknown as Record<string, unknown>);
  }
}
