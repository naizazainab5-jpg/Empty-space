import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, Briefcase,
  Check, Clock3, Coffee, Compass, Crosshair, GraduationCap,
  Heart, MapPin, Menu, Minus, Plus, Printer, Search, Shield,
  ShieldCheck, SlidersHorizontal, Sparkles, Star, Wifi, X, Zap,
} from 'lucide-react'
import { auth, firebaseConfigured } from './firebase.js'
import { createReportFlag, getApprovedSpaces, getCrowdReportSummary } from './services/firestore.js'
import './App.css'

const resourceLabels = {
  wifi: 'Wi-Fi',
  charging: 'Charging',
  projector: 'Projector',
  whiteboard: 'Whiteboard',
  printer: 'Printer',
  powerBackup: 'Power backup',
  quiet: 'Quiet',
  ac: 'Air conditioning',
}

const keralaDistricts = [
  'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam',
  'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta',
  'Thiruvananthapuram', 'Thrissur', 'Wayanad',
]

const categoriesByMode = {
  Student: [
    { id: 'study-session', label: 'Study session' },
    { id: 'group-study', label: 'Group study' },
    { id: 'exam-preparation', label: 'Exam preparation' },
    { id: 'online-classes', label: 'Online classes' },
    { id: 'project-work', label: 'Project work' },
    { id: 'reading-research', label: 'Reading & research' },
  ],
  Professional: [
    { id: 'remote-work', label: 'Remote work' },
    { id: 'individual-work', label: 'Individual work' },
    { id: 'team-meetings', label: 'Team meetings' },
    { id: 'client-meetings', label: 'Client meetings' },
    { id: 'workshops', label: 'Workshops' },
    { id: 'business-discussions', label: 'Business discussions' },
    { id: 'interviews', label: 'Interviews' },
  ],
}

const comfortOptions = [
  { id: 'womenFriendly', label: 'Women-friendly features' },
  { id: 'womenOnly', label: 'Women-only spaces or hours' },
]

const rotatingMessages = [
  "From a focused study session to a full-room brainstorm, find a place that feels right for what you're making.",
  'A quiet corner for your next big idea. A little room can change everything.',
  'Study solo, create together, or find the focus you need to get things done.',
  'Your next breakthrough might just need a different space.',
  'From exam prep to team meetings, make room for what matters today.',
  'Find your focus, bring your people, and make something happen.',
  'Every good idea deserves a space to grow.',
]

const geocodingEndpoint = import.meta.env.VITE_GEOCODING_ENDPOINT?.trim()

// To use your own logo, place an SVG, PNG, or WebP at public/emptyspace-logo.svg
// and set this path. Leave it empty to keep the CSS EmptySpace mark.
const CUSTOM_LOGO_PATH = ''

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const money = (value) => `₹${value.toLocaleString('en-IN')}`
const daysAgo = (date, now) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 86400000))
const locationLabel = (space) => [space.locality || space.area, space.town, space.district].filter((value, index, list) => value && list.indexOf(value) === index).join(', ')

function getLocationSuggestions(spaces, district) {
  return [...new Set(spaces
    .filter((space) => !district || (space.district || '').toLowerCase() === district.toLowerCase())
    .flatMap((space) => [space.locality, space.area, space.town, space.district])
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
}

function spaceCoordinates(space) {
  const rawLatitude = space.coordinates?.latitude ?? space.latitude ?? space.coordinates?.lat
  const rawLongitude = space.coordinates?.longitude ?? space.longitude ?? space.coordinates?.lng
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === ''
    || rawLongitude === null || rawLongitude === undefined || rawLongitude === '') return null
  const latitude = Number(rawLatitude)
  const longitude = Number(rawLongitude)
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : null
}

function distanceKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}

function categoryLabel(mode, id) {
  return categoriesByMode[mode]?.find((category) => category.id === id)?.label.toLowerCase() || 'your plans'
}

