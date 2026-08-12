import { useState } from "react";

interface EditDeleteButtonsProps {
  onEdit: () => void;
  onDelete: () => Promise<void>;
}

export function EditDeleteButtons({ onEdit, onDelete }: EditDeleteButtonsProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(): Promise<void> {
    if (!window.confirm("Delete this entry? This can't be undone.")) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onEdit}
        aria-label="Edit entry"
        title="Edit entry"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-3 bg-surface text-muted hover:bg-surface-2 hover:text-ink"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="M15 5l4 4" />
        </svg>
      </button>

      <button
        onClick={() => void handleDelete()}
        disabled={deleting}
        aria-label="Delete entry"
        title="Delete entry"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </div>
  );
}
