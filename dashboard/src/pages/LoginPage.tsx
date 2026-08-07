import { useMemo, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AuthApi } from '@/api/endpoints';
import { useAuth } from '@/auth/store';
import { BRAND_NAME, APP_TAGLINE } from '@/theme';

function classifyIdentifier(raw: string): { email?: string; phone?: string } {
  const s = raw.trim();
  if (!s) return {};
  if (s.includes('@')) return { email: s };
  return { phone: s };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuth();
  const nav = useNavigate();
  const hello = useMemo(() => `${greeting()} — welcome to ${BRAND_NAME}`, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const { email, phone } = classifyIdentifier(identifier);
      const resp = await AuthApi.login({ email, phone, password });
      setTokens(resp.access_token, resp.refresh_token);
      setUser(resp.user);
      nav('/dashboard');
    } catch (err) {
      setError(
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
          'Login failed — please try again',
      );
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
            SI
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
              {hello}!
            </Typography>
            <Typography variant="body2" sx={{ mb: 3 }}>
              Sign in to the super admin portal to manage schools, teachers, and ID cards.
            </Typography>

            <form onSubmit={submit}>
              <Stack spacing={2}>
                <TextField
                  label="Email or phone"
                  autoComplete="username"
                  autoFocus
                  fullWidth
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@company.com or +91 98123 45678"
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
                  {loading ? 'Signing in…' : 'Sign in'}
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
