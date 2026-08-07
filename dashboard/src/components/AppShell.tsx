import { AppBar, Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SchoolIcon from '@mui/icons-material/School';
import PeopleIcon from '@mui/icons-material/People';
import BadgeIcon from '@mui/icons-material/Badge';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/store';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { to: '/schools', label: 'Schools', icon: <SchoolIcon />, roles: ['super_admin'] as const },
  { to: '/teachers', label: 'Teachers', icon: <PeopleIcon />, roles: ['super_admin'] as const },
  { to: '/students', label: 'Students', icon: <BadgeIcon /> },
  { to: '/id-cards', label: 'ID Cards', icon: <CardMembershipIcon /> },
  { to: '/analytics', label: 'Analytics', icon: <AnalyticsIcon /> },
];

const DRAWER = 240;

export function AppShell() {
  const loc = useLocation();
  const nav_ = useNavigate();
  const { user, clear } = useAuth();

  const items = nav.filter((n) => !n.roles || (user && n.roles.includes(user.role as never)));

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Student ID Admin</Typography>
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
          {items.map((n) => (
            <ListItemButton key={n.to} component={Link} to={n.to} selected={loc.pathname.startsWith(n.to)}>
              <ListItemIcon>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, ml: `${DRAWER}px` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
