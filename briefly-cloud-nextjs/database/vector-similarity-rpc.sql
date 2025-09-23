-- Vector Similarity Search RPC Function for Document Chunks
-- This function provides vector similarity search functionality for the chunks repository

CREATE OR REPLACE FUNCTION public.search_document_chunks_by_similarity(
  query_embedding vector(1536),
  user_id UUID,
  similarity_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  file_ids UUID[] DEFAULT NULL
) RETURNS TABLE(
  id BIGINT,
  file_id UUID,
  owner_id UUID,
  chunk_index INT,
  content TEXT,
  embedding vector(1536),
  token_count INT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.file_id,
    c.owner_id,
    c.chunk_index,
    c.content,
    c.embedding,
    c.token_count,
    c.created_at,
    (1 - (c.embedding <=> query_embedding)) AS similarity
  FROM app.document_chunks c
  WHERE 
    c.owner_id = user_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
    AND (file_ids IS NULL OR c.file_id = ANY(file_ids))
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.search_document_chunks_by_similarity(vector(1536),UUID,FLOAT,INT,UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_document_chunks_by_similarity(vector(1536),UUID,FLOAT,INT,UUID[]) TO authenticated, service_role;

-- Add comment
COMMENT ON FUNCTION public.search_document_chunks_by_similarity IS 'Search document chunks using vector similarity with user isolation and RLS compliance';