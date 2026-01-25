import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';
import { TABLES, QUERIES } from './schema';

export const useStore = create(
  persist(
    (set, get) => ({
      // Auth & Company
      companyId: null,
      company: null,
      user: null,
      isLoading: false,

      // Core Data
      employees: [],
      customers: [],
      leads: [],
      salesPipeline: [],
      appointments: [],

      // Products & Quotes
      products: [],
      quotes: [],

      // Jobs & Work
      jobs: [],
      jobLines: [],
      timeLogs: [],
      expenses: [],

      // Invoicing
      invoices: [],
      payments: [],

      // Fleet
      fleet: [],
      fleetMaintenance: [],
      fleetRentals: [],

      // Inventory
      inventory: [],

      // Lighting Audits
      lightingAudits: [],
      fixtureTypes: [],
      utilityProviders: [],
      utilityPrograms: [],

      // Communications
      communications: [],

      // Routes
      routes: [],

      // Setters
      setCompany: (company) => set({ company, companyId: company?.id }),
      setUser: (user) => set({ user }),
      setIsLoading: (isLoading) => set({ isLoading }),

      // Clear session on logout
      clearSession: async () => {
        await supabase.auth.signOut();
        set({
          company: null,
          companyId: null,
          user: null,
          employees: [],
          customers: [],
          leads: [],
          salesPipeline: [],
          appointments: [],
          products: [],
          quotes: [],
          jobs: [],
          timeLogs: [],
          expenses: [],
          invoices: [],
          payments: [],
          fleet: [],
          fleetMaintenance: [],
          fleetRentals: [],
          inventory: [],
          lightingAudits: [],
          fixtureTypes: [],
          utilityProviders: [],
          utilityPrograms: [],
          communications: [],
          routes: []
        });
      },

      // ========================================
      // FETCH FUNCTIONS - Core
      // ========================================

      fetchEmployees: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.employees)
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
          .from(TABLES.customers)
          .select(QUERIES.customers)
          .eq('company_id', companyId)
          .order('name');

        if (!error) set({ customers: data || [] });
      },

      fetchLeads: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.leads)
          .select(QUERIES.leads)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ leads: data || [] });
      },

      fetchSalesPipeline: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.sales_pipeline)
          .select(QUERIES.salesPipeline)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ salesPipeline: data || [] });
      },

      fetchAppointments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.appointments)
          .select(QUERIES.appointments)
          .eq('company_id', companyId)
          .order('start_time');

        if (!error) set({ appointments: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Products & Quotes
      // ========================================

      fetchProducts: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.products_services)
          .select('*')
          .eq('company_id', companyId)
          .order('name');

        if (!error) set({ products: data || [] });
      },

      fetchQuotes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.quotes)
          .select(QUERIES.quotes)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ quotes: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Jobs & Work
      // ========================================

      fetchJobs: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.jobs)
          .select(QUERIES.jobs)
          .eq('company_id', companyId)
          .order('start_date', { ascending: false });

        if (!error) set({ jobs: data || [] });
      },

      fetchTimeLogs: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.time_log)
          .select(QUERIES.timeLogs)
          .eq('company_id', companyId)
          .order('clock_in', { ascending: false });

        if (!error) set({ timeLogs: data || [] });
      },

      fetchExpenses: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.expenses)
          .select(QUERIES.expenses)
          .eq('company_id', companyId)
          .order('expense_date', { ascending: false });

        if (!error) set({ expenses: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Invoicing
      // ========================================

      fetchInvoices: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.invoices)
          .select(QUERIES.invoices)
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false });

        if (!error) set({ invoices: data || [] });
      },

      fetchPayments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.payments)
          .select(QUERIES.payments)
          .eq('company_id', companyId)
          .order('payment_date', { ascending: false });

        if (!error) set({ payments: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Fleet
      // ========================================

      fetchFleet: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.fleet)
          .select('*')
          .eq('company_id', companyId)
          .order('name');

        if (!error) set({ fleet: data || [] });
      },

      fetchFleetMaintenance: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.fleet_maintenance)
          .select('*, asset:fleet(id, name, asset_id)')
          .eq('company_id', companyId)
          .order('date', { ascending: false });

        if (!error) set({ fleetMaintenance: data || [] });
      },

      fetchFleetRentals: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.fleet_rentals)
          .select('*, asset:fleet(id, name, asset_id)')
          .eq('company_id', companyId)
          .order('start_date', { ascending: false });

        if (!error) set({ fleetRentals: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Inventory
      // ========================================

      fetchInventory: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.inventory)
          .select('*, product:products_services(id, name, unit_price)')
          .eq('company_id', companyId)
          .order('name');

        if (!error) set({ inventory: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Lighting Audits
      // ========================================

      fetchLightingAudits: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.lighting_audits)
          .select(QUERIES.lightingAudits)
          .eq('company_id', companyId)
          .order('audit_date', { ascending: false });

        if (!error) set({ lightingAudits: data || [] });
      },

      fetchFixtureTypes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.fixture_types)
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('name');

        if (!error) set({ fixtureTypes: data || [] });
      },

      fetchUtilityProviders: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.utility_providers)
          .select('*')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('provider_name');

        if (!error) set({ utilityProviders: data || [] });
      },

      fetchUtilityPrograms: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.utility_programs)
          .select('*, utility_provider:utility_providers(id, provider_name)')
          .eq('company_id', companyId)
          .eq('active', true)
          .order('program_name');

        if (!error) set({ utilityPrograms: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Communications
      // ========================================

      fetchCommunications: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.communications_log)
          .select(QUERIES.communications)
          .eq('company_id', companyId)
          .order('communication_date', { ascending: false })
          .limit(100);

        if (!error) set({ communications: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Routes
      // ========================================

      fetchRoutes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.routes)
          .select(QUERIES.routes)
          .eq('company_id', companyId)
          .order('route_date', { ascending: false });

        if (!error) set({ routes: data || [] });
      },

      // ========================================
      // FETCH ALL DATA
      // ========================================

      fetchAllData: async () => {
        const { companyId } = get();
        if (!companyId) return;

        set({ isLoading: true });

        const {
          fetchEmployees,
          fetchCustomers,
          fetchLeads,
          fetchSalesPipeline,
          fetchAppointments,
          fetchProducts,
          fetchQuotes,
          fetchJobs,
          fetchInvoices,
          fetchPayments,
          fetchTimeLogs,
          fetchInventory,
          fetchFleet,
          fetchFleetMaintenance,
          fetchFleetRentals
        } = get();

        // Fetch core data in parallel
        await Promise.all([
          fetchEmployees(),
          fetchCustomers(),
          fetchLeads(),
          fetchSalesPipeline(),
          fetchAppointments(),
          fetchProducts(),
          fetchQuotes(),
          fetchJobs(),
          fetchInvoices(),
          fetchPayments(),
          fetchTimeLogs(),
          fetchInventory(),
          fetchFleet(),
          fetchFleetMaintenance(),
          fetchFleetRentals()
        ]);

        set({ isLoading: false });
      },

      // Fetch extended data (called separately when needed)
      fetchExtendedData: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const {
          fetchInvoices,
          fetchPayments,
          fetchTimeLogs,
          fetchExpenses,
          fetchFleet,
          fetchInventory,
          fetchLightingAudits,
          fetchFixtureTypes,
          fetchUtilityProviders,
          fetchUtilityPrograms,
          fetchCommunications,
          fetchRoutes
        } = get();

        await Promise.all([
          fetchInvoices(),
          fetchPayments(),
          fetchTimeLogs(),
          fetchExpenses(),
          fetchFleet(),
          fetchInventory(),
          fetchLightingAudits(),
          fetchFixtureTypes(),
          fetchUtilityProviders(),
          fetchUtilityPrograms(),
          fetchCommunications(),
          fetchRoutes()
        ]);
      }
    }),
    {
      name: 'jobscout-storage',
      partialize: (state) => ({
        companyId: state.companyId,
        company: state.company,
        user: state.user
      })
    }
  )
);
