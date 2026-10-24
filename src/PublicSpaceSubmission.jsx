import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, MapPin, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { appCheckConfigured, firebaseConfigured, firebaseEmulatorsEnabled, firebaseMissingConfig } from './firebase.js'
import { firebaseErrorMessage } from './firebaseErrorMessage.js'
import { submitSpaceProposal } from './services/spaceProposals.js'
import { evaluateSpaceSubmission } from './services/submissionCriteria.js'
import './App.css'

const districts = [
  'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam',
  'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta',
  'Thiruvananthapuram', 'Thrissur', 'Wayanad',
]
const categories = ['Room', 'Hall', 'Rooftop', 'Cafe corner', 'Studio', 'Other']
const activities = [
  'Study session', 'Group study', 'Exam preparation', 'Online classes',
  'Project work', 'Remote work', 'Team meetings', 'Client meetings',
  'Workshops', 'Interviews',
]
const amenities = [
  ['wifi', 'Wi-Fi'], ['charging', 'Charging'], ['ac', 'Air conditioning'],
  ['fans', 'Fans'], ['projector', 'Projector'], ['whiteboard', 'Whiteboard'],
  ['stepFreeAccess', 'Step-free access'],
]
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const latestConfirmationDate = new Date().toISOString().slice(0, 10)

function proposalFromForm(form) {
  const privateBooking = form.get('privateBooking') === 'on'
  const hourlyPriceInput = String(form.get('hourlyPrice') || '').trim()
  const freeHours = String(form.get('freeHours') || '').trim()
  const availabilityDays = form.getAll('availabilityDays')
  const availability = Object.fromEntries(availabilityDays.map((day) => [day, freeHours ? [freeHours] : []]))
  const evidenceUrls = String(form.get('evidenceUrls') || '')
    .split(/\r?\n|,/)
    .map((url) => url.trim())
    .filter(Boolean)

  return {
    name: String(form.get('name') || '').trim(),
    category: String(form.get('category') || ''),
    spaceType: String(form.get('spaceType') || ''),
    description: String(form.get('description') || '').trim(),
    state: String(form.get('state') || ''),
    district: String(form.get('district') || ''),
    locality: String(form.get('locality') || '').trim(),
    address: String(form.get('address') || '').trim(),
    latitude: Number(form.get('latitude')),
    longitude: Number(form.get('longitude')),
    permittedActivities: form.getAll('activities'),
    accessInformation: String(form.get('accessInformation') || '').trim(),
    capacity: Number(form.get('capacity')),
    privateBooking,
    hourlyPrice: privateBooking && hourlyPriceInput ? Number(hourlyPriceInput) : null,
    openingHours: String(form.get('openingHours') || '').trim(),
    availability,
    lastConfirmedAt: String(form.get('lastConfirmedAt') || ''),
    amenities: Object.fromEntries(amenities.map(([key]) => [key, form.getAll('amenities').includes(key)])),
    resources: {
      desks: Number(form.get('desks') || 0),
      powerSockets: Number(form.get('powerSockets') || 0),
    },
    seatingType: String(form.get('seatingType') || ''),
    atmosphere: String(form.get('atmosphere') || ''),
    indoorOutdoor: String(form.get('indoorOutdoor') || ''),
    evidenceUrls,
  }
}

