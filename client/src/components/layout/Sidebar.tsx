import type React from "react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import { updateProjectLastOpened } from "@/lib/projectUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUpgradeModal } from "@/hooks/useUpgradeModal";
// import {hub} from "@/sections/hub";
import {
  FolderOpen,
  ChevronDown,
  LogOut,
  X,
  Users,
  Bot,
  MessagesSquare,
  User,
  ChevronLeft,
  ChevronUp,
  ChevronRight,
  Settings,
  Brain,
  CreditCard,
  FolderArchiveIcon,
  HelpCircle,
  Zap,
  FolderKanban,
  Search,
  Plus,
  Lightbulb,
  Plug,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface SidebarItemProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isActive?: boolean;
  badge?: React.ReactNode;
  comingSoon?: boolean;
  onClick?: () => void;
  isCollapsed?: boolean;
  testId?: string;
}

function formatTokenShort(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
  return tokens.toString();
}

function SidebarUsageIndicator({ isCollapsed }: { isCollapsed: boolean }) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("sidebar-usage-expanded") !== "false"; } catch { return true; }
  });

  const toggleExpanded = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !expanded;
    setExpanded(next);
    try { localStorage.setItem("sidebar-usage-expanded", String(next)); } catch {}
  };

  const { data: budget } = useQuery<{
    used: number;
    limit: number;
    percentUsed: number;
    warning: boolean;
    planName: string;
    planSlug: string;
    projectLimit: { current: number; max: number };
  }>({
    queryKey: ["/api/tokens/budget"],
    staleTime: 30000,
    refetchInterval: 60000,
  });

  if (!budget) return null;

  const tokenPercent = Math.min(100, Math.round(budget.percentUsed));
  const tokenBarColor = tokenPercent >= 100 ? "bg-red-500" : tokenPercent >= 80 ? "bg-amber-500" : "bg-emerald-500";
  const projPercent = budget.projectLimit.max > 0
    ? Math.min(100, Math.round((budget.projectLimit.current / budget.projectLimit.max) * 100))
    : 0;
  const projBarColor = projPercent >= 100 ? "bg-red-500" : projPercent >= 80 ? "bg-amber-500" : "bg-emerald-500";

  if (isCollapsed) {
    return (
      <div className="px-2 pb-2">
        <Link
          href="/profile"
          className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-emerald-50/60 transition-colors cursor-pointer"
          title={`Tokens: ${formatTokenShort(budget.used)}/${formatTokenShort(budget.limit)} | Projects: ${budget.projectLimit.current}/${budget.projectLimit.max}`}
        >
          <div className="w-7 h-7 rounded-full relative">
            <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="11" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="14" cy="14" r="11" fill="none"
                stroke={tokenPercent >= 100 ? "#ef4444" : tokenPercent >= 80 ? "#f59e0b" : "#10b981"}
                strokeWidth="3"
                strokeDasharray={`${(tokenPercent / 100) * 69.1} 69.1`}
                strokeLinecap="round"
              />
            </svg>
            <Zap className="w-3 h-3 text-slate-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pb-3">
      <div className="rounded-xl bg-slate-50/80 border border-slate-200/60 overflow-hidden transition-all group">
        <button
          onClick={toggleExpanded}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-emerald-50/30 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Usage</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-slate-200 text-slate-500">
              {budget.planName}
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {expanded && (
          <Link
            href="/profile"
            className="block px-3 pb-3 hover:bg-emerald-50/30 transition-colors cursor-pointer"
          >
            <div className="space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-slate-400" />
                    <span className="text-[11px] text-slate-500">Tokens</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">
                    {formatTokenShort(budget.used)}/{formatTokenShort(budget.limit)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${tokenBarColor}`} style={{ width: `${tokenPercent}%` }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1">
                    <FolderKanban className="w-3 h-3 text-slate-400" />
                    <span className="text-[11px] text-slate-500">Projects</span>
                  </div>
                  <span className="text-[11px] font-medium text-slate-600">
                    {budget.projectLimit.current}/{budget.projectLimit.max}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${projBarColor}`} style={{ width: `${projPercent}%` }} />
                </div>
              </div>
            </div>
          </Link>
        )}

        {expanded && budget.planSlug !== "enterprise" && (
          <div className="px-3 pb-3">
            <Link
              href="/pricing"
              onClick={(e) => e.stopPropagation()}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white text-[11px] font-semibold shadow-sm transition-all"
              data-testid="button-sidebar-upgrade"
            >
              <Zap className="w-3 h-3" />
              Upgrade Plan
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarItem({
  href,
  icon,
  children,
  isActive,
  badge,
  comingSoon,
  onClick,
  isCollapsed,
  testId,
}: SidebarItemProps) {
  const content = (
    <div
      className={cn(
        "flex items-center w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
        isActive
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50 shadow-sm"
          : "text-slate-600 hover:bg-emerald-50/50 hover:text-emerald-700",
        comingSoon && "opacity-60",
        isCollapsed ? "justify-center px-2" : "justify-start",
      )}
      title={isCollapsed ? (children as string) : undefined}
    >
      <span className={cn("flex-shrink-0", !isCollapsed && "mr-3")}>
        {icon}
      </span>
      {!isCollapsed && (
        <>
          <span className="flex-1 truncate">{children}</span>
          {badge && <span className="ml-auto">{badge}</span>}
          {comingSoon && (
            <Badge
              variant="secondary"
              className="ml-2 text-xs bg-amber-100 text-amber-700 border-amber-200"
            >
              Soon
            </Badge>
          )}
        </>
      )}
    </div>
  );

  if (comingSoon) {
    return (
      <div className="px-2 mb-1" onClick={onClick} data-testid={testId}>
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="block px-2 mb-1" onClick={onClick} data-testid={testId}>
      {content}
    </Link>
  );
}

const PROJECT_DOT_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-amber-500",
  "bg-indigo-500",
  "bg-rose-500",
  "bg-teal-500",
];

function projectDotColor(id: number) {
  return PROJECT_DOT_COLORS[id % PROJECT_DOT_COLORS.length];
}

interface SidebarProjectsSectionProps {
  projects: Project[];
  isCollapsed: boolean;
  onItemClick: () => void;
  currentLocation: string;
}

function SidebarProjectsSection({
  projects,
  isCollapsed,
  onItemClick,
  currentLocation,
}: SidebarProjectsSectionProps) {
  const { showUpgrade } = useUpgradeModal();
  const { data: projectLimits } = useQuery<{ allowed: boolean; current: number; max: number }>({
    queryKey: ["/api/user/project-limits"],
    staleTime: 30000,
  });

  const handleNewProjectClick = (e: React.MouseEvent) => {
    if (projectLimits && !projectLimits.allowed) {
      e.preventDefault();
      showUpgrade("project_limit");
      return;
    }
    onItemClick();
  };

  const [hasUserToggled, setHasUserToggled] = useState(false);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("requisor:sidebar_projects_expanded");
      if (stored !== null) return stored === "true";
    } catch {}
    return true;
  });
  const [search, setSearch] = useState("");

  // For users with 2+ projects who have never manually toggled, default to collapsed
  // once the projects list has loaded.
  useEffect(() => {
    if (hasUserToggled) return;
    try {
      const stored = localStorage.getItem("requisor:sidebar_projects_expanded");
      if (stored !== null) return;
    } catch {}
    if (projects.length >= 2) {
      setExpanded(false);
    }
  }, [projects.length, hasUserToggled]);

  const toggleExpanded = () => {
    setHasUserToggled(true);
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem("requisor:sidebar_projects_expanded", String(next));
    } catch {}
  };

  const activeMatch = currentLocation.match(/^\/projects\/(\d+)/);
  const activeId = activeMatch ? Number(activeMatch[1]) : null;
  const activeProject = activeId
    ? projects.find((p) => p.id === activeId)
    : null;

  const sorted = [...projects].sort((a, b) => {
    const dateA = a.lastOpenedAt || a.updatedAt || a.createdAt;
    const dateB = b.lastOpenedAt || b.updatedAt || b.createdAt;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const filtered = search
    ? sorted.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : sorted;

  // <10 projects: show all. Otherwise: top 5 most-recent (or all matching search).
  const visible =
    projects.length < 10 || search ? filtered : filtered.slice(0, 5);

  const handleProjectClick = async (project: Project) => {
    try {
      await updateProjectLastOpened(project.id);
    } catch {}
    onItemClick();
  };

  const expandedContent = (
    <div className="space-y-2.5">
      {activeProject ? (
        <Link
          href={`/projects/${activeProject.id}`}
          onClick={() => handleProjectClick(activeProject)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200"
    
          data-testid="link-current-project"
        >
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white/70",
              projectDotColor(activeProject.id),
            )}
          />
            <span className="text-xs font-semibold text-white truncate flex-1">
            {activeProject.name}
          </span>
        </Link>
      ) : projects.length > 0 ? (
          <div className="px-3 py-2 rounded-xl bg-slate-50 text-[11px] text-slate-400 italic">
          No project selected
        </div>
      ) : null}

      {projects.length > 1 && (
        <div className="relative">
          <Search className="h-3 w-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Switch project…"
            className="h-8 text-xs pl-7 rounded-lg border-slate-200 bg-white shadow-sm focus-visible:ring-emerald-400/40 focus-visible:border-emerald-300"
            data-testid="input-project-search"
          />
        </div>
      )}

      {visible.length > 0 ? (
        <div className="space-y-1">
          {projects.length >= 10 && !search && (
            <div className="px-1 pt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Recent
            </div>
          )}
          {visible.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              onClick={() => handleProjectClick(project)}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-150 group",
                activeId === project.id
                ? "bg-white border-emerald-200 shadow-sm shadow-emerald-500/10"
                : "bg-white/60 border-transparent hover:bg-white hover:border-slate-200 hover:shadow-sm",
              )}
              data-testid={`link-project-${project.id}`}
            >
              <span
                className={cn(
                  "w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm",
                  projectDotColor(project.id),
                )}
              />
                <span className="text-xs font-medium text-slate-700 truncate flex-1 group-hover:text-emerald-700">
                {project.name}
              </span>
            </Link>
          ))}
        </div>
      ) : (
          <div className="px-3 py-2.5 rounded-xl bg-slate-50 text-[11px] text-slate-400">
         
          {search ? "No projects match" : "No projects yet"}
        </div>
      )}

        <div className="flex flex-col gap-1.5 pt-2 mt-1 border-t border-slate-100">

        <Link
          href="/projects"
          onClick={onItemClick}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 rounded-xl border border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-700 transition-all shadow-sm"
          data-testid="link-all-projects"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          All projects
        </Link>
        <Link
          href="/create-project"
          onClick={handleNewProjectClick}
          className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-white rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-md hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200"
          data-testid="link-new-project"
        >
          <Plus className="h-3.5 w-3.5" />
          New project
        </Link>
      </div>
    </div>
  );

  if (isCollapsed) {
    return (
      <div className="px-2 mb-2" data-tour="sidebar-projects">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="flex items-center justify-center w-full p-2 rounded-xl text-slate-600 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-500 hover:text-white hover:shadow-md hover:shadow-emerald-500/20 transition-all duration-200"
              title="Projects"
              data-testid="button-projects-flyout"
            >
              <FolderOpen className="h-5 w-5" />
            </button>
          </PopoverTrigger>
              <PopoverContent side="right" align="start" className="w-64 p-3 rounded-2xl shadow-xl border-slate-200">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
              Project
            </div>
            {expandedContent}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="px-2 mb-3" data-tour="sidebar-projects">
      <button
        onClick={toggleExpanded}
        className="flex items-center justify-between w-full px-2 py-1.5 rounded-lg hover:bg-emerald-50/60 transition-colors"
        data-testid="button-projects-toggle"
        aria-expanded={expanded}
      >
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">          Project
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        )}
      </button>
      {expanded && <div className="mt-2 px-1">{expandedContent}</div>}
    </div>
  );
}

