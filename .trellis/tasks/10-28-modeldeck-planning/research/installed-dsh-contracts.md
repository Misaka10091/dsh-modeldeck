# Research: Installed DSH model switching and successful-change observation

- Query: Determine feasibility and constraints for dsh-modeldeck, especially observing successful configuration changes made through built-in controls and applying provider/model/reasoning to the current session.
- Scope: internal installed-package research; read-only installation inspection.
- Date: 2026-10-28
- Planning status: research only. No task start, product-code changes, installation writes, runtime configuration changes, or credential inspection.

## Findings

### Decision-level result

**Yes: this installed DSH records successful built-in model/effort selections as committed `model/selection` Session events.** Both the composer selector and `/model` use the same `session.selectModel` operation, so a Host plugin can observe their successful changes as well as ModelDeck's without intercepting the built-in UI. However, **the standard setter also updates the profile default**, so strict current-session-only isolation is not satisfied by using that setter unchanged.

A subscription to the current configuration projection is useful for display, but insufficient for complete recent-history tracking: identical reapplications append an event while the projection deliberately coalesces equal values. Use committed event identity (`session.id`, `event.seq`) and `event.time` when assessing history requirements. The source does not attach a UI-origin discriminator to `model/selection`, so it does not identify which entry point initiated a selection.

### Compatibility and evidence provenance

The binary archive inspected was `C:/Users/xiaoxi/AppData/Local/Programs/DeepSeek Harness/resources/app.asar`, 182434783 bytes. The nominal runtime root inside it is `dsh/`. The [archive helper](./inspect_asar.py) reads the ASAR header and selected byte ranges; the [header index](./asar-index.json) stores archive entry metadata. Only targeted official package documentation and compiled source were extracted under [the evidence directory](./extracted/).

