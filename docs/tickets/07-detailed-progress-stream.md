# 07 — Detailed Progress Stream

## Status
Planning

## Summary

Replace fabricated generation progress with real ComfyUI execution progress. After this ships, the backend worker listens to ComfyUI's WebSocket for the active prompt, translates queue/node/step/error events into the existing generation status stream, and the frontend shows enough live detail for a user to understand whether a job is queued, running, progressing, completed, or failed.

This ticket also fixes the current failure mode where a fast ComfyUI failure can leave the app polling `/history` and sitting at fake `90%` until timeout.

---

## Context

Ticket **03 — ComfyUI Integration** added real generation but kept the original approximate progress model: after submitting a prompt, the API polls `/history/:promptId`, increments progress by `+5`, caps at `90`, and only marks completion when an image appears. ComfyUI's history endpoint is a poor source for live progress because it is mostly useful after execution ends.

ComfyUI exposes a single WebSocket endpoint (`/ws`) that emits real-time messages such as `status`, `execution_start`, `executing`, `progress`, `executed`, `execution_success`, `execution_error`, and `execution_interrupted`. The existing proxy already has a `/comfy/ws` tunnel, but the API worker does not use it and the proxy currently does not preserve `?clientId=...` when connecting upstream.

Related tickets:
- **03 — ComfyUI Integration**: Provides the current worker, `/prompt` submission, `/history` polling, and SSE status contract.
- **04 — ComfyUI Proxy Server**: Provides the proxy and `/comfy/ws` tunnel that this ticket extends.
- **05c — API Gap Closure and Known Tradeoffs**: Documents fake progress as deferred Gap 1.
- **06 — ComfyUI Quality Improvement**: Separate image-quality work; this ticket only changes status/progress visibility.

---

## User Stories

1. **Real progress** — As a user generating an image, I want the progress bar to reflect real ComfyUI execution progress so that I can tell the job is actually moving.
2. **Execution detail** — As a user, I want concise status text showing whether the job is queued, running a node, sampling steps, completing, or failed so that I do not have to guess what the system is doing.
3. **Fast failure visibility** — As a user, I want ComfyUI errors to appear quickly instead of waiting for the backend timeout so that failed generations do not look stuck.
4. **Operational clarity** — As a developer, I want ComfyUI WebSocket events normalized behind the existing API SSE contract so that the browser does not talk directly to the GPU proxy.

---

## Flow

```text
User clicks Generate
  -> API creates generation row: queued / 0
  -> worker creates clientId
  -> worker opens proxy websocket: /comfy/ws?clientId=<clientId>
  -> worker submits /comfy/prompt with { prompt, client_id: clientId }
  -> ComfyUI returns prompt_id
  -> worker filters websocket events by data.prompt_id
       status / execution_start      -> queued/running status update
       executing                     -> current node detail
       progress                      -> real step progress
       execution_error/interrupted   -> failed immediately
       execution_success             -> fetch final history, persist image
  -> API emits normalized SSE events to frontend
  -> frontend updates progress bar and concise status detail
```

---

## Design Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| WebSocket ownership | One ComfyUI WebSocket per active generation worker | Queue limits are small, cleanup is simple, and prompt routing stays local to the worker that owns the generation |
| Browser connection | Keep browser on existing API SSE endpoint | The API remains the auth and normalization boundary; ComfyUI/proxy details stay server-side |
| Prompt scoping | Generate a `clientId`, pass it to `/comfy/ws?clientId=...`, and submit it as `client_id` to `/prompt` | ComfyUI uses `client_id` to route events; `prompt_id` is then used to filter exact job messages |
| Final output source | Keep `/history/:promptId` as final source of image refs | WebSocket `executed` output can vary by workflow node; history is still the stable final extraction point |
| Progress persistence | Persist only latest status/progress/detail, not a full event log | The UI needs current state, and unbounded in-memory event history risks memory growth |
| Activity history | Optional bounded in-memory debug buffer only, max 50 small events per active generation | Useful for diagnostics without storing binary preview frames, full workflows, or unbounded arrays |
| Failure handling | Treat `execution_error` and `execution_interrupted` as terminal immediately | This directly fixes the fake-90% stall for fast ComfyUI failures |

---

## Technical Scope

### Data

No required migration.

Optional if implementation needs durable detail after refresh:
- Add nullable `statusDetail` text column to `generations` for concise UI text such as `Queued`, `Running KSampler`, `Sampling 12/28`, or `ComfyUI error: CUDA out of memory`.

Do not store raw WebSocket event payloads, binary preview frames, full tracebacks, or image preview bytes in the database.

### API / Backend

**`proxy/src/config.ts` / `proxy/src/index.ts`**
- Preserve the incoming `/comfy/ws?clientId=<uuid>` query string when building the upstream ComfyUI WebSocket URL.
- Keep existing HMAC verification for websocket upgrades.
- Continue rejecting non-`/comfy/ws` upgrade paths.

