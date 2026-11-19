use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::db::format_utc;
use crate::error::{AppError, AppResult};
use crate::models::{
    ActivityBrief, ManualSessionCreate, ProjectBrief, SessionListOut, SessionListParams,
    SessionOut, SessionUpdate, TimeSegmentOut, UserOut,
};
use crate::time_utils::{local_range_bounds_utc, parse_date, parse_utc};

pub async fn validate_activity_and_project(
    pool: &SqlitePool,
    user_id: &str,
    activity_id: &str,
    project_id: Option<&str>,
    allow_archived_activity: bool,
) -> AppResult<()> {
    let row = sqlx::query(
        "SELECT name, is_archived FROM activities WHERE id = ? AND user_id = ?",
    )
    .bind(activity_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Activity not found"))?;

    let is_archived = row.get::<i64, _>("is_archived") != 0;
    if is_archived && !allow_archived_activity {
        let name: String = row.get("name");
        return Err(AppError::unprocessable(
            format!("Activity '{name}' is archived. Restore it before logging new time."),
            "activity_archived",
        ));
    }

    if let Some(pid) = project_id {
        let proj_exists: Option<String> = sqlx::query_scalar(
            "SELECT id FROM projects WHERE id = ? AND user_id = ?",
        )
        .bind(pid)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;
        if proj_exists.is_none() {
            return Err(AppError::not_found("Project not found"));
        }
    }

    Ok(())
}

pub async fn ensure_no_overlap(
    pool: &SqlitePool,
    user_id: &str,
    candidate_start: DateTime<Utc>,
    candidate_end: DateTime<Utc>,
    exclude_session_id: Option<&str>,
    reference_now: Option<DateTime<Utc>>,
) -> AppResult<()> {
    let now_utc = reference_now.unwrap_or_else(Utc::now);
    let cand_start_str = format_utc(candidate_start);
    let cand_end_str = format_utc(candidate_end);
    let now_str = format_utc(now_utc);

    let mut sql = String::from(
        "SELECT 1
         FROM time_segments seg
         JOIN time_sessions s ON s.id = seg.session_id
         WHERE s.user_id = ?
           AND seg.started_at < ?
           AND CASE
                 WHEN seg.ended_at IS NOT NULL THEN seg.ended_at
                 WHEN seg.started_at > ? THEN seg.started_at
                 ELSE ?
               END > ?",
    );
    if exclude_session_id.is_some() {
        sql.push_str(" AND s.id != ?");
    }
    sql.push_str(" LIMIT 1");

    let mut q = sqlx::query_scalar::<_, i64>(&sql)
        .bind(user_id)
        .bind(&cand_end_str)
        .bind(&now_str)
        .bind(&now_str)
        .bind(&cand_start_str);
    if let Some(excl) = exclude_session_id {
        q = q.bind(excl);
    }

    if q.fetch_optional(pool).await?.is_some() {
        return Err(AppError::conflict(
            "This time range overlaps with an existing session.",
            "session_overlap",
        ));
    }

    Ok(())
}

pub async fn load_segments_map(
    pool: &SqlitePool,
    session_ids: &[String],
) -> AppResult<HashMap<String, Vec<TimeSegmentOut>>> {
    let mut map: HashMap<String, Vec<TimeSegmentOut>> = HashMap::new();
    if session_ids.is_empty() {
        return Ok(map);
    }

    let placeholders = vec!["?"; session_ids.len()].join(", ");
    let sql = format!(
        "SELECT id, session_id, started_at, ended_at, duration_seconds
         FROM time_segments
         WHERE session_id IN ({placeholders})
         ORDER BY started_at ASC"
    );

    let mut q = sqlx::query(&sql);
    for sid in session_ids {
        q = q.bind(sid);
    }

    let rows = q.fetch_all(pool).await?;
    for r in rows {
        let sid: String = r.get("session_id");
        map.entry(sid).or_default().push(TimeSegmentOut {
            id: r.get("id"),
            started_at: r.get("started_at"),
            ended_at: r.get("ended_at"),
            duration_seconds: r.get("duration_seconds"),
        });
    }

    Ok(map)
}

pub fn session_from_joined_row(
    r: &sqlx::sqlite::SqliteRow,
    segments: Vec<TimeSegmentOut>,
) -> SessionOut {
    let project_id: Option<String> = r.get("project_id");
    let project = project_id.as_ref().map(|pid| ProjectBrief {
        id: pid.clone(),
        name: r.get("proj_name"),
        color: r.get("proj_color"),
        status: r.get("proj_status"),
    });

    SessionOut {
        id: r.get("id"),
        activity_id: r.get("activity_id"),
        activity: ActivityBrief {
            id: r.get("activity_id"),
            name: r.get("act_name"),
            color: r.get("act_color"),
            category: r.get("act_category"),
            is_archived: r.get::<i64, _>("act_archived") != 0,
        },
        project_id,
        project,
        started_at: r.get("started_at"),
        ended_at: r.get("ended_at"),
        duration_seconds: r.get("duration_seconds"),
        description: r.get("description"),
        tracking_method: r.get("tracking_method"),
        status: r.get("status"),
        segments,
        created_at: r.get("created_at"),
        updated_at: r.get("updated_at"),
    }
}

pub async fn load_session_or_404(
    pool: &SqlitePool,
    user_id: &str,
    session_id: &str,
) -> AppResult<SessionOut> {
    let row = sqlx::query(
        r#"
        SELECT s.id, s.activity_id, s.project_id, s.started_at, s.ended_at,
               s.duration_seconds, s.description, s.tracking_method, s.status,
               s.created_at, s.updated_at,
               a.name AS act_name, a.color AS act_color, a.category AS act_category, a.is_archived AS act_archived,
               p.name AS proj_name, p.color AS proj_color, p.status AS proj_status
        FROM time_sessions s
        JOIN activities a ON a.id = s.activity_id
        LEFT JOIN projects p ON p.id = s.project_id
        WHERE s.id = ? AND s.user_id = ?
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::not_found("Session not found"))?;

    let mut segs_map = load_segments_map(pool, &[session_id.to_string()]).await?;
    let segments = segs_map.remove(session_id).unwrap_or_default();
    Ok(session_from_joined_row(&row, segments))
}

pub async fn create_manual_session(
    pool: &SqlitePool,
    user: &UserOut,
    payload: ManualSessionCreate,
) -> AppResult<SessionOut> {
    validate_activity_and_project(
        pool,
        &user.id,
        &payload.activity_id,
        payload.project_id.as_deref(),
        false,
    )
    .await?;

    let started_at = parse_utc(&payload.started_at)?;
    let (ended_at, duration_seconds) = if let Some(ref end_str) = payload.ended_at {
        let end_dt = parse_utc(end_str)?;
        let secs = ((end_dt - started_at).num_milliseconds() as f64 / 1000.0).round() as i64;
        (end_dt, secs)
    } else if let Some(dur) = payload.duration_seconds {
        (started_at + Duration::seconds(dur), dur)
    } else {
        return Err(AppError::unprocessable(
            "Provide either ended_at or duration_seconds",
            "missing_end_or_duration",
        ));
    };

    if duration_seconds <= 0 || ended_at <= started_at {
        return Err(AppError::unprocessable(
            "Duration must be positive and end time must follow start time.",
            "invalid_duration",
        ));
    }

    ensure_no_overlap(pool, &user.id, started_at, ended_at, None, None).await?;

    let sid = Uuid::new_v4().to_string();
    let seg_id = Uuid::new_v4().to_string();
    let now = format_utc(Utc::now());
    let started_str = format_utc(started_at);
    let ended_str = format_utc(ended_at);
    let desc = payload
        .description
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO time_sessions (
            id, user_id, activity_id, project_id, started_at, ended_at,
            duration_seconds, description, tracking_method, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'completed', ?, ?)
        "#,
    )
    .bind(&sid)
    .bind(&user.id)
    .bind(&payload.activity_id)
    .bind(&payload.project_id)
    .bind(&started_str)
    .bind(&ended_str)
    .bind(duration_seconds)
    .bind(&desc)
    .bind(&now)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO time_segments (id, session_id, started_at, ended_at, duration_seconds)
        VALUES (?, ?, ?, ?, ?)
        "#,
    )
    .bind(&seg_id)
    .bind(&sid)
    .bind(&started_str)
    .bind(&ended_str)
    .bind(duration_seconds)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    load_session_or_404(pool, &user.id, &sid).await
}

