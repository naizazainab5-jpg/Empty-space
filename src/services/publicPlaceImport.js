import { importPublicPlaceDocuments } from './firestore.js'

const overpassEndpoint = 'https://overpass-api.de/api/interpreter'

function categoryFor(tags = {}) {
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.amenity === 'cafe') return 'cafe'
  if (tags.amenity === 'toilets') return 'washroom'
  if (tags.amenity === 'atm') return 'atm'
  if (tags.amenity === 'pharmacy' || tags.shop === 'chemist') return 'pharmacy'
  if (tags.shop === 'copyshop' || tags.shop === 'printer') return 'print shop'
  if (tags.shop === 'stationery') return 'stationery'
  if (tags.highway === 'bus_stop' || tags.public_transport === 'platform') return 'bus stop'
  return ''
}

export function normalizeOsmElement(element) {
  const tags = element.tags || {}
  const category = categoryFor(tags)
  const latitude = Number(element.lat ?? element.center?.lat)
  const longitude = Number(element.lon ?? element.center?.lon)
  if (!category || !tags.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  return {
    id: `osm_${element.type}_${element.id}`,
    name: tags.name,
    category,
    source: 'OpenStreetMap',
    sourceIdentifier: `${element.type}/${element.id}`,
    coordinates: { latitude, longitude },
    accessInfo: tags.access || tags.accessibility || tags.opening_hours || 'Not provided by source',
    tags: {
      amenity: tags.amenity || '',
      shop: tags.shop || '',
      opening_hours: tags.opening_hours || '',
      access: tags.access || '',
      wheelchair: tags.wheelchair || '',
    },
    attribution: '© OpenStreetMap contributors',
    sourceStatus: 'active',
    isBookable: false,
  }
}

export async function importOsmPublicPlaces({ latitude, longitude, radiusMeters }) {
  const lat = Number(latitude)
  const lon = Number(longitude)
  const radius = Number(radiusMeters)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90
    || !Number.isFinite(lon) || lon < -180 || lon > 180
    || !Number.isInteger(radius) || radius < 100 || radius > 5000) {
    throw new Error('Enter a valid latitude, longitude, and radius between 100 and 5,000 metres.')
  }

  const queryText = `[out:json][timeout:25];(node(around:${radius},${lat},${lon})[amenity~"^(restaurant|cafe|toilets|atm|pharmacy)$"];way(around:${radius},${lat},${lon})[amenity~"^(restaurant|cafe|toilets|atm|pharmacy)$"];relation(around:${radius},${lat},${lon})[amenity~"^(restaurant|cafe|toilets|atm|pharmacy)$"];node(around:${radius},${lat},${lon})[shop~"^(chemist|copyshop|printer|stationery)$"];way(around:${radius},${lat},${lon})[shop~"^(chemist|copyshop|printer|stationery)$"];relation(around:${radius},${lat},${lon})[shop~"^(chemist|copyshop|printer|stationery)$"];node(around:${radius},${lat},${lon})[highway=bus_stop];way(around:${radius},${lat},${lon})[highway=bus_stop];node(around:${radius},${lat},${lon})[public_transport=platform];);out center tags;`
  const response = await fetch(overpassEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ data: queryText }),
  })
  if (!response.ok) throw new Error(`OpenStreetMap Overpass returned HTTP ${response.status}.`)
  const payload = await response.json()
  const places = (payload.elements || []).map(normalizeOsmElement).filter(Boolean)
  await importPublicPlaceDocuments(places)
  return places.length
}
