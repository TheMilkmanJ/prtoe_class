#!/usr/bin/env python3
"""
CosmicExplorer — Fast CLI for CLASS / Cobaya / PolyChord
"""

import sys, os, subprocess, json, re, shutil, textwrap, ast
from datetime import datetime
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt
from rich.table import Table
from rich.syntax import Syntax
from rich.tree import Tree
from rich.markdown import Markdown
from rich.text import Text
from rich import box
import ollama, yaml

console = Console()
PROJ = Path("/home/themilkmanj/prtoe_class")

SYSTEM = (
    "You are CosmicExplorer — an elite CLI assistant for CLASS, Cobaya, PolyChord, and CosmicDashboard "
    f"at {PROJ}.\n\n"
    "== COMPONENT INTERFACES ==\n\n"
    "1. CLASS (C library) ↔ Cobaya (via classy Python Cython module):\n"
    "   - Cobaya YAML theory.classy.path → project root (contains libclass.a, python/classy.pyx)\n"
    "   - Cobaya imports classy.Class from build/lib.*/classy/ via sys.path manipulation\n"
    "   - Cobaya merges params + theory.classy.extra_args → flat dict → Class().set(**params)\n"
    "   - set() stores in self._pars dict, _fillparfile() converts to CLASS file_content C struct\n"
    "   - compute(level=['distortions']) runs module chain: input→background→thermodynamics→\n"
    "     perturbations→primordial→fourier→transfer→harmonic→lensing→distortions\n"
    "   - Results accessed via: raw_cl(lmax), lensed_cl(lmax) → {ell,tt,ee,te,bb,pp,tp}\n"
    "     Also: h(), H0(), Omega_m(), sigma8(), S8(), age(), rs(), z_reio(), tau_reio()\n"
    "   - extra_args: use_prtoe=yes, non_linear=halofit, gauge=newtonian,\n"
    "     hyper_flat_approximation_nu=7000, transfer_neglect_delta_k_S_t*=(0.17,0.05,0.17,0.13),\n"
    "     delta_l_max=1000, N_ur=2.0328, N_ncdm=1, T_ncdm=0.71611\n\n"
    "2. Cobaya ↔ PolyChord (sampler):\n"
    "   - YAML sampler.polychord config: nlive(100-200), num_repeats(20-60), do_clustering,\n"
    "     precision_criterion(0.01-0.001), blocking, synchronous(false vs MPI)\n"
    "   - Cobaya launches: mpirun [--oversubscribe --bind-to none] -np N python -m cobaya run\n"
    "     <config.yaml> --packages-path ~/cobaya_packages_clean [-f | -r]\n"
    "   - PolyChord calls LogLike(theta) per iteration → Cobaya converts parameter vector to\n"
    "     CLASS params → CLASS runs → spectra → likelihoods → total logL returned\n"
    "   - Output (prefix = YAML output key, e.g. chains/prtoe_polychord):\n"
    "     * <prefix>.txt: final chain [weight, -2log(post), log(prior), params...]\n"
    "     * <prefix>.stats: log(Z), ndead, nlive, nposterior, nequals, param means/sigmas\n"
    "     * <prefix>_polychord_raw/<prefix>.txt: raw dead [weight, -2logL, params..., logprior, loglikes...]\n"
    "     * <prefix>_polychord_raw/<prefix>.resume: in-progress ndead, log(Z), log(Z^2)\n"
    "     * <prefix>_polychord_raw/<prefix>_phys_live.txt: live points [params..., logL]\n"
    "     * <prefix>_polychord_raw/clusters/: cluster posteriors (if do_clustering)\n"
    "   - Param ordering: PolyChord outputs sampled params first (in YAML order with 'prior'),\n"
    "     then derived (value/derived lambdas). .stats dims follow same order.\n"
    "   - Likelihood order in raw .txt: logprior_0, loglike__<name> for each likelihood\n\n"
    "3. PolyChord output ↔ Dashboard (live monitoring):\n"
    "   - Dashboard polls /api/status every ~1-2s\n"
    "   - Reads .resume for ndead/logZ, .stats for final, .txt for param constraints\n"
    "   - parse_polychord_stats() regex-extracts: ndead from .resume '=== Number of dead points ===',\n"
    "     log(Z) from '=== global evidence -- log(<Z>) ==='\n"
    "   - get_best_fit_details() incrementally reads chain files using seek caching\n"
    "   - Maps columns to params: samples = config 'params' with 'prior', derived = 'value' lambdas\n"
    "   - Per-dataset chi2 extracted from log file 'Computed derived parameters:' lines\n\n"
    "4. Dashboard (CosmicDashboard) architecture:\n"
    "   - FastAPI backend (8807 lines) at cosmic_dashboard/backend/cosmo_dashboard_backend.py\n"
    "   - Single-page frontend at cosmic_dashboard/frontend/index.html\n"
    "   - Launch via launch_cosmic.sh: watchdog loops for backend + localtunnel + browser\n"
    "   - Key endpoints: POST /api/start_run, POST /api/stop_run, GET /api/status,\n"
    "     WS /ws/status (WebSocket), GET /api/health, GET /api/chain_quality\n"
    "   - start_run: validates YAML, injects halofit/class_path, normalizes PRTOE names,\n"
    "     optionally rebuilds CLASS, then Popen(mpirun -np N python -m cobaya run ...)\n"
    "     plus subprocess plot_chains.py --monitor-and-stop --interval 150\n"
    "   - background_process_watcher() polls every 5s, detects completion/crash\n"
    "   - Supports multiple CLASS engines via chains/class_engines.json\n"
    "   - Templates: lcdm_baseline, prtoe_standard, wcdm_test, ede_test\n"
    "   - PRTOE (Pulford-Romsa Theory of Everything) param aliases normalized: prtoe_xi→xi_prtoe, prtoe_delta→delta_prtoe, etc.\n\n"
    "5. Complete data flow (click to chain):\n"
    "   User clicks Start → backend validates & injects params → mpirun cobaya run →\n"
    "   Cobaya loads classy.Class → PolyChord nested sampling loop:\n"
    "     each iteration: draw point → Cobaya converts vector→dict → classy set+compute →\n"
    "     CLASS C code runs → spectra→likelihoods→logL returned → PolyChord writes dead to .txt,\n"
    "     updates .resume → Dashboard polls files every 1-2s → progress displayed\n"
    "   On completion: final .stats, .txt written → dashboard detects exit → stores in SQLite\n\n"
    "Rules: concise, technical, specific file paths, exact numbers, no tool calls. "
    "When asked about runs or chains, always reference actual file paths under chains/."
)

