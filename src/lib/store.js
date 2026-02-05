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
      isDeveloper: false,
      isAdmin: false,

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
      auditAreas: [],
      fixtureTypes: [],
      utilityProviders: [],
      utilityPrograms: [],
      rebateRates: [],

      // Communications
      communications: [],

      // Settings
      settings: [],
      serviceTypes: [],
      businessUnits: [],
      leadSources: [],
      inventoryTypes: [],
      inventoryLocations: [],
      jobStatuses: [],
      jobSectionStatuses: [],
      employeeRoles: [],
      jobCalendars: [],

      // Labor Rates
      laborRates: [],

      // Routes
      routes: [],

      // Bookings & Scheduling
      bookings: [],

      // Lead Payments
      leadPayments: [],

      // Utility Invoices
      utilityInvoices: [],

      // Incentives
      incentives: [],

      // Agents (Base Camp)
      agents: [],
      companyAgents: [],

      // AI Modules (Dynamic menu agents)
      aiModules: [],

      // Setters
      setCompany: (company) => set({ company, companyId: company?.id }),
      setUser: (user) => set({ user }),
      setIsLoading: (isLoading) => set({ isLoading }),

      // Check developer/admin status
      checkDeveloperStatus: async () => {
        const { user } = get()
        if (!user?.email) {
          set({ isDeveloper: false, isAdmin: false })
          return
        }
        try {
          const { data } = await supabase
            .from('employees')
            .select('is_developer, is_admin')
            .eq('email', user.email)
            .single()
          set({
            isDeveloper: data?.is_developer || false,
            isAdmin: data?.is_admin || false
          })
        } catch (err) {
          console.log('Error checking developer status:', err)
          set({ isDeveloper: false, isAdmin: false })
        }
      },

      // Clear session on logout
      clearSession: async () => {
        await supabase.auth.signOut();
        set({
          company: null,
          companyId: null,
          user: null,
          isDeveloper: false,
          isAdmin: false,
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
          auditAreas: [],
          fixtureTypes: [],
          utilityProviders: [],
          utilityPrograms: [],
          rebateRates: [],
          communications: [],
          settings: [],
          serviceTypes: [],
          businessUnits: [],
          leadSources: [],
          jobStatuses: [],
          jobSectionStatuses: [],
          employeeRoles: [],
          jobCalendars: [],
          routes: [],
          bookings: [],
          leadPayments: [],
          utilityInvoices: [],
          incentives: [],
          agents: [],
          companyAgents: [],
          aiModules: []
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
        if (!companyId) {
          console.log('[fetchLeads] No companyId');
          return;
        }

        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[fetchLeads] Error:', error);
        } else {
          console.log('[fetchLeads] Loaded', data?.length || 0, 'leads');
          set({ leads: data || [] });
        }
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
          .select('*, product:products_services(id, name, unit_price), assigned_employee:employees!assigned_to(id, name), product_group:product_groups(id, name, service_type)')
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
          .from('lighting_audits')
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ lightingAudits: data || [] });
      },

      fetchAuditAreas: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('audit_areas')
          .select('*, audit:lighting_audits(id, audit_id), led_replacement:products_services(id, name)')
          .eq('company_id', companyId);

        if (!error) set({ auditAreas: data || [] });
      },

      fetchFixtureTypes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('fixture_types')
          .select('*')
          .eq('company_id', companyId)
          .order('fixture_name');

        if (!error) set({ fixtureTypes: data || [] });
      },

      fetchUtilityProviders: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('utility_providers')
          .select('*')
          .eq('company_id', companyId)
          .order('provider_name');

        if (!error) set({ utilityProviders: data || [] });
      },

      fetchUtilityPrograms: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('utility_programs')
          .select('*')
          .eq('company_id', companyId)
          .order('program_name');

        if (!error) set({ utilityPrograms: data || [] });
      },

      fetchRebateRates: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('rebate_rates')
          .select('*, program:utility_programs(id, program_name)')
          .eq('company_id', companyId);

        if (!error) set({ rebateRates: data || [] });
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
      // FETCH FUNCTIONS - Settings
      // ========================================

      fetchSettings: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('company_id', companyId);

        if (!error) {
          set({ settings: data || [] });

          // Parse JSON values for specific settings
          const parseSettingList = (key) => {
            const setting = (data || []).find(s => s.key === key);
            if (!setting?.value) return [];
            try {
              return JSON.parse(setting.value);
            } catch {
              return setting.value.split(',').map(s => s.trim());
            }
          };

          set({
            serviceTypes: parseSettingList('service_types'),
            businessUnits: parseSettingList('business_units'),
            leadSources: parseSettingList('lead_sources'),
            inventoryTypes: parseSettingList('inventory_types'),
            inventoryLocations: parseSettingList('inventory_locations'),
            jobStatuses: parseSettingList('job_statuses'),
            jobSectionStatuses: parseSettingList('job_section_statuses'),
            employeeRoles: parseSettingList('employee_roles'),
            jobCalendars: parseSettingList('job_calendars')
          });
        }
      },

      // Fetch labor rates
      fetchLaborRates: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('labor_rates')
          .select('*')
          .eq('company_id', companyId)
          .order('is_default', { ascending: false })
          .order('name');

        if (!error) set({ laborRates: data || [] });
      },

      // Helper to get a single setting value
      getSettingValue: (key) => {
        const { settings } = get();
        const setting = settings.find(s => s.key === key);
        return setting?.value || null;
      },

      // Helper to get setting as parsed array
      getSettingList: (key) => {
        const { settings } = get();
        const setting = settings.find(s => s.key === key);
        if (!setting?.value) return [];
        try {
          return JSON.parse(setting.value);
        } catch {
          return setting.value.split(',').map(s => s.trim());
        }
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
      // FETCH FUNCTIONS - Bookings
      // ========================================

      fetchBookings: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.bookings)
          .select('*')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ bookings: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Lead Payments
      // ========================================

      fetchLeadPayments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.lead_payments)
          .select(QUERIES.leadPayments)
          .eq('company_id', companyId)
          .order('payment_date', { ascending: false });

        if (!error) set({ leadPayments: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Utility Invoices
      // ========================================

      fetchUtilityInvoices: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.utility_invoices)
          .select(QUERIES.utilityInvoices)
          .eq('company_id', companyId)
          .order('invoice_date', { ascending: false });

        if (!error) set({ utilityInvoices: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Incentives
      // ========================================

      fetchIncentives: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from(TABLES.incentives)
          .select(QUERIES.incentives)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (!error) set({ incentives: data || [] });
      },

      // ========================================
      // FETCH FUNCTIONS - Agents (Base Camp)
      // ========================================

      fetchAgents: async () => {
        // Agents are global (not company-specific)
        const { data, error } = await supabase
          .from('agents')
          .select('*')
          .order('display_order');

        if (!error) set({ agents: data || [] });
      },

      fetchCompanyAgents: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('company_agents')
          .select('*, agent:agents(*)')
          .eq('company_id', companyId);

        if (!error) set({ companyAgents: data || [] });
      },

      recruitAgent: async (agentId) => {
        const { companyId, fetchCompanyAgents } = get();
        if (!companyId) return { error: 'No company selected' };

        const { data, error } = await supabase
          .from('company_agents')
          .insert({
            company_id: companyId,
            agent_id: agentId,
            subscription_status: 'active'
          })
          .select('*, agent:agents(*)')
          .single();

        if (!error) {
          await fetchCompanyAgents();
        }

        return { data, error };
      },

      updateAgentNickname: async (companyAgentId, customName) => {
        const { fetchCompanyAgents } = get();

        const { data, error } = await supabase
          .from('company_agents')
          .update({ custom_name: customName, updated_at: new Date().toISOString() })
          .eq('id', companyAgentId)
          .select()
          .single();

        if (!error) {
          await fetchCompanyAgents();
        }

        return { data, error };
      },

      hasAgent: (slug) => {
        const { companyAgents } = get();
        return companyAgents.some(ca => ca.agent?.slug === slug && ca.subscription_status === 'active');
      },

      getAgent: (slug) => {
        const { agents } = get();
        return agents.find(a => a.slug === slug);
      },

      getCompanyAgent: (slug) => {
        const { companyAgents } = get();
        return companyAgents.find(ca => ca.agent?.slug === slug);
      },

      // ========================================
      // FETCH FUNCTIONS - AI Modules
      // ========================================

      fetchAiModules: async () => {
        const { companyId } = get();
        if (!companyId) return;

        const { data, error } = await supabase
          .from('ai_modules')
          .select('*')
          .eq('company_id', companyId)
          .eq('status', 'active')
          .order('sort_order');

        if (!error) set({ aiModules: data || [] });
      },

      updateAgentPlacement: async (agentId, userMenuSection, userMenuParent) => {
        const { companyId, fetchAiModules } = get();
        if (!companyId) return { error: 'No company selected' };

        const { data, error } = await supabase
          .from('ai_modules')
          .update({
            user_menu_section: userMenuSection || null,
            user_menu_parent: userMenuParent || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', agentId)
          .eq('company_id', companyId)
          .select()
          .single();

        if (!error) {
          await fetchAiModules();
        }

        return { data, error };
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
          fetchExpenses,
          fetchInventory,
          fetchFleet,
          fetchFleetMaintenance,
          fetchFleetRentals,
          fetchLightingAudits,
          fetchAuditAreas,
          fetchFixtureTypes,
          fetchUtilityProviders,
          fetchUtilityPrograms,
          fetchRebateRates,
          fetchSettings,
          fetchCommunications,
          fetchRoutes,
          fetchBookings,
          fetchLeadPayments,
          fetchUtilityInvoices,
          fetchIncentives,
          fetchAgents,
          fetchCompanyAgents,
          fetchLaborRates,
          fetchAiModules
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
          fetchExpenses(),
          fetchInventory(),
          fetchFleet(),
          fetchFleetMaintenance(),
          fetchFleetRentals(),
          fetchLightingAudits(),
          fetchAuditAreas(),
          fetchFixtureTypes(),
          fetchUtilityProviders(),
          fetchUtilityPrograms(),
          fetchRebateRates(),
          fetchSettings(),
          fetchCommunications(),
          fetchRoutes(),
          fetchBookings(),
          fetchLeadPayments(),
          fetchUtilityInvoices(),
          fetchIncentives(),
          fetchAgents(),
          fetchCompanyAgents(),
          fetchLaborRates(),
          fetchAiModules()
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
