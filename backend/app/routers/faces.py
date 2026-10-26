import json
import math

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Company,
    Employee,
    FaceProfile,
    User,
)
from app.schemas import (
    FaceEnrollmentResponse,
    FaceProfileResponse,
    FaceRecognitionResponse,
)
from app.core.dependencies import get_current_user

from app.services.face_service import (
    MODEL_NAME,
    extract_single_face,
    recognize_face,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/faces",
    tags=["Face Recognition"],
)


# ============================================================
# ALLOWED ROLES
# ============================================================

ALLOWED_ROLES = {
    "admin",
    "hr",
    "manager",
}


# ============================================================
# CHECK USER ACCESS
# ============================================================

def check_face_access(
    current_user: User,
):
    """
    Only Admin, HR and Manager can use
    face enrollment and recognition.
    """

    role = str(
        current_user.role
    ).lower()

    if role not in ALLOWED_ROLES:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Admin, HR or Manager "
                "can access face recognition."
            ),
        )


# ============================================================
# GET CURRENT COMPANY
# ============================================================

def get_company(
    current_user: User,
    db: Session,
) -> Company:

    company = (
        db.query(Company)
        .filter(
            Company.id
            == current_user.company_id
        )
        .first()
    )

    if company is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    # --------------------------------------------------------
    # Check company active status
    # --------------------------------------------------------

    if hasattr(company, "is_active"):

        if not company.is_active:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Company is inactive.",
            )

    return company


# ============================================================
# VALIDATE IMAGE
# ============================================================

async def read_and_validate_image(
    file: UploadFile,
) -> bytes:

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if file.content_type not in allowed_types:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid image format. "
                "Only JPG, PNG and WEBP are allowed."
            ),
        )

    image_bytes = await file.read()

    if not image_bytes:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image received.",
        )

    # Maximum 10 MB
    max_size = 10 * 1024 * 1024

    if len(image_bytes) > max_size:

        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Image is too large. "
                "Maximum allowed size is 10 MB."
            ),
        )

    return image_bytes


# ============================================================
# ENROLL FACE
# ============================================================

