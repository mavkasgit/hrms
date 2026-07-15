<%
import os, re as _re
_script_loc = config.get_main_option("script_location", "alembic")
_versions_dir = config.get_main_option("version_locations") or os.path.join(_script_loc, "versions")
_existing = [f for f in os.listdir(_versions_dir) if f.endswith(".py")] if os.path.isdir(_versions_dir) else []
_nums = sorted(int(_re.match(r"^(\d+)", f).group(1)) for f in _existing if _re.match(r"^(\d+)", f))
_next = f"{(_nums[-1] + 1) if _nums else 1:03d}"
up_revision = _next
%>"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
