import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, inventoryItemsTable } from '../db/schema';
import { type RefreshInventoryInput } from '../schema';
import { refreshInventory } from '../handlers/refresh_inventory';
import { eq } from 'drizzle-orm';

// Mock fetch globally
let mockFetch: any;

const testInput: RefreshInventoryInput = {
  user_id: 1
};

const mockUser = {
  household_id: 'test-household-123',
  inventory_endpoint: 'https://api.lakebase.com/inventory',
  slack_channel: '#kitchen',
  auto_send_slack: false
};

// Helper to create mock response with proper date handling
const createMockResponse = () => {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 10); // 10 days from now (not expiring soon)
  
  const expiringSoonDate = new Date();
  expiringSoonDate.setDate(expiringSoonDate.getDate() + 2); // 2 days from now (expiring soon)

  return {
    status: 'success',
    items: [
      {
        name: 'Apples',
        quantity: 5,
        unit: 'pieces',
        expiry_date: futureDate.toISOString().split('T')[0] // More than 3 days away
      },
      {
        name: 'Milk',
        quantity: 1,
        unit: 'liters',
        expiry_date: expiringSoonDate.toISOString().split('T')[0] // 2 days from now
      },
      {
        name: 'Rice',
        quantity: 2,
        unit: 'kg',
        expiry_date: null
      }
    ]
  };
};

