import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { getIdTokenResult } from 'firebase/auth'
import {
  ArrowLeft, ArrowRight, Check, LockKeyhole, LogOut, MapPin,
  RefreshCw, ShieldCheck, UploadCloud,
} from 'lucide-react'
import { auth, firebaseConfigured, firebaseMissingConfig } from './firebase.js'
import { firebaseErrorMessage } from './firebaseErrorMessage.js'
import { deleteSpacePhoto, uploadSpacePhoto } from './services/spacePhotos.js'
import { MAX_SPACE_PHOTOS, validateSpacePhoto } from './utils/imageFiles.js'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  createOwnerProfile,
  getAdminApprovedSpaces,
  getAdminPublicPlaces,
  getSpaceSubmissionsForReview,
  getSpaceSubmissionReviewHistory,
  getOwnSubmissions,
  getPendingSubmissions,
  getReportFlags,
  getVerificationRecords,
  removePublicPlace,
  reviewSubmission,
  reviewReportFlag,
  reviewSpaceSubmission,
  saveOwnerAvailability,
  submitOwnerProperty,
  updatePendingSubmission,
  updatePendingSubmissionPhotos,
} from './services/firestore.js'
import { importOsmPublicPlaces } from './services/publicPlaceImport.js'
import './App.css'

const districts = [
  'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam',
  'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta',
  'Thiruvananthapuram', 'Thrissur', 'Wayanad',
]
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const activities = [
  'Study session', 'Group study', 'Exam preparation', 'Online classes',
  'Project work', 'Remote work', 'Team meetings', 'Client meetings',
  'Workshops', 'Interviews',
]
const amenityOptions = [
  ['wifi', 'Wi-Fi'], ['charging', 'Charging'], ['ac', 'Air conditioning'],
  ['fans', 'Fans'], ['projector', 'Projector'], ['whiteboard', 'Whiteboard'],
  ['stepFreeAccess', 'Step-free access'],
]
const resourceOptions = [
  ['printerAccess', 'Printer access'], ['powerBackup', 'Power backup'],
  ['soundproof', 'Soundproofing'], ['lockers', 'Lockers'],
  ['drinkingWater', 'Drinking water'], ['teaCoffee', 'Tea or coffee'],
]
const safetyOptions = [
  ['cctv', 'CCTV'], ['wellLit', 'Well-lit space'], ['securedEntry', 'Secured entry'],
  ['femaleHostOrStaff', 'Female host or staff'], ['busyArea', 'Busy area'],
  ['nearPublicTransport', 'Near public transport'],
]
const defaultSchedule = (availability = {}) => ({
  days: Object.keys(availability).filter((day) => availability[day]?.length),
  hours: Object.values(availability).flat()[0] || '',
})

function PortalShell({ children, eyebrow, title, user, onSignOut }) {
  return <div className="app-shell">
    <header className="site-header portal-header">
      <a className="brand" href="/"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>empty<span className="brand-light">space</span></span></a>
      <div className="portal-header-actions">
        {user && <span className="portal-account">{user.email}</span>}
        {user && <button className="outline-button portal-signout" onClick={onSignOut}><LogOut size={15} /> Sign out</button>}
      </div>
    </header>
    <main className="portal-main">
      <a className="portal-back-link" href="/"><ArrowLeft size={14} /> Public website</a>
      <div className="portal-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></div>
      {children}
    </main>
  </div>
}

function FirebaseNotice() {
  return <div className="portal-notice" role="alert">
    <strong>Firebase is not configured yet.</strong>
    <span>Copy <code>.env.example</code> to <code>.env.local</code> in the project root, fill in these missing settings from your Firebase web app, then restart Vite: <code>{firebaseMissingConfig.join(', ')}</code>.</span>
  </div>
}

