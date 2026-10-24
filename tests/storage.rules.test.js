import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'

let environment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: 'demo-emptyspace',
    storage: {
      rules: await readFile(new URL('../storage.rules', import.meta.url), 'utf8'),
    },
  })
})

after(async () => {
  await environment?.cleanup()
})

test('space photos are public to read, owner-scoped to write, and safely deletable', async () => {
  const owner = environment.authenticatedContext('owner-1').storage()
  const otherOwner = environment.authenticatedContext('owner-2').storage()
  const visitor = environment.unauthenticatedContext().storage()
  const admin = environment.authenticatedContext('admin-1', { admin: true }).storage()
  const ownerPhotoPath = 'spaces/owner-1/submission-1/photo.jpg'
  const otherPhotoPath = 'spaces/owner-2/submission-2/photo.jpg'
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00])

  await assertSucceeds(owner.ref(ownerPhotoPath).put(jpeg, { contentType: 'image/jpeg' }))
  await assertSucceeds(owner.ref('spaces/owner-1/submission-1/photo.png')
    .put(jpeg, { contentType: 'image/png' }))
  await assertSucceeds(owner.ref('spaces/owner-1/submission-1/photo.webp')
    .put(jpeg, { contentType: 'image/webp' }))
  await assertSucceeds(owner.ref('spaces/owner-1/submission-1/max-size.jpg')
    .put(new Uint8Array(5 * 1024 * 1024), { contentType: 'image/jpeg' }))
  await assertSucceeds(visitor.ref(ownerPhotoPath).getDownloadURL())
  await assertFails(visitor.ref('spaces/owner-1/submission-1/visitor.jpg')
    .put(jpeg, { contentType: 'image/jpeg' }))
  await assertFails(otherOwner.ref(ownerPhotoPath).put(jpeg, { contentType: 'image/jpeg' }))
  await assertFails(owner.ref('spaces/owner-1/submission-1/not-an-image.txt')
    .put(jpeg, { contentType: 'text/plain' }))
  await assertFails(owner.ref('spaces/owner-1/submission-1/too-large.jpg')
    .put(new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'image/jpeg' }))

  await assertSucceeds(otherOwner.ref(otherPhotoPath).put(jpeg, { contentType: 'image/jpeg' }))
  await assertSucceeds(owner.ref(ownerPhotoPath).delete())
  await assertFails(owner.ref(otherPhotoPath).delete())
  await assertSucceeds(admin.ref(otherPhotoPath).delete())
})
