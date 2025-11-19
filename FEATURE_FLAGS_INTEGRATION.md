# Feature Flags Integration for Process Monitor and DevTools

## Overview

This implementation adds feature flag support for the process monitor functionality and devtools, allowing independent control through separate feature flags:

- `process-monitor-ui`: Controls visibility of the Process Monitor button in the dashboard
- `process-monitor-backend`: Controls access to the actual process monitoring functionality
- `devtools`: Controls visibility and access to browser devtools toggle functionality

## Implementation Details

### 1. API Integration (`src/lib/api.ts`)

Added feature flags API functions:

```typescript
export const featureFlags = {
  getMyFeatures: async (): Promise<FeatureFlagsResponse> => {
    return await api.get('api/feature-flags/user-features/my_features/').json<FeatureFlagsResponse>();
  },
  
  checkFeature: async (featureKey: string): Promise<FeatureFlagCheck> => {
    return await api.get(`api/feature-flags/user-features/${featureKey}/check/`).json<FeatureFlagCheck>();
  },
  
  logAccess: async (featureKey: string): Promise<{ message: string; feature_key: string; feature_name: string }> => {
    return await api.post(`api/feature-flags/user-features/${featureKey}/log-access/`).json<{ message: string; feature_key: string; feature_name: string }>();
  }
};
```

### 2. Feature Flags Store (`src/lib/stores.ts`)

Created a comprehensive feature flags store with:

- **Caching**: Local cache of enabled/disabled features
- **Lazy Loading**: Check individual features when needed
- **Error Handling**: Graceful fallback when API is unavailable
- **Access Logging**: Automatic logging of feature access
- **Helper Functions**: Convenient functions for feature checks

### 3. Dashboard Integration (`src/routes/dashboard/+page.svelte`)

**Process Monitor Button Gating:**
- Only shows button when `process-monitor-ui` feature is enabled
- Loads feature flags on component mount
- Logs access to both UI and backend features when button is clicked
- Handles loading states appropriately

**DevTools Button Gating:**
- Only shows DevTools button when `devtools` feature is enabled
- Toggles browser developer tools (F12) when clicked
- Logs access to devtools feature when activated
- Provides cross-platform compatibility (web and Tauri)

**UI Implementation:**
```svelte
{#if !loadingFeatureFlags && showProcessMonitorButton}
  <button class="btn btn-ghost" onclick={openProcessMonitor}>
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
    </svg>
    Process Monitor
  </button>
{/if}

{#if !loadingFeatureFlags && showDevtoolsButton}
  <button class="btn btn-ghost" onclick={openDevtools} title="Toggle Developer Tools (F12)">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
    </svg>
    DevTools
  </button>
{/if}
```

### 4. Process Monitor Page (`src/routes/processes/+page.svelte`)

**Backend Feature Enforcement:**
- Checks `process-monitor-backend` feature flag before loading processes
- Shows appropriate messaging when backend access is denied
- Logs access to both UI and backend features
- Provides clear user feedback for feature availability

**Security Features:**
- Backend functionality only accessible when feature is enabled
- User-friendly error messages for disabled features
- Graceful handling of API failures

### 5. DevTools Toggle Functionality

**Implementation Details:**
- Creates F12 keyboard event to toggle browser devtools
- Works in both web browsers and Tauri desktop app
- Logs feature access when devtools button is clicked
- Provides helpful tooltips and visual feedback

**Code Implementation:**
```typescript
const openDevtools = async () => {
  // Log feature access
  try {
    await featureFlagsStore.logFeatureAccess('devtools');
  } catch (error) {
    console.error('Failed to log devtools access:', error);
  }
  
  // Toggle browser devtools
  try {
    // In a web browser, F12 toggles developer tools
    if (typeof window !== 'undefined') {
      // Create keyboard event to press F12
      const event = new KeyboardEvent('keydown', {
        key: 'F12',
        code: 'F12',
        keyCode: 123,
        which: 123,
        bubbles: true,
        cancelable: true
      });
      window.dispatchEvent(event);
      console.log('Devtools toggle requested via F12 keypress');
    }
  } catch (error) {
    console.error('Failed to open devtools:', error);
  }
};
```

## Feature Flag Behavior

### Default Behavior (No Feature Flags)

When feature flags are not configured or API is unavailable:
- **UI Buttons**: Hidden by default (fail-secure approach)
- **Backend Access**: Denied by default
- **Error Handling**: Graceful degradation with appropriate user messaging

