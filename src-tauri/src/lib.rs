mod commands;
mod constants;
use commands::*;
use constants::*;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use tauri::Emitter;
use user_idle::UserIdle;
use tokio::time::{interval, Duration};

fn create_tray(app: &tauri::AppHandle) {
    // Create menu
    let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>).unwrap();
    let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>).unwrap();
    let menu = Menu::with_items(app, &[&show_i, &quit_i]).unwrap();

    // Create tray
    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| {
             match event.id.as_ref() {
                 "show" => {
                     if let Some(window) = app.get_webview_window("main") {
                         let _ = window.unminimize();
                         let _ = window.show();
                         let _ = window.set_focus();
                     } else {
                     }
                 }
                 "quit" => {
                     app.exit(0);
                 }
                 _ => {
                 }
             }
         })
        .build(app).unwrap();

    // Store tray
    app.manage(tray);
}

#[derive(Clone, serde::Serialize)]
struct Payload {
    args: Vec<String>,
    cwd: String,
}

// Idle monitoring state
#[derive(Clone)]
struct IdleMonitorState {
    last_idle_state: bool,
    session_start: std::time::Instant,
}

impl IdleMonitorState {
    fn new() -> Self {
        Self {
            last_idle_state: false,
            session_start: std::time::Instant::now(),
        }
    }
}

// Background idle monitoring task
async fn start_idle_monitor(app: tauri::AppHandle) {
    let mut interval = interval(Duration::from_secs(IDLE_MONITOR_INTERVAL_SECONDS)); // Check every 5 seconds
    let mut idle_state = IdleMonitorState::new();
    
    println!("Starting idle monitor background task...");
    
    loop {
        interval.tick().await;
        
        // Check if feature flag is enabled
        // For now, we'll assume it's enabled by default
        // TODO: Implement proper feature flag checking
        
        match UserIdle::get_time() {
            Ok(idle_time) => {
                let idle_seconds = idle_time.as_seconds();
                let is_idle = idle_seconds >= IDLE_THRESHOLD_SECONDS; // Configurable threshold
                
                // Only emit event if state changed
                if is_idle != idle_state.last_idle_state {
                    let activity_state = if is_idle { "became_idle" } else { "became_active" };
                    
                    let payload = serde_json::json!({
                        "is_idle": is_idle,
                        "idle_time_seconds": idle_seconds,
                        "activity_state": activity_state,
                        "timestamp": chrono::Utc::now().to_rfc3339(),
                        "session_duration_seconds": idle_state.session_start.elapsed().as_secs()
                    });
                    
                    let _ = app.emit("idle-status-changed", payload);
                    println!("Idle state changed: {} at {} seconds idle", activity_state, idle_seconds);
                    
                    idle_state.last_idle_state = is_idle;
                    
                    // Reset session start when becoming active again
                    if !is_idle {
                        idle_state.session_start = std::time::Instant::now();
                    }
                }
                
                // Always emit periodic status updates for debugging
                let debug_payload = serde_json::json!({
                    "is_idle": is_idle,
                    "idle_time_seconds": idle_seconds,
                    "last_update": chrono::Utc::now().to_rfc3339(),
                    "session_duration_seconds": idle_state.session_start.elapsed().as_secs()
                });
                
                let _ = app.emit("idle-status-update", debug_payload);
            }
            Err(e) => {
                println!("Error getting idle time: {}", e);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Focus the existing window when another instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            app.emit("single-instance", Payload { args: argv, cwd }).unwrap();
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
             if cfg!(debug_assertions) {
                 app.handle().plugin(
                     tauri_plugin_log::Builder::default()
                         .level(log::LevelFilter::Info)
                         .build(),
                 )?;
             }

             // Create tray
             create_tray(&app.handle());
             
             // Start background idle monitor
             let app_handle = app.handle().clone();
             tauri::async_runtime::spawn(async move {
                 start_idle_monitor(app_handle).await;
             });

             Ok(())
         })
        .invoke_handler(tauri::generate_handler![greet, get_timer_state, stop_timer, get_processes, toggle_devtools, get_idle_status, get_idle_time, is_user_idle, create_activity_log, show_notification])
        .on_window_event(|_window, _event| {
            // Close is handled in frontend
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
