import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/http/errors";

/**
 * SSRF guard. "Paste a URL and we will fetch it" is a server-side request
 * forgery primitive by definition, so every hostname is resolved and every
 * resolved address is checked against private ranges before a socket opens.
 * Redirects are re-checked, because a public host can 302 to 169.254.169.254.
 */

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateV4(ip: string): boolean {
  const value = v4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (v4ToInt(base) & mask);
  });
}

function isPrivateV6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link local
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice(7);
    return isIP(mapped) === 4 ? isPrivateV4(mapped) : true;
  }
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return true; // not an IP literal we understand: refuse
}

export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError("UNSUPPORTED_URL", "That is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("UNSUPPORTED_URL", "Only http and https pages can be analysed.");
  }
  if (url.username || url.password) {
    throw new AppError("UNSUPPORTED_URL", "Remove the credentials from the URL.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new AppError("UNSUPPORTED_URL", "Enter a publicly reachable URL.");
  }

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new AppError("UNSUPPORTED_URL", "That address is not publicly reachable.");
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new AppError("FETCH_FAILED", `We could not resolve ${host}. Check the domain and try again.`);
  }

  if (addresses.length === 0) {
    throw new AppError("FETCH_FAILED", `We could not resolve ${host}.`);
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new AppError("UNSUPPORTED_URL", "That domain resolves to a private address, so we will not fetch it.");
  }

  return url;
}

/** Cheap, permissive robots check. We identify ourselves and honour Disallow. */
export async function isAllowedByRobots(url: URL, userAgent: string): Promise<boolean> {
  try {
    const robotsUrl = new URL("/robots.txt", url.origin);
    const res = await fetch(robotsUrl, {
      headers: { "user-agent": userAgent },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return true;

    const body = (await res.text()).slice(0, 100_000);
    const path = url.pathname || "/";

    let applies = false;
    let allowed = true;
    for (const line of body.split("\n")) {
      const clean = line.split("#")[0]?.trim() ?? "";
      if (!clean) continue;
      const [rawKey, ...rest] = clean.split(":");
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(":").trim();

      if (key === "user-agent") {
        applies = value === "*" || userAgent.toLowerCase().includes(value.toLowerCase());
      } else if (applies && key === "disallow" && value) {
        if (path.startsWith(value)) allowed = false;
      } else if (applies && key === "allow" && value) {
        if (path.startsWith(value)) allowed = true;
      }
    }
    return allowed;
  } catch {
    return true; // robots.txt is advisory; a fetch failure is not a denial
  }
}
