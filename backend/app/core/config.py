import os

from dotenv import load_dotenv


load_dotenv()


class Settings:
    APP_NAME: str = os.getenv(
        "APP_NAME",
        "Smart Face Attendance System"
    )

    APP_VERSION: str = os.getenv(
        "APP_VERSION",
        "1.0.0"
    )

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        ""
    )

    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        "development-secret-key"
    )

    ALGORITHM: str = os.getenv(
        "ALGORITHM",
        "HS256"
    )

    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
        os.getenv(
            "ACCESS_TOKEN_EXPIRE_MINUTES",
            "480"
        )
    )


settings = Settings()