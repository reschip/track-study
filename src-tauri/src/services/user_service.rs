use chrono::Utc;
use sqlx::{Row, SqlitePool};

use crate::db::{format_utc, get_or_create_default_user_id};
use crate::error::{AppError, AppResult};
use crate::models::{TrackingPreferences, UserOut, UserUpdate};
use crate::time_utils::parse_tz;

fn row_to_user(row: sqlx::sqlite::SqliteRow) -> AppResult<UserOut> {
    let thresholds_str: String = row.get("intensity_thresholds");
    let prefs_str: String = row.get("tracking_preferences");

    let intensity_thresholds: [i64; 3] = serde_json::from_str(&thresholds_str)?;
    let tracking_preferences: TrackingPreferences = serde_json::from_str(&prefs_str)?;

    Ok(UserOut {
        id: row.get("id"),
        email: row.get("email"),
        name: row.get("name"),
        timezone: row.get("timezone"),
        week_start_day: row.get("week_start_day"),
        theme: row.get("theme"),
        intensity_thresholds,
        tracking_preferences,
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

pub async fn get_default_user(pool: &SqlitePool) -> AppResult<UserOut> {
    let user_id = get_or_create_default_user_id(pool).await?;
    let row = sqlx::query(
        r#"
        SELECT id, email, name, timezone, week_start_day, theme,
               intensity_thresholds, tracking_preferences, created_at, updated_at
        FROM users WHERE id = ?
        "#,
    )
    .bind(&user_id)
    .fetch_one(pool)
    .await?;

    row_to_user(row)
}

pub async fn update_user(pool: &SqlitePool, payload: UserUpdate) -> AppResult<UserOut> {
    let mut user = get_default_user(pool).await?;

    if let Some(email) = payload.email {
        let trimmed = email.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::unprocessable("Email cannot be empty", "invalid_email"));
        }
        if trimmed != user.email {
            let exists: Option<String> =
                sqlx::query_scalar("SELECT id FROM users WHERE email = ? AND id != ?")
                    .bind(&trimmed)
                    .bind(&user.id)
                    .fetch_optional(pool)
                    .await?;
            if exists.is_some() {
                return Err(AppError::conflict("Email is already in use", "email_exists"));
            }
            user.email = trimmed;
        }
    }

    if let Some(name) = payload.name {
        let trimmed = name.trim().to_string();
        if trimmed.is_empty() {
            return Err(AppError::unprocessable("Name cannot be empty", "invalid_name"));
        }
        user.name = trimmed;
    }

    if let Some(tz) = payload.timezone {
        parse_tz(&tz)?;
        user.timezone = tz;
    }

    if let Some(wsd) = payload.week_start_day {
        if wsd != "monday" && wsd != "sunday" {
            return Err(AppError::unprocessable(
                "week_start_day must be 'monday' or 'sunday'",
                "invalid_week_start_day",
            ));
        }
        user.week_start_day = wsd;
    }

    if let Some(theme) = payload.theme {
        if theme != "light" && theme != "dark" {
            return Err(AppError::unprocessable(
                "theme must be 'light' or 'dark'",
                "invalid_theme",
            ));
        }
        user.theme = theme;
    }

    if let Some(t) = payload.intensity_thresholds {
        if t[0] <= 0 || t[1] <= t[0] || t[2] <= t[1] {
            return Err(AppError::unprocessable(
                "intensity_thresholds must be strictly increasing positive integers",
                "invalid_thresholds",
            ));
        }
        user.intensity_thresholds = t;
    }

    if let Some(prefs) = payload.tracking_preferences {
        if prefs.default_manual_mode != "start_end" && prefs.default_manual_mode != "duration" {
            return Err(AppError::unprocessable(
                "default_manual_mode must be 'start_end' or 'duration'",
                "invalid_manual_mode",
            ));
        }
        user.tracking_preferences = prefs;
    }

    let now = format_utc(Utc::now());
    let thresholds_json = serde_json::to_string(&user.intensity_thresholds)?;
    let prefs_json = serde_json::to_string(&user.tracking_preferences)?;

    sqlx::query(
        r#"
        UPDATE users
        SET email = ?, name = ?, timezone = ?, week_start_day = ?, theme = ?,
            intensity_thresholds = ?, tracking_preferences = ?, updated_at = ?
        WHERE id = ?
        "#,
    )
    .bind(&user.email)
    .bind(&user.name)
    .bind(&user.timezone)
    .bind(&user.week_start_day)
    .bind(&user.theme)
    .bind(&thresholds_json)
    .bind(&prefs_json)
    .bind(&now)
    .bind(&user.id)
    .execute(pool)
    .await?;

    get_default_user(pool).await
}
