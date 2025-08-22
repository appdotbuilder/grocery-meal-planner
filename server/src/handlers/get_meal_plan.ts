import { db } from '../db';
import { mealPlansTable } from '../db/schema';
import { type MealPlan } from '../schema';
import { eq, and } from 'drizzle-orm';

export const getMealPlan = async (user_id: number, week_start_date?: string): Promise<MealPlan | null> => {
  try {
    let targetWeekStart = week_start_date;
    
    // If week_start_date not provided, calculate current week's Monday
    if (!targetWeekStart) {
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Calculate days to get to Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() + daysToMonday);
      
      // Format as YYYY-MM-DD
      targetWeekStart = monday.toISOString().split('T')[0];
    }

    // Query meal_plans table for the user and specific week
    const results = await db.select()
      .from(mealPlansTable)
      .where(and(
        eq(mealPlansTable.user_id, user_id),
        eq(mealPlansTable.week_start_date, targetWeekStart)
      ))
      .execute();

    if (results.length === 0) {
      return null;
    }

    // Return the first matching meal plan
    const mealPlan = results[0];
    return {
      ...mealPlan,
      week_start_date: new Date(mealPlan.week_start_date),
      created_at: mealPlan.created_at,
      updated_at: mealPlan.updated_at
    };
  } catch (error) {
    console.error('Get meal plan failed:', error);
    throw error;
  }
};