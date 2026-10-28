# State Management

> How state is managed in this project.

---

## Overview

This repository ships DSH plugin bundles (currently `dsh-modeldeck`). State is split across three owners:

- **Session log** (DSH) is the source of truth for anything the model or UI must reconstruct. Do not cache it as durable state.
- **Pure domain core** (`src/deck-core.js`) owns derived data. It is synchronous and side-effect free: every mutator takes a state object and returns a new one, never mutating its input.
- **Host + Client halves** are thin: the Host observes `session/event` and folds into the core; the Client renders from a projection/read model.

## State Categories

- **Local component state** — ephemeral UI such as a dropdown being open (`React.useState`).
- **Derived/persisted state** — the project `ProjectDeck` (presets, history). Persisted per stable project id through the `ProjectDeckStore` seam in `index.js`.
- **Projection state** — current selection is read from the `modelSelection` projection (`{ lastUsed, next }`), not stored by the plugin.

## When to Use Global State

Promote state to a persisted store only when it must survive restart or be shared across sessions of the same project (presets, history, pin state, ordering). Never persist transient UI state.

## Server State

Persisted state is keyed by project id and never shared across keys. Writes must throw on failure so callers never report a failed save as success. Keep a `schemaVersion` on stored state and migrate on read; preserve unknown fields.

## Common Mistakes

- Mutating a `ProjectDeck` in place instead of returning a new object.
- Keeping a second source of truth for the current selection instead of reading the DSH projection.
- Persisting UI-only state or caching session-log data durably.
- Adding a plugin-defined session event type; derive from existing events instead.
