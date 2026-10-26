import secrets
import string


def _generate_random_part(
    length: int = 8,
) -> str:

    characters = (
        string.ascii_uppercase
        + string.digits
    )

    return "".join(
        secrets.choice(characters)
        for _ in range(length)
    )


def generate_company_id() -> str:

    return (
        f"CMP-{_generate_random_part(8)}"
    )


def generate_admin_id() -> str:

    return (
        f"ADM-{_generate_random_part(8)}"
    )


def generate_hr_id() -> str:

    return (
        f"HR-{_generate_random_part(8)}"
    )


def generate_manager_id() -> str:

    return (
        f"MGR-{_generate_random_part(8)}"
    )


def generate_department_id() -> str:

    return (
        f"DEPT-{_generate_random_part(8)}"
    )


def generate_employee_id() -> str:

    return (
        f"EMP-{_generate_random_part(8)}"
    )