# Activity — Personal Activity Intelligence Platform

> **Your time, visualized.**

Activity is a full-stack personal time-tracking and analytics platform combining minimalist Linear-inspired ergonomics, GitHub-style contribution matrices, Raycast-fast command access, and real PostgreSQL-backed statistics.

---

## Architecture Overview

```text
activity_tracker/
├── docker-compose.yml          # PostgreSQL 16 + FastAPI backend + Nginx/React frontend
├── database/
│   └── init.sql                # PostgreSQL extensions & test database initialization
├── backend/
│   ├── alembic/                # Versioned SQLAlchemy/Alembic database migrations
│   ├── app/
│   │   ├── api/                # REST endpoints (/api/*)
│   │   ├── core/               # Config, DB engine, UTC/timezone helpers, error handlers
│   │   ├── models/             # Normalized SQLAlchemy 2.0 ORM models
│   │   ├── schemas/            # Pydantic v2 validation & response contracts
│   │   └── services/           # Business logic (tracker, sessions, analytics, import/export, seed)
│   └── tests/                  # Integration suite against PostgreSQL
└── frontend/
    └── src/
        ├── api/                # Typed REST client modules
        ├── services/           # Pure timer calculations & timezone conversions (decoupled from UI)
        ├── state/              # Global state, theme, reload recovery, and command palette
        ├── components/         # Minimalist UI primitives, charts, heatmap, session views
        └── pages/              # Overview, Tracker, Activities, Projects, Calendar, Analytics, History, Settings
```

---

## Key Engineering Guarantees

- **Segment-based Timer Engine:** Every `TimeSession` records discrete UTC `TimeSegment` intervals (`started_at`, `ended_at`, `duration_seconds`). Pausing closes the active segment; resuming opens a new one. Paused durations are never counted.
- **Database Concurrency Protection:** A PostgreSQL partial unique index (`uq_time_sessions_active_per_user`) enforces at most one `active` or `paused` session per user at the database level, backed by row-level locking (`SELECT ... FOR UPDATE`).
- **Reload Recovery without Drift:** Reloading the browser fetches `GET /api/tracker/current` and computes live elapsed time directly from UTC timestamps (`accumulated_seconds + (now - current_segment_started_at)`), never trusting `setInterval` ticks for duration math.
- **Midnight Crossing & Timezones:** All timestamps are stored in UTC (`TIMESTAMPTZ`) and split cleanly across local midnight boundaries in the user's configured IANA timezone for Overview, Contribution Calendar, Day Detail, and Analytics.
- **Overlap Prevention:** Manual time entries and session edits validate against all existing segments for the user and reject overlapping ranges (`409 Conflict`).

---

## Quick Start (Docker Compose)

```bash
docker compose up -d --build
```

> Note: If your host Docker buildx lock is restricted, use:
> `DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose up -d --build`

Once running:
- **Web App:** http://localhost:5173
- **API Docs (Swagger):** http://localhost:8001/docs
- **Health Check:** http://localhost:8001/api/health
- **PostgreSQL:** `localhost:5432` (database `activity`, user `activity`, password `activity_secret`)

Alembic migrations (`alembic upgrade head`) and initial demo data (`12` professional/personal activities, `4` projects, and ~90 days of non-overlapping sessions) are applied automatically on first startup.

---

## Running Tests

### Backend Integration Tests (PostgreSQL + Alembic)

```bash
docker compose exec -T backend pytest -v
```

Tests run against an isolated `activity_test` database on PostgreSQL, execute the full Alembic migration chain, and verify all 15 acceptance criteria (activity lifecycle, timer pause/resume/stop, reload recovery, concurrent session blocking, midnight crossing, manual entry overlap detection, project stats, contribution thresholds, and CSV/JSON export & import).

### Frontend Unit Tests & Production Build

```bash
cd frontend
npm install
npm run test
npm run build
```

---

## Local Development (Without Docker for Frontend/Backend)

1. Start PostgreSQL:
   ```bash
   docker compose up -d db
   ```
2. Run backend locally (Python 3.11+):
   ```bash
   cd backend
   pip install -e ".[dev]"
   DATABASE_URL=postgresql+psycopg://activity:activity_secret@localhost:5432/activity alembic upgrade head
   DATABASE_URL=postgresql+psycopg://activity:activity_secret@localhost:5432/activity uvicorn app.main:app --reload --port 8001
   ```
3. Run frontend dev server:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
