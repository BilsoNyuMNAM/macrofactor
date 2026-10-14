import React from 'react';
import { ChevronLeft, GraduationCap } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack: () => void;
  onHelp: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onBack, onHelp }) => {
  return (
    <header className="flex items-center justify-between py-2 text-white">
      <button
        onClick={onBack}
        className="p-2 text-gray-400 hover:text-white transition-colors active:scale-95"
        title="Back / Switch View"
      >
        <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
      </button>

      <h1 className="text-base font-semibold tracking-tight text-white">{title}</h1>

      <button
        onClick={onHelp}
        className="p-2 text-gray-400 hover:text-white transition-colors active:scale-95"
        title="Educational Help"
      >
        <GraduationCap className="w-5 h-5" />
      </button>
    </header>
  );
};
