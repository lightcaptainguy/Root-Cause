"""SQLite WAL persistence. Each operation owns its connection/transaction."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .contracts import AnalysisJob, AnalysisResult, Observation, Zone
from .errors import ServiceError


def utc_now():
    return datetime.now(timezone.utc)


class Store:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "crop.sqlite3"
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS zones(id TEXT PRIMARY KEY, name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, path TEXT NOT NULL, media_type TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY, zone_id TEXT NOT NULL REFERENCES zones(id),
                    received_at TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS observation_zone ON observations(zone_id, received_at);
                CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, observation_id TEXT NOT NULL REFERENCES observations(id),
                    status TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE UNIQUE INDEX IF NOT EXISTS active_job ON jobs(observation_id) WHERE status IN ('queued','running');
                CREATE TABLE IF NOT EXISTS results(id TEXT PRIMARY KEY, observation_id TEXT NOT NULL REFERENCES observations(id),
                    created_at TEXT NOT NULL, payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS result_observation ON results(observation_id, created_at);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA synchronous=NORMAL")
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def add_zone(self, zone: Zone):
        with self.connect() as db:
            db.execute("INSERT INTO zones VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name", (zone.id, zone.name))
        return zone

    def zones(self):
        with self.connect() as db:
            return [Zone(**dict(row)) for row in db.execute("SELECT * FROM zones ORDER BY name")]

    def require_zone(self, zone_id):
        if zone_id not in {zone.id for zone in self.zones()}:
            raise ServiceError(400, "UNKNOWN_ZONE", "Create or configure this zone before importing images")

    def save_observation(self, observation, asset_id, path, media_type):
        with self.connect() as db:
            db.execute("INSERT INTO assets VALUES (?,?,?)", (asset_id, str(path), media_type))
            db.execute("INSERT INTO observations VALUES (?,?,?,?)", (observation.id, observation.zone_id,
                observation.received_at.isoformat(), observation.model_dump_json()))

    def observation(self, observation_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM observations WHERE id=?", (observation_id,)).fetchone()
        if not row:
            raise ServiceError(404, "NOT_FOUND", "Observation not found")
        return Observation.model_validate_json(row[0])

    def observations(self, zone_id=None):
        with self.connect() as db:
            rows = db.execute("SELECT payload FROM observations " + ("WHERE zone_id=? " if zone_id else "") +
                              "ORDER BY received_at DESC", (zone_id,) if zone_id else ()).fetchall()
        return [Observation.model_validate_json(row[0]) for row in rows]

    def asset(self, asset_id):
        with self.connect() as db:
            row = db.execute("SELECT path, media_type FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row:
            raise ServiceError(404, "NOT_FOUND", "Asset not found")
        path = Path(row[0]).resolve()
        if not path.is_relative_to(self.directory.resolve()) or not path.is_file():
            raise ServiceError(404, "NOT_FOUND", "Asset unavailable")
        return path, row[1]

    def add_asset(self, asset_id, path, media_type):
        with self.connect() as db:
            db.execute("INSERT INTO assets VALUES (?,?,?)", (asset_id, str(path), media_type))

    def save_job(self, job):
        with self.connect() as db:
            db.execute("INSERT INTO jobs VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload",
                       (job.id, job.observation_id, job.status, job.model_dump_json()))

    def active_job(self, observation_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM jobs WHERE observation_id=? AND status IN ('queued','running')", (observation_id,)).fetchone()
        return AnalysisJob.model_validate_json(row[0]) if row else None

    def job(self, job_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM jobs WHERE id=?", (job_id,)).fetchone()
        if not row:
            raise ServiceError(404, "NOT_FOUND", "Job not found")
        return AnalysisJob.model_validate_json(row[0])

    def fail_interrupted_jobs(self):
        with self.connect() as db:
            rows = db.execute("SELECT payload FROM jobs WHERE status IN ('queued','running')").fetchall()
            for row in rows:
                payload = json.loads(row[0])
                payload.update(status="failed", result_id=None, error={"code":"INTERRUPTED","message":"Backend restarted before job completed","details":None})
                job = AnalysisJob(**payload)
                db.execute("UPDATE jobs SET status=?,payload=? WHERE id=?", (job.status, job.model_dump_json(), job.id))

    def complete(self, job, result):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM observations WHERE id=?", (result.observation_id,)).fetchone()
            observation = Observation.model_validate_json(row[0])
            observation.latest_result_id = result.id
            db.execute("INSERT INTO results VALUES (?,?,?,?)", (result.id,result.observation_id,result.created_at.isoformat(),result.model_dump_json()))
            db.execute("UPDATE observations SET payload=? WHERE id=?", (observation.model_dump_json(),observation.id))
            db.execute("UPDATE jobs SET status=?,payload=? WHERE id=?", (job.status,job.model_dump_json(),job.id))

    def result(self, result_id):
        with self.connect() as db:
            row = db.execute("SELECT payload FROM results WHERE id=?", (result_id,)).fetchone()
        if not row:
            raise ServiceError(404, "NOT_FOUND", "Result not found")
        return AnalysisResult.model_validate_json(row[0])
