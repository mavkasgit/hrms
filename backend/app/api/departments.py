from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload, joinedload
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.department import Department, DepartmentRelation, RelationType
from app.models.employee import Employee
from app.models.tag import Tag, DepartmentTag
from app.schemas.department_graph import (
    GraphNode,
    GraphEdge,
    GraphEmployee,
    TagRef,
    DepartmentGraphResponse,
    DepartmentLinkCreate,
    DepartmentLinkResponse,
    DepartmentTagAssign,
    DepartmentTagResponse,
)

router = APIRouter(prefix="/departments", tags=["departments"])


# ============================================================================
# Вспомогательные функции
# ============================================================================

async def _load_department_tags(db: AsyncSession, department_ids: list[int]) -> dict[int, list[TagRef]]:
    """Загружает теги для списка подразделений."""
    if not department_ids:
        return {}
    result = await db.execute(
        select(DepartmentTag, Tag)
        .join(Tag, DepartmentTag.tag_id == Tag.id)
        .where(DepartmentTag.department_id.in_(department_ids))
    )
    rows = result.all()
    tags_map: dict[int, list[TagRef]] = {}
    for dt, tag in rows:
        tags_map.setdefault(dt.department_id, []).append(
            TagRef(id=tag.id, name=tag.name, color=tag.color)
        )
    return tags_map


async def _load_employee_tags(db: AsyncSession, employee_ids: list[int]) -> dict[int, list[TagRef]]:
    """Загружает теги для списка сотрудников."""
    if not employee_ids:
        return {}
    from app.models.tag import EmployeeTag
    result = await db.execute(
        select(EmployeeTag, Tag)
        .join(Tag, EmployeeTag.tag_id == Tag.id)
        .where(EmployeeTag.employee_id.in_(employee_ids))
    )
    rows = result.all()
    tags_map: dict[int, list[TagRef]] = {}
    for et, tag in rows:
        tags_map.setdefault(et.employee_id, []).append(
            TagRef(id=tag.id, name=tag.name, color=tag.color)
        )
    return tags_map


# ============================================================================
# Граф подразделений (Nodes & Edges)
# ============================================================================

@router.get("/graph", response_model=DepartmentGraphResponse)
async def get_departments_graph(db: AsyncSession = Depends(get_db)):
    """Получить граф подразделений в формате Nodes & Edges."""
    # 1. Загружаем все подразделения
    dept_result = await db.execute(
        select(Department).order_by(Department.rank.desc(), Department.sort_order, Department.name)
    )
    departments = dept_result.scalars().all()
    if not departments:
        return DepartmentGraphResponse(nodes=[], edges=[])

    dept_ids = [d.id for d in departments]

    # 2. Загружаем сотрудников (с position через selectinload для async)
    emp_result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.position))
        .where(Employee.department_id.in_(dept_ids),
               Employee.is_deleted == False,
               Employee.is_archived == False)
    )
    employees = emp_result.scalars().unique().all()

    # Группируем сотрудников по department_id
    emp_by_dept: dict[int, list[Employee]] = {}
    all_emp_ids = []
    for emp in employees:
        emp_by_dept.setdefault(emp.department_id, []).append(emp)
        all_emp_ids.append(emp.id)

    # 3. Загружаем теги сотрудников
    emp_tags_map = await _load_employee_tags(db, all_emp_ids)

    # 4. Загружаем теги подразделений
    dept_tags_map = await _load_department_tags(db, dept_ids)

    # 5. Загружаем имена руководителей
    head_ids = [d.head_employee_id for d in departments if d.head_employee_id]
    head_names: dict[int, str] = {}
    if head_ids:
        heads_result = await db.execute(
            select(Employee.id, Employee.name).where(Employee.id.in_(head_ids))
        )
        for hid, hname in heads_result.all():
            head_names[hid] = hname

    # 6. Собираем узлы
    nodes = []
    for dept in departments:
        dept_employees = emp_by_dept.get(dept.id, [])
        emp_list = []
        for emp in dept_employees:
            position_name = emp.position.name if emp.position else None
            emp_list.append(
                GraphEmployee(
                    id=emp.id,
                    name=emp.name,
                    position_name=position_name,
                    tags=emp_tags_map.get(emp.id, []),
                )
            )

        nodes.append(
            GraphNode(
                id=dept.id,
                name=dept.name,
                short_name=dept.short_name,
                color=dept.color,
                icon=dept.icon,
                rank=dept.rank,
                head_employee_id=dept.head_employee_id,
                head_employee_name=head_names.get(dept.head_employee_id) if dept.head_employee_id else None,
                tags=dept_tags_map.get(dept.id, []),
                employee_count=len(emp_list),
                employees=emp_list,
            )
        )

    # 7. Загружаем связи (edges)
    edges_result = await db.execute(select(DepartmentRelation))
    edges_raw = edges_result.scalars().all()
    edges = [
        GraphEdge(
            head_id=e.head_id,
            child_id=e.child_id,
            relation_type=e.relation_type.value,
        )
        for e in edges_raw
    ]

    return DepartmentGraphResponse(nodes=nodes, edges=edges)


