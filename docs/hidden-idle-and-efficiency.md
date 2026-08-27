# Hidden Idle Tracking + Efficiency Score (Merged Plan)

End-to-end pipeline: a fully Rust-side, devtools-invisible idle uploader feeds a hardened backend `IdleSession` model whose data drives a persisted, banded `efficiency_score` on `TimeEntry`, surfaced only in the Django admin.

## Why merged
The two features share the same data flow: Rust detects idle → bulk upload → backend persists `IdleSession` → signal recomputes `total_idle_duration` and `efficiency_score`. Doing them together avoids two migrations on `IdleSession`/`TimeEntry`, lets us batch the bulk-insert path with a single recompute, and lines up tests against one consistent slice.

## Component map

```
[user-idle crate]                                [Django admin]
        │                                                ▲
        ▼                                                │ efficiency_badge,
   Rust idle monitor ──► Rust uploader ──► POST add-idle-bulk
                              │                          │
                       app_local_data_dir           IdleSession rows
                       /idle_queue.bin              (+ client_id idempotency)
                                                         │
                                                         ▼
                                               post-bulk recompute
                                               total_idle_duration
                                               efficiency_score
                                                         │
                                                         ▼
                                                 TimeEntry row
```

## Backend changes (`project_FTT`)

### 1. Models + migration (single migration)
- `IdleSession`: add `client_id = UUIDField(null=True, blank=True, db_index=True)` with a partial unique constraint `UniqueConstraint(fields=["time_entry", "client_id"], condition=Q(client_id__isnull=False), name="idlesession_unique_client_id_per_entry")` (`time_entries/models.py` lines 137-172).
- `TimeEntry`: add `efficiency_score = FloatField(null=True, blank=True, db_index=True)` (`time_entries/models.py` lines 59-134).

### 2. New module `time_entries/efficiency.py`
Pure helpers, no Django imports beyond models. Constants tunable without migration:

```python
SHORT_IDLE_LIMIT_SECONDS = 60
FREE_SHORT_IDLES         = 2
PENALTY_PER_SHORT        = 0.02
MAX_PENALTY              = 0.20
```

Public API:
- `compute_efficiency_score(time_entry) -> float | None`
  - Returns `None` if `duration` is null/0.
  - `base_ratio = max(0, (duration_s - idle_s) / duration_s)`.
  - `excess = max(0, short_idles - FREE_SHORT_IDLES)`; `penalty = min(MAX_PENALTY, excess * PENALTY_PER_SHORT)`.
  - `score = round(clamp(base_ratio - penalty, 0, 1) * 100, 2)`.
- `band_for(score) -> "Excellent"|"Good"|"Fair"|"Poor"|"N/A"` (≥90 / 75–89.99 / 50–74.99 / <50 / null).
- `band_color(score) -> hex` for the admin badge.
- `recalculate(time_entry)`: recomputes `total_idle_duration` *and* `efficiency_score` and saves with a single `update_fields=[...]` if values changed.

### 3. New bulk endpoint
- Action `add_idle_bulk` on `TimeEntryViewSet` (`time_entries/api/views.py` lines 331-379):
  - URL: `POST /api/time_entries/{id}/add-idle-bulk/`
  - Body: `{ "sessions": [ { "client_id": "<uuid>", "start_time": "...", "end_time": "..." }, ... ] }` (`client_id` optional but expected from the Rust uploader).
  - Validates with `IdleSessionSerializer(many=True)` (extended to expose `client_id`).
  - Inside `transaction.atomic()`:
    1. Suppress signals via a context manager (`_disconnect_idle_signal()`) so each row doesn't trigger recompute.
    2. `bulk_create(..., ignore_conflicts=True)` against the partial unique index — re-flushes after a partial failure are idempotent.
    3. After the loop, call `efficiency.recalculate(time_entry)` once.
  - Returns `{ "inserted": N, "skipped": M, "total_idle_duration": ..., "actual_duration": ..., "efficiency_score": ... }`.
  - Hard cap: reject `len(sessions) > 500` with 400.

