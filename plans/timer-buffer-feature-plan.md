# Timer 60-Minute Buffer Feature Plan

## Overview

This plan outlines the implementation of a 60-minute buffer feature for the time tracker page, allowing users to specify a custom start time when creating a new time entry. According to the API documentation, the start time can be set up to 60 minutes in the past.

## API Reference

From `api_documentation.md`:

### Start Time Validation Rules
- Cannot be in the future
- Cannot be more than 60 minutes in the past (configurable via `TIME_ENTRY_MAX_START_TIME_PAST_MINUTES` setting)
- Cannot overlap with existing time entries
- If an active time entry already exists, the request will be rejected

### Request Body
```json
{
    "title": "Task Title",
    "description": "Optional description",
    "project": 1,
    "tags": [1, 2],
    "start_time": "2025-11-29T16:30:00.000Z"  // Optional - ISO 8601 format
}
```

### Error Responses
```json
{
    "start_time": ["Start time cannot be in the future."]
}
```
```json
{
    "start_time": ["Start time cannot be more than 60 minutes in the past."]
}
```
```json
{
    "start_time": ["This start time overlaps with an existing time entry."]
}
```

## Implementation Plan

### 1. UI Design

#### Location
The custom start time option will be placed in the **Advanced Options** section of the timer start form, alongside the description field.

#### UI Components

```
Advanced Options
    |
    +-- Description (textarea) - existing
    |
    +-- Start Time (new)
        |
        +-- Toggle: "Start from now" (default) / "Custom start time"
        +-- When "Custom start time" is selected:
            +-- Date picker (defaults to today)
            +-- Time picker (defaults to current time minus a few minutes)
            +-- Quick select buttons: "15 min ago", "30 min ago", "45 min ago", "60 min ago"
            +-- Visual indicator showing allowed range (last 60 minutes)
```

#### Visual Design Elements

1. **Toggle Switch**: A switch to enable/disable custom start time
   - Default: OFF (start from now)
   - When ON: Shows the time picker UI

2. **Time Input**: A datetime-local input or separate date/time inputs
   - Shows current time by default
   - Limited to the last 60 minutes

3. **Quick Select Buttons**: Pills/chips for common offsets
   - "15 min ago"
   - "30 min ago"
   - "45 min ago"
   - "60 min ago"

4. **Validation Feedback**:
   - Green checkmark when time is valid
   - Yellow warning when time is approaching the 60-minute limit
   - Red error when time exceeds 60 minutes or is in the future

5. **Visual Timeline**: A small progress bar showing where the selected time falls within the allowed 60-minute window

### 2. State Management

```typescript
// New state variables
let useCustomStartTime = $state(false);
let customStartTime = $state<Date | null>(null);
let startTimeValidationError = $state<string | null>(null);
```

### 3. Frontend Validation

```typescript
function validateStartTime(selectedTime: Date): { valid: boolean; error?: string } {
    const now = new Date();
    const diffMs = now.getTime() - selectedTime.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    
    // Check if in the future
    if (diffMs < 0) {
        return { valid: false, error: 'Start time cannot be in the future.' };
    }
    
    // Check if more than 60 minutes in the past
    if (diffMinutes > 60) {
        return { valid: false, error: 'Start time cannot be more than 60 minutes in the past.' };
    }
    
    return { valid: true };
}
```

### 4. API Client Update

Update the `timeEntries.start` function to accept an optional `start_time` parameter:

```typescript
// In src/lib/api.ts
start: async (data: {
    title: string;
    description?: string;
    project: number;
    tags?: number[];
    start_time?: string;  // NEW: ISO 8601 datetime string
}) => {
    // ... existing code
}
```

### 5. Error Handling

Handle API validation errors and display them to the user:

```typescript
// In the start timer handler
try {
    const payload: any = {
        title,
        description,
        project: selectedProject
    };
    
    if (useCustomStartTime && customStartTime) {
        payload.start_time = customStartTime.toISOString();
    }
    
    activeEntry = await timeEntries.start(payload);
    // ... success handling
} catch (err: any) {
    // Handle field-specific errors
    if (err.response?._data?.start_time) {
        startTimeValidationError = err.response._data.start_time[0];
    } else {
        error = 'Failed to start timer';
    }
}
```