# ============================================================================
# Плоский список (для селектов, обратно совместимый)
# ============================================================================

class FlatDepartmentNode(BaseModel):
    id: int
    name: str
    short_name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    rank: int = 1
    head_employee_id: Optional[int] = None
    head_employee_name: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[FlatDepartmentNode])
async def list_departments_flat(db: AsyncSession = Depends(get_db)):
    """Получить плоский список всех подразделений (для селектов)."""
    result = await db.execute(
        select(Department).order_by(Department.rank.desc(), Department.sort_order, Department.name)
    )
    departments = result.scalars().all()

    # Загружаем имена руководителей
    head_ids = [d.head_employee_id for d in departments if d.head_employee_id]
    head_names: dict[int, str] = {}
    if head_ids:
        heads_result = await db.execute(
            select(Employee.id, Employee.name).where(Employee.id.in_(head_ids))
        )
        for hid, hname in heads_result.all():
            head_names[hid] = hname

    return [
        FlatDepartmentNode(
            id=d.id,
            name=d.name,
            short_name=d.short_name,
            color=d.color,
            icon=d.icon,
            rank=d.rank,
            head_employee_id=d.head_employee_id,
            head_employee_name=head_names.get(d.head_employee_id) if d.head_employee_id else None,
        )
        for d in departments
    ]


@router.get("/{dept_id:int}", response_model=GraphNode)
async def get_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Получить подразделение по ID с сотрудниками и тегами."""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Сотрудники
    emp_result = await db.execute(
        select(Employee)
        .options(joinedload(Employee.position))
        .where(
            Employee.department_id == dept_id,
            Employee.is_deleted == False,
            Employee.is_archived == False,
        )
    )
    employees = emp_result.scalars().unique().all()
    emp_ids = [e.id for e in employees]
    emp_tags_map = await _load_employee_tags(db, emp_ids)
    dept_tags_map = await _load_department_tags(db, [dept_id])

    emp_list = []
    for emp in employees:
        position_name = emp.position.name if emp.position else None
        emp_list.append(
            GraphEmployee(
                id=emp.id,
                name=emp.name,
                position_name=position_name,
                tags=emp_tags_map.get(emp.id, []),
            )
        )

    head_names: dict[int, str] = {}
    if dept.head_employee_id:
        heads_result = await db.execute(
            select(Employee.id, Employee.name).where(Employee.id == dept.head_employee_id)
        )
        for hid, hname in heads_result.all():
            head_names[hid] = hname

    return GraphNode(
        id=dept.id,
        name=dept.name,
        short_name=dept.short_name,
        color=dept.color,
        icon=dept.icon,
        rank=dept.rank,
        head_employee_id=dept.head_employee_id,
        head_employee_name=head_names.get(dept.head_employee_id) if dept.head_employee_id else None,
        tags=dept_tags_map.get(dept_id, []),
        employee_count=len(emp_list),
        employees=emp_list,
    )


# ============================================================================
# CRUD подразделений
# ============================================================================

class DepartmentCreate(BaseModel):
    name: str
    short_name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    head_employee_id: Optional[int] = None
    sort_order: int = 0
    rank: int = 1


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    short_name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    head_employee_id: Optional[int] = None
    sort_order: Optional[int] = None
    rank: Optional[int] = None


@router.post("", response_model=FlatDepartmentNode)
async def create_department(
    data: DepartmentCreate, db: AsyncSession = Depends(get_db)
):
    """Создать подразделение."""
    dept = Department(
        name=data.name,
        short_name=data.short_name,
        color=data.color,
        icon=data.icon,
        head_employee_id=data.head_employee_id,
        sort_order=data.sort_order,
        rank=data.rank,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)

    head_name = None
    if dept.head_employee_id:
        h_result = await db.execute(
            select(Employee.name).where(Employee.id == dept.head_employee_id)
        )
        head_name = h_result.scalar_one_or_none()

    return FlatDepartmentNode(
        id=dept.id,
        name=dept.name,
        short_name=dept.short_name,
        color=dept.color,
        icon=dept.icon,
        rank=dept.rank,
        head_employee_id=dept.head_employee_id,
        head_employee_name=head_name,
    )


@router.patch("/{dept_id:int}", response_model=FlatDepartmentNode)
async def update_department(
    dept_id: int,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Обновить подразделение."""
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"UPDATE dept {dept_id}: {data.model_dump(exclude_unset=True)}")

    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        logger.info(f"  setattr {key} = {value!r}")
        setattr(dept, key, value)

    await db.commit()
    await db.refresh(dept)

    head_name = None
    if dept.head_employee_id:
        h_result = await db.execute(
            select(Employee.name).where(Employee.id == dept.head_employee_id)
        )
        head_name = h_result.scalar_one_or_none()

    return FlatDepartmentNode(
        id=dept.id,
        name=dept.name,
        short_name=dept.short_name,
        color=dept.color,
        icon=dept.icon,
        rank=dept.rank,
        head_employee_id=dept.head_employee_id,
        head_employee_name=head_name,
    )


