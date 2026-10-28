import "server-only";
import { translator, type Lang } from "./i18n";

/** The site is English-only; the Mizo switch was removed (2026-10-28). */
export async function getLang(): Promise<Lang> {
  return "en";
}

export async function getT() {
  return translator(await getLang());
}
