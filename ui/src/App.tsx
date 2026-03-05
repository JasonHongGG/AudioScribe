import { MainLayout } from './Layout/MainLayout';
import { FileList } from './components/FileList/FileList';
import { Dropzone } from './components/Dropzone/Dropzone';
import { GlobalSettingsModal } from './components/GlobalSettingsModal/GlobalSettingsModal';
import { FileEditor } from './components/FileEditor/FileEditor';
import { useStore, FileTask } from './store';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { ImportPanel } from './components/ImportPanel/ImportPanel';

function App() {
  const tasks = useStore(state => state.tasks);
  const selectedTaskId = useStore(state => state.selectedTaskId);
  const addTask = useStore(state => state.addTask);

  const handleFileUpload = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Media',
          extensions: ['mp3', 'wav', 'mp4', 'mkv', 'ogg', 'flac', 'm4a']
        }]
      });

      if (!selected) return;

      const filePaths = Array.isArray(selected) ? selected : [selected];

      filePaths.forEach((path) => {
        const name = path.split(/[/\\]/).pop() || 'Unknown File';
        const newTask: FileTask = {
          id: Math.random().toString(36).substring(7),
          name: name,
          file: null,
          file_path: path,
          status: 'ready',
          progress: 0,
          provider: 'faster-whisper',
          modelSize: 'base',
          segments: null,
          trimRange: null,
        };
        addTask(newTask);
      });
    } catch (err) {
      console.error("Failed to open file dialog", err);
    }
  };

  return (
    <MainLayout>
      <GlobalSettingsModal />
      <Dropzone />
      <FileList />

      {/* Right Content Area */}
      <div className="flex-1 relative flex flex-col overflow-hidden min-w-0 min-h-0 rounded-2xl border border-white/[0.05] bg-background-dark/30 backdrop-blur-3xl shadow-2xl">
        <AnimatePresence mode="wait">
          {tasks.length === 0 ? (
            <ImportPanel key="empty-state" onImport={handleFileUpload} />
          ) : (
            <motion.div
              key="editor-state"
              initial={{ opacity: 0, filter: 'blur(10px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.5 }}
              className="flex-1 w-full h-full flex flex-col min-w-0 min-h-0 overflow-hidden relative"
            >
              {selectedTaskId ? (
                <FileEditor taskId={selectedTaskId} />
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