function AuthCard({ onAuthenticated, error, setError, allowRegistration }) {
  const [formMode, setFormMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [sentReset, setSentReset] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSentReset(false)
    const values = new FormData(event.currentTarget)
    const email = String(values.get('email') || '').trim()
    const password = String(values.get('password') || '')
    try {
      if (formMode === 'reset') {
        await sendPasswordResetEmail(auth, email)
        setSentReset(true)
      } else if (formMode === 'register') {
        const result = await createUserWithEmailAndPassword(auth, email, password)
        await createOwnerProfile(result.user)
        await sendEmailVerification(result.user)
        setFormMode('signin')
        setError('Account created. Check your inbox and verify your email before sending a property for review.')
        await onAuthenticated?.(result.user)
      } else {
        const credential = await signInWithEmailAndPassword(auth, email, password)
        await onAuthenticated?.(credential.user)
      }
    } catch (requestError) {
      setError(firebaseErrorMessage(requestError, 'Firebase could not complete this request.'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-auth-card">
    <div className="portal-auth-icon"><LockKeyhole size={19} /></div>
    <span className="eyebrow">{allowRegistration ? 'OWNER ACCOUNT' : 'RESTRICTED ADMIN AREA'}</span>
    <h2>{formMode === 'register' ? 'Create your owner account' : formMode === 'reset' ? 'Reset your password' : 'Sign in securely'}</h2>
    <p>{allowRegistration
      ? 'Use your own email and private password. Your Firebase user ID is attached to your submissions; a new account never receives administrator privileges.'
      : 'Sign in with an account whose administrator custom claim was assigned through a trusted server-side process.'}</p>
    <form className="portal-auth-form" onSubmit={submit}>
      <label>Email address<input type="email" name="email" autoComplete="email" required /></label>
      {formMode !== 'reset' && <label>Password<input type="password" name="password" minLength="8" autoComplete={formMode === 'register' ? 'new-password' : 'current-password'} required /></label>}
      {formMode === 'register' && <small>Use at least 8 characters. EmptySpace cannot see your password.</small>}
      {!firebaseConfigured && <p className="portal-error" role="status">Sign-in is disabled because Firebase settings are missing from the project-root <code>.env.local</code> file. Missing: {firebaseMissingConfig.join(', ')}.</p>}
      <button className="primary-button" type="submit" disabled={busy || !firebaseConfigured}>
        {busy ? 'Please wait…' : formMode === 'register' ? 'Create owner account' : formMode === 'reset' ? 'Send reset email' : 'Sign in'}
        <ArrowRight size={15} />
      </button>
    </form>
    {sentReset && <p className="portal-success" role="status">If an account exists for that email, Firebase sent a password-reset link.</p>}
    {error && <p className={error.startsWith('Account created') ? 'portal-success' : 'portal-error'} role="alert">{error}</p>}
    {allowRegistration && <div className="portal-auth-links">
      {formMode === 'signin' && <><button type="button" onClick={() => setFormMode('register')}>Create owner account</button><button type="button" onClick={() => setFormMode('reset')}>Forgot password?</button></>}
      {formMode !== 'signin' && <button type="button" onClick={() => { setFormMode('signin'); setError('') }}>Back to sign in</button>}
    </div>}
    {!allowRegistration && formMode !== 'signin' && <button type="button" className="portal-text-button" onClick={() => setFormMode('signin')}>Back to admin sign in</button>}
  </section>
}

function value(form, name) {
  return form.get(name)
}

function listingFromForm(form) {
  const selectedDays = form.getAll('days')
  const freeHours = String(value(form, 'freeHours') || '').trim()
  const availability = Object.fromEntries(selectedDays.map((day) => [day, freeHours ? [freeHours] : []]))
  const amenityKeys = amenityOptions.map(([key]) => key)
  const resourceKeys = resourceOptions.map(([key]) => key)
  const safetyKeys = safetyOptions.map(([key]) => key)
  return {
    name: String(value(form, 'name') || '').trim(),
    description: String(value(form, 'description') || '').trim(),
    spaceType: 'private',
    category: String(value(form, 'category') || ''),
    permittedActivities: form.getAll('activities'),
    state: 'Kerala',
    district: String(value(form, 'district') || ''),
    locality: String(value(form, 'locality') || '').trim(),
    address: String(value(form, 'address') || '').trim(),
    latitude: Number(value(form, 'latitude')),
    longitude: Number(value(form, 'longitude')),
    capacity: Number(value(form, 'capacity')),
    pricePerHour: Number(value(form, 'pricePerHour')),
    amenities: Object.fromEntries(amenityKeys.map((key) => [key, form.getAll('amenities').includes(key)])),
    resources: {
      desks: Number(value(form, 'desks') || 0),
      powerSockets: Number(value(form, 'powerSockets') || 0),
      wifiSpeed: String(value(form, 'wifiSpeed') || '').trim() || 'Unknown',
      ...Object.fromEntries(resourceKeys.map((key) => [key, form.getAll('resources').includes(key)])),
    },
    seatingType: String(value(form, 'seatingType') || ''),
    atmosphere: String(value(form, 'atmosphere') || ''),
    indoorOutdoor: String(value(form, 'indoorOutdoor') || ''),
    images: [],
    photos: [],
    photoUrl: '',
    openingHours: String(value(form, 'openingHours') || '').trim(),
    availability,
    safety: {
      ...Object.fromEntries(safetyKeys.map((key) => [key, form.getAll('safety').includes(key)])),
      ownerIdVerified: false,
      womenOnlyHours: String(value(form, 'womenOnlyHours') || '').trim(),
    },
    washroom: {
      onSite: form.getAll('washroom').includes('onSite'),
      separateForWomen: form.getAll('washroom').includes('separateForWomen'),
      accessible: form.getAll('washroom').includes('accessible'),
      cleanlinessRating: null,
    },
  }
}

function OwnerPropertyForm({ user, onSubmitted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [photos, setPhotos] = useState([])
  const [photoConsent, setPhotoConsent] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photosRef = useRef([])
  const submissionIdRef = useRef(null)

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
  }, [])

  function updatePhoto(photoId, updates) {
    photosRef.current = photosRef.current.map((photo) => photo.id === photoId ? { ...photo, ...updates } : photo)
    setPhotos(photosRef.current)
  }

  async function addPhotos(event) {
    const selectedFiles = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    setPhotoError('')
    const currentPhotos = photosRef.current
    const availableSlots = MAX_SPACE_PHOTOS - currentPhotos.length
    if (selectedFiles.length > availableSlots) {
      setPhotoError(`You can add up to ${MAX_SPACE_PHOTOS} photos. Remove a photo before adding more.`)
    }
    const addedPhotos = selectedFiles.slice(0, Math.max(0, availableSlots)).map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'checking',
      progress: 0,
      url: '',
      path: '',
      error: '',
      errorKind: '',
    }))
    photosRef.current = [...currentPhotos, ...addedPhotos]
    setPhotos(photosRef.current)
    await Promise.all(addedPhotos.map(async (photo) => {
      try {
        await validateSpacePhoto(photo.file)
        updatePhoto(photo.id, { status: 'ready' })
      } catch (validationError) {
        updatePhoto(photo.id, { status: 'error', error: validationError.message, errorKind: 'validation' })
      }
    }))
  }

  async function removePhoto(photo) {
    setPhotoError('')
    if (photo.path) {
      updatePhoto(photo.id, { status: 'removing' })
      try {
        await deleteSpacePhoto(user.uid, photo.path)
      } catch (removeError) {
        updatePhoto(photo.id, {
          status: 'uploaded',
          error: firebaseErrorMessage(removeError, 'Could not remove this uploaded photo.'),
          errorKind: 'upload',
        })
        setPhotoError(firebaseErrorMessage(removeError, 'Could not remove this uploaded photo.'))
        return
      }
    }
    URL.revokeObjectURL(photo.previewUrl)
    photosRef.current = photosRef.current.filter((item) => item.id !== photo.id)
    setPhotos(photosRef.current)
  }

  function clearPhotos() {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    photosRef.current = []
    setPhotos([])
    setPhotoConsent(false)
    setPhotoError('')
    submissionIdRef.current = null
  }

  const photoDisabledReason = !user.emailVerified
    ? 'Verify your email before submitting.'
    : photos.length === 0
      ? 'Add at least one photo to continue.'
      : !photoConsent
        ? 'Confirm that you took these photos or have permission to use them.'
        : photos.some((photo) => photo.status === 'checking')
          ? 'Wait while the selected photo files are checked.'
          : photos.some((photo) => photo.status === 'removing'
            || (photo.status === 'error' && photo.errorKind !== 'upload'))
            ? 'Fix or remove photos showing an error before submitting.'
            : ''

  async function submit(event) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true)
    setError('')
    setPhotoError('')
    setSuccess('')
    try {
      const listing = listingFromForm(new FormData(formElement))
      if (!photoConsent) throw new Error('Confirm that you took these photos or have permission to use them.')
      if (!photos.length) throw new Error('Add at least one photo before submitting.')
      if (photos.some((photo) => photo.status === 'checking'
        || (photo.status === 'error' && photo.errorKind !== 'upload'))) {
        throw new Error('Fix the selected photos before submitting.')
      }
      if (!listing.name || !listing.description || !listing.category || !listing.district
        || !listing.locality || !listing.address || !listing.openingHours) {
        throw new Error('Complete all required property and location details.')
      }
      if (!listing.permittedActivities.length) throw new Error('Choose at least one permitted activity.')
      if (!Object.keys(listing.availability).length || !Object.values(listing.availability).flat().length) {
        throw new Error('Choose at least one available day and enter the free hours.')
      }
      if (!Number.isFinite(listing.latitude) || listing.latitude < -90 || listing.latitude > 90
        || !Number.isFinite(listing.longitude) || listing.longitude < -180 || listing.longitude > 180) {
        throw new Error('Enter valid property coordinates copied from a map pin.')
      }
      if (!Number.isFinite(listing.capacity) || listing.capacity < 1) throw new Error('Capacity must be at least one person.')
      if (!Number.isFinite(listing.pricePerHour) || listing.pricePerHour < 0) throw new Error('Enter a valid hourly price (zero is allowed).')

      const submissionId = submissionIdRef.current || crypto.randomUUID()
      submissionIdRef.current = submissionId
      const uploadedPhotos = [...photosRef.current]
      for (let index = 0; index < uploadedPhotos.length; index += 1) {
        const photo = uploadedPhotos[index]
        if (photo.url) continue
        updatePhoto(photo.id, { status: 'uploading', progress: 0, error: '', errorKind: '' })
        try {
          const uploaded = await uploadSpacePhoto(user.uid, submissionId, photo.file, (progress) => {
            updatePhoto(photo.id, { progress })
          })
          uploadedPhotos[index] = { ...photo, ...uploaded, status: 'uploaded', progress: 1 }
          updatePhoto(photo.id, { ...uploaded, status: 'uploaded', progress: 1 })
        } catch (uploadError) {
          const message = firebaseErrorMessage(uploadError, 'This photo could not be uploaded. Check your connection and try again.')
          uploadedPhotos[index] = { ...photo, status: 'error', error: message, errorKind: 'upload' }
          updatePhoto(photo.id, { status: 'error', error: message, errorKind: 'upload' })
          throw uploadError
        }
      }
      const photoUrls = uploadedPhotos.map((photo) => photo.url)
      await submitOwnerProperty(user, {
        ...listing,
        photos: photoUrls,
        images: photoUrls,
        photoUrl: photoUrls[0] || '',
      }, submissionId)
      formElement.reset()
      clearPhotos()
      setSuccess('Your submission is pending review. An administrator must review it before it appears publicly.')
      await onSubmitted()
    } catch (submissionError) {
      setError(firebaseErrorMessage(submissionError, 'The property could not be submitted.'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-card">
    <div className="portal-section-heading"><div><span className="eyebrow">PRIVATE PROPERTY SUBMISSION</span><h2>List a space for review</h2></div><span className="pending-pill">Pending until approved</span></div>
    <p className="portal-muted">Your owner account is identified by Firebase UID <code>{user.uid}</code>. Enter coordinates copied from a map pin; they are stored with your private submission and are not published. Your exact address also remains private. Owner-provided features are not treated as verified.</p>
    <form className="owner-property-form" onSubmit={submit}>
      <div className="portal-form-grid">
        <label>PROPERTY NAME<input name="name" maxLength="120" required /></label>
        <label>SPACE CATEGORY<select name="category" defaultValue="" required><option value="" disabled>Choose a category</option>{['Room', 'Hall', 'Rooftop', 'Cafe corner', 'Studio', 'Other'].map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="portal-wide-field">DESCRIPTION<textarea name="description" maxLength="3000" rows="3" required /></label>
        <label>DISTRICT<select name="district" defaultValue="" required><option value="" disabled>Select a district</option>{districts.map((district) => <option key={district}>{district}</option>)}</select></label>
        <label>LOCALITY<input name="locality" required /></label>
        <label className="portal-wide-field">PRIVATE STREET ADDRESS<input name="address" required autoComplete="street-address" /></label>
        <label>PROPERTY LATITUDE<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="From a map pin" required /></label>
        <label>PROPERTY LONGITUDE<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="From a map pin" required /></label>
        <label>CAPACITY<input name="capacity" type="number" min="1" max="1000" required /></label>
        <label>PRICE PER HOUR (₹)<input name="pricePerHour" type="number" min="0" step="1" required /></label>
        <label>SEATING TYPE<select name="seatingType" defaultValue="" required><option value="" disabled>Select seating</option>{['Classroom', 'Meeting style', 'Cafe style', 'Flexible', 'Floor seating', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>ATMOSPHERE<select name="atmosphere" defaultValue="quiet"><option value="quiet">Quiet</option><option value="lively">Lively</option><option value="outdoor">Outdoor</option></select></label>
        <label>SETTING<select name="indoorOutdoor" defaultValue="Indoor"><option>Indoor</option><option>Outdoor</option><option>Indoor and outdoor</option></select></label>
      </div>
      <fieldset className="portal-check-group">
        <legend>SPACE PHOTOS</legend>
        <p>Choose up to {MAX_SPACE_PHOTOS} JPEG, PNG, or WebP photos. Each file must be 5 MB or smaller. Photos are resized and re-encoded before upload.</p>
        <label className="portal-photo-picker">Choose photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} disabled={busy || photos.length >= MAX_SPACE_PHOTOS} /></label>
        {photos.length > 0 && <div className="portal-photo-grid">{photos.map((photo) => <article className="portal-photo-item" key={photo.id}>
          <img src={photo.previewUrl} alt={`Preview of ${photo.file.name}`} />
          <div><strong>{photo.file.name}</strong><span>{photo.status === 'checking' ? 'Checking file…' : photo.status === 'uploading' ? `Uploading ${Math.round(photo.progress * 100)}%` : photo.status === 'uploaded' ? 'Uploaded and ready' : photo.status === 'removing' ? 'Removing…' : photo.status === 'error' ? photo.error : 'Ready to upload'}{photo.status === 'uploading' && <progress max="1" value={photo.progress} aria-label={`Uploading ${photo.file.name}`} />}</span></div>
          <button type="button" className="portal-text-button" onClick={() => removePhoto(photo)} disabled={busy || photo.status === 'checking' || photo.status === 'uploading' || photo.status === 'removing'}>Remove</button>
        </article>)}</div>}
        {photoError && <p className="portal-error" role="alert">{photoError}</p>}
        <label className="portal-photo-consent"><input type="checkbox" checked={photoConsent} onChange={(event) => setPhotoConsent(event.target.checked)} disabled={busy} /> I took these photos or have permission to use them.</label>
      </fieldset>
      <fieldset className="portal-check-group"><legend>PERMITTED ACTIVITIES</legend><div className="portal-check-grid">{activities.map((activity) => <label key={activity}><input type="checkbox" name="activities" value={activity} />{activity}</label>)}</div></fieldset>
      <fieldset className="portal-check-group"><legend>FACILITIES PROVIDED</legend><div className="portal-check-grid">{amenityOptions.map(([key, label]) => <label key={key}><input type="checkbox" name="amenities" value={key} />{label}</label>)}</div></fieldset>
      <div className="portal-form-grid portal-resource-numbers">
        <label>NUMBER OF DESKS<input name="desks" type="number" min="0" defaultValue="0" /></label>
        <label>POWER SOCKETS<input name="powerSockets" type="number" min="0" defaultValue="0" /></label>
        <label>WI-FI SPEED<input name="wifiSpeed" placeholder="e.g. 50 Mbps" /></label>
      </div>
      <fieldset className="portal-check-group"><legend>ADDITIONAL RESOURCES</legend><div className="portal-check-grid">{resourceOptions.map(([key, label]) => <label key={key}><input type="checkbox" name="resources" value={key} />{label}</label>)}</div></fieldset>
      <div className="portal-form-grid">
        <label>OPENING HOURS<input name="openingHours" placeholder="e.g. 9am–6pm" required /></label>
        <label>FREE HOURS<input name="freeHours" placeholder="e.g. 2pm–6pm" required /></label>
      </div>
      <fieldset className="portal-check-group"><legend>USUALLY AVAILABLE DAYS</legend><div className="portal-check-grid">{days.map((day) => <label key={day}><input type="checkbox" name="days" value={day} />{day}</label>)}</div></fieldset>
      <label className="portal-standalone-label">WOMEN-ONLY HOURS <span className="optional">(optional)</span><input name="womenOnlyHours" placeholder="e.g. Saturdays, 10am–2pm" /></label>
      <fieldset className="portal-check-group"><legend>OWNER-DECLARED SAFETY DETAILS</legend><p>These statements will be shown as owner-declared until independently reviewed.</p><div className="portal-check-grid">{safetyOptions.map(([key, label]) => <label key={key}><input type="checkbox" name="safety" value={key} />{label}</label>)}</div></fieldset>
      <fieldset className="portal-check-group"><legend>WASHROOM (OWNER-DECLARED)</legend><div className="portal-check-grid">{[['onSite', 'On-site'], ['separateForWomen', 'Separate for women'], ['accessible', 'Accessible']].map(([key, label]) => <label key={key}><input type="checkbox" name="washroom" value={key} />{label}</label>)}</div></fieldset>
      {error && <p className="portal-error" role="alert">{error}</p>}
      {success && <p className="portal-success" role="status">{success}</p>}
      {photoDisabledReason && <p className="portal-error" role="status">{photoDisabledReason}</p>}
      <button className="primary-button portal-submit" type="submit" disabled={busy || Boolean(photoDisabledReason)}>{busy ? 'Uploading and sending…' : 'Send for administrator review'}<ArrowRight size={15} /></button>
    </form>
  </section>
}

export function OwnerPortal() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!auth)
  const [error, setError] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [portalError, setPortalError] = useState('')
  const [verificationBusy, setVerificationBusy] = useState('')
  const [verificationFeedback, setVerificationFeedback] = useState(null)

  useEffect(() => {
    if (!auth) {
      return undefined
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)
    }, (authError) => {
      setError(firebaseErrorMessage(authError, 'Firebase could not check your sign-in status.'))
      setAuthReady(true)
    })
  }, [])

  useEffect(() => {
    if (authReady && !user && location.pathname !== '/owner') {
      navigate('/owner', {
        replace: true,
        state: { returnTo: location.pathname },
      })
    }
  }, [authReady, location.pathname, navigate, user])

  const refresh = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setPortalError('')
    try {
      setSubmissions(await getOwnSubmissions(user.uid))
    } catch (loadError) {
      setPortalError(firebaseErrorMessage(loadError, 'Your submissions could not be loaded. Try refreshing, or contact the project administrator if this continues.'))
    } finally {
      setLoading(false)
    }
  }, [user])

  async function resendVerification() {
    setVerificationBusy('resend')
    setVerificationFeedback(null)
    try {
      await sendEmailVerification(user)
      setVerificationFeedback({
        type: 'success',
        message: 'A new verification email was sent. Check your inbox and spam folder.',
      })
    } catch (verificationError) {
      setVerificationFeedback({
        type: 'error',
        message: firebaseErrorMessage(verificationError, 'Firebase could not send a verification email. Try again.'),
      })
    } finally {
      setVerificationBusy('')
    }
  }

  async function refreshEmailVerification() {
    setVerificationBusy('refresh')
    setVerificationFeedback(null)
    try {
      await reload(user)
      await user.getIdToken(true)
      setUser(auth?.currentUser || user)
      if (user.emailVerified) {
        setVerificationFeedback({
          type: 'success',
          message: 'Your email is verified. Your owner dashboard has been refreshed.',
        })
        await refresh()
      } else {
        setVerificationFeedback({
          type: 'error',
          message: 'Firebase still shows your email as unverified. Open the verification link, then try again.',
        })
      }
    } catch (verificationError) {
      setVerificationFeedback({
        type: 'error',
        message: firebaseErrorMessage(verificationError, 'Firebase could not refresh your verification status. Try again.'),
      })
    } finally {
      setVerificationBusy('')
    }
  }

  useEffect(() => {
    if (!user) return undefined
    let active = true
    Promise.resolve().then(() => {
      if (active) refresh()
    })
    return () => { active = false }
  }, [refresh, user])

  async function logout() {
    try {
      await signOut(auth)
      setSubmissions([])
    } catch (signOutError) {
      setPortalError(signOutError.message)
    }
  }

  const listingPath = location.state?.returnTo === '/owner/list-space' ? '/owner/list-space' : '/owner'
  const completeOwnerSignIn = () => navigate(listingPath, { replace: true, state: null })
  const listingRequested = location.pathname === '/owner/list-space'
    || location.state?.returnTo === '/owner/list-space'

  if (!authReady) return <PortalShell eyebrow="OWNER PORTAL" title="Loading your secure portal"><div className="portal-card">Checking Firebase Authentication…</div></PortalShell>
  if (!user) return <PortalShell eyebrow="OWNER PORTAL" title="Your space, thoughtfully shared">
    {!firebaseConfigured && <FirebaseNotice />}
    {listingRequested && <div className="portal-notice"><strong>Sign in or create an owner account to list a space.</strong><span>After authentication, you will return to the private property submission form.</span></div>}
    <AuthCard onAuthenticated={completeOwnerSignIn} error={error} setError={setError} allowRegistration />
  </PortalShell>

  return <PortalShell eyebrow="OWNER PORTAL · PRIVATE" title={listingRequested ? 'List your space' : 'Manage your spaces'} user={user} onSignOut={logout}>
    {!firebaseConfigured && <FirebaseNotice />}
    {error && <p className={error.startsWith('Account created') ? 'portal-success' : 'portal-error'} role="status">{error}</p>}
    {portalError && <p className="portal-error" role="alert">{portalError}</p>}
    {!user.emailVerified && <div className="portal-notice" role="status">
      <strong>Verify your email before submitting a space.</strong>
      <span>You can still view your own submissions. Check your inbox for the verification link, then return here and refresh your status.</span>
      <div className="portal-header-actions">
        <button className="outline-button" type="button" onClick={resendVerification} disabled={Boolean(verificationBusy)}>
          {verificationBusy === 'resend' ? 'Sending email…' : 'Resend verification email'}
        </button>
        <button className="outline-button" type="button" onClick={refreshEmailVerification} disabled={Boolean(verificationBusy)}>
          {verificationBusy === 'refresh' ? 'Refreshing…' : 'I have verified, refresh'}
        </button>
      </div>
    </div>}
    {verificationFeedback && <p className={verificationFeedback.type === 'success' ? 'portal-success' : 'portal-error'} role={verificationFeedback.type === 'success' ? 'status' : 'alert'}>{verificationFeedback.message}</p>}
    <OwnerPropertyForm user={user} onSubmitted={refresh} />
    <section className="portal-card">
      <div className="portal-section-heading"><div><span className="eyebrow">YOUR OWNER RECORDS</span><h2>My submissions</h2></div><button className="outline-button" onClick={refresh} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
      {loading ? <p className="portal-muted">Loading your submissions…</p> : !submissions.length ? <p className="portal-muted">You have not submitted a property yet.</p> : <div className="portal-submission-list">{submissions.map((submission) => <SubmissionCard key={submission.id} submission={submission} user={user} onChanged={refresh} />)}</div>}
    </section>
  </PortalShell>
}

