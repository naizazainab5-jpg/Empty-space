import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const seedPath = path.join(projectRoot, 'data', 'demo-spaces.json')
const credentialPath = path.join(projectRoot, 'secrets', 'firebase-service-account.json')

function fail(message) {
  return Object.assign(new Error(message), { safeToDisplay: true })
}

export function validateDemoSpaces(spaces) {
  if (!Array.isArray(spaces) || spaces.length !== 10) {
    throw fail('The demo seed file must contain exactly 10 space records.')
  }
  const ids = new Set()
  for (const space of spaces) {
    if (!space || typeof space !== 'object' || Array.isArray(space)) {
      throw fail('Every demo space must be a JSON object.')
    }
    if (typeof space.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(space.slug) || ids.has(space.slug)) {
      throw fail('Every demo space needs a unique lowercase slug.')
    }
    ids.add(space.slug)
    if (space.state !== 'Kerala' || space.status !== 'approved' || space.isDemo !== true || space.verified !== false) {
      throw fail(`"${space.slug}" must be a Kerala demo record, approved for display, and explicitly unverified.`)
    }
    if (!['public', 'private'].includes(space.spaceType)
      || typeof space.pricePerHour !== 'number' || space.pricePerHour < 0
      || !Number.isInteger(space.capacity) || space.capacity < 1) {
      throw fail(`"${space.slug}" has an invalid type, INR price, or capacity.`)
    }
    for (const field of ['amenities', 'resources', 'safety', 'washroom', 'availability']) {
      if (!space[field] || typeof space[field] !== 'object' || Array.isArray(space[field])) {
        throw fail(`"${space.slug}" needs a valid "${field}" object.`)
      }
    }
    if (!Array.isArray(space.nearby) || space.nearby.length < 5) {
      throw fail(`"${space.slug}" must include at least five illustrative nearby places.`)
    }
    const expectedImage = `/images/${space.slug}.jpg`
    if (space.photoUrl !== expectedImage || !Array.isArray(space.photos) || !space.photos.includes(expectedImage)) {
      throw fail(`"${space.slug}" image paths must point to ${expectedImage}.`)
    }
  }
  return spaces
}

async function run() {
  const dryRun = process.argv.includes('--dry-run')
  if (process.argv.slice(2).some((argument) => argument !== '--dry-run')
    || process.argv.filter((argument) => argument === '--dry-run').length > 1) {
    throw fail('Use this script with no arguments or the single optional --dry-run flag.')
  }

  let spaces
  try {
    spaces = validateDemoSpaces(JSON.parse(await readFile(seedPath, 'utf8')))
  } catch (error) {
    if (error.safeToDisplay) throw error
    throw fail('Could not parse data/demo-spaces.json.')
  }

  for (const space of spaces) {
    const imagePath = path.join(projectRoot, 'public', 'images', `${space.slug}.jpg`)
    try {
      await readFile(imagePath)
    } catch {
      throw fail(`Missing ${path.relative(projectRoot, imagePath)}. Run npm run generate:demo-images first.`)
    }
  }

  if (dryRun) {
    console.log('Dry run passed: all 10 demo records and matching local images are valid. Nothing was written.')
    return
  }

  let serviceAccount
  try {
    serviceAccount = JSON.parse(await readFile(credentialPath, 'utf8'))
  } catch {
    throw fail('Save the Firebase service-account JSON as secrets/firebase-service-account.json before seeding.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw fail('The service-account file is missing required Firebase Admin SDK fields.')
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  }, `demo-space-seed-${Date.now()}`)
  const db = getFirestore(app)

  for (const space of spaces) {
    const { slug, ...data } = space
    await db.collection('spaces').doc(slug).set({
      ...data,
      id: slug,
      status: 'approved',
      isDemo: true,
      verified: false,
      lastUpdated: FieldValue.serverTimestamp(),
    })
    console.log(`Seeded spaces/${slug} (approved demo record).`)
  }
  console.log(`Seeded ${spaces.length} demo spaces into project ${serviceAccount.project_id}.`)
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === entryPoint) {
  run().catch((error) => {
    console.error(error.safeToDisplay
      ? `Demo seeding stopped: ${error.message}`
      : `Demo seeding failed${error.code ? ` (${error.code})` : ''}. Check Firebase project and service-account permissions.`)
    process.exitCode = 1
  })
}
