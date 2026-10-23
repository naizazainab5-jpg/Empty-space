import { useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  Check, Clock3, Coffee, Compass,
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

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const money = (value) => `₹${value.toLocaleString('en-IN')}`
const daysAgo = (date, now) => Math.max(0, Math.floor((now - new Date(date).getTime()) / 86400000))

function App() {
  const [currentTime] = useState(() => Date.now())
  const [minimumDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [page, setPage] = useState('home')
  const [mode, setMode] = useState('Student')
  const [onlyWomenSafe, setOnlyWomenSafe] = useState(false)
  const [selectedResources, setSelectedResources] = useState([])
  const [filters, setFilters] = useState([])
  const [search, setSearch] = useState({ purpose: 'Study session', people: '4', budget: '500', location: 'Kozhikode', duration: '2' })
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

  const results = useMemo(() => {
    const loweredLocation = search.location.trim().toLowerCase()
    return spaces.filter((space) => {
      const matchesLocation = !loweredLocation || `${space.area} Kozhikode Kerala`.toLowerCase().includes(loweredLocation)
      const matchesBudget = space.pricePerHour <= Number(search.budget || Infinity)
      const matchesPeople = space.capacity >= Number(search.people || 1)
      const matchesDuration = Object.values(space.availability).some((slots) => slots.some((time) => slotDuration(time) >= Number(search.duration || 1)))
      const matchesResources = selectedResources.every((resource) => {
        if (resource === 'quiet') return space.atmosphere === 'quiet'
        if (resource === 'charging') return space.resources.powerSockets > 0
        if (resource === 'wifi') return Boolean(space.amenities.wifi)
        if (resource === 'ac') return Boolean(space.amenities.ac)
        if (resource === 'powerBackup') return Boolean(space.resources.powerBackup)
        if (resource === 'printer') return Boolean(space.resources.printerAccess)
        return Boolean(space.amenities[resource])
      })
      const isWomenFriendly = space.safety.cctv && space.safety.wellLit && space.safety.securedEntry && space.safety.ownerIdVerified
      const matchesWomen = !onlyWomenSafe || isWomenFriendly
      const activeFilters = filters.every((filter) => {
        if (filter === 'women') return isWomenFriendly
        if (filter === 'womenHours') return Boolean(space.safety.womenOnlyHours)
        if (filter === 'femaleHost') return space.safety.femaleHostOrStaff
        if (filter === 'cctv') return space.safety.cctv
        if (filter === 'transport') return space.safety.nearPublicTransport
        if (filter === 'washroom') return space.washroom.onSite
        if (filter === 'restaurant') return space.nearby.some((item) => ['restaurant', 'cafe'].includes(item.type) && item.walkingMinutes <= 5)
        return true
      })
      return matchesLocation && matchesBudget && matchesPeople && matchesDuration && matchesResources && matchesWomen && activeFilters
    }).sort((a, b) => {
      if (mode === 'Student') return studentScore(a) - studentScore(b)
      return professionalScore(b) - professionalScore(a)
    })
  }, [filters, mode, onlyWomenSafe, search, selectedResources])

  const toggleResource = (resource) => setSelectedResources((current) => current.includes(resource) ? current.filter((item) => item !== resource) : [...current, resource])
  const toggleFilter = (filter) => setFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter])
  const isWomenFriendly = (space) => space.safety.cctv && space.safety.wellLit && space.safety.securedEntry && space.safety.ownerIdVerified

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
    setPage('results')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function submitListing(event) {
    event.preventDefault()
    setNotice('Thanks for listing with EmptySpace. Our team will review your space and get in touch soon.')
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
          <span className="brand-mark"><span /><span /><span /></span>
          <span>empty<span className="brand-light">space</span></span>
        </a>
        <button className="mobile-menu-button" aria-label="Toggle navigation" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21} /></button>
        <nav className={mobileMenu ? 'main-nav is-open' : 'main-nav'}>
          <button className={page === 'home' || page === 'results' ? 'nav-link active' : 'nav-link'} onClick={() => { setPage('home'); setMobileMenu(false) }}>Find a space</button>
          <button className="nav-link" onClick={() => { setPage('listing'); setMobileMenu(false) }}>List your space</button>
          <button className="nav-link nav-about" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
        </nav>
        <button className="header-action" onClick={() => setPage('listing')}>List your space <ArrowUpRight size={15} /></button>
      </header>

      {page === 'home' && <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> KOZHIKODE, KERALA <span className="eyebrow-line" /> A BETTER WAY TO GATHER</div>
            <h1>There's room<br />for <em>what's next.</em></h1>
            <p className="hero-description">Discover the rooms, rooftops, and little corners already around you. Made for ideas, good company, and getting things done.</p>
            <div className="hero-proof"><div className="avatar-stack"><span>F</span><span>A</span><span>M</span></div><span>Good spaces, shared locally.</span><span className="proof-stars">★★★★★</span></div>
          </div>
          <div className="hero-art" aria-label="A bright, welcoming community meeting room">
            <img src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=85" alt="Sunlit creative meeting room with a long table" />
            <div className="art-label"><span className="live-dot" /> A room for the next big thing <ArrowUpRight size={15} /></div>
            <div className="floating-note"><span className="note-icon"><MapPin size={16} /></span><span><strong>Right around the corner</strong><small>Real spaces in Kozhikode</small></span></div>
          </div>
        </section>

        <section className="search-wrap" aria-label="Search for a space">
          <form className="search-form" onSubmit={submitSearch}>
            <label className="search-field purpose-field"><span>WHAT ARE YOU PLANNING?</span><select value={search.purpose} onChange={(event) => setSearch({ ...search, purpose: event.target.value })}><option>Study session</option><option>Workshop</option><option>Team meeting</option><option>Lecture</option><option>Community event</option><option>Creative meetup</option></select></label>
            <label className="search-field"><span>PEOPLE</span><div className="field-with-icon"><input type="number" min="1" max="100" value={search.people} onChange={(event) => setSearch({ ...search, people: event.target.value })} /><span>people</span></div></label>
            <label className="search-field"><span>UP TO / HOUR</span><div className="field-with-icon"><span>₹</span><input type="number" min="0" value={search.budget} onChange={(event) => setSearch({ ...search, budget: event.target.value })} /></div></label>
            <label className="search-field"><span>WHERE</span><div className="field-with-icon location-input"><MapPin size={15} /><input value={search.location} onChange={(event) => setSearch({ ...search, location: event.target.value })} aria-label="Location" /></div></label>
            <label className="search-field duration-field"><span>HOW LONG?</span><select value={search.duration} onChange={(event) => setSearch({ ...search, duration: event.target.value })}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option><option value="6">Full day</option></select></label>
            <button className="search-submit" type="submit"><Search size={18} /><span>Find a space</span></button>
          </form>
          <div className="search-extras">
            <div className="mode-picker"><span className="extra-label">I AM A</span><div className="segmented"><button className={mode === 'Student' ? 'selected' : ''} onClick={() => setMode('Student')}>Student</button><button className={mode === 'Professional' ? 'selected' : ''} onClick={() => setMode('Professional')}>Working professional</button></div></div>
            <button className={`women-toggle ${onlyWomenSafe ? 'is-active' : ''}`} onClick={() => setOnlyWomenSafe(!onlyWomenSafe)}><span className="toggle-track"><span /></span> Women-safe spaces only <Heart size={14} /></button>
            <div className="resource-picker"><span className="extra-label">I NEED</span><div className="resource-list">{Object.entries(resourceLabels).map(([key, label]) => <button key={key} className={`resource-chip ${selectedResources.includes(key) ? 'is-selected' : ''}`} onClick={() => toggleResource(key)}>{label}</button>)}</div></div>
          </div>
        </section>
        <section className="home-intro">
          <div><span className="eyebrow">A LITTLE MORE ROOM TO DO YOUR THING</span><h2>Space to make<br /><em>something happen.</em></h2></div>
          <p>From a focused study session to a full-room brainstorm, find a place that feels right for what you're making.</p>
        </section>
        <section className="featured-section">
          <div className="section-heading"><div><span className="eyebrow">GOOD THINGS, CLOSE BY</span><h2>A few local favourites</h2></div><button className="text-link" onClick={submitSearch}>Explore all spaces <ArrowRight size={16} /></button></div>
          <div className="featured-grid">{spaces.slice(0, 3).map((space) => <SpaceCard key={space.id} space={space} mode={mode} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div>
        </section>
        <section className="how-section" id="how-it-works">
          <span className="eyebrow">SIMPLE AS MAKING A PLAN</span><h2>Find it. Book it. <em>Make it yours.</em></h2>
          <div className="steps-grid"><div><span>01</span><h3>Tell us what you need</h3><p>A few details help us find your kind of space, in your part of town.</p></div><div><span>02</span><h3>Find your somewhere</h3><p>Compare honest details, local amenities, and what makes each place special.</p></div><div><span>03</span><h3>Make it happen</h3><p>Choose a free time slot and send your booking to the host for confirmation.</p></div></div>
        </section>
        <OwnerCallout onClick={() => setPage('listing')} />
      </main>}

      {page === 'results' && <main className="page-main results-page">
        <div className="breadcrumb"><button onClick={() => setPage('home')}>Home</button><span>/</span><span>Find a space</span></div>
        <div className="results-top"><div><span className="eyebrow">YOUR NEXT SOMEWHERE</span><h1>Spaces in <em>{search.location || 'Kozhikode'}</em></h1><p>{results.length} lovely places for your {search.purpose.toLowerCase()} · {search.people} people · up to {money(Number(search.budget || 0))}/hr</p></div><button className="outline-button" onClick={() => setPage('home')}><SlidersHorizontal size={16} /> Edit search</button></div>
        <div className="results-layout"><aside className="filter-panel"><div className="filter-heading"><span>MAKE IT YOURS</span><button onClick={() => setFilters([])}>Clear</button></div>{[['women', 'Women-friendly only'], ['womenHours', 'Women-only hours'], ['femaleHost', 'Female host or staff'], ['cctv', 'CCTV'], ['transport', 'Near public transport'], ['washroom', 'Washroom on-site'], ['restaurant', 'Restaurant within 5 min']].map(([key, label]) => <label className="filter-option" key={key}><input type="checkbox" checked={filters.includes(key)} onChange={() => toggleFilter(key)} /><span className="custom-check"><Check size={12} /></span>{label}</label>)}<div className="filter-safety"><ShieldCheck size={18} /><span><strong>Your comfort comes first.</strong><small>Look for verified details on every listing.</small></span></div></aside>
          <div className="results-content"><div className="results-toolbar"><span>Sorted for {mode === 'Student' ? 'your study session' : 'your workday'}</span><span><SlidersHorizontal size={14} /> Thoughtful picks</span></div>{results.length ? <div className="results-grid">{results.map((space) => <SpaceCard key={space.id} space={space} mode={mode} selectedResources={selectedResources} currentTime={currentTime} saved={saved.includes(space.id)} onOpen={openDetails} onSave={toggleSaved} />)}</div> : <div className="empty-state"><span>✳</span><h2>No spaces just yet</h2><p>Try a wider budget, a nearby area, or fewer must-haves to see more lovely places.</p><button className="primary-button" onClick={() => { setSelectedResources([]); setFilters([]); setOnlyWomenSafe(false); setSearch({ ...search, budget: '1000', location: 'Kozhikode' }) }}>Show me more spaces</button></div>}</div>
        </div>
      </main>}

      {page === 'detail' && <main className="page-main detail-page">
        <div className="breadcrumb"><button onClick={() => setPage('results')}>Spaces</button><span>/</span><span>{activeSpace.area}</span><span>/</span><span>{activeSpace.name}</span></div>
        <div className="detail-title-row"><div><span className="eyebrow">{activeSpace.area.toUpperCase()} · KOZHIKODE</span><h1>{activeSpace.name}</h1><p><MapPin size={15} /> {activeSpace.area}, Kozhikode <span className="title-separator">·</span> <Star size={14} fill="currentColor" /> {activeSpace.rating} <span className="muted">(loved by local guests)</span></p></div><button className={`outline-button save-detail ${saved.includes(activeSpace.id) ? 'saved' : ''}`} onClick={() => toggleSaved(activeSpace.id)}><Heart size={16} fill={saved.includes(activeSpace.id) ? 'currentColor' : 'none'} /> Save space</button></div>
        <div className="gallery"><img src={activeSpace.photoUrl} alt={activeSpace.name} /><div className="gallery-side"><img src={activeSpace.gallery[0]} alt={`${activeSpace.name} interior`} /><img src={activeSpace.gallery[1]} alt={`${activeSpace.name} seating`} /></div><span className="gallery-count">01 / 03</span></div>
        <div className="detail-layout"><div className="detail-content">
          <div className="detail-highlights"><span><BadgeCheck size={17} /> Verified space</span><span><UsersIcon /> Up to {activeSpace.capacity} people</span><span><Clock3 size={16} /> {activeSpace.seatingType} seating</span></div>
          <section className="detail-section"><span className="eyebrow">A PLACE WITH POSSIBILITIES</span><h2>A little about this space</h2><p className="detail-description">{activeSpace.description}</p><div className="detail-tags"><span>{activeSpace.atmosphere}</span><span>{activeSpace.indoorOutdoor}</span>{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div></section>
          <section className="detail-section"><span className="eyebrow">THE GOOD TO KNOW</span><h2>What you'll find here</h2><div className="amenities-grid">{Object.entries(activeSpace.amenities).filter(([, value]) => value).map(([key]) => <span key={key}><Check size={15} /> {key === 'wifi' ? 'Wi-Fi' : key === 'ac' ? 'Air conditioning' : key === 'fans' ? 'Fans' : key === 'charging' ? 'Charging points' : key[0].toUpperCase() + key.slice(1)}</span>)}</div><div className="resources-box"><h3>More helpful things</h3><div className="resource-detail-grid"><span><Wifi size={15} /> Wi-Fi up to {activeSpace.resources.wifiSpeed}</span><span><Zap size={15} /> {activeSpace.resources.powerSockets} power sockets</span><span><Printer size={15} /> {activeSpace.resources.printerAccess ? 'Printer access' : 'No printer access'}</span><span><Banknote size={15} /> {activeSpace.resources.powerBackup ? 'Power backup' : 'No power backup'}</span><span><Shield size={15} /> {activeSpace.resources.soundproof ? 'Soundproofed' : 'Everyday sounds'}</span><span><Coffee size={15} /> {activeSpace.resources.teaCoffee ? 'Tea & coffee' : 'Bring your own brew'}</span><span><span className="resource-number">{activeSpace.resources.desks}</span> desks</span><span><span className="resource-number">{activeSpace.resources.lockers ? '✓' : '—'}</span> Lockers</span><span><span className="resource-number">{activeSpace.resources.drinkingWater ? '✓' : '—'}</span> Drinking water</span></div></div></section>
          <section className="detail-section"><span className="eyebrow">TIMES THAT WORK</span><h2>When it's free</h2><div className="availability-list">{Object.entries(activeSpace.availability).filter(([, times]) => times.length).map(([day, times]) => <div key={day}><strong>{day}</strong><span>{times.join(' · ')}</span></div>)}</div></section>
          <section className="detail-section safety-section"><span className="eyebrow">YOUR COMFORT MATTERS</span><h2>Safety checklist</h2><div className="safety-rating"><span><Star size={19} fill="currentColor" /> {activeSpace.safety.safetyRating} <small>Women reviewers' safety rating</small></span>{isWomenFriendly(activeSpace) && <span className="women-badge"><Heart size={13} /> Women-friendly</span>}</div><div className="safety-check-grid">{[['CCTV on site', activeSpace.safety.cctv], ['Well-lit space', activeSpace.safety.wellLit], ['Secured entry', activeSpace.safety.securedEntry], ['Owner ID verified', activeSpace.safety.ownerIdVerified], ['Female host or staff', activeSpace.safety.femaleHostOrStaff], ['Busy, populated area', activeSpace.safety.busyArea], ['Near public transport', activeSpace.safety.nearPublicTransport]].map(([label, yes]) => <span key={label} className={yes ? 'yes' : 'no'}>{yes ? <Check size={15} /> : <X size={15} />}{label}</span>)}</div>{activeSpace.safety.womenOnlyHours && <div className="women-hours"><Heart size={15} /> Women-only hours: {activeSpace.safety.womenOnlyHours}</div>}</section>
          <section className="detail-section washroom-section"><span className="eyebrow">THE LITTLE ESSENTIALS</span><h2>Washroom</h2><div className="washroom-grid"><span><Check size={15} /> {activeSpace.washroom.onSite ? 'On-site washroom' : 'No on-site washroom'}</span><span>{activeSpace.washroom.separateForWomen ? <Check size={15} /> : <X size={15} />} Separate for women</span><span>{activeSpace.washroom.accessible ? <Check size={15} /> : <X size={15} />} Step-free accessible</span><span><Star size={15} fill="currentColor" /> {activeSpace.washroom.cleanlinessRating} cleanliness</span></div></section>
          <section className="detail-section nearby-section"><span className="eyebrow">AROUND THE CORNER</span><h2>Nearby</h2><NearbyList nearby={activeSpace.nearby} /></section>
          <button className="report-button" onClick={() => setReporting(!reporting)}><Shield size={15} /> Report this space</button>{reporting && <form className="report-form" onSubmit={(event) => { event.preventDefault(); setReporting(false); setNotice(`Thank you. Your report about "${reportReason.toLowerCase()}" has been noted for review.`) }}><label htmlFor="report-reason">What would you like to report?</label><select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value)}><option>Inaccurate listing details</option><option>Safety concern</option><option>Inappropriate content</option><option>Other</option></select><button className="primary-button" type="submit">Submit report</button></form>}
        </div><aside className="booking-card"><div className="booking-price"><strong>{money(activeSpace.pricePerHour)}</strong><span> / hour</span></div><div className="booking-rating"><Star size={14} fill="currentColor" /> {activeSpace.rating} <span>· {activeSpace.area}</span></div><div className="booking-card-note"><BadgeCheck size={16} /> Free to request. Pay your host directly.</div><button className="primary-button full-button" onClick={startBooking}>Book this space <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Your booking starts pending host confirmation.</p><div className="card-last-updated"><Clock3 size={14} /> Availability updated {daysAgo(activeSpace.lastUpdated, currentTime)} days ago</div></aside></div>
      </main>}

      {page === 'booking' && <main className="page-main booking-page"><button className="back-link" onClick={() => setPage('detail')}><ArrowLeft size={16} /> Back to space</button><div className="booking-page-heading"><span className="eyebrow">A GOOD PLAN, IN THE MAKING</span><h1>Book your <em>somewhere.</em></h1><p>Choose a day and time that works for you.</p></div><div className="booking-layout"><section className="booking-form-card"><label className="form-label">PICK A DAY<input className="date-input" type="date" min={minimumDate} value={date} onChange={(event) => { setDate(event.target.value); setSlot('') }} /></label><span className="form-label">FREE TIME SLOTS · {dayLabel.toUpperCase()}</span>{availableSlots.length ? <div className="slot-grid">{availableSlots.map((time) => <button key={time} className={`slot-button ${slot === time ? 'selected' : ''}`} onClick={() => { setSlot(time); setHours((current) => Math.min(current, slotDuration(time))) }}><Clock3 size={15} /> {time}</button>)}</div> : <div className="no-slots">No free slots on this day. Try another date.</div>}<label className="form-label hours-label">HOW MANY HOURS?<div className="stepper"><button aria-label="Decrease hours" onClick={() => setHours(Math.max(1, hours - 1))}><Minus size={15} /></button><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong><button aria-label="Increase hours" disabled={hours >= maxBookingHours} onClick={() => setHours(Math.min(maxBookingHours, hours + 1))}><Plus size={15} /></button></div></label>{slot && slotEndsAfterEight(slot, hours) && <div className="late-warning"><Clock3 size={17} /><span><strong>Getting home late?</strong> This slot ends after 8pm. Please plan a safe journey back.</span></div>}<div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Keep someone in the loop</strong><small>Share your booking details with a trusted contact.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="booking-summary"><span className="eyebrow">YOUR PLAN</span><div className="summary-space"><img src={activeSpace.photoUrl} alt="" /><span><strong>{activeSpace.name}</strong><small><MapPin size={12} /> {activeSpace.area}, Kozhikode</small></span></div><div className="summary-line"><span>Date</span><strong>{dayLabel}</strong></div><div className="summary-line"><span>Time</span><strong>{slot || 'Choose a time slot'}</strong></div><div className="summary-line"><span>Duration</span><strong>{hours} {hours === 1 ? 'hour' : 'hours'}</strong></div><div className="summary-total"><span>Total</span><strong>{money(activeSpace.pricePerHour * hours)}</strong></div><button className="primary-button full-button" onClick={confirmBooking} disabled={!slot}>Request to book <ArrowRight size={16} /></button><p className="booking-card-fine">No payment now. Your booking will be pending owner confirmation.</p></aside></div></main>}

      {page === 'confirmation' && booking && <main className="page-main confirmation-page"><div className="confirmation-top"><span className="confirmation-icon"><Check size={28} /></span><span className="eyebrow">YOUR PLAN IS IN MOTION</span><h1>Good things <em>start here.</em></h1><p>Your booking request has been sent to the host.</p><span className="pending-pill"><Clock3 size={14} /> Pending owner confirmation</span></div><div className="confirmation-layout"><section className="confirmed-card"><div className="summary-space"><img src={booking.space.photoUrl} alt="" /><span><strong>{booking.space.name}</strong><small><MapPin size={12} /> {booking.space.area}, Kozhikode</small></span></div><div className="confirmed-details"><div><span>DATE</span><strong>{new Date(`${booking.date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div><div><span>TIME</span><strong>{booking.slot}</strong></div><div><span>DURATION</span><strong>{booking.hours} {booking.hours === 1 ? 'hour' : 'hours'}</strong></div><div><span>TOTAL</span><strong>{money(booking.total)}</strong></div></div><div className="trusted-share"><span className="trusted-icon"><ShieldCheck size={18} /></span><span><strong>Share with someone you trust</strong><small>Let them know where you'll be.</small></span><button onClick={() => setNotice('Booking details ready to share with your trusted contact (mock).')}>Share <ArrowUpRight size={14} /></button></div></section><aside className="safety-card"><div className="safety-card-heading"><ShieldCheck size={19} /><span><strong>Here for your peace of mind</strong><small>A few helpful things to have close.</small></span></div><div className="safety-tip"><strong>A little safety checklist</strong><p>Share your plans with someone you trust, keep your phone charged, and confirm your return trip before you go.</p></div><div className="emergency-box"><span>NEED HELP?</span><div><a href="tel:112">112 <small>Emergency</small></a><a href="tel:181">181 <small>Women's helpline</small></a></div></div><button className="location-share" onClick={() => setNotice('Live location sharing is a demo feature and is not active.') }><MapPin size={15} /> Share live location <span>MOCK</span></button></aside></div><div className="confirmation-actions"><button className="primary-button" onClick={() => setPage('home')}>Back to exploring <Compass size={16} /></button><button className="text-link" onClick={() => { setSearch({ ...search, location: booking.space.area }); setPage('results') }}>Find another space <ArrowRight size={15} /></button></div></main>}

      {page === 'listing' && <main className="page-main listing-page"><div className="listing-hero"><span className="eyebrow">MAKE ROOM FOR SOMETHING GOOD</span><h1>Your space could<br />be someone's <em>somewhere.</em></h1><p>Share your underused room, rooftop, or little corner with people who could make something wonderful there.</p><div className="listing-stats"><span><Check size={15} /> Free to list</span><span><Check size={15} /> You choose when</span><span><Check size={15} /> Local community</span></div></div>{notice && <div className="success-notice"><Check size={17} />{notice}<button onClick={() => setNotice('')}><X size={15} /></button></div>}<form className="listing-form" onSubmit={submitListing}>      <div className="listing-form-heading"><span className="eyebrow">LET'S GET TO KNOW YOUR SPACE</span><h2>Start with the details</h2><p>Tell us a little about what you're sharing. You can add more later.</p></div><div className="listing-fields"><label>SPACE NAME<input required placeholder="e.g. The little library room" /></label><label>AREA IN KOZHIKODE<input required placeholder="e.g. Nadakkavu" /></label><label>CAPACITY<input required type="number" min="1" placeholder="How many people?" /></label><label>PRICE PER HOUR (₹)<input required type="number" min="1" placeholder="e.g. 400" /></label><label className="wide-field">PHOTO URLS<input type="text" placeholder="Add photo links, separated by commas" /></label><label className="wide-field">TELL US ABOUT IT<textarea rows="3" placeholder="What makes your space a lovely place to meet?" /></label></div><div className="listing-subsection"><h3>What can guests use?</h3><div className="listing-checks">{['Wi-Fi', 'Charging', 'Air conditioning', 'Fans', 'Projector', 'Whiteboard', 'Step-free access'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><div className="listing-subsection"><h3>Helpful resources</h3><div className="listing-checks">{['Desks', 'Printer access', 'Power backup', 'Soundproofing', 'Lockers', 'Drinking water', 'Tea or coffee'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div><div className="listing-fields"><label>NUMBER OF POWER SOCKETS<input type="number" min="0" placeholder="e.g. 12" /></label><label>WI-FI SPEED<input placeholder="e.g. 50 Mbps" /></label></div></div><div className="listing-subsection"><h3>When is it free?</h3><p>For now, tell us your usual availability. You'll confirm each booking request.</p><div className="listing-fields"><label>FREE DAYS<input placeholder="e.g. Monday to Friday" /></label><label>FREE HOURS<input placeholder="e.g. 2pm to 6pm" /></label><label>WOMEN-ONLY HOURS <span className="optional">(optional)</span><input placeholder="e.g. Saturdays, 10am to 2pm" /></label><label>WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>On-site, separate for women</option><option>On-site, shared</option><option>Not on-site</option></select></label><label>SEPARATE WASHROOM FOR WOMEN<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label><label>ACCESSIBLE WASHROOM<select defaultValue=""><option value="" disabled>Choose one</option><option>Yes</option><option>No</option></select></label></div></div><div className="listing-subsection"><h3>Help guests feel comfortable</h3><div className="listing-checks">{['CCTV', 'Well-lit space', 'Secured entry', 'Female host or staff', 'Busy area', 'Near public transport', 'Owner ID verified'].map((item) => <label key={item}><input type="checkbox" /> {item}</label>)}</div></div><button className="primary-button listing-submit" type="submit">Send your space for review <ArrowRight size={16} /></button><p className="listing-disclaimer"><ShieldCheck size={14} /> Your listing will be reviewed before it appears on EmptySpace.</p></form></main>}

      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark"><span /><span /><span /></span><span>empty<span className="brand-light">space</span></span></div><span>More room for good things. Made for Kozhikode.</span><span>© 2025 EmptySpace</span></footer>
      {notice && page !== 'listing' && <div className="toast" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
    </div>
  )
}

function UsersIcon() {
  return <span className="users-icon">↗</span>
}

function SpaceCard({ space, mode, selectedResources = [], currentTime, saved, onOpen, onSave }) {
  const womenFriendly = space.safety.cctv && space.safety.wellLit && space.safety.securedEntry && space.safety.ownerIdVerified
  const cafe = space.nearby.find((item) => item.type === 'cafe' || item.type === 'restaurant')
  const requested = selectedResources.map((key) => resourceLabels[key])
  const reason = requested.length
    ? `Has your requested ${requested.join(', ')}.`
    : mode === 'Student'
      ? `${space.atmosphere === 'quiet' ? 'A quiet spot' : 'A welcoming spot'} with ${space.amenities.wifi ? 'Wi-Fi' : 'room to focus'} and ${space.nearby.some((item) => item.type === 'print shop') ? 'a print shop' : 'local cafés'} nearby.`
      : `${space.amenities.ac ? 'Cool, comfortable' : 'Bright, flexible'} space with ${space.resources.powerBackup ? 'power backup' : 'reliable essentials'} for your next work session.`
  const updatedDays = daysAgo(space.lastUpdated, currentTime)
  return <article className="space-card"><div className="card-image-wrap" onClick={() => onOpen(space)}><img src={space.photoUrl} alt={space.name} loading="lazy" /><div className="card-badges">{space.verified && <span className="verified-badge"><BadgeCheck size={12} /> Verified</span>}{womenFriendly && <span className="women-badge"><Heart size={12} /> Women-friendly</span>}</div><button className={`save-button ${saved ? 'is-saved' : ''}`} aria-label={saved ? 'Remove from saved spaces' : 'Save space'} onClick={(event) => { event.stopPropagation(); onSave(space.id) }}><Heart size={16} fill={saved ? 'currentColor' : 'none'} /></button></div><div className="card-content"><div className="card-title-row" onClick={() => onOpen(space)}><div><h3>{space.name}</h3><span className="card-location"><MapPin size={12} /> {space.area}</span></div><span className="card-rating"><Star size={13} fill="currentColor" /> {space.rating}</span></div><div className="card-meta"><span><UsersIcon /> {space.capacity} guests</span><span>{space.seatingType}</span><span>{space.atmosphere}</span></div><div className="card-amenities">{Object.entries(space.amenities).filter(([, value]) => value).slice(0, 4).map(([key]) => <span key={key} title={key}>{key === 'wifi' ? <Wifi size={14} /> : key === 'charging' ? <Zap size={14} /> : key === 'projector' ? <ArrowUpRight size={14} /> : <Sparkles size={14} />}</span>)}</div><p className="why-fit"><Sparkles size={13} /> {reason}</p><div className="card-local-chips">{space.washroom.onSite && <span>Washroom on-site</span>}{cafe && <span><Coffee size={11} /> {cafe.type === 'cafe' ? 'Cafe' : cafe.type === 'restaurant' ? 'Restaurant' : 'Cafe'} {cafe.walkingMinutes} min walk</span>}{mode === 'Student' ? <span className="study-badge">Study-friendly</span> : <span className="work-badge">Work-ready</span>}</div><div className="card-footer"><span><Clock3 size={12} /> Availability updated {updatedDays} {updatedDays === 1 ? 'day' : 'days'} ago</span><strong>{money(space.pricePerHour)}<small> / hr</small></strong></div><button className="card-open-button" aria-label={`View ${space.name}`} onClick={() => onOpen(space)}>View space <ArrowRight size={14} /></button></div></article>
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

export default App
