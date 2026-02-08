import { supabase } from './supabase'

export async function seedSampleData(companyId) {
  // Only run if no data exists
  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id')
    .eq('company_id', companyId)
    .limit(1)

  if (existingCustomers?.length > 0) {
    return { success: false, message: 'Data already exists, skipping seed' }
  }

  try {
    // Sample Employees (5)
    const employees = [
      { name: 'Bryce West', email: 'bryce@hhh.services', role: 'Owner', user_role: 'Admin' },
      { name: 'Mike Johnson', email: 'mike@example.com', role: 'Sales', user_role: 'User' },
      { name: 'Sarah Chen', email: 'sarah@example.com', role: 'Field Tech', user_role: 'User' },
      { name: 'Tom Williams', email: 'tom@example.com', role: 'Field Tech', user_role: 'User' },
      { name: 'Lisa Anderson', email: 'lisa@example.com', role: 'Manager', user_role: 'Admin' }
    ]

    // Sample Customers (10)
    const customers = [
      { name: 'John Smith', business_name: 'Smith Manufacturing', email: 'john@smithmfg.com', phone: '555-0101', address: '123 Industrial Ave, Denver, CO 80202', status: 'Active' },
      { name: 'Mary Johnson', business_name: 'Johnson Retail', email: 'mary@johnsonretail.com', phone: '555-0102', address: '456 Main St, Boulder, CO 80301', status: 'Active' },
      { name: 'Bob Williams', business_name: 'Williams Auto', email: 'bob@williamsauto.com', phone: '555-0103', address: '789 Auto Dr, Aurora, CO 80010', status: 'Active' },
      { name: 'Patricia Brown', business_name: 'Brown Office Park', email: 'pat@brownoffice.com', phone: '555-0104', address: '321 Corporate Blvd, Lakewood, CO 80401', status: 'Active' },
      { name: 'James Davis', business_name: 'Davis Warehouse', email: 'james@daviswarehouse.com', phone: '555-0105', address: '654 Storage Ln, Commerce City, CO 80022', status: 'Active' },
      { name: 'Jennifer Miller', business_name: 'Miller Restaurant Group', email: 'jen@millergroup.com', phone: '555-0106', address: '987 Food Court, Denver, CO 80203', status: 'Active' },
      { name: 'Michael Wilson', business_name: 'Wilson Construction', email: 'mike@wilsonconst.com', phone: '555-0107', address: '147 Builder Rd, Arvada, CO 80002', status: 'Active' },
      { name: 'Linda Moore', business_name: 'Moore Medical', email: 'linda@mooremedical.com', phone: '555-0108', address: '258 Health Way, Centennial, CO 80112', status: 'Active' },
      { name: 'David Taylor', business_name: 'Taylor Logistics', email: 'david@taylorlog.com', phone: '555-0109', address: '369 Shipping Blvd, Brighton, CO 80601', status: 'Active' },
      { name: 'Susan Anderson', business_name: 'Anderson Retail', email: 'susan@andersonretail.com', phone: '555-0110', address: '741 Shop St, Westminster, CO 80030', status: 'Active' }
    ]

    // Sample Products/Services (8)
    const products = [
      { name: 'LED Tube 4ft T8', type: 'Product', unit_price: 12.50, cost: 6.00, allotted_time_hours: 0.25 },
      { name: 'LED High Bay 150W', type: 'Product', unit_price: 125.00, cost: 65.00, allotted_time_hours: 0.5 },
      { name: 'LED Panel 2x4', type: 'Product', unit_price: 85.00, cost: 42.00, allotted_time_hours: 0.5 },
      { name: 'Occupancy Sensor', type: 'Product', unit_price: 45.00, cost: 22.00, allotted_time_hours: 0.25 },
      { name: 'Basic Installation', type: 'Service', unit_price: 75.00, cost: 35.00, allotted_time_hours: 1 },
      { name: 'Complex Installation', type: 'Service', unit_price: 150.00, cost: 70.00, allotted_time_hours: 2 },
      { name: 'Lighting Audit', type: 'Service', unit_price: 250.00, cost: 100.00, allotted_time_hours: 3 },
      { name: 'Maintenance Visit', type: 'Service', unit_price: 95.00, cost: 45.00, allotted_time_hours: 1 }
    ]

    // Sample Leads (8)
    const leads = [
      { customer_name: 'ABC Corporation', business_name: 'ABC Corp', email: 'info@abccorp.com', phone: '555-0201', address: '100 Business Park, Denver, CO', service_type: 'Lighting Retrofit', lead_source: 'Website', status: 'New' },
      { customer_name: 'XYZ Industries', business_name: 'XYZ Industries', email: 'contact@xyz.com', phone: '555-0202', address: '200 Industrial Way, Aurora, CO', service_type: 'New Construction', lead_source: 'Referral', status: 'Qualified' },
      { customer_name: 'Quick Mart', business_name: 'Quick Mart LLC', email: 'owner@quickmart.com', phone: '555-0203', address: '300 Retail Rd, Boulder, CO', service_type: 'Lighting Retrofit', lead_source: 'Cold Call', status: 'Appointment Scheduled' },
      { customer_name: 'Big Box Store', business_name: 'Big Box Inc', email: 'facilities@bigbox.com', phone: '555-0204', address: '400 Commerce Dr, Lakewood, CO', service_type: 'Lighting Retrofit', lead_source: 'Marketing', status: 'Qualified' },
      { customer_name: 'Tech Startup', business_name: 'TechStart Inc', email: 'ceo@techstart.com', phone: '555-0205', address: '500 Innovation Ln, Denver, CO', service_type: 'Office Lighting', lead_source: 'Website', status: 'New' },
      { customer_name: 'Green Grocers', business_name: 'Green Grocers', email: 'manager@greengrocers.com', phone: '555-0206', address: '600 Organic Ave, Fort Collins, CO', service_type: 'Refrigeration Lighting', lead_source: 'Referral', status: 'Waiting' },
      { customer_name: 'City Gym', business_name: 'City Gym LLC', email: 'owner@citygym.com', phone: '555-0207', address: '700 Fitness Blvd, Arvada, CO', service_type: 'Lighting Retrofit', lead_source: 'Marketing', status: 'New' },
      { customer_name: 'Mountain Hotel', business_name: 'Mountain Hospitality', email: 'gm@mountainhotel.com', phone: '555-0208', address: '800 Resort Way, Vail, CO', service_type: 'Hospitality Lighting', lead_source: 'Referral', status: 'Qualified' }
    ]

    // Sample Fleet (4)
    const fleet = [
      { asset_id: 'TRK-001', name: 'Ford F-150 #1', type: 'Vehicle', status: 'Available', mileage_hours: 45000, last_pm_date: '2026-01-01', next_pm_due: '2026-04-01' },
      { asset_id: 'TRK-002', name: 'Ford F-150 #2', type: 'Vehicle', status: 'In Use', mileage_hours: 62000, last_pm_date: '2025-12-15', next_pm_due: '2026-03-15' },
      { asset_id: 'VAN-001', name: 'Sprinter Van', type: 'Vehicle', status: 'Available', mileage_hours: 28000, last_pm_date: '2026-01-10', next_pm_due: '2026-04-10' },
      { asset_id: 'LFT-001', name: 'Scissor Lift 26ft', type: 'Equipment', status: 'Available', mileage_hours: 850, last_pm_date: '2026-01-05', next_pm_due: '2026-07-05' }
    ]

    // Sample Inventory (6)
    const inventory = [
      { name: 'LED Tube 4ft T8', sku: 'LED-T8-4FT', quantity: 250, min_quantity: 50, location: 'Warehouse A', unit_cost: 6.00 },
      { name: 'LED High Bay 150W', sku: 'LED-HB-150', quantity: 45, min_quantity: 20, location: 'Warehouse A', unit_cost: 65.00 },
      { name: 'LED Panel 2x4', sku: 'LED-PNL-2X4', quantity: 80, min_quantity: 25, location: 'Warehouse A', unit_cost: 42.00 },
      { name: 'Occupancy Sensor', sku: 'SENS-OCC-01', quantity: 120, min_quantity: 30, location: 'Warehouse B', unit_cost: 22.00 },
      { name: 'Wire Nuts (100pk)', sku: 'WIRE-NUT-100', quantity: 15, min_quantity: 20, location: 'Van Stock', unit_cost: 8.00 },
      { name: 'Mounting Brackets', sku: 'MNT-BRKT-01', quantity: 200, min_quantity: 50, location: 'Warehouse B', unit_cost: 3.50 }
    ]

    // Sample Utility Providers (3)
    const utilityProviders = [
      { provider_name: 'Xcel Energy', state: 'CO', service_territory: 'Denver Metro', has_rebate_program: true, contact_phone: '800-895-4999' },
      { provider_name: 'Colorado Springs Utilities', state: 'CO', service_territory: 'Colorado Springs', has_rebate_program: true, contact_phone: '719-448-4800' },
      { provider_name: 'Fort Collins Utilities', state: 'CO', service_territory: 'Fort Collins', has_rebate_program: true, contact_phone: '970-212-2900' }
    ]

    // Sample Fixture Types (5)
    const fixtureTypes = [
      { fixture_name: '4ft 2-Lamp T8', category: 'Linear', lamp_type: 'T8', lamp_count: 2, system_wattage: 59, led_replacement_watts: 32 },
      { fixture_name: '4ft 4-Lamp T8', category: 'Linear', lamp_type: 'T8', lamp_count: 4, system_wattage: 118, led_replacement_watts: 64 },
      { fixture_name: '400W Metal Halide High Bay', category: 'High Bay', lamp_type: 'Metal Halide', lamp_count: 1, system_wattage: 458, led_replacement_watts: 150 },
      { fixture_name: '2x4 Troffer', category: 'Recessed', lamp_type: 'T8', lamp_count: 3, system_wattage: 96, led_replacement_watts: 40 },
      { fixture_name: '150W HPS Wall Pack', category: 'Wall Pack', lamp_type: 'HPS', lamp_count: 1, system_wattage: 188, led_replacement_watts: 45 }
    ]

    // Insert all data with company_id
    for (const emp of employees) {
      await supabase.from('employees').upsert(
        { ...emp, company_id: companyId, active: true },
        { onConflict: 'email' }
      )
    }

    const { data: insertedCustomers } = await supabase
      .from('customers')
      .insert(customers.map(c => ({ ...c, company_id: companyId })))
      .select()

    await supabase
      .from('products_services')
      .insert(products.map(p => ({ ...p, company_id: companyId, active: true, taxable: true })))

    await supabase
      .from('leads')
      .insert(leads.map(l => ({ ...l, company_id: companyId })))

    await supabase
      .from('fleet')
      .insert(fleet.map(f => ({ ...f, company_id: companyId })))

    await supabase
      .from('inventory')
      .insert(inventory.map(i => ({ ...i, company_id: companyId })))

    await supabase
      .from('utility_providers')
      .insert(utilityProviders.map(p => ({ ...p, company_id: companyId })))

    await supabase
      .from('fixture_types')
      .insert(fixtureTypes.map(f => ({ ...f, company_id: companyId })))

    // Create some sample jobs if we have customers
    if (insertedCustomers && insertedCustomers.length >= 3) {
      const jobs = [
        {
          job_id: 'JOB-001',
          job_title: 'Warehouse LED Retrofit',
          customer_id: insertedCustomers[0].id,
          status: 'In Progress',
          start_date: new Date().toISOString().split('T')[0],
          total_amount: 12500.00,
          time_allotted_hours: 40,
          time_tracked_hours: 16
        },
        {
          job_id: 'JOB-002',
          job_title: 'Office Lighting Upgrade',
          customer_id: insertedCustomers[1].id,
          status: 'Scheduled',
          start_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          total_amount: 4800.00,
          time_allotted_hours: 16
        },
        {
          job_id: 'JOB-003',
          job_title: 'Parking Lot LED Conversion',
          customer_id: insertedCustomers[2].id,
          status: 'Completed',
          start_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          total_amount: 8200.00,
          time_allotted_hours: 24,
          time_tracked_hours: 22
        }
      ]

      await supabase
        .from('jobs')
        .insert(jobs.map(j => ({ ...j, company_id: companyId })))

      // Create invoices for completed job
      const { data: completedJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'Completed')
        .single()

      if (completedJob) {
        await supabase.from('invoices').insert({
          company_id: companyId,
          invoice_id: 'INV-001',
          job_id: completedJob.id,
          customer_id: insertedCustomers[2].id,
          invoice_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          due_date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          total_amount: 8200.00,
          payment_status: 'Pending'
        })
      }
    }

    // Add settings for business units, lead sources, service types
    const settingsData = [
      { key: 'business_units', value: JSON.stringify(['Commercial', 'Industrial', 'Residential', 'Government']) },
      { key: 'lead_sources', value: JSON.stringify(['Website', 'Referral', 'Cold Call', 'Marketing', 'Trade Show', 'Other']) },
      { key: 'service_types', value: JSON.stringify(['Lighting Retrofit', 'New Construction', 'Maintenance', 'Emergency Service', 'Audit']) }
    ]

    for (const setting of settingsData) {
      await supabase.from('settings').upsert(
        { ...setting, company_id: companyId },
        { onConflict: 'company_id,key' }
      )
    }

    return { success: true, message: 'Sample data seeded successfully!' }
  } catch (error) {
    console.error('Seed error:', error)
    return { success: false, message: `Error seeding data: ${error.message}` }
  }
}

export async function clearAllData(companyId, currentUserId) {
  try {
    // Delete in order to respect foreign keys
    const tables = [
      'payments',
      'invoices',
      'time_log',
      'job_lines',
      'jobs',
      'quote_lines',
      'quotes',
      'audit_areas',
      'lighting_audits',
      'incentive_measures',
      'utility_programs',
      'utility_providers',
      'fixture_types',
      'fleet_rentals',
      'fleet_maintenance',
      'fleet',
      'inventory',
      'leads',
      'sales_pipeline',
      'products_services',
      'communications_log',
      'settings',
      'customers'
    ]

    for (const table of tables) {
      await supabase.from(table).delete().eq('company_id', companyId)
    }

    // Delete employees except current user
    await supabase
      .from('employees')
      .delete()
      .eq('company_id', companyId)
      .neq('id', currentUserId)

    return { success: true, message: 'All data cleared successfully!' }
  } catch (error) {
    console.error('Clear data error:', error)
    return { success: false, message: `Error clearing data: ${error.message}` }
  }
}
