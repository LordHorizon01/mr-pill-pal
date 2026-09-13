/**
 * Keeps the most recent async read authoritative for a store.
 *
 * A profile or account switch invalidates earlier requests, so an old SQLite
 * response cannot replace the new profile's visible state after it finishes.
 */
export function createAsyncRequestGuard() {
  let revision = 0;

  return {
    begin(): number {
      revision += 1;
      return revision;
    },
    invalidate(): void {
      revision += 1;
    },
    isCurrent(requestRevision: number): boolean {
      return requestRevision === revision;
    },
  };
}
