import hashlib
import hmac
import os
import secrets
import smtplib

from datetime import datetime, timedelta
from email.message import EmailMessage

from fastapi import HTTPException


# ============================================================
# CONFIGURATION
# ============================================================

OTP_EXPIRY_MINUTES = int(
    os.getenv(
        "OTP_EXPIRY_MINUTES",
        "10",
    )
)

OTP_RESEND_SECONDS = int(
    os.getenv(
        "OTP_RESEND_SECONDS",
        "60",
    )
)

OTP_MAX_ATTEMPTS = int(
    os.getenv(
        "OTP_MAX_ATTEMPTS",
        "5",
    )
)

OTP_PEPPER = os.getenv(
    "OTP_PEPPER",
    "FACEATTEND_CHANGE_THIS_SECRET",
)


# ============================================================
# TIME
# ============================================================

def utc_now():

    return datetime.utcnow()


# ============================================================
# OTP
# ============================================================

def generate_otp():

    return f"{secrets.randbelow(1000000):06d}"


# ============================================================
# RESET TOKEN
# ============================================================

def generate_reset_token():

    return secrets.token_urlsafe(48)


# ============================================================
# HASH
# ============================================================

def digest(value: str):

    return hmac.new(
        OTP_PEPPER.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_digest(
    value: str,
    expected: str,
):

    return hmac.compare_digest(
        digest(value),
        expected,
    )


# ============================================================
# NORMALIZE EMAIL
# ============================================================

def normalize_email(
    value: str,
):

    return value.strip().lower()


# ============================================================
# NORMALIZE PHONE
# ============================================================

def normalize_phone(
    value: str,
):

    value = (
        value
        .strip()
        .replace(" ", "")
        .replace("-", "")
        .replace("(", "")
        .replace(")", "")
    )

    if value.startswith("00"):

        value = "+" + value[2:]

    if value.startswith("0") and len(value) == 10:

        value = "+91" + value

    if not value.startswith("+"):

        value = "+" + value

    return value


# ============================================================
# MASK EMAIL
# ============================================================

def mask_email(
    value: str,
):

    value = normalize_email(value)

    if "@" not in value:

        return "***"

    local, domain = value.split(
        "@",
        1,
    )

    if len(local) <= 2:

        masked = local[0] + "*"

    else:

        masked = (
            local[:2]
            + "*" * max(
                2,
                len(local) - 2,
            )
        )

    return f"{masked}@{domain}"


# ============================================================
# MASK PHONE
# ============================================================

def mask_phone(
    value: str,
):

    value = normalize_phone(value)

    if len(value) <= 4:

        return "*" * len(value)

    return (
        "*" * (len(value) - 4)
        + value[-4:]
    )


# ============================================================
# SEND EMAIL OTP
# ============================================================

def send_email_otp(
    destination: str,
    otp: str,
    purpose: str,
):

    smtp_host = os.getenv(
        "SMTP_HOST",
        "",
    ).strip()

    smtp_port = int(
        os.getenv(
            "SMTP_PORT",
            "587",
        )
    )

    smtp_username = os.getenv(
        "SMTP_USERNAME",
        "",
    ).strip()

    smtp_password = os.getenv(
        "SMTP_PASSWORD",
        "",
    )

    mail_from = os.getenv(
        "MAIL_FROM",
        smtp_username,
    ).strip()

    smtp_use_tls = (
        os.getenv(
            "SMTP_USE_TLS",
            "true",
        ).lower()
        == "true"
    )

    if not smtp_host:

        raise HTTPException(
            status_code=503,
            detail=(
                "Email recovery is not configured. "
                "Please configure SMTP settings in .env."
            ),
        )

    if not smtp_username:

        raise HTTPException(
            status_code=503,
            detail="SMTP username is missing.",
        )

    if not smtp_password:

        raise HTTPException(
            status_code=503,
            detail="SMTP password is missing.",
        )

    subject_name = (
        "Login ID"
        if purpose == "login_id"
        else "Password"
    )

    message = EmailMessage()

    message["Subject"] = (
        f"FaceAttend {subject_name} Recovery OTP"
    )

    message["From"] = mail_from

    message["To"] = destination

    message.set_content(
        f"""
FaceAttend Account Recovery

Your verification OTP is:

{otp}

This OTP will expire in:
{OTP_EXPIRY_MINUTES} minutes.

If you did not request this OTP,
please ignore this email.

Never share your OTP with anyone.
"""
    )

    try:

        with smtplib.SMTP(
            smtp_host,
            smtp_port,
            timeout=20,
        ) as server:

            if smtp_use_tls:

                server.starttls()

            server.login(
                smtp_username,
                smtp_password,
            )

            server.send_message(
                message
            )

    except Exception as error:

        raise HTTPException(
            status_code=503,
            detail=(
                f"Unable to send recovery email: "
                f"{str(error)}"
            ),
        )


# ============================================================
# SEND SMS OTP
# ============================================================

def send_sms_otp(
    destination: str,
    otp: str,
    purpose: str,
):

    account_sid = os.getenv(
        "TWILIO_ACCOUNT_SID",
        "",
    ).strip()

    auth_token = os.getenv(
        "TWILIO_AUTH_TOKEN",
        "",
    ).strip()

    from_number = os.getenv(
        "TWILIO_FROM_NUMBER",
        "",
    ).strip()

    if not account_sid:

        raise HTTPException(
            status_code=503,
            detail=(
                "Twilio Account SID is not configured."
            ),
        )

    if not auth_token:

        raise HTTPException(
            status_code=503,
            detail=(
                "Twilio Auth Token is not configured."
            ),
        )

    if not from_number:

        raise HTTPException(
            status_code=503,
            detail=(
                "Twilio phone number is not configured."
            ),
        )

    try:

        from twilio.rest import Client

    except ImportError:

        raise HTTPException(
            status_code=503,
            detail=(
                "Twilio is not installed. "
                "Run: pip install twilio"
            ),
        )

    subject_name = (
        "Login ID"
        if purpose == "login_id"
        else "Password"
    )

    body = (
        f"FaceAttend {subject_name} recovery OTP: "
        f"{otp}. "
        f"Valid for {OTP_EXPIRY_MINUTES} minutes."
    )

    try:

        client = Client(
            account_sid,
            auth_token,
        )

        client.messages.create(
            body=body,
            from_=from_number,
            to=destination,
        )

    except Exception as error:

        raise HTTPException(
            status_code=503,
            detail=(
                f"Unable to send recovery SMS: "
                f"{str(error)}"
            ),
        )