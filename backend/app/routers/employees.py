from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Company, Department, Employee, User, FaceProfile, Attendance
from app.schemas import (
    EmployeeCreateRequest,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdateRequest,
)
from app.services.company_service import (
    generate_employee_id,
)


router = APIRouter(
    prefix="/employees",
    tags=["Employees"],
)


# ============================================================
# ACCESS CONTROL
# ============================================================

def check_employee_access(
    current_user: User,
):

    allowed_roles = {
        "admin",
        "hr",
        "manager",
    }

    if current_user.role not in allowed_roles:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Admin, HR or Manager "
                "can manage employees."
            ),
        )


# ============================================================
# COMPANY
# ============================================================

def get_user_company(
    current_user: User,
    db: Session,
) -> Company:

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
            detail="Company not found.",
        )

    if not company.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company is inactive.",
        )

    return company


# ============================================================
# DEPARTMENT
# ============================================================

def get_department(
    department_id: str,
    company_id: int,
    db: Session,
) -> Department | None:

    return (
        db.query(Department)
        .filter(
            Department.department_id
            == department_id.upper(),

            Department.company_id
            == company_id,

            Department.is_active.is_(True),
        )
        .first()
    )


# ============================================================
# EMPLOYEE RESPONSE BUILDER
# ============================================================

def build_employee_response(
    employee: Employee,
    company: Company,
) -> EmployeeResponse:

    department_id = None
    department_name = None

    if employee.department:

        department_id = (
            employee.department.department_id
        )

        department_name = (
            employee.department.name
        )

    return EmployeeResponse(
        id=employee.id,
        employee_id=employee.employee_id,

        employee_code=employee.employee_code,

        full_name=employee.full_name,

        email=employee.email,

        phone=employee.phone,

        department_id=department_id,

        department_name=department_name,

        designation=employee.designation,

        joining_date=employee.joining_date,

        company_id=company.company_id,

        company_name=company.company_name,

        is_active=employee.is_active,

        face_registered=employee.face_registered,
    )


# ============================================================
# CREATE EMPLOYEE
# ============================================================

@router.post(
    "",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_employee(
    request: EmployeeCreateRequest,
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    check_employee_access(current_user)

    company = get_user_company(
        current_user,
        db,
    )

    # --------------------------------------------------------
    # Validate department
    # --------------------------------------------------------

    department = None

    if request.department_id:

        department = get_department(
            request.department_id,
            company.id,
            db,
        )

        if department is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Department not found in "
                    "your company."
                ),
            )

    # --------------------------------------------------------
    # Check email
    # --------------------------------------------------------

    if request.email:

        existing_email = (
            db.query(Employee)
            .filter(
                Employee.company_id
                == company.id,

                Employee.email
                == str(request.email).lower(),
            )
            .first()
        )

        if existing_email:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "An employee with this "
                    "email already exists."
                ),
            )

    # --------------------------------------------------------
    # Generate employee ID
    # --------------------------------------------------------

    employee_id = generate_employee_id()

    while (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id
        )
        .first()
        is not None
    ):

        employee_id = generate_employee_id()

    # --------------------------------------------------------
    # Create employee
    # --------------------------------------------------------

    employee = Employee(

        employee_id=employee_id,

        employee_code=request.employee_code.strip().upper(),

        full_name=request.full_name.strip(),

        email=(
            str(request.email).lower()
            if request.email
            else None
        ),

        phone=(
            request.phone.strip()
            if request.phone
            else None
        ),

        designation=(
            request.designation.strip()
            if request.designation
            else None
        ),

        joining_date=request.joining_date,

        company_id=company.id,

        department_id=(
            department.id
            if department
            else None
        ),

        is_active=True,

        face_registered=False,
    )

    db.add(employee)

    try:

        db.commit()

        db.refresh(employee)

    except IntegrityError as error:

        db.rollback()

        print(
            "EMPLOYEE INTEGRITY ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Employee could not be created "
                "because of a duplicate record."
            ),
        )

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "EMPLOYEE DATABASE ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create employee.",
        )

    return build_employee_response(
        employee,
        company,
    )


# ============================================================
# LIST EMPLOYEES
# ============================================================

