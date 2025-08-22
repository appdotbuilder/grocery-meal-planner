import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, inventoryItemsTable, mealPlansTable } from '../db/schema';
import { type GenerateMealPlanInput } from '../schema';
import { generateMealPlan } from '../handlers/generate_meal_plan';
import { eq } from 'drizzle-orm';

describe('generateMealPlan', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create a test user
  async function createTestUser(autoSendSlack = false, slackChannel: string | null = null) {
    const result = await db.insert(usersTable)
      .values({
        household_id: 'test-household-123',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: slackChannel,
        auto_send_slack: autoSendSlack
      })
      .returning()
      .execute();
    return result[0];
  }

  // Helper function to create test inventory items
  async function createTestInventoryItems(userId: number) {
    await db.insert(inventoryItemsTable)
      .values([
        {
          user_id: userId,
          name: 'Chicken Breast',
          quantity: 2,
          unit: 'pieces',
          expiry_date: '2024-12-30',
          is_expiring_soon: false
        },
        {
          user_id: userId,
          name: 'Lettuce',
          quantity: 1,
          unit: 'head',
          expiry_date: '2024-12-25',
          is_expiring_soon: true
        }
      ])
      .execute();
  }

  it('should generate a meal plan for valid user', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    const result = await generateMealPlan(input);

    // Verify basic properties
    expect(result.id).toBeDefined();
    expect(result.user_id).toEqual(user.id);
    expect(result.week_start_date).toBeInstanceOf(Date);
    expect(result.plan_data).toBeDefined();
    expect(result.shopping_gaps).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);

    // Verify plan_data is valid JSON
    const planData = JSON.parse(result.plan_data);
    expect(planData.week_start_date).toBeDefined();
    expect(planData.daily_meals).toBeArray();

    // Verify shopping_gaps is valid JSON
    const shoppingGaps = JSON.parse(result.shopping_gaps);
    expect(shoppingGaps).toBeArray();
  });

  it('should save meal plan to database', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    const result = await generateMealPlan(input);

    // Query database to verify the meal plan was saved
    const mealPlans = await db.select()
      .from(mealPlansTable)
      .where(eq(mealPlansTable.id, result.id))
      .execute();

    expect(mealPlans).toHaveLength(1);
    const savedMealPlan = mealPlans[0];
    expect(savedMealPlan.user_id).toEqual(user.id);
    expect(savedMealPlan.plan_data).toBeDefined();
    expect(savedMealPlan.shopping_gaps).toBeDefined();
  });

  it('should use provided week_start_date when given', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    const specificDate = '2024-12-23'; // A Monday
    const input: GenerateMealPlanInput = {
      user_id: user.id,
      week_start_date: specificDate
    };

    const result = await generateMealPlan(input);

    // Verify the week start date matches what was provided (should be Monday of that week)
    const expectedDate = new Date('2024-12-23');
    expect(result.week_start_date.toDateString()).toEqual(expectedDate.toDateString());
  });

  it('should calculate week_start_date as Monday when not provided', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    const result = await generateMealPlan(input);

    // Verify the week start date is a Monday
    expect(result.week_start_date.getDay()).toEqual(1); // Monday is day 1
  });

  it('should handle user with auto_send_slack enabled', async () => {
    const user = await createTestUser(true, '#general');
    await createTestInventoryItems(user.id);

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    // This should not throw an error even with auto_send_slack enabled
    const result = await generateMealPlan(input);
    expect(result.id).toBeDefined();
  });

  it('should handle user without slack configuration', async () => {
    const user = await createTestUser(false, null);
    await createTestInventoryItems(user.id);

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    const result = await generateMealPlan(input);
    expect(result.id).toBeDefined();
  });

  it('should handle user with no inventory items', async () => {
    const user = await createTestUser();
    // Not creating any inventory items

    const input: GenerateMealPlanInput = {
      user_id: user.id
    };

    const result = await generateMealPlan(input);
    expect(result.id).toBeDefined();
    expect(result.plan_data).toBeDefined();
    expect(result.shopping_gaps).toBeDefined();
  });

  it('should throw error for non-existent user', async () => {
    const input: GenerateMealPlanInput = {
      user_id: 99999 // Non-existent user ID
    };

    await expect(generateMealPlan(input)).rejects.toThrow(/User with id 99999 not found/i);
  });

  it('should create multiple meal plans for same user', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    const input1: GenerateMealPlanInput = {
      user_id: user.id,
      week_start_date: '2024-12-23'
    };

    const input2: GenerateMealPlanInput = {
      user_id: user.id,
      week_start_date: '2024-12-30'
    };

    const result1 = await generateMealPlan(input1);
    const result2 = await generateMealPlan(input2);

    expect(result1.id).not.toEqual(result2.id);
    expect(result1.user_id).toEqual(result2.user_id);
    expect(result1.week_start_date.toDateString()).not.toEqual(result2.week_start_date.toDateString());

    // Verify both are saved in database
    const mealPlans = await db.select()
      .from(mealPlansTable)
      .where(eq(mealPlansTable.user_id, user.id))
      .execute();

    expect(mealPlans).toHaveLength(2);
  });

  it('should handle weekend date and adjust to Monday', async () => {
    const user = await createTestUser();
    await createTestInventoryItems(user.id);

    // December 21, 2024 is actually a Saturday
    // We want to get the Monday of that week, which would be December 16, 2024
    // But the test comment suggests we want the NEXT Monday after the weekend
    const input: GenerateMealPlanInput = {
      user_id: user.id,
      week_start_date: '2024-12-21' // Saturday
    };

    const result = await generateMealPlan(input);

    // December 21, 2024 is Saturday, so Monday of that week is December 16, 2024
    const expectedMonday = new Date('2024-12-16');
    expect(result.week_start_date.toDateString()).toEqual(expectedMonday.toDateString());
    expect(result.week_start_date.getDay()).toEqual(1); // Monday
  });
});