import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  connectUserInputSchema,
  updateUserSettingsInputSchema,
  refreshInventoryInputSchema,
  generateMealPlanInputSchema,
  sendToSlackInputSchema
} from './schema';

// Import handlers
import { connectUser } from './handlers/connect_user';
import { updateUserSettings } from './handlers/update_user_settings';
import { getUserByHousehold } from './handlers/get_user_by_household';
import { refreshInventory } from './handlers/refresh_inventory';
import { getInventory } from './handlers/get_inventory';
import { generateMealPlan } from './handlers/generate_meal_plan';
import { getMealPlan } from './handlers/get_meal_plan';
import { getRecentMealPlans } from './handlers/get_recent_meal_plans';
import { sendToSlack } from './handlers/send_to_slack';
import { healthcheck } from './handlers/healthcheck';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check endpoint
  healthcheck: publicProcedure.query(() => healthcheck()),

  // User management endpoints
  connectUser: publicProcedure
    .input(connectUserInputSchema)
    .mutation(({ input }) => connectUser(input)),

  updateUserSettings: publicProcedure
    .input(updateUserSettingsInputSchema)
    .mutation(({ input }) => updateUserSettings(input)),

  getUserByHousehold: publicProcedure
    .input(z.object({ household_id: z.string() }))
    .query(({ input }) => getUserByHousehold(input.household_id)),

  // Inventory management endpoints
  refreshInventory: publicProcedure
    .input(refreshInventoryInputSchema)
    .mutation(({ input }) => refreshInventory(input)),

  getInventory: publicProcedure
    .input(z.object({ user_id: z.number() }))
    .query(({ input }) => getInventory(input.user_id)),

  // Meal plan endpoints
  generateMealPlan: publicProcedure
    .input(generateMealPlanInputSchema)
    .mutation(({ input }) => generateMealPlan(input)),

  getMealPlan: publicProcedure
    .input(z.object({ 
      user_id: z.number(), 
      week_start_date: z.string().optional() 
    }))
    .query(({ input }) => getMealPlan(input.user_id, input.week_start_date)),

  getRecentMealPlans: publicProcedure
    .input(z.object({ 
      user_id: z.number(), 
      limit: z.number().optional().default(10) 
    }))
    .query(({ input }) => getRecentMealPlans(input.user_id, input.limit)),

  // Slack integration endpoints
  sendToSlack: publicProcedure
    .input(sendToSlackInputSchema)
    .mutation(({ input }) => sendToSlack(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
  console.log('Available endpoints:');
  console.log('  - healthcheck (query)');
  console.log('  - connectUser (mutation)');
  console.log('  - updateUserSettings (mutation)');
  console.log('  - getUserByHousehold (query)');
  console.log('  - refreshInventory (mutation)');
  console.log('  - getInventory (query)');
  console.log('  - generateMealPlan (mutation)');
  console.log('  - getMealPlan (query)');
  console.log('  - getRecentMealPlans (query)');
  console.log('  - sendToSlack (mutation)');
}

start();