pub async fn list_sessions(
    pool: &SqlitePool,
    user: &UserOut,
    params: SessionListParams,
) -> AppResult<SessionListOut> {
    let mut where_sql = String::from(
        "FROM time_sessions s
         JOIN activities a ON a.id = s.activity_id
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.user_id = ? AND s.status = 'completed'",
    );

    let mut binds: Vec<String> = vec![user.id.clone()];

    if let Some(ref aid) = params.activity_id
        && !aid.is_empty()
    {
        where_sql.push_str(" AND s.activity_id = ?");
        binds.push(aid.clone());
    }
    if let Some(ref pid) = params.project_id
        && !pid.is_empty()
    {
        where_sql.push_str(" AND s.project_id = ?");
        binds.push(pid.clone());
    }
    if let Some(ref method) = params.tracking_method
        && (method == "timer" || method == "manual")
    {
        where_sql.push_str(" AND s.tracking_method = ?");
        binds.push(method.clone());
    }

    if params.start_date.is_some() || params.end_date.is_some() {
        let s_str = params
            .start_date
            .as_deref()
            .filter(|s| !s.is_empty())
            .or_else(|| params.end_date.as_deref().filter(|s| !s.is_empty()));
        let e_str = params
            .end_date
            .as_deref()
            .filter(|s| !s.is_empty())
            .or_else(|| params.start_date.as_deref().filter(|s| !s.is_empty()));

        if let (Some(ss), Some(es)) = (s_str, e_str) {
            let sd = parse_date(ss)?;
            let ed = parse_date(es)?;
            let (range_start_utc, range_end_utc) = local_range_bounds_utc(sd, ed, &user.timezone)?;
            where_sql.push_str(" AND s.started_at < ? AND (s.ended_at IS NULL OR s.ended_at > ?)");
            binds.push(format_utc(range_end_utc));
            binds.push(format_utc(range_start_utc));
        }
    }

    if let Some(ref search) = params.search {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            let pattern = format!("%{}%", trimmed.to_lowercase());
            where_sql.push_str(
                " AND (lower(COALESCE(s.description, '')) LIKE ? OR lower(a.name) LIKE ? OR lower(COALESCE(p.name, '')) LIKE ?)",
            );
            binds.push(pattern.clone());
            binds.push(pattern.clone());
            binds.push(pattern);
        }
    }

    let count_sql = format!(
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(s.duration_seconds), 0) AS total_secs {where_sql}"
    );
    let mut count_q = sqlx::query(&count_sql);
    for v in &binds {
        count_q = count_q.bind(v);
    }
    let agg_row = count_q.fetch_one(pool).await?;
    let total: i64 = agg_row.get("cnt");
    let total_seconds: i64 = agg_row.get("total_secs");

    let order_clause = if params.sort.as_deref() == Some("asc") {
        "ORDER BY s.started_at ASC"
    } else {
        "ORDER BY s.started_at DESC"
    };

    let offset = params.offset.unwrap_or(0).max(0);
    let limit = params.limit.unwrap_or(200).clamp(1, 500);

    let data_sql = format!(
        "SELECT s.id, s.activity_id, s.project_id, s.started_at, s.ended_at,
                s.duration_seconds, s.description, s.tracking_method, s.status,
                s.created_at, s.updated_at,
                a.name AS act_name, a.color AS act_color, a.category AS act_category, a.is_archived AS act_archived,
                p.name AS proj_name, p.color AS proj_color, p.status AS proj_status
         {where_sql}
         {order_clause}
         LIMIT ? OFFSET ?"
    );

    let mut data_q = sqlx::query(&data_sql);
    for v in &binds {
        data_q = data_q.bind(v);
    }
    data_q = data_q.bind(limit).bind(offset);

    let paged_rows = data_q.fetch_all(pool).await?;

    let sids: Vec<String> = paged_rows.iter().map(|r| r.get("id")).collect();
    let mut segs_map = load_segments_map(pool, &sids).await?;

    let items = paged_rows
        .iter()
        .map(|r| {
            let id: String = r.get("id");
            let segs = segs_map.remove(&id).unwrap_or_default();
            session_from_joined_row(r, segs)
        })
        .collect();

    Ok(SessionListOut {
        items,
        total,
        total_seconds,
    })
}

