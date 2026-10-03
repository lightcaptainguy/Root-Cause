import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.openapi.utils import get_openapi
from pydantic import ValidationError
from starlette.exceptions import HTTPException

from .chat import ChatService
from .config import Settings
from .contracts import (AnalysisJob, AnalysisResult, AnalyzeAccepted, AttentionItem, ChatRequest,
                        ChatResponse, ErrorEnvelope, Health, Items, Observation, ObservationMetadata, Zone)
from .errors import ServiceError
from .ingestion import import_image
from .jobs import JobRunner
from .storage import Store
from .vision import Vision


def create_app(settings=None, vision=None):
    settings = settings or Settings()
    store = Store(settings.data_dir)
    for configured_zone in settings.zones:
        store.add_zone(Zone(**configured_zone))
    vision = vision or Vision(settings)
    runner = JobRunner(store, settings, vision)
    chat = ChatService(store, settings)

    @asynccontextmanager
    async def lifespan(app):
        await runner.start()
        yield
        await runner.stop()

    app = FastAPI(title="Root-Cause local crop backend", version="0.2.0", lifespan=lifespan,
                  responses={status:{"model":ErrorEnvelope} for status in (400,404,413,429,500,503)})
    app.state.store, app.state.runner, app.state.chat = store, runner, chat

    @app.exception_handler(ServiceError)
    async def service_error(request, exc):
        return JSONResponse(status_code=exc.status, content={"error":exc.error.model_dump(mode="json")})

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request, exc):
        return JSONResponse(status_code=400, content={"error":{"code":"INVALID_INPUT","message":"Request validation failed",
            "details":[{"location":list(e["loc"]),"message":e["msg"]} for e in exc.errors()]}})

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={"error":{"code":"HTTP_ERROR","message":str(exc.detail),"details":None}})

    @app.exception_handler(Exception)
    async def unexpected(request, exc):
        logging.getLogger(__name__).exception("Unexpected backend failure", exc_info=exc)
        return JSONResponse(status_code=500, content={"error":{"code":"INTERNAL_ERROR","message":"Unexpected backend error","details":None}})

    @app.middleware("http")
    async def local_request_limits(request: Request, call_next):
        # Cheap declared-size check; the upload endpoint also enforces actual file length.
        length = request.headers.get("content-length")
        if length:
            try:
                if int(length) > settings.max_upload_bytes + 256*1024:
                    return JSONResponse(status_code=413, content={"error":{"code":"UPLOAD_TOO_LARGE","message":"Request exceeds size limit","details":None}})
            except ValueError:
                return JSONResponse(status_code=400, content={"error":{"code":"INVALID_INPUT","message":"Invalid Content-Length","details":None}})
        return await call_next(request)

    @app.get("/api/health", response_model=Health)
    async def health():
        ollama_ready = await chat.available()
        return Health(status="ok" if vision.ready and ollama_ready else "degraded", vision_ready=vision.ready,
            ollama_ready=ollama_ready, capabilities={"classification":vision.ready,"localization":False,"segmentation":False,
            "experimental_overlays":settings.experimental_overlays,
            "aerial_disease":False,"cwsi":True,"chat":ollama_ready})

    @app.get("/api/zones", response_model=Items[Zone])
    def zones():
        return {"items":store.zones()}

    @app.post("/api/zones", response_model=Zone, status_code=201)
    def create_zone(zone: Zone):
        return store.add_zone(zone)

    @app.post("/api/observations", response_model=Observation, status_code=201)
    async def upload(image: UploadFile = File(...), metadata: str = Form(...)):
        try:
            if len(metadata) > 128*1024:
                raise ServiceError(400, "INVALID_METADATA", "Metadata exceeds size limit")
            try:
                parsed = ObservationMetadata.model_validate_json(metadata)
            except ValidationError as exc:
                raise ServiceError(400, "INVALID_METADATA", "Observation metadata failed validation",
                    [{"location":list(e["loc"]),"message":e["msg"]} for e in exc.errors()]) from exc
            contents = await image.read(settings.max_upload_bytes + 1)
            return await asyncio.to_thread(import_image, store, settings, contents, parsed)
        finally:
            await image.close()

    @app.get("/api/observations", response_model=Items[Observation])
    def observations(zone_id: str | None = None):
        return {"items":store.observations(zone_id)}

    @app.get("/api/observations/{observation_id}", response_model=Observation)
    def observation(observation_id: str):
        return store.observation(observation_id)

    @app.post("/api/observations/{observation_id}/analyze", response_model=AnalyzeAccepted, status_code=202)
    async def analyze(observation_id: str):
        job = runner.submit(observation_id)
        return AnalyzeAccepted(job_id=job.id, observation_id=job.observation_id, status=job.status)

    @app.get("/api/jobs/{job_id}", response_model=AnalysisJob)
    def job(job_id: str):
        return store.job(job_id)

    @app.get("/api/results/{result_id}", response_model=AnalysisResult)
    def result(result_id: str):
        return store.result(result_id)

    @app.get("/api/attention", response_model=Items[AttentionItem])
    def attention(zone_id: str | None = None):
        entries = []
        for observation in store.observations(zone_id):
            values = store.result(observation.latest_result_id).attention.model_dump() if observation.latest_result_id else {}
            entries.append(AttentionItem(**values, observation_id=observation.id, zone_id=observation.zone_id))
        return {"items":entries}

    @app.post("/api/chat", response_model=ChatResponse)
    async def explain(request: ChatRequest):
        return await chat.answer(request)

    @app.get("/api/assets/{asset_id}")
    def asset(asset_id: str):
        path, media_type = store.asset(asset_id)
        return FileResponse(path, media_type=media_type)

    # Frontend remains optional. API and Swagger work with no dist folder.
    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")

    def openapi():
        if app.openapi_schema is None:
            schema=get_openapi(title=app.title,version=app.version,routes=app.routes)
            for path in schema["paths"].values():
                for operation in path.values():
                    if isinstance(operation,dict):
                        operation.get("responses",{}).pop("422",None)
            app.openapi_schema=schema
        return app.openapi_schema

    app.openapi=openapi

    return app
