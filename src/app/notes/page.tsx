'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, EmptyState } from '@/components/ui';

export default function NotesPage() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [notes, setNotes] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editingNote, setEditingNote] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load user's notes from profile
    const userId = user.id;
    // In a real app, would load from storage
    // For now, use empty state
    setNotes([]);
  }, [user]);

  const handleCreateNote = async () => {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    
    const newNote = {
      id: 'note-' + Date.now(),
      title: title.trim(),
      content: content.trim(),
      createdAt: new Date().toISOString(),
      userId: user.id,
    };
    
    setNotes((prev) => [newNote, ...prev]);
    setTitle('');
    setContent('');
  };

  const handleEditNote = async (note: any) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
  };

  const handleSaveEdit = async () => {
    if (!title.trim() || !content.trim()) return;
    setError(null);
    
    setNotes((prev) =>
      prev.map((note) => note.id === editingNote?.id ? { ...editingNote, title: title.trim(), content: content.trim() } : note)
    );
    setEditingNote(null);
    setTitle('');
    setContent('');
  };

  const handleDeleteNote = async (noteId: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Notes
        </h1>

        {/* Notes List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {notes.length === 0 ? (
            <EmptyState
              icon={<span className="text-3xl">📝</span>}
              title="No notes yet"
              description="Create your first note to get started."
              action={{
                label: 'New Note',
                onClick: () => {},
              }}
            />
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <Card key={note.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {note.title}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditNote(note)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteNote(note.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* New Note Form */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
              New Note
            </h3>
          </CardHeader>
          <CardContent>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title..."
            />
            <Input
              label="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note here..."
              rows={4}
              className="h-[200px] resize-none"
            />
            <div className="flex gap-3 pt-4">
              <Button onClick={handleCreateNote} className="flex-1">
                Save Note
              </Button>
              <Button variant="secondary" onClick={() => { setTitle(''); setContent(''); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}