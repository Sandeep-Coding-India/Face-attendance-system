from datetime import datetime, date

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status,
)

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db

from app.models import (
    Attendance,
    Company,
    Employee,
    User,
)

from app.schemas import (
    AttendanceResponse,
)

from app.core.dependencies import (
    get_current_user,
)


# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance"],
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
# CHECK ACCESS
# ============================================================

def check_attendance_access(
    current_user: User,
):

    role = str(
        current_user.role
    ).lower()

    if role not in ALLOWED_ROLES:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Admin, HR or Manager "
                "can access attendance."
            ),
        )


# ============================================================
# GET COMPANY
# ============================================================

def get_current_company(
    current_user: User,
    db: Session,
):

    company = (
        db.query(Company)
        .filter(
            Company.id
            == current_user.company_id
        )
        .first()
    )

    if company is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    if hasattr(
        company,
        "is_active",
    ):

        if not company.is_active:

            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Company is inactive.",
            )

    return company


# ============================================================
# CHECK-IN / CHECK-OUT
# ============================================================

@router.post(
    "/mark/{employee_id}",
    response_model=AttendanceResponse,
)
def mark_attendance(
    employee_id: str,

    confidence: float = 0.0,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    # --------------------------------------------------------
    # ACCESS
    # --------------------------------------------------------

    check_attendance_access(
        current_user
    )

    # --------------------------------------------------------
    # FACE VERIFICATION IS REQUIRED
    # --------------------------------------------------------
    # Attendance must only be created/updated after a real
    # face-recognition scan. This blocks direct/manual calls
    # from checking an employee out without a face scan.
    try:
        confidence_value = float(confidence)
    except (TypeError, ValueError):
        confidence_value = 0.0

    if confidence_value <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Face scan is required before marking "
                "check-in or check-out."
            ),
        )

    # --------------------------------------------------------
    # COMPANY
    # --------------------------------------------------------

    company = get_current_company(
        current_user,
        db,
    )

    # --------------------------------------------------------
    # EMPLOYEE
    # --------------------------------------------------------

    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id.upper(),

            Employee.company_id
            == company.id,
        )
        .first()
    )

    if employee is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "Employee not found "
                "in your company."
            ),
        )

    # --------------------------------------------------------
    # ACTIVE EMPLOYEE
    # --------------------------------------------------------

    if hasattr(
        employee,
        "is_active",
    ):

        if not employee.is_active:

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Attendance cannot be "
                    "marked for an inactive employee."
                ),
            )

    # --------------------------------------------------------
    # CURRENT DATE & TIME
    # --------------------------------------------------------

    now = datetime.now()

    today = date.today()

    # --------------------------------------------------------
    # FIND TODAY'S ATTENDANCE
    # --------------------------------------------------------

    attendance = (
        db.query(Attendance)
        .filter(
            Attendance.company_id
            == company.id,

            Attendance.employee_id
            == employee.id,

            Attendance.attendance_date
            == today,
        )
        .first()
    )

    # ========================================================
    # FIRST VISIT = CHECK-IN
    # ========================================================

    if attendance is None:

        attendance = Attendance(

            company_id=company.id,

            employee_id=employee.id,

            attendance_date=today,

            check_in=now,

            check_out=None,

            status="present",

            check_in_confidence=confidence,

            check_out_confidence=None,

            total_seconds=None,

            notes=None,
        )

        db.add(
            attendance
        )

        try:

            db.commit()

            db.refresh(
                attendance
            )

        except SQLAlchemyError as error:

            db.rollback()

            print(
                "CHECK-IN DATABASE ERROR:",
                repr(error),
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Unable to save check-in."
                ),
            )

        return build_attendance_response(
            attendance,
            employee,
            company,
            "Employee checked in successfully.",
        )

    # ========================================================
    # SECOND VISIT = CHECK-OUT
    # ========================================================

    if attendance.check_out is None:

        attendance.check_out = now

        attendance.check_out_confidence = (
            confidence
        )

        # ----------------------------------------------------
        # Calculate working duration
        # ----------------------------------------------------

        if attendance.check_in:

            duration = (
                attendance.check_out
                - attendance.check_in
            )

            attendance.total_seconds = int(
                duration.total_seconds()
            )

        attendance.status = "completed"

        try:

            db.commit()

            db.refresh(
                attendance
            )

        except SQLAlchemyError as error:

            db.rollback()

            print(
                "CHECK-OUT DATABASE ERROR:",
                repr(error),
            )

            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Unable to save check-out."
                ),
            )

        return build_attendance_response(
            attendance,
            employee,
            company,
            "Employee checked out successfully.",
        )

    # ========================================================
    # THIRD+ VISIT
    # ========================================================

    return build_attendance_response(
        attendance,
        employee,
        company,
        (
            "Today's attendance is already "
            "completed."
        ),
    )


# ============================================================
# RESPONSE BUILDER
# ============================================================

def build_attendance_response(
    attendance,
    employee,
    company,
    message,
):

    total_hours = None

    if attendance.total_seconds is not None:

        total_hours = round(
            attendance.total_seconds / 3600,
            2,
        )

    return AttendanceResponse(

        id=attendance.id,

        employee_id=employee.employee_id,

        employee_name=employee.full_name,

        company_id=company.company_id,

        attendance_date=str(
            attendance.attendance_date
        ),

        check_in=(
            attendance.check_in.isoformat()
            if attendance.check_in
            else None
        ),

        check_out=(
            attendance.check_out.isoformat()
            if attendance.check_out
            else None
        ),

        status=attendance.status,

        check_in_confidence=(
            attendance.check_in_confidence
        ),

        check_out_confidence=(
            attendance.check_out_confidence
        ),

        total_seconds=(
            attendance.total_seconds
        ),

        total_hours=total_hours,

        message=message,
    )


# ============================================================
# GET TODAY ATTENDANCE
# ============================================================

@router.get(
    "/today",
    response_model=list[AttendanceResponse],
)
def get_today_attendance(

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_attendance_access(
        current_user
    )

    company = get_current_company(
        current_user,
        db,
    )

    today = date.today()

    records = (
        db.query(
            Attendance,
            Employee,
        )
        .join(
            Employee,
            Employee.id
            == Attendance.employee_id,
        )
        .filter(
            Attendance.company_id
            == company.id,

            Attendance.attendance_date
            == today,
        )
        .order_by(
            Attendance.check_in.desc()
        )
        .all()
    )

    result = []

    for attendance, employee in records:

        result.append(
            build_attendance_response(
                attendance,
                employee,
                company,
                "Attendance record.",
            )
        )

    return result


# ============================================================
# GET EMPLOYEE ATTENDANCE
# ============================================================

@router.get(
    "/employee/{employee_id}",
    response_model=list[AttendanceResponse],
)
def get_employee_attendance(

    employee_id: str,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_attendance_access(
        current_user
    )

    company = get_current_company(
        current_user,
        db,
    )

    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id.upper(),

            Employee.company_id
            == company.id,
        )
        .first()
    )

    if employee is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found.",
        )

    records = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id
            == employee.id,

            Attendance.company_id
            == company.id,
        )
        .order_by(
            Attendance.attendance_date.desc()
        )
        .all()
    )

    result = []

    for attendance in records:

        result.append(
            build_attendance_response(
                attendance,
                employee,
                company,
                "Attendance record.",
            )
        )

    return result