function App() {
  const [currentTime] = useState(() => Date.now())
  const [minimumDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState('home')
  const howItWorksRef = useRef(null)
  const [scrollToHowItWorks, setScrollToHowItWorks] = useState(false)
  const [rotatingMessageIndex, setRotatingMessageIndex] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [mode, setMode] = useState('')
  const [comfort, setComfort] = useState('')
  const [locationCoordinates, setLocationCoordinates] = useState(null)
  const [locationStatus, setLocationStatus] = useState({ type: 'idle', message: '' })
  const [locating, setLocating] = useState(false)
  const locationRequestId = useRef(0)
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [nearbyRadius, setNearbyRadius] = useState('25')
  const [logoFailed, setLogoFailed] = useState(false)
  const [selectedResources, setSelectedResources] = useState([])
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState({ purpose: '', people: '4', budget: '500', spaceType: 'public', state: 'Kerala', district: '', location: '', duration: '2' })
  const [approvedSpaces, setApprovedSpaces] = useState([])
  const [listingLoading, setListingLoading] = useState(firebaseConfigured)
  const [listingError, setListingError] = useState('')
  const locationSuggestions = useMemo(() => getLocationSuggestions(approvedSpaces, search.district), [approvedSpaces, search.district])
  const [activeSpace, setActiveSpace] = useState(null)
  const [crowdReportState, setCrowdReportState] = useState({ spaceId: '', status: 'Unknown', reports: 0, error: '' })
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [slot, setSlot] = useState('')
  const [hours, setHours] = useState(2)
  const [bookedSlots, setBookedSlots] = useState([])
  const [booking, setBooking] = useState(null)
  const [saved, setSaved] = useState([])
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notice, setNotice] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('Inaccurate listing details')
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    let active = true
    if (!firebaseConfigured) return undefined
    getApprovedSpaces().then((items) => {
      if (active) setApprovedSpaces(items)
    }).catch((error) => {
      if (active) setListingError(error.message || 'Approved listings could not be loaded from Firestore.')
    }).finally(() => {
      if (active) setListingLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!activeSpace) return undefined
    let active = true
    getCrowdReportSummary(activeSpace.id)
      .then((summary) => { if (active) setCrowdReportState({ spaceId: activeSpace.id, ...summary, error: '' }) })
      .catch((error) => {
        if (active) {
          setCrowdReportState({
            spaceId: activeSpace.id,
            status: 'Unknown',
            reports: 0,
            error: error.message || 'Recent crowd reports could not be loaded.',
          })
        }
      })
    return () => { active = false }
  }, [activeSpace])

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setPrefersReducedMotion(motionPreference.matches)
    updateMotionPreference()
    motionPreference.addEventListener('change', updateMotionPreference)
    return () => motionPreference.removeEventListener('change', updateMotionPreference)
  }, [])

  useEffect(() => {
    if (prefersReducedMotion || page !== 'home') return undefined
    const timer = window.setInterval(() => {
      setRotatingMessageIndex((index) => (index + 1) % rotatingMessages.length)
    }, 4500)
    return () => window.clearInterval(timer)
  }, [page, prefersReducedMotion])

  useEffect(() => {
    if (page !== 'home' || !scrollToHowItWorks) return undefined
    const frame = window.requestAnimationFrame(() => {
      howItWorksRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      })
      setScrollToHowItWorks(false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [page, prefersReducedMotion, scrollToHowItWorks])

  const displayedListingError = firebaseConfigured
    ? listingError
    : 'Firebase is not configured. Approved listings are unavailable until Firebase is set up.'
  const currentCrowdReport = crowdReportState.spaceId === activeSpace?.id
    ? crowdReportState
    : { status: 'Unknown', reports: 0, error: '' }

  const results = useMemo(() => {
    const loweredLocation = search.location.trim().toLowerCase()
    const loweredDistrict = search.district.trim().toLowerCase()
    return approvedSpaces.filter((space) => {
      const listingDistrict = (space.district || '').toLowerCase()
      const listingLocation = `${space.locality || space.area} ${space.town || ''} ${listingDistrict} Kerala`.toLowerCase()
      const matchesDistrict = !loweredDistrict || listingDistrict === loweredDistrict
      const matchesLocation = !loweredLocation || listingLocation.includes(loweredLocation)
      const matchesSpaceType = space.spaceType === search.spaceType
      const matchesBudget = search.spaceType !== 'private' || space.pricePerHour <= Number(search.budget || Infinity)
      const matchesPeople = space.capacity >= Number(search.people || 1)
      const matchesDuration = Object.values(space.availability || {}).some((slots) => slots.some((time) => slotDuration(time) >= Number(search.duration || 1)))
      const matchesMode = !mode || (space.permittedActivities || []).some((activity) => activity.toLowerCase().replace(/[^a-z0-9]+/g, '-') === search.purpose)
      const coordinates = spaceCoordinates(space)
      const distance = locationCoordinates && coordinates ? distanceKm(locationCoordinates, coordinates) : null
      const matchesNearby = !nearbyOnly || (distance !== null && distance <= Number(nearbyRadius))
      const restaurantDistances = locationCoordinates
        ? (space.nearby || [])
          .filter((item) => ['restaurant', 'cafe'].includes(item.type))
          .map(spaceCoordinates)
          .filter(Boolean)
          .map((restaurantCoordinates) => distanceKm(locationCoordinates, restaurantCoordinates))
        : []
      const nearestRestaurantDistance = restaurantDistances.length ? Math.min(...restaurantDistances) : null
      const matchesRestaurants = !filters.includes('restaurant')
        || (nearestRestaurantDistance !== null && nearestRestaurantDistance <= Number(nearbyRadius))
      const matchesResources = selectedResources.every((resource) => {
        if (resource === 'quiet') return space.atmosphere === 'quiet'
        if (resource === 'charging') return space.resources.powerSockets > 0
        if (resource === 'wifi') return Boolean(space.amenities.wifi)
        if (resource === 'ac') return Boolean(space.amenities.ac)
        if (resource === 'powerBackup') return Boolean(space.resources.powerBackup)
        if (resource === 'printer') return Boolean(space.resources.printerAccess)
        return Boolean(space.amenities[resource])
      })
      const hasWomenFriendlyFeatures = [space.safety.cctv, space.safety.wellLit, space.safety.securedEntry, space.safety.ownerIdVerified].every(Boolean)
      const matchesWomen = !comfort
        || (comfort === 'womenFriendly' && hasWomenFriendlyFeatures)
        || (comfort === 'womenOnly' && (space.safety.womenOnly === true || Boolean(space.safety.womenOnlyHours)))
      const activeFilters = filters.every((filter) => {
        if (filter === 'cctv') return space.safety.cctv
        if (filter === 'transport') return space.safety.nearPublicTransport
        if (filter === 'washroom') return space.washroom.onSite
        return true
      })
      return matchesSpaceType && matchesDistrict && matchesLocation && matchesBudget && matchesPeople && matchesDuration && matchesMode && matchesNearby && matchesRestaurants && matchesResources && matchesWomen && activeFilters
    }).sort((a, b) => {
      if (nearbyOnly) return distanceKm(locationCoordinates, spaceCoordinates(a)) - distanceKm(locationCoordinates, spaceCoordinates(b))
      if (filters.includes('restaurant') && locationCoordinates) {
        const restaurantDistance = (space) => {
          const distances = (space.nearby || [])
            .filter((item) => ['restaurant', 'cafe'].includes(item.type))
            .map(spaceCoordinates)
            .filter(Boolean)
            .map((coordinates) => distanceKm(locationCoordinates, coordinates))
          return distances.length ? Math.min(...distances) : Infinity
        }
        return restaurantDistance(a) - restaurantDistance(b)
      }
      if (mode === 'Student') return studentScore(a) - studentScore(b)
      return professionalScore(b) - professionalScore(a)
    })
  }, [approvedSpaces, comfort, filters, locationCoordinates, mode, nearbyOnly, nearbyRadius, search, selectedResources])

  const coordinateListingCount = approvedSpaces.filter((space) => spaceCoordinates(space)).length
  const restaurantCoordinateCount = approvedSpaces
    .flatMap((space) => space.nearby || [])
    .filter((item) => ['restaurant', 'cafe'].includes(item.type) && spaceCoordinates(item)).length

  const toggleResource = (resource) => setSelectedResources((current) => current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource])
  const toggleFilter = (filter) => {
    setFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter])
    if (filter === 'restaurant' && !filters.includes(filter)) {
      setLocationStatus({
        type: 'warning',
        message: !locationCoordinates
          ? 'Restaurants near me needs your current location. Use the location button in search first.'
          : restaurantCoordinateCount === 0
            ? 'Restaurant proximity is unavailable because no public-place coordinates are linked to these listings.'
            : 'Restaurant results use coordinate-backed places within your selected radius.',
      })
    }
  }
  const isWomenFriendly = (space) => [space.safety.cctv, space.safety.wellLit, space.safety.securedEntry, space.safety.ownerIdVerified].every(Boolean)

  function changeMode(nextMode) {
    setMode(nextMode)
    setSearch((current) => ({ ...current, purpose: '' }))
  }

  function changeDistrict(district) {
    const currentLocationIsValid = !district || getLocationSuggestions(approvedSpaces, district)
      .some((location) => location.toLowerCase() === search.location.trim().toLowerCase())
    locationRequestId.current += 1
    setLocating(false)
    setLocationCoordinates(null)
    setNearbyOnly(false)
    setSearch((current) => ({
      ...current,
      district,
      location: currentLocationIsValid ? current.location : '',
    }))
    setLocationStatus({
      type: 'idle',
      message: district && !currentLocationIsValid && search.location
        ? 'The previous locality was cleared because it is not in the selected district.'
        : '',
    })
  }

  function changeManualLocation(location) {
    if (locationCoordinates) {
      locationRequestId.current += 1
      setLocationCoordinates(null)
      setNearbyOnly(false)
      setLocationStatus({ type: 'warning', message: 'Manual location selected. Current coordinates were cleared; use current location again for distance-based search.' })
    }
    setSearch((current) => ({ ...current, location }))
  }

  function reverseGeocode(coords) {
    if (!geocodingEndpoint) return Promise.resolve(null)
    const url = new URL(geocodingEndpoint, window.location.origin)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('addressdetails', '1')
    url.searchParams.set('lat', String(coords.latitude))
    url.searchParams.set('lon', String(coords.longitude))
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 8_000)

    return fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error(`Place lookup returned ${response.status}.`)
      return response.json()
    }).then((result) => {
      const address = result.address || {}
      const stateName = String(address.state || '')
      if (stateName && !stateName.toLowerCase().includes('kerala')) return { outsideKerala: true }
      const districtValues = [address.state_district, address.county, address.district]
        .filter(Boolean)
        .map((value) => value.toLowerCase().replace(/\s+district$/i, '').trim())
      const district = keralaDistricts.find((candidate) => districtValues.includes(candidate.toLowerCase()))
      const location = [
        address.suburb,
        address.neighbourhood,
        address.city_district,
        address.town,
        address.city,
        address.village,
      ].find(Boolean)
      return { district, location }
    }).finally(() => {
      window.clearTimeout(timeout)
    })
  }

  function requestCurrentLocation() {
    if (!window.isSecureContext) {
      setLocationStatus({ type: 'error', message: 'Location access requires a secure connection. Open this app on HTTPS or localhost.' })
      return
    }
    if (!navigator.geolocation) {
      setLocationStatus({ type: 'error', message: 'This browser does not support location access. Enter a town or district instead.' })
      return
    }

    const requestId = ++locationRequestId.current
    setLocating(true)
    setLocationStatus({ type: 'loading', message: 'Finding your current location…' })
    try {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          if (requestId !== locationRequestId.current) return
          const currentCoordinates = { latitude: coords.latitude, longitude: coords.longitude }
          setLocationCoordinates(currentCoordinates)
          setSearch((current) => ({ ...current, state: 'Kerala', district: '', location: '' }))
          if (!geocodingEndpoint) {
            setLocating(false)
            setLocationStatus({
              type: 'success',
              message: 'Coordinates captured. No place-name service is configured, so choose a district and locality manually. Approved listings do not expose exact property coordinates for proximity matching.',
            })
            return
          }
          setLocationStatus({ type: 'loading', message: 'Coordinates captured; resolving the nearest place…' })
          try {
            const resolved = await reverseGeocode(currentCoordinates)
            if (requestId !== locationRequestId.current) return
            if (resolved?.outsideKerala) {
              setLocationStatus({ type: 'warning', message: 'Your detected location is outside Kerala. The current listing service covers Kerala only.' })
            } else if (resolved?.location || resolved?.district) {
              const district = resolved.district || ''
              const location = resolved.location || ''
              setSearch((current) => ({ ...current, state: 'Kerala', district, location }))
              setLocationStatus({
                type: 'success',
                message: `Place resolved${location ? ` to ${location}` : ''}${district ? `, ${district}` : ''}. Exact property coordinates are kept private, so distance matching is unavailable.`,
              })
            } else {
              setLocationStatus({ type: 'warning', message: 'Coordinates captured, but the service did not return a Kerala locality. Choose a district and locality manually.' })
            }
          } catch {
            if (requestId !== locationRequestId.current) return
            setLocationStatus({ type: 'warning', message: 'Coordinates captured, but place lookup failed. Choose a district and locality manually; coordinates are still available for distance matching.' })
          } finally {
            if (requestId === locationRequestId.current) setLocating(false)
          }
        },
        (error) => {
          if (requestId !== locationRequestId.current) return
          const message = error.code === 1
            ? 'Location permission was denied. You can allow it in browser settings or enter a town or district.'
            : error.code === 2
              ? 'Your location is unavailable right now. Try again or enter a town or district.'
              : error.code === 3
                ? 'Location detection timed out. Try again or enter a town or district.'
                : 'Could not detect your location. Enter a town or district instead.'
          setLocating(false)
          setLocationStatus({
            type: 'error',
            message: locationCoordinates ? `${message} Your previously selected coordinates remain available.` : message,
          })
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
      )
    } catch (error) {
      setLocating(false)
      setLocationStatus({
        type: 'error',
        message: error instanceof DOMException && error.name === 'SecurityError'
          ? 'Location access is blocked by browser security settings. Open the app on HTTPS or localhost.'
          : 'Could not start location detection. Enter a town or district instead.',
      })
    }
  }

  function toggleNearby(enabled) {
    setNearbyOnly(enabled)
    if (enabled && !locationCoordinates) {
      setLocationStatus({ type: 'error', message: 'Use “Use my current location” to enable distance matching. A typed place name filters by text but cannot provide coordinates.' })
    } else if (enabled && spaces.every((space) => !spaceCoordinates(space))) {
      setLocationStatus({ type: 'error', message: 'Nearby search needs public listing coordinates. Exact owner property coordinates are not exposed, so distance matching is unavailable.' })
    }
  }

  function clearCurrentLocation() {
    locationRequestId.current += 1
    setLocating(false)
    setLocationCoordinates(null)
    setNearbyOnly(false)
    setSearch((current) => ({ ...current, district: '', location: '' }))
    setLocationStatus({ type: 'idle', message: 'Current coordinates cleared. You can still search by district or town.' })
  }

  function resetSearch() {
    locationRequestId.current += 1
    setMode('')
    setComfort('')
    setLocationCoordinates(null)
    setLocationStatus({ type: 'idle', message: '' })
    setLocating(false)
    setNearbyOnly(false)
    setNearbyRadius('25')
    setSelectedResources([])
    setFilters([])
    setSearch({ purpose: '', people: '4', budget: '500', spaceType: 'public', state: 'Kerala', district: '', location: '', duration: '2' })
    setPage('home')
  }

  function navigateToHowItWorks() {
    setMobileMenu(false)
    setScrollToHowItWorks(true)
    setPage('home')
  }

  function openDetails(space) {
    setActiveSpace(space)
    setPage('detail')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startBooking() {
    setSlot('')
    setHours(Number(search.duration || 2))
    setPage('booking')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function confirmBooking() {
    if (!slot) return
    const nextBooking = { space: activeSpace, date, slot, hours, total: activeSpace.pricePerHour * hours }
    setBookedSlots((current) => [...current, `${activeSpace.id}:${date}:${slot}`])
    setBooking(nextBooking)
    setPage('confirmation')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function submitSearch(event) {
    event.preventDefault()
    if (!mode || !search.purpose) return
    setPage('results')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitSpaceReport(event) {
    event.preventDefault()
    setReportError('')
    if (!auth?.currentUser) {
      setReportError('Sign in through the owner portal before submitting a report. Visitor accounts are not set up yet.')
      return
    }
    try {
      const details = new FormData(event.currentTarget).get('details')
      await createReportFlag(auth.currentUser, activeSpace.id, reportReason, String(details || ''))
      setReporting(false)
      setNotice('Thank you. Your report was sent to the administrator review queue.')
    } catch (error) {
      setReportError(error.message || 'Your report could not be submitted.')
    }
  }

  function toggleSaved(id) {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const selectedDay = dayNames[new Date(`${date}T12:00:00`).getDay()]
  const availableSlots = activeSpace
    ? (activeSpace.availability[selectedDay] || []).filter((time) => !bookedSlots.includes(`${activeSpace.id}:${date}:${time}`))
    : []
  const maxBookingHours = slot ? Math.max(1, Math.min(12, slotDuration(slot))) : 12
  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const restaurantFilterActive = filters.includes('restaurant')

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('home') }}>
          <BrandLogo failed={logoFailed} onError={() => setLogoFailed(true)} />
        </a>
        <button className="mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21} /></button>
        <nav className={mobileMenu ? 'main-nav is-open' : 'main-nav'}>
          <button className={page === 'home' || page === 'results' ? 'nav-link active' : 'nav-link'} onClick={() => { setPage('home'); setMobileMenu(false) }}>Find a space</button>
          <button className="nav-link nav-about" onClick={navigateToHowItWorks}>How it works</button>
        </nav>
        <a className="header-action" href="/owner">Owner sign in <ArrowUpRight size={15} /></a>
      </header>

      {page === 'home' && <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> KERALA, INDIA <span className="eyebrow-line" /> A BETTER WAY TO GATHER</div>
            <h1>There's room<br />for <em>what's next.</em></h1>
            <p className="hero-description">Discover the rooms, rooftops, and little corners already around you. Made for ideas, good company, and getting things done.</p>
            <div className="hero-proof"><span>KERALA-WIDE SEARCH</span><span>APPROVED LISTINGS ONLY</span></div>
          </div>
          <div className="hero-art" aria-label="A bright, welcoming community meeting room">
            <img src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85" alt="Sunlit creative meeting room with a long table" />
            <div className="art-label"><span className="live-dot" /> A room for the next big thing <ArrowUpRight size={15} /></div>
            <div className="floating-note"><span className="note-icon"><MapPin size={16} /></span><span><strong>Right around the corner</strong><small>Search across Kerala</small></span></div>
          </div>
        </section>

        <section className="search-wrap marketplace-search" id="guided-search" aria-label="Find your next space">
          <div className="search-panel-heading">
            <div><span className="eyebrow">A PLACE THAT FITS YOUR PLANS</span><h2>Find your next space</h2></div>
            <button className="reset-search" type="button" onClick={resetSearch}>Reset</button>
          </div>
          <div className="role-prompt">
            <h3>Are you a student or a working professional?</h3>
            <p>Choose the option that best describes you to find spaces suited to your needs.</p>
          </div>
          <div className="role-choice-row" role="group" aria-label="Who are you booking for?">
            {['Student', 'Professional'].map((role) => <button type="button" key={role} className={`role-choice ${mode === role ? 'selected' : ''}`} aria-pressed={mode === role} onClick={() => changeMode(role)}>
              <span className="role-choice-icon" aria-hidden="true">{role === 'Student' ? <GraduationCap size={20} /> : <Briefcase size={19} />}</span>
              <span className="role-choice-copy"><strong>{role === 'Student' ? 'Student' : 'Working professional'}</strong><small>{role === 'Student' ? 'Study, learn, and create' : 'Work, meet, and collaborate'}</small></span>
              {mode === role && <Check size={18} aria-hidden="true" />}
            </button>)}
          </div>
          <form className={`search-form booking-search-bar ${search.spaceType === 'private' ? 'has-budget' : 'without-budget'}`} onSubmit={submitSearch}>
            <label className="search-field activity-field"><span>ACTIVITY</span><select aria-label="Activity" value={search.purpose} disabled={!mode} onChange={(event) => setSearch((current) => ({ ...current, purpose: event.target.value }))}>
              <option value="">{mode ? 'Choose an activity' : 'Choose a role'}</option>
              {(categoriesByMode[mode] || []).map((category) => <option key={category.id} value={category.id}>{category.label.replace('&', 'and')}</option>)}
            </select></label>
            <label className="search-field people-field"><span>PEOPLE</span><div className="field-with-icon"><input aria-label="Number of people" type="number" min="1" max="100" value={search.people} onChange={(event) => setSearch((current) => ({ ...current, people: event.target.value }))} /><span>guests</span></div></label>
            <fieldset className="search-field space-type-field"><legend>SPACE TYPE</legend><div className="space-type-options" role="radiogroup" aria-label="Space type">
              {[['public', 'Public', 'Shared or publicly accessible'], ['private', 'Private', 'Private or exclusive use']].map(([value, label, description]) => <label className={`space-type-choice ${search.spaceType === value ? 'selected' : ''}`} key={value}>
                <input type="radio" name="space-type" value={value} checked={search.spaceType === value} onChange={() => setSearch((current) => ({ ...current, spaceType: value }))} />
                <span className="space-type-copy"><strong>{label}</strong><small>{description}</small></span>{search.spaceType === value && <Check size={13} aria-hidden="true" />}
              </label>)}
            </div></fieldset>
            {search.spaceType === 'private' && <label className="search-field budget-field"><span>MAX BUDGET / HR</span><div className="field-with-icon"><span>₹</span><input aria-label="Maximum budget per hour" type="number" min="0" value={search.budget} onChange={(event) => setSearch((current) => ({ ...current, budget: event.target.value }))} /></div></label>}
            <div className="search-field location-field"><span>LOCATION IN KERALA</span><div className="location-control">
              <label className="location-select-field"><span>STATE</span><select aria-label="State" value={search.state} onChange={(event) => setSearch((current) => ({ ...current, state: event.target.value }))}><option value="Kerala">Kerala</option></select></label>
              <label className="location-select-field"><span>DISTRICT</span><select aria-label="District in Kerala" value={search.district} onChange={(event) => changeDistrict(event.target.value)}><option value="">Any district</option>{keralaDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label>
              <div className="location-input-wrap"><MapPin size={14} aria-hidden="true" /><input aria-label="Town or locality in Kerala" list="kerala-location-suggestions" value={search.location} onChange={(event) => changeManualLocation(event.target.value)} placeholder="Choose a town or locality" /><datalist id="kerala-location-suggestions">{locationSuggestions.map((location) => <option key={location} value={location} />)}</datalist></div>
              <button type="button" className={`use-current-location ${locating ? 'is-locating' : ''}`} onClick={requestCurrentLocation} disabled={locating}><Crosshair size={14} aria-hidden="true" />{locating ? 'Detecting location…' : 'Use my current location'}</button>
            </div>{locationCoordinates && <button type="button" className="clear-current-location" onClick={clearCurrentLocation}>Clear current location</button>}{locationStatus.message && <span className={`location-status ${locationStatus.type}`} role="status" aria-live="polite">{locationStatus.message}</span>}<span className="geocoding-hint">{geocodingEndpoint ? 'Map preview is served by OpenStreetMap; place labels use the configured geocoder.' : 'Map preview is served by OpenStreetMap. Place-name lookup is optional; choose a district and locality manually.'}</span>{locationCoordinates && <LocationMapPreview coordinates={locationCoordinates} onChange={(coordinates) => {
              setLocationCoordinates(coordinates)
              setNearbyOnly(false)
              setSearch((current) => ({ ...current, district: '', location: '' }))
              setLocationStatus({ type: 'warning', message: 'Map point adjusted. Choose a district or locality separately; owner property coordinates remain private.' })
            }} />}</div>
            <label className="search-field duration-field"><span>DURATION</span><select aria-label="Booking duration" value={search.duration} onChange={(event) => setSearch((current) => ({ ...current, duration: event.target.value }))}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option><option value="6">6 hours</option></select></label>
            <button className="search-submit" type="submit" disabled={!mode || !search.purpose}><Search size={17} /><span>Find a space</span></button>
          </form>
          <div className="search-preferences">
            <label className="comfort-select"><span>SPACE PREFERENCES</span><select aria-label="Optional women-safety preference" value={comfort} onChange={(event) => setComfort(event.target.value)}><option value="">No additional women-specific requirement</option>{comfortOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <fieldset className="amenity-preferences"><legend>OPTIONAL AMENITIES</legend><div className="amenity-options">{Object.entries(resourceLabels).map(([key, label]) => <label key={key} className={selectedResources.includes(key) ? 'selected' : ''}><input type="checkbox" checked={selectedResources.includes(key)} onChange={() => toggleResource(key)} /><span>{label}</span></label>)}</div></fieldset>
            <div className="location-preferences"><span className="location-preferences-title">LOCATION PREFERENCES</span><label className={`nearby-option ${nearbyOnly ? 'selected' : ''}`}><input type="checkbox" checked={nearbyOnly} onChange={(event) => toggleNearby(event.target.checked)} /><MapPin size={14} aria-hidden="true" /><span>Near my location</span></label><label className="nearby-radius">Within <select aria-label="Nearby search radius" value={nearbyRadius} disabled={!nearbyOnly && !filters.includes('restaurant')} onChange={(event) => setNearbyRadius(event.target.value)}><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><small>Distance matching needs current coordinates and real listing coordinates. No map/geocoder credentials are included.</small></div>
            <span className="search-demo-note">Only administrator-approved listings appear in results. Owner-provided details are not automatically verified.</span>
          </div>
        </section>
        <section className="home-intro">
          <div><span className="eyebrow">A LITTLE MORE ROOM TO DO YOUR THING</span><h2>Space to make<br /><em>something happen.</em></h2></div>
          <p className="rotating-home-copy" aria-live="polite" aria-atomic="true"><span key={rotatingMessageIndex} className={prefersReducedMotion ? '' : 'rotating-message'}>{rotatingMessages[rotatingMessageIndex]}</span></p>
        </section>
        <section className="featured-section">
          <div className="section-heading"><div><span className="eyebrow">ACROSS KERALA</span><h2>Spaces to explore</h2></div><button className="text-link" onClick={() => document.getElementById('guided-search')?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })}>Explore all spaces <ArrowRight size={16} /></button></div>
          {listingLoading ? <div className="empty-state"><span>✳</span><h2>Finding approved spaces</h2><p>Loading public-safe listings from Firestore.</p></div> : displayedListingError ? <div className="portal-notice" role="alert"><strong>Listings are unavailable</strong><span>{displayedListingError}</span></div> : approvedSpaces.length ? <div className="featured-grid">{approvedSpaces.slice(0, 3).map((space) => <SpaceCard key={space.id} space={space} mode={mode || 'Student'} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div> : <div className="empty-state"><span>✳</span><h2>No approved spaces yet</h2><p>New owner submissions stay private until an administrator approves them. OpenStreetMap places are shown separately and are not bookable listings.</p></div>}
        </section>
          <section className="how-section" id="how-it-works" ref={howItWorksRef}>
            <span className="eyebrow">A SIMPLE WAY TO MAKE A PLAN</span><h2>From your idea to <em>your somewhere.</em></h2>
            <div className="steps-grid">
              <div><span>01</span><h3>Choose who you are and what you need</h3><p>Select Student or Working professional, then choose an activity to see matching approved spaces.</p></div>
              <div><span>02</span><h3>Set your location</h3><p>Search Kerala by district and a suggested town or locality, enter a place manually, or request your current location.</p></div>
              <div><span>03</span><h3>Set your preferences</h3><p>Choose your budget, group size, duration, amenities, and optional comfort preferences.</p></div>
              <div><span>04</span><h3>Explore matching spaces</h3><p>Browse administrator-approved listings. Owner-declared details are clearly distinguished from verification and recent crowd reports.</p></div>
              <div><span>05</span><h3>Review a booking preview</h3><p>Try the booking flow. It remains in this browser session until customer sign-in and booking persistence are configured.</p></div>
              <div><span>06</span><h3>Have a space to share?</h3><p>Sign in to the private owner portal and submit a property for administrator review.</p></div>
            </div>
          </section>
      </main>}

      {page === 'results' && <main className="page-main results-page">
        <div className="breadcrumb"><button onClick={() => setPage('home')}>Home</button><span>/</span><span>Find a space</span></div>
        <div className="results-top"><div><span className="eyebrow">APPROVED LISTINGS · KERALA</span><h1>Spaces in <em>{search.location || search.district || 'Kerala'}</em></h1><p>{results.length} approved {search.spaceType} spaces for {categoryLabel(mode, search.purpose)} · {search.people} people{search.spaceType === 'private' ? ` · up to ${money(Number(search.budget || 0))}/hr` : ''}</p></div><button className="outline-button" onClick={() => setPage('home')}><SlidersHorizontal size={16} /> Edit search</button></div>
        {listingLoading && <div className="portal-notice" role="status"><strong>Loading approved listings…</strong><span>Getting public-safe records from Firestore.</span></div>}
        {displayedListingError && <div className="portal-notice" role="alert"><strong>Listings could not be loaded</strong><span>{displayedListingError}</span></div>}
        <div className="results-layout">
          <aside className="filter-panel">
            <div className="filter-heading"><span>MAKE IT YOURS</span><button onClick={() => setFilters([])}>Clear</button></div>
            {[['cctv', 'CCTV'], ['transport', 'Near public transport'], ['washroom', 'Washroom on-site'], ['restaurant', 'Restaurants near me']].map(([key, label]) => <label className="filter-option" key={key}><input type="checkbox" checked={filters.includes(key)} onChange={() => toggleFilter(key)} /><span className="custom-check"><Check size={12} /></span>{label}</label>)}
            {filters.includes('restaurant') && <p className="restaurant-filter-note">{!locationCoordinates ? 'Use current location to search by distance.' : restaurantCoordinateCount === 0 ? 'No verified nearby-place coordinates are linked to these listings, so this filter cannot estimate distances.' : `Showing places within ${nearbyRadius} km based on imported coordinates.`}</p>}
            <div className="filter-safety"><ShieldCheck size={18} /><span><strong>Your comfort comes first.</strong><small>Owner-provided details are not independently verified unless explicitly marked.</small></span></div>
          </aside>
          <div className="results-content">
            <div className="results-toolbar"><span>{nearbyOnly ? `Within ${nearbyRadius} km of your location` : restaurantFilterActive ? locationCoordinates ? `Restaurants within ${nearbyRadius} km of your location` : 'Restaurants near me · location required' : `Sorted for ${mode === 'Student' ? 'student needs' : 'professional needs'}`}</span><button className="results-clear" onClick={() => { setSelectedResources([]); setFilters([]); setComfort(''); setNearbyOnly(false); setSearch((current) => ({ ...current, budget: '1000', location: '', district: '', people: '1', duration: '1' })) }}>Clear filters</button></div>
            {results.length ? <div className="results-grid">{results.map((space) => <SpaceCard key={space.id} space={space} mode={mode} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div> : <div className="empty-state">
              <span>✳</span>
              <h2>{listingLoading ? 'Loading approved spaces' : displayedListingError ? 'Listings are unavailable' : nearbyOnly ? 'Nearby search is unavailable' : restaurantFilterActive ? 'Nearby places are unavailable' : 'No matching spaces yet'}</h2>
              <p>{listingLoading ? 'Results will appear when the approved Firestore listings have loaded.' : displayedListingError ? 'Fix the Firebase setup or request error shown above. The app does not substitute sample listings.' : nearbyOnly || restaurantFilterActive ? coordinateListingCount === 0 ? 'Public listing data does not include precise property coordinates, so distance matching is disabled to protect owner addresses.' : 'No coordinate-backed nearby records matched. Clear the proximity filter or use district and locality search.' : search.spaceType === 'public' ? 'There are no approved public bookable-space records yet. Imported OpenStreetMap places are kept separate and are not presented as available spaces.' : 'Try a wider budget, another Kerala district, or fewer must-haves. Owner submissions appear here only after administrator approval.'}</p>
              {nearbyOnly || restaurantFilterActive ? <div className="nearby-empty-actions"><button className="outline-button" onClick={() => { setNearbyOnly(false); setFilters((current) => current.filter((filter) => filter !== 'restaurant')) }}>Clear proximity filters</button></div> : <button className="primary-button" onClick={() => { setComfort(''); setSelectedResources([]); setFilters([]); setSearch((current) => ({ ...current, budget: '1000', location: '', district: '', people: '1', duration: '1' })) }}>Relax filters</button>}
            </div>}
          </div>
        </div>
      </main>}

      {page === 'detail' && <main className="page-main detail-page">
        <div className="breadcrumb"><button onClick={() => setPage('results')}>Spaces</button><span>/</span><span>{locationLabel(activeSpace)}</span><span>/</span><span>{activeSpace.name}</span></div>
        <div className="detail-title-row"><div><span className="eyebrow">{locationLabel(activeSpace).toUpperCase()} · APPROVED LISTING</span><h1>{activeSpace.name}</h1><p><MapPin size={15} /> {locationLabel(activeSpace)}</p></div><button className={`outline-button save-detail ${saved.includes(activeSpace.id) ? 'saved' : ''}`} onClick={() => toggleSaved(activeSpace.id)}><Heart size={16} fill={saved.includes(activeSpace.id) ? 'currentColor' : 'none'} /> Save space</button></div>
        <div className="portal-notice"><strong>Approved for public listing; not independently verified.</strong><span>Owner-provided facilities, safety details, photos, and availability should be confirmed with the owner.</span></div>
        <div className="gallery">{activeSpace.photoUrl ? <img src={activeSpace.photoUrl} alt={activeSpace.name} /> : <div className="gallery-photo-placeholder">Photos not provided by the owner</div>}<div className="gallery-side">{activeSpace.gallery.filter(Boolean).slice(0, 2).map((photo, index) => <img key={`${photo}-${index}`} src={photo} alt={`${activeSpace.name} view ${index + 1}`} />)}</div><span className="gallery-count">{activeSpace.photoUrl ? '01 / 03' : 'No photos'}</span></div>
        <div className="detail-layout"><div className="detail-content">
          <div className="detail-highlights"><span>{activeSpace.verified ? <BadgeCheck size={17} /> : <Check size={17} />} {activeSpace.verified ? 'Verified space' : 'Approved listing'}</span><span><UsersIcon /> Up to {activeSpace.capacity} people</span><span><Clock3 size={16} /> {activeSpace.seatingType} seating</span></div>
          <section className="detail-section"><span className="eyebrow">A PLACE WITH POSSIBILITIES</span><h2>A little about this space</h2><p className="detail-description">{activeSpace.description}</p><div className="detail-tags"><span>{activeSpace.atmosphere}</span><span>{activeSpace.indoorOutdoor}</span>{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div></section>
          <section className="detail-section"><span className="eyebrow">THE GOOD TO KNOW</span><h2>What you'll find here</h2><div className="amenities-grid">{Object.entries(activeSpace.amenities).filter(([, value]) => value).map(([key]) => <span key={key}><Check size={15} /> {key === 'wifi' ? 'Wi-Fi' : key === 'ac' ? 'Air conditioning' : key === 'fans' ? 'Fans' : key === 'charging' ? 'Charging points' : key[0].toUpperCase() + key.slice(1)}</span>)}</div><div className="resources-box"><h3>More helpful things</h3><div className="resource-detail-grid"><span><Wifi size={15} /> Wi-Fi up to {activeSpace.resources.wifiSpeed}</span><span><Zap size={15} /> {activeSpace.resources.powerSockets} power sockets</span><span><Printer size={15} /> {activeSpace.resources.printerAccess ? 'Printer access' : 'No printer access'}</span><span><Banknote size={15} /> {activeSpace.resources.powerBackup ? 'Power backup' : 'No power backup'}</span><span><Shield size={15} /> {activeSpace.resources.soundproof ? 'Soundproofed' : 'Everyday sounds'}</span><span><Coffee size={15} /> {activeSpace.resources.teaCoffee ? 'Tea & coffee' : 'Bring your own brew'}</span><span><span className="resource-number">{activeSpace.resources.desks}</span> desks</span><span><span className="resource-number">{activeSpace.resources.lockers ? '✓' : '—'}</span> Lockers</span><span><span className="resource-number">{activeSpace.resources.drinkingWater ? '✓' : '—'}</span> Drinking water</span></div></div></section>
          <section className="detail-section"><span className="eyebrow">OWNER-DECLARED SCHEDULE</span><h2>When the owner says it's free</h2><p className="portal-muted">This schedule is not a live vacancy signal and does not include confirmed booking conflicts.</p><div className="availability-list">{Object.entries(activeSpace.availability || {}).filter(([, times]) => times.length).map(([day, times]) => <div key={day}><strong>{day}</strong><span>{times.join(' · ')}</span></div>)}</div>{!Object.values(activeSpace.availability || {}).some((times) => times.length) && <p className="portal-muted">No owner-declared schedule has been provided.</p>}</section>
          <section className="detail-section"><span className="eyebrow">COMMUNITY OBSERVATIONS</span><h2>Recent crowd reports</h2><p className="crowd-status">{currentCrowdReport.error ? 'Unknown — recent reports could not be loaded.' : `${currentCrowdReport.status}${currentCrowdReport.reports ? ` · ${currentCrowdReport.reports} reports in the last hour` : ' — not enough recent reports'}`}</p><p className="portal-muted">This is community-reported information, not live occupancy data.</p></section>
          <section className="detail-section safety-section"><span className="eyebrow">YOUR COMFORT MATTERS</span><h2>Safety checklist</h2><p className="demo-safety-note">Safety features below are owner-declared and have not been independently verified. Identity verification and reviewer ratings remain unavailable unless explicitly recorded.</p>{activeSpace.safetyRating != null && <div className="safety-rating"><span><Star size={19} fill="currentColor" /> {activeSpace.safetyRating} <small>Women reviewers' safety rating</small></span></div>}{isWomenFriendly(activeSpace) && <span className="women-badge"><Heart size={13} /> Women-friendly features verified</span>}<div className="safety-check-grid">{[['CCTV on site', activeSpace.safety.cctv], ['Well-lit space', activeSpace.safety.wellLit], ['Secured entry', activeSpace.safety.securedEntry], ['Owner ID verified', activeSpace.safety.ownerIdVerified], ['Female host or staff', activeSpace.safety.femaleHostOrStaff], ['Busy, populated area', activeSpace.safety.busyArea], ['Near public transport', activeSpace.safety.nearPublicTransport]].map(([label, yes]) => <span key={label} className={yes ? 'yes' : 'no'}>{yes ? <Check size={15} /> : <X size={15} />}{label}{yes && label !== 'Owner ID verified' ? ' · owner-declared' : ''}</span>)}</div>{activeSpace.safety.womenOnlyHours && <div className="women-hours"><Heart size={15} /> Women-only hours: {activeSpace.safety.womenOnlyHours} · owner-declared</div>}</section>
          <section className="detail-section washroom-section"><span className="eyebrow">THE LITTLE ESSENTIALS</span><h2>Washroom</h2><p className="demo-safety-note">Washroom details are owner-declared and have not been independently verified.</p><div className="washroom-grid"><span>{activeSpace.washroom.onSite ? <Check size={15} /> : <X size={15} />} {activeSpace.washroom.onSite ? 'On-site washroom' : 'No on-site washroom'} · owner-declared</span><span>{activeSpace.washroom.separateForWomen ? <Check size={15} /> : <X size={15} />} Separate for women</span><span>{activeSpace.washroom.accessible ? <Check size={15} /> : <X size={15} />} Step-free accessible</span><span><Star size={15} fill="currentColor" /> {activeSpace.washroom.cleanlinessRating == null ? 'Not rated' : `${activeSpace.washroom.cleanlinessRating} cleanliness`}</span></div></section>
          <section className="detail-section nearby-section"><span className="eyebrow">AROUND THE CORNER</span><h2>Nearby</h2><NearbyList space={activeSpace} /></section>
          <button className="report-button" onClick={() => { setReporting(!reporting); setReportError('') }}><Shield size={15} /> Report this space</button>{reporting && <form className="report-form" onSubmit={submitSpaceReport}><label htmlFor="report-reason">What would you like to report?</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Inaccurate listing details</option><option>Safety concern</option><option>Inappropriate content</option><option>Other</option></select><label htmlFor="report-details">Additional details <span className="optional">(optional)</span></label><textarea id="report-details" name="details" maxLength="1000" rows="2" /><button className="primary-button" type="submit">Submit report</button>{reportError && <p className="portal-error" role="alert">{reportError}</p>}</form>}
        </div><aside className="booking-card"><div className="booking-price"><strong>{money(activeSpace.pricePerHour)}</strong><span> / hour</span></div><div className="booking-rating"><MapPin size={14} /> {activeSpace.area}<span> · Owner-provided listing</span></div><div className="booking-card-note"><BadgeCheck size={16} /> Booking preview only. No booking request is saved or sent to the owner.</div><button className="primary-button full-button" onClick={startBooking}>Preview booking <ArrowRight size={16} /></button><p className="booking-card-fine">No payment or owner notification. Visitor sign-in is not configured.</p><div className="card-last-updated"><Clock3 size={14} /> Availability updated {daysAgo(activeSpace.lastUpdated, currentTime)} days ago</div></aside></div>
      </main>}

      {page === 'booking' && <main className="page-main booking-page"><button className="back-link" onClick={() => setPage('detail')}><ArrowLeft size={16} /> Back to space</button><div className="booking-page-heading"><span className="eyebrow">A GOOD PLAN, IN THE MAKING</span><h1>Book your <em>somewhere.</em></h1><p>Choose a day and time that works for you.</p></div><div className="booking-layout"><section className="booking-form-card"><label className="form-label">PICK A DAY<input className="date-input" type="date" min={minimumDate} value={date} onChange={(event) => { setDate(event.target.value); setSlot('') }} /></label><span className="form-label">FREE TIME SLOTS · {dayLabel.toUpperCase()}</span>{availableSlots.length ? <div className="slot-grid">{availableSlots.map((time) => <button key={time} className={`slot-button ${slot === time ? 'selected' : ''}`} onClick={() => { setSlot(time); setHours((current) => Math.min(current, slotDuration(time))) }}><Clock3 size={15} /> {time}</button>)}</div> : <div className="no-slots">No free slots on this day. Try another date.</div>}<label className="form-label hours-label">HOW MANY HOURS?<div className="stepper"><button aria-label="Decrease hours" onClick={() => setHours(Math.max(1, hours - 1))}><Minus size={15} /></button><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong><button aria-label="Increase hours" disabled={hours >= maxBookingHours} onClick={() => setHours(Math.min(maxBookingHours, hours + 1))}><Plus size={15} /></button></div></label>{slot && slotEndsAfterEight(slot, hours) && <div className="late-warning"><Clock3 size={17} /><span><strong>Getting home late?</strong> This slot ends after 8pm. Please plan a safe journey back.</span></div>}<div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Keep someone in the loop</strong><small>Share your booking details with a trusted contact.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="booking-summary"><span className="eyebrow">YOUR PLAN</span><div className="summary-space"><img src={activeSpace.photoUrl} alt="" /><span><strong>{activeSpace.name}</strong><small><MapPin size={12} /> {locationLabel(activeSpace)}</small></span></div><div className="summary-line"><span>Date</span><strong>{dayLabel}</strong></div><div className="summary-line"><span>Time</span><strong>{slot || 'Choose a time slot'}</strong></div><div className="summary-line"><span>Duration</span><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong></div><div className="summary-total"><span>Total</span><strong>{money(activeSpace.pricePerHour * hours)}</strong></div><button className="primary-button full-button" onClick={confirmBooking} disabled={!slot}>Request to book <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Your booking will be pending owner confirmation.</p></aside></div></main>}

      {page === 'confirmation' && booking && <main className="page-main confirmation-page"><div className="confirmation-top"><span className="confirmation-icon"><Check size={28} /></span><span className="eyebrow">YOUR PLAN IS IN MOTION</span><h1>Good things <em>start here.</em></h1><p>This sample booking is only stored in this session. No host has been contacted.</p><span className="pending-pill"><Clock3 size={14} /> Pending owner confirmation</span></div><div className="confirmation-layout"><section className="confirmed-card"><div className="summary-space"><img src={booking.space.photoUrl} alt="" /><span><strong>{booking.space.name}</strong><small><MapPin size={12} /> {locationLabel(booking.space)}</small></span></div><div className="confirmed-details"><div><span>DATE</span><strong>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div><div><span>TIME</span><strong>{booking.slot}</strong></div><div><span>DURATION</span><strong>{booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}</strong></div><div><span>TOTAL</span><strong>{money(booking.total)}</strong></div></div><div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Share with someone you trust</strong><small>Let them know where you'll be.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="safety-card"><div className="safety-card-heading"><ShieldCheck size={19} /><span><strong>Here for your peace of mind</strong><small>A few helpful things to have close.</small></span></div><div className="safety-tip"><strong>A little safety checklist</strong><p>Share your plans with someone you trust, keep your phone charged, and confirm your return trip before you go.</p></div><div className="emergency-box"><span>NEED HELP?</span><div><a href="tel:112">112 <small>Emergency</small></a><a href="tel:181">181 <small>Women's helpline</small></a></div></div><button className="location-share" onClick={() => setNotice('Live location sharing is a demo feature and is not active.') }><MapPin size={15} /> Share live location <span>MOCK</span></button></aside></div><div className="confirmation-actions"><button className="primary-button" onClick={() => setPage('home')}>Back to exploring <Compass size={16} /></button><button className="text-link" onClick={() => { setSearch((current) => ({ ...current, district: booking.space.district, location: booking.space.locality || booking.space.area })); setPage('results') }}>Find another space <ArrowRight size={15} /></button></div></main>}


      <footer className="site-footer"><div className="footer-brand"><BrandLogo failed={logoFailed} onError={() => setLogoFailed(true)} /></div><span>More room for good things. Made for Kerala.</span><span>© 2025 EmptySpace</span></footer>
      {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  )
}

function LocationMapPreview({ coordinates, onChange }) {
  const [latitude, setLatitude] = useState(String(coordinates.latitude))
  const [longitude, setLongitude] = useState(String(coordinates.longitude))
  const [coordinateError, setCoordinateError] = useState('')
  const padding = 0.012
  const bounds = [
    coordinates.longitude - padding,
    coordinates.latitude - padding,
    coordinates.longitude + padding,
    coordinates.latitude + padding,
  ].join(',')
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${coordinates.latitude},${coordinates.longitude}`
  const fullMapUrl = `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=15/${coordinates.latitude}/${coordinates.longitude}`

  function updatePoint() {
    const nextLatitude = Number(latitude)
    const nextLongitude = Number(longitude)
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(nextLatitude) || nextLatitude < -90 || nextLatitude > 90
      || !Number.isFinite(nextLongitude) || nextLongitude < -180 || nextLongitude > 180) {
      setCoordinateError('Enter a valid latitude from -90 to 90 and longitude from -180 to 180.')
      return
    }
    setCoordinateError('')
    onChange({ latitude: nextLatitude, longitude: nextLongitude })
  }

  return <div className="location-map-preview">
    <iframe title="Map preview of the selected location" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" />
    <div className="map-preview-caption"><span>Map preview · OpenStreetMap</span><a href={fullMapUrl} target="_blank" rel="noreferrer">Open full map <ArrowUpRight size={12} /></a></div>
    <div className="map-coordinate-form">
      <label>LATITUDE<input type="number" min="-90" max="90" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); updatePoint() } }} /></label>
      <label>LONGITUDE<input type="number" min="-180" max="180" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); updatePoint() } }} /></label>
      <button type="button" onClick={updatePoint}>Adjust map point</button>
    </div>
    {coordinateError && <span className="coordinate-error" role="alert">{coordinateError}</span>}
  </div>
}

function UsersIcon() {
  return <span className="users-icon">↗</span>
}

function BrandLogo({ failed, onError }) {
  const useCustomLogo = CUSTOM_LOGO_PATH && !failed

  return <>
    {useCustomLogo
      ? <img className="custom-brand-logo" src={CUSTOM_LOGO_PATH} alt="" onError={onError} />
      : <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>}
    <span>empty<span className="brand-light">space</span></span>
  </>
}

function SpaceCard({ space, mode, selectedResources = [], currentTime, saved, onOpen, onSave }) {
  const womenFriendly = [space.safety.cctv, space.safety.wellLit, space.safety.securedEntry, space.safety.ownerIdVerified].every(Boolean)
  const venueCoordinates = spaceCoordinates(space)
  const cafe = venueCoordinates && (space.nearby || []).find((item) => ['cafe', 'restaurant'].includes(item.type) && spaceCoordinates(item))
  const cafeDistance = cafe ? distanceKm(venueCoordinates, spaceCoordinates(cafe)) : null
  const requested = selectedResources.map((key) => resourceLabels[key])
  const reason = requested.length
    ? `Has your requested ${requested.join(', ')}.`
    : mode === 'Student'
      ? `${space.atmosphere === 'quiet' ? 'A quiet spot' : 'A welcoming spot'} with ${space.amenities.wifi ? 'Wi-Fi' : 'room to focus'} and ${space.resources.powerSockets > 0 ? 'charging points' : 'space to settle in'}.`
      : `${space.amenities.ac ? 'Cool, comfortable' : 'Bright, flexible'} space with ${space.resources.powerBackup ? 'power backup' : 'reliable essentials'} for your next work session.`
  const updatedDays = daysAgo(space.lastUpdated, currentTime)
  return <article className="space-card">
    <div className="card-image-wrap" onClick={() => onOpen(space)}>
      {space.photoUrl ? <img src={space.photoUrl} alt={space.name} loading="lazy" /> : <div className="card-image-placeholder">Photos not provided</div>}
      <div className="card-badges">{space.verified ? <span className="verified-badge"><BadgeCheck size={12} /> Verified</span> : <span className="verified-badge"><BadgeCheck size={12} /> Approved listing</span>}{womenFriendly && <span className="women-badge"><Heart size={12} /> Women-friendly features</span>}</div>
      <button className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved spaces' : 'Save space'} onClick={(event) => { event.stopPropagation(); onSave(space.id) }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button>
    </div>
    <div className="card-content">
      <div className="card-title-row" onClick={() => onOpen(space)}><div><h3>{space.name}</h3><span className="card-location"><MapPin size={12} /> {locationLabel(space)}</span></div><span className="card-rating">{space.rating == null ? 'Not yet rated' : <><Star size={13} fill="currentColor" /> {space.rating}</>}</span></div>
      <div className="card-meta"><span><UsersIcon /> {space.capacity} guests</span><span>{space.seatingType}</span><span>{space.atmosphere}</span></div>
      <div className="card-amenities">{Object.entries(space.amenities).filter(([, value]) => value).slice(0, 4).map(([key]) => <span key={key} title={key}>{key === 'wifi' ? <Wifi size={14} /> : key === 'charging' ? <Zap size={14} /> : key === 'projector' ? <ArrowUpRight size={14} /> : <Sparkles size={14} />}</span>)}</div>
      <p className="why-fit"><Sparkles size={13} /> {reason}</p>
      <div className="card-local-chips">{space.washroom.onSite && <span>Washroom on-site</span>}{cafe && cafeDistance !== null && <span><Coffee size={11} /> {cafe.type === 'cafe' ? 'Cafe' : 'Restaurant'} {cafeDistance.toFixed(1)} km straight-line</span>}{womenFriendly && <span className="women-badge">Women-friendly features listed</span>}{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div>
      <div className="card-footer"><span><Clock3 size={12} /> Availability updated {updatedDays} {updatedDays === 1 ? 'day' : 'days'} ago</span><strong>{money(space.pricePerHour)}<small> / hr</small></strong></div>
      <button className="card-open-button" aria-label={`View ${space.name}`} onClick={() => onOpen(space)}>View space <ArrowRight size={14} /></button>
    </div>
  </article>
}

function NearbyList({ space }) {
  const groups = [
    ['Food & coffee', ['restaurant', 'cafe']],
    ['Washrooms', ['washroom']],
    ['ATMs', ['atm']],
    ['Pharmacies', ['pharmacy']],
    ['Print & stationery', ['print shop', 'stationery']],
    ['Getting around', ['bus stop']],
  ]
  const places = space.nearby || []
  const venueCoordinates = spaceCoordinates(space)
  const groupsContent = groups.map(([label, types]) => {
    const items = places.filter((item) => types.includes(item.type))
    if (!items.length) return null
    return <div className="nearby-group" key={label}><strong>{label}</strong>{items.map((item) => {
      const itemCoordinates = spaceCoordinates(item)
      const distance = itemCoordinates && venueCoordinates ? distanceKm(venueCoordinates, itemCoordinates) : null
      return <span key={item.id || item.name}><span>{item.name}</span><small>{distance === null ? 'Distance not available' : `${distance.toFixed(1)} km straight-line`}</small></span>
    })}</div>
  })
  return places.length ? <div className="nearby-groups">{groupsContent}</div> : <p className="portal-muted">No public-place records are linked to this listing yet. Distances are not estimated.</p>
}

function slotEndsAfterEight(slot, hours) {
  const match = slot.match(/(\d+)(?::(\d+))?\s*(am|pm)/i)
  if (!match) return false
  let hour = Number(match[1]) % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0)
  hour += hours
  return hour > 20 || (hour === 20 && Number(match[2] || 0) > 0)
}

function slotDuration(slot) {
  const times = [...slot.matchAll(/(\d+)(?::(\d+))?\s*(am|pm)/gi)]
  if (times.length < 2) return 1
  const toMinutes = (match) => ((Number(match[1]) % 12) + (match[3].toLowerCase() === 'pm' ? 12 : 0)) * 60 + Number(match[2] || 0)
  return Math.max(1, Math.floor((toMinutes(times[1]) - toMinutes(times[0])) / 60))
}

function studentScore(space) {
  const longestSlot = Math.max(...Object.values(space.availability).flat().map(slotDuration), 0)
  return space.pricePerHour / 40
    - Number(space.atmosphere === 'quiet') * 5
    - Number(space.amenities.wifi) * 2
    - Number(space.resources.powerSockets > 0) * 2
    - longestSlot
}

function professionalScore(space) {
  return Number(space.resources.wifiSpeed.split(' ')[0]) / 10
    + Number(space.amenities.ac) * 5
    + Number(space.resources.powerBackup) * 5
    + Number(space.amenities.projector) * 3
    + Number(space.resources.soundproof) * 3
    + Number(space.seatingType.toLowerCase().includes('meeting')) * 3
    + Number(space.safety.nearPublicTransport) * 2
}

export default App
