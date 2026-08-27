use crate::notification_manager::NotificationManager;
use crate::sound_manager::SoundManager;

use serde::{Deserialize, Serialize};
use tauri::Emitter;

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

#[tauri::command]
pub fn show_notification_with_channel(
    app: tauri::AppHandle,
    title: String,
    body: String,
    channel_id: String,
    _notification_type: String,
) -> Result<(), String> {
    // Show native notification using Tauri's notification API with channel support
    use tauri_plugin_notification::NotificationExt;

    println!(
        "🔧 Showing channel notification: {} - {} (channel: {})",
        title, body, channel_id
    );

    // Try to show notification using the notification plugin
    if let Err(e) = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
    {
        println!("❌ Channel notification failed: {}", e);
        return Err(format!("Failed to show channel notification: {}", e));
    }

    println!("✅ Channel notification shown successfully: {}", channel_id);
    Ok(())
}

#[tauri::command]
pub fn show_notification(
    app: tauri::AppHandle,
    _title: String,
    body: String,
    notification_type: String,
) -> Result<(), String> {
    // Show native notification using Tauri's notification API with channel support
    use tauri_plugin_notification::NotificationExt;

    // Create notification manager to get channel ID
    let notification_manager = NotificationManager::new();
    let channel_id = notification_manager.get_channel_id(&notification_type);

    // Map notification types to appropriate titles
    let title_suffix = match notification_type.as_str() {
        "ERROR" | "CRITICAL" => "Error",
        "WARNING" => "Warning",
        "SUCCESS" => "Success",
        "INFO" => "Info",
        _ => "Notification",
    };

    let full_title = format!("Time Tracker - {}", title_suffix);

    // Emit an event to the frontend to handle the notification with proper channel creation
    let notification_payload = serde_json::json!({
        "title": full_title,
        "body": body,
        "channelId": channel_id,
        "notificationType": notification_type
    });

    app.emit("show-notification-with-channel", notification_payload)
        .map_err(|e| format!("Failed to emit notification event: {}", e))?;

    println!(
        "Notification event emitted: {} - {} (channel: {})",
        full_title, body, channel_id
    );

    // Play notification sound
    if let Err(e) = play_notification_sound(&app, &notification_type) {
        println!("Warning: Failed to play notification sound: {}", e);
    }

    // Also try the old method as fallback for immediate display
    // This will work on systems that don't require channels
    if let Err(e) = app
        .notification()
        .builder()
        .title(&full_title)
        .body(&body)
        .show()
    {
        println!("Fallback notification failed: {}", e);
    } else {
        println!("✅ Fallback notification shown successfully");
    }

    Ok(())
}

/// Play notification sound based on notification type
fn play_notification_sound(app: &tauri::AppHandle, notification_type: &str) -> Result<(), String> {
    let mut sound_manager = SoundManager::new(app);

    // Initialize the sound manager
    if let Err(e) = sound_manager.initialize() {
        println!("Warning: Failed to initialize sound manager: {}", e);
        return Ok(()); // Continue without sound if initialization fails
    }

    // Play the notification sound
    sound_manager.play_notification_sound(notification_type);

    // Note: SoundManager is dropped here, but rodio should continue playing
    // the audio asynchronously through its internal threads

    Ok(())
}

#[tauri::command]
pub fn test_notification_sound(
    app: tauri::AppHandle,
    notification_type: String,
) -> Result<(), String> {
    println!("Testing notification sound for type: {}", notification_type);

    // Play the notification sound using the main function
    if let Err(e) = play_notification_sound(&app, &notification_type) {
        println!("Warning: Failed to play notification sound: {}", e);
    }

    println!(
        "Test completed for notification type: {}",
        notification_type
    );
    Ok(())
}

#[tauri::command]
pub fn debug_sound_system(app: tauri::AppHandle) -> Result<String, String> {
    println!("=== SOUND SYSTEM DEBUG ===");

    let mut sound_manager = SoundManager::new(&app);
    match sound_manager.initialize() {
        Ok(_) => println!("✅ SoundManager initialized"),
        Err(e) => println!("❌ SoundManager init failed: {}", e),
    }

    // Test each notification type
    let test_types = ["INFO", "WARNING", "ERROR", "SUCCESS", "CRITICAL", "OTHER"];
    let mut results = Vec::new();

    for notification_type in &test_types {
        println!("Testing sound for: {}", notification_type);
        sound_manager.play_notification_sound(notification_type);
        results.push(format!("Tested {}", notification_type));
    }

    Ok(format!(
        "Debug completed. Tested types: {}",
        results.join(", ")
    ))
}

#[tauri::command]
pub fn debug_notification_system(app: tauri::AppHandle) -> Result<String, String> {
    println!("=== 🔍 NOTIFICATION SYSTEM DEBUG ===");

    let notification_manager = NotificationManager::new();
    println!("📝 NotificationManager created");

    // Test channel ID mapping
    let test_types = ["INFO", "WARNING", "ERROR", "SUCCESS", "CRITICAL", "OTHER"];
    let mut results = Vec::new();

    for notification_type in &test_types {
        let channel_id = notification_manager.get_channel_id(notification_type);
        println!(
            "🔍 Type '{}' maps to channel: {}",
            notification_type, channel_id
        );
        results.push(format!("{} -> {}", notification_type, channel_id));
    }

    // Test notification emission
    println!("🧪 Testing notification emission...");
    let test_payload = serde_json::json!({
        "title": "Debug Test Notification",
        "body": "This is a test notification for debugging",
        "channelId": "time_tracker_info",
        "notificationType": "INFO"
    });

    if let Err(e) = app.emit("show-notification-with-channel", test_payload) {
        println!("❌ Failed to emit test notification: {}", e);
        return Err(format!("Failed to emit test notification: {}", e));
    } else {
        println!("✅ Test notification event emitted successfully");
    }

    Ok(format!(
        "Debug completed. Channel mappings: {}",
        results.join(", ")
    ))
}
