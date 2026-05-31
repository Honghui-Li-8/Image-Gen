# Ticket 07 — Detailed Progress Stream Implementation Plan

## Top Overview

### Goal
After this ticket ships, generation progress shown in the frontend comes from real ComfyUI execution events instead of fabricated polling increments. The backend worker opens a ComfyUI websocket for the active generation, submits the prompt with the matching `client_id`, translates queue/node/step/success/error events into the existing SSE status stream, and surfaces concise progress detail and generation errors to the UI. Fast ComfyUI failures no longer sit at fake `90%` until timeout.

### Implementation Shape
1. Fix the proxy websocket tunnel so `/comfy/ws?clientId=...` forwards to ComfyUI as `/ws?clientId=...`.
2. Extend `comfyui.service.ts` with `client_id` prompt submission, signed websocket connection helpers, event parsing, and fetch timeouts.
3. Replace the fake worker progress loop with websocket-driven status updates plus bounded `/history/:promptId` fallback/finalization.
4. Extend the generation SSE payload with optional progress detail and error propagation while preserving existing fields.
5. Update frontend types, SSE handling, and TopBar UI to show concise queued/running/sampling/finalizing/failed detail.
6. Add focused tests for proxy forwarding, ComfyUI event normalization, worker success/failure flows, and frontend rendering.

### Core Invariants
1. The browser continues to connect only to the API SSE endpoint; it never connects directly to the proxy or ComfyUI.
2. Every generation worker terminates as `completed` or `failed`; no generation remains stuck in `running` after ComfyUI has emitted a terminal event.
3. `/history/:promptId` remains the final source of generated image filenames.
4. Websocket binary preview frames are ignored for this ticket and never stored.
5. Any in-memory activity tracking is bounded and cleaned up when the generation reaches a terminal status.
6. Existing SSE clients that only consume `status`, `progress`, and `imageUrl` remain compatible.

---

## Commit Plan

### Commit 1: Forward ComfyUI websocket query params through proxy

**Issue**
The proxy exposes `/comfy/ws`, but its upstream builder clears query params. A client connecting to `/comfy/ws?clientId=<uuid>` is forwarded to ComfyUI as `/ws`, which prevents prompt-scoped event routing.

**Impact**
Without query forwarding, the API worker cannot reliably receive events for the client id it submits with `/prompt`. This makes real per-generation progress flaky or dependent on global broadcast behavior.

**Work**
1. In `proxy/src/config.ts`, change `buildComfyWsUrl()` to accept an optional search string or `URLSearchParams`.
2. Preserve only the websocket query string from the incoming `/comfy/ws?...` URL; keep the upstream pathname fixed at `/ws`.
3. In `proxy/src/index.ts`, parse `req.url`, validate pathname is `/comfy/ws`, and pass `url.search` into `buildComfyWsUrl`.
4. Keep existing HMAC verification against the full request URL, including query string.
5. Add or update proxy tests for:
   - `buildComfyWsUrl("?clientId=abc")` returns `ws://.../ws?clientId=abc`.
   - signed websocket auth still validates paths with query strings.

**Justification**
The proxy remains a dumb tunnel and does not need to understand ComfyUI semantics. Forwarding the query string is the minimal change needed for ComfyUI `client_id` routing.

**Deliverables**
1. `/comfy/ws?clientId=<uuid>` tunnels upstream as `/ws?clientId=<uuid>`.
2. Existing websocket auth behavior is preserved.

**Verification**
1. `pnpm --filter image-gen-proxy test`
2. Manual proxy log or focused test confirms upstream URL includes `clientId`.

**Pre-drafted commit message**
```text
fix(proxy): forward ComfyUI websocket clientId query

Websocket:
- Preserve /comfy/ws query params when opening upstream /ws
- Keep HMAC verification on the full upgrade URL
- Cover query forwarding and signed auth in proxy tests
```

---

### Commit 2: Add ComfyUI websocket primitives to API service

