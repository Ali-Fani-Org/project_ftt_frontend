## Notifications API

The notification system provides real-time notifications via **Long Polling** and **Server-Sent Events (SSE)** with automatic delivery tracking and confirmation. Notifications are only considered delivered when the `delivered_at` field is not null, ensuring reliable delivery confirmation.

### Core Features

- **Real-time Delivery**: Long Polling and Server-Sent Events (SSE) for instant notifications
- **Automatic Delivery Confirmation**: Notifications are automatically marked as delivered when successfully received by clients
- **Delivery Tracking**: Comprehensive delivery status monitoring and statistics
- **Retry Mechanism**: Built-in retry functionality for failed deliveries
- **RESTful API**: Complete CRUD operations for notification management
- **Multiple Transport Options**: Choose between Long Polling (recommended) or SSE based on your needs

### Notification Object

```json
{
	"id": "string (UUID)",
	"type": "string (enum: INFO|WARNING|ERROR|SUCCESS|CRITICAL|OTHER)",
	"message": "string",
	"created_at": "string (ISO 8601 datetime)",
	"delivered": "boolean (true if delivered_at is not null)",
	"read": "boolean"
}
```

### Server-Sent Events Stream

**Endpoint:** `GET /api/notifications/sse/`  
**Purpose:** Establishes a persistent connection for receiving real-time notifications with automatic delivery confirmation

**Request:**

- Method: GET
- Headers:
  - `Authorization: Token <token>`
  - `Accept: text/event-stream`

**Response:**

- Content-Type: `text/event-stream`
- Format: SSE stream with notification data
- **Automatic Delivery**: Notifications are automatically marked as delivered when successfully streamed

**Event Format:**

```
data: {"id": "uuid", "type": "INFO", "message": "notification text", "created_at": "2025-11-29T20:00:00.000Z", "delivered": false, "read": false}

```

**Notification Types:**

- `INFO` - General information
- `WARNING` - Warning messages
- `ERROR` - Error notifications
- `SUCCESS` - Success confirmations
- `CRITICAL` - Critical alerts
- `OTHER` - Other types

**Client Implementation Example (JavaScript):**

```javascript
// Since EventSource doesn't support custom headers, use fetch with ReadableStream
async function connectSSE(token) {
	const response = await fetch('/api/notifications/sse/', {
		headers: {
			Authorization: `Token ${token}`,
			Accept: 'text/event-stream'
		}
	});

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		const chunk = decoder.decode(value);
		const lines = chunk.split('\n');

		for (const line of lines) {
			if (line.startsWith('data: ')) {
				const data = line.substring(6);
				const notification = JSON.parse(data);
				console.log('Received notification:', notification);
				// Notification is automatically marked as delivered by the server
			}
		}
	}
}
```

### Long Polling Stream (Recommended)

**Endpoint:** `GET /api/notifications/long-poll/`  
**Purpose:** Long polling endpoint for receiving real-time notifications with automatic delivery confirmation

**Request:**

- Method: GET
- Headers:
  - `Authorization: Token <token>`
  - `Content-Type: application/json`
- Query Parameters:
  - `timeout` (optional): Timeout in seconds (1-60, default: 30)

**Response:**

- Content-Type: `application/json`
- **Automatic Delivery**: Notifications are automatically marked as delivered when successfully received

**Response Formats:**

1. **Immediate Response** (undelivered notifications exist):

```json
{
	"status": "immediate",
	"notifications": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"type": "INFO",
			"message": "Your notification message",
			"created_at": "2025-12-01T18:00:00.000Z",
			"read": false
		}
	],
	"has_new_notifications": true
}
```

2. **New Notification Response**:

```json
{
	"status": "new_notification",
	"notifications": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"type": "WARNING",
			"message": "New notification received",
			"created_at": "2025-12-01T18:00:00.000Z",
			"read": false
		}
	],
	"has_new_notifications": true,
	"message": "New notification received"
}
```

3. **Timeout Response** (no new notifications):

```json
{
	"status": "timeout",
	"notifications": [],
	"has_new_notifications": false,
	"message": "No new notifications in the specified time period"
}
```

