# Use official Python runtime as a parent image
FROM python:3.11-slim

# Install syntax validators and static-analysis tools for the subprocess sandbox.
# Node.js: JS/TS syntax check (node --check)
# PHP, Ruby: language-specific syntax linting
# bash: shell script syntax check
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    bash \
    nodejs \
    npm \
    php-cli \
    ruby \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install (includes semgrep + bandit)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend and config code
COPY backend/ ./backend/
COPY config/ ./config/

# Expose the port the app runs on
EXPOSE 8000

# Cloud Run injects the $PORT environment variable. 
# We use uvicorn to run the FastAPI app on that port.
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

