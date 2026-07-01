/** @file background.h Documented includes for background module */

#ifndef __BACKGROUND__
#define __BACKGROUND__

#include "common.h"
#include "quadrature.h"
#include "growTable.h"
#include "arrays.h"
#include "dei_rkck.h"
#include "parser.h"

/** list of possible parametrisations of the DE equation of state */

enum equation_of_state {CLP,EDE};


/** list of possible parametrizations of the varying fundamental constants */

enum varconst_dependence {varconst_none,varconst_instant};

/** list of formats for the vector of background quantities */

enum vecback_format {short_info, normal_info, long_info};

/** list of interpolation methods: search location in table either
    by bisection (inter_normal), or step by step starting from given
    index (inter_closeby) */

enum interpolation_method {inter_normal, inter_closeby};

/** list of dark energy modes for unified framework */

enum dark_energy_mode {prtoe_active, prtoe_frozen, lambda_limit};

/**
 * background structure containing all the background information that
 * other modules need to know.
 *
 * Once initialized by the backgound_init(), contains all necessary
 * information on the background evolution (except thermodynamics),
 * and in particular, a table of all background quantities as a
 * function of time and scale factor, used for interpolation in other
 * modules.
 */

struct background
{
  /** @name - input parameters initialized by user in input module
   *  (all other quantities are computed in this module, given these parameters
   *   and the content of the 'precision' structure)
   *
   * The background cosmological parameters listed here form a parameter
   * basis which is directly usable by the background module. Nothing
   * prevents from defining the input cosmological parameters
   * differently, and to pre-process them into this format, using the input
   * module (this might require iterative calls of background_init()
   * e.g. for dark energy or decaying dark matter). */

  //@{

  double H0; /**< \f$ H_0 \f$: Hubble parameter (in fact, [\f$H_0/c\f$]) in \f$ Mpc^{-1} \f$ */
  double h;  /**< reduced Hubble parameter */

  double Omega0_g; /**< \f$ \Omega_{0 \gamma} \f$: photons */
  double T_cmb;    /**< \f$ T_{cmb} \f$: current CMB temperature in Kelvins */

  double Omega0_b; /**< \f$ \Omega_{0 b} \f$: baryons */

  double Omega0_ur; /**< \f$ \Omega_{0 \nu r} \f$: ultra-relativistic neutrinos */

  double Omega0_cdm;      /**< \f$ \Omega_{0 cdm} \f$: cold dark matter */

  double Omega0_idm; /**< \f$ \Omega_{0 idm} \f$: interacting dark matter with photons, baryons, and idr */


  double Omega0_idr; /**< \f$ \Omega_{0 idr} \f$: interacting dark radiation */
  double T_idr;      /**< \f$ T_{idr} \f$: current temperature of interacting dark radiation in Kelvins */

  double Omega0_dcdmdr;   /**< \f$ \Omega_{0 dcdm}+\Omega_{0 dr} \f$: decaying cold dark matter (dcdm) decaying to dark radiation (dr) */
  double Omega_ini_dcdm;  /**< \f$ \Omega_{ini,dcdm} \f$: rescaled initial value for dcdm density (see 1407.2418 for definitions) */
  double Gamma_dcdm;      /**< \f$ \Gamma_{dcdm} \f$: decay constant for decaying cold dark matter */
  double tau_dcdm;

  int N_ncdm;                            /**< Number of distinguishable ncdm species */
  /* the following parameters help to define tabulated ncdm p-s-d passed in file */
  char * ncdm_psd_files;                 /**< list of filenames for tabulated p-s-d */
  int * got_files;                       /**< list of flags for each species, set to true if p-s-d is passed through file */
  /* the following parameters help to define the analytical ncdm phase space distributions (p-s-d) */
  double * ncdm_psd_parameters;          /**< list of parameters for specifying/modifying ncdm p.s.d.'s, to be customized for given model
                                            (could be e.g. mixing angles) */
  double * M_ncdm;                       /**< vector of masses of non-cold relic: dimensionless ratios m_ncdm/T_ncdm */
  double * m_ncdm_in_eV;                 /**< list of ncdm masses in eV (inferred from M_ncdm and other parameters above) */
  double * Omega0_ncdm, Omega0_ncdm_tot; /**< Omega0_ncdm for each species and for the total Omega0_ncdm */
  double * T_ncdm,T_ncdm_default;        /**< list of 1st parameters in p-s-d of non-cold relics: relative temperature
                                            T_ncdm1/T_gamma; and its default value */
  double * ksi_ncdm, ksi_ncdm_default;   /**< list of 2nd parameters in p-s-d of non-cold relics: relative chemical potential
                                            ksi_ncdm1/T_ncdm1; and its default value */
  double * deg_ncdm, deg_ncdm_default;    /**< vector of degeneracy parameters in factor of p-s-d: 1 for one family of neutrinos
                                             (= one neutrino plus its anti-neutrino, total g*=1+1=2, so deg = 0.5 g*); and its
                                             default value */
  int * ncdm_input_q_size; /**< Vector of numbers of q bins */
  double * ncdm_qmax;      /**< Vector of maximum value of q */

  double Omega0_k;         /**< \f$ \Omega_{0_k} \f$: curvature contribution */