### 4. Signals (`time_entries/signals.py` lines 114-126)
- Replace the body of the existing `update_time_entry_idle_total` to call `efficiency.recalculate(instance.time_entry)` so a single `TimeEntry.save(update_fields=...)` writes both fields atomically.
- New `post_save` receiver on `TimeEntry`: when `end_time` transitions from null to set, call `efficiency.recalculate(instance)` (guarded against recursion by checking the field actually changes and by using `update_fields`).

### 5. Admin (`time_entries/admin.py` lines 501-1289)
- New `efficiency_badge(self, obj)` callable rendering an Unfold pill (`Excellent` green / `Good` blue / `Fair` amber / `Poor` red / `N/A` grey) with the numeric score (e.g. `Good · 82.5%`).
- Add to `list_display` after `duration_display`.
- Add a `SimpleListFilter` for the band buckets.
- Add `efficiency_score` to the change-form fieldsets, read-only.

### 6. Backfill command
- `python manage.py recompute_efficiency` iterates over stopped `TimeEntry`s, calls `efficiency.recalculate`. Safe to re-run after constant tweaks.

### 7. Tests (`time_entries/tests.py`)
- `compute_efficiency_score` unit tests: zero idle → 100; 50% idle → 50; many short idles trigger penalty cap; null duration → None.
- `add_idle_bulk` API tests: happy path; idempotency via duplicate `client_id`; rejects size > 500; rejects bad time ranges; updates both `total_idle_duration` and `efficiency_score` with exactly one `TimeEntry` UPDATE (assert via `CaptureQueriesContext`); ownership enforced.
- Signal regression test: deleting an `IdleSession` lowers idle total and raises score.

## Rust / Tauri changes (`project_ftt_frontend/src-tauri`)

### 1. New module `idle_uploader.rs`
- `IdleSessionRecord { client_id: Uuid, time_entry_id: i64, start_time: DateTime<Utc>, end_time: DateTime<Utc>, attempts: u32 }`.
- `IdleQueue` persisting JSON-lines (or `bincode`) to `app_local_data_dir() / "idle_queue.bin"`. Atomic compaction via `tempfile + rename`. Optional XOR obfuscation with a per-install salt (not advertised as crypto; just keeps casual snooping out).
- Methods: `enqueue`, `peek_batch(n)`, `remove(client_ids)`, `len`.

### 2. Tauri-managed state
- `UploaderConfig { base_url: ArcSwap<String>, auth_token: ArcSwap<Option<String>>, active_time_entry_id: ArcSwap<Option<i64>> }`.
- A long-lived `reqwest::Client` with rustls + 10 s timeout.

### 3. New tauri commands (frontend → Rust only)
- `set_uploader_config(base_url: String, auth_token: Option<String>)` — invoked on login / logout / base-url change.
- `set_active_time_entry(id: Option<i64>)` — invoked on timer start / stop.

These are the *only* JS↔Rust touchpoints for this feature.

### 4. Idle monitor changes (`src-tauri/src/lib.rs` lines 84-147)
- Track `idle_started_at: Option<DateTime<Utc>>`.
- On `became_idle`: stamp `idle_started_at`.
- On `became_active`: if `idle_started_at` set, idle ≥ `IDLE_THRESHOLD_SECONDS`, and `active_time_entry_id` is `Some`, enqueue an `IdleSessionRecord` with a fresh `Uuid::new_v4()`. Reset `idle_started_at`.
- Continue emitting webview events `idle-status-changed` / `idle-status-update` **only when the `devtools` feature flag is on** so production users see nothing in the console.

