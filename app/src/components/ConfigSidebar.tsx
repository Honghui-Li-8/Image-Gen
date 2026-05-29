import { ConfigGroup } from "./ConfigGroup";
import { SeedControl } from "./SeedControl";
import { TagInput } from "./TagInput";
import type {
  GenerationCategory,
  ModelConfig,
  Work,
  WorkUpdater,
} from "../types";

type OptionsStatus = "loading" | "ready" | "failed";

interface ConfigSidebarProps {
  activeModel: ModelConfig | null;
  activeWork: Work | undefined;
  commitTag: () => void;
  customTags: string[];
  isDirty: boolean;
  isSaving: boolean;
  missingFieldIds: string[];
  models: Record<string, ModelConfig>;
  onSaveWork: () => void;
  optionsStatus: OptionsStatus;
  removeTag: (tag: string) => void;
  showGenerationValidation: boolean;
  updateActiveWork: (updater: WorkUpdater) => void;
}

const groupCategories = (
  categories: GenerationCategory[],
): Record<string, GenerationCategory[]> => {
  return categories.reduce((groups, category) => {
    groups[category.group] = [...(groups[category.group] || []), category];
    return groups;
  }, {} as Record<string, GenerationCategory[]>);
};

// Sort groups by size descending, greedy-assign to the shorter column,
// then restore original insertion order within each column.
const distributeGroups = (
  groups: Record<string, GenerationCategory[]>,
): [Array<[string, GenerationCategory[]]>, Array<[string, GenerationCategory[]]>] => {
  const indexed = Object.entries(groups).map((entry, idx) => ({
    entry,
    idx,
    weight: entry[1].length,
  }));

  const byWeight = [...indexed].sort((a, b) => b.weight - a.weight);
  const cols: [typeof indexed, typeof indexed] = [[], []];
  const weights = [0, 0];

  for (const item of byWeight) {
    const col = weights[0] <= weights[1] ? 0 : 1;
    cols[col].push(item);
    weights[col] += item.weight;
  }

  cols[0].sort((a, b) => a.idx - b.idx);
  cols[1].sort((a, b) => a.idx - b.idx);

  return [cols[0].map((i) => i.entry), cols[1].map((i) => i.entry)];
};

const pickRandom = <T,>(items: T[]): T | undefined => {
  return items[Math.floor(Math.random() * items.length)];
};

const randomizeCategorySelections = (model: ModelConfig) => {
  return model.categories.reduce(
    (nextSelections, category) => {
      const option = pickRandom(category.options);
      if (option) {
        nextSelections[category.id] = option.value;
      }
      return nextSelections;
    },
    {} as Record<string, string>,
  );
};

