-- Fix users table - Add missing columns
-- Run this in Supabase SQL Editor

-- Add missing columns to existing users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'pro_byok'));

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS api_key_hash TEXT;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS usage_stats JSONB DEFAULT '{}';

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Usage tracking columns
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS documents_uploaded INTEGER DEFAULT 0;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS documents_limit INTEGER DEFAULT 10;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS chat_messages_count INTEGER DEFAULT 0;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS chat_messages_limit INTEGER DEFAULT 100;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS api_calls_count INTEGER DEFAULT 0;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS api_calls_limit INTEGER DEFAULT 1000;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS storage_used_bytes BIGINT DEFAULT 0;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT DEFAULT 104857600; -- 100MB default

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS usage_reset_date TIMESTAMP WITH TIME ZONE DEFAULT DATE_TRUNC('month', NOW() + INTERVAL '1 month');

-- Billing and subscription tracking
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'unpaid'));

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days';

-- Feature flags and permissions
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS features_enabled JSONB DEFAULT '{"cloud_storage": true, "ai_chat": true, "document_upload": true}';

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"can_upload": true, "can_chat": true, "can_export": false}';

-- Update existing users to have default values
UPDATE public.users 
SET subscription_tier = 'free' 
WHERE subscription_tier IS NULL;

UPDATE public.users 
SET usage_stats = '{}' 
WHERE usage_stats IS NULL;

UPDATE public.users 
SET preferences = '{}' 
WHERE preferences IS NULL;

UPDATE public.users 
SET created_at = NOW() 
WHERE created_at IS NULL;

UPDATE public.users 
SET updated_at = NOW() 
WHERE updated_at IS NULL;

-- Update usage tracking defaults for existing users
UPDATE public.users 
SET documents_uploaded = 0 
WHERE documents_uploaded IS NULL;

UPDATE public.users 
SET documents_limit = CASE 
    WHEN subscription_tier = 'free' THEN 10
    WHEN subscription_tier = 'pro' THEN 1000
    WHEN subscription_tier = 'pro_byok' THEN 10000
    ELSE 10
END
WHERE documents_limit IS NULL OR documents_limit = 10;

UPDATE public.users 
SET chat_messages_limit = CASE 
    WHEN subscription_tier = 'free' THEN 100
    WHEN subscription_tier = 'pro' THEN 1000
    WHEN subscription_tier = 'pro_byok' THEN 5000
    ELSE 100
END
WHERE chat_messages_limit IS NULL OR chat_messages_limit = 100;

UPDATE public.users 
SET api_calls_limit = CASE 
    WHEN subscription_tier = 'free' THEN 1000
    WHEN subscription_tier = 'pro' THEN 10000
    WHEN subscription_tier = 'pro_byok' THEN 50000
    ELSE 1000
END
WHERE api_calls_limit IS NULL OR api_calls_limit = 1000;

UPDATE public.users 
SET storage_limit_bytes = CASE 
    WHEN subscription_tier = 'free' THEN 104857600  -- 100MB
    WHEN subscription_tier = 'pro' THEN 10737418240  -- 10GB
    WHEN subscription_tier = 'pro_byok' THEN 107374182400  -- 100GB
    ELSE 104857600
END
WHERE storage_limit_bytes IS NULL OR storage_limit_bytes = 104857600;

UPDATE public.users 
SET last_active_at = NOW() 
WHERE last_active_at IS NULL;

UPDATE public.users 
SET usage_reset_date = DATE_TRUNC('month', NOW() + INTERVAL '1 month')
WHERE usage_reset_date IS NULL;

UPDATE public.users 
SET subscription_status = 'active' 
WHERE subscription_status IS NULL;

UPDATE public.users 
SET trial_end_date = NOW() + INTERVAL '7 days'
WHERE trial_end_date IS NULL;

UPDATE public.users 
SET features_enabled = '{"cloud_storage": true, "ai_chat": true, "document_upload": true}'
WHERE features_enabled IS NULL;

UPDATE public.users 
SET permissions = '{"can_upload": true, "can_chat": true, "can_export": false}'
WHERE permissions IS NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON public.users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_last_active ON public.users(last_active_at);
CREATE INDEX IF NOT EXISTS idx_users_usage_reset ON public.users(usage_reset_date);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON public.users(stripe_customer_id);

-- Create a function to reset monthly usage
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
    UPDATE public.users 
    SET 
        chat_messages_count = 0,
        api_calls_count = 0,
        usage_reset_date = DATE_TRUNC('month', NOW() + INTERVAL '1 month'),
        updated_at = NOW()
    WHERE usage_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql;

-- Create a function to update user limits based on subscription tier
CREATE OR REPLACE FUNCTION update_subscription_limits(user_id UUID, new_tier TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.users 
    SET 
        subscription_tier = new_tier,
        documents_limit = CASE 
            WHEN new_tier = 'free' THEN 10
            WHEN new_tier = 'pro' THEN 1000
            WHEN new_tier = 'pro_byok' THEN 10000
            ELSE documents_limit
        END,
        chat_messages_limit = CASE 
            WHEN new_tier = 'free' THEN 100
            WHEN new_tier = 'pro' THEN 1000
            WHEN new_tier = 'pro_byok' THEN 5000
            ELSE chat_messages_limit
        END,
        api_calls_limit = CASE 
            WHEN new_tier = 'free' THEN 1000
            WHEN new_tier = 'pro' THEN 10000
            WHEN new_tier = 'pro_byok' THEN 50000
            ELSE api_calls_limit
        END,
        storage_limit_bytes = CASE 
            WHEN new_tier = 'free' THEN 104857600  -- 100MB
            WHEN new_tier = 'pro' THEN 10737418240  -- 10GB
            WHEN new_tier = 'pro_byok' THEN 107374182400  -- 100GB
            ELSE storage_limit_bytes
        END,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Create usage_events table for detailed tracking
CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('document_upload', 'chat_message', 'api_call', 'login', 'logout', 'subscription_change')),
    event_data JSONB DEFAULT '{}',
    resource_consumed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for usage_events
CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON public.usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_type ON public.usage_events(event_type);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON public.usage_events(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_user_type ON public.usage_events(user_id, event_type);

-- Create a view for user usage summary
CREATE OR REPLACE VIEW public.user_usage_summary AS
SELECT 
    u.id,
    u.email,
    u.subscription_tier,
    u.subscription_status,
    u.documents_uploaded,
    u.documents_limit,
    ROUND((u.documents_uploaded::FLOAT / u.documents_limit::FLOAT) * 100, 2) as documents_usage_percent,
    u.chat_messages_count,
    u.chat_messages_limit,
    ROUND((u.chat_messages_count::FLOAT / u.chat_messages_limit::FLOAT) * 100, 2) as chat_usage_percent,
    u.api_calls_count,
    u.api_calls_limit,
    ROUND((u.api_calls_count::FLOAT / u.api_calls_limit::FLOAT) * 100, 2) as api_usage_percent,
    u.storage_used_bytes,
    u.storage_limit_bytes,
    ROUND((u.storage_used_bytes::FLOAT / u.storage_limit_bytes::FLOAT) * 100, 2) as storage_usage_percent,
    u.last_active_at,
    u.usage_reset_date,
    u.trial_end_date,
    CASE 
        WHEN u.trial_end_date > NOW() THEN 'trial'
        WHEN u.subscription_status = 'active' THEN 'active'
        ELSE 'inactive'
    END as account_status
FROM public.users u;

-- Create a view for usage analytics
CREATE OR REPLACE VIEW public.usage_analytics AS
SELECT 
    DATE_TRUNC('day', ue.created_at) as date,
    ue.event_type,
    u.subscription_tier,
    COUNT(*) as event_count,
    COUNT(DISTINCT ue.user_id) as unique_users,
    SUM(ue.resource_consumed) as total_resources
FROM public.usage_events ue
JOIN public.users u ON ue.user_id = u.id
GROUP BY DATE_TRUNC('day', ue.created_at), ue.event_type, u.subscription_tier
ORDER BY date DESC, event_type;

-- Function to increment usage counters
CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id UUID,
    p_event_type TEXT,
    p_resource_count INTEGER DEFAULT 1,
    p_event_data JSONB DEFAULT '{}'
)
RETURNS BOOLEAN AS $$
DECLARE
    current_count INTEGER;
    limit_count INTEGER;
    storage_used BIGINT;
    storage_limit BIGINT;
BEGIN
    -- Log the usage event
    INSERT INTO public.usage_events (user_id, event_type, resource_consumed, event_data)
    VALUES (p_user_id, p_event_type, p_resource_count, p_event_data);
    
    -- Update counters based on event type
    CASE p_event_type
        WHEN 'document_upload' THEN
            UPDATE public.users 
            SET 
                documents_uploaded = documents_uploaded + p_resource_count,
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = p_user_id;
            
        WHEN 'chat_message' THEN
            UPDATE public.users 
            SET 
                chat_messages_count = chat_messages_count + p_resource_count,
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = p_user_id;
            
        WHEN 'api_call' THEN
            UPDATE public.users 
            SET 
                api_calls_count = api_calls_count + p_resource_count,
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = p_user_id;
            
        ELSE
            UPDATE public.users 
            SET 
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = p_user_id;
    END CASE;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has exceeded limits
CREATE OR REPLACE FUNCTION check_usage_limits(p_user_id UUID, p_event_type TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    user_record RECORD;
    within_limits BOOLEAN := TRUE;
BEGIN
    SELECT * INTO user_record FROM public.users WHERE id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Check limits based on event type
    CASE p_event_type
        WHEN 'document_upload' THEN
            within_limits := user_record.documents_uploaded < user_record.documents_limit;
        WHEN 'chat_message' THEN
            within_limits := user_record.chat_messages_count < user_record.chat_messages_limit;
        WHEN 'api_call' THEN
            within_limits := user_record.api_calls_count < user_record.api_calls_limit;
        ELSE
            within_limits := TRUE;
    END CASE;
    
    RETURN within_limits;
END;
$$ LANGUAGE plpgsql;

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Show usage tracking tables
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'usage_events')
ORDER BY table_name;-- Cr
eate additional tables needed by the application

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Create job_logs table
CREATE TABLE IF NOT EXISTS public.job_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create oauth_tokens table
CREATE TABLE IF NOT EXISTS public.oauth_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    scope TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Create user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, key)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON public.conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_user_id ON public.job_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON public.job_logs(status);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_provider ON public.oauth_tokens(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_key ON public.user_settings(user_id, key);

-- Show all created tables
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'usage_events', 'conversations', 'messages', 'job_logs', 'oauth_tokens', 'user_settings')
ORDER BY table_name;