  double Omega0_lambda;    /**< \f$ \Omega_{0_\Lambda} \f$: cosmological constant */
  double Omega0_fld;       /**< \f$ \Omega_{0 de} \f$: fluid */
  double Omega0_scf;       /**< \f$ \Omega_{0 scf} \f$: scalar field */
  short use_ppf; /**< flag switching on PPF perturbation equations instead of true fluid equations for perturbations. It could have been defined inside
                    perturbation structure, but we leave it here in such way to have all fld parameters grouped. */
  double c_gamma_over_c_fld; /**< ppf parameter defined in eq. (16) of 0808.3125 [astro-ph] */
  enum equation_of_state fluid_equation_of_state; /**< parametrisation scheme for fluid equation of state */
  double w0_fld;   /**< \f$ w0_{DE} \f$: current fluid equation of state parameter */
  double wa_fld;   /**< \f$ wa_{DE} \f$: fluid equation of state parameter derivative */
  double cs2_fld;  /**< \f$ c^2_{s~DE} \f$: sound speed of the fluid in the frame comoving with the fluid (so, this is
                      not [delta p/delta rho] in the synchronous or newtonian gauge!) */
  double Omega_EDE;        /**< \f$ wa_{DE} \f$: Early Dark Energy density parameter */
  double * scf_parameters; /**< list of parameters describing the scalar field potential */
  short attractor_ic_scf;  /**< whether the scalar field has attractor initial conditions */
  int scf_tuning_index;    /**< index in scf_parameters used for tuning */
  double phi_ini_scf;      /**< \f$ \phi(t_0) \f$: scalar field initial value */
  double phi_prime_ini_scf;/**< \f$ d\phi(t_0)/d\tau \f$: scalar field initial derivative wrt conformal time */
  int scf_parameters_size; /**< size of scf_parameters */
  double varconst_alpha; /**< finestructure constant for varying fundamental constants */
  double xi_prtoe;      /**< Non-minimal coupling xi; stability wedge: [1e-7, 1.2e-5] */
  double lambda_prtoe;  /**< Exponential potential slope lambda */
  double m_prtoe;       /**< Scalar field mass (quadratic potential term) */
  double beta_prtoe;    /**< Ricci-coupling beta; sampled as log10(beta) in [-8,-4] */
  double delta_prtoe;   /**< Gradient-density interaction delta; screened as delta/(1+phi^2) */
  double V0_prtoe;      /**< Potential amplitude V0; fixed to 0.685 from action */
  double zeta_prtoe;    /**< Vainshtein screening parameter zeta */
  double Omega0_prtoe;  /**< Effective dark energy density from PRTOE field at a=1 */
  double M_prtoe;       /**< High-energy screening scale M */
  double alpha_prtoe;   /**< Interaction coupling alpha; screened as alpha^2/(1+phi^2) */
  double M_ew_prtoe;    /**< Electroweak scale M_EW (default 100 GeV in natural units) */
  double H_vac_floor;   /**< Baseline vacuum expansion floor in km/s/Mpc */
  double phi_c_prtoe;    /**< Activation function center phi_c */
  double delta_phi_prtoe; /**< Activation function width delta_phi */
  double g_b_prtoe;     /**< Baryonic field coupling multiplier */
  double sigma_prtoe;   /**< PRTOE Displacement coupling sigma */
  double rho0_prtoe;    /**< PRTOE Reference density rho_0 */
  double gamma_prtoe;   /**< PRTOE Acceleration constant gamma */

  /* ===== PHASE 5: Unified Dark Energy Framework ===== */
  enum dark_energy_mode de_mode;  /**< Dark energy mode: prtoe_active, prtoe_frozen, or lambda_limit */
  double omega_dark_energy;       /**< Total dark energy Omega (computed from Omega_Lambda or Omega0_prtoe) */
  double varconst_me; /**< electron mass for varying fundamental constants */
  double g_c_prtoe;     /**< Dark Matter field coupling multiplier */
  short unify_dark_sector; /**< If yes: single PRTOE field replaces CDM+DE budget */
  short prtoe_explicit_null_de; /**< User set Omega0_prtoe=0: preserve Lambda (null-limit path) */
  double Omega0_cdm_absorbed; /**< CDM Omega moved into Omega0_prtoe when unified */
  enum varconst_dependence varconst_dep; /**< dependence of the varying fundamental constants as a function of time */

  /* Canonical PRTOE parameters with *_prtoe suffix (screened triplet & potential) */
  /* Legacy names (prtoe_xi, prtoe_beta, etc.) removed entirely */
  short use_prtoe;
  double varconst_transition_redshift; /**< redshift of transition between varied fundamental constants and normal fundamental constants in the 'varconst_instant' case*/

  /* Indices for the PRTOE background storage in table (index_bg) */
  int index_bg_phi_prtoe;   /**< Index for the scalar field phi */
  int index_bg_dphi_prtoe;  /**< Index for conformal time derivative d(phi)/dtau */
  int index_bg_ddphi_prtoe; /**< Index for second conformal time derivative d²(phi)/dtau² */
  int index_bg_rho_prtoe;   /**< Energy density of the PRTOE fluid */
  int index_bg_p_prtoe;     /**< Pressure of the PRTOE fluid */
  int index_bg_rho_dark_energy;
  int index_bg_p_dark_energy;
  int index_bg_F_prtoe;     /**< F(phi) = 1 + xi * A(phi) * S(phi) */
  int index_bg_F_phi_prtoe; /**< dF/dphi */
  int index_bg_F_phiphi_prtoe; /**< d²F/dphi² */
  int index_bg_F_phiphiphi_prtoe; /**< d³F/dphi³ */
  int index_bg_meff2_prtoe; /**< Effective mass squared for stability */
  int index_bg_Q_prtoe;      /**< Gradient stability proxy Q */
  int index_bg_cs2_prtoe;   /**< Approximate scalar sound speed squared */
  int index_bg_F_dot_prtoe;  /**< dF/dt */
  int index_bg_F_ddot_prtoe; /**< d²F/dt² */
  int index_bg_K_prtoe;      /**< Kinetic coefficient K */
  int index_bg_cT2_prtoe;    /**< Tensor speed squared c_T² */

  /* Integration indices for the PRTOE ODE solver (index_bi) */
  int index_bi_phi_prtoe;    /**< Field value in integration vector */
  int index_bi_dphi_prtoe;   /**< Conformal derivative in integration vector */

  double R_curvature;       /**< Ricci Scalar R */

  //@}


  /** @name - related parameters */

  //@{

