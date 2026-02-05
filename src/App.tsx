/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { MainLayout } from './components/layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Channels } from './pages/Channels';
import { Skills } from './pages/Skills';
import { Cron } from './pages/Cron';
import { Settings } from './pages/Settings';
import { Setup } from './pages/Setup';
import { useSettingsStore } from './stores/settings';
import { useGatewayStore } from './stores/gateway';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useSettingsStore((state) => state.theme);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const initGateway = useGatewayStore((state) => state.init);
  
  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);
  
  // Redirect to setup wizard if not complete
  useEffect(() => {
    if (!setupComplete && !location.pathname.startsWith('/setup')) {
      navigate('/setup');
    }
  }, [setupComplete, location.pathname, navigate]);
  
  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === 'string') {
        navigate(path);
      }
    };
    
    const unsubscribe = window.electron.ipcRenderer.on('navigate', handleNavigate);
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [navigate]);
  
  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);
  
  return (
    <>
      <Routes>
        {/* Setup wizard (shown on first launch) */}
        <Route path="/setup/*" element={<Setup />} />
        
        {/* Main application routes */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/channels" element={<Channels />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/cron" element={<Cron />} />
          <Route path="/settings/*" element={<Settings />} />
        </Route>
      </Routes>
      
      {/* Global toast notifications */}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
      />
    </>
  );
}

export default App;
