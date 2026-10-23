import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'

const [projectId, uid, action] = process.argv.slice(2)
if (!projectId || !uid || !['grant', 'revoke'].includes(action)) {
  console.error('Usage: node scripts/manage-admin-claim.mjs <firebase-project-id> <user-uid> <grant|revoke>')
  process.exit(1)
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
})

try {
  const auth = getAuth(app)
  const user = await auth.getUser(uid)
  const claims = { ...user.customClaims }
  if (action === 'grant') claims.admin = true
  else delete claims.admin
  await auth.setCustomUserClaims(uid, claims)
  console.log(`Administrator claim ${action === 'grant' ? 'granted to' : 'removed from'} ${uid} in ${projectId}.`)
} catch (error) {
  console.error(`Could not ${action} the administrator claim: ${error.message}`)
  process.exitCode = 1
}
