# API Documentation

This document provides comprehensive documentation for the Time Tracking API, designed to help front-end developers integrate with the backend. The API is built with Django REST Framework and uses token-based authentication.

## Base URL
```
http://localhost:8000
```

## Authentication

The API uses token-based authentication. All requests to protected endpoints must include the `Authorization` header with the format:

```
Authorization: Token <your_token>
```

### Obtaining a Token

#### Register a New User
**Endpoint:** `POST /auth/users/`

**Request Body:**
```json
{
  "username": "string",
  "password": "string",
  "first_name": "string",
  "last_name": "string"
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "username": "string",
  "first_name": "string",
  "last_name": "string"
}
```

#### Login to Obtain Token
**Endpoint:** `POST /auth/token/login/`

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response (200 OK):**
```json
{
  "auth_token": "your_token_here"
}
```

#### Get Current User Info
**Endpoint:** `GET /auth/users/me/`

**Headers:**
```
Authorization: Token <your_token>
```

**Response (200 OK):**
```json
{
  "id": 1,
  "username": "string",
  "first_name": "string",
  "last_name": "string",
  "profile_image": "url_or_null"
}
```

## Projects API

### List User's Projects
**Endpoint:** `GET /api/projects/`

**Description:** Returns a list of projects where the authenticated user is a member.

**Headers:**
```
Authorization: Token <your_token>
```

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "title": "Project Title",
    "description": "Project description"
  }
]
```

## Time Entries API

### List Time Entries
**Endpoint:** `GET /api/time_entries/`

**Description:** Returns a list of all time entries for the authenticated user, sorted by start time (newest first).

**Headers:**
```
Authorization: Token <your_token>
```

**Query Parameters:**
- None (returns all user's entries)

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "title": "Task Title",
    "description": "Task description",
    "start_time": "2024-01-01T10:00:00Z",
    "end_time": "2024-01-01T11:30:00Z",
    "duration": "01:30:00",
    "is_active": false,
    "user": "username",
    "project": "Project Title",
    "tags": ["tag1", "tag2"]
  }
]
```

### Get Single Time Entry
**Endpoint:** `GET /api/time_entries/{id}/`

**Description:** Retrieves a specific time entry by ID.

**Headers:**
```
Authorization: Token <your_token>
```

**Response (200 OK):** Same format as individual item in list above.

**Error Responses:**
- `404 Not Found`: Time entry doesn't exist or doesn't belong to user

### Start a New Time Entry (Timer)
**Endpoint:** `POST /api/time_entries/`

**Description:** Creates and starts a new timer. Automatically stops any existing active timer for the user.

**Headers:**
```
Authorization: Token <your_token>
```

**Request Body:**
```json
{
  "title": "string (required)",
  "description": "string (optional)",
  "project": "integer (required, project ID)",
  "tags": ["integer"] (optional, array of tag IDs)
}
```

**Validation Rules:**
- `project` must be a project where the user is a member
- `tags` must be tags owned by the user
- User cannot have more than one active time entry

**Response (201 Created):**
```json
{
  "id": 1,
  "title": "Task Title",
  "description": "Task description",
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": null,
  "duration": null,
  "is_active": true,
  "user": "username",
  "project": "Project Title",
  "tags": ["tag1"]
}
```

**Error Responses:**
- `400 Bad Request`: Validation errors (invalid project, tags, or existing active timer)

### Stop a Running Timer
**Endpoint:** `POST /api/time_entries/{id}/stop/`

**Description:** Stops the specified timer by setting end_time to current time.

**Headers:**
```
Authorization: Token <your_token>
```

**Request Body:** None

**Response (200 OK):**
```json
{
  "id": 1,
  "title": "Task Title",
  "description": "Task description",
  "start_time": "2024-01-01T10:00:00Z",
  "end_time": "2024-01-01T11:30:00Z",
  "duration": "01:30:00",
  "is_active": false,
  "user": "username",
  "project": "Project Title",
  "tags": ["tag1"]
}
```

**Error Responses:**
- `400 Bad Request`: Timer is already stopped
- `404 Not Found`: Time entry doesn't exist or doesn't belong to user

### Get Current Active Time Entry
**Endpoint:** `GET /api/time_entries/current_active/`

**Description:** Retrieves the currently active (running) time entry for the authenticated user.

**Headers:**
```
Authorization: Token <your_token>
```

**Response (200 OK):** Same format as single time entry.

**Error Responses:**
- `404 Not Found`: No active time entry exists

## Data Models

### User
- `id`: Integer (primary key)
- `username`: String (unique, required)
- `first_name`: String
- `last_name`: String
- `profile_image`: Image URL or null

### Project
- `id`: Integer (primary key)
- `title`: String (max 256 chars)
- `description`: Text (optional)
- `is_active`: Boolean (default true)
- `created_at`: DateTime
- `members`: Many-to-many relationship with User (through ProjectMembership)

### TimeEntry
- `id`: Integer (primary key)
- `title`: String (max 256 chars)
- `description`: Text
- `start_time`: DateTime (auto-set on creation)
- `end_time`: DateTime or null
- `duration`: Duration (calculated field: end_time - start_time)
- `is_active`: Boolean (default true)
- `user`: Foreign Key to User
- `project`: Foreign Key to Project
- `tags`: Many-to-many with Tag

### Tag
- `id`: Integer (primary key)
- `title`: String (max 128 chars)
- `tag`: String (max 3 chars, uppercase)
- `user`: Foreign Key to User (tags are user-specific)

## Error Handling

### Common HTTP Status Codes
- `200 OK`: Success
- `201 Created`: Resource created
- `400 Bad Request`: Validation error or invalid request
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

### Error Response Format
```json
{
  "detail": "Error message"
}
```

Or for validation errors:
```json
{
  "field_name": ["Error message"]
}
```

## Business Rules

1. **Single Active Timer**: A user can only have one active time entry at a time. Starting a new timer automatically stops any existing active timer.

2. **Project Membership**: Users can only create time entries for projects they are members of.

3. **Tag Ownership**: Users can only use tags they own.

4. **Timer Precision**: Start and end times are stored without microseconds (second precision).

5. **Authentication Required**: All API endpoints except user registration and login require authentication.

## Example Usage Flow

1. **Register/Login** to get authentication token
2. **Get projects** to see available projects
3. **Start timer** with POST to `/api/time_entries/`
4. **Check active timer** with GET to `/api/time_entries/current_active/`
5. **Stop timer** with POST to `/api/time_entries/{id}/stop/`
6. **View time entries** with GET to `/api/time_entries/`

## Development Notes

- The API uses Django REST Framework with drf-spectacular for OpenAPI schema generation
- Swagger UI available at `/api/schema/swagger-ui/`
- Redoc available at `/api/schema/redoc/`
- Time zone is set to Asia/Tehran (UTC+3:30)
- Database is SQLite for development