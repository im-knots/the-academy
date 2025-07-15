-- migrations/0001_initial_schema.sql

-- Create custom types
CREATE TYPE session_status AS ENUM ('active', 'inactive', 'paused', 'completed');
CREATE TYPE participant_status AS ENUM ('active', 'inactive', 'typing', 'thinking');
CREATE TYPE experiment_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed', 'stopped');
CREATE TYPE experiment_run_status AS ENUM ('running', 'paused', 'completed', 'failed', 'stopped');

-- Create sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status session_status NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}',
    moderator_settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_status_idx ON sessions(status);
CREATE INDEX sessions_updated_at_idx ON sessions(updated_at);

-- Create participants table
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    status participant_status NOT NULL DEFAULT 'active',
    message_count INTEGER NOT NULL DEFAULT 0,
    settings JSONB NOT NULL DEFAULT '{}',
    characteristics JSONB NOT NULL DEFAULT '{}',
    system_prompt TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    color TEXT,
    last_active TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX participants_session_id_idx ON participants(session_id);

-- Create messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    participant_name TEXT NOT NULL,
    participant_type TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_session_id_idx ON messages(session_id);
CREATE INDEX messages_timestamp_idx ON messages(timestamp);

-- Create analysis_snapshots table
CREATE TABLE analysis_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    analysis JSONB NOT NULL,
    analysis_type TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX analysis_snapshots_session_id_idx ON analysis_snapshots(session_id);
CREATE INDEX analysis_snapshots_timestamp_idx ON analysis_snapshots(timestamp);

-- Create experiments table
CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    config JSONB NOT NULL,
    status experiment_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX experiments_status_idx ON experiments(status);

-- Create experiment_runs table
CREATE TABLE experiment_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    status experiment_run_status NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL,
    completed_sessions INTEGER NOT NULL DEFAULT 0,
    failed_sessions INTEGER NOT NULL DEFAULT 0,
    average_message_count INTEGER NOT NULL DEFAULT 0,
    results JSONB NOT NULL DEFAULT '{}',
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX experiment_runs_experiment_id_idx ON experiment_runs(experiment_id);
CREATE INDEX experiment_runs_status_idx ON experiment_runs(status);

-- Create api_errors table
CREATE TABLE api_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    max_attempts INTEGER NOT NULL,
    error TEXT NOT NULL,
    session_id TEXT,
    participant_id TEXT
);

CREATE INDEX api_errors_timestamp_idx ON api_errors(timestamp);
CREATE INDEX api_errors_session_id_idx ON api_errors(session_id);
CREATE INDEX api_errors_provider_idx ON api_errors(provider);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_experiments_updated_at BEFORE UPDATE ON experiments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();