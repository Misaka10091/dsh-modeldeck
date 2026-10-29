/**
 * dsh-modeldeck — pure domain logic.
 *
 * No DSH imports, no I/O, no ambient state. Every exported mutator is pure:
 * it never mutates its arguments and returns a brand-new ProjectDeck object.
 *
 * This module is the single owner of the ProjectDeck contract from the design
 * (`design.md` §3.1 / §3.2):
 *
 *   ConfigKey   = `${provider}\u0000${model}\u0000${reasoningEffort ?? ''}`
 *   Preset      = { id, name, provider, model, reasoningEffort?, source,
 *                   order, createdAt, lastUsedAt? }
 *   HistoryEntry= { provider, model, reasoningEffort?, lastUsedAt }
 *   ProjectDeck = { projectId, presets, history, updatedAt, schemaVersion }
 *
 * Invariants enforced by `assertInvariants` (design.md §3.2):
 *   1. A ConfigKey appears in `presets` XOR `history`.
 *   2. `presets` are unique by ConfigKey (D3).
 *   3. `history` is unique by ConfigKey and sorted by `lastUsedAt` desc.
 *   4. `history` holds at most HISTORY_LIMIT (20) entries; `presets`
 *      (manual + pinned) are exempt from that cap.
 *
 * Note on `lastUsedAt` on a Preset: the design's Preset type does not list it,
 * but D4/D5 require that a pinned entry remembers its last successful use time
 * and returns to history at that time when unpinned, and that a removed-but-
 * used preset keeps its history record. We therefore carry an optional
 * `lastUsedAt` on a preset: it is set when the combination is used and is
 * absent for a manual preset that has never been used (D5 — removing such a
 * preset leaves no history entry).
 */

/** Character that separates the three ConfigKey segments; never a valid value. */
export const CONFIG_KEY_SEPARATOR = '\u0000';

/** Maximum number of non-pinned history entries per project (planning D1). */
export const HISTORY_LIMIT = 20;

/** ProjectDeck schema version; bump when fold semantics change. */
export const SCHEMA_VERSION = 1;

/** Coerce an arbitrary value to a trimmed string (missing -> ''). */
function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

/** ISO timestamp for a numeric epoch (or Date) value. */
function iso(now) {
  const date = now instanceof Date ? now : new Date(now);
  return date.toISOString();
}

/**
 * Normalize a raw selection into the canonical stored shape.
 * A missing / empty `reasoningEffort` is treated as "not applicable" and is
 * omitted entirely, so it compares equal to an empty string via `configKey`.
 */
export function normalizeSelection(selection) {
  const provider = normalizeText(selection?.provider);
  const model = normalizeText(selection?.model);
  const reasoningEffort = normalizeText(selection?.reasoningEffort);
  return reasoningEffort
    ? { provider, model, reasoningEffort }
    : { provider, model };
}

/**
 * Build the canonical ConfigKey for a (provider, model, reasoningEffort) triple.
 * Surrounding whitespace is stripped; a missing reasoning effort is equivalent
 * to the empty string. Case is preserved verbatim (adapter ids are
 * case-sensitive, design.md §3.1).
 */
export function configKey(provider, model, reasoningEffort) {
  return [
    normalizeText(provider),
    normalizeText(model),
    normalizeText(reasoningEffort),
  ].join(CONFIG_KEY_SEPARATOR);
}

/** ConfigKey for a selection object. */
export function keyOfSelection(selection) {
  return configKey(
    selection?.provider,
    selection?.model,
    selection?.reasoningEffort,
  );
}

/**
 * Default display name for a preset: "provider / model" with an optional
 * " (reasoning)" suffix (planning D11). Display name never participates in
 * identity (design.md §3.1).
 */
export function formatPresetName(provider, model, reasoningEffort) {
  const p = normalizeText(provider);
  const m = normalizeText(model);
  const r = normalizeText(reasoningEffort);
  return r ? `${p} / ${m} (${r})` : `${p} / ${m}`;
}

