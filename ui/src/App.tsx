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
import { api } from './services/api';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

function isVideoPath(path: string): boolean {
  return VIDEO_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));
}

function App() {
  const tasks = useStore(state => state.tasks);
  const selectedTaskId = useStore(state => state.selectedTaskId);
  const addTask = useStore(state => state.addTask);
  const updateTask = useStore(state => state.updateTask);

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
        const isVideo = isVideoPath(path);
        const taskId = Math.random().toString(36).substring(7);

        const newTask: FileTask = {
          id: taskId,
          name: name,
          file: null,
          file_path: path,
          audio_file_path: null,
          status: isVideo ? 'extracting' : 'ready',
          progress: 0,
          provider: 'faster-whisper',
          modelSize: 'base',
          segments: null,
          trimRange: null,
        };
        addTask(newTask);

        // If video, extract audio in background
        if (isVideo) {
          api.extractAudio(path).then((result) => {
            if (result.status === 'success' && result.audio_path) {
              updateTask(taskId, {
                audio_file_path: result.audio_path,
                status: 'ready',
              });
            } else {
              console.error('Audio extraction failed:', result.error);
              updateTask(taskId, { status: 'error' });
            }
          });
        }
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
