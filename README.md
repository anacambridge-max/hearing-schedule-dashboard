# Hearing Schedule Dashboard

Professional Next.js dashboard for the supplied Google Sheet.

## Source tabs
- Rough Data
- For Hearing Entry
- Centre Wise Report
- Hearing Schedule Report
- Date wise Report

## Live sync
The app reads the public Google Sheets Visualization endpoint through a Next.js API route and refreshes every 60 seconds. Updates made in the Google Sheet are reflected in the dashboard after the next refresh.

## Deployment
Deploy this repository directly to Vercel. No database is required.

## Google Sheet access
The source sheet should remain shared as **Anyone with the link → Viewer** so the Vercel server can read it.