/** Create an empty ProjectDeck for a project. */
export function createDeck(projectId, now = Date.now()) {
  return {
    projectId: normalizeText(projectId),
    presets: [],
    history: [],
    updatedAt: iso(now),
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Return a new deck with the given fields replaced (immutable). */
function withDeck(deck, patch) {
  return {
    projectId: deck.projectId,
    presets: patch.presets ?? deck.presets,
    history: patch.history ?? deck.history,
    updatedAt: patch.updatedAt ?? deck.updatedAt,
    schemaVersion: deck.schemaVersion ?? SCHEMA_VERSION,
  };
}

/** Next free preset order (max existing order + 1, starting at 0). */
function nextOrder(presets) {
  let max = -1;
  for (const preset of presets) {
    if (Number.isFinite(preset.order) && preset.order > max) max = preset.order;
  }
  return max + 1;
}

/** Deterministic, collision-free preset id given the current preset list. */
function nextPresetId(presets) {
  let max = 0;
  for (const preset of presets) {
    const match = /^preset-(\d+)$/.exec(String(preset.id ?? ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `preset-${max + 1}`;
}

/** History entries sorted by last successful use, newest first. */
function sortHistory(history) {
  return [...history].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Sort history newest-first and enforce the per-project capacity. Pinned
 * entries live in `presets`, never in `history` (invariant 1), so every entry
 * here is a non-pinned entry subject to the cap.
 */
function trimHistory(history) {
  return sortHistory(history).slice(0, HISTORY_LIMIT);
}

/** Build a canonical HistoryEntry from a selection-like value. */
function historyEntryFrom(selection, lastUsedAt) {
  const normalized = normalizeSelection(selection);
  const entry = {
    provider: normalized.provider,
    model: normalized.model,
    lastUsedAt,
  };
  if (normalized.reasoningEffort !== undefined) {
    entry.reasoningEffort = normalized.reasoningEffort;
  }
  return entry;
}

/**
 * Record a *successful* application of a selection to a project deck.
 *
 * - If the key already belongs to a preset (manual or pinned), only that
 *   preset's `lastUsedAt` is refreshed; no history entry is created (this is
 *   the required "already-preset key" behavior and keeps invariant 1).
 * - Otherwise the matching history entry is replaced (dedupe by ConfigKey),
 *   stamped with `now` (so it moves to the front), and the list is trimmed to
 *   the capacity limit.
 *
 * @param {object} deck      current ProjectDeck (not mutated)
 * @param {object} selection { provider, model, reasoningEffort? }
 * @param {number} [now]     epoch ms of the successful application
 * @returns {object} new ProjectDeck
 */
export function recordSuccess(deck, selection, now = Date.now()) {
  const key = keyOfSelection(selection);

  const presetIndex = deck.presets.findIndex(
    (preset) => keyOfSelection(preset) === key,
  );
  if (presetIndex !== -1) {
    const presets = deck.presets.map((preset, index) =>
      index === presetIndex ? { ...preset, lastUsedAt: now } : preset,
    );
    return withDeck(deck, { presets, updatedAt: iso(now) });
  }

  const history = deck.history.filter(
    (entry) => keyOfSelection(entry) !== key,
  );
  history.push(historyEntryFrom(selection, now));
  return withDeck(deck, {
    history: trimHistory(history),
    updatedAt: iso(now),
  });
}

/**
 * Pin a history entry into the fixed area. The entry leaves `history` and
 * becomes a `source: 'pinned'` preset, carrying its last-success time so a
 * later unpin can restore it at the same position (D4).
 *
 * @param {object} deck
 * @param {string} key      ConfigKey of a history entry
 * @param {number} [now]
 */
export function pinByKey(deck, key, now = Date.now()) {
  const target = deck.history.find(
    (entry) => keyOfSelection(entry) === key,
  );
  if (!target) {
    throw new Error(`pinByKey: no history entry for key ${JSON.stringify(key)}`);
  }
  if (deck.presets.some((preset) => keyOfSelection(preset) === key)) {
    throw new Error('pinByKey: that key already belongs to a preset');
  }

  const history = deck.history.filter(
    (entry) => keyOfSelection(entry) !== key,
  );
  const preset = {
    id: nextPresetId(deck.presets),
    name: formatPresetName(
      target.provider,
      target.model,
      target.reasoningEffort,
    ),
    provider: target.provider,
    model: target.model,
    ...(target.reasoningEffort !== undefined
      ? { reasoningEffort: target.reasoningEffort }
      : {}),
    source: 'pinned',
    order: nextOrder(deck.presets),
    createdAt: iso(now),
    lastUsedAt: target.lastUsedAt,
  };

  return withDeck(deck, {
    presets: [...deck.presets, preset],
    history,
    updatedAt: iso(now),
  });
}

/**
 * Unpin a pinned preset: it leaves the fixed area and returns to history at its
 * recorded last-success time. Unpinning is NOT itself a use, so the entry may
 * be evicted immediately by the capacity rule (D4).
 *
 * @param {object} deck
 * @param {string} key      ConfigKey of the pinned preset
 * @param {number} [now]
 */
export function unpinByKey(deck, key, now = Date.now()) {
  const preset = deck.presets.find(
    (candidate) => keyOfSelection(candidate) === key,
  );
  if (!preset) {
    throw new Error(`unpinByKey: no preset for key ${JSON.stringify(key)}`);
  }
  if (preset.source !== 'pinned') {
    throw new Error(
      'unpinByKey: preset is not a pinned history entry; use removePreset',
    );
  }

  const presets = deck.presets.filter(
    (candidate) => keyOfSelection(candidate) !== key,
  );
  const history = trimHistory([
    ...deck.history,
    historyEntryFrom(preset, preset.lastUsedAt ?? now),
  ]);
  return withDeck(deck, { presets, history, updatedAt: iso(now) });
}

/**
 * Add a fixed-area preset.
 *
 * Rejects a second preset for an existing ConfigKey (D3). If the same
 * combination currently sits in history, it is moved into the preset and its
 * last-success time is carried over so mutual exclusion holds and no history is
 * silently lost.
 *
 * @param {object} deck
 * @param {object} input    { name?, provider, model, reasoningEffort?,
 *                            source?, order?, id?, createdAt? }
 * @param {number} [now]
 */
export function addPreset(deck, input, now = Date.now()) {
  const normalized = normalizeSelection(input);
  const key = keyOfSelection(normalized);

  if (deck.presets.some((preset) => keyOfSelection(preset) === key)) {
    throw new Error(
      `addPreset: a preset already exists for key ${JSON.stringify(key)} (D3)`,
    );
  }

  const displaced = deck.history.find(
    (entry) => keyOfSelection(entry) === key,
  );
  const history = displaced
    ? deck.history.filter((entry) => keyOfSelection(entry) !== key)
    : deck.history;

  const preset = {
    id: input.id !== undefined ? String(input.id) : nextPresetId(deck.presets),
    name: input.name
      ? String(input.name)
      : formatPresetName(
          normalized.provider,
          normalized.model,
          normalized.reasoningEffort,
        ),
    provider: normalized.provider,
    model: normalized.model,
    ...(normalized.reasoningEffort !== undefined
      ? { reasoningEffort: normalized.reasoningEffort }
      : {}),
    source: input.source === 'pinned' ? 'pinned' : 'manual',
    order: Number.isFinite(input.order) ? input.order : nextOrder(deck.presets),
    createdAt: input.createdAt ? String(input.createdAt) : iso(now),
    ...(displaced ? { lastUsedAt: displaced.lastUsedAt } : {}),
  };

  return withDeck(deck, {
    presets: [...deck.presets, preset],
    history,
    updatedAt: iso(now),
  });
}

/**
 * Remove a fixed-area preset.
 *
 * - A preset that was ever used (`lastUsedAt` present) leaves its history
 *   record: the entry returns to history at its last-success time (D5).
 * - A manual preset that was never used is dropped entirely and does not
 *   reappear in history (D5).
 *
 * Removing a preset is not a use; `now` only stamps `updatedAt`.
 *
 * @param {object} deck
 * @param {string} idOrKey  preset id or ConfigKey
 * @param {number} [now]
 */
export function removePreset(deck, idOrKey, now = Date.now()) {
  const index = deck.presets.findIndex(
    (preset) =>
      String(preset.id) === String(idOrKey) ||
      keyOfSelection(preset) === idOrKey,
  );
  if (index === -1) {
    throw new Error(
      `removePreset: no preset matching ${JSON.stringify(idOrKey)}`,
    );
  }

  const preset = deck.presets[index];
  const presets = deck.presets.filter((_, position) => position !== index);

  let history = deck.history;
  if (preset.lastUsedAt !== undefined && preset.lastUsedAt !== null) {
    history = trimHistory([
      ...deck.history.filter(
        (entry) => keyOfSelection(entry) !== keyOfSelection(preset),
      ),
      historyEntryFrom(preset, preset.lastUsedAt),
    ]);
  }

  return withDeck(deck, { presets, history, updatedAt: iso(now) });
}

/**
 * Reorder presets. `orderedIds` lists preset ids in their desired order; any
 * preset not named keeps a stable position after the listed ones.
 *
 * @param {object} deck
 * @param {string[]} orderedIds
 * @param {number} [now]
 */
export function reorderPresets(deck, orderedIds, now = Date.now()) {
  const orderMap = new Map(
    orderedIds.map((id, index) => [String(id), index]),
  );
  const presets = deck.presets
    .map((preset) => ({
      ...preset,
      order: orderMap.has(String(preset.id))
        ? orderMap.get(String(preset.id))
        : orderedIds.length + (Number.isFinite(preset.order) ? preset.order : 0),
    }))
    .sort((a, b) => a.order - b.order);

  return withDeck(deck, { presets, updatedAt: iso(now) });
}

/**
 * Rename a preset by id or ConfigKey. The display name does not affect identity.
 *
 * @param {object} deck
 * @param {string} idOrKey
 * @param {string} name
 * @param {number} [now]
 */
export function renamePreset(deck, idOrKey, name, now = Date.now()) {
  let found = false;
  const presets = deck.presets.map((preset) => {
    const matches =
      String(preset.id) === String(idOrKey) ||
      keyOfSelection(preset) === idOrKey;
    if (!matches) return preset;
    found = true;
    return { ...preset, name: String(name) };
  });

  if (!found) {
    throw new Error(
      `renamePreset: no preset matching ${JSON.stringify(idOrKey)}`,
    );
  }

  return withDeck(deck, { presets, updatedAt: iso(now) });
}

/**
 * Assert the four ProjectDeck invariants. Throws on the first violation and
 * returns `true` when the deck is consistent.
 *
 * @param {object} deck
 * @returns {true}
 */
export function assertInvariants(deck) {
  if (!deck || typeof deck !== 'object') {
    throw new Error('assertInvariants: deck must be an object');
  }
  if (!Array.isArray(deck.presets) || !Array.isArray(deck.history)) {
    throw new Error('assertInvariants: presets and history must be arrays');
  }

  const presetKeys = deck.presets.map((preset) => keyOfSelection(preset));
  const historyKeys = deck.history.map((entry) => keyOfSelection(entry));

  // 2. presets unique by ConfigKey.
  if (new Set(presetKeys).size !== presetKeys.length) {
    throw new Error(
      'invariant 2 violated: presets contain duplicate ConfigKeys',
    );
  }

  // 3. history unique by ConfigKey.
  if (new Set(historyKeys).size !== historyKeys.length) {
    throw new Error(
      'invariant 3 violated: history contains duplicate ConfigKeys',
    );
  }

  // 1. presets and history are mutually exclusive on ConfigKey.
  const presetKeySet = new Set(presetKeys);
  for (const historyKey of historyKeys) {
    if (presetKeySet.has(historyKey)) {
      throw new Error(
        'invariant 1 violated: a ConfigKey appears in both presets and history',
      );
    }
  }

  // 3. history sorted by lastUsedAt desc.
  for (let index = 1; index < deck.history.length; index += 1) {
    const previous = deck.history[index - 1].lastUsedAt;
    const current = deck.history[index].lastUsedAt;
    if (typeof previous !== 'number' || typeof current !== 'number') {
      throw new Error(
        'invariant 3 violated: every history entry must have a numeric lastUsedAt',
      );
    }
    if (previous < current) {
      throw new Error(
        'invariant 3 violated: history is not sorted by lastUsedAt descending',
      );
    }
  }

  // 4. capacity. Pinned entries live in presets (invariant 1), so the whole
  // history list is the non-pinned set subject to the cap.
  if (deck.history.length > HISTORY_LIMIT) {
    throw new Error(
      `invariant 4 violated: history has ${deck.history.length} entries (max ${HISTORY_LIMIT})`,
    );
  }

  return true;
}
