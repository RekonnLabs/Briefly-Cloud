import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { logger } from './logger'
import { cacheManager } from './cache'

// Migration schemas for data validation
export const UserMigrationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  subscription_tier: z.enum(['free', 'pro', 'pro_byok']).default('free'),
  subscription_status: z.enum(['active', 'canceled', 'past_due', 'trialing']).default('active'),
  stripe_customer_id: z.string().optional(),
  usage_documents: z.number().default(0),
  usage_chat_messages: z.number().default(0),
  usage_api_calls: z.number().default(0),
  settings: z.record(z.any()).optional(),
})

export const FileMetadataMigrationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  filename: z.string(),
  file_size: z.number(),
  file_type: z.string(),
  upload_date: z.string().datetime(),
  processing_status: z.enum(['pending', 'processing', 'completed', 'failed']),
  chunk_count: z.number().default(0),
  embedding_count: z.number().default(0),
  storage_path: z.string(),
  metadata: z.record(z.any()).optional(),
})

export const DocumentChunkMigrationSchema = z.object({
  id: z.string().uuid(),
  file_id: z.string().uuid(),
  user_id: z.string().uuid(),
  chunk_text: z.string(),
  chunk_index: z.number(),
  embedding_id: z.string().optional(),
  created_at: z.string().datetime(),
})

export const ConversationMigrationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  message_count: z.number().default(0),
})

export const ChatMessageMigrationSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  sources: z.array(z.string()).optional(),
  created_at: z.string().datetime(),
})

export const OAuthTokenMigrationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: z.enum(['google', 'microsoft']),
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const UsageLogMigrationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  created_at: z.string().datetime(),
})

// Migration status tracking
export interface MigrationStatus {
  id: string
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back'
  started_at: string
  completed_at?: string
  error?: string
  records_processed: number
  records_total: number
  backup_created: boolean
  rollback_available: boolean
}

// Migration configuration
export interface MigrationConfig {
  batchSize: number
  maxRetries: number
  retryDelay: number
  validateData: boolean
  createBackup: boolean
  dryRun: boolean
}

export class DataMigrationManager {
  private supabase: any
  private config: MigrationConfig

