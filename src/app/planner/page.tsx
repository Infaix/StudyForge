'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, Button, Dialog, Input, EmptyState, PageHeader, Badge } from '@/components/ui';
import { studyTaskStorage, subjectStorage, topicStorage } from '@/lib/storage';
import { StudyTask, Subject, Topic } from '@/types';

type Tab = 'today' | 'upcoming' | 'completed';

const today = new Date().toISOString().split('T')[0];

const isToday = (dueDate: string | null) => {
  if (!dueDate) return false;
  return dueDate <= today;
};

const isUpcoming = (dueDate: string | null) => {
  if (!dueDate) return false;
  return dueDate > today;
};

const priorityOrder: Record<StudyTask['priority'], number> = { high: 0, medium: 1, low: 2 };

const sortTasks = (list: StudyTask[]) => {
  return [...list].sort((a, b) => {
    const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    const aDate = a.dueDate ?? '9999-12-31';
    const bDate = b.dueDate ?? '9999-12-31';
    return aDate.localeCompare(bDate);
  });
};

export default function PlannerPage() {
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    subjectId: '',
    topicId: '',
    dueDate: '',
    priority: 'medium' as StudyTask['priority'],
  });

  const loadData = async () => {
    try {
      const [tasksData, subjectsData, topicsData] = await Promise.all([
        studyTaskStorage.getAll(),
        subjectStorage.getAll(),
        topicStorage.getAll(),
      ]);
      setTasks(tasksData);
      setSubjects(subjectsData);
      setTopics(topicsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setNewTask({ title: '', description: '', subjectId: '', topicId: '', dueDate: '', priority: 'medium' });
  };

  const todayTasks = useMemo(() => sortTasks(tasks.filter(t => !t.completed && isToday(t.dueDate))), [tasks]);
  const upcomingTasks = useMemo(() => sortTasks(tasks.filter(t => !t.completed && isUpcoming(t.dueDate))), [tasks]);
  const completedTasks = useMemo(() => sortTasks(tasks.filter(t => t.completed)), [tasks]);

  const filteredTasks = activeTab === 'today' ? todayTasks : activeTab === 'upcoming' ? upcomingTasks : completedTasks;

  const filteredTopics = useMemo(() => {
    if (!newTask.subjectId) return [];
    return topics.filter(t => t.subjectId === newTask.subjectId);
  }, [topics, newTask.subjectId]);

  const getSubjectName = (subjectId: string) => subjects.find(s => s.id === subjectId);
  const getTopicName = (topicId: string | null) => {
    if (!topicId) return null;
    return topics.find(t => t.id === topicId);
  };

  const priorityVariant = (priority: StudyTask['priority']): 'danger' | 'warning' | 'info' => {
    switch (priority) {
      case 'high': return 'danger';
      case 'medium': return 'warning';
      case 'low': return 'info';
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim() || !newTask.subjectId) return;

    const task: StudyTask = {
      id: crypto.randomUUID(),
      subjectId: newTask.subjectId,
      topicId: newTask.topicId || null,
      title: newTask.title,
      description: newTask.description || null,
      dueDate: newTask.dueDate || null,
      completed: false,
      priority: newTask.priority,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    await studyTaskStorage.create(task);
    resetForm();
    setIsAddDialogOpen(false);
    loadData();
  };

  const handleEditTask = async () => {
    if (!editingTask || !newTask.title.trim() || !newTask.subjectId) return;

    const updated: StudyTask = {
      ...editingTask,
      subjectId: newTask.subjectId,
      topicId: newTask.topicId || null,
      title: newTask.title,
      description: newTask.description || null,
      dueDate: newTask.dueDate || null,
      priority: newTask.priority,
    };

    await studyTaskStorage.update(updated);
    setEditingTask(null);
    resetForm();
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteTask = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    await studyTaskStorage.delete(id);
    loadData();
  };

  const handleToggleComplete = async (task: StudyTask) => {
    const updated: StudyTask = {
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null,
    };
    await studyTaskStorage.update(updated);
    loadData();
  };

  const openEditDialog = (task: StudyTask) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description ?? '',
      subjectId: task.subjectId,
      topicId: task.topicId ?? '',
      dueDate: task.dueDate ?? '',
      priority: task.priority,
    });
    setIsEditDialogOpen(true);
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'today', label: 'Today', count: todayTasks.length },
    { key: 'upcoming', label: 'Upcoming', count: upcomingTasks.length },
    { key: 'completed', label: 'Completed', count: completedTasks.length },
  ];

  const tabEmptyStates: Record<Tab, { icon: string; title: string; description: string }> = {
    today: {
      icon: '✅',
      title: 'All caught up!',
      description: 'No tasks due today or overdue. Great work!',
    },
    upcoming: {
      icon: '📅',
      title: 'No upcoming tasks',
      description: 'Create a task with a future due date to see it here.',
    },
    completed: {
      icon: '🎉',
      title: 'No completed tasks yet',
      description: 'Finish a task and it will show up here.',
    },
  };

  const formatDueDate = (dueDate: string | null) => {
    if (!dueDate) return 'No due date';
    const date = new Date(dueDate + 'T00:00:00');
    const diff = Math.ceil((date.getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
    if (diff === 0) return 'Due today';
    if (diff === 1) return 'Due tomorrow';
    return `Due ${date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
  };

  const dueDateBadgeVariant = (dueDate: string | null): 'danger' | 'warning' | 'info' | 'success' | 'default' => {
    if (!dueDate) return 'default';
    const diff = Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'danger';
    if (diff === 0) return 'warning';
    if (diff <= 3) return 'info';
    return 'default';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const renderTaskCard = (task: StudyTask) => {
    const subject = getSubjectName(task.subjectId);
    const topic = getTopicName(task.topicId);

    return (
      <Card key={task.id} className="hover:shadow-md transition-shadow">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h3 className={`font-semibold text-gray-900 dark:text-white ${task.completed ? 'line-through opacity-60' : ''}`}>
                  {task.title}
                </h3>
                <Badge variant={priorityVariant(task.priority)}>
                  {task.priority}
                </Badge>
                {activeTab !== 'completed' && task.dueDate && (
                  <Badge variant={dueDateBadgeVariant(task.dueDate)}>
                    {formatDueDate(task.dueDate)}
                  </Badge>
                )}
              </div>
              {task.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1 line-clamp-2">
                  {task.description}
                </p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {subject?.icon} {subject?.name}
                {topic && <> &middot; {topic.name}</>}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant={task.completed ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => handleToggleComplete(task)}
              >
                {task.completed ? 'Undo' : 'Done'}
              </Button>
              {!task.completed && (
                <Button variant="ghost" size="sm" onClick={() => openEditDialog(task)}>
                  Edit
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleDeleteTask(task.id)}>
                Delete
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const dialogForm = (onSave: () => void, saveLabel: string) => (
    <div className="space-y-4">
      <Input
        label="Task Title"
        value={newTask.title}
        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
        placeholder="e.g., Review Chapter 5 notes"
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
        <textarea
          value={newTask.description}
          onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
          placeholder="Optional notes about this task"
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
        <select
          value={newTask.subjectId}
          onChange={(e) => setNewTask({ ...newTask, subjectId: e.target.value, topicId: '' })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
        >
          <option value="">Select a subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.icon} {subject.name}
            </option>
          ))}
        </select>
      </div>
      {newTask.subjectId && filteredTopics.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic (optional)</label>
          <select
            value={newTask.topicId}
            onChange={(e) => setNewTask({ ...newTask, topicId: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">No specific topic</option>
            {filteredTopics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <Input
        label="Due Date"
        type="date"
        value={newTask.dueDate}
        onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
      />
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map((priority) => (
            <button
              key={priority}
              onClick={() => setNewTask({ ...newTask, priority })}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                newTask.priority === priority
                  ? priority === 'high'
                    ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                    : priority === 'medium'
                    ? 'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-4">
        <Button onClick={onSave} className="flex-1">{saveLabel}</Button>
        <Button variant="secondary" onClick={() => { resetForm(); setIsAddDialogOpen(false); setIsEditDialogOpen(false); setEditingTask(null); }} className="flex-1">Cancel</Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title="Study Planner"
        description="Organise and prioritise your study tasks"
        action={
          <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>Add Task</Button>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">📋</span>}
          title="No tasks yet"
          description="Create your first study task to start planning your sessions."
          action={{
            label: 'Add Task',
            onClick: () => { resetForm(); setIsAddDialogOpen(true); },
          }}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={<span className="text-6xl">{tabEmptyStates[activeTab].icon}</span>}
              title={tabEmptyStates[activeTab].title}
              description={tabEmptyStates[activeTab].description}
              action={
                activeTab !== 'completed'
                  ? {
                      label: 'Add Task',
                      onClick: () => { resetForm(); setIsAddDialogOpen(true); },
                    }
                  : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filteredTasks.map(renderTaskCard)}
            </div>
          )}
        </div>
      )}

      <Dialog isOpen={isAddDialogOpen} onClose={() => { setIsAddDialogOpen(false); resetForm(); }} title="Add Task">
        {dialogForm(handleAddTask, 'Add Task')}
      </Dialog>

      <Dialog isOpen={isEditDialogOpen} onClose={() => { setIsEditDialogOpen(false); setEditingTask(null); resetForm(); }} title="Edit Task">
        {dialogForm(handleEditTask, 'Save Changes')}
      </Dialog>
    </DashboardLayout>
  );
}
