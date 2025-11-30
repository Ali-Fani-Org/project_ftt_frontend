# Cloudflare SSE Configuration Guide

This guide covers the Cloudflare configuration changes needed to support Server-Sent Events (SSE) for the notification system.

## Problem
Server-Sent Events connections are being silently blocked by Cloudflare, causing notifications to fail silently without error messages.

## Cloudflare Settings Required

### 1. WebSocket Support
- Go to your Cloudflare dashboard
- Navigate to **Rules > Transform Rules**
- Ensure WebSocket support is enabled
- For Enterprise customers, enable "HTTP/2 WebSocket" in **Speed > Optimization**

### 2. Network Settings
In **Speed > Network**:
- Enable "0-RTT Connection Resumption"
- Ensure "Early Hints" is configured properly

### 3. Page Rules (if using)
If you have page rules for your API endpoint:
```
tracker.afni.qzz.io/api/notifications/sse/*
- Cache Level: Bypass
- Edge Cache TTL: No Cache
- Browser Cache TTL: No Cache
- Always Use HTTPS: On
```

### 4. Worker/Proxy Settings
If using Cloudflare Workers:
- Ensure the Worker doesn't interfere with SSE endpoints
- Add proper CORS headers for SSE connections
- Disable response buffering for SSE endpoints

### 5. Security Rules
In **Security > Settings**:
- Enable "Browser Integrity Check" if needed
- Configure security levels appropriately
- Add specific rules if necessary:
  ```
  (http.request.uri.path contains "/api/notifications/sse/")
  - Security Level: Essentially Off
  - Cache Level: No Cache
  ```

### 6. SSL/TLS Settings
In **SSL/TLS > Overview**:
- Set encryption mode to "Full (Strict)"
- Enable "Always Use HTTPS"
- Configure "Minimum TLS Version" to 1.2

## Testing Configuration

### Browser Developer Tools
1. Open Network tab
2. Filter for "notifications/sse"
3. Look for:
   - **200 OK** status (not 101, not 408, not 499)
   - **Response Headers** containing:
     ```
     Content-Type: text/event-stream
     Cache-Control: no-cache
     Connection: keep-alive
     ```
   - **No timeout** errors or Cloudflare error pages

### Manual Testing
```bash
curl -i \
  -H "Authorization: Token YOUR_AUTH_TOKEN" \
  -H "Accept: text/event-stream" \
  https://tracker.afni.qzz.io/api/notifications/sse/
```

## Troubleshooting

### Common Issues
1. **504 Gateway Timeout**: Cloudflare proxy timeout
2. **499 Client Closed Request**: Connection closed prematurely
3. **101 Switching Protocols**: Normal WebSocket upgrade (shouldn't happen with SSE)
4. **400 Bad Request**: Incorrect headers or authentication

### Cloudflare-Specific Issues
- **Always Online**: Disable for API endpoints
- **Minification**: Disable for JavaScript APIs
- **Polish**: Disable image optimization for API responses
- **Brotli/Gzip**: Ensure proper compression settings

### Monitoring
- Check Cloudflare Analytics for API endpoint traffic
- Monitor response times and error rates
- Review Cloudflare Logs for specific error patterns

## Implementation Notes
After applying these Cloudflare settings, the notification system should automatically reconnect and start working. The connection should show as "Connected" in the status indicator.