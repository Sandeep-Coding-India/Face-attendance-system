from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text

from app.core.config import settings

from app.database import (
    Base,
    engine,
)

# ============================================================
# IMPORTANT
# Recovery model is NOT inside app/models/
# because this project already has app/models.py
# ============================================================

from app.recovery_otp import RecoveryOTP

from app.routers.recovery import (
    router as recovery_router
)

from app.routers import auth
from app.routers import company
from app.routers import departments
from app.routers import employees
from app.routers import faces
from app.routers import attendance
from app.routers import users


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Professional multi-company face "
        "recognition attendance management system."
    ),
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",

        "http://localhost:5500",
        "http://127.0.0.1:5500",
    ],

    allow_credentials=True,

    allow_methods=[
        "*"
    ],

    allow_headers=[
        "*"
    ],
)


# ============================================================
# DATABASE STARTUP
# ============================================================

@app.on_event("startup")
def startup():

    # --------------------------------------------------------
    # Existing tables
    # --------------------------------------------------------

    Base.metadata.create_all(
        bind=engine
    )

    # --------------------------------------------------------
    # Phone column for account recovery
    #
    # This is safe for PostgreSQL because
    # IF NOT EXISTS is used.
    # --------------------------------------------------------

    try:

        with engine.begin() as connection:

            connection.execute(
                text(
                    """
                    ALTER TABLE users
                    ADD COLUMN IF NOT EXISTS
                    phone VARCHAR(30)
                    """
                )
            )

    except Exception as error:

        print(
            "Recovery phone column check:",
            error
        )


# ============================================================
# EXISTING ROUTERS
# ============================================================

app.include_router(
    company.router
)

app.include_router(
    auth.router
)

app.include_router(
    users.router
)

app.include_router(
    departments.router
)

app.include_router(
    employees.router
)

app.include_router(
    faces.router
)

app.include_router(
    attendance.router
)


# ============================================================
# NEW RECOVERY ROUTER
# ============================================================

app.include_router(
    recovery_router
)


# ============================================================
# ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "application":
            settings.APP_NAME,

        "version":
            settings.APP_VERSION,

        "status":
            "running",
    }


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/health"
)
def health():

    database_status = (
        "disconnected"
    )

    try:

        with engine.connect() as connection:

            connection.execute(
                text("SELECT 1")
            )

            database_status = (
                "connected"
            )

    except Exception:

        database_status = (
            "disconnected"
        )

    return {

        "status":
            "ok",

        "database":
            database_status,

        "version":
            settings.APP_VERSION,
    }