import { Global, Module } from '@nestjs/common';
import { ResumeModule } from '../resume/resume.module';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController } from './public-api.controller';
import { PublicAtsCheckController } from './public-ats-check.controller';
import { PublicParseUploadController } from './public-parse-upload.controller';
import { ApiKeysAdminController } from './api-keys-admin.controller';

@Global()
@Module({
  imports: [ResumeModule],
  controllers: [PublicApiController, PublicAtsCheckController, PublicParseUploadController, ApiKeysAdminController],
  providers: [ApiKeysService, ApiKeyGuard],
  exports: [ApiKeysService],
})
export class PublicApiModule {}