export const ConfigSidebar = ({
  activeModel,
  activeWork,
  commitTag,
  customTags,
  isDirty,
  isSaving,
  missingFieldIds,
  models,
  onSaveWork,
  optionsStatus,
  removeTag,
  showGenerationValidation,
  updateActiveWork,
}: ConfigSidebarProps) => {
  const modelEntries = Object.values(models);
  const missingFields = new Set(missingFieldIds);

  return (
    <aside className="config-sidebar">
      <div className="config-header">
        <div className="config-header-main">
          <h2>Configuration</h2>
          {modelEntries.length > 0 ? (
            <select
              className="model-select"
              value={activeWork?.selectedModel || ""}
              onChange={(event) => {
                const newModel = models[event.target.value];
                if (!newModel) return;
                updateActiveWork((work) => ({
                  ...work,
                  selectedModel: newModel.id,
                  selections: {},
                  selectedPreset: newModel.outputPresets[0]?.id || "",
                }));
              }}
            >
              {modelEntries.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="config-header-actions">
          <button
            className="config-random-button"
            aria-label="Randomize configuration"
            type="button"
            disabled={!activeWork || !activeModel}
            onClick={() => {
              if (!activeModel) return;
              const selections = randomizeCategorySelections(activeModel);
              updateActiveWork((work) => ({
                ...work,
                selections,
              }));
            }}
          >
            <svg aria-hidden="true" viewBox="0 -4 32 32">
              <path d="m24.983 8.539v-2.485h-4.902l-3.672 5.945-2.099 3.414-3.24 5.256c-.326.51-.889.844-1.53.845h-9.54v-3.568h8.538l3.673-5.946 2.099-3.414 3.24-5.256c.325-.509.886-.843 1.525-.845h5.904v-2.485l7.417 4.27-7.417 4.27z" />
              <path d="m12.902 6.316-.63 1.022-1.468 2.39-2.265-3.675h-8.538v-3.568h9.54c.641.001 1.204.335 1.526.838l.004.007 1.836 2.985z" />
              <path d="m24.983 24v-2.485h-5.904c-.639-.002-1.201-.336-1.521-.838l-.004-.007-1.836-2.985.63-1.022 1.468-2.39 2.264 3.675h4.902v-2.485l7.417 4.27-7.417 4.27z" />
            </svg>
          </button>
          <button
            className="config-save-button"
            type="button"
            disabled={!isDirty || isSaving || !activeWork}
            onClick={onSaveWork}
          >
            {isSaving ? "Saving" : "Save"}
          </button>
        </div>
      </div>

      <div className="options-scroll">
        {optionsStatus === "failed" ? (
          <p className="error-text">
            Could not load generation options from the API.
          </p>
        ) : null}

        {activeModel ? (
          <>
            {(() => {
              const [leftGroups, rightGroups] = distributeGroups(
                groupCategories(activeModel.categories),
              );

              const renderGroups = (groups: Array<[string, GenerationCategory[]]>) =>
                groups.map(([group, categories]) => (
                  <ConfigGroup key={group} title={group}>
                    {categories.map((category) => (
                      <label
                        className={`field ${
                          showGenerationValidation && missingFields.has(category.id)
                            ? "field--error"
                            : ""
                        }`}
                        key={category.id}
                      >
                        <span>{category.label}</span>
                        <select
                          className={
                            activeWork?.selections?.[category.id]
                              ? ""
                              : "select-placeholder"
                          }
                          value={activeWork?.selections?.[category.id] || ""}
                          onChange={(event) =>
                            updateActiveWork((work) => ({
                              ...work,
                              selections: {
                                ...work.selections,
                                [category.id]: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Select {category.label}</option>
                          {category.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </ConfigGroup>
                ));

              return (
                <div className="options-columns">
                  <div className="options-column">{renderGroups(leftGroups)}</div>
                  <div className="options-column">{renderGroups(rightGroups)}</div>
                </div>
              );
            })()}

            <hr className="options-divider" />

            <ConfigGroup
              className="tag-group tag-editor--options"
              title={`Additional Tags [ ${customTags.length} ]`}
            >
              <TagInput
                customTags={customTags}
                onCommitTag={commitTag}
                onRemoveTag={removeTag}
                onUpdateDraft={(tagDraft) => updateActiveWork({ tagDraft })}
                tagDraft={activeWork?.tagDraft}
              />
            </ConfigGroup>

            <label
              className={`field ${
                showGenerationValidation && missingFields.has("selectedPreset")
                  ? "field--error"
                  : ""
              }`}
            >
              <span>Output Size</span>
              <select
                className={
                  activeWork?.selectedPreset ? "" : "select-placeholder"
                }
                value={activeWork?.selectedPreset || ""}
                onChange={(event) =>
                  updateActiveWork({ selectedPreset: event.target.value })
                }
              >
                <option value="">Select output size</option>
                {activeModel.outputPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label} ({preset.width} x {preset.height})
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className="prompt-dock">
        <label
          className={`field seed-dock-row ${
            showGenerationValidation && missingFields.has("seed")
              ? "field--error"
              : ""
          }`}
        >
          <span>Seed</span>
          <SeedControl
            seed={activeWork?.seed}
            onChange={(seed) => updateActiveWork({ seed })}
          />
        </label>

        <section className="prompt-editor">
          <div className="dock-heading">
            <h3>Prompt</h3>
          </div>
          <textarea
            value={activeWork?.additionalPrompt || ""}
            onChange={(event) =>
              updateActiveWork({ additionalPrompt: event.target.value })
            }
            placeholder="standing on a neon-lit rooftop at night"
          />
        </section>
      </div>
    </aside>
  );
};
