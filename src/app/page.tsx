import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PromiseDiff, type DiffPair } from "@/components/shared/promise-diff";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";
import { DIMENSIONS, DIMENSION_LABELS, DIMENSION_QUESTIONS } from "@/types/domain";
import { getUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const DEMO: DiffPair[] = [
  { label: "Offer", ad: "30 days free. No card needed.", page: "Plans start at $29 per month", verdict: "break" },
  { label: "Headline", ad: "Set up in 60 seconds", page: "The all-in-one platform for modern teams", verdict: "drift" },
  { label: "Action", ad: "Start free trial", page: "Get started", verdict: "drift" },
  { label: "Audience", ad: "For solo operators", page: "Built for teams that ship", verdict: "drift" },
  { label: "Brand", ad: "Northwind, indigo/black", page: "Northwind, indigo/black", verdict: "match" },
];

export default async function LandingPage() {
  const user = await getUser().catch(() => null);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight">
            <span className="inline-block size-2 rounded-full bg-primary" aria-hidden />
            adfit
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Start free</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero. The thesis is the comparison itself, so it is the hero. */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="pointer-events-none absolute inset-0 grid-backdrop" aria-hidden />
          <div className="container relative flex flex-col items-center gap-10 py-20 text-center md:py-28">
            <Badge variant="outline" className="font-mono text-[11px]">
              Nine dimensions · Gemini 2.5 Flash
            </Badge>

            <div className="flex max-w-3xl flex-col gap-5">
              <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
                Your ad made a promise.
                <br />
                <span className="text-muted-foreground">Does the page keep it?</span>
              </h1>
              <p className="mx-auto max-w-xl text-pretty text-base leading-relaxed text-muted-foreground">
                Most wasted ad spend is not a bidding problem. It is that the page answers a different question than the
                ad asked, and nobody sees the two side by side. adfit puts them side by side and scores the gap.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href={user ? "/new" : "/signup"}>
                  Analyse a landing page
                  <ArrowRight />
                </Link>
              </Button>
              <p className="font-mono text-xs text-muted-foreground">Free tier · no card</p>
            </div>

            <div className="w-full max-w-3xl pt-6 text-left">
              <PromiseDiff pairs={DEMO} animate />
            </div>
          </div>
        </section>

        {/* Dimensions. A real list of what is measured, not feature marketing. */}
        <section className="border-b border-border">
          <div className="container py-20">
            <div className="flex flex-col gap-3 pb-10">
              <p className="label-mono">What gets scored</p>
              <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight">
                Nine dimensions, weighted by what a visitor actually checks in the first two seconds
              </h2>
            </div>

            <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {DIMENSIONS.map((key, i) => (
                <li key={key} className="flex flex-col gap-1.5 border-t border-border pt-4">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-sm font-medium">{DIMENSION_LABELS[key]}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{DIMENSION_QUESTIONS[key]}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-b border-border" id="pricing">
          <div className="container py-20">
            <div className="flex flex-col gap-3 pb-10">
              <p className="label-mono">Pricing</p>
              <h2 className="text-3xl font-semibold tracking-tight">Start free. Upgrade when it pays for itself.</h2>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {PLAN_ORDER.map((id) => {
                const plan = PLANS[id];
                const featured = id === "PRO";
                return (
                  <div
                    key={id}
                    className={`flex flex-col gap-6 rounded-lg border p-6 ${
                      featured ? "border-primary/50 bg-primary/[0.04]" : "border-border bg-card"
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-medium">{plan.name}</h3>
                        {featured ? <Badge>Most picked</Badge> : null}
                      </div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-3xl font-semibold tracking-tight">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                    </div>

                    <ul className="flex flex-1 flex-col gap-2.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                          <span className="text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button asChild variant={featured ? "default" : "outline"} className="w-full">
                      <Link href={user ? "/settings/billing" : "/signup"}>
                        {id === "FREE" ? "Start free" : `Choose ${plan.name}`}
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
          <p className="font-mono text-xs text-muted-foreground">adfit — ad-to-landing-page fit analyzer</p>
          <nav className="flex items-center gap-5 text-xs text-muted-foreground">
            <Link href="/login" className="transition-colors hover:text-foreground">
              Log in
            </Link>
            <Link href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
