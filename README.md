# dsh-modeldeck

A DSH plugin bundle (`@local/dsh-modeldeck`, "Model Deck" / 模型卡组) that lets
you quickly apply saved **provider + model + reasoning effort** combinations
from the conversation composer, while keeping **fixed presets** and a
**recent-history** list **per project**.

## What it does

- **Per-project decks** — fixed presets, recent history, pin state, and preset
  order belong to a project and are restored when you return to it.
- **Fixed presets** — add, rename, reorder, and remove presets, including ones
  pinned up from history. A preset is identified by its full configuration, not
  by its display name; one preset per configuration (duplicate adds are
  rejected).
- **Recent history** — only successfully applied combinations are recorded,
  deduped by configuration, most-recent-first, capped at 20 non-pinned entries
  per project. Pinned entries are exempt from the cap.
- **Pin / unpin** — a pinned history entry moves into the fixed area and never
  appears in both areas at once; unpinning returns it to history at its last
  successful-use time.
- **Composer entry** — a compact current-configuration summary button in the
  `conversation.composer.dock` slot expands to show fixed presets and recent
  history.

## Disclosed side effect (important)

Applying a configuration uses the supported DSH `session.selectModel`
operation. That operation **also saves the shared profile-wide model default**.
As a result, applying a selection can affect **new or unused sessions in other
projects** (any session that has no explicit pick and no prior request header).
Existing sessions with their own selection are unaffected. This plugin
discloses that side effect in its panel; it is a deliberate, accepted tradeoff
of the plugin-only delivery (see the task PRD/design).

## Install

Install into the active DSH profile with the `plugin_manager` tool, targeting
this package's absolute directory:

```
plugin_manager { action: "install_bundle", target: "<absolute path to this repo>" }
```

`package.json` declares `dsh.bundle.patch` (`./cordis.patch.yml`) and the
`dsh.client` Web section, so installation registers the Host row and the Client
slot entry. Remove with `plugin_manager { action: "remove_bundle", ... }`.

## Tests

Pure domain logic has runnable tests (no DSH dependency):

```
node --test
# or: node --test test/*.test.js
```

The tests cover dedup + recency reorder, capacity eviction (presets exempt),
pin/unpin mutual exclusion, project isolation, duplicate-preset rejection,
preset-removal history semantics, reasoning-absent key normalization, and the
invariant guards.

> Note: with Node v24.21.0, `node --test test/` treats the bare directory as a
> module entry. Use `node --test` (auto-discovery) or an explicit glob/file.

## Verification limits

This build is **install-ready but not runtime-verified**:

- **Installation** was not executed (no `plugin_manager` in the authoring
  environment) — install/uninstall behavior is unverified.
- **Live slot rendering** in the connected Web page is unverified; the
  `conversation.composer.dock` props contract and `--dsw-alias-*` token names
  are placeholders to confirm via `cordis_inspect_query` (`Slots`/`Theme`).
- **Persistence API** is a documented `ProjectDeckStore` seam with a provisional
  in-memory default. The durable, project-keyed store and stable project-id
  resolution are unverified; `resolveProjectId` is a clearly-marked TODO that
  safely no-ops until wired.
- The Client apply action (`ctx.remote.session.selectModel`) is a documented
  TODO placeholder, not invented.
