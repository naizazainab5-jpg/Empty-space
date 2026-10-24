import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'

const projectId = 'demo-emptyspace'
const app = initializeApp({
  apiKey: 'demo-api-key',
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
  appId: '1:123456789:web:demo',
}, `demo-mode-${randomUUID()}`)
const auth = getAuth(app)
const db = getFirestore(app)
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFirestoreEmulator(db, '127.0.0.1', 8080)

after(async () => {
  await deleteApp(app)
})

test('demo submissions write directly to emulator and remain private', async () => {
  const submission = await addDoc(collection(db, 'demo_space_submissions'), {
    name: 'Demo test room',
    description: 'A sample space created for local demo testing.',
    reviewStatus: 'pending',
    submittedAt: serverTimestamp(),
  })

  await assert.rejects(
    getDoc(doc(db, 'demo_space_submissions', submission.id)),
    (error) => error.code === 'permission-denied',
  )
  await assert.rejects(
    setDoc(doc(db, 'demo_space_submissions', 'client-edit'), {
      name: 'Changed status',
      description: 'Not allowed',
      reviewStatus: 'approved',
      submittedAt: serverTimestamp(),
    }),
    (error) => error.code === 'permission-denied',
  )
})

test('owner email/password authentication and profile creation work in demo emulators', async () => {
  const credential = await createUserWithEmailAndPassword(
    auth,
    `demo-${randomUUID()}@example.com`,
    'demo-password-123',
  )

  await setDoc(doc(db, 'users', credential.user.uid), {
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: '',
    accountType: 'owner',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  assert.equal((await getDoc(doc(db, 'users', credential.user.uid))).data().accountType, 'owner')
})
