import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { preparePhoto, validateRealSpaces } from '../scripts/seed-real-data.mjs'

const exampleSpaces = JSON.parse(await readFile(
  new URL('../data/real-spaces.example.json', import.meta.url),
  'utf8',
))

test('the real-space example contains two valid, app-shaped listings', () => {
  assert.equal(validateRealSpaces(exampleSpaces).length, 2)
  for (const field of [
    'name', 'description', 'spaceType', 'district', 'locality', 'address',
    'latitude', 'longitude', 'capacity', 'pricePerHour', 'amenities',
    'resources', 'availability', 'safety', 'washroom',
  ]) {
    assert.ok(Object.hasOwn(exampleSpaces[0], field), `Missing example field: ${field}`)
  }
})

test('seed data rejects duplicate slugs and invalid photo fields', () => {
  assert.throws(
    () => validateRealSpaces([exampleSpaces[0], { ...exampleSpaces[1], slug: exampleSpaces[0].slug }]),
    /slug .* repeated/,
  )
  assert.throws(
    () => validateRealSpaces([{ ...exampleSpaces[0], latitude: '11.2' }]),
    /valid number for "latitude"/,
  )
})

test('seed photos are resized and re-encoded without EXIF metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'emptyspace-seed-test-'))
  const imagePath = path.join(directory, 'photo.jpg')
  try {
    const source = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: '#849977',
      },
    }).jpeg().withExif({ IFD0: { Make: 'test-camera' } }).toBuffer()
    await writeFile(imagePath, source)

    const result = await preparePhoto(imagePath, 'sample-space')
    const metadata = await sharp(result).metadata()
    assert.ok(metadata.width <= 1600)
    assert.ok(metadata.height <= 1600)
    assert.equal(metadata.exif, undefined)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