  constructor(supabaseUrl: string, supabaseKey: string, config: Partial<MigrationConfig> = {}) {
    this.supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: 'app' } })
    this.config = {
      batchSize: 100,
      maxRetries: 3,
      retryDelay: 1000,
      validateData: true,
      createBackup: true,
      dryRun: false,
      ...config,
    }
  }

  // Create backup of existing data
  async createBackup(): Promise<string> {
    const backupId = `backup_${Date.now()}`
    
    try {
      logger.info('Creating data backup', { backupId })
      
      const tables = [
        'users',
        'file_metadata', 
        'document_chunks',
        'conversations',
        'chat_messages',
        'oauth_tokens',
        'usage_logs',
        'user_settings'
      ]

      const backup: Record<string, any[]> = {}
      
      for (const table of tables) {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
        
        if (error) {
          throw new Error(`Failed to backup ${table}: ${error.message}`)
        }
        
        backup[table] = data || []
        logger.info(`Backed up ${data?.length || 0} records from ${table}`)
      }

      // Store backup in cache for quick access
      cacheManager.set(`backup:${backupId}`, backup, 1000 * 60 * 60 * 24) // 24 hours
      
      logger.info('Backup completed successfully', { backupId, recordCount: Object.values(backup).flat().length })
      return backupId
      
    } catch (error) {
      logger.error('Backup creation failed', { error, backupId })
      throw error
    }
  }

  // Validate data integrity
  async validateData(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    try {
      logger.info('Starting data validation')
      
      // Validate users
      const { data: users, error: usersError } = await this.supabase
        .from('users')
        .select('*')
      
      if (usersError) {
        errors.push(`Users table error: ${usersError.message}`)
      } else {
        for (const user of users || []) {
          try {
            UserMigrationSchema.parse(user)
          } catch (error) {
            errors.push(`Invalid user data for ${user.id}: ${error}`)
          }
        }
      }

      // Validate file metadata
      const { data: files, error: filesError } = await this.supabase
        .from('file_metadata')
        .select('*')
      
      if (filesError) {
        errors.push(`File metadata table error: ${filesError.message}`)
      } else {
        for (const file of files || []) {
          try {
            FileMetadataMigrationSchema.parse(file)
          } catch (error) {
            errors.push(`Invalid file metadata for ${file.id}: ${error}`)
          }
        }
      }

      // Validate document chunks
      const { data: chunks, error: chunksError } = await this.supabase
        .from('document_chunks')
        .select('*')
      
      if (chunksError) {
        errors.push(`Document chunks table error: ${chunksError.message}`)
      } else {
        for (const chunk of chunks || []) {
          try {
            DocumentChunkMigrationSchema.parse(chunk)
          } catch (error) {
            errors.push(`Invalid document chunk for ${chunk.id}: ${error}`)
          }
        }
      }

      // Validate conversations
      const { data: conversations, error: conversationsError } = await this.supabase
        .from('conversations')
        .select('*')
      
      if (conversationsError) {
        errors.push(`Conversations table error: ${conversationsError.message}`)
      } else {
        for (const conversation of conversations || []) {
          try {
            ConversationMigrationSchema.parse(conversation)
          } catch (error) {
            errors.push(`Invalid conversation for ${conversation.id}: ${error}`)
          }
        }
      }

      // Validate chat messages
      const { data: messages, error: messagesError } = await this.supabase
        .from('chat_messages')
        .select('*')
      
      if (messagesError) {
        errors.push(`Chat messages table error: ${messagesError.message}`)
      } else {
        for (const message of messages || []) {
          try {
            ChatMessageMigrationSchema.parse(message)
          } catch (error) {
            errors.push(`Invalid chat message for ${message.id}: ${error}`)
          }
        }
      }

      // Validate OAuth tokens
      const { data: tokens, error: tokensError } = await this.supabase
        .from('oauth_tokens')
        .select('*')
      
      if (tokensError) {
        errors.push(`OAuth tokens table error: ${tokensError.message}`)
      } else {
        for (const token of tokens || []) {
          try {
            OAuthTokenMigrationSchema.parse(token)
          } catch (error) {
            errors.push(`Invalid OAuth token for ${token.id}: ${error}`)
          }
        }
      }

      // Validate usage logs
      const { data: logs, error: logsError } = await this.supabase
        .from('usage_logs')
        .select('*')
      
      if (logsError) {
        errors.push(`Usage logs table error: ${logsError.message}`)
      } else {
        for (const log of logs || []) {
          try {
            UsageLogMigrationSchema.parse(log)
          } catch (error) {
            errors.push(`Invalid usage log for ${log.id}: ${error}`)
          }
        }
      }

      logger.info('Data validation completed', { 
        valid: errors.length === 0, 
        errorCount: errors.length 
      })
      
      return { valid: errors.length === 0, errors }
      
    } catch (error) {
      logger.error('Data validation failed', { error })
      return { valid: false, errors: [`Validation process failed: ${error}`] }
    }
  }

  // Migrate data with progress tracking
  async migrateData(): Promise<MigrationStatus> {
    const migrationId = `migration_${Date.now()}`
    const status: MigrationStatus = {
      id: migrationId,
      name: 'Next.js Unified Migration',
      status: 'running',
      started_at: new Date().toISOString(),
      records_processed: 0,
      records_total: 0,
      backup_created: false,
      rollback_available: false,
    }

    try {
      logger.info('Starting data migration', { migrationId })

      // Create backup if enabled
      if (this.config.createBackup) {
        const backupId = await this.createBackup()
        status.backup_created = true
        status.rollback_available = true
        logger.info('Backup created for migration', { backupId, migrationId })
      }

      // Validate data if enabled
      if (this.config.validateData) {
        const validation = await this.validateData()
        if (!validation.valid) {
          throw new Error(`Data validation failed: ${validation.errors.join(', ')}`)
        }
        logger.info('Data validation passed', { migrationId })
      }

      // Count total records
      const tables = ['users', 'file_metadata', 'document_chunks', 'conversations', 'chat_messages', 'oauth_tokens', 'usage_logs']
      for (const table of tables) {
        const { count } = await this.supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
        status.records_total += count || 0
      }

      // Perform migration operations
      if (!this.config.dryRun) {
        await this.migrateUsers()
        await this.migrateFiles()
        await this.migrateChunks()
        await this.migrateConversations()
        await this.migrateMessages()
        await this.migrateOAuthTokens()
        await this.migrateUsageLogs()
        await this.updateSchema()
      }

      status.status = 'completed'
      status.completed_at = new Date().toISOString()
      
      logger.info('Migration completed successfully', { 
        migrationId, 
        recordsProcessed: status.records_processed 
      })
      
      return status
      
    } catch (error) {
      status.status = 'failed'
      status.error = error.message
      status.completed_at = new Date().toISOString()
      
      logger.error('Migration failed', { migrationId, error })
      return status
    }
  }

  // Rollback migration
  async rollbackMigration(backupId: string): Promise<boolean> {
    try {
      logger.info('Starting migration rollback', { backupId })
      
      const backup = cacheManager.get<Record<string, any[]>>(`backup:${backupId}`)
      if (!backup) {
        throw new Error(`Backup ${backupId} not found`)
      }

      // Clear existing data
      const tables = Object.keys(backup)
      for (const table of tables) {
        const { error } = await this.supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000') // Keep at least one record
        
        if (error) {
          throw new Error(`Failed to clear ${table}: ${error.message}`)
        }
      }

      // Restore backup data
      for (const [table, records] of Object.entries(backup)) {
        if (records.length > 0) {
          const { error } = await this.supabase
            .from(table)
            .insert(records)
          
          if (error) {
            throw new Error(`Failed to restore ${table}: ${error.message}`)
          }
        }
      }

      logger.info('Rollback completed successfully', { backupId })
      return true
      
    } catch (error) {
      logger.error('Rollback failed', { backupId, error })
      return false
    }
  }

  // Individual migration functions
  private async migrateUsers(): Promise<void> {
    logger.info('Migrating users')
    
    const { data: users, error } = await this.supabase
      .from('users')
      .select('*')
    
    if (error) throw error
    
    for (const user of users || []) {
      // Update user schema if needed
      const updates: any = {}
      
      // Ensure subscription_tier has default value
      if (!user.subscription_tier) {
        updates.subscription_tier = 'free'
      }
      
      // Ensure subscription_status has default value
      if (!user.subscription_status) {
        updates.subscription_status = 'active'
      }
      
      // Update usage counters if missing
      if (user.usage_documents === undefined) updates.usage_documents = 0
      if (user.usage_chat_messages === undefined) updates.usage_chat_messages = 0
      if (user.usage_api_calls === undefined) updates.usage_api_calls = 0
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('users')
          .update(updates)
          .eq('id', user.id)
        
        if (updateError) {
          logger.error('Failed to update user', { userId: user.id, error: updateError })
        }
      }
    }
  }

  private async migrateFiles(): Promise<void> {
    logger.info('Migrating file metadata')
    
    const { data: files, error } = await this.supabase
      .from('file_metadata')
      .select('*')
    
    if (error) throw error
    
    for (const file of files || []) {
      const updates: any = {}
      
      // Ensure processing_status has default value
      if (!file.processing_status) {
        updates.processing_status = 'completed'
      }
      
      // Ensure chunk_count and embedding_count have default values
      if (file.chunk_count === undefined) updates.chunk_count = 0
      if (file.embedding_count === undefined) updates.embedding_count = 0
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('file_metadata')
          .update(updates)
          .eq('id', file.id)
        
        if (updateError) {
          logger.error('Failed to update file metadata', { fileId: file.id, error: updateError })
        }
      }
    }
  }

  private async migrateChunks(): Promise<void> {
    logger.info('Migrating document chunks')
    
    const { data: chunks, error } = await this.supabase
      .from('document_chunks')
      .select('*')
    
    if (error) throw error
    
    for (const chunk of chunks || []) {
      const updates: any = {}
      
      // Ensure chunk_index has a value
      if (chunk.chunk_index === undefined) {
        updates.chunk_index = 0
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('document_chunks')
          .update(updates)
          .eq('id', chunk.id)
        
        if (updateError) {
          logger.error('Failed to update document chunk', { chunkId: chunk.id, error: updateError })
        }
      }
    }
  }

  private async migrateConversations(): Promise<void> {
    logger.info('Migrating conversations')
    
    const { data: conversations, error } = await this.supabase
      .from('conversations')
      .select('*')
    
    if (error) throw error
    
    for (const conversation of conversations || []) {
      const updates: any = {}
      
      // Ensure message_count has default value
      if (conversation.message_count === undefined) {
        updates.message_count = 0
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('conversations')
          .update(updates)
          .eq('id', conversation.id)
        
        if (updateError) {
          logger.error('Failed to update conversation', { conversationId: conversation.id, error: updateError })
        }
      }
    }
  }

  private async migrateMessages(): Promise<void> {
    logger.info('Migrating chat messages')
    
    const { data: messages, error } = await this.supabase
      .from('chat_messages')
      .select('*')
    
    if (error) throw error
    
    for (const message of messages || []) {
      const updates: any = {}
      
      // Ensure sources is an array
      if (message.sources === null || message.sources === undefined) {
        updates.sources = []
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('chat_messages')
          .update(updates)
          .eq('id', message.id)
        
        if (updateError) {
          logger.error('Failed to update chat message', { messageId: message.id, error: updateError })
        }
      }
    }
  }

  private async migrateOAuthTokens(): Promise<void> {
    logger.info('Migrating OAuth tokens')
    
    const { data: tokens, error } = await this.supabase
      .from('oauth_tokens')
      .select('*')
    
    if (error) throw error
    
    for (const token of tokens || []) {
      const updates: any = {}
      
      // Ensure provider is valid
      if (!['google', 'microsoft'].includes(token.provider)) {
        updates.provider = 'google' // Default fallback
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('oauth_tokens')
          .update(updates)
          .eq('id', token.id)
        
        if (updateError) {
          logger.error('Failed to update OAuth token', { tokenId: token.id, error: updateError })
        }
      }
    }
  }

  private async migrateUsageLogs(): Promise<void> {
    logger.info('Migrating usage logs')
    
    const { data: logs, error } = await this.supabase
      .from('usage_logs')
      .select('*')
    
    if (error) throw error
    
    for (const log of logs || []) {
      const updates: any = {}
      
      // Ensure metadata is an object
      if (log.metadata === null || log.metadata === undefined) {
        updates.metadata = {}
      }
      
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await this.supabase
          .from('usage_logs')
          .update(updates)
          .eq('id', log.id)
        
        if (updateError) {
          logger.error('Failed to update usage log', { logId: log.id, error: updateError })
        }
      }
    }
  }

  private async updateSchema(): Promise<void> {
    logger.info('Updating database schema')
    
    // Add any missing columns or constraints
    const schemaUpdates = [
      // Add indexes for better performance
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_files_user_id ON file_metadata(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON document_chunks(file_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON chat_messages(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_tokens_user_provider ON oauth_tokens(user_id, provider)',
      'CREATE INDEX IF NOT EXISTS idx_logs_user_created ON usage_logs(user_id, created_at)',
    ]
    
    for (const update of schemaUpdates) {
      try {
        await this.supabase.rpc('exec_sql', { sql: update })
      } catch (error) {
        logger.warn('Schema update failed (may already exist)', { update, error })
      }
    }
  }
}

// Migration API endpoint utilities
export async function runMigration(
  supabaseUrl: string,
  supabaseKey: string,
  config: Partial<MigrationConfig> = {}
): Promise<MigrationStatus> {
  const migrationManager = new DataMigrationManager(supabaseUrl, supabaseKey, config)
  return await migrationManager.migrateData()
}

export async function rollbackMigration(
  supabaseUrl: string,
  supabaseKey: string,
  backupId: string
): Promise<boolean> {
  const migrationManager = new DataMigrationManager(supabaseUrl, supabaseKey)
  return await migrationManager.rollbackMigration(backupId)
}

export async function validateMigrationData(
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ valid: boolean; errors: string[] }> {
  const migrationManager = new DataMigrationManager(supabaseUrl, supabaseKey)
  return await migrationManager.validateData()
}
