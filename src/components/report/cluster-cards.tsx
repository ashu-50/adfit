import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AD_ANGLE_LABELS, type AdClusterResult } from "@/types/domain";

/**
 * Shown only when more than one ad was supplied. A single ad has no angle to
 * cluster against, and rendering a one-row "cluster" would imply an analysis
 * that did not happen.
 */
export function ClusterCards({ clusters }: { clusters: AdClusterResult[] }) {
  if (clusters.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-medium">Angles and the pages they deserve</h2>
        <p className="text-sm text-muted-foreground">
          Your ads split into {clusters.length} {clusters.length === 1 ? "angle" : "angles"}. One page cannot serve all
          of them equally — here is what each would want.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {clusters.map((cluster) => (
          <Card key={`${cluster.angle}-${cluster.label}`}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{AD_ANGLE_LABELS[cluster.angle]}</Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {cluster.adIndexes.map((i) => `ad ${i + 1}`).join(", ")}
                </Badge>
              </div>
              <CardTitle className="text-base">{cluster.label}</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{cluster.rationale}</p>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <Separator />

              <div className="flex flex-col gap-1.5">
                <p className="label-mono">Headline</p>
                <p className="font-mono text-sm leading-snug">{cluster.blueprint.headline}</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="label-mono">Subheadline</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{cluster.blueprint.subheadline}</p>
              </div>

              {cluster.blueprint.benefits.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="label-mono">Benefits</p>
                  <ul className="flex flex-col gap-1.5">
                    {cluster.blueprint.benefits.map((benefit) => (
                      <li key={benefit} className="text-sm leading-relaxed text-muted-foreground">
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {cluster.blueprint.faq.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="label-mono">FAQ to answer</p>
                  <dl className="flex flex-col gap-2">
                    {cluster.blueprint.faq.map((entry) => (
                      <div key={entry.question} className="flex flex-col gap-0.5">
                        <dt className="text-sm font-medium">{entry.question}</dt>
                        <dd className="text-sm leading-relaxed text-muted-foreground">{entry.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <p className="label-mono">Call to action</p>
                <p className="font-mono text-sm">{cluster.blueprint.cta}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
