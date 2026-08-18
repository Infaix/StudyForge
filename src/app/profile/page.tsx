'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  EmptyState,
  Badge,
  Progress,
} from '@/components/ui';
import { userProfileStorage } from '@/lib/storage';

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [editing, setEditing] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user.displayName || '');
  const [newUsername, setNewUsername] = useState(user.username);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Keep form in sync with user profile
    setNewDisplayName(user.displayName || '');
    setNewUsername(user.username);
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image size must be under 2MB.');
      return;
    }

    setAvatarFile(file);

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setAvatarUrl(previewUrl);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarUrl(null);
  };

  const handleSave = async () => {
    if (!newDisplayName.trim()) return;
    setError(null);
    setIsSaving(true);

    try {
      if (avatarFile) {
        // Create a compressed version
        const compressedUrl = await compressImage(avatarFile);
        // Store the updated profile
        await userProfileStorage.update({
          id: 'current-user',
          displayName: newDisplayName.trim(),
          username: newUsername.trim(),
          avatarUrl: compressedUrl,
          xp: user.xp,
          level: user.level,
          streak: user.streak,
          studyTimeToday: user.studyTimeToday,
          studyTimeThisWeek: user.studyTimeThisWeek,
          studyTimeThisMonth: user.studyTimeThisMonth,
          studyTimeAllTime: user.studyTimeAllTime,
          friends: user.friends,
          friendRequestsReceived: user.friendRequestsReceived,
          friendRequestsSent: user.friendRequestsSent,
          groups: user.groups,
          achievements: user.achievements,
          createdAt: user.createdAt,
          updatedAt: new Date().toISOString(),
        });
      } else {
        // Just update the profile without avatar change
        await userProfileStorage.update({
          id: 'current-user',
          displayName: newDisplayName.trim(),
          username: newUsername.trim(),
          avatarUrl: avatarUrl || user.avatarUrl,
          xp: user.xp,
          level: user.level,
          streak: user.streak,
          studyTimeToday: user.studyTimeToday,
          studyTimeThisWeek: user.studyTimeThisWeek,
          studyTimeThisMonth: user.studyTimeThisMonth,
          studyTimeAllTime: user.studyTimeAllTime,
          friends: user.friends,
          friendRequestsReceived: user.friendRequestsReceived,
          friendRequestsSent: user.friendRequestsSent,
          groups: user.groups,
          achievements: user.achievements,
          createdAt: user.createdAt,
          updatedAt: new Date().toISOString(),
        });
      }

      setEditing(false);
    } catch (err) {
      setError('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Image compression helper
  const compressImage = (file: File): Promise<string> => {
    return new Promise<string>((resolve) => {
      const maxWidth = 512;
      const maxHeight = 512;
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // Calculate dimensions maintaining aspect ratio
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height *= maxWidth / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width *= maxHeight / height;
              height = maxHeight;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to JPEG with quality 0.8
          const compressedData = canvas.toDataURL('image/jpeg', 0.8);
          // Remove the data:URL prefix and get the blob
          const base64Data = compressedData.split(',')[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Uint8Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const blob = new Blob([byteNumbers], { type: 'image/jpeg' });
          // Create object URL for the compressed blob
          const url = URL.createObjectURL(blob);
          resolve(url);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {user.displayName || user.username}
        </h2>
      </CardHeader>
      <CardContent className="p-6">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={user.displayName || user.username}
            className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
          />
        ) : (
          <Badge className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            {user.username ? user.username[0].toUpperCase() : 'U'}
          </Badge>
        )}

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Member since</p>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {(new Date(user.createdAt).getMonth() + 1)}/{(new Date(user.createdAt).getDate())}/{new Date(user.createdAt).getFullYear()}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Study streak</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {user.streak} {user.streak === 1 ? 'day' : 'days'}
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">XP</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{user.xp} XP</p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Level</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">Level {user.level}</p>
          </div>

          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Study time this week</p>
            <p className="text-lg text-gray-900 dark:text-white">
              {formatStudyTime(user.studyTimeThisWeek)}
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">Profile Picture</h3>
          {avatarUrl ? (
            <div className="flex items-center gap-3 mb-3">
              <img
                src={avatarUrl}
                alt="Profile picture"
                className="w-16 h-16 rounded-full object-cover"
              />
              <Button variant="ghost" size="sm" onClick={handleRemoveAvatar}>
                Remove
              </Button>
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center dark:border-gray-600 hover:border-blue-500 cursor-pointer transition-colors">
              <input
                type="file"
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
              />
              <div>
                <svg
                  className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-5.3-5.3a.75.75 0 0 0-1.06 0L10 13.5 2 21l5.3-5.3a.75.75 0 0 0-1.06-.05z"
                  />
                </svg>
                <p className="text-xs text-gray-500 dark:text-gray-400">Add profile picture</p>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="font-medium text-gray-900 dark:text-white mb-2">Actions</h3>
          <div className="flex gap-3">
            <Button onClick={() => setEditing(true)}>Edit Profile</Button>
            <Button variant="danger" onClick={handleRemoveAvatar}>
              Delete Avatar
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm('Are you sure you want to sign out?')) {
                signOut();
              }
            }}
          >
            Sign Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatStudyTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}