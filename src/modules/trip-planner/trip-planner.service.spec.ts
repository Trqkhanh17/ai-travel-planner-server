import { ForbiddenException } from '@nestjs/common';
import type { TripPlanRepository } from './trip-plan.repository';
import { GeminiAiService } from './services/gemini-ai.service';
import type { TripPlanDocument } from './schemas/trip-plan.schema';
import { TripPlannerService } from './trip-planner.service';
import { BudgetType, type CreateTripPlanDto } from './dto/create-trip-plan.dto';
import type { GeneratedTripPlanResult } from './dto/trip-plan-response.dto';
import type { AiQuotaService } from './services/ai-quota.service';
import type { ConfigService } from '@nestjs/config';

describe('TripPlannerService', () => {
  const consumeQuota = jest.fn().mockResolvedValue(undefined);
  const quota = {
    consume: consumeQuota,
    getStatus: jest.fn(),
  } as unknown as AiQuotaService;
  const config = {
    get: jest.fn().mockReturnValue('72'),
  } as unknown as ConfigService;
  const dto: CreateTripPlanDto = {
    budget: 2_000_000,
    budgetType: BudgetType.TOTAL,
    numberOfPeople: 2,
    originLocation: 'TP.HCM',
    days: 1,
  };
  const aiResult: GeneratedTripPlanResult = {
    destination: { name: 'Vũng Tàu', tagline: 'Biển', reason: 'Gần' },
    budgetBreakdown: {
      totalEstimated: 1_800_000,
      costPerPerson: 900_000,
      transportation: 300_000,
      accommodation: 0,
      foodAndDining: 800_000,
      entertainmentAndTickets: 500_000,
      contingency: 200_000,
      currency: 'VNĐ',
    },
    itinerary: [],
    recommendedSpots: { foodAndDrink: [], attractions: [] },
    travelTips: [],
  };

  it('stores guest plans as temporary unlisted plans with a manage token', async () => {
    let storedData: unknown;
    const create = jest.fn((data: unknown) => {
      storedData = data;
      return Promise.resolve(data);
    });
    const model = { create } as unknown as TripPlanRepository;
    const ai = {
      generateTripPlan: jest.fn().mockResolvedValue(aiResult),
    } as unknown as GeminiAiService;
    const service = new TripPlannerService(model, ai, quota, config);

    const result = await service.generatePlan(dto, undefined, '127.0.0.1');

    expect(result.plan.isPublic).toBe(false);
    expect(typeof result.guestManageToken).toBe('string');
    const stored = storedData as {
      userId?: unknown;
      isPublic?: unknown;
      guestTokenHash?: unknown;
      expiresAt?: unknown;
    };
    expect(stored.userId).toBeNull();
    expect(stored.isPublic).toBe(false);
    expect(typeof stored.guestTokenHash).toBe('string');
    expect(stored.expiresAt).toBeInstanceOf(Date);
    expect(consumeQuota).toHaveBeenCalledWith(undefined, '127.0.0.1');
  });

  it('denies access to another user private plan', async () => {
    const plan = {
      isPublic: false,
      userId: { toString: () => 'owner-id' },
    } as TripPlanDocument;
    const model = {
      findByIdWithGuestToken: jest.fn().mockResolvedValue(plan),
    } as unknown as TripPlanRepository;
    const service = new TripPlannerService(
      model,
      {} as GeminiAiService,
      quota,
      config,
    );

    await expect(
      service.getPlanById('507f1f77bcf86cd799439011', 'another-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
