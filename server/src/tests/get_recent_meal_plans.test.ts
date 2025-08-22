import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, mealPlansTable } from '../db/schema';
import { getRecentMealPlans } from '../handlers/get_recent_meal_plans';

describe('getRecentMealPlans', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return recent meal plans for a user ordered by week_start_date descending', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: '#test-channel',
        auto_send_slack: true
      })
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create meal plans with different dates
    const mealPlan1 = {
      user_id: userId,
      week_start_date: '2024-01-01',
      plan_data: JSON.stringify({ week_start_date: '2024-01-01', daily_meals: [] }),
      shopping_gaps: JSON.stringify([])
    };

    const mealPlan2 = {
      user_id: userId,
      week_start_date: '2024-01-08',
      plan_data: JSON.stringify({ week_start_date: '2024-01-08', daily_meals: [] }),
      shopping_gaps: JSON.stringify([])
    };

    const mealPlan3 = {
      user_id: userId,
      week_start_date: '2024-01-15',
      plan_data: JSON.stringify({ week_start_date: '2024-01-15', daily_meals: [] }),
      shopping_gaps: JSON.stringify([])
    };

    // Insert meal plans in random order
    await db.insert(mealPlansTable).values([mealPlan2, mealPlan1, mealPlan3]).execute();

    const result = await getRecentMealPlans(userId);

    expect(result).toHaveLength(3);
    
    // Should be ordered by week_start_date descending (most recent first)
    expect(result[0].week_start_date).toEqual(new Date('2024-01-15'));
    expect(result[1].week_start_date).toEqual(new Date('2024-01-08'));
    expect(result[2].week_start_date).toEqual(new Date('2024-01-01'));

    // Verify all fields are present
    result.forEach(mealPlan => {
      expect(mealPlan.id).toBeDefined();
      expect(mealPlan.user_id).toEqual(userId);
      expect(mealPlan.week_start_date).toBeInstanceOf(Date);
      expect(mealPlan.plan_data).toBeDefined();
      expect(mealPlan.shopping_gaps).toBeDefined();
      expect(mealPlan.created_at).toBeInstanceOf(Date);
      expect(mealPlan.updated_at).toBeInstanceOf(Date);
    });
  });

  it('should respect the limit parameter', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create 5 meal plans
    const mealPlans = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + (i * 7)); // Weekly intervals
      
      mealPlans.push({
        user_id: userId,
        week_start_date: date.toISOString().split('T')[0],
        plan_data: JSON.stringify({ week_start_date: date.toISOString().split('T')[0], daily_meals: [] }),
        shopping_gaps: JSON.stringify([])
      });
    }

    await db.insert(mealPlansTable).values(mealPlans).execute();

    // Test with limit of 3
    const result = await getRecentMealPlans(userId, 3);

    expect(result).toHaveLength(3);
    
    // Should still be ordered by date descending
    expect(result[0].week_start_date >= result[1].week_start_date).toBe(true);
    expect(result[1].week_start_date >= result[2].week_start_date).toBe(true);
  });

  it('should return empty array when user has no meal plans', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    const result = await getRecentMealPlans(userId);

    expect(result).toHaveLength(0);
    expect(result).toEqual([]);
  });

  it('should only return meal plans for the specified user', async () => {
    // Create two test users
    const user1Result = await db.insert(usersTable)
      .values({
        household_id: 'test-household-1',
        inventory_endpoint: 'https://api.example.com/inventory1',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();
    
    const user2Result = await db.insert(usersTable)
      .values({
        household_id: 'test-household-2',
        inventory_endpoint: 'https://api.example.com/inventory2',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();
    
    const user1Id = user1Result[0].id;
    const user2Id = user2Result[0].id;

    // Create meal plans for both users
    const mealPlansUser1 = [
      {
        user_id: user1Id,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify({ week_start_date: '2024-01-01', daily_meals: [] }),
        shopping_gaps: JSON.stringify([])
      },
      {
        user_id: user1Id,
        week_start_date: '2024-01-08',
        plan_data: JSON.stringify({ week_start_date: '2024-01-08', daily_meals: [] }),
        shopping_gaps: JSON.stringify([])
      }
    ];

    const mealPlansUser2 = [
      {
        user_id: user2Id,
        week_start_date: '2024-01-01',
        plan_data: JSON.stringify({ week_start_date: '2024-01-01', daily_meals: [] }),
        shopping_gaps: JSON.stringify([])
      }
    ];

    await db.insert(mealPlansTable).values([...mealPlansUser1, ...mealPlansUser2]).execute();

    // Query for user1's meal plans
    const result = await getRecentMealPlans(user1Id);

    expect(result).toHaveLength(2);
    result.forEach(mealPlan => {
      expect(mealPlan.user_id).toEqual(user1Id);
    });
  });

  it('should use default limit of 10 when not specified', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create 15 meal plans
    const mealPlans = [];
    for (let i = 0; i < 15; i++) {
      const date = new Date('2024-01-01');
      date.setDate(date.getDate() + (i * 7)); // Weekly intervals
      
      mealPlans.push({
        user_id: userId,
        week_start_date: date.toISOString().split('T')[0],
        plan_data: JSON.stringify({ week_start_date: date.toISOString().split('T')[0], daily_meals: [] }),
        shopping_gaps: JSON.stringify([])
      });
    }

    await db.insert(mealPlansTable).values(mealPlans).execute();

    // Call without specifying limit
    const result = await getRecentMealPlans(userId);

    // Should default to 10
    expect(result).toHaveLength(10);
  });

  it('should handle complex meal plan data correctly', async () => {
    // Create test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        slack_channel: '#meal-planning',
        auto_send_slack: true
      })
      .returning()
      .execute();
    
    const userId = userResult[0].id;

    // Create a meal plan with complex data
    const complexPlanData = {
      week_start_date: '2024-01-01',
      daily_meals: [
        {
          date: '2024-01-01',
          breakfast: { title: 'Oatmeal', ingredients_summary: 'oats, milk, berries' },
          lunch: { title: 'Sandwich', ingredients_summary: 'bread, turkey, cheese' },
          dinner: { title: 'Pasta', ingredients_summary: 'pasta, tomatoes, herbs' }
        }
      ]
    };

    const complexShoppingGaps = [
      {
        ingredient: 'Fresh Basil',
        quantity_needed: '1 bunch',
        used_for_meals: ['Pasta Dinner']
      }
    ];

    const mealPlan = {
      user_id: userId,
      week_start_date: '2024-01-01',
      plan_data: JSON.stringify(complexPlanData),
      shopping_gaps: JSON.stringify(complexShoppingGaps)
    };

    await db.insert(mealPlansTable).values([mealPlan]).execute();

    const result = await getRecentMealPlans(userId);

    expect(result).toHaveLength(1);
    expect(result[0].plan_data).toEqual(JSON.stringify(complexPlanData));
    expect(result[0].shopping_gaps).toEqual(JSON.stringify(complexShoppingGaps));
    
    // Verify JSON data can be parsed back
    const parsedPlanData = JSON.parse(result[0].plan_data);
    const parsedShoppingGaps = JSON.parse(result[0].shopping_gaps);
    
    expect(parsedPlanData.week_start_date).toEqual('2024-01-01');
    expect(parsedPlanData.daily_meals).toHaveLength(1);
    expect(parsedShoppingGaps).toHaveLength(1);
    expect(parsedShoppingGaps[0].ingredient).toEqual('Fresh Basil');
  });
});