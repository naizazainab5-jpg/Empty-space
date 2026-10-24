from datetime import date
from urllib.parse import urlsplit


KERALA_DISTRICTS = {
    "Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam",
    "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta",
    "Thiruvananthapuram", "Thrissur", "Wayanad",
}
SUPPORTED_SPACE_TYPES = {"public", "private"}
SUPPORTED_CATEGORIES = {"Room", "Hall", "Rooftop", "Cafe corner", "Studio", "Other"}


def _text(value):
    return value.strip() if isinstance(value, str) else ""


def _finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def evaluate_space_submission(submission, possible_duplicates=None):
    possible_duplicates = possible_duplicates or []
    errors = []
    warnings = []
    name = _text(submission.get("name"))
    description = _text(submission.get("description"))
    locality = _text(submission.get("locality"))
    address = _text(submission.get("address"))
    district = _text(submission.get("district"))
    access_information = _text(submission.get("accessInformation"))
    activities = submission.get("permittedActivities")
    if not isinstance(activities, list):
        activities = []
    space_type = _text(submission.get("spaceType"))
    private_booking = submission.get("privateBooking") is True
    price = submission.get("hourlyPrice")
    latitude = submission.get("latitude")
    longitude = submission.get("longitude")
    last_confirmed = _text(submission.get("lastConfirmedAt"))

    if len(name) < 3 or len(name) > 120:
        errors.append("Name must be between 3 and 120 characters.")
    if len(description) < 20 or len(description) > 1000:
        errors.append("Description must be between 20 and 1000 characters.")
    if _text(submission.get("category")) not in SUPPORTED_CATEGORIES:
        errors.append("Choose a supported space category.")
    if _text(submission.get("state")) != "Kerala":
        errors.append("This submission flow currently accepts Kerala locations only.")
    if district not in KERALA_DISTRICTS:
        errors.append("Choose a valid Kerala district.")
    if len(locality) < 2 or len(locality) > 100:
        errors.append("Enter a locality between 2 and 100 characters.")
    if len(address) < 5 or len(address) > 300:
        errors.append("Enter a usable address between 5 and 300 characters.")
    if space_type not in SUPPORTED_SPACE_TYPES:
        errors.append("Choose Public or Private space type.")
    if not access_information or len(access_information) > 500:
        errors.append("Explain who can access the space and any restrictions (up to 500 characters).")
    if not _finite_number(latitude) or not 8 <= latitude <= 13:
        errors.append("Enter a valid latitude within Kerala.")
    if not _finite_number(longitude) or not 74 <= longitude <= 78:
        errors.append("Enter a valid longitude within Kerala.")
    if not isinstance(submission.get("capacity"), int) or isinstance(submission.get("capacity"), bool) or not 1 <= submission["capacity"] <= 1000:
        errors.append("Capacity must be a whole number from 1 to 1000.")
    if not activities or len(activities) > 10 or any(
        not isinstance(activity, str) or not _text(activity) or len(_text(activity)) > 80
        for activity in activities
    ):
        errors.append("Choose at least one clear permitted activity.")

    try:
        confirmed_date = date.fromisoformat(last_confirmed)
    except ValueError:
        confirmed_date = None
    if confirmed_date is None or confirmed_date.isoformat() != last_confirmed or confirmed_date > date.today():
        errors.append("Enter the date when availability was last confirmed.")

    opening_hours = _text(submission.get("openingHours"))
    if not opening_hours or len(opening_hours) > 200:
        errors.append("Enter opening hours or state when access must be arranged.")
    availability = submission.get("availability")
    if not isinstance(availability, dict) or not any(
        isinstance(slots, list) and any(_text(slot) for slot in slots)
        for slots in availability.values()
    ):
        errors.append("Provide at least one day and time when availability was confirmed.")
    if private_booking and space_type != "private":
        errors.append("Private booking can only be selected for a Private space.")
    if private_booking and (not _finite_number(price) or price <= 0 or price > 1_000_000):
        errors.append("A private paid booking needs an hourly price greater than zero.")
    if not private_booking and price is not None:
        errors.append("Leave hourly price blank unless the space is available for private paid booking.")

    evidence_urls = submission.get("evidenceUrls")
    if not isinstance(evidence_urls, list) or not evidence_urls:
        warnings.append("No evidence link was supplied; an administrator must verify the property independently.")
    elif len(evidence_urls) > 5 or any(
        not isinstance(url, str)
        or len(url) > 500
        or urlsplit(url).scheme != "https"
        or not urlsplit(url).netloc
        for url in evidence_urls
    ):
        errors.append("Evidence links must be up to five valid HTTPS URLs.")
    if possible_duplicates:
        warnings.append("Possible duplicate listings need human review before publication.")
    warnings.append("Submitting this form does not prove the space exists, is empty, safe, or legally available.")
    return {
        "passed": not errors,
        "errors": errors,
        "warnings": warnings,
        "possibleDuplicates": possible_duplicates[:5],
        "humanVerificationRequired": True,
    }


def public_space_from_submission(submission, submission_id, reviewed_at):
    is_private_booking = submission.get("privateBooking") is True
    photos = submission.get("photos")
    if not isinstance(photos, list):
        photos = submission.get("images")
    if not isinstance(photos, list):
        photos = []
    photos = [photo for photo in photos if isinstance(photo, str) and photo][:6]
    return {
        "name": _text(submission.get("name")),
        "description": _text(submission.get("description")),
        "spaceType": submission.get("spaceType"),
        "category": submission.get("category"),
        "state": submission.get("state"),
        "district": submission.get("district"),
        "locality": _text(submission.get("locality")),
        "area": _text(submission.get("locality")),
        "permittedActivities": submission.get("permittedActivities", []),
        "capacity": submission.get("capacity"),
        "pricePerHour": submission.get("hourlyPrice") if is_private_booking else None,
        "pricingType": "hourly" if is_private_booking else "not_listed",
        "privateBooking": is_private_booking,
        "accessInformation": _text(submission.get("accessInformation")),
        "openingHours": _text(submission.get("openingHours")),
        "availability": submission.get("availability") or {},
        "amenities": submission.get("amenities") or {},
        "resources": submission.get("resources") or {},
        "seatingType": submission.get("seatingType") or "",
        "atmosphere": submission.get("atmosphere") or "",
        "indoorOutdoor": submission.get("indoorOutdoor") or "",
        "photoUrl": photos[0] if photos else "",
        "photos": photos,
        "images": photos,
        "status": "approved",
        "verified": False,
        "sourceSubmissionId": submission_id,
        "reviewedAt": reviewed_at,
        "lastUpdated": reviewed_at,
        "availabilitySource": "submitter-declared",
    }
