"""cleaning jobs, incidents, robot reports

Revision ID: e7a3c5d91b42
Revises: d4e8a1c39f27
Create Date: 2026-10-31 17:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a3c5d91b42'
down_revision: Union[str, Sequence[str], None] = 'd4e8a1c39f27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('cleaning_job',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('started', sa.Float(), nullable=False),
    sa.Column('finished', sa.Float(), nullable=True),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('plan_id', sa.String(), nullable=True),
    sa.Column('map_id', sa.String(), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('reason', sa.String(), nullable=True),
    sa.Column('zones', sa.JSON(), nullable=False),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_cleaning_job_robot_started', 'cleaning_job', ['robot', 'started'], unique=False)
    op.create_table('incident',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('ts', sa.Float(), nullable=False),
    sa.Column('end_ts', sa.Float(), nullable=True),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('code', sa.String(), nullable=False),
    sa.Column('message', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_incident_robot_ts', 'incident', ['robot', 'ts'], unique=False)
    op.create_table('robot_report',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('robot', sa.String(), nullable=False),
    sa.Column('ts', sa.Float(), nullable=False),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('ref', sa.String(), nullable=True),
    sa.Column('data', sa.JSON(), nullable=True),
    sa.ForeignKeyConstraint(['robot'], ['robot.serial'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_robot_report_robot_ts', 'robot_report', ['robot', 'ts'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_robot_report_robot_ts', table_name='robot_report')
    op.drop_table('robot_report')
    op.drop_index('ix_incident_robot_ts', table_name='incident')
    op.drop_table('incident')
    op.drop_index('ix_cleaning_job_robot_started', table_name='cleaning_job')
    op.drop_table('cleaning_job')