interface SidebarBottomUtilityProps {
  user: { firstName?: string; lastName?: string; username?: string; email: string } | null;
  isCollapsed: boolean;
  onItemClick: () => void;
  currentLocation: string;
}

function SidebarBottomUtility({
  user,
  isCollapsed,
  onItemClick,
  currentLocation,
}: SidebarBottomUtilityProps) {
  const { logoutMutation } = useAuth();
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("requisor:sidebar_utility_expanded");
      if (stored !== null) return stored === "true";
      const seen = localStorage.getItem("requisor:sidebar_v2_seen");
      if (!seen) {
        localStorage.setItem("requisor:sidebar_v2_seen", "true");
        return true;
      }
    } catch {}
    return false;
  });

  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      localStorage.setItem("requisor:sidebar_utility_expanded", String(next));
    } catch {}
  };

  const initials = (() => {
    if (!user) return "U";
    if (user.firstName && user.lastName)
      return `${user.firstName[0]}${user.lastName[0]}`;
    if (user.username) return user.username.substring(0, 2).toUpperCase();
    return "U";
  })();

  const displayName = (() => {
    if (!user) return "User";
    if (user.firstName && user.lastName)
      return `${user.firstName} ${user.lastName}`;
    return user.username || "User";
  })();

  const items: Array<{
    href: string;
    icon: React.ReactNode;
    label: string;
    testId: string;
  }> = [
    {
      href: "/pricing",
      icon: <CreditCard className="h-4 w-4" />,
      label: "Pricing",
      testId: "link-utility-pricing",
    },
    {
      href: "/team",
      icon: <Users className="h-4 w-4" />,
      label: "Team",
      testId: "link-utility-team",
    },
    {
      href: "/forms",
      icon: <FolderArchiveIcon className="h-4 w-4" />,
      label: "Forms",
      testId: "link-utility-forms",
    },
    {
      href: "/settings",
      icon: <Settings className="h-4 w-4" />,
      label: "Settings",
      testId: "link-utility-settings",
    },
    {
      href: "/profile",
      icon: <User className="h-4 w-4" />,
      label: "Profile",
      testId: "link-utility-profile",
    },
  ];

  const utilityList = (
    <div className="space-y-0.5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onItemClick}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors",
            currentLocation === item.href
              ? "bg-emerald-50 text-emerald-700"
              : "text-slate-600 hover:bg-emerald-50/60 hover:text-emerald-700",
          )}
          data-testid={item.testId}
        >
          {item.icon}
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
      ))}
      <button
        onClick={() => logoutMutation.mutate()}
        className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-600 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        data-testid="button-utility-signout"
      >
        <LogOut className="h-4 w-4" />
        <span className="flex-1 truncate text-left">Sign out</span>
      </button>
    </div>
  );

  if (!user) {
    return (
      <div
        className={cn(
          "border-t border-emerald-100/50 p-4",
          isCollapsed && "px-2",
        )}
      >
        <div className={cn("text-center", isCollapsed && "px-1")}>
          {!isCollapsed ? (
            <>
              <div className="text-sm text-slate-600 mb-3">
                Sign in to access your projects
              </div>
              <Button
                asChild
                size="sm"
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-200/50"
              >
                <a href="/api/login">Sign In</a>
              </Button>
            </>
          ) : (
            <Button
              asChild
              size="sm"
              className="w-8 h-8 p-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              <a href="/api/login" title="Sign In">
                <User className="h-4 w-4 text-white" />
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isCollapsed) {
    return (
      <div className="border-t border-emerald-100/50 p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="flex items-center justify-center w-full p-1 rounded-lg hover:bg-emerald-50/60 transition-colors"
              title={displayName}
              data-testid="button-utility-flyout"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white font-medium text-sm shadow-lg shadow-emerald-200/50">
                {initials}
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-56 p-2">
            <div className="px-2 py-1.5 mb-1 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-800 truncate">
                {displayName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {user.username || user.email}
              </div>
            </div>
            {utilityList}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="border-t border-emerald-100/50 p-2">
      <button
        onClick={toggleExpanded}
        className="flex items-center justify-between w-full px-2 py-2 rounded-lg hover:bg-emerald-50/60 transition-colors"
        data-testid="button-utility-toggle"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white font-medium text-xs shadow shadow-emerald-200/50 flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-sm font-medium text-slate-800 truncate">
              {displayName}
            </div>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
        )}
      </button>
      {expanded && <div className="mt-2 px-1 pb-1">{utilityList}</div>}
    </div>
  );
}

interface SidebarProps {
  onCloseMobile?: () => void;
  onRestartTour?: () => void;
}

function Sidebar({ onCloseMobile, onRestartTour }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { toast } = useToast();


  // Fetch real projects data
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: !!user,
  });

  // Toggle sidebar collapsed state
  const toggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Handle mobile item click - close sidebar on mobile
  const handleItemClick = () => {
    if (isMobile && onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <aside
      className={cn(
        "bg-white md:bg-gradient-to-b md:from-white md:via-emerald-50/10 md:to-teal-50/20 border-r border-emerald-100/50 h-screen flex flex-col shadow-lg transition-all duration-300",
        isCollapsed ? "w-16" : isMobile ? "w-[280px]" : "w-64",
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "p-4 border-b border-emerald-100/50 bg-gradient-to-r from-white to-emerald-50/30",
          isCollapsed && "px-2",
        )}
      >
        <div className="flex items-center justify-between">
          {isCollapsed ? (
            <div className="flex items-center justify-center w-full">
              <img
                src="/favicon/favicon.png"
                alt="Requisor Logo"
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  console.error("Logo failed to load");
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="flex items-center space-x-3">
              <img
                src="/favicon/favicon.png"
                alt="Requisor Logo"
                className="w-10 h-10 object-contain"
                onError={(e) => {
                  console.error("Logo failed to load");
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className="flex flex-col">
                <h1 className="text-lg font-bold text-slate-800">
                  Requisor <span className="text-emerald-600">AI</span>
                </h1>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-1">
            {!isMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleCollapsed}
                className="h-8 w-8 p-0 hover:bg-emerald-100/50"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-slate-600" />
                ) : (
                  <ChevronLeft className="h-4 w-4 text-slate-600" />
                )}
              </Button>
            )}
            {isMobile && onCloseMobile && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCloseMobile}
                className="h-8 w-8 p-0 hover:bg-emerald-100/50"
              >
                <X className="h-4 w-4 text-slate-600" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {/* Main Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {/* Section 1: Projects (collapsible, top) */}
        {user && (
          <SidebarProjectsSection
            projects={projects}
            isCollapsed={isCollapsed}
            onItemClick={handleItemClick}
            currentLocation={location}
          />
        )}

        {/* Section 2: Work (always visible) */}
        {!isCollapsed && (
          <div className="px-4 mb-2 mt-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Work
          </div>
        )}

        <div data-tour="sidebar-agent">
          <SidebarItem
            href="/"
            icon={<MessagesSquare className="h-5 w-5" />}
            isActive={location === "/"}
            onClick={handleItemClick}
            isCollapsed={isCollapsed}
          >
            Requisor Agent
          </SidebarItem>
        </div>

        <div data-tour="sidebar-brain">
          <SidebarItem
            href="/brain"
            icon={<Brain className="h-5 w-5" />}
            isActive={
              location === "/brain" ||
              location.startsWith("/brain?") ||
              location === "/meetings" ||
              location === "/conversations" ||
              location === "/evidence"
            }
            onClick={handleItemClick}
            isCollapsed={isCollapsed}
          >
            Brain
          </SidebarItem>
        </div>

        <SidebarItem
          href="/past-discoveries"
          icon={<Lightbulb className="h-5 w-5" />}
          isActive={
            location === "/past-discoveries" ||
            location.startsWith("/past-discoveries?")
          }
          onClick={handleItemClick}
          isCollapsed={isCollapsed}
        >
          Discoveries
        </SidebarItem>

        <SidebarItem
          href="/ai-agents"
          icon={<Bot className="h-5 w-5" />}
          isActive={location === "/ai-agents"}
          onClick={handleItemClick}
          isCollapsed={isCollapsed}
          badge={
            <Badge
              variant="secondary"
              className="text-xs bg-gradient-to-r from-blue-100 to-purple-100 text-purple-700"
            >
              Hub
            </Badge>
          }
        >
          AI Agents
        </SidebarItem>

        <SidebarItem
          href="/connect"
          icon={<Plug className="h-5 w-5" />}
          isActive={location === "/connect"}
          onClick={handleItemClick}
          isCollapsed={isCollapsed}
        >
          Connect
        </SidebarItem>
      </nav>
      {user && onRestartTour && (
        <div className={cn("px-4 pb-2", isCollapsed && "px-2")}>
          <button
            onClick={() => {
              if (location !== "/") {
                setLocation("/");
                setTimeout(() => onRestartTour?.(), 600);
              } else {
                onRestartTour?.();
              }
            }}
            className={cn(
              "flex items-center w-full rounded-lg text-xs text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/60 transition-colors",
              isCollapsed ? "justify-center p-2" : "gap-2 px-3 py-2"
            )}
            title="Take a tour"
          >
            <HelpCircle className="h-4 w-4 flex-shrink-0" />
            {!isCollapsed && "Take a Tour"}
          </button>
        </div>
      )}

      {/* Usage Limits Indicator (unchanged) */}
      {user && <SidebarUsageIndicator isCollapsed={isCollapsed} />}

      {/* Bottom utility: collapsible user pill expanding to Pricing/Team/Forms/Settings/Profile/Sign out */}
      <SidebarBottomUtility
        user={user as any}
        isCollapsed={isCollapsed}
        onItemClick={handleItemClick}
        currentLocation={location}
      />
    </aside>
  );
}

export { Sidebar };
