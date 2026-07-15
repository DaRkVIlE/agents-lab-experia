import mongoose, { Schema, Document } from 'mongoose';

export interface IManagerProfile extends Document {
  manager_id: string;
  username: string;
  business_name: string;
  first_access: boolean;
  onboarding_completed: boolean;
  onboarding_step: number;
  onboarding_responses: Record<string, any>;
  config: {
    tone: string | null;
    services: string[];
    hours: any;
    reservation_rules: string | null;
    examples: any[];
    bot_status: string;
  };
  stats: any;
  created_at: Date;
  updated_at: Date;
}

const ManagerProfileSchema: Schema = new Schema({
  manager_id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  business_name: { type: String, default: '' },
  first_access: { type: Boolean, default: true },
  onboarding_completed: { type: Boolean, default: false },
  onboarding_step: { type: Number, default: 0 },
  onboarding_responses: { type: Object, default: {} },
  config: {
    tone: { type: String, default: null },
    services: { type: [String], default: [] },
    hours: { type: Schema.Types.Mixed, default: null },
    reservation_rules: { type: String, default: null },
    examples: { type: [Schema.Types.Mixed], default: [] },
    bot_status: { type: String, default: 'inactive' }
  },
  stats: { type: Schema.Types.Mixed, default: {} },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

export const ManagerProfile = mongoose.model<IManagerProfile>('ManagerProfile', ManagerProfileSchema, 'manager_profiles');

export interface IBotConfig extends Document {
  manager_id: string;
  version: number;
  config: any;
  status: string;
  created_at: Date;
}

const BotConfigSchema: Schema = new Schema({
  manager_id: { type: String, required: true },
  version: { type: Number, default: 1 },
  config: { type: Schema.Types.Mixed, required: true },
  status: { type: String, default: 'active' },
  created_at: { type: Date, default: Date.now }
});

export const BotConfig = mongoose.model<IBotConfig>('BotConfig', BotConfigSchema, 'bot_configurations');
