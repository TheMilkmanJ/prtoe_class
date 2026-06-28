# Use a lightweight Python base image
FROM python:3.10-slim

# Prevent python from buffering stdout/stderr (keeps terminal logs real-time)
ENV PYTHONUNBUFFERED=1

# Build args for runtime env (production best practice)
ARG DASHBOARD_USER=admin
ENV DASHBOARD_USER=${DASHBOARD_USER}
ENV DASHBOARD_WORKSPACE_ROOT=/app
# DASHBOARD_PASS should be passed at runtime via -e DASHBOARD_PASS=... to avoid baking secrets into image layers

# Install system dependencies (C/C++ compilers, Fortran, MPI)
RUN apt-get update && apt-get install -y \
    build-essential \
    gfortran \
    openmpi-bin \
    libopenmpi-dev \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd -m -u 1000 dashboarduser

# Set the working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-install PolyChord via Cobaya so it's baked into the image
RUN cobaya-install polychord -p /root/cobaya_packages_clean

# Copy the entire project into the container (use .dockerignore)
COPY . .

# Set ownership
RUN chown -R dashboarduser:dashboarduser /app

# Switch to non-root
USER dashboarduser

# Healthcheck (production)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f -u ${DASHBOARD_USER}:${DASHBOARD_PASS} http://localhost:8000/api/health || exit 1

# Expose the dashboard port and run the server
EXPOSE 8000
CMD ["python3", "scripts/cosmo_dashboard_backend.py"]