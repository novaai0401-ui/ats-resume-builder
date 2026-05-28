import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EncryptedResumeService } from './encrypted-resume.service';

interface AuthedReq { user: { userId: string } }

/**
 * Encrypted resume endpoints. Server is opaque to the contents — it
 * stores and returns ciphertext blobs only. Lives at /encrypted-resumes
 * so the existing /resumes plaintext endpoints stay untouched during
 * the migration window.
 */
@Controller('encrypted-resumes')
@UseGuards(JwtAuthGuard)
export class EncryptedResumeController {
  constructor(private readonly service: EncryptedResumeService) {}

  @Get()
  list(@Req() req: AuthedReq) {
    return this.service.list(req.user.userId);
  }

  @Get(':id')
  get(@Req() req: AuthedReq, @Param('id') id: string) {
    return this.service.get(req.user.userId, id);
  }

  @Put(':id')
  upsert(@Req() req: AuthedReq, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    // Force the URL id into the payload so a path/body mismatch can't
    // create a different row than the client thinks it's updating.
    return this.service.upsert(req.user.userId, { ...(body || {}), id });
  }

  @Delete(':id')
  @HttpCode(204)
  async destroy(@Req() req: AuthedReq, @Param('id') id: string) {
    await this.service.destroy(req.user.userId, id);
  }
}
