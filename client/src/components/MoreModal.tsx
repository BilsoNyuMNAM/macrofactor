import React from 'react';
import { X, Calendar, Zap, SlidersHorizontal, Trash2, User } from 'lucide-react';

interface MoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  fastCheckIn: boolean;
  userEmail?: string;
  onOpenChangeDayModal: () => void;
  onToggleFastCheckIn: () => void;
  onOpenOnboardingModal: () => void;
  onNavigateToStrategy: () => void;
  onConfirmClearLogs: () => void;
  onReRunOnboarding: () => void;
  onLogOut: () => void;
}

export const MoreModal: React.FC<MoreModalProps> = ({
  isOpen,
  onClose,
  fastCheckIn,
  userEmail,
  onOpenChangeDayModal,
  onToggleFastCheckIn,
  onOpenOnboardingModal,
  onNavigateToStrategy,
  onConfirmClearLogs,
  onReRunOnboarding,
  onLogOut,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-[#1c1d22] border-t sm:border border-[#272930] rounded-t-3xl sm:rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-200">
        <div className="flex justify-between items-center border-b border-[#272930] pb-3">
          <h3 className="text-base font-bold text-white">More Options</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account Info Bar */}
        {userEmail && (
          <div className="bg-[#121316] border border-[#272930] rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] text-[#8E8E93] uppercase font-bold tracking-wider">Signed in as</span>
              <div className="text-white font-mono font-semibold">{userEmail}</div>
            </div>
            <span className="text-[10px] text-[#43AA71] font-semibold bg-[#43AA71]/15 px-2 py-0.5 rounded-full border border-[#43AA71]/30">
              Active Session
            </span>
          </div>
        )}

        <div className="space-y-2 text-xs">
          <button
            onClick={() => {
              onClose();
              onOpenChangeDayModal();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-[#30333c] text-white font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#c7b8f5]" />
              <span>Change Check-In Day</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>

          <button
            onClick={() => {
              onToggleFastCheckIn();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-[#30333c] text-white font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <span>Toggle Fast Check-In Mode</span>
            </span>
            <span className="text-gray-400 font-mono">{fastCheckIn ? 'On' : 'Off'}</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenOnboardingModal();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-[#30333c] text-white font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <User className="w-4 h-4 text-teal-400" />
              <span>Quick Profile & Baseline Edit</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onReRunOnboarding();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-[#30333c] text-white font-medium flex items-center justify-between border border-[#FF8660]/30"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#FF8660]" />
              <span className="text-[#FF8660] font-semibold">Reset Profile & Re-Run Onboarding</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onNavigateToStrategy();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-[#30333c] text-white font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#ff6b4a]" />
              <span>Strategy & Check-In Hub</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onConfirmClearLogs();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-red-500/20 text-red-400 font-medium flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Clear All Daily Log Entries</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>

          <button
            onClick={() => {
              onClose();
              onLogOut();
            }}
            className="w-full text-left p-3.5 rounded-xl bg-[#25272e] hover:bg-gray-700/40 text-gray-300 hover:text-white font-medium flex items-center justify-between border-t border-[#272930] pt-4"
          >
            <span className="flex items-center gap-2">
              <span>Sign Out / Switch Account</span>
            </span>
            <span className="text-gray-500">&rsaquo;</span>
          </button>
        </div>
      </div>
    </div>
  );
};
