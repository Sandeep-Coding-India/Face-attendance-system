from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings


# ============================================================
# PASSWORD CONTEXT
# ============================================================
# IMPORTANT:
# Existing FaceAttend database passwords are stored using bcrypt.
# Do NOT change this to pbkdf2_sha256 because existing bcrypt
# hashes will then produce UnknownHashError.

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


# ============================================================
# PASSWORD HASH
# ============================================================

def hash_password(password: str) -> str:
    """
    Create a bcrypt password hash.

    bcrypt supports a maximum of 72 bytes.
    """

    if not isinstance(password, str):
        raise ValueError("Password must be a string.")

    if not password:
        raise ValueError("Password cannot be empty.")

    password_bytes = password.encode("utf-8")

    if len(password_bytes) > 72:
        raise ValueError(
            "Password is too long. "
            "Please use a password of 72 bytes or less."
        )

    return pwd_context.hash(password)


# ============================================================
# PASSWORD VERIFY
# ============================================================

def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:

    if not plain_password:
        return False

    if not hashed_password:
        return False

    password_bytes = plain_password.encode("utf-8")

    if len(password_bytes) > 72:
        return False

    try:
        return pwd_context.verify(
            plain_password,
            hashed_password,
        )

    except Exception:
        return False


# ============================================================
# ACCESS TOKEN
# ============================================================

def create_access_token(
    data: dict,
    expires_minutes: int | None = None,
) -> str:

    payload = data.copy()

    if expires_minutes is None:
        expires_minutes = (
            settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    expire = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=expires_minutes
        )
    )

    payload["exp"] = expire

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


# ============================================================
# DECODE ACCESS TOKEN
# ============================================================

def decode_access_token(
    token: str,
) -> dict | None:

    try:

        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[
                settings.ALGORITHM
            ],
        )

        return payload

    except JWTError:

        return None