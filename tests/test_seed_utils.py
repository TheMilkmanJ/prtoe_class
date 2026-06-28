import json, yaml, os, sys
from pathlib import Path

# Prepare a temporary prefix in /tmp
prefix = '/tmp/seed_test'
summary = {
    'output_prefix': prefix,
    'timestamp': '2026-06-27 00:00:00',
    'n_modes': 1,
    'combined_logZ': -123.4,
    'modes': [
        {
            'name': 'Mode 1',
            'point': {'H0': 68.0, 'omega_b': 0.022, 'omega_cdm': 0.12},
            'logZ': -124.0,
            'evidence_method': 'Laplace (Hessian)',
            'penalized_chi2': 10.0,
            'viability_score': 95.0,
            'stability': 80.0,
            'isolation': 0.2,
            'mcmc_samples': 50,
            'mcmc_acc_rate': 23.0,
            'ess': {'H0': 150.0},
            'errors': {'H0': 0.5},
            'cov_diag': [0.25, 1e-6, 1e-6]
        }
    ]
}

updated = {
    'params': {
        'H0': {'prior': {'min': 50.0, 'max': 90.0}},
        'omega_b': {'prior': {'min': 0.01, 'max': 0.03}},
        'omega_cdm': {'prior': {'min': 0.05, 'max': 0.2}}
    }
}

# Write files
with open(prefix + '.summary.json', 'w') as f:
    json.dump(summary, f)
with open(prefix + '.updated.yaml', 'w') as f:
    yaml.safe_dump(updated, f)

# Run the seed generator
sys.path.insert(0, str(Path(__file__).parents[1]))
try:
    from prtoe_class.hybrid import seed_utils
except Exception as e:
    try:
        from hybrid import seed_utils
    except Exception as e2:
        print('Failed to import seed_utils:', e, e2)
        raise

sampled_names, live_points = seed_utils.generate_seeded_live_points(prefix, n_points=20, random_fraction=0.2, min_samples_per_mode=10)
print('Sampled names:', sampled_names)
print('Number of live points:', len(live_points))
print('First live point:', live_points[0])

# Clean up created files
# (leave seed files for inspection)
print('Test completed successfully')
