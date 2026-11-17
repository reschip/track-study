use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Timelike, Utc};
use sqlx::{Row, SqlitePool};

use crate::db::format_utc;
use crate::error::AppResult;
use crate::models::{
    ActivityBrief, ActivityComparisonSeries, AnalyticsCompareOut, AnalyticsSummaryOut,
    ContributionDay, ContributionSummary, ContributionsOut, DailySeriesPoint, DayDetailOut,
    DaySessionSlice, DescriptivePatterns, DistributionItem, FrequentActivityPoint, HourlyPoint,
    OverviewOut, ProjectBrief, SessionListParams, TodaySummary, UserOut, WeekdayPoint,
};
use crate::services::session_service;
use crate::time_utils::{
    compute_period_dates, format_date, local_date_of, local_range_bounds_utc, parse_date, parse_tz,
    parse_utc, split_interval_by_local_day,
};

#[derive(Debug, Clone)]
struct SliceSessionMeta {
    session_id: String,
    activity: ActivityBrief,
    project: Option<ProjectBrief>,
    session_started_at: String,
    session_ended_at: String,
    session_duration_seconds: i64,
    description: Option<String>,
    tracking_method: String,
}

#[derive(Debug, Clone)]
struct SegmentSlice {
    session: SliceSessionMeta,
    local_date: NaiveDate,
    start_utc: DateTime<Utc>,
    end_utc: DateTime<Utc>,
    seconds: i64,
}

pub fn compute_intensity(seconds: i64, thresholds: [i64; 3]) -> u8 {
    if seconds <= 0 {
        return 0;
    }
    if seconds < thresholds[0] {
        1
    } else if seconds < thresholds[1] {
        2
    } else if seconds < thresholds[2] {
        3
    } else {
        4
    }
}

async fn fetch_completed_slices(
    pool: &SqlitePool,
    user: &UserOut,
    start_day: NaiveDate,
    end_day: NaiveDate,
    activity_ids: Option<&[String]>,
    project_id: Option<&str>,
) -> AppResult<Vec<SegmentSlice>> {
    if let Some(ids) = activity_ids {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
    }

    let (range_start_utc, range_end_utc) =
        local_range_bounds_utc(start_day, end_day, &user.timezone)?;
    let range_start_str = format_utc(range_start_utc);
    let range_end_str = format_utc(range_end_utc);

    let mut sql = String::from(
        "SELECT
            seg.started_at AS seg_started_at,
            seg.ended_at AS seg_ended_at,
            sess.id AS sess_id,
            sess.started_at AS sess_started_at,
            sess.ended_at AS sess_ended_at,
            sess.duration_seconds AS sess_duration_seconds,
            sess.description AS sess_description,
            sess.tracking_method AS sess_tracking_method,
            a.id AS act_id,
            a.name AS act_name,
            a.color AS act_color,
            a.category AS act_category,
            a.is_archived AS act_is_archived,
            p.id AS proj_id,
            p.name AS proj_name,
            p.color AS proj_color,
            p.status AS proj_status
         FROM time_segments seg
         JOIN time_sessions sess ON seg.session_id = sess.id
         JOIN activities a ON sess.activity_id = a.id
         LEFT JOIN projects p ON sess.project_id = p.id
         WHERE sess.user_id = ?
           AND sess.status = 'completed'
           AND seg.ended_at IS NOT NULL
           AND seg.started_at < ?
           AND seg.ended_at > ?",
    );

    if let Some(ids) = activity_ids {
        let placeholders = vec!["?"; ids.len()].join(",");
        sql.push_str(&format!(" AND sess.activity_id IN ({placeholders})"));
    }
    if project_id.is_some() {
        sql.push_str(" AND sess.project_id = ?");
    }
    sql.push_str(" ORDER BY seg.started_at ASC");

    let mut query = sqlx::query(&sql)
        .bind(&user.id)
        .bind(&range_end_str)
        .bind(&range_start_str);

    if let Some(ids) = activity_ids {
        for id in ids {
            query = query.bind(id);
        }
    }
    if let Some(pid) = project_id {
        query = query.bind(pid);
    }

    let rows = query.fetch_all(pool).await?;
    let mut slices = Vec::new();

    for row in rows {
        let seg_start_str: String = row.get("seg_started_at");
        let Some(seg_end_str) = row.get::<Option<String>, _>("seg_ended_at") else {
            continue;
        };
        let seg_start = parse_utc(&seg_start_str)?;
        let seg_end = parse_utc(&seg_end_str)?;

        let clamped_start = seg_start.max(range_start_utc);
        let clamped_end = seg_end.min(range_end_utc);
        if clamped_end <= clamped_start {
            continue;
        }

        let meta = SliceSessionMeta {
            session_id: row.get("sess_id"),
            activity: ActivityBrief {
                id: row.get("act_id"),
                name: row.get("act_name"),
                color: row.get("act_color"),
                category: row.get("act_category"),
                is_archived: row.get::<i64, _>("act_is_archived") != 0,
            },
            project: row.get::<Option<String>, _>("proj_id").map(|pid| ProjectBrief {
                id: pid,
                name: row.get("proj_name"),
                color: row.get("proj_color"),
                status: row.get("proj_status"),
            }),
            session_started_at: row.get("sess_started_at"),
            session_ended_at: row
                .get::<Option<String>, _>("sess_ended_at")
                .unwrap_or_else(|| row.get("sess_started_at")),
            session_duration_seconds: row.get("sess_duration_seconds"),
            description: row.get("sess_description"),
            tracking_method: row.get("sess_tracking_method"),
        };

        for day_sl in split_interval_by_local_day(clamped_start, clamped_end, &user.timezone)? {
            if day_sl.local_date >= start_day && day_sl.local_date <= end_day && day_sl.seconds > 0
            {
                slices.push(SegmentSlice {
                    session: meta.clone(),
                    local_date: day_sl.local_date,
                    start_utc: day_sl.start_utc,
                    end_utc: day_sl.end_utc,
                    seconds: day_sl.seconds,
                });
            }
        }
    }

    Ok(slices)
}

