"use client";

import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  id: string;
  name: string;
  path?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate: (folderId: string) => void;
  className?: string;
}

export function Breadcrumb({ items, onNavigate, className = '' }: BreadcrumbProps) {
  return (
    <nav className={`flex items-center space-x-1 text-sm ${className}`} aria-label="Breadcrumb">
      <button
        onClick={() => onNavigate('root')}
        className="flex items-center space-x-1 px-2 py-1 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
        title="Go to root folder"
      >
        <Home className="w-4 h-4" />
        <span>Root</span>
      </button>
      
      {items.length > 0 && (
        <>
          <ChevronRight className="w-4 h-4 text-gray-500" />
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            
            return (
              <div key={item.id} className="flex items-center space-x-1">
                {isLast ? (
                  <span className="px-2 py-1 text-white font-medium">
                    {item.name}
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => onNavigate(item.id)}
                      className="px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-700/50 rounded transition-colors"
                      title={`Go to ${item.name}`}
                    >
                      {item.name}
                    </button>
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
    </nav>
  );
}
