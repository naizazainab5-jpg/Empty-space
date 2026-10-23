import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { requireFirebase } from '../firebase.js'

const collections = {
  users: 'users',
  spaces: 'spaces',
  submissions: 'owner_submissions',
  bookings: 'bookings',
  availability: 'availability_records',
  crowdReports: 'crowd_reports',
  verifications: 'space_verification_records',
  flags: 'report_flags',
  publicPlaces: 'public_places',
}

function valueOfDate(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString()
  if (typeof value === 'string') return value
  return null
}

export function normalizeSpace(id, data) {
  const coordinates = data.coordinates || {}
  const photoUrl = data.photoUrl || data.images?.[0] || ''
  return {
    ...data,
    id,
    state: data.state || 'Kerala',
    area: data.area || data.locality || '',
    locality: data.locality || data.area || '',
    town: data.town || data.locality || '',
    latitude: data.latitude ?? coordinates.latitude ?? null,
    longitude: data.longitude ?? coordinates.longitude ?? null,
    coordinates: {
      latitude: data.latitude ?? coordinates.latitude ?? null,
      longitude: data.longitude ?? coordinates.longitude ?? null,
    },
    photoUrl,
    gallery: data.images?.length ? data.images : [photoUrl, photoUrl],
    amenities: {
      wifi: false, charging: false, ac: false, fans: false, projector: false,
      whiteboard: false, stepFreeAccess: false, ...(data.amenities || {}),
    },
    resources: {
      desks: 0, powerSockets: 0, printerAccess: false, powerBackup: false,
      soundproof: false, lockers: false, drinkingWater: false, teaCoffee: false,
      wifiSpeed: 'Unknown', ...(data.resources || {}),
    },
    safety: {
      cctv: false, wellLit: false, securedEntry: false, femaleHostOrStaff: false,
      womenOnlyHours: '', busyArea: false, nearPublicTransport: false,
      ownerIdVerified: false, ...(data.safety || {}),
    },
    washroom: {
      onSite: false, separateForWomen: false, accessible: false,
      cleanlinessRating: null, ...(data.washroom || {}),
    },
    nearby: data.nearby || [],
    availability: data.availability || {},
    verified: data.verified === true,
    rating: data.rating ?? null,
    safetyRating: data.safetyRating ?? null,
    lastUpdated: valueOfDate(data.lastUpdated) || new Date().toISOString(),
    isDemo: false,
  }
}

export async function getApprovedSpaces() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.spaces),
    where('status', '==', 'approved'),
    limit(500),
  ))
  return snapshot.docs.map((item) => normalizeSpace(item.id, item.data()))
}

export async function getPublicPlaces() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.publicPlaces),
    where('sourceStatus', '==', 'active'),
    orderBy('lastCheckedAt', 'desc'),
    limit(1000),
  ))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      ...data,
      type: data.category,
      latitude: data.coordinates?.latitude ?? null,
      longitude: data.coordinates?.longitude ?? null,
    }
  })
}

export async function createOwnerProfile(user) {
  const { db } = requireFirebase()
  await setDoc(doc(db, collections.users, user.uid), {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || '',
    accountType: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function submitOwnerProperty(user, listing) {
  const { db } = requireFirebase()
  if (!user?.emailVerified) throw new Error('Verify your email address before submitting a property.')
  const submissionRef = doc(collection(db, collections.submissions))
  const submission = {
    ...listing,
    ownerUid: user.uid,
    ownerEmail: user.email,
    status: 'pending',
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(submissionRef, submission)
  return { id: submissionRef.id, ...submission }
}

export async function getOwnSubmissions(userId) {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.submissions),
    where('ownerUid', '==', userId),
    orderBy('submittedAt', 'desc'),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function updatePendingSubmission(userId, submissionId, listing) {
  const { db } = requireFirebase()
  const reference = doc(db, collections.submissions, submissionId)
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists() || snapshot.data().ownerUid !== userId || snapshot.data().status !== 'pending') {
      throw new Error('Only your pending submission can be edited.')
    }
    transaction.update(reference, { ...listing, updatedAt: serverTimestamp() })
  })
}

export async function saveOwnerAvailability(userId, submissionId, availability, openingHours) {
  const { db } = requireFirebase()
  const submissionRef = doc(db, collections.submissions, submissionId)
  const spaceRef = doc(db, collections.spaces, submissionId)
  const availabilityRef = doc(db, collections.availability, submissionId)
  await runTransaction(db, async (transaction) => {
    const submission = await transaction.get(submissionRef)
    if (!submission.exists() || submission.data().ownerUid !== userId || submission.data().status !== 'approved') {
      throw new Error('Availability can only be changed for your approved listing.')
    }
    transaction.set(availabilityRef, {
      submissionId,
      ownerUid: userId,
      availability,
      openingHours,
      source: 'owner-declared',
      updatedAt: serverTimestamp(),
    })
    transaction.update(submissionRef, {
      availability,
      openingHours,
      updatedAt: serverTimestamp(),
    })
    transaction.update(spaceRef, {
      availability,
      availabilitySource: 'owner-declared',
      availabilityUpdatedAt: serverTimestamp(),
      lastUpdated: serverTimestamp(),
    })
  })
}

export async function getPendingSubmissions() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.submissions),
    where('status', '==', 'pending'),
    orderBy('submittedAt', 'asc'),
    limit(100),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getSpaceSubmissionsForReview() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, 'space_submissions'),
    orderBy('submittedAt', 'desc'),
    limit(100),
  ))
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
}