function SubmissionCard({ submission, user, onChanged }) {
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [stagedPhotos, setStagedPhotos] = useState([])
  const [schedule, setSchedule] = useState(() => defaultSchedule(submission.availability))

  async function saveStagedPhotos(photos = stagedPhotos) {
    if (!photos.length) return
    await updatePendingSubmissionPhotos(user.uid, submission.id, [
      ...submissionPhotoUrls(submission),
      ...photos.map((photo) => photo.url),
    ])
    setStagedPhotos([])
    await onChanged()
  }

  async function addSubmissionPhotos(event) {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ''
    setPhotoError('')
    const currentPhotos = submissionPhotoUrls(submission)
    if (currentPhotos.length + stagedPhotos.length + files.length > MAX_SPACE_PHOTOS) {
      setPhotoError(`You can add up to ${MAX_SPACE_PHOTOS} photos. Remove a photo before adding more.`)
      return
    }
    setBusy(true)
    let uploadedPhotos = [...stagedPhotos]
    try {
      for (const file of files) {
        await validateSpacePhoto(file)
        const uploaded = await uploadSpacePhoto(user.uid, submission.id, file)
        uploadedPhotos = [...uploadedPhotos, { ...uploaded, name: file.name }]
        setStagedPhotos(uploadedPhotos)
      }
      await saveStagedPhotos(uploadedPhotos)
    } catch (uploadError) {
      setPhotoError(firebaseErrorMessage(uploadError, 'The photos could not be saved. You can retry without selecting the uploaded photos again.'))
    } finally {
      setBusy(false)
    }
  }

  async function removeSubmissionPhoto(photoUrl) {
    setBusy(true)
    setPhotoError('')
    try {
      const remainingPhotos = submissionPhotoUrls(submission).filter((url) => url !== photoUrl)
      await updatePendingSubmissionPhotos(user.uid, submission.id, remainingPhotos)
      await onChanged()
      try {
        await deleteSpacePhoto(user.uid, photoUrl)
      } catch (cleanupError) {
        setPhotoError(`The photo was removed from your listing, but its stored file could not be deleted: ${firebaseErrorMessage(cleanupError, 'Storage cleanup failed.')}`)
      }
    } catch (removeError) {
      setPhotoError(firebaseErrorMessage(removeError, 'The photo could not be removed from your listing.'))
    } finally {
      setBusy(false)
    }
  }

  async function updatePending(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await updatePendingSubmission(user.uid, submission.id, {
        name: String(form.get('name')).trim(),
        description: String(form.get('description')).trim(),
        pricePerHour: Number(form.get('pricePerHour')),
        openingHours: String(form.get('openingHours')).trim(),
      })
      await onChanged()
      setEditOpen(false)
    } catch (updateError) {
      setError(updateError.message || 'Could not update the pending submission.')
    } finally {
      setBusy(false)
    }
  }

  async function updateAvailability(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const form = new FormData(event.currentTarget)
      const hours = String(form.get('freeHours')).trim()
      const availableDays = form.getAll('days')
      if (!hours || !availableDays.length) throw new Error('Choose free hours and at least one available day.')
      const availability = Object.fromEntries(availableDays.map((day) => [day, [hours]]))
      await saveOwnerAvailability(user.uid, submission.id, availability, String(form.get('openingHours')).trim())
      setSchedule({ days: availableDays, hours })
      await onChanged()
    } catch (updateError) {
      setError(updateError.message || 'Could not update availability.')
    } finally {
      setBusy(false)
    }
  }

  return <article className="portal-submission">
    <div className="portal-submission-top"><div><h3>{submission.name}</h3><p>{submission.locality}, {submission.district} · ₹{Number(submission.pricePerHour || 0).toLocaleString('en-IN')}/hr</p></div><span className={`submission-status ${submission.status}`}>{submission.status.replaceAll('_', ' ')}</span></div>
    <SubmissionPhotoGallery
      photos={submissionPhotoUrls(submission)}
      name={submission.name}
      onRemove={submission.status === 'pending' ? removeSubmissionPhoto : undefined}
      busy={busy}
    />
    {submission.reviewerNote && <p className="portal-review-note"><strong>Reviewer note:</strong> {submission.reviewerNote}</p>}
    {submission.status === 'pending' && <>
      <p className="portal-muted">Pending submissions are visible only to you and administrators. They do not appear in public search.</p>
      <div className="portal-photo-management">
        <label className="portal-photo-picker">Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addSubmissionPhotos} disabled={busy || submissionPhotoUrls(submission).length + stagedPhotos.length >= MAX_SPACE_PHOTOS} /></label>
        {stagedPhotos.length > 0 && <button className="outline-button" type="button" onClick={() => saveStagedPhotos()} disabled={busy}>{busy ? 'Saving photos…' : 'Retry saving uploaded photos'}</button>}
        {photoError && <p className="portal-error" role="alert">{photoError}</p>}
      </div>
      <button className="portal-text-button" onClick={() => setEditOpen(!editOpen)}>{editOpen ? 'Close editor' : 'Edit permitted details'}</button>
      {editOpen && <form className="portal-form-grid portal-edit-form" onSubmit={updatePending}>
        <label>PROPERTY NAME<input name="name" maxLength="120" defaultValue={submission.name} required /></label>
        <label>PRICE PER HOUR<input name="pricePerHour" type="number" min="0" defaultValue={submission.pricePerHour} required /></label>
        <label>OPENING HOURS<input name="openingHours" defaultValue={submission.openingHours} required /></label>
        <label className="portal-wide-field">DESCRIPTION<textarea name="description" rows="2" maxLength="3000" defaultValue={submission.description} required /></label>
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </form>}
    </>}
    {submission.status === 'approved' && <form className="portal-availability-form" onSubmit={updateAvailability}>
      <span className="eyebrow">OWNER-DECLARED AVAILABILITY</span>
      <p>This schedule is your declaration, not proof that the space is physically empty. Bookings and community reports are stored separately.</p>
      <div className="portal-form-grid"><label>OPENING HOURS<input name="openingHours" defaultValue={submission.openingHours || ''} required /></label><label>FREE HOURS<input name="freeHours" defaultValue={schedule.hours} required /></label></div>
      <div className="portal-check-grid">{days.map((day) => <label key={day}><input type="checkbox" name="days" value={day} defaultChecked={schedule.days.includes(day)} />{day}</label>)}</div>
      <button className="outline-button" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Update my availability'}</button>
    </form>}
    {error && <p className="portal-error" role="alert">{error}</p>}
  </article>
}

