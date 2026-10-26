from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.database import get_db
from app.models import Company, User
from app.schemas import (
    StaffCreateRequest,
    StaffCreateResponse,
    StaffListItem,
    StaffListResponse,
)
from app.services.company_service import (
    generate_hr_id,
    generate_manager_id,
)


router = APIRouter(
    prefix="/users",
    tags=["User Management"],
)


# ============================================================
# CREATE HR / MANAGER
# ============================================================

@router.post(
    "/staff",
    response_model=StaffCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_staff(
    request: StaffCreateRequest,
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Only Admin can create HR / Manager
    # --------------------------------------------------------

    if current_user.role != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only an administrator can "
                "create HR or Manager accounts."
            ),
        )

    # --------------------------------------------------------
    # Validate role
    # --------------------------------------------------------

    requested_role = request.role.strip().lower()

    allowed_roles = {
        "hr",
        "manager",
    }

    if requested_role not in allowed_roles:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid role. Only 'hr' or "
                "'manager' can be created."
            ),
        )

    # --------------------------------------------------------
    # Find Admin's company
    # --------------------------------------------------------

    company = (
        db.query(Company)
        .filter(
            Company.id == current_user.company_id
        )
        .first()
    )

    if company is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company associated with admin was not found.",
        )

    if not company.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This company is inactive.",
        )

    # --------------------------------------------------------
    # Check duplicate email inside company
    # --------------------------------------------------------

    existing_email = (
        db.query(User)
        .filter(
            User.company_id == company.id,
            User.email
            == str(request.email).lower(),
        )
        .first()
    )

    if existing_email:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A user with this email already "
                "exists in this company."
            ),
        )

    # --------------------------------------------------------
    # Generate company-scoped unique User ID
    # --------------------------------------------------------

    if requested_role == "hr":

        new_user_id = generate_hr_id()

    else:

        new_user_id = generate_manager_id()

    while (
        db.query(User)
        .filter(
            User.user_id == new_user_id
        )
        .first()
        is not None
    ):

        if requested_role == "hr":

            new_user_id = generate_hr_id()

        else:

            new_user_id = generate_manager_id()

    # --------------------------------------------------------
    # Create User
    # --------------------------------------------------------

    new_user = User(
        user_id=new_user_id,

        full_name=request.full_name.strip(),

        email=str(request.email).lower(),

        password_hash=hash_password(
            request.password
        ),

        role=requested_role,

        company_id=company.id,

        is_active=True,
    )

    db.add(new_user)

    try:

        db.commit()

        db.refresh(new_user)

    except IntegrityError as error:

        db.rollback()

        print(
            "STAFF INTEGRITY ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Unable to create staff account "
                "because of a database conflict."
            ),
        )

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "STAFF DATABASE ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Database error while creating "
                "staff account."
            ),
        )

    # --------------------------------------------------------
    # Response
    # --------------------------------------------------------

    return StaffCreateResponse(

        message=(
            f"{requested_role.upper()} account "
            "created successfully."
        ),

        user_id=new_user.user_id,

        full_name=new_user.full_name,

        email=new_user.email,

        role=new_user.role,

        company_id=company.company_id,

        company_name=company.company_name,

        is_active=new_user.is_active,
    )


# ============================================================
# LIST HR / MANAGER
# ============================================================

@router.get(
    "/staff",
    response_model=StaffListResponse,
)
def get_staff(
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Only Admin can view staff management
    # --------------------------------------------------------

    if current_user.role != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only an administrator can "
                "view staff accounts."
            ),
        )

    # --------------------------------------------------------
    # Get Admin's company
    # --------------------------------------------------------

    company = (
        db.query(Company)
        .filter(
            Company.id == current_user.company_id
        )
        .first()
    )

    if company is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company was not found.",
        )

    # --------------------------------------------------------
    # Get only HR and Manager
    # --------------------------------------------------------

    staff_users = (
        db.query(User)
        .filter(
            User.company_id == company.id,
            User.role.in_(
                ["hr", "manager"]
            ),
        )
        .order_by(
            User.created_at.desc()
        )
        .all()
    )

    staff_list = []

    for user in staff_users:

        staff_list.append(
            StaffListItem(
                user_id=user.user_id,

                full_name=user.full_name,

                email=user.email,

                role=user.role,

                company_id=company.company_id,

                is_active=user.is_active,
            )
        )

    return StaffListResponse(

        company_id=company.company_id,

        company_name=company.company_name,

        total_staff=len(staff_list),

        staff=staff_list,
    )


# ============================================================
# DEACTIVATE STAFF
# ============================================================

@router.patch(
    "/staff/{user_id}/deactivate",
)
def deactivate_staff(
    user_id: str,
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # Admin only
    # --------------------------------------------------------

    if current_user.role != "admin":

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only an administrator can "
                "deactivate staff accounts."
            ),
        )

    # --------------------------------------------------------
    # Find staff ONLY inside Admin's company
    # --------------------------------------------------------

    staff_user = (
        db.query(User)
        .filter(
            User.user_id == user_id.upper(),
            User.company_id == current_user.company_id,
            User.role.in_(
                ["hr", "manager"]
            ),
        )
        .first()
    )

    if staff_user is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "HR or Manager account was not "
                "found in your company."
            ),
        )

    if not staff_user.is_active:

        return {
            "message": "This account is already inactive.",
            "user_id": staff_user.user_id,
        }

    staff_user.is_active = False

    try:

        db.commit()

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "DEACTIVATE STAFF ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to deactivate staff account.",
        )

    return {
        "message": "Staff account deactivated successfully.",
        "user_id": staff_user.user_id,
        "role": staff_user.role,
        "is_active": False,
    }