**`api/src/services/comfyui.service.ts`**
- Extend `submitComfyWorkflow` to accept an optional `clientId`.
- Include `client_id` in the `/comfy/prompt` body when provided:
  ```ts
  { prompt: stripped, client_id: clientId }
  ```
- Add a ComfyUI WebSocket helper that connects to `${PROXY_URL}/comfy/ws?clientId=<clientId>` using signed HMAC headers.
- Parse JSON text frames and ignore binary frames for this ticket.
- Normalize supported ComfyUI event types:
  - `status`
  - `execution_start`
  - `executing`
  - `progress`
  - `progress_state` if present
  - `executed`
  - `execution_cached`
  - `execution_success`
  - `execution_error`
  - `execution_interrupted`

**`api/src/services/generation-job.service.ts`**
- Replace the fake `+5%` progress loop with WebSocket-driven updates.
- Keep the async worker. The worker remains responsible for workflow patching, prompt submission, websocket listening, DB updates, SSE emission, final history fetch, timeout, and cleanup.
- Generate a `clientId` before submission and submit the same value to ComfyUI.
- After `/prompt` returns `prompt_id`, filter websocket messages by `data.prompt_id === promptId`.
- Map `progress.value / progress.max` into the app's `progress` number, reserving early range for setup/queue and `100` for completed.
- On `execution_success`, fetch `/history/:promptId` once and extract the final image filename.
- On `execution_error` or `execution_interrupted`, immediately mark the generation `failed`, persist the error, emit terminal SSE, close the websocket, and stop polling/reconnect attempts.
- Add a bounded fallback poll for `/history/:promptId` so completion can still be detected if the websocket drops near the end.
- Add per-request timeout to ComfyUI HTTP fetches used by the worker so an unresponsive `/history` call cannot hang past `COMFYUI_TIMEOUT_MS`.
- Reconnect the websocket with the same `clientId` only while the generation is non-terminal and still inside the overall timeout.

**`api/src/routes/generations.routes.ts`**
- Preserve the existing `GET /generations/:id/status` SSE route.
- Extend SSE payloads compatibly with optional detail fields. Existing clients that only read `status`, `progress`, and `imageUrl` must keep working.

Suggested compatible payload extension:
```ts
{
  generationId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  imageUrl?: string;
  error?: string;
  detail?: {
    stage?: "queued" | "executing" | "sampling" | "finalizing" | "completed" | "failed";
    nodeId?: string;
    nodeLabel?: string;
    step?: number;
    totalSteps?: number;
    message?: string;
  };
}
```

### Client / UI

**`app/src/hooks/useGeneration.ts` / `app/src/utils/worksApi.ts` / `app/src/types.ts`**
- Accept the optional SSE `detail` object without breaking older responses.
- Store the latest detail on the active work or generation-facing UI state.

**`app/src/components/TopBar.tsx`**
- Keep the existing progress bar.
- Add concise live status detail next to or below the progress number when a generation is active:
  - `Queued`
  - `Starting`
  - `Running node <id>` or a known node label when available
  - `Sampling 12/28`
  - `Finalizing`
  - `Failed`
- The detail must not overflow or shift the toolbar on narrow screens.

**UX constraints**
- Do not expose raw JSON, tracebacks, or long ComfyUI internals in the main UI.
- Do not show every node transition if that creates noisy flicker; prefer the latest meaningful status.
- Error UI should surface the concise failure message already used by the generation flow.
- Binary preview images are out of scope.

### Error Handling

- `ComfyUI websocket unavailable before prompt submit`: proceed with current `/history` fallback, show approximate setup/running state, and log the websocket failure.
- `ComfyUI websocket disconnects mid-generation`: reconnect with same `clientId` while inside timeout; continue bounded `/history` fallback.
- `execution_error`: mark generation `failed` immediately with `exception_message` when present.
- `execution_interrupted`: mark generation `failed` immediately with a cancellation/interruption message.
- `execution_success` but history has no image ref: retry bounded history fetch until timeout, then fail with a clear missing-output error.
- `/history` returns terminal failure data without an image: mark generation `failed`; do not keep polling to fake `90%`. Inspect `history[promptId].status.status_str`, `completed`, and `messages` when available.
- Frontend failure display: show a short generic label such as `Generation failed` plus at most a short reason snippet. Full raw ComfyUI tracebacks must not render in the main UI.
- Binary websocket frame: ignore for this ticket.
- Malformed websocket JSON: log and ignore that frame unless repeated malformed frames force websocket fallback.

---

## Must-Address Gates

