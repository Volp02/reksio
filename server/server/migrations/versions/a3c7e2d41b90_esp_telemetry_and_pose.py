"""ESP telemetry and pose

Revision ID: a3c7e2d41b90
Revises: 5fe01baecb7b
Create Date: 2026-10-30 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c7e2d41b90'
down_revision: Union[str, Sequence[str], None] = '5fe01baecb7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('telemetry',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('ts', sa.Float(), nullable=False),
    sa.Column('data', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_telemetry_robot_ts', 'telemetry', ['robot', 'ts'], unique=False)
    op.create_table('pose',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('ts', sa.Float(), nullable=False),
    sa.Column('x', sa.Float(), nullable=False),
    sa.Column('y', sa.Float(), nullable=False),
    sa.Column('theta', sa.Float(), nullable=False),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pose_robot_ts', 'pose', ['robot', 'ts'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_pose_robot_ts', table_name='pose')
    op.drop_table('pose')
    op.drop_index('ix_telemetry_robot_ts', table_name='telemetry')
    op.drop_table('telemetry')
