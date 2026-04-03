from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin_prowler, auth, clients, credentials, dashboard, diff, exports, findings, scans, triage
from app.ws.scan_progress import router as ws_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Azure CloudGuard", lifespan=lifespan)

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = "/api/v1"
    app.include_router(auth.router, prefix=api)
    app.include_router(clients.router, prefix=api)
    app.include_router(credentials.router, prefix=api)
    app.include_router(scans.router, prefix=api)
    app.include_router(findings.router, prefix=api)
    app.include_router(diff.router, prefix=api)
    app.include_router(triage.router, prefix=api)
    app.include_router(exports.router, prefix=api)
    app.include_router(dashboard.router, prefix=api)
    app.include_router(admin_prowler.router, prefix=api)
    app.include_router(ws_router, prefix=api)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