function submissionPhotoUrls(submission) {
  return [...new Set([
    ...(Array.isArray(submission.photos) ? submission.photos : []),
    ...(Array.isArray(submission.images) ? submission.images : []),
    submission.photoUrl,
  ].filter((photo) => typeof photo === 'string' && photo))]
}

function SubmissionPhotoGallery({ photos, name, onRemove, busy = false }) {
  const [enlargedPhoto, setEnlargedPhoto] = useState('')

  useEffect(() => {
    if (!enlargedPhoto) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') setEnlargedPhoto('')
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [enlargedPhoto])

  return <>
    <div className="portal-review-gallery">
      {photos.length ? photos.map((photo, index) => <div className="portal-review-photo" key={photo}>
        <button type="button" className="portal-review-photo-open" onClick={() => setEnlargedPhoto(photo)} aria-label={`Enlarge photo ${index + 1} of ${name}`}>
          <img src={photo} alt={`${name}, photo ${index + 1}`} loading="lazy" />
        </button>
        {onRemove && <button type="button" className="portal-review-photo-remove" onClick={() => onRemove(photo)} disabled={busy} aria-label={`Remove photo ${index + 1} from ${name}`}>Remove</button>}
      </div>) : <div className="portal-review-photo-empty">Photos not provided</div>}
    </div>
    {enlargedPhoto && <div className="portal-photo-lightbox" role="dialog" aria-modal="true" aria-label={`Photo of ${name}`} onClick={() => setEnlargedPhoto('')}>
      <button type="button" className="portal-photo-lightbox-close" onClick={() => setEnlargedPhoto('')} aria-label="Close enlarged photo">×</button>
      <img src={enlargedPhoto} alt={`${name}, enlarged view`} onClick={(event) => event.stopPropagation()} />
    </div>}
  </>
}

export function AdminPortal() {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [authReady, setAuthReady] = useState(!auth)
  const [error, setError] = useState('')
  const [pending, setPending] = useState([])
  const [spaceProposals, setSpaceProposals] = useState([])
  const [approvedSpaces, setApprovedSpaces] = useState([])
  const [publicPlaces, setPublicPlaces] = useState([])
  const [reportFlags, setReportFlags] = useState([])
  const [verificationRecords, setVerificationRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!auth) {
      return undefined
    }
    let active = true
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      setIsAdmin(false)
      if (!nextUser) {
        setAuthReady(true)
        return
      }
      setAuthReady(false)
      try {
        const token = await getIdTokenResult(nextUser, true)
        if (active && auth.currentUser?.uid === nextUser.uid) setIsAdmin(token.claims.admin === true)
      } catch (claimError) {
        if (active && auth.currentUser?.uid === nextUser.uid) setError(claimError.message)
      } finally {
        if (active && auth.currentUser?.uid === nextUser.uid) setAuthReady(true)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return undefined
    let active = true
    Promise.all([
      getPendingSubmissions(),
      getSpaceSubmissionsForReview(),
      getAdminApprovedSpaces(),
      getAdminPublicPlaces(),
      getReportFlags(),
      getVerificationRecords(),
    ]).then(([submissions, proposals, spaces, places, flags, verifications]) => {
      if (!active) return
      setPending(submissions)
      setSpaceProposals(proposals)
      setApprovedSpaces(spaces)
      setPublicPlaces(places)
      setReportFlags(flags)
      setVerificationRecords(verifications)
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Pending submissions could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [isAdmin, refreshKey])

  async function logout() {
    try {
      await signOut(auth)
      setPending([])
      setSpaceProposals([])
      setApprovedSpaces([])
      setPublicPlaces([])
      setReportFlags([])
      setVerificationRecords([])
      setIsAdmin(false)
    } catch (signOutError) {
      setError(signOutError.message)
    }
  }

  if (!authReady) return <PortalShell eyebrow="ADMIN · RESTRICTED" title="Checking administrator access" user={user}><div className="portal-card">Checking Firebase custom claims…</div></PortalShell>
  if (!user || !isAdmin) return <PortalShell eyebrow="ADMIN · RESTRICTED" title="Authorized administrators only" user={user} onSignOut={logout}>
    {!firebaseConfigured && <FirebaseNotice />}
    {user && <div className="portal-notice" role="alert"><strong>This account has no administrator claim.</strong><span>Admin access is granted only by the trusted custom-claims script. A public profile field or registration form cannot enable it.</span></div>}
    <AuthCard error={error} setError={setError} allowRegistration={false} />
  </PortalShell>

  return <PortalShell eyebrow="INTERNAL · ADMINISTRATOR" title="Review and data quality" user={user} onSignOut={logout}>
    <div className="portal-notice"><ShieldCheck size={18} /><span>Administrator access comes from a Firebase custom claim. Property approval does not mark a property independently verified.</span></div>
    <nav className="admin-portal-nav" aria-label="Administrator review sections">
      <button className={location.pathname === '/admin' ? 'active' : ''} onClick={() => navigate('/admin')}>Owner listings</button>
      <button className={location.pathname.startsWith('/admin/submissions') ? 'active' : ''} onClick={() => navigate('/admin/submissions')}>Public proposals ({spaceProposals.length})</button>
    </nav>
    {location.pathname.startsWith('/admin/submissions') && <section className="portal-card">
      <div className="portal-section-heading"><div><span className="eyebrow">PUBLIC SUBMISSIONS · PRIVATE REVIEW</span><h2>Space proposals <small>({spaceProposals.filter((item) => ['pending', 'needs_changes'].includes(item.reviewStatus)).length} to review)</small></h2></div><button className="outline-button" onClick={() => { setLoading(true); setError(''); setRefreshKey((key) => key + 1) }} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
      <p className="portal-muted">Passing automated checks only confirms basic field consistency. Inspect the evidence and independently verify existence, access permission, occupancy claims, safety, and any legal requirements.</p>
      {loading ? <p className="portal-muted">Loading submitted proposals…</p> : !spaceProposals.length ? <p className="portal-muted">No proposals have been submitted.</p> : <div className="portal-submission-list">{spaceProposals.map((proposal) => ['pending', 'needs_changes'].includes(proposal.reviewStatus)
        ? <SpaceProposalReview key={proposal.id} proposal={proposal} onReviewed={() => setRefreshKey((key) => key + 1)} setFeedback={setFeedback} />
        : <ReviewedSpaceProposal key={proposal.id} proposal={proposal} />)}</div>}
    </section>}
    {location.pathname === '/admin' && <>
    <section className="portal-card">
      <div className="portal-section-heading"><div><span className="eyebrow">OWNER SUBMISSIONS</span><h2>Pending review <small>({pending.length})</small></h2></div><button className="outline-button" onClick={() => { setLoading(true); setError(''); setRefreshKey((key) => key + 1) }} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
      {loading ? <p className="portal-muted">Loading administrator queue…</p> : !pending.length ? <p className="portal-muted">There are no pending submissions.</p> : <div className="portal-submission-list">{pending.map((submission) => <AdminSubmission key={submission.id} submission={submission} currentAdminUid={user.uid} onReviewed={() => setRefreshKey((key) => key + 1)} setFeedback={setFeedback} />)}</div>}
    </section>
    <PublicImportCard setFeedback={setFeedback} onImported={() => { setLoading(true); setRefreshKey((key) => key + 1) }} />
    <section className="portal-card">
      <div className="portal-section-heading"><div><span className="eyebrow">REPORTS & DATA QUALITY</span><h2>Review queue</h2></div><span>{reportFlags.filter((flag) => flag.reviewStatus === 'new').length} new reports</span></div>
      <p className="portal-muted">Approved listings: {approvedSpaces.length}; listings without a photo: {approvedSpaces.filter((space) => !space.photoUrl).length}; listings without an owner-declared schedule: {approvedSpaces.filter((space) => !Object.values(space.availability || {}).some((slots) => slots.length)).length}. Public-place records: {publicPlaces.length}; active: {publicPlaces.filter((place) => place.sourceStatus === 'active').length}. Protected verification records: {verificationRecords.length}.</p>
      {reportFlags.length ? <div className="portal-submission-list">{reportFlags.map((flag) => <AdminReportFlag key={flag.id} flag={flag} onReviewed={() => setRefreshKey((key) => key + 1)} setFeedback={setFeedback} />)}</div> : <p className="portal-muted">No report flags have been submitted.</p>}
      {publicPlaces.length > 0 && <div className="portal-public-place-list"><h3>Imported public places · OpenStreetMap</h3>{publicPlaces.slice(0, 30).map((place) => <PublicPlaceRecord key={place.id} place={place} onRemoved={async () => {
        try {
          await removePublicPlace(place.id)
          setFeedback(`${place.name} was removed from public results.`)
          setRefreshKey((key) => key + 1)
        } catch (removeError) {
          setError(removeError.message || 'Could not remove that place.')
        }
      }} />)}</div>}
      {verificationRecords.length > 0 && <div className="portal-public-place-list"><h3>Protected verification records</h3>{verificationRecords.map((record) => <p className="portal-muted" key={record.id}>{record.spaceId || 'Unlinked listing'} · {record.status || 'Status not set'} · {record.note || 'No review note'}</p>)}</div>}
    </section>
    {feedback && <p className="portal-success" role="status">{feedback}</p>}
    {error && <p className="portal-error" role="alert">{error}</p>}
    </>}
  </PortalShell>
}

function SpaceProposalReview({ proposal, onReviewed, setFeedback }) {
  const [reviewNotes, setReviewNotes] = useState('')
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function review(decision) {
    setBusy(true)
    setError('')
    try {
      const result = await reviewSpaceSubmission(
        proposal.id,
        decision,
        reviewNotes,
        duplicateAcknowledged,
      )
      setFeedback(result.published
        ? `${proposal.name} was approved and published.`
        : `${proposal.name}: ${result.reviewStatus}.`)
      onReviewed()
    } catch (reviewError) {
      setError(reviewError.message || 'Could not review the proposal.')
    } finally {
      setBusy(false)
    }
  }

  const criteria = proposal.criteriaCheck || { passed: false, errors: ['No automated criteria result was saved.'], warnings: [] }
  return <article className="portal-submission">
    <div className="portal-submission-top"><div><h3>{proposal.name}</h3><p>{proposal.category} · {proposal.spaceType} · {proposal.locality}, {proposal.district}</p><p>Submission {proposal.id} · {proposal.submitterUid ? `User ${proposal.submitterUid}` : 'Anonymous submitter'}</p></div><span className={`submission-status ${proposal.reviewStatus}`}>{proposal.reviewStatus.replaceAll('_', ' ')}</span></div>
    <p className="portal-muted">{proposal.description}</p>
    <p className="portal-muted">Private address: {proposal.address} · Coordinates: {proposal.latitude}, {proposal.longitude}</p>
    <p className="portal-muted">Access: {proposal.accessInformation} · Permitted activities: {(proposal.permittedActivities || []).join(', ') || 'Not supplied'}</p>
    <p className="portal-muted">Availability was last confirmed {proposal.lastConfirmedAt || 'on an unknown date'}; submitter-declared only.</p>
    <div className="proposal-review-criteria">
      <strong>Automatic criteria: {criteria.passed ? 'Basic checks passed' : 'Needs correction'}</strong>
      {[...(criteria.errors || []), ...(criteria.warnings || [])].map((item) => <p key={item}>{item}</p>)}
      {criteria.humanVerificationRequired && <p>Human verification required; automated checks do not establish that the property exists, is empty, safe, or legally available.</p>}
    </div>
    {proposal.evidenceUrls?.length > 0 && <div className="proposal-review-evidence"><strong>Evidence links (review only)</strong>{proposal.evidenceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{url}</a>)}</div>}
    <label className="portal-standalone-label">Review notes or reason<textarea rows="2" maxLength="2000" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} /></label>
    {proposal.possibleDuplicate && <label className="proposal-booking-toggle"><input type="checkbox" checked={duplicateAcknowledged} onChange={(event) => setDuplicateAcknowledged(event.target.checked)} /> I checked the duplicate warning and confirm this is a distinct property.</label>}
    <div className="portal-review-actions">
      <button className="outline-button" onClick={() => review('flag_duplicate')} disabled={busy}>{busy ? 'Saving…' : 'Flag possible duplicate'}</button>
      <button className="outline-button" onClick={() => review('needs_changes')} disabled={busy}>{busy ? 'Saving…' : 'Request changes'}</button>
      <button className="outline-button" onClick={() => review('rejected')} disabled={busy}>{busy ? 'Saving…' : 'Reject'}</button>
      <button className="primary-button" onClick={() => review('approved')} disabled={busy || !criteria.passed || (proposal.possibleDuplicate && !duplicateAcknowledged)}>{busy ? 'Publishing…' : 'Approve and publish'}<Check size={15} /></button>
    </div>
    {error && <p className="portal-error" role="alert">{error}</p>}
  </article>
}

function ReviewedSpaceProposal({ proposal }) {
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')
  const [loadingHistory, setLoadingHistory] = useState(false)

  async function toggleHistory() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setLoadingHistory(true)
    setError('')
    try {
      setHistory(await getSpaceSubmissionReviewHistory(proposal.id))
      setExpanded(true)
    } catch (loadError) {
      setError(loadError.message || 'Review history could not be loaded.')
    } finally {
      setLoadingHistory(false)
    }
  }

  return <article className="portal-submission">
    <div className="portal-submission-top"><div><h3>{proposal.name}</h3><p>{proposal.locality}, {proposal.district} · Submission {proposal.id}</p></div><span className={`submission-status ${proposal.reviewStatus}`}>{proposal.reviewStatus.replaceAll('_', ' ')}</span></div>
    {proposal.reviewNotes && <p className="portal-muted">Latest reviewer note: {proposal.reviewNotes}</p>}
    <button className="portal-text-button" onClick={toggleHistory} disabled={loadingHistory}>{loadingHistory ? 'Loading history…' : expanded ? 'Hide review history' : 'View review history'}</button>
    {expanded && <div className="proposal-review-history">{history.length ? history.map((entry) => <div key={entry.id}><strong>{entry.decision.replaceAll('_', ' ')}</strong><small>{entry.reviewedAt?.toDate?.().toLocaleString() || 'Review time unavailable'} · Reviewer {entry.reviewerId || 'unknown'}</small>{entry.reviewNotes && <p>{entry.reviewNotes}</p>}</div>) : <p className="portal-muted">No review events recorded.</p>}</div>}
    {error && <p className="portal-error" role="alert">{error}</p>}
  </article>
}

