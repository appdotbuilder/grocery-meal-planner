import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type UpdateUserSettingsInput } from '../schema';
import { updateUserSettings } from '../handlers/update_user_settings';
import { eq } from 'drizzle-orm';

describe('updateUserSettings', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should update slack_channel only', async () => {
    // Create a test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household',
        inventory_endpoint: 'https://test.com/api',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testUser = userResult[0];

    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id,
      slack_channel: '#kitchen-updates'
    };

    const result = await updateUserSettings(updateInput);

    // Verify updated fields
    expect(result.id).toEqual(testUser.id);
    expect(result.household_id).toEqual('test-household');
    expect(result.inventory_endpoint).toEqual('https://test.com/api');
    expect(result.slack_channel).toEqual('#kitchen-updates');
    expect(result.auto_send_slack).toEqual(false); // Should remain unchanged
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testUser.updated_at).toBe(true);
  });

  it('should update auto_send_slack only', async () => {
    // Create a test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household-2',
        inventory_endpoint: 'https://test2.com/api',
        slack_channel: '#existing-channel',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testUser = userResult[0];

    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id,
      auto_send_slack: true
    };

    const result = await updateUserSettings(updateInput);

    // Verify updated fields
    expect(result.id).toEqual(testUser.id);
    expect(result.household_id).toEqual('test-household-2');
    expect(result.inventory_endpoint).toEqual('https://test2.com/api');
    expect(result.slack_channel).toEqual('#existing-channel'); // Should remain unchanged
    expect(result.auto_send_slack).toEqual(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testUser.updated_at).toBe(true);
  });

  it('should update both slack_channel and auto_send_slack', async () => {
    // Create a test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household-3',
        inventory_endpoint: 'https://test3.com/api',
        slack_channel: '#old-channel',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testUser = userResult[0];

    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id,
      slack_channel: '#new-channel',
      auto_send_slack: true
    };

    const result = await updateUserSettings(updateInput);

    // Verify updated fields
    expect(result.id).toEqual(testUser.id);
    expect(result.household_id).toEqual('test-household-3');
    expect(result.inventory_endpoint).toEqual('https://test3.com/api');
    expect(result.slack_channel).toEqual('#new-channel');
    expect(result.auto_send_slack).toEqual(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.updated_at > testUser.updated_at).toBe(true);
  });

  it('should set slack_channel to null', async () => {
    // Create a test user with existing slack channel
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household-4',
        inventory_endpoint: 'https://test4.com/api',
        slack_channel: '#existing-channel',
        auto_send_slack: true
      })
      .returning()
      .execute();

    const testUser = userResult[0];

    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id,
      slack_channel: null
    };

    const result = await updateUserSettings(updateInput);

    // Verify updated fields
    expect(result.id).toEqual(testUser.id);
    expect(result.slack_channel).toBeNull();
    expect(result.auto_send_slack).toEqual(true); // Should remain unchanged
  });

  it('should save changes to database', async () => {
    // Create a test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household-db',
        inventory_endpoint: 'https://testdb.com/api',
        slack_channel: null,
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testUser = userResult[0];

    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id,
      slack_channel: '#database-test',
      auto_send_slack: true
    };

    await updateUserSettings(updateInput);

    // Query database directly to verify changes were saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, testUser.id))
      .execute();

    expect(users).toHaveLength(1);
    const savedUser = users[0];
    expect(savedUser.slack_channel).toEqual('#database-test');
    expect(savedUser.auto_send_slack).toEqual(true);
    expect(savedUser.updated_at > testUser.updated_at).toBe(true);
  });

  it('should throw error for non-existent user', async () => {
    const updateInput: UpdateUserSettingsInput = {
      id: 99999, // Non-existent user ID
      slack_channel: '#test'
    };

    await expect(updateUserSettings(updateInput)).rejects.toThrow(/user with id 99999 not found/i);
  });

  it('should handle empty update gracefully', async () => {
    // Create a test user
    const userResult = await db.insert(usersTable)
      .values({
        household_id: 'test-household-empty',
        inventory_endpoint: 'https://testempty.com/api',
        slack_channel: '#original',
        auto_send_slack: false
      })
      .returning()
      .execute();

    const testUser = userResult[0];
    const originalUpdatedAt = testUser.updated_at;

    // Update with no optional fields provided
    const updateInput: UpdateUserSettingsInput = {
      id: testUser.id
    };

    const result = await updateUserSettings(updateInput);

    // Should still update the updated_at timestamp
    expect(result.id).toEqual(testUser.id);
    expect(result.slack_channel).toEqual('#original'); // Unchanged
    expect(result.auto_send_slack).toEqual(false); // Unchanged
    expect(result.updated_at > originalUpdatedAt).toBe(true); // Should be updated
  });
});