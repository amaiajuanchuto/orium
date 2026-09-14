import { useMemo, useState } from "react";
import { categorizeTags } from "../lib/tagCategories";

function TagChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-sm transition"
      style={{
        background: active ? "var(--accent)" : "var(--chip)",
        borderColor: active ? "var(--accent)" : "var(--border-3)",
        color: active ? "var(--on-accent)" : "var(--chip-ink)",
      }}
    >
      {label}
    </button>
  );
}

interface TagPickerProps {
  /** The full shared tag vocabulary. */
  allTags: string[];
  selectedTags: string[];
  onToggle: (tag: string) => void;
}

/**
 * Browses the shared tag vocabulary by theme (collapsible categories, all
 * closed by default so ~75+ tags don't dump into one scrollable wall) or by
 * typing to filter across all of them at once — searching bypasses
 * categories entirely and shows a flat matching list.
 */
export function TagPicker({ allTags, selectedTags, onToggle }: TagPickerProps) {
  const [query, setQuery] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const trimmedQuery = query.trim().toLowerCase();
  const categories = useMemo(() => categorizeTags(allTags), [allTags]);
  const searchResults = trimmedQuery
    ? allTags.filter((tag) => tag.toLowerCase().includes(trimmedQuery))
    : [];

  function toggleCategory(name: string): void {
    setOpenCategories((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tags…"
        className="mb-3 w-full rounded-lg border border-border-2 bg-field px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />

      {selectedTags.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Selected
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedTags.map((tag) => (
              <TagChip key={tag} label={tag} active onClick={() => onToggle(tag)} />
            ))}
          </div>
        </div>
      )}

      <div className="max-h-52 overflow-y-auto rounded-lg border border-border-1 bg-surface-2 p-3">
        {trimmedQuery ? (
          searchResults.length === 0 ? (
            <span className="text-sm text-muted">No tags match "{query}".</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {searchResults.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  active={selectedTags.includes(tag)}
                  onClick={() => onToggle(tag)}
                />
              ))}
            </div>
          )
        ) : categories.length === 0 ? (
          <span className="text-sm text-muted">No tags yet — add one below.</span>
        ) : (
          <div className="flex flex-col gap-1">
            {categories.map(({ name, tags: categoryTags }) => {
              const open = openCategories.has(name);
              return (
                <div key={name}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(name)}
                    className="flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-left text-sm font-medium text-ink-soft hover:bg-surface"
                  >
                    <span>{name}</span>
                    <span className="text-xs text-faint">
                      {categoryTags.length} {open ? "▲" : "▼"}
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-wrap gap-2 px-1.5 pb-2 pt-1">
                      {categoryTags.map((tag) => (
                        <TagChip
                          key={tag}
                          label={tag}
                          active={selectedTags.includes(tag)}
                          onClick={() => onToggle(tag)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
