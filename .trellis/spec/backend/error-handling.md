# Error Handling

> How errors are handled in this project.

---

## Overview

DSH plugins in this repository surface errors explicitly and never report a failed operation as success. There is no silent fallback; unavailable capabilities are reported, not fabricated.

## Error Types

- **Domain errors** thrown by the pure core (e.g. duplicate `ConfigKey`, unknown key on unpin). Throw `Error` with an actionable message.
- **Remote errors** returned by DSH Remote calls as `{ ok: false, error: { code, message } }` (for example `session/model-unavailable`, `session/writer-held`). Preserve `code` and `message`.
- **Persistence errors** from the store seam; a failed write must throw so the caller can show a failure.

## Error Handling Patterns

- Validate before mutating: check model availability via the catalog before applying a selection; on invalid input, return/throw without changing state.
- In async event observers, use fire-and-forget with an explicit `.catch` that logs plugin storage failures; do not let an observer failure imply the user's action failed.
- Keep the previous effective configuration on any application failure; do not write successful history.
- Never use undocumented internals to work around a missing capability.

## API Error Responses

- UI actions display `error.code` / `error.message` to the user and leave state unchanged.
- Tool/command paths return the same result shape as the UI path.

## Common Mistakes

- Swallowing a persistence failure and showing success.
- Silently substituting another provider/model/reasoning value for an unavailable one.
- Reporting a failed save as applied, or claiming visual success from installation alone.
