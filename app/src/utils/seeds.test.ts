import { describe, it, expect } from "vitest";
import { generateSeed, stepSeed } from "./seeds";

describe("generateSeed", () => {
  it("returns a string", () => {
    expect(typeof generateSeed()).toBe("string");
  });

  it("returns a non-negative integer string", () => {
    const seed = Number(generateSeed());
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  it("stays within 32-bit range", () => {
    for (let i = 0; i < 100; i++) {
      const seed = Number(generateSeed());
      expect(seed).toBeLessThan(2 ** 32);
    }
  });
});

describe("stepSeed", () => {
  it("increments the seed by the given amount", () => {
    expect(stepSeed("100", 1)).toBe("101");
    expect(stepSeed("100", 10)).toBe("110");
  });

  it("decrements the seed by the given amount", () => {
    expect(stepSeed("100", -1)).toBe("99");
    expect(stepSeed("100", -50)).toBe("50");
  });

  it("clamps to 0 when result would be negative", () => {
    expect(stepSeed("5", -10)).toBe("0");
    expect(stepSeed("0", -1)).toBe("0");
  });

  it("treats undefined seed as 0", () => {
    expect(stepSeed(undefined, 5)).toBe("5");
  });

  it("treats empty string as 0", () => {
    expect(stepSeed("", 3)).toBe("3");
  });

  it("treats non-numeric string as 0 base", () => {
    expect(stepSeed("abc", 0)).toBe("0");
  });
});
