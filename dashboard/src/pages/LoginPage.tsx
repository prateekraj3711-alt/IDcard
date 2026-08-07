import { useState, type FormEvent } from 'react';
import { Box, Button, Card, CardContent, Stack, TextField, Typography, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AuthApi } from '@/api/endpoints';
import { useAuth } from '@/auth/store';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setTokens, setUser } = useAuth();
  const nav = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const resp = await AuthApi.login({ email, password });
      setTokens(resp.access_token, resp.refresh_token);
      setUser(resp.user);
      nav('/dashboard');
    } catch (err) {
      setError((err as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', background: '#F6F8FC' }}>
      <Card sx={{ width: 400, p: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom>Admin Sign In</Typography>
          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
              <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" variant="contained" size="large" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
