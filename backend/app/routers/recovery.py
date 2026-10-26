from datetime import timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)

from passlib.context import CryptContext

from sqlalchemy import text

from app.core.security import hash_password

from sqlalchemy.orm import Session

from app.database import get_db

from app.models import User

from app.recovery_otp import RecoveryOTP

from app.recovery_schemas import (
    RecoveryRequest,
    VerifyOTPRequest,
    ResetPasswordRequest,
)

from app.services.recovery_service import (
    OTP_EXPIRY_MINUTES,
    OTP_RESEND_SECONDS,
    OTP_MAX_ATTEMPTS,
    digest,
    verify_digest,
    generate_otp,
    generate_reset_token,
    normalize_email,
    normalize_phone,
    mask_email,
    mask_phone,
    send_email_otp,
    send_sms_otp,
    utc_now,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/auth/forgot-password",
    tags=["Account Recovery"],
)


# ============================================================
# PASSWORD HASH
# ============================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
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
# USER MODEL COLUMNS
# ============================================================

def get_user_columns():

    return set(
        User.__table__.columns.keys()
    )


# ============================================================
# GET USER LOGIN ID COLUMN
# ============================================================

def get_login_id_column():

    columns = get_user_columns()

    possible_columns = [
        "login_id",
        "unique_login_id",
        "username",
        "user_code",
        "admin_id",
    ]

    for column_name in possible_columns:

        if column_name in columns:

            return getattr(
                User,
                column_name,
            )

    return None


# ============================================================
# ENSURE PHONE COLUMN
# ============================================================

def ensure_phone_column(
    db: Session,
):

    try:

        db.execute(
            text(
                """
                ALTER TABLE users
                ADD COLUMN IF NOT EXISTS
                phone VARCHAR(30)
                """
            )
        )

        db.commit()

    except Exception:

        db.rollback()


# ============================================================
# COMPANY CHECK
# ============================================================

def check_company(
    user,
    requested_company_id: str,
):

    requested = (
        requested_company_id
        .strip()
        .lower()
    )

    columns = get_user_columns()

    # --------------------------------------------------------
    # company_id
    # --------------------------------------------------------

    if "company_id" in columns:

        user_company_id = getattr(
            user,
            "company_id",
            None,
        )

        if user_company_id is None:

            return False

        if (
            str(user_company_id)
            .strip()
            .lower()
            == requested
        ):

            return True

        # If requested company ID is an
        # external company code, try
        # companies table.
        try:

            company_row = db_company_lookup(
                requested_company_id
            )

            if company_row:

                if str(
                    company_row["id"]
                ) == str(
                    user_company_id
                ):

                    return True

        except Exception:

            pass

        return False

    # --------------------------------------------------------
    # Old project compatibility:
    # company column
    # --------------------------------------------------------

    if "company" in columns:

        value = getattr(
            user,
            "company",
            None,
        )

        if value is None:

            return False

        return (
            str(value)
            .strip()
            .lower()
            == requested
        )

    # --------------------------------------------------------
    # No company field
    # --------------------------------------------------------

    return True


# ============================================================
# COMPANY LOOKUP
# ============================================================