  double age; /**< age in Gyears */
  double conformal_age; /**< conformal age in Mpc */
  double K; /**< \f$ K \f$: Curvature parameter \f$ K=-\Omega0_k*a_{today}^2*H_0^2\f$; */
  int sgnK; /**< K/|K|: -1, 0 or 1 */
  double Neff; /**< so-called "effective neutrino number", computed at earliest time in interpolation table */
  double Omega0_dcdm; /**< \f$ \Omega_{0 dcdm} \f$: decaying cold dark matter */
  double Omega0_dr; /**< \f$ \Omega_{0 dr} \f$: decay radiation */
  double Omega0_m;  /**< total non-relativistic matter today */
  double Omega0_r;  /**< total ultra-relativistic radiation today */
  double Omega0_de; /**< total dark energy density today, currently defined as 1 - Omega0_m - Omega0_r - Omega0_k */
  double Omega0_nfsm; /**< total non-free-streaming matter, that is, cdm, baryons and wdm */
  double a_eq;      /**< scale factor at radiation/matter equality */
  double H_eq;      /**< Hubble rate at radiation/matter equality [Mpc^-1] */
  double z_eq;      /**< redshift at radiation/matter equality */
  double tau_eq;    /**< conformal time at radiation/matter equality [Mpc] */

  //@}


  /** @name - all indices for the vector of background (=bg) quantities stored in table */

  //@{

  int index_bg_a;             /**< scale factor (in fact (a/a_0), see
                                 normalisation conventions explained
                                 at beginning of background.c) */
  int index_bg_H;             /**< Hubble parameter in \f$Mpc^{-1}\f$ */
  int index_bg_H_prime;       /**< its derivative w.r.t. conformal time */

  /* end of vector in short format, now quantities in normal format */

  int index_bg_rho_g;         /**< photon density */
  int index_bg_rho_b;         /**< baryon density */
  int index_bg_rho_cdm;       /**< cdm density */
  int index_bg_rho_idm;       /**< idm density */
  int index_bg_rho_lambda;    /**< cosmological constant density */
  int index_bg_rho_fld;       /**< fluid density */
  int index_bg_w_fld;         /**< fluid equation of state */
  int index_bg_rho_idr;       /**< density of interacting dark radiation */
  int index_bg_rho_ur;        /**< relativistic neutrinos/relics density */
  int index_bg_rho_dcdm;      /**< dcdm density */
  int index_bg_rho_dr;        /**< dr density */

  int index_bg_phi_scf;       /**< scalar field value */
  int index_bg_phi_prime_scf; /**< scalar field derivative wrt conformal time */
  int index_bg_V_scf;         /**< scalar field potential V */
  int index_bg_dV_scf;        /**< scalar field potential derivative V' */
  int index_bg_ddV_scf;       /**< scalar field potential second derivative V'' */
  int index_bg_rho_scf;       /**< scalar field energy density */
  int index_bg_p_scf;         /**< scalar field pressure */
  int index_bg_p_prime_scf;         /**< scalar field pressure */

  int index_bg_rho_ncdm1;     /**< density of first ncdm species (others contiguous) */
  int index_bg_p_ncdm1;       /**< pressure of first ncdm species (others contiguous) */
  int index_bg_pseudo_p_ncdm1;/**< another statistical momentum useful in ncdma approximation */

  int index_bg_rho_tot;       /**< Total density */
  int index_bg_p_tot;         /**< Total pressure */
  int index_bg_p_tot_prime;   /**< Conf. time derivative of total pressure */

  int index_bg_Omega_r;       /**< relativistic density fraction (\f$ \Omega_{\gamma} + \Omega_{\nu r} \f$) */

  /* end of vector in normal format, now quantities in long format */

  int index_bg_rho_crit;      /**< critical density */
  int index_bg_Omega_m;       /**< non-relativistic density fraction (\f$ \Omega_b + \Omega_cdm + \Omega_{\nu nr} \f$) */
  int index_bg_conf_distance; /**< conformal distance (from us) in Mpc */
  int index_bg_ang_distance;  /**< angular diameter distance in Mpc */
  int index_bg_lum_distance;  /**< luminosity distance in Mpc */
  int index_bg_time;          /**< proper (cosmological) time in Mpc */
  int index_bg_rs;            /**< comoving sound horizon in Mpc */

  int index_bg_D;             /**< scale independent growth factor D(a) for CDM perturbations */
  int index_bg_f;             /**< corresponding velocity growth factor [dlnD]/[dln a] */

  int index_bg_varc_alpha;    /**< value of fine structure constant in varying fundamental constants */
  int index_bg_varc_me;      /**< value of effective electron mass in varying fundamental constants */

  int bg_size_short;  /**< size of background vector in the "short format" */
  int bg_size_normal; /**< size of background vector in the "normal format" */
  int bg_size;        /**< size of background vector in the "long format" */

  //@}


  /** @name - background interpolation tables */

  //@{

  int bt_size;               /**< number of lines (i.e. time-steps) in the four following array */
  double * loga_table;       /**< vector loga_table[index_loga] with values of log(a) (in fact \f$ log(a/a0) \f$, logarithm of relative scale factor compared to today) */
  double * tau_table;        /**< vector tau_table[index_loga] with values of conformal time \f$ \tau \f$ (in fact \f$ a_0 c tau \f$, see normalisation conventions explained at beginning of background.c) */
  double * z_table;          /**< vector z_table[index_loga] with values of \f$ z \f$ (redshift) */
  double * background_table; /**< table background_table[index_tau*pba->bg_size+pba->index_bg] with all other quantities (array of size bg_size*bt_size) **/

  //@}


  /** @name - table of their second derivatives, used for spline interpolation */

  //@{

  double * d2tau_dz2_table; /**< vector d2tau_dz2_table[index_loga] with values of \f$ d^2 \tau / dz^2 \f$ (conformal time) */
  double * d2z_dtau2_table; /**< vector d2z_dtau2_table[index_loga] with values of \f$ d^2 z / d\tau^2 \f$ (conformal time) */
  double * d2background_dloga2_table; /**< table d2background_dtau2_table[index_loga*pba->bg_size+pba->index_bg] with values of \f$ d^2 b_i / d\log(a)^2 \f$ */

