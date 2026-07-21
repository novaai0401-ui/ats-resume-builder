import { Module } from '@nestjs/common';
import { ResumeModule } from '../resume/resume.module';
import { AutofillController } from './autofill.controller';

@Module({
  imports: [ResumeModule],
  controllers: [AutofillController],
})
export class AutofillModule {}