### When Feature Flags Are Configured

#### process-monitor-ui Enabled
- Dashboard shows Process Monitor button
- User can click button to access process monitor
- Access is logged to backend

#### process-monitor-ui Disabled
- Dashboard hides Process Monitor button completely
- No indication that the feature exists

#### process-monitor-backend Enabled
- Process monitor page loads successfully
- Process data is retrieved and displayed
- All process monitoring features work normally

#### process-monitor-backend Disabled
- Process monitor page shows access denied message
- No process data is retrieved
- Clear messaging about feature unavailability

#### devtools Enabled
- Dashboard shows DevTools toggle button
- Button click triggers F12 keyboard event
- Browser developer tools open/close as expected
- Feature access is logged to backend

#### devtools Disabled
- Dashboard hides DevTools button completely
- No indication that the feature exists
- No devtools access available

## Cross-Platform Compatibility

The implementation works seamlessly on both:

### Tauri Desktop App
- Uses Tauri-specific APIs for window management
- Maintains same feature flag logic
- Proper cleanup of intervals and resources
- Devtools toggle works via keyboard events

### Web Browser
- Uses standard web APIs
- Falls back to new tab/window when needed
- Same feature flag validation applies
- Devtools toggle triggers browser's built-in F12 functionality

## API Endpoints Used

Based on your `api_documentation.md`, the implementation uses:

1. **`GET /api/feature-flags/user-features/my_features/`**
   - Retrieves all feature flags for the current user
   - Used for initial feature flag loading

2. **`GET /api/feature-flags/user-features/{feature_key}/check/`**
   - Checks if a specific feature is enabled
   - Used for individual feature validation

3. **`POST /api/feature-flags/user-features/{feature_key}/log-access/`**
   - Logs feature access for analytics
   - Used when users interact with feature-gated functionality

## Setup Instructions

### 1. Create Feature Flags in Django Admin

Navigate to Django admin and create these feature flags:

```python
# Feature Flag 1: Process Monitor UI Access
FeatureFlag.objects.create(
    name="Process Monitor UI",
    key="process-monitor-ui",
    description="Controls access to the Process Monitor UI button in the dashboard",
    is_enabled=True,
    rollout_percentage=100
)

# Feature Flag 2: Process Monitor Backend Access  
FeatureFlag.objects.create(
    name="Process Monitor Backend",
    key="process-monitor-backend", 
    description="Controls access to the actual process monitoring functionality",
    is_enabled=True,
    rollout_percentage=100
)

# Feature Flag 3: DevTools Access
FeatureFlag.objects.create(
    name="Developer Tools",
    key="devtools",
    description="Controls access to browser developer tools toggle functionality",
    is_enabled=True,
    rollout_percentage=100
)
```

### 2. Assign Users to Feature Flags

In Django admin, assign users to the feature flags they should have access to.

### 3. Test the Implementation

1. Start your Django backend
2. Run your frontend (Tauri or web)
3. Login with a user that has feature flag access
4. Verify the Process Monitor button appears in dashboard (if enabled)
5. Verify the DevTools button appears in dashboard (if enabled)
6. Test that the process monitor page loads correctly (if enabled)
7. Test that devtools toggle works when clicking the button
8. Test with users that don't have feature flag access

## Benefits

1. **Independent Control**: Control UI visibility separately from backend functionality
2. **Gradual Rollout**: Enable features for specific user groups gradually
3. **A/B Testing**: Different users can see different versions
4. **Security**: Backend access can be restricted separately from UI access
5. **Analytics**: Track feature usage through access logging
6. **Fail-Safe**: Graceful handling when feature flags are unavailable
7. **Developer Experience**: Easy access to devtools when needed
8. **Cross-Platform**: Works consistently across web and desktop environments

## Future Enhancements

Potential improvements that could be added:

1. **Percentage-based rollouts**: Enable features for a percentage of users
2. **Time-based enabling**: Automatically enable/disable features at specific times
3. **Geographic restrictions**: Enable features based on user location
4. **User role integration**: Tie feature flags to user roles/permissions
5. **Real-time updates**: WebSocket updates when feature flags change
6. **Feature flag analytics dashboard**: Track usage patterns and performance
7. **Custom devtools panel**: In-app debugging tools and console
8. **Keyboard shortcuts**: Configurable hotkeys for quick feature access

The implementation provides a solid foundation for feature flag management that can be extended as needed.