pub async fn update_session(
    pool: &SqlitePool,
    user: &UserOut,
    session_id: &str,
    payload: SessionUpdate,
) -> AppResult<SessionOut> {
    let existing = load_session_or_404(pool, &user.id, session_id).await?;
    if existing.status != "completed" {
        return Err(AppError::conflict(
            "Stop the active/paused timer before editing its session details.",
            "cannot_edit_running_session",
        ));
    }

    let target_activity_id = payload
        .activity_id
        .unwrap_or_else(|| existing.activity_id.clone());
    let target_project_id = if payload.clear_project {
        None
    } else if payload.project_id.is_some() {
        payload.project_id
    } else {
        existing.project_id.clone()
    };

    validate_activity_and_project(
        pool,
        &user.id,
        &target_activity_id,
        target_project_id.as_deref(),
        target_activity_id == existing.activity_id,
    )
    .await?;

    let timing_changed = payload.started_at.is_some()
        || payload.ended_at.is_some()
        || payload.duration_seconds.is_some();

    let (new_start_str, new_end_str, new_duration) = if timing_changed {
        let new_start = match payload.started_at {
            Some(ref s) => parse_utc(s)?,
            None => parse_utc(&existing.started_at)?,
        };
        let (new_end, new_dur) = if let Some(ref e) = payload.ended_at {
            let ed = parse_utc(e)?;
            let diff = ((ed - new_start).num_milliseconds() as f64 / 1000.0).round() as i64;
            if let Some(dur) = payload.duration_seconds
                && (diff - dur).abs() > 60 {
                    return Err(AppError::unprocessable(
                        "ended_at and duration_seconds are inconsistent",
                        "inconsistent_times",
                    ));
                }
            (ed, diff)
        } else if let Some(dur) = payload.duration_seconds {
            (new_start + Duration::seconds(dur), dur)
        } else {
            let ed = parse_utc(existing.ended_at.as_deref().unwrap_or(&existing.started_at))?;
            let diff = ((ed - new_start).num_milliseconds() as f64 / 1000.0).round() as i64;
            (ed, diff)
        };

        if new_dur <= 0 || new_end <= new_start {
            return Err(AppError::unprocessable(
                "ended_at must be later than started_at",
                "invalid_duration",
            ));
        }

        ensure_no_overlap(
            pool,
            &user.id,
            new_start,
            new_end,
            Some(&existing.id),
            None,
        )
        .await?;

        (format_utc(new_start), format_utc(new_end), new_dur)
    } else {
        (
            existing.started_at.clone(),
            existing.ended_at.clone().unwrap_or_else(|| existing.started_at.clone()),
            existing.duration_seconds,
        )
    };

    let new_desc = match payload.description {
        Some(d) => {
            let trimmed = d.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        None => existing.description.clone(),
    };

    let now = format_utc(Utc::now());
    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        UPDATE time_sessions
        SET activity_id = ?, project_id = ?, started_at = ?, ended_at = ?,
            duration_seconds = ?, description = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        "#,
    )
    .bind(&target_activity_id)
    .bind(&target_project_id)
    .bind(&new_start_str)
    .bind(&new_end_str)
    .bind(new_duration)
    .bind(&new_desc)
    .bind(&now)
    .bind(&existing.id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await?;

    if timing_changed {
        sqlx::query("DELETE FROM time_segments WHERE session_id = ?")
            .bind(&existing.id)
            .execute(&mut *tx)
            .await?;

        let seg_id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO time_segments (id, session_id, started_at, ended_at, duration_seconds)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(&seg_id)
        .bind(&existing.id)
        .bind(&new_start_str)
        .bind(&new_end_str)
        .bind(new_duration)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    load_session_or_404(pool, &user.id, &existing.id).await
}

pub async fn delete_session(
    pool: &SqlitePool,
    user: &UserOut,
    session_id: &str,
) -> AppResult<()> {
    let existing = load_session_or_404(pool, &user.id, session_id).await?;
    sqlx::query("DELETE FROM time_sessions WHERE id = ? AND user_id = ?")
        .bind(&existing.id)
        .bind(&user.id)
        .execute(pool)
        .await?;
    Ok(())
}
