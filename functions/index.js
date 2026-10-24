import { createHash, randomUUID } from 'node:crypto'
import { initializeApp, getApps } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import {
  evaluateSpaceSubmission,
  publicSpaceFromSubmission,
} from './domain/submissionCriteria.mjs'

if (!getApps().length) initializeApp()
const db = getFirestore()
const region = 'us-central1'

function requiredText(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpsError('invalid-argument', `Invalid ${field}.`)
  }
  return value.trim()
}

function sanitizeProposal(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Proposal details are required.')
  }
  const proposal = {
    name: requiredText(data.name, 'space name', 120),
    category: requiredText(data.category, 'category', 80),
    spaceType: requiredText(data.spaceType, 'space type', 20),
    description: requiredText(data.description, 'description', 1000),
    state: requiredText(data.state, 'state', 80),
    district: requiredText(data.district, 'district', 80),
    locality: requiredText(data.locality, 'locality', 100),
    address: requiredText(data.address, 'address', 300),
    latitude: data.latitude,
    longitude: data.longitude,
    permittedActivities: Array.isArray(data.permittedActivities) ? data.permittedActivities : [],
    accessInformation: requiredText(data.accessInformation, 'access information', 500),
    capacity: data.capacity,
    privateBooking: data.privateBooking === true,
    hourlyPrice: data.hourlyPrice === null ? null : data.hourlyPrice,
    openingHours: requiredText(data.openingHours, 'opening hours', 200),
    availability: data.availability && typeof data.availability === 'object' ? data.availability : {},
    lastConfirmedAt: requiredText(data.lastConfirmedAt, 'last confirmed date', 10),
    amenities: data.amenities && typeof data.amenities === 'object' ? data.amenities : {},
    resources: data.resources && typeof data.resources === 'object' ? data.resources : {},
    seatingType: typeof data.seatingType === 'string' ? data.seatingType.slice(0, 80) : '',
    atmosphere: typeof data.atmosphere === 'string' ? data.atmosphere.slice(0, 80) : '',
    indoorOutdoor: typeof data.indoorOutdoor === 'string' ? data.indoorOutdoor.slice(0, 80) : '',
    evidenceUrls: Array.isArray(data.evidenceUrls)
      ? data.evidenceUrls.filter((url) => typeof url === 'string').map((url) => url.trim())
      : [],
  }
  return proposal
}

