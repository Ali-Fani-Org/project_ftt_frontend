# API Timezone Changes Documentation

## Overview
This document details API-specific timezone-related changes to ensure consistent time handling between backend and frontend, particularly for Asia/Tehran timezone.

## API Changes Made

### 1. Enhanced API Filters
**Problem**: API date filters (`start_time__date`) used UTC-based comparisons, causing inconsistency with frontend expectations.

**Solution**:
- Added new timezone-aware filters to `time_entries/api/filters.py`:
  - `start_date_after_tz`: Filters entries that started on or after given date in Asia/Tehran timezone
  - `start_date_before_tz`: Filters entries that started on or before given date in Asia/Tehran timezone  
  - `end_date_after_tz`: Filters entries that ended on or after given date in Asia/Tehran timezone
  - `end_date_before_tz`: Filters entries that ended on or before given date in Asia/Tehran timezone

**Backward Compatibility**:
- Original UTC-based filters (`start_date_after`, `start_date_before`, etc.) maintained
- Original filters now labeled with "(UTC)" for clarity
- New timezone-aware filters labeled with "(Asia/Tehran)"

### 2. Consistent API Serializer Output
**Problem**: Inconsistent timezone library usage in API serializers.

**Solution**:
- Updated `time_entries/api/serializers.py` to use `zoneinfo.ZoneInfo` instead of older `pytz`
- Both `TimeEntryReadSerializer` and `IdleSessionSerializer` now consistently use `ZoneInfo('Asia/Tehran')`
- All datetime fields in API responses now properly converted to Asia/Tehran timezone

**Before**:
```python
tehran_tz = pytz.timezone('Asia/Tehran')
```

**After**:
```python
tehran_tz = ZoneInfo('Asia/Tehran')
```

### 3. API Response Format
**Change**: API responses now return datetimes formatted in Asia/Tehran timezone using `timezone.localtime()`

**Example Response**:
```json
{
  "id": 1,
  "title": "Sample Entry",
  "start_time": "2025-12-10T01:37:32.042554+03:30",  // Always in Tehran timezone
  "end_time": "2025-12-10T03:37:32.042554+03:30",    // Always in Tehran timezone
  // ... other fields
}
```

## Frontend Integration Guide

### 1. Using Timezone-Aware API Endpoints
When you need Asia/Tehran timezone behavior in date filtering, use the new `_tz` suffixed parameters:

**UTC-based filtering** (original behavior):
```
GET /api/time-entries/?start_date_after=2025-12-10
```

**Timezone-aware filtering** (new, recommended for user-facing features):
```
GET /api/time-entries/?start_date_after_tz=2025-12-10
```

### 2. Handling Datetime Display
- API responses now return all datetime fields converted to Asia/Tehran timezone
- Frontend can directly display these datetimes without additional timezone conversion
- The timezone offset in the datetime strings will reflect Tehran's offset (+03:30)

### 3. Creating/Updating Time Entries
- When sending datetime values to create/update endpoints, consider sending timezone-aware datetimes
- Backend will properly handle timezone conversion for storage

### 4. Date Range Filtering
Use the appropriate filter based on your needs:
- Use UTC filters for system-level reports or when timezone consistency across regions matters
- Use timezone-aware filters `_tz` for user-facing date range selections

## Testing API Endpoints
You can verify the timezone-aware endpoints work correctly by testing API responses and checking that datetime fields reflect the Asia/Tehran timezone.

## Impact on Frontend
- Frontend will receive consistent datetime formatting in Asia/Tehran timezone
- Date filtering can now be done with user timezone awareness using new `_tz` parameters
- Frontend date pickers can now properly align with user expectations in Tehran timezone