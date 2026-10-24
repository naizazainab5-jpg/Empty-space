import { httpsCallable } from 'firebase/functions'
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { demoMode, requireFirebase, requireFunctions } from '../firebase.js'
import { evaluateSpaceSubmission } from './submissionCriteria.js'

const demoSubmissionKey = 'emptyspace.demo.submissions'

function saveDemoProposalLocally(proposal) {
  const records = JSON.parse(localStorage.getItem(demoSubmissionKey) || '[]')
  const record = {
    ...proposal,
    id: `local-${crypto.randomUUID()}`,
    reviewStatus: 'pending',
    submittedAt: new Date().toISOString(),
    localOnly: true,
  }
  localStorage.setItem(demoSubmissionKey, JSON.stringify([...records, record]))
  return {
    submissionId: record.id,
    reviewStatus: record.reviewStatus,
    localOnly: true,
    criteriaCheck: evaluateSpaceSubmission(proposal),
  }
}

export async function submitSpaceProposal(proposal) {
  const criteriaCheck = evaluateSpaceSubmission(proposal)
  if (!criteriaCheck.passed) {
    const error = new Error('Please correct the highlighted proposal details.')
    error.validationErrors = criteriaCheck.errors
    throw error
  }
  const { db, auth } = requireFirebase()
  if (demoMode) {
    const demoRecord = {
      ...proposal,
      submitterUid: auth.currentUser?.uid || null,
      reviewStatus: 'pending',
      criteriaCheck,
      submittedAt: serverTimestamp(),
    }
    try {
      const reference = await addDoc(collection(db, 'demo_space_submissions'), demoRecord)
      return { submissionId: reference.id, reviewStatus: 'pending', criteriaCheck }
    } catch {
      return saveDemoProposalLocally(proposal)
    }
  }
  const functions = requireFunctions()
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
  const functions = requireFunctions()
  const reviewProposal = httpsCallable(functions, 'reviewSpaceProposal')
  const response = await reviewProposal({
    submissionId,
    decision,
    reviewNotes,
    duplicateAcknowledged,
  })
  return response.data
}
