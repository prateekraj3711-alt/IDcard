import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, Divider } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import BadgeIcon from '@mui/icons-material/Badge';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DesignServicesIcon from '@mui/icons-material/DesignServices';
import PrintIcon from '@mui/icons-material/Print';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/store';

const nav = [
  { section: 'Overview', items: [
    { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
  ]},
  { section: 'Data', items: [
    { to: '/schools', label: 'Schools', icon: <SchoolIcon />, roles: ['super_admin'] as const },
    { to: '/teachers', label: 'Teachers', icon: <PeopleIcon />, roles: ['super_admin'] as const },
    { to: '/students', label: 'Students', icon: <BadgeIcon /> },
    { to: '/bulk-import', label: 'Bulk Import', icon: <UploadFileIcon />, roles: ['super_admin'] as const },
  ]},
  { section: 'ID Cards', items: [
    { to: '/templates', label: 'Templates', icon: <DesignServicesIcon />, roles: ['super_admin'] as const },
    { to: '/id-cards', label: 'Overview', icon: <CardMembershipIcon /> },
    { to: '/generate', label: 'Generate', icon: <PrintIcon />, roles: ['super_admin'] as const },
  ]},
];

const DRAWER = 260;

export function AppShell() {
  const loc = useLocation();
  const nav_ = useNavigate();
  const { user, clear } = useAuth();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Super Admin — Student & Employee ID Portal</Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>{user?.full_name}</Typography>
          <IconButton color="inherit" onClick={() => { clear(); nav_('/login'); }}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{ width: DRAWER, [`& .MuiDrawer-paper`]: { width: DRAWER, boxSizing: 'border-box' } }}
      >
        <Toolbar />
        <List>
          {nav.map((group) => {
            const visible = group.items.filter((n) => !n.roles || (user && n.roles.includes(user.role as never)));
            if (visible.length === 0) return null;
            return (
              <Box key={group.section}>
                <Typography variant="overline" color="text.secondary" sx={{ pl: 2 }}>{group.section}</Typography>
                {visible.map((n) => (
                  <ListItemButton key={n.to} component={Link} to={n.to} selected={loc.pathname.startsWith(n.to)}>
                    <ListItemIcon>{n.icon}</ListItemIcon>
                    <ListItemText primary={n.label} />
                  </ListItemButton>
                ))}
                <Divider sx={{ my: 1 }} />
              </Box>
            );
          })}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: `${DRAWER}px` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
