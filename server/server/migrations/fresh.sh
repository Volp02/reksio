rm data/vacuula.db
rm migrations/versions/ -r
uv run alembic revision --autogenerate -m "initial"
uv run alembic upgrade head