"use client";

import { useEffect, useRef, useState } from "react";
import { TrashIcon } from "./icons";
import { FILLS, type MarkNote } from "./marks";

/**
 * The notes column Bluebook opens between the passage and the question, one card
 * per note: the highlighted text as its heading, the note under it, and a bin.
 *
 * The cards are the notes UI — a note is never edited over the passage — so a
 * freshly made one opens with its box focused, ready to type into.
 */
export function NotesPanel({
  notes,
  editing,
  onEdit,
  onSave,
  onRemove,
  onCollapse,
}: {
  notes: MarkNote[];
  /** Id of the card that should be open for editing, if any. */
  editing: string | null;
  onEdit: (id: string | null) => void;
  onSave: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-[#f0f0f0]">
      <div className="flex shrink-0 justify-end px-[12px] pt-[12px]">
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Close notes"
          title="Close notes"
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-white text-bb-ink shadow-[0_1px_4px_rgba(0,0,0,0.2)] hover:bg-black/5"
        >
          <CollapseIcon className="h-[19px] w-[19px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bb-scroll px-[12px] pb-[16px] pt-[8px]">
        {notes.length === 0 ? (
          <p className="px-[6px] pt-[6px] text-[14px] leading-[1.5] text-black/55">
            Highlight some text and choose the note button to write a note about it.
          </p>
        ) : (
          <ul className="flex flex-col gap-[12px]">
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                editing={editing === note.id}
                onEdit={onEdit}
                onSave={onSave}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NoteCard({
  note,
  editing,
  onEdit,
  onSave,
  onRemove,
}: {
  note: MarkNote;
  editing: boolean;
  onEdit: (id: string | null) => void;
  onSave: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  // The placeholder a brand-new note is created with is not text to edit.
  const stored = note.note === "…" ? "" : note.note;
  const box = useRef<HTMLTextAreaElement>(null);

  // The box starts from whatever is stored, and follows it if it changes while
  // the card is closed. Adjusted during render rather than in an effect, so the
  // first paint of an opened card already has the right text in it.
  const [draft, setDraft] = useState({ base: stored, text: stored });
  if (draft.base !== stored) setDraft({ base: stored, text: stored });

  useEffect(() => {
    if (editing) box.current?.focus();
  }, [editing]);

  const commit = () => onSave(note.id, draft.text);

  return (
    <li className="rounded-[8px] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]">
      {/* The heading wears the highlight's own colour, as Bluebook's does. */}
      <div
        className="flex items-center gap-[8px] rounded-t-[8px] border-b border-black/12 px-[12px] py-[9px]"
        style={{ background: FILLS[note.color] }}
      >
        <span
          className="min-w-0 flex-1 truncate text-[14px] font-bold text-bb-ink"
          title={note.text}
        >
          {note.text}
        </span>
        <button
          type="button"
          onClick={() => onRemove(note.id)}
          aria-label="Delete note"
          title="Delete note"
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-bb-ink hover:bg-black/5"
        >
          <TrashIcon className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="px-[12px] py-[10px]">
        {editing ? (
          <>
            <textarea
              ref={box}
              value={draft.text}
              onChange={(e) => setDraft({ base: stored, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") onEdit(null);
              }}
              rows={3}
              placeholder="Add a note…"
              className="w-full resize-none rounded-[6px] border border-black/20 p-[8px] text-[14px] leading-[1.5] text-bb-ink outline-none focus:border-bb-blue"
            />
            <div className="mt-[8px] flex justify-end gap-[12px] text-[14px]">
              <button
                type="button"
                onClick={() => onEdit(null)}
                className="text-black/55 hover:underline"
              >
                Cancel
              </button>
              <button type="button" onClick={commit} className="font-bold text-bb-blue hover:underline">
                Save
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onEdit(note.id)}
            className="w-full text-left text-[14px] leading-[1.5] text-bb-ink hover:underline"
          >
            {stored || <span className="text-black/45">Add a note…</span>}
          </button>
        )}
      </div>
    </li>
  );
}

/** The panel-collapse glyph Bluebook puts at the top of the notes column. */
function CollapseIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M14 4.5v15" />
        <path d="M10.5 9.5 7 12l3.5 2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
