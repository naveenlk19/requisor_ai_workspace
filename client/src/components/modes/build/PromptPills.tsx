import { useState, useEffect } from "react";
import {
  MessageSquare,
  Search,
  Lightbulb,
  BarChart3,
  Users,
  Target,
  Calendar,
  Shield,
  ClipboardList,
  Zap,
} from "lucide-react";
import type { AppMode } from "./ModeToggle";

interface PromptPill {
  id: string;
  text: string;
  icon: any;
}

interface PromptPillsProps {
  mode: AppMode;
  onSelect: (text: string) => void;
  isVisible: boolean;
  variant?: "welcome" | "inline";
}

const BUILD_PILLS: PromptPill[] = [
  { id: "b1", text: "What problems are users facing?", icon: Search },
  { id: "b2", text: "Identify feature opportunities", icon: Lightbulb },
  { id: "b3", text: "Analyze this transcript for pain points", icon: MessageSquare },
  { id: "b4", text: "Compare feature requests across interviews", icon: Users },
  { id: "b5", text: "What should we build next?", icon: Zap },
];

const PLAN_PILLS: PromptPill[] = [
  { id: "p1", text: "Create a project plan for...", icon: ClipboardList },
  { id: "p2", text: "Break this down into milestones", icon: Target },
  { id: "p3", text: "Estimate timeline for this scope", icon: Calendar },
  { id: "p4", text: "Add testing and QA tasks", icon: BarChart3 },
  { id: "p5", text: "Suggest risk mitigation steps", icon: Shield },
];

export function PromptPills({ mode, onSelect, isVisible, variant = "welcome" }: PromptPillsProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => setVisible(true), 150);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  const pills = mode === "build" ? BUILD_PILLS : PLAN_PILLS;

  const isWelcome = variant === "welcome";

  return (
    <div
      className={`transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {isWelcome && (
        <p className="text-xs text-gray-400 mb-2 text-center">Try asking</p>
      )}
      <div className={`flex flex-wrap gap-2 ${isWelcome ? "justify-center" : "justify-start"}`}>
        {pills.map((pill, idx) => {
          const Icon = pill.icon;
          return (
            <button
              key={pill.id}
              onClick={() => onSelect(pill.text)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] ${
                mode === "build"
                  ? "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
                  : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
              }`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <Icon className="h-3 w-3" />
              {pill.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
