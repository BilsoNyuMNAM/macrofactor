import React from 'react';
import { Sparkles, Shield, Compass, HeartHandshake, ArrowRight, LogIn } from 'lucide-react';

interface IntroViewProps {
  onGetStarted: () => void;
  onLogIn: () => void;
}

export const IntroView: React.FC<IntroViewProps> = ({
  onGetStarted,
  onLogIn,
}) => {
  return (
    <div className="min-h-screen bg-[#0E0F12] text-white flex flex-col justify-between p-6 max-w-xl mx-auto selection:bg-[#FF8660]/30 animate-in fade-in duration-300">
      {/* Top Header & Brand */}
      <header className="pt-6 sm:pt-10 space-y-3 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF8660] to-[#E6532B] shadow-lg shadow-[#FF8660]/20 mb-2">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <div className="space-y-1">
          <span className="text-[11px] font-bold tracking-widest uppercase text-[#FF8660] bg-[#FF8660]/10 px-3 py-1 rounded-full border border-[#FF8660]/20">
            Adaptive Macro Coaching
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white pt-2">
            MacroFactor
          </h1>
        </div>
        <p className="text-sm text-[#8E8E93] max-w-md mx-auto leading-relaxed">
          The smart macro tracker and nutritional coach that dynamically adapts to your unique metabolism.
        </p>
      </header>

      {/* Tour Map / Core Value Propositions */}
      <div className="my-8 space-y-3.5">
        <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-4.5 flex items-start gap-4 hover:border-[#383B46] transition-all">
          <div className="w-10 h-10 rounded-xl bg-[#43AA71]/15 text-[#43AA71] flex items-center justify-center shrink-0 border border-[#43AA71]/20">
            <HeartHandshake className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">Adherence-Neutral Coaching</h2>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              Never scolded or marked in red. Missed targets and overeating are simply honest empirical data to refine your metabolic estimate.
            </p>
          </div>
        </div>

        <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-4.5 flex items-start gap-4 hover:border-[#383B46] transition-all">
          <div className="w-10 h-10 rounded-xl bg-[#FF8660]/15 text-[#FF8660] flex items-center justify-center shrink-0 border border-[#FF8660]/20">
            <Compass className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">Adaptive Metabolic Engine</h2>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              Unlike static calorie apps that guess your maintenance calories and stay wrong, our thermodynamic algorithm learns your true expenditure in real time.
            </p>
          </div>
        </div>

        <div className="bg-[#18191E] border border-[#24262E] rounded-2xl p-4.5 flex items-start gap-4 hover:border-[#383B46] transition-all">
          <div className="w-10 h-10 rounded-xl bg-[#4D74FF]/15 text-[#4D74FF] flex items-center justify-center shrink-0 border border-[#4D74FF]/20">
            <Shield className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-white">100% Ad-Free & Private</h2>
            <p className="text-xs text-[#8E8E93] leading-relaxed">
              No distracting ads, no sponsored junk foods, and your biometric data is never sold to third parties.
            </p>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <footer className="pb-6 space-y-3">
        <button
          onClick={onGetStarted}
          className="w-full py-4 rounded-full bg-gradient-to-r from-[#FF8660] to-[#E6532B] hover:opacity-95 active:scale-[0.99] transition-all text-white font-bold text-sm shadow-xl shadow-[#FF8660]/25 flex items-center justify-center gap-2"
        >
          <span>Get Started</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onLogIn}
          className="w-full py-3.5 rounded-full bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#2E3038] active:scale-[0.99] transition-all text-gray-200 font-semibold text-xs flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4 text-gray-400" />
          <span>I already have an account — Log In</span>
        </button>
      </footer>
    </div>
  );
};
