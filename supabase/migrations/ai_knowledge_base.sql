-- ============================================================
-- AI Knowledge Base Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── Table 1: Platform validity rules reference ────────────────
CREATE TABLE IF NOT EXISTS ai_validity_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key      text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  config_fields jsonb NOT NULL DEFAULT '{}',
  pass_logic    text NOT NULL,
  when_to_use   text NOT NULL,
  example       text,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

-- ── Table 2: Domain knowledge patterns ───────────────────────
CREATE TABLE IF NOT EXISTS ai_domain_knowledge (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain                text NOT NULL DEFAULT 'oil_and_gas',
  column_pattern        text NOT NULL,
  display_name          text NOT NULL,
  recommended_dimension text NOT NULL CHECK (recommended_dimension IN ('validity','consistency')),
  recommended_rule      text,
  config_template       jsonb NOT NULL DEFAULT '{}',
  reason                text NOT NULL,
  priority              int NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

-- ── RLS: allow anon read (n8n uses anon key) ─────────────────
ALTER TABLE ai_validity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_domain_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read" ON ai_validity_rules;
DROP POLICY IF EXISTS "public read" ON ai_domain_knowledge;

CREATE POLICY "public read" ON ai_validity_rules FOR SELECT USING (true);
CREATE POLICY "public read" ON ai_domain_knowledge FOR SELECT USING (true);

-- ============================================================
-- SEED: ai_validity_rules
-- ============================================================
INSERT INTO ai_validity_rules (rule_key, display_name, config_fields, pass_logic, when_to_use, example, sort_order) VALUES

('vali_val_pos',
 'Positive Values Only',
 '{}',
 'PASS if value is a number AND value > 0. FAIL if value <= 0 or not a number. Null/empty rows are skipped (auto-pass).',
 'Use when the column must always be strictly positive. No config fields needed.',
 'production volumes, flow rates, depths, pressures, counts',
 1),

('vali_val_neg',
 'Negative Values Only',
 '{}',
 'PASS if value is a number AND value < 0. FAIL if value >= 0 or not a number. Null/empty rows are skipped (auto-pass).',
 'Use when the column must always be strictly negative. Rare in O&G.',
 'drawdown values expressed as negative',
 2),

('range',
 'Numeric Range',
 '{"minValue": "<number as string>", "maxValue": "<number as string>"}',
 'PASS if minValue <= value <= maxValue. FAIL if outside range or not a number. Null/empty rows are skipped (auto-pass).',
 'Use when the column has a known realistic minimum and maximum. Both minValue and maxValue must be provided as strings.',
 'API gravity 10-70, temperature -50 to 500, percentage 0-100',
 3),

('vali_high_val',
 'Above Threshold',
 '{"threshold": "<number as string>"}',
 'PASS if value > threshold. FAIL if value <= threshold or not a number. Null/empty rows are skipped (auto-pass).',
 'Use when value must exceed a minimum floor but has no meaningful upper bound. Provide threshold as a string.',
 'pressure must be > 0, rate must be > 0.5',
 4),

('vali_low_val',
 'Below Threshold',
 '{"threshold": "<number as string>"}',
 'PASS if value < threshold. FAIL if value >= threshold or not a number. Null/empty rows are skipped (auto-pass).',
 'Use when value must stay below a ceiling. Provide threshold as a string.',
 'water cut must be < 100, concentration < 50',
 5),

('list',
 'Allowed Values List',
 '{"allowedValues": "VALUE1,VALUE2,VALUE3"}',
 'PASS if value exactly matches one entry in the allowed list (case-sensitive). FAIL if not in list. Null/empty rows are skipped (auto-pass).',
 'Use when a TEXT column has a small fixed set of valid values (<=15 distinct values). allowedValues must be comma-separated with NO spaces around commas. Use actual distinct values from the sample data.',
 'well status: ACTIVE,INACTIVE,SUSPENDED — lift type: ESP,GL,NF',
 6),

('pattern',
 'Regex Pattern',
 '{"pattern": "<JavaScript regex without delimiters>"}',
 'PASS if value matches the regex pattern. FAIL if pattern does not match or regex is invalid. Null/empty rows are skipped (auto-pass).',
 'Use when a TEXT column has a consistent structured format. Use standard JavaScript regex syntax without / delimiters.',
 'well ID: ^[A-Z0-9\\-_/]+$  — UWI: ^\\d{2}-\\d{3}-\\d{5}-\\d{4}$',
 7),

('datatype',
 'Data Type Check',
 '{"dataType": "number|string|date|email|url"}',
 'Validates data type only. number: !isNaN(Number(value)). date: Date.parse(value) is valid. email: name@domain.ext format. url: starts with http:// or https://. string: value is not empty.',
 'Use ONLY when no more specific rule applies. This is the least specific option — always prefer range, vali_val_pos, or list over datatype.',
 'report_date → datatype:date, well_name → datatype:string (last resort)',
 8)

ON CONFLICT (rule_key) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  config_fields = EXCLUDED.config_fields,
  pass_logic    = EXCLUDED.pass_logic,
  when_to_use   = EXCLUDED.when_to_use,
  example       = EXCLUDED.example,
  sort_order    = EXCLUDED.sort_order;

-- ============================================================
-- SEED: ai_domain_knowledge — Oil & Gas
-- ============================================================

-- First clear existing O&G entries to avoid duplicates on re-run
DELETE FROM ai_domain_knowledge WHERE domain = 'oil_and_gas';

INSERT INTO ai_domain_knowledge
  (domain, column_pattern, display_name, recommended_dimension, recommended_rule, config_template, reason, priority)
VALUES

-- ── METADATA HIERARCHY — must use Consistency, NOT Validity ──
('oil_and_gas', 'region',         'Region',              'consistency', NULL, '{}', 'Region is a metadata hierarchy value. Validate against a master reference list using Consistency dimension — not Validity.', 100),
('oil_and_gas', 'field',          'Field Name',          'consistency', NULL, '{}', 'Field name is master data. Validate against a reference dataset using Consistency dimension — not Validity.', 100),
('oil_and_gas', 'field_name',     'Field Name',          'consistency', NULL, '{}', 'Field name is master data. Validate against a reference dataset using Consistency dimension — not Validity.', 100),
('oil_and_gas', 'basin',          'Basin',               'consistency', NULL, '{}', 'Basin is a geographic hierarchy value. Validate against a reference list using Consistency — not Validity.', 100),
('oil_and_gas', 'area',           'Area/Block',          'consistency', NULL, '{}', 'Area or block code is a hierarchy value. Use Consistency against a master reference — not Validity.', 100),
('oil_and_gas', 'block',          'Block',               'consistency', NULL, '{}', 'Block is a concession hierarchy value. Use Consistency against master data — not Validity.', 100),
('oil_and_gas', 'platform',       'Platform/Facility',   'consistency', NULL, '{}', 'Platform name is a facility hierarchy value. Validate against a master list using Consistency — not Validity.', 100),
('oil_and_gas', 'facility',       'Facility',            'consistency', NULL, '{}', 'Facility is infrastructure master data. Use Consistency against a reference dataset — not Validity.', 100),
('oil_and_gas', 'station',        'Station',             'consistency', NULL, '{}', 'Station is a location hierarchy value. Use Consistency — not Validity.', 100),
('oil_and_gas', 'cluster',        'Cluster',             'consistency', NULL, '{}', 'Cluster is a grouping hierarchy. Use Consistency against master reference — not Validity.', 100),
('oil_and_gas', 'asset',          'Asset',               'consistency', NULL, '{}', 'Asset is a business hierarchy value. Use Consistency against a master list — not Validity.', 100),
('oil_and_gas', 'country',        'Country',             'consistency', NULL, '{}', 'Country is a geographic hierarchy value. Use Consistency against a reference list — not Validity.', 100),
('oil_and_gas', 'operator',       'Operator',            'consistency', NULL, '{}', 'Operator name is master data. Use Consistency against a reference dataset — not Validity.', 100),
('oil_and_gas', 'contractor',     'Contractor',          'consistency', NULL, '{}', 'Contractor name is master data. Use Consistency — not Validity.', 100),

-- ── PRODUCTION VOLUMES ────────────────────────────────────────
('oil_and_gas', 'bbls',           'Oil Volume (bbls)',        'validity', 'vali_val_pos', '{}',             'Oil production volume must be strictly positive.',                        10),
('oil_and_gas', 'bbl',            'Oil Volume (bbl)',         'validity', 'vali_val_pos', '{}',             'Oil production volume must be strictly positive.',                        10),
('oil_and_gas', 'oil_prod',       'Oil Production',          'validity', 'vali_val_pos', '{}',             'Oil production rate must be strictly positive.',                          10),
('oil_and_gas', 'crude',          'Crude Oil',               'validity', 'vali_val_pos', '{}',             'Crude oil volume must be strictly positive.',                             10),
('oil_and_gas', 'condensate',     'Condensate',              'validity', 'vali_val_pos', '{}',             'Condensate volume must be strictly positive.',                            10),
('oil_and_gas', 'liquid_prod',    'Liquid Production',       'validity', 'vali_val_pos', '{}',             'Liquid production must be strictly positive.',                            10),
('oil_and_gas', 'mcf',            'Gas Volume (mcf)',         'validity', 'vali_val_pos', '{}',             'Gas volume in mcf must be strictly positive.',                            10),
('oil_and_gas', 'mmscf',          'Gas Volume (mmscf)',       'validity', 'vali_val_pos', '{}',             'Gas volume in mmscf must be strictly positive.',                          10),
('oil_and_gas', 'mmscfd',         'Gas Rate (mmscfd)',        'validity', 'vali_val_pos', '{}',             'Gas flow rate must be strictly positive.',                                10),
('oil_and_gas', 'gas_prod',       'Gas Production',          'validity', 'vali_val_pos', '{}',             'Gas production must be strictly positive.',                               10),
('oil_and_gas', 'gas_rate',       'Gas Rate',                'validity', 'vali_val_pos', '{}',             'Gas rate must be strictly positive.',                                     10),
('oil_and_gas', 'gas_vol',        'Gas Volume',              'validity', 'vali_val_pos', '{}',             'Gas volume must be strictly positive.',                                   10),
('oil_and_gas', 'boe',            'BOE',                     'validity', 'vali_val_pos', '{}',             'Barrels of oil equivalent must be strictly positive.',                    10),
('oil_and_gas', 'boepd',          'BOEPD',                   'validity', 'vali_val_pos', '{}',             'Production rate in BOEPD must be strictly positive.',                     10),
('oil_and_gas', 'gross_prod',     'Gross Production',        'validity', 'vali_val_pos', '{}',             'Gross production must be strictly positive.',                             10),
('oil_and_gas', 'net_prod',       'Net Production',          'validity', 'vali_val_pos', '{}',             'Net production must be strictly positive.',                               10),
('oil_and_gas', 'total_prod',     'Total Production',        'validity', 'vali_val_pos', '{}',             'Total production must be strictly positive.',                             10),
('oil_and_gas', 'water_prod',     'Water Production',        'validity', 'vali_val_pos', '{}',             'Water production volume must be strictly positive.',                      10),
('oil_and_gas', 'bwpd',           'BWPD',                    'validity', 'vali_val_pos', '{}',             'Water production rate in BWPD must be strictly positive.',                10),
('oil_and_gas', 'injection_rate', 'Injection Rate',          'validity', 'vali_val_pos', '{}',             'Injection rate must be strictly positive.',                               10),
('oil_and_gas', 'inj_vol',        'Injection Volume',        'validity', 'vali_val_pos', '{}',             'Injection volume must be strictly positive.',                             10),
('oil_and_gas', 'water_inj',      'Water Injection',         'validity', 'vali_val_pos', '{}',             'Water injection volume must be strictly positive.',                       10),

-- ── WATER CUT (percentage) ────────────────────────────────────
('oil_and_gas', 'water_cut',      'Water Cut (%)',           'validity', 'range', '{"minValue":"0","maxValue":"100"}', 'Water cut is a percentage between 0 and 100.',                            20),
('oil_and_gas', 'wc',             'Water Cut (%)',           'validity', 'range', '{"minValue":"0","maxValue":"100"}', 'Water cut percentage must be between 0 and 100.',                         20),
('oil_and_gas', 'bsw',            'BS&W (%)',                'validity', 'range', '{"minValue":"0","maxValue":"100"}', 'Basic sediment and water percentage must be between 0 and 100.',          20),

-- ── RATIOS ────────────────────────────────────────────────────
('oil_and_gas', 'gor',            'GOR',                     'validity', 'vali_val_pos', '{}',             'Gas-oil ratio must be strictly positive.',                                10),
('oil_and_gas', 'wor',            'WOR',                     'validity', 'vali_val_pos', '{}',             'Water-oil ratio must be strictly positive.',                              10),
('oil_and_gas', 'glr',            'GLR',                     'validity', 'vali_val_pos', '{}',             'Gas-liquid ratio must be strictly positive.',                             10),

-- ── PRESSURES ─────────────────────────────────────────────────
('oil_and_gas', 'thp',            'Tubing Head Pressure',    'validity', 'range', '{"minValue":"0","maxValue":"15000"}', 'Tubing head pressure in psi must be between 0 and 15,000.',              20),
('oil_and_gas', 'fthp',           'Flowing THP',             'validity', 'range', '{"minValue":"0","maxValue":"15000"}', 'Flowing tubing head pressure in psi must be between 0 and 15,000.',      20),
('oil_and_gas', 'tubing_pressure','Tubing Pressure',         'validity', 'range', '{"minValue":"0","maxValue":"15000"}', 'Tubing pressure in psi must be between 0 and 15,000.',                   20),
('oil_and_gas', 'wellhead_pressure','Wellhead Pressure',     'validity', 'range', '{"minValue":"0","maxValue":"15000"}', 'Wellhead pressure in psi must be between 0 and 15,000.',                 20),
('oil_and_gas', 'chp',            'Casing Head Pressure',    'validity', 'range', '{"minValue":"0","maxValue":"20000"}', 'Casing head pressure in psi must be between 0 and 20,000.',              20),
('oil_and_gas', 'casing_pressure','Casing Pressure',         'validity', 'range', '{"minValue":"0","maxValue":"20000"}', 'Casing pressure in psi must be between 0 and 20,000.',                   20),
('oil_and_gas', 'bhp',            'Bottomhole Pressure',     'validity', 'range', '{"minValue":"0","maxValue":"25000"}', 'Bottomhole pressure in psi must be between 0 and 25,000.',               20),
('oil_and_gas', 'fbhp',           'Flowing BHP',             'validity', 'range', '{"minValue":"0","maxValue":"25000"}', 'Flowing bottomhole pressure in psi must be between 0 and 25,000.',       20),
('oil_and_gas', 'reservoir_pressure','Reservoir Pressure',   'validity', 'range', '{"minValue":"0","maxValue":"25000"}', 'Reservoir pressure in psi must be between 0 and 25,000.',                20),
('oil_and_gas', 'static_pressure','Static Pressure',         'validity', 'range', '{"minValue":"0","maxValue":"25000"}', 'Static pressure in psi must be between 0 and 25,000.',                   20),

-- ── TEMPERATURES ──────────────────────────────────────────────
('oil_and_gas', 'temp_f',         'Temperature (°F)',        'validity', 'range', '{"minValue":"-50","maxValue":"500"}',  'Temperature in Fahrenheit must be between -50 and 500.',                 20),
('oil_and_gas', 'temperature_f',  'Temperature (°F)',        'validity', 'range', '{"minValue":"-50","maxValue":"500"}',  'Temperature in Fahrenheit must be between -50 and 500.',                 20),
('oil_and_gas', 'degf',           'Temperature (°F)',        'validity', 'range', '{"minValue":"-50","maxValue":"500"}',  'Temperature in Fahrenheit must be between -50 and 500.',                 20),
('oil_and_gas', 'temp_c',         'Temperature (°C)',        'validity', 'range', '{"minValue":"-45","maxValue":"260"}',  'Temperature in Celsius must be between -45 and 260.',                    20),
('oil_and_gas', 'temperature_c',  'Temperature (°C)',        'validity', 'range', '{"minValue":"-45","maxValue":"260"}',  'Temperature in Celsius must be between -45 and 260.',                    20),
('oil_and_gas', 'degc',           'Temperature (°C)',        'validity', 'range', '{"minValue":"-45","maxValue":"260"}',  'Temperature in Celsius must be between -45 and 260.',                    20),
('oil_and_gas', 'bhtemp',         'Bottomhole Temperature',  'validity', 'range', '{"minValue":"50","maxValue":"400"}',   'Bottomhole temperature in °F must be between 50 and 400.',               20),
('oil_and_gas', 'bottomhole_temp','Bottomhole Temperature',  'validity', 'range', '{"minValue":"50","maxValue":"400"}',   'Bottomhole temperature in °F must be between 50 and 400.',               20),
('oil_and_gas', 'reservoir_temp', 'Reservoir Temperature',   'validity', 'range', '{"minValue":"50","maxValue":"400"}',   'Reservoir temperature in °F must be between 50 and 400.',                20),

-- ── DEPTHS ────────────────────────────────────────────────────
('oil_and_gas', 'tvd',            'True Vertical Depth',     'validity', 'vali_val_pos', '{}', 'True vertical depth must be strictly positive.',                           10),
('oil_and_gas', 'md',             'Measured Depth',          'validity', 'vali_val_pos', '{}', 'Measured depth must be strictly positive.',                                10),
('oil_and_gas', 'measured_depth', 'Measured Depth',          'validity', 'vali_val_pos', '{}', 'Measured depth must be strictly positive.',                                10),
('oil_and_gas', 'true_vertical_depth','TVD',                 'validity', 'vali_val_pos', '{}', 'True vertical depth must be strictly positive.',                           10),
('oil_and_gas', 'kb',             'Kelly Bushing Elevation', 'validity', 'vali_val_pos', '{}', 'Kelly bushing elevation must be strictly positive.',                       10),
('oil_and_gas', 'perf_top',       'Perforation Top',         'validity', 'vali_val_pos', '{}', 'Perforation top depth must be strictly positive.',                         10),
('oil_and_gas', 'perf_bot',       'Perforation Bottom',      'validity', 'vali_val_pos', '{}', 'Perforation bottom depth must be strictly positive.',                      10),
('oil_and_gas', 'perforation_top','Perforation Top',         'validity', 'vali_val_pos', '{}', 'Perforation top depth must be strictly positive.',                         10),
('oil_and_gas', 'perforation_bottom','Perforation Bottom',   'validity', 'vali_val_pos', '{}', 'Perforation bottom depth must be strictly positive.',                      10),

-- ── FLUID PROPERTIES ──────────────────────────────────────────
('oil_and_gas', 'api_gravity',    'API Gravity',             'validity', 'range', '{"minValue":"10","maxValue":"70"}',   'API gravity must be between 10 (heavy crude) and 70 (light condensate).', 20),
('oil_and_gas', 'api',            'API Gravity',             'validity', 'range', '{"minValue":"10","maxValue":"70"}',   'API gravity must be between 10 and 70.',                                  20),
('oil_and_gas', 'sg',             'Specific Gravity',        'validity', 'range', '{"minValue":"0.5","maxValue":"2.0"}', 'Specific gravity must be between 0.5 and 2.0.',                           20),
('oil_and_gas', 'specific_gravity','Specific Gravity',       'validity', 'range', '{"minValue":"0.5","maxValue":"2.0"}', 'Specific gravity must be between 0.5 and 2.0.',                           20),
('oil_and_gas', 'viscosity',      'Viscosity',               'validity', 'vali_val_pos', '{}', 'Viscosity must be strictly positive.',                                     10),
('oil_and_gas', 'visc',           'Viscosity',               'validity', 'vali_val_pos', '{}', 'Viscosity must be strictly positive.',                                     10),
('oil_and_gas', 'salinity',       'Salinity',                'validity', 'vali_val_pos', '{}', 'Salinity must be strictly positive.',                                      10),
('oil_and_gas', 'tds',            'Total Dissolved Solids',  'validity', 'vali_val_pos', '{}', 'TDS must be strictly positive.',                                           10),
('oil_and_gas', 'h2s',            'H2S Content (%)',         'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'H2S mole percentage must be between 0 and 100.',                          20),
('oil_and_gas', 'co2',            'CO2 Content (%)',         'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'CO2 mole percentage must be between 0 and 100.',                          20),
('oil_and_gas', 'n2',             'N2 Content (%)',          'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'N2 mole percentage must be between 0 and 100.',                           20),

-- ── PERCENTAGES ───────────────────────────────────────────────
('oil_and_gas', '_pct',           'Percentage Column',       'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Percentage values must be between 0 and 100.',                            5),
('oil_and_gas', '_perc',          'Percentage Column',       'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Percentage values must be between 0 and 100.',                            5),
('oil_and_gas', '_percent',       'Percentage Column',       'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Percentage values must be between 0 and 100.',                            5),
('oil_and_gas', 'efficiency',     'Efficiency (%)',          'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Efficiency percentage must be between 0 and 100.',                        10),
('oil_and_gas', 'recovery',       'Recovery (%)',            'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Recovery factor percentage must be between 0 and 100.',                   10),
('oil_and_gas', 'utilization',    'Utilization (%)',         'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Utilization percentage must be between 0 and 100.',                       10),
('oil_and_gas', 'uptime',         'Uptime (%)',              'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Uptime percentage must be between 0 and 100.',                            10),
('oil_and_gas', 'availability',   'Availability (%)',        'validity', 'range', '{"minValue":"0","maxValue":"100"}',   'Availability percentage must be between 0 and 100.',                      10),

-- ── WELL / FIELD IDENTIFIERS ──────────────────────────────────
('oil_and_gas', 'well_id',        'Well ID',                 'validity', 'pattern', '{"pattern":"^[A-Z0-9\\-_/]+$"}', 'Well ID should contain only uppercase letters, numbers, hyphens, underscores, or slashes.', 10),
('oil_and_gas', 'wellid',         'Well ID',                 'validity', 'pattern', '{"pattern":"^[A-Z0-9\\-_/]+$"}', 'Well ID should contain only uppercase letters, numbers, hyphens, or underscores.',          10),
('oil_and_gas', 'uwi',            'UWI',                     'validity', 'pattern', '{"pattern":"^[A-Z0-9\\-_/]+$"}', 'Unique Well Identifier should follow a structured alphanumeric format.',                    10),
('oil_and_gas', 'api_number',     'API Number',              'validity', 'pattern', '{"pattern":"^[0-9\\-]+$"}',       'API number should contain only digits and hyphens.',                                        10),
('oil_and_gas', 'well_name',      'Well Name',               'validity', 'datatype', '{"dataType":"string"}',          'Well name is a text identifier — validate as non-empty string.',                            5),
('oil_and_gas', 'wellname',       'Well Name',               'validity', 'datatype', '{"dataType":"string"}',          'Well name is a text identifier — validate as non-empty string.',                            5),

-- ── WELL STATUS & OPERATIONAL CODES ──────────────────────────
-- (These use list — actual values come from sample data at runtime)
('oil_and_gas', 'well_status',    'Well Status',             'validity', 'list',    '{}', 'Well status has a fixed set of valid codes — use allowed values list from sample data.',     20),
('oil_and_gas', 'status',         'Status',                  'validity', 'list',    '{}', 'Status field has a fixed set of valid values — use allowed values list from sample data.',   20),
('oil_and_gas', 'on_stream',      'On Stream Status',        'validity', 'list',    '{}', 'On-stream status has fixed valid values — use allowed values list from sample data.',        20),
('oil_and_gas', 'lift_type',      'Artificial Lift Type',    'validity', 'list',    '{}', 'Lift type has a fixed set of valid values (ESP, GL, NF, PCP, etc.).',                        20),
('oil_and_gas', 'artificial_lift','Artificial Lift',         'validity', 'list',    '{}', 'Artificial lift type has a fixed set of valid values.',                                      20),
('oil_and_gas', 'production_status','Production Status',     'validity', 'list',    '{}', 'Production status has a fixed set of valid codes.',                                          20),
('oil_and_gas', 'choke_size',     'Choke Size',              'validity', 'vali_val_pos', '{}', 'Choke size must be strictly positive.',                                                  10),
('oil_and_gas', 'bean_size',      'Bean Size',               'validity', 'vali_val_pos', '{}', 'Bean size must be strictly positive.',                                                   10),

-- ── DATES ─────────────────────────────────────────────────────
('oil_and_gas', 'date',           'Date',                    'validity', 'datatype', '{"dataType":"date"}', 'Date column should contain valid date values.',               10),
('oil_and_gas', 'spud_date',      'Spud Date',               'validity', 'datatype', '{"dataType":"date"}', 'Spud date must be a valid date.',                            10),
('oil_and_gas', 'on_prod_date',   'On Production Date',      'validity', 'datatype', '{"dataType":"date"}', 'On-production date must be a valid date.',                   10),
('oil_and_gas', 'completion_date','Completion Date',         'validity', 'datatype', '{"dataType":"date"}', 'Completion date must be a valid date.',                      10),
('oil_and_gas', 'report_date',    'Report Date',             'validity', 'datatype', '{"dataType":"date"}', 'Report date must be a valid date.',                          10),
('oil_and_gas', 'prod_date',      'Production Date',         'validity', 'datatype', '{"dataType":"date"}', 'Production date must be a valid date.',                      10),
('oil_and_gas', 'year',           'Year',                    'validity', 'range',   '{"minValue":"1900","maxValue":"2100"}', 'Year must be between 1900 and 2100.',        10),
('oil_and_gas', 'month',          'Month',                   'validity', 'range',   '{"minValue":"1","maxValue":"12"}',     'Month must be between 1 and 12.',             10),
('oil_and_gas', 'day',            'Day',                     'validity', 'range',   '{"minValue":"1","maxValue":"31"}',     'Day must be between 1 and 31.',               10),

-- ── DATETIME COLUMNS ─────────────────────────────────────────
('oil_and_gas', 'daytime',        'Datetime',                'validity', 'datatype', '{"dataType":"date"}', 'Daytime column contains datetime values — validate as date type.',          20),
('oil_and_gas', 'datetime',       'Datetime',                'validity', 'datatype', '{"dataType":"date"}', 'Datetime column — validate as date type.',                                  20),
('oil_and_gas', 'timestamp',      'Timestamp',               'validity', 'datatype', '{"dataType":"date"}', 'Timestamp column — validate as date type.',                                 20),
('oil_and_gas', 'time',           'Time',                    'validity', 'datatype', '{"dataType":"date"}', 'Time column — validate as date type.',                                      20),
('oil_and_gas', 'created_at',     'Created At',              'validity', 'datatype', '{"dataType":"date"}', 'Created at timestamp — validate as date type.',                             20),
('oil_and_gas', 'updated_at',     'Updated At',              'validity', 'datatype', '{"dataType":"date"}', 'Updated at timestamp — validate as date type.',                             20),

-- ── COUNTS & INDICES ──────────────────────────────────────────
('oil_and_gas', 'well_count',     'Well Count',              'validity', 'vali_val_pos', '{}', 'Well count must be strictly positive.',           10),
('oil_and_gas', 'num_wells',      'Number of Wells',         'validity', 'vali_val_pos', '{}', 'Number of wells must be strictly positive.',      10),
('oil_and_gas', 'perforations',   'Perforation Count',       'validity', 'vali_val_pos', '{}', 'Perforation count must be strictly positive.',    10),
('oil_and_gas', 'row_number',     'Row Number',              'validity', 'vali_val_pos', '{}', 'Row number index must be strictly positive.',     10),
('oil_and_gas', 'seq',            'Sequence',                'validity', 'vali_val_pos', '{}', 'Sequence number must be strictly positive.',      10);
