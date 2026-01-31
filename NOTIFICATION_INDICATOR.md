# Notification Status Indicator

This document describes the Notification Status Indicator component that displays the current state of the notification service.

## Overview

The Notification Status Indicator is a visual component that shows the connection status of the notification service in the application's navbar. It provides real-time feedback about whether notifications are working properly.

## Features

- **Visual Status Indicators**: Shows 4 different states with distinct icons and colors
- **DaisyUI Styling**: Uses DaisyUI design system for consistent appearance
- **Click for Details**: Clicking the indicator shows detailed connection information
- **Manual Reconnect**: Provides a way to manually reconnect if the service fails
- **Accessibility**: Includes proper ARIA labels and keyboard navigation
- **Animations**: Smooth transitions and appropriate animations for different states

## States

### 🔴 Disconnected

- **Icon**: WifiOff
- **Color**: Neutral gray
- **Description**: Not connected to notification service
- **Occurs when**: No authentication token, not in Tauri environment, or service unavailable

### 🟡 Connecting

- **Icon**: Loader2 (spinning)
- **Color**: Warning yellow
- **Description**: Connecting to notification service...
- **Occurs when**: Attempting to establish SSE connection

### 🟢 Connected

- **Icon**: Bell
- **Color**: Success green
- **Description**: Notification service is active
- **Occurs when**: Successfully connected and receiving notifications
- **Animation**: Pulsing indicator dot

### 🔴 Error

- **Icon**: AlertCircle
- **Color**: Error red
- **Description**: Failed to connect to notification service
- **Occurs when**: Connection attempt fails or service encounters errors

## Visual Design

### Small Indicator (Navbar)

- Located in the right section of the navbar
- Small bell icon with colored status dot
- Clean, minimal design that doesn't interfere with other UI elements
- Tooltip shows current status on hover

### Details Dropdown

- Appears when indicator is clicked
- Shows current status with larger icon
- Displays technical information:
  - Environment (Tauri Desktop vs Browser)
  - Authentication status
  - Service availability
- Provides manual reconnect button when appropriate

## Technical Implementation

### Component Location

- **File**: `src/lib/NotificationStatusIndicator.svelte`
- **Usage**: Integrated into `src/lib/Navbar.svelte`

### Dependencies

- **Lucide Icons**: For status icons (Bell, Wifi, WifiOff, Loader2, AlertCircle)
- **Svelte Stores**: `authToken` for authentication state
- **Notification Service**: `getNotificationService()` for connection status

### Environment Detection

- Checks for Tauri environment using `@tauri-apps/api/window`
- Only functional in Tauri desktop environment
- Gracefully degrades in browser environment

### State Tracking

- **Polling**: Checks connection status every 2 seconds
- **Reactive Updates**: Responds to authentication token changes
- **Manual Refresh**: Users can manually trigger status updates
- **Comprehensive Logging**: Detailed console logs for debugging
- **Error Handling**: Graceful handling of connection errors

### Recent Improvements

- Fixed state detection logic to properly handle connecting vs connected states
- Removed all debug logging for production use
- Clean, professional implementation with no console noise
- Automatic polling to detect real-time connection state changes
- Enhanced state management with proper connecting/connected/disconnected detection
- Manual refresh button and reconnection functionality

## Usage

### Visual States

The indicator automatically updates based on:

1. Authentication token availability
2. Tauri environment detection
3. Notification service connection status
4. Connection attempt states

### User Interactions

- **Hover**: Shows tooltip with current status
- **Click**: Opens details dropdown with technical information
- **Reconnect**: Manual reconnection button (when applicable)

### Integration Points

- **Auth Token Changes**: Automatically connects when user logs in
- **Service Status**: Monitors notification service connection state
- **Error Handling**: Provides visual feedback for connection issues

## Testing

### Manual Testing

1. **Login Flow**: Login and verify indicator shows connecting → connected
2. **Logout Flow**: Logout and verify indicator shows disconnected
3. **Browser vs Tauri**: Test in both environments to verify behavior
4. **Error Simulation**: Test error states (if possible)
5. **Dropdown Functionality**: Click indicator and verify details dropdown

### Expected Behavior

#### In Tauri Environment (Desktop App)

- **Disconnected** when not authenticated
- **Connecting** when authenticating and connecting to SSE
- **Connected** when successfully receiving notifications
- **Error** when connection fails

#### In Browser Environment

- **Disconnected** (notifications not available in browser)
- **Error** state may appear if service initialization fails

## Accessibility

- **ARIA Labels**: Proper labeling for screen readers
- **Keyboard Navigation**: ESC key closes dropdown
- **Tooltips**: Descriptive text for each state
- **Color Coding**: Colors supplement, don't rely solely on color

## Troubleshooting

### Common Issues

1. **Always Shows Disconnected**

   - Check if running in Tauri environment
   - Verify authentication token is present
   - Check notification service initialization

2. **Shows Error State**

   - Check network connectivity
   - Verify backend notification service is running
   - Check authentication token validity

3. **Dropdown Not Appearing**
   - Check for JavaScript errors
   - Verify Lucide icons are properly imported
   - Check component mounting

### Debug Information

The component provides detailed logging:

- Connection attempts and status changes
- Environment detection results
- Service availability checks
- Authentication state changes
- Polling status updates (every 2 seconds)
- Manual refresh operations
- State transition details

**Console Logging**: Check browser console for detailed debug information. The component logs:

- "🔍 NotificationStatusIndicator: updateState() called"
- "✅ Notification service connected: [true/false]"
- "🟢/🔴 Setting state to: [connected/disconnected/error]"
- Polling status and service checks

**Manual Testing**: Use the "🔄 Refresh" button in the details dropdown to manually trigger a status update and see the logs in real-time.

## Future Enhancements

- **Notification Count**: Show number of unread notifications
- **Settings Integration**: Allow users to configure notification preferences
- **History**: Show recent notification activity
- **Sound Test**: Add option to test notification sounds

## Files Modified

- `src/lib/NotificationStatusIndicator.svelte` - New component
- `src/lib/Navbar.svelte` - Integrated indicator into navbar

## Dependencies Added

None - uses existing dependencies from the project.

## Compatibility

- **Tauri Desktop**: Full functionality
- **Web Browser**: Graceful degradation (shows disconnected state)
- **Dark/Light Themes**: Compatible with DaisyUI theming system
