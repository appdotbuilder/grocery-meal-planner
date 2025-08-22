import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User } from '../schema';
import { eq } from 'drizzle-orm';

export async function getUserByHousehold(household_id: string): Promise<User | null> {
  try {
    // Query the users table for a record with the given household_id
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.household_id, household_id))
      .execute();

    // Return the user record if found, null otherwise
    if (results.length === 0) {
      return null;
    }

    return results[0];
  } catch (error) {
    console.error('Failed to get user by household:', error);
    throw error;
  }
}