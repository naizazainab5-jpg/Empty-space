export const MAX_SPACE_PHOTO_BYTES = 5 * 1024 * 1024
export const MAX_SPACE_PHOTOS = 6

export function getSupportedImageType(bytes) {
  if (!(bytes instanceof Uint8Array)) return null
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

export async function validateSpacePhoto(file) {
  if (file.size > MAX_SPACE_PHOTO_BYTES) {
    throw new Error('Each photo must be 5 MB or smaller.')
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const contentType = getSupportedImageType(bytes)
  if (!contentType) {
    throw new Error('This file is not a supported JPEG, PNG, or WebP image.')
  }
  return contentType
}

export async function compressSpacePhoto(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1600 / bitmap.width, 1600 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare this photo. Try another image.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.86, 0.72, 0.58, 0.44]) {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result)
          else reject(new Error('Your browser could not compress this photo. Try another image.'))
        }, 'image/jpeg', quality)
      })
      if (blob.size <= MAX_SPACE_PHOTO_BYTES) return blob
    }
    throw new Error('This photo is still larger than 5 MB after compression. Choose a smaller image.')
  } finally {
    bitmap.close()
  }
}
