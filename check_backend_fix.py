#!/usr/bin/env python3
import sys
sys.path.insert(0, 'scripts')

try:
    from cosmo_dashboard_backend import make_class_instance
    print("✓ Successfully imported make_class_instance")
    
    c, params = make_class_instance()
    print("✓ Successfully created Class instance")
    print(f"✓ Class type: {type(c)}")
    print("SUCCESS: Backend fix works!")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# Made with Bob
