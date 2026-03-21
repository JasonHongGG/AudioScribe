import { create } from 'zustand';
import type { ActiveTool } from './models';


type ToolState = {
    activeTool: ActiveTool;
    setActiveTool: (tool: ActiveTool) => void;
};


export const useToolStore = create<ToolState>((set) => ({
    activeTool: 'split',
    setActiveTool: (tool) => set({ activeTool: tool }),
}));