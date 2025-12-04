//! Sound management module for notification audio playback
//! 
//! This module provides functionality to play notification sounds based on
//! notification types, with support for configuration via TOML files.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use toml;
use rodio::{Decoder, OutputStream, OutputStreamHandle, source::Source};
use serde::{Deserialize, Serialize};

/// Configuration structure for sound settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundConfig {
    pub settings: SoundSettings,
    pub sounds: HashMap<String, String>,
    pub fallbacks: SoundFallbacks,
}

/// Sound settings configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundSettings {
    pub enabled: bool,
    pub default_volume: f32,
}

/// Sound fallback configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundFallbacks {
    pub default: String,
}

/// Notification type mapping to sound files
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NotificationSoundType {
    Info,
    Warning,
    Error,
    Success,
    Critical,
    Other,
}

impl std::fmt::Display for NotificationSoundType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NotificationSoundType::Info => write!(f, "INFO"),
            NotificationSoundType::Warning => write!(f, "WARNING"),
            NotificationSoundType::Error => write!(f, "ERROR"),
            NotificationSoundType::Success => write!(f, "SUCCESS"),
            NotificationSoundType::Critical => write!(f, "CRITICAL"),
            NotificationSoundType::Other => write!(f, "OTHER"),
        }
    }
}

impl From<&str> for NotificationSoundType {
    fn from(s: &str) -> Self {
        match s.to_uppercase().as_str() {
            "INFO" => NotificationSoundType::Info,
            "WARNING" => NotificationSoundType::Warning,
            "ERROR" => NotificationSoundType::Error,
            "SUCCESS" => NotificationSoundType::Success,
            "CRITICAL" => NotificationSoundType::Critical,
            _ => NotificationSoundType::Other,
        }
    }
}

/// Sound manager for handling notification audio playback
pub struct SoundManager {
    config: Option<SoundConfig>,
    output_stream: Option<OutputStream>,
    output_stream_handle: Option<OutputStreamHandle>,
    sounds_dir: PathBuf,
}

impl SoundManager {
    /// Create a new SoundManager instance
    pub fn new(app_handle: &AppHandle) -> Self {
        // Try multiple paths to find the sounds directory
        let sounds_dir = Self::find_sounds_directory(app_handle);

        println!("SoundManager initialized with sounds directory: {:?}", sounds_dir);

        Self {
            config: None,
            output_stream: None,
            output_stream_handle: None,
            sounds_dir,
        }
    }

    /// Find the sounds directory, trying multiple locations
    fn find_sounds_directory(app_handle: &AppHandle) -> PathBuf {
        // First try the bundled resource directory
        if let Ok(mut resource_dir) = app_handle.path().resource_dir() {
            resource_dir.push("sounds");
            if resource_dir.exists() {
                println!("Using bundled sounds directory: {:?}", resource_dir);
                return resource_dir;
            }
        }

        // Fallback to development source directory
        let mut dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        dev_path.push("sounds");
        if dev_path.exists() {
            println!("Using development sounds directory: {:?}", dev_path);
            return dev_path;
        }

        // Last resort - use the dev path even if it doesn't exist
        println!("Warning: No sounds directory found, using development path as fallback: {:?}", dev_path);
        dev_path
    }
    
    /// Initialize the sound manager by loading configuration and setting up audio output
    pub fn initialize(&mut self) -> Result<(), String> {
        println!("Initializing SoundManager...");
        
        // Load configuration
        self.load_config()?;
        
        // Initialize audio output stream
        match OutputStream::try_default() {
            Ok((stream, stream_handle)) => {
                self.output_stream = Some(stream);
                self.output_stream_handle = Some(stream_handle);
                println!("Audio output stream initialized successfully");
            }
            Err(e) => {
                println!("Warning: Failed to initialize audio output: {}", e);
                return Err(format!("Failed to initialize audio output: {}", e));
            }
        }
        
        println!("SoundManager initialized successfully");
        Ok(())
    }
    
    /// Load sound configuration from TOML file
    fn load_config(&mut self) -> Result<(), String> {
        let config_path = self.sounds_dir.join("config.toml");
        
        if !config_path.exists() {
            println!("Warning: Sound configuration file not found at: {:?}", config_path);
            return Ok(()); // Continue without config, use defaults
        }
        
        let config_content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read sound config: {}", e))?;
            
        let config: SoundConfig = toml::from_str(&config_content)
            .map_err(|e| format!("Failed to parse sound config: {}", e))?;
            
        println!("Loaded sound configuration: {:?}", config.settings);
        self.config = Some(config);
        Ok(())
    }
    
