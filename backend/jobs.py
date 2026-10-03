import asyncio
import logging
import time
import uuid

from .agronomy import attention_for, calculate_metrics
from .contracts import AnalysisJob, AnalysisResult, ApiError
from .errors import ServiceError
from .storage import utc_now

log = logging.getLogger(__name__)


class JobRunner:
    def __init__(self, store, settings, vision):
        self.store, self.settings, self.vision = store, settings, vision
        self.queue = asyncio.Queue(maxsize=settings.queue_capacity)
        self.worker = None

    async def start(self):
        self.store.fail_interrupted_jobs()
        self.worker = asyncio.create_task(self.run())

    async def stop(self):
        if self.worker:
            await self.queue.join()
            self.worker.cancel()
            try:
                await self.worker
            except asyncio.CancelledError:
                pass

    def submit(self, observation_id):
        self.store.observation(observation_id)
        active = self.store.active_job(observation_id)
        if active:
            return active
        if self.queue.full():
            raise ServiceError(429, "QUEUE_FULL", "Analysis queue is full; try again after a job completes")
        job = AnalysisJob(id=str(uuid.uuid4()), observation_id=observation_id, status="queued")
        self.store.save_job(job)
        self.queue.put_nowait((job, time.perf_counter()))
        return job

    async def run(self):
        while True:
            job, enqueued = await self.queue.get()
            try:
                running = AnalysisJob(id=job.id, observation_id=job.observation_id, status="running")
                self.store.save_job(running)
                result = await asyncio.to_thread(self.analyze, job.observation_id, enqueued)
                completed = AnalysisJob(id=job.id, observation_id=job.observation_id, status="completed", result_id=result.id)
                self.store.complete(completed, result)
            except Exception:
                log.exception("Analysis failed: %s", job.id)
                failed = AnalysisJob(id=job.id, observation_id=job.observation_id, status="failed",
                                     error=ApiError(code="ANALYSIS_FAILED", message="Analysis failed; see backend logs"))
                self.store.save_job(failed)
            finally:
                self.queue.task_done()

    def analyze(self, observation_id, enqueued):
        started = time.perf_counter()
        observation = self.store.observation(observation_id)
        path, _ = self.store.asset(observation.image.url.rsplit("/", 1)[-1])
        inference_start = time.perf_counter()
        classification, limitations = self.vision.classify(path, observation.image_kind)
        inference_end = time.perf_counter()
        extra = {}
        if self.settings.experimental_overlays:
            from .experimental import overlays
            localization, segmentation, warnings = overlays(self.store, observation, path)
            extra.update(localization=localization, segmentation=segmentation)
            limitations.extend(warnings)
        metrics = calculate_metrics(observation)
        if any(metric.status != "available" for metric in metrics):
            limitations.append("CWSI unavailable or invalid: requires synchronized canopy/air/baseline readings in degC")
        return AnalysisResult(id=str(uuid.uuid4()), observation_id=observation_id, created_at=utc_now(),
            status="partial" if classification.status == "available" else "unsupported" if classification.status == "unsupported" else "partial",
            classification=classification, metrics=metrics, **extra,
            attention=attention_for(classification, self.settings.attention_score_threshold), limitations=limitations,
            timings_ms={"queue": (started-enqueued)*1000,"inference":(inference_end-inference_start)*1000,
                        "total":(time.perf_counter()-enqueued)*1000})
