import { db } from '../db';
import { usersTable, inventoryItemsTable } from '../db/schema';
import { type RefreshInventoryInput, type InventoryItem, lakebaseInventoryResponseSchema } from '../schema';
import { eq } from 'drizzle-orm';

export async function refreshInventory(input: RefreshInventoryInput): Promise<InventoryItem[]> {
  try {
    // 1. Get user record to retrieve inventory endpoint and household_id
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (users.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    const user = users[0];

    // 2. Make HTTP request to the Lakebase inventory endpoint
    const response = await fetch(user.inventory_endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Household-ID': user.household_id
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch inventory data: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();

    // 3. Parse the response and validate against lakebaseInventoryResponseSchema
    const validatedResponse = lakebaseInventoryResponseSchema.parse(responseData);

    if (validatedResponse.status !== 'success') {
      throw new Error(`Lakebase API returned error status: ${validatedResponse.status}`);
    }

    // 4. Clear existing inventory items for this user
    await db.delete(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, input.user_id))
      .execute();

    // 5. Insert new inventory items with expiry date calculations
    const now = new Date();
    const threeDaysFromNow = new Date(now);
    threeDaysFromNow.setDate(now.getDate() + 3);

    const inventoryData = validatedResponse.items.map(item => {
      const expiryDate = item.expiry_date ? new Date(item.expiry_date) : null;
      
      // 6. Mark items as expiring_soon if expiry_date is within 3 days
      const isExpiringSoon = expiryDate ? expiryDate <= threeDaysFromNow : false;

      return {
        user_id: input.user_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        expiry_date: expiryDate ? expiryDate.toISOString().split('T')[0] : null, // Convert to YYYY-MM-DD string
        is_expiring_soon: isExpiringSoon
      };
    });

    if (inventoryData.length > 0) {
      await db.insert(inventoryItemsTable)
        .values(inventoryData)
        .execute();
    }

    // 7. Return the updated inventory items
    const updatedItems = await db.select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, input.user_id))
      .execute();

    return updatedItems.map(item => ({
      ...item,
      expiry_date: item.expiry_date ? new Date(item.expiry_date) : null
    }));

  } catch (error) {
    console.error('Inventory refresh failed:', error);
    throw error;
  }
}