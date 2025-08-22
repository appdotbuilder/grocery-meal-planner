import { db } from '../db';
import { mealPlansTable } from '../db/schema';
import { type MealPlan } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function getRecentMealPlans(user_id: number, limit: number = 10): Promise<MealPlan[]> {
  try {
    // Query meal plans for the user, ordered by week_start_date descending
    const results = await db.select()
      .from(mealPlansTable)
      .where(eq(mealPlansTable.user_id, user_id))
      .orderBy(desc(mealPlansTable.week_start_date))
      .limit(limit)
      .execute();

    // Convert date strings to Date objects to match schema
    return results.map(result => ({
      ...result,
      week_start_date: new Date(result.week_start_date)
    }));
  } catch (error) {
    console.error('Failed to get recent meal plans:', error);
    throw error;
  }
}