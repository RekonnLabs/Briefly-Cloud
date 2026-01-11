'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/app/lib/logger'

// Create browser client for client component
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface FileRecord {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  processing_status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

export function FileList() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  async function handleDelete(fileId: string) {
    if (!confirm('Are you sure you want to delete this file?')) {
      return
    }

    try {
      const { error: deleteError } = await supabase
        .schema('app')
        .from('files')
        .delete()
        .eq('id', fileId)

      if (deleteError) {
        throw deleteError
      }

      // Refresh the list
      await fetchFiles()
    } catch (err) {
      logger.error('Failed to delete file', err as Error)
      alert('Failed to delete file. Please try again.')
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
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
