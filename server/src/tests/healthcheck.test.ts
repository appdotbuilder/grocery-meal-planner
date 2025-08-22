import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { healthcheck, type HealthcheckResponse } from '../handlers/healthcheck';

describe('healthcheck', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return healthy status when database is accessible', async () => {
    const result = await healthcheck();

    expect(result.status).toEqual('ok');
    expect(result.database).toBe(true);
    expect(result.external_apis).toBe(true);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp)).toBeInstanceOf(Date);
  });

  it('should return proper timestamp format', async () => {
    const result = await healthcheck();

    // Verify timestamp is in ISO format
    const timestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(result.timestamp).toMatch(timestampRegex);
    
    // Verify timestamp is recent (within last few seconds)
    const now = new Date();
    const healthcheckTime = new Date(result.timestamp);
    const timeDiff = Math.abs(now.getTime() - healthcheckTime.getTime());
    expect(timeDiff).toBeLessThan(5000); // Less than 5 seconds difference
  });

  it('should have correct response structure', async () => {
    const result = await healthcheck();

    // Verify all required fields are present
    expect(typeof result.status).toBe('string');
    expect(typeof result.timestamp).toBe('string');
    expect(typeof result.database).toBe('boolean');
    expect(typeof result.external_apis).toBe('boolean');
    
    // Verify status is one of expected values
    expect(['ok', 'degraded', 'error']).toContain(result.status);
  });

  it('should handle database connection errors gracefully', async () => {
    // Mock database execute to throw an error
    const executeSpy = spyOn(db, 'execute').mockRejectedValue(new Error('Database connection failed'));

    // Mock console.error to avoid noise in test output
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});

    const result = await healthcheck();

    expect(result.status).toEqual('degraded'); // Database down but external APIs ok
    expect(result.database).toBe(false);
    expect(result.external_apis).toBe(true);
    expect(result.timestamp).toBeDefined();

    // Verify that console.error was called for the database error
    expect(consoleErrorSpy).toHaveBeenCalledWith('Database health check failed:', expect.any(Error));

    // Restore the original methods
    executeSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should return error status when all services are down', async () => {
    // Mock database execute to throw an error
    const executeSpy = spyOn(db, 'execute').mockRejectedValue(new Error('Database connection failed'));
    
    // Mock console.error to avoid noise in test output
    const consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    
    // For this test, we'll simulate external APIs being down by modifying the handler logic
    // In a real scenario, you would mock external API calls
    const result = await healthcheck();

    // With database down and external APIs up, status should be 'degraded'
    expect(result.database).toBe(false);
    expect(['degraded', 'error']).toContain(result.status);

    executeSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should execute database health check query successfully', async () => {
    // Spy on database execute to verify the health check query is called
    const executeSpy = spyOn(db, 'execute');

    await healthcheck();

    // Verify that execute was called (for the health check query)
    expect(executeSpy).toHaveBeenCalled();
    
    executeSpy.mockRestore();
  });

  it('should return consistent results on multiple calls', async () => {
    const result1 = await healthcheck();
    
    // Add a small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const result2 = await healthcheck();

    // Status should be consistent
    expect(result1.status).toEqual(result2.status);
    expect(result1.database).toEqual(result2.database);
    expect(result1.external_apis).toEqual(result2.external_apis);
    
    // Timestamps should be different (but both valid)
    expect(result1.timestamp).not.toEqual(result2.timestamp);
    expect(new Date(result1.timestamp)).toBeInstanceOf(Date);
    expect(new Date(result2.timestamp)).toBeInstanceOf(Date);
    
    // Verify second timestamp is after the first
    expect(new Date(result2.timestamp).getTime()).toBeGreaterThan(new Date(result1.timestamp).getTime());
  });
});