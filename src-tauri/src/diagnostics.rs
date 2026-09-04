use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Manager};
use time::{macros::format_description, Date, Duration, OffsetDateTime};

const LOG_PREFIX: &str = "ai-usage-meter-";
const LOG_SUFFIX: &str = ".log";
const RETENTION_DAYS: i64 = 14;
pub const MAX_LOG_READ_BYTES: usize = 512 * 1024;

#[derive(Debug, Deserialize)]
pub struct FrontendDiagnostic {
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

pub struct NativeDiagnostics {
    directory: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticLogFile {
    pub date: String,
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticLogList {
    pub directory: String,
    pub files: Vec<DiagnosticLogFile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticLogContent {
    pub filename: String,
    pub content: String,
    pub truncated: bool,
}

impl NativeDiagnostics {
    fn for_directory(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub fn install(app: &mut App) {
        let directory = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir().join("ai-usage-meter"))
            .join("logs");
        let diagnostics = Self::for_directory(directory);
        let today = local_now().date();
        let _ = prune_old_logs(&diagnostics.directory, today);
        diagnostics.begin_launch_at(today, env!("CARGO_PKG_VERSION"), std::process::id());
        app.manage(diagnostics);
    }

    fn begin_launch_at(&self, date: Date, version: &str, pid: u32) {
        self.record_at(
            date,
            "INFO",
            "native",
            &format!("Application launch started. version={version} pid={pid}"),
        );
    }

    fn record_at(&self, date: Date, level: &str, component: &str, message: &str) {
        let _ = fs::create_dir_all(&self.directory);
        let path = self.directory.join(daily_filename(date));
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis().to_string())
            .unwrap_or_else(|_| "unknown".to_string());
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{timestamp} [{level}] [{component}] {message}");
        }
    }

    pub fn record(&self, level: &str, component: &str, message: &str) {
        self.record_at(local_now().date(), level, component, message);
    }
}

fn local_now() -> OffsetDateTime {
    OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc())
}

fn daily_filename(date: Date) -> String {
    format!(
        "{LOG_PREFIX}{:04}-{:02}-{:02}{LOG_SUFFIX}",
        date.year(),
        u8::from(date.month()),
        date.day()
    )
}

fn parse_daily_date(filename: &str) -> Option<Date> {
    let date_text = filename
        .strip_prefix(LOG_PREFIX)?
        .strip_suffix(LOG_SUFFIX)?;
    if filename.len() != LOG_PREFIX.len() + 10 + LOG_SUFFIX.len() {
        return None;
    }
    Date::parse(date_text, &format_description!("[year]-[month]-[day]")).ok()
}

fn is_valid_daily_filename(filename: &str) -> bool {
    parse_daily_date(filename).is_some()
}

fn prune_old_logs(directory: &Path, today: Date) -> std::io::Result<()> {
    fs::create_dir_all(directory)?;
    let oldest_retained = today - Duration::days(RETENTION_DAYS - 1);
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let filename = entry.file_name().to_string_lossy().into_owned();
        if parse_daily_date(&filename).is_some_and(|date| date < oldest_retained) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn read_log_from_directory(
    directory: &Path,
    filename: &str,
) -> Result<DiagnosticLogContent, String> {
    if !is_valid_daily_filename(filename) {
        return Err("The requested diagnostic log filename is invalid.".to_string());
    }
    let path = directory.join(filename);
    let mut file = File::open(&path).map_err(|error| error.to_string())?;
    let length = file.metadata().map_err(|error| error.to_string())?.len();
    let truncated = length > MAX_LOG_READ_BYTES as u64;
    if truncated {
        file.seek(SeekFrom::End(-(MAX_LOG_READ_BYTES as i64)))
            .map_err(|error| error.to_string())?;
    }
    let mut bytes = Vec::with_capacity(length.min(MAX_LOG_READ_BYTES as u64) as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    Ok(DiagnosticLogContent {
        filename: filename.to_string(),
        content: String::from_utf8_lossy(&bytes).into_owned(),
        truncated,
    })
}

pub fn list_logs(app: &AppHandle) -> Result<DiagnosticLogList, String> {
    let diagnostics = app
        .try_state::<NativeDiagnostics>()
        .ok_or_else(|| "Diagnostics are not available.".to_string())?;
    prune_old_logs(&diagnostics.directory, local_now().date())
        .map_err(|error| error.to_string())?;
    let mut files = Vec::new();
    for entry in fs::read_dir(&diagnostics.directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let filename = entry.file_name().to_string_lossy().into_owned();
        let Some(date) = parse_daily_date(&filename) else {
            continue;
        };
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        if !metadata.is_file() {
            continue;
        }
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .map(|value| value.as_millis().to_string())
            .unwrap_or_else(|| "unknown".to_string());
        files.push(DiagnosticLogFile {
            date: date.to_string(),
            filename,
            size_bytes: metadata.len(),
            modified_at,
        });
    }
    files.sort_by(|left, right| right.filename.cmp(&left.filename));
    Ok(DiagnosticLogList {
        directory: diagnostics.directory.to_string_lossy().into_owned(),
        files,
    })
}

pub fn read_log(app: &AppHandle, filename: &str) -> Result<DiagnosticLogContent, String> {
    let diagnostics = app
        .try_state::<NativeDiagnostics>()
        .ok_or_else(|| "Diagnostics are not available.".to_string())?;
    read_log_from_directory(&diagnostics.directory, filename)
}

pub fn record_native(app: &AppHandle, level: &str, message: &str) {
    if let Some(diagnostics) = app.try_state::<NativeDiagnostics>() {
        diagnostics.record(level, "native", message);
    }
}

pub fn record_frontend(app: &AppHandle, entry: FrontendDiagnostic) {
    if let Some(diagnostics) = app.try_state::<NativeDiagnostics>() {
        diagnostics.record(
            &entry.level,
            "frontend",
            &format!("{} | {}", entry.timestamp, entry.message),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};
    use time::{Date, Month};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("ai-usage-meter-{label}-{nonce}"));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn date(year: i32, month: Month, day: u8) -> Date {
        Date::from_calendar_date(year, month, day).unwrap()
    }

    #[test]
    fn writes_versioned_launch_event_to_the_daily_file() {
        let fixture = TestDirectory::new("daily-launch");
        let diagnostics = NativeDiagnostics::for_directory(fixture.path().to_path_buf());

        diagnostics.begin_launch_at(date(2026, Month::September, 4), "0.1.4", 42);

        let content =
            fs::read_to_string(fixture.path().join("ai-usage-meter-2026-09-04.log")).unwrap();
        assert!(content.contains("version=0.1.4"));
        assert!(content.contains("pid=42"));
    }

    #[test]
    fn prunes_only_daily_logs_older_than_fourteen_calendar_days() {
        let fixture = TestDirectory::new("retention");
        for filename in [
            "ai-usage-meter-2026-08-21.log",
            "ai-usage-meter-2026-08-22.log",
            "ai-usage-meter-2026-09-04.log",
            "startup-diagnostics.log",
            "notes.txt",
        ] {
            fs::write(fixture.path().join(filename), filename).unwrap();
        }

        prune_old_logs(fixture.path(), date(2026, Month::September, 4)).unwrap();

        assert!(!fixture
            .path()
            .join("ai-usage-meter-2026-08-21.log")
            .exists());
        assert!(fixture
            .path()
            .join("ai-usage-meter-2026-08-22.log")
            .exists());
        assert!(fixture
            .path()
            .join("ai-usage-meter-2026-09-04.log")
            .exists());
        assert!(fixture.path().join("startup-diagnostics.log").exists());
        assert!(fixture.path().join("notes.txt").exists());
    }

    #[test]
    fn accepts_only_exact_daily_log_filenames() {
        assert!(is_valid_daily_filename("ai-usage-meter-2026-09-04.log"));
        assert!(!is_valid_daily_filename("../settings.json"));
        assert!(!is_valid_daily_filename("C:\\settings.json"));
        assert!(!is_valid_daily_filename("startup-diagnostics.log"));
        assert!(!is_valid_daily_filename("ai-usage-meter-2026-99-99.log"));
    }

    #[test]
    fn reads_only_the_newest_512_kib() {
        let fixture = TestDirectory::new("bounded-read");
        let filename = "ai-usage-meter-2026-09-04.log";
        let mut content = vec![b'a'; MAX_LOG_READ_BYTES + 64];
        content[MAX_LOG_READ_BYTES + 63] = b'z';
        fs::write(fixture.path().join(filename), content).unwrap();

        let result = read_log_from_directory(fixture.path(), filename).unwrap();

        assert_eq!(result.content.len(), MAX_LOG_READ_BYTES);
        assert!(result.content.ends_with('z'));
        assert!(result.truncated);
    }
}
