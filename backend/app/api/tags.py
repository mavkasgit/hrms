from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sa_delete
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.tag import Tag, EmployeeTag, DepartmentTag

router = APIRouter(prefix="/tags", tags=["org"])


class TagResponse(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    color: Optional[str] = None
    sort_order: int
    employee_count: int = 0
    department_count: int = 0

    class Config:
        from_attributes = True


class TagCreate(BaseModel):
    name: str
    category: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 0


class TagUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


@router.get("", response_model=list[TagResponse])
async def get_tags(db: AsyncSession = Depends(get_db)):
    """Получить все теги с количеством сотрудников."""
    result = await db.execute(
        select(Tag).order_by(Tag.sort_order, Tag.name)
    )
    tags = result.scalars().all()

    # Считаем сотрудников для каждого тега
    result = await db.execute(
        select(
            EmployeeTag.tag_id,
            func.count().label("cnt"),
        ).group_by(EmployeeTag.tag_id)
    )
    emp_counts = {row.tag_id: row.cnt for row in result.all()}

    # Считаем подразделения для каждого тега
    result = await db.execute(
        select(
            DepartmentTag.tag_id,
            func.count().label("cnt"),
        ).group_by(DepartmentTag.tag_id)
    )
    dept_counts = {row.tag_id: row.cnt for row in result.all()}

    return [
        TagResponse(
            id=t.id,
            name=t.name,
            category=t.category,
            color=t.color,
            sort_order=t.sort_order,
            employee_count=emp_counts.get(t.id, 0),
            department_count=dept_counts.get(t.id, 0),
        )
        for t in tags
    ]


@router.post("", response_model=TagResponse)
async def create_tag(data: TagCreate, db: AsyncSession = Depends(get_db)):
    """Создать тег."""
    tag = Tag(**data.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagResponse(
        id=tag.id,
        name=tag.name,
        category=tag.category,
        color=tag.color,
        sort_order=tag.sort_order,
    )


@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Получить тег по ID."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    result = await db.execute(
        select(func.count()).select_from(EmployeeTag).where(EmployeeTag.tag_id == tag_id)
    )
    count = result.scalar_one()

    return TagResponse(
        id=tag.id,
        name=tag.name,
        category=tag.category,
        color=tag.color,
        sort_order=tag.sort_order,
        employee_count=count,
    )


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: int, data: TagUpdate, db: AsyncSession = Depends(get_db)):
    """Обновить тег."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)

    await db.commit()
    await db.refresh(tag)

    result = await db.execute(
        select(func.count()).select_from(EmployeeTag).where(EmployeeTag.tag_id == tag_id)
    )
    count = result.scalar_one()

    return TagResponse(
        id=tag.id,
        name=tag.name,
        category=tag.category,
        color=tag.color,
        sort_order=tag.sort_order,
        employee_count=count,
    )


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить тег (связи с сотрудниками и подразделениями удаляются каскадно)."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    await db.execute(sa_delete(EmployeeTag).where(EmployeeTag.tag_id == tag_id))
    await db.execute(sa_delete(DepartmentTag).where(DepartmentTag.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return {"ok": True}


@router.post("/assign")
async def assign_tag(
    employee_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Назначить тег сотруднику."""
    result = await db.execute(
        select(EmployeeTag).where(
            EmployeeTag.employee_id == employee_id,
            EmployeeTag.tag_id == tag_id,
        )
    )
    exists = result.scalar_one_or_none()

    if exists:
        return {"ok": True, "message": "Already assigned"}

    emp_tag = EmployeeTag(employee_id=employee_id, tag_id=tag_id)
    db.add(emp_tag)
    await db.commit()
    return {"ok": True}


@router.delete("/unassign")
async def unassign_tag(
    employee_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Удалить тег у сотрудника."""
    result = await db.execute(
        select(EmployeeTag).where(
            EmployeeTag.employee_id == employee_id,
            EmployeeTag.tag_id == tag_id,
        )
    )
    emp_tag = result.scalar_one_or_none()

    if emp_tag:
        await db.delete(emp_tag)
        await db.commit()

    return {"ok": True}


@router.get("/{tag_id}/employees")
async def get_tag_employees(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Получить сотрудников с указанным тегом."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    from app.models.employee import Employee
    result = await db.execute(
        select(Employee, EmployeeTag.assigned_at)
        .join(EmployeeTag, Employee.id == EmployeeTag.employee_id)
        .where(EmployeeTag.tag_id == tag_id, Employee.is_deleted == False)
    )
    rows = result.all()

    return [
        {
            "id": emp.id,
            "name": emp.name,
            "assigned_at": assigned_at,
        }
        for emp, assigned_at in rows
    ]


@router.get("/{tag_id}/departments")
async def get_tag_departments(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Получить подразделения с указанным тегом."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    from app.models.department import Department
    from app.models.tag import DepartmentTag
    result = await db.execute(
        select(Department, DepartmentTag.assigned_at)
        .join(DepartmentTag, Department.id == DepartmentTag.department_id)
        .where(DepartmentTag.tag_id == tag_id)
    )
    rows = result.all()

    return [
        {
            "id": dept.id,
            "name": dept.name,
            "short_name": dept.short_name,
            "assigned_at": assigned_at,
        }
        for dept, assigned_at in rows
    ]


@router.get("/{tag_id}/usage")
async def get_tag_usage(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Получить количество связей тега перед удалением."""
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    emp_result = await db.execute(
        select(func.count()).select_from(EmployeeTag).where(EmployeeTag.tag_id == tag_id)
    )
    emp_count = emp_result.scalar_one()

    dept_result = await db.execute(
        select(func.count()).select_from(DepartmentTag).where(DepartmentTag.tag_id == tag_id)
    )
    dept_count = dept_result.scalar_one()

    return {"employee_count": emp_count, "department_count": dept_count}
