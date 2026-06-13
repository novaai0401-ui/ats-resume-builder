import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { ApiKeysService, type CreateApiKeyInput } from './api-keys.service';

/**
 * Admin-only management for R-041 tenant API keys. Lives under
 * /admin so the public surface (/v1) stays purely metered.
 */
@Controller('admin/api-keys')
@UseGuards(JwtAuthGuard, AdminAuthGuard)
export class ApiKeysAdminController {
  constructor(private readonly keys: ApiKeysService) {}

  @Post()
  async create(@Body() body: CreateApiKeyInput) {
    if (!body?.label || !body?.tenantSlug) {
      throw new BadRequestException('label and tenantSlug are required.');
    }
    return this.keys.createKey(body);
  }

  @Get()
  list(@Query('tenant') tenant?: string) {
    return this.keys.list(tenant);
  }

  @Get(':id/usage')
  usage(@Param('id') id: string) {
    return this.keys.monthlyUsage(id);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.keys.revoke(id);
  }
}