fn build_activity_distribution(slices: &[SegmentSlice]) -> Vec<DistributionItem> {
    let mut totals: HashMap<String, i64> = HashMap::new();
    let mut session_sets: HashMap<String, HashSet<String>> = HashMap::new();
    let mut meta: HashMap<String, ActivityBrief> = HashMap::new();

    for sl in slices {
        let aid = &sl.session.activity.id;
        meta.entry(aid.clone())
            .or_insert_with(|| sl.session.activity.clone());
        *totals.entry(aid.clone()).or_insert(0) += sl.seconds;
        session_sets
            .entry(aid.clone())
            .or_default()
            .insert(sl.session.session_id.clone());
    }

    let grand_total: i64 = totals.values().sum();
    let mut entries: Vec<(String, i64)> = totals.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    entries
        .into_iter()
        .map(|(aid, secs)| {
            let act = &meta[&aid];
            let pct = if grand_total > 0 {
                ((secs as f64 / grand_total as f64) * 1000.0).round() / 10.0
            } else {
                0.0
            };
            DistributionItem {
                id: Some(act.id.clone()),
                name: act.name.clone(),
                color: act.color.clone(),
                total_seconds: secs,
                percentage: pct,
                session_count: session_sets.get(&aid).map(|s| s.len() as i64).unwrap_or(0),
            }
        })
        .collect()
}

