-- Gamification tables for RankFin
CREATE TABLE IF NOT EXISTS rankfin_badges (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  criteria TEXT NOT NULL,
  description TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS rankfin_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 1000),
  tier TEXT CHECK (tier IN ('gold', 'silver', 'bronze')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rankfin_challenges (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  period DATE NOT NULL,
  winner_region_id UUID REFERENCES regions(id),
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rankfin_earned_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  badge_id INTEGER REFERENCES rankfin_badges(id),
  period DATE NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(region_id, badge_id, period)
);

CREATE TABLE IF NOT EXISTS rankfin_hall_of_fame (
  id SERIAL PRIMARY KEY,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  rank INTEGER NOT NULL,
  score NUMERIC(5,2) NOT NULL,
  tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rankfin_scores_period_idx ON rankfin_scores(period);
CREATE INDEX IF NOT EXISTS rankfin_scores_region_period_idx ON rankfin_scores(region_id, period);
CREATE INDEX IF NOT EXISTS rankfin_earned_badges_region_period_idx ON rankfin_earned_badges(region_id, period);
CREATE INDEX IF NOT EXISTS rankfin_hall_of_fame_period_idx ON rankfin_hall_of_fame(period);