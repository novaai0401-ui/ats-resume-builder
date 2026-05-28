import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VaultService } from './vault.service';

interface AuthedReq { user: { userId: string } }

@Controller('vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly service: VaultService) {}

  /** Get the user's vault (public material). 404 when not set up. */
  @Get()
  async get(@Req() req: AuthedReq) {
    const vault = await this.service.get(req.user.userId);
    if (!vault) throw new NotFoundException('Vault not set up');
    return vault;
  }

  @Post('setup')
  @HttpCode(201)
  setup(@Req() req: AuthedReq, @Body() body: unknown) {
    return this.service.setup(req.user.userId, body);
  }

  @Patch('passphrase')
  rotatePassphrase(@Req() req: AuthedReq, @Body() body: unknown) {
    return this.service.rotatePassphrase(req.user.userId, body);
  }

  /**
   * Wipe the vault and ALL encrypted resumes. Mirrors Sahaayak's
   * right-to-be-forgotten endpoint. The client should also clear its
   * IndexedDB cache after a successful response.
   */
  @Delete()
  @HttpCode(204)
  async destroy(@Req() req: AuthedReq) {
    await this.service.destroy(req.user.userId);
  }
}
