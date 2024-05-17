#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("Parsing Error: {0}")]
    Parsing(String),
    #[error("{0}")]
    Other(String),
}

impl From<config::ConfigError> for Error {
    fn from(error: config::ConfigError) -> Self {
        Self::Parsing(error.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
