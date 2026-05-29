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
            {(() => {
              const [leftGroups, rightGroups] = distributeGroups(
                groupCategories(options.categories),
              );

              const renderGroups = (groups: Array<[string, GenerationCategory[]]>) =>
                groups.map(([group, categories]) => (
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
