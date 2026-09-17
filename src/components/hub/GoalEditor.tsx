'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Subject } from '@/types';
import { useStudyGoals } from '@/lib/client/useStudyGoals';

interface GoalEditorProps {
  open: boolean;
  onClose: () => void;
  subjects: Subject[];
}

/**
 * Modal editor for all four goal mutations (create, update, toggle, delete).
 * The hub mounts it; no separate /goals page exists yet.
 *
 * Target is shown in whole hours (integer, 1–168) and persisted as seconds.
 */
export function GoalEditor({ open, onClose, subjects }: GoalEditorProps) {
  const { progress, create, update, remove } = useStudyGoals(subjects);

  const [addSubjectId, setAddSubjectId] = useState<string>('__overall__');
  const [addHours, setAddHours] = useState(5);
  const [editingHours, setEditingHours] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button, input, select');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, [open, onClose]);

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  const hasOverall = progress.some((p) => p.goal.subjectId === null);
  const subjectsWithGoal = useMemo(
    () => new Set(progress.filter((p) => p.goal.subjectId !== null).map((p) => p.goal.subjectId)),
    [progress]
  );
  const addableSubjects = useMemo(() => subjects.filter((s) => !subjectsWithGoal.has(s.id)), [subjects, subjectsWithGoal]);

  if (!open) return null;

  function subjectLabel(subjectId: string | null): string {
    return subjectId === null ? 'Overall' : subjectNames.get(subjectId) ?? subjectId;
  }

  function hoursFromSeconds(s: number): number {
    return Math.max(1, Math.round(s / 3600));
  }

  async function handleCreate() {
    const subjectId = addSubjectId === '__overall__' ? null : addSubjectId;
    const targetSeconds = addHours * 3600;
    const ok = await create({ subjectId, targetSeconds, enabled: true });
    if (ok) setAddHours(5);
  }

  async function handleUpdateGoal(id: string, hoursStr: string) {
    const hours = parseInt(hoursStr, 10);
    if (Number.isNaN(hours) || hours < 1 || hours > 168) return;
    await update(id, { targetSeconds: hours * 3600 });
  }

  async function handleToggle(id: string, enabled: boolean, targetSeconds: number) {
    await update(id, { targetSeconds, enabled });
  }

  async function handleDelete(id: string) {
    await remove(id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="study-goals-title" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="study-goals-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">Study Goals</h2>
          <button ref={closeRef} onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:hover:text-gray-300" aria-label="Close study goals">
            ✕
          </button>
        </div>

        {/* Existing goals */}
        {progress.length > 0 && (
          <div className="mb-4 space-y-2">
            {progress.map((p) => {
              const inputVal = editingHours[p.goal.id] ?? String(hoursFromSeconds(p.goal.targetSeconds));
              return (
                <div key={p.goal.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                    {subjectLabel(p.goal.subjectId)}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={inputVal}
                    onChange={(e) => setEditingHours((prev) => ({ ...prev, [p.goal.id]: e.target.value }))}
                    onBlur={() => handleUpdateGoal(p.goal.id, inputVal)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateGoal(p.goal.id, inputVal); }}
                    className="w-14 rounded border px-1 py-0.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                  />
                  <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">hrs/wk</span>
                  <button
                    onClick={() => handleToggle(p.goal.id, !p.goal.enabled, p.goal.targetSeconds)}
                    className={`flex h-5 w-9 items-center rounded-full transition-colors ${p.goal.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    aria-label={p.goal.enabled ? 'Disable goal' : 'Enable goal'}
                  >
                    <span className={`ml-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${p.goal.enabled ? 'translate-x-4' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleDelete(p.goal.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                    aria-label="Delete goal"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Progress summary */}
        {progress.length > 0 && (
          <div className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Progress resets every Monday.
          </div>
        )}

        {/* Add goal */}
        {(!hasOverall || addableSubjects.length > 0) && (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 dark:border-gray-600">
            {!hasOverall && (
              <button
                onClick={() => { setAddSubjectId('__overall__'); void handleCreate(); }}
                className="shrink-0 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
              >
                + Overall
              </button>
            )}
            {addableSubjects.length > 0 && (
              <>
                <select
                  value={addSubjectId}
                  onChange={(e) => setAddSubjectId(e.target.value)}
                  className="min-w-0 flex-1 rounded border px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {addableSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={addHours}
                  onChange={(e) => setAddHours(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-14 rounded border px-1 py-0.5 text-center text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                />
                <span className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">hrs/wk</span>
                <button
                  onClick={handleCreate}
                  className="shrink-0 rounded bg-blue-500 px-2 py-1 text-xs font-medium text-white hover:bg-blue-600"
                >
                  Add
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
