import { describe, expect, it } from "vitest";
import { ThinkingLevel } from "@google/genai";
import { modelGeneration, priceFor, thinkingConfigFor, usesThinkingLevel } from "./models";

/**
 * This translation has broken the pipeline twice in production, both times as
 * an opaque 400 from the provider. It is pure logic with no I/O, so pinning it
 * costs nothing and catches the regression at build time instead of at the
 * first analysis after a deploy.
 */

describe("modelGeneration", () => {
  it("reads the major version, ignoring the minor", () => {
    expect(modelGeneration("gemini-3.5-flash")).toBe(3);
    expect(modelGeneration("gemini-3.1-flash-lite")).toBe(3);
    expect(modelGeneration("gemini-2.5-flash")).toBe(2);
  });

  it("tolerates the fully-qualified form the API also accepts", () => {
    expect(modelGeneration("models/gemini-3.5-flash")).toBe(3);
  });

  it("returns null for floating aliases, which carry no version", () => {
    expect(modelGeneration("gemini-flash-latest")).toBeNull();
    expect(modelGeneration("gemini-pro-latest")).toBeNull();
  });
});

describe("usesThinkingLevel", () => {
  it("routes Gemini 3 and later to thinkingLevel", () => {
    expect(usesThinkingLevel("gemini-3.5-flash")).toBe(true);
    expect(usesThinkingLevel("gemini-3.1-pro-preview")).toBe(true);
  });

  it("keeps Gemini 2.5 on thinkingBudget", () => {
    expect(usesThinkingLevel("gemini-2.5-flash")).toBe(false);
  });

  it("assumes an unversioned alias is modern", () => {
    // Every model shipped since late 2025 is generation 3+, so an unrecognised
    // name is far likelier to be newer than older. Guessing the other way
    // reintroduces the exact 400 this module exists to prevent.
    expect(usesThinkingLevel("gemini-flash-latest")).toBe(true);
  });
});

describe("thinkingConfigFor", () => {
  it("emits thinkingLevel for Gemini 3, never thinkingBudget", () => {
    const config = thinkingConfigFor("gemini-3.5-flash", "minimal");
    expect(config).toEqual({ thinkingLevel: ThinkingLevel.MINIMAL });
    // Sending both fields together is itself a 400, so the absence matters.
    expect(config).not.toHaveProperty("thinkingBudget");
  });

  it("emits thinkingBudget for Gemini 2.5, never thinkingLevel", () => {
    const config = thinkingConfigFor("gemini-2.5-flash", "minimal");
    expect(config).toEqual({ thinkingBudget: 0 });
    expect(config).not.toHaveProperty("thinkingLevel");
  });

  it("maps every effort level for both families", () => {
    const efforts = ["minimal", "low", "medium", "high"] as const;
    for (const effort of efforts) {
      expect(thinkingConfigFor("gemini-3.5-flash", effort)).toHaveProperty("thinkingLevel");
      expect(thinkingConfigFor("gemini-2.5-flash", effort)).toHaveProperty("thinkingBudget");
    }
  });

  it("omits the config entirely when no effort is requested", () => {
    // Undefined must not become a default, or every call would silently
    // override the model's own tuning.
    expect(thinkingConfigFor("gemini-3.5-flash", undefined)).toBeUndefined();
  });
});

describe("priceFor", () => {
  it("prices the current GA models", () => {
    expect(priceFor("gemini-3.5-flash")).toEqual({ input: 1.5, output: 9.0 });
    expect(priceFor("gemini-3.1-flash-lite")).toEqual({ input: 0.25, output: 1.5 });
  });

  it("matches dated and preview suffixes to their base model", () => {
    expect(priceFor("gemini-3.1-pro-preview")).toEqual({ input: 2.0, output: 12.0 });
  });

  it("falls back to Flash rates for anything unrecognised", () => {
    // Over-estimating a bill is the safer error; a new model silently costing
    // nothing would hide a real spend problem.
    expect(priceFor("gemini-9-experimental")).toEqual({ input: 1.5, output: 9.0 });
  });

  it("keeps the cheap tier genuinely cheaper, which is the point of routing", () => {
    expect(priceFor("gemini-3.1-flash-lite").input).toBeLessThan(priceFor("gemini-3.5-flash").input);
  });
});
