import { useEffect, useRef } from 'react';
import { useStore } from '../../store';

export function useActiveToolRef() {
    const activeTool = useStore((state) => state.activeToolRef);
    const ref = useRef(activeTool);

    useEffect(() => {
        ref.current = activeTool;
    }, [activeTool]);

    return ref;
}
