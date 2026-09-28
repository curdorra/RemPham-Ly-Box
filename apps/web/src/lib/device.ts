"use client";

const KEY = "rlb_device_id";

/** Stable per-browser id; the API uses it to enforce a ticket's screen limit. */
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = `web-${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled: a per-tab id still works, it just isn't remembered.
    return `web-tab-${Math.random().toString(36).slice(2, 14)}`;
  }
}
