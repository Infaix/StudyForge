'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  EmptyState,
  PageHeader,
  Dialog,
  Badge,
} from '@/components/ui';
import { useTheme } from '@/contexts/ThemeContext';
import {
  subjectStorage,
  topicStorage,
  assessmentStorage,
  studySessionStorage,
  studyTaskStorage,
  flashcardStorage,
  flashcardDeckStorage,
  quizStorage,
  quizQuestionStorage,
  quizResultStorage,
} from '@/lib/storage';

const STORE_CONFIG = [
  { name: 'subjects', label: 'Subjects', storage: subjectStorage, key: 'subjects' as const },
  { name: 'topics', label: 'Topics', storage: topicStorage, key: 'topics' as const },
  { name: 'assessments', label: 'Assessments', storage: assessmentStorage, key: 'assessments' as const },
  { name: 'studySessions', label: 'Study Sessions', storage: studySessionStorage, key: 'studySessions' as const },
  { name: 'studyTasks', label: 'Study Tasks', storage: studyTaskStorage, key: 'studyTasks' as const },
  { name: 'flashcards', label: 'Flashcards', storage: flashcardStorage, key: 'flashcards' as const },
  { name: 'flashcardDecks', label: 'Flashcard Decks', storage: flashcardDeckStorage, key: 'flashcardDecks' as const },
  { name: 'quizzes', label: 'Quizzes', storage: quizStorage, key: 'quizzes' as const },
  { name: 'quizQuestions', label: 'Quiz Questions', storage: quizQuestionStorage, key: 'quizQuestions' as const },
  { name: 'quizResults', label: 'Quiz Results', storage: quizResultStorage, key: 'quizResults' as const },
] as const;

const APP_VERSION = '1.0.0';

type ExportData = Record<string, unknown[]>;

function isValidItem(item: unknown): item is { id: string } {
  return typeof item === 'object' && item !== null && 'id' in item && typeof (item as Record<string, unknown>).id === 'string';
}

function getExportDataKeys(): (keyof ExportData)[] {
  return STORE_CONFIG.map((c) => c.key);
}

