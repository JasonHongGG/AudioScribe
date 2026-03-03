import { MainLayout } from './Layout/MainLayout';
import { FileList } from './components/FileList/FileList';
import { Dropzone } from './components/Dropzone/Dropzone';
import { GlobalSettingsModal } from './components/GlobalSettingsModal/GlobalSettingsModal';
import { FileEditor } from './components/FileEditor/FileEditor';
import { useStore, FileTask } from './store';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

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
      <div className="flex-1 relative flex flex-col bg-background/50 overflow-hidden min-w-0 min-h-0">
        <AnimatePresence mode="wait">
          {tasks.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center p-8"
            >
              <div
                onClick={handleFileUpload}
                className="flex flex-col items-center justify-center w-full max-w-xl h-64 border-2 border-dashed border-white/10 hover:border-primary/50 rounded-2xl cursor-pointer bg-surface hover:bg-surface-hover/50 transition-all duration-300 group"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300 shadow-xl border border-white/5 group-hover:border-primary/30">
                    <Plus className="w-8 h-8 text-foreground-muted group-hover:text-primary transition-colors" />
                  </div>
                  <p className="mb-2 text-lg font-medium tracking-wide text-foreground">
                    <span className="font-semibold text-primary">Click to upload media files</span>
                  </p>
                  <p className="text-sm text-foreground-muted">
                    Audio or Video files (MP3, WAV, MP4, MKV)
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="editor-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 w-full h-full flex flex-col min-w-0 min-h-0 overflow-hidden relative"
            >
              {selectedTaskId ? (
                <FileEditor taskId={selectedTaskId} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground-muted">
                  Select a task from the queue to start editing.
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
