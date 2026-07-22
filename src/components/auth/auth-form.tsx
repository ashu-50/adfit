"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { clientEnv } from "@/lib/env";

const schema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Passwords are at least 8 characters."),
});

type FormValues = z.infer<typeof schema>;

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.7 2.7 1.2 3.4.9.1-.7.4-1.2.7-1.5-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, setPending] = React.useState<"email" | "google" | "github" | null>(null);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const next = params.get("next") ?? "/dashboard";
  const urlError = params.get("error");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const callbackUrl = React.useMemo(() => {
    const url = new URL("/auth/callback", clientEnv.NEXT_PUBLIC_APP_URL);
    url.searchParams.set("next", next);
    return url.toString();
  }, [next]);

  async function onSubmit(values: FormValues) {
    setPending("email");
    const supabase = createSupabaseBrowserClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: values.email,
          password: values.password,
          options: { emailRedirectTo: callbackUrl },
        });
        if (error) throw error;

        // With email confirmation on, there is no session yet — say so rather
        // than redirecting to a dashboard that will bounce them back.
        if (!data.session) {
          setSentTo(values.email);
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });
        if (error) throw error;
      }

      router.push(next);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not work. Try again.";
      toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function onOAuth(provider: "google" | "github") {
    setPending(provider);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl } });
    if (error) {
      toast.error(error.message);
      setPending(null);
    }
    // On success the browser navigates away; no state reset needed.
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We sent a confirmation link to <span className="font-mono text-foreground">{sentTo}</span>. Open it to finish
          creating your account.
        </p>
        <Button variant="outline" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "login" ? "Log in to adfit" : "Create your account"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "login"
            ? "Pick up where your last analysis left off."
            : "Five analyses a month on the free tier, no card required."}
        </p>
      </div>

      {urlError ? (
        <Alert variant="destructive">
          <AlertDescription>{urlError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Button variant="outline" onClick={() => void onOAuth("google")} disabled={pending !== null}>
          {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleMark />}
          Continue with Google
        </Button>
        <Button variant="outline" onClick={() => void onOAuth("github")} disabled={pending !== null}>
          {pending === "github" ? <Loader2 className="animate-spin" /> : <GithubMark />}
          Continue with GitHub
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="label-mono">or</span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field invalid={Boolean(form.formState.errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError>{form.formState.errors.email?.message}</FieldError>
          </Field>

          <Field invalid={Boolean(form.formState.errors.password)}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              aria-invalid={Boolean(form.formState.errors.password)}
              {...form.register("password")}
            />
            <FieldError>{form.formState.errors.password?.message}</FieldError>
          </Field>

          <Button type="submit" disabled={pending !== null}>
            {pending === "email" ? <Loader2 className="animate-spin" /> : null}
            {mode === "login" ? "Log in" : "Create account"}
          </Button>
        </FieldGroup>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link href="/signup" className="text-foreground underline underline-offset-4">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have one?{" "}
            <Link href="/login" className="text-foreground underline underline-offset-4">
              Log in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
