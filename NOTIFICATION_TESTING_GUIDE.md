# Notification System Testing & Troubleshooting Guide

This guide provides step-by-step instructions to test and troubleshoot the notification system, particularly for Cloudflare environments.

## Quick Diagnostic Checklist

### 1. Visual Status Check
1. **Run the Tauri desktop app**
2. **Log in** to get an auth token
3. **Check the notification status indicator** in the navbar:
   - 🟢 **Connected** = Working correctly
   - 🟡 **Connecting** = Connection attempt in progress
   - 🔴 **Error** = Connection failed (likely Cloudflare issue)
   - 🔴 **Disconnected** = Not authenticated or service unavailable

### 2. Browser Console Check
1. **Open Developer Tools** (F12)
2. **Check Console tab** for notification logs
3. **Look for these patterns**:
   ```
   ✅ SUCCESS PATTERNS:
   [NotificationService xxx] ✅ SSE connection opened successfully
   [NotificationService xxx] 📨 Received SSE message: {notification_data}
   [NotificationService xxx] 🎯 showNotification() called
   [NotificationService xxx] ✅ Native notification shown
   
   ❌ ERROR PATTERNS:
   [NotificationService xxx] ❌ Cloudflare timeout - SSE connection timed out
   [NotificationService xxx] ❌ Possible Cloudflare blocking - 403 Forbidden
   [NotificationService xxx] ❌ Connection timeout - Cloudflare may be blocking SSE
   ```

## Step-by-Step Testing Procedure

### Phase 1: Basic Connection Test

1. **Start the Tauri app**
   ```bash
   # In the Tauri project directory
   npm run tauri dev
   ```

2. **Log in** to obtain an auth token

3. **Monitor the status indicator**
   - Should show "Connecting" briefly, then "Connected"
   - If it stays on "Connecting" for >10 seconds, likely Cloudflare blocking

4. **Check console for timeout errors**
   - Look for "Connection timeout after 10000ms" messages
   - If you see this, Cloudflare is likely blocking the SSE connection

### Phase 2: Cloudflare Configuration Check

1. **Verify Cloudflare Dashboard Settings**:
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Select your domain: `tracker.afni.qzz.io`
   - Check these settings:

2. **SSL/TLS Settings**:
   - **SSL/TLS → Overview**:
     - Encryption Mode: "Full (strict)"
     - Always Use HTTPS: ✅ ON
     - Minimum TLS Version: 1.2

3. **Network Settings**:
   - **Speed → Network**:
     - 0-RTT Connection Resumption: ✅ ON
     - WebSocket Support: ✅ ON

4. **Security Settings**:
   - **Security → Settings**:
     - Security Level: "Medium" or lower
     - Browser Integrity Check: ✅ ON (or OFF if having issues)

5. **Page Rules** (if any exist):
   - **Rules → Page Rules**:
     - Ensure no page rules are blocking `/api/notifications/sse/*`

### Phase 3: Manual SSE Testing

Test the SSE endpoint directly using curl:

```bash
# Replace YOUR_AUTH_TOKEN with actual token from browser storage
curl -i \
  -H "Authorization: Token YOUR_AUTH_TOKEN" \
  -H "Accept: text/event-stream" \
  https://tracker.afni.qzz.io/api/notifications/sse/

# Expected response (if working):
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Transfer-Encoding: chunked

# Then stream continues with notification data...

# Problematic responses (if Cloudflare blocking):
HTTP/1.1 408 Request Timeout
HTTP/1.1 499 Client Closed Request  
HTTP/1.1 403 Forbidden
HTTP/1.1 502 Bad Gateway
HTTP/1.1 504 Gateway Timeout
```

### Phase 4: Cloudflare Analytics Check

1. **Go to Analytics tab** in Cloudflare dashboard
2. **Check API traffic** for `/api/notifications/sse/*`
3. **Look for**:
   - Error rates
   - Response times (>1000ms indicates Cloudflare interference)
   - Status codes (should be mostly 200, not 408/499/502/504)

### Phase 5: Advanced Cloudflare Configuration

If basic settings don't work, try these advanced configurations:

#### Option A: Worker Rule (Advanced)
1. **Go to Workers & Pages**
2. **Create a new Worker** if needed
3. **Configure to bypass Cloudflare for SSE**:
   ```javascript
   export default {
     async fetch(request, env, ctx) {
       if (request.url.includes('/api/notifications/sse/')) {
         // Bypass Cloudflare processing for SSE
         return fetch(request);
       }
       return fetch(request);
     }
   };
   ```

