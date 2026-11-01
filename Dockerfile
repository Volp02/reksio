# Reksio-Image: Vacuula-Server (server/) mit der neuen Web-App (web/) statt server/app.
# Python-Teil wie server/build/docker/Dockerfile (Upstream), Kontext = Repo-Root.

FROM --platform=$BUILDPLATFORM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# Reksio-Version aus dem Release-Tag (release.yml), sonst „dev“
ARG REKSIO_VERSION=
RUN VITE_REKSIO_VERSION="$REKSIO_VERSION" npm run build


FROM python:3.14-slim AS python-build
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /bin/
WORKDIR /server
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
COPY server/server/pyproject.toml server/server/uv.lock ./
RUN uv sync --frozen --no-dev --no-editable --no-install-project
COPY server/server/src ./src
RUN version="$(sed -nE 's/^version = "(.*)"/\1/p' pyproject.toml | head -1)" \
    && printf 'APP_VERSION = "%s"\n' "${version:-0.0.0-dev}" > src/vacuula_server/_build_version.py
RUN uv sync --frozen --no-dev --no-editable


FROM python:3.14-slim
WORKDIR /server
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl openssl \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/server/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY --from=python-build /server/.venv ./.venv
COPY server/server/ssl/vacuula.cnf ./ssl/vacuula.cnf
COPY server/server/alembic.ini ./
COPY server/server/migrations ./migrations
COPY --from=web /web/dist ./web
ARG REKSIO_VERSION=
ENV REKSIO_VERSION=$REKSIO_VERSION
CMD ["sh", "-c", "alembic upgrade head && vacuula-server"]
