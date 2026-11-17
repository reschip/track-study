-- Initial normalized SQLite schema for Activity

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
    week_start_day TEXT NOT NULL DEFAULT 'monday' CHECK (week_start_day IN ('monday', 'sunday')),
    theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    intensity_thresholds TEXT NOT NULL DEFAULT '[1800, 5400, 10800]',
    tracking_preferences TEXT NOT NULL DEFAULT '{"confirm_switch": true, "default_manual_mode": "start_end", "default_activity_id": null, "default_project_id": null}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'professional' CHECK (category IN ('professional', 'personal')),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_activities_user_archived
    ON activities (user_id, is_archived);
CREATE UNIQUE INDEX IF NOT EXISTS uq_activities_user_lower_name
    ON activities (user_id, lower(name));

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS ix_projects_user_status
    ON projects (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_lower_name
    ON projects (user_id, lower(name));

CREATE TABLE IF NOT EXISTS project_activities (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, activity_id)
);

CREATE TABLE IF NOT EXISTS time_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    description TEXT,
    tracking_method TEXT NOT NULL CHECK (tracking_method IN ('timer', 'manual')),
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'completed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_sessions_active_per_user
    ON time_sessions (user_id)
    WHERE status IN ('active', 'paused');
CREATE INDEX IF NOT EXISTS ix_time_sessions_user_started
    ON time_sessions (user_id, started_at);
CREATE INDEX IF NOT EXISTS ix_time_sessions_user_activity
    ON time_sessions (user_id, activity_id);
CREATE INDEX IF NOT EXISTS ix_time_sessions_user_project
    ON time_sessions (user_id, project_id);

CREATE TABLE IF NOT EXISTS time_segments (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES time_sessions(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_segments_open_per_session
    ON time_segments (session_id)
    WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_time_segments_session_started
    ON time_segments (session_id, started_at);
CREATE INDEX IF NOT EXISTS ix_time_segments_started_ended
    ON time_segments (started_at, ended_at);
