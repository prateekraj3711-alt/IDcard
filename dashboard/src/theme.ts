import { createTheme, alpha } from '@mui/material/styles';

const brand = {
  primary: '#1F3A8A',   // deep enterprise blue
  primaryLight: '#3B82F6',
  accent: '#0EA5E9',
  surface: '#F5F7FB',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  success: '#0F9D58',
  danger: '#DC2626',
  warning: '#D97706',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: brand.primary, light: brand.primaryLight },
    secondary: { main: brand.accent },
    background: { default: brand.surface, paper: '#FFFFFF' },
    text: { primary: brand.text, secondary: brand.textMuted },
    success: { main: brand.success },
    error: { main: brand.danger },
    warning: { main: brand.warning },
    divider: brand.border,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, "SF Pro Text", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.01em' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
    body2: { color: brand.textMuted },
    overline: { fontWeight: 600, letterSpacing: '0.08em' },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: `1px solid ${brand.border}`,
          boxShadow: '0 1px 2px 0 rgba(15,23,42,0.04)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 10, paddingLeft: 18, paddingRight: 18 },
        containedPrimary: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: 'none',
          borderBottom: `1px solid ${brand.border}`,
          backgroundColor: '#FFFFFF',
          color: brand.text,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${brand.border}`,
          backgroundColor: '#FFFFFF',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          margin: '2px 8px',
          padding: '8px 12px',
          '&.Mui-selected': {
            backgroundColor: alpha(brand.primary, 0.08),
            color: brand.primary,
            '& .MuiListItemIcon-root': { color: brand.primary },
            '&:hover': { backgroundColor: alpha(brand.primary, 0.12) },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10, backgroundColor: '#FFFFFF' },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});

export const BRAND_NAME = 'Stark Industries';
export const APP_TAGLINE = 'Student & Employee ID Platform';
