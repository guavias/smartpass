# syntax=docker/dockerfile:1

FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

ARG VITE_API_BASE_URL
ARG VITE_SQUARE_APP_ID
ARG VITE_SQUARE_ENV
ARG VITE_SQUARE_LOCATION_ID

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SQUARE_APP_ID=$VITE_SQUARE_APP_ID
ENV VITE_SQUARE_ENV=$VITE_SQUARE_ENV
ENV VITE_SQUARE_LOCATION_ID=$VITE_SQUARE_LOCATION_ID

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS backend-runtime
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist /app/frontend_dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
