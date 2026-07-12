// Shared waitlist scoring — imported by both the API (server) and the UI (client),
// so it must stay free of any Node/`fs` imports.

export const BASE_POINTS = 100;
export const REFERRAL_POINTS = 75;

export type TaskId = "follow_x" | "share_x" | "rate_product" | "connect_wallet";

export interface TaskDef {
  id: TaskId;
  label: string;
  points: number;
  cta: string;
}

export const TASKS: TaskDef[] = [
  { id: "follow_x", label: "Follow @attentionfi on X", points: 50, cta: "Follow" },
  { id: "share_x", label: "Share the waitlist on X", points: 50, cta: "Share" },
  { id: "rate_product", label: "Rate AttentionFi", points: 30, cta: "Rate" },
  { id: "connect_wallet", label: "Add your Solana wallet", points: 40, cta: "Add" },
];

const TASK_BY_ID = new Map<TaskId, TaskDef>(TASKS.map((t) => [t.id, t]));

export function isTaskId(value: string): value is TaskId {
  return TASK_BY_ID.has(value as TaskId);
}

export function taskPoints(id: TaskId): number {
  return TASK_BY_ID.get(id)?.points ?? 0;
}

/** A user's public status, returned by the API and rendered by the panel. */
export interface WaitlistStatus {
  id: string;
  points: number;
  position: number;
  total: number;
  referralCode: string;
  referrals: number;
  tasks: TaskId[];
  rating: number | null;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  points: number;
  referrals: number;
}
