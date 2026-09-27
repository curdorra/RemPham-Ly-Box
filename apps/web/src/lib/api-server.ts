import "server-only";
import { cookies } from "next/headers";
import type { ContinueWatchingItem, Me, Plan, TitleSummary } from "@ott/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Server-side fetch to the API that forwards the viewer's session cookie. */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}

/** Returns null for anonymous viewers instead of throwing. */
export async function getMe(): Promise<Me | null> {
  try {
    return await apiGet<Me>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export const getContinueWatching = () => apiGet<ContinueWatchingItem[]>("/me/continue-watching");
export const getMyList = () => apiGet<TitleSummary[]>("/me/list");
export const getPlans = () => apiGet<{ plans: Plan[]; devBilling: boolean }>("/billing/plans");
