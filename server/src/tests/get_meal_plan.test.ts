import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, mealPlansTable } from '../db/schema';
import { getMealPlan } from '../handlers/get_meal_plan';
import { eq } from 'drizzle-orm';

describe('getMealPlan', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return null when no meal plan exists', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://example.com/inventory',
        slack_channel: '#meal-planning',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    const result = await getMealPlan(userId, '2024-01-01');

    expect(result).toBeNull();
  });

  it('should return meal plan when it exists for specific week', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://example.com/inventory',
        slack_channel: '#meal-planning',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create a meal plan
    const mealPlanData = JSON.stringify({
      week_start_date: '2024-01-01',
      daily_meals: [
        {
          date: '2024-01-01',
          breakfast: { title: 'Oatmeal', ingredients_summary: 'Oats, milk, berries' },
          lunch: { title: 'Sandwich', ingredients_summary: 'Bread, turkey, lettuce' },
          dinner: { title: 'Pasta', ingredients_summary: 'Pasta, tomato sauce, cheese' }
        }
      ]
    });

    const shoppingGapsData = JSON.stringify([
      {
        ingredient: 'Milk',
        quantity_needed: '1 liter',
        used_for_meals: ['Breakfast']
      }
    ]);

    await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: mealPlanData,
        shopping_gaps: shoppingGapsData
      })
      .execute();

    const result = await getMealPlan(userId, '2024-01-01');

    expect(result).not.toBeNull();
    expect(result!.id).toBeDefined();
    expect(result!.user_id).toEqual(userId);
    expect(result!.week_start_date).toBeInstanceOf(Date);
    expect(result!.week_start_date).toEqual(new Date('2024-01-01'));
    expect(result!.plan_data).toEqual(mealPlanData);
    expect(result!.shopping_gaps).toEqual(shoppingGapsData);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should calculate current week Monday when no week_start_date provided', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://example.com/inventory',
        slack_channel: '#meal-planning',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Calculate current week's Monday
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysToMonday);
    const mondayString = monday.toISOString().split('T')[0];

    // Create a meal plan for current week
    const mealPlanData = JSON.stringify({
      week_start_date: mondayString,
      daily_meals: [
        {
          date: mondayString,
          breakfast: { title: 'Current Week Breakfast', ingredients_summary: 'Eggs, toast' },
          lunch: { title: 'Current Week Lunch', ingredients_summary: 'Salad, chicken' },
          dinner: { title: 'Current Week Dinner', ingredients_summary: 'Rice, vegetables' }
        }
      ]
    });

    await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: mondayString,
        plan_data: mealPlanData,
        shopping_gaps: '[]'
      })
      .execute();

    // Call without week_start_date parameter
    const result = await getMealPlan(userId);

    expect(result).not.toBeNull();
    expect(result!.user_id).toEqual(userId);
    expect(result!.week_start_date).toEqual(new Date(mondayString));
    expect(result!.plan_data).toEqual(mealPlanData);
  });

  it('should return null when meal plan exists for different user', async () => {
    // Create two users
    const user1Result = await db.insert(usersTable)
      .values({
        household_id: 'household-1',
        inventory_endpoint: 'https://example.com/inventory1',
        slack_channel: '#meal-planning-1',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const user2Result = await db.insert(usersTable)
      .values({
        household_id: 'household-2',
        inventory_endpoint: 'https://example.com/inventory2',
        slack_channel: '#meal-planning-2',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    // Create meal plan for user1
    await db.insert(mealPlansTable)
      .values({
        user_id: user1Id,
        week_start_date: '2024-01-01',
        plan_data: '{"test": "data"}',
        shopping_gaps: '[]'
      })
      .execute();

    // Try to get meal plan for user2 (should return null)
    const result = await getMealPlan(user2Id, '2024-01-01');

    expect(result).toBeNull();
  });

  it('should save meal plan to database correctly', async () => {
    // Create a user first
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://example.com/inventory',
        slack_channel: '#meal-planning',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const userId = userResult[0].id;

    // Create meal plan
    const testMealPlan = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-08',
        plan_data: '{"week": "test"}',
        shopping_gaps: '[{"ingredient": "test"}]'
      })
      .returning()
      .execute();

    const mealPlanId = testMealPlan[0].id;

    // Retrieve meal plan using handler
    const result = await getMealPlan(userId, '2024-01-08');

    // Verify database record directly
    const dbRecords = await db.select()
      .from(mealPlansTable)
      .where(eq(mealPlansTable.id, mealPlanId))
      .execute();

    expect(dbRecords).toHaveLength(1);
    expect(dbRecords[0].user_id).toEqual(userId);
    expect(dbRecords[0].week_start_date).toEqual('2024-01-08');
    expect(dbRecords[0].plan_data).toEqual('{"week": "test"}');
    expect(dbRecords[0].shopping_gaps).toEqual('[{"ingredient": "test"}]');

    // Verify handler result matches database
    expect(result).not.toBeNull();
    expect(result!.id).toEqual(mealPlanId);
    expect(result!.user_id).toEqual(userId);
  });
});