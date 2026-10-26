from typing import Literal

from pydantic import BaseModel, Field


class RecoveryRequest(BaseModel):

    company_id: str = Field(
        ...,
        min_length=1,
        max_length=100,
    )

    recovery_method: Literal[
        "email",
        "phone",
    ]

    recovery_value: str = Field(
        ...,
        min_length=3,
        max_length=160,
    )


class VerifyOTPRequest(
    RecoveryRequest
):

    otp: str = Field(
        ...,
        min_length=6,
        max_length=6,
        pattern=r"^\d{6}$",
    )


class ResetPasswordRequest(
    VerifyOTPRequest
):

    reset_token: str = Field(
        ...,
        min_length=20,
        max_length=300,
    )

    new_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )