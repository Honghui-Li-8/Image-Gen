import { memo, useMemo, useState } from "react";
import { ConfigGroup } from "./ConfigGroup";
import { SeedControl } from "./SeedControl";
import { TagInput } from "./TagInput";
import { randomizeCategorySelections } from "../utils/batchGeneration";
import type {
  GenerationCategory,
  ModelConfig,
  OptionsStatus,
  Work,
  WorkConfig,
  WorkUpdater,
} from "../types";

interface ConfigSidebarProps {
  activeModel: ModelConfig | null;
  activeWork: Work | undefined;
  commitTag: () => void;
  customTags: string[];
  isDirty: boolean;
  isGenerationLocked: boolean;
  isSaving: boolean;
  missingFieldIds: string[];
  models: Record<string, ModelConfig>;
  onRestoreViewing: () => void;
  onRetryOptions: () => void;
  onSaveWork: () => void;
  optionsStatus: OptionsStatus;
  removeTag: (tag: string) => void;
  showGenerationValidation: boolean;
  updateActiveWork: (updater: WorkUpdater) => void;
}

const groupCategories = (
  categories: GenerationCategory[]
): Record<string, GenerationCategory[]> => {
  return categories.reduce(
    (groups, category) => {
      groups[category.group] = [...(groups[category.group] || []), category];
      return groups;
    },
    {} as Record<string, GenerationCategory[]>
  );
};

