from datetime import date

from pydantic import BaseModel, EmailStr, Field


# ============================================================
# HEALTH
# ============================================================

class HealthResponse(BaseModel):
    status: str
    database: str
    version: str


# ============================================================
# COMPANY REGISTRATION
# ============================================================

class CompanyRegistrationRequest(BaseModel):
    company_name: str = Field(
        ...,
        min_length=2,
        max_length=150,
    )

    company_email: EmailStr

    company_phone: str | None = Field(
        default=None,
        max_length=30,
    )

    company_address: str | None = Field(
        default=None,
        max_length=255,
    )

    admin_full_name: str = Field(
        ...,
        min_length=2,
        max_length=150,
    )

    admin_email: EmailStr

    admin_password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )


class CompanyRegistrationResponse(BaseModel):
    message: str

    company_id: str
    company_name: str

    admin_id: str
    admin_name: str
    admin_email: EmailStr

    role: str


class CompanyBasicResponse(BaseModel):
    company_id: str
    company_name: str
    email: EmailStr


# ============================================================
# AUTHENTICATION
# ============================================================

class LoginRequest(BaseModel):
    company_id: str = Field(
        ...,
        min_length=4,
        max_length=50,
    )

    login_id: str = Field(
        ...,
        min_length=4,
        max_length=50,
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )


class LoginResponse(BaseModel):
    message: str

    access_token: str

    token_type: str = "bearer"

    user_id: str

    full_name: str

    role: str

    company_id: str

    company_name: str


class CurrentUserResponse(BaseModel):
    user_id: str

    full_name: str

    email: EmailStr

    role: str

    company_id: str

    company_name: str

    is_active: bool


# ============================================================
# STAFF MANAGEMENT
# ============================================================

class StaffCreateRequest(BaseModel):
    full_name: str = Field(
        ...,
        min_length=2,
        max_length=150,
    )

    email: EmailStr

    role: str = Field(
        ...,
        min_length=2,
        max_length=20,
    )

    password: str = Field(
        ...,
        min_length=8,
        max_length=128,
    )


class StaffCreateResponse(BaseModel):
    message: str

    user_id: str

    full_name: str

    email: EmailStr

    role: str

    company_id: str

    company_name: str

    is_active: bool


class StaffListItem(BaseModel):
    user_id: str

    full_name: str

    email: EmailStr

    role: str

    company_id: str

    is_active: bool


class StaffListResponse(BaseModel):
    company_id: str

    company_name: str

    total_staff: int

    staff: list[StaffListItem]


# ============================================================
# DEPARTMENT
# ============================================================

class DepartmentCreateRequest(BaseModel):
    name: str = Field(
        ...,
        min_length=2,
        max_length=100,
    )

    description: str | None = Field(
        default=None,
        max_length=255,
    )


class DepartmentResponse(BaseModel):
    department_id: str

    name: str

    description: str | None

    company_id: str

    is_active: bool


class DepartmentListResponse(BaseModel):
    company_id: str

    company_name: str

    total_departments: int

    departments: list[DepartmentResponse]


# ============================================================
# EMPLOYEE
# ============================================================

class EmployeeCreateRequest(BaseModel):
    employee_code: str = Field(
        ...,
        min_length=2,
        max_length=50,
    )

    full_name: str = Field(
        ...,
        min_length=2,
        max_length=150,
    )

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        max_length=30,
    )

    department_id: str | None = Field(
        default=None,
        max_length=50,
    )

    designation: str | None = Field(
        default=None,
        max_length=100,
    )

    joining_date: date | None = None


class EmployeeUpdateRequest(BaseModel):

    employee_code: str | None = Field(
        default=None,
        min_length=2,
        max_length=50,
    )

    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )

    email: EmailStr | None = None

    phone: str | None = Field(
        default=None,
        max_length=30,
    )

    department_id: str | None = Field(
        default=None,
        max_length=50,
    )

    designation: str | None = Field(
        default=None,
        max_length=100,
    )

    joining_date: date | None = None


class EmployeeResponse(BaseModel):
    id: int

    employee_id: str

    employee_code: str

    full_name: str

    email: EmailStr | None

    phone: str | None

    department_id: str | None

    department_name: str | None

    designation: str | None

    joining_date: date | None

    company_id: str

    company_name: str

    is_active: bool

    face_registered: bool


class EmployeeListResponse(BaseModel):
    company_id: str

    company_name: str

    total_employees: int

    active_employees: int

    inactive_employees: int

    employees: list[EmployeeResponse]

# ============================================================
# FACE ENROLLMENT
# ============================================================

class FaceEnrollmentResponse(BaseModel):

    message: str

    employee_id: str

    employee_name: str

    company_id: str

    sample_number: int

    face_quality: float

    detection_score: float

    image_quality: float

    face_registered: bool


class FaceProfileResponse(BaseModel):

    employee_id: str

    employee_name: str

    company_id: str

    total_samples: int

    face_registered: bool

# ============================================================
# FACE RECOGNITION
# ============================================================

class FaceRecognitionResponse(BaseModel):

    recognized: bool

    employee_id: str | None = None

    employee_name: str | None = None

    company_id: str | None = None

    confidence: float | None = None

    similarity: float | None = None

    face_quality: float | None = None

    detection_score: float | None = None

    message: str

# ============================================================
# ATTENDANCE
# ============================================================

class AttendanceResponse(BaseModel):

    id: int

    employee_id: str

    employee_name: str

    company_id: str

    attendance_date: str

    check_in: str | None = None

    check_out: str | None = None

    status: str

    check_in_confidence: float | None = None

    check_out_confidence: float | None = None

    total_seconds: int | None = None

    total_hours: float | None = None

    message: str