function AdminSubmission({ submission, currentAdminUid, onReviewed, setFeedback }) {
  const [reviewerNote, setReviewerNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isOwner = submission.ownerUid === currentAdminUid

  async function review(decision) {
    setBusy(true)
    setError('')
    try {
      await reviewSubmission(submission.id, decision, reviewerNote)
      setFeedback(`${submission.name}: ${decision}.`)
      onReviewed()
    } catch (reviewError) {
      setError(reviewError.message || 'Could not review this submission.')
    } finally {
      setBusy(false)
    }
  }

  return <article className="portal-submission">
    <div className="portal-submission-top"><div><h3>{submission.name}</h3><p>{submission.category} · {submission.locality}, {submission.district} · Owner UID {submission.ownerUid}</p><p>{submission.ownerEmail}</p></div><span className="submission-status pending">Pending</span></div>
    <p className="portal-muted">{submission.description}</p>
    <p className="portal-muted">Private address and coordinates are restricted to this review. Approval publishes the category, locality, price, facilities and owner-declared information, but not the exact address or coordinates.</p>
    <SubmissionPhotoGallery photos={submissionPhotoUrls(submission)} name={submission.name} />
    <label className="portal-standalone-label">Reviewer note<textarea rows="2" maxLength="1000" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} /></label>
    {isOwner && <p className="portal-error">You cannot approve your own property. Another authorized administrator must review it.</p>}
    <div className="portal-review-actions"><button className="outline-button" onClick={() => review('rejected')} disabled={busy}>{busy ? 'Saving…' : 'Reject'}</button><button className="primary-button" onClick={() => review('approved')} disabled={busy || isOwner}>{busy ? 'Saving…' : 'Approve listing'}<Check size={15} /></button></div>
    {error && <p className="portal-error" role="alert">{error}</p>}
  </article>
}

