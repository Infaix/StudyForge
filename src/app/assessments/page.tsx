'use client';

import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { EmptyState, PageHeader, Card, CardContent, Button, Dialog, Input, Badge } from '@/components/ui';
import { assessmentStorage, subjectStorage } from '@/lib/storage';
import { Assessment, Subject } from '@/types';

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isScoreDialogOpen, setIsScoreDialogOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [scoringAssessment, setScoringAssessment] = useState<Assessment | null>(null);
  const [actualScoreInput, setActualScoreInput] = useState('');
  const [newAssessment, setNewAssessment] = useState({
    name: '',
    subjectId: '',
    date: '',
    weighting: 10,
    targetScore: 70,
  });

  const loadData = async () => {
    try {
      const [assessmentsData, subjectsData] = await Promise.all([
        assessmentStorage.getAll(),
        subjectStorage.getAll(),
      ]);
      setAssessments(assessmentsData);
      setSubjects(subjectsData);
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
    setNewAssessment({ name: '', subjectId: '', date: '', weighting: 10, targetScore: 70 });
  };

  const handleAddAssessment = async () => {
    if (!newAssessment.name.trim() || !newAssessment.subjectId || !newAssessment.date) return;

    const assessment: Assessment = {
      id: crypto.randomUUID(),
      subjectId: newAssessment.subjectId,
      name: newAssessment.name,
      date: newAssessment.date,
      weighting: newAssessment.weighting,
      targetScore: newAssessment.targetScore,
      actualScore: null,
      status: 'upcoming',
    };

    await assessmentStorage.create(assessment);
    resetForm();
    setIsAddDialogOpen(false);
    loadData();
  };

  const handleEditAssessment = async () => {
    if (!editingAssessment || !newAssessment.name.trim() || !newAssessment.subjectId || !newAssessment.date) return;

    const updated: Assessment = {
      ...editingAssessment,
      name: newAssessment.name,
      subjectId: newAssessment.subjectId,
      date: newAssessment.date,
      weighting: newAssessment.weighting,
      targetScore: newAssessment.targetScore,
    };

    await assessmentStorage.update(updated);
    setEditingAssessment(null);
    resetForm();
    setIsEditDialogOpen(false);
    loadData();
  };

  const handleDeleteAssessment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this assessment?')) return;
    await assessmentStorage.delete(id);
    loadData();
  };

  const openScoreDialog = (assessment: Assessment) => {
    setScoringAssessment(assessment);
    setActualScoreInput('');
    setIsScoreDialogOpen(true);
  };

  const handleMarkComplete = async () => {
    if (!scoringAssessment) return;

    const numericScore = parseFloat(actualScoreInput);
    if (isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      return;
    }

    const updated: Assessment = {
      ...scoringAssessment,
      actualScore: numericScore,
      status: 'completed',
    };

    await assessmentStorage.update(updated);
    setScoringAssessment(null);
    setIsScoreDialogOpen(false);
    loadData();
  };

  const openEditDialog = (assessment: Assessment) => {
    setEditingAssessment(assessment);
    setNewAssessment({
      name: assessment.name,
      subjectId: assessment.subjectId,
      date: assessment.date,
      weighting: assessment.weighting,
      targetScore: assessment.targetScore,
    });
    setIsEditDialogOpen(true);
  };

  const getDaysUntil = (dateStr: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getUrgencyVariant = (assessment: Assessment): 'danger' | 'warning' | 'info' | 'success' | 'default' => {
    if (assessment.status === 'completed') return 'success';
    const days = getDaysUntil(assessment.date);
    if (days < 0) return 'danger';
    if (days <= 3) return 'danger';
    if (days <= 7) return 'warning';
    return 'info';
  };

  const getUrgencyLabel = (assessment: Assessment): string => {
    if (assessment.status === 'completed') return assessment.actualScore !== null ? `Scored ${assessment.actualScore}%` : 'Completed';
    const days = getDaysUntil(assessment.date);
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} overdue`;
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `${days} days`;
  };

  const upcomingAssessments = assessments.filter(a => a.status === 'upcoming');
  const completedAssessments = assessments.filter(a => a.status === 'completed');

  if (loading) {
    return (
      <DashboardLayout>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Assessments"
        description="Track your exams, assignments, and their impact on your grades"
        action={
          <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>Add Assessment</Button>
        }
      />

      {assessments.length === 0 ? (
        <EmptyState
          icon={<span className="text-6xl">📝</span>}
          title="No assessments yet"
          description="Add your upcoming assessments to help StudyForge prioritise your study."
          action={{
            label: 'Add Assessment',
            onClick: () => { resetForm(); setIsAddDialogOpen(true); },
          }}
        />
      ) : (
        <div className="space-y-8">
          {upcomingAssessments.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Upcoming ({upcomingAssessments.length})
              </h2>
              <div className="space-y-3">
                {upcomingAssessments
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  .map((assessment) => {
                    const subject = subjects.find(s => s.id === assessment.subjectId);
                    return (
                      <Card key={assessment.id}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{assessment.name}</h3>
                                <Badge variant={getUrgencyVariant(assessment)}>
                                  {getUrgencyLabel(assessment)}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {subject?.icon} {subject?.name} &middot; {new Date(assessment.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                              <div className="flex gap-4 text-sm mt-1">
                                <span className="text-gray-500 dark:text-gray-400">Weighting: {assessment.weighting}%</span>
                                <span className="text-gray-500 dark:text-gray-400">Target: {assessment.targetScore}%</span>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button variant="primary" size="sm" onClick={() => openScoreDialog(assessment)}>
                                Mark Complete
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(assessment)}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteAssessment(assessment.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}

          {completedAssessments.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Completed ({completedAssessments.length})
              </h2>
              <div className="space-y-3">
                {completedAssessments
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((assessment) => {
                    const subject = subjects.find(s => s.id === assessment.subjectId);
                    const metTarget = assessment.actualScore !== null && assessment.actualScore >= assessment.targetScore;
                    return (
                      <Card key={assessment.id}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-semibold text-gray-900 dark:text-white truncate">{assessment.name}</h3>
                                <Badge variant={metTarget ? 'success' : 'danger'}>
                                  {assessment.actualScore !== null ? `${assessment.actualScore}%` : 'No score'}
                                  {metTarget ? ' (met target)' : ' (below target)'}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {subject?.icon} {subject?.name} &middot; Target was {assessment.targetScore}%
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteAssessment(assessment.id)}>
                                Delete
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog isOpen={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)} title="Add Assessment">
        <div className="space-y-4">
          <Input
            label="Assessment Name"
            value={newAssessment.name}
            onChange={(e) => setNewAssessment({ ...newAssessment, name: e.target.value })}
            placeholder="e.g., Midterm Exam"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            <select
              value={newAssessment.subjectId}
              onChange={(e) => setNewAssessment({ ...newAssessment, subjectId: e.target.value })}
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
          <Input
            label="Date"
            type="date"
            value={newAssessment.date}
            onChange={(e) => setNewAssessment({ ...newAssessment, date: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Weighting: {newAssessment.weighting}%
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={newAssessment.weighting}
              onChange={(e) => setNewAssessment({ ...newAssessment, weighting: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Score: {newAssessment.targetScore}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={newAssessment.targetScore}
              onChange={(e) => setNewAssessment({ ...newAssessment, targetScore: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddAssessment} className="flex-1">Add Assessment</Button>
            <Button variant="secondary" onClick={() => setIsAddDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} title="Edit Assessment">
        <div className="space-y-4">
          <Input
            label="Assessment Name"
            value={newAssessment.name}
            onChange={(e) => setNewAssessment({ ...newAssessment, name: e.target.value })}
            placeholder="e.g., Midterm Exam"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            <select
              value={newAssessment.subjectId}
              onChange={(e) => setNewAssessment({ ...newAssessment, subjectId: e.target.value })}
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
          <Input
            label="Date"
            type="date"
            value={newAssessment.date}
            onChange={(e) => setNewAssessment({ ...newAssessment, date: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Weighting: {newAssessment.weighting}%
            </label>
            <input
              type="range"
              min="1"
              max="100"
              value={newAssessment.weighting}
              onChange={(e) => setNewAssessment({ ...newAssessment, weighting: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Target Score: {newAssessment.targetScore}%
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={newAssessment.targetScore}
              onChange={(e) => setNewAssessment({ ...newAssessment, targetScore: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleEditAssessment} className="flex-1">Save Changes</Button>
            <Button variant="secondary" onClick={() => setIsEditDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>

      <Dialog isOpen={isScoreDialogOpen} onClose={() => setIsScoreDialogOpen(false)} title="Enter Score">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter your actual score for &ldquo;{scoringAssessment?.name}&rdquo;
          </p>
          <Input
            label="Actual Score (%)"
            type="number"
            min="0"
            max="100"
            value={actualScoreInput}
            onChange={(e) => setActualScoreInput(e.target.value)}
            placeholder="e.g., 85"
          />
          {actualScoreInput && !isNaN(parseFloat(actualScoreInput)) && scoringAssessment && (
            <p className={`text-sm ${parseFloat(actualScoreInput) >= scoringAssessment.targetScore ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {parseFloat(actualScoreInput) >= scoringAssessment.targetScore
                ? `Meets target of ${scoringAssessment.targetScore}%`
                : `Below target of ${scoringAssessment.targetScore}%`}
            </p>
          )}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleMarkComplete} className="flex-1" disabled={!actualScoreInput || isNaN(parseFloat(actualScoreInput))}>
              Save Score
            </Button>
            <Button variant="secondary" onClick={() => setIsScoreDialogOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
