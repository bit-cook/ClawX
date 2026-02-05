/**
 * Skills State Store
 * Manages skill/plugin state
 */
import { create } from 'zustand';
import type { Skill } from '../types/skill';

interface SkillsState {
  skills: Skill[];
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchSkills: () => Promise<void>;
  enableSkill: (skillId: string) => Promise<void>;
  disableSkill: (skillId: string) => Promise<void>;
  setSkills: (skills: Skill[]) => void;
  updateSkill: (skillId: string, updates: Partial<Skill>) => void;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  loading: false,
  error: null,
  
  fetchSkills: async () => {
    set({ loading: true, error: null });
    
    try {
      // OpenClaw uses skills.status to get skill information
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.status',
        {}
      ) as { success: boolean; result?: { skills?: Skill[] } | Skill[]; error?: string };
      
      if (result.success && result.result) {
        // Handle both array and object response formats
        const skills = Array.isArray(result.result) 
          ? result.result 
          : (result.result.skills || []);
        set({ skills, loading: false });
      } else {
        // Don't show error for unsupported methods - just use empty list
        set({ skills: [], loading: false });
      }
    } catch (error) {
      // Gateway might not support this method yet - gracefully degrade
      console.warn('Failed to fetch skills:', error);
      set({ skills: [], loading: false });
    }
  },
  
  enableSkill: async (skillId) => {
    const { updateSkill } = get();
    
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.enable',
        { skillId }
      ) as { success: boolean; error?: string };
      
      if (result.success) {
        updateSkill(skillId, { enabled: true });
      } else {
        throw new Error(result.error || 'Failed to enable skill');
      }
    } catch (error) {
      console.error('Failed to enable skill:', error);
      throw error;
    }
  },
  
  disableSkill: async (skillId) => {
    const { updateSkill, skills } = get();
    
    // Check if skill is a core skill
    const skill = skills.find((s) => s.id === skillId);
    if (skill?.isCore) {
      throw new Error('Cannot disable core skill');
    }
    
    try {
      const result = await window.electron.ipcRenderer.invoke(
        'gateway:rpc',
        'skills.disable',
        { skillId }
      ) as { success: boolean; error?: string };
      
      if (result.success) {
        updateSkill(skillId, { enabled: false });
      } else {
        throw new Error(result.error || 'Failed to disable skill');
      }
    } catch (error) {
      console.error('Failed to disable skill:', error);
      throw error;
    }
  },
  
  setSkills: (skills) => set({ skills }),
  
  updateSkill: (skillId, updates) => {
    set((state) => ({
      skills: state.skills.map((skill) =>
        skill.id === skillId ? { ...skill, ...updates } : skill
      ),
    }));
  },
}));
