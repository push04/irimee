-- VBHSR-SIM Supabase schema
-- Run once against the project: nlxfzqkfvelzfvtquaoh
-- Source: lib/supabase.ts SCHEMA_SQL

-- Field data inspections
CREATE TABLE IF NOT EXISTS inspections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  location        TEXT CHECK (location IN ('jheel','rncc')),
  train_type      TEXT CHECK (train_type IN ('vb_sleeper','vb_chair')),
  coach_number    TEXT,
  ambient_temp_c  REAL,
  weather         TEXT,
  inspector_name  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Wheelset measurements (one row per wheelset per inspection)
CREATE TABLE IF NOT EXISTS wheelset_measurements (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id               UUID REFERENCES inspections(id) ON DELETE CASCADE,
  wheelset_id                 TEXT NOT NULL,
  wheel_diameter_left_mm      REAL,
  wheel_diameter_right_mm     REAL,
  flange_height_left_mm       REAL,
  flange_height_right_mm      REAL,
  flange_thickness_left_mm    REAL,
  flange_thickness_right_mm   REAL,
  tread_hollow_left_mm        REAL,
  tread_hollow_right_mm       REAL,
  back_to_back_mm             REAL,
  axle_box_clearance_left_mm  REAL,
  axle_box_clearance_right_mm REAL
);

-- Bogie frame measurements
CREATE TABLE IF NOT EXISTS bogie_measurements (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id                   UUID REFERENCES inspections(id) ON DELETE CASCADE,
  bogie_id                        TEXT NOT NULL,
  wheelbase_mm                    REAL,
  air_spring_pressure_left_bar    REAL,
  air_spring_pressure_right_bar   REAL,
  air_spring_height_fl_mm         REAL,
  air_spring_height_fr_mm         REAL,
  air_spring_height_rl_mm         REAL,
  air_spring_height_rr_mm         REAL,
  primary_spring_height_fl_mm     REAL,
  primary_spring_height_fr_mm     REAL,
  damper_condition                TEXT,
  cracks                          JSONB DEFAULT '[]'
);

-- Brake disc measurements
CREATE TABLE IF NOT EXISTS brake_disc_measurements (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id           UUID REFERENCES inspections(id) ON DELETE CASCADE,
  disc_id                 TEXT NOT NULL,
  outer_diameter_mm       REAL,
  thickness_12pt_mm       REAL[],
  thermal_crack_count     INT,
  max_crack_length_mm     REAL,
  pad_thickness_mm        REAL,
  thermal_discoloration   BOOLEAN
);

-- Traction + aero + pantograph stored as JSONB blobs per inspection
CREATE TABLE IF NOT EXISTS inspection_blobs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id               UUID REFERENCES inspections(id) ON DELETE CASCADE UNIQUE,
  aerodynamic_measurements    JSONB,
  pantograph_measurements     JSONB,
  traction_measurements       JSONB,
  coupler_height_mm           REAL,
  track_gauge_actual_mm       REAL
);

-- Physics simulation results cache
CREATE TABLE IF NOT EXISTS physics_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id   UUID REFERENCES inspections(id) ON DELETE CASCADE,
  params          JSONB NOT NULL,
  results         JSONB NOT NULL,
  computed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- AI analysis cache
CREATE TABLE IF NOT EXISTS ai_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id   UUID REFERENCES inspections(id) ON DELETE CASCADE,
  analysis        JSONB NOT NULL,
  model           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Row level security
ALTER TABLE inspections              ENABLE ROW LEVEL SECURITY;
ALTER TABLE wheelset_measurements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bogie_measurements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brake_disc_measurements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_blobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE physics_results          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses              ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "allow_all" ON inspections             FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON wheelset_measurements   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON bogie_measurements      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON brake_disc_measurements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON inspection_blobs        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON physics_results         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "allow_all" ON ai_analyses             FOR ALL USING (true) WITH CHECK (true);
