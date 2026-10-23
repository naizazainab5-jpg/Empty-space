const keralaDistricts = new Set([
  'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam',
  'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta',
  'Thiruvananthapuram', 'Thrissur', 'Wayanad',
])

const supportedSpaceTypes = new Set(['public', 'private'])
const supportedCategories = new Set(['Room', 'Hall', 'Rooftop', 'Cafe corner', 'Studio', 'Other'])
const coordinateRanges = {
  latitude: [8, 13],
  longitude: [74, 78],
}

const text = (value) => typeof value === 'string' ? value.trim() : ''
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value)

export function evaluateSpaceSubmission(submission, { possibleDuplicates = [] } = {}) {
  const errors = []
  const warnings = []
  const name = text(submission.name)
  const description = text(submission.description)
  const locality = text(submission.locality)
  const address = text(submission.address)
  const district = text(submission.district)
  const accessInformation = text(submission.accessInformation)
  const activities = Array.isArray(submission.permittedActivities) ? submission.permittedActivities : []
  const spaceType = text(submission.spaceType)
  const privateBooking = submission.privateBooking === true
  const price = submission.hourlyPrice
  const latitude = submission.latitude
  const longitude = submission.longitude
  const lastConfirmedAt = text(submission.lastConfirmedAt)

  if (name.length < 3 || name.length > 120) errors.push('Name must be between 3 and 120 characters.')
  if (description.length < 20 || description.length > 1000) errors.push('Description must be between 20 and 1000 characters.')
  if (!supportedCategories.has(text(submission.category))) errors.push('Choose a supported space category.')
  if (text(submission.state) !== 'Kerala') errors.push('This submission flow currently accepts Kerala locations only.')
  if (!keralaDistricts.has(district)) errors.push('Choose a valid Kerala district.')
  if (locality.length < 2 || locality.length > 100) errors.push('Enter a locality between 2 and 100 characters.')
  if (address.length < 5 || address.length > 300) errors.push('Enter a usable address between 5 and 300 characters.')
  if (!supportedSpaceTypes.has(spaceType)) errors.push('Choose Public or Private space type.')
  if (!accessInformation || accessInformation.length > 500) errors.push('Explain who can access the space and any restrictions (up to 500 characters).')
  if (!finiteNumber(latitude) || latitude < coordinateRanges.latitude[0] || latitude > coordinateRanges.latitude[1]) {
    errors.push('Enter a valid latitude within Kerala.')
  }
  if (!finiteNumber(longitude) || longitude < coordinateRanges.longitude[0] || longitude > coordinateRanges.longitude[1]) {
    errors.push('Enter a valid longitude within Kerala.')
  }
  if (!Number.isInteger(submission.capacity) || submission.capacity < 1 || submission.capacity > 1000) {
    errors.push('Capacity must be a whole number from 1 to 1000.')
  }
  if (!activities.length || activities.length > 10
    || activities.some((activity) => typeof activity !== 'string' || !text(activity) || text(activity).length > 80)) {
    errors.push('Choose at least one clear permitted activity.')
  }
  const confirmedDate = Date.parse(`${lastConfirmedAt}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastConfirmedAt)
    || Number.isNaN(confirmedDate)
    || confirmedDate > Date.now()) {
    errors.push('Enter the date when availability was last confirmed.')
  }
  if (!text(submission.openingHours) || text(submission.openingHours).length > 200) {
    errors.push('Enter opening hours or state when access must be arranged.')
  }
  if (!submission.availability || typeof submission.availability !== 'object'
    || !Object.values(submission.availability).some((slots) => Array.isArray(slots) && slots.some((slot) => text(slot)))) {
    errors.push('Provide at least one day and time when availability was confirmed.')
  }
  if (privateBooking && spaceType !== 'private') {
    errors.push('Private booking can only be selected for a Private space.')
  }
  if (privateBooking && (!finiteNumber(price) || price <= 0 || price > 1000000)) {
    errors.push('A private paid booking needs an hourly price greater than zero.')
  }
  if (!privateBooking && price !== null) {
    errors.push('Leave hourly price blank unless the space is available for private paid booking.')
  }

  if (!Array.isArray(submission.evidenceUrls) || submission.evidenceUrls.length === 0) {
    warnings.push('No evidence link was supplied; an administrator must verify the property independently.')
  } else if (submission.evidenceUrls.length > 5 || submission.evidenceUrls.some((url) => {
    if (typeof url !== 'string' || url.length > 500) return true
    try {
      return new URL(url).protocol !== 'https:'
    } catch {
      return true
    }
  })) {
    errors.push('Evidence links must be up to five valid HTTPS URLs.')
  }
  if (possibleDuplicates.length) {
    warnings.push('Possible duplicate listings need human review before publication.')
  }
  warnings.push('Submitting this form does not prove the space exists, is empty, safe, or legally available.')

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    possibleDuplicates: possibleDuplicates.slice(0, 5),
    humanVerificationRequired: true,
  }
}

export function publicSpaceFromSubmission(submission, submissionId) {
  const isPrivateBooking = submission.privateBooking === true
  return {
    name: text(submission.name),
    description: text(submission.description),
    spaceType: submission.spaceType,
    category: submission.category,
    state: submission.state,
    district: submission.district,
    locality: text(submission.locality),
    area: text(submission.locality),
    permittedActivities: submission.permittedActivities,
    capacity: submission.capacity,
    pricePerHour: isPrivateBooking ? submission.hourlyPrice : null,
    pricingType: isPrivateBooking ? 'hourly' : 'not_listed',
    privateBooking: isPrivateBooking,
    accessInformation: text(submission.accessInformation),
    openingHours: text(submission.openingHours),
    availability: submission.availability || {},
    amenities: submission.amenities || {},
    resources: submission.resources || {},
    seatingType: submission.seatingType || '',
    atmosphere: submission.atmosphere || '',
    indoorOutdoor: submission.indoorOutdoor || '',
    photoUrl: '',
    images: [],
    status: 'approved',
    verified: false,
    sourceSubmissionId: submissionId,
    reviewedAt: new Date(),
    lastUpdated: new Date(),
    availabilitySource: 'submitter-declared',
  }
}
