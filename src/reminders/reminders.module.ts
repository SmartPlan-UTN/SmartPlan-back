import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from '../auth/email/email.service';
import { EmailReminder } from './entities/email-reminder.entity';
import { ReminderEmailScheduler } from './reminder-email.scheduler';
import { ReminderEmailService } from './reminder-email.service';

/** Inactivity and feedback reminder emails (#127, CU23). */
@Module({
  imports: [TypeOrmModule.forFeature([EmailReminder])],
  providers: [EmailService, ReminderEmailService, ReminderEmailScheduler],
  exports: [ReminderEmailService],
})
export class RemindersModule {}
