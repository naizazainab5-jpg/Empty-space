import { getApp, getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every((value) => typeof value === 'string' && value.trim())
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY
export const firebaseApp = firebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null
export const functions = firebaseApp ? getFunctions(firebaseApp) : null
export const firebaseEmulatorsEnabled = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
export const appCheck = firebaseApp && appCheckSiteKey
  ? initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
  : null
export const appCheckConfigured = Boolean(appCheck)

if (firebaseConfigured && firebaseEmulatorsEnabled) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

export function requireFirebase() {
  if (!firebaseConfigured || !auth || !db || !functions) {
    throw new Error('Firebase is not configured. Copy .env.example to .env.local, add your Firebase web app settings, then restart Vite.')
  }
  return { auth, db, functions }
}