fn build_project_distribution(slices: &[SegmentSlice]) -> Vec<DistributionItem> {
    let mut totals: HashMap<Option<String>, i64> = HashMap::new();
    let mut session_sets: HashMap<Option<String>, HashSet<String>> = HashMap::new();
    let mut meta: HashMap<String, ProjectBrief> = HashMap::new();

    for sl in slices {
        let pid = sl.session.project.as_ref().map(|p| p.id.clone());
        if let Some(proj) = &sl.session.project {
            meta.entry(proj.id.clone()).or_insert_with(|| proj.clone());
        }
        *totals.entry(pid.clone()).or_insert(0) += sl.seconds;
        session_sets
            .entry(pid)
            .or_default()
            .insert(sl.session.session_id.clone());
    }

    let grand_total: i64 = totals.values().sum();
    let mut entries: Vec<(Option<String>, i64)> = totals.into_iter().collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));

    entries
        .into_iter()
        .map(|(pid, secs)| {
            let proj = pid.as_ref().and_then(|id| meta.get(id));
            let pct = if grand_total > 0 {
                ((secs as f64 / grand_total as f64) * 1000.0).round() / 10.0
            } else {
                0.0
            };
            DistributionItem {
                id: proj.map(|p| p.id.clone()),
                name: proj
                    .map(|p| p.name.clone())
                    .unwrap_or_else(|| "No project".to_string()),
                color: proj
                    .map(|p| p.color.clone())
                    .unwrap_or_else(|| "#71717A".to_string()),
                total_seconds: secs,
                percentage: pct,
                session_count: session_sets.get(&pid).map(|s| s.len() as i64).unwrap_or(0),
            }
        })
        .collect()
}

fn accumulate_hourly_seconds(slices: &[SegmentSlice], tz_name: &str) -> AppResult<[i64; 24]> {
    let tz = parse_tz(tz_name)?;
    let mut hourly = [0.0_f64; 24];

    for sl in slices {
        let mut cur = sl.start_utc;
        let end = sl.end_utc;
        while cur < end {
            let cur_local = cur.with_timezone(&tz);
            let hour_idx = cur_local.hour() as usize;
            let cur_hour_naive = cur_local
                .date_naive()
                .and_hms_opt(cur_local.hour(), 0, 0)
                .unwrap();
            let next_hour_naive = cur_hour_naive + Duration::hours(1);
            let next_hour_utc = match tz.from_local_datetime(&next_hour_naive).earliest() {
                Some(dt) if dt.with_timezone(&Utc) > cur => dt.with_timezone(&Utc),
                _ => cur + Duration::hours(1),
            };
            let step_end = end.min(next_hour_utc);
            let secs = (step_end - cur).num_milliseconds() as f64 / 1000.0;
            if secs > 0.0 {
                hourly[hour_idx] += secs;
            }
            cur = step_end;
        }
    }

    let mut rounded = [0_i64; 24];
    for h in 0..24 {
        rounded[h] = hourly[h].round() as i64;
    }
    Ok(rounded)
}

pub async fn get_overview(pool: &SqlitePool, user: &UserOut) -> AppResult<OverviewOut> {
    let today = local_date_of(Utc::now(), &user.timezone)?;
    let slices = fetch_completed_slices(pool, user, today, today, None, None).await?;

    let total_seconds: i64 = slices.iter().map(|s| s.seconds).sum();
    let unique_sessions: HashSet<&str> = slices
        .iter()
        .map(|s| s.session.session_id.as_str())
        .collect();
    let unique_activities: HashSet<&str> = slices
        .iter()
        .map(|s| s.session.activity.id.as_str())
        .collect();
    let unique_projects: HashSet<&str> = slices
        .iter()
        .filter_map(|s| s.session.project.as_ref().map(|p| p.id.as_str()))
        .collect();

    let recent = session_service::list_sessions(
        pool,
        user,
        SessionListParams {
            sort: Some("newest".to_string()),
            limit: Some(8),
            offset: Some(0),
            ..Default::default()
        },
    )
    .await?
    .items;

    Ok(OverviewOut {
        today: TodaySummary {
            date: format_date(today),
            total_seconds,
            session_count: unique_sessions.len() as i64,
            activity_count: unique_activities.len() as i64,
            project_count: unique_projects.len() as i64,
        },
        activity_distribution: build_activity_distribution(&slices),
        recent_sessions: recent,
    })
}

