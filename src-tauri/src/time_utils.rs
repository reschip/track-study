use std::cmp::Ordering;

use chrono::{DateTime, Datelike, Duration, LocalResult, NaiveDate, NaiveTime, TimeZone, Utc};
use chrono_tz::Tz;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DaySlice {
    pub local_date: NaiveDate,
    pub start_utc: DateTime<Utc>,
    pub end_utc: DateTime<Utc>,
    pub seconds: i64,
}

pub fn parse_tz(tz_name: &str) -> AppResult<Tz> {
    tz_name
        .parse::<Tz>()
        .map_err(|_| AppError::unprocessable(format!("Invalid timezone: {tz_name}"), "invalid_timezone"))
}

pub fn parse_utc(iso: &str) -> AppResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(iso)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|_| AppError::unprocessable(format!("Invalid timestamp: {iso}"), "invalid_timestamp"))
}

pub fn parse_date(date_str: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
        .map_err(|_| AppError::unprocessable(format!("Invalid date: {date_str}"), "invalid_date"))
}

pub fn format_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn local_date_of(dt_utc: DateTime<Utc>, tz_name: &str) -> AppResult<NaiveDate> {
    let tz = parse_tz(tz_name)?;
    Ok(dt_utc.with_timezone(&tz).date_naive())
}

fn resolve_local_midnight(day: NaiveDate, tz: Tz) -> DateTime<Utc> {
    let midnight = NaiveTime::from_hms_opt(0, 0, 0).unwrap();
    let naive = day.and_time(midnight);
    match tz.from_local_datetime(&naive) {
        LocalResult::Single(dt) => dt.with_timezone(&Utc),
        LocalResult::Ambiguous(early, _) => early.with_timezone(&Utc),
        LocalResult::None => {
            // DST gap at midnight (e.g. America/Sao_Paulo): pick 01:00 local time
            let one_am = NaiveTime::from_hms_opt(1, 0, 0).unwrap();
            match tz.from_local_datetime(&day.and_time(one_am)) {
                LocalResult::Single(dt) | LocalResult::Ambiguous(dt, _) => dt.with_timezone(&Utc),
                LocalResult::None => DateTime::from_naive_utc_and_offset(naive, Utc),
            }
        }
    }
}

pub fn local_day_bounds_utc(local_day: NaiveDate, tz_name: &str) -> AppResult<(DateTime<Utc>, DateTime<Utc>)> {
    let tz = parse_tz(tz_name)?;
    let start = resolve_local_midnight(local_day, tz);
    let end = resolve_local_midnight(local_day + Duration::days(1), tz);
    Ok((start, end))
}

pub fn local_range_bounds_utc(
    start_day: NaiveDate,
    end_day: NaiveDate,
    tz_name: &str,
) -> AppResult<(DateTime<Utc>, DateTime<Utc>)> {
    if end_day < start_day {
        return Err(AppError::unprocessable(
            "end_date cannot be earlier than start_date",
            "invalid_date_range",
        ));
    }
    let (start, _) = local_day_bounds_utc(start_day, tz_name)?;
    let (_, end) = local_day_bounds_utc(end_day, tz_name)?;
    Ok((start, end))
}

/// Split a UTC interval [start_utc, end_utc) along local midnight boundaries in `tz_name`.
/// Guarantees `sum(slice.seconds) == round((end_utc - start_utc).total_seconds())`.
pub fn split_interval_by_local_day(
    start_utc: DateTime<Utc>,
    end_utc: DateTime<Utc>,
    tz_name: &str,
) -> AppResult<Vec<DaySlice>> {
    if end_utc <= start_utc {
        return Ok(Vec::new());
    }

    let tz = parse_tz(tz_name)?;
    let total_ms = (end_utc - start_utc).num_milliseconds();
    let total_seconds = ((total_ms as f64) / 1000.0).round().max(0.0) as i64;

    let mut raw_slices: Vec<(NaiveDate, DateTime<Utc>, DateTime<Utc>, f64)> = Vec::new();
    let mut cur = start_utc;

    while cur < end_utc {
        let local_day = cur.with_timezone(&tz).date_naive();
        let mut next_midnight_utc = resolve_local_midnight(local_day + Duration::days(1), tz);
        if next_midnight_utc <= cur {
            let one_am = NaiveTime::from_hms_opt(1, 0, 0).unwrap();
            let dt = (local_day + Duration::days(1)).and_time(one_am);
            next_midnight_utc = tz
                .from_local_datetime(&dt)
                .earliest()
                .map(|d| d.with_timezone(&Utc))
                .unwrap_or_else(|| cur + Duration::hours(24));
        }
        let slice_end = end_utc.min(next_midnight_utc);
        let raw_secs = (slice_end - cur).num_milliseconds() as f64 / 1000.0;
        raw_slices.push((local_day, cur, slice_end, raw_secs));
        cur = slice_end;
    }

    if raw_slices.len() == 1 {
        let (d, s, e, _) = raw_slices[0];
        return Ok(vec![DaySlice {
            local_date: d,
            start_utc: s,
            end_utc: e,
            seconds: total_seconds,
        }]);
    }

    let mut floors: Vec<i64> = raw_slices.iter().map(|item| item.3.floor() as i64).collect();
    let sum_floors: i64 = floors.iter().sum();
    let remainder = total_seconds - sum_floors;

    if remainder > 0 {
        let mut idxs: Vec<usize> = (0..raw_slices.len()).collect();
        idxs.sort_by(|&a, &b| {
            let fa = raw_slices[a].3 - floors[a] as f64;
            let fb = raw_slices[b].3 - floors[b] as f64;
            fb.partial_cmp(&fa).unwrap_or(Ordering::Equal)
        });
        for &idx in idxs.iter().take(remainder as usize) {
            floors[idx] += 1;
        }
    } else if remainder < 0 {
        let mut idxs: Vec<usize> = (0..raw_slices.len()).collect();
        idxs.sort_by(|&a, &b| {
            let fa = raw_slices[a].3 - floors[a] as f64;
            let fb = raw_slices[b].3 - floors[b] as f64;
            fa.partial_cmp(&fb).unwrap_or(Ordering::Equal)
        });
        for &idx in idxs.iter().take((-remainder) as usize) {
            if floors[idx] > 0 {
                floors[idx] -= 1;
            }
        }
    }

    Ok(raw_slices
        .into_iter()
        .zip(floors)
        .map(|((d, s, e, _), sec)| DaySlice {
            local_date: d,
            start_utc: s,
            end_utc: e,
            seconds: sec,
        })
        .collect())
}

