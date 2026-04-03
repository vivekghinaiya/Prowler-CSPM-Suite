# Folder structure

```
cloudsecurity/
├── README.md
├── .env.example              # Documented env vars (optional local overrides)
├── .gitignore
├── docker-compose.yml        # Local stack: postgres, redis, api, worker, beat, web
├── docs/                     # Reference documentation (this folder)
├── infra/docker/
│   ├── Dockerfile.api        # API + Alembic + Uvicorn
│   ├── Dockerfile.worker     # Celery worker + Docker CLI (for Prowler)
│   └── Dockerfile.web        # Vite build + serve static assets
├── scripts/
│   └── seed_dev_user.py      # Idempotent admin seed (runs in API container startup)
├── services/
│   ├── api/
│   │   ├── requirements.txt
│   │   ├── alembic.ini
│   │   ├── alembic/          # Migrations (env.py, versions/)
│   │   └── app/
│   │       ├── main.py       # FastAPI app factory, CORS, router mount
│   │       ├── config.py     # Pydantic Settings
│   │       ├── database.py   # SQLAlchemy engine + SessionLocal
│   │       ├── deps.py       # JWT dependencies, admin guard
│   │       ├── celery_client.py   # send_task only (no task bodies in API image)
│   │       ├── redis_client.py    # Sync Redis: progress publish + version cache
│   │       ├── models/       # SQLAlchemy ORM
│   │       ├── schemas/      # Pydantic request/response DTOs
│   │       ├── routers/      # REST route modules
│   │       ├── services/     # Domain: scan, diff, parser, export, Azure creds
│   │       ├── security/     # crypto, JWT helpers, password hashing, audit
│   │       └── ws/           # WebSocket scan progress
│   └── worker/
│       ├── celery_app.py     # Celery app + beat schedule + task imports
│       ├── tasks/            # execute_scan, parse_findings, run_diff, prowler_version_check
│       └── prowler/
│           └── runner.py     # subprocess docker run with validated args
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── api/client.ts
        └── pages/            # Login, clients, client detail, scan detail
```

## Optional extension (from original plan)

- `packages/shared-py/` — extract shared Pydantic models if API and worker diverge into separate repos.