fn summarize_contributions(slices: &[SegmentSlice]) -> ContributionSummary {
    let mut daily_secs: HashMap<NaiveDate, i64> = HashMap::new();
    let mut session_ids: HashSet<String> = HashSet::new();
    let mut act_secs: HashMap<String, i64> = HashMap::new();
    let mut act_meta: HashMap<String, ActivityBrief> = HashMap::new();

    for sl in slices {
        *daily_secs.entry(sl.local_date).or_insert(0) += sl.seconds;
        session_ids.insert(sl.session.session_id.clone());
        let aid = &sl.session.activity.id;
        *act_secs.entry(aid.clone()).or_insert(0) += sl.seconds;
        act_meta
            .entry(aid.clone())
            .or_insert_with(|| sl.session.activity.clone());
    }

    let total_seconds: i64 = daily_secs.values().sum();
    let active_days = daily_secs.values().filter(|&&s| s > 0).count() as i64;
    let avg_per_active = if active_days > 0 {
        total_seconds / active_days
    } else {
        0
    };

    let mut most_act: Option<ActivityBrief> = None;
    let mut most_secs = 0_i64;
    if let Some((top_id, top_secs)) = act_secs.iter().max_by_key(|(_, secs)| *secs) {
        most_act = act_meta.get(top_id).cloned();
        most_secs = *top_secs;
    }

    ContributionSummary {
        total_seconds,
        active_days,
        total_sessions: session_ids.len() as i64,
        avg_seconds_per_active_day: avg_per_active,
        most_tracked_activity: most_act,
        most_tracked_seconds: most_secs,
    }
}

pub async fn get_contributions(
    pool: &SqlitePool,
    user: &UserOut,
    year: Option<i32>,
    activity_id: Option<&str>,
    project_id: Option<&str>,
) -> AppResult<ContributionsOut> {
    let target_year = match year {
        Some(y) => y,
        None => local_date_of(Utc::now(), &user.timezone)?.year(),
    };
    let start_day = NaiveDate::from_ymd_opt(target_year, 1, 1).unwrap();
    let end_day = NaiveDate::from_ymd_opt(target_year, 12, 31).unwrap();

    let act_filter = activity_id.map(|id| vec![id.to_string()]);
    let slices = fetch_completed_slices(
        pool,
        user,
        start_day,
        end_day,
        act_filter.as_deref(),
        project_id,
    )
    .await?;

    let mut daily_secs: HashMap<NaiveDate, i64> = HashMap::new();
    let mut daily_sessions: HashMap<NaiveDate, HashSet<String>> = HashMap::new();
    for sl in &slices {
        *daily_secs.entry(sl.local_date).or_insert(0) += sl.seconds;
        daily_sessions
            .entry(sl.local_date)
            .or_default()
            .insert(sl.session.session_id.clone());
    }

    let thresholds = user.intensity_thresholds;
    let mut days = Vec::new();
    let mut cursor = start_day;
    while cursor <= end_day {
        let secs = daily_secs.get(&cursor).copied().unwrap_or(0);
        let sess_count = daily_sessions
            .get(&cursor)
            .map(|s| s.len() as i64)
            .unwrap_or(0);
        days.push(ContributionDay {
            date: format_date(cursor),
            total_seconds: secs,
            session_count: sess_count,
            intensity: compute_intensity(secs, thresholds),
        });
        cursor += Duration::days(1);
    }

    let summary = summarize_contributions(&slices);

    let prev_start = NaiveDate::from_ymd_opt(target_year - 1, 1, 1).unwrap();
    let prev_end = NaiveDate::from_ymd_opt(target_year - 1, 12, 31).unwrap();
    let prev_slices = fetch_completed_slices(
        pool,
        user,
        prev_start,
        prev_end,
        act_filter.as_deref(),
        project_id,
    )
    .await?;
    let previous_year_summary = if prev_slices.is_empty() {
        None
    } else {
        Some(summarize_contributions(&prev_slices))
    };

    Ok(ContributionsOut {
        year: target_year,
        start_date: format_date(start_day),
        end_date: format_date(end_day),
        thresholds,
        days,
        summary,
        previous_year_summary,
    })
}

