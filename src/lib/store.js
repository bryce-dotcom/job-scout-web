import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';
import { TABLES, QUERIES } from './schema';
import { offlineDb } from './offlineDb';
import { syncQueue } from './syncQueue';

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

      // Conrad Connect (Email Marketing)
      ccIntegration: null,
      emailTemplates: [],
      emailCampaigns: [],
      ccContactMap: [],
      emailAutomations: [],

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
          aiModules: [],
          ccIntegration: null,
          emailTemplates: [],
          emailCampaigns: [],
          ccContactMap: [],
          emailAutomations: []
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
            .select('*, source_employee:employees!leads_lead_source_employee_id_fkey(id, name)')
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
      // FETCH FUNCTIONS - Conrad Connect (Email Marketing)
      // ========================================

      fetchCcIntegration: async () => {
        const { companyId, hasAgent } = get();
        if (!companyId || !hasAgent('conrad-connect')) return;

        const cached = await offlineDb.getAll('ccIntegration');
        if (cached.length > 0 && !get().ccIntegration) set({ ccIntegration: cached[0] });

        try {
          const { data, error } = await supabase
            .from('cc_integrations')
            .select('*')
            .eq('company_id', companyId)
            .maybeSingle();

          if (!error) {
            set({ ccIntegration: data || null });
            if (data) {
              await offlineDb.putAll('ccIntegration', [data]);
            }
          }
        } catch (e) {
          console.log('[fetchCcIntegration] Offline, using cache');
        }
      },

      fetchEmailTemplates: async () => {
        const { companyId, hasAgent } = get();
        if (!companyId || !hasAgent('conrad-connect')) return;

        const cached = await offlineDb.getAll('emailTemplates');
        if (cached.length > 0 && get().emailTemplates.length === 0) set({ emailTemplates: cached });

        try {
          const { data, error } = await supabase
            .from('email_templates')
            .select('*')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ emailTemplates: data || [] });
            await offlineDb.putAll('emailTemplates', data || []);
          }
        } catch (e) {
          console.log('[fetchEmailTemplates] Offline, using cache');
        }
      },

      fetchEmailCampaigns: async () => {
        const { companyId, hasAgent } = get();
        if (!companyId || !hasAgent('conrad-connect')) return;

        const cached = await offlineDb.getAll('emailCampaigns');
        if (cached.length > 0 && get().emailCampaigns.length === 0) set({ emailCampaigns: cached });

        try {
          const { data, error } = await supabase
            .from('email_campaigns')
            .select('*, template:email_templates(id, name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ emailCampaigns: data || [] });
            await offlineDb.putAll('emailCampaigns', data || []);
          }
        } catch (e) {
          console.log('[fetchEmailCampaigns] Offline, using cache');
        }
      },

      fetchCcContactMap: async () => {
        const { companyId, hasAgent } = get();
        if (!companyId || !hasAgent('conrad-connect')) return;

        const cached = await offlineDb.getAll('ccContactMap');
        if (cached.length > 0 && get().ccContactMap.length === 0) set({ ccContactMap: cached });

        try {
          const { data, error } = await supabase
            .from('cc_contact_map')
            .select('*, customer:customers(id, name), lead:leads(id, customer_name)')
            .eq('company_id', companyId);

          if (!error) {
            set({ ccContactMap: data || [] });
            await offlineDb.putAll('ccContactMap', data || []);
          }
        } catch (e) {
          console.log('[fetchCcContactMap] Offline, using cache');
        }
      },

      fetchEmailAutomations: async () => {
        const { companyId, hasAgent } = get();
        if (!companyId || !hasAgent('conrad-connect')) return;

        const cached = await offlineDb.getAll('emailAutomations');
        if (cached.length > 0 && get().emailAutomations.length === 0) set({ emailAutomations: cached });

        try {
          const { data, error } = await supabase
            .from('email_automations')
            .select('*, template:email_templates(id, name)')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

          if (!error) {
            set({ emailAutomations: data || [] });
            await offlineDb.putAll('emailAutomations', data || []);
          }
        } catch (e) {
          console.log('[fetchEmailAutomations] Offline, using cache');
        }
      },

      // Conrad CRUD mutations
      createEmailTemplate: async (templateData) => {
        const { companyId, user } = get();
        const record = { ...templateData, company_id: companyId, created_by: user?.id };

        try {
          const { data, error } = await supabase
            .from('email_templates')
            .insert(record)
            .select()
            .single();

          if (error) throw error;
          set(state => ({ emailTemplates: [data, ...state.emailTemplates] }));
          await offlineDb.put('emailTemplates', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      updateEmailTemplate: async (id, changes) => {
        try {
          const { data, error } = await supabase
            .from('email_templates')
            .update({ ...changes, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          set(state => ({
            emailTemplates: state.emailTemplates.map(t => t.id === id ? data : t)
          }));
          await offlineDb.put('emailTemplates', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      deleteEmailTemplate: async (id) => {
        try {
          const { error } = await supabase
            .from('email_templates')
            .delete()
            .eq('id', id);

          if (error) throw error;
          set(state => ({
            emailTemplates: state.emailTemplates.filter(t => t.id !== id)
          }));
          await offlineDb.remove('emailTemplates', id);
          return { error: null };
        } catch (e) {
          return { error: e };
        }
      },

      createEmailCampaign: async (campaignData) => {
        const { companyId, user } = get();
        const record = { ...campaignData, company_id: companyId, created_by: user?.id };

        try {
          const { data, error } = await supabase
            .from('email_campaigns')
            .insert(record)
            .select('*, template:email_templates(id, name)')
            .single();

          if (error) throw error;
          set(state => ({ emailCampaigns: [data, ...state.emailCampaigns] }));
          await offlineDb.put('emailCampaigns', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      updateEmailCampaign: async (id, changes) => {
        try {
          const { data, error } = await supabase
            .from('email_campaigns')
            .update({ ...changes, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*, template:email_templates(id, name)')
            .single();

          if (error) throw error;
          set(state => ({
            emailCampaigns: state.emailCampaigns.map(c => c.id === id ? data : c)
          }));
          await offlineDb.put('emailCampaigns', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      deleteEmailCampaign: async (id) => {
        try {
          const { error } = await supabase
            .from('email_campaigns')
            .delete()
            .eq('id', id);

          if (error) throw error;
          set(state => ({
            emailCampaigns: state.emailCampaigns.filter(c => c.id !== id)
          }));
          await offlineDb.remove('emailCampaigns', id);
          return { error: null };
        } catch (e) {
          return { error: e };
        }
      },

      createEmailAutomation: async (automationData) => {
        const { companyId } = get();
        const record = { ...automationData, company_id: companyId };

        try {
          const { data, error } = await supabase
            .from('email_automations')
            .insert(record)
            .select('*, template:email_templates(id, name)')
            .single();

          if (error) throw error;
          set(state => ({ emailAutomations: [data, ...state.emailAutomations] }));
          await offlineDb.put('emailAutomations', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      updateEmailAutomation: async (id, changes) => {
        try {
          const { data, error } = await supabase
            .from('email_automations')
            .update({ ...changes, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('*, template:email_templates(id, name)')
            .single();

          if (error) throw error;
          set(state => ({
            emailAutomations: state.emailAutomations.map(a => a.id === id ? data : a)
          }));
          await offlineDb.put('emailAutomations', data);
          return { data, error: null };
        } catch (e) {
          return { data: null, error: e };
        }
      },

      deleteEmailAutomation: async (id) => {
        try {
          const { error } = await supabase
            .from('email_automations')
            .delete()
            .eq('id', id);

          if (error) throw error;
          set(state => ({
            emailAutomations: state.emailAutomations.filter(a => a.id !== id)
          }));
          await offlineDb.remove('emailAutomations', id);
          return { error: null };
        } catch (e) {
          return { error: e };
        }
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
      // OFFLINE MUTATION METHODS
      // ========================================

      // --- Lighting Audits ---
      createLightingAudit: async (auditData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...auditData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ lightingAudits: [record, ...state.lightingAudits] }))
        await offlineDb.put('lightingAudits', record)
        await syncQueue.enqueue({ table: 'lightingAudits', operation: 'insert', data: auditData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateLightingAudit: async (id, changes) => {
        set(state => ({ lightingAudits: state.lightingAudits.map(a => String(a.id) === String(id) ? { ...a, ...changes } : a) }))
        const full = get().lightingAudits.find(a => String(a.id) === String(id))
        if (full) await offlineDb.put('lightingAudits', full)
        await syncQueue.enqueue({ table: 'lightingAudits', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteLightingAudit: async (id) => {
        set(state => ({ lightingAudits: state.lightingAudits.filter(a => String(a.id) !== String(id)) }))
        await offlineDb.remove('lightingAudits', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'lightingAudits', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Audit Areas ---
      createAuditArea: async (areaData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...areaData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ auditAreas: [...state.auditAreas, record] }))
        await offlineDb.put('auditAreas', record)
        const parentTempId = typeof areaData.audit_id === 'string' && areaData.audit_id.startsWith('temp_') ? areaData.audit_id : null
        await syncQueue.enqueue({ table: 'auditAreas', operation: 'insert', data: areaData, tempId, parentTempId, parentFkField: 'audit_id' })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateAuditArea: async (id, changes) => {
        set(state => ({ auditAreas: state.auditAreas.map(a => String(a.id) === String(id) ? { ...a, ...changes } : a) }))
        const full = get().auditAreas.find(a => String(a.id) === String(id))
        if (full) await offlineDb.put('auditAreas', full)
        await syncQueue.enqueue({ table: 'auditAreas', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteAuditArea: async (id) => {
        set(state => ({ auditAreas: state.auditAreas.filter(a => String(a.id) !== String(id)) }))
        await offlineDb.remove('auditAreas', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'auditAreas', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Customers ---
      createCustomer: async (custData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...custData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ customers: [...state.customers, record] }))
        await offlineDb.put('customers', record)
        await syncQueue.enqueue({ table: 'customers', operation: 'insert', data: custData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateCustomer: async (id, changes) => {
        set(state => ({ customers: state.customers.map(c => String(c.id) === String(id) ? { ...c, ...changes } : c) }))
        const full = get().customers.find(c => String(c.id) === String(id))
        if (full) await offlineDb.put('customers', full)
        await syncQueue.enqueue({ table: 'customers', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },

      // --- Leads ---
      createLead: async (leadData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...leadData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ leads: [record, ...state.leads] }))
        await offlineDb.put('leads', record)
        await syncQueue.enqueue({ table: 'leads', operation: 'insert', data: leadData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateLead: async (id, changes) => {
        set(state => ({ leads: state.leads.map(l => String(l.id) === String(id) ? { ...l, ...changes } : l) }))
        const full = get().leads.find(l => String(l.id) === String(id))
        if (full) await offlineDb.put('leads', full)
        await syncQueue.enqueue({ table: 'leads', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteLead: async (id) => {
        set(state => ({ leads: state.leads.filter(l => String(l.id) !== String(id)) }))
        await offlineDb.remove('leads', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'leads', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Sales Pipeline ---
      createSalesPipeline: async (pipeData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...pipeData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ salesPipeline: [record, ...state.salesPipeline] }))
        await offlineDb.put('salesPipeline', record)
        const parentTempId = typeof pipeData.lead_id === 'string' && pipeData.lead_id.startsWith('temp_') ? pipeData.lead_id : null
        await syncQueue.enqueue({ table: 'salesPipeline', operation: 'insert', data: pipeData, tempId, parentTempId, parentFkField: 'lead_id' })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateSalesPipeline: async (id, changes) => {
        set(state => ({ salesPipeline: state.salesPipeline.map(p => String(p.id) === String(id) ? { ...p, ...changes } : p) }))
        const full = get().salesPipeline.find(p => String(p.id) === String(id))
        if (full) await offlineDb.put('salesPipeline', full)
        await syncQueue.enqueue({ table: 'salesPipeline', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },

      // --- Quotes ---
      createQuote: async (quoteData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...quoteData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ quotes: [record, ...state.quotes] }))
        await offlineDb.put('quotes', record)
        await syncQueue.enqueue({ table: 'quotes', operation: 'insert', data: quoteData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateQuote: async (id, changes) => {
        set(state => ({ quotes: state.quotes.map(q => String(q.id) === String(id) ? { ...q, ...changes } : q) }))
        const full = get().quotes.find(q => String(q.id) === String(id))
        if (full) await offlineDb.put('quotes', full)
        await syncQueue.enqueue({ table: 'quotes', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteQuote: async (id) => {
        set(state => ({ quotes: state.quotes.filter(q => String(q.id) !== String(id)) }))
        await offlineDb.remove('quotes', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'quotes', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Quote Lines ---
      createQuoteLine: async (lineData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...lineData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ quoteLines: [...(state.quoteLines || []), record] }))
        await offlineDb.put('quoteLines', record)
        const parentTempId = typeof lineData.quote_id === 'string' && lineData.quote_id.startsWith('temp_') ? lineData.quote_id : null
        await syncQueue.enqueue({ table: 'quoteLines', operation: 'insert', data: lineData, tempId, parentTempId, parentFkField: 'quote_id' })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateQuoteLine: async (id, changes) => {
        set(state => ({ quoteLines: (state.quoteLines || []).map(l => String(l.id) === String(id) ? { ...l, ...changes } : l) }))
        const full = (get().quoteLines || []).find(l => String(l.id) === String(id))
        if (full) await offlineDb.put('quoteLines', full)
        await syncQueue.enqueue({ table: 'quoteLines', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteQuoteLine: async (id) => {
        set(state => ({ quoteLines: (state.quoteLines || []).filter(l => String(l.id) !== String(id)) }))
        await offlineDb.remove('quoteLines', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'quoteLines', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Appointments ---
      createAppointment: async (apptData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...apptData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ appointments: [...state.appointments, record] }))
        await offlineDb.put('appointments', record)
        await syncQueue.enqueue({ table: 'appointments', operation: 'insert', data: apptData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateAppointment: async (id, changes) => {
        set(state => ({ appointments: state.appointments.map(a => String(a.id) === String(id) ? { ...a, ...changes } : a) }))
        const full = get().appointments.find(a => String(a.id) === String(id))
        if (full) await offlineDb.put('appointments', full)
        await syncQueue.enqueue({ table: 'appointments', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteAppointment: async (id) => {
        set(state => ({ appointments: state.appointments.filter(a => String(a.id) !== String(id)) }))
        await offlineDb.remove('appointments', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'appointments', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
      },

      // --- Job Sections (Job Board) ---
      createJobSection: async (sectionData) => {
        const tempId = `temp_${crypto.randomUUID()}`
        const record = { ...sectionData, id: tempId, created_at: new Date().toISOString() }
        set(state => ({ jobSections: [...(state.jobSections || []), record] }))
        await offlineDb.put('jobSections', record)
        await syncQueue.enqueue({ table: 'jobSections', operation: 'insert', data: sectionData, tempId })
        if (navigator.onLine) syncQueue.processQueue()
        return tempId
      },
      updateJobSection: async (id, changes) => {
        set(state => ({ jobSections: (state.jobSections || []).map(s => String(s.id) === String(id) ? { ...s, ...changes } : s) }))
        const full = (get().jobSections || []).find(s => String(s.id) === String(id))
        if (full) await offlineDb.put('jobSections', full)
        await syncQueue.enqueue({ table: 'jobSections', operation: 'update', data: { id, ...changes } })
        if (navigator.onLine) syncQueue.processQueue()
      },
      deleteJobSection: async (id) => {
        set(state => ({ jobSections: (state.jobSections || []).filter(s => String(s.id) !== String(id)) }))
        await offlineDb.remove('jobSections', id)
        if (!String(id).startsWith('temp_')) {
          await syncQueue.enqueue({ table: 'jobSections', operation: 'delete', data: { id } })
          if (navigator.onLine) syncQueue.processQueue()
        }
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
          fetchAiModules,
          fetchCcIntegration,
          fetchEmailTemplates,
          fetchEmailCampaigns,
          fetchCcContactMap,
          fetchEmailAutomations
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
          fetchAiModules(),
          fetchCcIntegration(),
          fetchEmailTemplates(),
          fetchEmailCampaigns(),
          fetchCcContactMap(),
          fetchEmailAutomations()
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