# ── HELPERS ──────────────────────────────────────────────────────────────────


def fmt_size(b):
    for unit in ("B", "K", "M", "G"):
        if b < 1024:
            return f"{b:.1f}{unit}" if b >= 10 else f"{b:.0f}{unit}"
        b /= 1024
    return f"{b:.1f}T"


def fmt_time(t):
    return datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M")


def rel(p):
    try:
        return str(p.relative_to(PROJ))
    except ValueError:
        return str(p)


# ── CHAIN / STATS PARSING ────────────────────────────────────────────────────


def find_stats(name: str = "") -> Path | None:
    if name:
        pat = f"chains/**/{name}.stats"
        fs: list[Path] = list(PROJ.glob(pat))
        if not fs:
            fs = list(PROJ.glob(f"chains/**/*{name}*.stats"))
        if fs:
            return fs[0]
    fs = list(PROJ.glob("chains/**/*.stats"))
    if not fs:
        return None
    fs.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return fs[0]


def find_config_for_chain(stats_path: Path) -> Path | None:
    chain_root = stats_path.parent.parent
    chain_name = stats_path.stem
    for candidate in [
        chain_root / f"{chain_name}.updated.yaml",
        chain_root / f"{chain_name}.input.yaml",
        chain_root / f"{chain_name}.yaml",
        PROJ / "chains" / f"{chain_name}.updated.yaml",
        PROJ / "chains" / f"{chain_name}.input.yaml",
        PROJ / "cobaya_prtoe_polychord.yaml",
        PROJ / "cobaya_prtoe.yaml",
        PROJ / "lcdm_config.yaml",
    ]:
        if candidate.exists():
            return candidate
    return None


def parse_stats(path: Path) -> dict:
    raw = path.read_text()
    data = {"raw": raw, "logZ": None, "logZ_err": None, "ndead": 0,
            "nlive": 0, "nposterior": 0, "nequals": 0, "params": []}
    for m in re.finditer(r"log\(Z\)\s*=\s*([\d\.\-+Ee]+)\s*\+/-\s*([\d\.\-+Ee]+)", raw):
        data["logZ"] = float(m.group(1))
        data["logZ_err"] = float(m.group(2))
    for k in ("ndead", "nlive", "nposterior", "nequals"):
        m = re.search(rf"{k}:\s+(\d+)", raw)
        if m:
            data[k] = int(m.group(1))
    in_params = False
    for line in raw.splitlines():
        if re.match(r"Dim No\.\s+Mean\s+Sigma", line):
            in_params = True
            continue
        if in_params:
            m = re.match(r"\s*(\d+)\s+([\d\.\-+Ee]+)\s+\+/-\s+([\d\.\-+Ee]+)", line)
            if m:
                data["params"].append({
                    "dim": int(m.group(1)),
                    "mean": float(m.group(2)),
                    "sigma": float(m.group(3)),
                })
            elif line.strip().startswith("---"):
                continue
            elif line.strip() == "":
                continue
            else:
                break
    return data


def get_sampled_params(config_path: Path) -> list[dict]:
    try:
        cfg = yaml.safe_load(config_path.read_text())
    except Exception:
        return []
    params = cfg.get("params", {})
    ordered = []
    for name, p in params.items():
        if not isinstance(p, dict):
            continue
        if "prior" in p or "ref" in p:
            ordered.append({
                "name": name,
                "latex": p.get("latex", name),
                "prior": p.get("prior", {}),
                "ref": p.get("ref", ""),
            })
    return ordered


def get_all_params(config_path: Path) -> tuple[list[dict], list[dict]]:
    try:
        cfg = yaml.safe_load(config_path.read_text())
    except Exception:
        return [], []
    params = cfg.get("params", {})
    sampled, derived = [], []
    for name, p in params.items():
        if not isinstance(p, dict):
            derived.append({"name": name, "latex": name, "type": "fixed", "value": str(p)[:60]})
            continue
        entry = {"name": name, "latex": p.get("latex", name)}
        if "prior" in p:
            entry["type"] = "sampled"
            entry["prior"] = p.get("prior", {})
            entry["ref"] = p.get("ref", "")
            sampled.append(entry)
        elif "value" in p:
            entry["type"] = "derived"
            entry["value"] = str(p["value"])[:60]
            derived.append(entry)
        elif "derived" in p:
            entry["type"] = "derived"
            entry["derived"] = str(p["derived"])[:60]
            derived.append(entry)
        else:
            entry["type"] = "output"
            derived.append(entry)
    return sampled, derived


def map_params_to_dims(config_path: Path, n_dims: int) -> list:
    sampled, derived = get_all_params(config_path)
    result = []
    for i in range(n_dims):
        if i < len(sampled):
            p = sampled[i]
            result.append({"dim": i + 1, "name": p["name"], "latex": p["latex"], "type": "sampled"})
        else:
            di = i - len(sampled)
            if di < len(derived):
                p = derived[di]
                result.append({"dim": i + 1, "name": p["name"], "latex": p["latex"], "type": "derived"})
            else:
                result.append({"dim": i + 1, "name": f"derived_{i+1}", "latex": "", "type": "unknown"})
    return result


# ── COMMANDS ─────────────────────────────────────────────────────────────────


