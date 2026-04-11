-- ==========================================
-- JULYAI / NEUROBLOCKS FINAL INITIALIZATION
-- ==========================================

-- 1. Create Playgrounds Table (Canvas State)
CREATE TABLE IF NOT EXISTS public.playgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled',
  graph_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Trained Models Table (Weights & Metadata)
CREATE TABLE IF NOT EXISTS public.trained_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  playground_id UUID NOT NULL REFERENCES public.playgrounds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  model_storage_path TEXT NOT NULL,
  model_size_bytes INT,
  graph_json JSONB NOT NULL,
  training_config JSONB NOT NULL,
  final_loss FLOAT,
  final_accuracy FLOAT,
  metrics_history JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create User Histories Table (AI Chat)
CREATE TABLE IF NOT EXISTS public.user_histories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  playground_id UUID NOT NULL REFERENCES public.playgrounds(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Levels Table (Challenges & Papers)
CREATE TABLE IF NOT EXISTS public.levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_number INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  task TEXT,
  graph_json JSONB NOT NULL,
  solution_graph_json JSONB,
  section TEXT DEFAULT 'challenges',
  paper_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Level Completions Table (Progress)
CREATE TABLE IF NOT EXISTS public.level_completions (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL REFERENCES public.levels(level_number) ON DELETE CASCADE,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, level_number)
);

-- 6. Create Paper Progress Table (Walkthrough steps)
CREATE TABLE IF NOT EXISTS public.paper_progress (
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  level_number INTEGER NOT NULL REFERENCES public.levels(level_number) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (user_id, level_number)
);

-- 7. Create Datasets Table (Custom Uploads)
CREATE TABLE IF NOT EXISTS public.datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL, -- 'csv' or 'image_zip'
  storage_path TEXT NOT NULL,
  input_shape JSONB NOT NULL,
  num_classes INTEGER NOT NULL,
  num_samples INTEGER DEFAULT 0,
  file_size_bytes BIGINT,
  class_names JSONB,
  label_column TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.playgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trained_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_progress ENABLE ROW LEVEL SECURITY;

-- 1. Playgrounds Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own playgrounds" ON public.playgrounds
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Trained Models Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own trained models" ON public.trained_models
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. User Histories Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own histories" ON public.user_histories
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Levels Policy (Public View)
DO $$ BEGIN
  CREATE POLICY "Levels are viewable by everyone" ON public.levels
    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Level Completions Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own completions" ON public.level_completions
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Paper Progress Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own paper progress" ON public.paper_progress
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7. Datasets Policy
DO $$ BEGIN
  CREATE POLICY "Users can manage their own datasets" ON public.datasets
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- INDEXES
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_playgrounds_user_id ON public.playgrounds(user_id);
CREATE INDEX IF NOT EXISTS idx_trained_models_user_id ON public.trained_models(user_id);
CREATE INDEX IF NOT EXISTS idx_trained_models_playground_id ON public.trained_models(playground_id);
CREATE INDEX IF NOT EXISTS idx_user_histories_user_id ON public.user_histories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_histories_playground_id ON public.user_histories(playground_id);
CREATE INDEX IF NOT EXISTS idx_levels_number ON public.levels(level_number);
CREATE INDEX IF NOT EXISTS idx_datasets_user_id ON public.datasets(user_id);

-- Confirm Tables (optional check)
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
