import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useNavigate } from '@/app/router-shim';
import { supabase } from '@/integrations/supabase/client';
import { loadCurrentUser } from '@/app/auth/store';
import { BRAND_NAME, APP_TAGLINE } from '@/app/theme';


export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState<'user' | 'admin'>('user');

  useEffect(() => {
    fetch('/api/public/auth/bootstrap').then((r) => r.json()).then((d) => setNeedsSetup(!!d.needs_setup)).catch(() => {});
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (needsSetup) {
        const r = await fetch('/api/public/auth/bootstrap', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ full_name: fullName, email: identifier, password }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.detail ?? 'Setup failed');
        setNeedsSetup(false);
      }
      const resp = await fetch('/api/public/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail ?? 'Login failed — please try again');
      const { error: sErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (sErr) throw sErr;
      const me = await loadCurrentUser();
      if (!me) throw new Error('Your account has no access. Contact a super admin.');
      if (mode === 'admin' && me.role !== 'super_admin') {
        await supabase.auth.signOut();
        throw new Error('This account is not a super admin. Use the User sign-in instead.');
      }
      nav(me.role === 'super_admin' ? '/dashboard' : '/students');
    } catch (err) {
      const m = (err as Error).message ?? '';
      setError(/fetch|network/i.test(m) ? 'Network problem — check your connection and try again.' : m || 'Login failed — please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        p: 3,
        background:
          'radial-gradient(1200px 600px at 10% 0%, #DCE7FF 0%, transparent 60%),' +
          'radial-gradient(900px 500px at 90% 100%, #E7F2FF 0%, transparent 55%),' +
          '#F5F7FB',
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 420 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
          <Box
            sx={{
              width: 40, height: 40, borderRadius: 2,
              bgcolor: 'primary.main', color: 'white',
              display: 'grid', placeItems: 'center',
              fontWeight: 800, fontSize: 16, letterSpacing: 0.5,
            }}
          >
            TT
          </Box>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>
              {BRAND_NAME}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {APP_TAGLINE}
            </Typography>
          </Box>
        </Stack>

        <Card sx={{ p: 1 }}>
          <CardContent>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              Secure access portal
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Sign in to manage organizations, users, candidates and ID cards.
            </Typography>

            {!needsSetup && (
              <Tabs
                value={mode}
                onChange={(_, v) => { setMode(v); setError(null); }}
                variant="fullWidth"
                sx={{ mb: 2 }}
              >
                <Tab value="user" label="User" />
                <Tab value="admin" label="Super admin" />
              </Tabs>
            )}

            <form onSubmit={submit}>
              <Stack spacing={2}>
                {needsSetup && (
                  <>
                    <Alert severity="info">No super admin exists yet. Create the first administrator account.</Alert>
                    <TextField label="Full name" fullWidth required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                  </>
                )}
                <TextField
                  label={needsSetup ? 'Email' : 'Email, user ID or phone'}
                  autoComplete="username"
                  autoFocus
                  fullWidth
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={mode === 'admin' ? 'admin@company.com or your user ID' : 'you@company.com or +91 98123 45678'}
                  required
                />
                <TextField
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {error && <Alert severity="error">{error}</Alert>}
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={loading}
                  sx={{ py: 1.2 }}
                >
                  {loading ? 'Signing in…' : needsSetup ? 'Create admin & sign in' : 'Sign in'}
                </Button>
              </Stack>
            </form>
          </CardContent>
        </Card>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
          © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
