import { z } from "zod";

/** Only paid tiers can be checked out. Downgrades happen in the Stripe portal. */
export const checkoutSchema = z.object({
  plan: z.enum(["PRO", "ENTERPRISE"], { message: "Pick a paid plan." }),
  /** Path within the app to land on after Stripe. Relative only, so an open
   *  redirect cannot be smuggled through the success_url. */
  returnPath: z
    .string()
    .regex(/^\/[\w\-./?=&%]*$/, "Return path must be a relative app path.")
    .max(200)
    .optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const portalSchema = z.object({
  returnPath: z
    .string()
    .regex(/^\/[\w\-./?=&%]*$/, "Return path must be a relative app path.")
    .max(200)
    .optional(),
});