// Sort groups by size descending, greedy-assign to the shorter column,
// then restore original insertion order within each column.
export const distributeGroups = (
  groups: Record<string, GenerationCategory[]>
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

interface CategoryColumnsProps {
  categories: GenerationCategory[];
  isViewing: boolean;
  showGenerationValidation: boolean;
  missingFields: Set<string>;
  activeSelections: Record<string, string> | undefined;
  displaySelections: Record<string, string> | undefined;
  updateActiveWork: (updater: WorkUpdater) => void;
}

const CategoryColumns = memo(
  ({
    categories,
    isViewing,
    showGenerationValidation,
    missingFields,
    activeSelections,
    displaySelections,
    updateActiveWork,
  }: CategoryColumnsProps) => {
    const [leftGroups, rightGroups] = useMemo(
      () => distributeGroups(groupCategories(categories)),
      [categories]
    );

    const selectionValue = (category: GenerationCategory) => {
      const selectedValue = (displaySelections ?? activeSelections)?.[category.id] ?? "";
      return category.options.some((option) => option.value === selectedValue) ? selectedValue : "";
    };

    const renderGroups = (groups: Array<[string, GenerationCategory[]]>) =>
      groups.map(([group, cats]) => (
        <ConfigGroup key={group} title={group}>
          {cats.map((category) => (
            <label
              className={`field ${
                !isViewing && showGenerationValidation && missingFields.has(category.id)
                  ? "field--error"
                  : ""
              }`}
              key={category.id}
            >
              <span>{category.label}</span>
              <select
                className={selectionValue(category) ? "" : "select-placeholder"}
                value={selectionValue(category)}
                disabled={isViewing}
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
  }
);

const PROMPT_EXAMPLE =
  "She stands quietly outside a small neighborhood cafe, one hand lightly resting near the strap of her bag while the other hangs relaxed at her side. The street is calm, with soft afternoon light reflecting off the cafe windows and a few fallen leaves moving gently across the sidewalk.\n\nHer eyes look warm and slightly thoughtful, like she just noticed someone familiar approaching. The mood is casual and peaceful, with a small friendly smile and a relaxed posture that feels natural rather than posed.";

export const ConfigSidebar = ({
  activeModel,
  activeWork,
  commitTag,
  customTags,
  isDirty,
  isGenerationLocked,
  isSaving,
  missingFieldIds,
  models,
  onRestoreViewing,
  onRetryOptions,
  onSaveWork,
  optionsStatus,
  removeTag,
  showGenerationValidation,
  updateActiveWork,
}: ConfigSidebarProps) => {
  const [showPromptExample, setShowPromptExample] = useState(false);
  const modelEntries = Object.values(models);
  const missingFields = useMemo(() => new Set(missingFieldIds), [missingFieldIds]);
  const isViewing = activeWork?.viewingConfig !== null && activeWork?.viewingConfig !== undefined;
  const isEditingDisabled = isViewing || isGenerationLocked;
  const displayConfig: WorkConfig | null = activeWork?.viewingConfig ?? null;

  const selectedPreset = displayConfig?.selectedPreset ?? activeWork?.selectedPreset ?? "";
  const presetValue = activeModel?.outputPresets.some((preset) => preset.id === selectedPreset)
    ? selectedPreset
    : "";

  return (
    <aside className="config-sidebar">
      <div className="config-header">
        <div className="config-header-main">
          <h2>Configuration</h2>
          {modelEntries.length > 0 ? (
            <select
              className="model-select"
              value={(displayConfig?.selectedModel ?? activeWork?.selectedModel) || ""}
              disabled={isEditingDisabled}
              onChange={(event) => {
                const newModel = models[event.target.value];
                if (!newModel) return;
                const newCategoryIds = new Set(newModel.categories.map((c) => c.id));
                updateActiveWork((work) => ({
                  ...work,
                  selectedModel: newModel.id,
                  selections: Object.fromEntries(
                    Object.entries(work.selections ?? {}).filter(([id]) => newCategoryIds.has(id))
                  ),
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
          {isViewing ? (
            <>
              <span className="config-viewing-hint">Viewing past generation</span>
              <button className="config-save-button" type="button" onClick={onRestoreViewing}>
                Restore
              </button>
            </>
          ) : (
            <>
              <button
                className="config-random-button"
                aria-label="Randomize configuration"
                type="button"
                disabled={!activeWork || !activeModel || isGenerationLocked}
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
                disabled={!isDirty || isSaving || !activeWork || isGenerationLocked}
                onClick={onSaveWork}
              >
                {isSaving ? "Saving" : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="options-scroll">
        {optionsStatus === "failed" ? (
          <div className="options-error">
            <p className="error-text">Could not load generation options from the API.</p>
            <button type="button" className="options-retry-button" onClick={onRetryOptions}>
              Retry
            </button>
          </div>
        ) : null}

        {activeModel ? (
          <>
            <CategoryColumns
              categories={activeModel.categories}
              isViewing={isEditingDisabled}
              showGenerationValidation={showGenerationValidation}
              missingFields={missingFields}
              activeSelections={activeWork?.selections}
              displaySelections={displayConfig?.selections}
              updateActiveWork={updateActiveWork}
            />

            <hr className="options-divider" />

            <ConfigGroup
              className="tag-group tag-editor--options"
              title={`Additional Tags [ ${(displayConfig?.additionalTags ?? customTags).length} ]`}
            >
              {isEditingDisabled ? (
                <div className="tag-list--readonly">
                  {(displayConfig?.additionalTags ?? customTags).map((tag) => (
                    <span key={tag} className="tag-chip">
                      {tag}
                    </span>
                  ))}
                  {!(displayConfig?.additionalTags ?? customTags).length && (
                    <span className="tag-empty">No additional tags</span>
                  )}
                </div>
              ) : (
                <TagInput
                  customTags={customTags}
                  onCommitTag={commitTag}
                  onRemoveTag={removeTag}
                  onUpdateDraft={(tagDraft) => updateActiveWork({ tagDraft })}
                  tagDraft={activeWork?.tagDraft}
                />
              )}
            </ConfigGroup>

            <label
              className={`field ${
                !isViewing && showGenerationValidation && missingFields.has("selectedPreset")
                  ? "field--error"
                  : ""
              }`}
            >
              <span>Output Size</span>
              <select
                className={presetValue ? "" : "select-placeholder"}
                value={presetValue}
                disabled={isEditingDisabled}
                onChange={(event) => updateActiveWork({ selectedPreset: event.target.value })}
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
            !isViewing && showGenerationValidation && missingFields.has("seed")
              ? "field--error"
              : ""
          }`}
        >
          <span>Seed</span>
          <SeedControl
            seed={displayConfig?.seed ?? activeWork?.seed}
            onChange={(seed) => updateActiveWork({ seed })}
            disabled={isEditingDisabled}
          />
        </label>

        <section className="prompt-editor">
          <div className="dock-heading">
            <h3>Prompt</h3>
            <button
              className="prompt-example-trigger"
              type="button"
              title="Show example prompt"
              onClick={() => setShowPromptExample((v) => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="7" cy="7" r="6.5" stroke="currentColor" />
                <rect x="6.3" y="6" width="1.4" height="4.5" rx="0.7" fill="currentColor" />
                <rect x="6.3" y="3.5" width="1.4" height="1.4" rx="0.7" fill="currentColor" />
              </svg>
            </button>
          </div>
          <textarea
            value={displayConfig?.additionalPrompt ?? activeWork?.additionalPrompt ?? ""}
            disabled={isEditingDisabled}
            onChange={(event) => updateActiveWork({ additionalPrompt: event.target.value })}
            placeholder="Describe a scene or mood — a detailed prompt helps ground the background and expression."
          />
        </section>
      </div>
      {showPromptExample && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowPromptExample(false)}>
          <section
            className="prompt-example-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-example-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="prompt-example-modal-header">
              <div>
                <p className="prompt-example-modal-eyebrow">Prompt example</p>
                <p className="prompt-example-modal-title" id="prompt-example-title">
                  Scene &amp; mood reference
                </p>
              </div>
              <button
                className="prompt-example-modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowPromptExample(false)}
              >
                ×
              </button>
            </div>
            <pre className="prompt-example-text">{PROMPT_EXAMPLE}</pre>
            <div className="modal-actions">
              <button
                className="prompt-example-copy-btn"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(PROMPT_EXAMPLE);
                  setShowPromptExample(false);
                }}
              >
                Copy
              </button>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
};
