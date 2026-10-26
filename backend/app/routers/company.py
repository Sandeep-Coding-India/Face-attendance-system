from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.database import get_db
from app.models import Company, User
from app.schemas import (
    CompanyRegistrationRequest,
    CompanyRegistrationResponse,
)
from app.services.company_service import (
    generate_admin_id,
    generate_company_id,
)


router = APIRouter(
    prefix="/company",
    tags=["Company"],
)


@router.post(
    "/register",
    response_model=CompanyRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_company(
    request: CompanyRegistrationRequest,
    db: Session = Depends(get_db),
):

    # ---------------------------------------------------------
    # 1. Check company email
    # ---------------------------------------------------------

    existing_company = (
        db.query(Company)
        .filter(
            Company.email == str(request.company_email).lower()
        )
        .first()
    )

    if existing_company:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A company with this email already exists.",
        )

    # ---------------------------------------------------------
    # 2. Check admin email
    # ---------------------------------------------------------

    existing_admin = (
        db.query(User)
        .filter(
            User.email == str(request.admin_email).lower()
        )
        .first()
    )

    if existing_admin:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An admin with this email already exists.",
        )

    # ---------------------------------------------------------
    # 3. Generate unique Company ID
    # ---------------------------------------------------------

    company_id = generate_company_id()

    while (
        db.query(Company)
        .filter(
            Company.company_id == company_id
        )
        .first()
        is not None
    ):

        company_id = generate_company_id()

    # ---------------------------------------------------------
    # 4. Generate unique Admin ID
    # ---------------------------------------------------------

    admin_id = generate_admin_id()

    while (
        db.query(User)
        .filter(
            User.user_id == admin_id
        )
        .first()
        is not None
    ):

        admin_id = generate_admin_id()

    # ---------------------------------------------------------
    # 5. Create Company
    # ---------------------------------------------------------

    company = Company(
        company_id=company_id,
        company_name=request.company_name.strip(),
        email=str(request.company_email).lower(),
        phone=(
            request.company_phone.strip()
            if request.company_phone
            else None
        ),
        address=(
            request.company_address.strip()
            if request.company_address
            else None
        ),
        is_active=True,
    )

    db.add(company)

    try:

        # Get company primary key before creating user
        db.flush()

    except IntegrityError:

        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company information already exists.",
        )

    except SQLAlchemyError as error:

        db.rollback()

        print("COMPANY DATABASE ERROR:", error)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating company.",
        )

    # ---------------------------------------------------------
    # 6. Create Admin
    # ---------------------------------------------------------

    try:

        admin = User(
            user_id=admin_id,
            full_name=request.admin_full_name.strip(),
            email=str(request.admin_email).lower(),
            password_hash=hash_password(
                request.admin_password
            ),
            role="admin",
            company_id=company.id,
            is_active=True,
        )

        db.add(admin)

        db.commit()

    except IntegrityError as error:

        db.rollback()

        print("ADMIN INTEGRITY ERROR:", error)

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Admin account already exists or "
                "violates a database constraint."
            ),
        )

    except SQLAlchemyError as error:

        db.rollback()

        print("ADMIN DATABASE ERROR:", error)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating admin.",
        )

    except Exception as error:

        db.rollback()

        print("ADMIN CREATION ERROR:", error)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create admin account.",
        )

    # ---------------------------------------------------------
    # 7. Refresh database objects
    # ---------------------------------------------------------

    db.refresh(company)
    db.refresh(admin)

    # ---------------------------------------------------------
    # 8. Return response
    # ---------------------------------------------------------

    return CompanyRegistrationResponse(

        message=(
            "Company and admin account "
            "created successfully."
        ),

        company_id=company.company_id,

        company_name=company.company_name,

        admin_id=admin.user_id,

        admin_name=admin.full_name,

        admin_email=admin.email,

        role=admin.role,
    )