use crate::constants::*;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use user_idle::UserIdle;

#[derive(Serialize, Deserialize)]
pub struct TimerState {
    pub active: bool,
    pub title: Option<String>,
    pub elapsed_seconds: Option<u64>,
}

#[derive(Serialize, Deserialize)]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub memory_usage: u64,
}

#[derive(Serialize, Deserialize)]
pub struct IdleStatus {
    pub is_idle: bool,
    pub idle_time_seconds: u64,
    pub last_update: String,
    pub session_start: String,
}

#[derive(Serialize, Deserialize)]
pub struct ActivityLog {
    pub timestamp: String,
    pub idle_time_seconds: u64,
    pub is_idle: bool,
    pub session_duration_seconds: u64,
    pub activity_state: String,
}

#[derive(Serialize, Deserialize)]
pub struct NotificationData {
    pub title: String,
    pub body: String,
    pub notification_type: String,
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

#[tauri::command]
pub fn show_notification(app: tauri::AppHandle, title: String, body: String, notification_type: String) -> Result<(), String> {
    // Show native notification using Tauri's notification API
    use tauri_plugin_notification::NotificationExt;
    
    // Map notification types to appropriate titles
    let title_suffix = match notification_type.as_str() {
        "ERROR" | "CRITICAL" => "Error",
        "WARNING" => "Warning", 
        "SUCCESS" => "Success",
        "INFO" => "Info",
        _ => "Notification",
    };
    
    let full_title = format!("Time Tracker - {}", title_suffix);
    
    app.notification()
        .builder()
        .title(&full_title)
        .body(&body)
        .show()
        .map_err(|e| format!("Failed to show notification: {}", e))?;
    
    println!("Notification shown: {} - {}", full_title, body);
    Ok(())
}

#[tauri::command]
pub fn get_idle_status() -> Result<IdleStatus, String> {
    match UserIdle::get_time() {
        Ok(idle_time) => {
            let idle_seconds = idle_time.as_seconds();
            let is_idle = idle_seconds >= IDLE_THRESHOLD_SECONDS; // Using constant
            
            Ok(IdleStatus {
                is_idle,
                idle_time_seconds: idle_seconds,
                last_update: chrono::Utc::now().to_rfc3339(),
                session_start: chrono::Utc::now().to_rfc3339(), // TODO: Track actual session start
            })
        }
        Err(e) => Err(format!("Failed to get idle status: {}", e)),
    }
}

#[tauri::command]
pub fn get_idle_time() -> Result<u64, String> {
    match UserIdle::get_time() {
        Ok(idle_time) => Ok(idle_time.as_seconds()),
        Err(e) => Err(format!("Failed to get idle time: {}", e)),
    }
}

#[tauri::command]
pub fn is_user_idle() -> Result<bool, String> {
    match UserIdle::get_time() {
        Ok(idle_time) => Ok(idle_time.as_seconds() >= IDLE_THRESHOLD_SECONDS), // Using constant
        Err(e) => Err(format!("Failed to check idle status: {}", e)),
    }
}

#[tauri::command]
pub fn create_activity_log(idle_time_seconds: u64, is_idle: bool) -> Result<ActivityLog, String> {
    Ok(ActivityLog {
        timestamp: chrono::Utc::now().to_rfc3339(),
        idle_time_seconds,
        is_idle,
        session_duration_seconds: idle_time_seconds, // Simplified for now
        activity_state: if is_idle { "idle".to_string() } else { "active".to_string() },
    })
}

#[tauri::command]
pub fn get_processes() -> Result<Vec<ProcessInfo>, String> {
    let mut sys = sysinfo::System::new();
    sys.refresh_processes();

    let mut processes: Vec<ProcessInfo> = Vec::new();

    for (pid, process) in sys.processes() {
        processes.push(ProcessInfo {
            pid: pid.as_u32(),
            name: process.name().to_string(),
            cpu_usage: process.cpu_usage(),
            memory_usage: process.memory(),
        });
    }

    // Sort by CPU usage descending
    processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));

    Ok(processes)
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::Window) -> Result<(), String> {
    // Emit an event the webview can listen for and perform the actual
    // opening on the renderer side. Renderer has a fallback to dispatch
    // an F12 key event if necessary.
    let _ = window.emit("open-devtools", ());
    println!("toggle_devtools: emitted open-devtools event");
    Ok(())
}