function AdminReportFlag({ flag, onReviewed, setFeedback }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function markReviewed() {
    setBusy(true)
    setError('')
    try {
      await reviewReportFlag(flag.id)
      setFeedback(`Report for space ${flag.spaceId} marked reviewed.`)
      onReviewed()
    } catch (reviewError) {
      setError(reviewError.message || 'Could not update this report.')
    } finally {
      setBusy(false)
    }
  }

  return <article className="portal-submission"><div className="portal-submission-top"><div><h3>{flag.reason}</h3><p>Space {flag.spaceId} · {flag.reviewStatus || 'new'}</p></div>{flag.reviewStatus === 'new' && <button className="outline-button" onClick={markReviewed} disabled={busy}>{busy ? 'Saving…' : 'Mark reviewed'}</button>}</div>{flag.details && <p className="portal-muted">{flag.details}</p>}{error && <p className="portal-error" role="alert">{error}</p>}</article>
}

function PublicPlaceRecord({ place, onRemoved }) {
  const [busy, setBusy] = useState(false)
  return <div className="portal-public-place-row"><span><strong>{place.name}</strong><small>{place.category} · {place.sourceIdentifier} · {place.sourceStatus}</small></span>{place.sourceStatus === 'active' && <button className="portal-text-button" disabled={busy} onClick={async () => { setBusy(true); await onRemoved(); setBusy(false) }}>{busy ? 'Removing…' : 'Remove'}</button>}</div>
}

