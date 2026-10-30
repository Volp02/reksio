from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from vacuula_server.db import Base


class AppSetting(Base):
    """Server settings changeable from the web app (key/value), e.g. esp_host."""
    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, nullable=False)
