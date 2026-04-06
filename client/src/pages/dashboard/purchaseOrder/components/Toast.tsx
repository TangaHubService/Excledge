import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { ToastProps } from '../types';

export const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const typeStyles = {
    success: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    warning: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div
      className={`fixed bottom-4 right-4 px-6 py-4 rounded-md shadow-lg ${typeStyles[type]} flex items-center justify-between min-w-64`}
      role="alert"
    >
      <div className="flex-1">{message}</div>
      <button
        type="button"
        onClick={onClose}
        className="ml-4 text-gray-500 hover:text-gray-700"
        aria-label="Close"
      >
        <X size={18} />
      </button>
    </div>
  );
};
