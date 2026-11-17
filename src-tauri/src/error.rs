use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("{message}")]
    Domain {
        status: u16,
        code: String,
        message: String,
    },

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Migration error: {0}")]
    Migration(#[from] sqlx::migrate::MigrateError),

    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
}

impl AppError {
    pub fn bad_request(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self::Domain {
            status: 400,
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::Domain {
            status: 404,
            code: "not_found".into(),
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self::Domain {
            status: 409,
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn unprocessable(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self::Domain {
            status: 422,
            code: code.into(),
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Domain {
            status: 500,
            code: "internal_error".into(),
            message: message.into(),
        }
    }

    pub fn status(&self) -> u16 {
        match self {
            Self::Domain { status, .. } => *status,
            Self::Database(_) | Self::Migration(_) | Self::Serde(_) => 500,
        }
    }

    pub fn code(&self) -> &str {
        match self {
            Self::Domain { code, .. } => code,
            Self::Database(_) => "database_error",
            Self::Migration(_) => "migration_error",
            Self::Serde(_) => "serialization_error",
        }
    }
}

#[derive(Serialize)]
struct SerializedAppError<'a> {
    message: String,
    code: &'a str,
    status: u16,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        SerializedAppError {
            message: self.to_string(),
            code: self.code(),
            status: self.status(),
        }
        .serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;
