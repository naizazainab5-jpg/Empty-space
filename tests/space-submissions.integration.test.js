import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
} from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore'
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'

const projectId = 'demo-emptyspace'
const uniqueName = `Community space ${randomUUID()}`
const clientApp = initializeApp({
  apiKey: 'emulator-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  appId: '1:123456789:web:space-submissions',
}, `space-submission-${randomUUID()}`)
const auth = getAuth(clientApp)
const db = getFirestore(clientApp)
const functions = getFunctions(clientApp, 'us-central1')
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)
connectFunctionsEmulator(functions, '127.0.0.1', 5001)
const submitProposal = httpsCallable(functions, 'submitSpaceProposal')
const reviewProposal = httpsCallable(functions, 'reviewSpaceProposal')
const reviewOwnerSubmission = httpsCallable(functions, 'reviewOwnerSubmission')
const adminApp = initializeAdminApp({ projectId }, `admin-${randomUUID()}`)
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)

const proposalData = () => ({
  name: uniqueName,
  category: 'Room',
  spaceType: 'private',
  description: 'A quiet community room proposed for small group learning.',
  state: 'Kerala',
  district: 'Kozhikode',
  locality: 'Nadakkavu',
  address: '8 Emulator Test Road',
  latitude: 11.27,
  longitude: 75.78,
  permittedActivities: ['Study session'],
  accessInformation: 'Available by arranging access with the property contact.',
  capacity: 8,
  privateBooking: true,
  hourlyPrice: 400,
  openingHours: '9am-6pm',
  availability: { Monday: ['2pm-6pm'] },
  lastConfirmedAt: new Date().toISOString().slice(0, 10),
  amenities: { wifi: true },
  resources: { desks: 4, powerSockets: 6 },
  evidenceUrls: ['https://example.com/space-evidence'],
})

after(async () => {
  await signOut(auth).catch(() => {})
  await deleteApp(clientApp)
  await deleteAdminApp(adminApp)
})

test('public proposals stay private until a trusted admin publishes them once', async () => {
  const anonymousCreate = await submitProposal(proposalData())
  const firstId = anonymousCreate.data.submissionId
  assert.equal(anonymousCreate.data.reviewStatus, 'pending')
  assert.ok(anonymousCreate.data.criteriaCheck.passed)

  await assert.rejects(
    getDoc(doc(db, 'space_submissions', firstId)),
    (error) => error.code === 'permission-denied',
  )
  await assert.rejects(
    setDoc(doc(db, 'space_submissions', 'client-write'), { reviewStatus: 'approved' }),
    (error) => error.code === 'permission-denied',
  )
  await assert.rejects(
    setDoc(doc(db, 'spaces', 'client-publication'), { status: 'approved' }),
    (error) => error.code === 'permission-denied',
  )
  await assert.rejects(
    reviewProposal({
      submissionId: firstId,
      decision: 'approved',
      reviewNotes: 'Try to approve anonymously',
    }),
    (error) => ['functions/unauthenticated', 'functions/permission-denied'].includes(error.code),
  )

  const duplicate = await submitProposal(proposalData())
  const duplicateId = duplicate.data.submissionId
  assert.equal(duplicate.data.criteriaCheck.passed, true)
  assert.ok(duplicate.data.criteriaCheck.possibleDuplicates.includes(firstId))

  const accountEmail = `admin-${randomUUID()}@example.com`
  const password = 'admin-test-password-123'
  const account = await createUserWithEmailAndPassword(auth, accountEmail, password)
  await adminAuth.setCustomUserClaims(account.user.uid, { admin: true })
  await signOut(auth)
  await signInWithEmailAndPassword(auth, accountEmail, password)
  await auth.currentUser.getIdToken(true)

  const adminReview = await reviewProposal({
    submissionId: firstId,
    decision: 'approved',
    reviewNotes: 'Evidence independently reviewed in the emulator test.',
  })
  assert.equal(adminReview.data.published, true)

  await assert.rejects(
    reviewProposal({
      submissionId: duplicateId,
      decision: 'approved',
      reviewNotes: 'Attempt without acknowledging duplicate.',
    }),
    (error) => error.code === 'functions/failed-precondition',
  )
  const duplicateReview = await reviewProposal({
    submissionId: duplicateId,
    decision: 'approved',
    reviewNotes: 'Verified separately; distinct physical property.',
    duplicateAcknowledged: true,
  })
  assert.equal(duplicateReview.data.published, true)

  const spaceId = `proposal_${firstId}`
  const publicSpace = await getDoc(doc(db, 'spaces', spaceId))
  assert.equal(publicSpace.data().status, 'approved')
  assert.equal(publicSpace.data().verified, false)
  assert.equal(publicSpace.data().sourceSubmissionId, firstId)
  assert.equal(publicSpace.data().address, undefined)
  assert.equal(publicSpace.data().latitude, undefined)
  assert.equal(publicSpace.data().longitude, undefined)
  assert.equal(publicSpace.data().evidenceUrls, undefined)

  await assert.rejects(
    reviewProposal({
      submissionId: firstId,
      decision: 'approved',
      reviewNotes: 'Try to publish a second time.',
    }),
    (error) => error.code === 'functions/failed-precondition',
  )
  const sourceSpaces = await adminDb.collection('spaces')
    .where('sourceSubmissionId', '==', firstId)
    .get()
  assert.equal(sourceSpaces.size, 1)

  const history = await adminDb.collection('space_submissions').doc(firstId)
    .collection('review_history').get()
  assert.equal(history.size, 1)
  const privateSubmission = await adminDb.collection('space_submissions').doc(firstId).get()
  assert.equal(privateSubmission.data().reviewStatus, 'approved')
  assert.ok(privateSubmission.data().anonymousId)
})

test('owner approval publishes every photo while keeping the private address hidden', async () => {
  const accountEmail = `photo-admin-${randomUUID()}@example.com`
  const account = await createUserWithEmailAndPassword(auth, accountEmail, 'admin-test-password-123')
  await adminAuth.setCustomUserClaims(account.user.uid, { admin: true })
  await signOut(auth)
  await signInWithEmailAndPassword(auth, accountEmail, 'admin-test-password-123')
  await auth.currentUser.getIdToken(true)

  const submissionId = `photo-owner-${randomUUID()}`
  const photos = [
    'https://storage.example/photo-1.jpg',
    'https://storage.example/photo-2.jpg',
    'https://storage.example/photo-3.jpg',
  ]
  await adminDb.collection('owner_submissions').doc(submissionId).set({
    name: 'Photo test room',
    ownerUid: 'photo-test-owner',
    ownerEmail: 'photo-owner@example.com',
    status: 'pending',
    address: 'Private test address',
    latitude: 11.27,
    longitude: 75.78,
    photos,
    images: photos,
    photoUrl: photos[0],
  })

  const review = await reviewOwnerSubmission({ submissionId, decision: 'approved' })
  assert.equal(review.data.status, 'approved')

  const publishedSpace = await getDoc(doc(db, 'spaces', submissionId))
  assert.deepEqual(publishedSpace.data().photos, photos)
  assert.deepEqual(publishedSpace.data().images, photos)
  assert.equal(publishedSpace.data().photoUrl, photos[0])
  assert.equal(publishedSpace.data().address, undefined)
  assert.equal(publishedSpace.data().latitude, undefined)
  assert.equal(publishedSpace.data().longitude, undefined)
})