export async function getSpaceSubmissionReviewHistory(submissionId) {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, 'space_submissions', submissionId, 'review_history'),
    orderBy('createdAt', 'desc'),
    limit(20),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function reviewSpaceSubmission(submissionId, decision, reviewNotes, duplicateAcknowledged) {
  const { functions } = requireFirebase()
  const review = httpsCallable(functions, 'reviewSpaceProposal')
  return (await review({ submissionId, decision, reviewNotes, duplicateAcknowledged })).data
}

export async function getAdminApprovedSpaces() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.spaces),
    where('status', '==', 'approved'),
    limit(500),
  ))
  return snapshot.docs.map((item) => normalizeSpace(item.id, item.data()))
}

export async function getAdminPublicPlaces() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.publicPlaces),
    orderBy('lastCheckedAt', 'desc'),
    limit(200),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getReportFlags() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.flags),
    orderBy('createdAt', 'desc'),
    limit(100),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function getVerificationRecords() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, collections.verifications),
    orderBy('createdAt', 'desc'),
    limit(100),
  ))
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
}

export async function reviewReportFlag(flagId, reviewerNote = '') {
  const { db } = requireFirebase()
  await updateDoc(doc(db, collections.flags, flagId), {
    reviewStatus: 'reviewed',
    reviewerNote: reviewerNote.trim(),
    reviewedAt: serverTimestamp(),
  })
}

export async function reviewSubmission(submissionId, decision, reviewerNote = '') {
  const { functions } = requireFirebase()
  const review = httpsCallable(functions, 'reviewOwnerSubmission')
  return (await review({ submissionId, decision, reviewerNote })).data
}

export async function submitCrowdReport(user, spaceId, observation) {
  const { db } = requireFirebase()
  if (!user || !['quiet', 'some_activity', 'busy'].includes(observation)) {
    throw new Error('Sign in and choose a valid crowd observation.')
  }
  const reference = doc(collection(db, collections.crowdReports))
  await setDoc(reference, { spaceId, observation, observedAt: serverTimestamp() })
}

export async function getCrowdReportSummary(spaceId) {
  const { db } = requireFirebase()
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 60 * 60 * 1000))
  const snapshot = await getDocs(query(
    collection(db, collections.crowdReports),
    where('spaceId', '==', spaceId),
    where('observedAt', '>=', cutoff),
    orderBy('observedAt', 'desc'),
    limit(50),
  ))
  const reports = snapshot.docs.map((item) => item.data())
  if (reports.length < 3) return { status: 'Unknown', reports: reports.length }
  const uniqueObservations = new Set(reports.map((report) => report.observation))
  return {
    status: uniqueObservations.size > 1 ? 'Mixed reports' : {
      quiet: 'Quiet',
      some_activity: 'Some activity',
      busy: 'Busy',
    }[reports[0].observation] || 'Unknown',
    reports: reports.length,
  }
}

export async function createBookingRequest(user, booking) {
  const { db } = requireFirebase()
  if (!user) throw new Error('Sign in before creating a booking request.')
  const reference = await addDoc(collection(db, collections.bookings), {
    ...booking,
    customerUid: user.uid,
    status: 'pending_owner_confirmation',
    createdAt: serverTimestamp(),
  })
  return reference.id
}

export async function createReportFlag(user, spaceId, reason, details = '') {
  const { db } = requireFirebase()
  if (!user) throw new Error('Sign in before submitting a report.')
  await addDoc(collection(db, collections.flags), {
    spaceId,
    reason,
    details: details.trim(),
    reviewStatus: 'new',
    createdAt: serverTimestamp(),
  })
}

export async function importPublicPlaceDocuments(places) {
  const { db } = requireFirebase()
  for (let offset = 0; offset < places.length; offset += 400) {
    const batch = writeBatch(db)
    for (const place of places.slice(offset, offset + 400)) {
      batch.set(doc(db, collections.publicPlaces, place.id), {
        ...place,
        lastCheckedAt: serverTimestamp(),
      }, { merge: true })
    }
    await batch.commit()
  }
}

export async function removePublicPlace(placeId) {
  const { db } = requireFirebase()
  const reference = doc(db, collections.publicPlaces, placeId)
  const snapshot = await getDoc(reference)
  if (!snapshot.exists()) throw new Error('The selected public place no longer exists.')
  await updateDoc(reference, { lastCheckedAt: serverTimestamp(), sourceStatus: 'removed' })
}

export async function deletePublicPlace(placeId) {
  const { db } = requireFirebase()
  await deleteDoc(doc(db, collections.publicPlaces, placeId))
}
