'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, EmptyState } from '@/components/ui';

interface Note {
  id: string;
  title: string;
  content: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

const SUBJECTS = [
  'Maths Methods',
  'Physics',
  'English Language',
  'Software Development',
  'French',
  'Vietnamese',
  'General',
];

export default function NotesPage() {
  const { user } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('General');
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'title'>('updatedAt');

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const res = await fetch('/api/data/notes', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setNotes(data);
        }
      } catch {}
    };
    loadNotes();
  }, []);

  const handleCreateNote = async () => {
    if (!title.trim() || !content.trim()) return;
    const now = new Date().toISOString();
    const newNote: Note = {
      id: 'note-' + Date.now(),
      title: title.trim(),
      content: content.trim(),
      subject,
      createdAt: now,
      updatedAt: now,
      userId: user.id,
    };
    try {
      await fetch('/api/data/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(newNote),
      });
      setNotes((prev) => [newNote, ...prev]);
    } catch {}
    setTitle('');
    setContent('');
    setSubject('General');
  };

  const handleEditNote = (note: Note) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setSubject(note.subject);
  };

  const handleSaveEdit = async () => {
    if (!editingNote || !title.trim() || !content.trim()) return;
    const updated = { ...editingNote, title: title.trim(), content: content.trim(), subject, updatedAt: new Date().toISOString() };
    try {
      await fetch(`/api/data/notes/${editingNote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      });
      setNotes((prev) => prev.map((n) => n.id === editingNote.id ? updated : n));
    } catch {}
    setEditingNote(null);
    setTitle('');
    setContent('');
    setSubject('General');
  };

  const handleCancelEdit = () => {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setSubject('General');
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await fetch(`/api/data/notes/${noteId}`, { method: 'DELETE', credentials: 'include' });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {}
  };

  const filteredNotes = notes
    .filter((n) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.subject.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
    });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <DashboardLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Notes
        </h1>

        {/* Search and Sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'updatedAt' | 'createdAt' | 'title')}
            className="px-3 py-2 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
          >
            <option value="updatedAt">Last Modified</option>
            <option value="createdAt">Date Created</option>
            <option value="title">Title</option>
          </select>
        </div>

        {/* Notes List */}
        {filteredNotes.length === 0 ? (
          <EmptyState
            icon={<span className="text-3xl">📝</span>}
            title={searchQuery ? 'No matching notes' : 'No notes yet'}
            description={searchQuery ? 'Try a different search term.' : 'Create your first note below.'}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            {filteredNotes.map((note) => (
              <Card
                key={note.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleEditNote(note)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-white truncate">
                      {note.title}
                    </h3>
                    <div className="flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {note.subject}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-3 mb-2">
                    {note.content.length > 150 ? note.content.substring(0, 150) + '...' : note.content}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(note.updatedAt)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Note Editor */}
        <Card>
          <CardHeader>
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">
              {editingNote ? 'Edit Note' : 'New Note'}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Content
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your note here..."
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm resize-y min-h-[200px]"
                />
              </div>
              <div className="flex gap-3 pt-2">
                {editingNote ? (
                  <>
                    <Button onClick={handleSaveEdit} className="flex-1">
                      Save Changes
                    </Button>
                    <Button variant="secondary" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onClick={handleCreateNote} className="flex-1">
                      Save Note
                    </Button>
                    <Button variant="secondary" onClick={() => { setTitle(''); setContent(''); setSubject('General'); }}>
                      Clear
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
