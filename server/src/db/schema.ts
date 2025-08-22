import { serial, text, pgTable, timestamp, integer, boolean, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  household_id: text('household_id').notNull(),
  inventory_endpoint: text('inventory_endpoint').notNull(),
  slack_channel: text('slack_channel'), // Nullable by default
  auto_send_slack: boolean('auto_send_slack').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const inventoryItemsTable = pgTable('inventory_items', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: integer('quantity').notNull(),
  unit: text('unit').notNull(),
  expiry_date: date('expiry_date'), // Nullable by default
  is_expiring_soon: boolean('is_expiring_soon').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

export const mealPlansTable = pgTable('meal_plans', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  week_start_date: date('week_start_date').notNull(),
  plan_data: text('plan_data').notNull(), // JSON string containing the meal plan structure
  shopping_gaps: text('shopping_gaps').notNull(), // JSON string containing missing ingredients
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Define relations between tables
export const usersRelations = relations(usersTable, ({ many }) => ({
  inventoryItems: many(inventoryItemsTable),
  mealPlans: many(mealPlansTable),
}));

export const inventoryItemsRelations = relations(inventoryItemsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [inventoryItemsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const mealPlansRelations = relations(mealPlansTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [mealPlansTable.user_id],
    references: [usersTable.id],
  }),
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type NewInventoryItem = typeof inventoryItemsTable.$inferInsert;

export type MealPlan = typeof mealPlansTable.$inferSelect;
export type NewMealPlan = typeof mealPlansTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  inventoryItems: inventoryItemsTable,
  mealPlans: mealPlansTable,
};

export const relations_exports = {
  usersRelations,
  inventoryItemsRelations,
  mealPlansRelations,
};