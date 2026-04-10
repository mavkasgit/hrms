from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.tag import Tag, EmployeeTag

router = APIRouter(prefix="/tags", tags=["org"])


class TagCreate(BaseModel):
    name: str
    sort_order: int = 0


class TagUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None


class TagResponse(BaseModel):
    id: int
    name: str
    sort_order: int

    class Config:
        from_attributes = True


@router.get("", response_model=list[TagResponse])
async def get_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Tag).order_by(Tag.sort_order, Tag.name)
    )
    return list(result.scalars().all())


@router.post("", response_model=TagResponse)
async def create_tag(data: TagCreate, db: AsyncSession = Depends(get_db)):
    tag = Tag(**data.model_dump())
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.get("/{tag_id}", response_model=TagResponse)
async def get_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: int, data: TagUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).where(Tag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    await db.execute(delete(EmployeeTag).where(EmployeeTag.tag_id == tag_id))
    await db.delete(tag)
    await db.commit()
    return {"ok": True}


@router.post("/assign")
async def assign_tag(
    employee_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(EmployeeTag).where(
            EmployeeTag.employee_id == employee_id,
            EmployeeTag.tag_id == tag_id
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
    result = await db.execute(
        select(EmployeeTag).where(
            EmployeeTag.employee_id == employee_id,
            EmployeeTag.tag_id == tag_id
        )
    )
    emp_tag = result.scalar_one_or_none()
    
    if emp_tag:
        await db.delete(emp_tag)
        await db.commit()
    
    return {"ok": True}