@router.post(
    "/enroll/{employee_id}",
    response_model=FaceEnrollmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def enroll_face(
    employee_id: str,

    file: UploadFile = File(...),

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # ACCESS CONTROL
    # --------------------------------------------------------

    check_face_access(
        current_user
    )

    # --------------------------------------------------------
    # CURRENT COMPANY
    # --------------------------------------------------------

    company = get_company(
        current_user,
        db,
    )

    # --------------------------------------------------------
    # IMAGE
    # --------------------------------------------------------

    image_bytes = await read_and_validate_image(
        file
    )

    # --------------------------------------------------------
    # FIND EMPLOYEE
    # --------------------------------------------------------

    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id.upper(),

            Employee.company_id
            == company.id,
        )
        .first()
    )

    if employee is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Employee not found in "
                "your company."
            ),
        )

    # --------------------------------------------------------
    # ACTIVE EMPLOYEE CHECK
    # --------------------------------------------------------

    if hasattr(employee, "is_active"):

        if not employee.is_active:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Face cannot be registered "
                    "for an inactive employee."
                ),
            )

    # --------------------------------------------------------
    # FACE EXTRACTION
    # --------------------------------------------------------

    try:

        face_data = extract_single_face(
            image_bytes
        )

    except ValueError as error:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(error),
        )

    except Exception as error:

        print(
            "FACE EXTRACTION ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Face processing failed. "
                "Please try again."
            ),
        )

    # --------------------------------------------------------
    # FACE QUALITY
    # --------------------------------------------------------

    face_quality = float(
        face_data.get(
            "face_quality",
            0,
        )
    )

    if face_quality < 55:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Face quality is too low. "
                "Please improve lighting and "
                "move closer to the camera."
            ),
        )

    # --------------------------------------------------------
    # DUPLICATE FACE PROTECTION
    # --------------------------------------------------------
    # IMPORTANT: use the SAME recognition function that is used
    # by live attendance recognition. This avoids using a different
    # distance formula during enrollment.
    #
    # If the new face is recognized against ANY OTHER employee's
    # registered profiles, registration is rejected.

    other_profiles = (
        db.query(FaceProfile)
        .filter(
            FaceProfile.company_id == company.id,
            FaceProfile.is_active.is_(True),
            FaceProfile.employee_id != employee.id,
        )
        .all()
    )

    if other_profiles:

        employee_profile_ids = {}

        for profile in other_profiles:
            employee_profile_ids.setdefault(
                profile.employee_id,
                [],
            ).append(profile)

        duplicate_employee_id = None

        for other_employee_id, profiles in employee_profile_ids.items():

            try:
                duplicate_check = recognize_face(
                    image_bytes,
                    profiles,
                )
            except ValueError:
                continue
            except Exception as error:
                print(
                    "DUPLICATE FACE CHECK ERROR:",
                    repr(error),
                )
                continue

            if duplicate_check.get("match") is not None:
                duplicate_employee_id = other_employee_id
                break

        if duplicate_employee_id is not None:

            duplicate_employee = (
                db.query(Employee)
                .filter(
                    Employee.id == duplicate_employee_id,
                    Employee.company_id == company.id,
                )
                .first()
            )

            duplicate_name = (
                duplicate_employee.full_name
                if duplicate_employee
                else "another employee"
            )

            duplicate_code = (
                duplicate_employee.employee_id
                if duplicate_employee
                else "another employee"
            )

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This face is already registered to "
                    f"{duplicate_name} ({duplicate_code}). "
                    "The same face cannot be registered to two employees."
                ),
            )

    # --------------------------------------------------------
    # EXISTING SAMPLES
    # --------------------------------------------------------

    existing_samples = (
        db.query(FaceProfile)
        .filter(
            FaceProfile.employee_id
            == employee.id,

            FaceProfile.company_id
            == company.id,

            FaceProfile.is_active.is_(True),
        )
        .count()
    )

    MAX_SAMPLES = 5

    if existing_samples >= MAX_SAMPLES:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Maximum 5 face samples are "
                "already registered for this employee."
            ),
        )

    sample_number = (
        existing_samples + 1
    )

    # --------------------------------------------------------
    # CREATE FACE PROFILE
    # --------------------------------------------------------

    profile = FaceProfile(

        employee_id=employee.id,

        company_id=company.id,

        embedding=face_data[
            "embedding"
        ],

        model_name=MODEL_NAME,

        detection_score=str(
            face_data[
                "detection_score"
            ]
        ),

        face_quality=str(
            face_data[
                "face_quality"
            ]
        ),

        image_quality=str(
            face_data[
                "image_quality"
            ]
        ),

        sample_number=sample_number,

        is_active=True,
    )

    db.add(profile)

    # --------------------------------------------------------
    # UPDATE EMPLOYEE
    # --------------------------------------------------------

    if hasattr(
        employee,
        "face_registered",
    ):

        employee.face_registered = True

    # --------------------------------------------------------
    # SAVE DATABASE
    # --------------------------------------------------------

    try:

        db.commit()

        db.refresh(profile)

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "FACE DATABASE ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Unable to save face profile."
            ),
        )

    # --------------------------------------------------------
    # RESPONSE
    # --------------------------------------------------------

    return FaceEnrollmentResponse(

        message=(
            "Face registered successfully."
        ),

        employee_id=employee.employee_id,

        employee_name=employee.full_name,

        company_id=company.company_id,

        sample_number=sample_number,

        face_quality=float(
            face_data[
                "face_quality"
            ]
        ),

        detection_score=float(
            face_data[
                "detection_score"
            ]
        ),

        image_quality=float(
            face_data[
                "image_quality"
            ]
        ),

        face_registered=True,
    )


