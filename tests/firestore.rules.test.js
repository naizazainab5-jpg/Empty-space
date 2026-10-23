import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'

let environment

const validSubmission = (uid, email) => ({
  name: 'Owner study room',
  description: 'A private room offered for quiet study.',
  spaceType: 'private',
  category: 'Room',
  permittedActivities: ['Study session'],
  state: 'Kerala',
  district: 'Kozhikode',
  locality: 'Nadakkavu',
  address: 'Private street address',
  latitude: 11.27,
  longitude: 75.78,
  capacity: 8,
  pricePerHour: 400,
  amenities: { wifi: true },
  resources: { desks: 4, powerSockets: 8 },
  seatingType: 'Classroom',
  atmosphere: 'quiet',
  indoorOutdoor: 'Indoor',
  images: [],
  photoUrl: '',
  openingHours: '9am-6pm',
  availability: { Monday: ['2pm-6pm'] },
  safety: { cctv: true, ownerIdVerified: false },
  washroom: { onSite: true, cleanlinessRating: null },
  ownerUid: uid,
  ownerEmail: email,
  status: 'pending',
  submittedAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
})

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-emptyspace',
    firestore: {
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

after(async () => {
  await environment?.cleanup()
})

test('visitors can read approved spaces but not pending submissions or owner profiles', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'spaces', 'approved-space'), { status: 'approved', name: 'Approved' })
    await setDoc(doc(db, 'spaces', 'pending-space'), { status: 'pending', name: 'Pending' })
    await setDoc(doc(db, 'owner_submissions', 'private-submission'), { ownerUid: 'owner-1', status: 'pending' })
    await setDoc(doc(db, 'users', 'owner-1'), { uid: 'owner-1', email: 'private@example.com' })
  })

  const visitorDb = environment.unauthenticatedContext().firestore()
  await assertSucceeds(getDoc(doc(visitorDb, 'spaces', 'approved-space')))
  await assertFails(getDoc(doc(visitorDb, 'spaces', 'pending-space')))
  await assertFails(getDoc(doc(visitorDb, 'owner_submissions', 'private-submission')))
  await assertFails(getDoc(doc(visitorDb, 'users', 'owner-1')))

  const ordinaryUserDb = environment.authenticatedContext('ordinary-user', {
    email: 'visitor@example.com',
    email_verified: true,
  }).firestore()
  await assertSucceeds(getDoc(doc(ordinaryUserDb, 'spaces', 'approved-space')))
  await assertFails(getDoc(doc(ordinaryUserDb, 'owner_submissions', 'private-submission')))
})

test('owners can create their own non-admin profile but cannot change its role', async () => {
  const ownerDb = environment.authenticatedContext('profile-owner', {
    email: 'owner@example.com',
  }).firestore()
  const profile = doc(ownerDb, 'users', 'profile-owner')
  await assertSucceeds(setDoc(profile, {
    uid: 'profile-owner',
    email: 'owner@example.com',
    displayName: 'Space owner',
    accountType: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(updateDoc(profile, {
    displayName: 'Updated name',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(profile, {
    accountType: 'admin',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(getDoc(doc(ownerDb, 'users', 'other-owner')))
})

test('an authenticated owner can submit a verified-email pending listing, not approve it', async () => {
  const ownerDb = environment.authenticatedContext('owner-1', {
    email: 'owner@example.com',
    email_verified: true,
  }).firestore()
  const submissionRef = doc(ownerDb, 'owner_submissions', 'owner-listing')
  await assertSucceeds(setDoc(submissionRef, validSubmission('owner-1', 'owner@example.com')))
  await assertFails(updateDoc(submissionRef, {
    status: 'approved',
    updatedAt: serverTimestamp(),
  }))

  const unverifiedDb = environment.authenticatedContext('unverified-owner', {
    email: 'unverified@example.com',
    email_verified: false,
  }).firestore()
  await assertFails(setDoc(
    doc(unverifiedDb, 'owner_submissions', 'unverified-listing'),
    validSubmission('unverified-owner', 'unverified@example.com'),
  ))

  await assertFails(setDoc(
    doc(environment.unauthenticatedContext().firestore(), 'owner_submissions', 'visitor-listing'),
    validSubmission('owner-1', 'owner@example.com'),
  ))
})

test('owners can only read and edit their own permitted pending fields', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'owner_submissions', 'other-listing'), {
      ...validSubmission('other-owner', 'other@example.com'),
      status: 'pending',
    })
  })

  const ownerDb = environment.authenticatedContext('owner-1', {
    email: 'owner@example.com',
    email_verified: true,
  }).firestore()
  await assertFails(getDoc(doc(ownerDb, 'owner_submissions', 'other-listing')))
  await assertFails(updateDoc(doc(ownerDb, 'owner_submissions', 'other-listing'), {
    name: 'Changed by another owner',
    updatedAt: serverTimestamp(),
  }))
  await assertSucceeds(getDocs(query(
    collection(ownerDb, 'owner_submissions'),
    where('ownerUid', '==', 'owner-1'),
  )))
})

test('ordinary users cannot grant themselves admin fields and only administrators manage imports', async () => {
  const ownerDb = environment.authenticatedContext('owner-1', {
    email: 'owner@example.com',
    email_verified: true,
  }).firestore()
  await assertFails(setDoc(doc(ownerDb, 'users', 'owner-1'), {
    uid: 'owner-1',
    email: 'owner@example.com',
    accountType: 'owner',
    admin: true,
  }))
  await assertFails(setDoc(doc(ownerDb, 'public_places', 'osm_node_1'), {
    source: 'OpenStreetMap',
    sourceStatus: 'active',
  }))

  const adminDb = environment.authenticatedContext('admin-1', { admin: true }).firestore()
  await assertSucceeds(setDoc(doc(adminDb, 'public_places', 'osm_node_1'), {
    source: 'OpenStreetMap',
    sourceStatus: 'active',
  }))
  await assertSucceeds(getDoc(doc(environment.unauthenticatedContext().firestore(), 'public_places', 'osm_node_1')))
})

test('owners can only change declared availability on their own approved listing', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'owner_submissions', 'approved-owner-space'), {
      ...validSubmission('owner-1', 'owner@example.com'),
      status: 'approved',
    })
    await setDoc(doc(db, 'spaces', 'approved-owner-space'), {
      status: 'approved',
      spaceType: 'private',
      availability: { Monday: ['2pm-4pm'] },
      description: 'Public-safe details',
    })
  })

  const ownerDb = environment.authenticatedContext('owner-1', {
    email: 'owner@example.com',
    email_verified: true,
  }).firestore()
  await assertSucceeds(updateDoc(doc(ownerDb, 'spaces', 'approved-owner-space'), {
    availability: { Tuesday: ['3pm-6pm'] },
    availabilitySource: 'owner-declared',
    availabilityUpdatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(ownerDb, 'spaces', 'approved-owner-space'), {
    description: 'Owner changed a public description',
  }))
  await assertSucceeds(setDoc(doc(ownerDb, 'availability_records', 'approved-owner-space'), {
    submissionId: 'approved-owner-space',
    ownerUid: 'owner-1',
    availability: { Tuesday: ['3pm-6pm'] },
    openingHours: '9am-6pm',
    source: 'owner-declared',
    updatedAt: serverTimestamp(),
  }))

  const otherOwnerDb = environment.authenticatedContext('other-owner', {
    email: 'other@example.com',
    email_verified: true,
  }).firestore()
  await assertFails(getDoc(doc(otherOwnerDb, 'availability_records', 'approved-owner-space')))
  await assertFails(updateDoc(doc(otherOwnerDb, 'spaces', 'approved-owner-space'), {
    availability: { Wednesday: ['3pm-6pm'] },
    availabilityUpdatedAt: serverTimestamp(),
    lastUpdated: serverTimestamp(),
  }))
})

