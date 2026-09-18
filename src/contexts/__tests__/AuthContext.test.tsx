// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

vi.mock('@/lib/client/goalStore', () => ({ migrateAnonymousGoals: vi.fn() }));

function LoginProbe() {
  const { signIn, user } = useAuth();
  const [error, setError] = useState('');
  const [value, setValue] = useState('');
  return <><input aria-label="Login" value={value} onChange={e => setValue(e.target.value)} />
    <button onClick={async () => setError((await signIn(value, 'test-only')).error ?? '')}>Sign in</button>
    <p role="alert">{error}</p><p>{user ? 'Authenticated' : 'Anonymous'}</p></>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mockResponses(...responses: [number, unknown][]) {
  const fetcher = vi.fn();
  for (const [status, body] of responses) fetcher.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('sign-in form lifecycle', () => {
  it('preserves the mounted form and displays rejected credentials', async () => {
    mockResponses([401, { user: null }], [401, { error: 'Invalid credentials' }]);
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    const input = await screen.findByLabelText('Login');
    fireEvent.change(input, { target: { value: 'existing-user' } });
    fireEvent.click(screen.getByText('Sign in'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid credentials'));
    expect(screen.getByLabelText('Login')).toBe(input);
    expect((input as HTMLInputElement).value).toBe('existing-user');
  });

  it('does not claim success when the cookie or identity lookup fails', async () => {
    mockResponses([401, { user: null }], [200, { userId: 'u1' }], [401, { user: null }]);
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    fireEvent.click(await screen.findByText('Sign in'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('session could not be confirmed'));
    expect(screen.getByText('Anonymous')).toBeTruthy();
  });

  it('resolves authenticated identity after successful login', async () => {
    mockResponses([401, { user: null }], [200, { userId: 'u1' }], [200, { user: { id: 'u1' } }], [200, { success: false }]);
    render(<AuthProvider><LoginProbe /></AuthProvider>);
    fireEvent.click(await screen.findByText('Sign in'));
    expect(await screen.findByText('Authenticated')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('');
  });
});
