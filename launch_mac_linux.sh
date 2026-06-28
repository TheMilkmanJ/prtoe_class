#!/bin/bash
echo "==================================================="
echo "       CosmicDashboard - One-Click Launcher"
echo "==================================================="
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed or not running."
    echo "Please install Docker from https://docs.docker.com/get-docker/"
    exit 1
fi

# Generate credentials if not set
if [ -z "${DASHBOARD_PASS:-}" ]; then
    DASHBOARD_PASS=$(python3 -c "
import secrets, string
alphabet = string.ascii_letters + string.digits + '-_'
print(''.join(secrets.choice(alphabet) for _ in range(12)))
")
    echo "==========================================================================="
    echo " COSMICDASHBOARD LOGIN CREDENTIALS"
    echo ""
    echo "   Username : ${DASHBOARD_USER:-admin}"
    echo "   Password : $DASHBOARD_PASS"
    echo ""
    echo "   (Enter these when your browser prompts for login.)"
    echo "==========================================================================="
    mkdir -p "$(pwd)/chains"
    echo "$DASHBOARD_PASS" > "$(pwd)/chains/dashboard_credentials.txt"
    chmod 600 "$(pwd)/chains/dashboard_credentials.txt" 2>/dev/null || true
fi

export DASHBOARD_USER="${DASHBOARD_USER:-admin}"
export DASHBOARD_PASS

echo "Building Docker container (this may take a few minutes the first time)..."
docker build -t cosmic-dashboard .

echo "Starting backend server..."
docker stop cosmic-backend >/dev/null 2>&1 || true
docker rm cosmic-backend >/dev/null 2>&1 || true
docker run -d --name cosmic-backend -p 8000:8000 -e DASHBOARD_USER -e DASHBOARD_PASS -v "$(pwd)/chains:/app/chains" cosmic-dashboard

echo "Waiting for server to start..."
sleep 5

echo "Opening Dashboard in your browser at http://localhost:8000..."
if command -v open &> /dev/null; then
    open http://localhost:8000
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:8000
else
    echo "Please open http://localhost:8000 manually in your web browser."
fi

echo ""
echo "Press Ctrl+C to stop the server..."
trap "docker stop cosmic-backend; docker rm cosmic-backend; exit 0" SIGINT SIGTERM

# Keep script running
while docker ps | grep -q cosmic-backend; do
    sleep 2
done