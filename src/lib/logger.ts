type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

/** Structured single-line JSON so Vercel/Railway log drains stay greppable. */
function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else process.stdout.write(line + "\n");
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
  child: (base: Record<string, unknown>) => ({
    debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, { ...base, ...meta }),
    info: (m: string, meta?: Record<string, unknown>) => emit("info", m, { ...base, ...meta }),
    warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, { ...base, ...meta }),
    error: (m: string, meta?: Record<string, unknown>) => emit("error", m, { ...base, ...meta }),
  }),
};
