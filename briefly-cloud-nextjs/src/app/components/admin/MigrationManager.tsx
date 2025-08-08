'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card'
import { Alert, AlertDescription } from '@/app/components/ui/alert'
import { Badge } from '@/app/components/ui/badge'
import { Progress } from '@/app/components/ui/progress'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Input } from '@/app/components/ui/input'
import { Textarea } from '@/app/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/app/components/ui/dialog'
import { 
  Play, 
  RotateCcw, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Database,
  Shield,
  RefreshCw
} from 'lucide-react'

interface MigrationStatus {
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

interface MigrationConfig {
  batchSize: number
  maxRetries: number
  retryDelay: number
  validateData: boolean
  createBackup: boolean
  dryRun: boolean
}

interface ValidationResult {
  valid: boolean
  errors: string[]
}

export function MigrationManager() {
  const [migrations, setMigrations] = useState<MigrationStatus[]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [availableBackups, setAvailableBackups] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<MigrationConfig>({
    batchSize: 100,
    maxRetries: 3,
    retryDelay: 1000,
    validateData: true,
    createBackup: true,
    dryRun: false,
  })
  const [showConfig, setShowConfig] = useState(false)
  const [rollbackBackupId, setRollbackBackupId] = useState('')
  const [showRollbackDialog, setShowRollbackDialog] = useState(false)

  // Fetch migration status
  const fetchMigrationStatus = async () => {
    try {
      const response = await fetch('/api/migration')
      const data = await response.json()
      if (data.success) {
        setMigrations(data.data.migrations || [])
      }
    } catch (error) {
      console.error('Failed to fetch migration status:', error)
    }
  }

  // Fetch available backups
  const fetchBackups = async () => {
    try {
      const response = await fetch('/api/migration/rollback')
      const data = await response.json()
      if (data.success) {
        setAvailableBackups(data.data.availableBackups || [])
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error)
    }
  }

  // Run migration
  const runMigration = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          config,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        await fetchMigrationStatus()
      } else {
        throw new Error(data.message || 'Migration failed')
      }
    } catch (error) {
      console.error('Migration failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Validate data
  const validateData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate' }),
      })
      
      const data = await response.json()
      if (data.success) {
        setValidation(data.data)
      } else {
        throw new Error(data.message || 'Validation failed')
      }
    } catch (error) {
      console.error('Validation failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Rollback migration
  const rollbackMigration = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/migration/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backupId: rollbackBackupId,
          confirm: true,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        setShowRollbackDialog(false)
        setRollbackBackupId('')
        await fetchMigrationStatus()
        await fetchBackups()
      } else {
        throw new Error(data.message || 'Rollback failed')
      }
    } catch (error) {
      console.error('Rollback failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'running':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-500" />
      default:
        return <AlertTriangle className="h-5 w-5 text-orange-500" />
    }
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      completed: 'default',
      failed: 'destructive',
      running: 'secondary',
      pending: 'outline',
      rolled_back: 'destructive',
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  // Calculate progress percentage
  const getProgressPercentage = (migration: MigrationStatus) => {
    if (migration.records_total === 0) return 0
    return Math.round((migration.records_processed / migration.records_total) * 100)
  }

  useEffect(() => {
    fetchMigrationStatus()
    fetchBackups()
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Migration Manager
          </CardTitle>
          <CardDescription>
            Manage database migrations and data validation for the Next.js unified migration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button 
              onClick={runMigration} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Run Migration
            </Button>
            
            <Button 
              onClick={validateData} 
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Validate Data
            </Button>
            
            <Dialog open={showConfig} onOpenChange={setShowConfig}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Configuration
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Migration Configuration</DialogTitle>
                  <DialogDescription>
                    Configure migration settings and options
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="batchSize">Batch Size</Label>
                      <Input
                        id="batchSize"
                        type="number"
                        value={config.batchSize}
                        onChange={(e) => setConfig(prev => ({ ...prev, batchSize: parseInt(e.target.value) }))}
                        min={1}
                        max={1000}
                      />
                    </div>
                    <div>
                      <Label htmlFor="maxRetries">Max Retries</Label>
                      <Input
                        id="maxRetries"
                        type="number"
                        value={config.maxRetries}
                        onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) }))}
                        min={1}
                        max={10}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="retryDelay">Retry Delay (ms)</Label>
                      <Input
                        id="retryDelay"
                        type="number"
                        value={config.retryDelay}
                        onChange={(e) => setConfig(prev => ({ ...prev, retryDelay: parseInt(e.target.value) }))}
                        min={100}
                        max={10000}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="validateData"
                        checked={config.validateData}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, validateData: checked }))}
                      />
                      <Label htmlFor="validateData">Validate Data</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="createBackup"
                        checked={config.createBackup}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, createBackup: checked }))}
                      />
                      <Label htmlFor="createBackup">Create Backup</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="dryRun"
                        checked={config.dryRun}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, dryRun: checked }))}
                      />
                      <Label htmlFor="dryRun">Dry Run (No Changes)</Label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => setShowConfig(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Validation Results */}
          {validation && (
            <Alert className={validation.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Data Validation:</strong> {validation.valid ? 'PASSED' : 'FAILED'}
                {validation.errors.length > 0 && (
                  <div className="mt-2">
                    <strong>Errors:</strong>
                    <ul className="list-disc list-inside mt-1">
                      {validation.errors.map((error, index) => (
                        <li key={index} className="text-sm">{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Migration Status */}
          {migrations.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Migration History</h3>
              {migrations.map((migration) => (
                <Card key={migration.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(migration.status)}
                        <span className="font-medium">{migration.name}</span>
                        {getStatusBadge(migration.status)}
                      </div>
                      <span className="text-sm text-gray-500">
                        {new Date(migration.started_at).toLocaleString()}
                      </span>
                    </div>
                    
                    {migration.status === 'running' && (
                      <div className="mb-2">
                        <Progress value={getProgressPercentage(migration)} className="h-2" />
                        <div className="text-sm text-gray-600 mt-1">
                          {migration.records_processed} / {migration.records_total} records
                        </div>
                      </div>
                    )}
                    
                    {migration.error && (
                      <Alert className="border-red-200 bg-red-50 mt-2">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{migration.error}</AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                      <span>Records: {migration.records_processed}/{migration.records_total}</span>
                      {migration.backup_created && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Backup Created
                        </span>
                      )}
                      {migration.rollback_available && (
                        <span className="flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" />
                          Rollback Available
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Rollback Section */}
          {availableBackups.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Available Backups</h3>
              <div className="grid gap-2">
                {availableBackups.map((backupId) => (
                  <div key={backupId} className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="font-mono text-sm">{backupId}</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setRollbackBackupId(backupId)
                        setShowRollbackDialog(true)
                      }}
                      className="flex items-center gap-2"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Rollback
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rollback Confirmation Dialog */}
      <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              This will restore the database to the state of backup: {rollbackBackupId}
              <br />
              <strong className="text-red-600">This action cannot be undone!</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="confirmRollback">Type "ROLLBACK" to confirm</Label>
              <Input
                id="confirmRollback"
                placeholder="ROLLBACK"
                onChange={(e) => {
                  if (e.target.value === 'ROLLBACK') {
                    // Enable rollback button
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRollbackDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={rollbackMigration}
              disabled={isLoading}
            >
              {isLoading ? 'Rolling Back...' : 'Confirm Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
