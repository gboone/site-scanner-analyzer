/**
 * Static alias map: lowercase alias → canonical DB agency name(s).
 *
 * The canonical strings are the official department/agency names as the GSA
 * Site Scanner stores them in the `sites.agency` column. The /agencies/resolve
 * route looks an alias up here, then counts matching sites in the DB.
 *
 * An alias mapping to MORE THAN ONE canonical name is genuinely ambiguous
 * (e.g. "doe" → Energy AND Education); the route returns those as
 * disambiguation candidates rather than guessing.
 *
 * Sub-agency nicknames resolve to the PARENT agency name as stored in the DB
 * (e.g. "fbi" → Department of Justice), since sub-agencies live in the `bureau`
 * column, not `agency`.
 *
 * Plain data, no runtime dependencies — easy to extend.
 */

// Canonical names, referenced below so typos surface in one place.
const AGRICULTURE = 'Department of Agriculture';
const COMMERCE = 'Department of Commerce';
const DEFENSE = 'Department of Defense';
const EDUCATION = 'Department of Education';
const ENERGY = 'Department of Energy';
const HHS = 'Department of Health and Human Services';
const DHS = 'Department of Homeland Security';
const HUD = 'Department of Housing and Urban Development';
const INTERIOR = 'Department of the Interior';
const JUSTICE = 'Department of Justice';
const LABOR = 'Department of Labor';
const STATE = 'Department of State';
const TREASURY = 'Department of the Treasury';
const TRANSPORTATION = 'Department of Transportation';
const VA = 'Department of Veterans Affairs';
const EPA = 'Environmental Protection Agency';
const NASA = 'National Aeronautics and Space Administration';
const GSA = 'General Services Administration';
const NSF = 'National Science Foundation';
const NRC = 'Nuclear Regulatory Commission';
const OPM = 'Office of Personnel Management';
const SBA = 'Small Business Administration';
const SSA = 'Social Security Administration';
const USAID = 'U.S. Agency for International Development';
const GAO = 'Government Accountability Office';

export const AGENCY_ALIASES: Record<string, string[]> = {
  // ── Executive departments (CFO Act + common abbreviations) ──────────────
  usda: [AGRICULTURE],
  agriculture: [AGRICULTURE],

  doc: [COMMERCE],
  commerce: [COMMERCE],

  dod: [DEFENSE],
  defense: [DEFENSE],
  pentagon: [DEFENSE],

  ed: [EDUCATION],
  education: [EDUCATION],

  doe: [ENERGY, EDUCATION], // ambiguous: Energy vs Education

  hhs: [HHS],
  dhhs: [HHS],

  dhs: [DHS],

  hud: [HUD],

  doi: [INTERIOR],
  interior: [INTERIOR],

  doj: [JUSTICE],
  justice: [JUSTICE],

  dol: [LABOR],
  labor: [LABOR],

  dos: [STATE],
  state: [STATE],

  treasury: [TREASURY],
  treas: [TREASURY],

  dot: [TRANSPORTATION],
  transportation: [TRANSPORTATION],

  va: [VA],

  // ── Independent agencies ────────────────────────────────────────────────
  epa: [EPA],
  nasa: [NASA],
  gsa: [GSA],
  nsf: [NSF],
  nrc: [NRC],
  opm: [OPM],
  sba: [SBA],
  ssa: [SSA],
  usaid: [USAID],
  aid: [USAID],
  gao: [GAO],

  // ── Common sub-agency nicknames → parent agency ─────────────────────────
  fbi: [JUSTICE],
  dea: [JUSTICE],
  atf: [JUSTICE],
  fema: [DHS],
  tsa: [DHS],
  cbp: [DHS],
  ice: [DHS],
  uscis: [DHS],
  'secret service': [DHS],
  uscg: [DHS],
  cms: [HHS],
  cdc: [HHS],
  fda: [HHS],
  nih: [HHS],
  irs: [TREASURY],
  faa: [TRANSPORTATION],
  nhtsa: [TRANSPORTATION],
  nps: [INTERIOR],
  usgs: [INTERIOR],
  blm: [INTERIOR],
  noaa: [COMMERCE],
  census: [COMMERCE],
  nist: [COMMERCE],
};
