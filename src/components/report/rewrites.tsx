import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FitReport } from "@/types/domain";

const SLOT_LABELS: Record<string, string> = {
  headline: "Headline",
  subheadline: "Subheadline",
  cta: "Call to action",
  heroAngle: "Hero direction",
};

export function Rewrites({ rewrites }: { rewrites: FitReport["rewrites"] }) {
  const slots = Object.entries(rewrites).filter(
    (entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0,
  );
  if (slots.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Copy you can paste</CardTitle>
        <p className="text-sm text-muted-foreground">
          Written to continue the ad rather than restate the product.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {slots.map(([slot, options]) => (
          <div key={slot} className="flex flex-col gap-2">
            <p className="label-mono">{SLOT_LABELS[slot] ?? slot}</p>
            <ul className="flex flex-col gap-2">
              {options.map((option) => (
                <li key={option} className="rounded-md border border-border bg-muted/30 p-3 font-mono text-sm leading-snug">
                  {option}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
