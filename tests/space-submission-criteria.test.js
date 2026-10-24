import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  evaluateSpaceSubmission,
  publicSpaceFromSubmission,
} from '../functions/domain/submissionCriteria.mjs'

const validProposal = {
  name: 'Community learning room',
  category: 'Room',
  spaceType: 'private',
  description: 'A calm and accessible room for group learning and workshops.',
  state: 'Kerala',
  district: 'Kozhikode',
  locality: 'Nadakkavu',
  address: '10 Sample Road, Nadakkavu',
  latitude: 11.27,
  longitude: 75.78,
  permittedActivities: ['Study session', 'Workshops'],
  accessInformation: 'Access by arrangement with the property contact.',
  capacity: 12,
  privateBooking: true,
  hourlyPrice: 450,
  openingHours: '9am-6pm',
  availability: { Monday: ['2pm-6pm'] },
  lastConfirmedAt: new Date().toISOString().slice(0, 10),
  evidenceUrls: ['https://example.com/evidence'],
}

test('acceptance criteria pass complete, internally consistent Kerala proposals', () => {
  const result = evaluateSpaceSubmission(validProposal)
  assert.equal(result.passed, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.humanVerificationRequired, true)
  assert.ok(result.warnings.some((warning) => warning.includes('does not prove')))
})

test('acceptance criteria reject invalid geography and inconsistent booking price', () => {
  const result = evaluateSpaceSubmission({
    ...validProposal,
    latitude: 41.9,
    privateBooking: false,
    hourlyPrice: 450,
  })
  assert.equal(result.passed, false)
  assert.ok(result.errors.some((error) => error.includes('latitude within Kerala')))
  assert.ok(result.errors.some((error) => error.includes('Leave hourly price blank')))
})

test('duplicate and missing evidence are flagged for human review', () => {
  const result = evaluateSpaceSubmission({
    ...validProposal,
    evidenceUrls: [],
  }, { possibleDuplicates: ['prior-submission'] })
  assert.equal(result.passed, true)
  assert.equal(result.possibleDuplicates[0], 'prior-submission')
  assert.ok(result.warnings.some((warning) => warning.includes('No evidence link')))
  assert.ok(result.warnings.some((warning) => warning.includes('Possible duplicate')))
})

test('publication strips exact address, coordinates, evidence, and submitter identity', () => {
  const publicRecord = publicSpaceFromSubmission({
    ...validProposal,
    evidenceUrls: ['https://example.com/private-evidence'],
    submitterUid: 'private-user',
    anonymousId: 'private-anonymous-id',
  }, 'proposal-123', 'reviewer-1')

  assert.equal(publicRecord.status, 'approved')
  assert.equal(publicRecord.verified, false)
  assert.equal(publicRecord.sourceSubmissionId, 'proposal-123')
  assert.equal(publicRecord.address, undefined)
  assert.equal(publicRecord.latitude, undefined)
  assert.equal(publicRecord.longitude, undefined)
  assert.equal(publicRecord.submitterUid, undefined)
  assert.equal(publicRecord.anonymousId, undefined)
  assert.deepEqual(publicRecord.images, [])
})
