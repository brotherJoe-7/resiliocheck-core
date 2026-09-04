# Use official Python runtime as a parent image
FROM python:3.11-slim

# Install dependencies needed for docker client and static analysis
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    lsb-release \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI so the backend can interact with the host docker daemon
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
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
