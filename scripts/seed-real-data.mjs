import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import sharp from 'sharp'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataPath = path.join(projectRoot, 'data', 'real-spaces.json')
const photosRoot = path.join(projectRoot, 'data', 'photos')
const validImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const maxPhotoCount = 6
const maxPhotoBytes = 5 * 1024 * 1024

const requiredTextFields = [
  'name', 'description', 'spaceType', 'category', 'state', 'district',
  'locality', 'address', 'seatingType', 'atmosphere', 'indoorOutdoor',
  'openingHours',
]
const requiredMapFields = ['amenities', 'resources', 'availability', 'safety', 'washroom']

function seedError(message) {
  return Object.assign(new Error(message), { safeToDisplay: true })
}

export function validateRealSpaces(spaces) {
  if (!Array.isArray(spaces) || spaces.length === 0) {
    throw seedError('The data file must contain a non-empty array of spaces.')
  }

  const seenSlugs = new Set()
  for (const [index, space] of spaces.entries()) {
    const row = index + 1
    if (!space || typeof space !== 'object' || Array.isArray(space)) {
      throw seedError(`Space entry ${row} must be a JSON object.`)
    }
    if (typeof space.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(space.slug)) {
      throw seedError(`Space entry ${row} needs a lowercase, hyphen-separated slug.`)
    }
    if (seenSlugs.has(space.slug)) throw seedError(`The slug "${space.slug}" is repeated.`)
    seenSlugs.add(space.slug)

    for (const field of requiredTextFields) {
      if (typeof space[field] !== 'string' || !space[field].trim()) {
        throw seedError(`Space "${space.slug}" needs a non-empty "${field}" field.`)
      }
    }
    if (!['private', 'public'].includes(space.spaceType)) {
      throw seedError(`Space "${space.slug}" must use "private" or "public" for spaceType.`)
    }
    for (const field of ['latitude', 'longitude', 'capacity', 'pricePerHour']) {
      if (typeof space[field] !== 'number' || !Number.isFinite(space[field])) {
        throw seedError(`Space "${space.slug}" needs a valid number for "${field}".`)
      }
    }
    if (space.latitude < -90 || space.latitude > 90
      || space.longitude < -180 || space.longitude > 180
      || space.capacity < 1 || space.pricePerHour < 0) {
      throw seedError(`Space "${space.slug}" has coordinates, capacity, or price outside the allowed range.`)
    }
    for (const field of requiredMapFields) {
      if (!space[field] || typeof space[field] !== 'object' || Array.isArray(space[field])) {
        throw seedError(`Space "${space.slug}" needs an object for "${field}".`)
      }
    }
    if (space.permittedActivities !== undefined
      && (!Array.isArray(space.permittedActivities)
        || space.permittedActivities.some((activity) => typeof activity !== 'string'))) {
      throw seedError(`Space "${space.slug}" must use a list of strings for "permittedActivities".`)
    }
    if (!Array.isArray(space.permittedActivities) || space.permittedActivities.length === 0) {
      throw seedError(`Space "${space.slug}" needs at least one permitted activity.`)
    }
    if (!Object.values(space.availability).some((times) => (
      Array.isArray(times) && times.some((time) => typeof time === 'string' && time.trim())
    ))) {
      throw seedError(`Space "${space.slug}" needs at least one available day and time.`)
    }
    if (space.name.length > 120 || space.description.length > 3000) {
      throw seedError(`Space "${space.slug}" has a name or description that is too long.`)
    }
  }

  return spaces
}

async function getPhotoFiles(slug) {
  const directory = path.join(photosRoot, slug)
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw seedError(`Could not read the photo folder for "${slug}".`)
  }
  const files = entries.filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
  const unsupported = files.find((entry) => !validImageExtensions.has(path.extname(entry.name).toLowerCase()))
  if (unsupported) {
    throw seedError(`Photo folder for "${slug}" contains unsupported file "${unsupported.name}". Use JPEG, PNG, or WebP only.`)
  }
  const nestedDirectory = entries.find((entry) => entry.isDirectory())
  if (nestedDirectory) {
    throw seedError(`Photo folder for "${slug}" must contain image files directly, not nested folders.`)
  }
  const orderedNames = files
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))

  if (orderedNames.length > maxPhotoCount) {
    throw seedError(`Space "${slug}" has more than ${maxPhotoCount} photos.`)
  }
  return orderedNames.map((name) => path.join(directory, name))
}

