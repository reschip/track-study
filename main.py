"""Track Study — Personal study tracker API."""

import sqlite3
import csv
import io
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="Track Study")

DB_PATH = Path(__file__).parent / "trackdb.sqlite3"

# ── Database helpers ─────────────────────────────────────────────────────────

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS activities (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                name  TEXT    NOT NULL UNIQUE,
                active INTEGER NOT NULL DEFAULT 1
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS daily_logs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_id  INTEGER NOT NULL,
                date         TEXT    NOT NULL,
                status       TEXT    NOT NULL DEFAULT 'pending',
                time_seconds INTEGER NOT NULL DEFAULT 0,
                notes        TEXT    NOT NULL DEFAULT '',
                FOREIGN KEY (activity_id) REFERENCES activities(id),
                UNIQUE(activity_id, date)
            )
        """)
        # Seed default activities if table is empty
        count = db.execute("SELECT COUNT(*) as c FROM activities").fetchone()["c"]
        if count == 0:
            seeds = ["Inglés", "HackerRank DSA", "C++", "LeetCode", "Reading"]
            db.executemany(
                "INSERT INTO activities (name) VALUES (?)",
                [(s,) for s in seeds],
            )


# ── Pydantic schemas ────────────────────────────────────────────────────────

class ActivityCreate(BaseModel):
    name: str

class LogCreate(BaseModel):
    activity_id: int
    date: str  # YYYY-MM-DD
    status: str = "done"
    time_seconds: int = 0
    notes: str = ""

class LogUpdate(BaseModel):
    status: Optional[str] = None
    time_seconds: Optional[int] = None
    notes: Optional[str] = None


# ── Activity endpoints ──────────────────────────────────────────────────────

@app.get("/api/activities")
def list_activities():
    with get_db() as db:
        rows = db.execute("SELECT * FROM activities ORDER BY id").fetchall()
        return [dict(r) for r in rows]


@app.post("/api/activities", status_code=201)
def create_activity(body: ActivityCreate):
    with get_db() as db:
        try:
            cur = db.execute("INSERT INTO activities (name) VALUES (?)", (body.name,))
            return {"id": cur.lastrowid, "name": body.name, "active": 1}
        except sqlite3.IntegrityError:
            raise HTTPException(400, "Activity already exists")


@app.patch("/api/activities/{activity_id}")
def toggle_activity(activity_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM activities WHERE id=?", (activity_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Activity not found")
        new_val = 0 if row["active"] else 1
        db.execute("UPDATE activities SET active=? WHERE id=?", (new_val, activity_id))
        return {**dict(row), "active": new_val}

@app.delete("/api/activities/{activity_id}")
def delete_activity(activity_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM activities WHERE id=?", (activity_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Activity not found")
        # Delete dependent logs first due to naive foreign keys without cascade on PRAGMA
        db.execute("DELETE FROM daily_logs WHERE activity_id=?", (activity_id,))
        db.execute("DELETE FROM activities WHERE id=?", (activity_id,))
        return {"status": "ok"}


# ── Log endpoints ───────────────────────────────────────────────────────────

@app.get("/api/logs")
def list_logs(from_date: Optional[str] = None, to_date: Optional[str] = None):
    with get_db() as db:
        query = """
            SELECT dl.*, a.name as activity_name
            FROM daily_logs dl
            JOIN activities a ON a.id = dl.activity_id
            WHERE 1=1
        """
        params: list = []
        if from_date:
            query += " AND dl.date >= ?"
            params.append(from_date)
        if to_date:
            query += " AND dl.date <= ?"
            params.append(to_date)
        query += " ORDER BY dl.date DESC, dl.id DESC"
        rows = db.execute(query, params).fetchall()
        return [dict(r) for r in rows]


@app.post("/api/logs", status_code=201)
def create_log(body: LogCreate):
    with get_db() as db:
        # Upsert: if a log for the same activity+date exists, accumulate time
        existing = db.execute(
            "SELECT * FROM daily_logs WHERE activity_id=? AND date=?",
            (body.activity_id, body.date),
        ).fetchone()
        if existing:
            new_time = existing["time_seconds"] + body.time_seconds
            new_notes = existing["notes"]
            if body.notes:
                new_notes = (existing["notes"] + "\n" + body.notes).strip()
            db.execute(
                "UPDATE daily_logs SET status=?, time_seconds=?, notes=? WHERE id=?",
                (body.status, new_time, new_notes, existing["id"]),
            )
            return {
                "id": existing["id"],
                "activity_id": body.activity_id,
                "date": body.date,
                "status": body.status,
                "time_seconds": new_time,
                "notes": new_notes,
            }
        else:
            cur = db.execute(
                "INSERT INTO daily_logs (activity_id, date, status, time_seconds, notes) VALUES (?,?,?,?,?)",
                (body.activity_id, body.date, body.status, body.time_seconds, body.notes),
            )
            return {"id": cur.lastrowid, **body.model_dump()}

@app.delete("/api/logs/{log_id}")
def delete_log(log_id: int):
    with get_db() as db:
        row = db.execute("SELECT * FROM daily_logs WHERE id=?", (log_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Log not found")
        db.execute("DELETE FROM daily_logs WHERE id=?", (log_id,))
        return {"status": "ok"}


@app.get("/api/heatmap")
def heatmap_data():
    """Return aggregated seconds per date and activity for the last 365 days."""
    with get_db() as db:
        cutoff = date.today().replace(year=date.today().year - 1).isoformat()
        rows = db.execute(
            """
            SELECT activity_id, date, SUM(time_seconds) as total_seconds
            FROM daily_logs
            WHERE date >= ?
            GROUP BY activity_id, date
            ORDER BY date
            """,
            (cutoff,),
        ).fetchall()
        return [dict(r) for r in rows]


@app.get("/api/export")
def export_csv():
    with get_db() as db:
        rows = db.execute('''
            SELECT a.name as activity, dl.date, dl.status, dl.time_seconds, dl.notes
            FROM daily_logs dl
            JOIN activities a ON a.id = dl.activity_id
            ORDER BY dl.date DESC, dl.id DESC
        ''').fetchall()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Activity", "Date", "Status", "Time (Seconds)", "Notes"])
        for r in rows:
            writer.writerow([r["activity"], r["date"], r["status"], r["time_seconds"], r["notes"]])

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=\"track_study_export.csv\""}
        )


@app.get("/api/insights")
def get_insights():
    with get_db() as db:
        # 1. Streaks
        dates_rows = db.execute("SELECT DISTINCT date FROM daily_logs ORDER BY date DESC").fetchall()
        active_dates = [datetime.fromisoformat(r["date"]).date() for r in dates_rows]

        current_streak = 0
        longest_streak = 0

        if active_dates:
            today = date.today()
            if active_dates[0] == today or active_dates[0] == today - timedelta(days=1):
                current_streak = 1
                curr_date = active_dates[0]
                for i in range(1, len(active_dates)):
                    if active_dates[i] == curr_date - timedelta(days=1):
                        current_streak += 1
                        curr_date = active_dates[i]
                    else:
                        break

            # Longest streak calculation
            longest_streak = 1
            curr_longest = 1
            for i in range(1, len(active_dates)):
                if active_dates[i] == active_dates[i-1] - timedelta(days=1):
                    curr_longest += 1
                else:
                    longest_streak = max(longest_streak, curr_longest)
                    curr_longest = 1
            longest_streak = max(longest_streak, curr_longest)

        # 2. Activity Distribution (All time)
        dist_rows = db.execute('''
            SELECT a.name, SUM(dl.time_seconds) as total
            FROM daily_logs dl
            JOIN activities a ON a.id = dl.activity_id
            GROUP BY a.id, a.name
        ''').fetchall()
        distribution = [{"name": r["name"], "total_seconds": r["total"]} for r in dist_rows]

        # 3. Last 7 Days Volume
        week_ago = (date.today() - timedelta(days=6)).isoformat()
        vol_rows = db.execute('''
            SELECT date, SUM(time_seconds) as total
            FROM daily_logs
            WHERE date >= ?
            GROUP BY date
            ORDER BY date
        ''', (week_ago,)).fetchall()

        volume = {}
        for d in range(7):
            dt = (date.today() - timedelta(days=6-d)).isoformat()
            volume[dt] = 0

        for r in vol_rows:
            volume[r["date"]] = r["total"]

        daily_volume = [{"date": k, "total_seconds": v} for k, v in volume.items()]

        return {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "distribution": distribution,
            "daily_volume": daily_volume
        }


# ── Static files & SPA ──────────────────────────────────────────────────────

static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
def index():
    return FileResponse(str(static_dir / "index.html"))


# ── Startup ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    init_db()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