export default function SettingsPage() {
  const { theme, setTheme, actualTheme } = useTheme();

  const [dataCounts, setDataCounts] = useState<Record<string, number>>({});
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ExportData | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDataCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const config of STORE_CONFIG) {
      try {
        const items = await config.storage.getAll();
        counts[config.name] = items.length;
      } catch {
        counts[config.name] = 0;
      }
    }
    setDataCounts(counts);
  }, []);

  useEffect(() => {
    loadDataCounts();
  }, [loadDataCounts]);

  const showStatus = (type: 'success' | 'error', text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 4000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data: ExportData = {};
      for (const config of STORE_CONFIG) {
        data[config.key] = await config.storage.getAll();
      }

      const exportPayload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        data,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `studyforge-export-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showStatus('success', 'Data exported successfully');
    } catch {
      showStatus('error', 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showStatus('error', 'Please select a JSON file');
      return;
    }

    setImportPreview(null);
    setImportFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);

        if (!parsed.data || typeof parsed.data !== 'object') {
          showStatus('error', 'Invalid file format: missing "data" object');
          setImportFile(null);
          return;
        }

        const validKeys = getExportDataKeys();
        const preview: ExportData = {};
        const errors: string[] = [];

        for (const key of validKeys) {
          const value = parsed.data[key];
          if (value === undefined || value === null) {
            preview[key] = [];
            continue;
          }
          if (!Array.isArray(value)) {
            errors.push(`"${key}" must be an array`);
            continue;
          }
          const validItems = value.filter(isValidItem);
          if (validItems.length !== value.length) {
            errors.push(`${value.length - validItems.length} invalid item(s) in "${key}" (missing id)`);
          }
          preview[key] = validItems;
        }

        if (errors.length > 0) {
          showStatus('error', errors.join('; '));
          setImportFile(null);
          return;
        }

        setImportPreview(preview);
        setShowImportDialog(true);
      } catch {
        showStatus('error', 'Failed to parse JSON file');
        setImportFile(null);
      }
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!importPreview) return;
    setIsImporting(true);

    try {
      if (importMode === 'replace') {
        for (const config of STORE_CONFIG) {
          const existing = await config.storage.getAll();
          for (const item of existing) {
            await config.storage.delete(item.id);
          }
        }
      }

      for (const config of STORE_CONFIG) {
        const items = importPreview[config.key] || [];
        for (const item of items) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await config.storage.update(item as any);
        }
      }

      setShowImportDialog(false);
      setImportPreview(null);
      setImportFile(null);
      await loadDataCounts();
      showStatus('success', 'Data imported successfully');
    } catch {
      showStatus('error', 'Failed to import data');
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);

    try {
      for (const config of STORE_CONFIG) {
        const existing = await config.storage.getAll();
        for (const item of existing) {
          await config.storage.delete(item.id);
        }
      }

      setShowResetDialog(false);
      setResetConfirmText('');
      await loadDataCounts();
      showStatus('success', 'All data has been reset');
    } catch {
      showStatus('error', 'Failed to reset data');
    } finally {
      setIsResetting(false);
    }
  };

  const totalItems = Object.values(dataCounts).reduce((sum, c) => sum + c, 0);

  const themeOptions: { value: 'light' | 'dark' | 'system'; label: string; description: string }[] = [
    { value: 'light', label: 'Light', description: 'Always use light theme' },
    { value: 'dark', label: 'Dark', description: 'Always use dark theme' },
    { value: 'system', label: 'System', description: 'Match your device settings' },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Settings"
        description="Customize your StudyForge experience"
      />

      {statusMessage && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Theme</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Currently using <Badge variant="info">{actualTheme}</Badge> theme
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    theme === option.value
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {option.label}
                    </span>
                    {theme === option.value && (
                      <Badge variant="success">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Data Overview</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {totalItems} total items across all data stores
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {totalItems === 0 ? (
              <EmptyState
                icon={<span className="text-4xl">📦</span>}
                title="No data yet"
                description="Start adding subjects, topics, and study sessions to see your data here."
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {STORE_CONFIG.map((config) => (
                  <div
                    key={config.name}
                    className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-center"
                  >
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {dataCounts[config.name] ?? 0}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {config.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Export Data</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Download all your data as a JSON file for backup or transfer.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleExport}
              disabled={isExporting || totalItems === 0}
            >
              {isExporting ? 'Exporting...' : 'Export All Data'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import Data</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Restore data from a StudyForge export file.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Permanently delete all your local data. This action cannot be undone.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              variant="danger"
              onClick={() => setShowResetDialog(true)}
              disabled={totalItems === 0}
            >
              Reset All Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">About StudyForge</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Version</span>
                <span className="font-medium text-gray-900 dark:text-white">{APP_VERSION}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Description</span>
                <span className="font-medium text-gray-900 dark:text-white text-right max-w-xs">
                  Local-first student productivity platform
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Privacy</span>
                <Badge variant="success">All data stays on your device</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        isOpen={showImportDialog}
        onClose={() => {
          setShowImportDialog(false);
          setImportPreview(null);
          setImportFile(null);
        }}
        title="Import Data"
      >
        {importPreview && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Preview of data to import:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {STORE_CONFIG.map((config) => {
                const count = importPreview[config.key]?.length ?? 0;
                return (
                  <div
                    key={config.name}
                    className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-gray-700/50"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{config.label}</span>
                    <Badge variant={count > 0 ? 'info' : 'default'}>{count}</Badge>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Import mode:
              </p>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="merge"
                    checked={importMode === 'merge'}
                    onChange={() => setImportMode('merge')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Merge (add to existing)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="importMode"
                    value="replace"
                    checked={importMode === 'replace'}
                    onChange={() => setImportMode('replace')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Replace (clear first)</span>
                </label>
              </div>
            </div>

            {importMode === 'replace' && (
              <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  This will delete all existing data before importing.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowImportDialog(false);
                  setImportPreview(null);
                  setImportFile(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? 'Importing...' : 'Import Data'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        isOpen={showResetDialog}
        onClose={() => {
          setShowResetDialog(false);
          setResetConfirmText('');
        }}
        title="Reset All Data"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-300 font-medium">
              Warning: This will permanently delete all your data including:
            </p>
            <ul className="mt-2 text-sm text-red-700 dark:text-red-400 list-disc list-inside">
              <li>All subjects and topics</li>
              <li>Study sessions and tasks</li>
              <li>Flashcards and quizzes</li>
              <li>Assessment records</li>
            </ul>
          </div>

          <Input
            label='Type "RESET" to confirm'
            placeholder="RESET"
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
          />

          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setShowResetDialog(false);
                setResetConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReset}
              disabled={resetConfirmText !== 'RESET' || isResetting}
            >
              {isResetting ? 'Resetting...' : 'Delete All Data'}
            </Button>
          </div>
        </div>
      </Dialog>
    </DashboardLayout>
  );
}
