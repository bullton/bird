import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ChangePassword } from './pages/ChangePassword';
import { Home } from './pages/Home';
import { Upload } from './pages/Upload';
import { Timeline } from './pages/Timeline';
import { Gallery } from './pages/Gallery';
import { SpeciesList } from './pages/SpeciesList';
import { SpeciesDetail } from './pages/SpeciesDetail';
import { Stats } from './pages/Stats';
import { BirdsDB } from './pages/BirdsDB';
import { Users } from './pages/admin/Users';
import { AISettings } from './pages/admin/AISettings';
import { useAuth } from './stores/auth';
import { App as AntApp, Spin } from 'antd';

function FullPageSpin() {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><Spin /></div>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const location = useLocation();
  if (!initialized) return <FullPageSpin />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.mustChangePassword && !location.pathname.startsWith('/change-password')) {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  if (!initialized) return <FullPageSpin />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  const { load, initialized } = useAuth();
  useEffect(() => { load(); }, [load]);

  if (!initialized) return <FullPageSpin />;

  return (
    <AntApp>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />

        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/species" element={<SpeciesList />} />
          <Route path="/species/:id" element={<SpeciesDetail />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/birds-db" element={<BirdsDB />} />

          <Route path="/admin/users" element={<RequireAdmin><Users /></RequireAdmin>} />
          <Route path="/admin/ai" element={<RequireAdmin><AISettings /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AntApp>
  );
}

export default App;