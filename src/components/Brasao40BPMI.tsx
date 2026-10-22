import React from 'react';
import { UNIT_CONFIG } from '../config/unitConfig.ts';

interface Brasao40BPMIProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  alt?: string;
  src?: string;
}

export const Brasao40BPMI: React.FC<Brasao40BPMIProps> = ({
  className = '',
  size = 'md',
  alt = `Brasão de Armas do ${UNIT_CONFIG.unitShort} - PMESP`,
  src = UNIT_CONFIG.crestUrl
}) => {
  // Preset sizes
  const sizeClasses = {
    sm: 'w-10 h-auto',
    md: 'w-20 h-auto sm:w-24',
    lg: 'w-28 h-auto sm:w-32',
    xl: 'w-36 h-auto sm:w-44'
  };

  const finalClass = className || sizeClasses[size];

  return (
    <div className="relative inline-flex items-center justify-center select-none">
      <img
        src={src}
        alt={alt}
        className={`${finalClass} object-contain filter drop-shadow-sm`}
        loading="eager"
        referrerPolicy="no-referrer"
        onError={(e) => {
          const target = e.currentTarget;
          if (!target.src.includes('/brasao_22bpmi.png')) {
            target.src = '/brasao_22bpmi.png';
          }
        }}
      />
    </div>
  );
};
