# Research: Plugin-only session-scoped model selection (delivery option B feasibility)

- Query: Under delivery option B (plugin only; no changes to the DSH application or its installed files), does a plugin have a SUPPORTED, non-hacky way to apply a provider/model/reasoning selection to ONLY the addressed session — without the shared profile-default side effect — so other sessions and other projects are unaffected?
- Scope: internal installed-package research; read-only installation inspection. Build: DSH desktop 0.2.1-rc.3 (nightly, commit be72761). Extends [installed-dsh-contracts.md](./installed-dsh-contracts.md).
- Date: 2026-10-28
- Planning status: research only. No task start, no status change, no product-code / install-file / PRD modification, no runtime config or credential reads.

## Decision-level answer

**No.** On this installed build there is **no supported, plugin-only way** to apply a model/reasoning selection to only the addressed session without also updating the shared default.

- The only public operation that applies a selection for the next request, `ctx.remote.session.selectModel(...)`, **has no isolation flag and unconditionally saves the shared default**. Its wire schema is a strict object of exactly `{sessionId, provider, model, reasoningEffort?}` — no extra parameter exists and `z.strictObject` would reject any ad-hoc flag.
- The only session-scoped mechanism that skips the default save is `ApiSessionAgentController.selectForNextRequest(agent, selection)`. That class is **not exported** and is reachable only by reaching into the private-ish runtime field `ctx.sessionController.agents`. That is an internal reach-in, not a supported contract.
- Modifying the shared default **does** affect other sessions in practice, but only a well-defined subset: sessions that (a) have **no explicit pending pick** and (b) have **no prior `request/header`**. All other sessions retain their own selection. It is **not** project-scoped: the default is a single process/profile-wide value, so "other projects" are affected exactly insofar as their fresh/never-used sessions read that default.

Therefore delivery option B as stated (strict current-session-only, no default side effect, other projects provably unaffected) **cannot be satisfied through a supported plugin API on this build**. Meeting it requires either a Host contract change (out of scope for B) or an explicit, documented requirements relaxation.

## Evidence

### 1. Public plugin API — no isolated option (VERIFIED)

The `session` Remote namespace is owned by the Host service `ctx.sessionController` (registered `super(ctx, "sessionController", { namespace: "session" })`): [service registration](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2952), [package ownership claim](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L13). Its public surface is exactly the `@Remote(...)`-decorated methods: `list, search, create, selectModel, initializeDefaultModel, modelCatalog, openWorkspacePath, workspacePathApplications, rename, fork, prompt, attachment, updateQueue, cancel, page, follow, projections, control`: [decorator list](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2676-L2700).

`selectModel` request type — the last word on what a caller may send:

| Schema | Fields | Anchor |
|---|---|---|
| Lax `z.object` | `sessionId`, `provider`, `model`, `reasoningEffort?` | [`typert.host.js:1171`](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js#L1171-L1176) |
| **Strict** `z.strictObject` | identical 4 fields only | [`typert.host.js:1336`](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js#L1336-L1341) |

There is **no** session-only / opt-out-of-default flag or second operation. The strict variant rejects unknown keys outright, so a plugin cannot smuggle a private flag through the Remote boundary.

### 2. The default save is unconditional in the command (VERIFIED)

`SessionCommandController.selectModel` validates the tuple, resolves call config, then does two things: (a) `this.agents.selectForNextRequest(agent, selected)` — the session-local application; (b) `void this.ctx.agentDefaultModel.saveSelection(selected).catch(...)` — **unconditional** shared-default write, never awaited, failure only logged: [source](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/types/commands.js#L155-L186) (mirrored in compiled [`index.js:793`](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L793-L821)). README confirms this is intended, not accidental: "A successful `selectModel` response acknowledges the Session-local selection without waiting for the default profile setting to save.": [README](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L91). JSDoc literally says "install one Session-local model selection; save the default in the background.": [doc](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L788-L792).

### 3. The only default-free path is an unsupported internal reach-in (VERIFIED mechanism; NOT a supported contract)

`selectForNextRequest(agent, selection)` is the exact session-local operation, and it does **only** `session.append("model/selection", selection)` + set the local selection cache — **no default save**: [source](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L312-L315).

But it belongs to class `ApiSessionAgentController` ([class head](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L180)), which is **not in the package's exports** — only `ApiSessionNotFound, SessionController, SessionFileReferences, SessionSkillCatalog, buildModelCatalog` are exported: [exports](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L3367). The instance lives on the *plain public field* `agents` of `SessionController` (declared `agents = __runInitializers(...)` and assigned `this.agents = new ApiSessionAgentController(ctx)`, with no `#` privacy): [field decl](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2935), [assignment](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2956).

So a plugin would have to call, in effect:
```js
const ctrl = ctx.sessionController;              // public service
const agent = await ctrl.agents.resolveAgent(sessionId);  // internal resolution
ctrl.agents.selectForNextRequest(agent, { provider, model, reasoningEffort });
```
Why this is **not** a supported contract and is fragile/risky:
- `agents` and `ApiSessionAgentController` are implementation details, not exported types or documented service methods; the class is absent from `package.json#exports` and the README's public contract.
- It bypasses everything the public command does *around* the write: `requireModel` catalog-availability validation (`session/model-unavailable`), `ctx.llm.resolveCallConfig` normalization (provider/model/effort normalization + reasoning validity), per-Agent serialization with image admission (`serializeImageAdmission`), subagent/writer-owned resume policy, and the standardized error mapping. A plugin reimplementing the missing pieces must own all of it and will diverge from Host behavior.
- The shape of the internal API is unversioned/undocumented; a nightly/patch bump can rename `agents`, rename `selectForNextRequest`, change `resolveAgent`'s return shape, or change `selectionFor`/cache semantics with no notice. It also silently breaks if the controller is refactored to a true `#private` field.
- It is exactly the "hacky" path delivery option B rules out. **Do not use silently.** If pursued at all, it must be an explicit, isolated, best-effort adapter with a hard capability probe (feature-detect the method and the `agents` field at runtime, degrade gracefully) and must be surfaced to the user as a non-contractual integration. Even then it remains unsupported.

Unknown: whether future builds keep `agents`/`selectForNextRequest` reachable. Not verifiable beyond this build; treat as unstable.

### 4. Effect of changing the shared default on other sessions (VERIFIED from getter)

Effective selection is computed by `selectionFor(agent)` closing over a `selection` object with a `current` getter: if a per-Session `picked` value exists it wins; else if `session.requestHeader()` exists the **logged** config wins; else it falls back to `defaultModel.currentSelection()`: [getter](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L274-L305), [fallback read at L285](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L285). `requestHeader()` returns the header in force after the last `request/header` event, or **`undefined` before the first one**: [requestHeader](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1600-L1618). `pending` (the explicit pick) comes from the `modelSelection` projection, which is fed by `model/selection` events: [projection apply](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2150-L2162).

Affected vs unaffected by a default change:

| Session state | Effective selection source | Affected by default change? |
|---|---|---|
| Has explicit pending pick (`picked !== undefined`) | `picked` | **No** — own pick wins |
| No pick, but has a prior `request/header` | logged header config | **No** — logged route wins |
| No pick, no prior request (fresh / never-used) | `defaultModel.currentSelection()` | **Yes** — reads the shared default |
| Running turn already in flight | keeps model/effort it started with | **No** for that turn; a later step of a still-unpicked session could re-read |
| Brand-new sessions created after the save | seeded from default at creation | **Yes** — adopt the newly saved default |

Supporting README statements: default change "affects only agents that subsequently resolve from it. An existing session whose request log already names a selection keeps that selection": [default-model README](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-default-model/README.md#L104-L106); "New Sessions read the last successfully saved default": [controller README](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L91).

Net: the stock setter does **not** disturb sessions that have their own pick or an established route, but it **does** change what fresh/never-used sessions and all future sessions resolve to. That is why the earlier research correctly refused to promise "other sessions/projects untouched."

### 5. Project identity and whether the default store is project-scoped (VERIFIED: single global default; NOT project-scoped)

- Project identity a plugin could use: `ctx.workspaceRegistry` — durable project records (ordered list of project directories + their sessions). Each entity has a stable `id` and canonical `path` (`realpath`-normalized), and membership is header-validated by `cwd` against the workspace path: [WorkspaceEntity id/path](./extracted/dsh/node_modules/@deepseek-ai/dsh-workspace/lib/index.js#L76-L121), [README summary](./extracted/dsh/node_modules/@deepseek-ai/dsh-workspace/README.md#L10-L12), [create/list API](./extracted/dsh/node_modules/@deepseek-ai/dsh-workspace/README.md#L51-L60).
- The default store is **not** keyed by project. `agentDefaultModel` is a single Cordis `Service` that "owns a single default; per-session model selection remains the entry point's responsibility" and is described as "**One process-wide default**": [limitation](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-default-model/README.md#L113-L116), [service type](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-default-model/lib/index.js#L17-L45).
- `saveSelection` persists into the **active profile's Cordis patch** via the config editor (`editor.edit(entry, () => config)`), one global profile entry, not a per-workspace row: [saveSelection](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-default-model/lib/index.js#L53-L66); settings README: "Changes persist through the active profile's Cordis patch": [settings README](./extracted/dsh/node_modules/@deepseek-ai/dsh-settings/README.md#L12).
- Consequence: sessions in **other projects share the same default store**. There is no project-scoped model default. A default change is therefore visible to every project's fresh/never-used sessions, not just the current project.

Unknown: whether a future build adds a project-scoped default; and whether any host-level composition overlays the agentDefaultModel config per workspace (none observed in this build). Not asserted.

## What delivery option B would require to be truthful

1. **Preferred:** relax the requirement to "current session applied immediately; the shared default may also update, impacting only fresh/never-used sessions and future sessions." Then use only `ctx.remote.session.selectModel` — fully supported, validated, event-published, encapsulated. State the shared-default side effect honestly in the PRD/UX.
2. **If strict isolation is mandatory:** it needs a Host capability (a session-only selectModel mode or `selectDefault: false`) — a DSH change, which option B forbids. Or a **feature-detected, clearly-labeled best-effort adapter** over `ctx.sessionController.agents.selectForNextRequest` that re-implements the missing validation/normalization and degrades when the internals are absent — never silent, never promised as stable.

## Caveats / Not Found

- Research only; no live request, no type-check, no runtime mutation, no install write, no credential read.
- "Supported" is judged against this build's exported package surface + README contracts. `agents`/`selectForNextRequest` are runtime-reachable but not part of any exported/documented contract.
- Whether `requestHeader()`-bearing sessions avoid default influence was proven from the getter logic, not by execution.
- Project-scoped default: not present in this build; future availability unverified.
- All helper/evidence/findings writes are confined to this task's `research/` directory; extraction used the existing [inspect_asar.py](./inspect_asar.py).
