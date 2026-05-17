import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string | number;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface DropdownProps {
  options: DropdownOption[];
  value?: string | number;
  onChange?: (value: any) => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  trigger,
  disabled = false,
  align = 'left',
  className = '',
  triggerClassName = 'flex items-center gap-1 hover:text-emerald-500 transition-colors'
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={`relative inline-flex text-left ${className}`} ref={containerRef}>
      <div 
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={disabled ? 'opacity-50 cursor-not-allowed select-none' : 'cursor-pointer select-none ' + triggerClassName}
      >
        {trigger ? trigger : (
          <>
             <span>{selectedOption?.label ?? 'Select...'}</span>
             <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-50 mt-8 w-max min-w-[100px] rounded-lg shadow-lg bg-white dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10 ${align === 'right' ? 'right-0' : 'left-0'}`}
          >
            <div className="py-1 p-1 flex flex-col gap-0.5 max-h-64 overflow-y-auto custom-scrollbar">
              {options.map((option) => (
                <button
                  key={option.value.toString()}
                  onClick={() => {
                    onChange?.(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
                    value === option.value 
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 font-medium' 
                      : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700/50'
                  }`}
                >
                  {option.icon && <span className="opacity-70 flex-shrink-0">{option.icon}</span>}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
