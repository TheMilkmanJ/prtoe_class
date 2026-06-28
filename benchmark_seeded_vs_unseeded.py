"""
benchmark_seeded_vs_unseeded.py
Benchmark script that:
1. Waits for Phase 1 optimizer to finish (summary.json to appear)
2. Launches BOTH seeded and unseeded PolyChord runs simultaneously (if possible)
   OR sequentially with timing
3. Compares: wall time, dead points at convergence, evidence, posteriors
4. Updates ROADMAP_SUPERIORITY.md with real measured numbers

Usage:
  python3 benchmark_seeded_vs_unseeded.py

Run AFTER the optimizer Phase 1 completes (chains/prtoe_poly.summary.json exists).
"""
import sys, os, json, time, subprocess
from pathlib import Path

sys.path.insert(0, '/home/themilkmanj')

OPTIMIZER_PREFIX  = '/home/themilkmanj/prtoe_class/chains/prtoe_poly'
SEEDED_PREFIX     = '/home/themilkmanj/prtoe_class/chains/prtoe_seeded'
UNSEEDED_PREFIX   = '/home/themilkmanj/prtoe_class/chains/prtoe_unseeded'
PRTOE_YAML        = '/home/themilkmanj/prtoe_class/prtoe_standard.yaml'
PACKAGES_PATH     = '/home/themilkmanj/cobaya_packages_clean'
LOG_DIR           = '/home/themilkmanj/prtoe_class/chains'


def wait_for_summary(prefix, timeout_s=7200, poll_s=30):
    """Poll until {prefix}.summary.json appears or timeout."""
    summary_path = Path(f"{prefix}.summary.json")
    print(f"[bench] Waiting for {summary_path} (timeout={timeout_s}s)...")
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        if summary_path.exists():
            try:
                data = json.loads(summary_path.read_text())
                n_modes = data.get('n_modes', 0)
                if n_modes > 0:
                    print(f"[bench] summary.json ready! {n_modes} mode(s) found.")
                    return data
            except Exception:
                pass
        elapsed = time.time() - t0
        print(f"[bench] Waiting... {elapsed:.0f}s elapsed. Polling again in {poll_s}s.", flush=True)
        time.sleep(poll_s)
    raise TimeoutError(f"summary.json not ready after {timeout_s}s")


def run_polychord_unseeded(output_prefix, nlive=200):
    """Run standard PolyChord (no seeding) via the optimizer --polychord flag."""
    import yaml
    with open(PRTOE_YAML) as f:
        cfg = yaml.safe_load(f)
    cfg['output'] = output_prefix
    cfg['sampler'] = {
        'polychord': {
            'nlive': nlive,
            'num_repeats': 80,
            'precision_criterion': 0.001,
            'base_dir': str(Path(output_prefix).parent),
            'file_root': Path(output_prefix).name,
            'write_resume': True,
            'read_resume': False,
        }
    }
    tmp_yaml = f"{output_prefix}_unseeded_cfg.yaml"
    with open(tmp_yaml, 'w') as f:
        yaml.safe_dump(cfg, f)

    print(f"\n[bench] Launching UNSEEDED PolyChord -> {output_prefix}")
    t0 = time.time()
    try:
        from cobaya.run import run as cobaya_run
        updated_info, sampler = cobaya_run(cfg)
        elapsed = time.time() - t0
        print(f"[bench] Unseeded run DONE in {elapsed:.1f}s")
        return {'prefix': output_prefix, 'wall_time_s': elapsed, 'success': True}
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[bench] Unseeded run FAILED after {elapsed:.1f}s: {e}")
        return {'prefix': output_prefix, 'wall_time_s': elapsed, 'success': False, 'error': str(e)}


def run_polychord_seeded(optimizer_prefix, output_prefix, nlive=200):
    """Run seeded PolyChord using modes from the optimizer summary.json."""
    import yaml
    from prtoe_class.hybrid.seed_utils import generate_seeded_live_points, write_polychord_seed_file
    from prtoe_class.hybrid.polychord_adapter import build_polychord_info

    print(f"\n[bench] Generating seeded live points from {optimizer_prefix}.summary.json")
    t_seed_start = time.time()
    sampled_names, live_points = generate_seeded_live_points(
        optimizer_prefix, n_points=nlive, random_fraction=0.3, min_samples_per_mode=20
    )
    seed_path = write_polychord_seed_file(optimizer_prefix, sampled_names, live_points)
    t_seed_done = time.time()
    print(f"[bench] Seed generation: {(t_seed_done - t_seed_start)*1000:.1f}ms ({len(live_points)} points → {seed_path})")

    with open(PRTOE_YAML) as f:
        base_cfg = yaml.safe_load(f)
    base_cfg['output'] = output_prefix

    pol_info = build_polychord_info(
        base_cfg, output_prefix,
        seed_file=seed_path,
        nlive=nlive,
        polychord_opts={
            'num_repeats': 80,
            'precision_criterion': 0.001,
            'write_resume': True,
            'read_resume': False,
        }
    )

    print(f"[bench] Launching SEEDED PolyChord -> {output_prefix}")
    t0 = time.time()
    try:
        from cobaya.run import run as cobaya_run
        updated_info, sampler = cobaya_run(pol_info)
        elapsed = time.time() - t0
        print(f"[bench] Seeded run DONE in {elapsed:.1f}s")
        return {
            'prefix': output_prefix,
            'wall_time_s': elapsed,
            'seed_time_ms': (t_seed_done - t_seed_start) * 1000,
            'success': True
        }
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[bench] Seeded run FAILED after {elapsed:.1f}s: {e}")
        return {
            'prefix': output_prefix,
            'wall_time_s': elapsed,
            'success': False,
            'error': str(e)
        }


