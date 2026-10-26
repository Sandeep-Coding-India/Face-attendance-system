from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
)

from app.database import Base


class RecoveryOTP(Base):
    __tablename__ = "recovery_otps"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        Integer,
        nullable=False,
        index=True,
    )

    purpose = Column(
        String(30),
        nullable=False,
        index=True,
    )

    channel = Column(
        String(10),
        nullable=False,
    )

    target_hash = Column(
        String(64),
        nullable=False,
        index=True,
    )

    otp_hash = Column(
        String(64),
        nullable=False,
    )

    reset_token_hash = Column(
        String(128),
        nullable=True,
        index=True,
    )

    expires_at = Column(
        DateTime,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    verified_at = Column(
        DateTime,
        nullable=True,
    )

    used = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    attempts = Column(
        Integer,
        nullable=False,
        default=0,
    )