import json
from pathlib import Path


def compare_seeded_vs_unseeded(optimizer_prefix, seeded_prefix, unseeded_prefix=None):
    """Compare two Polychord runs (seeded vs unseeded) plus optimizer summary when available.
    Produces a small dict with delta_logZ, delta_chi2 and parameter shifts where possible.
    """
    res = {"optimizer": optimizer_prefix, "seeded": seeded_prefix, "unseeded": unseeded_prefix, "delta_logZ": None, "delta_chi2": None, "param_shifts": {}, "notes": []}

    def load_summary(pfx):
        p = Path(f"{pfx}.summary.json")
        if not p.exists():
            return None
        try:
            return json.loads(p.read_text())
        except Exception:
            return None

    opt = load_summary(optimizer_prefix)
    s = load_summary(seeded_prefix)
    u = load_summary(unseeded_prefix) if unseeded_prefix else None

    try:
        if s and u:
            s_logz = s.get('combined_logZ')
            u_logz = u.get('combined_logZ')
            if s_logz is not None and u_logz is not None:
                res['delta_logZ'] = float(s_logz) - float(u_logz)
        elif s and opt:
            # compare seeded polychord to optimizer's combined lnZ if available
            s_logz = s.get('combined_logZ')
            o_logz = opt.get('combined_logZ')
            if s_logz is not None and o_logz is not None:
                res['delta_logZ'] = float(o_logz) - float(s_logz)
    except Exception as e:
        res['notes'].append(f'logZ compare failed: {e}')

    try:
        # chi2 compare if best-fit penalized_chi2 available
        def best_chi(p):
            if not p:
                return None
            modes = p.get('modes', [])
            if modes:
                return modes[0].get('penalized_chi2')
            return None
        s_chi = best_chi(s)
        u_chi = best_chi(u)
        o_chi = best_chi(opt)
        if s_chi is not None and u_chi is not None:
            res['delta_chi2'] = float(o_chi) - float(s_chi) if o_chi is not None else None
        elif s_chi is not None and o_chi is not None:
            res['delta_chi2'] = float(o_chi) - float(s_chi)
    except Exception as e:
        res['notes'].append(f'chi2 compare failed: {e}')

    # Parameter shifts (best-effort)
    try:
        if opt and s:
            o_pf = opt.get('modes', [])
            s_pf = s.get('modes', [])
            if o_pf and s_pf:
                o_p = o_pf[0].get('point', {})
                s_p = s_pf[0].get('point', {})
                for k in o_p.keys():
                    if k in s_p:
                        res['param_shifts'][k] = float(o_p[k] - s_p[k])
    except Exception as e:
        res['notes'].append(f'param shift failed: {e}')

    # Write a compact artifact
    try:
        outp = Path(f"{optimizer_prefix}.vs.{seeded_prefix}.seed_comparison.json")
        outp.write_text(json.dumps(res, indent=2))
    except Exception:
        pass

    return res