  //@}


  /** @name - all indices for the vector of background quantities to be integrated (=bi)
   *
   * Most background quantities can be immediately inferred from the
   * scale factor. Only few of them require an integration with
   * respect to conformal time (in the minimal case, only one quantity needs to
   * be integrated with time: the scale factor, using the Friedmann
   * equation). These indices refer to the vector of
   * quantities to be integrated with time.
   * {B} quantities are needed by background_functions() while {C} quantities are not.
   */

  //@{

  int index_bi_rho_dcdm;/**< {B} dcdm density */
  int index_bi_rho_dr;  /**< {B} dr density */
  int index_bi_rho_fld; /**< {B} fluid density */
  int index_bi_phi_scf;       /**< {B} scalar field value */
  int index_bi_phi_prime_scf; /**< {B} scalar field derivative wrt conformal time */

  int index_bi_time;    /**< {C} proper (cosmological) time in Mpc */
  int index_bi_rs;      /**< {C} sound horizon */
  int index_bi_tau;     /**< {C} conformal time in Mpc */
  int index_bi_D;       /**< {C} scale independent growth factor D(a) for CDM perturbations. */
  int index_bi_D_prime; /**< {C} D satisfies \f$ [D''(\tau)=-aHD'(\tau)+3/2 a^2 \rho_M D(\tau) \f$ */

  int bi_B_size;        /**< Number of {B} parameters */
  int bi_size;          /**< Number of {B}+{C} parameters */

  //@}

  /** @name - flags describing the absence or presence of cosmological
      ingredients
      *
      * having one of these flag set to zero allows to skip the
      * corresponding contributions, instead of adding null contributions.
      */


  //@{

  short has_cdm;       /**< presence of cold dark matter? */
  short has_idm;       /**< presence of interacting dark matter with photons, baryons, and idr */
  short has_dcdm;      /**< presence of decaying cold dark matter? */
  short has_dr;        /**< presence of relativistic decay radiation? */
  short has_scf;       /**< presence of a scalar field? */
  short has_ncdm;      /**< presence of non-cold dark matter? */
  short has_lambda;    /**< presence of cosmological constant? */
  short has_fld;       /**< presence of fluid with constant w and cs2? */
  short has_ur;        /**< presence of ultra-relativistic neutrinos/relics? */
  short has_idr;       /**< presence of interacting dark radiation? */
  short has_curvature; /**< presence of global spatial curvature? */
  short has_varconst;  /**< presence of varying fundamental constants? */

  //@}


  /**
   *@name - arrays related to sampling and integration of ncdm phase space distributions
   */

  //@{

  int * ncdm_quadrature_strategy; /**< Vector of integers according to quadrature strategy. */
  double ** q_ncdm_bg;  /**< Pointers to vectors of background sampling in q */
  double ** w_ncdm_bg;  /**< Pointers to vectors of corresponding quadrature weights w */
  double ** q_ncdm;     /**< Pointers to vectors of perturbation sampling in q */
  double ** w_ncdm;     /**< Pointers to vectors of corresponding quadrature weights w */
  double ** dlnf0_dlnq_ncdm; /**< Pointers to vectors of logarithmic derivatives of p-s-d */
  int * q_size_ncdm_bg; /**< Size of the q_ncdm_bg arrays */
  int * q_size_ncdm;    /**< Size of the q_ncdm arrays */
  double * factor_ncdm; /**< List of normalization factors for calculating energy density etc.*/

  //@}

  /** @name - technical parameters */

  //@{

  short shooting_failed;  /**< flag is set to true if shooting failed. */
  ErrorMsg shooting_error; /**< Error message from shooting failed. */

  short background_verbose; /**< flag regulating the amount of information sent to standard output (none if set to zero) */

  ErrorMsg error_message; /**< zone for writing error messages */

  short is_allocated; /**< flag is set to true if allocated */
  //@}
};


/**
 * temporary parameters and workspace passed to the background_derivs function
 */

struct background_parameters_and_workspace {

  /* structures containing fixed input parameters (indices, ...) */
  struct background * pba;

  /* workspace */
  double * pvecback;

};

/**
 * temporary parameters and workspace passed to phase space distribution function
 */

struct background_parameters_for_distributions {

  /* structures containing fixed input parameters (indices, ...) */
  struct background * pba;

  /* Additional parameters */

  /* Index of current distribution function */
  int n_ncdm;

  /* Used for interpolating in file of tabulated p-s-d: */
  int tablesize;
  double *q;
  double *f0;
  double *d2f0;
  int last_index;

};

/**************************************************************/
/* @cond INCLUDE_WITH_DOXYGEN */
/*
 * Boilerplate for C++
 */
