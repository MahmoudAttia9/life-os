# Life OS

Life OS is a personal life management web app built with Vanilla HTML/CSS/JS + Firebase.

## Features

- Firebase Auth (Email/Password)
- Firestore sync for daily tracking data
- Firebase Storage profile photo upload
- Dashboard with score rings, streak, and heatmaps
- Worship, Work, Reading, Fitness, and Stats pages
- Pomodoro timer with browser notifications

## Project Structure

- `index.html` : Main SPA page
- `auth.html` : Login/Register page
- `main.css` : Global styling and responsive rules
- `firebase.js` : Firebase setup + helpers
- `app.js` : SPA logic and UI behavior
- `firestore.rules` : Firestore security rules

## Firebase Setup

1. Create a Firebase project.
2. Enable Authentication:
- Provider: Email/Password.
3. Enable Firestore Database (production mode recommended with rules from this repo).
4. Enable Firebase Storage.
5. In `firebase.js` and `auth.html`, set your Firebase config.

## Run Locally

This project is static and can run with any local server.

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```
2. Login:
```bash
firebase login
```
3. Initialize hosting in project root:
```bash
firebase init hosting
```
- Select your Firebase project
- Public directory: `.`
- Single-page app rewrite: `Yes`
- Do not overwrite existing files

4. Serve locally:
```bash
firebase emulators:start --only hosting
```
or
```bash
firebase serve
```

## Deploy to Firebase Hosting

1. Deploy Firestore rules:
```bash
firebase deploy --only firestore:rules
```
2. Deploy hosting:
```bash
firebase deploy --only hosting
```

## Notes

- The app uses ES Modules, so keep script tags as `type="module"`.
- Browser notifications for Pomodoro require user permission.
- If you change folder structure, update paths in `index.html` and `auth.html`.
