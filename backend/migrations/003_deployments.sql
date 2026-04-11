-- Deployments table for JulyAI model deployment
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS deployments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  playground_id UUID,
  model_id UUID,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stopped', 'error')),
  graph_json JSONB NOT NULL,
  model_state_dict_b64 TEXT,
  input_shape JSONB,
  num_classes INTEGER DEFAULT 10,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own deployments"
  ON deployments FOR ALL USING (auth.uid() = user_id);

-- Allow service role full access (for backend)
CREATE POLICY "Service role full access"
  ON deployments FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deployments_api_key ON deployments(api_key);
CREATE INDEX IF NOT EXISTS idx_deployments_user_id ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
