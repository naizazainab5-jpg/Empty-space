# EmptySpace

EmptySpace is a React and Vite app for finding spaces in Kerala. Firebase Authentication and Cloud Firestore are wired into the app, but the project is **not connected to a Firebase project until you complete the setup below**.

## Start the app

```bash
npm install
npm run dev
```

The public site keeps its existing search and visual design. Public results come only from approved Firestore `spaces` documents. If Firebase is not configured, or Firestore returns an error, the app shows an explicit message and does not fall back to the old illustrative `src/spaces.json` records.

## Configure Firebase manually

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. In **Project settings → General → Your apps**, register a Web app and copy its Firebase web configuration.
3. Copy `.env.example` to `.env.local` in the project root. Fill in the six `VITE_FIREBASE_*` values from the Web app configuration. These are client configuration values, not service-account credentials. Do not put service-account JSON, private keys, or Admin SDK secrets in any `VITE_` variable.
4. In **Authentication → Sign-in method**, enable **Email/Password**. Configure the email verification and password reset templates, then add `localhost` and your deployed domain to **Authorized domains**.
5. In **App Check**, register the web app with reCAPTCHA v3 and add its site key as `VITE_FIREBASE_APP_CHECK_SITE_KEY` in `.env.local`. Public proposals use an App-Check-enforced callable function; do not accept live public submissions before configuring App Check.
6. In **Firestore Database**, create a database. In **Storage**, get started and create the project's default bucket. Copy its bucket name into `VITE_FIREBASE_STORAGE_BUCKET` in `.env.local`; never add a service-account key or other private key to a `VITE_` setting. Firebase may require a billing plan for Storage, depending on your project and current Firebase plan. In **Cloud Functions**, enable the service and the billing required for deploying functions. From the project root, deploy the restrictive Firestore and Storage rules, indexes, and trusted functions:

   ```bash
   npx firebase-tools login
   npx firebase-tools use <your-firebase-project-id>
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage,functions
   ```

   The deployment command uses the active Firebase CLI project. Confirm the project ID before deploying.
7. Restart `npm run dev` after editing `.env.local`. The app should then be able to contact Firebase. A successful build alone does not establish that credentials, Authentication, Firestore, rules, App Check, or functions are configured correctly.

Storage rules make uploaded space photos publicly readable, but only the matching signed-in owner may upload or replace files in their own `spaces/{uid}/{submissionId}/` folder. Files must be JPEG, PNG, or WebP and no larger than 5 MB. Owners can delete their own files; only an administrator can delete another owner's files. The rules do not make identity documents public or accept them as uploads.

### Public proposals and owner listings

Select **List a Space** in the public-site header, or open `/list-a-space` directly. This public proposal form does not require an owner account and collects no submitter contact details. If authenticated, only the Firebase UID is attached; otherwise the callable generates a random anonymous submission identifier. Proposals go to `space_submissions`, never directly to public `spaces`. Exact addresses, coordinates, and evidence links are only available to authorized reviewers.

The admin proposal review is at `/admin/submissions` and uses the existing administrator custom claim. Approval runs in a trusted Cloud Function, validates criteria, records review history, and publishes a public-safe listing once. App Check and server-side daily submission limits provide abuse controls. Reviewers must independently verify evidence and eligibility; automated checks do not establish occupancy, safety, or legal rights.

The separate owner portal remains at `/owner` and `/owner/list-space`. Owners manage their own authenticated property submissions and availability in that portal.

For local emulator development, add `VITE_USE_FIREBASE_EMULATORS=true` to `.env.local`, use non-empty placeholder Firebase web-app settings, and start the Auth, Firestore, Functions, and Storage emulators before running `npm run dev`. The Storage emulator uses port `9199`. Do not enable the emulator flag when using a production Firebase project.

## Roles and routes

- **Visitor:** `/` and the public search. Can submit a proposal at `/list-a-space` and read approved public-safe `spaces`, active OpenStreetMap `public_places`, and privacy-safe crowd reports. Cannot read proposal queues, owner submissions, users, bookings belonging to others, flags, or verification records.
- **Owner:** `/owner` and `/owner/list-space`. Owners register and sign in with their own Firebase email and password, can request password reset, and must verify email before submitting. A new owner receives no admin claim. Owners can read only their own submissions, edit a limited set of fields while pending, and update declared availability for their own approved listings.
- **Administrator:** `/admin` and `/admin/submissions`. No public admin registration or public admin link exists. The route checks the Firebase ID token's `admin` custom claim, and Firestore rules separately enforce that claim. The dashboard reviews public proposals and owner submissions, imports/removes OSM records, reviews flags, and reads protected verification records. Publication uses trusted Cloud Functions; client SDK writes to approved `spaces` are denied.

The route checks are only a user-interface convenience. The actual boundaries are in `firestore.rules`; an owner cannot assign claims, approve their own listing, write public listing data, or access another owner's records.

## Grant the first administrator securely

1. Register the intended administrator through `/owner` and verify the email. This registration does **not** make them an administrator.
2. Copy that account's Firebase UID from **Authentication → Users** in the Firebase Console. Do not use an email address as the role check.
3. On a trusted administrator workstation, sign in to Google Cloud ADC with an identity that has permission to update Firebase Authentication custom claims:

   ```bash
   gcloud auth application-default login
   ```

