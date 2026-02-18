import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';
import { TABLES, QUERIES } from './schema';
import { offlineDb } from './offlineDb';

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
      pipelineStages: [],

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

      // Prescriptive Measures (PDF-verified)
      prescriptiveMeasures: [],

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
        await offlineDb.clearAll();
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
          pipelineStages: [],
          routes: [],
          bookings: [],
          leadPayments: [],
          utilityInvoices: [],
          prescriptiveMeasures: [],
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

        // Hydrate from cache
        const cached = await offlineDb.getAll('employees');
        if (cached.length > 0 && get().employees.length === 0) set({ employees: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.employees)
            .select('*')
            .eq('company_id', companyId)
            .eq('active', true)
            .order('name');

          if (!error) {
            set({ employees: data || [] });
            await offlineDb.putAll('employees', data || []);
          }
        } catch (e) {
          console.log('[fetchEmployees] Offline, using cache');
        }
      },

      fetchCustomers: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('customers');
        if (cached.length > 0 && get().customers.length === 0) set({ customers: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.customers)
            .select(QUERIES.customers)
            .eq('company_id', companyId)
            .order('name');

          if (!error) {
            set({ customers: data || [] });
            await offlineDb.putAll('customers', data || []);
          }
        } catch (e) {
          console.log('[fetchCustomers] Offline, using cache');
        }
      },

      fetchLeads: async () => {
        const { companyId } = get();
        if (!companyId) {
          console.log('[fetchLeads] No companyId');
          return;
        }

        // Hydrate from cache
        const cached = await offlineDb.getAll('leads');
        if (cached.length > 0 && get().leads.length === 0) set({ leads: cached });

        // Network refresh
        try {
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
            await offlineDb.putAll('leads', data || []);
          }
        } catch (e) {
          console.log('[fetchLeads] Offline, using cache');
        }
      },

      fetchSalesPipeline: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('salesPipeline');
        if (cached.length > 0 && get().salesPipeline.length === 0) set({ salesPipeline: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.sales_pipeline)
            .select(QUERIES.salesPipeline)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ salesPipeline: data || [] });
            await offlineDb.putAll('salesPipeline', data || []);
          }
        } catch (e) {
          console.log('[fetchSalesPipeline] Offline, using cache');
        }
      },

      fetchAppointments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('appointments');
        if (cached.length > 0 && get().appointments.length === 0) set({ appointments: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.appointments)
            .select(QUERIES.appointments)
            .eq('company_id', companyId)
            .order('start_time');

          if (!error) {
            set({ appointments: data || [] });
            await offlineDb.putAll('appointments', data || []);
          }
        } catch (e) {
          console.log('[fetchAppointments] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Products & Quotes
      // ========================================

      fetchProducts: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('products');
        if (cached.length > 0 && get().products.length === 0) set({ products: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.products_services)
            .select('*')
            .eq('company_id', companyId)
            .order('name');

          if (!error) {
            set({ products: data || [] });
            await offlineDb.putAll('products', data || []);
          }
        } catch (e) {
          console.log('[fetchProducts] Offline, using cache');
        }
      },

      fetchQuotes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('quotes');
        if (cached.length > 0 && get().quotes.length === 0) set({ quotes: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.quotes)
            .select(QUERIES.quotes)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ quotes: data || [] });
            await offlineDb.putAll('quotes', data || []);
          }
        } catch (e) {
          console.log('[fetchQuotes] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Jobs & Work
      // ========================================

      fetchJobs: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('jobs');
        if (cached.length > 0 && get().jobs.length === 0) set({ jobs: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.jobs)
            .select(QUERIES.jobs)
            .eq('company_id', companyId)
            .order('start_date', { ascending: false });

          if (!error) {
            set({ jobs: data || [] });
            await offlineDb.putAll('jobs', data || []);
          }
        } catch (e) {
          console.log('[fetchJobs] Offline, using cache');
        }
      },

      fetchTimeLogs: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('timeLogs');
        if (cached.length > 0 && get().timeLogs.length === 0) set({ timeLogs: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.time_log)
            .select(QUERIES.timeLogs)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ timeLogs: data || [] });
            await offlineDb.putAll('timeLogs', data || []);
          }
        } catch (e) {
          console.log('[fetchTimeLogs] Offline, using cache');
        }
      },

      fetchExpenses: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('expenses');
        if (cached.length > 0 && get().expenses.length === 0) set({ expenses: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.expenses)
            .select(QUERIES.expenses)
            .eq('company_id', companyId)
            .order('date', { ascending: false });

          if (!error) {
            set({ expenses: data || [] });
            await offlineDb.putAll('expenses', data || []);
          }
        } catch (e) {
          console.log('[fetchExpenses] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Invoicing
      // ========================================

      fetchInvoices: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('invoices');
        if (cached.length > 0 && get().invoices.length === 0) set({ invoices: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.invoices)
            .select(QUERIES.invoices)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ invoices: data || [] });
            await offlineDb.putAll('invoices', data || []);
          }
        } catch (e) {
          console.log('[fetchInvoices] Offline, using cache');
        }
      },

      fetchPayments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('payments');
        if (cached.length > 0 && get().payments.length === 0) set({ payments: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.payments)
            .select(QUERIES.payments)
            .eq('company_id', companyId)
            .order('date', { ascending: false });

          if (!error) {
            set({ payments: data || [] });
            await offlineDb.putAll('payments', data || []);
          }
        } catch (e) {
          console.log('[fetchPayments] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Fleet
      // ========================================

      fetchFleet: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('fleet');
        if (cached.length > 0 && get().fleet.length === 0) set({ fleet: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.fleet)
            .select('*')
            .eq('company_id', companyId)
            .order('name');

          if (!error) {
            set({ fleet: data || [] });
            await offlineDb.putAll('fleet', data || []);
          }
        } catch (e) {
          console.log('[fetchFleet] Offline, using cache');
        }
      },

      fetchFleetMaintenance: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('fleetMaintenance');
        if (cached.length > 0 && get().fleetMaintenance.length === 0) set({ fleetMaintenance: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.fleet_maintenance)
            .select('*, asset:fleet(id, name, asset_id)')
            .eq('company_id', companyId)
            .order('date', { ascending: false });

          if (!error) {
            set({ fleetMaintenance: data || [] });
            await offlineDb.putAll('fleetMaintenance', data || []);
          }
        } catch (e) {
          console.log('[fetchFleetMaintenance] Offline, using cache');
        }
      },

      fetchFleetRentals: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('fleetRentals');
        if (cached.length > 0 && get().fleetRentals.length === 0) set({ fleetRentals: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.fleet_rentals)
            .select('*, asset:fleet(id, name, asset_id)')
            .eq('company_id', companyId)
            .order('start_date', { ascending: false });

          if (!error) {
            set({ fleetRentals: data || [] });
            await offlineDb.putAll('fleetRentals', data || []);
          }
        } catch (e) {
          console.log('[fetchFleetRentals] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Inventory
      // ========================================

      fetchInventory: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('inventory');
        if (cached.length > 0 && get().inventory.length === 0) set({ inventory: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.inventory)
            .select('*, product:products_services(id, name, unit_price), assigned_employee:employees!assigned_to(id, name), product_group:product_groups(id, name, service_type)')
            .eq('company_id', companyId)
            .order('name');

          if (!error) {
            set({ inventory: data || [] });
            await offlineDb.putAll('inventory', data || []);
          }
        } catch (e) {
          console.log('[fetchInventory] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Lighting Audits
      // ========================================

      fetchLightingAudits: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('lightingAudits');
        if (cached.length > 0 && get().lightingAudits.length === 0) set({ lightingAudits: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('lighting_audits')
            .select('*, customer:customers(id, name), utility_provider:utility_providers(id, provider_name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ lightingAudits: data || [] });
            await offlineDb.putAll('lightingAudits', data || []);
          }
        } catch (e) {
          console.log('[fetchLightingAudits] Offline, using cache');
        }
      },

      fetchAuditAreas: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('auditAreas');
        if (cached.length > 0 && get().auditAreas.length === 0) set({ auditAreas: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('audit_areas')
            .select('*, audit:lighting_audits(id, audit_id), led_product:products_services!led_replacement_id(id, name)')
            .eq('company_id', companyId);

          if (error) {
            console.error('fetchAuditAreas error:', error.message);
            // Fallback: try without joins
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('audit_areas')
              .select('*')
              .eq('company_id', companyId);
            if (!fallbackError) {
              set({ auditAreas: fallbackData || [] });
              await offlineDb.putAll('auditAreas', fallbackData || []);
            }
          } else {
            set({ auditAreas: data || [] });
            await offlineDb.putAll('auditAreas', data || []);
          }
        } catch (e) {
          console.log('[fetchAuditAreas] Offline, using cache');
        }
      },

      fetchFixtureTypes: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('fixtureTypes');
        if (cached.length > 0 && get().fixtureTypes.length === 0) set({ fixtureTypes: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('fixture_types')
            .select('*')
            .eq('company_id', companyId)
            .order('fixture_name');

          if (!error) {
            set({ fixtureTypes: data || [] });
            await offlineDb.putAll('fixtureTypes', data || []);
          }
        } catch (e) {
          console.log('[fetchFixtureTypes] Offline, using cache');
        }
      },

      fetchUtilityProviders: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('utilityProviders');
        if (cached.length > 0 && get().utilityProviders.length === 0) set({ utilityProviders: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('utility_providers')
            .select('*')
            .or(`company_id.eq.${companyId},company_id.is.null`)
            .order('provider_name');

          if (!error) {
            set({ utilityProviders: data || [] });
            await offlineDb.putAll('utilityProviders', data || []);
          }
        } catch (e) {
          console.log('[fetchUtilityProviders] Offline, using cache');
        }
      },

      fetchUtilityPrograms: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('utilityPrograms');
        if (cached.length > 0 && get().utilityPrograms.length === 0) set({ utilityPrograms: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('utility_programs')
            .select('*')
            .or(`company_id.eq.${companyId},company_id.is.null`)
            .order('program_name');

          if (!error) {
            set({ utilityPrograms: data || [] });
            await offlineDb.putAll('utilityPrograms', data || []);
          }
        } catch (e) {
          console.log('[fetchUtilityPrograms] Offline, using cache');
        }
      },

      fetchRebateRates: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('rebateRates');
        if (cached.length > 0 && get().rebateRates.length === 0) set({ rebateRates: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('incentive_measures')
            .select('*, program:utility_programs(id, program_name)')
            .or(`company_id.eq.${companyId},company_id.is.null`);

          if (!error) {
            set({ rebateRates: data || [] });
            await offlineDb.putAll('rebateRates', data || []);
          }
        } catch (e) {
          console.log('[fetchRebateRates] Offline, using cache');
        }
      },

      fetchPrescriptiveMeasures: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('prescriptiveMeasures');
        if (cached.length > 0 && get().prescriptiveMeasures.length === 0) set({ prescriptiveMeasures: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('prescriptive_measures')
            .select('*, program:utility_programs(id, program_name, utility_name, provider_id)')
            .eq('is_active', true)
            .or(`company_id.eq.${companyId},company_id.is.null`);

          if (!error) {
            set({ prescriptiveMeasures: data || [] });
            await offlineDb.putAll('prescriptiveMeasures', data || []);
          }
        } catch (e) {
          console.log('[fetchPrescriptiveMeasures] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Communications
      // ========================================

      fetchCommunications: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('communications');
        if (cached.length > 0 && get().communications.length === 0) set({ communications: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.communications_log)
            .select(QUERIES.communications)
            .eq('company_id', companyId)
            .order('sent_date', { ascending: false })
            .limit(100);

          if (!error) {
            set({ communications: data || [] });
            await offlineDb.putAll('communications', data || []);
          }
        } catch (e) {
          console.log('[fetchCommunications] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Settings
      // ========================================

      fetchSettings: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Parse JSON values for specific settings
        const parseSettingList = (settingsData, key) => {
          const setting = (settingsData || []).find(s => s.key === key);
          if (!setting?.value) return [];
          try {
            return JSON.parse(setting.value);
          } catch {
            return setting.value.split(',').map(s => s.trim());
          }
        };

        // Hydrate from cache
        const cached = await offlineDb.getAll('settings');
        if (cached.length > 0 && get().settings.length === 0) {
          set({ settings: cached });
          set({
            serviceTypes: parseSettingList(cached, 'service_types'),
            businessUnits: parseSettingList(cached, 'business_units'),
            leadSources: parseSettingList(cached, 'lead_sources'),
            inventoryTypes: parseSettingList(cached, 'inventory_types'),
            inventoryLocations: parseSettingList(cached, 'inventory_locations'),
            jobStatuses: parseSettingList(cached, 'job_statuses'),
            jobSectionStatuses: parseSettingList(cached, 'job_section_statuses'),
            employeeRoles: parseSettingList(cached, 'employee_roles'),
            jobCalendars: parseSettingList(cached, 'job_calendars'),
            pipelineStages: parseSettingList(cached, 'pipeline_stages')
          });
        }

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('company_id', companyId);

          if (!error) {
            set({ settings: data || [] });
            await offlineDb.putAll('settings', data || []);

            set({
              serviceTypes: parseSettingList(data, 'service_types'),
              businessUnits: parseSettingList(data, 'business_units'),
              leadSources: parseSettingList(data, 'lead_sources'),
              inventoryTypes: parseSettingList(data, 'inventory_types'),
              inventoryLocations: parseSettingList(data, 'inventory_locations'),
              jobStatuses: parseSettingList(data, 'job_statuses'),
              jobSectionStatuses: parseSettingList(data, 'job_section_statuses'),
              employeeRoles: parseSettingList(data, 'employee_roles'),
              jobCalendars: parseSettingList(data, 'job_calendars'),
              pipelineStages: parseSettingList(data, 'pipeline_stages')
            });
          }
        } catch (e) {
          console.log('[fetchSettings] Offline, using cache');
        }
      },

      // Fetch labor rates
      fetchLaborRates: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('laborRates');
        if (cached.length > 0 && get().laborRates.length === 0) set({ laborRates: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('labor_rates')
            .select('*')
            .eq('company_id', companyId)
            .order('is_default', { ascending: false })
            .order('name');

          if (!error) {
            set({ laborRates: data || [] });
            await offlineDb.putAll('laborRates', data || []);
          }
        } catch (e) {
          console.log('[fetchLaborRates] Offline, using cache');
        }
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

        // Hydrate from cache
        const cached = await offlineDb.getAll('routes');
        if (cached.length > 0 && get().routes.length === 0) set({ routes: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.routes)
            .select(QUERIES.routes)
            .eq('company_id', companyId)
            .order('date', { ascending: false });

          if (!error) {
            set({ routes: data || [] });
            await offlineDb.putAll('routes', data || []);
          }
        } catch (e) {
          console.log('[fetchRoutes] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Bookings
      // ========================================

      fetchBookings: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('bookings');
        if (cached.length > 0 && get().bookings.length === 0) set({ bookings: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.bookings)
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ bookings: data || [] });
            await offlineDb.putAll('bookings', data || []);
          }
        } catch (e) {
          console.log('[fetchBookings] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Lead Payments
      // ========================================

      fetchLeadPayments: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('leadPayments');
        if (cached.length > 0 && get().leadPayments.length === 0) set({ leadPayments: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.lead_payments)
            .select(QUERIES.leadPayments)
            .eq('company_id', companyId)
            .order('date_created', { ascending: false });

          if (!error) {
            set({ leadPayments: data || [] });
            await offlineDb.putAll('leadPayments', data || []);
          }
        } catch (e) {
          console.log('[fetchLeadPayments] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Utility Invoices
      // ========================================

      fetchUtilityInvoices: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('utilityInvoices');
        if (cached.length > 0 && get().utilityInvoices.length === 0) set({ utilityInvoices: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.utility_invoices)
            .select(QUERIES.utilityInvoices)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ utilityInvoices: data || [] });
            await offlineDb.putAll('utilityInvoices', data || []);
          }
        } catch (e) {
          console.log('[fetchUtilityInvoices] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Incentives
      // ========================================

      fetchIncentives: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('incentives');
        if (cached.length > 0 && get().incentives.length === 0) set({ incentives: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from(TABLES.incentives)
            .select(QUERIES.incentives)
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ incentives: data || [] });
            await offlineDb.putAll('incentives', data || []);
          }
        } catch (e) {
          console.log('[fetchIncentives] Offline, using cache');
        }
      },

      // ========================================
      // FETCH FUNCTIONS - Agents (Base Camp)
      // ========================================

      fetchAgents: async () => {
        // Agents are global (not company-specific)

        // Hydrate from cache
        const cached = await offlineDb.getAll('agents');
        if (cached.length > 0 && get().agents.length === 0) set({ agents: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('agents')
            .select('*')
            .order('display_order');

          if (!error) {
            set({ agents: data || [] });
            await offlineDb.putAll('agents', data || []);
          }
        } catch (e) {
          console.log('[fetchAgents] Offline, using cache');
        }
      },

      fetchCompanyAgents: async () => {
        const { companyId } = get();
        if (!companyId) return;

        // Hydrate from cache
        const cached = await offlineDb.getAll('companyAgents');
        if (cached.length > 0 && get().companyAgents.length === 0) set({ companyAgents: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('company_agents')
            .select('*, agent:agents(*)')
            .eq('company_id', companyId);

          if (!error) {
            set({ companyAgents: data || [] });
            await offlineDb.putAll('companyAgents', data || []);
          }
        } catch (e) {
          console.log('[fetchCompanyAgents] Offline, using cache');
        }
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

        // Hydrate from cache
        const cached = await offlineDb.getAll('aiModules');
        if (cached.length > 0 && get().aiModules.length === 0) set({ aiModules: cached });

        // Network refresh
        try {
          const { data, error } = await supabase
            .from('ai_modules')
            .select('*')
            .eq('company_id', companyId)
            .eq('status', 'active')
            .order('sort_order');

          if (!error) {
            set({ aiModules: data || [] });
            await offlineDb.putAll('aiModules', data || []);
          }
        } catch (e) {
          console.log('[fetchAiModules] Offline, using cache');
        }
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
          fetchPrescriptiveMeasures,
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
          fetchPrescriptiveMeasures(),
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
