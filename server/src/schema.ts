import { z } from 'zod';

// User schema for managing user connections and settings
export const userSchema = z.object({
  id: z.number(),
  household_id: z.string(),
  inventory_endpoint: z.string().url(),
  slack_channel: z.string().nullable(),
  auto_send_slack: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// Inventory item schema
export const inventoryItemSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiry_date: z.coerce.date().nullable(),
  is_expiring_soon: z.boolean(), // Computed field for items expiring within 3 days
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type InventoryItem = z.infer<typeof inventoryItemSchema>;

// Meal plan schema
export const mealPlanSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  week_start_date: z.coerce.date(),
  plan_data: z.string(), // JSON string containing the meal plan structure
  shopping_gaps: z.string(), // JSON string containing missing ingredients
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type MealPlan = z.infer<typeof mealPlanSchema>;

// Daily meal structure for the meal plan
export const dailyMealSchema = z.object({
  date: z.string(), // Date in YYYY-MM-DD format
  breakfast: z.object({
    title: z.string(),
    ingredients_summary: z.string()
  }),
  lunch: z.object({
    title: z.string(),
    ingredients_summary: z.string()
  }),
  dinner: z.object({
    title: z.string(),
    ingredients_summary: z.string()
  })
});

export type DailyMeal = z.infer<typeof dailyMealSchema>;

// Weekly meal plan structure
export const weeklyMealPlanSchema = z.object({
  week_start_date: z.string(), // Date in YYYY-MM-DD format
  daily_meals: z.array(dailyMealSchema)
});

export type WeeklyMealPlan = z.infer<typeof weeklyMealPlanSchema>;

// Shopping gap item schema
export const shoppingGapItemSchema = z.object({
  ingredient: z.string(),
  quantity_needed: z.string(),
  used_for_meals: z.array(z.string())
});

export type ShoppingGapItem = z.infer<typeof shoppingGapItemSchema>;

// Input schemas for API operations

// User connection input
export const connectUserInputSchema = z.object({
  household_id: z.string().min(1),
  inventory_endpoint: z.string().url(),
  slack_channel: z.string().nullable().optional(),
  auto_send_slack: z.boolean().optional().default(false)
});

export type ConnectUserInput = z.infer<typeof connectUserInputSchema>;

// Update user settings input
export const updateUserSettingsInputSchema = z.object({
  id: z.number(),
  slack_channel: z.string().nullable().optional(),
  auto_send_slack: z.boolean().optional()
});

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsInputSchema>;

// Refresh inventory input
export const refreshInventoryInputSchema = z.object({
  user_id: z.number()
});

export type RefreshInventoryInput = z.infer<typeof refreshInventoryInputSchema>;

// Generate meal plan input
export const generateMealPlanInputSchema = z.object({
  user_id: z.number(),
  week_start_date: z.string().optional() // If not provided, use current week
});

export type GenerateMealPlanInput = z.infer<typeof generateMealPlanInputSchema>;

// Send to Slack input
export const sendToSlackInputSchema = z.object({
  meal_plan_id: z.number()
});

export type SendToSlackInput = z.infer<typeof sendToSlackInputSchema>;

// External API response schemas for webhook integrations

// Lakebase inventory API response
export const lakebaseInventoryItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string(),
  expiry_date: z.string().nullable() // ISO date string or null
});

export type LakebaseInventoryItem = z.infer<typeof lakebaseInventoryItemSchema>;

export const lakebaseInventoryResponseSchema = z.object({
  items: z.array(lakebaseInventoryItemSchema),
  status: z.string()
});

export type LakebaseInventoryResponse = z.infer<typeof lakebaseInventoryResponseSchema>;

// Meal plan generation API response
export const mealPlanGenerationResponseSchema = z.object({
  meal_plan: weeklyMealPlanSchema,
  shopping_gaps: z.array(shoppingGapItemSchema),
  status: z.string()
});

export type MealPlanGenerationResponse = z.infer<typeof mealPlanGenerationResponseSchema>;

// Slack API response
export const slackResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  channel: z.string().optional()
});

export type SlackResponse = z.infer<typeof slackResponseSchema>;