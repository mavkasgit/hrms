from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.statement import Statement


class StatementRepository:
    async def list_drafts(self, db: AsyncSession) -> list[Statement]:
        """Список черновиков заявлений (is_draft) с типами и сотрудниками — без N+1."""
        result = await db.execute(
            select(Statement)
            .options(joinedload(Statement.statement_type), joinedload(Statement.employee))
            .where(Statement.is_draft.is_(True))
        )
        return list(result.unique().scalars().all())

    async def get_draft_by_id(self, db: AsyncSession, statement_id: int) -> Optional[Statement]:
        """Черновик заявления по id (только is_draft=True)."""
        result = await db.execute(
            select(Statement)
            .options(joinedload(Statement.statement_type))
            .where(Statement.id == statement_id, Statement.is_draft.is_(True))
        )
        return result.unique().scalar_one_or_none()
