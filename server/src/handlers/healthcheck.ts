import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface HealthcheckResponse {
    status: string;
    timestamp: string;
    database: boolean;
    external_apis: boolean;
}

export async function healthcheck(): Promise<HealthcheckResponse> {
    let databaseStatus = false;
    let externalApisStatus = false;
    let overallStatus = 'error';

    try {
        // Check database connectivity with a simple query
        await db.execute(sql`SELECT 1 as health_check`);
        databaseStatus = true;
    } catch (error) {
        console.error('Database health check failed:', error);
        databaseStatus = false;
    }

    try {
        // For now, we'll set external APIs as true since we don't have specific endpoints to check
        // In a real implementation, you would check actual external service endpoints
        externalApisStatus = true;
    } catch (error) {
        console.error('External APIs health check failed:', error);
        externalApisStatus = false;
    }

    // Determine overall status
    if (databaseStatus && externalApisStatus) {
        overallStatus = 'ok';
    } else if (databaseStatus || externalApisStatus) {
        overallStatus = 'degraded';
    } else {
        overallStatus = 'error';
    }

    return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        database: databaseStatus,
        external_apis: externalApisStatus
    };
}