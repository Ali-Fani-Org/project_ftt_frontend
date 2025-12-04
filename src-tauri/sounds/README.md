# Notification Sounds Directory

This directory contains sound files for the Time Tracker application notifications.

## Directory Structure

```
sounds/
├── README.md          # This file
├── config.toml        # Sound configuration file
├── default/           # Default notification sounds
│   ├── info.mp3       # Info notification sound
│   ├── warning.mp3    # Warning notification sound  
│   ├── error.mp3      # Error notification sound
│   ├── success.mp3    # Success notification sound
│   └── critical.mp3   # Critical notification sound
└── custom/            # Custom user sounds (future expansion)
    └── .gitkeep       # Placeholder for custom sounds
```

## Adding New Sounds

### 1. Adding Default Sounds

To add or replace default notification sounds:

1. Add your audio file to the appropriate directory:
   - `default/` for system default sounds
   - `custom/` for user-provided sounds (future feature)

2. Update `config.toml` to map the sound to notification types

3. Supported audio formats: MP3, WAV, OGG

### 2. Sound File Naming Convention

- Use lowercase names
- Use descriptive names (e.g., `chime.mp3`, `alert.mp3`)
- Avoid spaces and special characters except hyphens and underscores

### 3. Audio File Requirements

- **Format**: MP3, WAV, or OGG
- **Duration**: Recommended 1-3 seconds
- **Size**: Keep files under 500KB for optimal performance
- **Quality**: 44.1kHz sample rate recommended

## Configuration

See `config.toml` for sound-to-notification-type mappings and settings.

## Quick Start

1. **Add sound files** to the `default/` directory:
   - `info.mp3` or `info.wav`
   - `warning.mp3` or `warning.wav`
   - `error.mp3` or `error.wav`
   - `success.mp3` or `success.wav`
   - `critical.mp3` or `critical.wav`

2. **Test the system** using the new test commands:
   ```javascript
   import { invoke } from '@tauri-apps/api/core';
   
   // Test individual notification types
   await invoke('test_notification_sound', { notificationType: 'INFO' });
   await invoke('test_notification_sound', { notificationType: 'WARNING' });
   await invoke('test_notification_sound', { notificationType: 'ERROR' });
   await invoke('test_notification_sound', { notificationType: 'SUCCESS' });
   await invoke('test_notification_sound', { notificationType: 'CRITICAL' });
   
   // Debug the entire sound system
   await invoke('debug_sound_system');
   ```

3. **Verify functionality** by checking console output and hearing audio playback.

## Current Status

✅ **System Implemented**: Notification sound system is fully functional
✅ **Configuration**: TOML-based configuration system ready
✅ **Testing**: Test commands available for verification
✅ **Documentation**: Comprehensive guides provided
✅ **Compilation**: Builds successfully with no errors

**Note**: During development, the system uses the source `sounds/` directory. In production builds, it will use the bundled application resources.