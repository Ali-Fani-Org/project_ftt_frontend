# Project Feature Flags

This document provides a comprehensive overview of all feature flags implemented in the Time Tracking application.

## Overview

Feature flags allow us to independently control functionality across different parts of the application, enabling gradual rollouts, A/B testing, and secure feature management.

## Active Feature Flags

### Process Monitor UI
- **Key**: `process-monitor-ui`
- **Type**: UI Control
- **Description**: Controls visibility of the Process Monitor button in the dashboard
- **Default State**: Disabled (fail-secure)
- **UI Location**: Dashboard navigation bar
- **Dependencies**: None
- **Usage**:
  ```typescript
  showProcessMonitorButton = await featureFlagsStore.isFeatureEnabled('process-monitor-ui');
  ```
- **Admin Setup**:
  ```python
  FeatureFlag.objects.create(
      name="Process Monitor UI",
      key="process-monitor-ui",
      description="Controls access to the Process Monitor UI button in the dashboard",
      is_enabled=True,
      rollout_percentage=100
  )
  ```

### Process Monitor Backend
- **Key**: `process-monitor-backend`
- **Type**: Backend Control
- **Description**: Controls access to the actual process monitoring functionality
- **Default State**: Disabled (fail-secure)
- **UI Location**: Backend enforcement in process monitor page
- **Dependencies**: None
- **Usage**:
  ```typescript
  isProcessMonitorBackendEnabled = () => featureFlagsStore.isFeatureEnabled('process-monitor-backend');
  ```
- **Admin Setup**:
  ```python
  FeatureFlag.objects.create(
      name="Process Monitor Backend",
      key="process-monitor-backend",
      description="Controls access to the actual process monitoring functionality",
      is_enabled=True,
      rollout_percentage=100
  )
  ```

### Developer Tools
- **Key**: `devtools`
- **Type**: UI Control
- **Description**: Controls access to browser developer tools toggle functionality
- **Default State**: Disabled (fail-secure)
- **UI Location**: Dashboard navigation bar
- **Dependencies**: None
- **Usage**:
  ```typescript
  showDevtoolsButton = await featureFlagsStore.isFeatureEnabled('devtools');
  const isDevtoolsEnabled = () => featureFlagsStore.isFeatureEnabled('devtools');
  ```
- **Admin Setup**:
  ```python
  FeatureFlag.objects.create(
      name="Developer Tools",
      key="devtools",
      description="Controls access to browser developer tools toggle functionality",
      is_enabled=True,
      rollout_percentage=100
  )
  ```

## Feature Flag Architecture

### API Integration
All feature flags use the same API endpoints:

1. **Fetch All Features**: `GET /api/feature-flags/user-features/my_features/`
2. **Check Single Feature**: `GET /api/feature-flags/user-features/{feature_key}/check/`
3. **Log Feature Access**: `POST /api/feature-flags/user-features/{feature_key}/log-access/`

### Client-Side Implementation

#### Store Management (`src/lib/stores.ts`)
- Feature flags are cached locally for performance
- Automatic fallback when API is unavailable
- Lazy loading of individual feature checks
- Access logging for analytics

#### Helper Functions
```typescript
// Process Monitor
export const isProcessMonitorUIEnabled = () => featureFlagsStore.isFeatureEnabled('process-monitor-ui');
export const isProcessMonitorBackendEnabled = () => featureFlagsStore.isFeatureEnabled('process-monitor-backend');

// DevTools
export const isDevtoolsEnabled = () => featureFlagsStore.isFeatureEnabled('devtools');
```

### UI Implementation Pattern

#### Conditional Rendering
```svelte
{#if !loadingFeatureFlags && showProcessMonitorButton}
  <!-- Process Monitor Button -->
{/if}

{#if !loadingFeatureFlags && showDevtoolsButton}
  <!-- DevTools Button -->
{/if}
```

#### Access Logging
```typescript
const openFeature = async () => {
  try {
    await featureFlagsStore.logFeatureAccess('feature-key');
  } catch (error) {
    console.error('Failed to log feature access:', error);
  }
  // Feature implementation...
};
```

## Feature Flag Behavior

### Default States
When feature flags are not configured or the API is unavailable:
- All UI elements are hidden by default (fail-secure approach)
- Backend access is denied by default
- Graceful degradation with appropriate error handling

### Enabled States
When feature flags are properly configured:
- UI elements become visible to authorized users
- Backend functionality is accessible
- Access is logged for analytics
- Users see features they're entitled to use

### Disabled States
When feature flags are explicitly disabled:
- UI elements are completely hidden
- No indication that the feature exists
- No functionality is accessible
- Clean user experience

## Platform Compatibility

### Web Browser
- Standard web APIs
- Keyboard event handling for devtools
- Fallback mechanisms for unsupported features

### Tauri Desktop
- Tauri-specific window management
- Same feature flag logic as web
- Desktop-appropriate UI adaptations
- Cross-platform keyboard handling

## Analytics & Monitoring

### Access Logging
All feature access is logged to the backend:
```typescript
await featureFlagsStore.logFeatureAccess('feature-key');
```

### Tracking Data
- User ID
- Feature key
- Timestamp
- IP address (server-side)
- User agent (server-side)

## Security Considerations

### Fail-Safe Design
- Features are disabled by default
- No information leakage when features are disabled
- Graceful handling of API failures
- No exposed internal implementation details

### Access Control
- Backend enforcement independent of UI
- User-specific feature assignments
- Audit trail for all feature access

## Testing Guidelines

### Manual Testing
1. Create feature flags in Django admin
2. Assign users to appropriate features
3. Verify UI elements appear/disappear correctly
4. Test backend functionality restrictions
5. Confirm access logging works

### Integration Testing
```bash
# Start backend
python manage.py runserver

# Start frontend (web)
npm run dev

# Start frontend (Tauri)
npm run tauri dev
```

### Feature Flag Testing
1. Test with no feature flags configured
2. Test with partial feature flags enabled
3. Test with all feature flags enabled
4. Test with invalid/malformed responses
5. Test network failure scenarios

## Admin Management

### Django Admin Access
Navigate to: `/admin/feature_flags/featureflag/`

### User Assignment
1. Select the feature flag
2. Add users to the `users` many-to-many field
3. Save changes

### Monitoring
Access analytics in Django admin or via custom dashboards showing:
- Feature usage statistics
- User access patterns
- Performance metrics

## Future Considerations

### Potential New Features
- **Time Tracking Advanced**: Enhanced time entry features
- **Reporting Dashboard**: Advanced analytics and reports
- **API Integration**: External service integrations
- **Mobile Optimization**: Mobile-specific features
- **Team Collaboration**: Multi-user features

### Implementation Guidelines
1. Follow existing patterns for consistency
2. Use single feature flag per major feature
3. Implement both UI and backend controls when appropriate
4. Add comprehensive documentation
5. Include proper testing scenarios

### Rollout Strategies
- **Gradual Rollout**: Start with small user percentage
- **Role-Based Access**: Tie features to user roles
- **Time-Based**: Schedule feature activation
- **Geographic**: Region-specific feature deployment

## Maintenance

### Regular Tasks
1. Review unused feature flags quarterly
2. Audit access logs for anomalies
3. Update documentation for new features
4. Clean up expired or deprecated flags
5. Monitor performance impact

### Code Updates
When adding new feature flags:
1. Add to this documentation
2. Implement in `src/lib/stores.ts`
3. Update UI components
4. Add admin setup instructions
5. Include test scenarios

---

*Last Updated: 2025-11-19*  
*Version: 1.0*