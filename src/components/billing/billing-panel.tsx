"use client";

import * as React from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useUsage } from "@/hooks/use-usage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";
import { clamp, cn } from "@/lib/utils";
import type { Plan } from "@prisma/client";

export function BillingPanel() {
  const { data, isPending } = useUsage();
  const [pending, setPending] = React.useState<string | null>(null);

  async function startCheckout(plan: Plan) {
    setPending(plan);
    try {
      const { data: session } = await api.post<{ url: string }>("/api/billing/checkout", {
        plan,
        returnPath: "/settings/billing",
      });
      window.location.href = session.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open checkout.");
      setPending(null);
    }
  }

  async function openPortal() {
    setPending("portal");
    try {
      const { data: session } = await api.post<{ url: string }>("/api/billing/portal", {
        returnPath: "/settings/billing",
      });
      window.location.href = session.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the billing portal.");
      setPending(null);
    }
  }

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return null;

  const currentPlan = data.usage.plan;
  const pct = data.usage.analysesLimit > 0 ? clamp((data.usage.analysesRun / data.usage.analysesLimit) * 100, 0, 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">This billing period</CardTitle>
            <p className="text-sm text-muted-foreground">
              Resets on the first of the month. Failed analyses are refunded automatically.
            </p>
          </div>
          <Badge variant="secondary" className="font-mono">
            {currentPlan}
          </Badge>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="label-mono">Analyses</span>
              <span className="font-mono text-sm">
                {data.usage.analysesRun}
                <span className="text-muted-foreground">/{data.usage.analysesLimit}</span>
              </span>
            </div>
            <Progress value={pct} />
          </div>

          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Ads processed", value: data.usage.adsProcessed.toLocaleString() },
              { label: "Analyses left", value: String(data.usage.analysesRemaining) },
              { label: "Reports completed", value: String(data.stats.completed) },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <dt className="label-mono">{item.label}</dt>
                <dd className="font-mono text-lg">{item.value}</dd>
              </div>
            ))}
          </dl>

          {currentPlan !== "FREE" ? (
            <Button variant="outline" onClick={() => void openPortal()} disabled={pending !== null} className="self-start">
              {pending === "portal" ? <Loader2 className="animate-spin" /> : <ExternalLink />}
              Manage billing
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const isCurrent = id === currentPlan;
          const isDowngrade = PLAN_ORDER.indexOf(id) < PLAN_ORDER.indexOf(currentPlan);

          return (
            <Card key={id} className={cn(isCurrent && "border-primary/50 bg-primary/[0.04]")}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {isCurrent ? <Badge>Current</Badge> : null}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-semibold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.cadence}</span>
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </CardHeader>

              <CardContent className="flex flex-col gap-5">
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <Button variant="outline" disabled className="w-full">
                    Your plan
                  </Button>
                ) : isDowngrade ? (
                  // Downgrades and cancellations go through Stripe's portal so
                  // proration and dunning stay Stripe's problem.
                  <Button variant="outline" className="w-full" onClick={() => void openPortal()} disabled={pending !== null}>
                    Change in portal
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => void startCheckout(id)}
                    disabled={pending !== null}
                  >
                    {pending === id ? <Loader2 className="animate-spin" /> : null}
                    Upgrade to {plan.name}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
