import { db } from '../db';
import { mealPlansTable, usersTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type SendToSlackInput, type SlackResponse, type WeeklyMealPlan, type ShoppingGapItem } from '../schema';

export async function sendToSlack(input: SendToSlackInput): Promise<SlackResponse> {
  try {
    // Get the meal plan record with user details
    const results = await db.select()
      .from(mealPlansTable)
      .innerJoin(usersTable, eq(mealPlansTable.user_id, usersTable.id))
      .where(eq(mealPlansTable.id, input.meal_plan_id))
      .execute();

    if (results.length === 0) {
      throw new Error('Meal plan not found');
    }

    const result = results[0];
    const mealPlan = result.meal_plans;
    const user = result.users;

    // Validate that user has a slack_channel configured
    if (!user.slack_channel) {
      throw new Error('User does not have a Slack channel configured');
    }

    // Parse the plan_data and shopping_gaps JSON strings
    let weeklyPlan: WeeklyMealPlan;
    let shoppingGaps: ShoppingGapItem[];

    try {
      weeklyPlan = JSON.parse(mealPlan.plan_data);
      shoppingGaps = JSON.parse(mealPlan.shopping_gaps);
    } catch (error) {
      throw new Error('Invalid meal plan data format');
    }

    // Format the meal plan into a readable Slack message
    const message = formatMealPlanForSlack(weeklyPlan, shoppingGaps);

    // Make HTTP request to Slack webhook API endpoint
    // Note: In a real implementation, this would be an actual HTTP request to Slack's API
    // For this implementation, we'll simulate the Slack API response
    const slackResponse = await sendMessageToSlack(user.slack_channel, message);

    return {
      success: true,
      message: 'Meal plan sent to Slack successfully',
      channel: user.slack_channel
    };

  } catch (error) {
    console.error('Failed to send meal plan to Slack:', error);
    
    // Return appropriate error response based on error type
    if (error instanceof Error) {
      return {
        success: false,
        message: error.message
      };
    }
    
    return {
      success: false,
      message: 'Unknown error occurred while sending to Slack'
    };
  }
}

function formatMealPlanForSlack(weeklyPlan: WeeklyMealPlan, shoppingGaps: ShoppingGapItem[]): string {
  let message = `🍽️ *Meal Plan for Week Starting ${weeklyPlan.week_start_date}*\n\n`;

  // Add daily meals
  weeklyPlan.daily_meals.forEach(dailyMeal => {
    const date = new Date(dailyMeal.date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    
    message += `*${dayName} (${dailyMeal.date})*\n`;
    message += `🌅 Breakfast: ${dailyMeal.breakfast.title}\n`;
    message += `   _${dailyMeal.breakfast.ingredients_summary}_\n`;
    message += `🌞 Lunch: ${dailyMeal.lunch.title}\n`;
    message += `   _${dailyMeal.lunch.ingredients_summary}_\n`;
    message += `🌙 Dinner: ${dailyMeal.dinner.title}\n`;
    message += `   _${dailyMeal.dinner.ingredients_summary}_\n\n`;
  });

  // Add shopping gaps if any
  if (shoppingGaps.length > 0) {
    message += `🛒 *Shopping List - Missing Ingredients:*\n`;
    shoppingGaps.forEach(gap => {
      message += `• ${gap.ingredient} (${gap.quantity_needed})`;
      if (gap.used_for_meals.length > 0) {
        message += ` - for ${gap.used_for_meals.join(', ')}`;
      }
      message += '\n';
    });
  }

  return message;
}

async function sendMessageToSlack(channel: string, message: string): Promise<void> {
  // In a real implementation, this would make an actual HTTP request to Slack's API
  // For this simulation, we'll validate the inputs and simulate success
  
  if (!channel || !message) {
    throw new Error('Invalid Slack channel or message');
  }
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Simulate successful Slack API response
  return Promise.resolve();
}