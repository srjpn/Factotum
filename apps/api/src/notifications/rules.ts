import type { NewActivity } from '../activity/activity.service.js';

export type NtfyPriority = 'min' | 'low' | 'default' | 'high' | 'max';

export type Notification = {
  title: string;
  message: string;
  priority: NtfyPriority;
  tags: string[];
  // Cooldown bucket: the same key is sent at most once per cooldown window.
  key: string;
};

type Rule = {
  action: string;
  outcome: NewActivity['outcome'];
  build: (entry: NewActivity, at: Date) => Omit<Notification, 'key'>;
};

// Privacy: only generic facts go out (node name, event, time). Never metrics, details, ticket titles or secrets.
function safeName(entry: NewActivity): string {
  const name = entry.details?.['nodeName'];
  // eslint-disable-next-line no-control-regex
  return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 64) : 'unknown';
}

const time = (at: Date) => at.toISOString().slice(11, 16) + ' UTC';

// To notify about a new event, add a row here (for example Pani run finished or failed, battery low).
export const RULES: readonly Rule[] = [
  {
    action: 'node.offline',
    outcome: 'success',
    build: (e, at) => ({
      title: 'Node offline',
      message: `${safeName(e)} went offline at ${time(at)}`,
      priority: 'high',
      tags: ['warning'],
    }),
  },
  {
    action: 'node.online',
    outcome: 'success',
    build: (e, at) => ({
      title: 'Node online',
      message: `${safeName(e)} is online at ${time(at)}`,
      priority: 'default',
      tags: ['white_check_mark'],
    }),
  },
  {
    action: 'node.enrol',
    outcome: 'denied',
    build: (_e, at) => ({
      title: 'Node enrolment denied',
      message: `An enrolment attempt was denied at ${time(at)}`,
      priority: 'high',
      tags: ['rotating_light'],
    }),
  },
];

export function notificationFor(entry: NewActivity, at: Date = new Date()): Notification | undefined {
  const rule = RULES.find((r) => r.action === entry.action && r.outcome === entry.outcome);
  if (!rule) return undefined;
  return { ...rule.build(entry, at), key: `${entry.action}:${entry.targetId ?? ''}` };
}
