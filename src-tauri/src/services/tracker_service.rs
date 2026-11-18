use chrono::{DateTime, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::db::format_utc;
use crate::error::{AppError, AppResult};
use crate::models::{
    ActivityBrief, ProjectBrief, SessionOut, TimeSegmentOut, TrackerCurrentOut,
    TrackerPatchRequest, TrackerSessionOut, TrackerStartRequest, TrackerStopRequest, UserOut,
};
use crate::services::session_service::{
    load_segments_map, load_session_or_404, validate_activity_and_project,
};
use crate::time_utils::parse_utc;

async fn find_running_session_row(
    pool: &SqlitePool,
    user_id: &str,
) -> AppResult<Option<sqlx::sqlite::SqliteRow>> {
    let row = sqlx::query(
        r#"
        SELECT s.id, s.activity_id, s.project_id, s.started_at, s.ended_at,
               s.duration_seconds, s.description, s.tracking_method, s.status,
               a.name AS act_name, a.color AS act_color, a.category AS act_category, a.is_archived AS act_archived,
               p.name AS proj_name, p.color AS proj_color, p.status AS proj_status
        FROM time_sessions s
        JOIN activities a ON a.id = s.activity_id
        LEFT JOIN projects p ON p.id = s.project_id
        WHERE s.user_id = ? AND s.status IN ('active', 'paused')
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(row)
}

async fn to_tracker_session_out(
    pool: &SqlitePool,
    row: &sqlx::sqlite::SqliteRow,
    now_utc: DateTime<Utc>,
) -> AppResult<TrackerSessionOut> {
    let sid: String = row.get("id");
    let mut segs_map = load_segments_map(pool, std::slice::from_ref(&sid)).await?;
    let segments: Vec<TimeSegmentOut> = segs_map.remove(&sid).unwrap_or_default();

    let closed_seconds: i64 = segments
        .iter()
        .filter(|s| s.ended_at.is_some())
        .map(|s| s.duration_seconds)
        .sum();
    let open_seg_start = segments
        .iter()
        .find(|s| s.ended_at.is_none())
        .map(|s| s.started_at.clone());

    let project_id: Option<String> = row.get("project_id");
    let project = project_id.as_ref().map(|pid| ProjectBrief {
        id: pid.clone(),
        name: row.get("proj_name"),
        color: row.get("proj_color"),
        status: row.get("proj_status"),
    });

    Ok(TrackerSessionOut {
        id: sid,
        activity_id: row.get("activity_id"),
        activity: ActivityBrief {
            id: row.get("activity_id"),
            name: row.get("act_name"),
            color: row.get("act_color"),
            category: row.get("act_category"),
            is_archived: row.get::<i64, _>("act_archived") != 0,
        },
        project_id,
        project,
        started_at: row.get("started_at"),
        ended_at: row.get("ended_at"),
        accumulated_seconds: closed_seconds,
        current_segment_started_at: open_seg_start,
        status: row.get("status"),
        description: row.get("description"),
        tracking_method: row.get("tracking_method"),
        segments,
        server_now: format_utc(now_utc),
    })
}

async fn ensure_point_not_inside_existing(
    pool: &SqlitePool,
    user_id: &str,
    at_utc: DateTime<Utc>,
    exclude_session_id: Option<&str>,
) -> AppResult<()> {
    let at_str = format_utc(at_utc);
    let mut sql = String::from(
        "SELECT seg.id
         FROM time_segments seg
         JOIN time_sessions s ON s.id = seg.session_id
         WHERE s.user_id = ?
           AND seg.ended_at IS NOT NULL
           AND seg.started_at <= ?
           AND seg.ended_at > ?",
    );
    if exclude_session_id.is_some() {
        sql.push_str(" AND s.id != ?");
    }
    sql.push_str(" LIMIT 1");

    let mut q = sqlx::query(&sql).bind(user_id).bind(&at_str).bind(&at_str);
    if let Some(excl) = exclude_session_id {
        q = q.bind(excl);
    }

    if q.fetch_optional(pool).await?.is_some() {
        return Err(AppError::conflict(
            "Cannot start or resume timer inside an already logged session interval.",
            "session_overlap",
        ));
    }
    Ok(())
}

async fn finalize_running_session_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    session_id: &str,
    session_started_at: DateTime<Utc>,
    now_utc: DateTime<Utc>,
    description: Option<String>,
) -> AppResult<()> {
    let open_seg = sqlx::query(
        "SELECT id, started_at FROM time_segments WHERE session_id = ? AND ended_at IS NULL LIMIT 1",
    )
    .bind(session_id)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(seg) = open_seg {
        let seg_id: String = seg.get("id");
        let seg_start = parse_utc(&seg.get::<String, _>("started_at"))?;
        let end_ts = now_utc.max(seg_start);
        let dur = ((end_ts - seg_start).num_milliseconds() as f64 / 1000.0)
            .round()
            .max(0.0) as i64;
        let end_str = format_utc(end_ts);

        sqlx::query("UPDATE time_segments SET ended_at = ?, duration_seconds = ? WHERE id = ?")
            .bind(&end_str)
            .bind(dur)
            .bind(&seg_id)
            .execute(&mut **tx)
            .await?;
    }

    let totals = sqlx::query(
        "SELECT COALESCE(SUM(duration_seconds), 0) AS total_dur, MAX(ended_at) AS last_end
         FROM time_segments WHERE session_id = ?",
    )
    .bind(session_id)
    .fetch_one(&mut **tx)
    .await?;

    let total_seconds: i64 = totals.get("total_dur");
    let last_end_dt = match totals.get::<Option<String>, _>("last_end") {
        Some(s) => parse_utc(&s)?,
        None => now_utc,
    };
    let final_end = format_utc(last_end_dt.max(session_started_at));
    let now_str = format_utc(now_utc);

    if let Some(desc_raw) = description {
        let trimmed = desc_raw.trim().to_string();
        let desc_opt = if trimmed.is_empty() { None } else { Some(trimmed) };
        sqlx::query(
            "UPDATE time_sessions
             SET status = 'completed', ended_at = ?, duration_seconds = ?, description = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&final_end)
        .bind(total_seconds)
        .bind(&desc_opt)
        .bind(&now_str)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;
    } else {
        sqlx::query(
            "UPDATE time_sessions
             SET status = 'completed', ended_at = ?, duration_seconds = ?, updated_at = ?
             WHERE id = ?",
        )
        .bind(&final_end)
        .bind(total_seconds)
        .bind(&now_str)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub async fn get_current_timer(pool: &SqlitePool, user: &UserOut) -> AppResult<TrackerCurrentOut> {
    let now_utc = Utc::now();
    let row = find_running_session_row(pool, &user.id).await?;
    let active_session = match row {
        Some(r) => Some(to_tracker_session_out(pool, &r, now_utc).await?),
        None => None,
    };
    Ok(TrackerCurrentOut {
        active_session,
        server_now: format_utc(now_utc),
    })
}

pub async fn start_timer(
    pool: &SqlitePool,
    user: &UserOut,
    payload: TrackerStartRequest,
) -> AppResult<TrackerSessionOut> {
    validate_activity_and_project(
        pool,
        &user.id,
        &payload.activity_id,
        payload.project_id.as_deref(),
        false,
    )
    .await?;

    let now_utc = Utc::now();
    let existing = find_running_session_row(pool, &user.id).await?;

    if let Some(ref ex) = existing
        && !payload.confirm_switch {
            let act_name: String = ex.get("act_name");
            let status: String = ex.get("status");
            return Err(AppError::conflict(
                format!(
                    "Activity '{act_name}' is currently {status}. Confirm to finish it and switch."
                ),
                "active_session_exists",
            ));
        }

    ensure_point_not_inside_existing(pool, &user.id, now_utc, None).await?;

    let mut tx = pool.begin().await?;
    if let Some(ref ex) = existing {
        let ex_id: String = ex.get("id");
        let ex_start = parse_utc(&ex.get::<String, _>("started_at"))?;
        finalize_running_session_tx(&mut tx, &ex_id, ex_start, now_utc, None).await?;
    }

    let sid = Uuid::new_v4().to_string();
    let seg_id = Uuid::new_v4().to_string();
    let now_str = format_utc(now_utc);
    let desc = payload
        .description
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    sqlx::query(
        r#"
        INSERT INTO time_sessions (
            id, user_id, activity_id, project_id, started_at, ended_at,
            duration_seconds, description, tracking_method, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 'timer', 'active', ?, ?)
        "#,
    )
    .bind(&sid)
    .bind(&user.id)
    .bind(&payload.activity_id)
    .bind(&payload.project_id)
    .bind(&now_str)
    .bind(&desc)
    .bind(&now_str)
    .bind(&now_str)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO time_segments (id, session_id, started_at, ended_at, duration_seconds)
        VALUES (?, ?, ?, NULL, 0)
        "#,
    )
    .bind(&seg_id)
    .bind(&sid)
    .bind(&now_str)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let reloaded = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::internal("Failed to reload started session"))?;
    to_tracker_session_out(pool, &reloaded, now_utc).await
}

pub async fn pause_timer(pool: &SqlitePool, user: &UserOut) -> AppResult<TrackerSessionOut> {
    let existing = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("No active timer found"))?;

    let status: String = existing.get("status");
    if status == "paused" {
        return Err(AppError::conflict("Timer is already paused", "already_paused"));
    }

    let sid: String = existing.get("id");
    let now_utc = Utc::now();
    let now_str = format_utc(now_utc);

    let mut tx = pool.begin().await?;
    if let Some(seg) = sqlx::query(
        "SELECT id, started_at FROM time_segments WHERE session_id = ? AND ended_at IS NULL LIMIT 1",
    )
    .bind(&sid)
    .fetch_optional(&mut *tx)
    .await?
    {
        let seg_id: String = seg.get("id");
        let seg_start = parse_utc(&seg.get::<String, _>("started_at"))?;
        let end_ts = now_utc.max(seg_start);
        let dur = ((end_ts - seg_start).num_milliseconds() as f64 / 1000.0)
            .round()
            .max(0.0) as i64;
        let end_str = format_utc(end_ts);

        sqlx::query("UPDATE time_segments SET ended_at = ?, duration_seconds = ? WHERE id = ?")
            .bind(&end_str)
            .bind(dur)
            .bind(&seg_id)
            .execute(&mut *tx)
            .await?;
    }

    let total_dur: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM time_segments WHERE session_id = ?",
    )
    .bind(&sid)
    .fetch_one(&mut *tx)
    .await?;

    sqlx::query(
        "UPDATE time_sessions SET status = 'paused', duration_seconds = ?, updated_at = ? WHERE id = ?",
    )
    .bind(total_dur)
    .bind(&now_str)
    .bind(&sid)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    let reloaded = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::internal("Failed to reload paused session"))?;
    to_tracker_session_out(pool, &reloaded, now_utc).await
}

