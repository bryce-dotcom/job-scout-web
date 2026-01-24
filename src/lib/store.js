import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';

export const useStore = create(
  persist(
    (set, get) => ({
      companyId: null,
      company: null,
      user: null,
      employees: [],
      isLoading: false,

      setCompany: (company) => set({ company, companyId: company?.id }),
      setUser: (user) => set({ user }),
      setIsLoading: (isLoading) => set({ isLoading }),

      clearSession: async () => {
        await supabase.auth.signOut();
        set({
          company: null,
          companyId: null,
          user: null,
          employees: []
        });
      },

      fetchEmployees: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('name');

        if (!error) set({ employees: data || [] });
      },

      fetchAllData: async () => {
        const { companyId, fetchEmployees } = get();
        if (!companyId) return;
        set({ isLoading: true });
        await fetchEmployees();
        set({ isLoading: false });
      }
    }),
    {
      name: 'jobscout-storage',
      partialize: (state) => ({ companyId: state.companyId, company: state.company })
    }
  )
);
