CLASS: Cosmic Linear Anisotropy Solving System  {#mainpage}
==============================================

Authors: Julien Lesgourgues, Thomas Tram, Nils Schoeneberg

with several major inputs from other people, especially Benjamin
Audren, Simon Prunet, Jesus Torrado, Miguel Zumalacarregui, Francesco
Montanari, Deanna Hooper, Samuel Brieden, Daniel Meinert, Matteo Lucca, etc.

For download and information, see http://class-code.net


PRTOE Model & CosmicDashboard Web Application
==============================================

**Author:** Justin Ryan Pulford

> [!IMPORTANT]
> **Invitation to Researchers:** If you are downloading this code, we politely ask you to run the PRTOE model configurations and help us test its viability as an alternative cosmological model. By comparing its Bayesian evidence ($\Delta\ln\mathcal{Z}$), $\chi^2$ fits, and parameter pulls (such as the $H_0$ and $S_8$ tensions) against standard $\Lambda\text{CDM}$, you can help the cosmology community determine if PRTOE is a framework worth exploring further. Thank you for your contribution!

This repository contains the **PRTOE** (Pulford-Romsa Theory of Everything) model modifications implemented directly in the CLASS C solver. It also packages **CosmicDashboard**, a web-based, glassmorphic dark-theme application that automates compiling, running nested samplers (using Cobaya + PolyChord), and performing Bayesian evidence comparison ($\Delta\ln\mathcal{Z}$) against standard $\Lambda\text{CDM}$.

---

## CosmicDashboard: Working & Usable Control Suite

### Quick Start (One-Click Launch)

The absolute easiest way to run CosmicDashboard is using Docker. We have included automated launch scripts that will safely compile the C-engine, set up the Python environment, and launch the visual dashboard for you.

**Requirements:** You must have Docker Desktop installed and running on your machine.

1. Download or clone this repository.
2. **Windows Users:** Double-click `launch_windows.bat`.
3. **Mac/Linux Users:** Run `bash launch_mac_linux.sh` in your terminal.

*Note: The first time you run this, it will take a few minutes to download the compilers and build the CLASS engine. All your expensive nested sampling data will be safely saved to your local `/chains` folder, meaning you never lose your data even when you close the dashboard!*

### Manual Docker Commands (Alternative)
If you prefer to run it manually without the launch scripts:
```bash
docker build -t cosmic-dashboard .
docker run --rm -p 8000:8000 -v $(pwd)/chains:/app/chains cosmic-dashboard
```
Then manually open `dashboard/index.html` in any browser.

### 📱 Monitoring Runs Remotely on Your Phone (On-The-Go)
Since CosmicDashboard is built with responsive web layouts, you can securely monitor and interact with your active runs (start, stop, or tweak priors via the Watchdog alerts) directly from your phone's browser:

1. **Start the Dashboard:** Run the app locally on port 8000 using the launch scripts or docker commands.
2. **Create a Secure Tunnel:** Open a new terminal on your host machine and run:
   ```bash
   npx localtunnel --port 8000
   ```
3. **Open the Link:** It will output a private public URL (e.g., `https://cosmic-run-x.loca.lt`). Open this link in your phone's browser (Safari, Chrome, etc.) to view and control your run from anywhere in the world!

### Advanced Academic & Diagnostic Features:

* **Interactive Modified Gravity Playground & Background Solver Emulator:**
  * Adjust cosmological parameters ($H_0$, $\omega_{cdm}$, $\omega_b$) and modified gravity modifiers ($\xi_{\text{prtoe}}$, $\delta_{\text{prtoe}}$, $\zeta_{\text{prtoe}}$, $\beta_{\text{prtoe}}$) via live sliders.
  * Emulate and instantly plot background Hubble expansion ratios $H(z)/H_{\Lambda\text{CDM}}(z)$, dark energy equation of state $w(z)$, and modified gravity coupling strength $\mu(z)$ with real-time DHOST stability boundary checks.
* **Live Sampler Health & MCMC Convergence Diagnostics:**
  * Ditch terminal log scrolling: monitor dead point counts, evaluation speeds, and live efficiency updates in a graphical GUI.
  * Real-time trace plots, autocorrelation time charts, and Gelman-Rubin ($R-1$) PSRF (Potential Scale Reduction Factor) metrics to verify parameter mixing *during* execution.
* **One-Click Run-vs-Run Comparator:**
  * Load and compare two run outputs side-by-side (e.g., standard $\Lambda\text{CDM}$ vs. your modified gravity model).
  * Automatically calculates evidence difference ($\Delta\log Z$), best-fit $\chi^2$ differences, and statistical parameter shifts in significance levels ($N_\sigma = |\Delta\mu| / \sqrt{\sigma_A^2 + \sigma_B^2}$).
* **Individual Per-Data-Point Residuals Explorer:**
  * Breaks down residuals, uncertainties, and individual $\chi^2$ contributions per individual bin/data-point: per multipole for Planck CMB, per bin for BAO (6dFGS, MGS, BOSS, eBOSS), and per supernova for Pantheon+.
* **Unified Scientific Provenance & Accountability Ledger:**
  * Generates a scientific metadata footprint of compilation flags, machine CPU/RAM specifications, Conda environment specifications, CLASS/Cobaya engine versions, active configuration checksums (SHA-256), and Git repository commit hashes for absolute paper reproducibility.
* **Jupyter Notebook Boilerplate Generator:**
  * Instantly export an interactive Python Jupyter notebook (`.ipynb`) pre-configured with the exact C-engine settings and cosmology parameters of your active run.
* **Diagnostic Run Autopsy Timeline:**
  * Scans active run logs for compilation errors, Cholesky decomposition issues, unphysical proposal widths, or stability wedge violations and maps them on a chronological event timeline.
* **Auto-Rebuilder & Parallel Solver Control:**
  * Easily toggle active CPU cores and run nested PolyChord samplers via multi-threaded MPI natively in the background, with automatic CLASS C-engine rebuilding.

---

Compiling CLASS and getting started
-----------------------------------

(the information below can also be found on the webpage, just below
the download button)

Download the code from the webpage and unpack the archive (tar -zxvf
class_vx.y.z.tar.gz), or clone it from
https://github.com/lesgourg/class_public. Go to the class directory
(cd class/ or class_public/ or class_vx.y.z/) and compile (make clean;
make class). You can usually speed up compilation with the option -j:
make -j class. If the first compilation attempt fails, you may need to
open the Makefile and adapt the name of the compiler (default: gcc),
of the optimization flag (default: -O4 -ffast-math) and of the OpenMP
flag (default: -fopenmp; this flag is facultative, you are free to
compile without OpenMP if you don't want parallel execution; note that
you need the version 4.2 or higher of gcc to be able to compile with
-fopenmp). Many more details on the CLASS compilation are given on the
wiki page

https://github.com/lesgourg/class_public/wiki/Installation

(in particular, for compiling on Mac >= 10.9 despite of the clang
incompatibility with OpenMP).

To check that the code runs, type:

    ./class explanatory.ini

The explanatory.ini file is THE reference input file, containing and
explaining the use of all possible input parameters. We recommend to
read it, to keep it unchanged (for future reference), and to create
for your own purposes some shorter input files, containing only the
input lines which are useful for you. Input files must have a *.ini
extension. We provide an example of an input file containing a
selection of the most used parameters, default.ini, that you may use as a
starting point.

If you want to play with the precision/speed of the code, you can use
one of the provided precision files (e.g. cl_permille.pre) or modify
one of them, and run with two input files, for instance:

    ./class test.ini cl_permille.pre

The files *.pre are suppposed to specify the precision parameters for
which you don't want to keep default values. If you find it more
convenient, you can pass these precision parameter values in your *.ini
file instead of an additional *.pre file.

The automatically-generated documentation is located in

    doc/manual/html/index.html
    doc/manual/CLASS_manual.pdf

On top of that, if you wish to modify the code, you will find lots of
comments directly in the files.

Python
------

To use CLASS from python, or ipython notebooks, or from the Monte
Python parameter extraction code, you need to compile not only the
code, but also its python wrapper. This can be done by typing just
'make' instead of 'make class' (or for speeding up: 'make -j'). More
details on the wrapper and its compilation are found on the wiki page

https://github.com/lesgourg/class_public/wiki

Plotting utility
----------------

Since version 2.3, the package includes an improved plotting script
called CPU.py (Class Plotting Utility), written by Benjamin Audren and
Jesus Torrado. It can plot the Cl's, the P(k) or any other CLASS
output, for one or several models, as well as their ratio or percentage
difference. The syntax and list of available options is obtained by
typing 'pyhton CPU.py -h'. There is a similar script for MATLAB,
written by Thomas Tram. To use it, once in MATLAB, type 'help
plot_CLASS_output.m'

Developing the code
--------------------

If you want to develop the code, we suggest that you download it from
the github webpage

https://github.com/lesgourg/class_public

rather than from class-code.net. Then you will enjoy all the feature
of git repositories. You can even develop your own branch and get it
merged to the public distribution. For related instructions, check

https://github.com/lesgourg/class_public/wiki/Public-Contributing

Using the code
--------------

You can use CLASS freely, provided that in your publications, you cite
at least the paper `CLASS II: Approximation schemes <http://arxiv.org/abs/1104.2933>`. Feel free to cite more CLASS papers!

Support
-------

To get support, please open a new issue on the

https://github.com/lesgourg/class_public

webpage!
