import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FolderKanban, Lock } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useUpgradeModal } from "@/hooks/useUpgradeModal";
import ManualProjectCreator from "@/components/projects/ManualProjectCreator";
import { AIProjectCreator } from "@/components/dashboard/AIProjectCreator";

function ProjectLimitWall({ current, max }: { current: number; max: number }) {
  const { showUpgrade } = useUpgradeModal();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-800 mb-2">
        Project limit reached
      </h2>
      <p className="text-slate-500 mb-1">
        You've used <span className="font-semibold text-slate-700">{current} of {max}</span> projects on your current plan.
      </p>
      <p className="text-slate-400 text-sm mb-8">
        Upgrade to create unlimited projects and unlock advanced features.
      </p>
      <Button
        onClick={() => showUpgrade("project_limit")}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-8"
      >
        Upgrade Plan
      </Button>
      <Link href="/projects" className="mt-4 text-sm text-slate-400 hover:text-slate-600 transition-colors">
        Back to projects
      </Link>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-5 w-80" />
      <Skeleton className="h-10 w-72 mx-auto" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function CreateProjectPage() {
  const [selectedTab, setSelectedTab] = useState<string>("manual");
  const { isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: projectLimits, isLoading: limitsLoading } = useQuery<{ allowed: boolean; current: number; max: number }>({
    queryKey: ["/api/user/project-limits"],
    enabled: isAuthenticated,
  });

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/api/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl py-10 px-6">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl py-10 px-6">
        {limitsLoading ? (
          <LoadingSkeleton />
        ) : projectLimits && !projectLimits.allowed ? (
          <ProjectLimitWall current={projectLimits.current} max={projectLimits.max} />
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-2">Create New Project</h1>
            <p className="text-slate-600 mb-8">
              Choose how you want to create your project
            </p>

            <Tabs
              defaultValue="manual"
              value={selectedTab}
              onValueChange={setSelectedTab}
              className="space-y-8"
            >
              <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto">
                <TabsTrigger value="manual">Manual Setup</TabsTrigger>
                <TabsTrigger value="ai">AI-Powered</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="space-y-8">
                <Card className="bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>Manual Project Setup</CardTitle>
                    <CardDescription>
                      Create a project by filling out the details yourself. This
                      gives you complete control over your project setup.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ManualProjectCreator />
                  </CardContent>
                </Card>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>Why choose manual setup?</AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-slate-600">
                        Manual setup is ideal when you have a clear vision for your
                        project and want to customize every aspect. You can create
                        your project structure exactly as you need it, add specific
                        milestones and tasks, and set precise due dates and
                        priorities.
                      </p>
                      <div className="mt-4 text-sm">
                        <h4 className="font-medium">Benefits:</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600">
                          <li>Complete control over project structure</li>
                          <li>Ability to create custom milestones</li>
                          <li>Flexibility to add tasks and subtasks as needed</li>
                          <li>Set precise due dates and priorities</li>
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>

              <TabsContent value="ai" className="space-y-4">
                <Card className="bg-white shadow-sm">
                  <CardHeader>
                    <CardTitle>AI-Powered Project Creation</CardTitle>
                    <CardDescription>
                      Let our AI assistant create a complete project plan based on
                      your idea. Just describe what you want to build.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AIProjectCreator />
                  </CardContent>
                </Card>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>
                      Why use AI-powered project creation?
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-slate-600">
                        AI-powered creation is perfect when you need inspiration or
                        want to save time on project planning. Our AI analyzes best
                        practices across thousands of projects to generate a
                        comprehensive project plan based on your idea.
                      </p>
                      <div className="mt-4 text-sm">
                        <h4 className="font-medium">Benefits:</h4>
                        <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600">
                          <li>Save time on project planning</li>
                          <li>Get intelligent task breakdowns</li>
                          <li>Discover tasks you might have overlooked</li>
                          <li>Benefit from industry best practices</li>
                          <li>Customize the generated plan to fit your needs</li>
                        </ul>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
}
