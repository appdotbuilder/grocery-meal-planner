import { db } from '../db';
import { usersTable, inventoryItemsTable, mealPlansTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { 
  type GenerateMealPlanInput, 
  type MealPlan, 
  type MealPlanGenerationResponse,
  mealPlanGenerationResponseSchema
} from '../schema';

// Helper function to get the Monday of the current week or a specific date
function getWeekStartDate(dateString?: string): Date {
  const date = dateString ? new Date(dateString) : new Date();
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  
  // Get the Monday of the current week
  // Standard logic: go back to the most recent Monday (or stay if already Monday)
  const daysToSubtract = (day + 6) % 7; // Convert Sunday=0 to Sunday=6, then calculate days back to Monday
  
  const monday = new Date(date);
  monday.setDate(date.getDate() - daysToSubtract);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Mock external meal plan generation API call
async function callMealPlanAPI(inventory: any[]): Promise<MealPlanGenerationResponse> {
  // In a real implementation, this would make an HTTP request to an external service
  // For now, we'll return mock data that follows the expected schema
  const mockResponse = {
    meal_plan: {
      week_start_date: new Date().toISOString().split('T')[0],
      daily_meals: [
        {
          date: new Date().toISOString().split('T')[0],
          breakfast: {
            title: "Scrambled Eggs with Toast",
            ingredients_summary: "eggs, bread, butter"
          },
          lunch: {
            title: "Caesar Salad",
            ingredients_summary: "lettuce, parmesan, croutons"
          },
          dinner: {
            title: "Grilled Chicken with Vegetables",
            ingredients_summary: "chicken breast, broccoli, carrots"
          }
        }
      ]
    },
    shopping_gaps: [
      {
        ingredient: "eggs",
        quantity_needed: "6 pieces",
        used_for_meals: ["Scrambled Eggs with Toast"]
      }
    ],
    status: "success"
  };

  // Validate the response against our schema
  return mealPlanGenerationResponseSchema.parse(mockResponse);
}

// Mock Slack notification (would be implemented separately)
async function sendToSlack(mealPlanId: number): Promise<void> {
  // In a real implementation, this would call the sendToSlack handler
  // For now, we'll just log that it would be called
  console.log(`Would send meal plan ${mealPlanId} to Slack`);
}

export async function generateMealPlan(input: GenerateMealPlanInput): Promise<MealPlan> {
  try {
    // 1. Get user record and verify it exists
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (users.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    const user = users[0];

    // 2. Get current inventory items for the user
    const inventoryItems = await db.select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, input.user_id))
      .execute();

    // 3. Calculate week_start_date
    const weekStartDate = getWeekStartDate(input.week_start_date);

    // 4. Make HTTP request to meal plan generation API endpoint with inventory data
    const apiResponse = await callMealPlanAPI(inventoryItems);

    // 5. Store the meal plan and shopping gaps as JSON strings in the database
    const result = await db.insert(mealPlansTable)
      .values({
        user_id: input.user_id,
        week_start_date: weekStartDate.toISOString().split('T')[0], // Store as date string
        plan_data: JSON.stringify(apiResponse.meal_plan),
        shopping_gaps: JSON.stringify(apiResponse.shopping_gaps)
      })
      .returning()
      .execute();

    const mealPlan = result[0];

    // 6. If user has auto_send_slack enabled, automatically call sendToSlack
    if (user.auto_send_slack && user.slack_channel) {
      await sendToSlack(mealPlan.id);
    }

    // 7. Return the created meal plan record
    return {
      ...mealPlan,
      week_start_date: new Date(mealPlan.week_start_date)
    };
  } catch (error) {
    console.error('Meal plan generation failed:', error);
    throw error;
  }
}