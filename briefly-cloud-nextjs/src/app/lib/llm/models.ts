/**
 * LLM Model Configuration
 * 
 * Defines the model inventory and mapping for Briefly Cloud.
 * This is model-agnostic and can be updated when new models are released.
 */

export enum Model {
  GPT_5_2 = "gpt-5.2",
  GPT_5_1 = "gpt-5.1",
  GPT_5 = "gpt-5",
  GPT_5_MINI = "gpt-5-mini",
  GPT_5_NANO = "gpt-5-nano",
}

export interface ModelConfig {
  name: Model
  inputCostPer1M: number
  outputCostPer1M: number
  maxOutputTokens: number
  description: string
}

export const MODEL_CONFIGS: Record<Model, ModelConfig> = {
  [Model.GPT_5_2]: {
    name: Model.GPT_5_2,
    inputCostPer1M: 1.75,
    outputCostPer1M: 14.00,
    maxOutputTokens: 800,
    description: "Highest quality GPT-5 model for accuracy-critical tasks"
  },
  [Model.GPT_5_1]: {
    name: Model.GPT_5_1,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    maxOutputTokens: 1000,
    description: "Balanced GPT-5 model for general use"
  },
  [Model.GPT_5]: {
    name: Model.GPT_5,
    inputCostPer1M: 1.25,
    outputCostPer1M: 10.00,
    maxOutputTokens: 1000,
    description: "Standard GPT-5 model"
  },
  [Model.GPT_5_MINI]: {
    name: Model.GPT_5_MINI,
    inputCostPer1M: 0.25,
    outputCostPer1M: 2.00,
    maxOutputTokens: 600,
    description: "Cost-effective GPT-5 model for routine tasks"
  },
  [Model.GPT_5_NANO]: {
    name: Model.GPT_5_NANO,
    inputCostPer1M: 0.05,
    outputCostPer1M: 0.40,
    maxOutputTokens: 400,
    description: "Lightweight model for classification and routing (internal use only)"
  }
}

export type SubscriptionTier = 'free' | 'pro' | 'accuracy'

export const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  pro: 'Pro',
  accuracy: 'Accuracy / Enterprise'
}
