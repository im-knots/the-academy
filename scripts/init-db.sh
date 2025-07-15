#!/bin/bash
# scripts/init-db.sh

set -e

echo "Starting database initialization..."

# Create additional extensions if needed
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable UUID extension
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Enable pg_trgm for text search
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    
    -- Create read-only user for analytics (optional)
    CREATE USER academy_readonly WITH PASSWORD 'readonly_password';
    GRANT CONNECT ON DATABASE academy_db TO academy_readonly;
    GRANT USAGE ON SCHEMA public TO academy_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO academy_readonly;
    
    -- Create application user with proper permissions
    CREATE USER academy_app WITH PASSWORD 'app_password';
    GRANT CONNECT ON DATABASE academy_db TO academy_app;
    GRANT USAGE ON SCHEMA public TO academy_app;
    GRANT CREATE ON SCHEMA public TO academy_app;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO academy_app;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO academy_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO academy_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO academy_app;
    
    -- Add comment to database
    COMMENT ON DATABASE academy_db IS 'Academy AI Chat Platform Database';
EOSQL

echo "Database initialization completed!"