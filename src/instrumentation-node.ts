import { startStatusPoller } from './lib/requests';

export function startBackgroundJobs() {
  try {
    startStatusPoller();
  } catch (e) {
    console.error('[family-hub] could not start the background status poller', e);
  }
}
