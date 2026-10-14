import React, { useState } from 'react';
import { X } from 'lucide-react';

interface ChangeCheckInDayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDay: number; // 0=Sun..6=Sat
  onSaveDay: (day: number) => Promise<void>;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export const ChangeCheckInDayModal: React.FC<ChangeCheckInDayModalProps> = ({
  isOpen,
  onClose,
  currentDay,
  onSaveDay,
}) => {
  const [selectedDay, setSelectedDay] = useState<number>(currentDay);
  const [submitting, setSubmitting] = useState<boolean>(false);

  React.useEffect(() => {
    setSelectedDay(currentDay);
  }, [currentDay, isOpen]);

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await onSaveDay(selectedDay);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1c1d22] border border-[#272930] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start border-b border-[#272930] pb-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#c7b8f5]">
              Strategy Schedule
            </span>
            <h3 className="text-base font-bold text-white">Change Check-In Day</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-gray-400 leading-relaxed">
          Select the day of the week you prefer for your program review. Changing your check-in day has{' '}
          <strong className="text-white">no negative impact</strong> on your weight trend, expenditure, or history.
        </p>

        {/* 7 Weekday Selectable Options */}
        <div className="space-y-1.5 pt-1">
          {WEEKDAY_NAMES.map((name, idx) => {
            const isSelected = selectedDay === idx;
            return (
              <div
                key={name}
                onClick={() => setSelectedDay(idx)}
                className={`cursor-pointer p-3 rounded-xl border flex items-center justify-between transition-all ${
                  isSelected
                    ? 'bg-[#25272e] border-[#6e46e5] text-white shadow-sm'
                    : 'bg-[#121316] border-[#272930] text-gray-300 hover:bg-[#1c1d22]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-[#8250df] bg-[#8250df]' : 'border-gray-600'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs font-semibold">{name}</span>
                </div>
                {idx === 1 && (
                  <span className="text-[10px] text-gray-400 font-mono">MF Default</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-1/2 py-2.5 rounded-xl border border-[#272930] bg-[#25272e] text-gray-300 font-semibold text-xs hover:bg-[#30333c]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="w-1/2 py-2.5 rounded-xl bg-gradient-to-r from-[#6e46e5] to-[#8250df] text-white font-semibold text-xs shadow hover:opacity-95 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Day'}
          </button>
        </div>
      </div>
    </div>
  );
};
