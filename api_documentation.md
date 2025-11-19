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

**Description:** Returns a paginated list of all time entries for the authenticated user, sorted by start time (newest first). Uses cursor-based pagination for consistent and efficient results.

**Headers:**
```
Authorization: Token <your_token>
```

**Query Parameters:**
- `cursor` (optional): Cursor for pagination. Use the 'next' or 'previous' cursor from a previous response.
# API Documentation

This document describes the public API surface for this project, including the new Feature Flags subsystem added in the latest commit. The backend uses Django REST Framework and token-based authentication by default.

Base URL
```
http://localhost:8000
```

Authentication

- The API uses token authentication.
- Include an `Authorization` header on protected endpoints:

```
Authorization: Token <your_token>
```

User & Auth endpoints (provided by Djoser)

- `POST /auth/users/` — register a new user
- `POST /auth/token/login/` — obtain `auth_token`
- `GET /auth/users/me/` — current user info (authenticated)

Core API routing notes

- Main router (projects, time entries) is mounted at `/api/` via `config.api_router`.
- The Feature Flags API is mounted separately at `/api/feature-flags/` via `feature_flags.urls` to keep better control over URL structure and custom actions.
- OpenAPI schema endpoints:
  - `GET /api/schema/` — raw OpenAPI JSON/YAML (Spectacular)
  - `GET /api/schema/swagger-ui/` — Swagger UI
  - `GET /api/schema/redoc/` — Redoc UI

Feature Flags API (new)
-----------------------

Base path for feature flags: `/api/feature-flags/`

The feature flags app exposes a ViewSet registered under the `user-features` prefix. The main programmatic endpoints to use from the frontend are:

- `GET /api/feature-flags/user-features/my_features/`
  - Description: Returns the full collection of feature flags for the authenticated user, split into `enabled_features` and `disabled_features`.
  - Auth: required
  - Response (200):

```json
{
  "enabled_features": [
    {
      "id": 1,
      "key": "example-feature",
      "name": "Example Feature",
      "description": "Does something",
      "is_enabled": true,
      "rollout_percentage": 100,
      "user_count": 12,
      "created_at": "2025-11-18T20:10:00Z",
      "updated_at": "2025-11-18T20:30:00Z"
    }
  ],
  "disabled_features": [],
  "total_features": 1
}
```

- `GET /api/feature-flags/user-features/{feature_key}/check/`
  - Description: Check whether the feature identified by `{feature_key}` is enabled for the current user.
  - Notes: The `pk` path parameter is used as the feature *key* (string), not the numeric DB id.
  - Auth: required
  - Successful response (200):

```json
{
  "feature_key": "example-feature",
  "feature_name": "Example Feature",
  "is_enabled": true,
  "feature_enabled_globally": true,
  "user_has_access": true
}
```

  - If not found (404): the response contains an `error` message and `is_enabled: false`.

- `POST /api/feature-flags/user-features/{feature_key}/log-access/`
  - Description: Records that the current user accessed the feature. Useful for analytics / usage tracking. The view will create a `UserFeatureAccess` entry if one does not already exist.
  - Auth: required
  - Request body: none
  - Successful response (200):

```json
{
  "message": "Feature access logged successfully",
  "feature_key": "example-feature",
  "feature_name": "Example Feature"
}
```

Implementation & behavior notes
--------------------------------

- Caching: Several helpers implement caching to improve performance. Default cache timeout is 300 seconds (5 minutes) and can be overridden by the `FEATURE_FLAG_CACHE_TIMEOUT` setting.
  - Cache keys used by the implementation include:
    - `all_feature_flags` — cached list of flags
    - `featureflag_by_key_{key}` — cached flag by key
    - `featureflag_serializer_{id}` — serialized flag cache
    - `featureflag_user_count_{id}` — cached user count for a flag

- Cache invalidation: model signals invalidate relevant keys on `post_save`/`post_delete` for `FeatureFlag` and on `post_save` for `UserFeatureAccess`.

- Feature resolution rules (from `FeatureFlag.is_enabled_for_user`):
  - If `is_enabled` is False => feature disabled for everyone.
  - If `rollout_percentage` >= 100 => user is considered if present in the `users` M2M.
  - Currently rollout logic is simple: user access depends on membership in the flag's `users` relation. (Future percentage-based rollout is planned.)

Data models (feature flags)
---------------------------

- `FeatureFlag` fields (important ones):
  - `id` (int)
  - `name` (string)
  - `key` (string, unique) — used in API calls and URLs (auto-generated from name if empty)
  - `description` (text)
  - `is_enabled` (bool)
  - `rollout_percentage` (int 0-100)
  - `users` (M2M to User) — user-specific assignment
  - `created_at`, `updated_at`

- `UserFeatureAccess` (usage logging):
  - `user`, `feature_flag`, `accessed_at`, `ip_address`, `user_agent`

Admin & management
-------------------

- Feature flags can be managed in the Django admin site (`/admin/`) using the provided `FeatureFlag` model and its serializer for admin operations. Admin create/update operations will invalidate caches as implemented in the serializers and signals.

Other existing APIs (unchanged)
------------------------------

- Projects API: registered via `config.api_router` at `/api/projects/` (see `projects.api.views.ProjectViewSet`).
- Time Entries API: registered via `config.api_router` at `/api/time_entries/` (see `time_entries.api.views.TimeEntryViewSet`).

Common error responses
----------------------

- `200 OK` — success
- `201 Created` — resource created
- `400 Bad Request` — validation error
- `401 Unauthorized` — missing or invalid token
- `404 Not Found` — resource not found
- `500 Internal Server Error` — server error

Error format examples

Validation error example:

```json
{
  "field_name": ["Error message"]
}
```

Generic error example:

```json
{
  "detail": "Error message"
}
```

Quick usage examples
--------------------

1. Authenticate via `POST /auth/token/login/` to obtain `auth_token`.
2. Call `GET /api/feature-flags/user-features/my_features/` to fetch flags for the current user.
3. Use `GET /api/feature-flags/user-features/{feature_key}/check/` client-side to gate behavior.
4. Optionally `POST /api/feature-flags/user-features/{feature_key}/log-access/` to record usage.

Configuration & debugging
-------------------------

- OpenAPI schema (Spectacular) available at `/api/schema/` and interactive UIs at `/api/schema/swagger-ui/` and `/api/schema/redoc/`.
- Feature flag cache TTL: set `FEATURE_FLAG_CACHE_TIMEOUT` in Django settings to override the default 300 seconds.

---

If you want, I can also:

- add example curl / fetch snippets for the feature-flag endpoints,
- generate a small Postman collection JSON for these endpoints, or
- run the test suite for the `feature_flags` app to validate behavior.

