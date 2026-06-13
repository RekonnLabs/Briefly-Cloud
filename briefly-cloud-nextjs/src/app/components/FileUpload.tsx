// @ts-nocheck — pending type cleanup
"use client";

import { useState, useRef, useCallback } from 'react';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
}

// Vercel serverless body limit is ~4.5 MB.
// Files above this threshold use the presign → PUT → process flow so the
// binary never passes through Vercel.
const PRESIGN_THRESHOLD_BYTES = 4 * 1024 * 1024 // 4 MB

export function FileUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv'
  ];

  const supportedExtensions = ['.pdf', '.docx', '.xlsx', '.pptx', '.txt', '.md', '.csv'];

  const validateFile = (file: File): string | null => {
    if (file.size > 100 * 1024 * 1024) { // 100 MB hard cap (pro_byok tier)
      return 'File size must be less than 100 MB';
    }
    
    if (!supportedTypes.includes(file.type) && !supportedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
      return 'Unsupported file type. Please upload PDF, DOCX, XLSX, PPTX, TXT, MD, or CSV files.';
    }
    
    return null;
  };

  // ── Presign flow (Spec 10 + Fluid Compute) — for files > 4 MB ───────────────
  // Step 1: POST /api/upload/presign  → { signedUrl, storagePath, token }
  // Step 2: PUT  signedUrl            → raw file body (bypasses Vercel)
  // Step 3: POST /api/upload/process  → returns 202 immediately, extraction runs
  //                                     post-response via after() (Fluid Compute)
  // Step 4: Poll GET /api/upload/files/[fileId] until processing_status completes
  const POLL_INTERVAL_MS = 4000
  const POLL_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes max

  const pollUntilComplete = async (fileDbId: string, uiFileId: string): Promise<void> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
      try {
        const res = await fetch(`/api/upload/files/${fileDbId}`)
        if (!res.ok) continue
        const { data } = await res.json()
        const status: string = data?.file?.processing_status ?? ''
        if (status === 'completed' || status === 'ready') {
          // Extraction finished — mark completed in UI
          setUploadedFiles(prev =>
            prev.map(f => f.id === uiFileId ? { ...f, status: 'completed', progress: 100 } : f)
          )
          window.dispatchEvent(new CustomEvent('briefly:quota-changed'))
          return
        }
        if (status === 'failed' || status === 'error') {
          throw new Error(data?.file?.error_message || 'Indexing failed — please try again.')
        }
        // Still processing — update progress indicator
        setUploadedFiles(prev =>
          prev.map(f => f.id === uiFileId ? { ...f, progress: Math.min((f.progress ?? 70) + 2, 95) } : f)
        )
      } catch (pollErr) {
        if (pollErr instanceof Error && (pollErr.message.includes('failed') || pollErr.message.includes('error'))) {
          throw pollErr
        }
        // Network hiccup — keep polling
      }
    }
    throw new Error('Indexing is taking longer than expected. The file will continue processing in the background.')
  }

  const uploadLargeFile = async (file: File, fileId: string): Promise<void> => {
    // Step 1 — get presigned URL
    const presignRes = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      }),
    });

    if (!presignRes.ok) {
      const err = await presignRes.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Presign failed: ${presignRes.status}`);
    }

    const { data: presignData } = await presignRes.json();
    const { signedUrl, storagePath } = presignData as { signedUrl: string; storagePath: string; token: string };

    setUploadedFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, progress: 30 } : f)
    );

    // Step 2 — PUT directly to Supabase Storage (bypasses Vercel body limit)
    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error(`Storage upload failed: ${putRes.status} ${putRes.statusText}`);
    }

    setUploadedFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, status: 'processing', progress: 60 } : f)
    );

    // Step 3 — trigger server-side extraction (returns 202 immediately)
    // The extraction pipeline runs post-response via after() under Fluid Compute.
    const processRes = await fetch('/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      }),
    });

    // 200 = duplicate (already processed), 201 = sync success (small doc), 202 = async processing
    if (!processRes.ok) {
      const err = await processRes.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Processing failed: ${processRes.status}`);
    }

    const processData = await processRes.json();
    const dbFileId: string | undefined = processData?.data?.file?.id

    if (processRes.status === 202 && dbFileId) {
      // Step 4 — poll until extraction completes (Fluid Compute runs it in background)
      setUploadedFiles(prev =>
        prev.map(f => f.id === fileId ? { ...f, progress: 70 } : f)
      );
      await pollUntilComplete(dbFileId, fileId)
      // pollUntilComplete sets status to 'completed' and dispatches quota event
      return
    }

    // 200 duplicate or 201 sync — fall through to the caller's setTimeout completion
  };

  const uploadFile = async (file: File) => {
    const fileId = Date.now().toString();
    const uploadedFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      status: 'uploading',
      progress: 0
    };

    setUploadedFiles(prev => [...prev, uploadedFile]);

    try {
      const { captureFileProcessingError, capturePerformanceMetric } = await import('@/app/lib/error-monitoring');
      const startTime = Date.now();

      let largeFileCompleted = false
      if (file.size > PRESIGN_THRESHOLD_BYTES) {
        // ── Large file: presign → PUT → process → poll ───────────────────────
        // pollUntilComplete() sets status to 'completed' and fires quota event.
        // Skip the setTimeout completion block below for this path.
        setUploadedFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, progress: 10 } : f)
        );
        await uploadLargeFile(file, fileId);
        largeFileCompleted = true
      } else {
        // ── Small file: existing direct upload flow ──────────────────────────
        const formData = new FormData();
        formData.append('file', file);

        const { retryFileUpload } = await import('@/app/lib/retry');

        const makeUploadRequest = async () => {
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Upload failed: ${response.status}`);
          }

          return response;
        };

        await retryFileUpload(makeUploadRequest);

        setUploadedFiles(prev =>
          prev.map(f => f.id === fileId ? { ...f, status: 'processing', progress: 50 } : f)
        );
      }

      // Simulate brief processing indicator before marking complete
      // (skipped for large files — pollUntilComplete already handled completion)
      if (largeFileCompleted) return
      setTimeout(() => {
        setUploadedFiles(prev =>
          prev.map(f =>
            f.id === fileId
              ? { ...f, status: 'completed', progress: 100 }
              : f
          )
        );

        // Notify the Sidebar quota card to refresh immediately
        window.dispatchEvent(new CustomEvent('briefly:quota-changed'));

        capturePerformanceMetric('file_upload', Date.now() - startTime, true);
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);

      const { captureFileProcessingError } = await import('@/app/lib/error-monitoring');
      captureFileProcessingError(error as Error, file.type, file.size);

      let errorMessage = 'Upload failed. Please try again.';

      if (error instanceof Error) {
        if (error.message.includes('file size') || error.message.includes('exceeds')) {
          errorMessage = 'File is too large for your plan. Please upgrade or choose a smaller file.';
        } else if (error.message.includes('file type') || error.message.includes('Unsupported')) {
          errorMessage = 'File type not supported. Please upload a PDF, DOCX, or similar file.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error during upload. Please check your connection.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Upload timed out. Please try again.';
        } else if (error.message.includes('usage limit') || error.message.includes('QUOTA')) {
          errorMessage = "You've reached your upload limit. Please upgrade your plan.";
        } else if (error.message.includes('413') || error.message.includes('PAYLOAD')) {
          errorMessage = 'File too large for direct upload. Please try again — it will use the large-file upload path.';
        }
      }

      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === fileId
            ? { ...f, status: 'error', error: errorMessage }
            : f
        )
      );
    }
  };

  const handleFiles = useCallback((files: FileList) => {
    Array.from(files).forEach(file => {
      const error = validateFile(file);
      if (error) {
        alert(error);
        return;
      }
      uploadFile(file);
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent" />;
      case 'processing':
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusText = (status: UploadedFile['status'], progress?: number) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        // progress >= 60 means the file is in Supabase Storage and extraction is running
        return (progress ?? 0) >= 60 ? 'Indexing in background...' : 'Processing...';
      case 'completed':
        return 'Ready';
      case 'error':
        return 'Error';
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver 
            ? 'border-accent bg-accent-tint-bg' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Drop files here or click to upload
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Supported formats: PDF, DOCX, XLSX, PPTX, TXT, MD, CSV (up to 100 MB)
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-accent hover:bg-accent-hover text-white font-semibold py-2 px-4 rounded-lg transition-colors"
        >
          Choose Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-gray-900">Uploaded Files</h3>
          {uploadedFiles.map((file) => (
            <div
              key={file.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3 flex-1">
                <File className="w-5 h-5 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)} • {getStatusText(file.status, file.progress)}
                  </p>
                  {(file.status === 'uploading' || file.status === 'processing') && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-accent h-2 rounded-full transition-all duration-300"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {file.error && (
                    <p className="text-xs text-red-600 mt-1">{file.error}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(file.status)}
                <button
                  onClick={() => removeFile(file.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
