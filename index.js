/**
 * dsh-modeldeck — Host half.
 *
 * Responsibilities (design.md §2 / §4 / §5):
 *   - Observe committed `model/selection` session events while mounted and fold
 *     each *successful* selection into the current project's persisted deck via
 *     the pure `recordSuccess` domain function.
 *   - Provide a `ProjectDeckStore` seam so persistence can be swapped in once
 *     the durable, project-keyed storage API is confirmed by inspection.
 *
 * This module is side-effect-free at load time: `apply` is the only entry point
 * that touches `ctx`, and every registration is owned by `ctx.effect`.
 *
 * IMPORTANT: the project-id and durable-store wiring is intentionally a
 * clearly-marked TODO placeholder. Per implement.md phase A1, the persistence
 * API must be confirmed with `cordis_inspect_query` before it is written. We do
 * not reach into undocumented internals (e.g. `ctx.sessionController.agents`)
 * to fake it.
 */

import { createDeck, recordSuccess } from './src/deck-core.js';

/**
 * Persistence seam. A concrete store keyed by stable project id.
 *
 * @typedef {object} ProjectDeckStoreShape
 * @property {(projectId: string) => Promise<object | undefined>} load
 * @property {(deck: object) => Promise<void>} save
 */

/**
 * Interface stub for a project-scoped deck store.
 *
 * Concrete implementations must key every read/write by `projectId` so that
 * switching projects switches the data set (design.md §5) and must reject
 * (throw) when a write cannot be durably persisted, so callers never report a
 * failed save as success (planning D9).
 */
export class ProjectDeckStore {
  /**
   * @param {string} projectId
   * @returns {Promise<object | undefined>}
   */
  async load(projectId) {
    throw new Error(
      `ProjectDeckStore.load(${projectId}) is not implemented; supply a concrete store`,
    );
  }

  /**
   * @param {object} deck
   * @returns {Promise<void>}
   */
  async save(deck) {
    throw new Error(
      `ProjectDeckStore.save(${deck?.projectId}) is not implemented; supply a concrete store`,
    );
  }
}

/**
 * PROVISIONAL in-memory store. Not durable: it loses all data when the process
 * or plugin instance is torn down, and it is not safe for multi-writer use.
 * It exists only so the observer wiring below is exercisable before the real
 * persistence API is confirmed. Do not ship this as the final store.
 */
export class InMemoryProjectDeckStore extends ProjectDeckStore {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this._decks = new Map();
  }

  /** @param {string} projectId */
  async load(projectId) {
    return this._decks.get(projectId);
  }

  /** @param {object} deck */
  async save(deck) {
    if (!deck || typeof deck.projectId !== 'string' || deck.projectId === '') {
      throw new Error('InMemoryProjectDeckStore.save: deck.projectId is required');
    }
    this._decks.set(deck.projectId, deck);
  }
}

/**
 * Resolve the stable project id for a session.
 *
 * PLACEHOLDER — not wired. `design.md §5` prefers `ctx.workspaceRegistry`'s
 * entity `id` (falling back to the canonical path), but the exact mapping from
 * a live `session` to its workspace entity is unverified (implement.md A1).
 * Returning `null` keeps the observer a safe no-op instead of fabricating a
 * project key. Replace this body once the storage/workspace API is confirmed.
 *
 * @param {unknown} _ctx
 * @param {unknown} _session
 * @returns {string | null}
 */
export function resolveProjectId(_ctx, _session) {
  return null;
}

/**
 * Persist one successful selection for the session's project.
 *
 * Kept separate from the synchronous event callback so the observer never
 * performs storage I/O inline and never appends a session event reentrantly
 * (the Session layer rejects reentrant appends during publication).
 *
 * @param {any} ctx
 * @param {ProjectDeckStore} store
 * @param {any} session
 * @param {{ provider: string, model: string, reasoningEffort?: string }} selection
 * @param {number} lastUsedAt epoch ms of the committed selection
 */
async function recordSelection(ctx, store, session, selection, lastUsedAt) {
  // TODO(dsh-modeldeck): resolve the real project id (see resolveProjectId).
  const projectId = resolveProjectId(ctx, session);
  if (!projectId) return; // Observer is a no-op until project wiring lands.

  const existing =
    (await store.load(projectId)) ?? createDeck(projectId, lastUsedAt);
  const next = recordSuccess(existing, selection, lastUsedAt);
  await store.save(next);
}

/**
 * Host plugin entry point.
 *
 * @param {any} ctx   Cordis plugin context
 * @param {any} config  row config from cordis.patch.yml
 */
export function apply(ctx, config) {
  // Provisional store. Replace with a durable, project-keyed store obtained
  // from the confirmed persistence service (implement.md A1). See the class
  // docs above — this one does not survive a restart.
  const store = new InMemoryProjectDeckStore();
  void config;

  ctx.effect(() => {
    const dispose = ctx.on('session/event', (session, event) => {
      // Only committed model/effort selections are relevant. The event carries
      // { provider, model, reasoningEffort? }; event.seq / event.time identify
      // this specific committed application (installed-dsh-contracts.md §1).
      if (!event || event.type !== 'model/selection') return;
      const selection = event.data;
      if (
        !selection ||
        typeof selection.provider !== 'string' ||
        typeof selection.model !== 'string'
      ) {
        return;
      }
      const lastUsedAt =
        typeof event.time === 'number' ? event.time : Date.now();

      // Fire-and-forget; surface our own storage failures instead of assuming
      // the user's switch was rejected (observer failures are contained by the
      // Session layer). D9: never report a failed write as a successful save.
      void recordSelection(ctx, store, session, selection, lastUsedAt).catch(
        (error) => {
          console.error(
            '[dsh-modeldeck] failed to record model/selection',
            error,
          );
        },
      );
    });

    // ctx.on typically returns a disposer; tolerate contexts that do not.
    return () => {
      if (typeof dispose === 'function') dispose();
    };
  });
}
