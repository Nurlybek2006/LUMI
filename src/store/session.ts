import { create } from 'zustand';

interface SessionState { locked: boolean; lock: () => void; unlock: () => void }
export const useSession = create<SessionState>((set) => ({ locked: false, lock: () => set({ locked: true }), unlock: () => set({ locked: false }) }));
