# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm run dev` - Start Netlify dev server for local development (includes serverless functions)
- `npm start` - Start React development server only (without functions)
- `npm run build` - Build React app for production
- `npm test` - Run React tests

### Package Management
- `npm audit fix` - Fix security vulnerabilities in dependencies
- `npm audit fix --force` - Force fix vulnerabilities (may include breaking changes)

## Architecture Overview

This is a **full-stack MOT History Tracker** with both client-side React app and server-side Netlify Functions. The system operates on a **dual-monitoring architecture**:

### Core Architecture Pattern
1. **Server-side hourly monitoring** via scheduled Netlify function
2. **Client-side real-time polling** for immediate updates when app is open
3. **MongoDB state synchronization** between server checks and client requests

### Key Data Flow
- `scheduled-mot-check.js` (hourly) → MOT API → MongoDB → `getPendingNotifications.js` → React client
- React client polls `getPendingNotifications.js` every 10-300 seconds for updates
- All MOT API calls are server-side only; client never directly accesses MOT API

### Serverless Functions Architecture
Functions are organized in `/netlify/functions/` with specific responsibilities:

**MOT API Integration Functions:**
- `getMotHistory.js` - Fetch vehicle MOT data
- `renewToken.js` - Handle OAuth token refresh
- `scheduled-mot-check.js` - Hourly background checker (scheduled function)
- `checkMotUpdates.js` - Check for updates for specific vehicle

**Database Management Functions:**
- `enableNotification.js` - Add vehicle to monitoring
- `disableNotification.js` - Remove vehicle from monitoring  
- `getMonitoredVehicles.js` - List all monitored vehicles
- `getPendingNotifications.js` - Get updates for client polling

**Common Utilities:**
- `utils/mongodb.js` - Database connection with connection pooling and timeouts

### Frontend Architecture
React app (`/src/`) with service-based architecture:

**Core Components:**
- `App.jsx` - Main app with polling logic and state management
- `components/` - UI components for registration input, MOT history display, notifications

**Services:**
- `services/motApi.js` - Client-side API calls to Netlify functions
- `services/notificationService.js` - Browser notification handling and update polling logic
- `services/pushNotificationService.js` - Web Push notification management and iOS Safari compatibility

### Critical Environment Variables
All functions validate required environment variables on startup:
- MOT API credentials: `TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET`, `API_KEY`, `SCOPE`
- Database: `MONGODB_URI`, `MONGODB_DB_NAME`

### Error Handling Standards
All serverless functions use standardized error format:
```json
{
  "error": true,
  "message": "User-friendly message",
  "code": "ERROR_CODE",
  "timestamp": "ISO string",
  "details": {}
}
```

## Important Implementation Details

### MongoDB Connection Pattern
- Uses connection caching across function invocations
- Includes connection timeouts (10s connection, 45s socket, 10s server selection)
- Connection pool configuration (5-10 connections)

### MOT API Integration
- **NEW**: Centralized token management via `utils/tokenManager.js`
- **NEW**: Race condition protection for token renewal
- OAuth token caching with 55-minute expiry (5-minute buffer)
- All API calls include 10-second timeouts
- Comprehensive error handling for rate limits and API failures

### Scheduled Function
- Configured in `netlify.toml` to run `@hourly`
- Processes vehicles in batches to avoid rate limits
- **FIXED**: Now properly sets `hasUpdate: true` flag when new MOT tests detected
- Updates MongoDB with new MOT test data and notification flags

### Client Polling System
- Configurable interval (10-300 seconds) via `UpdatePoller` class
- Includes error tracking and backoff for failed requests
- Always calls `onPollComplete` callback to update "Last checked" timestamp

### Security Measures
- **NEW**: `renewToken.js` now requires Bearer token authentication
- **NEW**: Removed hardcoded VAPID keys, uses environment variables
- JSON parsing with error handling in all functions
- Input validation for vehicle registrations
- Consistent environment variable validation across all functions
- CORS headers and Content Security Policy in `netlify.toml`

### Performance Optimizations
- **NEW**: Optimized index creation in `subscribeToPushNotifications.js`
- **NEW**: Centralized token management prevents duplicate API calls
- **NEW**: Race condition protection for concurrent requests

### Deployment Configuration
- Functions deployed to `/.netlify/functions/`
- API redirects configured: `/api/*` → `/.netlify/functions/*`
- No-cache headers for all API endpoints
- Service worker cache control for offline functionality

## Recent Bug Fixes and Improvements (2024)

### Critical Bug Fix: Notification System
- **Issue**: `scheduled-mot-check.js` wasn't setting `hasUpdate: true` flag
- **Impact**: Push notifications were completely broken
- **Fix**: Added proper flag setting with `updateDetectedAt` timestamp
- **Status**: ✅ FIXED - Notifications now work correctly

### Security Improvements
- **Issue**: `renewToken.js` was publicly accessible without authentication
- **Fix**: Added Bearer token authentication requirement
- **Issue**: Hardcoded VAPID keys in client-side code
- **Fix**: Moved to environment variables with proper validation

### Performance Optimizations
- **Issue**: Index creation happening on every function call
- **Fix**: Added check for existing indexes before creation
- **Issue**: Race conditions in token management
- **Fix**: Centralized token management with proper locking

### Code Quality Improvements
- **Issue**: Inconsistent token management across functions
- **Fix**: Created shared `utils/tokenManager.js` utility
- **Issue**: Missing API timeouts in some functions
- **Fix**: Standardized 10-second timeouts across all MOT API calls
- **Issue**: Inconsistent environment variable validation
- **Fix**: Added `MONGODB_DB_NAME` validation to all MongoDB functions

### New Utilities Added
- `netlify/functions/utils/tokenManager.js` - Centralized MOT API token management
- Enhanced error handling and logging throughout the system
- Improved race condition protection for concurrent requests

### iOS Safari Push Notification Support (December 2024)
- **Issue**: iOS Safari 18.5+ shows "device not up to date" for push notifications
- **Root Cause**: iOS Safari requires Web Push API (PushManager/Notification) but only exposes these APIs when app is added to home screen
- **Fix**: Added comprehensive iOS Safari detection and user guidance
- **Implementation**: 
  - Enhanced `isPushSupported()` with detailed API availability checks
  - Added `isPushReady()` function for service worker readiness verification
  - Improved `NotificationToggle` component with iOS-specific messaging
  - Added diagnostic logging for troubleshooting push support issues
- **User Experience**: Clear instructions to "Add to Home Screen" for push notifications, with alternative workflow for browser-only usage
- **Status**: ✅ RESOLVED - iOS users now get proper guidance instead of confusing error messages

## iOS Safari Push Notification Limitations

### Important Notes for iOS Safari Users:
- **iOS Safari 18.5+**: Web Push API (PushManager/Notification) only available when app is added to home screen
- **Workaround**: App functions normally in browser mode, just without push notifications
- **Full Support**: Add to home screen → Web Push API becomes available → Push notifications work
- **Server Monitoring**: Hourly checks continue regardless of push notification support
- **Detection**: App automatically detects iOS Safari limitations and provides appropriate guidance