# Chat SSE Preview Streaming Design

## Goal

Improve perceived chat streaming performance on the session page without replacing the existing JSONL-backed session model. Direct RPC events will be used only as best-effort preview data. The session JSONL file and `/api/session` remain the canonical source of truth.

## Architecture

The existing path remains intact:

```text
pi RPC writes JSONL
→ file watcher broadcasts reload
→ browser fetches /api/session
→ browser appends/upserts canonical entries
```

A new preview path runs in parallel:

```text
pi RPC message_update
→ worker accumulates assistant preview text
→ server broadcasts event: chat-preview
→ browser updates temporary assistant preview block
→ reload reconciliation clears/replaces preview with canonical entries
```

Preview events are not durable. If an SSE event is dropped or the browser reconnects, the next full-content preview or the existing JSONL reload repairs the UI.

## Server Components

### Safe SSE JSON formatting

Add a helper for named SSE events that JSON-marshals payloads and emits a single safe `data:` line. Chat content must not be manually concatenated into SSE frames.

### Worker stream callback

Extend worker construction so the RPC worker can notify the server about stream preview updates for a specific session. The callback boundary should keep the worker independent from HTTP details:

```go
type StreamPreview struct {
    Content string `json:"content"`
    Done    bool   `json:"done"`
}

type StreamEventSink func(StreamPreview)
```

The manager will pass the session ID/session path into worker creation so callbacks can be routed to the correct SSE topic.

### Preview accumulation

The RPC worker will inspect `message_update` events with `assistantMessageEvent` payloads. It will accumulate assistant text using full-state semantics:

- `text_delta`: append delta to current preview buffer
- `text_end`: set/confirm final content when provided
- `message_end`, `turn_end`, `agent_end`: mark preview done and clear the accumulator after the final preview broadcast

Broadcast payload:

```json
{
  "content": "full assistant text so far",
  "done": false
}
```

Each event contains the full preview text so dropped intermediate events do not corrupt the UI.

## Client Components

`templates/live_reload.js` will listen on the existing per-session EventSource for:

```js
es.addEventListener('chat-preview', ...)
```

The client will create or update one temporary assistant message block near the bottom of the transcript. It will not add the preview to `SEEN` or `LIVE_RENDERED`, because it is not canonical.

When the existing `reload` handler fetches `/api/session` and applies canonical entries, it will remove the temporary preview once matching/final canonical content arrives. A final/done preview can remain visible briefly until reload reconciliation.

## Error Handling and Correctness

- Missing or malformed preview payloads are ignored client-side.
- SSE reconnects do not replay preview events; canonical reload remains the recovery path.
- Slow clients may drop preview events; full-content events self-heal.
- Chat content is broadcast only to the exact session topic, never `__all__`.
- Existing status events and reload events keep their behavior.

## Tests

Server tests:

- SSE formatter safely formats named JSON events.
- Worker emits preview callback for `text_delta` and full content for subsequent deltas.
- Worker emits done preview on stream completion.
- Manager routes session ID into worker callback.

Client/export tests:

- Generated session HTML contains `chat-preview` event handling.
- Preview block is cleared during reload reconciliation.

Existing `make check` must pass.

## Documentation Updates

Update architecture and sequence docs to describe the actual current behavior:

- session reload fetches `/api/session` incrementally instead of full page reload
- chat has optional SSE preview streaming
- JSONL remains canonical
