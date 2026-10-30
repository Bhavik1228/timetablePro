# TimeTable Pro

TimeTable Pro is a React and TypeScript school timetable planner. The current
browser app provides a standalone timetable editor, local saved timetables, and
optional Firebase email sign-in and per-user timetable sync. School-management
records and the school scheduler service are not yet connected to the visible
planner UI.

## Local development

Use Node.js 24 or newer to run the test suite.

```powershell
npm install
Copy-Item .env.example src\.env
npm run dev
```

Vite is configured to load environment files from `src`. The copied
`src\.env` file is ignored by Git. Set these values there to enable Firebase
Authentication and saved-timetable sync:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `VITE_FIREBASE_STORAGE_BUCKET` (optional)

In Firebase, enable Email/Password Authentication, create a Firestore database,
and deploy the repository's `firestore.rules`. The current rules allow each
authenticated user to access only their own `users/{uid}/timetables` records.
Do not put service-account or service-role credentials in Vite environment
variables.

The Vercel rewrite configuration serves the single-page app for direct visits
to `/signin`, `/signup`, and `/app`, so the client-side routes work after
deployment as well as when navigating from the home page.

## Checks

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The tests use Node's built-in test runner and native TypeScript stripping.

## Persistence and deployment status

- The standalone planner stores its saved timetables in browser storage when
  signed out. When Firebase is configured and the user is signed in, those
  timetables sync to that user's Firestore collection.
- Teachers, classes, subjects, assignments, transition rules, rooms, and school
  settings are stored in browser `localStorage`; they are not synchronized to
  Firestore and are not protected by server-side roles or school/tenant
  boundaries.
- The school-data service adds a missing room list when it reads older records,
  preserving existing school records. There is no migration from the separate
  legacy `schoolCore` data store to the newer school-data model.
- The UI does not yet expose the school-management service or connect its
  generated schedules to draft/publish/version workflows. CSV support and
  backups cover standalone timetables only, not the complete school dataset.

**Deployment decision: local preview only; not production-ready for school
management or multi-user use.** Production deployment requires a school-scoped
repository, server-enforced role authorization and tenant isolation, authenticated
audit history, and a reviewed migration from existing browser data before those
records move to a shared backend. No cloud migration has been performed.
