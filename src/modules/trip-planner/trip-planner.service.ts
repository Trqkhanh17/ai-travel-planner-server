import { TripPlanRepository } from './trip-plan.repository';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import {
  comparePassword,
  hashPassword,
} from '@/common/helpers/password.helpers';
import type { TripPlanDocument } from './schemas/trip-plan.schema';
import { CreateTripPlanDto } from './dto/create-trip-plan.dto';
import { GeminiAiService } from './services/gemini-ai.service';
import {
  AiQuotaService,
  type AiQuotaStatus,
} from './services/ai-quota.service';

export interface GeneratedPlan {
  plan: TripPlanDocument;
  guestManageToken?: string;
}

@Injectable()
export class TripPlannerService {
  constructor(
    private readonly tripPlanRepository: TripPlanRepository,
    private readonly geminiAiService: GeminiAiService,
    private readonly aiQuotaService: AiQuotaService,
    private readonly configService: ConfigService,
  ) {}

  async generatePlan(
    dto: CreateTripPlanDto,
    userId?: string,
    requestIp = 'unknown',
  ): Promise<GeneratedPlan> {
    await this.aiQuotaService.consume(userId, requestIp);
    const aiResult = await this.geminiAiService.generateTripPlan(dto);

    if (userId && !Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ.');
    }

    const guestManageToken = userId
      ? undefined
      : randomBytes(32).toString('base64url');
    const expiresAt = userId
      ? null
      : new Date(
          Date.now() +
            Number(
              this.configService.get<string>('GUEST_PLAN_TTL_HOURS') ?? 72,
            ) *
              60 *
              60 *
              1000,
        );
    const newTripPlan = await this.tripPlanRepository.create({
      userId: userId ? new Types.ObjectId(userId) : null,
      guestTokenHash: guestManageToken
        ? await hashPassword(guestManageToken)
        : undefined,
      expiresAt,
      inputCriteria: dto,
      destination: aiResult.destination,
      budgetBreakdown: aiResult.budgetBreakdown,
      itinerary: aiResult.itinerary,
      recommendedSpots: aiResult.recommendedSpots,
      travelTips: aiResult.travelTips,
      // Guest plans are unlisted and can only be accessed with their manage token.
      isPublic: false,
    });

    return { plan: newTripPlan, guestManageToken };
  }

  async getUserPlans(userId: string, page = 1, limit = 10) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('User ID không hợp lệ.');
    }
    const filter = { userId: new Types.ObjectId(userId) };
    return this.tripPlanRepository.findPage(filter, page, limit);
  }

  async getPublicPlans(page = 1, limit = 10) {
    const filter = {
      isPublic: true,
      userId: { $ne: null },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    return this.tripPlanRepository.findPage(filter, page, limit);
  }

  async getPlanById(
    id: string,
    userId?: string,
    guestToken?: string,
  ): Promise<TripPlanDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID kế hoạch không hợp lệ.');
    }

    const plan = await this.tripPlanRepository.findByIdWithGuestToken(id);
    if (!plan) {
      throw new NotFoundException('Không tìm thấy kế hoạch du lịch này.');
    }

    const isOwner = Boolean(
      plan.userId && userId && plan.userId.toString() === userId.toString(),
    );
    const isGuestOwner = Boolean(
      !plan.userId &&
        guestToken &&
        (await comparePassword(guestToken, plan.guestTokenHash)),
    );
    if (!plan.isPublic && !isOwner && !isGuestOwner) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập kế hoạch du lịch riêng tư này.',
      );
    }

    return plan;
  }

  async deletePlan(
    id: string,
    userId?: string,
    guestToken?: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID kế hoạch không hợp lệ.');
    }

    const plan = await this.tripPlanRepository.findByIdWithGuestToken(id);
    if (!plan) {
      throw new NotFoundException('Không tìm thấy kế hoạch du lịch để xóa.');
    }

    const isOwner = Boolean(
      plan.userId && userId && plan.userId.toString() === userId.toString(),
    );
    const isGuestOwner = Boolean(
      !plan.userId &&
        guestToken &&
        (await comparePassword(guestToken, plan.guestTokenHash)),
    );
    if (!isOwner && !isGuestOwner) {
      throw new ForbiddenException(
        'Bạn chỉ có thể xóa kế hoạch của chính mình.',
      );
    }

    await this.tripPlanRepository.deleteById(id);
    return { message: 'Đã xóa kế hoạch du lịch thành công.' };
  }

  async claimGuestPlan(
    id: string,
    userId: string,
    guestToken: string | undefined,
  ): Promise<TripPlanDocument> {
    if (!Types.ObjectId.isValid(id) || !guestToken) {
      throw new ForbiddenException('Guest manage token không hợp lệ.');
    }
    const plan = await this.tripPlanRepository.findGuestPlanWithToken(id);
    if (
      !plan?.guestTokenHash ||
      !(await comparePassword(guestToken, plan.guestTokenHash))
    ) {
      throw new ForbiddenException('Guest manage token không hợp lệ.');
    }
    const claimed = await this.tripPlanRepository.claimGuestPlan(
      id,
      userId,
      plan.guestTokenHash,
    );
    if (!claimed) {
      throw new ForbiddenException('Kế hoạch đã được nhận bởi tài khoản khác.');
    }
    return claimed;
  }

  getQuotaStatus(
    userId: string | undefined,
    requestIp: string,
  ): Promise<AiQuotaStatus> {
    return this.aiQuotaService.getStatus(userId, requestIp);
  }

  async toggleShare(id: string, userId: string): Promise<TripPlanDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('ID kế hoạch không hợp lệ.');
    }

    const plan = await this.tripPlanRepository.findById(id);
    if (!plan) {
      throw new NotFoundException('Không tìm thấy kế hoạch du lịch.');
    }
    if (!plan.userId || plan.userId.toString() !== userId.toString()) {
      throw new ForbiddenException(
        'Bạn chỉ có thể thay đổi trạng thái chia sẻ kế hoạch của chính mình.',
      );
    }

    plan.isPublic = !plan.isPublic;
    return this.tripPlanRepository.save(plan);
  }
}
