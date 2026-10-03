# How the prototype architecture is being implemented

This is a study guide and decision record. The component discussions below record the design reasoning established at checkpoint 1. Implementation has since advanced: storage, ingestion, timestamp association, API/jobs, local ONNX classification, CWSI, demo attention rules, opt-in experimental overlays and Ollama explanations are implemented. See BACKEND_IMPLEMENTATION.md for current verification and limitations; subsections marked planned below are the historical design proposal, not current progress indicators.

## 1. Why the proposed backend moved from C++ to Python

The original design used C++ to own sensor ingestion, GPU buffers, synchronization, TensorRT and native rendering. Python was a specialist agronomic extension. That design addressed a Jetson system processing real sensor streams.

The prototype now processes supplied images on a Windows laptop, has an approximately eight-hour hackathon window, and uses a local web UI. Under those constraints I proposed Python for backend orchestration: image import, model calls, formula execution, database access and HTTP endpoints. It reduces the amount of binding/build/integration work needed before the demo functions.

This language change was an implementation recommendation, not a requirement in your original specification. It should have been identified explicitly when proposed. You have now said it is acceptable.

The tradeoff is that the prototype does not demonstrate the original C++ memory and scheduling guarantees. We must not describe it as an implemented lock-free, zero-copy Jetson pipeline. Python isn't inherently a substitute for a high-rate native ingestion path, and a web API alone says nothing about inference speed.

The intended computational split is Python for control flow, native libraries for image decoding/database access/model execution, and Ollama for language generation. Heavy inference can execute in native/GPU runtimes without rewriting every API handler in C++. We will measure actual latency; no performance outcome is established yet.

If a C++ backend later becomes required, preserve the wire contracts and replace internal adapters progressively. A sensible first native boundary is inference or live sensor transport, based on profiling. Do not recreate a complete C++ backend solely to claim the language choice. The frontend can remain unchanged when the API meaning stays the same.

## 2. The complete planned path

```text
Image + supplied metadata
    -> validate and store observation
    -> associate compatible timestamped telemetry
    -> enqueue analysis
    -> vision adapter produces typed results
    -> formula engine evaluates supported inputs
    -> versioned rules produce attention reasons
    -> save result in SQLite
    -> frontend displays evidence

Farmer's question + selected zone/observation
    -> retrieve relevant stored evidence and approved references
    -> local Ollama model explains that evidence
    -> return answer, evidence references and limitations
```

The image-analysis path and chat path share evidence but have different responsibilities. A chat answer is not an image measurement. The model's generated wording cannot become a new sensor value or silently replace an inference result.

## 3. Each component and why it exists

### Inputs and observation identity

An observation is one imported image with its known context: source, image kind, optional capture time, zone and measurements. An ID lets storage, analysis, UI and chat refer to the same evidence reliably. A zone is a team-defined label, not an invented geographical location.

Capture time answers when the source image was collected. Receive time answers when our application imported it. If capture time is missing, assigning receive time as capture time would create false knowledge. The contract keeps them separate.

The crop hint is optional user context. It is not a disease answer. Dataset ground-truth labels are kept in evaluation data, outside inference metadata, so demonstration predictions cannot simply repeat the known label.

### Validation and contracts: implemented

backend/contracts.py defines what data means and which combinations are allowed. Pydantic checks data at boundaries and serializes it as JSON for the web UI and storage. The frontend and backend must agree on names, units, nulls, statuses and image coordinates before integration.

Implemented rules include timezone-aware timestamps normalized to UTC; finite numeric values; scores between 0 and 1; nonempty xyxy boxes; explicit segmentation area denominators; missing measurements stored as null; and coherent terminal job states. Unknown fields are rejected rather than silently accepted. Model status checks prevent unavailable capabilities from carrying pretend predictions.

These checks are structural, not scientific validation. A valid model score doesn't prove calibrated confidence. A well-formed box can still exceed a particular image's dimensions; an ingestion/result validator must compare it with the actual image. Known units, crop-specific formulas and measurement ranges require domain rules in later checkpoints.

Generated docs/schemas files expose the structural contract. Python validators enforce additional relationships that JSON Schema alone may not express. The generated files are not an OpenAPI server and are not proof of running endpoints.

### Image import and assets: planned

The backend will verify supported image formats, size and decoded dimensions, then save the image under an application-managed ID. The browser receives an /api/assets/... URL, not a filesystem path. This separates UI access from how files are physically organized.

Original images remain evidence. Any resized model input is a derived representation. Predictions and overlay coordinates must be mapped back to original image space before the frontend renders them. Resize and padding transformations belong to the inference adapter.

