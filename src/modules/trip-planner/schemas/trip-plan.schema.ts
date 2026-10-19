import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';
import type {
  BudgetBreakdown,
  DestinationInfo,
  ItineraryDay,
  RecommendedSpots,
} from '../dto/trip-plan-response.dto';
import type { CreateTripPlanDto } from '../dto/create-trip-plan.dto';
import type { Types } from 'mongoose';

const schemaOptions = { _id: false, strict: 'throw' as const };

const TripInputCriteriaSchema = new MongooseSchema(
  {
    budget: { type: Number, required: true, min: 100_000 },
    budgetType: {
      type: String,
      enum: ['total', 'per_person'],
      default: 'total',
    },
    numberOfPeople: { type: Number, required: true, min: 1, max: 100 },
    originLocation: { type: String, required: true, maxlength: 100 },
    destinationPreference: { type: String, maxlength: 100 },
    tripStyles: { type: [String], default: [] },
    days: { type: Number, required: true, min: 1, max: 14 },
    nights: { type: Number, min: 0, max: 14 },
    transportationPreference: { type: String, maxlength: 100 },
    specialNotes: { type: String, maxlength: 1000 },
  },
  schemaOptions,
);

const DestinationSchema = new MongooseSchema(
  {
    name: { type: String, required: true },
    tagline: { type: String, required: true },
    reason: { type: String, required: true },
    bestSeason: String,
  },
  schemaOptions,
);

const BudgetBreakdownSchema = new MongooseSchema(
  {
    totalEstimated: { type: Number, required: true, min: 0 },
    costPerPerson: { type: Number, required: true, min: 0 },
    transportation: { type: Number, required: true, min: 0 },
    accommodation: { type: Number, required: true, min: 0 },
    foodAndDining: { type: Number, required: true, min: 0 },
    entertainmentAndTickets: { type: Number, required: true, min: 0 },
    contingency: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ['VNĐ', 'VND'] },
  },
  schemaOptions,
);

const DaySessionSchema = new MongooseSchema(
  {
    time: { type: String, required: true },
    activity: { type: String, required: true },
    places: { type: [String], required: true },
    estimatedCost: { type: Number, required: true, min: 0 },
    notes: String,
  },
  schemaOptions,
);

const ItineraryDaySchema = new MongooseSchema(
  {
    day: { type: Number, required: true, min: 1 },
    title: { type: String, required: true },
    morning: { type: DaySessionSchema, required: true },
    afternoon: { type: DaySessionSchema, required: true },
    evening: { type: DaySessionSchema, required: true },
  },
  schemaOptions,
);

const FoodSpotSchema = new MongooseSchema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    mustTry: { type: String, required: true },
    priceRange: { type: String, required: true },
    addressOrArea: { type: String, required: true },
  },
  schemaOptions,
);

const AttractionSpotSchema = new MongooseSchema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    highlight: { type: String, required: true },
    ticketPrice: String,
    bestTime: String,
  },
  schemaOptions,
);

const RecommendedSpotsSchema = new MongooseSchema(
  {
    foodAndDrink: { type: [FoodSpotSchema], required: true },
    attractions: { type: [AttractionSpotSchema], required: true },
  },
  schemaOptions,
);

export type TripPlanDocument = HydratedDocument<TripPlan>;

@Schema({ timestamps: true })
export class TripPlan {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  })
  userId?: Types.ObjectId | null;

  @Prop({ type: String, select: false })
  guestTokenHash?: string;

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: TripInputCriteriaSchema, required: true })
  inputCriteria: CreateTripPlanDto;

  @Prop({ type: DestinationSchema, required: true })
  destination: DestinationInfo;

  @Prop({ type: BudgetBreakdownSchema, required: true })
  budgetBreakdown: BudgetBreakdown;

  @Prop({ type: [ItineraryDaySchema], required: true })
  itinerary: ItineraryDay[];

  @Prop({ type: RecommendedSpotsSchema, required: true })
  recommendedSpots: RecommendedSpots;

  @Prop({ type: [String], default: [] })
  travelTips: string[];

  @Prop({ type: Boolean, default: false })
  isPublic: boolean;
}

export const TripPlanSchema = SchemaFactory.createForClass(TripPlan);
TripPlanSchema.index({ userId: 1, createdAt: -1 });
TripPlanSchema.index({ isPublic: 1, createdAt: -1 });
TripPlanSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
TripPlanSchema.set('toJSON', {
  transform: (_document, returnedObject) => {
    delete returnedObject.userId;
    delete returnedObject.guestTokenHash;
    return returnedObject;
  },
});