pub async fn resume_timer(pool: &SqlitePool, user: &UserOut) -> AppResult<TrackerSessionOut> {
    let existing = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("No paused timer found"))?;

    let status: String = existing.get("status");
    if status == "active" {
        return Err(AppError::conflict("Timer is already running", "already_active"));
    }

    let sid: String = existing.get("id");
    let now_utc = Utc::now();
    ensure_point_not_inside_existing(pool, &user.id, now_utc, Some(&sid)).await?;

    let last_end_opt: Option<String> = sqlx::query_scalar(
        "SELECT MAX(ended_at) FROM time_segments WHERE session_id = ? AND ended_at IS NOT NULL",
    )
    .bind(&sid)
    .fetch_one(pool)
    .await?;

    let session_start = parse_utc(&existing.get::<String, _>("started_at"))?;
    let last_closed = match last_end_opt {
        Some(s) => parse_utc(&s)?,
        None => session_start,
    };
    let seg_start = now_utc.max(last_closed);
    let seg_start_str = format_utc(seg_start);
    let now_str = format_utc(now_utc);
    let seg_id = Uuid::new_v4().to_string();

    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO time_segments (id, session_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, NULL, 0)",
    )
    .bind(&seg_id)
    .bind(&sid)
    .bind(&seg_start_str)
    .execute(&mut *tx)
    .await?;

    sqlx::query("UPDATE time_sessions SET status = 'active', updated_at = ? WHERE id = ?")
        .bind(&now_str)
        .bind(&sid)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let reloaded = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::internal("Failed to reload resumed session"))?;
    to_tracker_session_out(pool, &reloaded, seg_start).await
}

