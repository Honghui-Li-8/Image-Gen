import { describe, it, expect } from "vitest";
import { mapBackendWork } from "./worksApi";
import { distributeGroups as distributeGroupsFromSidebar } from "../components/ConfigSidebar";
import type { BackendWork } from "./worksApi";
import type { GenerationCategory } from "../types";

const makeCategory = (id: string, optionCount: number): GenerationCategory => ({
  id,
  label: id,
  group: id,
  control: "select",
  options: Array.from({ length: optionCount }, (_, i) => ({
    value: `${id}-${i}`,
    label: `${id} ${i}`,
    tags: [],
  })),
});

describe("mapBackendWork", () => {
  const base: BackendWork = {
    id: "w1",
    name: "Test Work",
    config: {
      selectedModel: "model-a",
      selections: { hair: "long" },
      selectedPreset: "portrait",
      seed: "42",
      additionalTags: ["tag1"],
      additionalPrompt: "rooftop",
    },
    activeGenerationId: null,
    updatedAt: "2026-01-01T00:00:00Z",
    generations: [],
  };

  it("maps basic fields correctly", () => {
    const work = mapBackendWork(base);
    expect(work.id).toBe("w1");
    expect(work.name).toBe("Test Work");
    expect(work.selectedModel).toBe("model-a");
    expect(work.seed).toBe("42");
    expect(work.additionalPrompt).toBe("rooftop");
    expect(work.savedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("starts with empty images when no generations", () => {
    const work = mapBackendWork(base);
    expect(work.images).toEqual([]);
    expect(work.activeImageIndex).toBe(0);
  });

  it("maps imageUrl to url and modelId to selectedModel in image config", () => {
    const backendWork: BackendWork = {
      ...base,
      activeGenerationId: "gen1",
      generations: [
        {
          id: "gen1",
          status: "completed",
          imageUrl: "https://example.com/image.png",
          config: {
            modelId: "model-a",
            selections: { hair: "long" },
            selectedPreset: "portrait",
            seed: "42",
            additionalTags: [],
            additionalPrompt: "",
          },
        },
      ],
    };
    const work = mapBackendWork(backendWork);
    expect(work.images).toHaveLength(1);
    expect(work.images[0].url).toBe("https://example.com/image.png");
    expect(work.images[0].config?.selectedModel).toBe("model-a");
  });

  it("sets activeImageIndex to last image index", () => {
    const backendWork: BackendWork = {
      ...base,
      generations: [
        { id: "g1", status: "completed", imageUrl: "https://a.com/1.png" },
        { id: "g2", status: "completed", imageUrl: "https://a.com/2.png" },
        { id: "g3", status: "completed", imageUrl: "https://a.com/3.png" },
      ],
    };
    const work = mapBackendWork(backendWork);
    expect(work.activeImageIndex).toBe(2);
  });

  it("skips generations with no imageUrl", () => {
    const backendWork: BackendWork = {
      ...base,
      generations: [
        { id: "g1", status: "running", imageUrl: null },
        { id: "g2", status: "completed", imageUrl: "https://a.com/img.png" },
      ],
    };
    const work = mapBackendWork(backendWork);
    expect(work.images).toHaveLength(1);
    expect(work.images[0].id).toBe("g2");
  });

  it("initialises viewingConfig as null", () => {
    expect(mapBackendWork(base).viewingConfig).toBeNull();
  });

  it("initialises tagDraft as empty string", () => {
    expect(mapBackendWork(base).tagDraft).toBe("");
  });
});

describe("distributeGroups", () => {
  it("puts single group into left column", () => {
    const groups = { A: [makeCategory("a", 3)] };
    const [left, right] = distributeGroupsFromSidebar(groups);
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(0);
  });

  it("balances two equal-weight groups across columns", () => {
    const groups = {
      A: [makeCategory("a", 2), makeCategory("b", 2)],
      B: [makeCategory("c", 2), makeCategory("d", 2)],
    };
    const [left, right] = distributeGroupsFromSidebar(groups);
    expect(left.length + right.length).toBe(2);
  });

  it("assigns the heavier group to the shorter column", () => {
    const groups = {
      Small: [makeCategory("s", 1)],
      Large: [makeCategory("l1", 5), makeCategory("l2", 5)],
    };
    const [left, right] = distributeGroupsFromSidebar(groups);
    const allGroups = [...left, ...right];
    expect(allGroups).toHaveLength(2);
    const largeEntry = allGroups.find(([name]) => name === "Large");
    expect(largeEntry).toBeDefined();
  });

  it("preserves insertion order within each column", () => {
    const groups = {
      First: [makeCategory("a", 2)],
      Second: [makeCategory("b", 2)],
      Third: [makeCategory("c", 1)],
    };
    const [left, right] = distributeGroupsFromSidebar(groups);
    const allNames = [...left, ...right].map(([name]) => name);
    const firstIdx = allNames.indexOf("First");
    const secondIdx = allNames.indexOf("Second");
    expect(firstIdx).toBeLessThan(secondIdx);
  });
});
