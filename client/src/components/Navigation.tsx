import React from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  Scale,
  Flame,
  SlidersHorizontal,
  Plus,
  Settings,
  Activity,
} from 'lucide-react';

export type ViewType = 'dashboard' | 'scale' | 'trend' | 'expenditure' | 'strategy';

interface NavigationProps {
  activeView: ViewType;
  onSwitchView: (view: ViewType) => void;
  onOpenLogModal: () => void;
  onOpenMoreModal: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeView,
  onSwitchView,
  onOpenLogModal,
  onOpenMoreModal,
}) => {
  const navItems: { id: ViewType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scale', label: 'Scale Weight', icon: Scale },
    { id: 'trend', label: 'Weight Trend', icon: TrendingUp },
    { id: 'expenditure', label: 'Expenditure', icon: Flame },
    { id: 'strategy', label: 'Strategy', icon: SlidersHorizontal },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#121316]/95 backdrop-blur-md border-b border-[#25272E]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#ff6b4a] to-[#f97316] flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <Activity className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-white font-sans">
              MacroFactor
            </span>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav className="flex items-center p-1 bg-[#1A1B20] border border-[#272930] rounded-xl">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSwitchView(item.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-white text-[#121316] shadow-sm font-bold'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? item.id === 'trend'
                          ? 'text-[#8250df]'
                          : item.id === 'expenditure'
                          ? 'text-[#f97316]'
                          : item.id === 'strategy'
                          ? 'text-[#3b82f6]'
                          : 'text-[#121316]'
                        : 'text-gray-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Action Buttons: Quick Log & Settings */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onOpenLogModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff6b4a] to-[#f97316] hover:brightness-110 active:scale-95 text-white text-xs font-bold shadow-md shadow-orange-500/25 transition-all"
              title="Log Entry"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Log Entry</span>
            </button>

            <button
              onClick={onOpenMoreModal}
              className="p-2 rounded-xl bg-[#1C1D22] border border-[#272930] text-gray-400 hover:text-white hover:bg-[#25272e] transition-all active:scale-95"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
