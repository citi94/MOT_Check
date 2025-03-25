# MOT History Tracker

A web application that tracks MOT tests for UK vehicles and sends notifications when new MOT tests are recorded. The application leverages MongoDB for server-side monitoring and browser notifications for real-time alerts.

## Features

- **Server-Side Monitoring**: Checks for MOT updates hourly in the background
- **Real-Time Notifications**: Receive notifications when new MOT tests are recorded
- **Client-Side Polling**: Quickly see updates while the browser tab is open
- **Mobile-Friendly Interface**: Works well on desktop and mobile devices

## System Architecture

This application uses a combination of server and client-side technologies to provide real-time MOT test notifications:

### Server Side (Netlify Functions)

- **scheduled-mot-check.js**: Runs hourly to check for MOT updates for all monitored vehicles
- **MongoDB Database**: Stores vehicle information, notification preferences, and MOT history
- **REST API Endpoints**: Allow the client to retrieve data and manage notification preferences

### Client Side (React App)

- **Real-Time Polling**: Checks for updates every 10-300 seconds (configurable by user)
- **Browser Notifications**: Shows alerts when new MOT tests are detected
- **Service Worker**: Enables background notifications even when the browser is closed

## Key Files

- **scheduled-mot-check.js**: The heart of the system - checks MOT API for updates
- **getPendingNotifications.js**: Allows the client to retrieve pending notifications
- **App.jsx**: Main React component for the user interface
- **notificationService.js**: Handles browser notifications and update polling

## Environment Variables

The following environment variables must be set in your Netlify site settings:

- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB_NAME`: Database name
- `TOKEN_URL`: MOT API token URL
- `CLIENT_ID`: MOT API client ID
- `CLIENT_SECRET`: MOT API client secret
- `API_KEY`: MOT API key
- `SCOPE`: MOT API scope

## How It Works

1. **Monitoring Setup**:

   - User enters a vehicle registration and enables notifications
   - The registration is saved to MongoDB with monitoring enabled

2. **Server-Side Checking**:

   - Every hour, the scheduled function queries the MOT API for all monitored vehicles
   - If a new MOT test is detected, it marks the vehicle for notification
   - Details about the new test are stored in MongoDB

3. **Client-Side Polling**:

   - When the app is open, it polls for updates every 10-300 seconds
   - The client only asks "are there updates?" rather than directly querying the MOT API
   - This is much more efficient and reduces API usage

4. **Notification Delivery**:
   - When a new test is detected, a browser notification is shown
   - The notification includes details about the test result
   - Clicking the notification takes the user to the app to see full details

## Performance Considerations

- **Batched Processing**: The server processes vehicles in small batches to avoid API rate limits
- **Cached Authentication**: OAuth tokens are cached to reduce API calls
- **Efficient Polling**: The client only checks for updates rather than fetching full data
- **No-Cache Headers**: All API responses include headers to prevent caching of outdated data

## Troubleshooting

If notifications are not working properly:

1. Make sure notifications are enabled in your browser settings
2. Check that MongoDB is properly connected
3. Verify that the scheduled function is running (check Netlify function logs)
4. Confirm that the MOT API credentials are valid

## Database Structure

The MongoDB database contains a 'notifications' collection with documents in this format:

```json
{
  "registration": "AB12CDE",
  "enabled": true,
  "lastCheckedDate": "2023-12-31T12:00:00.000Z",
  "lastMotTestDate": "2023-06-15T10:30:00.000Z",
  "hasUpdate": false,
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updateDetails": {
    "previousDate": "2023-06-15T10:30:00.000Z",
    "newDate": "2023-12-30T14:20:00.000Z",
    "testResult": "PASSED",
    "vehicle": {
      "make": "Ford",
      "model": "Focus",
      "registration": "AB12CDE",
      "color": "Blue"
    }
  }
}
```

## Development

To set up for local development:

1. Clone the repository
2. Run `npm install`
3. Create a `.env` file with the required environment variables
4. Run `npm run dev` to start the Netlify dev server

## Deployment

The application is designed to be deployed on Netlify with the following features:

- Netlify Functions
- Scheduled Functions (requires Netlify Pro or team plan)
- Environment variables

Make sure to set up all required environment variables in your Netlify site settings.