**Client Implementation Example (JavaScript):**

```javascript
async function pollNotifications() {
	try {
		const response = await fetch('/api/notifications/long-poll/?timeout=30', {
			headers: {
				Authorization: `Bearer ${authToken}`,
				'Content-Type': 'application/json'
			}
		});

		const data = await response.json();

		if (data.has_new_notifications) {
			// Handle new notifications
			data.notifications.forEach((notification) => {
				showNotification(notification.message, notification.type);
				console.log('Received notification:', notification);
			});

			// Continue polling immediately for more notifications
			pollNotifications();
		} else {
			// No new notifications, wait and poll again
			setTimeout(pollNotifications, 1000);
		}
	} catch (error) {
		console.error('Long polling error:', error);
		// Retry after error with longer delay
		setTimeout(pollNotifications, 5000);
	}
}

// Start the polling loop
pollNotifications();
```

**Advantages of Long Polling:**

- **Simpler Implementation**: Standard HTTP requests vs. EventSource API
- **Better Compatibility**: Works in all environments that support HTTP
- **Easier Debugging**: Standard HTTP responses and status codes
- **Lower Complexity**: No streaming responses or connection management
- **Standard HTTP Features**: Works with proxies, load balancers, and standard HTTP tooling

**When to Use Long Polling:**

- ✅ Production applications (recommended)
- ✅ Environments with limited WebSocket/SSE support
- ✅ When simplicity and compatibility are priorities
- ✅ When standard HTTP debugging tools are preferred
- ✅ Mobile applications and web browsers

**When to Use SSE:**

- ⚠️ Debugging and development only
- ⚠️ When you need server-to-client streaming (not required for notifications)
- ⚠️ Testing connection reliability
- ⚠️ Comparing response times between methods

### Server-Sent Events Stream (For Debugging)

**Endpoint:** `GET /api/notifications/sse/`  
**Purpose:** SSE endpoint kept for debugging purposes. Use long polling for production.
**Endpoint:** `GET /api/notifications/`  
**Purpose:** Retrieve paginated list of user's notifications

**Query Parameters:**

- `delivered` (optional): Filter by delivery status (`true`, `false`)
- `read` (optional): Filter by read status (`true`, `false`)

**Response (200 OK):**

```json
[
	{
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"type": "INFO",
		"message": "Your task has been completed",
		"created_at": "2025-11-29T20:00:00.000Z",
		"delivered": true,
		"read": false
	}
]
```

### Get Notification Details

**Endpoint:** `GET /api/notifications/{id}/`  
**Purpose:** Retrieve specific notification details

