import type { TaskItem } from '@facto/contracts';

export type TaskStatus = TaskItem['status'];

export const DEFAULT_LIST_STATUS: Record<string, TaskStatus> = {
  backlog: 'todo',
  'to do': 'todo',
  todo: 'todo',
  doing: 'in-progress',
  'in progress': 'in-progress',
  done: 'done',
  complete: 'done',
  shipped: 'done',
};

const norm = (s: string) => s.trim().toLowerCase();

/** Builds the lookup: owner entries override the defaults; keys are case-insensitive. */
export function buildStatusMap(custom: Record<string, TaskStatus> = {}): Map<string, TaskStatus> {
  const map = new Map(Object.entries(DEFAULT_LIST_STATUS));
  for (const [list, status] of Object.entries(custom)) map.set(norm(list), status);
  return map;
}

export function statusForList(map: Map<string, TaskStatus>, listName: string): TaskStatus {
  return map.get(norm(listName)) ?? 'other';
}
