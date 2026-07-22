import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal .env loader.
 *
 * Deliberately dependency-free: these scripts are the first thing a new
 * contributor runs, and "install dotenv before you can check why nothing
 * works" is the wrong first experience. Existing process.env always wins, so
 * CI and shell overrides behave the way they do everywhere else.
 */
export function loadEnvFile(file = ".env.local"): { loaded: boolean; path: string; count: number } {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return { loaded: false, path, count: 0 };

  const raw = readFileSync(path, "utf8");
  let count = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = trimmed.slice(eq + 1).trim();
    // Strip one layer of matching quotes; leave inner quotes alone.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
    count++;
  }

  return { loaded: true, path, count };
}