pub async fn get_day_detail(
    pool: &SqlitePool,
    user: &UserOut,
    target_date_str: &str,
    activity_id: Option<&str>,
    project_id: Option<&str>,
) -> AppResult<DayDetailOut> {
    let target_date = parse_date(target_date_str)?;
    let act_filter = activity_id.map(|id| vec![id.to_string()]);
    let slices = fetch_completed_slices(
        pool,
        user,
        target_date,
        target_date,
        act_filter.as_deref(),
        project_id,
    )
    .await?;

    let mut by_session: HashMap<String, Vec<&SegmentSlice>> = HashMap::new();
    for sl in &slices {
        by_session
            .entry(sl.session.session_id.clone())
            .or_default()
            .push(sl);
    }

    let mut day_sessions = Vec::with_capacity(by_session.len());
    for (_sid, sess_slices) in by_session {
        let meta = &sess_slices[0].session;
        let slice_start = sess_slices.iter().map(|s| s.start_utc).min().unwrap();
        let slice_end = sess_slices.iter().map(|s| s.end_utc).max().unwrap();
        let slice_secs: i64 = sess_slices.iter().map(|s| s.seconds).sum();

        let sess_start_utc = parse_utc(&meta.session_started_at)?;
        let sess_end_utc = parse_utc(&meta.session_ended_at)?;
        let start_local_day = local_date_of(sess_start_utc, &user.timezone)?;
        let end_local_day = local_date_of(sess_end_utc, &user.timezone)?;

        day_sessions.push(DaySessionSlice {
            session_id: meta.session_id.clone(),
            activity: meta.activity.clone(),
            project: meta.project.clone(),
            session_started_at: meta.session_started_at.clone(),
            session_ended_at: meta.session_ended_at.clone(),
            session_duration_seconds: meta.session_duration_seconds,
            slice_started_at: format_utc(slice_start),
            slice_ended_at: format_utc(slice_end),
            slice_seconds: slice_secs,
            description: meta.description.clone(),
            tracking_method: meta.tracking_method.clone(),
            crosses_midnight: start_local_day != end_local_day,
        });
    }

    day_sessions.sort_by(|a, b| a.slice_started_at.cmp(&b.slice_started_at));
    let total_seconds: i64 = day_sessions.iter().map(|s| s.slice_seconds).sum();

    Ok(DayDetailOut {
        date: format_date(target_date),
        total_seconds,
        session_count: day_sessions.len() as i64,
        activity_distribution: build_activity_distribution(&slices),
        sessions: day_sessions,
    })
}

