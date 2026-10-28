import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORY_LIMIT,
  addPreset,
  assertInvariants,
  configKey,
  createDeck,
  keyOfSelection,
  pinByKey,
  recordSuccess,
  removePreset,
  renamePreset,
  reorderPresets,
  unpinByKey,
} from '../src/deck-core.js';

const X = { provider: 'acme', model: 'gpt-x', reasoningEffort: 'high' };
const Y = { provider: 'acme', model: 'gpt-y' };
const kx = keyOfSelection(X);

/** ConfigKeys of a deck's history, in stored order. */
const historyKeys = (deck) => deck.history.map((entry) => keyOfSelection(entry));

// --- AC-03: dedupe + recency reorder ---------------------------------------

test('recordSuccess dedupes by ConfigKey and reorders by recency (X,Y,X -> [X,Y])', () => {
  let deck = createDeck('p1');

  deck = recordSuccess(deck, X, 1000);
  deck = recordSuccess(deck, Y, 2000);
  deck = recordSuccess(deck, X, 3000);

  assert.equal(deck.history.length, 2, 'X reappears only once');
  assert.deepEqual(historyKeys(deck), [keyOfSelection(X), keyOfSelection(Y)]);
  assert.equal(deck.history[0].lastUsedAt, 3000, 'reapplied X is newest');
  assert.equal(deck.history[1].lastUsedAt, 2000);
  assertInvariants(deck);
});

// --- AC-04: capacity eviction, presets exempt ------------------------------

test('history capacity evicts the oldest non-fixed entries while presets survive', () => {
  let deck = createDeck('p1');

  // A fixed preset must never be evicted by history growth.
  deck = addPreset(deck, { provider: 'fixed', model: 'keep' }, 0);
  const fixedKey = configKey('fixed', 'keep');

  const total = HISTORY_LIMIT + 5;
  for (let i = 0; i < total; i += 1) {
    deck = recordSuccess(deck, { provider: 'p', model: `m${i}` }, 1000 + i);
  }

  assert.equal(deck.history.length, HISTORY_LIMIT, 'capped at the limit');
  const keys = historyKeys(deck);
  for (let i = 0; i < 5; i += 1) {
    assert.ok(!keys.includes(configKey('p', `m${i}`)), `oldest m${i} evicted`);
  }
  assert.ok(
    keys.includes(configKey('p', `m${total - 1}`)),
    'newest entry retained',
  );
  assert.ok(
    deck.presets.some((preset) => keyOfSelection(preset) === fixedKey),
    'fixed preset survives eviction',
  );
  assertInvariants(deck);
});

// --- AC-05 / AC-06: pin/unpin mutual exclusion -----------------------------

test('pin then unpin keeps presets and history mutually exclusive', () => {
  let deck = createDeck('p1');
  deck = recordSuccess(deck, X, 5000);
  assert.equal(deck.history.length, 1);
  assert.equal(deck.presets.length, 0);

  deck = pinByKey(deck, kx, 6000);
  assert.equal(deck.presets.length, 1);
  assert.equal(deck.presets[0].source, 'pinned');
  assert.equal(deck.presets[0].lastUsedAt, 5000, 'pin retains last use time');
  assert.equal(deck.history.length, 0, 'pinned entry left history');
  assertInvariants(deck);

  deck = unpinByKey(deck, kx, 7000);
  assert.equal(deck.presets.length, 0);
  assert.equal(deck.history.length, 1);
  assert.equal(
    deck.history[0].lastUsedAt,
    5000,
    'unpin is not a use: original time retained',
  );
  assertInvariants(deck);
});

// --- project isolation -----------------------------------------------------

test('different projectIds do not affect each other and inputs are not mutated', () => {
  const deckA = createDeck('project-a');
  const deckB = createDeck('project-b');

  const nextA = recordSuccess(deckA, X, 1000);
  const nextB = recordSuccess(deckB, Y, 2000);

  // Purity: originals untouched.
  assert.equal(deckA.history.length, 0);
  assert.equal(deckB.history.length, 0);

  assert.equal(nextA.projectId, 'project-a');
  assert.equal(nextB.projectId, 'project-b');
  assert.deepEqual(historyKeys(nextA), [keyOfSelection(X)]);
  assert.deepEqual(historyKeys(nextB), [keyOfSelection(Y)]);

  // A preset in project A never leaks into project B.
  const withPresetA = addPreset(nextA, { provider: 'a', model: 'only-a' });
  assert.equal(withPresetA.presets.length, 1);
  assert.equal(nextB.presets.length, 0);
  assert.equal(nextB.history.length, 1);

  assertInvariants(withPresetA);
  assertInvariants(nextB);
});

// --- D3: one preset per key ------------------------------------------------

