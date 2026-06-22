import pytest
from fastapi.testclient import TestClient
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))

# Set test env before import
os.environ["DASHBOARD_PASS"] = "testpass123456"
os.environ["DASHBOARD_USER"] = "admin"

from cosmo_dashboard_backend import app, ensure_halofit_in_config, Path

client = TestClient(app)

def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data or "cpu_percent" in data

def test_validate_config():
    # Use a minimal valid config
    test_config = Path("tests/test_minimal.yaml")
    test_config.write_text("""
output: chains/test
likelihood:
  planck_2018_lowl.TT: null
params:
  H0: {prior: {min: 60, max: 80}, ref: 67.4}
theory:
  classy:
    extra_args:
      non_linear: halofit
      use_prtoe: 'no'
sampler:
  polychord: {nlive: 10}
""")
    response = client.post("/api/validate_config", json={"config_name": str(test_config)})
    assert response.status_code == 200
    data = response.json()
    assert data.get("valid") is True
    test_config.unlink()

def test_login_logout():
    # Login
    resp = client.post("/api/login", json={"username": "admin", "password": "testpass123456", "remember_me": False})
    assert resp.status_code == 200
    assert "dashboard_session" in resp.cookies  # cookie set

    # Logout
    resp2 = client.post("/api/logout")
    assert resp2.status_code == 200

def test_metrics():
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    assert "dashboard_uptime" in resp.text or b"dashboard_uptime" in resp.content

def test_supported_models():
    resp = client.get("/api/supported_models")
    assert resp.status_code == 200
    data = resp.json()
    assert "prtoe" in data.get("supported", [])

# Note: full integration tests for start_run require mocks for subprocess/classy.
# Run with: pytest tests/test_dashboard.py -q --tb=no