#### Option B: Transform Rules
1. **Rules → Transform Rules**
2. **Modify Response Headers**:
   - Name: `X-Accel-Buffering`
   - Value: `no`
   - For URLs matching: `*/api/notifications/sse/*`

#### Option C: Custom Headers
1. **Rules → Transform Rules**  
2. **Modify Response Headers**:
   - Add headers to disable Cloudflare features for SSE:
   ```
   Cache-Control: no-cache, no-store
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   ```

## Error Diagnosis & Solutions

### Error: "Connection timeout after 10000ms"
**Cause**: Cloudflare is blocking/buffering the SSE connection  
**Solution**: 
1. Enable WebSocket support in Cloudflare
2. Add page rule to bypass cache for SSE endpoint
3. Check security level settings

### Error: "Possible Cloudflare blocking - 403 Forbidden"
**Cause**: Cloudflare security rules are blocking the request  
**Solution**:
1. Reduce security level temporarily
2. Add WAF rule to allow the SSE endpoint
3. Check if Cloudflare "Bot Fight Mode" is enabled

### Error: "Cloudflare proxy timeout - 408"
**Cause**: Cloudflare's proxy timeout (usually 100 seconds for free tier)  
**Solution**: 
1. This shouldn't happen with proper SSE, indicates buffering issue
2. Enable "Always Online" = OFF for API endpoints
3. Contact Cloudflare support if persists

### Status: "Connecting" indefinitely
**Cause**: SSE connection hanging through Cloudflare  
**Solution**:
1. Check if the connection eventually times out
2. If yes, apply Cloudflare SSE configuration
3. If no timeout, check for infinite loading in browser

## Monitoring & Debugging

### Real-time Console Monitoring
1. **Keep console open** during testing
2. **Watch for new notification logs**:
   ```
   [NotificationService xxx] connect() called
   [NotificationService xxx] Starting connection attempt
   [NotificationService xxx] Response status: 200 OK
   [NotificationService xxx] ✅ SSE connection opened successfully
   ```

### Network Tab Monitoring
1. **Open Network tab** in DevTools
2. **Filter by "notifications/sse"**
3. **Look for**:
   - ✅ **200 OK** responses (good)
   - ❌ **408/499/502/504** responses (Cloudflare issues)
   - ⏱️ **Long response times** (>1s indicates Cloudflare interference)

### Testing Notifications
Once connection is established, test actual notifications:

1. **Create a test notification** from the backend
2. **Watch console** for:
   ```
   [NotificationService xxx] 📨 Received SSE message: {notification_data}
   [NotificationService xxx] 📱 Calling show_notification
   [NotificationService xxx] ✅ Native notification shown
   ```

3. **Check if native notification appears** in your desktop environment

## Validation Checklist

✅ **All systems operational when**:
- [ ] Notification indicator shows "Connected" (🟢)
- [ ] Console shows successful SSE connection
- [ ] No timeout/Cloudflare error messages
- [ ] Manual SSE test returns 200 OK with text/event-stream
- [ ] Actual notifications appear when created
- [ ] Network tab shows healthy SSE connection

❌ **Immediate Cloudflare intervention needed if**:
- [ ] Consistently getting 408/499/502/504 errors
- [ ] SSE test hangs or times out
- [ ] Console shows "Cloudflare blocking" messages
- [ ] Indicator stuck in "Connecting" state indefinitely

## Emergency Workarounds

If Cloudflare configuration doesn't resolve the issue:

1. **Bypass Cloudflare for testing**:
   - Temporarily set DNS to direct IP (not through Cloudflare)
   - Test if notifications work without Cloudflare

2. **Alternative notification methods**:
   - Implement polling fallback
   - Use WebSocket instead of SSE
   - Switch to push notifications via Service Worker

3. **Contact Cloudflare Support**:
   - Provide this diagnostic information
   - Request SSE/WebSocket support verification
   - Ask about enterprise-grade streaming support

## Next Steps After Fix

Once notifications are working:

1. **Enable auto-reconnection** in production
2. **Monitor Cloudflare analytics** for ongoing issues  
3. **Set up alerting** for notification service failures
4. **Document** your final Cloudflare configuration
5. **Test periodically** to ensure continued operation