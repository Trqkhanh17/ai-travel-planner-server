import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type FilterQuery, Types } from 'mongoose';
import { BaseRepository } from '@/common/repositories/base.repository';
import { TripPlan, type TripPlanDocument } from './schemas/trip-plan.schema';

@Injectable()
export class TripPlanRepository extends BaseRepository<TripPlan> {
  constructor(@InjectModel(TripPlan.name) model: Model<TripPlan>) {
    super(model);
  }

  async findPage(filter: FilterQuery<TripPlan>, page: number, limit: number) {
    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .select('-userId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findByIdWithGuestToken(id: string): Promise<TripPlanDocument | null> {
    return this.model.findById(id).select('+guestTokenHash').exec();
  }

  findGuestPlanWithToken(id: string): Promise<TripPlanDocument | null> {
    return this.model
      .findOne({ _id: id, userId: null })
      .select('+guestTokenHash')
      .exec();
  }

  claimGuestPlan(id: string, userId: string, guestTokenHash: string) {
    return this.findOneAndUpdate(
      { _id: id, userId: null, guestTokenHash },
      {
        $set: { userId: new Types.ObjectId(userId), expiresAt: null },
        $unset: { guestTokenHash: '' },
      },
    );
  }

  deleteById(id: string): Promise<TripPlanDocument | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  save(plan: TripPlanDocument): Promise<TripPlanDocument> {
    return plan.save();
  }
}