### Timestamp association: planned

Transport and association solve different problems. A queue moves messages; timestamp association decides which readings describe an image. We will not block image analysis waiting for absent sensors.

Association requires the same zone, comparable timestamps and an acceptable age difference. The proposed default tolerance is 1000 ms, configurable and not a validated sensor requirement. Record the selected reading, delta and method. Without sufficient evidence, report unassociated.

Interpolation is an estimate between valid bracketing continuous readings, subject to a gap limit. It cannot recover absent physical sensors or reconcile unknown clocks. Never interpolate disease labels or zone IDs. Preserve raw values and references to derivation rather than overwriting source telemetry.

### Bounded analysis queue: planned

Analysis may take longer than accepting an HTTP request. A job ID lets the API accept work and let the UI poll status without keeping an upload request open.

The proposed initial policy is one inference worker and at most 16 pending jobs. This protects memory usage and makes overload visible. A full queue returns an error; silently dropping an uploaded observation would break the evidence trail. This is a bounded Python queue proposal, not an implemented C++ SPSC queue.

For real multi-sensor ingestion later, a single-producer/single-consumer queue must have exactly one writer and one reader. Multiple sources need separate queues or a deliberately chosen aggregation topology. Nonblocking transport does not eliminate association rules.

### Vision model: planned

There are three separate outputs: image-level classification, localized object boxes, and pixel masks. A PlantVillage classifier predicts a crop/disease category for an analyzed leaf image. It does not automatically identify lesion pixels or disease boxes.

We will first integrate a candidate pretrained leaf model and verify its label order and preprocessing: channel order, normalization, input dimensions and output interpretation. A downloaded checkpoint must actually be exercised and evaluated; availability on the internet isn't verification.

PlantVillage provides labeled leaf images. It is a dataset, not the runtime itself. Using a pretrained checkpoint needs sample/evaluation images; developing or fine-tuning a model needs training images and separate validation data. There is no need to train the explanation language model on every crop photograph.

Leaf boxes may be useful for localization but must retain that label. Lesion masks require a genuine segmentation method; experimental image heuristics need an explicit method label. Affected fraction is meaningful only with its denominator, such as total leaf pixels. A whole-field aerial photograph is a different domain; unsupported analysis stays unsupported.

### Agronomic formulas and attention: planned

Formulas compute values from declared inputs with units and provenance. For example, CWSI in the original spec needs canopy temperature, air temperature and upper/lower baseline differences. No RGB-only prediction can supply these inputs as actual telemetry.

Formula execution requires the inputs and valid denominators. Store formula/version and input references. When inputs are missing, return unavailable, not a numerical placeholder.

Attention is a rule outcome over evidence, not a second chatbot diagnosis. Its version and reasons allow the UI and assistant to explain why it flagged something. Unknown means insufficient information; no_flag means no configured rule triggered. Neither proves a healthy crop. Thresholds are pending supplied formulas/domain definitions, not hardcoded agronomic facts.

### SQLite: planned

SQLite will persist observations, jobs, results, assets and their relationships locally. The WAL proposal separates normal reads from append-heavy work better than a single shared in-memory record list, while retaining a file-based database. Actual concurrency and power-loss behavior depend on our connection/transaction settings and will be tested.

Results should remain traceable to their source observation and model/formula versions. Reanalysis creates another result rather than silently rewriting historical evidence. latest_result_id offers convenience without destroying the older result.

DuckDB is deferred because the prototype has no requested field maps or large analytical workload yet. If later queries need it, add a defined analytical snapshot/read path; do not duplicate writes without a consistency policy.

### Ollama and the assistant: planned

Ollama is a local model runtime/listener, not the entire evidence system. Installing a language model gives us generation; our application must provide selected observation results, approved references, conversation context and controlled read-only tools.

The assistant may read evidence and explain it. It cannot create farmer tasks or mutate records. Instructions in imported notes or retrieved reference text are data, not authorization for new actions. Backend code controls which tools exist and how they execute.

Initial answers should be grounded in a small bounded evidence context and return evidence IDs the UI can open. Evidence inclusion doesn't alone guarantee faithful wording; verification must include missing-data and unsupported-image questions. If Ollama is unavailable, report unavailable rather than simulate an AI answer.

The local HTTP listener is compatible with offline operation: localhost networking stays on the machine. Offline means no dependency on remote services during operation, not no HTTP anywhere. Model/package downloads happen beforehand.

### GPU use and scheduling: planned