def db_company_lookup(
    requested_company_id: str,
):

    from app.database import engine

    with engine.connect() as connection:

        columns_result = connection.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'companies'
                """
            )
        )

        columns = {
            row[0]
            for row in columns_result
        }

        possible_codes = [
            "company_id",
            "company_code",
            "unique_id",
            "code",
            "company_uid",
        ]

        code_column = None

        for name in possible_codes:

            if name in columns:

                code_column = name
                break

        if code_column is None:

            return None

        query = text(
            f"""
            SELECT id
            FROM companies
            WHERE LOWER(CAST({code_column} AS TEXT))
                  = LOWER(:company_id)
            LIMIT 1
            """
        )

        row = connection.execute(
            query,
            {
                "company_id":
                    requested_company_id.strip()
            },
        ).mappings().first()

        return row


# ============================================================
# FIND USER
# ============================================================

def find_user(
    db: Session,
    payload,
):

    method = payload.recovery_method

    # --------------------------------------------------------
    # Normalize target
    # --------------------------------------------------------

    if method == "email":

        target = normalize_email(
            payload.recovery_value
        )

    else:

        target = normalize_phone(
            payload.recovery_value
        )

        ensure_phone_column(db)

    # --------------------------------------------------------
    # Email
    # --------------------------------------------------------

    if method == "email":

        user = (
            db.query(User)
            .filter(
                User.email == target
            )
            .first()
        )

        if user:

            if check_company(
                user,
                payload.company_id,
            ):

                return user, target

    # --------------------------------------------------------
    # Phone
    # --------------------------------------------------------

    if method == "phone":

        columns = get_user_columns()

        # User model has phone
        if "phone" in columns:

            user = (
                db.query(User)
                .filter(
                    User.phone == target
                )
                .first()
            )

            if user:

                if check_company(
                    user,
                    payload.company_id,
                ):

                    return user, target

        # Fallback raw SQL
        try:

            row = db.execute(
                text(
                    """
                    SELECT id
                    FROM users
                    WHERE phone = :phone
                    LIMIT 1
                    """
                ),
                {
                    "phone": target
                },
            ).first()

            if row:

                user = (
                    db.query(User)
                    .filter(
                        User.id == row[0]
                    )
                    .first()
                )

                if user:

                    if check_company(
                        user,
                        payload.company_id,
                    ):

                        return user, target

        except Exception:

            pass

    return None, target


# ============================================================
# CHECK MANAGEMENT ACCOUNT
# ============================================================

def validate_management_user(
    user,
):

    if user is None:

        raise HTTPException(
            status_code=404,
            detail=(
                "No matching account was found "
                "for the supplied company and recovery details."
            ),
        )

    role = str(
        getattr(
            user,
            "role",
            "",
        )
    ).strip().lower()

    if role not in ALLOWED_ROLES:

        raise HTTPException(
            status_code=403,
            detail=(
                "Only Admin, HR and Manager "
                "accounts can use account recovery."
            ),
        )

    if hasattr(
        user,
        "is_active",
    ):

        if not user.is_active:

            raise HTTPException(
                status_code=403,
                detail="This account is inactive.",
            )

    return user


# ============================================================
# ISSUE OTP
# ============================================================

def issue_otp(
    db: Session,
    user,
    payload,
    target,
    purpose,
):

    now = utc_now()

    # --------------------------------------------------------
    # Check resend time
    # --------------------------------------------------------

    previous = (
        db.query(RecoveryOTP)
        .filter(
            RecoveryOTP.user_id
            == user.id,

            RecoveryOTP.purpose
            == purpose,

            RecoveryOTP.used
            == False,
        )
        .order_by(
            RecoveryOTP.created_at.desc()
        )
        .first()
    )

    if previous:

        elapsed = (
            now
            - previous.created_at
        ).total_seconds()

        if elapsed < OTP_RESEND_SECONDS:

            remaining = int(
                OTP_RESEND_SECONDS
                - elapsed
            )

            raise HTTPException(
                status_code=429,
                detail=(
                    f"Please wait {remaining} "
                    "seconds before requesting "
                    "another OTP."
                ),
            )

    # --------------------------------------------------------
    # Invalidate previous OTPs
    # --------------------------------------------------------

    (
        db.query(RecoveryOTP)
        .filter(
            RecoveryOTP.user_id
            == user.id,

            RecoveryOTP.purpose
            == purpose,

            RecoveryOTP.used
            == False,
        )
        .update(
            {
                RecoveryOTP.used: True
            },
            synchronize_session=False,
        )
    )

    # --------------------------------------------------------
    # Generate OTP
    # --------------------------------------------------------

    otp = generate_otp()

    recovery = RecoveryOTP(
        user_id=user.id,

        purpose=purpose,

        channel=payload.recovery_method,

        target_hash=digest(target),

        otp_hash=digest(otp),

        expires_at=(
            now
            + timedelta(
                minutes=OTP_EXPIRY_MINUTES
            )
        ),

        attempts=0,

        used=False,
    )

    db.add(recovery)

    db.commit()

    # --------------------------------------------------------
    # Send
    # --------------------------------------------------------

    if payload.recovery_method == "email":

        send_email_otp(
            target,
            otp,
            purpose,
        )

        masked = mask_email(
            target
        )

    else:

        send_sms_otp(
            target,
            otp,
            purpose,
        )

        masked = mask_phone(
            target
        )

    return masked


# ============================================================
# GET ACTIVE OTP
# ============================================================

def get_active_otp(
    db: Session,
    user,
    payload,
    purpose,
):

    if payload.recovery_method == "email":

        target = normalize_email(
            payload.recovery_value
        )

    else:

        target = normalize_phone(
            payload.recovery_value
        )

    recovery = (
        db.query(RecoveryOTP)
        .filter(
            RecoveryOTP.user_id
            == user.id,

            RecoveryOTP.purpose
            == purpose,

            RecoveryOTP.used
            == False,

            RecoveryOTP.target_hash
            == digest(target),
        )
        .order_by(
            RecoveryOTP.created_at.desc()
        )
        .first()
    )

    if recovery is None:

        raise HTTPException(
            status_code=400,
            detail=(
                "No active OTP found. "
                "Please request a new OTP."
            ),
        )

    # --------------------------------------------------------
    # Expiry
    # --------------------------------------------------------

    if recovery.expires_at < utc_now():

        recovery.used = True

        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "OTP has expired. "
                "Please request a new OTP."
            ),
        )

    # --------------------------------------------------------
    # Attempts
    # --------------------------------------------------------

    if (
        recovery.attempts
        >= OTP_MAX_ATTEMPTS
    ):

        recovery.used = True

        db.commit()

        raise HTTPException(
            status_code=429,
            detail=(
                "Too many incorrect OTP "
                "attempts. Please request "
                "a new OTP."
            ),
        )

    # --------------------------------------------------------
    # Count attempt
    # --------------------------------------------------------

    recovery.attempts += 1

    if not verify_digest(
        payload.otp,
        recovery.otp_hash,
    ):

        if (
            recovery.attempts
            >= OTP_MAX_ATTEMPTS
        ):

            recovery.used = True

        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid OTP.",
        )

    recovery.verified_at = utc_now()

    db.commit()

    return recovery


# ============================================================
# FORGOT PASSWORD
# ============================================================

@router.post(
    "/request-otp"
)
def request_password_otp(
    payload: RecoveryRequest,
    db: Session = Depends(get_db),
):

    user, target = find_user(
        db,
        payload,
    )

    user = validate_management_user(
        user
    )

    masked = issue_otp(
        db,
        user,
        payload,
        target,
        "password",
    )

    return {
        "success": True,

        "message": (
            f"Verification OTP sent to {masked}."
        ),

        "masked_destination": masked,

        "expires_in_seconds":
            OTP_EXPIRY_MINUTES * 60,
    }


# ============================================================
# VERIFY PASSWORD OTP
# ============================================================

@router.post(
    "/verify-otp"
)
def verify_password_otp(
    payload: VerifyOTPRequest,
    db: Session = Depends(get_db),
):

    user, _ = find_user(
        db,
        payload,
    )

    user = validate_management_user(
        user
    )

    recovery = get_active_otp(
        db,
        user,
        payload,
        "password",
    )

    reset_token = (
        generate_reset_token()
    )

    recovery.reset_token_hash = digest(
        reset_token
    )

    db.commit()

    return {
        "success": True,

        "message": (
            "OTP verified successfully. "
            "You can now create a new password."
        ),

        "reset_token": reset_token,
    }


# ============================================================
# RESET PASSWORD
# ============================================================

@router.post(
    "/reset"
)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):

    user, target = find_user(
        db,
        payload,
    )

    user = validate_management_user(
        user
    )

    recovery = (
        db.query(RecoveryOTP)
        .filter(
            RecoveryOTP.user_id
            == user.id,

            RecoveryOTP.purpose
            == "password",

            RecoveryOTP.used
            == False,

            RecoveryOTP.target_hash
            == digest(target),

            RecoveryOTP.reset_token_hash
            == digest(
                payload.reset_token
            ),
        )
        .order_by(
            RecoveryOTP.created_at.desc()
        )
        .first()
    )

    if recovery is None:

        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid recovery session. "
                "Please verify the OTP again."
            ),
        )

    if recovery.expires_at < utc_now():

        recovery.used = True

        db.commit()

        raise HTTPException(
            status_code=400,
            detail=(
                "Recovery session expired. "
                "Please request a new OTP."
            ),
        )

    # --------------------------------------------------------
    # Password update
    # --------------------------------------------------------

    user.password_hash = hash_password(
        payload.new_password
    )

    recovery.used = True

    recovery.reset_token_hash = None

    db.commit()

    return {
        "success": True,

        "message": (
            "Password changed successfully. "
            "You can now sign in."
        ),
    }


# ============================================================
# FORGOT LOGIN ID
# ============================================================

@router.post(
    "/login-id/request-otp"
)
def request_login_id_otp(
    payload: RecoveryRequest,
    db: Session = Depends(get_db),
):

    user, target = find_user(
        db,
        payload,
    )

    user = validate_management_user(
        user
    )

    masked = issue_otp(
        db,
        user,
        payload,
        target,
        "login_id",
    )

    return {
        "success": True,

        "message": (
            f"Verification OTP sent to {masked}."
        ),

        "masked_destination": masked,

        "expires_in_seconds":
            OTP_EXPIRY_MINUTES * 60,
    }


# ============================================================
# VERIFY LOGIN ID OTP
# ============================================================

@router.post(
    "/login-id/verify-otp"
)
def verify_login_id_otp(
    payload: VerifyOTPRequest,
    db: Session = Depends(get_db),
):

    user, _ = find_user(
        db,
        payload,
    )

    user = validate_management_user(
        user
    )

    recovery = get_active_otp(
        db,
        user,
        payload,
        "login_id",
    )

    login_column = (
        get_login_id_column()
    )

    if login_column is None:

        raise HTTPException(
            status_code=500,
            detail=(
                "Login ID field was not found "
                "in the existing User model."
            ),
        )

    login_id = getattr(
        user,
        login_column.key,
        None,
    )

    if not login_id:

        raise HTTPException(
            status_code=500,
            detail=(
                "This account does not have "
                "a Login ID configured."
            ),
        )

    recovery.used = True

    db.commit()

    return {
        "success": True,

        "message": (
            "Login ID recovered successfully."
        ),

        "login_id": login_id,
    }