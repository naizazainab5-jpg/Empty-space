import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getIdTokenResult,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

const app = initializeApp({
  apiKey: 'fake-api-key',
  authDomain: 'demo-emptyspace.firebaseapp.com',
  projectId: 'demo-emptyspace',
}, `auth-flow-test-${randomUUID()}`)
const auth = getAuth(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })

after(async () => {
  await deleteApp(app)
})

test('email/password registration, sign-in, reset, and sign-out work in the Auth emulator', async () => {
  const email = `owner-${randomUUID()}@example.com`
  const password = 'test-password-123'

  const registration = await createUserWithEmailAndPassword(auth, email, password)
  assert.equal(registration.user.email, email)
  assert.equal(registration.user.emailVerified, false)
  const token = await getIdTokenResult(registration.user)
  assert.notEqual(token.claims.admin, true)

  await sendPasswordResetEmail(auth, email)
  await signOut(auth)
  assert.equal(auth.currentUser, null)

  const signIn = await signInWithEmailAndPassword(auth, email, password)
  assert.equal(signIn.user.uid, registration.user.uid)
  await signOut(auth)
  assert.equal(auth.currentUser, null)
})
