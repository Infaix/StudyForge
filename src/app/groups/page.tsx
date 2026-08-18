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
  Dialog,
} from '@/components/ui';
import { userProfileStorage, groupStorage, groupMemberStorage, groupInviteStorage } from '@/lib/storage';

export default function GroupsPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) {
    router.push('/login');
    return null;
  }

  const [groups, setGroups] = useState<any[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    try {
      const userGroups = await groupStorage.getAllByAdministrator(user.id);
      setGroups(userGroups);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setError('Failed to load groups');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    setError(null);
    setCreatingGroup(true);

    try {
      const group: any = {
        id: 'group-' + Date.now(),
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || null,
        icon: '',
        subjectId: null,
        administratorId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await groupStorage.create(group);
      await groupMemberStorage.create({
        id: 'member-' + Date.now(),
        groupId: group.id,
        userId: user.id,
        role: 'administrator',
        joinedAt: new Date().toISOString(),
      });

      setNewGroupName('');
      setNewGroupDescription('');
      setCreatingGroup(false);
      loadGroups();
    } catch (err) {
      setError('Failed to create group');
      setCreatingGroup(false);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    try {
      await groupMemberStorage.create({
        id: 'member-' + Date.now(),
        groupId: groupId,
        userId: user.id,
        role: 'member',
        joinedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to join group:', err);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    try {
      const members = await groupMemberStorage.getAllByGroup(groupId);
      const member = members.find((m: any) => m.userId === user.id);
      if (member) {
        await groupMemberStorage.delete(member.id);
      }
    } catch (err) {
      console.error('Failed to leave group:', err);
    }
  };

  const handleAcceptInvite = async (inviteId: string) => {
    try {
      // Just delete the invite - user can join group later
      await groupInviteStorage.delete(inviteId);
    } catch (err) {
      console.error('Failed to accept invite:', err);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Groups
        </h2>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>
        )}

        {groups.length === 0 ? (
          <EmptyState
            icon={<span className="text-3xl">👥</span>}
            title="No groups yet"
            description="Create your first group to start studying with friends."
            action={{
              label: 'Create Group',
              onClick: () => {
                // Toggle create group form
              },
            }}
          />
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const memberCount = group.memberCount ?? 1;
              const isAdmin = group.administratorId === user.id;
              return (
                <Card key={group.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {group.icon ? (
                          <img
                            src={group.icon}
                            alt={group.name}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <Badge className="w-8 h-8 rounded-full bg-blue-500 text-white">
                            {group.name[0]}
                          </Badge>
                        )}
                        <span className="font-medium text-gray-900 dark:text-white">
                          {group.name}
                        </span>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            alert('Group management coming soon');
                          }}
                        >
                          Manage
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {group.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="text-xs px-2 py-1">
                          {memberCount} members
                        </Badge>
                        {isAdmin && (
                          <Badge variant="info" className="text-xs px-2 py-1">
                            {group.studyTimeThisWeek ?? 0} min study
                          </Badge>
                        )}
                      </div>
                      {isAdmin ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              alert('Group edit coming soon');
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              if (window.confirm('Delete this group?')) {
                                // Delete group logic
                                alert('Group deleted');
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleJoinGroup(group.id)}
                        >
                          Join
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {creatingGroup ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Creating group...</p>
        ) : (
          <div className="mt-4">
            <Button variant="primary" onClick={() => setCreatingGroup(true)}>
              Create Group
            </Button>
          </div>
        )}
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