describe('refreshInventory', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create test user
    await db.insert(usersTable)
      .values(mockUser)
      .execute();

    // Mock fetch
    mockFetch = globalThis.fetch;
    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => createMockResponse(),
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };
  });

  afterEach(async () => {
    await resetDB();
    if (mockFetch) {
      (globalThis as any).fetch = mockFetch;
    }
  });

  it('should refresh inventory successfully', async () => {
    const result = await refreshInventory(testInput);

    expect(result).toHaveLength(3);
    
    // Check each item
    const applesItem = result.find(item => item.name === 'Apples');
    expect(applesItem).toBeDefined();
    expect(applesItem!.quantity).toBe(5);
    expect(applesItem!.unit).toBe('pieces');
    expect(applesItem!.expiry_date).toBeInstanceOf(Date);
    expect(applesItem!.is_expiring_soon).toBe(false); // Should not be expiring soon (10+ days)

    const milkItem = result.find(item => item.name === 'Milk');
    expect(milkItem).toBeDefined();
    expect(milkItem!.quantity).toBe(1);
    expect(milkItem!.unit).toBe('liters');
    expect(milkItem!.expiry_date).toBeInstanceOf(Date);
    expect(milkItem!.is_expiring_soon).toBe(true); // Expires in 2 days (within 3 day threshold)

    const riceItem = result.find(item => item.name === 'Rice');
    expect(riceItem).toBeDefined();
    expect(riceItem!.quantity).toBe(2);
    expect(riceItem!.unit).toBe('kg');
    expect(riceItem!.expiry_date).toBe(null);
    expect(riceItem!.is_expiring_soon).toBe(false);
  });

  it('should save inventory items to database', async () => {
    await refreshInventory(testInput);

    const items = await db.select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, testInput.user_id))
      .execute();

    expect(items).toHaveLength(3);
    
    // Verify data is correctly stored in database
    const applesItem = items.find(item => item.name === 'Apples');
    expect(applesItem).toBeDefined();
    expect(applesItem!.user_id).toBe(testInput.user_id);
    expect(applesItem!.created_at).toBeInstanceOf(Date);
    expect(applesItem!.updated_at).toBeInstanceOf(Date);
  });

  it('should clear existing inventory items before inserting new ones', async () => {
    // Insert some existing inventory items
    await db.insert(inventoryItemsTable)
      .values([
        {
          user_id: testInput.user_id,
          name: 'Old Item 1',
          quantity: 1,
          unit: 'pieces',
          expiry_date: null,
          is_expiring_soon: false
        },
        {
          user_id: testInput.user_id,
          name: 'Old Item 2',
          quantity: 2,
          unit: 'kg',
          expiry_date: null,
          is_expiring_soon: false
        }
      ])
      .execute();

    // Verify old items exist
    let items = await db.select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, testInput.user_id))
      .execute();
    expect(items).toHaveLength(2);

    // Refresh inventory
    const result = await refreshInventory(testInput);

    // Verify old items are gone and new items are present
    expect(result).toHaveLength(3);
    expect(result.find(item => item.name === 'Old Item 1')).toBeUndefined();
    expect(result.find(item => item.name === 'Old Item 2')).toBeUndefined();
    expect(result.find(item => item.name === 'Apples')).toBeDefined();
  });

  it('should make HTTP request with correct headers', async () => {
    let requestOptions: any = {};
    let requestUrl: string = '';

    (globalThis as any).fetch = async (url: string, options?: any): Promise<Response> => {
      requestUrl = url;
      requestOptions = options;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => createMockResponse(),
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    await refreshInventory(testInput);

    expect(requestUrl).toBe(mockUser.inventory_endpoint);
    expect(requestOptions.method).toBe('GET');
    expect(requestOptions.headers['Content-Type']).toBe('application/json');
    expect(requestOptions.headers['X-Household-ID']).toBe(mockUser.household_id);
  });

  it('should throw error for non-existent user', async () => {
    const invalidInput: RefreshInventoryInput = {
      user_id: 999
    };

    await expect(refreshInventory(invalidInput)).rejects.toThrow(/User with id 999 not found/);
  });

  it('should handle HTTP request failure', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        json: async () => ({}),
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    await expect(refreshInventory(testInput)).rejects.toThrow(/Failed to fetch inventory data: 500/);
  });

  it('should handle Lakebase API error status', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          status: 'error',
          items: []
        }),
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    await expect(refreshInventory(testInput)).rejects.toThrow(/Lakebase API returned error status: error/);
  });

  it('should handle invalid response data', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          status: 'success',
          items: [
            {
              name: 'Invalid Item',
              // Missing required fields: quantity, unit, expiry_date
            }
          ]
        }),
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    await expect(refreshInventory(testInput)).rejects.toThrow();
  });

  it('should correctly calculate expiring_soon status', async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const fourDaysFromNow = new Date(today);
    fourDaysFromNow.setDate(today.getDate() + 4);

    const customResponse = {
      status: 'success',
      items: [
        {
          name: 'Expiring Tomorrow',
          quantity: 1,
          unit: 'pieces',
          expiry_date: tomorrow.toISOString().split('T')[0]
        },
        {
          name: 'Not Expiring Soon',
          quantity: 1,
          unit: 'pieces',
          expiry_date: fourDaysFromNow.toISOString().split('T')[0]
        }
      ]
    };

    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => customResponse,
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    const result = await refreshInventory(testInput);

    const expiringItem = result.find(item => item.name === 'Expiring Tomorrow');
    expect(expiringItem!.is_expiring_soon).toBe(true);

    const notExpiringItem = result.find(item => item.name === 'Not Expiring Soon');
    expect(notExpiringItem!.is_expiring_soon).toBe(false);
  });

  it('should handle empty inventory response', async () => {
    (globalThis as any).fetch = async (): Promise<Response> => {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          status: 'success',
          items: []
        }),
        headers: new Headers(),
        redirected: false,
        type: 'default',
        url: '',
        clone: () => ({} as Response),
        body: null,
        bodyUsed: false,
        arrayBuffer: async () => new ArrayBuffer(0),
        blob: async () => new Blob([]),
        formData: async () => new FormData(),
        text: async () => '',
        bytes: async () => new Uint8Array()
      } as Response;
    };

    const result = await refreshInventory(testInput);

    expect(result).toHaveLength(0);
    
    // Verify database is empty for this user
    const items = await db.select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.user_id, testInput.user_id))
      .execute();
    expect(items).toHaveLength(0);
  });
});