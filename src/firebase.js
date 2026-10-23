import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every((value) => typeof value === 'string' && value.trim())
export const firebaseApp = firebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null
export const auth = firebaseApp ? getAuth(firebaseApp) : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null

export function requireFirebase() {
  if (!firebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Copy .env.example to .env.local, add your Firebase web app settings, then restart Vite.')
  }
  return { auth, db }
}
