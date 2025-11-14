mod commands;
use commands::*;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use tauri::Emitter;


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

             Ok(())
         })
        .invoke_handler(tauri::generate_handler![greet, get_timer_state, stop_timer])
        .on_window_event(|_window, _event| {
            // Close is handled in frontend
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
