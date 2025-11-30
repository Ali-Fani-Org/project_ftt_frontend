# User Idle Monitoring System

A comprehensive background idle detection system for your Tauri application that monitors user activity patterns and provides real-time updates to the frontend.

## Features

- **Cross-platform idle detection** using the `user_idle` crate
- **Real-time status updates** via Tauri events
- **Feature flag integration** for safe rollout
- **Activity logging** for future server synchronization
- **Debug UI** for monitoring and testing
- **Configurable idle thresholds** (default: 2 minutes)

## Architecture

```
user_idle crate → Rust Background Task → Tauri Events → Svelte Store → UI Components
```

## Files Added/Modified

### Backend (Rust)
- [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs): Background watcher and event emission
- [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs): Idle detection commands
- [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml): Added dependencies (tokio, chrono)

### Frontend (Svelte/TypeScript)
- [`src/lib/stores.ts`](src/lib/stores.ts): Idle monitoring store and state management
- [`src/lib/IdleMonitorDebug.svelte`](src/lib/IdleMonitorDebug.svelte): Debug UI component
- [`src/routes/settings/+page.svelte`](src/routes/settings/+page.svelte): Integrated debug component

## Usage

### Feature Flag
The idle monitoring system is controlled by the feature flag `user-idle-monitoring`. Enable it in your feature flags system to activate the functionality.

### API Commands

The system exposes several Tauri commands:

```typescript
// Get complete idle status
const status = await invoke('get_idle_status');

// Get idle time in seconds
const idleTime = await invoke('get_idle_time');

// Check if user is currently idle
const isIdle = await invoke('is_user_idle');

// Create activity log entry
const log = await invoke('create_activity_log', { 
  idleTimeSeconds: 300, 
  isIdle: false 
});
```

### Event System

The system emits two types of events:

1. **`idle-status-changed`**: Fired when idle state changes (active ↔ idle)
2. **`idle-status-update`**: Fired periodically (every 5 seconds) with current status

```typescript
import { listen } from '@tauri-apps/api/event';

// Listen for state changes
await listen('idle-status-changed', (event) => {
  console.log('Idle state changed:', event.payload);
});

// Listen for periodic updates
await listen('idle-status-update', (event) => {
  console.log('Idle status update:', event.payload);
});
```

### Data Structures

#### IdleStatus
```typescript
interface IdleStatus {
  is_idle: boolean;
  idle_time_seconds: number;
  last_update: string;
  session_duration_seconds: number;
}
```

#### ActivityLog
```typescript
interface ActivityLog {
  timestamp: string;
  idle_time_seconds: number;
  is_idle: boolean;
  session_duration_seconds: number;
  activity_state: string; // "active", "idle", "became_idle", "became_active"
}
```

## Configuration

### Idle Threshold
Currently set to 2 minutes (120 seconds). Modify in:
- [`src-tauri/src/lib.rs:89`](src-tauri/src/lib.rs:89)
- [`src-tauri/src/commands.rs:24`](src-tauri/src/commands.rs:24)

### Update Frequency
Background monitoring runs every 5 seconds. Modify in:
- [`src-tauri/src/lib.rs:74`](src-tauri/src/lib.rs:74)

## Debug UI

Access the idle monitoring debug component at **Settings → User Idle Monitor Debug**. The debug UI shows:

- Current idle/active status
- Real-time idle time and session duration
- Activity logs with timestamps
- Feature flag status
- Manual refresh and log clearing options

## Future Server Integration

The system is designed for easy server synchronization:

1. **Activity logs** are stored locally with timestamps
2. **Data structure** is ready for API endpoints
3. **State management** supports batch synchronization
4. **Feature flag** allows gradual rollout

### Suggested Server Endpoints
```typescript
// POST /api/user-activity/
interface UserActivityPayload {
  activity_logs: ActivityLog[];
  session_summary: {
    total_active_time: number;
    total_idle_time: number;
    activity_transitions: number;
  };
}
```

## Error Handling

- **Graceful degradation**: System continues working if feature flag is disabled
- **Error logging**: All errors are logged to console
- **Fallback behavior**: Commands return error messages instead of crashing

## Dependencies

### Rust Dependencies
- `user-idle = "0.6.0"`: Cross-platform idle detection
- `tokio = { version = "1.0", features = ["full"] }`: Async runtime
- `chrono = { version = "0.4", features = ["serde"] }`: Date/time handling

### Frontend Dependencies
- Uses existing Svelte stores and Tauri APIs
- Integrates with existing feature flags system

## Testing

1. **Enable feature flag**: Set `user-idle-monitoring` to enabled
2. **Access debug UI**: Go to Settings page
3. **Monitor activity**: Check real-time updates in debug component
4. **Test thresholds**: Stay idle for 2+ minutes to trigger idle state
5. **Verify events**: Check browser console for event logs

## Performance

- **Low overhead**: 5-second polling interval
- **Memory efficient**: Keeps only last 100 activity logs
- **Background operation**: Runs in separate async task
- **Event-driven updates**: Minimal frontend polling required

## Troubleshooting

### Common Issues

1. **Feature flag not working**: Ensure `user-idle-monitoring` is enabled in your feature flags system
2. **No events firing**: Check browser console for error messages
3. **Idle detection not accurate**: Verify system permissions for idle detection

### Debug Steps

1. Check Rust console output for background task status
2. Verify feature flag status in debug UI
3. Test manual commands via Tauri developer tools
4. Monitor event emission in browser console