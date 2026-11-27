import 'server-only';
import { getEnv } from './env';
import { listActivity as la, listAdapters as ladp, listInventory as li, listNodes as ln, listTasks as lt } from './api';
import { listApprovals as lap } from './approvals';

const config = () => {
  const env = getEnv();
  return { baseUrl: env.FACTO_API_URL, token: env.FACTO_ADMIN_TOKEN };
};

export const getNodes = () => ln(config());
export const getActivity = (limit: number) => la(config(), limit);
export const getTasks = () => lt(config());
export const getAdapters = () => ladp(config());
export const getRuns = () => li(config(), 'run');
export const getContainers = () => li(config(), 'container');
export const getApprovals = () => lap(config());
