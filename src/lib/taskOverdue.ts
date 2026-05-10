import { localDateString } from '../types/taskBlock';

// A task is overdue if its due_at (date or timestamp) is strictly before
// today in local Eastern time (per CLAUDE.md timezone guidance). A due_at
// of today is NOT overdue — only past dates trigger the badge.
export function isOverdue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  const dueDate = dueAt.length >= 10 ? dueAt.slice(0, 10) : dueAt;
  return dueDate < localDateString();
}
