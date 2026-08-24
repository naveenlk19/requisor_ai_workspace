
import { useQuery, } from '@tanstack/react-query';

interface Milestone {
  id: number;
  projectId: number;
  name: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not-started' | 'in-progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

interface MilestonesTabProps {
  projectId: number;
}

export function MilestonesTab({ projectId }: MilestonesTabProps) {
  // Temporarily simplify to isolate the issue
  const { data: milestones = [], isLoading, error } = useQuery({
    queryKey: ['/api/projects', projectId, 'milestones'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/milestones`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch milestones');
      return response.json();
    },
    retry: 2,
    retryDelay: 1000
  });
  
  // Simplified error/loading states
  if (error) {
    return <div>Error loading milestones: {error.message}</div>;
  }
  
  if (isLoading) {
    return <div>Loading milestones...</div>;
  }
  
  // Simple milestone display to test
  return (
    <div>
      <h2>Milestones ({milestones.length})</h2>
      {milestones.length === 0 ? (
        <p>No milestones found</p>
      ) : (
        <ul>
          {milestones.map((milestone: any) => (
            <li key={milestone.id}>
              {milestone.name || 'Unnamed milestone'} - {milestone.status || 'unknown status'}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}