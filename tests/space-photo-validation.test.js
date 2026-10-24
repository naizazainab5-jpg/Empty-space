import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSupportedImageType, validateSpacePhoto } from '../src/utils/imageFiles.js'

const jpegHeader = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webpHeader = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

function mockFile(bytes, size = bytes.length) {
  return {
    size,
    slice: (start, end) => new Blob([bytes.slice(start, end)]),
  }
}

test('detects JPEG, PNG, and WebP from their file signatures', () => {
  assert.equal(getSupportedImageType(jpegHeader), 'image/jpeg')
  assert.equal(getSupportedImageType(pngHeader), 'image/png')
  assert.equal(getSupportedImageType(webpHeader), 'image/webp')
  assert.equal(getSupportedImageType(Uint8Array.from([0x47, 0x49, 0x46, 0x38])), null)
})

test('validates the actual bytes and accepts a photo up to 5 MB', async () => {
  assert.equal(await validateSpacePhoto(mockFile(pngHeader, 5 * 1024 * 1024)), 'image/png')
  await assert.rejects(
    validateSpacePhoto(mockFile(jpegHeader, 5 * 1024 * 1024 + 1)),
    /5 MB or smaller/,
  )
  await assert.rejects(
    validateSpacePhoto(mockFile(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))),
    /not a supported JPEG, PNG, or WebP/,
  )
})
