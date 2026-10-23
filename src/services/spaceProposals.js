import { httpsCallable } from 'firebase/functions'
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore'
import { requireFirebase } from '../firebase.js'
import { evaluateSpaceSubmission } from './submissionCriteria.js'

export async function submitSpaceProposal(proposal) {
  const { functions } = requireFirebase()
  const criteriaCheck = evaluateSpaceSubmission(proposal)
  if (!criteriaCheck.passed) {
    const error = new Error('Please correct the highlighted proposal details.')
    error.validationErrors = criteriaCheck.errors
    throw error
  }
  const submitProposal = httpsCallable(functions, 'submitSpaceProposal')
  const response = await submitProposal(proposal)
  return response.data
}

export async function getSpaceProposalsForReview() {
  const { db } = requireFirebase()
  const snapshot = await getDocs(query(
    collection(db, 'space_submissions'),
    orderBy('submittedAt', 'desc'),
    limit(100),
  ))
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => ['pending', 'needs_changes'].includes(item.reviewStatus))
}

export async function reviewSpaceProposal(submissionId, decision, reviewNotes, duplicateAcknowledged) {
  const { functions } = requireFirebase()
  const reviewProposal = httpsCallable(functions, 'reviewSpaceProposal')
  const response = await reviewProposal({
    submissionId,
    decision,
    reviewNotes,
    duplicateAcknowledged,
  })
  return response.data
}