#ifdef __cplusplus
extern "C" {
#endif

  int background_at_z(
                      struct background *pba,
                      double a_rel,
                      enum vecback_format return_format,
                      enum interpolation_method inter_mode,
                      int * last_index,
                      double * pvecback
                      );

  int background_at_tau(
                        struct background *pba,
                        double tau,
                        enum vecback_format return_format,
                        enum interpolation_method inter_mode,
                        int * last_index,
                        double * pvecback
                        );

  int background_tau_of_z(
                          struct background *pba,
                          double z,
                          double * tau
                          );

  int background_z_of_tau(
                          struct background *pba,
                          double tau,
                          double * z
                          );

  int background_functions(
                           struct background *pba,
                           double a_rel,
                           double * pvecback_B,
                           enum vecback_format return_format,
                           double * pvecback
                           );

  int background_w_fld(
                       struct background * pba,
                       double a,
                       double * w_fld,
                       double * dw_over_da_fld,
                       double * integral_fld);

  int background_varconst_of_z(
                               struct background* pba,
                               double z,
                               double* alpha,
                               double* me
                               );

  int background_init(
                      struct precision *ppr,
                      struct background *pba
                      );

  int background_prtoe_local_gravity_post_integration(
                                                      struct background *pba
                                                      );

  int background_free(
                      struct background *pba
                      );

  int background_free_noinput(
                              struct background *pba
                              );

  int background_free_input(
                            struct background *pba
                            );

  int background_indices(
                         struct background *pba
                         );

  int background_ncdm_distribution(
                                   void *pba,
                                   double q,
                                   double * f0
                                   );

  int background_ncdm_test_function(
                                    void *pba,
                                    double q,
                                    double * test
                                    );

  int background_ncdm_init(
                           struct precision *ppr,
                           struct background *pba
                           );

  int background_ncdm_momenta(
                              double * qvec,
                              double * wvec,
                              int qsize,
                              double M,
                              double factor,
                              double z,
                              double * n,
                              double * rho,
                              double * p,
                              double * drho_dM,
                              double * pseudo_p
                              );

  int background_ncdm_M_from_Omega(
                                   struct precision *ppr,
                                   struct background *pba,
                                   int species
                                   );

  int background_checks(
                        struct precision * ppr,
                        struct background *pba
                        );

  int background_solve(
                       struct precision *ppr,
                       struct background *pba
                       );

  int background_initial_conditions(
                                    struct precision *ppr,
                                    struct background *pba,
                                    double * pvecback,
                                    double * pvecback_integration,
                                    double * loga_ini
                                    );

  int background_find_equality(
                               struct precision *ppr,
                               struct background *pba
                               );


  int background_output_titles(struct background * pba,
                               char titles[_MAXTITLESTRINGLENGTH_]
                               );

  int background_output_data(
                             struct background *pba,
                             int number_of_titles,
                             double *data);

  int background_derivs(
                        double loga,
                        double * y,
                        double * dy,
                        void * parameters_and_workspace,
                        ErrorMsg error_message
                        );

  int background_sources(
                         double loga,
                         double * y,
                         double * dy,
                         int index_loga,
                         void * parameters_and_workspace,
                         ErrorMsg error_message
                         );

  int background_timescale(
                           double loga,
                           void * parameters_and_workspace,
                           double * timescale,
                           ErrorMsg error_message
                           );

  int background_output_budget(
                               struct background* pba
                               );

  /** Scalar field potential and its derivatives **/
  double V_scf(
               struct background *pba,
               double phi
               );

  double dV_scf(
                struct background *pba,
                double phi
                );

  double ddV_scf(
                 struct background *pba,
                 double phi
                 );

  int background_prtoe_potential(struct background * pba, double phi, double * V, double * dV, double * ddV);


  /** Coupling between scalar field and matter **/
  double Q_scf(
               struct background *pba,
               double phi,
               double phi_prime
               );

#ifdef __cplusplus
}
#endif

/**************************************************************/

/**
 * @name Some conversion factors and fundamental constants needed by background module:
 */

//@{

#define _Mpc_over_m_ 3.085677581282e22  /**< conversion factor from meters to megaparsecs */
/* remark: CAMB uses 3.085678e22: good to know if you want to compare  with high accuracy */

#define _Gyr_over_Mpc_ 3.06601394e2 /**< conversion factor from megaparsecs to gigayears
                                       (c=1 units, Julian years of 365.25 days) */
#define _c_ 2.99792458e8            /**< c in m/s */
#define _G_ 6.67428e-11             /**< Newton constant in m^3/Kg/s^2 */
#define _eV_ 1.602176487e-19        /**< 1 eV expressed in J */

/* parameters entering in Stefan-Boltzmann constant sigma_B */
#define _k_B_ 1.3806504e-23
#define _h_P_ 6.62606896e-34
/* remark: sigma_B = 2 pi^5 k_B^4 / (15h^3c^2) = 5.670400e-8
   = Stefan-Boltzmann constant in W/m^2/K^4 = Kg/K^4/s^3 */

//@}

/**
 * @name Some limits on possible background parameters
 */

//@{

#define _h_BIG_ 1.5            /**< maximal \f$ h \f$ */
#define _h_SMALL_ 0.3         /**< minimal \f$ h \f$ */
#define _omegab_BIG_ 0.039    /**< maximal \f$ omega_b \f$ */
#define _omegab_SMALL_ 0.005  /**< minimal \f$ omega_b \f$ */

//@}

/**
 * @name Some limits imposed in other parts of the module:
 */

//@{

#define _SCALE_BACK_ 0.1  /**< logarithmic step used when searching
                             for an initial scale factor at which ncdm
                             are still relativistic */

#define _PSD_DERIVATIVE_EXP_MIN_ -30 /**< for ncdm, for accurate computation of dlnf0/dlnq, q step is varied in range specified by these parameters */
#define _PSD_DERIVATIVE_EXP_MAX_ 2  /**< for ncdm, for accurate computation of dlnf0/dlnq, q step is varied in range specified by these parameters */

#define _zeta3_ 1.2020569031595942853997381615114499907649862923404988817922 /**< for quandrature test function */
#define _zeta5_ 1.0369277551433699263313654864570341680570809195019128119741 /**< for quandrature test function */

//@}

/** Returns the effective coupling xi_eff(phi) with Vainshtein screening S(phi) only. */
static inline double get_xi_eff(struct background *pba, double phi) {
    double phi2 = phi * phi;
    double denom = 1.0 + pba->zeta_prtoe * phi2;
    double S_phi = phi2 / denom;
    return pba->xi_prtoe * S_phi;
}

/**
 * Scale-dependent G_eff/G from screened xi_eff(phi) and PRTOE potential.
 * Returns _TRUE_ when ratio is finite and safe to use.
 */
