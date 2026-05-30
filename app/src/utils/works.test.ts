import { describe, it, expect } from "vitest";
import { getMissingFieldIds } from "./works";
import type { ModelConfig, Work } from "../types";

const baseModel: ModelConfig = {
  id: "model-a",
  label: "Model A",
  tags: [],
  additionalTagSuggestions: [],
  categories: [
    {
      id: "hair",
      label: "Hair",
      group: "Appearance",
      control: "select",
      options: [
        { value: "long", label: "Long", tags: [] },
        { value: "short", label: "Short", tags: [] },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      group: "Appearance",
      control: "select",
      options: [{ value: "blue", label: "Blue", tags: [] }],
    },
  ],
  outputPresets: [
    { id: "portrait", label: "Portrait", width: 768, height: 1344 },
  ],
};

const baseWork: Work = {
  id: "w1",
  name: "Work 1",
  status: "idle",
  progress: 0,
  selectedModel: "model-a",
  selections: { hair: "long", eyes: "blue" },
  selectedPreset: "portrait",
  seed: "12345",
  additionalTags: [],
  tagDraft: "",
  additionalPrompt: "",
  images: [],
  activeImageIndex: 0,
  savedAt: null,
  viewingConfig: null,
};

describe("getMissingFieldIds", () => {
  it("returns empty array when all fields are valid", () => {
    expect(getMissingFieldIds(baseWork, baseModel)).toEqual([]);
  });

  it("includes category id when selection is missing", () => {
    const work = { ...baseWork, selections: { eyes: "blue" } };
    expect(getMissingFieldIds(work, baseModel)).toContain("hair");
  });

  it("includes category id when selection value is invalid", () => {
    const work = { ...baseWork, selections: { hair: "invalid", eyes: "blue" } };
    expect(getMissingFieldIds(work, baseModel)).toContain("hair");
    expect(getMissingFieldIds(work, baseModel)).not.toContain("eyes");
  });

  it("includes selectedPreset when preset is missing", () => {
    const work = { ...baseWork, selectedPreset: "" };
    expect(getMissingFieldIds(work, baseModel)).toContain("selectedPreset");
  });

  it("includes selectedPreset when preset id is not in model", () => {
    const work = { ...baseWork, selectedPreset: "nonexistent" };
    expect(getMissingFieldIds(work, baseModel)).toContain("selectedPreset");
  });

  it("includes seed when seed is empty", () => {
    const work = { ...baseWork, seed: "" };
    expect(getMissingFieldIds(work, baseModel)).toContain("seed");
  });

  it("includes seed when seed is whitespace only", () => {
    const work = { ...baseWork, seed: "   " };
    expect(getMissingFieldIds(work, baseModel)).toContain("seed");
  });

  it("returns all missing fields when nothing is filled", () => {
    const work = { ...baseWork, selections: {}, selectedPreset: "", seed: "" };
    const missing = getMissingFieldIds(work, baseModel);
    expect(missing).toContain("hair");
    expect(missing).toContain("eyes");
    expect(missing).toContain("selectedPreset");
    expect(missing).toContain("seed");
  });
});
