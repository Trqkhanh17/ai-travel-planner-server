import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { TripPlan, TripPlanSchema } from './schemas/trip-plan.schema';
import { TripPlannerController } from './trip-planner.controller';
import { TripPlannerService } from './trip-planner.service';
import { GeminiAiService } from './services/gemini-ai.service';
import { AiUsage, AiUsageSchema } from './schemas/ai-usage.schema';
import { AiQuotaService } from './services/ai-quota.service';
import { TripPlanRepository } from './trip-plan.repository';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: TripPlan.name, schema: TripPlanSchema },
      { name: AiUsage.name, schema: AiUsageSchema },
    ]),
  ],
  controllers: [TripPlannerController],
  providers: [
    TripPlannerService,
    GeminiAiService,
    AiQuotaService,
    TripPlanRepository,
  ],
  exports: [TripPlannerService, GeminiAiService],
})
export class TripPlannerModule {}
