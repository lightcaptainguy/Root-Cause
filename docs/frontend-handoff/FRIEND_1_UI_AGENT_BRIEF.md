# Agent brief: farmer interface and image inspection

Copy this brief into your agent, attaching SHARED_FRONTEND_CONTRACT.md and PROTOTYPE_HANDOFF.md.

You are implementing the farmer-facing UI of an eight-hour hackathon prototype. Build the code, verify it and deliver it; do not stop at a design proposal. Work only in your assigned frontend files. Follow the shared contract, and preserve existing unrelated work. The other frontend agent supplies scaffold, hooks, types and ChatPanel. The backend team supplies real analysis.

## Your files

frontend/src/App.tsx
frontend/src/components/{AppHeader,ZoneSelector,ObservationList,ObservationImportForm,ImageInspectionViewer,ClassificationCard,MeasurementsTable,MetricsList,LimitationsPanel,StatusBadge}.tsx
frontend/src/pages/{InspectPage,AttentionPage}.tsx
frontend/src/styles/{tokens,global,layout,inspection}.css

You may add components within these owned folders. Do not edit package/config/api/types/hooks/chat files. Avoid extra UI dependencies; request any necessary dependency from Friend 2.

## Product and layout

Create a polished, calm agricultural dashboard: warm neutral background, dark readable text, restrained green accents, amber attention states, generous spacing. Prioritize evidence and clear actions over decorative charts. System fonts, locally available assets, no emojis as the primary icon system. App title: Crop Health. No maps.

At desktop widths, use a header with zone selector and status, a narrow observation/history panel, a main Inspect/Attention workspace, and a persistent right chat sidebar around 320-380px wide. At narrow widths stack panels and offer a Chat toggle; prevent horizontal scrolling. Use the selected zone/observation as shared context. Show Fixture mode prominently whenever state.mode is fixture.

## Implement these flows

1. Inspect: pick existing observation or import image; select zone and image kind; display original image/source; explicitly request Analyze. After import select the returned observation. Prevent repeated Analyze while queued/running. Show queued/running/completed/failed states without invented progress percentages.
2. Import form: accept supported raster images (initially JPEG/PNG), zone, closeup_leaf/aerial/other, optional known crop, optional actual capture timestamp, source fields, notes, optional metadata JSON. Validate metadata structure using shared types/helpers; show errors. Metadata JSON may supply measurements. Never auto-fill soil values or capture time. Manual imports default source to user_supplied; do not label them PlantVillage automatically. Do not add a disease ground-truth field to inference input.
3. Viewer: original image with independent leaf-box and lesion-mask toggles, image size/source text and fit-to-panel control. Use a responsive SVG layer with viewBox='0 0 width height' over the exact image rectangle; account for letterboxing. Mask must match original image geometry and preserve alpha. Show method labels, disable unavailable overlays, and never generate boxes/masks yourself. Revoke local preview object URLs when replaced/unmounted.
4. Classification: crop, predicted label, model score and model ID from backend. Show score as percentage with label 'Model score'; missing score shows Unavailable, not 0%. Keep localization separate from disease prediction.
5. Measurements: values, units, source, measurement time and quality; missing values use an em dash plus Missing label. Capture time and received time have distinct labels. Show formula outputs with formula/version and unavailable states. Display affected fraction only with its denominator: '% of leaf area' or '% of image area'.
6. Attention: show backend reasons grouped by selected zone, with observation links that open Inspect. No_flag text: 'No configured flags'; unknown text: 'Not enough information'. Do not equate either with healthy. Display rule version in details. Do not recompute thresholds in the browser.
7. History: selectable observation list with thumbnail, source, image kind, capture time if present (otherwise 'Capture time unknown'), and clear selected state. No invented trends from one observation.
8. Chat placement: mount supplied ChatPanel with current IDs and evidence handler. Provide starter context text but leave messages/networking to Friend 2. Evidence selecting an observation switches to Inspect and loads that observation.

## Required states and accessibility

Handle no zones, empty observations, initial loading, metadata validation failure, upload failure, queue full, backend offline, failed inference, unsupported aerial analysis, missing measurements, and unavailable segmentation. Distinguish backend errors from empty results. Provide retry/refresh where applicable.

Semantic buttons/labels; keyboard accessible tabs and overlay toggles; visible focus; aria-live status for job/error updates; accessible contrast; status text alongside color. Don't expose developer jargon in the main farmer workflow. Put model/method details in expandable evidence details.

## Verification and delivery

Check a landscape and portrait image with known fixture box coordinates at desktop and narrow widths; overlays must remain aligned after resize. Check null measurement/score display, unknown versus no_flag, unsupported aerial input, upload error, and keyboard navigation. Run shared typecheck and production build after Friend 2 provides scripts. Use meaningful overlay/state tests if test tooling is available; don't spend the deadline constructing a large test framework.

Deliver working components/styles, brief changed-file summary, verification results, and unresolved integration issues with exact expected fields. Finish core flows before animations or cosmetic refinements. Do not claim scientific accuracy or implement backend/model logic.
