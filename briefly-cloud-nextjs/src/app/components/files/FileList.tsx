'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/app/lib/logger'

// Create browser client for client component (read-only — list/fetch only)
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FileRecord {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted'
  created_at: string
  updated_at: string
}

export function FileList() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Tracks which file row is in "pending confirm" state for deletion
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  // Tracks which file is currently being deleted or replaced (shows loading state)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchFiles()
  }, [])

  async function fetchFiles() {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
        .schema('app')
        .from('files')
        .select('id, name, mime_type, size_bytes, processing_status, created_at, updated_at')
        .neq('processing_status', 'deleted')
        .order('created_at', { ascending: false })
        .limit(50)

      if (fetchError) {
        throw fetchError
      }

      setFiles(data || [])
    } catch (err) {
      logger.error('Failed to fetch files', err as Error)
      setError('Failed to load files. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Routes through the API — handles chunks, storage, ingest record, and usage counters
  async function handleDelete(fileId: string) {
    try {
      setDeletingId(fileId)
      setPendingDeleteId(null)

      const res = await fetch(`/api/upload/files/${fileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())

      // Refresh the list after successful deletion
      await fetchFiles()
    } catch (err) {
      logger.error('Failed to delete file', err as Error)
      setError('Failed to delete file. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  // Deletes the existing file via the API then opens the file picker for a replacement upload
  async function handleReplace(fileId: string) {
    try {
      setDeletingId(fileId)
      setPendingDeleteId(null)

      const res = await fetch(`/api/upload/files/${fileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to remove existing file')

      // Refresh list so the deleted file disappears before the new upload appears
      await fetchFiles()

      // Trigger file picker for the replacement
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.pdf,.docx,.xlsx,.txt,.csv'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return

        const formData = new FormData()
        formData.append('file', file)

        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        if (!uploadRes.ok) {
          logger.error('Replacement upload failed', new Error(await uploadRes.text()))
          setError('Replacement upload failed. Please try uploading manually.')
        }

        // Refresh list to show the newly uploaded file
        await fetchFiles()
      }
      input.click()
    } catch (err) {
      logger.error('Failed to replace file', err as Error)
      setError('Failed to replace file. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  function getStatusBadge(status: string) {
    const statusColors = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      processing: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400'
    }
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status as keyof typeof statusColors] || 'bg-gray-500/20 text-gray-400'}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-6 text-gray-400 text-center">
        Loading files...
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-red-700/50 shadow-xl p-6 text-red-400 text-center">
        {error}
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl p-6 text-gray-400 text-center">
        No files uploaded yet. Upload a file to get started.
      </div>
    )
  }

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-800/50 border-b border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                Uploaded
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {files.map((file) => (
              <tr key={file.id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                  {file.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                  {file.mime_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                  {formatFileSize(file.size_bytes)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {getStatusBadge(file.processing_status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                  {formatDate(file.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {deletingId === file.id ? (
                    <span className="text-gray-500 text-sm">Removing…</span>
                  ) : pendingDeleteId === file.id ? (
                    // Inline confirmation — no native browser dialog
                    <span className="flex items-center gap-3 justify-end">
                      <span className="text-xs text-gray-400">Remove from Briefly?</span>
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="text-red-400 hover:text-red-300 text-sm transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="text-gray-400 hover:text-gray-300 text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-4 justify-end">
                      <button
                        onClick={() => handleReplace(file.id)}
                        className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(file.id)}
                        className="text-red-400 hover:text-red-300 text-sm transition-colors"
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
