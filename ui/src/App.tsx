import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { MainLayout } from './Layout/MainLayout';
import { Dropzone } from './components/Dropzone/Dropzone';
import { FileEditor } from './components/FileEditor/FileEditor';
import { FileList } from './components/FileList/FileList';
import { GlobalSettingsModal } from './components/GlobalSettingsModal/GlobalSettingsModal';
import { ImportPanel } from './components/ImportPanel/ImportPanel';
import { useBackendRuntime } from './features/backend/useBackendRuntime';
import { SUPPORTED_MEDIA_EXTENSIONS } from './features/workbench/fileSupport';
import { useAssetIntake } from './features/workbench/useAssetIntake';
import { useWorkbenchStore } from './features/workbench/workbenchStore';

function App() {
  const assetIds = useWorkbenchStore((state) => state.order);
  const selectedAssetId = useWorkbenchStore((state) => state.selectedAssetId);
  const ingestPaths = useAssetIntake();
  const backendRuntime = useBackendRuntime();

  const handleFileUpload = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: SUPPORTED_MEDIA_EXTENSIONS.map((extension) => extension.slice(1)),
        }],
      });

      if (!selected) {
        return;
      }

      const filePaths = Array.isArray(selected) ? selected : [selected];
      await ingestPaths(filePaths);
    } catch (error) {
      console.error('Failed to open file dialog', error);
    }
  };

  return (
    <MainLayout>
      <GlobalSettingsModal />
      <Dropzone />
      <FileList />

      <div className="flex-1 relative flex flex-col overflow-hidden min-w-0 min-h-0 rounded-2xl border border-white/[0.05] bg-background-dark/30 backdrop-blur-3xl shadow-2xl">
        <AnimatePresence mode="wait">
          {backendRuntime.status === 'starting' ? (
            <motion.div
              key="runtime-starting"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
              className="w-full h-full flex flex-col items-center justify-center gap-4 text-foreground-muted"
            >
              <Loader2 size={28} className="animate-spin text-primary" />
              <div className="text-sm font-semibold tracking-[0.2em] uppercase">Starting audio engine</div>
            </motion.div>
          ) : backendRuntime.status === 'error' ? (
            <motion.div
              key="runtime-error"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
              className="w-full h-full flex flex-col items-center justify-center gap-5 px-8 text-center text-foreground-muted"
            >
              <AlertCircle size={32} className="text-danger" />
              <div className="max-w-xl space-y-2">
                <div className="text-sm font-semibold tracking-[0.2em] uppercase text-foreground">Audio engine failed</div>
                <p className="text-sm leading-relaxed">{backendRuntime.error}</p>
              </div>
              <button
                onClick={() => { void backendRuntime.retry(); }}
                className="glass-button px-5 py-3 text-sm font-semibold text-foreground hover:text-primary"
              >
                Retry Startup
              </button>
            </motion.div>
          ) : assetIds.length === 0 ? (
            <ImportPanel key="empty-state" onImport={handleFileUpload} />
          ) : (
            <motion.div
              key="editor-state"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
              className="flex-1 w-full h-full flex flex-col min-w-0 min-h-0 overflow-hidden relative"
            >
              {selectedAssetId ? (
                <FileEditor assetId={selectedAssetId} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground-muted font-mono tracking-widest uppercase text-xs opacity-50">
                  Select a track to begin
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MainLayout>
  );
}

export default App;
