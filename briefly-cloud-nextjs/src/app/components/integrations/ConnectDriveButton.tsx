/**
 * Connect Drive Button Component
 * 
 * Simple button component that opens Apideck Vault for cloud storage connections.
 * Can be used in onboarding flows or anywhere cloud storage connection is needed.
 */

'use client'

import { useState } from 'react'
import { Cloud, RefreshCw, AlertTriangle } from 'lucide-react'
import { useVault } from './useVault'

interface ConnectDriveButtonProps {
  className?: string
  variant?: 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}

export function ConnectDriveButton({ 
  className = '', 
  variant = 'primary',
  size = 'md',
  children 
}: ConnectDriveButtonProps) {
  const { openVault, isLoading, error, clearError } = useVault()

  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-blue-500'
  }
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }

  const handleClick = () => {
    if (error) {
      clearError()
    }
    openVault()
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className} ${
          isLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
        ) : error ? (
          <AlertTriangle className="w-4 h-4 mr-2" />
        ) : (
          <Cloud className="w-4 h-4 mr-2" />
        )}
        {children || (
          <span>
            {isLoading 
              ? 'Opening...' 
              : error 
                ? 'Try Again' 
                : 'Connect Google Drive / OneDrive'
            }
          </span>
        )}
      </button>
      
      {error && (
        <p className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}