export default function PublicSpaceSubmission() {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [failure, setFailure] = useState('')
  const [confirmation, setConfirmation] = useState(null)
  const [spaceType, setSpaceType] = useState('private')
  const [privateBooking, setPrivateBooking] = useState(true)
  const submissionDisabled = busy || !firebaseConfigured || (!appCheckConfigured && !firebaseEmulatorsEnabled)
  const submissionDisabledReason = busy
    ? 'Your proposal is being sent.'
    : !firebaseConfigured
      ? `Add the missing Firebase settings to the project-root .env.local file: ${firebaseMissingConfig.join(', ')}.`
      : !appCheckConfigured && !firebaseEmulatorsEnabled
        ? 'Configure Firebase App Check with VITE_FIREBASE_APP_CHECK_SITE_KEY, or use the Firebase emulators for local development.'
        : ''

  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    const proposal = proposalFromForm(new FormData(formElement))
    const criteria = evaluateSpaceSubmission(proposal)
    setErrors(criteria.errors)
    setFailure('')
    setConfirmation(null)
    if (!criteria.passed) {
      formElement.reportValidity()
      return
    }
    setBusy(true)
    try {
      const result = await submitSpaceProposal(proposal)
      formElement.reset()
      setSpaceType('private')
      setPrivateBooking(true)
      setConfirmation(result)
    } catch (submitError) {
      setErrors(submitError.validationErrors || submitError.details?.errors || [])
      setFailure(firebaseErrorMessage(submitError, 'The proposal could not be submitted. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="app-shell">
    <header className="site-header proposal-header">
      <Link className="brand" to="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>empty<span className="brand-light">space</span></span></Link>
      <Link className="header-action" to="/owner">Owner sign in <ArrowRight size={15} /></Link>
    </header>
    <main className="portal-main proposal-main">
      <Link className="portal-back-link" to="/"><ArrowLeft size={14} /> Back to EmptySpace</Link>
      <div className="portal-heading"><span className="eyebrow">SHARE A PLACE WITH THE COMMUNITY</span><h1>Suggest a space</h1></div>
      <div className="portal-notice"><ShieldCheck size={18} /><span><strong>A proposal is not a vacancy confirmation.</strong> Every submission is reviewed before it can appear in public search. Submitting does not prove that a place exists, is empty, safe, or legally available for use.</span></div>
      {!firebaseConfigured && <div className="portal-notice" role="alert"><strong>Firebase settings are missing.</strong><span>Add {firebaseMissingConfig.map((name) => <code key={name}>{name} </code>)} to <code>.env.local</code> in the project root, then restart Vite.</span></div>}
      {firebaseConfigured && !appCheckConfigured && !firebaseEmulatorsEnabled && <div className="portal-notice" role="alert"><strong>Submission protection needs setup.</strong><span>Public proposals are blocked until Firebase App Check is configured. Add the App Check reCAPTCHA v3 site key as <code>VITE_FIREBASE_APP_CHECK_SITE_KEY</code> in the root <code>.env.local</code>, then restart Vite. Local emulator testing is also supported.</span></div>}
      {failure && <p className="portal-error" role="alert">{failure}</p>}
      {errors.length > 0 && <div className="portal-error" role="alert"><strong>Please fix the following:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
      {confirmation && <div className="portal-success" role="status"><strong>Proposal received for review.</strong><p>Reference: <code>{confirmation.submissionId}</code></p><p>Status: pending. No listing has been published or marked vacant.</p>{confirmation.criteriaCheck?.warnings?.map((warning) => <p key={warning}>{warning}</p>)}</div>}

      <form className="portal-card proposal-form" onSubmit={submit}>
        <fieldset className="proposal-section">
          <legend>SPACE DETAILS</legend>
          <div className="portal-form-grid">
            <label>SPACE NAME<input name="name" minLength="3" maxLength="120" required /></label>
            <label>SPACE CATEGORY<select name="category" defaultValue="" required><option value="" disabled>Choose a category</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="portal-wide-field">SHORT DESCRIPTION<textarea name="description" minLength="20" maxLength="1000" rows="3" required placeholder="Describe the space and what someone can do there." /></label>
            <fieldset className="portal-wide-field proposal-type"><legend>SPACE TYPE</legend><div className="proposal-type-options">
              {[
                ['public', 'Public', 'Shared or publicly accessible'],
                ['private', 'Private', 'A private property or exclusive-use space'],
              ].map(([value, label, description]) => <label key={value} className={`space-type-choice ${spaceType === value ? 'selected' : ''}`}>
                <input type="radio" name="spaceType" value={value} checked={spaceType === value} onChange={() => { setSpaceType(value); if (value === 'public') setPrivateBooking(false) }} />
                <span className="space-type-copy"><strong>{label}</strong><small>{description}</small></span>{spaceType === value && <Check size={15} aria-hidden="true" />}
              </label>)}
            </div></fieldset>
          </div>
        </fieldset>

        <fieldset className="proposal-section">
          <legend>LOCATION</legend>
          <div className="portal-form-grid">
            <label>STATE<select name="state" defaultValue="Kerala" required><option>Kerala</option></select></label>
            <label>DISTRICT<select name="district" defaultValue="" required><option value="" disabled>Select a district</option>{districts.map((district) => <option key={district}>{district}</option>)}</select></label>
            <label>LOCALITY<input name="locality" minLength="2" maxLength="100" required /></label>
            <label>ADDRESS<input name="address" minLength="5" maxLength="300" autoComplete="street-address" required /></label>
            <label>LATITUDE<input name="latitude" type="number" min="8" max="13" step="any" placeholder="From a map pin" required /></label>
            <label>LONGITUDE<input name="longitude" type="number" min="74" max="78" step="any" placeholder="From a map pin" required /></label>
          </div>
          <p className="proposal-help"><MapPin size={14} /> Open a map, place or select a pin at the property, then copy its coordinates. Exact address and coordinates are visible to reviewers only, not public visitors.</p>
        </fieldset>

        <fieldset className="proposal-section">
          <legend>ACCESS AND FACILITIES</legend>
          <div className="portal-form-grid">
            <label>CAPACITY<input name="capacity" type="number" min="1" max="1000" step="1" required /></label>
            <label>SEATING TYPE<select name="seatingType" defaultValue=""><option value="">Not specified</option>{['Classroom', 'Meeting style', 'Cafe style', 'Flexible', 'Floor seating', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>ATMOSPHERE<select name="atmosphere" defaultValue=""><option value="">Not specified</option><option value="quiet">Quiet</option><option value="lively">Lively</option><option value="outdoor">Outdoor</option></select></label>
            <label>SETTING<select name="indoorOutdoor" defaultValue=""><option value="">Not specified</option><option>Indoor</option><option>Outdoor</option><option>Indoor and outdoor</option></select></label>
            <label className="portal-wide-field">ACCESS INFORMATION AND RESTRICTIONS<textarea name="accessInformation" maxLength="500" rows="2" required placeholder="Who can access the space? Note opening conditions or restrictions." /></label>
            <label>NUMBER OF DESKS<input name="desks" type="number" min="0" defaultValue="0" /></label>
            <label>POWER SOCKETS<input name="powerSockets" type="number" min="0" defaultValue="0" /></label>
          </div>
          <fieldset className="portal-check-group"><legend>PERMITTED ACTIVITIES</legend><div className="portal-check-grid">{activities.map((activity) => <label key={activity}><input type="checkbox" name="activities" value={activity} />{activity}</label>)}</div></fieldset>
          <fieldset className="portal-check-group"><legend>FACILITIES</legend><div className="portal-check-grid">{amenities.map(([key, label]) => <label key={key}><input type="checkbox" name="amenities" value={key} />{label}</label>)}</div></fieldset>
        </fieldset>

        <fieldset className="proposal-section">
          <legend>AVAILABILITY AND PRICE</legend>
          <div className="portal-form-grid">
            <label>OPENING HOURS OR ACCESS ARRANGEMENT<input name="openingHours" maxLength="200" required placeholder="e.g. 9am–6pm, or access by arrangement" /></label>
            <label>AVAILABLE HOURS<input name="freeHours" required placeholder="e.g. 2pm–6pm, or not confirmed" /></label>
            <label>AVAILABILITY LAST CONFIRMED<input name="lastConfirmedAt" type="date" max={latestConfirmationDate} required /></label>
          </div>
          <fieldset className="portal-check-group"><legend>USUALLY AVAILABLE DAYS</legend><div className="portal-check-grid">{days.map((day) => <label key={day}><input type="checkbox" name="availabilityDays" value={day} />{day}</label>)}</div></fieldset>
          {spaceType === 'private' && <label className="proposal-booking-toggle"><input name="privateBooking" type="checkbox" checked={privateBooking} onChange={(event) => setPrivateBooking(event.target.checked)} /> This space is intended for paid private booking</label>}
          {privateBooking && <div className="portal-form-grid"><label>HOURLY PRICE (₹)<input name="hourlyPrice" type="number" min="1" max="1000000" step="1" required /></label></div>}
          <p className="proposal-help">Availability is submitter-declared and must be confirmed during review. It does not represent live occupancy.</p>
        </fieldset>

        <fieldset className="proposal-section">
          <legend>EVIDENCE FOR REVIEW</legend>
          <label className="proposal-evidence-label">EVIDENCE OR IMAGE LINKS <span className="optional">(optional, HTTPS links only)</span><textarea name="evidenceUrls" rows="2" placeholder="One HTTPS link per line. Do not include identity documents or private contact details." /></label>
          <p className="proposal-help">Secure image upload is not configured yet. This only means photos cannot be uploaded here; it does not disable proposal submission. Evidence links are private to authorized reviewers and will not be copied to the public listing.</p>
          <div className="proposal-privacy"><ShieldCheck size={16} /><span>No submitter email, phone number, or address book contact is collected. If signed in, Firebase associates your UID; otherwise the server creates a random submission identifier.</span></div>
        </fieldset>

        <button className="primary-button portal-submit" type="submit" disabled={submissionDisabled}>{busy ? 'Sending for review…' : 'Submit space for review'} <ArrowRight size={16} /></button>
        {submissionDisabledReason && <p className="portal-error" role="status">{submissionDisabledReason}</p>}
        <p className="proposal-submit-note">Submitting does not publish the space. An authorized administrator reviews the details and evidence separately.</p>
      </form>
    </main>
  </div>
}