def cmd_chains(args: str):
    d = PROJ / "chains"
    if not d.exists():
        console.print("[yellow]No chains/ directory[/yellow]")
        return
    table = Table(title="Chain Directories", box=box.SIMPLE)
    table.add_column("Name", style="cyan")
    table.add_column("Size")
    table.add_column("Modified")
    items = sorted(d.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)
    for item in items:
        if item.is_dir():
            raw_dir = item / f"{item.name}_polychord_raw"
            if raw_dir.exists():
                size = sum(f.stat().st_size for f in raw_dir.rglob("*") if f.is_file())
                table.add_row(f"{item.name}/ (raw)", fmt_size(size), fmt_time(item.stat().st_mtime))
            else:
                size = sum(f.stat().st_size for f in item.rglob("*") if f.is_file())
                table.add_row(f"{item.name}/", fmt_size(size), fmt_time(item.stat().st_mtime))
        elif item.suffix in (".yaml", ".yml", ".locked"):
            table.add_row(item.name, fmt_size(item.stat().st_size), fmt_time(item.stat().st_mtime))
    if table.row_count:
        console.print(table)
    else:
        console.print("[dim]No chain subdirectories found[/dim]")


def cmd_stats(args: str):
    sp = find_stats(args)
    if not sp:
        console.print(f"[yellow]No .stats file found for '{args or 'any'}'. Try /chains first.[/yellow]")
        return
    data = parse_stats(sp)
    rel_path = rel(sp)

    # Header Panel
    header = Panel(
        f"[bold cyan]log(Z) = {data['logZ']:.2f} ± {data['logZ_err']:.2f}[/bold cyan]\n"
        f"ndead={data['ndead']}  nlive={data['nlive']}  "
        f"nposterior={data['nposterior']}  nequals={data['nequals']}",
        title=f"PolyChord — {rel_path}",
        border_style="cyan",
    )
    console.print(header)

    # Try to map params
    cfg = find_config_for_chain(sp)
    mapping = map_params_to_dims(cfg, len(data["params"])) if cfg else []

    if data["params"]:
        table = Table(box=box.SIMPLE)
        table.add_column("Dim", style="dim")
        table.add_column("Parameter", style="cyan")
        table.add_column("Mean", justify="right")
        table.add_column("Sigma", justify="right")
        table.add_column("Type")

        for p in data["params"]:
            di = p["dim"] - 1
            if di < len(mapping):
                name = mapping[di]["latex"] or mapping[di]["name"]
                ptype = mapping[di]["type"]
            else:
                name = f"—"
                ptype = "?"

            mean_s = f"{p['mean']:.6f}"
            sigma_s = f"{p['sigma']:.6f}"
            style = "green" if ptype == "sampled" else "yellow" if ptype == "derived" else "dim"
            table.add_row(str(p["dim"]), name, mean_s, sigma_s, f"[{style}]{ptype}[/{style}]")

        console.print(table)
    else:
        console.print("[dim]No parameter table found in .stats[/dim]")

    # Convergence hint
    nlike_total = data.get("ndead", 0) * data.get("nequals", 1) if data.get("ndead") and data.get("nequals") else 0
    if data["nlive"] and data["ndead"]:
        ratio = data["ndead"] / data["nlive"]
        if ratio < 2:
            console.print(f"[yellow]⚠ Chain may be incomplete: ndead/nlive = {ratio:.1f} (target > 2)[/yellow]")
        elif ratio < 10:
            console.print(f"[green]✓ ndead/nlive = {ratio:.1f} — reasonable[/green]")
        else:
            console.print(f"[green]✓ Well-sampled: ndead/nlive = {ratio:.1f}[/green]")


def cmd_params(args: str):
    sp = find_stats(args)
    if not sp:
        console.print(f"[yellow]No .stats file found for '{args or 'any'}'. Try /chains first.[/yellow]")
        return
    data = parse_stats(sp)
    cfg = find_config_for_chain(sp)
    if not cfg:
        console.print("[yellow]No config found to map parameters[/yellow]")
        return
    sampled, derived = get_all_params(cfg)

    t = Table(title=f"Parameter Map — {rel(cfg)}", box=box.SIMPLE)
    t.add_column("#", style="dim")
    t.add_column("Name", style="cyan")
    t.add_column("Type")
    t.add_column("Details")
    idx = 0
    for p in sampled + derived:
        idx += 1
        ptype = p.get("type", "?")
        if ptype == "sampled":
            prior = p.get("prior", {})
            if "min" in prior:
                detail = f"U({prior['min']:.4g}, {prior['max']:.4g})"
            elif "dist" in prior:
                detail = f"N({prior['loc']}, {prior['scale']})"
            else:
                detail = str(dict(prior))[:40]
            style = "green"
        elif ptype == "derived":
            val = p.get("value") or p.get("derived", "")
            detail = str(val).replace("lambda ", "λ ")[:60]
            style = "yellow"
        else:
            style = "dim"
            detail = ""
        t.add_row(str(idx), p.get("latex", p["name"]), f"[{style}]{ptype}[/{style}]", detail)

    console.print(t)
    n_total = len(data["params"])
    n_known = len(sampled) + len(derived)
    console.print(
        f"[dim][green]{len(sampled)} sampled[/green] + [yellow]{len(derived)} derived[/yellow] "
        f"= {n_known} config params  |  "
        f"{n_total} dims in .stats (extra {n_total - n_known} are internal CLASS outputs)[/dim]"
    )


def cmd_configs(args: str):
    configs = sorted(PROJ.rglob("*.yaml"))
    configs += sorted(PROJ.rglob("*.yml"))
    # Deduplicate
    seen = set()
    unique = []
    for c in configs:
        r = rel(c)
        if r not in seen:
            seen.add(r)
            unique.append(c)

    t = Table(title="YAML Configs", box=box.SIMPLE)
    t.add_column("Config", style="cyan")
    t.add_column("Size")
    t.add_column("Modified")
    for c in unique:
        if any(x in c.name.lower() for x in ("cobaya", "config", "lcdm", "prtoe", "input", "template")):
            t.add_row(rel(c), fmt_size(c.stat().st_size), fmt_time(c.stat().st_mtime))
    console.print(t)


