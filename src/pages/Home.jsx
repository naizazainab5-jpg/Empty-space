import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  Check, Clock3, Coffee, Compass, Crosshair,
  Heart, MapPin, Menu, Minus, Plus, Printer, Search, Shield,
  ShieldCheck, SlidersHorizontal, Sparkles, Star, Wifi, X, Zap,
} from 'lucide-react'
import spaces from '../spaces.json'
import '../App.css'

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

const defaultSearch = { purpose: '', people: '4', budget: '500', district: '', location: '', duration: '2' }

// To use your own logo, place an SVG, PNG, or WebP at public/emptyspace-logo.svg
// and set this path. Leave it empty to keep the CSS EmptySpace mark.
const CUSTOM_LOGO_PATH = ''

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const money = (value) => `₹${value.toLocaleString('en-IN')}`
const daysAgo = (date, now) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 86400000))
const locationLabel = (space) => [space.locality || space.area, space.town, space.district].filter((value, index, list) => value && list.indexOf(value) === index).join(', ')
const locationSuggestions = [...new Set(spaces.flatMap((space) => [space.locality, space.area, space.town, space.district]).filter((value) => value && value.toLowerCase() !== 'sample locality'))].sort()

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

function categoryLabel(mode, id) {
  return categoriesByMode[mode]?.find((category) => category.id === id)?.label.toLowerCase() || 'your plans'
}

