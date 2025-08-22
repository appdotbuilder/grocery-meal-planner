import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, inventoryItemsTable } from '../db/schema';
import { getInventory } from '../handlers/get_inventory';

describe('getInventory', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return empty array when user has no inventory items', async () => {
    // Create a user with no inventory
    const [user] = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const result = await getInventory(user.id);

    expect(result).toEqual([]);
  });

  it('should return inventory items for specific user only', async () => {
    // Create two users
    const [user1, user2] = await db.insert(usersTable)
      .values([
        {
          household_id: 'household-1',
          inventory_endpoint: 'https://api.example.com/inventory1',
          auto_send_slack: false
        },
        {
          household_id: 'household-2', 
          inventory_endpoint: 'https://api.example.com/inventory2',
          auto_send_slack: false
        }
      ])
      .returning()
      .execute();

    // Create inventory items for both users
    await db.insert(inventoryItemsTable)
      .values([
        {
          user_id: user1.id,
          name: 'Apples',
          quantity: 5,
          unit: 'pieces'
        },
        {
          user_id: user2.id,
          name: 'Bananas',
          quantity: 3,
          unit: 'pieces'
        }
      ])
      .execute();

    const result = await getInventory(user1.id);

    expect(result).toHaveLength(1);
    expect(result[0].name).toEqual('Apples');
    expect(result[0].user_id).toEqual(user1.id);
  });

  it('should calculate is_expiring_soon correctly for items expiring within 3 days', async () => {
    // Create a user
    const [user] = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        auto_send_slack: false
      })
      .returning()
      .execute();

    // Create dates for testing
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    const fourDaysFromNow = new Date(today);
    fourDaysFromNow.setDate(today.getDate() + 4);

    // Create inventory items with different expiry dates
    await db.insert(inventoryItemsTable)
      .values([
        {
          user_id: user.id,
          name: 'Expiring Tomorrow',
          quantity: 2,
          unit: 'pieces',
          expiry_date: tomorrow.toISOString().split('T')[0]
        },
        {
          user_id: user.id,
          name: 'Expiring Exactly 3 Days',
          quantity: 1,
          unit: 'pieces', 
          expiry_date: threeDaysFromNow.toISOString().split('T')[0]
        },
        {
          user_id: user.id,
          name: 'Expiring Later',
          quantity: 3,
          unit: 'pieces',
          expiry_date: fourDaysFromNow.toISOString().split('T')[0]
        },
        {
          user_id: user.id,
          name: 'No Expiry',
          quantity: 5,
          unit: 'pieces',
          expiry_date: null
        }
      ])
      .execute();

    const result = await getInventory(user.id);

    expect(result).toHaveLength(4);

    // Find specific items and check their expiring status
    const expiringTomorrow = result.find(item => item.name === 'Expiring Tomorrow');
    const expiringExactly3Days = result.find(item => item.name === 'Expiring Exactly 3 Days');
    const expiringLater = result.find(item => item.name === 'Expiring Later');
    const noExpiry = result.find(item => item.name === 'No Expiry');

    expect(expiringTomorrow?.is_expiring_soon).toBe(true);
    expect(expiringExactly3Days?.is_expiring_soon).toBe(true);
    expect(expiringLater?.is_expiring_soon).toBe(false);
    expect(noExpiry?.is_expiring_soon).toBe(false);
  });

  it('should order items by expiry date (nulls last) then by name', async () => {
    // Create a user
    const [user] = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);

    // Create inventory items with mixed expiry dates and names
    await db.insert(inventoryItemsTable)
      .values([
        {
          user_id: user.id,
          name: 'Zebra Item', // Should be last among no-expiry items
          quantity: 1,
          unit: 'pieces',
          expiry_date: null
        },
        {
          user_id: user.id,
          name: 'Beta Item', // Should come after Alpha Item (day after tomorrow)
          quantity: 2,
          unit: 'pieces',
          expiry_date: dayAfterTomorrow.toISOString().split('T')[0]
        },
        {
          user_id: user.id,
          name: 'Alpha Item', // Should be first (tomorrow)
          quantity: 3,
          unit: 'pieces',
          expiry_date: tomorrow.toISOString().split('T')[0]
        },
        {
          user_id: user.id,
          name: 'Apple Item', // Should be first among no-expiry items
          quantity: 4,
          unit: 'pieces',
          expiry_date: null
        }
      ])
      .execute();

    const result = await getInventory(user.id);

    expect(result).toHaveLength(4);

    // Check ordering: expiry dates first (ascending), then no expiry items by name (ascending)
    expect(result[0].name).toEqual('Alpha Item'); // Tomorrow
    expect(result[1].name).toEqual('Beta Item'); // Day after tomorrow  
    expect(result[2].name).toEqual('Apple Item'); // No expiry, alphabetically first
    expect(result[3].name).toEqual('Zebra Item'); // No expiry, alphabetically last
  });

  it('should convert date fields correctly', async () => {
    // Create a user
    const [user] = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testDate = new Date('2024-12-15');

    // Create an inventory item with expiry date
    await db.insert(inventoryItemsTable)
      .values({
        user_id: user.id,
        name: 'Test Item',
        quantity: 1,
        unit: 'piece',
        expiry_date: testDate.toISOString().split('T')[0]
      })
      .execute();

    const result = await getInventory(user.id);

    expect(result).toHaveLength(1);
    expect(result[0].expiry_date).toBeInstanceOf(Date);
    expect(result[0].expiry_date?.toISOString().split('T')[0]).toEqual('2024-12-15');
    expect(result[0].created_at).toBeInstanceOf(Date);
    expect(result[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle items with null expiry dates', async () => {
    // Create a user
    const [user] = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://api.example.com/inventory',
        auto_send_slack: false
      })
      .returning()
      .execute();

    // Create inventory item without expiry date
    await db.insert(inventoryItemsTable)
      .values({
        user_id: user.id,
        name: 'Non-perishable Item',
        quantity: 10,
        unit: 'pieces',
        expiry_date: null
      })
      .execute();

    const result = await getInventory(user.id);

    expect(result).toHaveLength(1);
    expect(result[0].expiry_date).toBeNull();
    expect(result[0].is_expiring_soon).toBe(false);
    expect(result[0].name).toEqual('Non-perishable Item');
  });
});