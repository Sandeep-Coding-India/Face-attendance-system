from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    verify_password,
)
from app.database import get_db
from app.models import Company, User
from app.schemas import (
    CurrentUserResponse,
    LoginRequest,
    LoginResponse,
)


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/login",
    response_model=LoginResponse,
)
def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):

    # ---------------------------------------------------------
    # 1. Find company
    # ---------------------------------------------------------

    company = (
        db.query(Company)
        .filter(
            Company.company_id
            == request.company_id.strip().upper()
        )
        .first()
    )

    if company is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company ID or login credentials.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # ---------------------------------------------------------
    # 2. Check company status
    # ---------------------------------------------------------

    if not company.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This company account is inactive.",
        )

    # ---------------------------------------------------------
    # 3. Find user inside THIS company
    # ---------------------------------------------------------

    user = (
        db.query(User)
        .filter(
            User.user_id
            == request.login_id.strip().upper(),
            User.company_id
            == company.id,
        )
        .first()
    )

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company ID or login credentials.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # ---------------------------------------------------------
    # 4. Only Admin, HR and Manager can login
    # ---------------------------------------------------------

    allowed_roles = {
        "admin",
        "hr",
        "manager",
    }

    if user.role not in allowed_roles:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account type cannot login.",
        )

    # ---------------------------------------------------------
    # 5. Check user status
    # ---------------------------------------------------------

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This user account is inactive.",
        )

    # ---------------------------------------------------------
    # 6. Verify password
    # ---------------------------------------------------------

    password_valid = verify_password(
        request.password,
        user.password_hash,
    )

    if not password_valid:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid company ID or login credentials.",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # ---------------------------------------------------------
    # 7. Create JWT
    # ---------------------------------------------------------

    access_token = create_access_token(
        {
            "sub": str(user.id),

            "user_id": user.user_id,

            "role": user.role,

            "company_pk": company.id,

            "company_id": company.company_id,
        }
    )

    # ---------------------------------------------------------
    # 8. Return login response
    # ---------------------------------------------------------

    return LoginResponse(
        message="Login successful.",

        access_token=access_token,

        token_type="bearer",

        user_id=user.user_id,

        full_name=user.full_name,

        role=user.role,

        company_id=company.company_id,

        company_name=company.company_name,
    )


@router.get(
    "/me",
    response_model=CurrentUserResponse,
)
def get_my_profile(
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

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
            detail="Company associated with this user was not found.",
        )

    return CurrentUserResponse(
        user_id=current_user.user_id,

        full_name=current_user.full_name,

        email=current_user.email,

        role=current_user.role,

        company_id=company.company_id,

        company_name=company.company_name,

        is_active=current_user.is_active,
    )