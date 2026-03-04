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
      <div className="flex-1 relative flex flex-col overflow-hidden min-w-0 min-h-0 rounded-2xl border border-white/[0.05] bg-background-dark/30 backdrop-blur-3xl shadow-2xl">
        <AnimatePresence mode="wait">
          {tasks.length === 0 ? (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="absolute inset-0 flex items-center justify-center p-8"
            >
              <div
                onClick={handleFileUpload}
                className="relative flex flex-col items-center justify-center w-full max-w-xl h-72 rounded-3xl cursor-pointer group isolation-auto"
              >
                {/* Stunning Gradient Border & Background */}
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.08] to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-[1px] rounded-[23px] bg-background-base/80 backdrop-blur-xl transition-colors duration-500 group-hover:bg-background-base/60" />

                {/* Glow effect on hover */}
                <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-3xl opacity-0 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none" />

                <div className="relative flex flex-col items-center justify-center pt-5 pb-6 z-10">
                  <motion.div
                    className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-2xl border border-white/10 group-hover:border-primary/50 group-hover:shadow-[0_0_30px_rgba(250,204,21,0.3)] transition-all duration-500 bg-background-light/50 relative overflow-hidden"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <Plus className="w-8 h-8 text-foreground-muted group-hover:text-primary transition-colors duration-500 relative z-10" />
                  </motion.div>
                  <p className="mb-3 text-2xl font-semibold tracking-tight text-foreground group-hover:text-glow transition-all duration-500">
                    Import Media
                  </p>
                  <p className="text-sm text-foreground-muted/80 font-medium">
                    Drag and drop or <span className="text-primary group-hover:text-primary-light transition-colors">browse files</span>
                  </p>
                  <div className="mt-6 flex gap-2 items-center text-[10px] uppercase tracking-widest text-foreground-muted/50 font-mono">
                    <span>MP3</span> • <span>WAV</span> • <span>MP4</span> • <span>MKV</span>
                  </div>
                </div>
              </div>
            </motion.div>
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
