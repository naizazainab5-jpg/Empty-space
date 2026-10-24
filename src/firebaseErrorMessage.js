const knownMessages = {
  'auth/email-already-in-use': 'There is already an account with this email. Sign in instead, or use another email address.',
  'auth/weak-password': 'Choose a stronger password. Use at least 8 characters.',
  'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this Firebase project. Enable it in Firebase Console under Authentication → Sign-in method.',
  'auth/invalid-api-key': 'Firebase rejected the API key. Check the Firebase web app values in the project-root .env.local file, then restart Vite.',
  'auth/invalid-credential': 'The email or password is incorrect. Check both and try again.',
  'auth/invalid-email': 'Enter a valid email address and try again.',
  'auth/user-not-found': 'No account was found for that email. Create an owner account first.',
  'auth/wrong-password': 'The email or password is incorrect. Check both and try again.',
  'auth/user-disabled': 'This account is disabled. Contact the project administrator for help.',
  'auth/too-many-requests': 'There have been too many attempts. Wait a little while before trying again.',
  'auth/network-request-failed': 'Firebase could not connect. Check your internet connection and try again.',
  'functions/unavailable': 'The submission service is temporarily unavailable. Check your connection and try again.',
  'functions/failed-precondition': 'Firebase security verification is not ready. Check the App Check setup and try again.',
  'functions/permission-denied': 'Firebase security rules did not allow this request. Check the account permissions and try again.',
  'permission-denied': 'Firebase security rules did not allow this request. Check the account permissions and try again.',
  'storage/unauthorized': 'Firebase Storage denied this photo upload. Check that Storage is enabled and the secure Storage rules are deployed.',
  'storage/canceled': 'The photo upload was cancelled. Try again when you are ready.',
  'storage/retry-limit-exceeded': 'The photo upload could not finish because of a connection problem. Check your internet and retry.',
  'storage/quota-exceeded': 'This Firebase project has reached its Storage limit. Contact the project administrator.',
}

export function firebaseErrorMessage(error, fallback) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (knownMessages[code]) return knownMessages[code]
  if (code.includes('network') || code === 'unavailable' || error instanceof TypeError) {
    return 'Firebase could not connect. Check your internet connection and try again.'
  }
  if (code.startsWith('auth/')) return 'Firebase could not complete sign-in. Check your account details and try again.'
  if (code.startsWith('functions/')) return 'Firebase could not process this submission. Check the project setup and try again.'
  if (code.startsWith('firestore/')) return 'Firebase could not save this information. Check your connection and account permissions, then try again.'
  if (code.startsWith('storage/')) return 'Firebase could not upload this photo. Check the Storage setup and your connection, then try again.'
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message
    : fallback
}
