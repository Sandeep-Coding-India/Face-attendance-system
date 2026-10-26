from datetime import datetime, date

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Float,
    UniqueConstraint,
)

from sqlalchemy.orm import relationship

from app.database import Base


# ============================================================
# COMPANY
# ============================================================

class Company(Base):
    __tablename__ = "companies"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    company_name = Column(
        String(150),
        nullable=False,
    )

    email = Column(
        String(150),
        unique=True,
        nullable=False,
        index=True,
    )

    phone = Column(
        String(30),
        nullable=True,
    )

    address = Column(
        String(255),
        nullable=True,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    users = relationship(
        "User",
        back_populates="company",
        cascade="all, delete-orphan",
    )

    departments = relationship(
        "Department",
        back_populates="company",
        cascade="all, delete-orphan",
    )

    employees = relationship(
        "Employee",
        back_populates="company",
        cascade="all, delete-orphan",
    )


# ============================================================
# USER
# ADMIN / HR / MANAGER
# ============================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    user_id = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    full_name = Column(
        String(150),
        nullable=False,
    )

    email = Column(
        String(150),
        nullable=False,
        index=True,
    )

    password_hash = Column(
        String(255),
        nullable=False,
    )

    role = Column(
        String(20),
        nullable=False,
        index=True,
    )

    company_id = Column(
        Integer,
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )

    login_id = Column(
        String(100),
        unique=True,
        nullable=True,
        index=True,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    company = relationship(
        "Company",
        back_populates="users",
    )


# ============================================================
# DEPARTMENT
# ============================================================

class Department(Base):
    __tablename__ = "departments"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    department_id = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    name = Column(
        String(100),
        nullable=False,
    )

    description = Column(
        String(255),
        nullable=True,
    )

    company_id = Column(
        Integer,
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    company = relationship(
        "Company",
        back_populates="departments",
    )

    employees = relationship(
        "Employee",
        back_populates="department",
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "name",
            name="uq_department_company_name",
        ),
    )


# ============================================================
# EMPLOYEE
# ============================================================

class Employee(Base):
    __tablename__ = "employees"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    employee_id = Column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )

    employee_code = Column(
        String(50),
        nullable=False,
        index=True,
    )

    full_name = Column(
        String(150),
        nullable=False,
    )

    email = Column(
        String(150),
        nullable=True,
        index=True,
    )

    phone = Column(
        String(30),
        nullable=True,
    )

    designation = Column(
        String(100),
        nullable=True,
    )

    joining_date = Column(
        Date,
        nullable=True,
    )

    company_id = Column(
        Integer,
        ForeignKey("companies.id"),
        nullable=False,
        index=True,
    )

    department_id = Column(
        Integer,
        ForeignKey("departments.id"),
        nullable=True,
        index=True,
    )

    is_active = Column(
        Boolean,
        default=True,
        nullable=False,
    )

    face_registered = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    company = relationship(
        "Company",
        back_populates="employees",
    )

    department = relationship(
        "Department",
        back_populates="employees",
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "employee_code",
            name="uq_employee_company_code",
        ),
    )

# ============================================================
# FACE PROFILE
# ============================================================

class FaceProfile(Base):
    __tablename__ = "face_profiles"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    employee_id = Column(
        Integer,
        ForeignKey(
            "employees.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    company_id = Column(
        Integer,
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    embedding = Column(
        JSON,
        nullable=False,
    )

    model_name = Column(
        String(100),
        nullable=False,
        default="buffalo_l",
    )

    detection_score = Column(
        String(20),
        nullable=True,
    )

    face_quality = Column(
        String(20),
        nullable=True,
    )

    image_quality = Column(
        String(20),
        nullable=True,
    )

    sample_number = Column(
        Integer,
        nullable=False,
        default=1,
    )

    is_active = Column(
        Boolean,
        nullable=False,
        default=True,
    )

    created_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    employee = relationship(
        "Employee",
        backref="face_profiles",
    )

    company = relationship(
        "Company",
        backref="face_profiles",
    )

# ============================================================
# ATTENDANCE
# ============================================================

class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id = Column(
        Integer,
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    employee_id = Column(
        Integer,
        ForeignKey(
            "employees.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    attendance_date = Column(
        Date,
        nullable=False,
        index=True,
    )

    check_in = Column(
        DateTime,
        nullable=True,
    )

    check_out = Column(
        DateTime,
        nullable=True,
    )

    status = Column(
        String(30),
        nullable=False,
        default="present",
    )

    check_in_confidence = Column(
        Float,
        nullable=True,
    )

    check_out_confidence = Column(
        Float,
        nullable=True,
    )

    total_seconds = Column(
        Integer,
        nullable=True,
    )

    notes = Column(
        String(500),
        nullable=True,
    )

    created_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    employee = relationship(
        "Employee",
        backref="attendance_records",
    )

    company = relationship(
        "Company",
        backref="attendance_records",
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "employee_id",
            "attendance_date",
            name="uq_company_employee_attendance_date",
        ),
    )