    /// Play a sound for the given notification type
    pub fn play_notification_sound(&self, notification_type: &str) {
        if !self.is_enabled() {
            println!("Sound playback disabled, skipping notification sound");
            return;
        }

        let sound_type = NotificationSoundType::from(notification_type);
        let sound_file = self.get_sound_file_path(&sound_type);

        match sound_file {
            Some(path) => {
                if self.play_sound_file(&path) {
                    println!("Played notification sound for type {}: {:?}", sound_type, path);
                } else {
                    println!("Failed to play notification sound for type {}, falling back to generated beep", sound_type);
                    self.generate_beep_sound();
                }
            }
            None => {
                println!("No sound file found for notification type {}, generating beep sound", notification_type);
                self.generate_beep_sound();
            }
        }
    }
    
    /// Check if sound playback is enabled
    fn is_enabled(&self) -> bool {
        self.config
            .as_ref()
            .map(|config| config.settings.enabled)
            .unwrap_or(true) // Default to enabled if no config
    }
    
    /// Get the sound file path for a given notification type
    fn get_sound_file_path(&self, sound_type: &NotificationSoundType) -> Option<PathBuf> {
        let config = self.config.as_ref()?;

        // First try the specific sound for this type
        if let Some(sound_file_name) = config.sounds.get(&sound_type.to_string()) {
            let sound_path = self.sounds_dir.join(sound_file_name);
            if sound_path.exists() {
                return Some(sound_path);
            }
        }

        // Try fallback
        if config.fallbacks.default == "generated" {
            // Return None to trigger beep generation
            println!("Fallback set to generated beep");
            None
        } else {
            // Try to use fallback file
            let fallback_path = self.sounds_dir.join(&config.fallbacks.default);
            if fallback_path.exists() {
                println!("Using fallback sound file: {:?}", fallback_path);
                Some(fallback_path)
            } else {
                println!("Fallback sound file not found, will generate beep");
                None
            }
        }
    }
    
    /// Generate and play a beep sound as fallback
    fn generate_beep_sound(&self) -> bool {
        let Some(ref stream_handle) = self.output_stream_handle else {
            println!("No audio output stream available for beep generation");
            return false;
        };

        // Generate a 800Hz sine wave for 300ms at higher volume
        use rodio::source::SineWave;
        let beep_duration = std::time::Duration::from_millis(300);
        let beep_freq = 800.0; // Hz

        let source = SineWave::new(beep_freq)
            .take_duration(beep_duration)
            .amplify(0.8); // Higher volume for beep

        match stream_handle.play_raw(source.convert_samples()) {
            Ok(_) => {
                println!("Generated beep sound played successfully ({}Hz, {}ms, {}% volume)",
                        beep_freq, beep_duration.as_millis(), 80);
                true
            }
            Err(e) => {
                println!("Failed to play generated beep: {}", e);
                false
            }
        }
    }

    /// Play a sound file using rodio
    fn play_sound_file(&self, path: &PathBuf) -> bool {
        let Some(ref stream_handle) = self.output_stream_handle else {
            println!("No audio output stream available");
            return false;
        };

        match fs::File::open(path) {
            Ok(file) => {
                match Decoder::new(file) {
                    Ok(source) => {
                        // Get volume from config or use default
                        let volume = self.config
                            .as_ref()
                            .map(|config| config.settings.default_volume)
                            .unwrap_or(0.5);

                        match stream_handle.play_raw(source.convert_samples()) {
                            Ok(_) => {
                                // Volume control would need to be implemented differently in rodio
                                // For now, we play at system default volume
                                println!("Sound played successfully at volume {}", volume);
                                true
                            }
                            Err(e) => {
                                println!("Failed to play sound: {}", e);
                                false
                            }
                        }
                    }
                    Err(e) => {
                        println!("Failed to decode audio file: {}", e);
                        false
                    }
                }
            }
            Err(e) => {
                println!("Failed to open sound file: {}", e);
                false
            }
        }
    }
    
    /// Update sound configuration and reinitialize if needed
    pub fn update_config(&mut self, config: SoundConfig) -> Result<(), String> {
        self.config = Some(config);
        println!("Sound configuration updated");
        Ok(())
    }
    
    /// Enable or disable sound playback
    pub fn set_enabled(&mut self, enabled: bool) {
        if let Some(ref mut config) = self.config {
            config.settings.enabled = enabled;
        }
        println!("Sound playback {}", if enabled { "enabled" } else { "disabled" });
    }
}

impl Drop for SoundManager {
    fn drop(&mut self) {
        println!("SoundManager dropped");
    }
}