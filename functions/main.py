import hashlib
import re
import uuid
from datetime import datetime, timezone

from firebase_admin import firestore, initialize_app
from firebase_functions import https_fn

from domain.submission_criteria import evaluate_space_submission, public_space_from_submission


initialize_app()
db = firestore.client()
REGION = "us-central1"


def required_text(value, field, max_length):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > max_length:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"Invalid {field}.",
        )
    return value.strip()


def _hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _normalize(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _sanitize_proposal(data):
    if not isinstance(data, dict):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Proposal details are required.",
        )
    proposal = {
        "name": required_text(data.get("name"), "space name", 120),
        "category": required_text(data.get("category"), "category", 80),
        "spaceType": required_text(data.get("spaceType"), "space type", 20),
        "description": required_text(data.get("description"), "description", 1000),
        "state": required_text(data.get("state"), "state", 80),
        "district": required_text(data.get("district"), "district", 80),
        "locality": required_text(data.get("locality"), "locality", 100),
        "address": required_text(data.get("address"), "address", 300),
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "permittedActivities": data.get("permittedActivities") if isinstance(data.get("permittedActivities"), list) else [],
        "accessInformation": required_text(data.get("accessInformation"), "access information", 500),
        "capacity": data.get("capacity"),
        "privateBooking": data.get("privateBooking") is True,
        "hourlyPrice": data.get("hourlyPrice"),
        "openingHours": required_text(data.get("openingHours"), "opening hours", 200),
        "availability": data.get("availability") if isinstance(data.get("availability"), dict) else {},
        "lastConfirmedAt": required_text(data.get("lastConfirmedAt"), "last confirmed date", 10),
        "amenities": data.get("amenities") if isinstance(data.get("amenities"), dict) else {},
        "resources": data.get("resources") if isinstance(data.get("resources"), dict) else {},
        "seatingType": data.get("seatingType", "")[:80] if isinstance(data.get("seatingType"), str) else "",
        "atmosphere": data.get("atmosphere", "")[:80] if isinstance(data.get("atmosphere"), str) else "",
        "indoorOutdoor": data.get("indoorOutdoor", "")[:80] if isinstance(data.get("indoorOutdoor"), str) else "",
        "evidenceUrls": [url.strip() for url in data.get("evidenceUrls", []) if isinstance(url, str)]
        if isinstance(data.get("evidenceUrls"), list) else [],
    }
    return proposal


def _proposal_key(proposal):
    return _hash("|".join(_normalize(proposal[key]) for key in ("name", "district", "locality")))


def _request_ip(request):
    raw_request = request.raw_request
    address = raw_request.remote_addr or raw_request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if not address and raw_request.environ.get("FUNCTIONS_EMULATOR") == "true":
        return "emulator-local"
    if not address:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
            message="Could not safely check submission limits. Try again later.",
        )
    return address


def _find_potential_duplicates(proposal):
    proposals = (
        db.collection("space_submissions")
        .where("reviewStatus", "in", ["pending", "needs_changes", "approved"])
        .limit(300)
        .get()
    )
    approved_spaces = db.collection("spaces").where("status", "==", "approved").limit(500).get()
    candidates = [
        {"id": item.id, **item.to_dict()}
        for item in (*proposals, *approved_spaces)
    ]
    matches = [
        item["id"] for item in candidates
        if _normalize(item.get("name")) == _normalize(proposal.get("name"))
        and _normalize(item.get("district")) == _normalize(proposal.get("district"))
        and _normalize(item.get("locality")) == _normalize(proposal.get("locality"))
    ]
    return matches[:5]