The laptop's finite VRAM is shared by vision and language generation. Model weights, context/cache and intermediate buffers all consume memory; download size is not total runtime memory. Start with small models and bounded contexts, load models once where practical, and benchmark.

Serialize GPU-heavy calls initially to reduce contention. A running language request isn't automatically preemptible by a vision request. Prioritization between requests and true GPU preemption are different claims. Record queue time, inference time and total latency separately so we can locate bottlenecks before optimization.

Unlike the Jetson NVMM plan, image-file input normally involves CPU decoding and transfer to the inference runtime. Browser display is another representation. Zero-copy is not a truthful description of this prototype path.

### Local web UI: assigned to friends

The browser handles interaction and rendering; scientific interpretation remains in backend results. Production serves built static assets and API from one local origin. Vite helps frontend development and isn't required as a second production server.

The UI must distinguish predictions, measured data, experimental overlays and missing capabilities. It uses original-image coordinates, explicit model scores and area denominators. It must not create fallback fake results after a backend failure. Development fixtures stay visibly separate from the live demo.

## 4. How to read checkpoint 1

Read in this order:

1. backend/contracts.py: Source, Measurement and ObservationMetadata describe inputs.
2. Observation adds received time, image identity, association and latest result.
3. Classification, Localization and Segmentation describe independent vision capabilities.
4. Metric and Attention describe computed/rule-based results.
5. AnalysisJob describes asynchronous transport state; AnalysisResult describes completed evidence.
6. ChatRequest, EvidenceItem and ChatResponse describe explanation exchange.
7. backend/config.py shows operational defaults, not source measurements.
8. tests/test_contracts.py shows the kinds of incorrect data the contracts reject.

Default values should be read carefully. Empty measurements means none supplied; it does not mean all sensors measured zero. Default unknown attention does not mean healthy. Null model paths mean not configured, not a functioning fallback model.

## 5. Decision record

| Decision | Origin | Consequence | Status |
|---|---|---|---|
| Offline local processing | Original spec and user | Prepare all assets/models beforehand; no cloud inference | Accepted requirement |
| Eight-hour hackathon window | User | Prioritize end-to-end working flow and honest capability gaps | Accepted constraint |
| Supplied images; no Jetson hardware now | User | File ingestion replaces physical capture for demo | Accepted scope |
| PlantVillage | User | Leaf classification dataset; additional outputs need separate methods | Accepted dataset choice |
| Timestamp association separate from queue; no assembly dependency | User | Explicit clock/tolerance rules; transport choice independent | Accepted design direction |
| Use genuine demo metadata | User | Preserve missing values and provenance; no invented telemetry | Accepted requirement |
| Defined zones, no maps | User | Zone identifiers replace geospatial projection in prototype | Accepted scope |
| Inspect plus attention-required view | User | Both supported in frontend/API | Accepted product requirement |
| Explanation/advice only | User | Assistant has no task creation or mutation tools | Accepted behavior |
| Web UI replaces Qt | User | Original no-server requirement superseded for prototype | Accepted change |
| Friends own frontend | User | Shared contracts and separated ownership | Accepted work split |
| Python orchestration replaces initial C++ backend | Assistant proposal; user now accepts | Faster integration goal; original native guarantees deferred | Accepted prototype direction |
| FastAPI, React/TypeScript/Vite | Assistant proposal | Local API + built static frontend | Proposed implementation choices |
| SQLite first; DuckDB deferred | Assistant proposal | One persistence engine until analytics justify another | Proposed simplification |
| Queue 16, worker 1, tolerance 1000 ms | Assistant proposal | Bounded initial operating policy | Defaults to verify, not measured optimum |
| Small local explanation model; pretrained classifier first | Assistant proposal | Avoid full training before an integrated demo | Candidate approach; models unverified |
| Review/push one checkpoint at a time | User | Stop after each tested implementation checkpoint | Accepted workflow |

Crop/disease shortlist, supplied formulas/thresholds, sample telemetry provenance and lesion/aerial model capabilities remain unresolved. Frontend/API foundations need not wait for them.

## 6. Your decision notes

Use this template when you choose or change something:

```text
Decision:
Problem it solves:
Alternatives considered:
Reason for choosing it:
Tradeoff / capability deferred:
Evidence or test needed:
Prototype-only or future production choice:
Date / checkpoint:
```

An implementation detail is justified when it supports a requirement or measured constraint. Keep proposals separate from accepted choices and measurements separate from assumptions. At each checkpoint we can record what changed, why, how it was checked and what remains unimplemented.