**Issue**
`comfyui.service.ts` only supports HTTP prompt submission and history polling. It cannot submit a `client_id`, open the signed proxy websocket, parse ComfyUI websocket messages, or distinguish terminal error events.

**Impact**
Without service-level websocket primitives, the worker has to mix low-level websocket parsing and lifecycle code into generation orchestration. That makes error handling harder to test and easier to leak.

**Work**
1. Add `ws` and its types to `api/package.json` if not already available to the API package.
2. Extend `submitComfyWorkflow(workflow, options?: { clientId?: string })`.
3. When `clientId` is provided, POST `{ prompt: stripped, client_id: clientId }`.
4. Add `getComfyFetchTimeoutMs()` or a local helper using `AbortSignal.timeout(...)` for prompt and history fetches.
5. Add a `buildComfyWsProxyUrl(clientId: string)` helper that returns `${PROXY_URL}/comfy/ws?clientId=<encoded>`.
6. Add a signed websocket connection helper that passes `X-Proxy-Timestamp` and `X-Proxy-Signature` headers for `GET /comfy/ws?clientId=...`.
7. Define normalized ComfyUI websocket event types:
   ```ts
   type ComfyWsEvent =
     | { type: "progress"; promptId?: string; nodeId?: string; value: number; max: number }
     | { type: "executing"; promptId?: string; nodeId: string | null }
     | { type: "execution_success"; promptId?: string }
     | { type: "execution_error"; promptId?: string; message: string; nodeId?: string }
     | { type: "execution_interrupted"; promptId?: string; message: string }
     | { type: "status" | "execution_start" | "executed" | "execution_cached" | "progress_state"; promptId?: string; raw: unknown };
   ```
8. Add `parseComfyWsMessage(data, isBinary)` that ignores binary frames, returns `null` for malformed JSON, and extracts known event fields.
9. Unit test:
   - `submitComfyWorkflow` includes `client_id` when provided and omits it otherwise.
   - `parseComfyWsMessage` normalizes `progress`, `execution_success`, `execution_error`, `execution_interrupted`.
   - Binary frames and malformed JSON return `null`.
   - Websocket signing uses the path with query string.

**Justification**
Keeping parsing/signing helpers in `comfyui.service.ts` gives the worker a small, testable interface. It also keeps proxy auth details out of generation orchestration.

**Deliverables**
1. API can submit prompts with matching `client_id`.
2. API can build and sign the proxied ComfyUI websocket URL.
3. API can normalize ComfyUI websocket messages into typed internal events.

**Verification**
1. `pnpm --filter image-gen-api test -- src/services/comfyui.service.test.ts`
2. `pnpm --filter image-gen-api typecheck`

**Pre-drafted commit message**
```text
feat(api): add ComfyUI websocket event primitives

ComfyUI:
- Submit workflow client_id when a worker clientId is provided
- Build and sign proxied /comfy/ws?clientId=... websocket connections
- Normalize progress, success, error, interruption, and ignored binary frames
- Add per-request timeout support for ComfyUI HTTP calls
```

---

### Commit 3: Drive generation worker from ComfyUI websocket events

**Issue**
`runComfyGeneration` currently polls `/history/:promptId` and emits fabricated `+5%` progress until an image appears. If ComfyUI fails quickly or returns terminal non-image history, the worker can keep showing fake progress up to `90%` until timeout.

**Impact**
The UI can mislead users into thinking a failed generation is still running. Operators also lose the useful ComfyUI error message that explains why a generation failed.

**Work**
1. In `api/src/services/generation-job.service.ts`, generate `clientId = randomUUID()` before prompt submission.
2. Open the ComfyUI websocket before submitting the prompt where practical.
3. Submit the patched workflow with `submitComfyWorkflow(patched, { clientId })`.
4. Persist `promptId` immediately after submission.
5. Replace the fake polling loop with an event-driven promise that:
   - Filters ComfyUI websocket events by `promptId` once known.
   - Maps `execution_start`/`executing` to `running` detail.
   - Maps `progress.value / progress.max` to visible progress.
   - Emits `detail.stage = "sampling"` with `step` and `totalSteps`.
   - Treats `execution_success` as finalization trigger.
   - Treats `execution_error` and `execution_interrupted` as terminal failure.
