import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Hammer, Map, ChevronDown, Check } from "lucide-react";

export type AppMode = "build" | "plan";

interface ModeToggleProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPos({
        top: rect.top - 8,
        left: rect.left,
      });
    }
  }, [open]);

  const options = [
    {
      id: "build" as AppMode,
      label: "Build",
      description: "Analyze usage & feedback. Create features. Delegate to coding agents.",
      icon: Hammer,
    },
    {
      id: "plan" as AppMode,
      label: "Plan",
      description: "Define scope, timelines, milestones.",
      icon: Map,
    },
  ];

  const current = options.find((o) => o.id === mode)!;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
      >
        <current.icon className="h-4 w-4" />
        {current.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed w-80 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-[9999]"
            style={{
              top: popoverPos.top,
              left: popoverPos.left,
              transform: "translateY(-100%)",
            }}
          >
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  onModeChange(option.id);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
              >
                <option.icon className="h-5 w-5 mt-0.5 text-gray-500 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{option.label}</span>
                    {mode === option.id && <Check className="h-4 w-4 text-emerald-500" />}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                </div>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
