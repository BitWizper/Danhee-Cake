-- ============================================================
--  DANHEE RAG - Índices para optimización de queries
-- ============================================================

USE danhee_db;

-- Índices para chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client_id ON chat_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_conversation_id ON chat_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at);

-- Índices para chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Índices para cakes
CREATE INDEX IF NOT EXISTS idx_cakes_baker_id ON cakes(baker_id);
CREATE INDEX IF NOT EXISTS idx_cakes_category_id ON cakes(category_id);
CREATE INDEX IF NOT EXISTS idx_cakes_is_featured ON cakes(is_featured);
CREATE INDEX IF NOT EXISTS idx_cakes_created_at ON cakes(created_at);

-- Índices para baker_profiles
CREATE INDEX IF NOT EXISTS idx_baker_profiles_user_id ON baker_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_baker_profiles_is_verified ON baker_profiles(is_verified);
CREATE INDEX IF NOT EXISTS idx_baker_profiles_rating_avg ON baker_profiles(rating_avg);

-- Índices para appointments
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_baker_id ON appointments(baker_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_baker_date ON appointments(baker_id, date);

-- Índices para cake_designs
CREATE INDEX IF NOT EXISTS idx_cake_designs_client_id ON cake_designs(client_id);
CREATE INDEX IF NOT EXISTS idx_cake_designs_status ON cake_designs(status);

-- Índices para users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Índices para categories
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);

-- Índices para observability_logs
CREATE INDEX IF NOT EXISTS idx_observability_session_id ON observability_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_observability_timestamp ON observability_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_observability_was_blocked ON observability_logs(was_blocked);

-- Índices para refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked ON refresh_tokens(revoked);

-- ============================================================
--  Verificación de índices creados
-- ============================================================
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'danhee_db'
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;