4. From the project root, grant or revoke the claim:

   ```bash
   node scripts/manage-admin-claim.mjs <your-firebase-project-id> <user-uid> grant
   node scripts/manage-admin-claim.mjs <your-firebase-project-id> <user-uid> revoke
   ```

   Keep Google credentials outside the repository. After a claim change, the administrator should sign out and sign in again so Firebase issues a fresh token. Review the project ID and UID before running the script.

## Firestore data model

| Collection | Purpose and access |
| --- | --- |
| `users/{uid}` | Owner account profile. The account owner and administrators can read it; owners cannot assign roles. |
| `owner_submissions/{submissionId}` | Private owner email, street address, coordinates, submitted listing details, review status, and timestamps. The owner and administrators can read it. New records must be `pending`. |
| `space_submissions/{submissionId}` | Public-form proposal with private address/coordinates/evidence, submitter UID or server-generated anonymous ID, criteria checks, review status, reviewer notes/ID/time. Only administrators can read it; creation and review happen in trusted Cloud Functions. `review_history/{eventId}` records each decision. |
| `space_submission_limits/{limitId}` | Server-only daily proposal throttles; clients cannot read or write. |
| `space_submission_dedupe/{key}` | Server-only normalized name/district/locality index used to flag possible duplicates for human review. |
| `spaces/{spaceId}` | Public-safe approved listing. Does not contain submitter contact, exact address, exact coordinates, or evidence links. Only trusted Cloud Functions publish proposals. An owner can update only declared availability fields for their own approved listing. Approval is not the same as independent verification. |
| `bookings/{bookingId}` | Private authenticated booking requests, with customer UID, space ID, requested times, total, and status. The customer, the listing owner, and administrators have scoped access. |
| `availability_records/{submissionId}` | Private owner-declared schedule, kept separate from confirmed bookings. Only the owner of that approved listing and administrators may read it. |
| `crowd_reports/{reportId}` | Public-safe observation (`quiet`, `some_activity`, or `busy`), space ID, and observation timestamp only. Client writes are disabled; a trusted administrator/backend process must ingest reports. The UI says **Unknown** when fewer than three reports are available in the last hour or the read fails. |
| `space_verification_records/{recordId}` | Protected verification status and internal review notes. Administrators only. This version does not upload identity documents. |
| `report_flags/{flagId}` | Authenticated report reason/details and review status. Only administrators can read or review these records. |
| `public_places/{osm_element_id}` | Public OpenStreetMap records with stable source IDs, coordinates, category/access tags, attribution, and last-checked timestamp. These are nearby places, not bookable spaces or vacancy claims. |

### Proposal acceptance and publication

- `functions/domain/submissionCriteria.mjs` is shared by the public form and Cloud Functions. It checks required fields, Kerala coordinates and districts, access restrictions, permitted activities, availability confirmation date, and public/private pricing consistency.
- Similar name/district/locality submissions and missing evidence links are flagged. Possible duplicates require an explicit reviewer acknowledgement and note before publication.
- A criteria pass is only a basic field check. Administrators must review evidence and independently determine whether a place exists and may be listed. Occupancy, safety, and legal availability are never inferred from the submission.
- The public callable enforces App Check and server-side daily limits. The public client cannot create/read/update `space_submissions`, change review status, or write approved `spaces`.
- Approval uses a deterministic `proposal_{submissionId}` document ID and `sourceSubmissionId`, strips exact address/coordinates, evidence and submitter identity, and records review metadata. Repeating approval cannot create another publication.
- Configure `VITE_FIREBASE_APP_CHECK_SITE_KEY` after registering reCAPTCHA v3 in Firebase App Check. Deploy functions as well as rules; otherwise public proposals and publication will not work.

### Availability and trust

- An owner's free-time schedule is labelled **owner-declared** and is not proof of physical vacancy.
- Bookings are a separate collection. The current public booking flow remains an in-browser preview: it does not write a booking or contact an owner because visitor sign-in is not part of this setup.
- Crowd reports are independent of owner schedules and booking records. There is no live occupancy feed. Reports are not client-writable in these rules; connect a trusted, abuse-resistant ingestion process before enabling community submissions.
- Approval publishes a listing but does not mark it verified. Owner-entered safety and washroom details are labelled owner-declared. Owner ID verification remains false unless an authorized verification process records it.
- Exact street address and coordinates stay inside the private submission. Because those coordinates are not public, proximity matching is intentionally unavailable for owner properties until a privacy-preserving location strategy is added.
- There are not yet any genuine public **bookable-space** records. OSM locations are imported into a separate collection and are never classified as available spaces. The Public search will therefore be empty until a documented public venue/booking source is supplied and reviewed.

## OpenStreetMap imports

An administrator can import nearby place records at `/admin` by entering a centre point and radius. Imports use stable IDs such as `osm_node_1234`, so re-importing updates rather than duplicates a source record. The Overpass endpoint may throttle or reject requests; the dashboard reports failures. OSM attribution is retained in each record and displayed in the admin portal. Follow the OpenStreetMap [copyright and attribution requirements](https://www.openstreetmap.org/copyright) and the public Overpass service policy.

## Rules tests

The repository includes Auth, Firestore Rules, Functions Emulator, and acceptance-criteria tests for email/password flows, visitor/owner/admin boundaries, proposal validation, pending creation, trusted review/publication, duplicate prevention, private-field stripping, and review history:

```bash
npm run test:rules
```

This starts local Authentication, Firestore, Functions, and Storage emulators and tests local rules/functions; it does not deploy them to Firebase. Until deployment and project-level checks are completed, access control is not claimed to be deployed or production-verified.
