/**
 * Splits a Postgres script into individual statements.
 *
 * Needed because Prisma's `$executeRawUnsafe` uses the extended query protocol,
 * which refuses more than one command per call. A naive split on ";" corrupts
 * the plpgsql function in rls.sql, whose body is dollar-quoted and full of
 * semicolons — hence the dollar-tag tracking below.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const char = sql[i]!;
    const next = sql[i + 1];

    if (inLineComment) {
      current += char;
      if (char === "\n") inLineComment = false;
      i++;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }

    if (dollarTag) {
      if (char === "$" && sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      i++;
      continue;
    }

    if (inSingle) {
      current += char;
      // '' is an escaped quote, not the end of the literal.
      if (char === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (char === "'") inSingle = false;
      i++;
      continue;
    }

    if (inDouble) {
      current += char;
      if (char === '"') inDouble = false;
      i++;
      continue;
    }

    if (char === "-" && next === "-") {
      inLineComment = true;
      current += char;
      i++;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      current += char;
      i++;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      current += char;
      i++;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      current += char;
      i++;
      continue;
    }

    if (char === "$") {
      // $$ or $tag$ opens a dollar-quoted block.
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      i++;
      continue;
    }

    current += char;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  // Drop comment-only fragments; they are valid input but not worth a round trip.
  return statements.filter((s) => s.split(/\r?\n/).some((line) => line.trim() && !line.trim().startsWith("--")));
}