test('a second preset for the same ConfigKey is rejected', () => {
  let deck = createDeck('p1');
  deck = addPreset(deck, X);

  assert.throws(
    () => addPreset(deck, { ...X, name: 'duplicate' }),
    /already exists|D3/,
  );
  assert.equal(deck.presets.length, 1);
  assertInvariants(deck);
});

// --- D5: removal semantics -------------------------------------------------

test('removing a used preset keeps its history; an unused manual preset leaves none', () => {
  // Used preset: history record must survive removal.
  let deck = createDeck('p1');
  deck = recordSuccess(deck, X, 4000);
  deck = addPreset(deck, X); // moves history -> preset, carries lastUsedAt
  assert.equal(deck.presets.length, 1);
  assert.equal(deck.presets[0].lastUsedAt, 4000);
  assert.equal(deck.history.length, 0);

  deck = removePreset(deck, deck.presets[0].id);
  assert.equal(deck.presets.length, 0);
  assert.equal(deck.history.length, 1, 'history kept after preset removal');
  assert.equal(deck.history[0].lastUsedAt, 4000);
  assertInvariants(deck);

  // Unused manual preset: removal deletes it entirely, no history.
  let unused = createDeck('p2');
  unused = addPreset(unused, Y);
  assert.equal(unused.presets.length, 1);
  unused = removePreset(unused, unused.presets[0].id);
  assert.equal(unused.presets.length, 0);
  assert.equal(unused.history.length, 0, 'never-used preset leaves no history');
  assertInvariants(unused);
});

// --- recordSuccess on an existing preset -----------------------------------

test('recordSuccess on an already-preset key only updates lastUsedAt, no history', () => {
  let deck = createDeck('p1');
  deck = addPreset(deck, X);
  assert.equal(deck.presets[0].lastUsedAt, undefined, 'unused at creation');

  deck = recordSuccess(deck, X, 9000);
  assert.equal(deck.presets.length, 1);
  assert.equal(deck.presets[0].lastUsedAt, 9000);
  assert.equal(deck.history.length, 0, 'no history entry for a preset key');
  assertInvariants(deck);
});

// --- AC-14 logic: reasoning absent normalizes like empty -------------------

test('reasoning-absent keys normalize to the empty-string ConfigKey', () => {
  assert.equal(configKey('p', 'm'), configKey('p', 'm', ''));
  assert.equal(configKey('p', 'm', undefined), configKey('p', 'm', null));
  assert.equal(
    configKey('  p  ', '  m  ', '   '),
    configKey('p', 'm'),
    'whitespace is trimmed',
  );

  let deck = createDeck('p1');
  deck = recordSuccess(deck, { provider: 'p', model: 'm' }, 1000);
  deck = recordSuccess(
    deck,
    { provider: 'p', model: 'm', reasoningEffort: '' },
    2000,
  );

  assert.equal(deck.history.length, 1, 'absent and empty dedupe together');
  assert.equal(deck.history[0].lastUsedAt, 2000);
  assertInvariants(deck);
});

// --- preset management: reorder + rename -----------------------------------

test('reorderPresets and renamePreset update order and display name', () => {
  let deck = createDeck('p1');
  deck = addPreset(deck, { provider: 'a', model: '1', name: 'first' });
  deck = addPreset(deck, { provider: 'a', model: '2', name: 'second' });
  deck = addPreset(deck, { provider: 'a', model: '3', name: 'third' });

  const ids = deck.presets.map((preset) => preset.id);
  assert.deepEqual(ids, ['preset-1', 'preset-2', 'preset-3']);

  const reversed = [...ids].reverse();
  deck = reorderPresets(deck, reversed);
  assert.deepEqual(deck.presets.map((preset) => preset.id), reversed);
  assert.deepEqual(deck.presets.map((preset) => preset.order), [0, 1, 2]);

  deck = renamePreset(deck, ids[0], 'renamed-first');
  assert.equal(
    deck.presets.find((preset) => preset.id === ids[0]).name,
    'renamed-first',
  );
  assertInvariants(deck);
});

// --- assertInvariants guards ----------------------------------------------

test('assertInvariants rejects a ConfigKey present in both areas', () => {
  const deck = createDeck('p1');
  deck.presets.push({
    id: 'preset-1',
    name: 'x',
    provider: 'a',
    model: 'b',
    source: 'manual',
    order: 0,
    createdAt: new Date(0).toISOString(),
  });
  deck.history.push({ provider: 'a', model: 'b', lastUsedAt: 1 });
  assert.throws(() => assertInvariants(deck), /invariant 1/);
});

test('assertInvariants rejects unsorted history', () => {
  const deck = createDeck('p1');
  deck.history.push({ provider: 'a', model: '1', lastUsedAt: 1 });
  deck.history.push({ provider: 'a', model: '2', lastUsedAt: 2 });
  assert.throws(() => assertInvariants(deck), /invariant 3/);
});
