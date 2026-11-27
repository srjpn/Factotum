import type { TaskItem } from '@facto/contracts';

export type TaskStatus = TaskItem['status'];

/** Maps a Jira status category key (new, indeterminate, done) to a Facto task status. */
export function statusForCategory(key: string | undefined): TaskStatus {
  switch (key) {
    case 'new':
      return 'todo';
    case 'indeterminate':
      return 'in-progress';
    case 'done':
      return 'done';
    default:
      return 'other';
  }
}