6. On `execution_success`, fetch `/history/:promptId` and extract the final image filename before marking `completed`.
7. Add bounded `/history` fallback:
   - Poll only while websocket is disconnected or after success while waiting for final image output.
   - Stop after `COMFYUI_TIMEOUT_MS`.
   - Inspect `history[promptId].status.status_str`, `completed`, and `messages` when present.
   - Fail with a clear missing-output error when terminal history has no image.
8. Add reconnect behavior:
   - Reconnect with the same `clientId` only while generation is non-terminal and inside timeout.
   - Clean up timers, websocket listeners, and fallback pollers on terminal status.
9. Ensure `updateGenerationStatus` persists `failed` with `error` from ComfyUI `exception_message` where available.
10. Map overall progress from node position plus per-node progress:
    - Build an execution node order from the submitted workflow snapshot.
    - Use current `executing.node` to determine node index.
    - Use `progress.value / progress.max` to fill the current node's segment.
    - Keep progress monotonic and reserve `100` for terminal `completed` or `failed`.
11. Unit test worker scenarios:
    - Progress websocket event emits real progress and detail.
    - `execution_success` plus history image completes.
    - `execution_error` fails promptly with error message.
    - `execution_interrupted` fails promptly.
    - History fallback completion still works after websocket disconnect.
    - Binary/malformed frames do not crash the worker.

**Justification**
The worker already owns generation lifecycle. Replacing its status source with websocket events keeps ownership intact while removing fabricated progress and exposing terminal failure signals promptly.

**Deliverables**
1. `runComfyGeneration` uses ComfyUI websocket progress as the primary status source.
2. Fast ComfyUI failures transition to `failed` without waiting for timeout.
3. History polling is retained only as bounded fallback/final output extraction.

**Verification**
1. `pnpm --filter image-gen-api test -- src/services/generation-job.service.test.ts`
2. Manual generation shows non-`+5%` progress movement during sampling.
3. Manual forced ComfyUI error reaches `failed` with visible error message.

**Pre-drafted commit message**
```text
feat(api): drive generation status from ComfyUI websocket

Worker:
- Open /comfy/ws?clientId=... per active generation
- Submit matching client_id with /prompt and filter events by prompt_id
- Map progress/executing/success/error/interrupted events to generation updates
- Keep bounded history fallback and final image extraction
- Fail promptly on ComfyUI execution errors instead of fake 90 percent timeout
```

---

### Commit 4: Extend generation SSE payload with progress detail

**Issue**
The current SSE status payload only carries coarse `status`, `progress`, `imageUrl`, and `error`. Real ComfyUI events include useful stage information such as queued, executing node, sampling step count, and finalizing state.

**Impact**
If the SSE contract is not extended, the frontend can receive real numeric progress but still cannot explain what is happening. Users see a bar but no context.

**Work**
1. Add a `GenerationProgressDetail` type in the API service layer:
   ```ts
   interface GenerationProgressDetail {
     stage?: "queued" | "executing" | "sampling" | "finalizing" | "completed" | "failed";
     nodeId?: string;
     nodeLabel?: string;
     step?: number;
     totalSteps?: number;
     message?: string;
   }
   ```
2. Extend `GenerationUpdateEvent` with optional `detail`.
3. Update `emitGenerationUpdate` and `updateGenerationStatus` call sites to pass detail where available.
4. Update `serializeGenerationUpdate` in `api/src/routes/generations.routes.ts` to include optional `detail`.
5. Preserve existing response shape for clients that ignore `detail`.
6. Add tests for SSE serialization with and without `detail`.
7. Ensure `error` is included for terminal failure events and raw traceback is not serialized into the main SSE payload.

**Justification**
An optional field is the least disruptive API change. It keeps the browser-facing contract stable while allowing richer status display.

