import argparse
from pathlib import Path

import uvicorn

from .app import create_app
from .config import load_settings


def main():
    parser = argparse.ArgumentParser(description="Run the local crop-health backend")
    parser.add_argument("--config", type=Path)
    parser.add_argument("--export-openapi", type=Path)
    args = parser.parse_args()
    settings = load_settings(args.config)
    app = create_app(settings)
    if args.export_openapi:
        import json
        args.export_openapi.parent.mkdir(parents=True, exist_ok=True)
        args.export_openapi.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
        return
    uvicorn.run(app, host=settings.host, port=settings.port, access_log=False)


if __name__ == "__main__":
    main()