function PublicImportCard({ setFeedback, onImported }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function importData(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const count = await importOsmPublicPlaces({
        latitude: form.get('latitude'),
        longitude: form.get('longitude'),
        radiusMeters: form.get('radiusMeters'),
      })
      setFeedback(`OpenStreetMap import complete: ${count} named public-place records checked. Imports are not bookable spaces.`)
      onImported()
    } catch (importError) {
      setError(importError.message || 'The public-place import failed.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="portal-card">
    <div className="portal-section-heading"><div><span className="eyebrow">OPEN DATA · OPENSTREETMAP</span><h2>Import public places</h2></div><MapPin size={19} /></div>
    <p className="portal-muted">Imports named restaurants, cafes, public washrooms, ATMs, pharmacies, print shops, stationery shops, and bus stops around a coordinate. Stable OSM element IDs prevent duplicate records. These are places from OpenStreetMap, not spaces advertised as empty or bookable.</p>
    <form className="portal-form-grid portal-import-form" onSubmit={importData}>
      <label>LATITUDE<input name="latitude" type="number" min="-90" max="90" step="any" required /></label>
      <label>LONGITUDE<input name="longitude" type="number" min="-180" max="180" step="any" required /></label>
      <label>RADIUS (METRES)<input name="radiusMeters" type="number" min="100" max="5000" step="100" defaultValue="1000" required /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Importing…' : 'Import and refresh records'}<UploadCloud size={15} /></button>
    </form>
    <p className="osm-attribution">Data © OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">ODbL attribution</a></p>
    {error && <p className="portal-error" role="alert">{error}</p>}
  </section>
}
