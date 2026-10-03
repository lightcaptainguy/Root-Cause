# Shared frontend agreement

Give this file and ../PROTOTYPE_HANDOFF.md to both agents. Give each agent its own brief. The backend team owns scientific behavior and API implementation. These are proposed interfaces to implement against, not existing endpoints.

## Stack and ownership

React + TypeScript + Vite, npm, plain CSS, native fetch. No SSR, hosted services, CDN assets, browser model inference, map library or state-management framework required. Use a system font stack. English interface initially. Repository directory: frontend/.

Friend 1 owns src/App.tsx, src/components/, src/pages/, src/styles/.
Friend 2 owns all other frontend files, including package.json, lockfile, index.html, vite.config.ts, tsconfig files, src/main.tsx, src/types/, src/api/, src/hooks/, src/chat/, src/fixtures/, README.md.

Friend 2 creates the scaffold and shared exports first and sends them to Friend 1 immediately. Friend 1 can prepare components meanwhile. Keep App.tsx importing the following public interfaces. Coordinate interface changes explicitly; neither agent edits the other's files. Don't replace the whole frontend at integration time.

## Public React interfaces

Friend 2 exports from src/hooks/useCropApp.ts:

```ts
type RequestState = 'idle' | 'loading' | 'success' | 'error';
interface CropAppState {
  mode: 'live' | 'fixture';
  health: Health | null;
  zones: Zone[];
  selectedZoneId: string | null;
  observations: Observation[];
  selectedObservation: Observation | null;
  result: AnalysisResult | null;
  job: AnalysisJob | null;
  attention: AttentionItem[];
  loadState: RequestState;
  uploadState: RequestState;
  error: ApiError | null;
  selectZone(id: string): void;
  selectObservation(id: string): Promise<void>;
  importObservation(image: File, metadata: ObservationMetadata): Promise<Observation>;
  analyzeObservation(id: string): Promise<void>;
  refresh(): Promise<void>;
  clearError(): void;
}
export function useCropApp(): CropAppState;
```

Friend 2 exports src/chat/ChatPanel.tsx with props:

```ts
interface ChatPanelProps {
  zoneId: string | null;
  observationId: string | null;
  onOpenEvidence: (evidence: EvidenceItem) => void;
}
```

Friend 1 calls useCropApp once in App and passes state/handlers to its components. It mounts ChatPanel and owns its placement. Friend 2 owns internal chat styles, using the shared CSS tokens below. Observation/result evidence opens the indicated observation through selectObservation; chat context changes with selection. Reference/formula evidence without an asset URL displays its title/ID as provenance, not a broken link.

## Wire types: agree exactly

Use ../PROTOTYPE_HANDOFF.md route table and enums. Add these explicit definitions to resolve ambiguity:

- Source: {kind: dataset|recorded|live|simulated|user_supplied, name: string|null, reference: string|null}.
- ObservationMetadata: zone_id, captured_at: string|null, image_kind, crop_hint: string|null, source: Source, measurements: Measurement[], notes: string|null.
- Observation: metadata fields plus id, received_at: string, image: {url:string,width:number,height:number}, association: {status: associated|unassociated|partial, method:string|null, deltas_ms: Record<string,number>}.
- Measurement: {name:string,value:number|null,unit:string,measured_at:string|null,source:Source,quality:valid|stale|missing|invalid}.
- Metric: {name:string,value:number|null,unit:string,formula_id:string,formula_version:string,input_refs:string[],status:available|unavailable|invalid}.
- Box: {coordinates:[number,number,number,number],label:string,score:number|null,method:string}. Coordinates use original image pixels, xyxy.
- AnalysisJob: {id:string,observation_id:string,status:queued|running|completed|failed,result_id:string|null,error:ApiError|null}.
- AttentionItem: {observation_id:string,zone_id:string,status:attention|no_flag|unknown,reasons:string[],rule_version:string|null}.
- Health: {status:ok|degraded,vision_ready:boolean,ollama_ready:boolean,capabilities:Record<string,boolean>}.
- EvidenceItem: {kind:observation|result|reference|formula,id:string,title:string,observation_id:string|null,result_id:string|null}.
- ApiError: {code:string,message:string,details:unknown}. HTTP failures wrap this in {error:ApiError}; transport failures use code NETWORK_ERROR.
- ChatRequest: {message:string,zone_id?:string,observation_id?:string,conversation_id?:string}.
- ChatResponse: {conversation_id:string,answer:string,evidence:EvidenceItem[],limitations:string[]}.

AnalysisResult follows the full example in ../PROTOTYPE_HANDOFF.md; metrics use Metric[], localization boxes use Box[]. segmentation.denominator is leaf_area|image_area|null. Add result.created_at:string for chronological result display. Until the backend provides it, don't invent a timestamp. Add optional latest_result_id:string|null on Observation; absent means unknown. Selection can use it to retrieve a saved result. Completed polling uses job.result_id. This file takes precedence over the earlier handoff for these clarified shapes.

Multipart import uses field image (File) and field metadata (JSON string). No manual Content-Type header on FormData. API prefix is /api. Dev Vite proxy sends /api to http://127.0.0.1:8000. Production assets/API share one origin. GET /api/assets paths come from the backend.

## Styling tokens

Friend 1 defines tokens in src/styles/tokens.css; Friend 2 uses them with fallbacks until available: --color-bg, --color-surface, --color-text, --color-muted, --color-primary, --color-border, --color-danger, --color-warning, --radius-card, --space-2, --space-3, --space-4. Friend 2 applies no global CSS reset.

## Integration gates

First hour: scaffold, types and hook interface published; Friend 1 shell renders. Hour 3: import -> queued -> running -> result and chat work in explicit fixture mode. Hour 5: real API integrated. Final two hours: offline build, checks, fixes and rehearsal. Do not block UI work on actual crops/model outputs; use generic fixture labels visibly marked as fixtures.

New endpoint/type needs go to backend owner. Neither agent silently invents endpoints or changes scientific meaning. Include request/response examples and state transitions in any integration issue.

## Backend implementation update

Backend now runs independently at http://127.0.0.1:8000 using config/demo.json. Authoritative implemented schema: docs/openapi.json (one directory above this handoff folder); live /openapi.json is also available. POST /api/zones with {id,name} is an additive route for creating/configuring user-assigned zones.

Health has experimental_overlays capability in addition to classification/localization/segmentation/aerial_disease/cwsi/chat. localization and segmentation health flags refer to validated model capabilities and remain false. Optional color heuristics can nevertheless yield available result overlays; render their result method/limitations and prominently label them Experimental. They are leaf-region/discoloration candidates, not disease boxes or measured severity. Use each result's status to decide whether an overlay asset exists.

Default config disables experimental overlays; demo config enables them. Current classifier supports close-up leaves; aerial disease analysis returns unsupported. Chat answer includes backend-rendered numeric facts followed by generated qualitative text; evidence links stay separate. Failed/rejected generation returns 503 rather than a fallback answer. Always show limitations. Do not silently turn experimental discoloration into disease severity.
