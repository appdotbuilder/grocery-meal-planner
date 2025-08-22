import { db } from '../db';
import { inventoryItemsTable } from '../db/schema';
import { type InventoryItem } from '../schema';
import { eq, asc, sql } from 'drizzle-orm';

export const getInventory = async (user_id: number): Promise<InventoryItem[]> => {
  try {
    // Get current date for expiry calculations
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    // Query inventory items for the user with ordering
    const results = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, user_id))
      .orderBy(
        // Order by expiry date (nulls last), then by name
        sql`${inventoryItemsTable.expiry_date} IS NULL, ${inventoryItemsTable.expiry_date} ASC`,
        asc(inventoryItemsTable.name)
      )
      .execute();

    // Map results and calculate is_expiring_soon flag
    return results.map(item => {
      let isExpiringSoon = false;
      
      if (item.expiry_date) {
        const expiryDate = new Date(item.expiry_date);
        isExpiringSoon = expiryDate <= threeDaysFromNow;
      }

      return {
        ...item,
        expiry_date: item.expiry_date ? new Date(item.expiry_date) : null,
        is_expiring_soon: isExpiringSoon
      };
    });
  } catch (error) {
    console.error('Failed to get inventory:', error);
    throw error;
  }
};