**Deliverables**
1. SSE status events can include optional `detail`.
2. Failed events include concise `error` messages.
3. Existing minimal SSE consumers remain compatible.

**Verification**
1. `pnpm --filter image-gen-api test -- src/routes/generations.routes.test.ts`
2. Existing SSE route tests still pass unchanged or with additive assertions.

**Pre-drafted commit message**
```text
feat(api): include optional progress detail in generation SSE

SSE:
- Add optional detail stage/node/step/message fields to generation updates
- Preserve existing status/progress/imageUrl/error fields
- Include concise ComfyUI errors without exposing raw tracebacks
```

---

### Commit 5: Show live generation detail in frontend

**Issue**
The frontend currently shows only a progress bar and percentage. It has no place to show whether ComfyUI is queued, starting, sampling, finalizing, or failed.

**Impact**
Even with backend real progress, the user still lacks the necessary context to understand slow jobs or fast failures.

**Work**
1. In `app/src/types.ts`, add `GenerationProgressDetail` and attach it to `Work` or active generation-facing state as appropriate.
2. In `app/src/utils/worksApi.ts`, extend `GenerationStatusEvent` with optional `detail`.
3. In `app/src/hooks/useGeneration.ts`, store the latest `detail` from SSE updates.
4. Clear progress detail when a generation reaches `completed`, `failed`, is reset to `idle`, or a new generation starts.
5. In `app/src/components/TopBar.tsx`, render a concise detail label when a generation is active:
   - `Queued`
   - `Starting`
   - `Running node <id>` or known label
   - `Sampling 12/28`
   - `Finalizing`
   - `Failed`
6. On failure, render `Generation failed` with a short reason snippet only. Cap the visible reason to a small length, around 20-30 characters, so backend/internal errors do not dominate the toolbar.
7. Log full failure details to the browser console only when the frontend is running in development mode. Production UI should not expose raw tracebacks.
8. In `app/src/styles.css`, style the detail label so it does not overflow or shift the toolbar at narrow widths.
9. Add frontend tests for:
   - Mapping SSE detail into work state.
   - Rendering `Sampling 12/28`.
   - Rendering failed detail without layout-only text such as raw JSON.

**Justification**
The UI should show the smallest useful amount of detail. This keeps the app understandable without turning the TopBar into a ComfyUI event console.

**Deliverables**
1. Frontend parses optional SSE `detail`.
2. TopBar shows concise live generation detail next to existing progress UI.
3. Failure messages remain user-safe and do not show raw traceback/JSON.

**Verification**
1. `pnpm --filter image-gen-app test`
2. `pnpm --filter image-gen-app typecheck`
3. Manual viewport check at desktop and mobile widths confirms no toolbar overflow.

**Pre-drafted commit message**
```text
feat(app): show live ComfyUI generation detail

Progress UI:
- Parse optional generation SSE detail payloads
- Store latest queued/executing/sampling/finalizing/failed detail in work state
- Render concise status text alongside the existing TopBar progress bar
- Keep text responsive and avoid raw ComfyUI internals
```

---

### Commit 6: End-to-end verification and documentation touchups

**Issue**
This ticket changes the generation status pipeline across proxy, API worker, SSE, and frontend UI. Unit tests cover each layer, but the full path needs a documented manual verification pass.

**Impact**
Without a full-path check, query forwarding, client id matching, prompt id filtering, and frontend rendering can each pass in isolation while the real integration still fails.

**Work**
1. Add a short note to `proxy/README.md` documenting `/comfy/ws?clientId=...` behavior.
2. Add a short note to `docs/tickets/07-detailed-progress-stream.md` or this plan if any implementation caveat was discovered.
3. Run relevant checks:
   - `pnpm --filter image-gen-proxy test`
   - `pnpm --filter image-gen-api test`
   - `pnpm --filter image-gen-app test`
   - `pnpm --filter image-gen-api typecheck`
   - `pnpm --filter image-gen-app typecheck`
