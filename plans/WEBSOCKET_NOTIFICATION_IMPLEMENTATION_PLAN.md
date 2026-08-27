# Frontend WebSocket Notification Implementation Plan

**Date:** 2026-08-26  
**Status:** Approved for implementation

## Frontend steps

1. Replace `src/lib/notifications.ts` polling logic with a single WebSocket connection manager.
2. Convert the configured HTTP API URL to `ws`/`wss` and connect to `/ws/notifications/`.
3. Implement the backend-approved handshake authentication without placing the long-lived token in a URL.
4. Add typed validation for `ready`, `notification`, `notification_ack_result`, `presence`, `pong`, and `error` messages.
5. Track disconnected, connecting, connected, reconnecting, and authentication-failed states.
6. Enforce one active socket and one reconnect timer.
7. Add exponential reconnect backoff with jitter, maximum delay, offline pause, and online resume.
8. Validate notification UUIDs and payloads before display.
9. Add bounded deduplication using stable notification UUIDs.
10. Display the native Tauri notification first, then send `notification_ack` after successful display.
11. Queue and retry ACKs after temporary disconnects without opening a separate connection per ACK.
12. Respond to server ping messages and optionally send application-level pings for presence and latency.
13. Expose WebSocket/presence state to the UI if needed.
14. Clean up sockets, timers, listeners, and subscriptions on logout, disconnect, teardown, token changes, URL changes, and network loss.
15. Audit the Tauri display path so a single server event produces one OS notification.
16. Remove polling-specific state, timers, URLs, logging, and tests.
17. Add tests for authentication, URL conversion, single-connection behavior, parsing, validation, deduplication, display-before-ACK, ACK retry, ping/pong, heartbeat timeout, backoff, offline handling, and cleanup.

## Protocol behavior

- Notifications use a stable server-generated UUID.
- Duplicate notification messages must not create duplicate native notifications.
- A notification is acknowledged only after native display succeeds.
- ACKs are idempotent and may be retried after reconnect.
- The database-backed server replay is authoritative after reconnect.
- Device network availability and authenticated WebSocket connectivity are separate states.

## Verification

- Test app restart and reconnect replay.
- Test network interruption and recovery.
- Test Redis/server restart recovery.
- Test burst notifications and duplicate frames.
- Test the production-like proxy and firewall path.
- Confirm idle clients create no recurring HTTP polling requests.