pub async fn stop_timer(
    pool: &SqlitePool,
    user: &UserOut,
    payload: Option<TrackerStopRequest>,
) -> AppResult<SessionOut> {
    let existing = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("No active or paused timer found"))?;

    let sid: String = existing.get("id");
    let start_dt = parse_utc(&existing.get::<String, _>("started_at"))?;
    let now_utc = Utc::now();
    let desc = payload.and_then(|p| p.description);

    let mut tx = pool.begin().await?;
    finalize_running_session_tx(&mut tx, &sid, start_dt, now_utc, desc).await?;
    tx.commit().await?;

    load_session_or_404(pool, &user.id, &sid).await
}

pub async fn update_current_metadata(
    pool: &SqlitePool,
    user: &UserOut,
    payload: TrackerPatchRequest,
) -> AppResult<TrackerSessionOut> {
    let existing = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::not_found("No active or paused timer found"))?;

    let sid: String = existing.get("id");
    let act_id: String = existing.get("activity_id");
    let mut project_id: Option<String> = existing.get("project_id");
    let mut description: Option<String> = existing.get("description");

    if payload.clear_project {
        project_id = None;
    } else if let Some(pid) = payload.project_id {
        validate_activity_and_project(pool, &user.id, &act_id, Some(&pid), true).await?;
        project_id = Some(pid);
    }

    if let Some(d) = payload.description {
        let trimmed = d.trim().to_string();
        description = if trimmed.is_empty() { None } else { Some(trimmed) };
    }

    let now_str = format_utc(Utc::now());
    sqlx::query(
        "UPDATE time_sessions SET project_id = ?, description = ?, updated_at = ? WHERE id = ?",
    )
    .bind(&project_id)
    .bind(&description)
    .bind(&now_str)
    .bind(&sid)
    .execute(pool)
    .await?;

    let reloaded = find_running_session_row(pool, &user.id)
        .await?
        .ok_or_else(|| AppError::internal("Failed to reload updated session"))?;
    to_tracker_session_out(pool, &reloaded, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_pool_from_url, seed_catalog_if_empty};
    use crate::models::{ManualSessionCreate, TrackerStartRequest};
    use crate::services::{activity_service, session_service, user_service};

    #[tokio::test]
    async fn timer_switch_pause_resume_stop_and_overlap_rules() {
        let pool = init_pool_from_url("sqlite::memory:").await.unwrap();
        seed_catalog_if_empty(&pool).await.unwrap();
        let user = user_service::get_default_user(&pool).await.unwrap();
        let acts = activity_service::list_activities(&pool, &user, false, None)
            .await
            .unwrap();
        let a1 = &acts[0].id;
        let a2 = &acts[1].id;

        let s1 = start_timer(
            &pool,
            &user,
            TrackerStartRequest {
                activity_id: a1.clone(),
                project_id: None,
                description: Some("Initial".into()),
                confirm_switch: false,
            },
        )
        .await
        .unwrap();
        assert_eq!(s1.status, "active");

        // Starting another without confirm_switch must return 409 active_session_exists
        let conflict = start_timer(
            &pool,
            &user,
            TrackerStartRequest {
                activity_id: a2.clone(),
                project_id: None,
                description: None,
                confirm_switch: false,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(conflict.code(), "active_session_exists");

        // Switch with confirm_switch=true finalizes s1 and starts s2
        let s2 = start_timer(
            &pool,
            &user,
            TrackerStartRequest {
                activity_id: a2.clone(),
                project_id: None,
                description: None,
                confirm_switch: true,
            },
        )
        .await
        .unwrap();
        assert_eq!(s2.activity_id, *a2);

        let paused = pause_timer(&pool, &user).await.unwrap();
        assert_eq!(paused.status, "paused");

        let resumed = resume_timer(&pool, &user).await.unwrap();
        assert_eq!(resumed.status, "active");

        let stopped = stop_timer(&pool, &user, None).await.unwrap();
        assert_eq!(stopped.status, "completed");

        // Manual session + overlap check
        let m1 = session_service::create_manual_session(
            &pool,
            &user,
            ManualSessionCreate {
                activity_id: a1.clone(),
                project_id: None,
                started_at: "2026-11-10T10:00:00Z".into(),
                ended_at: Some("2026-11-10T11:00:00Z".into()),
                duration_seconds: None,
                description: Some("Manual".into()),
            },
        )
        .await
        .unwrap();
        assert_eq!(m1.duration_seconds, 3600);

        let overlap = session_service::create_manual_session(
            &pool,
            &user,
            ManualSessionCreate {
                activity_id: a2.clone(),
                project_id: None,
                started_at: "2026-11-10T10:30:00Z".into(),
                ended_at: Some("2026-11-10T11:30:00Z".into()),
                duration_seconds: None,
                description: None,
            },
        )
        .await
        .unwrap_err();
        assert_eq!(overlap.code(), "session_overlap");
    }
}