static inline int prtoe_compute_G_eff_ratio_k2(struct background *pba,
                                             double phi,
                                             double k2_a2,
                                             double *G_eff_ratio_out) {
    double xi_eff = get_xi_eff(pba, phi);
    double lambda = pba->lambda_prtoe;
    double V0 = pba->V0_prtoe;
    double m = pba->m_prtoe;
    double M2 = lambda * lambda * V0 * exp(-lambda * phi) + m * m;
    double zphi2 = 1.0 + pba->zeta_prtoe * phi * phi;
    double term1 = 1.0 + 4.0 * phi / zphi2;
    double xiphi = xi_eff * phi;
    double denom_xi = 1.0 + xiphi;
    double term2 = term1 - 3.0 * xi_eff * xi_eff / denom_xi;
    double denom2 = k2_a2 * term2 + M2;
    if (term2 <= 0.0
        || fabs(denom_xi) < 1e-30
        || fabs(denom2) < 1e-30
        || !isfinite(denom_xi)
        || !isfinite(term2)
        || !isfinite(denom2)) {
        return _FALSE_;
    }
    *G_eff_ratio_out = (1.0 / denom_xi) * ((k2_a2 * term1 + M2) / denom2);
    return isfinite(*G_eff_ratio_out) ? _TRUE_ : _FALSE_;
}

/** Solar-system and Earth reference densities for local-gravity map [kg/m^3]. */
#define PRTOE_RHO_SOLAR_INTERIOR_KG_M3 1.0e3
#define PRTOE_RHO_EARTH_CRUST_KG_M3    5.5e3

/** Convert CLASS background density [Mpc^-2] to physical kg/m^3. */
static inline double prtoe_rho_class_to_kg_m3(struct background *pba, double rho_class, double a) {
    double Omega = rho_class * a * a * a / (pba->H0 * pba->H0);
    return Omega * 1.8788e-26 * pba->h * pba->h;
}

/**
 * Chameleon / displacement environmental screening from local matter density.
 * S_env -> 0 in dense environments, -> 1 in cosmic vacuum.
 */
static inline double prtoe_environmental_screening_at_rho_kg_m3(struct background *pba,
                                                               double rho_kg_m3) {
    if (pba->sigma_prtoe <= 0.0 && pba->gamma_prtoe <= 0.0) {
        return 1.0;
    }
    double rho0 = MAX(pba->rho0_prtoe, 1e-30);
    double ratio = rho_kg_m3 / rho0;
    double gamma_exp = MAX(pba->gamma_prtoe, 1e-3);
    double S_env = 1.0 / (1.0 + pow(ratio, gamma_exp));
    if (pba->sigma_prtoe > 0.0) {
        S_env *= exp(-pba->sigma_prtoe * ratio);
    }
    return MAX(0.0, MIN(1.0, S_env));
}

/**
 * Equilibrium field value at matter density rho [kg/m^3].
 * Displacement: phi ~ gamma ln(rho/rho0), chameleon: suppressed at high rho.
 */
static inline double prtoe_phi_at_matter_density_kg_m3(struct background *pba,
                                                      double rho_kg_m3) {
    double rho0 = MAX(pba->rho0_prtoe, 1e-30);
    double ratio = MAX(rho_kg_m3 / rho0, 1e-30);
    double phi_disp = 0.0;
    if (pba->gamma_prtoe > 0.0) {
        phi_disp = pba->gamma_prtoe * log(ratio);
    }
    double phi_cham = phi_disp / (1.0 + pow(ratio, MAX(pba->gamma_prtoe, 1e-3)));
    if (pba->sigma_prtoe > 0.0 && rho_kg_m3 > 0.0) {
        double exp_term = exp(-pba->lambda_prtoe * phi_cham);
        double V_phi = -pba->lambda_prtoe * pba->V0_prtoe * exp_term
                     + pba->m_prtoe * pba->m_prtoe * phi_cham;
        double target = pba->sigma_prtoe * rho_kg_m3 * 1e-10;
        phi_cham *= exp(-fabs(V_phi) / MAX(fabs(target), 1e-30));
    }
    return phi_cham;
}

/** xi_eff with Vainshtein S(phi) and environmental S_env(rho). */
static inline double get_xi_eff_environmental(struct background *pba,
                                            double phi,
                                            double rho_kg_m3) {
    return get_xi_eff(pba, phi)
         * prtoe_environmental_screening_at_rho_kg_m3(pba, rho_kg_m3);
}

/** Effective G_eff/G at environment (Newtonian, small-coupling limit). */
static inline double prtoe_G_eff_over_G_at_environment(struct background *pba,
                                                       double phi,
                                                       double rho_kg_m3) {
    double xi_env = get_xi_eff_environmental(pba, phi, rho_kg_m3);
    double u = (phi - pba->phi_c_prtoe) / MAX(pba->delta_phi_prtoe, 1e-30);
    double A = 0.5 * (1.0 + tanh(u));
    double F = 1.0 + xi_env * A;
    return 1.0 / MAX(F, 1e-30);
}

/** |G_eff/G - 1| at a reference matter density. */
static inline double prtoe_fifth_force_deviation_at_rho_kg_m3(struct background *pba,
                                                              double rho_kg_m3) {
    double phi_eq = prtoe_phi_at_matter_density_kg_m3(pba, rho_kg_m3);
    double Geff = prtoe_G_eff_over_G_at_environment(pba, phi_eq, rho_kg_m3);
    return fabs(Geff - 1.0);
}

/**
 * Returns _TRUE_ only when PRTOE should be treated as an active extension
 * (i.e. we allocate extra variables and let it replace/affect Lambda).
 *
 * This is the centralized gate used for:
 *   - index allocation (background + perturbations)
 *   - automatically disabling Omega0_lambda / has_lambda
 *   - high-level decisions in input / background_init
 *
 * The covariant activation (rho_phi / rho_r) inside prtoe_compute_quantities()
 * is a separate, time-dependent decision that controls *when* the field
 * starts evolving inside an active run.
 */
