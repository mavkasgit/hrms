from sqlalchemy import Column, Integer, String

from app.models.base import Base


class Reference(Base):
    __tablename__ = "references"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category = Column(String(50), nullable=False, index=True)
    value = Column(String(255), nullable=False)
    order = Column(Integer, default=0)