pub async fn get_analytics_summary(
    pool: &SqlitePool,
    user: &UserOut,
    period: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
    activity_id: Option<&str>,
    project_id: Option<&str>,
) -> AppResult<AnalyticsSummaryOut> {
    let custom_start = start_date.map(parse_date).transpose()?;
    let custom_end = end_date.map(parse_date).transpose()?;
    let (start_day, end_day) = compute_period_dates(
        period,
        &user.timezone,
        &user.week_start_day,
        custom_start,
        custom_end,
        None,
    )?;

    let act_filter = activity_id.map(|id| vec![id.to_string()]);
    let slices = fetch_completed_slices(
        pool,
        user,
        start_day,
        end_day,
        act_filter.as_deref(),
        project_id,
    )
    .await?;

    let mut daily_secs: HashMap<NaiveDate, i64> = HashMap::new();
    let mut daily_sessions: HashMap<NaiveDate, HashSet<String>> = HashMap::new();
    let mut session_slice_totals: HashMap<String, i64> = HashMap::new();
    let mut act_freq_sessions: HashMap<String, HashSet<String>> = HashMap::new();
    let mut act_freq_secs: HashMap<String, i64> = HashMap::new();
    let mut act_meta: HashMap<String, ActivityBrief> = HashMap::new();

    for sl in &slices {
        *daily_secs.entry(sl.local_date).or_insert(0) += sl.seconds;
        daily_sessions
            .entry(sl.local_date)
            .or_default()
            .insert(sl.session.session_id.clone());
        *session_slice_totals
            .entry(sl.session.session_id.clone())
            .or_insert(0) += sl.seconds;

        let aid = &sl.session.activity.id;
        act_freq_sessions
            .entry(aid.clone())
            .or_default()
            .insert(sl.session.session_id.clone());
        *act_freq_secs.entry(aid.clone()).or_insert(0) += sl.seconds;
        act_meta
            .entry(aid.clone())
            .or_insert_with(|| sl.session.activity.clone());
    }

    let mut daily_activity = Vec::new();
    let mut cursor = start_day;
    while cursor <= end_day {
        daily_activity.push(DailySeriesPoint {
            date: format_date(cursor),
            total_seconds: daily_secs.get(&cursor).copied().unwrap_or(0),
            session_count: daily_sessions
                .get(&cursor)
                .map(|s| s.len() as i64)
                .unwrap_or(0),
        });
        cursor += Duration::days(1);
    }

    let total_seconds: i64 = daily_secs.values().sum();
    let total_sessions = session_slice_totals.len() as i64;
    let active_days = daily_secs.values().filter(|&&s| s > 0).count() as i64;
    let avg_session = if total_sessions > 0 {
        total_seconds / total_sessions
    } else {
        0
    };
    let avg_daily = if active_days > 0 {
        total_seconds / active_days
    } else {
        0
    };

    let weekday_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let order: [usize; 7] = if user.week_start_day == "monday" {
        [0, 1, 2, 3, 4, 5, 6]
    } else {
        [6, 0, 1, 2, 3, 4, 5]
    };
    let mut wd_secs = [0_i64; 7];
    let mut wd_sessions: [HashSet<String>; 7] = Default::default();
    for sl in &slices {
        let wd = sl.local_date.weekday().num_days_from_monday() as usize;
        wd_secs[wd] += sl.seconds;
        wd_sessions[wd].insert(sl.session.session_id.clone());
    }

    let weekly_overview: Vec<WeekdayPoint> = order
        .iter()
        .enumerate()
        .map(|(idx, &wd)| WeekdayPoint {
            weekday_index: idx,
            label: weekday_names[wd].to_string(),
            total_seconds: wd_secs[wd],
            session_count: wd_sessions[wd].len() as i64,
        })
        .collect();

    let hourly_map = accumulate_hourly_seconds(&slices, &user.timezone)?;
    let hourly_distribution: Vec<HourlyPoint> = (0..24)
        .map(|h| HourlyPoint {
            hour: h,
            label: format!("{h:02}:00"),
            total_seconds: hourly_map[h],
        })
        .collect();

    let max_hour_secs = hourly_map.iter().copied().max().unwrap_or(0);
    let peak_hours = if max_hour_secs > 0 {
        let mut by_hour: Vec<(usize, i64)> = hourly_map
            .iter()
            .enumerate()
            .filter(|&(_, &s)| s > 0)
            .map(|(h, &s)| (h, s))
            .collect();
        by_hour.sort_by(|a, b| b.1.cmp(&a.1));
        by_hour.into_iter().take(3).map(|(h, _)| h).collect()
    } else {
        Vec::new()
    };

    let max_wd_secs = weekly_overview
        .iter()
        .map(|w| w.total_seconds)
        .max()
        .unwrap_or(0);
    let highest_volume_weekdays = if max_wd_secs > 0 {
        let mut sorted_wd: Vec<&WeekdayPoint> = weekly_overview
            .iter()
            .filter(|w| w.total_seconds > 0)
            .collect();
        sorted_wd.sort_by(|a, b| b.total_seconds.cmp(&a.total_seconds));
        sorted_wd
            .into_iter()
            .take(2)
            .map(|w| w.label.clone())
            .collect()
    } else {
        Vec::new()
    };

    let mut freq_list: Vec<(String, usize, i64)> = act_freq_sessions
        .iter()
        .map(|(aid, sess_set)| {
            (
                aid.clone(),
                sess_set.len(),
                act_freq_secs.get(aid).copied().unwrap_or(0),
            )
        })
        .collect();
    freq_list.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| b.2.cmp(&a.2)));
    let most_frequent_activities = freq_list
        .into_iter()
        .take(5)
        .map(|(aid, sess_count, secs)| {
            let count_i64 = sess_count as i64;
            FrequentActivityPoint {
                activity: act_meta[&aid].clone(),
                session_count: count_i64,
                total_seconds: secs,
                average_session_seconds: if count_i64 > 0 { secs / count_i64 } else { 0 },
            }
        })
        .collect();

    Ok(AnalyticsSummaryOut {
        period: period.to_string(),
        start_date: format_date(start_day),
        end_date: format_date(end_day),
        total_seconds,
        total_sessions,
        active_days,
        average_session_seconds: avg_session,
        average_daily_seconds: avg_daily,
        activity_distribution: build_activity_distribution(&slices),
        daily_activity,
        weekly_overview,
        project_distribution: build_project_distribution(&slices),
        patterns: DescriptivePatterns {
            hourly_distribution,
            peak_hours,
            highest_volume_weekdays,
            average_session_seconds: avg_session,
            most_frequent_activities,
        },
    })
}