export async function preparePhoto(filePath, slug) {
  let image
  try {
    image = sharp(filePath, { failOn: 'error' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
      throw seedError(`Photo "${path.basename(filePath)}" for "${slug}" is not a JPEG, PNG, or WebP image.`)
    }
    let quality = 84
    let output
    do {
      output = await sharp(filePath, { failOn: 'error' })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()
      quality -= 10
    } while (output.length > maxPhotoBytes && quality >= 44)

    if (output.length > maxPhotoBytes) {
      throw seedError(`Photo "${path.basename(filePath)}" for "${slug}" is still larger than 5 MB after resizing.`)
    }
    return output
  } catch (error) {
    if (error.safeToDisplay) throw error
    throw seedError(`Could not process photo "${path.basename(filePath)}" for "${slug}". Check that the image file is valid.`)
  }
}

function downloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`
}

async function loadSpaces() {
  let content
  try {
    content = await readFile(dataPath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw seedError('Create data/real-spaces.json from data/real-spaces.example.json before running this script.')
    }
    throw seedError('Could not read data/real-spaces.json.')
  }
  let spaces
  try {
    spaces = JSON.parse(content)
  } catch {
    throw seedError('data/real-spaces.json is not valid JSON.')
  }
  return validateRealSpaces(spaces)
}

async function createFirebaseClients() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET
  if (!serviceAccountPath || !bucketName) {
    throw seedError('Set FIREBASE_SERVICE_ACCOUNT_PATH and FIREBASE_STORAGE_BUCKET before uploading.')
  }

  let serviceAccount
  try {
    serviceAccount = JSON.parse(await readFile(path.resolve(serviceAccountPath), 'utf8'))
  } catch {
    throw seedError('Could not load the service account. Check its path and JSON format without sharing the key.')
  }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw seedError('The service-account JSON is missing required Firebase Admin fields.')
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
    storageBucket: bucketName,
  }, `real-data-seed-${Date.now()}`)
  return {
    db: getFirestore(app),
    bucket: getStorage(app).bucket(bucketName),
  }
}

async function run() {
  const args = process.argv.slice(2)
  if (args.some((argument) => argument !== '--dry-run') || args.filter((argument) => argument === '--dry-run').length > 1) {
    throw seedError('Use this script with no arguments or the single optional --dry-run flag.')
  }
  const dryRun = args.includes('--dry-run')
  const spaces = await loadSpaces()
  const prepared = []

  for (const space of spaces) {
    const photos = []
    for (const filePath of await getPhotoFiles(space.slug)) {
      photos.push({
        name: path.basename(filePath),
        buffer: await preparePhoto(filePath, space.slug),
      })
    }
    prepared.push({ space, photos })
    console.log(`Validated "${space.slug}" with ${photos.length} photo(s).`)
  }

  if (dryRun) {
    console.log(`Dry run complete. ${prepared.length} space(s) are valid; nothing was uploaded or written.`)
    return
  }

  const { db, bucket } = await createFirebaseClients()
  for (const { space, photos: preparedPhotos } of prepared) {
    const photos = []
    for (const [index, photo] of preparedPhotos.entries()) {
      const filename = `photo-${String(index + 1).padStart(2, '0')}.jpg`
      const objectPath = `spaces/seed/${space.slug}/${filename}`
      const token = createHash('sha256').update(objectPath).digest('hex')
      await bucket.file(objectPath).save(photo.buffer, {
        resumable: false,
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public,max-age=31536000',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      })
      photos.push(downloadUrl(bucket.name, objectPath, token))
    }

    await db.collection('spaces').doc(space.slug).set({
      ...space,
      id: space.slug,
      status: 'approved',
      isDemo: false,
      verified: false,
      photos,
      photoUrl: photos[0] || '',
      lastUpdated: FieldValue.serverTimestamp(),
    })
    console.log(`Seeded "${space.slug}" as an approved listing with ${photos.length} photo(s).`)
  }
  console.log(`Finished. ${prepared.length} real space(s) were written.`)
}

const entryPoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === entryPoint) {
  run().catch((error) => {
    if (error.safeToDisplay) {
      console.error(`Seed failed: ${error.message}`)
    } else {
      console.error(`Seed failed${error?.code ? ` (${error.code})` : ''}. Check Firebase project access, Storage billing, and Firestore permissions.`)
    }
    process.exitCode = 1
  })
}
