use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct TimerState {
    pub active: bool,
    pub title: Option<String>,
    pub elapsed_seconds: Option<u64>,
}

#[tauri::command]
pub fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}

#[tauri::command]
pub fn get_timer_state() -> TimerState {
    // TODO: Implement actual timer state retrieval
    // For now, return inactive
    TimerState {
        active: false,
        title: None,
        elapsed_seconds: None,
    }
}

#[tauri::command]
pub fn stop_timer() -> Result<(), String> {
    // TODO: Implement timer stopping
    // For now, just emit event to frontend
    Ok(())
}