pub async fn get_activity_comparison(
    pool: &SqlitePool,
    user: &UserOut,
    activity_ids: &[String],
    period: &str,
    start_date: Option<&str>,
    end_date: Option<&str>,
) -> AppResult<AnalyticsCompareOut> {
    let custom_start = start_date.map(parse_date).transpose()?;
    let custom_end = end_date.map(parse_date).transpose()?;
    let (start_day, end_day) = compute_period_dates(
        period,
        &user.timezone,
        &user.week_start_day,
        custom_start,
        custom_end,
        None,
    )?;

    let mut unique_ids = Vec::new();
    let mut seen = HashSet::new();
    for id in activity_ids {
        if seen.insert(id.clone()) {
            unique_ids.push(id.clone());
        }
    }

    let mut act_by_id: HashMap<String, ActivityBrief> = HashMap::new();
    if !unique_ids.is_empty() {
        let placeholders = vec!["?"; unique_ids.len()].join(",");
        let sql = format!(
            "SELECT id, name, color, category, is_archived FROM activities WHERE user_id = ? AND id IN ({placeholders})"
        );
        let mut query = sqlx::query(&sql).bind(&user.id);
        for id in &unique_ids {
            query = query.bind(id);
        }
        let rows = query.fetch_all(pool).await?;
        for row in rows {
            let aid: String = row.get("id");
            act_by_id.insert(
                aid.clone(),
                ActivityBrief {
                    id: aid,
                    name: row.get("name"),
                    color: row.get("color"),
                    category: row.get("category"),
                    is_archived: row.get::<i64, _>("is_archived") != 0,
                },
            );
        }
    }

    let valid_ids: Vec<String> = unique_ids
        .iter()
        .filter(|id| act_by_id.contains_key(*id))
        .cloned()
        .collect();
    let slices = if valid_ids.is_empty() {
        Vec::new()
    } else {
        fetch_completed_slices(pool, user, start_day, end_day, Some(&valid_ids), None).await?
    };

    let mut per_act_daily: HashMap<String, HashMap<NaiveDate, i64>> = HashMap::new();
    let mut per_act_daily_sess: HashMap<String, HashMap<NaiveDate, HashSet<String>>> =
        HashMap::new();
    let mut per_act_sessions: HashMap<String, HashSet<String>> = HashMap::new();

    for sl in &slices {
        let aid = &sl.session.activity.id;
        *per_act_daily
            .entry(aid.clone())
            .or_default()
            .entry(sl.local_date)
            .or_insert(0) += sl.seconds;
        per_act_daily_sess
            .entry(aid.clone())
            .or_default()
            .entry(sl.local_date)
            .or_default()
            .insert(sl.session.session_id.clone());
        per_act_sessions
            .entry(aid.clone())
            .or_default()
            .insert(sl.session.session_id.clone());
    }

    let mut series = Vec::new();
    for aid in &unique_ids {
        let Some(act) = act_by_id.get(aid) else {
            continue;
        };
        let mut daily_points = Vec::new();
        let mut total_secs = 0_i64;
        let mut cursor = start_day;
        while cursor <= end_day {
            let s = per_act_daily
                .get(aid)
                .and_then(|m| m.get(&cursor))
                .copied()
                .unwrap_or(0);
            let sc = per_act_daily_sess
                .get(aid)
                .and_then(|m| m.get(&cursor))
                .map(|set| set.len() as i64)
                .unwrap_or(0);
            total_secs += s;
            daily_points.push(DailySeriesPoint {
                date: format_date(cursor),
                total_seconds: s,
                session_count: sc,
            });
            cursor += Duration::days(1);
        }
        series.push(ActivityComparisonSeries {
            activity: act.clone(),
            total_seconds: total_secs,
            session_count: per_act_sessions
                .get(aid)
                .map(|s| s.len() as i64)
                .unwrap_or(0),
            daily: daily_points,
        });
    }

    Ok(AnalyticsCompareOut {
        start_date: format_date(start_day),
        end_date: format_date(end_day),
        series,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{init_pool_from_url, seed_catalog_if_empty};
    use crate::models::ManualSessionCreate;
    use crate::services::{activity_service, session_service, user_service};

    #[test]
    fn intensity_thresholds_work_as_expected() {
        let t = [1800, 7200, 14400];
        assert_eq!(compute_intensity(0, t), 0);
        assert_eq!(compute_intensity(1799, t), 1);
        assert_eq!(compute_intensity(1800, t), 2);
        assert_eq!(compute_intensity(7200, t), 3);
        assert_eq!(compute_intensity(14400, t), 4);
    }

    #[tokio::test]
    async fn midnight_split_allocates_seconds_to_each_local_day_and_summary() {
        let pool = init_pool_from_url("sqlite::memory:").await.unwrap();
        seed_catalog_if_empty(&pool).await.unwrap();
        let user = user_service::get_default_user(&pool).await.unwrap();
        let activities = activity_service::list_activities(&pool, &user, true, None)
            .await
            .unwrap();
        let act_id = activities[0].id.clone();

        // 2026-10-10 23:30:00 America/Mexico_City (-06:00) -> 2026-10-11 05:30:00Z
        // Ends 2026-10-11 00:30:00 America/Mexico_City -> 2026-10-11 06:30:00Z (3600s total: 1800s Oct 10 + 1800s Oct 11)
        session_service::create_manual_session(
            &pool,
            &user,
            ManualSessionCreate {
                activity_id: act_id.clone(),
                project_id: None,
                started_at: "2026-10-11T05:30:00Z".to_string(),
                ended_at: Some("2026-10-11T06:30:00Z".to_string()),
                duration_seconds: None,
                description: Some("Midnight test".to_string()),
            },
        )
        .await
        .unwrap();

        let oct10 = get_day_detail(&pool, &user, "2026-10-10", None, None)
            .await
            .unwrap();
        assert_eq!(oct10.total_seconds, 1800);
        assert_eq!(oct10.sessions.len(), 1);
        assert!(oct10.sessions[0].crosses_midnight);

        let oct11 = get_day_detail(&pool, &user, "2026-10-11", None, None)
            .await
            .unwrap();
        assert_eq!(oct11.total_seconds, 1800);
        assert_eq!(oct11.sessions.len(), 1);
        assert!(oct11.sessions[0].crosses_midnight);

        let contrib = get_contributions(&pool, &user, Some(2026), None, None)
            .await
            .unwrap();
        assert_eq!(contrib.summary.total_seconds, 3600);
        assert_eq!(contrib.summary.active_days, 2);
        assert_eq!(contrib.summary.total_sessions, 1);

        let summary = get_analytics_summary(
            &pool,
            &user,
            "custom",
            Some("2026-10-10"),
            Some("2026-10-11"),
            None,
            None,
        )
        .await
        .unwrap();
        assert_eq!(summary.total_seconds, 3600);
        assert_eq!(summary.total_sessions, 1);
        assert_eq!(summary.active_days, 2);
        assert_eq!(summary.daily_activity.len(), 2);

        let cmp = get_activity_comparison(
            &pool,
            &user,
            &[act_id],
            "custom",
            Some("2026-10-10"),
            Some("2026-10-11"),
        )
        .await
        .unwrap();
        assert_eq!(cmp.series.len(), 1);
        assert_eq!(cmp.series[0].total_seconds, 3600);
    }
}
