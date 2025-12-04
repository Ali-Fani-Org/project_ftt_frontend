//! Notification manager module for handling notification channels and sounds
//! 
//! This module provides functionality to create and manage notification channels
//! with proper sound properties for different notification types.

use tauri::{AppHandle, Emitter};
use serde::{Deserialize, Serialize};

/// Notification channel importance levels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NotificationImportance {
    Min,
    Low,
    Default,
    High,
    Max,
}

/// Notification channel configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NotificationChannelConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub importance: NotificationImportance,
    pub sound_name: String,
}

/// Notification manager for handling channel creation and management
#[derive(Clone)]
pub struct NotificationManager {
    channels_created: bool,
}

impl NotificationManager {
    /// Create a new NotificationManager instance
    pub fn new() -> Self {
        Self {
            channels_created: false,
        }
    }

    /// Initialize notification channels for the application
    pub async fn initialize_channels(&mut self, app: &AppHandle) -> Result<(), String> {
        if self.channels_created {
            println!("Notification channels already created, skipping initialization");
            return Ok(());
        }

        println!("Initializing notification channels...");

        // Define notification channels for different types
        let channels = vec![
            NotificationChannelConfig {
                id: "time_tracker_info".to_string(),
                name: "Time Tracker - Info".to_string(),
                description: "Informational notifications from Time Tracker".to_string(),
                importance: NotificationImportance::Default,
                sound_name: "notification_sound".to_string(),
            },
            NotificationChannelConfig {
                id: "time_tracker_warning".to_string(),
                name: "Time Tracker - Warning".to_string(),
                description: "Warning notifications from Time Tracker".to_string(),
                importance: NotificationImportance::High,
                sound_name: "notification_sound".to_string(),
            },
            NotificationChannelConfig {
                id: "time_tracker_error".to_string(),
                name: "Time Tracker - Error".to_string(),
                description: "Error notifications from Time Tracker".to_string(),
                importance: NotificationImportance::Max,
                sound_name: "notification_sound".to_string(),
            },
            NotificationChannelConfig {
                id: "time_tracker_success".to_string(),
                name: "Time Tracker - Success".to_string(),
                description: "Success notifications from Time Tracker".to_string(),
                importance: NotificationImportance::Default,
                sound_name: "notification_sound".to_string(),
            },
            NotificationChannelConfig {
                id: "time_tracker_critical".to_string(),
                name: "Time Tracker - Critical".to_string(),
                description: "Critical notifications from Time Tracker".to_string(),
                importance: NotificationImportance::Max,
                sound_name: "notification_sound".to_string(),
            },
        ];

        // Create each channel
        for channel in channels {
            if let Err(e) = self.create_channel(app, &channel).await {
                println!("Warning: Failed to create channel {}: {}", channel.id, e);
                // Continue with other channels even if one fails
            }
        }

        self.channels_created = true;
        println!("Notification channel initialization completed");
        Ok(())
    }

    /// Create a single notification channel
    async fn create_channel(
        &self, 
        app: &AppHandle, 
        config: &NotificationChannelConfig
    ) -> Result<(), String> {
        use tauri_plugin_notification::NotificationExt;

        // Map importance enum to i32 for Android
        let importance_value = match config.importance {
            NotificationImportance::Min => 1,
            NotificationImportance::Low => 2,
            NotificationImportance::Default => 3,
            NotificationImportance::High => 4,
            NotificationImportance::Max => 5,
        };

        println!(
            "Creating notification channel: {} ({} - {})",
            config.id, config.name, config.description
        );

        // Create the channel using the notification plugin
        // Note: This is a simplified version as Tauri v2's notification API
        // doesn't directly expose channel creation in Rust yet
        // In practice, channels would be created from the frontend
        
        // For now, we'll just emit an event that the frontend can listen for
        // to create the channels using the JavaScript API
        let channel_data = serde_json::json!({
            "id": config.id,
            "name": config.name,
            "description": config.description,
            "importance": importance_value,
            "sound": config.sound_name,
            "vibration": true,
            "lights": true,
            "lightColor": "#00FF00"
        });

        app.emit("create-notification-channel", channel_data)
            .map_err(|e| format!("Failed to emit channel creation event: {}", e))?;

        println!("✅ Channel creation event emitted for: {}", config.id);
        Ok(())
    }

    /// Get the appropriate channel ID for a notification type
    pub fn get_channel_id(&self, notification_type: &str) -> String {
        match notification_type.to_uppercase().as_str() {
            "ERROR" | "CRITICAL" => "time_tracker_error".to_string(),
            "WARNING" => "time_tracker_warning".to_string(),
            "SUCCESS" => "time_tracker_success".to_string(),
            "INFO" => "time_tracker_info".to_string(),
            _ => "time_tracker_info".to_string(), // Default fallback
        }
    }

    /// Check if channels have been initialized
    pub fn is_initialized(&self) -> bool {
        self.channels_created
    }
}

impl Default for NotificationManager {
    fn default() -> Self {
        Self::new()
    }
}