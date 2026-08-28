-- report_templates table: stores WYSIWYG report configurations
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  layout_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  branding_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one default template exists (optional but good practice, can use a partial index)
CREATE UNIQUE INDEX IF NOT EXISTS report_templates_default_idx ON report_templates(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS report_templates_created_at_idx ON report_templates(created_at DESC);

-- Add template_id to report_jobs so jobs know which template to render
ALTER TABLE report_jobs ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL;