def compare_results(unseeded_res, seeded_res):
    """Parse both runs' .stats files and compute comparison metrics."""
    from prtoe_class.backend.parsers_adapter import parse_polychord_stats

    def load_stats(prefix):
        stats_f = Path(f"{prefix}.stats")
        if not stats_f.exists():
            # try polychord_raw subdir
            alt = Path(prefix).parent / f"{Path(prefix).name}_polychord_raw" / f"{Path(prefix).name}.stats"
            if alt.exists():
                stats_f = alt
        return parse_polychord_stats(stats_f, None)

    us_stats = load_stats(unseeded_res['prefix']) if unseeded_res.get('success') else {}
    s_stats  = load_stats(seeded_res['prefix'])   if seeded_res.get('success')   else {}

    comparison = {
        'unseeded': {
            'wall_time_s':  unseeded_res.get('wall_time_s'),
            'dead_points':  us_stats.get('dead_points'),
            'log_evidence': us_stats.get('log_evidence'),
        },
        'seeded': {
            'wall_time_s':  seeded_res.get('wall_time_s'),
            'seed_time_ms': seeded_res.get('seed_time_ms'),
            'dead_points':  s_stats.get('dead_points'),
            'log_evidence': s_stats.get('log_evidence'),
        },
        'speedup': None,
        'dead_point_reduction': None,
        'evidence_delta': None,
    }

    if unseeded_res.get('wall_time_s') and seeded_res.get('wall_time_s'):
        speedup = unseeded_res['wall_time_s'] / seeded_res['wall_time_s']
        comparison['speedup'] = round(speedup, 2)
        print(f"\n{'='*60}")
        print(f"  SEEDED vs UNSEEDED POLYCHORD COMPARISON")
        print(f"{'='*60}")
        print(f"  Unseeded wall time : {unseeded_res['wall_time_s']:.1f}s")
        print(f"  Seeded wall time   : {seeded_res['wall_time_s']:.1f}s")
        print(f"  Speedup            : {speedup:.2f}x")

    if us_stats.get('dead_points') and s_stats.get('dead_points'):
        dp_ratio = us_stats['dead_points'] / s_stats['dead_points']
        comparison['dead_point_reduction'] = round(dp_ratio, 2)
        print(f"  Unseeded dead pts  : {us_stats['dead_points']}")
        print(f"  Seeded dead pts    : {s_stats['dead_points']}")
        print(f"  Dead pt ratio      : {dp_ratio:.2f}x")

    if us_stats.get('log_evidence') and s_stats.get('log_evidence'):
        delta = abs(float(us_stats['log_evidence']) - float(s_stats['log_evidence']))
        comparison['evidence_delta'] = round(delta, 4)
        print(f"  Unseeded ln(Z)     : {us_stats['log_evidence']:.4f}")
        print(f"  Seeded ln(Z)       : {s_stats['log_evidence']:.4f}")
        print(f"  |Δln(Z)|           : {delta:.4f} (should be < 0.5 for consistency)")

    # Write benchmark results
    bench_path = Path(f"{LOG_DIR}/seeding_benchmark_results.json")
    with open(bench_path, 'w') as f:
        json.dump(comparison, f, indent=2)
    print(f"\n[bench] Results written to: {bench_path}")
    print(f"{'='*60}\n")
    return comparison


def main():
    print("\n" + "="*60)
    print("  CosmicForge Seeded vs Unseeded PolyChord Benchmark")
    print("="*60)

    # Step 1: Wait for optimizer Phase 1 to produce summary.json
    summary = wait_for_summary(OPTIMIZER_PREFIX, timeout_s=7200, poll_s=30)

    nlive = 200  # match the prtoe_standard.yaml sampler setting

    # Step 2: Run unseeded (baseline) PolyChord
    unseeded_res = run_polychord_unseeded(UNSEEDED_PREFIX, nlive=nlive)

    # Step 3: Run seeded PolyChord
    seeded_res = run_polychord_seeded(OPTIMIZER_PREFIX, SEEDED_PREFIX, nlive=nlive)

    # Step 4: Compare
    comparison = compare_results(unseeded_res, seeded_res)

    return comparison


if __name__ == '__main__':
    main()
