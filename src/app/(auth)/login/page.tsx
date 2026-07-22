import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    // useSearchParams needs a Suspense boundary or the whole route opts out of
    // static rendering with a build-time warning.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