def cmd_config(args: str):
    candidates = []
    if args:
        p = PROJ / args
        if p.exists():
            candidates.append(p)
        candidates.extend(PROJ.rglob(f"*{args}*.yaml"))
        candidates.extend(PROJ.rglob(f"*{args}*.yml"))
    else:
        candidates = [PROJ / "cobaya_prtoe_polychord.yaml"]
        candidates = [c for c in candidates if c.exists()]

    if not candidates:
        console.print("[yellow]No matching config found. Try /configs to list.[/yellow]")
        return

    path = candidates[0]
    try:
        cfg = yaml.safe_load(path.read_text())
    except Exception as e:
        console.print(f"[red]YAML parse error: {e}[/red]")
        return

    console.print(Panel(f"[bold]{rel(path)}[/bold]", border_style="cyan"))
    for section in ("likelihood", "theory", "params", "sampler"):
        if section not in cfg:
            continue
        console.print(f"\n[bold cyan]▸ {section}[/bold cyan]")
        content = cfg[section]
        if isinstance(content, dict):
            for k, v in content.items():
                if isinstance(v, dict):
                    if section == "params":
                        ptype = "sampled" if "prior" in v else "derived" if "value" in v or "derived" in v else "output"
                        label = {"sampled": "green", "derived": "yellow", "output": "dim"}.get(ptype, "dim")
                        latex = v.get("latex", k)
                        prior_info = ""
                        if "prior" in v:
                            pr = v["prior"]
                            if "min" in pr:
                                prior_info = f"  [{min(pr['min'],pr['max']):.4g} – {max(pr['min'],pr['max']):.4g}]"
                            elif "loc" in pr:
                                prior_info = f"  N({pr['loc']}, {pr['scale']})"
                        console.print(f"  [{label}]• {latex}[/{label}]{prior_info}")
                    else:
                        console.print(f"  [cyan]{k}:[/cyan]")
                        for sk, sv in v.items():
                            sv_s = str(sv)[:80]
                            console.print(f"    {sk}: {sv_s}")
                elif isinstance(v, list):
                    for item in v[:5]:
                        console.print(f"  - {item}")
                    if len(v) > 5:
                        console.print(f"  [dim]... {len(v)-5} more[/dim]")
                else:
                    console.print(f"  {k}: {v}")
        elif isinstance(content, list):
            for item in content[:10]:
                console.print(f"  - {item}")
        else:
            console.print(f"  {content}")


def cmd_search(args: str):
    if not args:
        console.print("[yellow]Usage: /search <pattern>[/yellow]")
        return
    exts = ("*.py", "*.yaml", "*.yml", "*.ini", "*.sh", "*.pre",
            "*.cpp", "*.h", "*.c", "*.md")
    results = []
    for ext in exts:
        for f in PROJ.rglob(ext):
            if any(d in str(f) for d in ("__pycache__", ".git", "build", "dist")):
                continue
            try:
                text = f.read_text(errors="ignore")
            except Exception:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if re.search(args, line, re.IGNORECASE):
                    results.append((f, i, line.strip()))
    if not results:
        console.print(f"[yellow]No matches for '{args}'[/yellow]")
        return
    results.sort(key=lambda x: (rel(x[0]), x[1]))
    if len(results) > 40:
        console.print(f"[cyan]{len(results)} matches. Showing first 40:[/cyan]")
        results = results[:40]
    for f, i, line in results:
        console.print(f"[dim]{rel(f)}:{i}[/dim]  {line[:120]}")


def cmd_read(args: str):
    if not args:
        console.print("[yellow]Usage: /read <path>[/yellow]")
        return
    p = PROJ / args
    if not p.exists():
        console.print(f"[yellow]Not found: {args}[/yellow]")
        return
    if p.is_dir():
        for item in sorted(p.iterdir()):
            console.print(item.name + ("/" if item.is_dir() else ""))
        return
    try:
        text = p.read_text()
    except Exception as e:
        console.print(f"[red]{e}[/red]")
        return
    ext = p.suffix
    lex = "yaml" if ext in (".yaml", ".yml") else \
          "python" if ext == ".py" else \
          "bash" if ext in (".sh", ".bat") else \
          "c" if ext in (".c", ".h") else \
          "ini" if ext == ".ini" else \
          "cpp" if ext == ".cpp" else "text"
    syntax = Syntax(text, lex, theme="monokai", line_numbers=True, word_wrap=True)
    console.print(Panel(syntax, title=f"📄 {rel(p)}", border_style="green"))


def cmd_tree(args: str):
    t = Tree(f"[bold cyan]{PROJ.name}[/bold cyan]")
    exclude = {"__pycache__", ".git", ".pytest_cache", "build", "dist",
               "__pycache__", "classy.egg-info", ".aider.tags.cache.v4",
               "doc", "external", "include", "source", "tools", "python",
               "test", "output"}
    max_depth = 4

    def add_items(node: Tree, path: Path, depth: int = 0):
        if depth > max_depth:
            return
        items = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
        for item in items:
            if item.name.startswith(".") or item.name in exclude:
                continue
            if item.is_dir():
                branch = node.add(f"[cyan]{item.name}/[/cyan]")
                add_items(branch, item, depth + 1)
            else:
                node.add(f"[dim]{item.name}[/dim]")

    add_items(t, PROJ)
    console.print(t)


