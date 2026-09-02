import { lookup as dnsLookup } from "node:dns";
import { lookup as dnsLookupPromises } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
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
    addresses = await dnsLookupPromises(host, { all: true });
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

/**
 * Closes the DNS-rebinding gap in assertPublicUrl.
 *
 * assertPublicUrl resolves the hostname once, up front, purely to fail fast
 * with a clear error before we do anything else (robots check, redirect
 * loop). But `fetch()` re-resolves DNS independently at connect time — an
 * attacker who controls the DNS record for their own domain can pass the
 * up-front check with a public IP, then flip the record to 169.254.169.254
 * (or any private range) before the real connection happens. That's a
 * standard SSRF bypass.
 *
 * The only reliable fix is to re-run the same private-address check at the
 * exact moment a socket is opened, using a custom `lookup` on the dispatcher.
 * This does not reuse the earlier resolution (a single pinned IP would break
 * DNS-based load balancing and multi-A-record hosts); it re-resolves and
 * re-checks every time, but does so atomically with the connection itself,
 * so there is no window for the record to change in between.
 */
export function createSafeDispatcher(): Agent {
  const safeLookup: LookupFunction = (hostname, _options, callback) => {
    // We deliberately ignore the caller-supplied lookup options (family/hints)
    // and always resolve every address ourselves, so every candidate can be
    // checked against the private-range list before any one of them is used.
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, "", 4);
      if (addresses.length === 0) {
        return callback(new Error(`Could not resolve ${hostname}.`), "", 4);
      }
      if (addresses.some((a) => isPrivateAddress(a.address))) {
        return callback(new Error(`${hostname} resolved to a private address; refusing to connect.`), "", 4);
      }
      const chosen = addresses[0]!;
      callback(null, chosen.address, chosen.family);
    });
  };

  return new Agent({ connect: { lookup: safeLookup } });
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