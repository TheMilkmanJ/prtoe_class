#!/usr/bin/env python3
"""
Production helper: Standardize any Cobaya+CLASS YAML for dashboard use.
Injects common best practices (halofit, workspace root, etc.) for any model type.
Usage: python scripts/standardize_cobaya_yaml.py your_config.yaml --output standardized.yaml
"""
import yaml
import argparse
from pathlib import Path
import os

def standardize(yaml_path: Path, output: Path = None, workspace_root: str = None):
    with open(yaml_path, 'r') as f:
        cfg = yaml.safe_load(f) or {}

    # Ensure classy theory
    theory = cfg.setdefault('theory', {}).setdefault('classy', {})
    extra = theory.setdefault('extra_args', {})

    # Always halofit unless hmcode explicitly wanted
    if 'non_linear' not in extra and 'non linear' not in extra:
        extra['non_linear'] = 'halofit'

    # Set path if not present
    if 'path' not in theory:
        theory['path'] = workspace_root or os.environ.get('DASHBOARD_WORKSPACE_ROOT', str(Path.cwd().parent))

    # Stop at error for production debugging
    theory.setdefault('stop_at_error', False)

    if not output:
        output = yaml_path.with_suffix('.standardized.yaml')

    with open(output, 'w') as f:
        yaml.dump(cfg, f, default_flow_style=False, sort_keys=False)

    print(f"Standardized {yaml_path} -> {output}")
    print("Injected: non_linear=halofit, path, stop_at_error=False (edit as needed)")
    return output

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config", help="Input yaml")
    parser.add_argument("--output", help="Output path", default=None)
    parser.add_argument("--root", help="Workspace root", default=None)
    args = parser.parse_args()
    standardize(Path(args.config), Path(args.output) if args.output else None, args.root)
