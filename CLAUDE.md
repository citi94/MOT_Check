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
- OAuth token caching with 55-minute expiry (5-minute buffer)
- All API calls include 10-second timeouts
- Comprehensive error handling for rate limits and API failures

### Scheduled Function
- Configured in `netlify.toml` to run `@hourly`
- Processes vehicles in batches to avoid rate limits
- Updates MongoDB with new MOT test data and sets notification flags

### Client Polling System
- Configurable interval (10-300 seconds) via `UpdatePoller` class
- Includes error tracking and backoff for failed requests
- Always calls `onPollComplete` callback to update "Last checked" timestamp

### Security Measures
- JSON parsing with error handling in all functions
- Input validation for vehicle registrations
- Environment variable validation on function startup
- CORS headers and Content Security Policy in `netlify.toml`

### Deployment Configuration
- Functions deployed to `/.netlify/functions/`
- API redirects configured: `/api/*` → `/.netlify/functions/*`
- No-cache headers for all API endpoints
- Service worker cache control for offline functionality