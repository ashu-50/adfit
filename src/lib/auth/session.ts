import { cache } from "react";
import { createSupabaseServerClient } from "./supabase";
import { prisma } from "@/lib/db/client";
import { unauthorized } from "@/lib/http/errors";
import type { Plan } from "@prisma/client";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  plan: Plan;
  stripeCustomerId: string | null;
};

/**
 * `cache` dedupes this across a single render pass, so a layout, a page and
 * three server components all share one auth round trip.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient();

  // getUser() revalidates against the auth server. getSession() only decodes the
  // cookie, which a client can forge, so it is never used for authorisation.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, email: true, fullName: true, avatarUrl: true, plan: true, stripeCustomerId: true },
  });

  if (profile) return profile;

  // The signup trigger normally creates this row. If it has not landed yet
  // (replication lag, or local dev without rls.sql), create it on first read.
  return prisma.user.create({
    data: {
      id: data.user.id,
      email: data.user.email ?? `${data.user.id}@placeholder.local`,
      fullName: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      avatarUrl: (data.user.user_metadata?.avatar_url as string | undefined) ?? null,
    },
    select: { id: true, email: true, fullName: true, avatarUrl: true, plan: true, stripeCustomerId: true },
  });
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser();
  if (!user) throw unauthorized();
  return user;
}