### 5. Uploader background task
- Separate `tokio::spawn` loop:
  - Sleep 30 s when queue empty, 5 s when non-empty.
  - If `auth_token.is_some()` and queue non-empty:
    - Group up to 100 records by `time_entry_id`.
    - `POST {base_url}/api/time_entries/{id}/add-idle-bulk/` with header `Authorization: Token <token>` and body `{ "sessions": [...] }`.
    - 2xx → `queue.remove(client_ids)`.
    - 4xx (≠ 401, 429) → drop records (bad data / entry deleted) and `log::warn!`.
    - 401 → clear `auth_token`, stop until frontend resets it.
    - 5xx / network / 429 → keep, `attempts += 1`, exponential backoff capped at 5 min.

### 6. Crate dependencies (`src-tauri/Cargo.toml`)
- `reqwest = { version = "0.12", features = ["json", "rustls-tls"] }`
- `uuid = { version = "1", features = ["v4", "serde"] }`
- `arc-swap = "1"`
- `serde_json` (already), `tokio` (already)

## Frontend changes (`project_ftt_frontend/src`) — minimal

1. On app start / token change / base-url change → `invoke("set_uploader_config", ...)` (`src/lib/auth-context.ts`, `src/lib/stores.ts`).
2. On `startTimer` success → `invoke("set_active_time_entry", { id })`; on `stopTimer` success → `invoke("set_active_time_entry", { id: null })` in `src/routes/timer/+page.svelte`.
3. Use the existing Tauri-detection helper in `src/lib/stores.ts` lines 606-669 to silently no-op in browser mode.

No new UI, no new Svelte stores, no new user-facing feature flag. Existing `IdleMonitorDebug.svelte` stays as-is behind `user_idle_monitor_debug`.

## "Hidden" hardening checklist
- No `console.log` / `println!` for the upload path in release builds; use `log::debug!` and `#[cfg(debug_assertions)]` where helpful.
- Disable `tauri-plugin-log`'s `Webview` target for the uploader module so logs don't reach `console.log`.
- Queue file in `app_local_data_dir`, NOT `localStorage` / `IndexedDB` / `tauri-plugin-store` (which are reachable from webview).
- The `reqwest` client runs in the Rust process — its requests do not appear in the webview Network tab.
- Existing `user-idle-monitoring` feature flag still gates the Rust detection loop (kill-switch).

## Test plan
- **Backend unit**: `compute_efficiency_score` boundary cases.
- **Backend integration**: `add_idle_bulk` happy / idempotency / size cap / ownership; assert one `TimeEntry` UPDATE per bulk via `CaptureQueriesContext`; signal regression on delete.
- **Rust unit**: queue persistence (enqueue → restart → drain), backoff schedule, grouping by `time_entry_id`.
- **Manual e2e**:
  1. Start timer, idle 1 min, return → row in DB; admin shows updated badge.
  2. Disconnect network, perform 3 idle cycles, reconnect → all 3 rows in DB after ≤30 s; one badge update per flush.
  3. Kill app mid-offline-flush, restart → queue resumes, no duplicates (relies on `client_id`).
  4. Open webview devtools in a release build → no idle-related Network or Console activity.

## Out of scope
- Always-on (no-timer) activity tracking.
- Per-window / per-app activity attribution.
- Frontend display of efficiency (admin-only).
- Aggregate efficiency widgets in the admin reports view (can be a follow-up).

## Implementation order
1. Backend: single migration (`client_id` + `efficiency_score`).
2. Backend: `efficiency.py` module + unit tests.
3. Backend: extend signal + new TimeEntry signal + tests.
4. Backend: `add_idle_bulk` action with signal-suppress context + tests.
5. Backend: admin badge + filter; backfill command; run on existing data.
6. Rust: state + commands + queue persistence (no upload yet) + unit tests.
7. Rust: uploader loop + backoff.
8. Rust: hook idle monitor → enqueue.
9. Frontend: 3 invoke calls (config + active id set/clear).
10. Manual e2e + devtools-hidden verification in a release build.
