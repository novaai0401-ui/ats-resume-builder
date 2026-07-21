import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContactsService, type NetworkContactInput } from './contacts.service';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.contacts.list(req.user.userId);
  }

  @Get('upcoming')
  upcoming(@Req() req: { user: { userId: string } }, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 7;
    const horizon = Number.isFinite(parsed) && parsed > 0 && parsed <= 180 ? parsed : 7;
    return this.contacts.upcoming(req.user.userId, horizon);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() body: NetworkContactInput) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.contacts.create(req.user.userId, body);
  }

  @Patch(':id')
  update(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
    @Body() body: NetworkContactInput,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body is required');
    }
    return this.contacts.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(@Req() req: { user: { userId: string } }, @Param('id') id: string) {
    return this.contacts.remove(req.user.userId, id);
  }
}
