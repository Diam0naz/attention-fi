// Waitlist backend selector. Uses Postgres (Neon) when a database URL is
// configured (Vercel/production); otherwise the local file store. The API routes
// import from here and don't care which backend is active.

import * as dbStore from "./waitlist-db";
import * as fsStore from "./waitlist-fs";

const usePostgres = Boolean(process.env.DATABASE_URL ?? process.env.POSTGRES_URL);
const store = usePostgres ? dbStore : fsStore;

export const addSignup = store.addSignup;
export const getStatus = store.getStatus;
export const getLeaderboard = store.getLeaderboard;
export const completeTask = store.completeTask;
