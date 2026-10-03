# Agent brief: frontend scaffold, API state and explanation chat

Copy this brief into your agent, attaching SHARED_FRONTEND_CONTRACT.md and PROTOTYPE_HANDOFF.md.

You are implementing frontend infrastructure and chat for an eight-hour hackathon prototype. Build, verify and deliver working code. Follow the shared contract; preserve unrelated work. Friend 1 owns App/layout/pages/components/styles. Backend/model logic belongs to the core team.

## Your files and first deliverable

Own frontend/package.json, lockfile, index.html, vite.config.ts, tsconfig files, src/main.tsx, src/types/contracts.ts, src/api/, src/hooks/, src/chat/, src/fixtures/, frontend/README.md and frontend/.env.example. Do not edit Friend 1 files.

Immediately scaffold React/TypeScript/Vite, publish contracts.ts, the useCropApp public interface and ChatPanel props from SHARED_FRONTEND_CONTRACT.md. main.tsx imports Friend 1's App.tsx; coordinate creation rather than overwriting it. Supply npm scripts dev, typecheck, build and preview. Choose mutually compatible dependency versions and commit the lockfile. Keep dependencies lean: React, React DOM, TypeScript, Vite and its React plugin. Plain-text chat avoids needing a Markdown dependency.

## API implementation

Implement a typed native-fetch client for every route in the shared handoff. Parse the error envelope and distinguish network/HTTP/invalid-response errors. No frontend requests to Ollama, no API credentials, no arbitrary filesystem URLs.

Provide dev proxy /api -> http://127.0.0.1:8000. Production uses relative /api URLs. Build output goes to frontend/dist for backend serving. No production CDN resources. Development preview alone does not prove backend-integrated offline operation.

Use AbortController for cancellation/timeouts (initial choices: 30s ordinary requests, 120s chat). Never automatically retry uploads, analysis starts or chat sends. GET retry can be offered manually. Preserve server error messages for 400/413/429/503. Validate required response shape at the boundary sufficiently to avoid silent UI crashes; record mismatches clearly.

## App state and polling

Implement the exact useCropApp interface in SHARED_FRONTEND_CONTRACT.md. Fetch health/zones on mount, then selected-zone observations/attention. Zone changes cancel pending view requests, clear old selected data, and fetch new data. Guard against late responses overwriting a newer selection.

Import sends FormData fields image and metadata; selecting newly imported observation is supported. analyzeObservation posts once, retains job ID, polls once per second while queued/running, then fetches result_id and refreshes observation/attention lists. Stop polls on terminal state/unmount; cancel view polling when selection changes. Backend jobs may continue even after client polling stops. Never treat client cancellation as backend cancellation.

Selection fetches observation and its latest_result_id if present; unknown/latest absent must clear the previous result. Cache job/result IDs per observation during this browser session so navigation can resume known jobs without duplicate POSTs. Serialize poll requests rather than overlapping them. After repeated transport failures pause polling with a visible retry action. Prevent stale results, duplicate analysis requests and zone context leakage.

## Explanation-only chat

Implement ChatPanel with local conversational history, question input, pending state, retry button and evidence chips. Send message plus selected zone/observation IDs, omitting null optional fields. Maintain returned conversation_id. On zone or observation context change, abort pending display request and start a fresh conversation with a visible context label; stale replies must not enter the new conversation.

Only one request in flight. Preserve user's question on failure. Display plain text safely, never dangerouslySetInnerHTML. Render limitations separately and evidence items through onOpenEvidence. Answer text comes from backend; don't fabricate advice or canned clinical/agronomic responses when Ollama is unavailable. No task creation, automation, configuration edits or tool-execution controls.

Suggested question buttons: 'Explain this observation', 'Why does this zone need attention?', 'Which measurements are missing?'. These send questions, not prewritten answers. Avoid generic chatbot-first layout; the selected observation is central context.

## Explicit fixtures

Implement a fixture transport behind VITE_DATA_MODE=fixture; default live. Export state.mode for prominent fixture banner. Fixture mode can never silently activate after a live API failure. Reject production builds configured for fixture mode, or provide a clearly separate fixture-demo build that cannot be mistaken for the live artifact; prefer rejecting fixture production builds.

Bundle a tiny local synthetic test image and transparent mask with known coordinates. Label all associated data Fixture / Simulated. Fixtures exercise available classification, leaf box, experimental segmentation, null/stale soil data, unknown attention, attention reasons, unsupported aerial input, queue-full, and unavailable chat. No external image hotlinks. Development fixtures are not measured or validated scientific results.

## Verification and handoff

Run typecheck/build. Verify FormData field names, no manually set multipart boundary, job polling termination, selection race protection, no duplicate POST on rerender, error envelope handling, unavailable Ollama, and evidence navigation. Use focused tests for polling and races if feasible with available tooling; otherwise document reproducible manual checks and remaining risk.

README: setup commands, API/proxy configuration, live/fixture modes, npm scripts, production dist location, how the backend serves it, known endpoints and offline verification. Real-API checks require the backend to exist; report fixture-only checks honestly. Verify final integrated demo with network disconnected after dependencies/models are prepared.

Send Friend 1 exported interfaces and example state early. Deliver changed files, commands/results and exact backend mismatches. No endpoint invention, no scientific computations, no backend edits.