function normalizedDuplicateKey(proposal) {
  return createHash('sha256')
    .update([proposal.name, proposal.district, proposal.locality]
      .map((part) => part.trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|'))
    .digest('hex')
}

function rateLimitId(request) {
  const address = request.rawRequest.ip
    || String(request.rawRequest.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || (process.env.FUNCTIONS_EMULATOR === 'true' ? 'emulator-local' : '')
  if (!address) throw new HttpsError('resource-exhausted', 'Could not safely check submission limits. Try again later.')
  return createHash('sha256').update(address).digest('hex')
}

function duplicateMatches(proposal, candidates) {
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
  return candidates
    .filter((candidate) => normalize(candidate.name) === normalize(proposal.name)
      && normalize(candidate.district) === normalize(proposal.district)
      && normalize(candidate.locality) === normalize(proposal.locality))
    .map((candidate) => candidate.id)
    .slice(0, 5)
}

async function findPotentialDuplicates(proposal) {
  const [proposals, approvedSpaces] = await Promise.all([
    db.collection('space_submissions')
      .where('reviewStatus', 'in', ['pending', 'needs_changes', 'approved'])
      .limit(300)
      .get(),
    db.collection('spaces')
      .where('status', '==', 'approved')
      .limit(500)
      .get(),
  ])
  return duplicateMatches(proposal, [
    ...proposals.docs.map((item) => ({ id: item.id, ...item.data() })),
    ...approvedSpaces.docs.map((item) => ({ id: item.id, ...item.data() })),
  ])
}

export const submitSpaceProposal = onCall({
  region,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
}, async (request) => {
  const proposal = sanitizeProposal(request.data)
  const possibleDuplicates = await findPotentialDuplicates(proposal)
  const criteriaCheck = evaluateSpaceSubmission(proposal, { possibleDuplicates })
  if (!criteriaCheck.passed) {
    throw new HttpsError('invalid-argument', 'The proposal did not meet required field checks.', {
      errors: criteriaCheck.errors,
    })
  }

  const day = new Date().toISOString().slice(0, 10)
  const ipLimitRef = db.collection('space_submission_limits').doc(rateLimitId(request))
  const uidLimitRef = request.auth
    ? db.collection('space_submission_limits').doc(`uid-${request.auth.uid}`)
    : null
  const dedupeKey = normalizedDuplicateKey(proposal)
  const duplicateRef = db.collection('space_submission_dedupe').doc(dedupeKey)
  const submissionRef = db.collection('space_submissions').doc()
  const anonymousId = request.auth ? null : randomUUID()

  const savedCriteria = await db.runTransaction(async (transaction) => {
    const refs = [ipLimitRef, ...(uidLimitRef ? [uidLimitRef] : []), duplicateRef]
    const snapshots = await Promise.all(refs.map((reference) => transaction.get(reference)))
    const limits = snapshots.slice(0, refs.length - 1)
    const duplicateSnapshot = snapshots.at(-1)
    for (const snapshot of limits) {
      const data = snapshot.exists ? snapshot.data() : {}
      const count = data.day === day ? data.count || 0 : 0
      const maximum = snapshot.ref.id.startsWith('uid-') ? 10 : 5
      if (count >= maximum) {
        throw new HttpsError('resource-exhausted', 'Daily proposal limit reached. Please try again tomorrow.')
      }
    }

    const earlierIds = duplicateSnapshot.exists ? duplicateSnapshot.data().submissionIds || [] : []
    const duplicateIds = [...new Set([...possibleDuplicates, ...earlierIds])].slice(0, 5)
    const finalCriteria = evaluateSpaceSubmission(proposal, { possibleDuplicates: duplicateIds })
    for (const snapshot of limits) {
      const data = snapshot.exists ? snapshot.data() : {}
      transaction.set(snapshot.ref, {
        day,
        count: (data.day === day ? data.count || 0 : 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }
    transaction.set(duplicateRef, {
      submissionIds: [...earlierIds, submissionRef.id].slice(-50),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(submissionRef, {
      ...proposal,
      nameKey: dedupeKey,
      submissionId: submissionRef.id,
      submitterUid: request.auth?.uid || null,
      anonymousId,
      submittedAt: FieldValue.serverTimestamp(),
      reviewStatus: 'pending',
      reviewNotes: '',
      reviewerId: null,
      reviewedAt: null,
      criteriaCheck: finalCriteria,
      possibleDuplicate: duplicateIds.length > 0,
    })
    return finalCriteria
  })

  return {
    submissionId: submissionRef.id,
    reviewStatus: 'pending',
    criteriaCheck: savedCriteria,
  }
})

export const reviewSpaceProposal = onCall({ region }, async (request) => {
  if (request.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator access is required.')
  }
  const submissionId = requiredText(request.data?.submissionId, 'submission ID', 100)
  const decision = requiredText(request.data?.decision, 'review decision', 30)
  const reviewNotes = typeof request.data?.reviewNotes === 'string' ? request.data.reviewNotes.trim().slice(0, 2000) : ''
  const duplicateAcknowledged = request.data?.duplicateAcknowledged === true
  if (!['approved', 'needs_changes', 'rejected', 'flag_duplicate'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose a valid review decision.')
  }
  if (decision !== 'approved' && reviewNotes.length < 3) {
    throw new HttpsError('invalid-argument', 'Add a clear reason for this review decision.')
  }

  const submissionRef = db.collection('space_submissions').doc(submissionId)
  const reviewRef = submissionRef.collection('review_history').doc()
  const approvedSpaceRef = db.collection('spaces').doc(`proposal_${submissionId}`)

  return db.runTransaction(async (transaction) => {
    const submissionSnapshot = await transaction.get(submissionRef)
    if (!submissionSnapshot.exists) throw new HttpsError('not-found', 'The proposal no longer exists.')
    const submission = submissionSnapshot.data()
    if (!['pending', 'needs_changes'].includes(submission.reviewStatus)) {
      throw new HttpsError('failed-precondition', 'This proposal has already been reviewed.')
    }

    const criteriaCheck = evaluateSpaceSubmission(submission, {
      possibleDuplicates: submission.criteriaCheck?.possibleDuplicates || [],
    })
    if (decision === 'approved' && !criteriaCheck.passed) {
      throw new HttpsError('failed-precondition', 'Correct the failed field checks before approving.')
    }
    if (decision === 'approved' && submission.possibleDuplicate
      && (!duplicateAcknowledged || reviewNotes.length < 10)) {
      throw new HttpsError('failed-precondition', 'Review the duplicate warning and add a reason before approving.')
    }

    let nextStatus = decision
    if (decision === 'flag_duplicate') {
      nextStatus = 'pending'
      criteriaCheck.warnings = [...new Set([...criteriaCheck.warnings, 'Flagged by an administrator as a possible duplicate.'])]
    }
    const reviewedAt = Timestamp.now()
    const changes = {
      reviewStatus: nextStatus,
      reviewNotes,
      reviewerId: request.auth.uid,
      reviewedAt,
      criteriaCheck,
      possibleDuplicate: decision === 'flag_duplicate' || submission.possibleDuplicate === true,
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (decision === 'approved') {
      const existingSpace = await transaction.get(approvedSpaceRef)
      if (existingSpace.exists) {
        throw new HttpsError('already-exists', 'This proposal was already published.')
      }
      transaction.create(approvedSpaceRef, {
        ...publicSpaceFromSubmission(submission, submissionId),
        sourceSubmissionId: submissionId,
        humanReview: {
          approved: true,
          reviewedAt,
          criteriaPassed: criteriaCheck.passed,
        },
        lastUpdated: FieldValue.serverTimestamp(),
      })
    }

    transaction.update(submissionRef, changes)
    transaction.create(reviewRef, {
      decision,
      reviewNotes,
      reviewerId: request.auth.uid,
      reviewedAt,
      criteriaCheck,
      createdAt: FieldValue.serverTimestamp(),
    })
    return { submissionId, reviewStatus: nextStatus, published: decision === 'approved' }
  })
})

export const reviewOwnerSubmission = onCall({ region }, async (request) => {
  if (request.auth?.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Administrator access is required.')
  }
  const submissionId = requiredText(request.data?.submissionId, 'submission ID', 100)
  const decision = requiredText(request.data?.decision, 'review decision', 30)
  const reviewerNote = typeof request.data?.reviewerNote === 'string' ? request.data.reviewerNote.trim().slice(0, 1000) : ''
  if (!['approved', 'rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Choose approve or reject.')
  }

  const submissionRef = db.collection('owner_submissions').doc(submissionId)
  const spaceRef = db.collection('spaces').doc(submissionId)
  const historyRef = submissionRef.collection('review_history').doc()
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(submissionRef)
    if (!snapshot.exists || snapshot.data().status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This owner submission is no longer pending.')
    }
    const submission = snapshot.data()
    if (decision === 'approved' && submission.ownerUid === request.auth.uid) {
      throw new HttpsError('permission-denied', 'An administrator cannot approve their own property.')
    }
    const reviewedAt = Timestamp.now()
    transaction.update(submissionRef, {
      status: decision,
      reviewerNote,
      reviewerId: request.auth.uid,
      reviewedAt,
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.create(historyRef, {
      decision,
      reviewerNote,
      reviewerId: request.auth.uid,
      reviewedAt,
      createdAt: FieldValue.serverTimestamp(),
    })
    if (decision === 'approved') {
      const privateFields = new Set([
        'ownerUid', 'ownerEmail', 'submittedAt', 'updatedAt', 'reviewerNote',
        'reviewerId', 'reviewedAt', 'address', 'latitude', 'longitude', 'coordinates',
      ])
      const publicListing = Object.fromEntries(
        Object.entries(submission).filter(([key]) => !privateFields.has(key)),
      )
      const photos = Array.isArray(submission.photos)
        ? submission.photos
        : Array.isArray(submission.images)
          ? submission.images
          : []
      transaction.create(spaceRef, {
        ...publicListing,
        photos,
        images: photos,
        photoUrl: photos[0] || '',
        id: submissionId,
        sourceSubmissionId: submissionId,
        spaceType: 'private',
        status: 'approved',
        verified: false,
        rating: null,
        safetyRating: null,
        availabilitySource: 'owner-declared',
        lastUpdated: FieldValue.serverTimestamp(),
      })
    }
    return { submissionId, status: decision }
  })
})
