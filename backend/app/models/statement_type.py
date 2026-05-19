from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship

from app.models.base import Base


class StatementType(Base):
    __tablename__ = "statement_types"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False, unique=True)
    is_active = Column(Boolean, nullable=False, default=True, server_default="true", index=True)
    template_filename = Column(String(255), nullable=True)
    display_name = Column(String(500), nullable=True)
    field_schema = Column(JSON, nullable=False, default=list, server_default="[]")
    filename_pattern = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        server_onupdate=func.now(),
    )

    statements = relationship("Statement", back_populates="statement_type")
