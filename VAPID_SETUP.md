# VAPID Key Setup for Web Push Notifications

This document explains how to set up VAPID keys for the MOT Check application's push notification system.

## What are VAPID Keys?

VAPID (Voluntary Application Server Identification) keys are required for web push notifications. They consist of a public/private key pair that identifies your application to push services.

## Setup Instructions

### 1. Generate VAPID Keys

Run the VAPID key generation script:

```bash
node scripts/generateVapidKeys.js
```

This will output something like:
```
VAPID Keys Generated:
====================
Public Key: BE6JAJYvz8axk9wUGqlmeJxyhU3bIAIlJYN0WLShP90Z8yDiLDzusz4YiWli6L12pB-kekDf1E6EHKWh765vKE8
Private Key: rjc614mRC1UBnV5Usc0rKfd15R5D6PNkA87uOK66ccI

Add these to your Netlify environment variables:
VAPID_PUBLIC_KEY=BE6JAJYvz8axk9wUGqlmeJxyhU3bIAIlJYN0WLShP90Z8yDiLDzusz4YiWli6L12pB-kekDf1E6EHKWh765vKE8
VAPID_PRIVATE_KEY=rjc614mRC1UBnV5Usc0rKfd15R5D6PNkA87uOK66ccI
VAPID_MAILTO=mailto:your-email@example.com
```

### 2. Local Development Setup

Create a `.env` file in the project root:

```bash
# .env
REACT_APP_VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
```

**Note:** The `.env` file is already in `.gitignore` and will not be committed to version control.

### 3. Production Setup (Netlify)

Add these environment variables to your Netlify site:

1. Go to your Netlify site dashboard
2. Navigate to Site Settings → Environment Variables
3. Add the following variables:

```
VAPID_PUBLIC_KEY=YOUR_PUBLIC_KEY_HERE
VAPID_PRIVATE_KEY=YOUR_PRIVATE_KEY_HERE
VAPID_MAILTO=mailto:your-email@example.com
```

**Important:** Keep the private key secure and never commit it to version control!

## Environment Variables Used

- **Client-side (React):**
  - `REACT_APP_VAPID_PUBLIC_KEY` - Used by the browser to subscribe to push notifications

- **Server-side (Netlify Functions):**
  - `VAPID_PUBLIC_KEY` - Used by server functions
  - `VAPID_PRIVATE_KEY` - Used to sign push notifications (keep secure!)
  - `VAPID_MAILTO` - Contact email for push service providers

## Troubleshooting

### "VAPID public key is not configured" Error

This error occurs when the React app can't find the `REACT_APP_VAPID_PUBLIC_KEY` environment variable.

**Solutions:**
1. Ensure you have a `.env` file with the correct variable
2. Restart your development server after adding the `.env` file
3. Check that the variable name includes the `REACT_APP_` prefix

### Development vs Production Keys

You can use the same VAPID keys for both development and production, or generate separate keys for each environment.

**Same keys (recommended for simplicity):**
- Use the same public/private key pair everywhere

**Separate keys (more secure):**
- Generate different keys for development and production
- Update environment variables accordingly

## Security Notes

- **Never commit the private key** to version control
- **Keep the private key secure** - anyone with it can send push notifications as your app
- **The public key is safe to expose** - it's sent to browsers and push services
- **Use environment variables** for all key storage