@router.delete("/{dept_id:int}")
async def delete_department(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить подразделение (если нет сотрудников и связей)."""
    result = await db.execute(select(Department).where(Department.id == dept_id))
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    # Проверяем сотрудников
    emp_result = await db.execute(
        select(Employee)
        .where(Employee.department_id == dept_id, Employee.is_deleted == False)
    )
    employees = emp_result.scalars().all()
    if employees:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete department with active employees",
        )

    # Проверяем связи (и как head, и как child)
    links_result = await db.execute(
        select(DepartmentRelation).where(
            (DepartmentRelation.head_id == dept_id) |
            (DepartmentRelation.child_id == dept_id)
        )
    )
    links = links_result.scalars().all()
    if links:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete department with existing relations. Remove links first.",
        )

    await db.delete(dept)
    await db.commit()
    return {"ok": True}


# ============================================================================
# Связи подразделений (Links)
# ============================================================================

@router.post("/{head_id}/links", response_model=DepartmentLinkResponse)
async def create_department_link(
    head_id: int,
    data: DepartmentLinkCreate,
    db: AsyncSession = Depends(get_db),
):
    """Создать связь между подразделениями."""
    # Проверяем существование
    head_dept = await db.get(Department, head_id)
    child_dept = await db.get(Department, data.child_id)
    if not head_dept or not child_dept:
        raise HTTPException(status_code=404, detail="One or both departments not found")

    # Валидация relation_type
    try:
        rel_type = RelationType(data.relation_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid relation_type. Must be one of: {[r.value for r in RelationType]}",
        )

    # Проверка на дубликат
    existing = await db.execute(
        select(DepartmentRelation).where(
            DepartmentRelation.head_id == head_id,
            DepartmentRelation.child_id == data.child_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Link already exists")

    # Нельзя связывать отдел сам с собой
    if head_id == data.child_id:
        raise HTTPException(status_code=400, detail="Cannot link department to itself")

    link = DepartmentRelation(
        head_id=head_id,
        child_id=data.child_id,
        relation_type=rel_type,
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    return DepartmentLinkResponse(
        head_id=link.head_id,
        child_id=link.child_id,
        relation_type=link.relation_type.value,
    )


@router.delete("/{head_id}/links/{child_id}")
async def delete_department_link(
    head_id: int,
    child_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Удалить связь между подразделениями."""
    result = await db.execute(
        select(DepartmentRelation).where(
            DepartmentRelation.head_id == head_id,
            DepartmentRelation.child_id == child_id,
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    await db.delete(link)
    await db.commit()
    return {"ok": True}


@router.get("/{dept_id}/links", response_model=list[DepartmentLinkResponse])
async def get_department_links(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Получить все связи подразделения (и как head, и как child)."""
    result = await db.execute(
        select(DepartmentRelation).where(
            (DepartmentRelation.head_id == dept_id) |
            (DepartmentRelation.child_id == dept_id)
        )
    )
    links = result.scalars().all()
    return [
        DepartmentLinkResponse(
            head_id=l.head_id,
            child_id=l.child_id,
            relation_type=l.relation_type.value,
        )
        for l in links
    ]


# ============================================================================
# Теги подразделений
# ============================================================================

@router.post("/{dept_id}/tags", response_model=DepartmentTagResponse)
async def assign_tag_to_department(
    dept_id: int,
    data: DepartmentTagAssign,
    db: AsyncSession = Depends(get_db),
):
    """Привязать тег к подразделению."""
    dept = await db.get(Department, dept_id)
    tag = await db.get(Tag, data.tag_id)
    if not dept or not tag:
        raise HTTPException(status_code=404, detail="Department or tag not found")

    existing = await db.execute(
        select(DepartmentTag).where(
            DepartmentTag.department_id == dept_id,
            DepartmentTag.tag_id == data.tag_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag already assigned")

    dt = DepartmentTag(department_id=dept_id, tag_id=data.tag_id)
    db.add(dt)
    await db.commit()
    await db.refresh(dt)

    return DepartmentTagResponse(
        department_id=dt.department_id,
        tag_id=dt.tag_id,
    )


@router.delete("/{dept_id}/tags/{tag_id}")
async def unassign_tag_from_department(
    dept_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Убрать тег у подразделения."""
    result = await db.execute(
        select(DepartmentTag).where(
            DepartmentTag.department_id == dept_id,
            DepartmentTag.tag_id == tag_id,
        )
    )
    dt = result.scalar_one_or_none()
    if dt:
        await db.delete(dt)
        await db.commit()

    return {"ok": True}


@router.get("/{dept_id}/tags", response_model=list[TagRef])
async def get_department_tags(dept_id: int, db: AsyncSession = Depends(get_db)):
    """Получить теги подразделения."""
    dept = await db.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    result = await db.execute(
        select(DepartmentTag, Tag)
        .join(Tag, DepartmentTag.tag_id == Tag.id)
        .where(DepartmentTag.department_id == dept_id)
    )
    rows = result.all()
    return [TagRef(id=tag.id, name=tag.name, color=tag.color) for _, tag in rows]
