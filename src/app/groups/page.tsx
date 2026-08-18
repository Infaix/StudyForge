'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, Button, Input, Badge, EmptyState } from '@/components/ui';
import { groupStorage, groupMemberStorage } from '@/lib/storage';
import { Group, GroupMember } from '@/types';

interface GroupWithMeta extends Group {
  memberCount: number;
  isMember: boolean;
  isAdmin: boolean;
  members: GroupMember[];
}

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [groups, setGroups] = useState<GroupWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<(GroupMember & { username?: string })[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
    }
  }, [mounted, user, router]);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const memberRecords = await groupMemberStorage.getAllByUser(user.id);
      const uniqueGroupIds = [...new Set(memberRecords.map((m) => m.groupId))];

      const groupsWithMeta = await Promise.all(
        uniqueGroupIds.map(async (groupId) => {
          const group = await groupStorage.get(groupId);
          if (!group) return null;

          const members = await groupMemberStorage.getAllByGroup(groupId);
          const isAdmin = members.some((m) => m.userId === user.id && m.role === 'administrator');

          return {
            ...group,
            memberCount: members.length,
            isMember: members.some((m) => m.userId === user.id),
            isAdmin,
            members,
          };
        })
      );

      setGroups(groupsWithMeta.filter((g): g is GroupWithMeta => g !== null));
    } catch (err) {
      console.error('Failed to load groups:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (mounted && user) {
      loadGroups();
    }
  }, [mounted, user, loadGroups]);

  const handleCreateGroup = async () => {
    if (!user || !newGroupName.trim()) return;
    setFormError(null);
    setCreatingGroup(true);

    try {
      const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const memberId = `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const newGroup: Group = {
        id: groupId,
        name: newGroupName.trim(),
        description: newGroupDescription.trim() || null,
        icon: null,
        subjectId: null,
        administratorId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await groupStorage.create(newGroup);
      await groupMemberStorage.create({
        id: memberId,
        groupId: groupId,
        userId: user.id,
        role: 'administrator',
        joinedAt: new Date().toISOString(),
      });

      setNewGroupName('');
      setNewGroupDescription('');
      setShowCreateForm(false);
      await loadGroups();
    } catch (err) {
      console.error('Failed to create group:', err);
      setFormError('Failed to create group. Please try again.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleJoinGroup = async (groupId: string) => {
    if (!user) return;
    setActionLoading(groupId);
    try {
      await groupMemberStorage.create({
        id: `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId,
        userId: user.id,
        role: 'member',
        joinedAt: new Date().toISOString(),
      });
      await loadGroups();
    } catch (err) {
      console.error('Failed to join group:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!user) return;
    setActionLoading(groupId);
    try {
      const members = await groupMemberStorage.getAllByGroup(groupId);
      const member = members.find((m) => m.userId === user.id);
      if (member) {
        await groupMemberStorage.delete(member.id);
      }
      await loadGroups();
    } catch (err) {
      console.error('Failed to leave group:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!user) return;
    setActionLoading(groupId);
    try {
      const members = await groupMemberStorage.getAllByGroup(groupId);
      await Promise.all(members.map((m) => groupMemberStorage.delete(m.id)));
      await groupStorage.delete(groupId);
      await loadGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleMembers = async (group: GroupWithMeta) => {
    if (expandedGroupId === group.id) {
      setExpandedGroupId(null);
      setExpandedMembers([]);
      return;
    }

    setLoadingMembers(true);
    setExpandedGroupId(group.id);
    try {
      const enriched = await Promise.all(
        group.members.map(async (m) => {
          const profile = await import('@/lib/storage').then((s) =>
            s.userProfileStorage.get(m.userId)
          );
          return {
            ...m,
            username: profile?.displayName || profile?.username || m.userId,
          };
        })
      );
      setExpandedMembers(enriched);
    } catch (err) {
      console.error('Failed to load members:', err);
      setExpandedMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!mounted || !user) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Groups</h1>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm((prev) => !prev)}
          >
            {showCreateForm ? 'Cancel' : '+ New Group'}
          </Button>
        </div>

        {showCreateForm && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Create a Group
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {formError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                )}
                <Input
                  label="Group Name"
                  placeholder="e.g. Physics Study Group"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <Input
                  label="Description (optional)"
                  placeholder="What is this group for?"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                />
                <Button
                  variant="primary"
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !newGroupName.trim()}
                >
                  {creatingGroup ? 'Creating...' : 'Create Group'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              My Groups ({groups.length})
            </h2>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4">Loading...</p>
            ) : groups.length === 0 ? (
              <EmptyState
                icon={<span className="text-3xl">👥</span>}
                title="No groups yet"
                description="Create a group to start studying with friends."
                action={{
                  label: 'Create Group',
                  onClick: () => setShowCreateForm(true),
                }}
              />
            ) : (
              <div className="space-y-4">
                {groups.map((group) => (
                  <Card key={group.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 min-w-0">
                          {group.icon ? (
                            <img
                              src={group.icon}
                              alt={group.name}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium flex-shrink-0">
                              {getInitials(group.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                {group.name}
                              </h3>
                              {group.isAdmin && (
                                <Badge variant="info" className="text-xs">
                                  Admin
                                </Badge>
                              )}
                            </div>
                            {group.description && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                                {group.description}
                              </p>
                            )}
                            <button
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                              onClick={() => handleToggleMembers(group)}
                            >
                              {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {group.isAdmin ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Delete "${group.name}"? This will remove all members.`)) {
                                  handleDeleteGroup(group.id);
                                }
                              }}
                              disabled={actionLoading === group.id}
                            >
                              {actionLoading === group.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLeaveGroup(group.id)}
                              disabled={actionLoading === group.id}
                            >
                              {actionLoading === group.id ? 'Leaving...' : 'Leave'}
                            </Button>
                          )}
                        </div>
                      </div>

                      {expandedGroupId === group.id && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Members
                          </p>
                          {loadingMembers ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Loading members...</p>
                          ) : expandedMembers.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">No members found.</p>
                          ) : (
                            <div className="space-y-2">
                              {expandedMembers.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span className="text-gray-900 dark:text-white">
                                    {member.username}
                                  </span>
                                  <Badge
                                    variant={member.role === 'administrator' ? 'info' : 'default'}
                                    className="text-xs"
                                  >
                                    {member.role === 'administrator' ? 'Admin' : 'Member'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
