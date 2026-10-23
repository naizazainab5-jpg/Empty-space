import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote, Briefcase,
  Check, Clock3, Coffee, Compass, Crosshair, GraduationCap,
  Heart, MapPin, Menu, Minus, Plus, Printer, Search, Shield,
  ShieldCheck, SlidersHorizontal, Sparkles, Star, Wifi, X, Zap,
} from 'lucide-react'
import spaces from './spaces.json'
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

function getLocationSuggestions(district) {
  return [...new Set(spaces
    .filter((space) => !district || (space.district || '').toLowerCase() === district.toLowerCase())
    .flatMap((space) => [space.locality, space.area, space.town, space.district])
    .filter((value) => value && !value.toLowerCase().includes('sample')))]
    .sort((a, b) => a.localeCompare(b))
}

function spaceCoordinates(space) {
  const latitude = Number(space.coordinates?.latitude ?? space.latitude ?? space.coordinates?.lat)
  const longitude = Number(space.coordinates?.longitude ?? space.longitude ?? space.coordinates?.lng)
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

const coordinateListingCount = spaces.filter((space) => spaceCoordinates(space)).length
const classifiedSpaceCount = spaces.filter((space) => ['public', 'private'].includes(space.spaceType)).length
const restaurantCoordinateCount = spaces
  .filter((space) => !space.isDemo)
  .flatMap((space) => space.nearby || [])
  .filter((item) => ['restaurant', 'cafe'].includes(item.type) && spaceCoordinates(item)).length

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
  const locationSuggestions = useMemo(() => getLocationSuggestions(search.district), [search.district])
  const [activeSpace, setActiveSpace] = useState(spaces[0])
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

  const results = useMemo(() => {
    const loweredLocation = search.location.trim().toLowerCase()
    const loweredDistrict = search.district.trim().toLowerCase()
    return spaces.filter((space) => {
      const listingDistrict = (space.district || 'Kozhikode').toLowerCase()
      const listingLocation = `${space.locality || space.area} ${space.town || ''} ${listingDistrict} Kerala`.toLowerCase()
      const matchesDistrict = !loweredDistrict || listingDistrict === loweredDistrict
      const matchesLocation = !loweredLocation || listingLocation.includes(loweredLocation)
      const matchesSpaceType = space.spaceType === search.spaceType
      const matchesBudget = search.spaceType !== 'private' || space.pricePerHour <= Number(search.budget || Infinity)
      const matchesPeople = space.capacity >= Number(search.people || 1)
      const matchesDuration = Object.values(space.availability).some((slots) => slots.some((time) => slotDuration(time) >= Number(search.duration || 1)))
      const matchesMode = !mode || Boolean(space.categories?.[mode === 'Student' ? 'student' : 'professional']?.includes(search.purpose))
      const coordinates = spaceCoordinates(space)
      const distance = locationCoordinates && coordinates ? distanceKm(locationCoordinates, coordinates) : null
      const matchesNearby = !nearbyOnly || (distance !== null && distance <= Number(nearbyRadius))
      const restaurantDistances = locationCoordinates && !space.isDemo
        ? space.nearby
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
          if (space.isDemo) return Infinity
          const distances = space.nearby
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
  }, [comfort, filters, locationCoordinates, mode, nearbyOnly, nearbyRadius, search, selectedResources])

  const toggleResource = (resource) => setSelectedResources((current) => current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource])
  const toggleFilter = (filter) => {
    setFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter])
    if (filter === 'restaurant' && !filters.includes(filter)) {
      setLocationStatus({
        type: 'warning',
        message: !locationCoordinates
          ? 'Restaurants near me needs your current location. Use the location button in search first.'
          : restaurantCoordinateCount === 0
            ? 'Restaurant proximity is unavailable: sample nearby-place names have no verified coordinates.'
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
    const currentLocationIsValid = !district || getLocationSuggestions(district)
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
              message: 'Coordinates captured. No place-name service is configured, so choose a district and locality manually. Sample listings have no coordinates for distance matching.',
            })
            return
          }
          setLocationStatus({ type: 'loading', message: 'Coordinates captured; resolving the nearest place…' })
          try {
            const resolved = await reverseGeocode(currentCoordinates)
            if (requestId !== locationRequestId.current) return
            if (resolved?.outsideKerala) {
              setLocationStatus({ type: 'warning', message: 'Your detected location is outside Kerala. Coordinates are available, but the current sample listings cover Kerala only.' })
            } else if (resolved?.location || resolved?.district) {
              const district = resolved.district || ''
              const location = resolved.location || ''
              setSearch((current) => ({ ...current, state: 'Kerala', district, location }))
              setLocationStatus({
                type: 'success',
                message: `Place resolved${location ? ` to ${location}` : ''}${district ? `, ${district}` : ''}. Sample spaces still need real coordinates for distance matching.`,
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
      setLocationStatus({ type: 'error', message: 'Nearby is on, but these sample listings do not include coordinates, so no distances can be calculated yet.' })
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

  function submitListing(event) {
    event.preventDefault()
    setNotice('This is a listing-form demo. Your details were not saved or sent anywhere.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleSaved(id) {
    setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  const selectedDay = dayNames[new Date(`${date}T12:00:00`).getDay()]
  const availableSlots = (activeSpace.availability[selectedDay] || []).filter((time) => !bookedSlots.includes(`${activeSpace.id}:${date}:${time}`))
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
        <button className="header-action" onClick={() => setPage('listing')}>List your space <ArrowUpRight size={15} /></button>
      </header>

      {page === 'home' && <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> KERALA, INDIA <span className="eyebrow-line" /> A BETTER WAY TO GATHER</div>
            <h1>There's room<br />for <em>what's next.</em></h1>
            <p className="hero-description">Discover the rooms, rooftops, and little corners already around you. Made for ideas, good company, and getting things done.</p>
            <div className="hero-proof"><span>KERALA-WIDE SEARCH</span><span>ILLUSTRATIVE SAMPLE LISTINGS</span></div>
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
              setLocationStatus({ type: 'warning', message: 'Map point adjusted. Choose a district or locality separately to filter Kerala sample listings.' })
            }} />}</div>
            <label className="search-field duration-field"><span>DURATION</span><select aria-label="Booking duration" value={search.duration} onChange={(event) => setSearch((current) => ({ ...current, duration: event.target.value }))}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option><option value="6">6 hours</option></select></label>
            <button className="search-submit" type="submit" disabled={!mode || !search.purpose}><Search size={17} /><span>Find a space</span></button>
          </form>
          <div className="search-preferences">
            <label className="comfort-select"><span>SPACE PREFERENCES</span><select aria-label="Optional women-safety preference" value={comfort} onChange={(event) => setComfort(event.target.value)}><option value="">No additional women-specific requirement</option>{comfortOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <fieldset className="amenity-preferences"><legend>OPTIONAL AMENITIES</legend><div className="amenity-options">{Object.entries(resourceLabels).map(([key, label]) => <label key={key} className={selectedResources.includes(key) ? 'selected' : ''}><input type="checkbox" checked={selectedResources.includes(key)} onChange={() => toggleResource(key)} /><span>{label}</span></label>)}</div></fieldset>
            <div className="location-preferences"><span className="location-preferences-title">LOCATION PREFERENCES</span><label className={`nearby-option ${nearbyOnly ? 'selected' : ''}`}><input type="checkbox" checked={nearbyOnly} onChange={(event) => toggleNearby(event.target.checked)} /><MapPin size={14} aria-hidden="true" /><span>Near my location</span></label><label className="nearby-radius">Within <select aria-label="Nearby search radius" value={nearbyRadius} disabled={!nearbyOnly && !filters.includes('restaurant')} onChange={(event) => setNearbyRadius(event.target.value)}><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><small>Distance matching needs current coordinates and real listing coordinates. No map/geocoder credentials are included.</small></div>
            <span className="search-demo-note">Sample listings; details are illustrative.</span>
          </div>
        </section>
        <section className="home-intro">
          <div><span className="eyebrow">A LITTLE MORE ROOM TO DO YOUR THING</span><h2>Space to make<br /><em>something happen.</em></h2></div>
          <p className="rotating-home-copy" aria-live="polite" aria-atomic="true"><span key={rotatingMessageIndex} className={prefersReducedMotion ? '' : 'rotating-message'}>{rotatingMessages[rotatingMessageIndex]}</span></p>
        </section>
        <section className="featured-section">
          <div className="section-heading"><div><span className="eyebrow">ACROSS KERALA</span><h2>A few sample spaces</h2></div><button className="text-link" onClick={() => document.getElementById('guided-search')?.scrollIntoView({ behavior: 'smooth' })}>Explore all spaces <ArrowRight size={16} /></button></div>
          <div className="featured-grid">{spaces.slice(0, 3).map((space) => <SpaceCard key={space.id} space={space} mode={mode || 'Student'} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div>
        </section>
          <section className="how-section" id="how-it-works" ref={howItWorksRef}>
            <span className="eyebrow">A SIMPLE WAY TO MAKE A PLAN</span><h2>From your idea to <em>your somewhere.</em></h2>
            <div className="steps-grid">
              <div><span>01</span><h3>Choose who you are and what you need</h3><p>Select Student or Working professional, then choose an activity to see relevant sample spaces.</p></div>
              <div><span>02</span><h3>Set your location</h3><p>Search Kerala by district and a suggested town or locality, enter a place manually, or request your current location.</p></div>
              <div><span>03</span><h3>Set your preferences</h3><p>Choose your budget, group size, duration, amenities, and optional comfort preferences.</p></div>
              <div><span>04</span><h3>Explore matching spaces</h3><p>Compare illustrative listings and their sample amenities, availability, and safety details.</p></div>
              <div><span>05</span><h3>Review and try a booking</h3><p>Select a listed time slot and confirm a demo booking. It stays in this session; no host is contacted and no payment is taken.</p></div>
              <div><span>06</span><h3>Have a space to share?</h3><p>Use the listing form to preview what owners can provide. Demo submissions are not saved or sent.</p></div>
            </div>
          </section>
        <OwnerCallout onClick={() => setPage('listing')} />
      </main>}

      {page === 'results' && <main className="page-main results-page">
        <div className="breadcrumb"><button onClick={() => setPage('home')}>Home</button><span>/</span><span>Find a space</span></div>
        <div className="results-top"><div><span className="eyebrow">YOUR NEXT SOMEWHERE · DEMO LISTINGS</span><h1>Spaces in <em>{search.location || search.district || 'Kerala'}</em></h1><p>{results.length} sample {search.spaceType} spaces for {categoryLabel(mode, search.purpose)} · {search.people} people{search.spaceType === 'private' ? ` · up to ${money(Number(search.budget || 0))}/hr` : ''}</p></div><button className="outline-button" onClick={() => setPage('home')}><SlidersHorizontal size={16} /> Edit search</button></div>
        {classifiedSpaceCount === 0 && <div className="demo-disclaimer"><Sparkles size={16} /><span><strong>Space type data is not available yet.</strong> None of the sample listings is identified as Public or Private, so they are not assigned to either category. Add verified <code>spaceType</code> values to listings before these results can be populated.</span></div>}
        <div className="results-layout"><aside className="filter-panel"><div className="filter-heading"><span>MAKE IT YOURS</span><button onClick={() => setFilters([])}>Clear</button></div>{[['cctv', 'CCTV'], ['transport', 'Near public transport'], ['washroom', 'Washroom on-site'], ['restaurant', 'Restaurants near me']].map(([key, label]) => <label className="filter-option" key={key}><input type="checkbox" checked={filters.includes(key)} onChange={() => toggleFilter(key)} /><span className="custom-check"><Check size={12} /></span>{label}</label>)}{filters.includes('restaurant') && <p className="restaurant-filter-note">{!locationCoordinates ? 'Use current location to search by distance.' : restaurantCoordinateCount === 0 ? 'No verified restaurant coordinates are available in these sample listings. No sample walking times are used for this filter.' : `Showing places within ${nearbyRadius} km; coordinate-backed restaurant data required.`}</p>}<div className="filter-safety"><ShieldCheck size={18} /><span><strong>Your comfort comes first.</strong><small>Safety details are illustrative, not verified.</small></span></div></aside>
          <div className="results-content"><div className="results-toolbar"><span>{nearbyOnly ? `Within ${nearbyRadius} km of your location` : restaurantFilterActive ? locationCoordinates ? `Restaurants within ${nearbyRadius} km of your location` : 'Restaurants near me · location required' : `Sorted for ${mode === 'Student' ? 'student needs' : 'professional needs'}`}</span><button className="results-clear" onClick={() => { setSelectedResources([]); setFilters([]); setComfort(''); setNearbyOnly(false); setSearch((current) => ({ ...current, budget: '1000', location: '', district: '', people: '1', duration: '1' })) }}>Clear filters</button></div>{results.length ? <div className="results-grid">{results.map((space) => <SpaceCard key={space.id} space={space} mode={mode} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div> : <div className="empty-state"><span>✳</span><h2>{nearbyOnly ? 'No nearby spaces found' : restaurantFilterActive ? 'No coordinate-matched restaurants' : 'No spaces just yet'}</h2><p>{nearbyOnly ? !locationCoordinates ? 'To search by distance, go back to search and use your current location. A typed town name cannot be converted to coordinates in this demo.' : coordinateListingCount === 0 ? 'No sample listings include coordinates, so distances cannot be calculated yet. Turn off Nearby and search by district or town instead.' : `No coordinate-enabled listings matched within ${nearbyRadius} km. Widen your search radius or clear the Nearby filter.` : restaurantFilterActive ? !locationCoordinates ? 'Restaurants near me needs your current location. Entering a district or town filters spaces by text but does not provide coordinates.' : restaurantCoordinateCount === 0 ? 'The sample nearby-place names and walking times are illustrative only. No verified restaurant coordinates are available to calculate distances. Clear this filter or add coordinate-backed place data.' : `No coordinate-backed restaurants were found within ${nearbyRadius} km. Widen the radius or clear the restaurant filter.` : 'Try a wider budget, another Kerala district, or fewer must-haves. These listings are illustrative demo spaces.'}</p>{nearbyOnly || restaurantFilterActive ? <div className="nearby-empty-actions">{(!locationCoordinates || (restaurantFilterActive && restaurantCoordinateCount === 0)) && <button className="primary-button" onClick={() => setPage('home')}>{locationCoordinates ? 'Edit search' : 'Choose a location'}</button>}{locationCoordinates && (coordinateListingCount > 0 || restaurantCoordinateCount > 0) && Number(nearbyRadius) < 50 ? <button className="primary-button" onClick={() => setNearbyRadius(String(Math.min(50, Number(nearbyRadius) * 2)))}>Widen radius</button> : null}<button className="outline-button" onClick={() => { setNearbyOnly(false); setFilters((current) => current.filter((filter) => filter !== 'restaurant')) }}>Clear proximity filters</button></div> : <button className="primary-button" onClick={() => { setComfort(''); setSelectedResources([]); setFilters([]); setSearch((current) => ({ ...current, budget: '1000', location: '', district: '', people: '1', duration: '1' })) }}>Relax filters</button>}</div>}</div>
        </div>
      </main>}

      {page === 'detail' && <main className="page-main detail-page">
        <div className="breadcrumb"><button onClick={() => setPage('results')}>Spaces</button><span>/</span><span>{locationLabel(activeSpace)}</span><span>/</span><span>{activeSpace.name}</span></div>
        <div className="detail-title-row"><div><span className="eyebrow">{locationLabel(activeSpace).toUpperCase()} · {activeSpace.isDemo ? 'DEMO LISTING' : 'KERALA'}</span><h1>{activeSpace.name}</h1><p><MapPin size={15} /> {locationLabel(activeSpace)} {activeSpace.isDemo ? <span className="demo-note-inline">· Sample location, not a real address</span> : null}</p></div><button className={`outline-button save-detail ${saved.includes(activeSpace.id) ? 'saved' : ''}`} onClick={() => toggleSaved(activeSpace.id)}><Heart size={16} fill={saved.includes(activeSpace.id) ? 'currentColor' : 'none'} /> Save space</button></div>
        {activeSpace.isDemo && <div className="demo-disclaimer"><Sparkles size={16} /><span><strong>Illustrative demo listing.</strong> Venue details, photos, availability, safety features, nearby places, and ratings are sample content and have not been independently verified.</span></div>}
        <div className="gallery"><img src={activeSpace.photoUrl} alt={activeSpace.name} /><div className="gallery-side"><img src={activeSpace.gallery[0]} alt={`${activeSpace.name} interior`} /><img src={activeSpace.gallery[1]} alt={`${activeSpace.name} seating`} /></div><span className="gallery-count">01 / 03</span></div>
        <div className="detail-layout"><div className="detail-content">
          <div className="detail-highlights"><span>{activeSpace.isDemo ? <Sparkles size={17} /> : <BadgeCheck size={17} />} {activeSpace.isDemo ? 'Demo listing' : 'Verified space'}</span><span><UsersIcon /> Up to {activeSpace.capacity} people</span><span><Clock3 size={16} /> {activeSpace.seatingType} seating</span></div>
          <section className="detail-section"><span className="eyebrow">A PLACE WITH POSSIBILITIES</span><h2>A little about this space</h2><p className="detail-description">{activeSpace.description}</p><div className="detail-tags"><span>{activeSpace.atmosphere}</span><span>{activeSpace.indoorOutdoor}</span>{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div></section>
          <section className="detail-section"><span className="eyebrow">THE GOOD TO KNOW</span><h2>What you'll find here</h2><div className="amenities-grid">{Object.entries(activeSpace.amenities).filter(([, value]) => value).map(([key]) => <span key={key}><Check size={15} /> {key === 'wifi' ? 'Wi-Fi' : key === 'ac' ? 'Air conditioning' : key === 'fans' ? 'Fans' : key === 'charging' ? 'Charging points' : key[0].toUpperCase() + key.slice(1)}</span>)}</div><div className="resources-box"><h3>More helpful things</h3><div className="resource-detail-grid"><span><Wifi size={15} /> Wi-Fi up to {activeSpace.resources.wifiSpeed}</span><span><Zap size={15} /> {activeSpace.resources.powerSockets} power sockets</span><span><Printer size={15} /> {activeSpace.resources.printerAccess ? 'Printer access' : 'No printer access'}</span><span><Banknote size={15} /> {activeSpace.resources.powerBackup ? 'Power backup' : 'No power backup'}</span><span><Shield size={15} /> {activeSpace.resources.soundproof ? 'Soundproofed' : 'Everyday sounds'}</span><span><Coffee size={15} /> {activeSpace.resources.teaCoffee ? 'Tea & coffee' : 'Bring your own brew'}</span><span><span className="resource-number">{activeSpace.resources.desks}</span> desks</span><span><span className="resource-number">{activeSpace.resources.lockers ? '✓' : '—'}</span> Lockers</span><span><span className="resource-number">{activeSpace.resources.drinkingWater ? '✓' : '—'}</span> Drinking water</span></div></div></section>
          <section className="detail-section"><span className="eyebrow">TIMES THAT WORK</span><h2>When it's free</h2><div className="availability-list">{Object.entries(activeSpace.availability).filter(([, times]) => times.length).map(([day, times]) => <div key={day}><strong>{day}</strong><span>{times.join(' · ')}</span></div>)}</div></section>
          <section className="detail-section safety-section"><span className="eyebrow">YOUR COMFORT MATTERS</span><h2>Safety checklist</h2>{activeSpace.isDemo ? <p className="demo-safety-note">The features below are illustrative sample data, not verified safety claims or real reviewer feedback.</p> : activeSpace.safety.safetyRating && <div className="safety-rating"><span><Star size={19} fill="currentColor" /> {activeSpace.safety.safetyRating} <small>Women reviewers' safety rating</small></span></div>}{isWomenFriendly(activeSpace) && <span className="women-badge"><Heart size={13} /> Women-friendly features listed</span>}<div className="safety-check-grid">{[['CCTV on site', activeSpace.safety.cctv], ['Well-lit space', activeSpace.safety.wellLit], ['Secured entry', activeSpace.safety.securedEntry], ['Owner ID verified', activeSpace.safety.ownerIdVerified], ['Female host or staff', activeSpace.safety.femaleHostOrStaff], ['Busy, populated area', activeSpace.safety.busyArea], ['Near public transport', activeSpace.safety.nearPublicTransport]].map(([label, yes]) => <span key={label} className={yes ? 'yes' : 'no'}>{yes ? <Check size={15} /> : <X size={15} />}{label}</span>)}</div>{activeSpace.safety.womenOnly && <div className="women-hours"><Heart size={15} /> Women-only space (sample detail)</div>}{activeSpace.safety.womenOnlyHours && <div className="women-hours"><Heart size={15} /> Women-only hours: {activeSpace.safety.womenOnlyHours}</div>}</section>
          <section className="detail-section washroom-section"><span className="eyebrow">THE LITTLE ESSENTIALS</span><h2>Washroom</h2>{activeSpace.isDemo && <p className="demo-safety-note">Washroom availability and cleanliness details are illustrative sample data.</p>}<div className="washroom-grid"><span><Check size={15} /> {activeSpace.washroom.onSite ? 'On-site washroom' : 'No on-site washroom'}</span><span>{activeSpace.washroom.separateForWomen ? <Check size={15} /> : <X size={15} />} Separate for women</span><span>{activeSpace.washroom.accessible ? <Check size={15} /> : <X size={15} />} Step-free accessible</span><span><Star size={15} fill="currentColor" /> {activeSpace.washroom.cleanlinessRating} cleanliness</span></div></section>
          <section className="detail-section nearby-section"><span className="eyebrow">AROUND THE CORNER</span><h2>Nearby</h2>{activeSpace.isDemo && <p className="demo-note-inline">Sample entries only. Nearby businesses, place names, and distances have not been verified.</p>}<NearbyList space={activeSpace} /></section>
          <button className="report-button" onClick={() => setReporting(!reporting)}><Shield size={15} /> Report this space</button>{reporting && <form className="report-form" onSubmit={(event) => { event.preventDefault(); setReporting(false); setNotice(`Thank you. Your report about "${reportReason.toLowerCase()}" was not submitted or saved; this is a demo form.`) }}><label htmlFor="report-reason">What would you like to report?</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Inaccurate listing details</option><option>Safety concern</option><option>Inappropriate content</option><option>Other</option></select><button className="primary-button" type="submit">Submit report</button></form>}
        </div><aside className="booking-card"><div className="booking-price"><strong>{money(activeSpace.pricePerHour)}</strong><span> / hour</span></div><div className="booking-rating"><MapPin size={14} /> {activeSpace.area}<span> - Demo data</span></div><div className="booking-card-note"><BadgeCheck size={16} /> Demo booking only. No payment or host contact.</div><button className="primary-button full-button" onClick={startBooking}>Book this space <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Demo status: pending owner confirmation. No host is contacted.</p><div className="card-last-updated"><Clock3 size={14} /> Availability updated {daysAgo(activeSpace.lastUpdated, currentTime)} days ago</div></aside></div>
      </main>}

      {page === 'booking' && <main className="page-main booking-page"><button className="back-link" onClick={() => setPage('detail')}><ArrowLeft size={16} /> Back to space</button><div className="booking-page-heading"><span className="eyebrow">A GOOD PLAN, IN THE MAKING</span><h1>Book your <em>somewhere.</em></h1><p>Choose a day and time that works for you.</p></div><div className="booking-layout"><section className="booking-form-card"><label className="form-label">PICK A DAY<input className="date-input" type="date" min={minimumDate} value={date} onChange={(event) => { setDate(event.target.value); setSlot('') }} /></label><span className="form-label">FREE TIME SLOTS · {dayLabel.toUpperCase()}</span>{availableSlots.length ? <div className="slot-grid">{availableSlots.map((time) => <button key={time} className={`slot-button ${slot === time ? 'selected' : ''}`} onClick={() => { setSlot(time); setHours((current) => Math.min(current, slotDuration(time))) }}><Clock3 size={15} /> {time}</button>)}</div> : <div className="no-slots">No free slots on this day. Try another date.</div>}<label className="form-label hours-label">HOW MANY HOURS?<div className="stepper"><button aria-label="Decrease hours" onClick={() => setHours(Math.max(1, hours - 1))}><Minus size={15} /></button><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong><button aria-label="Increase hours" disabled={hours >= maxBookingHours} onClick={() => setHours(Math.min(maxBookingHours, hours + 1))}><Plus size={15} /></button></div></label>{slot && slotEndsAfterEight(slot, hours) && <div className="late-warning"><Clock3 size={17} /><span><strong>Getting home late?</strong> This slot ends after 8pm. Please plan a safe journey back.</span></div>}<div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Keep someone in the loop</strong><small>Share your booking details with a trusted contact.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="booking-summary"><span className="eyebrow">YOUR PLAN</span><div className="summary-space"><img src={activeSpace.photoUrl} alt="" /><span><strong>{activeSpace.name}</strong><small><MapPin size={12} /> {locationLabel(activeSpace)}</small></span></div><div className="summary-line"><span>Date</span><strong>{dayLabel}</strong></div><div className="summary-line"><span>Time</span><strong>{slot || 'Choose a time slot'}</strong></div><div className="summary-line"><span>Duration</span><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong></div><div className="summary-total"><span>Total</span><strong>{money(activeSpace.pricePerHour * hours)}</strong></div><button className="primary-button full-button" onClick={confirmBooking} disabled={!slot}>Request to book <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Your booking will be pending owner confirmation.</p></aside></div></main>}

      {page === 'confirmation' && booking && <main className="page-main confirmation-page"><div className="confirmation-top"><span className="confirmation-icon"><Check size={28} /></span><span className="eyebrow">YOUR PLAN IS IN MOTION</span><h1>Good things <em>start here.</em></h1><p>This sample booking is only stored in this session. No host has been contacted.</p><span className="pending-pill"><Clock3 size={14} /> Pending owner confirmation</span></div><div className="confirmation-layout"><section className="confirmed-card"><div className="summary-space"><img src={booking.space.photoUrl} alt="" /><span><strong>{booking.space.name}</strong><small><MapPin size={12} /> {locationLabel(booking.space)}</small></span></div><div className="confirmed-details"><div><span>DATE</span><strong>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div><div><span>TIME</span><strong>{booking.slot}</strong></div><div><span>DURATION</span><strong>{booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}</strong></div><div><span>TOTAL</span><strong>{money(booking.total)}</strong></div></div><div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Share with someone you trust</strong><small>Let them know where you'll be.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="safety-card"><div className="safety-card-heading"><ShieldCheck size={19} /><span><strong>Here for your peace of mind</strong><small>A few helpful things to have close.</small></span></div><div className="safety-tip"><strong>A little safety checklist</strong><p>Share your plans with someone you trust, keep your phone charged, and confirm your return trip before you go.</p></div><div className="emergency-box"><span>NEED HELP?</span><div><a href="tel:112">112 <small>Emergency</small></a><a href="tel:181">181 <small>Women's helpline</small></a></div></div><button className="location-share" onClick={() => setNotice('Live location sharing is a demo feature and is not active.') }><MapPin size={15} /> Share live location <span>MOCK</span></button></aside></div><div className="confirmation-actions"><button className="primary-button" onClick={() => setPage('home')}>Back to exploring <Compass size={16} /></button><button className="text-link" onClick={() => { setSearch((current) => ({ ...current, district: booking.space.district, location: booking.space.locality || booking.space.area })); setPage('results') }}>Find another space <ArrowRight size={15} /></button></div></main>}

      {page === 'listing' && <main className="page-main listing-page"><div className="listing-hero"><span className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</span><h1>Your space could<br />be someone's <em>somewhere.</em></h1><p>Share your underused room, rooftop, or little corner with people who could make something wonderful there.</p><div className="listing-stats"><span><Check size={15} /> Free to list</span><span><Check size={15} /> You choose when</span><span><Check size={15} /> Local community</span></div></div>{notice && <div className="success-notice"><Check size={17} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}<form className="listing-form" onSubmit={submitListing}>      <div className="listing-form-heading"><span className="eyebrow">LET'S GET TO KNOW YOUR SPACE</span><h2>Start with the details</h2><p>Preview the details a listing could include. This demo does not save or submit them.</p></div><div className="listing-fields"><label>SPACE NAME<input required placeholder="e.g. The little library room" /></label><label>DISTRICT<select required defaultValue=""><option value="" disabled>Select a Kerala district</option>{keralaDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label><label>TOWN<input required placeholder="e.g. Kochi" /></label><label>LOCALITY<input required placeholder="Neighbourhood or locality" /></label><label>CAPACITY<input required type="number" min="1" placeholder="How many people?" /></label><label>PRICE PER HOUR (₹)<input required type="number" min="1" placeholder="e.g. 400" /></label><label className="wide-field">PHOTO URLS<input type="text" placeholder="Add photo links, separated by commas" /></label><label className="wide-field">TELL US ABOUT IT<textarea rows="3" placeholder="What makes your space a lovely place to meet?" /></label></div><div className="listing-subsection"><h3>What can guests use?</h3><div className="listing-checks">{['Wi-Fi', 'Charging', 'Air conditioning', 'Fans', 'Projector', 'Whiteboard', 'Step-free access'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><div className="listing-subsection"><h3>Helpful resources</h3><div className="listing-checks">{['Desks', 'Printer access', 'Power backup', 'Soundproofing', 'Lockers', 'Drinking water', 'Tea or coffee'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div><div className="listing-fields"><label>NUMBER OF POWER SOCKETS<input type="number" min="0" placeholder="e.g. 12" /></label><label>WI-FI SPEED<input placeholder="e.g. 50 Mbps" /></label></div></div><div className="listing-subsection"><h3>When is it free?</h3><p>For now, tell us your usual availability. You'll confirm each booking request.</p><div className="listing-fields"><label>FREE DAYS<input placeholder="e.g. Monday to Friday" /></label><label>FREE HOURS<input placeholder="e.g. 2pm to 6pm" /></label><label>WOMEN-ONLY HOURS <span className="optional">(optional)</span><input placeholder="e.g. Saturdays, 10am to 2pm" /></label><label>WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>On-site, separate for women</option><option>On-site, shared</option><option>Not on-site</option></select></label><label>SEPARATE WASHROOM FOR WOMEN<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label><label>ACCESSIBLE WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label></div></div><div className="listing-subsection"><h3>Help guests feel comfortable</h3><div className="listing-checks">{['CCTV', 'Well-lit space', 'Secured entry', 'Female host or staff', 'Busy area', 'Near public transport', 'Owner ID verified'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><button className="primary-button listing-submit" type="submit">Send your space for review <ArrowRight size={16} /></button><p className="listing-disclaimer"><ShieldCheck size={14} /> Demo only: listings are not saved, submitted, or reviewed.</p></form></main>}

      <footer className="site-footer"><div className="footer-brand"><BrandLogo failed={logoFailed} onError={() => setLogoFailed(true)} /></div><span>More room for good things. Made for Kerala.</span><span>© 2025 EmptySpace</span></footer>
      {notice && page !== 'listing' && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
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
  const womenFriendly = space.safety.womenFriendly === true
  const venueCoordinates = !space.isDemo ? spaceCoordinates(space) : null
  const cafe = venueCoordinates && space.nearby.find((item) => ['cafe', 'restaurant'].includes(item.type) && spaceCoordinates(item))
  const cafeDistance = cafe ? distanceKm(venueCoordinates, spaceCoordinates(cafe)) : null
  const sampleFood = space.isDemo && space.nearby.some((item) => ['cafe', 'restaurant'].includes(item.type))
  const requested = selectedResources.map((key) => resourceLabels[key])
  const reason = requested.length
    ? `Has your requested ${requested.join(', ')}.`
    : mode === 'Student'
      ? `${space.atmosphere === 'quiet' ? 'A quiet spot' : 'A welcoming spot'} with ${space.amenities.wifi ? 'Wi-Fi' : 'room to focus'} and ${space.resources.powerSockets > 0 ? 'charging points' : 'space to settle in'}.`
      : `${space.amenities.ac ? 'Cool, comfortable' : 'Bright, flexible'} space with ${space.resources.powerBackup ? 'power backup' : 'reliable essentials'} for your next work session.`
  const updatedDays = daysAgo(space.lastUpdated, currentTime)
  return <article className="space-card"><div className="card-image-wrap" onClick={() => onOpen(space)}><img src={space.photoUrl} alt={space.name} loading="lazy" /><div className="card-badges">{space.isDemo && <span className="demo-badge"><Sparkles size={12} /> Demo listing</span>}{!space.isDemo && space.verified && <span className="verified-badge"><BadgeCheck size={12} /> Verified</span>}{womenFriendly && <span className="women-badge"><Heart size={12} /> Women-friendly features (sample)</span>}</div><button className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved spaces' : 'Save space'} onClick={(event) => { event.stopPropagation(); onSave(space.id) }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="card-content"><div className="card-title-row" onClick={() => onOpen(space)}><div><h3>{space.name}</h3><span className="card-location"><MapPin size={12} /> {locationLabel(space)}</span></div><span className="card-rating">{space.isDemo ? 'Demo data' : <><Star size={13} fill="currentColor" /> {space.rating}</>}</span></div><div className="card-meta"><span><UsersIcon /> {space.capacity} guests</span><span>{space.seatingType}</span><span>{space.atmosphere}</span></div><div className="card-amenities">{Object.entries(space.amenities).filter(([, value]) => value).slice(0, 4).map(([key]) => <span key={key} title={key}>{key === 'wifi' ? <Wifi size={14} /> : key === 'charging' ? <Zap size={14} /> : key === 'projector' ? <ArrowUpRight size={14} /> : <Sparkles size={14} />}</span>)}</div><p className="why-fit"><Sparkles size={13} /> {reason}</p><div className="card-local-chips">{space.washroom.onSite && <span>Washroom on-site{space.isDemo ? ' · sample' : ''}</span>}{cafe && cafeDistance !== null && <span><Coffee size={11} /> {cafe.type === 'cafe' ? 'Cafe' : 'Restaurant'} {cafeDistance.toFixed(1)} km away</span>}{sampleFood && <span><Coffee size={11} /> Nearby food · sample data</span>}{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div><div className="card-footer"><span><Clock3 size={12} /> {space.isDemo ? `Sample data | Availability updated ${updatedDays} ${updatedDays === 1 ? 'day' : 'days'} ago` : `Availability updated ${updatedDays} ${updatedDays === 1 ? 'day' : 'days'} ago`}</span><strong>{money(space.pricePerHour)}<small> / hr</small></strong></div><button className="card-open-button" aria-label={`View ${space.name}`} onClick={() => onOpen(space)}>View space <ArrowRight size={14} /></button></div></article>
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
  return <div className="nearby-groups">{groups.map(([label, types]) => {
    const items = space.nearby.filter((item) => types.includes(item.type))
    if (!items.length) return null
    return <div className="nearby-group" key={label}><strong>{label}</strong>{items.map((item) => {
      const itemCoordinates = !space.isDemo ? spaceCoordinates(item) : null
      const venueCoordinates = !space.isDemo ? spaceCoordinates(space) : null
      const distance = itemCoordinates && venueCoordinates ? distanceKm(venueCoordinates, itemCoordinates) : null
      return <span key={item.name}><span>{space.isDemo ? `${item.name} · sample` : item.name}</span><small>{space.isDemo ? 'Illustrative place; location and distance are unverified' : distance === null ? 'Distance not available' : `${distance.toFixed(1)} km straight-line`}</small></span>
    })}</div>
  })}</div>
}

function OwnerCallout({ onClick }) {
  return <section className="owner-callout"><div><span className="eyebrow">GOOD SPACE SHOULD BE SHARED</span><h2>Got a room with<br /><em>a little more to give?</em></h2><p>Give your underused space a new purpose — and help good things happen nearby.</p></div><button className="primary-button" onClick={onClick}>List your space <ArrowUpRight size={16} /></button><div className="callout-decoration">⌂</div></section>
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
