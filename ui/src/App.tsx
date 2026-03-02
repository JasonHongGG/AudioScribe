import { MainLayout } from './layout/MainLayout';
import { FileList } from './components/FileList';
import { FileEditor } from './components/FileEditor';
import { Dropzone } from './components/Dropzone';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { useStore } from './store';
import { AnimatePresence, motion } from 'framer-motion';

function App() {
  const tasks = useStore(state => state.tasks);

  return (
    <MainLayout>
      {/* Main Split Layout */}
      <div className="flex w-full h-full relative z-10">
        <FileList />

        {/* Editor Area, handling Dropzone fallback natively via FileEditor empty state */}
        <div className="flex-1 flex flex-col relative h-full min-w-0">
          <AnimatePresence mode="wait">
            {tasks.length === 0 ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex-1 flex items-center justify-center p-12 bg-background relative"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
                <div className="w-full max-w-2xl pointer-events-auto relative z-10 flex items-center justify-center">
                  <Dropzone />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="editor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col flex-1 h-full"
              >
                <FileEditor />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {tasks.length > 0 && (
        /* Invisible full-screen Dropzone to catch drops when files exist but user drags into main area */
        <div className="fixed inset-0 pointer-events-none z-[110]">
          <Dropzone hidden />
        </div>
      )}

      <GlobalSettingsModal />
    </MainLayout>
  );
}

export default App;