@router.get(
    "",
    response_model=EmployeeListResponse,
)
def list_employees(
    search: str | None = Query(
        default=None,
        max_length=100,
    ),

    department_id: str | None = Query(
        default=None,
        max_length=50,
    ),

    active_only: bool = Query(
        default=False,
    ),

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_employee_access(current_user)

    company = get_user_company(
        current_user,
        db,
    )

    query = (
        db.query(Employee)
        .filter(
            Employee.company_id
            == company.id
        )
    )

    # --------------------------------------------------------
    # Search
    # --------------------------------------------------------

    if search:

        search_value = (
            f"%{search.strip()}%"
        )

        query = query.filter(
            (
                Employee.full_name.ilike(
                    search_value
                )
            )
            |
            (
                Employee.employee_id.ilike(
                    search_value
                )
            )
            |
            (
                Employee.email.ilike(
                    search_value
                )
            )
        )

    # --------------------------------------------------------
    # Department filter
    # --------------------------------------------------------

    if department_id:

        department = get_department(
            department_id,
            company.id,
            db,
        )

        if department is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Department not found.",
            )

        query = query.filter(
            Employee.department_id
            == department.id
        )

    # --------------------------------------------------------
    # Active filter
    # --------------------------------------------------------

    if active_only:

        query = query.filter(
            Employee.is_active.is_(True)
        )

    employees = (
        query
        .order_by(
            Employee.created_at.desc()
        )
        .all()
    )

    all_employees = (
        db.query(Employee)
        .filter(
            Employee.company_id
            == company.id
        )
        .all()
    )

    active_count = sum(
        1
        for employee in all_employees
        if employee.is_active
    )

    inactive_count = (
        len(all_employees)
        - active_count
    )

    result = [
        build_employee_response(
            employee,
            company,
        )
        for employee in employees
    ]

    return EmployeeListResponse(
        company_id=company.company_id,

        company_name=company.company_name,

        total_employees=len(result),

        active_employees=active_count,

        inactive_employees=inactive_count,

        employees=result,
    )


# ============================================================
# GET SINGLE EMPLOYEE
# ============================================================

@router.get(
    "/{employee_id}",
    response_model=EmployeeResponse,
)
def get_employee(
    employee_id: str,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_employee_access(current_user)

    company = get_user_company(
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
            detail=(
                "Employee not found in "
                "your company."
            ),
        )

    return build_employee_response(
        employee,
        company,
    )


# ============================================================
# UPDATE EMPLOYEE
# ============================================================

@router.patch(
    "/{employee_id}",
    response_model=EmployeeResponse,
)
def update_employee(
    employee_id: str,

    request: EmployeeUpdateRequest,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_employee_access(current_user)

    company = get_user_company(
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

    # --------------------------------------------------------
    # Name
    # --------------------------------------------------------

    if request.full_name is not None:

        employee.full_name = (
            request.full_name.strip()
        )

    # --------------------------------------------------------
    # Email
    # --------------------------------------------------------

    if request.email is not None:

        email = str(
            request.email
        ).lower()

        existing = (
            db.query(Employee)
            .filter(
                Employee.company_id
                == company.id,

                Employee.email == email,

                Employee.id
                != employee.id,
            )
            .first()
        )

        if existing:

            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Another employee already "
                    "uses this email."
                ),
            )

        employee.email = email

    # --------------------------------------------------------
    # Phone
    # --------------------------------------------------------

    if request.phone is not None:

        employee.phone = (
            request.phone.strip()
        )

    # --------------------------------------------------------
    # Designation
    # --------------------------------------------------------

    if request.designation is not None:

        employee.designation = (
            request.designation.strip()
        )

    # --------------------------------------------------------
    # Joining Date
    # --------------------------------------------------------

    if request.joining_date is not None:

        employee.joining_date = (
            request.joining_date
        )

    # --------------------------------------------------------
    # Department
    # --------------------------------------------------------

    if request.department_id is not None:

        department = get_department(
            request.department_id,
            company.id,
            db,
        )

        if department is None:

            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "Department not found "
                    "in your company."
                ),
            )

        employee.department_id = (
            department.id
        )

    try:

        db.commit()

        db.refresh(employee)

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "EMPLOYEE UPDATE ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update employee.",
        )

    return build_employee_response(
        employee,
        company,
    )


# ============================================================
# DEACTIVATE EMPLOYEE
# ============================================================

@router.patch(
    "/{employee_id}/deactivate",
)
def deactivate_employee(
    employee_id: str,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(get_db),
):

    check_employee_access(current_user)

    company = get_user_company(
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

    employee.is_active = False

    try:

        db.commit()

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "EMPLOYEE DEACTIVATE ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to deactivate employee.",
        )

    return {
        "message": (
            "Employee deactivated successfully."
        ),

        "employee_id": employee.employee_id,

        "is_active": False,
    }

# ============================================================
# DELETE EMPLOYEE
# ============================================================

