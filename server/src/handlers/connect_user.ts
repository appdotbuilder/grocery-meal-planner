import { db } from '../db';
import { usersTable } from '../db/schema';
import { type ConnectUserInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export const connectUser = async (input: ConnectUserInput): Promise<User> => {
  try {
    // Check if user with household_id already exists
    const existingUsers = await db.select()
      .from(usersTable)
      .where(eq(usersTable.household_id, input.household_id))
      .execute();

    if (existingUsers.length > 0) {
      // Update existing user
      const existingUser = existingUsers[0];
      const updatedUsers = await db.update(usersTable)
        .set({
          inventory_endpoint: input.inventory_endpoint,
          slack_channel: input.slack_channel || null,
          auto_send_slack: input.auto_send_slack || false,
          updated_at: new Date()
        })
        .where(eq(usersTable.id, existingUser.id))
        .returning()
        .execute();

      return updatedUsers[0];
    } else {
      // Create new user
      const newUsers = await db.insert(usersTable)
        .values({
          household_id: input.household_id,
          inventory_endpoint: input.inventory_endpoint,
          slack_channel: input.slack_channel || null,
          auto_send_slack: input.auto_send_slack || false
        })
        .returning()
        .execute();

      return newUsers[0];
    }
  } catch (error) {
    console.error('User connection failed:', error);
    throw error;
  }
};