- Real ComfyUI `progress` events must drive the visible progress bar when available.
- ComfyUI `execution_error` and `execution_interrupted` must terminate the generation promptly.
- A generation must not remain in `running` at fake `90%` after ComfyUI has already failed or returned terminal non-image history.
- Websocket progress must combine current node position with per-node `progress.value / progress.max` when both are available, so the overall bar remains monotonic across node transitions.
- The browser must continue using the API SSE endpoint; it must not connect directly to the proxy or ComfyUI.
- In-memory activity tracking, if added, must be bounded and cleaned up on terminal status.

---

## Acceptance Criteria

Happy path:
- [ ] A generation submits to ComfyUI with a `client_id` that matches the worker's websocket `clientId`.
- [ ] The proxy forwards `/comfy/ws?clientId=<uuid>` to ComfyUI as `/ws?clientId=<uuid>`.
- [ ] During sampling, the frontend progress bar updates from real ComfyUI `progress.value / progress.max` events instead of fixed `+5%` increments.
- [ ] The frontend shows concise live detail for queued/running/sampling/finalizing states without layout overflow on desktop or mobile widths.
- [ ] On `execution_success`, the worker fetches `/history/:promptId`, stores the generated image filename, emits `completed`, and closes the websocket.

Error and guard cases:
- [ ] If ComfyUI emits `execution_error`, the generation reaches `failed` promptly with a non-empty error message and no timeout wait.
- [ ] If ComfyUI emits `execution_interrupted`, the generation reaches `failed` promptly with an interruption message.
- [ ] If ComfyUI terminal history contains no output image, the generation fails with a clear missing-output error instead of polling indefinitely.
- [ ] If the websocket disconnects mid-generation, the worker reconnects or falls back to bounded history polling without leaking timers/listeners.
- [ ] Binary preview frames are ignored and do not crash the worker.
- [ ] Existing SSE clients that only consume `status`, `progress`, and `imageUrl` continue to work.

Verification:
- [ ] Unit tests cover websocket message normalization for `progress`, `execution_success`, `execution_error`, and ignored binary/malformed frames.
- [ ] Unit tests cover `submitComfyWorkflow` sending `client_id` when provided.
- [ ] Proxy tests or focused integration tests cover query forwarding for `/comfy/ws?clientId=...`.
- [ ] Generation worker tests cover fast ComfyUI failure resolving to `failed` instead of fake `90%` timeout.
- [ ] Frontend tests cover rendering of progress detail from SSE payloads.
- [ ] `pnpm --filter image-gen-api test`, `pnpm --filter image-gen-proxy test`, and relevant app tests pass.

---

## Key Files

| File | Change |
|---|---|
| `proxy/src/index.ts` | Modified — preserve websocket query params and tunnel `/comfy/ws?clientId=...` upstream |
| `proxy/src/config.ts` | Modified — build ComfyUI websocket URLs with optional query string |
| `proxy/src/lib/hmac.test.ts` or new proxy websocket tests | Modified/New — cover signed websocket query forwarding |
| `api/src/services/comfyui.service.ts` | Modified — submit `client_id`, add websocket connection and event normalization helpers |
| `api/src/services/comfyui.service.test.ts` | Modified — cover `client_id` body and event parsing |
| `api/src/services/generation-job.service.ts` | Modified — replace fake polling loop with websocket-driven worker flow and bounded fallback |
| `api/src/services/generation-job.service.test.ts` | Modified — cover progress, success, failure, reconnect/fallback behavior |
| `api/src/routes/generations.routes.ts` | Modified — include optional status detail in SSE payloads |
| `app/src/types.ts` | Modified — add optional generation progress detail type |
| `app/src/utils/worksApi.ts` | Modified — parse optional detail fields from generation status events |
| `app/src/hooks/useGeneration.ts` | Modified — apply progress detail updates from SSE |
| `app/src/components/TopBar.tsx` | Modified — show concise live generation detail with existing progress bar |
| `app/src/styles.css` | Modified — responsive styling for status detail |

---

## Out of Scope

- **Live preview images** (post-MVP): ComfyUI sends binary preview frames, but this ticket ignores them to keep memory and UI scope controlled.
- **Separate worker process / Redis queue** (post-scale): The existing in-process async worker remains; this ticket improves the worker's status source, not the deployment topology.
- **Full ComfyUI event timeline UI** (post-MVP): The main UI shows only the latest useful detail, not a log of every node event.
- **Prompt or image quality tuning** (Ticket 06): This ticket does not change prompts, workflows, samplers, or model settings except for passing `client_id`.
- **Direct browser-to-proxy websocket** (not planned): The API remains the status boundary for auth, filtering, and normalization.
- **Deployment automation** (Ticket 08): This ticket does not change production deployment scripts.

---

## Dependencies

- **Ticket 03** (ComfyUI Integration) — current ComfyUI worker and SSE status contract must exist.
- **Ticket 04** (ComfyUI Proxy Server) — `/comfy/ws` tunnel and HMAC proxy auth must exist.
- **Ticket 05c** (API Gap Closure and Known Tradeoffs) — documents the fake-progress gap this ticket closes.