static inline int prtoe_is_physically_active(struct background *pba) {
    if (pba->use_prtoe == _FALSE_) {
        return _FALSE_;
    }
    if (pba->prtoe_explicit_null_de == _TRUE_) {
        return _FALSE_;
    }
    /* Explicit dark-energy budget or non-minimal coupling (xi) activates PRTOE. */
    if (pba->Omega0_prtoe > 0.0 || pba->xi_prtoe >= 1e-7) {
        return _TRUE_;
    }
    return _FALSE_;
}

/** Minimum rho_prtoe for perturbation-level PRTOE coupling (stress-energy, G_eff, ICs). */
#define PRTOE_RHO_ACTIVATION_THRESHOLD 1e-30

/**
 * Time-dependent gate: PRTOE perturbations couple only when the field
 * contributes to the background energy budget (covariant activation on).
 */
static inline int prtoe_is_covariantly_active_at_tau(struct background *pba, double rho_prtoe) {
    if (pba->de_mode != prtoe_active) {
        return _FALSE_;
    }
    return (rho_prtoe > PRTOE_RHO_ACTIVATION_THRESHOLD) ? _TRUE_ : _FALSE_;
}

/**
 * FLRW reduction of □F for homogeneous F(phi) (§2.4 documented approximation).
 * □F = F_φ □φ + F_φφ φ̇² with □φ = φ̈ + 3H φ̇ (physical time).
 */
static inline double prtoe_box_F_flrw(double F_phi,
                                      double F_phiphi,
                                      double box_phi_phys,
                                      double phi_dot_phys) {
    return F_phi * box_phi_phys + F_phiphi * phi_dot_phys * phi_dot_phys;
}

/**
 * Leading background correction from neglected ∇∇F / □F metric-variation pieces.
 * Subtracted from φ̈ in background_derivs (controlled approximation, §2.4).
 */
static inline double prtoe_nabla_box_F_background_correction(double F,
                                                           double F_phi,
                                                           double box_F_flrw,
                                                           double H) {
    double F_safe = MAX(F, 1e-30);
    double H_safe = MAX(fabs(H), 1e-30);
    return (F_phi / F_safe) * box_F_flrw / (6.0 * H_safe * H_safe);
}

/**
 * Stable effective mass squared (shared by background and perturbations).
 * Uses R = 3H'/a + K/a^2 - H^2 instead of raw 6(H'/a + 2H^2 + K/a^2).
 */
static inline double prtoe_compute_meff2(double V_phiphi,
                                         double F,
                                         double F_phi,
                                         double F_phiphi,
                                         double H,
                                         double H_prime,
                                         double a,
                                         double K,
                                         double phi_dot) {
    double F_safe = MAX(F, 1e-30);
    double R_stable = 3.0 * H_prime / a + K / (a * a) - H * H;
    return V_phiphi
         + (F_phi / F_safe) * R_stable
         - (F_phiphi / F_safe) * (phi_dot * phi_dot);
}

/** Blend a coupling ratio toward unity: 1 + g*(ratio - 1). g=0 → GR, g=1 → full ratio. */
static inline double prtoe_blend_coupling(double g_coupling, double ratio) {
    return 1.0 + g_coupling * (ratio - 1.0);
}

/** Cassini-scale bound on effective coupling xi_eff(phi) at solar-system densities. */
#define PRTOE_FIFTH_FORCE_XI_EFF_MAX 1e-5

/** PPN γ−1 ≈ G_eff/G − 1 at a screened environment density [kg/m^3]. */
static inline double prtoe_ppn_gamma_minus_one_at_rho(struct background *pba,
                                                      double rho_kg_m3) {
    double phi_eq = prtoe_phi_at_matter_density_kg_m3(pba, rho_kg_m3);
    return prtoe_G_eff_over_G_at_environment(pba, phi_eq, rho_kg_m3) - 1.0;
}

/**
 * Equivalence-principle violation η_EP = |G_eff,b − G_eff,c| at lab-scale k.
 * Torsion-balance experiments require η_EP ≪ 10^{-13}; we gate at 10^{-5} here.
 */
static inline double prtoe_equivalence_principle_eta(struct background *pba,
                                                     double rho_kg_m3,
                                                     double k2_over_a2) {
    double phi_eq = prtoe_phi_at_matter_density_kg_m3(pba, rho_kg_m3);
    double Geff_ratio = 1.0;
    if (prtoe_compute_G_eff_ratio_k2(pba, phi_eq, k2_over_a2, &Geff_ratio) == _FALSE_) {
        return 1.0;
    }
    double g_b = prtoe_blend_coupling(pba->g_b_prtoe, Geff_ratio);
    double g_c = prtoe_blend_coupling(pba->g_c_prtoe, Geff_ratio);
    return fabs(g_b - g_c);
}

/**
 * Order-of-magnitude Mercury perihelion precession excess [rad/orbit]
 * from screened γ−1 at solar-interior density (PPN weak-field scaling).
 */
static inline double prtoe_mercury_precession_excess_rad(struct background *pba) {
    double gamma_minus_one =
        prtoe_ppn_gamma_minus_one_at_rho(pba, PRTOE_RHO_SOLAR_INTERIOR_KG_M3);
    const double gr_contribution_rad_per_orbit = 5.0e-7;
    return gr_contribution_rad_per_orbit * fabs(gamma_minus_one) / PRTOE_FIFTH_FORCE_XI_EFF_MAX;
}

/** Vainshtein screening factor S(phi) = phi^2 / (1 + zeta phi^2). */
static inline double prtoe_screening_S(double phi, double zeta) {
    double phi2 = phi * phi;
    return phi2 / (1.0 + zeta * phi2);
}

/** Effective coupling at field value phi (uses get_xi_eff). */
static inline double prtoe_xi_eff_at_phi(struct background *pba, double phi) {
    return get_xi_eff(pba, phi);
}

/**
 * Local gravity / fifth-force bound (solar-system scale).
 * Requires screened xi_eff below PRTOE_FIFTH_FORCE_XI_EFF_MAX.
 */
