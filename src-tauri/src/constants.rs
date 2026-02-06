//! Application constants and configuration

/// Idle detection threshold in seconds
/// User is considered idle after this many seconds of inactivity
pub const IDLE_THRESHOLD_SECONDS: u64 = 3; // 2 minutes

/// Background monitoring interval in seconds
/// How often to check for idle status
pub const IDLE_MONITOR_INTERVAL_SECONDS: u64 = 10;

/// Maximum number of activity logs to keep in memory
#[allow(dead_code)]
pub const MAX_ACTIVITY_LOGS: usize = 100;
