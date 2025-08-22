import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserSettingsInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

export const updateUserSettings = async (input: UpdateUserSettingsInput): Promise<User> => {
  try {
    // Build update object with only the fields provided in input
    const updateData: { [key: string]: any } = {
      updated_at: new Date()
    };

    if (input.slack_channel !== undefined) {
      updateData['slack_channel'] = input.slack_channel;
    }

    if (input.auto_send_slack !== undefined) {
      updateData['auto_send_slack'] = input.auto_send_slack;
    }

    // Update user settings
    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with id ${input.id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('User settings update failed:', error);
    throw error;
  }
};