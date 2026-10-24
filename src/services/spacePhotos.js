import {
  deleteObject, getDownloadURL, ref, uploadBytesResumable,
} from 'firebase/storage'
import { requireStorage } from '../firebase.js'
import { compressSpacePhoto, validateSpacePhoto } from '../utils/imageFiles.js'

export async function uploadSpacePhoto(userId, submissionId, file, onProgress) {
  const { auth, storage } = requireStorage()
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in again with the owner account before uploading photos.')
  }

  await validateSpacePhoto(file)
  const compressed = await compressSpacePhoto(file)
  const filename = `photo-${crypto.randomUUID()}.jpg`
  const path = `spaces/${userId}/${submissionId}/${filename}`
  const photoRef = ref(storage, path)
  const task = uploadBytesResumable(photoRef, compressed, { contentType: 'image/jpeg' })

  const url = await new Promise((resolve, reject) => {
    task.on('state_changed', (snapshot) => {
      const progress = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0
      onProgress?.(progress)
    }, reject, async () => {
      try {
        resolve(await getDownloadURL(task.snapshot.ref))
      } catch (error) {
        reject(error)
      }
    })
  })

  return { url, path, filename }
}

export async function deleteSpacePhoto(userId, path) {
  const { auth, storage } = requireStorage()
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in again with the owner account before removing photos.')
  }
  const photoRef = ref(storage, path)
  const expectedPrefix = `spaces/${userId}/`
  if (!photoRef.fullPath.startsWith(expectedPrefix)) {
    throw new Error('This photo does not belong to your owner account.')
  }
  await deleteObject(photoRef)
}
