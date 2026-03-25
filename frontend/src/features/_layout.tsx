import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@fli-dgtf/flow-ui';
import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import {
  ActivityIcon,
  BarChart3Icon,
  GitBranchIcon,
  LayoutDashboardIcon,
  NetworkIcon,
  ThermometerIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { OfDetailDrawer } from '@/components/shared/of-detail-drawer';

export const Route = createFileRoute('/_layout')({
  component: Layout,
});

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  isActive?: RegExp;
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Pulse',
    icon: <ActivityIcon />,
    isActive: /^\/$/,
  },
  {
    path: '/gantt',
    label: 'Gantt',
    icon: <BarChart3Icon />,
    isActive: /^\/gantt/,
  },
  {
    path: '/graph',
    label: 'Graphe',
    icon: <NetworkIcon />,
    isActive: /^\/graph/,
  },
  {
    path: '/heatmap',
    label: 'Heatmap',
    icon: <ThermometerIcon />,
    isActive: /^\/heatmap/,
  },
  {
    path: '/scenarios',
    label: 'Scenarios',
    icon: <GitBranchIcon />,
    isActive: /^\/scenarios/,
  },
];

function SidebarHeaderLogo() {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <SidebarHeader className='gap-3'>
      <SidebarMenu className='px-4 pb-4'>
        <SidebarMenuItem>
          <Link to='/'>
            <div className='flex items-center gap-2'>
              <LayoutDashboardIcon
                className='h-7 w-7'
                style={{ color: 'var(--pp-blue)' }}
              />
              {!isCollapsed && (
                <span
                  className='text-lg font-bold'
                  style={{ color: 'var(--pp-navy)' }}
                >
                  PlanPulse
                </span>
              )}
            </div>
          </Link>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

function Layout() {
  const location = useLocation();

  return (
    <SidebarProvider open>
      <Sidebar collapsible='icon'>
        <SidebarHeaderLogo />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>
              <span className='flex items-center gap-2'>Navigation</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.isActive?.test(location.pathname) ?? false}
                      tooltip={item.label}
                    >
                      <Link to={item.path}>
                        {item.icon}
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className='bg-sidebar-border'>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className='px-2 py-1 text-xs' style={{ color: 'var(--pp-text-secondary)' }}>
                PlanPulse v0.1
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <main className='flex h-lvh w-full flex-1 flex-col overflow-auto' style={{ backgroundColor: 'var(--pp-bg)' }}>
        <Outlet />
        <OfDetailDrawer />
      </main>
    </SidebarProvider>
  );
}
