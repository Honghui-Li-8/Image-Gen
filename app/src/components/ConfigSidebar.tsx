import { ConfigGroup } from "./ConfigGroup";
import { SeedControl } from "./SeedControl";
import { TagInput } from "./TagInput";
import type {
  GenerationCategory,
  GenerationOptions,
  Work,
  WorkUpdater,
} from "../types";

type OptionsStatus = "loading" | "ready" | "failed";

interface ConfigSidebarProps {
  activeWork: Work | undefined;
  commitTag: () => void;
  customTags: string[];
  options: GenerationOptions | null;
  optionsStatus: OptionsStatus;
  removeTag: (tag: string) => void;
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

export const ConfigSidebar = ({
  activeWork,
  commitTag,
  customTags,
  options,
  optionsStatus,
  removeTag,
  updateActiveWork,
}: ConfigSidebarProps) => {
  return (
    <aside className="config-sidebar">
      <div className="config-header">
        <h2>Configuration</h2>
        {options ? (
          <div className="header-model">
            <span>Model:</span>
            <strong>{options.model.label}</strong>
          </div>
        ) : null}
      </div>

      <div className="options-scroll">
        {optionsStatus === "failed" ? (
          <p className="error-text">
            Could not load generation options from the API.
          </p>
        ) : null}

        {options ? (
          <>
            {Object.entries(groupCategories(options.categories)).map(
              ([group, categories]) => (
                <ConfigGroup key={group} title={group}>
                  {categories.map((category) => (
                    <label className="field" key={category.id}>
                      <span>{category.label}</span>
                      <select
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
                        {category.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </ConfigGroup>
              ),
            )}

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

            <label className="field">
              <span>Output Size</span>
              <select
                value={activeWork?.selectedPreset || ""}
                onChange={(event) =>
                  updateActiveWork({ selectedPreset: event.target.value })
                }
              >
                {options.outputPresets.map((preset) => (
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
        <label className="field seed-dock-row">
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
