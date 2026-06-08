from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from core.auth import get_current_user, require_admin
from services.planning.employee_service import (
    create_employee,
    delete_employee,
    list_employees,
    update_employee,
)
from services.planning.vacation_service import get_vacation_grid, update_vacation_cells

vacation_router = APIRouter(prefix="/vacations", tags=["vacations"])


class VacationCellsBody(BaseModel):
    employee_id: str = Field(min_length=1)
    dates: List[str] = Field(min_length=1)
    status: Optional[str] = None


class EmployeeCreateBody(BaseModel):
    name: str = Field(min_length=1)
    title: str = ""
    start_date: str = Field(min_length=1)
    user_email: Optional[str] = None


class EmployeeUpdateBody(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    start_date: Optional[str] = None
    user_email: Optional[str] = None


@vacation_router.get("")
def get_vacations(
    from_date: Optional[str] = Query(default=None, alias="from"),
    to_date: Optional[str] = Query(default=None, alias="to"),
    user: dict = Depends(get_current_user),
) -> dict:
    return get_vacation_grid(
        from_date=from_date,
        to_date=to_date,
        actor_email=str(user.get("email") or ""),
        is_admin=bool(user.get("is_admin")),
    )


@vacation_router.put("/cells")
def put_vacation_cells(
    body: VacationCellsBody,
    user: dict = Depends(get_current_user),
) -> dict:
    return update_vacation_cells(
        body.employee_id,
        body.dates,
        body.status,
        actor_email=str(user.get("email") or ""),
        is_admin=bool(user.get("is_admin")),
    )


@vacation_router.get("/employees")
def get_employees() -> list:
    return list_employees()


@vacation_router.post("/employees")
def post_employee(body: EmployeeCreateBody, _admin: dict = Depends(require_admin)) -> dict:
    return create_employee(body.name, body.title, body.start_date, user_email=body.user_email)


@vacation_router.patch("/employees/{employee_id}")
def patch_employee(
    employee_id: str,
    body: EmployeeUpdateBody,
    _admin: dict = Depends(require_admin),
) -> dict:
    return update_employee(
        employee_id,
        name=body.name,
        title=body.title,
        start_date=body.start_date,
        user_email=body.user_email,
    )


@vacation_router.delete("/employees/{employee_id}")
def remove_employee(employee_id: str, _admin: dict = Depends(require_admin)) -> dict:
    return delete_employee(employee_id)
