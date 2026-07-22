"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";

/**
 * Form primitives. Every form in the app composes these rather than stacking
 * divs, so label/description/error placement and the invalid state are decided
 * once instead of per form.
 */

const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("flex flex-col gap-5", className)} {...props} />,
);
FieldGroup.displayName = "FieldGroup";

const Field = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <div ref={ref} data-invalid={invalid || undefined} className={cn("flex flex-col gap-2", className)} {...props} />
  ),
);
Field.displayName = "Field";

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => <Label ref={ref} className={cn("text-sm", className)} {...props} />);
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs leading-relaxed text-muted-foreground", className)} {...props} />
  ),
);
FieldDescription.displayName = "FieldDescription";

const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p ref={ref} className={cn("text-xs font-medium text-destructive", className)} {...props}>
        {children}
      </p>
    );
  },
);
FieldError.displayName = "FieldError";

const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => <fieldset ref={ref} className={cn("flex flex-col gap-3", className)} {...props} />,
);
FieldSet.displayName = "FieldSet";

const FieldLegend = React.forwardRef<HTMLLegendElement, React.HTMLAttributes<HTMLLegendElement>>(
  ({ className, ...props }, ref) => (
    <legend ref={ref} className={cn("text-sm font-medium", className)} {...props} />
  ),
);
FieldLegend.displayName = "FieldLegend";

export { Field, FieldGroup, FieldLabel, FieldDescription, FieldError, FieldSet, FieldLegend };
