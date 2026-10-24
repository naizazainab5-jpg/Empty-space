import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { validateDemoSpaces } from '../scripts/seed-demo-spaces.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const spaces = JSON.parse(await readFile(path.join(projectRoot, 'data', 'demo-spaces.json'), 'utf8'))

test('demo seed has ten approved, unverified spaces with complete public details and matching images', async () => {
  assert.equal(validateDemoSpaces(spaces).length, 10)
  for (const space of spaces) {
    assert.equal(space.status, 'approved')
    assert.equal(space.isDemo, true)
    assert.equal(space.verified, false)
    assert.equal(space.state, 'Kerala')
    assert.ok(space.pricePerHour >= 0)
    assert.ok(space.capacity > 0)
    assert.ok(space.nearby.length >= 5)
    assert.ok(Object.keys(space.availability).length > 0)
    const imagePath = path.join(projectRoot, 'public', space.photoUrl.slice(1))
    await access(imagePath)
    const image = await readFile(imagePath)
    assert.equal(image[0], 0xff)
    assert.equal(image[1], 0xd8)
  }
})
