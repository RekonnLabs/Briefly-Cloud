export type AppFile = {
  id: string;
  owner_id: string;
  name: string;
  path: string;
  size_bytes: number;
  mime_type: string | null;
  checksum: string | null;
  created_at: string;
};

export type AppChunk = {
  id: number;
  file_id: string;
  owner_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number | null;
  created_at: string;
};
