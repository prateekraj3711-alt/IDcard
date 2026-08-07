import {
  AppBar, Avatar, Box, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/SpaceDashboard';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import BadgeIcon from '@mui/icons-material/Badge';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/auth/store';
import { BRAND_NAME } from '@/theme';

const DRAWER = 260;
const nav = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
      { to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
    ],
  },
  {
    section: 'Data',
    items: [
      { to: '/schools', label: 'Schools', icon: <SchoolIcon />, roles: ['super_admin'] as const },
      { to: '/teachers', label: 'Teachers', icon: <PeopleIcon />, roles: ['super_admin'] as const },
      { to: '/students', label: 'Candidates', icon: <BadgeIcon /> },
      { to: '/bulk-import', label: 'Bulk Import', icon: <UploadFileIcon />, roles: ['super_admin'] as const },
    ],
  },
  {
    section: 'Access',
    items: [
      { to: '/admins', label: 'Super Admins', icon: <AdminPanelSettingsIcon />, roles: ['super_admin'] as const },
    ],
  },
  {
    section: 'ID Cards',
    items: [
      { to: '/templates', label: 'Templates', icon: <DesignServicesIcon />, roles: ['super_admin'] as const },
      { to: '/id-cards', label: 'Overview', icon: <CardMembershipIcon /> },
      { to: '/generate', label: 'Generate', icon: <PrintIcon />, roles: ['super_admin'] as const },
    ],
  },
];

export function AppShell() {
  const loc = useLocation();
  const nav_ = useNavigate();
  const { user, clear } = useAuth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const firstName = (user?.full_name ?? '').split(' ')[0] || 'Admin';

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER, boxSizing: 'border-box' },
        }}
      >
        <Toolbar sx={{ px: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar
              variant="rounded"
              sx={{
                bgcolor: 'primary.main', width: 32, height: 32,
                fontSize: 14, fontWeight: 700,
              }}
            >
              SI
            </Avatar>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1 }}>
                {BRAND_NAME}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                ID Platform
              </Typography>
            </Box>
          </Stack>
        </Toolbar>
        <Divider />
        <Box sx={{ py: 1, overflow: 'auto' }}>
          {nav.map((group) => {
            const visible = group.items.filter(
              (n) => !('roles' in n) || (user && (n.roles as readonly string[]).includes(user.role))
            );
            if (visible.length === 0) return null;
            return (
              <Box key={group.section} sx={{ mb: 1 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ pl: 3, display: 'block', fontSize: 11, mt: 1 }}
                >
                  {group.section}
                </Typography>
                <List sx={{ py: 0 }}>
                  {visible.map((n) => (
                    <ListItemButton
                      key={n.to}
                      component={Link}
                      to={n.to}
                      selected={loc.pathname === n.to || loc.pathname.startsWith(n.to + '/')}
                    >
                      <ListItemIcon sx={{ minWidth: 32 }}>{n.icon}</ListItemIcon>
                      <ListItemText
                        primary={n.label}
                        primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Box>
            );
          })}
        </Box>
      </Drawer>

      {/* Main column */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar sx={{ px: { xs: 2, md: 4 } }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                Welcome, {firstName}!
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.role === 'super_admin' ? 'Super Admin' : 'Teacher'} · {user?.email}
              </Typography>
            </Box>
            <Chip
              size="small"
              label={user?.role === 'super_admin' ? 'Super Admin' : 'Teacher'}
              color="primary"
              variant="outlined"
              sx={{ mr: 1 }}
            />
            <Tooltip title="Sign out">
              <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)}>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 14 }}>
                  {firstName.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem
                onClick={() => {
                  clear();
                  nav_('/login');
                }}
              >
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 4 }, flexGrow: 1, maxWidth: 1400, width: '100%' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