@router.delete(
    "/{employee_id}",
)
def delete_employee(
    employee_id: str,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # ACCESS
    # --------------------------------------------------------

    role = str(
        current_user.role
    ).lower()

    if role not in {
        "admin",
        "hr",
        "manager",
    }:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Admin, HR or Manager "
                "can delete employees."
            ),
        )

    # --------------------------------------------------------
    # COMPANY
    # --------------------------------------------------------

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
            detail="Employee not found.",
        )

    # --------------------------------------------------------
    # DELETE FACE PROFILES
    # --------------------------------------------------------

    db.query(FaceProfile).filter(
        FaceProfile.employee_id
        == employee.id,

        FaceProfile.company_id
        == company.id,
    ).delete(
        synchronize_session=False
    )

    # --------------------------------------------------------
    # DELETE ATTENDANCE
    # --------------------------------------------------------

    db.query(Attendance).filter(
        Attendance.employee_id
        == employee.id,

        Attendance.company_id
        == company.id,
    ).delete(
        synchronize_session=False
    )

    # --------------------------------------------------------
    # DELETE EMPLOYEE
    # --------------------------------------------------------

    db.delete(employee)

    try:

        db.commit()

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "EMPLOYEE DELETE ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete employee.",
        )

    return {
        "message": "Employee deleted successfully.",
        "employee_id": employee.employee_id,
    }

# ============================================================
# EMPLOYEE ACTIVATE / DEACTIVATE (LEAVE) ENDPOINT
# ============================================================
# Add this endpoint to your existing app/routers/employees.py.
# Ensure employees.py already imports: Depends, HTTPException, status,
# Session, SQLAlchemyError, get_db, Employee, User, get_current_user.
# Do NOT create a second employees router.
#
# Your current Employee model already uses is_active, and the
# attendance + face recognition code already respects that flag.
# ============================================================

@router.patch(
    "/{employee_id}/status",
)
def update_employee_status(
    employee_id: str,

    payload: dict,

    current_user: User = Depends(
        get_current_user
    ),

    db: Session = Depends(
        get_db
    ),
):

    # --------------------------------------------------------
    # ACCESS
    # --------------------------------------------------------

    role = str(
        current_user.role
    ).lower()

    if role not in {
        "admin",
        "hr",
        "manager",
    }:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only Admin, HR or Manager "
                "can change employee status."
            ),
        )

    # --------------------------------------------------------
    # COMPANY-SCOPED EMPLOYEE
    # --------------------------------------------------------

    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id
            == employee_id.upper(),

            Employee.company_id
            == current_user.company_id,
        )
        .first()
    )

    if employee is None:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found in your company.",
        )

    # --------------------------------------------------------
    # STATUS
    # --------------------------------------------------------

    if "is_active" not in payload:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_active is required.",
        )

    is_active = payload.get("is_active")

    if not isinstance(is_active, bool):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_active must be true or false.",
        )

    employee.is_active = is_active

    # --------------------------------------------------------
    # SAVE
    # --------------------------------------------------------

    try:

        db.commit()
        db.refresh(employee)

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "EMPLOYEE STATUS UPDATE ERROR:",
            repr(error),
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update employee status.",
        )

    return {
        "message": (
            "Employee activated successfully."
            if employee.is_active
            else "Employee placed on leave / deactivated successfully."
        ),
        "employee_id": employee.employee_id,
        "is_active": bool(employee.is_active),
        "status": (
            "active"
            if employee.is_active
            else "on_leave"
        ),
    }


# Add this block to your existing app/routers/employees.py
# It does NOT replace the existing employee routes.

from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, User
from app.core.dependencies import get_current_user


class EmployeeStatusRequest(BaseModel):
    is_active: bool


@router.patch(
    "/{employee_id}/status",
)
def update_employee_status(
    employee_id: str,
    payload: EmployeeStatusRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Only Admin, HR and Manager can change employee status.
    role = str(current_user.role).lower()

    if role not in {"admin", "hr", "manager"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin, HR or Manager can change employee status.",
        )

    # Company-scoped employee lookup.
    employee = (
        db.query(Employee)
        .filter(
            Employee.employee_id == employee_id.upper(),
            Employee.company_id == current_user.company_id,
        )
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found in your company.",
        )

    employee.is_active = payload.is_active

    try:
        db.commit()
        db.refresh(employee)
    except SQLAlchemyError as error:
        db.rollback()
        print("EMPLOYEE STATUS UPDATE ERROR:", repr(error))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to update employee status.",
        )

    return {
        "message": (
            "Employee activated successfully."
            if employee.is_active
            else "Employee marked as On Leave successfully."
        ),
        "employee_id": employee.employee_id,
        "full_name": employee.full_name,
        "is_active": employee.is_active,
    }


# Add this endpoint to the EXISTING app/routers/employees.py.
# Do not create a second employees router.
# Place it AFTER the existing POST /employees endpoint (or before
# GET /employees/{employee_id}) so /departments is not treated as an employee ID.

@router.get("/departments")
def list_employee_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return active departments belonging only to the logged-in company."""

    check_employee_access(current_user)

    company = get_user_company(
        current_user,
        db,
    )

    departments = (
        db.query(Department)
        .filter(
            Department.company_id == company.id,
            Department.is_active.is_(True),
        )
        .order_by(Department.name.asc())
        .all()
    )

    return [
        {
            "department_id": department.department_id,
            "name": department.name,
            "is_active": bool(department.is_active),
        }
        for department in departments
    ]
