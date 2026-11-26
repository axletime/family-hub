/** Runs once when the server starts: kicks off the background request-status poller. */
export async function register() {
  // Must be an inline `if` so Next can drop this import from the edge bundle.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBackgroundJobs } = await import('./instrumentation-node');
    startBackgroundJobs();
  }
}