# ============================================================
# GET FACE PROFILE
# ============================================================

@router.get(
    "/employee/{employee_id}",
    response_model=FaceProfileResponse,
)
def get_face_profile(
    employee_id: str,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # ACCESS
    # --------------------------------------------------------

    check_face_access(
        current_user
    )

    # --------------------------------------------------------
    # COMPANY
    # --------------------------------------------------------

    company = get_company(
        current_user,
        db,
    )

    # --------------------------------------------------------
    # EMPLOYEE
    # --------------------------------------------------------

    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id.upper(),

            Employee.company_id
            == company.id,
        )
        .first()
    )

    if employee is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )

    # --------------------------------------------------------
    # COUNT SAMPLES
    # --------------------------------------------------------

    total_samples = (
        db.query(FaceProfile)
        .filter(
            FaceProfile.employee_id
            == employee.id,

            FaceProfile.company_id
            == company.id,

            FaceProfile.is_active.is_(True),
        )
        .count()
    )

    return FaceProfileResponse(

        employee_id=employee.employee_id,

        employee_name=employee.full_name,

        company_id=company.company_id,

        total_samples=total_samples,

        face_registered=(
            total_samples > 0
        ),
    )


# ============================================================
# LIVE FACE RECOGNITION
# ============================================================

@router.post(
    "/recognize",
    response_model=FaceRecognitionResponse,
)
async def recognize_employee_face(

    file: UploadFile = File(...),

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # ACCESS CONTROL
    # --------------------------------------------------------

    check_face_access(
        current_user
    )

    # --------------------------------------------------------
    # CURRENT COMPANY
    # --------------------------------------------------------

    company = get_company(
        current_user,
        db,
    )

    # --------------------------------------------------------
    # READ IMAGE
    # --------------------------------------------------------

    image_bytes = await read_and_validate_image(
        file
    )

    # --------------------------------------------------------
    # GET COMPANY FACE PROFILES
    # --------------------------------------------------------

    face_profiles = (
        db.query(FaceProfile)
        .filter(
            FaceProfile.company_id
            == company.id,

            FaceProfile.is_active.is_(True),
        )
        .all()
    )

    if not face_profiles:

        return FaceRecognitionResponse(

            recognized=False,

            employee_id=None,

            employee_name=None,

            company_id=None,

            confidence=None,

            similarity=None,

            face_quality=None,

            detection_score=None,

            message=(
                "No registered faces found "
                "for this company."
            ),
        )

    # --------------------------------------------------------
    # RECOGNITION
    # --------------------------------------------------------
    # First run the normal recognizer.
    # Then independently test each employee's profiles with the
    # SAME recognizer. If more than one employee matches, the face
    # is ambiguous (usually caused by old duplicate registrations).
    # In that case attendance MUST NOT be marked.

    try:

        recognition = recognize_face(
            image_bytes,
            face_profiles,
        )

    except ValueError as error:

        return FaceRecognitionResponse(

            recognized=False,

            employee_id=None,

            employee_name=None,

            company_id=None,

            confidence=None,

            similarity=None,

            face_quality=None,

            detection_score=None,

            message=str(error),
        )

    except Exception as error:

        print(
            "FACE RECOGNITION ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Face recognition failed."
            ),
        )

    # --------------------------------------------------------
    # AMBIGUOUS FACE PROTECTION
    # --------------------------------------------------------

    matched_employee_ids = []

    profiles_by_employee = {}

    for profile in face_profiles:
        profiles_by_employee.setdefault(
            profile.employee_id,
            [],
        ).append(profile)

    for employee_key, employee_profiles in profiles_by_employee.items():

        try:
            employee_check = recognize_face(
                image_bytes,
                employee_profiles,
            )
        except ValueError:
            continue
        except Exception as error:
            print(
                "EMPLOYEE FACE CHECK ERROR:",
                repr(error),
            )
            continue

        if employee_check.get("match") is not None:
            matched_employee_ids.append(employee_key)

    if len(set(matched_employee_ids)) > 1:

        matched_employees = (
            db.query(Employee)
            .filter(
                Employee.id.in_(set(matched_employee_ids)),
                Employee.company_id == company.id,
            )
            .all()
        )

        names = ", ".join(
            f"{item.full_name} ({item.employee_id})"
            for item in matched_employees
        )

        return FaceRecognitionResponse(

            recognized=False,

            employee_id=None,

            employee_name=None,

            company_id=company.company_id,

            confidence=None,

            similarity=None,

            face_quality=None,

            detection_score=None,

            message=(
                "This face is registered to multiple employees. "
                "Attendance cannot be marked until duplicate face "
                f"registrations are removed: {names}"
            ),
        )

    # --------------------------------------------------------
    # EXTRACT DATA
    # --------------------------------------------------------

    face_data = recognition.get(
        "face_data"
    )

    match = recognition.get(
        "match"
    )

    if not face_data:

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Face recognition returned "
                "invalid data."
            ),
        )

    # --------------------------------------------------------
    # NO MATCH
    # --------------------------------------------------------

    if match is None:

        return FaceRecognitionResponse(

            recognized=False,

            employee_id=None,

            employee_name=None,

            company_id=None,

            confidence=None,

            similarity=None,

            face_quality=float(
                face_data.get(
                    "face_quality",
                    0,
                )
            ),

            detection_score=float(
                face_data.get(
                    "detection_score",
                    0,
                )
            ),

            message=(
                "Face detected, but employee "
                "could not be identified."
            ),
        )

    # --------------------------------------------------------
    # MATCHED PROFILE
    # --------------------------------------------------------

    profile = match.get(
        "profile"
    )

    if profile is None:

        return FaceRecognitionResponse(

            recognized=False,

            message=(
                "Face match profile is invalid."
            ),
        )

    # --------------------------------------------------------
    # GET EMPLOYEE
    # --------------------------------------------------------

    employee = (
        db.query(Employee)
        .filter(
            Employee.id
            == profile.employee_id,

            Employee.company_id
            == company.id,
        )
        .first()
    )

    if employee is None:

        return FaceRecognitionResponse(

            recognized=False,

            employee_id=None,

            employee_name=None,

            company_id=None,

            confidence=None,

            similarity=None,

            face_quality=float(
                face_data.get(
                    "face_quality",
                    0,
                )
            ),

            detection_score=float(
                face_data.get(
                    "detection_score",
                    0,
                )
            ),

            message=(
                "Matched employee was not found "
                "in this company."
            ),
        )

    # --------------------------------------------------------
    # ACTIVE EMPLOYEE
    # --------------------------------------------------------

    if hasattr(
        employee,
        "is_active",
    ):

        if not employee.is_active:

            return FaceRecognitionResponse(

                recognized=False,

                employee_id=None,

                employee_name=None,

                company_id=None,

                confidence=None,

                similarity=None,

                face_quality=float(
                    face_data.get(
                        "face_quality",
                        0,
                    )
                ),

                detection_score=float(
                    face_data.get(
                        "detection_score",
                        0,
                    )
                ),

                message=(
                    "Employee is inactive."
                ),
            )

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    return FaceRecognitionResponse(

        recognized=True,

        employee_id=employee.employee_id,

        employee_name=employee.full_name,

        company_id=company.company_id,

        confidence=float(
            match.get(
                "confidence",
                0,
            )
        ),

        similarity=float(
            match.get(
                "similarity",
                0,
            )
        ),

        face_quality=float(
            face_data.get(
                "face_quality",
                0,
            )
        ),

        detection_score=float(
            face_data.get(
                "detection_score",
                0,
            )
        ),

        message=(
            "Employee recognized successfully."
        ),
    )