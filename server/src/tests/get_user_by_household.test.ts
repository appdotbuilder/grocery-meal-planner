import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type ConnectUserInput } from '../schema';
import { getUserByHousehold } from '../handlers/get_user_by_household';

// Test data
const testUser1: ConnectUserInput = {
  household_id: 'house-123',
  inventory_endpoint: 'https://api.example.com/inventory',
  slack_channel: '#kitchen',
  auto_send_slack: true
};

const testUser2: ConnectUserInput = {
  household_id: 'house-456', 
  inventory_endpoint: 'https://api.example2.com/inventory',
  slack_channel: null,
  auto_send_slack: false
};

describe('getUserByHousehold', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user when household_id exists', async () => {
    // Create test user
    const insertResult = await db.insert(usersTable)
      .values({
        household_id: testUser1.household_id,
        inventory_endpoint: testUser1.inventory_endpoint,
        slack_channel: testUser1.slack_channel,
        auto_send_slack: testUser1.auto_send_slack
      })
      .returning()
      .execute();

    const createdUser = insertResult[0];

    // Test the handler
    const result = await getUserByHousehold('house-123');

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(createdUser.id);
    expect(result!.household_id).toEqual('house-123');
    expect(result!.inventory_endpoint).toEqual('https://api.example.com/inventory');
    expect(result!.slack_channel).toEqual('#kitchen');
    expect(result!.auto_send_slack).toBe(true);
    expect(result!.created_at).toBeInstanceOf(Date);
    expect(result!.updated_at).toBeInstanceOf(Date);
  });

  it('should return null when household_id does not exist', async () => {
    // Create test user with different household_id
    await db.insert(usersTable)
      .values({
        household_id: testUser1.household_id,
        inventory_endpoint: testUser1.inventory_endpoint,
        slack_channel: testUser1.slack_channel,
        auto_send_slack: testUser1.auto_send_slack
      })
      .execute();

    // Test with non-existent household_id
    const result = await getUserByHousehold('non-existent-house');

    expect(result).toBeNull();
  });

  it('should return correct user when multiple users exist', async () => {
    // Create multiple test users
    await db.insert(usersTable)
      .values([
        {
          household_id: testUser1.household_id,
          inventory_endpoint: testUser1.inventory_endpoint,
          slack_channel: testUser1.slack_channel,
          auto_send_slack: testUser1.auto_send_slack
        },
        {
          household_id: testUser2.household_id,
          inventory_endpoint: testUser2.inventory_endpoint,
          slack_channel: testUser2.slack_channel,
          auto_send_slack: testUser2.auto_send_slack
        }
      ])
      .execute();

    // Test getting the second user
    const result = await getUserByHousehold('house-456');

    expect(result).not.toBeNull();
    expect(result!.household_id).toEqual('house-456');
    expect(result!.inventory_endpoint).toEqual('https://api.example2.com/inventory');
    expect(result!.slack_channel).toBeNull();
    expect(result!.auto_send_slack).toBe(false);
  });

  it('should handle user with null slack_channel correctly', async () => {
    // Create user with null slack_channel
    await db.insert(usersTable)
      .values({
        household_id: testUser2.household_id,
        inventory_endpoint: testUser2.inventory_endpoint,
        slack_channel: testUser2.slack_channel, // null
        auto_send_slack: testUser2.auto_send_slack
      })
      .execute();

    const result = await getUserByHousehold('house-456');

    expect(result).not.toBeNull();
    expect(result!.household_id).toEqual('house-456');
    expect(result!.slack_channel).toBeNull();
    expect(result!.auto_send_slack).toBe(false);
  });

  it('should return first user if multiple users have same household_id', async () => {
    // Create two users with the same household_id (edge case)
    const insertResults = await db.insert(usersTable)
      .values([
        {
          household_id: 'duplicate-house',
          inventory_endpoint: 'https://api1.example.com/inventory',
          slack_channel: '#channel1',
          auto_send_slack: true
        },
        {
          household_id: 'duplicate-house',
          inventory_endpoint: 'https://api2.example.com/inventory',
          slack_channel: '#channel2',
          auto_send_slack: false
        }
      ])
      .returning()
      .execute();

    const firstUser = insertResults[0];

    // Should return the first user found
    const result = await getUserByHousehold('duplicate-house');

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(firstUser.id);
    expect(result!.inventory_endpoint).toEqual('https://api1.example.com/inventory');
    expect(result!.slack_channel).toEqual('#channel1');
    expect(result!.auto_send_slack).toBe(true);
  });

  it('should handle empty household_id string', async () => {
    // Create test user
    await db.insert(usersTable)
      .values({
        household_id: testUser1.household_id,
        inventory_endpoint: testUser1.inventory_endpoint,
        slack_channel: testUser1.slack_channel,
        auto_send_slack: testUser1.auto_send_slack
      })
      .execute();

    // Test with empty string
    const result = await getUserByHousehold('');

    expect(result).toBeNull();
  });
});