interface TagInputProps {
  customTags: string[];
  onCommitTag: () => void;
  onRemoveTag: (tag: string) => void;
  onUpdateDraft: (draft: string) => void;
  tagDraft: string | undefined;
}

export const TagInput = ({
  customTags,
  onCommitTag,
  onRemoveTag,
  onUpdateDraft,
  tagDraft,
}: TagInputProps) => {
  return (
    <div className="tag-input-shell">
      {customTags.map((tag) => (
        <button
          className="tag tag--removable"
          key={tag}
          type="button"
          onClick={() => onRemoveTag(tag)}
        >
          <span>{tag}</span>
          <span aria-hidden="true">x</span>
        </button>
      ))}
      <input
        value={tagDraft || ""}
        onBlur={onCommitTag}
        onChange={(event) => onUpdateDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            onCommitTag();
          }
        }}
        placeholder="Type tag and press Enter"
      />
    </div>
  );
};
