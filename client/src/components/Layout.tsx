import { useState } from 'react';
import { Layout as AntLayout, Menu, Avatar, Dropdown, Typography, Tag } from 'antd';
import {
  Home, Upload, Calendar, Grid3x3, Bird, BarChart3,
  Users, Settings as SettingsIcon, LogOut, ChevronDown,
  BookOpen,
} from 'lucide-react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../stores/auth';

const { Header, Content, Footer } = AntLayout;

export function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = [
    { key: '/', icon: <Home size={16} />, label: <Link to="/">首页</Link> },
    { key: '/upload', icon: <Upload size={16} />, label: <Link to="/upload">上传</Link> },
    { key: '/timeline', icon: <Calendar size={16} />, label: <Link to="/timeline">时间线</Link> },
    { key: '/gallery', icon: <Grid3x3 size={16} />, label: <Link to="/gallery">图库</Link> },
    { key: '/species', icon: <Bird size={16} />, label: <Link to="/species">我的图鉴</Link> },
    { key: '/stats', icon: <BarChart3 size={16} />, label: <Link to="/stats">统计</Link> },
    { key: '/birds-db', icon: <BookOpen size={16} />, label: <Link to="/birds-db">鸟类数据库</Link> },
  ];

  const adminItems = [
    { key: '/admin/users', icon: <Users size={16} />, label: <Link to="/admin/users">用户管理</Link> },
    { key: '/admin/ai', icon: <SettingsIcon size={16} />, label: <Link to="/admin/ai">系统设置</Link> },
  ];

  const allItems = user?.role === 'admin' ? [...items, { type: 'divider' as const }, ...adminItems] : items;

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogOut size={14} />, label: '退出登录' },
    ],
    onClick: async ({ key }: { key: string }) => {
      if (key === 'logout') {
        await logout();
        navigate('/login');
      }
    },
  };

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  const matchedKey = allItems
    .map((it: any) => it.key)
    .filter((k: string) => location.pathname === k || location.pathname.startsWith(k + '/'))
    .sort((a: string, b: string) => b.length - a.length)[0] || '/';

  return (
    <AntLayout className="layout-shell">
      <Header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#2d5a3d',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 48,
      }}>
        <Link to="/" className="brand">
          <span className="brand-logo" style={{ width: 28, height: 28 }}><Bird size={18} /></span>
          <span style={{ marginLeft: 4 }}>家庭鸟类图鉴</span>
        </Link>
        <div style={{ flex: 1 }} />
        {user ? (
          <Dropdown menu={userMenu} trigger={['click']} open={menuOpen} onOpenChange={setMenuOpen}>
            <span style={{ cursor: 'pointer', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Avatar size={28} style={{ background: '#5a8a6d' }}>
                {(user.displayName || user.username || '?').slice(0, 1).toUpperCase()}
              </Avatar>
              <span className="header-username">{user.displayName || user.username}</span>
              {user.role === 'admin' && <Tag color="gold" style={{ marginLeft: 4 }}>管理员</Tag>}
              <ChevronDown size={14} />
            </span>
          </Dropdown>
        ) : (
          <Typography.Text style={{ color: '#fff' }}>游客</Typography.Text>
        )}
      </Header>

      <Content>
        <div style={{ background: '#fff', borderBottom: '1px solid #eee' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <Menu
              mode="horizontal"
              selectedKeys={[matchedKey]}
              items={allItems}
              style={{ borderBottom: 'none', background: 'transparent' }}
              onClick={({ key }) => navigate(key)}
            />
          </div>
        </div>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center', color: '#aaa', padding: '16px' }}>
        家庭鸟类图鉴 · 本地部署 · 数据完全属于你
      </Footer>
    </AntLayout>
  );
}