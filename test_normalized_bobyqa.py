import numpy as np
import pybobyqa

# Test normalized parameter space with mock function
# This verifies the fix for the rhobeg constraint issue

# Physical bounds (similar to actual PRTOE parameters)
xl = [0.019, 0.1, 55.0, 1.61, 0.8, 5.0, 0.9875, 1.0e-07, 0.0001]
xu = [0.026, 0.2, 85.0, 3.91, 1.2, 12.0, 1.0125, 1.2e-05, 5.0]

# Initial guess (physical space)
start_x = [0.0224, 0.12, 67.4, 3.05, 0.965, 8.0, 1.0, 1.0119e-07, 0.1]

# Map starting point to normalized space
start_y = [(start_x[i] - xl[i]) / (xu[i] - xl[i]) if (xu[i] - xl[i]) > 0 else 0.5 
           for i in range(len(start_x))]

# Project slightly inside [0,1] to avoid boundary issues
epsilon = 1e-4
start_y = [max(epsilon, min(1.0 - epsilon, val)) for val in start_y]

print(f"Physical bounds: xl={xl}")
print(f"Physical bounds: xu={xu}")
print(f"Physical start_x: {start_x}")
print(f"Normalized start_y: {start_y}")
print(f"All normalized values in [0,1]: {all(0 <= v <= 1 for v in start_y)}")

# Normalized bounds are [0,1] for all parameters
normalized_bounds = ([0.0] * len(xl), [1.0] * len(xu))

# Universal rhobeg = 5% of normalized range (0.05)
rhobeg = 0.05

# Mock target function (simple quadratic)
def mock_target(y):
    # Map normalized y to physical x
    x = [xl[i] + y[i] * (xu[i] - xl[i]) for i in range(len(y))]
    # Simple quadratic: sum of squared deviations from center
    center = [(xl[i] + xu[i]) / 2 for i in range(len(x))]
    return sum((x[i] - center[i])**2 for i in range(len(x)))

# Solve with normalized parameters
res_raw = pybobyqa.solve(
    mock_target,
    start_y,
    bounds=normalized_bounds,
    rhobeg=rhobeg,
    maxfun=30,
    objfun_has_noise=False,
    print_progress=True
)

print(f"\nResult:")
print(f"res.x (normalized): {res_raw.x}")
print(f"res.f: {res_raw.f}")
print(f"res.flag: {res_raw.flag}")
print(f"res.msg: {res_raw.msg}")

# Map result back to physical space
if res_raw.x is not None:
    best_x_physical = [xl[i] + res_raw.x[i] * (xu[i] - xl[i]) for i in range(len(res_raw.x))]
    print(f"Best point (physical): {best_x_physical}")
else:
    print("ERROR: res.x is None - optimization failed")
