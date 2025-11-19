use serde::{Deserialize, Serialize};
use sysinfo::System;

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
pub fn get_processes() -> Result<Vec<ProcessInfo>, String> {
    let mut sys = System::new();
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

#[cfg(debug_assertions)]
#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    let is_open = window.is_devtools_open();
    if is_open {
        window.close_devtools();
        println!("Devtools closed");
    } else {
        window.open_devtools();
        println!("Devtools opened");
    }
    Ok(())
}
