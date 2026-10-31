"""boundary backup per map

Revision ID: d4e8a1c39f27
Revises: c71b0e5d2a44
Create Date: 2026-10-31 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8a1c39f27'
down_revision: Union[str, Sequence[str], None] = 'c71b0e5d2a44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('boundary_backup',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('map_id', sa.String(), nullable=False),
    sa.Column('ts', sa.Float(), nullable=False),
    sa.Column('boundaries', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_boundary_backup_robot_map_ts', 'boundary_backup', ['robot', 'map_id', 'ts'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_boundary_backup_robot_map_ts', table_name='boundary_backup')
    op.drop_table('boundary_backup')
