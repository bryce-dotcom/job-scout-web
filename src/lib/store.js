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
      customers: [],
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
          employees: [],
          customers: []
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

      fetchCustomers: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('customers')
          .select('*, salesperson:employees(id, name)')
          .eq('company_id', companyId)
          .order('name');

        if (!error) set({ customers: data || [] });
      },

      fetchAllData: async () => {
        const { companyId, fetchEmployees, fetchCustomers } = get();
        if (!companyId) return;
        set({ isLoading: true });
        await Promise.all([fetchEmployees(), fetchCustomers()]);
        set({ isLoading: false });
      }
    }),
    {
      name: 'jobscout-storage',
      partialize: (state) => ({ companyId: state.companyId, company: state.company })
    }
  )
);
