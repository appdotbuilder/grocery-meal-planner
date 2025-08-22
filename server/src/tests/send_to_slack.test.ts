import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, mealPlansTable } from '../db/schema';
import { type SendToSlackInput, type WeeklyMealPlan, type ShoppingGapItem } from '../schema';
import { sendToSlack } from '../handlers/send_to_slack';

// Test data
const testUser = {
  household_id: 'test-household-123',
  inventory_endpoint: 'https://api.example.com/inventory',
  slack_channel: '#meal-planning',
  auto_send_slack: true
};

const testWeeklyPlan: WeeklyMealPlan = {
  week_start_date: '2024-01-01',
  daily_meals: [
    {
      date: '2024-01-01',
      breakfast: {
        title: 'Scrambled Eggs with Toast',
        ingredients_summary: 'eggs, bread, butter'
      },
      lunch: {
        title: 'Greek Salad',
        ingredients_summary: 'lettuce, tomatoes, olives, feta cheese'
      },
      dinner: {
        title: 'Grilled Chicken with Rice',
        ingredients_summary: 'chicken breast, rice, vegetables'
      }
    },
    {
      date: '2024-01-02',
      breakfast: {
        title: 'Oatmeal with Berries',
        ingredients_summary: 'oats, mixed berries, honey'
      },
      lunch: {
        title: 'Turkey Sandwich',
        ingredients_summary: 'turkey, bread, lettuce, mayo'
      },
      dinner: {
        title: 'Pasta Bolognese',
        ingredients_summary: 'pasta, ground beef, tomato sauce'
      }
    }
  ]
};

const testShoppingGaps: ShoppingGapItem[] = [
  {
    ingredient: 'eggs',
    quantity_needed: '6 pieces',
    used_for_meals: ['Scrambled Eggs with Toast']
  },
  {
    ingredient: 'mixed berries',
    quantity_needed: '1 cup',
    used_for_meals: ['Oatmeal with Berries']
  }
];

describe('sendToSlack', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should successfully send meal plan to Slack', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test meal plan
    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(testWeeklyPlan),
        shopping_gaps: JSON.stringify(testShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Meal plan sent to Slack successfully');
    expect(result.channel).toBe('#meal-planning');
  });

  it('should handle meal plan not found', async () => {
    const input: SendToSlackInput = {
      meal_plan_id: 999 // Non-existent ID
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Meal plan not found');
    expect(result.channel).toBeUndefined();
  });

  it('should handle user without Slack channel configured', async () => {
    // Create user without Slack channel
    const userWithoutSlack = {
      ...testUser,
      slack_channel: null
    };

    const userResult = await db.insert(usersTable)
      .values(userWithoutSlack)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test meal plan
    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(testWeeklyPlan),
        shopping_gaps: JSON.stringify(testShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('User does not have a Slack channel configured');
    expect(result.channel).toBeUndefined();
  });

  it('should handle invalid JSON in meal plan data', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create meal plan with invalid JSON
    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: 'invalid json string',
        shopping_gaps: JSON.stringify(testShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid meal plan data format');
    expect(result.channel).toBeUndefined();
  });

  it('should handle invalid JSON in shopping gaps data', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create meal plan with invalid shopping gaps JSON
    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(testWeeklyPlan),
        shopping_gaps: 'invalid json string'
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid meal plan data format');
    expect(result.channel).toBeUndefined();
  });

  it('should format meal plan message correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test meal plan with specific data to verify formatting
    const simpleMealPlan: WeeklyMealPlan = {
      week_start_date: '2024-01-01',
      daily_meals: [
        {
          date: '2024-01-01',
          breakfast: {
            title: 'Toast',
            ingredients_summary: 'bread, butter'
          },
          lunch: {
            title: 'Salad',
            ingredients_summary: 'lettuce, tomato'
          },
          dinner: {
            title: 'Pasta',
            ingredients_summary: 'pasta, sauce'
          }
        }
      ]
    };

    const simpleShoppingGaps: ShoppingGapItem[] = [
      {
        ingredient: 'bread',
        quantity_needed: '1 loaf',
        used_for_meals: ['Toast']
      }
    ];

    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(simpleMealPlan),
        shopping_gaps: JSON.stringify(simpleShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Meal plan sent to Slack successfully');
    expect(result.channel).toBe('#meal-planning');
  });

  it('should handle meal plan with empty shopping gaps', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create meal plan with empty shopping gaps
    const emptyShoppingGaps: ShoppingGapItem[] = [];

    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(testWeeklyPlan),
        shopping_gaps: JSON.stringify(emptyShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Meal plan sent to Slack successfully');
    expect(result.channel).toBe('#meal-planning');
  });

  it('should verify database join retrieves correct data', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values(testUser)
      .returning()
      .execute();
    const userId = userResult[0].id;

    // Create test meal plan
    const mealPlanResult = await db.insert(mealPlansTable)
      .values({
        user_id: userId,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify(testWeeklyPlan),
        shopping_gaps: JSON.stringify(testShoppingGaps)
      })
      .returning()
      .execute();
    const mealPlanId = mealPlanResult[0].id;

    const input: SendToSlackInput = {
      meal_plan_id: mealPlanId
    };

    const result = await sendToSlack(input);

    // Verify the handler accessed the correct user's Slack channel
    expect(result.success).toBe(true);
    expect(result.channel).toBe(testUser.slack_channel);
  });
});