4. Manual happy path:
   - Start proxy, API, app, and ComfyUI.
   - Trigger a generation.
   - Confirm worker submits matching `client_id`.
   - Confirm progress moves from real websocket events.
   - Confirm final image appears.
5. Manual failure path:
   - Trigger or mock a ComfyUI execution error.
   - Confirm frontend reaches failed state promptly with concise error.
   - Confirm worker closes websocket/fallback timers.

**Justification**
The main risk is integration drift between separately tested layers. A documented manual pass catches contract mismatches before handoff.

**Deliverables**
1. README/docs note for websocket query forwarding.
2. Recorded verification commands and manual outcomes in the ticket or handoff notes.

**Verification**
1. All listed test/typecheck commands pass.
2. Manual happy and failure paths are confirmed.

**Pre-drafted commit message**
```text
docs: document ComfyUI websocket progress verification

Docs:
- Note /comfy/ws?clientId=... proxy behavior
- Record manual happy-path and failure-path checks for detailed progress
```

---

## Commit Correlation

| Commit | Relationship | Reason |
|---|---|---|
| Commit 2 | Depends on Commit 1 | API websocket connections need proxy query forwarding to route ComfyUI events by `clientId` |
| Commit 3 | Depends on Commit 2 | Worker orchestration needs the API websocket helper, parser, and `client_id` prompt submission |
| Commit 4 | Depends on Commit 3 | SSE detail fields are driven by normalized worker events |
| Commit 5 | Depends on Commit 4 | Frontend detail UI consumes the optional SSE `detail` contract |
| Commit 6 | Depends on Commits 1-5 | End-to-end verification only makes sense after all layers are wired |

---

## Implementation Notes

- **Open websocket before prompt submission when possible**: This avoids missing early `execution_start` or queue events. The worker should still tolerate events arriving before `promptId` is known by ignoring unscoped events until the `/prompt` response returns.
- **Prompt id filtering is required**: Even with `clientId`, filter execution events by `data.prompt_id === promptId` once available.
- **Progress mapping should reserve terminal states**: Keep `100` exclusively for completed/failed terminal updates. Use the active node index plus that node's `progress.value / progress.max` when present. Equal node weights are acceptable for MVP, but KSampler/sampler nodes should receive larger weight if workflow metadata makes that straightforward because they dominate runtime.
- **History fallback can detect some failures but is not equivalent to websocket errors**: ComfyUI history entries can include `status` and `messages`, but websocket `execution_error` is still the fastest and richest failure signal. If websocket is unavailable, the worker should continue with bounded history fallback and degrade progress/error fidelity explicitly.
- **Do not overfit node labels**: If workflow node labels are not reliably available, showing `Running node 12` is acceptable. Add friendly labels only where local workflow metadata makes it trivial.
- **Running cancellation remains out of scope**: ComfyUI `/interrupt` can affect the active server execution globally. Queued-only cancel should be a separate ticket if needed.
- **Docs are gitignored**: `docs/` is ignored by this repo's `.gitignore`; use `git add -f docs/tickets/07-detailed-progress-stream-plan.md` if this plan needs to be committed.

---

## Definition of Done

1. `/comfy/ws?clientId=<uuid>` forwards to ComfyUI `/ws?clientId=<uuid>` and remains HMAC-protected.
2. API prompt submission includes `client_id` matching the worker websocket `clientId`.
3. Worker progress updates are driven by ComfyUI websocket `progress` events, not fixed `+5%` increments.
4. ComfyUI `execution_error` and `execution_interrupted` produce prompt `failed` generation status with a concise frontend-visible error.
5. `execution_success` triggers final `/history/:promptId` image extraction and completed SSE emission.
6. Bounded fallback history polling handles websocket disconnects without leaking timers/listeners.
7. SSE status events include optional `detail` while preserving existing fields.
8. Frontend displays concise live detail for queued/running/sampling/finalizing/failed states without layout overflow.
9. Binary websocket frames are ignored safely.
10. Proxy, API, and app tests/typechecks listed in Commit 6 pass, or any skipped command is documented with the reason.
