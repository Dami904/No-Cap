/**
 * Maps a browser session (an opaque cookie value) to the GitHub App installation
 * it completed, so /register can ask "what repos can THIS browser register" without
 * re-running the install flow. Same in-memory-now, KV-later pattern as relayerStore —
 * see that file's comment for why, and what swapping in real persistence looks like.
 */

export interface InstallationStore {
  saveInstallation(sessionToken: string, installationId: number): Promise<void>;
  getInstallation(sessionToken: string): Promise<number | null>;
}

class InMemoryInstallationStore implements InstallationStore {
  private map = new Map<string, number>();

  async saveInstallation(sessionToken: string, installationId: number): Promise<void> {
    this.map.set(sessionToken, installationId);
  }

  async getInstallation(sessionToken: string): Promise<number | null> {
    return this.map.get(sessionToken) ?? null;
  }
}

let store: InstallationStore | null = null;

export function getInstallationStore(): InstallationStore {
  if (!store) store = new InMemoryInstallationStore();
  return store;
}