## UI Mockup

```
+------------------------------------------+
|  Ready to start tracking?                |
|  Start a new timer session               |
+------------------------------------------+
|                                          |
|  Task Title                              |
|  +------------------------------------+  |
|  | What are you working on?           |  |
|  +------------------------------------+  |
|                                          |
|  Project                                 |
|  +------------------------------------+  |
|  | Select a project                   v|  |
|  +------------------------------------+  |
|                                          |
|  [v] Advanced Options                    |
|  +--------------------------------------+
|  | Description (optional)               |
|  | +----------------------------------+ |
|  | | Additional details...            | |
|  | +----------------------------------+ |
|  |                                      |
|  | Start Time                           |
|  | [OFF] Use custom start time          |
|  |                                      |
|  | When toggled ON:                     |
|  | +----------------------------------+ |
|  | | 02/24/2026  [16:30]              | |
|  | +----------------------------------+ |
|  |                                      |
|  | Quick select:                        |
|  | [15 min] [30 min] [45 min] [60 min]  |
|  |                                      |
|  | Allowed range: [=================]  |
|  |               ^-- 60 min ago         |
|  |                                      |
|  | ! Start time cannot be more than     |
|  |   60 minutes in the past             |
|  +--------------------------------------+
|                                          |
|  [    > Start Timer    ]                 |
|                                          |
+------------------------------------------+
```

## Component Structure

### New Components

1. **StartTimePicker.svelte** (optional, can be inline)
   - Props: `bind:value`, `disabled`, `error`
   - Features: datetime input, quick select buttons, validation display

### Modified Components

1. **timer/+page.svelte**
   - Add state for custom start time
   - Add UI in advanced options section
   - Update `onStartTimer` to include start_time
   - Add validation logic

2. **api.ts**
   - Update `timeEntries.start` type definition

## Validation Rules Summary

| Condition | Valid? | Error Message |
|-----------|--------|---------------|
| Time is in the future | No | "Start time cannot be in the future." |
| Time > 60 min in the past | No | "Start time cannot be more than 60 minutes in the past." |
| Time overlaps with existing entry | No | "This start time overlaps with an existing time entry." |
| Time within 0-60 min in the past | Yes | - |
| Time is now (default) | Yes | - |

## Responsive Design Considerations

- On mobile: Quick select buttons should wrap nicely
- Time input should be touch-friendly
- Error messages should be clearly visible on small screens

## Accessibility

- Use proper labels for all inputs
- Provide aria-describedby for error messages
- Ensure keyboard navigation works
- Use semantic HTML elements

## Testing Checklist

- [ ] Start timer with default (now) start time
- [ ] Start timer with custom start time (15 min ago)
- [ ] Start timer with custom start time (exactly 60 min ago)
- [ ] Attempt to start timer with time > 60 min ago (should fail)
- [ ] Attempt to start timer with future time (should fail)
- [ ] Verify API error messages are displayed
- [ ] Test quick select buttons
- [ ] Test on mobile viewport
- [ ] Test keyboard navigation
- [ ] Test offline behavior (should disable custom start time)

## Implementation Steps

1. **Step 1**: Update API client (`src/lib/api.ts`)
   - Add `start_time` to the start function type

2. **Step 2**: Add state variables in timer page
   - `useCustomStartTime`
   - `customStartTime`
   - `startTimeValidationError`

3. **Step 3**: Add UI components
   - Toggle switch in advanced options
   - Time input field
   - Quick select buttons
   - Validation feedback display

4. **Step 4**: Implement validation
   - Client-side validation function
   - Real-time validation feedback

5. **Step 5**: Update start timer handler
   - Include start_time in API call when custom time is set
   - Handle API validation errors

6. **Step 6**: Style and polish
   - Ensure responsive design
   - Add animations/transitions
   - Test accessibility

## Files to Modify

1. `src/lib/api.ts` - Add start_time parameter
2. `src/routes/timer/+page.svelte` - Main implementation

## Optional Future Enhancements

- Remember last used custom start time offset
- Show preview of calculated duration before starting
- Add timezone indicator
- Support for recurring time offsets