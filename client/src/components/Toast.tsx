import React from 'react';

interface ToastProps {
  message: string | null;
  isSuccess?: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isSuccess = true }) => {
  if (!message) return null;

  return (
    <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top duration-300">
      <div className="bg-[#1c1d22] border border-[#30333c] text-white text-xs px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-emerald-400' : 'bg-red-400'}`}
        />
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
};