function Home() {
  const location = useLocation()
  const navigate = useNavigate()
  const routeParams = new URLSearchParams(location.search)
  const spaceRoute = location.pathname.match(/^\/(?:space|book)\/([^/]+)$/)
  const routeSpaceId = spaceRoute ? spaceRoute[1] : null
  const page = location.pathname === '/results' ? 'results'
    : location.pathname.startsWith('/space/') ? 'detail'
      : location.pathname.startsWith('/book/') ? 'booking'
        : location.pathname === '/confirmation' ? 'confirmation'
          : location.pathname === '/listing' ? 'listing'
            : 'home'
  const [currentTime] = useState(() => Date.now())
  const [minimumDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState(() => routeParams.get('mode') || '')
  const [comfort, setComfort] = useState(() => routeParams.get('comfort') || '')
  const [locationCoordinates, setLocationCoordinates] = useState(null)
  const [locationStatus, setLocationStatus] = useState({ type: 'idle', message: '' })
  const [locating, setLocating] = useState(false)
  const locationRequestId = useRef(0)
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [nearbyRadius, setNearbyRadius] = useState('25')
  const [logoFailed, setLogoFailed] = useState(false)
  const [selectedResources, setSelectedResources] = useState(() => routeParams.getAll('resource'))
  const [filters, setFilters] = useState(() => routeParams.getAll('filter'))
  const [search, setSearch] = useState(() => ({
    ...defaultSearch,
    purpose: routeParams.get('purpose') || '',
    people: routeParams.get('people') || defaultSearch.people,
    budget: routeParams.get('budget') || defaultSearch.budget,
    district: routeParams.get('district') || '',
    location: routeParams.get('location') || '',
    duration: routeParams.get('duration') || defaultSearch.duration,
  }))
  const [activeSpace, setActiveSpace] = useState(() => spaces.find((space) => space.id === routeSpaceId) || spaces[0])
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

  function buildResultsSearch(overrides = {}) {
    const values = {
      mode,
      comfort,
      filters,
      selectedResources,
      ...overrides,
      search: { ...search, ...(overrides.search || {}) },
    }
    const params = new URLSearchParams()
    params.set('mode', values.mode)
    params.set('purpose', values.search.purpose)
    params.set('people', values.search.people)
    params.set('budget', values.search.budget)
    params.set('district', values.search.district)
    params.set('location', values.search.location)
    params.set('duration', values.search.duration)
    if (values.comfort) params.set('comfort', values.comfort)
    values.filters.forEach((filter) => params.append('filter', filter))
    values.selectedResources.forEach((resource) => params.append('resource', resource))
    return `?${params.toString()}`
  }

  function setPage(nextPage, options = {}) {
    const resultSearch = buildResultsSearch(options)
    const routes = {
      home: '/',
      results: `/results${resultSearch}`,
      detail: `/space/${encodeURIComponent(options.spaceId || activeSpace.id)}${resultSearch}`,
      booking: `/book/${encodeURIComponent(options.spaceId || activeSpace.id)}${resultSearch}`,
      confirmation: '/confirmation',
      listing: '/listing',
    }
    navigate(routes[nextPage] || '/')
  }

  function updateResultQuery(overrides = {}) {
    navigate({ pathname: '/results', search: buildResultsSearch(overrides) })
  }

  useEffect(() => {
    function restoreUrlState() {
      const params = new URLSearchParams(window.location.search)
      const match = window.location.pathname.match(/^\/(?:space|book)\/([^/]+)$/)
      const routedSpace = match && spaces.find((space) => space.id === match[1])
      if (routedSpace) setActiveSpace(routedSpace)
      setMode(params.get('mode') || '')
      setComfort(params.get('comfort') || '')
      setFilters(params.getAll('filter'))
      setSelectedResources(params.getAll('resource'))
      setSearch({
        ...defaultSearch,
        purpose: params.get('purpose') || '',
        people: params.get('people') || defaultSearch.people,
        budget: params.get('budget') || defaultSearch.budget,
        district: params.get('district') || '',
        location: params.get('location') || '',
        duration: params.get('duration') || defaultSearch.duration,
      })
      if (window.location.pathname === '/confirmation') {
        const space = spaces.find((item) => item.id === params.get('space'))
        const hours = Number(params.get('hours'))
        if (space && params.get('date') && params.get('slot') && Number.isFinite(hours) && hours > 0) {
          setBooking({ space, date: params.get('date'), slot: params.get('slot'), hours, total: space.pricePerHour * hours })
          return
        }
      }
      setBooking(null)
    }

    window.addEventListener('popstate', restoreUrlState)
    return () => window.removeEventListener('popstate', restoreUrlState)
  }, [])

  const results = useMemo(() => {
    const loweredLocation = search.location.trim().toLowerCase()
    const loweredDistrict = search.district.trim().toLowerCase()
    return spaces.filter((space) => {
      const listingDistrict = (space.district || 'Kozhikode').toLowerCase()
      const listingLocation = `${space.locality || space.area} ${space.town || ''} ${listingDistrict} Kerala`.toLowerCase()
      const matchesDistrict = !loweredDistrict || listingDistrict === loweredDistrict
      const matchesLocation = !loweredLocation || listingLocation.includes(loweredLocation)
      const matchesBudget = space.pricePerHour <= Number(search.budget || Infinity)
      const matchesPeople = space.capacity >= Number(search.people || 1)
      const matchesDuration = Object.values(space.availability).some((slots) => slots.some((time) => slotDuration(time) >= Number(search.duration || 1)))
      const matchesMode = !mode || Boolean(space.categories?.[mode === 'Student' ? 'student' : 'professional']?.includes(search.purpose))
      const coordinates = spaceCoordinates(space)
      const distance = locationCoordinates && coordinates ? distanceKm(locationCoordinates, coordinates) : null
      const matchesNearby = !nearbyOnly || (distance !== null && distance <= Number(nearbyRadius))
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
        if (filter === 'women') return hasWomenFriendlyFeatures
        if (filter === 'womenHours') return Boolean(space.safety.womenOnlyHours)
        if (filter === 'femaleHost') return space.safety.femaleHostOrStaff
        if (filter === 'cctv') return space.safety.cctv
        if (filter === 'transport') return space.safety.nearPublicTransport
        if (filter === 'washroom') return space.washroom.onSite
        if (filter === 'restaurant') return space.nearby.some((item) => ['restaurant', 'cafe'].includes(item.type) && item.walkingMinutes <= 5)
        return true
      })
      return matchesDistrict && matchesLocation && matchesBudget && matchesPeople && matchesDuration && matchesMode && matchesNearby && matchesResources && matchesWomen && activeFilters
    }).sort((a, b) => {
      if (nearbyOnly) return distanceKm(locationCoordinates, spaceCoordinates(a)) - distanceKm(locationCoordinates, spaceCoordinates(b))
      if (mode === 'Student') return studentScore(a) - studentScore(b)
      return professionalScore(b) - professionalScore(a)
    })
  }, [comfort, filters, locationCoordinates, mode, nearbyOnly, nearbyRadius, search, selectedResources])

  const toggleResource = (resource) => {
    const nextResources = selectedResources.includes(resource) ? selectedResources.filter((item) => item !== resource) : [...selectedResources, resource]
    setSelectedResources(nextResources)
    if (page === 'results') updateResultQuery({ selectedResources: nextResources })
  }
  const toggleFilter = (filter) => {
    const nextFilters = filters.includes(filter) ? filters.filter((item) => item !== filter) : [...filters, filter]
    setFilters(nextFilters)
    if (page === 'results') updateResultQuery({ filters: nextFilters })
  }
  const isWomenFriendly = (space) => [space.safety.cctv, space.safety.wellLit, space.safety.securedEntry, space.safety.ownerIdVerified].every(Boolean)

  function changeMode(nextMode) {
    setMode(nextMode)
    setSearch((current) => ({ ...current, purpose: '' }))
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
        ({ coords }) => {
          if (requestId !== locationRequestId.current) return
          setLocationCoordinates({ latitude: coords.latitude, longitude: coords.longitude })
          setLocating(false)
          setLocationStatus({
            type: 'success',
            message: 'Location captured for nearby search. No reverse-geocoding service is configured, so enter a town or district above if you also want a named location filter.',
          })
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
          setLocationCoordinates(null)
          setLocationStatus({ type: 'error', message })
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
    setSearch(defaultSearch)
    setPage('home')
  }

  function clearFilters() {
    setFilters([])
    if (page === 'results') updateResultQuery({ filters: [] })
  }

  function clearResultFilters() {
    const nextSearch = { ...search, budget: '1000', location: '', district: '', people: '1', duration: '1' }
    setSelectedResources([])
    setFilters([])
    setComfort('')
    setNearbyOnly(false)
    setSearch(nextSearch)
    updateResultQuery({ selectedResources: [], filters: [], comfort: '', search: nextSearch })
  }

  function openDetails(space) {
    setActiveSpace(space)
    setPage('detail', { spaceId: space.id })
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
    const params = new URLSearchParams(buildResultsSearch().slice(1))
    params.set('space', activeSpace.id)
    params.set('date', date)
    params.set('slot', slot)
    params.set('hours', String(hours))
    navigate(`/confirmation?${params.toString()}`)
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

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('home') }}>
          <BrandLogo failed={logoFailed} onError={() => setLogoFailed(true)} />
        </a>
        <button className="mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21} /></button>
        <nav className={mobileMenu ? 'main-nav is-open' : 'main-nav'}>
          <button className={page === 'home' || page === 'results' ? 'nav-link active' : 'nav-link'} onClick={() => { setPage('home'); setMobileMenu(false) }}>Find a space</button>
          <button className="nav-link nav-about" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
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
          <div className="role-choice-row" role="group" aria-label="Who are you booking for?">
            {['Student', 'Professional'].map((role) => <button type="button" key={role} className={`role-choice ${mode === role ? 'selected' : ''}`} aria-pressed={mode === role} onClick={() => changeMode(role)}>
              <span className="role-choice-copy"><strong>{role === 'Student' ? 'Student' : 'Working professional'}</strong><small>{role === 'Student' ? 'Study, learn, and create' : 'Work, meet, and collaborate'}</small></span>
              {mode === role && <Check size={18} aria-hidden="true" />}
            </button>)}
          </div>
          <form className="search-form booking-search-bar" onSubmit={submitSearch}>
            <label className="search-field activity-field"><span>ACTIVITY</span><select aria-label="Activity" value={search.purpose} disabled={!mode} onChange={(event) => setSearch((current) => ({ ...current, purpose: event.target.value }))}>
              <option value="">{mode ? 'Choose an activity' : 'Choose a role'}</option>
              {(categoriesByMode[mode] || []).map((category) => <option key={category.id} value={category.id}>{category.label.replace('&', 'and')}</option>)}
            </select></label>
            <label className="search-field people-field"><span>PEOPLE</span><div className="field-with-icon"><input aria-label="Number of people" type="number" min="1" max="100" value={search.people} onChange={(event) => setSearch((current) => ({ ...current, people: event.target.value }))} /><span>guests</span></div></label>
            <label className="search-field budget-field"><span>MAX BUDGET / HR</span><div className="field-with-icon"><span>₹</span><input aria-label="Maximum budget per hour" type="number" min="0" value={search.budget} onChange={(event) => setSearch((current) => ({ ...current, budget: event.target.value }))} /></div></label>
            <div className="search-field location-field"><span>LOCATION IN KERALA</span><div className="location-control">
              <select aria-label="District in Kerala" value={search.district} onChange={(event) => setSearch((current) => ({ ...current, district: event.target.value }))}><option value="">Any district</option>{keralaDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select>
              <div className="location-input-wrap"><MapPin size={14} aria-hidden="true" /><input aria-label="Town or locality in Kerala" list="kerala-location-suggestions" value={search.location} onChange={(event) => setSearch((current) => ({ ...current, location: event.target.value }))} placeholder="Choose a town or locality" /><datalist id="kerala-location-suggestions">{locationSuggestions.map((location) => <option key={location} value={location} />)}</datalist></div>
              <button type="button" className={`use-current-location ${locating ? 'is-locating' : ''}`} onClick={requestCurrentLocation} disabled={locating}><Crosshair size={14} aria-hidden="true" />{locating ? 'Detecting location…' : 'Use my current location'}</button>
            </div>{locationCoordinates && <button type="button" className="clear-current-location" onClick={clearCurrentLocation}>Clear current location</button>}{locationStatus.message && <span className={`location-status ${locationStatus.type}`} role="status" aria-live="polite">{locationStatus.message}</span>}</div>
            <label className="search-field duration-field"><span>DURATION</span><select aria-label="Booking duration" value={search.duration} onChange={(event) => setSearch((current) => ({ ...current, duration: event.target.value }))}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option><option value="6">6 hours</option></select></label>
            <button className="search-submit" type="submit" disabled={!mode || !search.purpose}><Search size={17} /><span>Find a space</span></button>
          </form>
          <div className="search-preferences">
            <label className="comfort-select"><span>SPACE PREFERENCES</span><select aria-label="Optional women-safety preference" value={comfort} onChange={(event) => setComfort(event.target.value)}><option value="">No additional women-specific requirement</option>{comfortOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
            <fieldset className="amenity-preferences"><legend>OPTIONAL AMENITIES</legend><div className="amenity-options">{Object.entries(resourceLabels).map(([key, label]) => <label key={key} className={selectedResources.includes(key) ? 'selected' : ''}><input type="checkbox" checked={selectedResources.includes(key)} onChange={() => toggleResource(key)} /><span>{label}</span></label>)}</div></fieldset>
            <div className="location-preferences"><span className="location-preferences-title">LOCATION PREFERENCES</span><label className={`nearby-option ${nearbyOnly ? 'selected' : ''}`}><input type="checkbox" checked={nearbyOnly} onChange={(event) => toggleNearby(event.target.checked)} /><MapPin size={14} aria-hidden="true" /><span>Near my location</span></label><label className="nearby-radius">Within <select aria-label="Nearby search radius" value={nearbyRadius} disabled={!nearbyOnly} onChange={(event) => setNearbyRadius(event.target.value)}><option value="5">5 km</option><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><small>Distance matching requires current location and listing coordinates.</small></div>
            <span className="search-demo-note">Sample listings; details are illustrative.</span>
          </div>
        </section>
        <section className="home-intro">
          <div><span className="eyebrow">A LITTLE MORE ROOM TO DO YOUR THING</span><h2>Space to make<br /><em>something happen.</em></h2></div>
          <p>From a focused study session to a full-room brainstorm, find a place that feels right for what you're making.</p>
        </section>
        <section className="featured-section">
          <div className="section-heading"><div><span className="eyebrow">ACROSS KERALA</span><h2>A few sample spaces</h2></div><button className="text-link" onClick={() => document.getElementById('guided-search')?.scrollIntoView({ behavior: 'smooth' })}>Explore all spaces <ArrowRight size={16} /></button></div>
          <div className="featured-grid">{spaces.slice(0, 3).map((space) => <SpaceCard key={space.id} space={space} mode={mode || 'Student'} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div>
        </section>
        <section className="how-section" id="how-it-works">
          <span className="eyebrow">SIMPLE AS MAKING A PLAN</span><h2>Find it. Book it. <em>Make it yours.</em></h2>
          <div className="steps-grid"><div><span>01</span><h3>Tell us what you need</h3><p>A few details help us find your kind of space, in your part of town.</p></div><div><span>02</span><h3>Find your somewhere</h3><p>Explore illustrative sample details, amenities, and what makes each space special.</p></div><div><span>03</span><h3>Make it happen</h3><p>Choose a free time slot and try a demo booking. No host is contacted.</p></div></div>
        </section>
        <OwnerCallout onClick={() => setPage('listing')} />
      </main>}

      {page === 'results' && <main className="page-main results-page">
        <div className="breadcrumb"><button onClick={() => setPage('home')}>Home</button><span>/</span><span>Find a space</span></div>
        <div className="results-top"><div><span className="eyebrow">YOUR NEXT SOMEWHERE · DEMO LISTINGS</span><h1>Spaces in <em>{search.location || search.district || 'Kerala'}</em></h1><p>{results.length} sample spaces for {categoryLabel(mode, search.purpose)} · {search.people} people · up to {money(Number(search.budget || 0))}/hr</p></div><button className="outline-button" onClick={() => setPage('home')}><SlidersHorizontal size={16} /> Edit search</button></div>
        <div className="results-layout"><aside className="filter-panel"><div className="filter-heading"><span>MAKE IT YOURS</span><button type="button" onClick={clearFilters}>Clear</button></div>{[['women', 'Women-friendly only'], ['womenHours', 'Women-only hours'], ['femaleHost', 'Female host or staff'], ['cctv', 'CCTV'], ['transport', 'Near public transport'], ['washroom', 'Washroom on-site'], ['restaurant', 'Restaurant within 5 min']].map(([key, label]) => <label className="filter-option" key={key}><input type="checkbox" checked={filters.includes(key)} onChange={() => toggleFilter(key)} /><span className="custom-check"><Check size={12} /></span>{label}</label>)}<div className="filter-safety"><ShieldCheck size={18} /><span><strong>Your comfort comes first.</strong><small>Safety details are illustrative, not verified.</small></span></div></aside>
          <div className="results-content"><div className="results-toolbar"><span>{nearbyOnly ? `Within ${nearbyRadius} km of your location` : `Sorted for ${mode === 'Student' ? 'student needs' : 'professional needs'}`}</span><button type="button" className="results-clear" onClick={clearResultFilters}>Clear filters</button></div>{results.length ? <div className="results-grid">{results.map((space) => <SpaceCard key={space.id} space={space} mode={mode} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div> : <div className="empty-state"><span>✳</span><h2>{nearbyOnly ? 'No nearby spaces found' : 'No spaces just yet'}</h2><p>{nearbyOnly ? !locationCoordinates ? 'To search by distance, go back to search and use your current location. A typed town name cannot be converted to coordinates in this demo.' : coordinateListingCount === 0 ? 'No sample listings include coordinates, so distances cannot be calculated yet. Turn off Nearby and search by district or town instead.' : `No coordinate-enabled listings matched within ${nearbyRadius} km. Widen your search radius or clear the Nearby filter.` : 'Try a wider budget, another Kerala district, or fewer must-haves. These listings are illustrative demo spaces.'}</p>{nearbyOnly ? <div className="nearby-empty-actions">{!locationCoordinates ? <button className="primary-button" onClick={() => setPage('home')}>Choose a location</button> : coordinateListingCount > 0 && Number(nearbyRadius) < 50 ? <button className="primary-button" onClick={() => setNearbyRadius(String(Math.min(50, Number(nearbyRadius) * 2)))}>Widen radius</button> : null}<button className="outline-button" onClick={() => setNearbyOnly(false)}>Clear Nearby</button></div> : <button className="primary-button" onClick={clearResultFilters}>Relax filters</button>}</div>}</div>
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
          <section className="detail-section nearby-section"><span className="eyebrow">AROUND THE CORNER</span><h2>Nearby</h2><NearbyList nearby={activeSpace.nearby} /></section>
          <button className="report-button" onClick={() => setReporting(!reporting)}><Shield size={15} /> Report this space</button>{reporting && <form className="report-form" onSubmit={(event) => { event.preventDefault(); setReporting(false); setNotice(`Thank you. Your report about "${reportReason.toLowerCase()}" was not submitted or saved; this is a demo form.`) }}><label htmlFor="report-reason">What would you like to report?</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Inaccurate listing details</option><option>Safety concern</option><option>Inappropriate content</option><option>Other</option></select><button className="primary-button" type="submit">Submit report</button></form>}
        </div><aside className="booking-card"><div className="booking-price"><strong>{money(activeSpace.pricePerHour)}</strong><span> / hour</span></div><div className="booking-rating"><MapPin size={14} /> {activeSpace.area}<span> - Demo data</span></div><div className="booking-card-note"><BadgeCheck size={16} /> Demo booking only. No payment or host contact.</div><button className="primary-button full-button" onClick={startBooking}>Book this space <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Demo status: pending owner confirmation. No host is contacted.</p><div className="card-last-updated"><Clock3 size={14} /> Availability updated {daysAgo(activeSpace.lastUpdated, currentTime)} days ago</div></aside></div>
      </main>}

      {page === 'booking' && <main className="page-main booking-page"><button className="back-link" onClick={() => setPage('detail')}><ArrowLeft size={16} /> Back to space</button><div className="booking-page-heading"><span className="eyebrow">A GOOD PLAN, IN THE MAKING</span><h1>Book your <em>somewhere.</em></h1><p>Choose a day and time that works for you.</p></div><div className="booking-layout"><section className="booking-form-card"><label className="form-label">PICK A DAY<input className="date-input" type="date" min={minimumDate} value={date} onChange={(event) => { setDate(event.target.value); setSlot('') }} /></label><span className="form-label">FREE TIME SLOTS · {dayLabel.toUpperCase()}</span>{availableSlots.length ? <div className="slot-grid">{availableSlots.map((time) => <button key={time} className={`slot-button ${slot === time ? 'selected' : ''}`} onClick={() => { setSlot(time); setHours((current) => Math.min(current, slotDuration(time))) }}><Clock3 size={15} /> {time}</button>)}</div> : <div className="no-slots">No free slots on this day. Try another date.</div>}<label className="form-label hours-label">HOW MANY HOURS?<div className="stepper"><button aria-label="Decrease hours" onClick={() => setHours(Math.max(1, hours - 1))}><Minus size={15} /></button><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong><button aria-label="Increase hours" disabled={hours >= maxBookingHours} onClick={() => setHours(Math.min(maxBookingHours, hours + 1))}><Plus size={15} /></button></div></label>{slot && slotEndsAfterEight(slot, hours) && <div className="late-warning"><Clock3 size={17} /><span><strong>Getting home late?</strong> This slot ends after 8pm. Please plan a safe journey back.</span></div>}<div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Keep someone in the loop</strong><small>Share your booking details with a trusted contact.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="booking-summary"><span className="eyebrow">YOUR PLAN</span><div className="summary-space"><img src={activeSpace.photoUrl} alt="" /><span><strong>{activeSpace.name}</strong><small><MapPin size={12} /> {locationLabel(activeSpace)}</small></span></div><div className="summary-line"><span>Date</span><strong>{dayLabel}</strong></div><div className="summary-line"><span>Time</span><strong>{slot || 'Choose a time slot'}</strong></div><div className="summary-line"><span>Duration</span><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong></div><div className="summary-total"><span>Total</span><strong>{money(activeSpace.pricePerHour * hours)}</strong></div><button className="primary-button full-button" onClick={confirmBooking} disabled={!slot}>Request to book <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Your booking will be pending owner confirmation.</p></aside></div></main>}

      {page === 'confirmation' && booking && <main className="page-main confirmation-page"><div className="confirmation-top"><span className="confirmation-icon"><Check size={28} /></span><span className="eyebrow">YOUR PLAN IS IN MOTION</span><h1>Good things <em>start here.</em></h1><p>This sample booking is only stored in this session. No host has been contacted.</p><span className="pending-pill"><Clock3 size={14} /> Pending owner confirmation</span></div><div className="confirmation-layout"><section className="confirmed-card"><div className="summary-space"><img src={booking.space.photoUrl} alt="" /><span><strong>{booking.space.name}</strong><small><MapPin size={12} /> {locationLabel(booking.space)}</small></span></div><div className="confirmed-details"><div><span>DATE</span><strong>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div><div><span>TIME</span><strong>{booking.slot}</strong></div><div><span>DURATION</span><strong>{booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}</strong></div><div><span>TOTAL</span><strong>{money(booking.total)}</strong></div></div><div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Share with someone you trust</strong><small>Let them know where you'll be.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="safety-card"><div className="safety-card-heading"><ShieldCheck size={19} /><span><strong>Here for your peace of mind</strong><small>A few helpful things to have close.</small></span></div><div className="safety-tip"><strong>A little safety checklist</strong><p>Share your plans with someone you trust, keep your phone charged, and confirm your return trip before you go.</p></div><div className="emergency-box"><span>NEED HELP?</span><div><a href="tel:112">112 <small>Emergency</small></a><a href="tel:181">181 <small>Women's helpline</small></a></div></div><button className="location-share" onClick={() => setNotice('Live location sharing is a demo feature and is not active.') }><MapPin size={15} /> Share live location <span>MOCK</span></button></aside></div>      <div className="confirmation-actions"><button className="primary-button" onClick={() => setPage('home')}>Back to exploring <Compass size={16} /></button><button className="text-link" onClick={() => { const nextSearch = { ...search, district: booking.space.district, location: booking.space.locality || booking.space.area }; setSearch(nextSearch); setPage('results', { search: nextSearch }) }}>Find another space <ArrowRight size={15} /></button></div></main>}

      {page === 'listing' && <main className="page-main listing-page"><div className="listing-hero"><span className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</span><h1>Your space could<br />be someone's <em>somewhere.</em></h1><p>Share your underused room, rooftop, or little corner with people who could make something wonderful there.</p><div className="listing-stats"><span><Check size={15} /> Free to list</span><span><Check size={15} /> You choose when</span><span><Check size={15} /> Local community</span></div></div>{notice && <div className="success-notice"><Check size={17} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}<form className="listing-form" onSubmit={submitListing}>      <div className="listing-form-heading"><span className="eyebrow">LET'S GET TO KNOW YOUR SPACE</span><h2>Start with the details</h2><p>Tell us a little about what you're sharing. You can add more later.</p></div><div className="listing-fields"><label>SPACE NAME<input required placeholder="e.g. The little library room" /></label><label>DISTRICT<select required defaultValue=""><option value="" disabled>Select a Kerala district</option>{keralaDistricts.map((district) => <option key={district} value={district}>{district}</option>)}</select></label><label>TOWN<input required placeholder="e.g. Kochi" /></label><label>LOCALITY<input required placeholder="Neighbourhood or locality" /></label><label>CAPACITY<input required type="number" min="1" placeholder="How many people?" /></label><label>PRICE PER HOUR (₹)<input required type="number" min="1" placeholder="e.g. 400" /></label><label className="wide-field">PHOTO URLS<input type="text" placeholder="Add photo links, separated by commas" /></label><label className="wide-field">TELL US ABOUT IT<textarea rows="3" placeholder="What makes your space a lovely place to meet?" /></label></div><div className="listing-subsection"><h3>What can guests use?</h3><div className="listing-checks">{['Wi-Fi', 'Charging', 'Air conditioning', 'Fans', 'Projector', 'Whiteboard', 'Step-free access'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><div className="listing-subsection"><h3>Helpful resources</h3><div className="listing-checks">{['Desks', 'Printer access', 'Power backup', 'Soundproofing', 'Lockers', 'Drinking water', 'Tea or coffee'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div><div className="listing-fields"><label>NUMBER OF POWER SOCKETS<input type="number" min="0" placeholder="e.g. 12" /></label><label>WI-FI SPEED<input placeholder="e.g. 50 Mbps" /></label></div></div><div className="listing-subsection"><h3>When is it free?</h3><p>For now, tell us your usual availability. You'll confirm each booking request.</p><div className="listing-fields"><label>FREE DAYS<input placeholder="e.g. Monday to Friday" /></label><label>FREE HOURS<input placeholder="e.g. 2pm to 6pm" /></label><label>WOMEN-ONLY HOURS <span className="optional">(optional)</span><input placeholder="e.g. Saturdays, 10am to 2pm" /></label><label>WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>On-site, separate for women</option><option>On-site, shared</option><option>Not on-site</option></select></label><label>SEPARATE WASHROOM FOR WOMEN<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label><label>ACCESSIBLE WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label></div></div><div className="listing-subsection"><h3>Help guests feel comfortable</h3><div className="listing-checks">{['CCTV', 'Well-lit space', 'Secured entry', 'Female host or staff', 'Busy area', 'Near public transport', 'Owner ID verified'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><button className="primary-button listing-submit" type="submit">Send your space for review <ArrowRight size={16} /></button><p className="listing-disclaimer"><ShieldCheck size={14} /> Demo only: listings are not saved, submitted, or reviewed.</p></form></main>}

      <footer className="site-footer"><div className="footer-brand"><BrandLogo failed={logoFailed} onError={() => setLogoFailed(true)} /></div><span>More room for good things. Made for Kerala.</span><span>© 2025 EmptySpace</span></footer>
      {notice && page !== 'listing' && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  )
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
  const cafe = space.nearby.find((item) => item.type === 'cafe' || item.type === 'restaurant')
  const requested = selectedResources.map((key) => resourceLabels[key])
  const reason = requested.length
    ? `Has your requested ${requested.join(', ')}.`
    : mode === 'Student'
      ? `${space.atmosphere === 'quiet' ? 'A quiet spot' : 'A welcoming spot'} with ${space.amenities.wifi ? 'Wi-Fi' : 'room to focus'} and ${space.nearby.some((item) => item.type === 'print shop') ? 'a print shop' : 'local cafés'} nearby.`
      : `${space.amenities.ac ? 'Cool, comfortable' : 'Bright, flexible'} space with ${space.resources.powerBackup ? 'power backup' : 'reliable essentials'} for your next work session.`
  const updatedDays = daysAgo(space.lastUpdated, currentTime)
  return <article className="space-card"><div className="card-image-wrap" onClick={() => onOpen(space)}><img src={space.photoUrl} alt={space.name} loading="lazy" /><div className="card-badges">{space.isDemo && <span className="demo-badge"><Sparkles size={12} /> Demo listing</span>}{!space.isDemo && space.verified && <span className="verified-badge"><BadgeCheck size={12} /> Verified</span>}{womenFriendly && <span className="women-badge"><Heart size={12} /> Women-friendly features (sample)</span>}</div><button className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved spaces' : 'Save space'} onClick={(event) => { event.stopPropagation(); onSave(space.id) }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="card-content"><div className="card-title-row" onClick={() => onOpen(space)}><div><h3>{space.name}</h3><span className="card-location"><MapPin size={12} /> {locationLabel(space)}</span></div><span className="card-rating">{space.isDemo ? 'Demo data' : <><Star size={13} fill="currentColor" /> {space.rating}</>}</span></div><div className="card-meta"><span><UsersIcon /> {space.capacity} guests</span><span>{space.seatingType}</span><span>{space.atmosphere}</span></div><div className="card-amenities">{Object.entries(space.amenities).filter(([, value]) => value).slice(0, 4).map(([key]) => <span key={key} title={key}>{key === 'wifi' ? <Wifi size={14} /> : key === 'charging' ? <Zap size={14} /> : key === 'projector' ? <ArrowUpRight size={14} /> : <Sparkles size={14} />}</span>)}</div><p className="why-fit"><Sparkles size={13} /> {reason}</p><div className="card-local-chips">{space.washroom.onSite && <span>Washroom on-site</span>}{cafe && <span><Coffee size={11} /> {cafe.type === 'cafe' ? 'Cafe' : 'Restaurant'} {cafe.walkingMinutes} min walk</span>}{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div><div className="card-footer"><span><Clock3 size={12} /> {space.isDemo ? `Sample data | Availability updated ${updatedDays} ${updatedDays === 1 ? 'day' : 'days'} ago` : `Availability updated ${updatedDays} ${updatedDays === 1 ? 'day' : 'days'} ago`}</span><strong>{money(space.pricePerHour)}<small> / hr</small></strong></div><button className="card-open-button" aria-label={`View ${space.name}`} onClick={() => onOpen(space)}>View space <ArrowRight size={14} /></button></div></article>
}

function NearbyList({ nearby }) {
  const groups = [
    ['Food & coffee', ['restaurant', 'cafe']],
    ['Washrooms', ['washroom']],
    ['ATM & pharmacy', ['atm', 'pharmacy']],
    ['Print & stationery', ['print shop', 'stationery']],
    ['Getting around', ['bus stop']],
  ]
  return <div className="nearby-groups">{groups.map(([label, types]) => {
    const items = nearby.filter((item) => types.includes(item.type))
    if (!items.length) return null
    return <div className="nearby-group" key={label}><strong>{label}</strong>{items.map((item) => <span key={item.name}><span>{item.name}</span><small>{item.walkingMinutes} min walk · {item.distanceMeters} m</small></span>)}</div>
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
  const foodNearby = space.nearby.some((item) => ['restaurant', 'cafe'].includes(item.type) && item.walkingMinutes <= 5)
  const printNearby = space.nearby.some((item) => item.type === 'print shop' && item.walkingMinutes <= 10)
  return space.pricePerHour / 40
    - Number(space.atmosphere === 'quiet') * 5
    - Number(space.amenities.wifi) * 2
    - Number(space.resources.powerSockets > 0) * 2
    - longestSlot
    - Number(foodNearby) * 2
    - Number(printNearby) * 2
}

function professionalScore(space) {
  const hasCafe = space.nearby.some((item) => item.type === 'cafe')
  const hasTransport = space.safety.nearPublicTransport || space.nearby.some((item) => item.type === 'bus stop')
  return Number(space.resources.wifiSpeed.split(' ')[0]) / 10
    + Number(space.amenities.ac) * 5
    + Number(space.resources.powerBackup) * 5
    + Number(space.amenities.projector) * 3
    + Number(space.resources.soundproof) * 3
    + Number(space.seatingType.toLowerCase().includes('meeting')) * 3
    + Number(hasCafe) * 2
    + Number(hasTransport) * 2
}

export default Home
