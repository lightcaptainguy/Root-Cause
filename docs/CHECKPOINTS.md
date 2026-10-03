# Backend checkpoints

No automatic commits or pushes. The latest user instruction authorized implementing all feasible backend components while they review the architecture. The groups below remain useful for separate review/commits. See BACKEND_IMPLEMENTATION.md and verification reports for actual completion and limits.

1. Contracts and configuration: implemented and tested.
2. Storage and ingestion: SQLite WAL, validated image import, safe assets, provenance and timestamp association. Restart/persistence tests.
3. API and jobs: FastAPI routes matching frontend contract, bounded background queue, error envelopes and saved results. End-to-end API tests.
4. Vision: verified PlantVillage classifier integration, preprocessing, actual prediction/evaluation and capability flags. Localization/segmentation added only with genuine methods and labeled limitations.
5. Agronomic metrics and attention: supplied formulas, missing-input behavior, versioned rules and explanation evidence.
6. Ollama explanations: local read-only tools/evidence, bounded conversation context, truthful outage responses, GPU workload coordination.
7. Integration: optional frontend build serving, standalone backend launch, measured smoke latency, restart/outage tests and demo documentation implemented. Frontend connection and physical offline rehearsal pending.

The original Jetson spec describes future deployment; latest user decisions govern this prototype.