def cmd_ls(args: str):
    target = PROJ / args if args else PROJ
    if not target.exists():
        console.print(f"[yellow]Not found: {args}[/yellow]")
        return
    items = sorted(target.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    rows = []
    for item in items:
        if item.name.startswith("."):
            continue
        if item.is_dir():
            rows.append(f"[cyan]{item.name}/[/cyan]")
        else:
            rows.append(item.name)
    console.print(Columns(rows, width=30))


def cmd_plot(args: str):
    if args in ("posterior", "posteriors", ""):
        script = PROJ / "plot_posteriors.py"
        if not script.exists():
            script = PROJ / "cosmic_dashboard" / "utils" / "plot_posteriors.py"
    elif args in ("chain", "chains"):
        script = PROJ / "plot_chains.py"
        if not script.exists():
            script = PROJ / "cosmic_dashboard" / "utils" / "plot_chains.py"
    else:
        script = PROJ / args
        if not script.exists():
            script = PROJ / f"plot_{args}.py"
    if not script.exists():
        console.print(f"[yellow]Script not found: {rel(script)}[/yellow]")
        return
    console.print(f"[dim]Running {rel(script)}...[/dim]")
    try:
        r = subprocess.run(
            [sys.executable, str(script)],
            capture_output=True, text=True, timeout=120, cwd=PROJ
        )
        if r.stdout:
            console.print(r.stdout[-2000:])
        if r.stderr:
            console.print(f"[red]{r.stderr[-1000:]}[/red]")
        console.print(f"[green]✓ Done[/green]" if r.returncode == 0 else f"[red]✗ Exit code {r.returncode}[/red]")
    except subprocess.TimeoutExpired:
        console.print("[red]Timed out after 120s[/red]")
    except Exception as e:
        console.print(f"[red]{e}[/red]")


def cmd_diff(args: str):
    parts = args.split()
    if len(parts) < 2:
        console.print("[yellow]Usage: /diff <file_a> <file_b>[/yellow]")
        return
    a, b = parts[:2]
    pa, pb = PROJ / a, PROJ / b
    if not pa.exists():
        pa = next(PROJ.rglob(f"*{a}*.yaml"), None) or pa
    if not pb.exists():
        pb = next(PROJ.rglob(f"*{b}*.yaml"), None) or pb
    if not pa.exists() or not pb.exists():
        console.print("[yellow]One or both files not found[/yellow]")
        return
    r = subprocess.run(
        ["diff", "-u", "--label", rel(pa), "--label", rel(pb), str(pa), str(pb)],
        capture_output=True, text=True
    )
    if r.returncode == 0:
        console.print("[dim]Files are identical[/dim]")
    else:
        out = r.stdout
        if len(out) > 2000:
            out = out[:1000] + f"\n... ({len(out)-2000} chars) ...\n" + out[-1000:]
        syntax = Syntax(out, "diff", theme="monokai")
        console.print(Panel(syntax, title=f"diff {rel(pa)} ↔ {rel(pb)}", border_style="yellow"))


# ── SYSTEM COMMANDS ──────────────────────────────────────────────────────────


def cmd_flow(args: str):
    console.print(Panel.fit(
        "[bold cyan]CLASS ←→ Cobaya ←→ PolyChord ←→ CosmicDashboard[/bold cyan]\n\n"
        "[green]1. USER CLICK → START RUN[/green]\n"
        "  POST /api/start_run → backend validates YAML, injects halofit/class_path,\n"
        "  normalizes PRTOE names → [bold]mpirun -np N python -m cobaya run <config>[/bold]\n\n"
        "[green]2. COBAYA BOOTS[/green]\n"
        "  Reads YAML → loads [bold]classy[/bold] from theory.classy.path → loads PolyChord sampler\n\n"
        "[green]3. POLYCHORD NESTED SAMPLING LOOP[/green]\n"
        "  For each iteration:\n"
        "    a) Pick lowest-likelihood live point → becomes [yellow]dead[/yellow]\n"
        "    b) Slice sampling with num_repeats steps → new candidate point\n"
        "    c) [bold]Cobaya likelihood eval[/bold]:\n"
        "       parameter vector → dict → [cyan]Class().set(**params).compute()[/cyan]\n"
        "       → CLASS runs: input→background→thermo→perturb→primordial→\n"
        "         fourier→transfer→harmonic→lensing→distortions\n"
        "       → raw_cl/lensed_cl → likelihoods (Planck+BAO+SN) → total logL\n"
        "    d) Write dead point to [yellow]_polychord_raw/<prefix>.txt[/yellow]\n"
        "    e) Update [yellow]_polychord_raw/<prefix>.resume[/yellow] (ndead, logZ)\n\n"
        "[green]4. DASHBOARD MONITORS (polls every 1-2s)[/green]\n"
        "  GET /api/status → reads .resume for ndead/logZ, .txt for best-fit params,\n"
        "  .stats for final evidence → returns JSON to frontend\n\n"
        "[green]5. ON COMPLETION[/green]\n"
        "  Cobaya writes final <prefix>.txt, .stats, .paramnames\n"
        "  Dashboard detects process exit → stores run in SQLite → WebSocket broadcast\n\n"
        "[green]FILE FORMATS:[/green]\n"
        "  [yellow]<prefix>.txt[/yellow]   final chain: [yellow]# weight -2log(post) log(prior) param1 ...[/yellow]\n"
        "  [yellow]<prefix>.stats[/yellow]  log(Z)=val±err, ndead=N, nlive=N, param means/sigmas\n"
        "  [yellow]_raw/<prefix>.txt[/yellow]  raw dead: [yellow]weight -2logL param1 ... logprior loglike1 ...[/yellow]\n"
        "  [yellow]_raw/<prefix>.resume[/yellow]  ndead, log(Z), log(Z²) (in-progress)\n"
        "  [yellow]_raw/<prefix>_phys_live.txt[/yellow]  live: [yellow]param1 ... logL[/yellow]\n\n"
        "[dim]Full chain of custody: click → backend → mpirun → cobaya → classy → CLASS → clik → logL → PolyChord → files → dashboard → you[/dim]",
        border_style="cyan",
    ))


def cmd_endpoints(args: str):
    t = Table(title="Key Dashboard API Endpoints", box=box.SIMPLE)
    t.add_column("Endpoint", style="cyan", no_wrap=True)
    t.add_column("Method")
    t.add_column("Purpose")
    endpoints = [
        ("/api/start_run", "POST", "Launch Cobaya+PolyChord run via mpirun"),
        ("/api/stop_run", "POST", "Kill process group"),
        ("/api/status", "GET", "Live chain status (dead, logZ, chi2, params)"),
        ("/ws/status", "WS", "Real-time WebSocket status stream"),
        ("/api/health", "GET", "CPU/RAM/disk/CLASS version"),
        ("/api/chain_quality", "GET", "ESS, autocorrelation, R-hat diagnostics"),
        ("/api/best_fit_*", "GET", "Best-fit parameters from chains"),
        ("/api/corner_plot", "GET", "Generate corner plot"),
        ("/api/compare_models", "GET", "Model comparison dashboard"),
        ("/api/bayes_factors_bma", "GET", "Bayes factors + BMA"),
        ("/api/templates/list", "GET", "List config templates"),
        ("/api/config/current", "GET", "Current active config"),
        ("/api/validate_config", "POST", "Pre-run YAML validation"),
        ("/api/recover_sampler", "POST", "Adopt orphaned run"),
        ("/api/download_reproducibility_pack", "GET", "Full reproducibility bundle"),
    ]
    for ep, method, purpose in endpoints:
        t.add_row(ep, f"[green]{method}[/green]", purpose)
    console.print(t)
    console.print(f"[dim]Backend: {PROJ}/cosmic_dashboard/backend/cosmo_dashboard_backend.py (8807 lines)[/dim]")
    console.print(f"[dim]Frontend: {PROJ}/cosmic_dashboard/frontend/index.html (1275 lines)[/dim]")


def cmd_logs(args: str):
    log_files = [
        PROJ / "chains" / "dashboard_backend.log",
        PROJ / "chains" / "dashboard_backend.log",
        PROJ / "run.log",
    ]
    for lf in log_files:
        if lf.exists():
            lines = lf.read_text().splitlines()
            tail = lines[-30:] if len(lines) > 30 else lines
            console.print(Panel(
                "\n".join(tail),
                title=f"{rel(lf)} (last {len(tail)} of {len(lines)} lines)",
                border_style="yellow",
            ))
            return
    # Search for log files
    for p in sorted(PROJ.rglob("*.log")):
        if p.stat().st_size > 0:
            lines = p.read_text().splitlines()
            tail = lines[-20:]
            console.print(Panel(
                "\n".join(tail[-20:]),
                title=f"{rel(p)} (last {min(len(tail), len(lines))} of {len(lines)} lines, {fmt_size(p.stat().st_size)})",
                border_style="yellow",
            ))
            return
    console.print("[yellow]No log files found[/yellow]")


# ── CHAIN ANALYSIS COMMANDS ──────────────────────────────────────────────────


def cmd_bestfit(args: str):
    sp = find_stats(args)
    if not sp:
        console.print("[yellow]No chain found[/yellow]")
        return
    data = parse_stats(sp)
    cfg = find_config_for_chain(sp)
    sampled, derived = get_all_params(cfg) if cfg else ([], [])
    mapping = map_params_to_dims(cfg, len(data["params"])) if cfg else []

    # Find the raw .txt and best-fit row (min -2logL)
    raw_dir = sp.parent
    chain_name = sp.stem
    candidates = list(raw_dir.glob(f"{chain_name}.txt")) or list(raw_dir.glob(f"{chain_name}_equal_weights.txt"))
    if not candidates:
        candidates = list(PROJ.glob(f"chains/**/{chain_name}_equal_weights.txt"))
    if not candidates:
        console.print("[yellow]No chain .txt file found[/yellow]")
        return

    txt = candidates[0].read_text().strip().splitlines()
    best_row = None
    best_val = float("inf")
    for line in txt:
        parts = line.strip().split()
        if len(parts) < 3:
            continue
        try:
            neg2ll = float(parts[1])
            if neg2ll < best_val:
                best_val = neg2ll
                best_row = parts
        except ValueError:
            continue

    if not best_row:
        console.print("[yellow]Could not parse chain file[/yellow]")
        return

    best_vals = [float(x) for x in best_row]

    console.print(Panel(
        f"[bold cyan]Best-fit -2log(L) = {best_val:.2f}[/bold cyan]",
        border_style="green",
    ))

    t = Table(box=box.SIMPLE)
    t.add_column("Param", style="cyan")
    t.add_column("Best-fit", justify="right")
    t.add_column("Type")
    t.add_column("Map")

    # Map params: col 0=weight, col 1=-2logL, cols 2+ = params
    n_params_shown = 0
    for i in range(2, len(best_vals)):
        di = i - 2
        val = best_vals[i]
        name = ""
        ptype = ""
        if di < len(mapping):
            name = mapping[di]["latex"] or mapping[di]["name"]
            ptype = mapping[di]["type"]
        else:
            name = f"col_{i}"
            ptype = "?"

        if "logprior" in name.lower() or "loglike" in name.lower() or "chi2" in name.lower() or ptype == "?":
            style = "dim"
        elif ptype == "sampled":
            style = "green"
        elif ptype == "derived":
            style = "yellow"
        else:
            style = "dim"

        if n_params_shown < 30:
            t.add_row(name, f"{val:.6g}", f"[{style}]{ptype}[/{style}]", f"dim {di+1}")
            n_params_shown += 1

    if n_params_shown:
        console.print(t)

    # Also try to show chi2 breakdown from log file
    log_file = sp.parent.parent / f"{chain_name}.log"
    if log_file.exists():
        log_text = log_file.read_text()
        for m in re.finditer(r"Computed derived parameters:\s*({.*?})", log_text, re.DOTALL):
            try:
                derived_dict = json.loads(m.group(1))
            except (json.JSONDecodeError, ValueError):
                try:
                    derived_dict = ast.literal_eval(m.group(1))
                except (ValueError, SyntaxError):
                    continue
            
            # Render table for both JSON and literal_eval successful parses
            t2 = Table(title="Derived parameters (from log)", box=box.SIMPLE)
            t2.add_column("Parameter", style="cyan")
            t2.add_column("Value", justify="right")
            for k, v in derived_dict.items():
                if isinstance(v, (int, float)):
                    t2.add_row(k, f"{v:.4g}")
            if t2.row_count:
                console.print(t2)
            break

    # Convergence note
    console.print(f"[dim]Source: {rel(candidates[0])} ({len(txt)} points)[/dim]")
    if data["ndead"]:
        pct = 100 * len(txt) / max(data["ndead"], 1)
        console.print(f"[dim]{len(txt)} dead points ({(pct):.0f}% of {data['ndead']} total)[/dim]")


def cmd_prior(args: str):
    sp = find_stats(args)
    if not sp:
        console.print("[yellow]No chain found[/yellow]")
        return
    cfg = find_config_for_chain(sp)
    if not cfg:
        console.print("[yellow]No config found for this chain[/yellow]")
        return
    data = parse_stats(sp)
    sampled, derived = get_all_params(cfg)

    t = Table(title=f"Prior vs Posterior — {rel(cfg)}", box=box.SIMPLE)
    t.add_column("Parameter", style="cyan")
    t.add_column("Prior", style="green")
    t.add_column("Posterior", justify="right")

    # Map stats dims to params
    n_sampled = len(sampled)
    for i, p in enumerate(sampled):
        name = p.get("latex", p["name"])
        prior = p.get("prior", {})
        if "min" in prior:
            prior_s = f"U({prior['min']:.4g}, {prior['max']:.4g})"
        elif "dist" in prior:
            prior_s = f"N({prior['loc']}, {prior['scale']})"
        else:
            prior_s = str(dict(prior))[:30]

        if i < len(data["params"]):
            dp = data["params"][i]
            post_s = f"{dp['mean']:.4g} ± {dp['sigma']:.4g}"
        else:
            post_s = "[dim]N/A[/dim]"

        t.add_row(name, prior_s, post_s)

    console.print(t)
    console.print(f"[dim]Showing {n_sampled} sampled parameters. "
                  f"Use /params {args} for full list including derived.[/dim]")


def cmd_compare(args: str):
    parts = args.split()
    if len(parts) < 2:
        console.print("[yellow]Usage: /compare <chain_a> <chain_b>[/yellow]")
        return
    a_name, b_name = parts[:2]

    sa = find_stats(a_name)
    sb = find_stats(b_name)
    if not sa or not sb:
        console.print("[yellow]One or both chains not found[/yellow]")
        return

    da = parse_stats(sa)
    db = parse_stats(sb)
    ca = find_config_for_chain(sa)
    cb = find_config_for_chain(sb)

    t = Table(title=f"Chain Comparison", box=box.SIMPLE)
    t.add_column("Metric", style="cyan")
    t.add_column(rel(sa.parent.parent) if sa else a_name, justify="right")
    t.add_column(rel(sb.parent.parent) if sb else b_name, justify="right")

    t.add_row("log(Z)", f"{da['logZ']:.2f} ± {da['logZ_err']:.2f}" if da['logZ'] else "N/A",
              f"{db['logZ']:.2f} ± {db['logZ_err']:.2f}" if db['logZ'] else "N/A")
    t.add_row("ndead", str(da["ndead"]), str(db["ndead"]))
    t.add_row("nlive", str(da["nlive"]), str(db["nlive"]))
    t.add_row("nposterior", str(da["nposterior"]), str(db["nposterior"]))
    t.add_row("dimensions", str(len(da["params"])), str(len(db["params"])))
    t.add_row("ndead/nlive", f"{da['ndead']/max(da['nlive'],1):.1f}" if da['nlive'] else "N/A",
              f"{db['ndead']/max(db['nlive'],1):.1f}" if db['nlive'] else "N/A")

    console.print(t)

    # Compare key params if both have same config
    if ca and cb and ca == cb:
        mapping = map_params_to_dims(ca, max(len(da["params"]), len(db["params"])))
        t2 = Table(title="Parameter Comparison (first 12 dims)", box=box.SIMPLE)
        t2.add_column("Param", style="cyan")
        t2.add_column(f"A: mean", justify="right")
        t2.add_column(f"A: sigma", justify="right")
        t2.add_column(f"B: mean", justify="right")
        t2.add_column(f"B: sigma", justify="right")
        for i in range(min(12, len(da["params"]), len(db["params"]))):
            m = mapping[i]
            pa = da["params"][i]
            pb = db["params"][i]
            name = m["latex"] or m["name"]
            t2.add_row(name, f"{pa['mean']:.4g}", f"{pa['sigma']:.4g}",
                       f"{pb['mean']:.4g}", f"{pb['sigma']:.4g}")
        console.print(t2)

    # LogZ difference
    if da['logZ'] and db['logZ']:
        delta = da['logZ'] - db['logZ']
        err = (da['logZ_err']**2 + db['logZ_err']**2)**0.5
        console.print(f"\n[bold]Δlog(Z) = {delta:.2f} ± {err:.2f}[/bold] "
                      f"({'Model A favored' if delta > 2 else 'Model B favored' if delta < -2 else 'Inconclusive'})")


def cmd_watch(args: str):
    sp = find_stats(args)
    if not sp:
        console.print("[yellow]No chain found. Watching latest...[/yellow]")
        sp = find_stats()
        if not sp:
            console.print("[yellow]No chains at all[/yellow]")
            return

    raw_dir = sp.parent
    resume_file = raw_dir / f"{sp.stem}.resume"
    stats_file = sp

    console.print(f"[dim]Watching {rel(raw_dir)}/[/dim]")
    console.print("[dim]Press Ctrl+C to stop[/dim]\n")

    try:
        while True:
            n_raw = sum(1 for _ in open(resume_file)) if resume_file.exists() else 0
            ndead = 0
            logz = None
            logz_err = None

            if resume_file.exists():
                text = resume_file.read_text()
                m = re.search(r"=== Number of dead points/iterations ===\s*(\d+)", text)
                if m:
                    ndead = int(m.group(1))
                m = re.search(r"=== global evidence -- log\(<Z>\) ===\s*([\d\.\-+Ee]+)", text)
                if m:
                    logz = float(m.group(1))
                m = re.search(r"=== global evidence\^2 -- log\(<Z\^2>\) ===\s*([\d\.\-+Ee]+)", text)
                if m:
                    logz2 = float(m.group(1))
                    logz_err = (logz2 - logz**2)**0.5 if logz else None

            # Also check .stats for completed run
            if stats_file.exists():
                sdata = parse_stats(stats_file)
                if sdata["ndead"]:
                    ndead = sdata["ndead"]
                if sdata["logZ"]:
                    logz = sdata["logZ"]
                    logz_err = sdata["logZ_err"]

            ndead_str = f"[green]{ndead}[/green]" if ndead else "[yellow]?[/yellow]"
            if logz is None:
                logz_str = "[yellow]?[/yellow]"
            elif logz_err is None:
                logz_str = f"[green]{logz:.2f} ± ?[/green]"
            else:
                logz_str = f"[green]{logz:.2f} ± {logz_err:.2f}[/green]"

            console.print(f"  ndead={ndead_str}  log(Z)={logz_str}  "
                          f"[dim]({datetime.now().strftime('%H:%M:%S')})[/dim]",
                          end="\r")

            import time
            time.sleep(5)
    except KeyboardInterrupt:
        console.print("\n[yellow]Stopped watching[/yellow]")


# ── COMMAND DISPATCH ─────────────────────────────────────────────────────────

COMMANDS = {
    "chains": cmd_chains,
    "stats": cmd_stats,
    "params": cmd_params,
    "configs": cmd_configs,
    "config": cmd_config,
    "search": cmd_search,
    "read": cmd_read,
    "tree": cmd_tree,
    "ls": cmd_ls,
    "plot": cmd_plot,
    "diff": cmd_diff,
    "bestfit": cmd_bestfit,
    "prior": cmd_prior,
    "compare": cmd_compare,
    "watch": cmd_watch,
    "flow": cmd_flow,
    "endpoints": cmd_endpoints,
    "logs": cmd_logs,
}


def show_help():
    t = Table(title="CosmicExplorer Commands", box=box.SIMPLE, border_style="cyan")
    t.add_column("Command", style="cyan", no_wrap=True)
    t.add_column("Description")
    cmds = [
        ("/chains", "List chain directories with sizes"),
        ("/stats [name]", "Parse .stats: log(Z), ndead, nlive, param means"),
        ("/params [name]", "Map .stats dims → parameter names from config"),
        ("/configs", "List all YAML configs"),
        ("/config [name]", "Parse and display a config YAML"),
        ("/search <pat>", "Grep the codebase (regex)"),
        ("/read <path>", "View file with syntax highlighting"),
        ("/tree", "Project directory tree"),
        ("/ls [dir]", "List directory contents"),
        ("/plot [type]", "Run chain/posterior plot script"),
        ("/bestfit [name]", "Extract best-fit parameters from chain (.txt)"),
        ("/prior [name]", "Show prior ranges vs posterior means"),
        ("/compare <a> <b>", "Side-by-side comparison of two chains"),
        ("/watch [name]", "Poll chain progress live (Ctrl+C to stop)"),
        ("/diff <a> <b>", "Diff two config files"),
        ("/flow", "Architecture: CLASS ↔ Cobaya ↔ PolyChord ↔ Dashboard"),
        ("/endpoints", "List key Dashboard API endpoints"),
        ("/logs", "Show recent run/dashboard log tail"),
        ("/help", "This help"),
        ("/clear", "Clear chat history"),
        ("/model [name]", "Show or set Ollama model"),
        ("", ""),
        ("<question>", "Ask the AI anything (CLASS/Cobaya/PolyChord)"),
    ]
    for cmd, desc in cmds:
        t.add_row(cmd, desc)
    console.print(t)
    console.print(f"[dim]Project: {PROJ}  |  Model: qwen2.5-coder:7b (Ollama, local)[/dim]")


# ── MAIN LOOP ────────────────────────────────────────────────────────────────


def main():
    console.print(Panel.fit(
        "[bold cyan]CosmicExplorer[/bold cyan]\n"
        "[dim]Fast CLI  ·  CLASS / Cobaya / PolyChord  ·  [/dim]"
        "[dim]Local (Ollama)[/dim]",
        border_style="cyan",
    ))
    console.print(f"[dim]Project: {PROJ}[/dim]")
    console.print(f"[dim]Type /help for commands, or just ask a question.[/dim]\n")

    model = "qwen2.5-coder:7b"
    history: list[dict] = []
    system_msg = {"role": "system", "content": SYSTEM}

    while True:
        try:
            inp = Prompt.ask("[bold cyan]⎈[/bold cyan]")
        except (EOFError, KeyboardInterrupt):
            console.print("\n[yellow]Later![/yellow]")
            break

        cmd = inp.strip()
        if not cmd:
            continue

        if cmd.lower() in ("/exit", "/quit", "exit"):
            console.print("[yellow]Clear skies![/yellow]")
            break

        if cmd == "/help":
            show_help()
            continue

        if cmd == "/clear":
            history.clear()
            console.print("[green]History cleared[/green]")
            continue

        if cmd.startswith("/model"):
            parts = cmd.split(maxsplit=1)
            if len(parts) == 2:
                model = parts[1]
                console.print(f"[green]Model → {model}[/green]")
            else:
                console.print(f"[dim]Current model: {model}[/dim]")
            continue

        # Built-in commands
        if cmd.startswith("/"):
            parts = cmd[1:].split(maxsplit=1)
            verb = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            fn = COMMANDS.get(verb)
            if fn:
                fn(rest)
            else:
                console.print(f"[yellow]Unknown command: /{verb}. Try /help[/yellow]")
            continue

        # ── AI mode ─────────────────────────────────────────────────
        history.append({"role": "user", "content": cmd})
        msgs = [system_msg] + history[-12:]  # last ~6 turns

        try:
            stream = ollama.chat(model=model, messages=msgs, stream=True)
        except Exception as e:
            console.print(f"[red]Ollama error: {e}[/red]")
            continue

        console.print()
        collected = ""
        for chunk in stream:
            content = chunk.get("message", {}).get("content", "") or ""
            collected += content
            console.print(content, end="", markup=False)
            sys.stdout.flush()
        console.print("\n")

        if collected.strip():
            history.append({"role": "assistant", "content": collected})


if __name__ == "__main__":
    try:
        ollama.list()
    except Exception:
        console.print("[red]Ollama not running! Start: ollama serve[/red]")
        sys.exit(1)
    main()
