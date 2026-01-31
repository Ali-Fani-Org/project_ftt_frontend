# Notification System Implementation

This document describes the native notification system implementation for the Time Tracker application, which works exclusively in the Tauri desktop environment.

## Overview

The notification system provides real-time native desktop notifications using Server-Sent Events (SSE) from the backend API. Notifications are automatically displayed when received and acknowledged back to the server.

## Architecture

### Backend Integration

- **SSE Endpoint**: `/api/notifications/sse/`
- **Acknowledgment Endpoint**: `POST /api/notifications/{id}/acknowledge/`
- **Authentication**: Uses existing token-based auth system

### Notification Data Format

```json
{
	"id": "string (UUID)",
	"type": "INFO|WARNING|ERROR|SUCCESS|CRITICAL|OTHER",
	"message": "string",
	"created_at": "string (ISO 8601 datetime)",
	"read": "boolean",
	"delivered_at": "string (ISO 8601 datetime) | null"
}
```

## Implementation Details

### 1. Tauri Backend Changes

#### Dependencies Added

- `tauri-plugin-notification = "2.0.0"` in `Cargo.toml`

#### Plugin Registration

- Added notification plugin to Tauri app setup in `src-tauri/src/lib.rs`

#### Native Notification Command

- Created `show_notification` command in `src-tauri/src/commands.rs`
- Maps notification types to appropriate icons and priorities
- Supports ERROR/CRITICAL (high priority), WARNING (high priority), SUCCESS/INFO (normal priority)

### 2. Frontend Implementation

#### Notification Service (`src/lib/notifications.ts`)

- **Tauri-only operation**: Only works when running in Tauri desktop environment
- **Automatic connection**: Connects when auth token becomes available
- **SSE handling**: Connects to notification endpoint with authentication
- **Native display**: Shows notifications using Tauri's native notification API
- **Auto-acknowledgment**: Automatically acknowledges notifications after display
- **Reconnection logic**: Implements exponential backoff for SSE reconnection

#### API Extensions (`src/lib/api.ts`)

- Added `Notification` interface
- Added `notifications.acknowledge()` method

## Key Features

### Environment Detection

The notification service automatically detects if running in Tauri environment:

```typescript
const isTauri =
	typeof (window as any).__TAURI__ !== 'undefined' || typeof (window as any).tauri !== 'undefined';
```

### Automatic Connection Management

- Connects automatically when user logs in (auth token available)
- Disconnects when user logs out
- Reconnects on connection failure with exponential backoff

### Notification Type Mapping

- **ERROR/CRITICAL**: Red icon, high priority
- **WARNING**: Orange/yellow icon, high priority
- **SUCCESS**: Green icon, normal priority
- **INFO**: Blue icon, normal priority
- **OTHER**: Default icon, normal priority

### Title Formatting

All notifications use the format: "Time Tracker - [Type]" (e.g., "Time Tracker - Warning")

## Usage

### Manual Usage (if needed)

```typescript
import { getNotificationService } from '$lib/notifications';

// Get service instance
const notificationService = getNotificationService();

// Connect manually (usually automatic)
await notificationService.connect();

// Check connection status
const isConnected = notificationService.isConnected();

// Disconnect
notificationService.disconnect();
```

### Automatic Usage

The notification service automatically:

1. Initializes when the app loads
2. Connects when user authenticates
3. Shows notifications when received via SSE
4. Acknowledges notifications back to server
5. Reconnects on disconnect with backoff

## Error Handling

### Graceful Degradation

- Service returns a no-op mock service in non-Tauri environments
- No errors thrown if Tauri APIs unavailable
- Continues working even if individual notifications fail

### Connection Resilience

- Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, 16s)
- Maximum 5 reconnection attempts
- Logs connection status for debugging

### Error Scenarios Handled

- No auth token available
- Network connectivity issues
- Invalid SSE data format
- Notification API failures
- Tauri API unavailability

## Configuration

The notification system uses the existing app configuration:

- **Base URL**: From `baseUrl` store
- **Authentication**: From `authToken` store
- **Reconnection**: Configurable max attempts and backoff strategy

## Development Notes

### Security

- Authentication token passed via URL parameter in SSE connection
- Uses existing API client for acknowledgment requests
- Respects existing authentication state

### Performance

- Minimal resource usage (only active when authenticated)
- Efficient reconnection logic
- No polling - pure SSE event-driven

### Cross-Platform Support

- Works on Windows, macOS, and Linux via Tauri
- Uses native notification APIs for each platform
- Platform-specific notification behavior preserved

## Testing

To test the notification system:

1. **Run in Tauri environment**: Build and run the desktop app
2. **Authenticate**: Log in to get auth token
3. **Verify connection**: Check browser console for "Connected to notification SSE"
4. **Test notifications**: Trigger notifications from backend
5. **Verify acknowledgment**: Check network requests to acknowledgment endpoint

The system will automatically connect and start receiving notifications once the user is authenticated in the Tauri desktop environment.
