import { describe, it, expect } from "vitest";
import { normalizeTags, getSelectedTags } from "./tags";
import type { GenerationCategory } from "../types";

describe("normalizeTags", () => {
  it("returns an array unchanged", () => {
    expect(normalizeTags(["a", "b"])).toEqual(["a", "b"]);
  });

  it("splits a comma-separated string", () => {
    expect(normalizeTags("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace from each tag", () => {
    expect(normalizeTags("  foo  ,  bar  ")).toEqual(["foo", "bar"]);
  });

  it("filters empty segments", () => {
    expect(normalizeTags("a,,b")).toEqual(["a", "b"]);
  });

  it("returns empty array for empty string", () => {
    expect(normalizeTags("")).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe("getSelectedTags", () => {
  const categories: GenerationCategory[] = [
    {
      id: "hair",
      label: "Hair",
      group: "Appearance",
      control: "select",
      options: [
        { value: "long", label: "Long", tags: ["long hair", "flowing hair"] },
        { value: "short", label: "Short", tags: ["short hair"] },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      group: "Appearance",
      control: "select",
      options: [{ value: "blue", label: "Blue", tags: ["blue eyes"] }],
    },
  ];

  it("returns tags for matched selections", () => {
    const result = getSelectedTags(categories, { hair: "long", eyes: "blue" });
    expect(result).toEqual(["long hair", "flowing hair", "blue eyes"]);
  });

  it("returns empty array when selection does not match any option", () => {
    const result = getSelectedTags(categories, { hair: "unknown" });
    expect(result).toEqual([]);
  });

  it("skips categories with no selection", () => {
    const result = getSelectedTags(categories, { hair: "short" });
    expect(result).toEqual(["short hair"]);
  });

  it("returns empty array for empty selections", () => {
    expect(getSelectedTags(categories, {})).toEqual([]);
  });

  it("returns empty array for empty categories", () => {
    expect(getSelectedTags([], { hair: "long" })).toEqual([]);
  });
});
