import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type ConnectUserInput } from '../schema';
import { connectUser } from '../handlers/connect_user';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: ConnectUserInput = {
  household_id: 'test-household-123',
  inventory_endpoint: 'https://api.lakebase.com/inventory',
  slack_channel: '#meal-planning',
  auto_send_slack: true
};

// Minimal test input
const minimalInput: ConnectUserInput = {
  household_id: 'minimal-household-456',
  inventory_endpoint: 'https://api.example.com/inventory',
  auto_send_slack: false
  // slack_channel will use default (undefined)
};

describe('connectUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a new user when household_id does not exist', async () => {
    const result = await connectUser(testInput);

    // Verify returned user data
    expect(result.household_id).toEqual('test-household-123');
    expect(result.inventory_endpoint).toEqual('https://api.lakebase.com/inventory');
    expect(result.slack_channel).toEqual('#meal-planning');
    expect(result.auto_send_slack).toEqual(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save new user to database', async () => {
    const result = await connectUser(testInput);

    // Verify user was saved to database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].household_id).toEqual('test-household-123');
    expect(users[0].inventory_endpoint).toEqual('https://api.lakebase.com/inventory');
    expect(users[0].slack_channel).toEqual('#meal-planning');
    expect(users[0].auto_send_slack).toEqual(true);
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should handle minimal input with defaults', async () => {
    const result = await connectUser(minimalInput);

    // Verify defaults are applied
    expect(result.household_id).toEqual('minimal-household-456');
    expect(result.inventory_endpoint).toEqual('https://api.example.com/inventory');
    expect(result.slack_channel).toBeNull();
    expect(result.auto_send_slack).toEqual(false);
    expect(result.id).toBeDefined();
  });

  it('should update existing user when household_id already exists', async () => {
    // Create initial user
    const initialUser = await connectUser(testInput);
    
    // Update with new data
    const updateInput: ConnectUserInput = {
      household_id: 'test-household-123', // Same household_id
      inventory_endpoint: 'https://api.newlakebase.com/inventory',
      slack_channel: '#updated-channel',
      auto_send_slack: false
    };

    const result = await connectUser(updateInput);

    // Should return same ID but updated data
    expect(result.id).toEqual(initialUser.id);
    expect(result.household_id).toEqual('test-household-123');
    expect(result.inventory_endpoint).toEqual('https://api.newlakebase.com/inventory');
    expect(result.slack_channel).toEqual('#updated-channel');
    expect(result.auto_send_slack).toEqual(false);
    expect(result.updated_at).toBeInstanceOf(Date);
    
    // updated_at should be newer than the original
    expect(result.updated_at.getTime()).toBeGreaterThanOrEqual(initialUser.updated_at.getTime());
  });

  it('should update existing user with null slack_channel', async () => {
    // Create initial user with slack channel
    await connectUser(testInput);

    // Update to remove slack channel
    const updateInput: ConnectUserInput = {
      household_id: 'test-household-123',
      inventory_endpoint: 'https://api.lakebase.com/inventory',
      slack_channel: null,
      auto_send_slack: false
    };

    const result = await connectUser(updateInput);

    expect(result.slack_channel).toBeNull();
    expect(result.auto_send_slack).toEqual(false);
  });

  it('should only have one user per household_id after updates', async () => {
    // Create initial user
    await connectUser(testInput);

    // Update the same household
    const updateInput: ConnectUserInput = {
      household_id: 'test-household-123',
      inventory_endpoint: 'https://api.updated.com/inventory',
      auto_send_slack: true
    };

    await connectUser(updateInput);

    // Verify only one user exists for this household
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.household_id, 'test-household-123'))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].inventory_endpoint).toEqual('https://api.updated.com/inventory');
  });

  it('should handle multiple different households', async () => {
    // Create first user
    const user1 = await connectUser(testInput);

    // Create second user with different household
    const input2: ConnectUserInput = {
      household_id: 'different-household-789',
      inventory_endpoint: 'https://api.different.com/inventory',
      auto_send_slack: false
    };
    const user2 = await connectUser(input2);

    // Verify both users exist with different IDs
    expect(user1.id).not.toEqual(user2.id);
    expect(user1.household_id).toEqual('test-household-123');
    expect(user2.household_id).toEqual('different-household-789');

    // Verify both are in database
    const allUsers = await db.select().from(usersTable).execute();
    expect(allUsers).toHaveLength(2);
  });

  it('should preserve created_at when updating existing user', async () => {
    // Create initial user
    const initialUser = await connectUser(testInput);
    const originalCreatedAt = initialUser.created_at;

    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Update the user
    const updateInput: ConnectUserInput = {
      household_id: 'test-household-123',
      inventory_endpoint: 'https://api.updated.com/inventory',
      auto_send_slack: false
    };

    const updatedUser = await connectUser(updateInput);

    // created_at should remain the same, updated_at should be newer
    expect(updatedUser.created_at).toEqual(originalCreatedAt);
    expect(updatedUser.updated_at.getTime()).toBeGreaterThan(originalCreatedAt.getTime());
  });
});