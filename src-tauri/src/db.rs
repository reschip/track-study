use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;

use chrono::{Duration, SecondsFormat, Utc};
use chrono_tz::Tz;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::error::AppResult;

pub fn format_utc(dt: chrono::DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Micros, true)
}

pub async fn init_pool_from_url(database_url: &str) -> AppResult<SqlitePool> {
    let opts = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(opts)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;
    Ok(pool)
}

pub async fn init_pool_at_path(db_path: &Path) -> AppResult<SqlitePool> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| crate::error::AppError::internal(format!("Failed to create db dir: {e}")))?;
    }
    let url = format!("sqlite://{}", db_path.to_string_lossy());
    init_pool_from_url(&url).await
}

pub async fn get_or_create_default_user_id(pool: &SqlitePool) -> AppResult<String> {
    if let Some(row) = sqlx::query("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
        .fetch_optional(pool)
        .await?
    {
        return Ok(row.get::<String, _>("id"));
    }

    let id = Uuid::new_v4().to_string();
    let now = format_utc(Utc::now());

    sqlx::query(
        r#"
        INSERT INTO users (
            id, email, name, timezone, week_start_day, theme,
            intensity_thresholds, tracking_preferences, created_at, updated_at
        )
        VALUES (?, 'local@activity.app', 'Activity User', 'America/Mexico_City', 'monday', 'light',
                '[1800, 5400, 10800]',
                '{"confirm_switch": true, "default_manual_mode": "start_end", "default_activity_id": null, "default_project_id": null}',
                ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(id)
}

pub async fn seed_catalog_if_empty(pool: &SqlitePool) -> AppResult<()> {
    let user_id = get_or_create_default_user_id(pool).await?;

    let act_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM activities WHERE user_id = ?")
        .bind(&user_id)
        .fetch_one(pool)
        .await?;

    if act_count > 0 {
        return Ok(());
    }

    let now = format_utc(Utc::now());
    let activities_spec: [(&str, &str, &str, &str); 12] = [
        ("Programming", "professional", "#1F6FEB", "Core feature engineering, refactoring, and systems coding."),
        ("Machine Learning", "professional", "#8250DF", "Model training, evaluation pipelines, and experiment tracking."),
        ("Software Engineering", "professional", "#0969DA", "Architecture design, code reviews, testing, and documentation."),
        ("Research", "professional", "#0E8A16", "Literature review, paper reading, and technical synthesis."),
        ("Thesis", "professional", "#2DA44E", "Master's thesis writing, methodology, and experiments."),
        ("LeetCode", "professional", "#BF8700", "Algorithms, data structures, and timed problem solving."),
        ("YouTube", "professional", "#CF222E", "Scripting, recording, and editing technical videos."),
        ("English", "personal", "#0A7F8A", "Speaking practice, writing refinement, and listening."),
        ("Guitar", "personal", "#D97706", "Technique drills, chord voicings, and repertoire."),
        ("Reading", "personal", "#6E7781", "Non-fiction, engineering books, and long-form essays."),
        ("Exercise", "personal", "#1A7F37", "Strength training, running, and mobility work."),
        ("Personal Projects", "personal", "#9A6700", "Independent tools, prototypes, and side experiments."),
    ];

    let mut act_map: HashMap<&str, String> = HashMap::new();
    for (name, category, color, desc) in activities_spec {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            r#"
            INSERT INTO activities (id, user_id, name, description, color, category, is_archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
            "#,
        )
        .bind(&id)
        .bind(&user_id)
        .bind(name)
        .bind(desc)
        .bind(color)
        .bind(category)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;
        act_map.insert(name, id);
    }

    let tz: Tz = chrono_tz::America::Mexico_City;
    let today_local = Utc::now().with_timezone(&tz).date_naive();

    let projects_spec: [(&str, &str, i64, Option<i64>, &str, &str, &[&str]); 4] = [
        (
            "AI Product Discovery",
            "#1F6FEB",
            -75,
            None,
            "active",
            "End-to-end discovery tooling, retrieval prototypes, and evaluation.",
            &["Programming", "Machine Learning", "Research"],
        ),
        (
            "Master's Thesis",
            "#2DA44E",
            -120,
            Some(90),
            "active",
            "Research experiments, thesis manuscript, and ablation analysis.",
            &["Thesis", "Research", "Machine Learning"],
        ),
        (
            "YouTube Channel",
            "#CF222E",
            -60,
            None,
            "active",
            "Educational engineering videos and developer workflow breakdowns.",
            &["YouTube", "Software Engineering", "Personal Projects"],
        ),
        (
            "Interview Preparation",
            "#8250DF",
            -45,
            None,
            "active",
            "Algorithmic fluency, system design drills, and communication.",
            &["LeetCode", "Software Engineering", "English"],
        ),
    ];

    for (name, color, start_offset, end_offset, status, desc, linked) in projects_spec {
        let pid = Uuid::new_v4().to_string();
        let start_date = (today_local + Duration::days(start_offset)).format("%Y-%m-%d").to_string();
        let end_date = end_offset.map(|d| (today_local + Duration::days(d)).format("%Y-%m-%d").to_string());
        sqlx::query(
            r#"
            INSERT INTO projects (id, user_id, name, description, color, start_date, end_date, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&pid)
        .bind(&user_id)
        .bind(name)
        .bind(desc)
        .bind(color)
        .bind(&start_date)
        .bind(&end_date)
        .bind(status)
        .bind(&now)
        .bind(&now)
        .execute(pool)
        .await?;

        for act_name in linked {
            if let Some(aid) = act_map.get(act_name) {
                sqlx::query(
                    "INSERT OR IGNORE INTO project_activities (project_id, activity_id) VALUES (?, ?)",
                )
                .bind(&pid)
                .bind(aid)
                .execute(pool)
                .await?;
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn migrates_and_seeds_clean_catalog_without_sessions() {
        let pool = init_pool_from_url("sqlite::memory:").await.unwrap();
        seed_catalog_if_empty(&pool).await.unwrap();
        seed_catalog_if_empty(&pool).await.unwrap();

        let users: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        let acts: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM activities")
            .fetch_one(&pool)
            .await
            .unwrap();
        let projs: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM projects")
            .fetch_one(&pool)
            .await
            .unwrap();
        let sessions: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM time_sessions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert_eq!(users, 1);
        assert_eq!(acts, 12);
        assert_eq!(projs, 4);
        assert_eq!(sessions, 0);
    }
}
