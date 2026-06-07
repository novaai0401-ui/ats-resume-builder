import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PortfolioService, type CreatePortfolioInput } from './portfolio.service';

@Controller('portfolios')
@UseGuards(JwtAuthGuard)
export class PortfolioController {
  constructor(private readonly portfolios: PortfolioService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.portfolios.list(req.user.userId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: CreatePortfolioInput) {
    if (!body?.resumeId) throw new BadRequestException('resumeId is required');
    return this.portfolios.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: Partial<CreatePortfolioInput> & { refreshFromResume?: boolean },
  ) {
    return this.portfolios.update(req.user.userId, id, body || {});
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.portfolios.remove(req.user.userId, id);
  }
}

/** Public, unauthenticated recruiter view. No JwtAuthGuard by design. */
@Controller('public/portfolio')
export class PublicPortfolioController {
  constructor(private readonly portfolios: PortfolioService) {}

  @Get(':slug')
  async getPublic(@Param('slug') slug: string) {
    const p = await this.portfolios.getPublic(slug);
    if (!p) throw new NotFoundException('Portfolio not found');
    return p;
  }
}