static inline int prtoe_passes_local_gravity_bounds(struct background *pba) {
    if (!prtoe_is_physically_active(pba)) {
        return _TRUE_;
    }
    if (pba->xi_prtoe > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
        return _FALSE_;
    }
    /* Cosmological vacuum samples */
    double phi_evals[3];
    phi_evals[0] = fabs(pba->phi_ini_scf) > 1e-30 ? pba->phi_ini_scf : 1e-3;
    phi_evals[1] = fabs(pba->phi_c_prtoe) > 1e-30 ? pba->phi_c_prtoe : 1e-2;
    phi_evals[2] = 1e-1;
    for (int i = 0; i < 3; i++) {
        if (prtoe_xi_eff_at_phi(pba, phi_evals[i]) > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
            return _FALSE_;
        }
    }
    /* Environmental map: solar interior and Earth crust densities */
    double rho_refs[2];
    rho_refs[0] = PRTOE_RHO_SOLAR_INTERIOR_KG_M3;
    rho_refs[1] = PRTOE_RHO_EARTH_CRUST_KG_M3;
    for (int i = 0; i < 2; i++) {
        if (prtoe_fifth_force_deviation_at_rho_kg_m3(pba, rho_refs[i])
            > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
            return _FALSE_;
        }
    }
    return _TRUE_;
}

/**
 * Post-integration fifth-force check (after background_solve).
 * Re-validates the environmental map and bounds vacuum G_eff leakage at a=1
 * using the integrated background field value phi(a=1).
 */
static inline int prtoe_post_integration_local_gravity_passes(struct background *pba) {
    if (!prtoe_is_physically_active(pba)) {
        return _TRUE_;
    }
    double rho_refs[2];
    rho_refs[0] = PRTOE_RHO_SOLAR_INTERIOR_KG_M3;
    rho_refs[1] = PRTOE_RHO_EARTH_CRUST_KG_M3;
    for (int i = 0; i < 2; i++) {
        if (prtoe_fifth_force_deviation_at_rho_kg_m3(pba, rho_refs[i])
            > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
            return _FALSE_;
        }
    }
    if (pba->index_bg_phi_prtoe >= 0 && pba->bt_size > 0) {
        int last = pba->bt_size - 1;
        double phi_today =
            pba->background_table[last * pba->bg_size + pba->index_bg_phi_prtoe];
        double F_today = 1.0;
        if (pba->index_bg_F_prtoe >= 0) {
            F_today = pba->background_table[last * pba->bg_size + pba->index_bg_F_prtoe];
        }
        else {
            double u = (phi_today - pba->phi_c_prtoe) / MAX(pba->delta_phi_prtoe, 1e-30);
            double A = 0.5 * (1.0 + tanh(u));
            F_today = 1.0 + get_xi_eff(pba, phi_today) * A;
        }
        if (get_xi_eff(pba, phi_today) > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
            return _FALSE_;
        }
        if (fabs(1.0 / MAX(F_today, 1e-30) - 1.0) > PRTOE_FIFTH_FORCE_XI_EFF_MAX) {
            return _FALSE_;
        }
    }
    return _TRUE_;
}

/** Weight [0,1] for CDM-like clustering sourced by the PRTOE field. */
static inline double prtoe_clustering_weight_cdm(struct background *pba) {
    if (!prtoe_is_physically_active(pba)) {
        return 0.0;
    }
    return MAX(0.0, MIN(1.0, pba->g_c_prtoe));
}

/**
 * Clustered PRTOE density perturbation routed into the effective CDM sector.
 * Returns 0 when unify_dark_sector=no or field is inactive.
 */
static inline double prtoe_unified_cluster_delta_rho(
    struct background *pba,
    double rho_prtoe,
    double delta_rho_prtoe) {
    if (!prtoe_is_physically_active(pba)
        || pba->unify_dark_sector != _TRUE_
        || rho_prtoe <= 0.0) {
        return 0.0;
    }
    return prtoe_clustering_weight_cdm(pba) * delta_rho_prtoe;
}

/**
 * Linearized Klein-Gordon estimate for delta_phi'' (conformal time),
 * used in the delta_F'' chain rule when ddelta is the first derivative.
 */
static inline double prtoe_linearized_delta_phi_primeprime(
    double k2, double a, double a_prime_over_a,
    double delta_phi, double delta_phi_prime,
    double V_phi, double F) {
    double F_safe = MAX(F, 1e-30);
    double a2 = MAX(a * a, 1e-60);
    return -3.0 * a_prime_over_a * delta_phi_prime
           - (k2 / a2) * delta_phi
           - V_phi * delta_phi / (F_safe * a2);
}

/** Full DM/DE unification mode: PRTOE replaces separate CDM species. */
static inline int prtoe_unified_dark_sector_active(struct background *pba) {
    return (pba->use_prtoe == _TRUE_
            && pba->unify_dark_sector == _TRUE_
            && prtoe_is_physically_active(pba)) ? _TRUE_ : _FALSE_;
}

/** Whether a separate CDM fluid is evolved (false when unified). */
static inline int prtoe_has_separate_cdm(struct background *pba) {
    if (prtoe_unified_dark_sector_active(pba)) {
        return _FALSE_;
    }
    return pba->has_cdm;
}

/**
 * Effective Omega_cdm when unify_dark_sector=yes:
 * standard CDM plus clustered PRTOE contribution at scale factor a.
 */
static inline double prtoe_effective_omega_cdm_at_a(struct background *pba,
                                                    double rho_prtoe,
                                                    double rho_crit) {
    if (rho_crit <= 0.0) {
        return pba->Omega0_cdm;
    }
    if (prtoe_unified_dark_sector_active(pba)) {
        return prtoe_clustering_weight_cdm(pba) * rho_prtoe / rho_crit;
    }
    if (pba->unify_dark_sector != _TRUE_) {
        return pba->Omega0_cdm;
    }
    double omega_prtoe_c = prtoe_clustering_weight_cdm(pba) * rho_prtoe / rho_crit;
    return pba->Omega0_cdm + omega_prtoe_c;
}

#endif
/* @endcond */