pub fn compute_period_dates(
    period: &str,
    tz_name: &str,
    week_start_day: &str,
    custom_start: Option<NaiveDate>,
    custom_end: Option<NaiveDate>,
    reference_now: Option<DateTime<Utc>>,
) -> AppResult<(NaiveDate, NaiveDate)> {
    let tz = parse_tz(tz_name)?;
    let now_utc = reference_now.unwrap_or_else(Utc::now);
    let today = now_utc.with_timezone(&tz).date_naive();

    match period {
        "today" => Ok((today, today)),
        "this_week" => {
            let start_weekday: i64 = if week_start_day == "sunday" { 6 } else { 0 };
            let cur_weekday = today.weekday().num_days_from_monday() as i64;
            let offset = (cur_weekday - start_weekday).rem_euclid(7);
            Ok((today - Duration::days(offset), today))
        }
        "last_7_days" => Ok((today - Duration::days(6), today)),
        "last_30_days" => Ok((today - Duration::days(29), today)),
        "this_month" => {
            let start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
            Ok((start, today))
        }
        "this_year" => {
            let start = NaiveDate::from_ymd_opt(today.year(), 1, 1).unwrap();
            Ok((start, today))
        }
        "custom" => {
            let (Some(cs), Some(ce)) = (custom_start, custom_end) else {
                return Err(AppError::unprocessable(
                    "start_date and end_date are required for custom period",
                    "missing_custom_dates",
                ));
            };
            if ce < cs {
                return Err(AppError::unprocessable(
                    "end_date cannot be earlier than start_date",
                    "invalid_date_range",
                ));
            }
            Ok((cs, ce))
        }
        _ => Err(AppError::unprocessable(
            format!("Unsupported period: {period}"),
            "invalid_period",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_midnight_in_mexico_city_preserving_total_seconds() {
        // 2026-11-13 23:30 America/Mexico_City (UTC-6) -> 2026-11-14 05:30Z
        // to 2026-11-14 01:00 America/Mexico_City -> 2026-11-14 07:00Z
        let start = parse_utc("2026-11-14T05:30:00Z").unwrap();
        let end = parse_utc("2026-11-14T07:00:00Z").unwrap();
        let slices = split_interval_by_local_day(start, end, "America/Mexico_City").unwrap();

        assert_eq!(slices.len(), 2);
        assert_eq!(slices[0].local_date, NaiveDate::from_ymd_opt(2026, 11, 13).unwrap());
        assert_eq!(slices[0].seconds, 1800);
        assert_eq!(slices[1].local_date, NaiveDate::from_ymd_opt(2026, 11, 14).unwrap());
        assert_eq!(slices[1].seconds, 3600);
    }

    #[test]
    fn computes_week_start_for_monday_and_sunday() {
        // 2026-11-14 is Saturday; in UTC at noon
        let ref_now = parse_utc("2026-11-14T18:00:00Z").unwrap();
        let (s_mon, e_mon) =
            compute_period_dates("this_week", "UTC", "monday", None, None, Some(ref_now)).unwrap();
        assert_eq!(s_mon, NaiveDate::from_ymd_opt(2026, 11, 9).unwrap());
        assert_eq!(e_mon, NaiveDate::from_ymd_opt(2026, 11, 14).unwrap());

        let (s_sun, _) =
            compute_period_dates("this_week", "UTC", "sunday", None, None, Some(ref_now)).unwrap();
        assert_eq!(s_sun, NaiveDate::from_ymd_opt(2026, 11, 8).unwrap());
    }
}
