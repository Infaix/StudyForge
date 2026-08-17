'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Dialog, Input, EmptyState, PageHeader, Progress } from '@/components/ui';
import { subjectStorage, topicStorage } from '@/lib/storage';
import { Subject, Topic } from '@/types';

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubject, setNewSubject] = useState({ name: '', colour: '#3B82F6', icon: '📚' });

  const loadData = async () => {
    try {
      const [subjectsData, topicsData] = await Promise.all([
        subjectStorage.getAll(),
        topicStorage.getAll(),
      ]);
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

  const handleAddSubject = async () => {
    if (!newSubject.name.trim()) return;

    const subject: Subject = {
      id: crypto.randomUUID(),
      name: newSubject.name,
      colour: newSubject.colour,
      icon: newSubject.icon,
      createdAt: new Date().toISOString(),
    };

    await subjectStorage.create(subject);
    setNewSubject({ name: '', colour: '#3B82F6', icon: '📚' });
    setIsAddDialogOpen(false);
    loadData();
  };

  const handleEditSubject = async () => {
    if (!editingSubject || !newSubject.name.trim()) return;

    const updatedSubject: Subject = {
      ...editingSubject,
      name: newSubject.name,
      colour: newSubject.colour,
      icon: newSubject.icon,
    };

    await subjectStorage.update(updatedSubject);
    setEditingSubject(null);
    setNewSubject({ name: '', colour: '#3B82F6', icon: '📚' });
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteSubject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subject? This will also delete all associated topics.')) return;

    await subjectStorage.delete(id);
    const subjectTopics = topics.filter(t => {
      const subject = subjects.find(s => s.id === id);
      return subject && t.subjectId === id;
    });
    
    for (const topic of subjectTopics) {
      await topicStorage.delete(topic.id);
    }
    
    loadData();
  };

  const openEditDialog = (subject: Subject) => {
    setEditingSubject(subject);
    setNewSubject({ name: subject.name, colour: subject.colour, icon: subject.icon });
    setIsEditDialogOpen(true);
  };

  const getSubjectProgress = (subjectId: string) => {
    const subjectTopics = topics.filter(t => t.subjectId === subjectId);
    if (subjectTopics.length === 0) return 0;
    const avgMastery = subjectTopics.reduce((sum, t) => sum + t.mastery, 0) / subjectTopics.length;
    return Math.round(avgMastery);
  };

  const getTopicCount = (subjectId: string) => {
    return topics.filter(t => t.subjectId === subjectId).length;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Subjects"
        description="Manage your subjects and track your progress"
        action={
          <Button onClick={() => setIsAddDialogOpen(true)}>Add Subject</Button>
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">📚</span>}
          title="No subjects yet"
          description="Create your first subject to start organising your studies."
          action={{
            label: 'Add Subject',
            onClick: () => setIsAddDialogOpen(true),
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map((subject) => (
            <Card key={subject.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                      style={{ backgroundColor: `${subject.colour}20` }}
                    >
                      {subject.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{subject.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {getTopicCount(subject.id)} topics
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(subject)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSubject(subject.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Progress</span>
                      <span className="font-medium text-gray-900 dark:text-white">{getSubjectProgress(subject.id)}%</span>
                    </div>
                    <Progress value={getSubjectProgress(subject.id)} />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push(`/subjects/${subject.id}`)}
                  >
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} title="Add Subject">
        <div className="space-y-4">
          <Input
            label="Subject Name"
            value={newSubject.name}
            onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
            placeholder="e.g., Mathematics"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Colour</label>
            <div className="flex gap-2">
              {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map((colour) => (
                <button
                  key={colour}
                  onClick={() => setNewSubject({ ...newSubject, colour })}
                  className={`w-8 h-8 rounded-full border-2 ${
                    newSubject.colour === colour ? 'border-gray-900 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: colour }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {['📚', '🔬', '💻', '🎨', '📝', '🧮', '🌍', '📖'].map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewSubject({ ...newSubject, icon })}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border-2 ${
                    newSubject.icon === icon ? 'border-gray-900 dark:border-white bg-gray-100 dark:bg-gray-700' : 'border-transparent'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddSubject} className="flex-1">Add Subject</Button>
            <Button variant="secondary" onClick={() => setIsAddDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} title="Edit Subject">
        <div className="space-y-4">
          <Input
            label="Subject Name"
            value={newSubject.name}
            onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
            placeholder="e.g., Mathematics"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Colour</label>
            <div className="flex gap-2">
              {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map((colour) => (
                <button
                  key={colour}
                  onClick={() => setNewSubject({ ...newSubject, colour })}
                  className={`w-8 h-8 rounded-full border-2 ${
                    newSubject.colour === colour ? 'border-gray-900 dark:border-white' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: colour }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {['📚', '🔬', '💻', '🎨', '📝', '🧮', '🌍', '📖'].map((icon) => (
                <button
                  key={icon}
                  onClick={() => setNewSubject({ ...newSubject, icon })}
                  className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center border-2 ${
                    newSubject.icon === icon ? 'border-gray-900 dark:border-white bg-gray-100 dark:bg-gray-700' : 'border-transparent'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleEditSubject} className="flex-1">Save Changes</Button>
            <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