**Response (200 OK):**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440000",
	"type": "INFO",
	"message": "Your task has been completed",
	"created_at": "2025-11-29T20:00:00.000Z",
	"delivered": true,
	"read": false
}
```

### Acknowledge Notification Delivery

**Endpoint:** `POST /api/notifications/{id}/acknowledge/`  
**Purpose:** Manually mark a notification as delivered (fallback for real-time delivery failures)

**Response (Success - 200):**

```json
{
	"message": "Notification delivery acknowledged",
	"notification": {
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"type": "INFO",
		"message": "Your task has been completed",
		"created_at": "2025-11-29T20:00:00.000Z",
		"delivered": true,
		"read": false
	}
}
```

**Response (Error - 400):**

```json
{
	"error": "Notification already acknowledged"
}
```

### Mark Notification as Delivered

**Endpoint:** `POST /api/notifications/{id}/mark_delivered/`  
**Purpose:** Force mark a notification as delivered

**Response (200 OK):**

```json
{
	"message": "Notification marked as delivered",
	"notification": {
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"type": "INFO",
		"message": "Your task has been completed",
		"created_at": "2025-11-29T20:00:00.000Z",
		"delivered": true,
		"read": false
	}
}
```

### Mark Notification as Read

**Endpoint:** `POST /api/notifications/{id}/mark_read/`  
**Purpose:** Mark a notification as read

**Response (200 OK):**

```json
{
	"message": "Notification marked as read",
	"notification": {
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"type": "INFO",
		"message": "Your task has been completed",
		"created_at": "2025-11-29T20:00:00.000Z",
		"delivered": true,
		"read": true
	}
}
```

### Get Delivery Statistics

**Endpoint:** `GET /api/notifications/delivery-status/`  
**Purpose:** Get comprehensive delivery statistics for the authenticated user

**Response (200 OK):**

```json
{
	"total": 25,
	"delivered": 23,
	"undelivered": 2,
	"delivery_rate": 92.0,
	"recent_undelivered": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"message": "System maintenance scheduled...",
			"created_at": "2025-11-29T20:00:00.000Z",
			"type": "WARNING"
		}
	]
}
```

### Retry Failed Deliveries

**Endpoint:** `POST /api/notifications/delivery-status/`  
**Purpose:** Retry delivery for undelivered notifications

**Request Body (optional):**

```json
{
	"notification_ids": ["uuid1", "uuid2"] // Empty array = retry all undelivered
}
```

**Response (200 OK):**

```json
{
	"message": "Retry initiated for 3 notifications",
	"retry_count": 3
}
```

### Send Test Notification

**Endpoint:** `POST /api/notifications/test/`  
**Purpose:** Send a test notification to the authenticated user (for development/testing)

**Request Body:**

```json
{
	"message": "Test notification message",
	"type": "INFO"
}
```

**Response (201 Created):**

```json
{
	"id": "550e8400-e29b-41d4-a716-446655440000",
	"message": "Test notification sent",
	"notification": {
		"id": "550e8400-e29b-41d4-a716-446655440000",
		"type": "INFO",
		"message": "Test notification message",
		"created_at": "2025-11-29T20:00:00.000Z",
		"delivered": false,
		"read": false
	}
}
```

### Delivery Status Endpoint (Legacy)

**Endpoint:** `GET /api/notifications/delivery-status/`  
**Purpose:** Get delivery status with filtering options (legacy endpoint)

**Query Parameters:**

- `delivered` (optional): Filter by delivery status (`true`, `false`)

**Response (200 OK):**

```json
{
	"total": 25,
	"delivered": 23,
	"undelivered": 2,
	"undelivered_notifications": [
		{
			"id": "550e8400-e29b-41d4-a716-446655440000",
			"message": "System maintenance scheduled...",
			"created_at": "2025-11-29T20:00:00.000Z",
			"type": "WARNING"
		}
	]
}
```

### Delivery Flow

1. **Notification Creation**: Notification created with `delivered_at = null`
2. **Real-time Publishing**: Notification published to Redis channel
3. **Automatic Delivery**: When successfully received by client via long polling or SSE, `delivered_at` is set automatically
4. **Delivery Confirmation**: Client receives notification with appropriate response format
5. **Fallback Options**: Manual acknowledgment endpoints available if real-time delivery fails

### Connection Management

- **Long Polling**: Standard HTTP requests with configurable timeout (1-60 seconds)
- **SSE**: Persistent connections remain open until client disconnects or server closes
- Implement reconnection logic on client side for reliability
- Server may close connections after prolonged inactivity
- Automatic delivery confirmation ensures reliable tracking
- Long polling provides simpler implementation with better compatibility

### Error Responses

- `400 Bad Request`: Notification already delivered/acknowledged
- `404 Not Found`: Notification not found or doesn't belong to user
- `401 Unauthorized`: Missing or invalid authentication token

### Best Practices

1. **Use Long Polling** (`/api/notifications/long-poll/`) for production applications
   - Simpler implementation with standard HTTP requests
   - Better compatibility across environments
   - Easier debugging with standard HTTP responses
   - Configurable timeout for optimal performance
2. **Use SSE** (`/api/notifications/sse/`) only for debugging purposes
3. **Implement polling loop** for long polling: recursive calls when notifications received, timeout delays when no notifications
4. **Use manual acknowledgment** as fallback for real-time delivery failures
5. **Monitor delivery statistics** to track system health
6. **Implement retry logic** for failed deliveries
7. **Handle timeouts gracefully** in long polling with appropriate retry delays
8. **Set appropriate timeout values** (15-30 seconds recommended for most use cases)

---

## Feature Flags API

The feature flags system provides secure access to feature configuration with proper access control. Users only see features they have explicit access to, while admin users can manage all features.

### Feature Flags Endpoint

**Endpoint:** `GET /api/feature-flags/user-features/my_features/`
**Purpose:** Retrieve feature flags accessible to the current authenticated user

**Authentication Required:** Yes (Token authentication)

**Access Control:**

- **Regular Users**: Only see feature flags they have explicit access to (via M2M relationship)
- **Admin Users**: See all feature flags for management purposes

**Response (200 OK):**

```json
{
	"enabled_features": [
		{
			"id": 1,
			"key": "new_ui_design",
			"name": "New UI Design",
			"description": "Access to the new user interface design",
			"is_enabled": true,
			"rollout_percentage": 100,
			"user_count": 5,
			"created_at": "2025-11-29T20:00:00.000Z",
			"updated_at": "2025-11-29T20:00:00.000Z"
		}
	],
	"disabled_features": [],
	"total_features": 1
}
```

**Response for Admin Users (200 OK):**

```json
{
	"enabled_features": [
		{
			"id": 1,
			"key": "new_ui_design",
			"name": "New UI Design",
			"description": "Access to the new user interface design",
			"is_enabled": true,
			"rollout_percentage": 100,
			"user_count": 5,
			"created_at": "2025-11-29T20:00:00.000Z",
			"updated_at": "2025-11-29T20:00:00.000Z"
		}
	],
	"disabled_features": [
		{
			"id": 2,
			"key": "experimental_feature",
			"name": "Experimental Feature",
			"description": "Experimental feature not yet enabled",
			"is_enabled": false,
			"rollout_percentage": 0,
			"user_count": 0,
			"created_at": "2025-11-29T20:00:00.000Z",
			"updated_at": "2025-11-29T20:00:00.000Z"
		}
	],
	"total_features": 2
}
```

### Check Specific Feature Flag

**Endpoint:** `GET /api/feature-flags/user-features/{feature_key}/check/`
**Purpose:** Check if a specific feature flag is enabled for the current user

**Path Parameters:**

- `feature_key`: The key of the feature flag to check

**Response (200 OK):**

```json
{
	"feature_key": "new_ui_design",
	"feature_name": "New UI Design",
	"is_enabled": true,
	"feature_enabled_globally": true,
	"user_has_access": true
}
```

**Response (404 Not Found):**

```json
{
	"feature_key": "unknown_feature",
	"feature_name": null,
	"is_enabled": false,
	"feature_enabled_globally": false,
	"user_has_access": false,
	"error": "Feature flag not found"
}
```

### Log Feature Access

**Endpoint:** `POST /api/feature-flags/user-features/{feature_key}/log-access/`
**Purpose:** Log when a user accesses a feature for analytics and usage tracking

**Path Parameters:**

- `feature_key`: The key of the feature flag being accessed

**Response (200 OK):**

```json
{
	"message": "Feature access logged successfully",
	"feature_key": "new_ui_design",
	"feature_name": "New UI Design"
}
```

**Response (404 Not Found):**

```json
{
	"error": "Feature flag not found"
}
```

### Security Considerations

- **Access Control**: Regular users can only see features they have explicit access to
- **Data Exposure**: Disabled features are not shown to regular users
- **Admin Privileges**: Admin users have full visibility for management
- **Caching**: Responses are cached for performance with 5-minute cache duration
- **Authentication**: All endpoints require valid authentication

### Best Practices

1. **Use Feature Flags for Gradual Rollouts**: Enable features for specific users before full deployment
2. **Regularly Review Access**: Audit which users have access to sensitive features
3. **Use Admin Endpoints for Management**: Admin users should use the feature flags interface for comprehensive management
4. **Monitor Feature Usage**: Use the log-access endpoint to track feature adoption
5. **Cache Management**: Be aware of caching when making real-time access decisions

---

## Time Entries API

The Time Entries API provides comprehensive time tracking functionality with advanced filtering capabilities. Users can create, manage, and filter their time entries with extensive options for date ranges, duration constraints, and project-based filtering.

### Core Features

- **Time Tracking**: Start, stop, and manage time entries with automatic duration calculation
- **Advanced Filtering**: Filter by date ranges, duration limits, and project assignments
- **User Isolation**: Users can only access their own time entries
- **Real-time Status**: Track active vs. completed time entries
- **Project Association**: Link time entries to specific projects with proper access control

### Time Entry Object

```json
{
	"id": "integer",
	"title": "string",
	"description": "string (optional)",
	"start_time": "string (ISO 8601 datetime)",
	"end_time": "string (ISO 8601 datetime, null if active)",
	"duration": "string (HH:MM:SS format)",
	"is_active": "boolean",
	"user": "string (username)",
	"project": "string (project name)",
	"tags": ["string (tag titles)"]
}
```

### List User's Time Entries

**Endpoint:** `GET /api/time_entries/`
**Purpose:** Retrieve paginated list of user's time entries with advanced filtering and ordering options

**Query Parameters:**

- `start_date_after` (optional): Filter entries started after this date (YYYY-MM-DD)
- `start_date_before` (optional): Filter entries started before this date (YYYY-MM-DD)
- `end_date_after` (optional): Filter entries ended after this date (YYYY-MM-DD)
- `end_date_before` (optional): Filter entries ended before this date (YYYY-MM-DD)
- `duration_min` (optional): Minimum duration (format: HH:MM:SS or seconds)
- `duration_max` (optional): Maximum duration (format: HH:MM:SS or seconds)
- `project` (optional): Filter by project ID
- `ordering` (optional): Order results by field. Options: `start_time`, `-start_time`, `end_time`, `-end_time`, `duration`, `-duration`, `title`, `-title`, `project_name`, `-project_name`, `is_active`, `-is_active` (default: `-start_time`)
- `cursor` (optional): Cursor for pagination
- `limit` (optional): Number of results per page (max 100, default 20)

**Example Requests:**

1. **Filter by date range:**

   ```
   GET /api/time_entries/?start_date_after=2025-11-01&start_date_before=2025-11-30
   ```

2. **Filter by duration:**

   ```
   GET /api/time_entries/?duration_min=01:00:00&duration_max=04:00:00
   ```

3. **Filter by project:**

   ```
   GET /api/time_entries/?project=1
   ```

4. **Combined filters:**
   ```
   GET /api/time_entries/?start_date_after=2025-11-01&project=1&duration_min=00:30:00
   ```

**Response (200 OK):**

```json
{
	"count": 25,
	"next": "http://api.example.com/api/time_entries/?cursor=cD0yMDI1LTExLTI5KzIwJTNBMzAlM0EwMCUyQjAzJTNBMzA%3D",
	"previous": null,
	"results": [
		{
			"id": 1,
			"title": "Project Development",
			"description": "Working on new features",
			"start_time": "2025-11-29T14:30:00.000Z",
			"end_time": "2025-11-29T16:45:00.000Z",
			"duration": "02:15:00",
			"is_active": false,
			"user": "john_doe",
			"project": "Web Application",
			"tags": ["development", "frontend"]
		}
	]
}
```

### Create New Time Entry (Start Timer)

**Endpoint:** `POST /api/time_entries/`
**Purpose:** Create and start a new time entry

**Request Body:**

```json
{
	"title": "Task Title",
	"description": "Optional description",
	"project": 1,
	"tags": [1, 2]
}
```

**Response (201 Created):**

```json
{
	"id": 2,
	"title": "Task Title",
	"description": "Optional description",
	"start_time": "2025-11-29T17:00:00.000Z",
	"end_time": null,
	"duration": null,
	"is_active": true,
	"user": "john_doe",
	"project": "Web Application",
	"tags": ["development"]
}
```

### Get Time Entry Details

**Endpoint:** `GET /api/time_entries/{id}/`
**Purpose:** Retrieve specific time entry details

**Response (200 OK):**

```json
{
	"id": 1,
	"title": "Project Development",
	"description": "Working on new features",
	"start_time": "2025-11-29T14:30:00.000Z",
	"end_time": "2025-11-29T16:45:00.000Z",
	"duration": "02:15:00",
	"is_active": false,
	"user": "john_doe",
	"project": "Web Application",
	"tags": ["development", "frontend"]
}
```

### Stop Active Timer

**Endpoint:** `POST /api/time_entries/{id}/stop/`
**Purpose:** Stop a running time entry

**Response (200 OK):**

```json
{
	"id": 2,
	"title": "Task Title",
	"description": "Optional description",
	"start_time": "2025-11-29T17:00:00.000Z",
	"end_time": "2025-11-29T18:30:00.000Z",
	"duration": "01:30:00",
	"is_active": false,
	"user": "john_doe",
	"project": "Web Application",
	"tags": ["development"]
}
```

### Get Current Active Time Entry

**Endpoint:** `GET /api/time_entries/current_active/`
**Purpose:** Retrieve the currently active time entry for the authenticated user

**Response (200 OK):**

```json
{
	"id": 3,
	"title": "Current Task",
	"description": "Currently working on this",
	"start_time": "2025-11-29T19:00:00.000Z",
	"end_time": null,
	"duration": null,
	"is_active": true,
	"user": "john_doe",
	"project": "Mobile App",
	"tags": ["bugfix"]
}
```

**Response (404 Not Found):**

```json
{
	"detail": "No active time entry found."
}
```

### Add Idle Session

**Endpoint:** `POST /api/time_entries/{id}/add-idle/`  
**Purpose:** Record an idle session for a specific time entry

**Path Parameters:**

- `id` (integer): The ID of the time entry to add the idle session to

**Request Body:**

```json
{
	"start_time": "2025-11-29T14:30:00.000Z",
	"end_time": "2025-11-29T15:00:00.000Z"
}
```

**Field Descriptions:**

- `start_time` (required): Start time of the idle period (ISO 8601 datetime format)
- `end_time` (required): End time of the idle period (ISO 8601 datetime format)

**Validation Rules:**

- End time must be after start time
- Idle session must be linked to a time entry that belongs to the authenticated user
- Times are normalized to second precision (microseconds are removed)

**Response (201 Created):**

```json
{
	"status": "idle_recorded",
	"total_idle_duration": "00:30:00",
	"actual_duration": "02:15:00"
}
```

**Response Fields:**

- `status` (string): Confirmation status ("idle_recorded")
- `total_idle_duration` (string): Cumulative idle time for this time entry (HH:MM:SS format)
- `actual_duration` (string): Total active time duration for this time entry (HH:MM:SS format)

**Response (400 Bad Request):**

```json
{
	"end_time": ["End time must be after start time"]
}
```

**Use Cases:**

- Track breaks during work sessions
- Monitor idle time within specific time entries
- Calculate actual productive time vs. total logged time
- Generate detailed time tracking reports with idle analysis

**Example Use:**

```javascript
async function addIdleSession(timeEntryId, idleStart, idleEnd) {
	const response = await fetch(`/api/time_entries/${timeEntryId}/add-idle/`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${authToken}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			start_time: idleStart,
			end_time: idleEnd
		})
	});

	const data = await response.json();
	console.log('Idle session recorded:', data);
	console.log(`Total idle time for this entry: ${data.total_idle_duration}`);
}
```

### Security Considerations

- **User Isolation**: Users can only access their own time entries
- **Project Access Control**: Users can only filter by projects they are members of
- **Authentication Required**: All endpoints require valid authentication
- **Input Validation**: All filter parameters are validated for proper format

### Best Practices

1. **Use Advanced Filtering**: Leverage the main list endpoint with filters for generating time tracking reports
2. **Combine Filters Strategically**: Use multiple filters together for precise data retrieval
3. **Pagination Awareness**: Always handle pagination cursors for large datasets
4. **Date Format Consistency**: Use YYYY-MM-DD format for date parameters
5. **Duration Format**: Use HH:MM:SS format for duration filters
6. **Project ID Validation**: Ensure project IDs belong to user's accessible projects

### Error Responses

- `400 Bad Request`: Invalid filter parameters or format
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Attempting to access projects user doesn't have access to
- `404 Not Found`: Time entry not found or doesn't belong to user

---