test('private records, including flags, bookings, and verification notes, stay restricted', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'bookings', 'private-booking'), {
      customerUid: 'customer-1',
      spaceId: 'approved-space',
      status: 'pending_owner_confirmation',
    })
    await setDoc(doc(db, 'report_flags', 'private-flag'), {
      spaceId: 'approved-space',
      reason: 'Safety concern',
      reviewStatus: 'new',
    })
    await setDoc(doc(db, 'space_verification_records', 'private-verification'), {
      spaceId: 'approved-space',
      note: 'Internal review detail',
    })
  })

  const visitorDb = environment.authenticatedContext('ordinary-user', {
    email: 'visitor@example.com',
    email_verified: true,
  }).firestore()
  await assertFails(getDoc(doc(visitorDb, 'bookings', 'private-booking')))
  await assertFails(getDoc(doc(visitorDb, 'report_flags', 'private-flag')))
  await assertFails(getDoc(doc(visitorDb, 'space_verification_records', 'private-verification')))

  const adminDb = environment.authenticatedContext('admin-1', { admin: true }).firestore()
  await assertSucceeds(getDoc(doc(adminDb, 'space_verification_records', 'private-verification')))
})

test('admins cannot approve submissions or write approved listings directly from the client', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'owner_submissions', 'admin-owned'), {
      ...validSubmission('admin-1', 'admin@example.com'),
      status: 'pending',
    })
    await setDoc(doc(context.firestore(), 'owner_submissions', 'owner-owned'), {
      ...validSubmission('owner-1', 'owner@example.com'),
      status: 'pending',
    })
  })

  const adminDb = environment.authenticatedContext('admin-1', { admin: true }).firestore()
  await assertFails(updateDoc(doc(adminDb, 'owner_submissions', 'admin-owned'), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(updateDoc(doc(adminDb, 'owner_submissions', 'owner-owned'), {
    status: 'approved',
    updatedAt: serverTimestamp(),
  }))
  await assertFails(setDoc(doc(adminDb, 'spaces', 'owner-owned'), {
    status: 'approved',
    name: 'Public-safe listing',
  }))
})

test('public proposals are private and clients cannot create, change, or publish them', async () => {
  const visitorDb = environment.unauthenticatedContext().firestore()
  const ordinaryDb = environment.authenticatedContext('ordinary', { email_verified: true }).firestore()
  const adminDb = environment.authenticatedContext('reviewer', { admin: true }).firestore()
  const submission = { name: 'Community studio', reviewStatus: 'pending' }
  await assertFails(setDoc(doc(visitorDb, 'space_submissions', 'visitor-proposal'), submission))
  await assertFails(setDoc(doc(ordinaryDb, 'space_submissions', 'owner-proposal'), submission))
  await assertFails(setDoc(doc(adminDb, 'space_submissions', 'admin-proposal'), submission))
  await assertFails(getDoc(doc(visitorDb, 'space_submissions', 'private-proposal')))
  await assertFails(setDoc(doc(adminDb, 'spaces', 'client-published-space'), { status: 'approved' }))
  await assertFails(setDoc(doc(visitorDb, 'space_submission_limits', 'visitor-ip'), { count: 1 }))
})
