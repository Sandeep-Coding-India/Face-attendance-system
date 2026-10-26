from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.database import get_db
from app.models import Company, Department, User
from app.schemas import (
    DepartmentCreateRequest,
    DepartmentListResponse,
    DepartmentResponse,
)
from app.services.company_service import (
    generate_department_id,
)


router = APIRouter(
    prefix="/departments",
    tags=["Departments"],
)


def check_staff_access(
    current_user: User,
):

    if current_user.role not in {
        "admin",
        "hr",
        "manager",
    }:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to manage departments.",
        )


# ============================================================
# CREATE DEPARTMENT
# ============================================================

@router.post(
    "",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    request: DepartmentCreateRequest,
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    check_staff_access(current_user)

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

    department_name = request.name.strip()

    existing = (
        db.query(Department)
        .filter(
            Department.company_id == company.id,
            Department.name
            == department_name,
        )
        .first()
    )

    if existing:

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A department with this name "
                "already exists in your company."
            ),
        )

    department_id = generate_department_id()

    while (
        db.query(Department)
        .filter(
            Department.department_id
            == department_id
        )
        .first()
        is not None
    ):

        department_id = generate_department_id()

    department = Department(
        department_id=department_id,

        name=department_name,

        description=(
            request.description.strip()
            if request.description
            else None
        ),

        company_id=company.id,

        is_active=True,
    )

    db.add(department)

    try:

        db.commit()

        db.refresh(department)

    except IntegrityError as error:

        db.rollback()

        print(
            "DEPARTMENT INTEGRITY ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Department already exists.",
        )

    except SQLAlchemyError as error:

        db.rollback()

        print(
            "DEPARTMENT DATABASE ERROR:",
            error,
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to create department.",
        )

    return DepartmentResponse(
        department_id=department.department_id,

        name=department.name,

        description=department.description,

        company_id=company.company_id,

        is_active=department.is_active,
    )


# ============================================================
# LIST DEPARTMENTS
# ============================================================

@router.get(
    "",
    response_model=DepartmentListResponse,
)
def list_departments(
    current_user: User = Depends(
        get_current_user
    ),
    db: Session = Depends(get_db),
):

    check_staff_access(current_user)

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

    departments = (
        db.query(Department)
        .filter(
            Department.company_id == company.id
        )
        .order_by(
            Department.name.asc()
        )
        .all()
    )

    result = []

    for department in departments:

        result.append(
            DepartmentResponse(
                department_id=department.department_id,

                name=department.name,

                description=department.description,

                company_id=company.company_id,

                is_active=department.is_active,
            )
        )

    return DepartmentListResponse(
        company_id=company.company_id,

        company_name=company.company_name,

        total_departments=len(result),

        departments=result,
    )