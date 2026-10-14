import React, { useState } from 'react';
import { X } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWeight: number;
  goalWeight: number;
  baselineTdee: number;
  biologicalSex?: string;
  onSave: (data: {
    currentWeight: number;
    goalWeight: number;
    baselineTdee: number;
    biologicalSex?: string;
  }) => Promise<void>;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  currentWeight,
  goalWeight,
  baselineTdee,
  biologicalSex = 'male',
  onSave,
}) => {
  const [curW, setCurW] = useState<string>(currentWeight.toString());
  const [gW, setGW] = useState<string>(goalWeight.toString());
  const [baseExp, setBaseExp] = useState<string>(baselineTdee.toString());
  const [sex, setSex] = useState<string>(biologicalSex);
  const [submitting, setSubmitting] = useState<boolean>(false);

  React.useEffect(() => {
    setCurW(currentWeight.toString());
    setGW(goalWeight.toString());
    setBaseExp(baselineTdee.toString());
    setSex(biologicalSex || 'male');
  }, [currentWeight, goalWeight, baselineTdee, biologicalSex, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSave({
        currentWeight: parseFloat(curW) || 78.0,
        goalWeight: parseFloat(gW) || 76.0,
        baselineTdee: parseInt(baseExp, 10) || 2340,
        biologicalSex: sex,
      });
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
              Profile Setup
            </span>
            <h3 className="text-base font-bold text-white">Goal & Profile Setup</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-300 font-semibold mb-1">Current Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={curW}
                onChange={(e) => setCurW(e.target.value)}
                required
                className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label className="block text-gray-300 font-semibold mb-1">Target Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                value={gW}
                onChange={(e) => setGW(e.target.value)}
                required
                className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-teal-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1">
              Baseline Expenditure (kcal/day)
            </label>
            <input
              type="number"
              value={baseExp}
              onChange={(e) => setBaseExp(e.target.value)}
              className="w-full bg-[#121316] border border-[#272930] rounded-xl px-3 py-2 text-white font-mono outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="block text-gray-300 font-semibold mb-1.5">
              Biological Sex (Calorie Safety Floor)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSex('male')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center ${
                  sex === 'male'
                    ? 'bg-[#25272e] border-teal-400 text-white'
                    : 'bg-[#121316] border-[#272930] text-gray-400 hover:text-white'
                }`}
              >
                <span>Male</span>
                <span className="text-[10px] text-gray-400 font-normal">≥ 1,500 kcal floor</span>
              </button>
              <button
                type="button"
                onClick={() => setSex('female')}
                className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center ${
                  sex === 'female'
                    ? 'bg-[#25272e] border-teal-400 text-white'
                    : 'bg-[#121316] border-[#272930] text-gray-400 hover:text-white'
                }`}
              >
                <span>Female</span>
                <span className="text-[10px] text-gray-400 font-normal">≥ 1,200 kcal floor</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-gradient-to-r from-[#ff6b4a] to-[#f97316] text-white font-semibold rounded-xl text-xs shadow hover:opacity-95 active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Profile & Recalculate'}
          </button>
        </form>
      </div>
    </div>
  );
};
