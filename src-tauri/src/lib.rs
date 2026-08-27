mod commands;
mod notification_manager;
mod sound_manager;
use commands::*;

use notification_manager::NotificationManager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::Manager;

fn create_tray(app: &tauri::AppHandle) {
    // Create menu
    let show_i = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>).unwrap();
    let quit_i = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>).unwrap();
    let menu = Menu::with_items(app, &[&show_i, &quit_i]).unwrap();

    // Create tray
    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
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
            _ => {}
        })
        .build(app)
        .unwrap();

    // Store tray
    app.manage(tray);
}

#[derive(Clone, serde::Serialize)]
struct Payload {
    args: Vec<String>,
    cwd: String,
}

// Notification manager state
#[derive(Clone)]
struct NotificationManagerState {
    manager: NotificationManager,
}

impl NotificationManagerState {
    fn new() -> Self {
        Self {
            manager: NotificationManager::new(),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Serve app on localhost:8080 for WebAuthn compatibility (production builds only)
    #[cfg(not(dev))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(8080).build());
    }

    builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // Focus the existing window when another instance is launched
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            app.emit("single-instance", Payload { args: argv, cwd })
                .unwrap();
        }))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    ])
                    .build(),
            )?;


            // Create tray
            create_tray(&app.handle());

            // Initialize notification manager
            let notification_manager_state = NotificationManagerState::new();
            app.manage(notification_manager_state.clone());

            // Initialize notification channels
            let app_handle = app.handle().clone();
            let mut notification_manager = notification_manager_state.manager;
            tauri::async_runtime::spawn(async move {
                println!("🚀 Starting notification channel initialization...");
                if let Err(e) = notification_manager.initialize_channels(&app_handle).await {
                    println!(
                        "❌ Warning: Failed to initialize notification channels: {}",
                        e
                    );
                } else {
                    println!("✅ Notification channel initialization completed");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_timer_state,
            stop_timer,
            show_notification,
            show_notification_with_channel,
            test_notification_sound,
            debug_sound_system,
            debug_notification_system
        ])
        .on_window_event(|_window, _event| {
            // Close is handled in frontend
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