The installed desktop package is **0.2.1-rc.3**, nightly channel, commit **be72761ee1a6736ebcdf4f3739363b083ae53c98**, clean build: [desktop metadata](./extracted/package.json#L4), [commit](./extracted/package.json#L25). Session Controller and UI Model Selection are also 0.2.1-rc.3: [controller package](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/package.json#L4), [UI package](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/package.json#L4).

The packages identify the official repository as `https://github.com/deepseek-ai/deepseek-harness.git`: [package metadata](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/package.json#L8). No external version was substituted for installed evidence. The minimum earlier compatible release is **unknown**. Packaged implementations are compiled JavaScript with source-region names; declaration targets are advertised in package exports but declaration files were not discovered/extracted in this focused pass. Source-level findings are verified for this installed build, not a promise of compatibility across future releases.

### Files found

| Extracted evidence | Purpose |
| --- | --- |
| [Controller README](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L13) | Documented Host service, Remote namespace, selection success and availability semantics |
| [Controller implementation](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L793) | Whole-tuple validation/application, committed event, default side effect, projection and catalog |
| [Controller Client](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js#L1539) | Observable projection store and generation/sequence handling |
| [UI selector README](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L76) | Both built-in controls share the same per-session directory and operation |
| [UI selector Client](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L802) | Real `ctx.modelDirectories` consumer, full selection and success/error handling |
| [Session README](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/README.md#L28) | Public `session/event`, append and flush contracts |
| [Session implementation](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1480) | Committed event publication, seq/time and observer failure containment |
| [Agent request integration](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js#L148) | Selection snapshot and actual request provider/model/reasoning routing |
| [Conversation README](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/README.md#L169) | Session-interface slot documentation |
| [Installed plugin UI reference](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md#L5) | Slot registration and lifecycle rules; used as SDK evidence, not loaded as an agent skill |

### 1. Reliable successful-change observation: verified with important limits

Concrete Host event:

```ts
ctx.on('session/event', (session, event) => {
  // event.type === 'model/selection'
  // event.data = { provider, model, reasoningEffort? }
  // event.seq / event.time identify this committed application.
})
```

This is supported by installed Session docs, which describe persistence plugins consuming this same feed: [public feed](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/README.md#L28), [append contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/README.md#L42). Session Controller itself uses the identical event registration: [Host consumer](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2997).

The command validates first, then calls `selectForNextRequest`, which appends `model/selection` and updates the Agent's selection: [command](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L793), [append/update](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L312). Validation failures do not reach the append. Every call reaching the append creates an event even when the tuple equals the prior choice; the append has no equality guard.

The Session implementation commits by pushing the event into its log before notifying `session/event` observers. Events carry an assigned contiguous `seq` and `Date.now()` time. Observer failures are logged and contained, so a research-derived history writer must surface its own storage failures rather than assume they reject the user's model switch: [commit contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1480), [event fields](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1528), [publication order](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1579).

Both built-in entry points use `ModelDirectory` and submit `session.selectModel`: [official description](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L76), [actual RPC invocation](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L880). Thus their successful switches enter the same feed as a plugin's selections.

**Limits:**

- The event means accepted/committed Session configuration. `append` does not wait for disk I/O; persistence is asynchronous. `ctx.sessions.flush(session)` is the separately documented durability barrier: [flush](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/README.md#L84). This agrees with the PRD's selection-success definition, but must not be described as proof of immediate disk flush or successful later inference.
- A live Host subscription does not replay old events; constructor seed events are not published on `session/event`: [seed behavior](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1349). Recovery/catch-up and exactly-once history storage across a crash were not verified. The feed supports observing future successful applications while the plugin is mounted; complete retroactive capture needs a separately planned recovery policy.
- Do not append another Session event synchronously from this callback: Session rejects reentrant append during publication: [reentry guard](./extracted/dsh/node_modules/@deepseek-ai/dsh-session/lib/index.js#L1568).
- No caller/source id or explicit switch-operation id appears in this event payload. It can observe all matching applications, but cannot reliably label the source as built-in versus ModelDeck.

### 2. Read current provider/model/reasoning: verified

The registered `modelSelection` projection's wire value is:

```ts
{ lastUsed: Selection | null, next: Selection | null }
// Selection = { provider: string, model: string, reasoningEffort?: string }
```

`model/selection` updates the pending tuple; `request/header` updates `lastUsed` from the actual request config and consumes matching pending intent. `next` is pending intent or last used: [projection implementation](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2135).

A resident Client session exposes `binding.session.projections.faceOf('modelSelection')`, with `getSnapshot()` and `subscribe()`. The built-in service consumes exactly this face: [actual binding](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L1034), [subscription](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L847), [observable projection contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js#L1539). The shared service is `ctx.modelDirectories.directoryFor(sessionId)`; its directory has `store`, `load()` and `select(selection)`: [resolver](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L985), [methods](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L856). These names are verified implementation surfaces of an exported Client package; external declaration ergonomics were not type-checked.

Before any selection/request, `next` can be null. Built-in display falls back to the catalog's deployment default. Missing/unavailable catalog items retain the stored ids; they are not silently replaced: [fallback and routability](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L946), [documented retention](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L58).

**Projection-only subscriptions cannot count all successful reapplications.** `sameSelection` makes repeated equal pending selections return the same projection state: [equality/coalescing](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2156). A history requirement that refreshes recency for reapplying the same tuple must observe actual committed events rather than infer applications from changed display values.

### 3. Atomic whole-selection application and errors: verified, with a scope conflict

Concrete Client Remote operation:

```ts
const result = await ctx.remote.session.selectModel({
  sessionId,
  provider,
  model,
  reasoningEffort, // optional; adapter-owned id
})
// success result.value.selected = the normalized installed tuple
// error result.error.code / result.error.message
```

The Host service is `ctx.sessionController`; the Remote namespace is `session`: [official ownership](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L13). The Host command resolves/resumes the addressed Agent, serializes selection with image/prompt admission, checks exact provider/model availability, resolves reasoning config, then installs the entire tuple and returns `{ selected }`: [whole operation](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L793), [serialization](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L336). This avoids three independent provider/model/effort setter races.

Unavailable provider/model and configuration resolution failures surface as `session/model-unavailable`; writer ownership can surface as `session/writer-held`, and subagent-controlled sessions reject Agent-bound operations: [availability](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L618), [error path](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L813), [activation errors](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L237). Built-in Client code explicitly handles `{ok:false,error}` and retains failure for presentation: [Client result handling](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L880).

**Critical current-session isolation gap:** after installing the addressed selection, the command unconditionally calls `ctx.agentDefaultModel.saveSelection(selected)` asynchronously. There is no session-only/default-opt-out branch in this setter: [side effect](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L808). Its success acknowledges Session application without waiting for default persistence, and default failure only logs a warning: [documented semantics](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md#L91).

This affects future sessions. It can also affect an existing never-used session: when an Agent has no explicit pick and no prior request header, its effective selection reads the shared current default: [fallback getter](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L282). Existing sessions with explicit pending picks or prior request routes retain their local state. Therefore it would be incorrect to promise that the stock setter leaves every other session/project's future effective configuration untouched.

**Host change needed if strict isolation is retained:** a supported current-session-only application mode/operation that preserves the same validation, event publication, acknowledgment and request routing but does not update the profile default. This is a required contract capability, not an existing API name. No public current-session-only alternative was verified in this focused pass. Calling internal `ApiSessionAgents.selectForNextRequest` or manually appending an event is not a supported substitute: validation, resume rules and execution-cache installation belong to the controller.

### 4. Later request consistency: verified statically

`installModelSelection` snapshots `selection.current` at prompt assembly. The same snapshot sets prompt variables and the subsequent `agent/request` config's provider, model, and effort; absent effort removes inherited effort. A concurrent later switch therefore applies to a later step rather than splitting the already assembled request: [request integration](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js#L148).

A running step retains the model/effort it started with: [official UI contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L14). The recorded `request/header` config feeds `lastUsed` in the projection, providing later request evidence distinct from selection acknowledgment: [request projection](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L2161). No live generation or configuration mutation was performed to test this; this is installed-source verification.

### 5. Provider/model/reasoning catalog: verified

The actual installed API is **`ctx.remote.session.modelCatalog()`**, not an inferred `session.models` call. The UI README's implementation paragraph still uses `session.models`, but the actual Host and Client implementation agree on `modelCatalog`: [Host operation](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L3121), [Client call](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L752).

It returns `{ default, routableProviders, groups, failures }`. Groups provide provider `id/name`; models provide `id/name/description?`, with optional `reasoning: { efforts: [{id,name,description?}], defaultEffort? }`: [catalog construction](./extracted/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js#L563). Reasoning values are adapter-owned identifiers, not a universal enum. Absent reasoning metadata means the built-in UI omits the effort row; there is no arbitrary effort input: [documented UI contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L44).

The shared catalog refreshes on forwarded `llm/adapters-updated`, `settings/document-updated`, `credentials/record-updated`, and `credentials/reference-updated`; connection reset invalidates generations: [refresh subscriptions](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/lib/client.js#L1002). No credentials were read during research. How `resolveCallConfig` treats every unsupported effort value was not traced; validate against current advertised efforts and compare the normalized successful return rather than assume no normalization.

### 6. Session-interface extension points: partially verified

- `conversation.input.model.label` is a documented session-scoped `single` slot with provider/model props and `trigger/menu/option` placements. It permits **non-interactive inline content**; it is insufficient by itself for the desired interactive preset entry point: [contract and registration](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-model-selection/README.md#L48).
- `conversation.input.activity` is documented as a control between model selector and Send, with an expansion lifecycle: [conversation contract](./extracted/dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation/README.md#L169). Occupancy/conflict policy and complete props were not inspected.
- Installed UI plugin guidance recommends an allocated slot such as `conversation.composer.dock` when available, using `ctx.slots.inject` and `ctx.slots.register` and checking `Slots.listSubTree` for the chosen slot contract: [official reference](./extracted/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md#L5). The precise dock declaration was not extracted, so final entry-point design remains open technical work.

### 7. Stable project ID and durable project-isolated plugin storage: unknown in this focused pass

No verified project identity or plugin storage API is asserted here. Session identity and `cwd` exist, and the controller uses a Workspace registry, but these facts do not establish a stable project key or a project-isolated durable store. In particular, do not assume that session id, normalized directory string, browser localStorage, or Session plugin records meet the project's persistence/isolation requirements.

Project identity lifecycle, rename/move semantics, storage transactions/concurrency, restart durability and surfaced write errors remain evidence gaps. The parent requested early return once switching and observation were established, so this research intentionally stops before broad workspace/storage extraction.

### Related specs

The [task PRD](../prd.md#L50) requires current-session-only application and subsequent-request consistency; [recent history](../prd.md#L32) requires success-only recording including repeated successful applications. These findings identify one requirement/host-contract conflict and support broad successful-change observation if a Host component is present.

## Caveats / Not Found

- Research only; no implementation feasibility spike, type-check, installation write, API mutation or live model request.
- Strong evidence for successful built-in-switch observation **while mounted**, using the Host event feed. This does not prove complete capture while plugin is unloaded, after process crashes, or across multiple writers.
- No source-entry tag in the event; no projection-only way to reliably infer identical reapplications.
- Stock `session.selectModel` is whole-tuple and acknowledged but has the shared-default side effect. Strict current-session isolation requires a supported Host contract change or an explicit requirements adjustment.
- Stable project identity, durable project plugin storage, full interactive slot suitability and minimum compatible DSH version remain unknown.
- Requirements artifacts and product source were not modified. All helper/evidence/findings writes are under this task's research directory.