@https_fn.on_call(region=REGION, enforce_app_check=True)
def submitSpaceProposal(request):
    proposal = _sanitize_proposal(request.data)
    possible_duplicates = _find_potential_duplicates(proposal)
    criteria_check = evaluate_space_submission(proposal, possible_duplicates)
    if not criteria_check["passed"]:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="The proposal did not meet required field checks.",
            details={"errors": criteria_check["errors"]},
        )

    today = datetime.now(timezone.utc).date().isoformat()
    ip_limit_ref = db.collection("space_submission_limits").document(_hash(_request_ip(request)))
    auth = request.auth
    uid_limit_ref = db.collection("space_submission_limits").document(f"uid-{auth.uid}") if auth else None
    duplicate_key = _proposal_key(proposal)
    duplicate_ref = db.collection("space_submission_dedupe").document(duplicate_key)
    submission_ref = db.collection("space_submissions").document()
    anonymous_id = None if auth else str(uuid.uuid4())
    transaction = db.transaction()

    @firestore.transactional
    def save_submission(current_transaction):
        limit_refs = [ip_limit_ref, *([uid_limit_ref] if uid_limit_ref else [])]
        snapshots = [current_transaction.get(reference) for reference in [*limit_refs, duplicate_ref]]
        limit_snapshots = snapshots[:-1]
        duplicate_snapshot = snapshots[-1]
        for snapshot in limit_snapshots:
            stored = snapshot.to_dict() or {}
            count = stored.get("count", 0) if stored.get("day") == today else 0
            maximum = 10 if snapshot.reference.id.startswith("uid-") else 5
            if count >= maximum:
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED,
                    message="Daily proposal limit reached. Please try again tomorrow.",
                )

        earlier_ids = (duplicate_snapshot.to_dict() or {}).get("submissionIds", [])
        duplicate_ids = list(dict.fromkeys([*possible_duplicates, *earlier_ids]))[:5]
        final_criteria = evaluate_space_submission(proposal, duplicate_ids)
        for snapshot in limit_snapshots:
            stored = snapshot.to_dict() or {}
            count = stored.get("count", 0) if stored.get("day") == today else 0
            current_transaction.set(snapshot.reference, {
                "day": today,
                "count": count + 1,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })
        current_transaction.set(duplicate_ref, {
            "submissionIds": [*earlier_ids, submission_ref.id][-50:],
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        current_transaction.create(submission_ref, {
            **proposal,
            "nameKey": duplicate_key,
            "submissionId": submission_ref.id,
            "submitterUid": auth.uid if auth else None,
            "anonymousId": anonymous_id,
            "submittedAt": firestore.SERVER_TIMESTAMP,
            "reviewStatus": "pending",
            "reviewNotes": "",
            "reviewerId": None,
            "reviewedAt": None,
            "criteriaCheck": final_criteria,
            "possibleDuplicate": bool(duplicate_ids),
        })
        return final_criteria

    saved_criteria = save_submission(transaction)
    return {
        "submissionId": submission_ref.id,
        "reviewStatus": "pending",
        "criteriaCheck": saved_criteria,
    }


def _require_admin(request):
    if not request.auth or request.auth.token.get("admin") is not True:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
            message="Administrator access is required.",
        )


@https_fn.on_call(region=REGION)
def reviewSpaceProposal(request):
    _require_admin(request)
    data = request.data if isinstance(request.data, dict) else {}
    submission_id = required_text(data.get("submissionId"), "submission ID", 100)
    decision = required_text(data.get("decision"), "review decision", 30)
    review_notes = data.get("reviewNotes", "").strip()[:2000] if isinstance(data.get("reviewNotes"), str) else ""
    duplicate_acknowledged = data.get("duplicateAcknowledged") is True
    if decision not in {"approved", "needs_changes", "rejected", "flag_duplicate"}:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Choose a valid review decision.",
        )
    if decision != "approved" and len(review_notes) < 3:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Add a clear reason for this review decision.",
        )

    submission_ref = db.collection("space_submissions").document(submission_id)
    review_ref = submission_ref.collection("review_history").document()
    approved_space_ref = db.collection("spaces").document(f"proposal_{submission_id}")
    transaction = db.transaction()

    @firestore.transactional
    def apply_review(current_transaction):
        snapshot = current_transaction.get(submission_ref)
        if not snapshot.exists:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message="The proposal no longer exists.")
        submission = snapshot.to_dict()
        if submission.get("reviewStatus") not in {"pending", "needs_changes"}:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="This proposal has already been reviewed.",
            )
        criteria_check = evaluate_space_submission(
            submission,
            (submission.get("criteriaCheck") or {}).get("possibleDuplicates", []),
        )
        if decision == "approved" and not criteria_check["passed"]:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Correct the failed field checks before approving.",
            )
        if decision == "approved" and submission.get("possibleDuplicate") and (
            not duplicate_acknowledged or len(review_notes) < 10
        ):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="Review the duplicate warning and add a reason before approving.",
            )

        next_status = "pending" if decision == "flag_duplicate" else decision
        if decision == "flag_duplicate":
            criteria_check["warnings"] = list(dict.fromkeys([
                *criteria_check["warnings"],
                "Flagged by an administrator as a possible duplicate.",
            ]))
        reviewed_at = datetime.now(timezone.utc)
        changes = {
            "reviewStatus": next_status,
            "reviewNotes": review_notes,
            "reviewerId": request.auth.uid,
            "reviewedAt": reviewed_at,
            "criteriaCheck": criteria_check,
            "possibleDuplicate": decision == "flag_duplicate" or submission.get("possibleDuplicate") is True,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        }
        if decision == "approved":
            existing_space = current_transaction.get(approved_space_ref)
            if existing_space.exists:
                raise https_fn.HttpsError(
                    code=https_fn.FunctionsErrorCode.ALREADY_EXISTS,
                    message="This proposal was already published.",
                )
            public_listing = public_space_from_submission(submission, submission_id, reviewed_at)
            public_listing["humanReview"] = {
                "approved": True,
                "reviewedAt": reviewed_at,
                "criteriaPassed": criteria_check["passed"],
            }
            public_listing["lastUpdated"] = firestore.SERVER_TIMESTAMP
            current_transaction.create(approved_space_ref, public_listing)

        current_transaction.update(submission_ref, changes)
        current_transaction.create(review_ref, {
            "decision": decision,
            "reviewNotes": review_notes,
            "reviewerId": request.auth.uid,
            "reviewedAt": reviewed_at,
            "criteriaCheck": criteria_check,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        return {"submissionId": submission_id, "reviewStatus": next_status, "published": decision == "approved"}

    return apply_review(transaction)


@https_fn.on_call(region=REGION)
def reviewOwnerSubmission(request):
    _require_admin(request)
    data = request.data if isinstance(request.data, dict) else {}
    submission_id = required_text(data.get("submissionId"), "submission ID", 100)
    decision = required_text(data.get("decision"), "review decision", 30)
    reviewer_note = data.get("reviewerNote", "").strip()[:1000] if isinstance(data.get("reviewerNote"), str) else ""
    if decision not in {"approved", "rejected"}:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Choose approve or reject.",
        )

    submission_ref = db.collection("owner_submissions").document(submission_id)
    space_ref = db.collection("spaces").document(submission_id)
    history_ref = submission_ref.collection("review_history").document()
    transaction = db.transaction()

    @firestore.transactional
    def apply_owner_review(current_transaction):
        snapshot = current_transaction.get(submission_ref)
        if not snapshot.exists or snapshot.to_dict().get("status") != "pending":
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.FAILED_PRECONDITION,
                message="This owner submission is no longer pending.",
            )
        submission = snapshot.to_dict()
        if decision == "approved" and submission.get("ownerUid") == request.auth.uid:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.PERMISSION_DENIED,
                message="An administrator cannot approve their own property.",
            )
        reviewed_at = datetime.now(timezone.utc)
        current_transaction.update(submission_ref, {
            "status": decision,
            "reviewerNote": reviewer_note,
            "reviewerId": request.auth.uid,
            "reviewedAt": reviewed_at,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        current_transaction.create(history_ref, {
            "decision": decision,
            "reviewerNote": reviewer_note,
            "reviewerId": request.auth.uid,
            "reviewedAt": reviewed_at,
            "createdAt": firestore.SERVER_TIMESTAMP,
        })
        if decision == "approved":
            private_fields = {
                "ownerUid", "ownerEmail", "submittedAt", "updatedAt", "reviewerNote",
                "reviewerId", "reviewedAt", "address", "latitude", "longitude", "coordinates",
            }
            public_listing = {
                key: value for key, value in submission.items()
                if key not in private_fields
            }
            photos = submission.get("photos")
            if not isinstance(photos, list):
                photos = submission.get("images")
            photos = [photo for photo in photos if isinstance(photo, str) and photo][:6] if isinstance(photos, list) else []
            public_listing.update({
                "photos": photos,
                "images": photos,
                "photoUrl": photos[0] if photos else "",
                "id": submission_id,
                "sourceSubmissionId": submission_id,
                "spaceType": "private",
                "status": "approved",
                "verified": False,
                "rating": None,
                "safetyRating": None,
                "availabilitySource": "owner-declared",
                "lastUpdated": firestore.SERVER_TIMESTAMP,
            })
            current_transaction.create(space_ref, public_listing)
        return {"submissionId": submission_id, "status": decision}

    return apply_owner_review(transaction)
