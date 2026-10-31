import "server-only";
import { cookies } from "next/headers";
import type {
  BoxOffice,
  CinemaSchedule,
  ContinueWatchingItem,
  HomeFeed,
  Me,
  ScreeningDetail,
  ScreeningSummary,
  SnackItem,
  Ticket,
  TitleSummary,
} from "@ott/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// The API sleeps on Render's free plan. While it wakes, Render answers 502/503/504 and then 429,
// so those (and dropped connections) are retried with backoff before giving up.
const RETRY_STATUS = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 2000, 4000, 6000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Server-side fetch to the API that forwards the viewer's session cookie. */
export async function apiGet<T>(path: string): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
        cache: "no-store",
        // Next memoizes identical GETs within a render, which would replay the failed response;
        // a signal opts a retry out of that.
        signal: attempt > 0 ? new AbortController().signal : undefined,
      });
    } catch (e) {
      if (delay === undefined) throw e;
      await sleep(delay);
      continue;
    }
    if (res.ok) return res.json() as Promise<T>;
    if (delay === undefined || !RETRY_STATUS.has(res.status)) {
      throw new ApiError(res.status, `GET ${path} failed with ${res.status}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) * 1000;
    await sleep(retryAfter > 0 ? Math.min(retryAfter, 6000) : delay);
  }
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
export const getTickets = () => apiGet<Ticket[]>("/tickets");
export const getHome = () => apiGet<HomeFeed>("/catalog/home");
export const getScreenings = () => apiGet<ScreeningSummary[]>("/screenings");
export const getScreening = (id: string) => apiGet<ScreeningDetail>(`/screenings/${encodeURIComponent(id)}`);
export const getCinema = (days = 7) => apiGet<CinemaSchedule>(`/cinema/remphamly-aizawl?days=${days}`);
export const getBoxOffice = () => apiGet<BoxOffice>("/box-office");
export const getSnacks = () => apiGet<SnackItem[]>("/snacks");
export const getSimilar = (slug: string) => apiGet<TitleSummary[]>(`/catalog/titles/${encodeURIComponent(slug)}/similar`);
