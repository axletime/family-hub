import 'server-only';
import { HttpError } from './auth';
import { GROUP_IDS, type GroupId } from './features';

/** Accept the new `group` field, or the old `role` field from older clients. */
export function groupFrom(body: { group?: string; role?: string }): GroupId | undefined {
  if (body.group !== undefined) {
    if (!GROUP_IDS.includes(body.group as GroupId)) throw new HttpError(400, 'Unknown group.');
    return body.group as GroupId;
  }
  if (body.role !== undefined) return body.role === 'admin' ? 'admin' : 'home';
  return undefined;
}
