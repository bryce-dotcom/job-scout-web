# Job Scout - Database Schema Reference

**Single source of truth for all Supabase column names.**
**Queried from live database: February 6, 2026**

> Before writing ANY Supabase query, verify column names exist in this file.
> If a column is not listed here, it does not exist in the database.

---

## agents

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| slug | text | |
| name | text | |
| title | text | |
| full_name | text | |
| tagline | text | |
| description | text | |
| icon | text | |
| avatar_url | text | |
| trade_category | text | |
| ai_capabilities | text[] | |
| price_monthly | numeric | 29.99 |
| price_yearly | numeric | 299.99 |
| is_free | boolean | false |
| status | text | 'coming_soon' |
| display_order | integer | 100 |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## ai_messages

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| message_id | text | |
| session_id | text | |
| timestamp | timestamptz | |
| role | text | |
| content | text | |
| intent_detected | text | |
| module_used | text | |
| entities_json | text | |
| actions_taken | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## ai_modules

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| module_name | text | |
| display_name | text | |
| description | text | |
| icon | text | 'Bot' |
| status | text | 'active' |
| default_menu_section | text | |
| default_menu_parent | text | |
| user_menu_section | text | |
| user_menu_parent | text | |
| sort_order | integer | 0 |
| capabilities_json | jsonb | |
| config_json | jsonb | |
| route_path | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## ai_sessions

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| session_id | text | |
| user_email | text | |
| started | text | |
| last_activity | text | |
| status | text | |
| current_module | text | |
| context_json | text | |
| pending_action | text | |
| pending_data | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## appointments

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| lead_id | integer | FK leads.id |
| customer_id | integer | FK customers.id |
| title | text | |
| start_time | timestamptz | |
| end_time | timestamptz | |
| duration_minutes | integer | 60 |
| location | text | |
| employee_id | integer | FK employees.id |
| salesperson_id | integer | FK employees.id |
| setter_id | integer | FK employees.id |
| lead_owner_id | integer | FK employees.id |
| status | text | 'Scheduled' |
| appointment_type | text | |
| outcome | text | |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## assets

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| name | text | |
| asset_type | text | |
| purchase_price | numeric | |
| current_value | numeric | |
| status | text | 'active' |
| created_at | timestamptz | now() |

---

## audit_areas

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| area_id | text | |
| audit_id | integer | FK lighting_audits.id |
| area_name | text | |
| photos_url | text | |
| ceiling_height | numeric | |
| ai_analysis_json | text | |
| fixture_type_detected | text | |
| fixture_category | text | |
| lighting_type | text | |
| fixture_count | integer | |
| existing_wattage | integer | |
| total_existing_watts | integer | |
| led_replacement_id | integer | FK products_services.id |
| led_wattage | integer | |
| total_led_watts | integer | |
| confirmed | boolean | false |
| override_notes | text | |
| area_watts_reduced | integer | |
| area_rebate_estimate | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| photos | text[] | |
| led_replacement | integer | FK products_services.id |

---

## audit_log

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| company_id | integer | |
| user_email | text | |
| action | text | |
| table_name | text | |
| record_id | text | |
| old_values | jsonb | |
| new_values | jsonb | |
| created_at | timestamptz | now() |
| old_data | jsonb | |
| new_data | jsonb | |
| user_id | uuid | |

---

## bank_accounts

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| name | text | |
| account_type | text | 'checking' |
| current_balance | numeric | 0 |
| last_synced | timestamptz | |
| created_at | timestamptz | now() |

---

## bookings

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| booking_id | text | |
| business_unit | text | |
| customer_name | text | |
| email | text | |
| phone | text | |
| address | text | |
| service_type | text | |
| preferred_date | date | |
| status | text | 'Pending' |
| suggested_slots | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## communications_log

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| communication_id | text | |
| business_unit | text | |
| type | text | |
| trigger | text | |
| customer_id | integer | FK customers.id |
| recipient | text | |
| sent_date | date | |
| status | text | |
| response | text | |
| employee_id | integer | FK employees.id |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## companies

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_name | text | |
| owner_email | text | |
| phone | text | |
| address | text | |
| logo_url | text | |
| subscription_tier | text | 'free' |
| active | boolean | true |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| pay_frequency | text | 'bi-weekly' |
| pay_day_1 | text | '20' |
| pay_day_2 | text | '5' |
| setter_pay_per_appointment | numeric | 25 |
| marketer_pay_per_appointment | numeric | 10 |
| commission_requires_quote | boolean | true |

---

## company_agents

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| agent_id | integer | FK agents.id |
| custom_name | text | |
| activated_at | timestamptz | now() |
| expires_at | timestamptz | |
| subscription_status | text | 'active' |
| settings | jsonb | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## custom_forms

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| form_id | text | |
| business_unit | text | |
| job_id | integer | FK jobs.id |
| field_name | text | |
| field_value | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## customers

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| customer_id | text | |
| name | text | |
| email | text | |
| phone | text | |
| address | text | |
| salesperson_id | integer | FK employees.id |
| status | text | 'Active' |
| preferred_contact | text | 'Phone' |
| tags | text | |
| notes | text | |
| secondary_contact_name | text | |
| secondary_contact_email | text | |
| secondary_contact_phone | text | |
| secondary_contact_role | text | |
| marketing_opt_in | boolean | false |
| business_name | text | |
| job_title | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| salesperson | text | |

---

## deal_activities

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| company_id | integer | FK companies.id |
| deal_id | uuid | |
| activity_type | text | |
| subject | text | |
| description | text | |
| from_stage_id | uuid | FK pipeline_stages.id |
| to_stage_id | uuid | FK pipeline_stages.id |
| scheduled_at | timestamptz | |
| completed_at | timestamptz | |
| is_completed | boolean | false |
| created_by | integer | FK employees.id |
| created_at | timestamptz | now() |

---

## document_packages

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| name | text | |
| deal_type | text | |
| description | text | |
| form_ids | integer[] | |
| docs | jsonb | |
| dealer_id | integer | |
| created_at | timestamptz | now() |

---

## employees

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| employee_id | text | |
| name | text | |
| email | text | |
| role | text | 'Field Tech' |
| headshot_url | text | |
| phone | text | |
| gusto_uuid | text | |
| gps_opt_in | boolean | false |
| business_unit | text | |
| user_role | text | 'User' |
| active | boolean | true |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| headshot | text | |
| is_developer | boolean | false |
| is_admin | boolean | false |
| hourly_rate | numeric | 0 |
| salary | numeric | 0 |
| pay_type | text[] | |
| pto_days_per_year | numeric | 10 |
| pto_accrued | numeric | 0 |
| pto_used | numeric | 0 |
| annual_salary | numeric | 0 |
| commission_goods_rate | numeric | 0 |
| commission_goods_type | text | 'percent' |
| commission_services_rate | numeric | 0 |
| commission_services_type | text | 'percent' |
| commission_software_rate | numeric | 0 |
| commission_software_type | text | 'percent' |
| commission_leads_rate | numeric | 0 |
| commission_leads_type | text | 'flat' |
| commission_setter_rate | numeric | 25 |
| commission_setter_type | text | 'flat' |
| is_hourly | boolean | false |
| is_salary | boolean | false |
| is_commission | boolean | false |
| tax_classification | text | 'W2' |

---

## expense_categories

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | |
| name | text | |
| icon | text | |
| color | text | '#6b7280' |
| type | text | 'expense' |
| sort_order | integer | 0 |

---

## expenses

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| expense_id | text | |
| business_unit | text | |
| job_id | integer | FK jobs.id |
| amount | numeric | |
| description | text | |
| date | timestamptz | |
| category | text | |
| status | text | 'Pending' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## feedback

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| company_id | integer | FK companies.id |
| user_email | text | |
| page_url | text | |
| feedback_type | text | |
| message | text | |
| screenshot_url | text | |
| status | text | 'new' |
| created_at | timestamptz | now() |
| resolved_at | timestamptz | |
| resolved_by | text | |
| notes | text | |

---

## fixture_types

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| fixture_id | text | |
| fixture_name | text | |
| category | text | |
| lamp_type | text | |
| lamp_count | integer | |
| system_wattage | integer | |
| visual_characteristics | text | |
| led_replacement_watts | integer | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## fleet

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| asset_id | text | |
| type | text | |
| name | text | |
| last_pm_date | date | |
| next_pm_due | date | |
| mileage_hours | numeric | |
| status | text | 'Available' |
| maintenance_alert | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| business_unit | text | |
| repair_id | text | |
| repair_date | date | |
| repair_description | text | |
| repair_cost | numeric | |
| rental_id | text | |
| rental_start_date | date | |
| rental_end_date | date | |
| rental_customer | text | |
| rental_rate | numeric | |
| description | text | |

---

## fleet_maintenance

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| maintenance_id | text | |
| asset_id | integer | FK fleet.id |
| type | text | |
| date | timestamptz | |
| mileage_hours | numeric | |
| description | text | |
| cost | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## fleet_rentals

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| rental_id | text | |
| asset_id | integer | FK fleet.id |
| rental_customer | text | |
| start_date | timestamptz | |
| end_date | timestamptz | |
| rental_rate | text | |
| status | text | 'Active' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## form_registry

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| state | text | |
| county | text | |
| form_number | text | |
| form_name | text | |
| category | text | 'deal' |
| required_for | text[] | |
| source_url | text | |
| download_url | text | |
| description | text | |
| is_fillable | boolean | false |
| storage_bucket | text | |
| storage_path | text | |
| detected_fields | jsonb | |
| field_mappings | jsonb | |
| ai_discovered | boolean | false |
| ai_confidence | numeric | |
| last_verified | date | |
| dealer_id | integer | |
| created_at | timestamptz | now() |

---

## helpers

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| list_name | text | |
| dynamic_list | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## incentives

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| incentive_id | text | |
| job_id | integer | FK jobs.id |
| incentive_amount | numeric | |
| utility_name | text | |
| status | text | 'Pending' |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## inventory

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| item_id | text | |
| name | text | |
| quantity | numeric | |
| min_quantity | numeric | |
| available | boolean | true |
| location | text | |
| last_updated | date | |
| ordering_trigger | text | |
| product_id | integer | FK products_services.id |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| inventory_type | text | 'Material' |
| barcode | text | |
| image_url | text | |
| condition | text | 'Good' |
| assigned_to | integer | FK employees.id |
| serial_number | text | |
| group_id | integer | FK product_groups.id |

---

## invoices

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| invoice_id | text | |
| business_unit | text | |
| customer_id | integer | FK customers.id |
| job_id | integer | FK jobs.id |
| amount | numeric | |
| payment_method | text | |
| payment_status | text | 'Pending' |
| discount_applied | numeric | |
| credit_card_fee | numeric | |
| job_description | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## job_lines

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| job_line_id | text | |
| job_id | integer | FK jobs.id |
| item_id | integer | FK products_services.id |
| quantity | integer | 1 |
| price | numeric | |
| total | numeric | |
| description | text | |
| notes | text | |
| totals | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## job_sections

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| job_id | integer | FK jobs.id |
| name | text | |
| description | text | |
| sort_order | integer | 0 |
| percent_of_job | numeric | 0 |
| status | text | 'Not Started' |
| assigned_to | integer | FK employees.id |
| scheduled_date | date | |
| start_time | timestamptz | |
| end_time | timestamptz | |
| estimated_hours | numeric | |
| actual_hours | numeric | |
| notes | text | |
| verified_by | integer | FK employees.id |
| verified_at | timestamptz | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## jobs

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| job_id | text | |
| business_unit | text | |
| allotted_time_hours | numeric | |
| customer_id | integer | FK customers.id |
| salesperson_id | integer | FK employees.id |
| status | text | 'Scheduled' |
| assigned_team | text | |
| start_date | timestamptz | |
| end_date | timestamptz | |
| details | text | |
| invoice_status | text | 'Not Invoiced' |
| time_tracked | numeric | 0 |
| recurrence | text | |
| expense_amount | numeric | |
| job_address | text | |
| gps_location | text | |
| profit_margin | numeric | |
| incentive_amount | numeric | |
| utility_name | text | |
| incentive_status | text | |
| quote_id | integer | FK quotes.id |
| job_title | text | |
| utility_incentive | numeric | 0 |
| discount | numeric | 0 |
| discount_description | text | |
| work_order_pdf_url | text | |
| calculated_allotted_time | numeric | |
| job_total | numeric | |
| out_of_pocket_total | numeric | |
| lead_id | text | |
| customer_name | text | |
| email | text | |
| phone | text | |
| address | text | |
| service_type | text | |
| lead_source | text | |
| notes | text | |
| quote_generated | boolean | false |
| business_name | text | |
| last_updated | timestamptz | |
| lead_source_name | text | |
| appointment_edit_link | boolean | false |
| calendar_embed_url | text | |
| sales_meeting_calendar_url | text | |
| sales_calendar_web_link | text | |
| unique_temp | text | |
| computed_status | text | |
| appointment_time | timestamptz | |
| event_id | text | |
| edit_link | text | |
| route_id | integer | |
| team | text | |
| date | timestamptz | |
| job_ids | text | |
| route_order | text | |
| total_distance | numeric | |
| total_time | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| work_order_pdf | text | |
| generate_work_order | boolean | false |
| salesperson | text | |
| audit_id | integer | |
| pm_id | integer | FK employees.id |

---

## labor_rates

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| name | text | |
| rate_per_hour | numeric | |
| description | text | |
| multiplier | numeric | 1 |
| active | boolean | true |
| is_default | boolean | false |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## lead_commissions

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| lead_id | integer | FK leads.id |
| appointment_id | integer | FK appointments.id |
| commission_type | text | |
| employee_id | integer | FK employees.id |
| amount | numeric | 0 |
| rate_type | text | 'flat' |
| payment_status | text | 'pending' |
| notes | text | |
| created_at | timestamptz | now() |

---

## lead_payments

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| payment_id | text | |
| lead_id | integer | FK leads.id |
| lead_source | text | |
| amount | numeric | |
| payment_status | text | 'Pending' |
| date_created | date | |
| notes | text | |
| setter_pay_per_appointment | numeric | |
| marketer_pay_per_appointment | numeric | |
| lead_customer_name | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## leads

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| lead_id | text | |
| business_unit | text | |
| customer_name | text | |
| email | text | |
| phone | text | |
| address | text | |
| service_type | text | |
| lead_source | text | |
| status | text | 'New' |
| salesperson_id | integer | FK employees.id |
| notes | text | |
| created_date | timestamptz | now() |
| quote_generated | boolean | false |
| business_name | text | |
| job_title | text | |
| last_updated | timestamptz | |
| lead_source_name | text | |
| appointment_edit_link | boolean | false |
| calendar_embed_url | text | |
| sales_meeting_calendar_url | text | |
| sales_calendar_web_link | text | |
| unique_temp | text | |
| computed_status | text | |
| appointment_time | timestamptz | |
| event_id | text | |
| edit_link | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| salesperson | text | |
| setter_id | integer | FK employees.id |
| appointment_id | integer | FK appointments.id |
| last_contact_at | timestamptz | |
| contact_attempts | integer | 0 |
| callback_date | date | |
| callback_notes | text | |
| lead_owner_id | integer | FK employees.id |
| setter_owner_id | integer | FK employees.id |
| customer_id | integer | |
| converted_at | timestamptz | |
| quote_id | integer | |

---

## liabilities

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| name | text | |
| liability_type | text | |
| current_balance | numeric | |
| monthly_payment | numeric | |
| lender | text | |
| status | text | 'active' |
| created_at | timestamptz | now() |

---

## lighting_audits

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| audit_id | text | |
| customer_id | integer | FK customers.id |
| job_id | integer | FK jobs.id |
| created_by | text | |
| created_date | date | |
| status | text | 'Draft' |
| address | text | |
| city | text | |
| state | text | |
| zip | text | |
| utility_provider_id | integer | FK utility_providers.id |
| electric_rate | numeric | |
| operating_hours | integer | |
| operating_days | integer | |
| total_existing_watts | integer | |
| total_proposed_watts | integer | |
| total_fixtures | integer | |
| annual_savings_kwh | integer | |
| annual_savings_dollars | numeric | |
| estimated_rebate | numeric | |
| est_project_cost | numeric | |
| net_cost | numeric | |
| payback_months | numeric | |
| proposal_pdf_url | text | |
| notes | text | |
| watts_reduced | integer | |
| applicable_rebate_rate | numeric | |
| calculated_rebate | numeric | |
| rebate_capped | integer | |
| rebate_source | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| proposal_pdf | text | |
| lead_id | integer | |

---

## manual_expenses

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| description | text | |
| amount | numeric | |
| expense_date | date | |
| vendor | text | |
| category_id | integer | FK expense_categories.id |
| created_at | timestamptz | now() |

---

## payments

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| payment_id | text | |
| invoice_id | integer | FK invoices.id |
| amount | numeric | |
| date | date | |
| method | text | |
| status | text | 'Pending' |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## payroll_runs

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| period_start | date | |
| period_end | date | |
| pay_date | date | |
| status | text | 'completed' |
| total_gross | numeric | |
| employee_count | integer | |
| created_by | integer | FK employees.id |
| created_at | timestamptz | now() |

---

## paystubs

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| employee_id | integer | FK employees.id |
| payroll_run_id | integer | FK payroll_runs.id |
| period_start | date | |
| period_end | date | |
| pay_date | date | |
| regular_hours | numeric | 0 |
| overtime_hours | numeric | 0 |
| pto_hours | numeric | 0 |
| hourly_rate | numeric | |
| salary_amount | numeric | |
| gross_pay | numeric | |
| created_at | timestamptz | now() |

---

## prescriptive_measures

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| program_id | integer | FK utility_programs.id, NOT NULL |
| measure_code | text | |
| measure_name | text | NOT NULL |
| measure_category | text | 'Lighting' |
| measure_subcategory | text | |
| baseline_equipment | text | |
| baseline_wattage | numeric | |
| baseline_lamp_count | integer | |
| baseline_condition | text | |
| replacement_equipment | text | |
| replacement_wattage | numeric | |
| replacement_lamp_count | integer | |
| watts_reduced | numeric | GENERATED (baseline_wattage - replacement_wattage) |
| incentive_amount | numeric | NOT NULL |
| incentive_unit | text | 'per_fixture' |
| incentive_formula | text | |
| max_incentive | numeric | |
| max_project_percent | numeric | |
| min_quantity | integer | |
| max_quantity | integer | |
| location_type | text | |
| application_type | text | 'retrofit' |
| building_type | text | |
| hours_requirement | integer | |
| dlc_required | boolean | false |
| dlc_tier | text | |
| energy_star_required | boolean | false |
| other_certification | text | |
| effective_date | date | |
| expiration_date | date | |
| is_active | boolean | true |
| source_page | text | |
| source_url | text | |
| source_notes | text | |
| needs_pdf_upload | boolean | false |
| source_pdf_url | text | |
| notes | text | |
| ai_match_keywords | text[] | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## pipeline_stages

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| company_id | integer | FK companies.id |
| name | text | |
| position | integer | 0 |
| win_probability | integer | 0 |
| color | text | '#5a6349' |
| is_won | boolean | false |
| is_lost | boolean | false |
| rotting_days | integer | 14 |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## product_groups

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| service_type | text | |
| name | text | |
| description | text | |
| image_url | text | |
| icon | text | 'Package' |
| sort_order | integer | 0 |
| active | boolean | true |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## products_services

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| item_id | text | |
| business_unit | text | |
| type | text | 'Service' |
| name | text | |
| description | text | |
| unit_price | numeric | |
| cost | numeric | |
| markup_percent | numeric | |
| taxable | boolean | true |
| image_url | text | |
| active | boolean | true |
| allotted_time_hours | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| image | text | |
| group_id | integer | FK product_groups.id |
| labor_rate_id | integer | FK labor_rates.id |

---

## quote_lines

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| line_id | text | |
| quote_id | integer | FK quotes.id |
| item_id | integer | FK products_services.id |
| quantity | integer | 1 |
| price | numeric | |
| line_total | numeric | |
| total | numeric | |
| item_name | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## quotes

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| quote_id | text | |
| business_unit | text | |
| lead_id | integer | FK leads.id |
| customer_id | integer | FK customers.id |
| salesperson_id | integer | FK employees.id |
| quote_amount | numeric | |
| sent_date | timestamptz | |
| status | text | 'Draft' |
| contract_required | boolean | false |
| contract_signed | boolean | false |
| follow_up_1 | timestamptz | |
| follow_up_2 | timestamptz | |
| temp_customer_id | text | |
| temp_job_id | text | |
| job_title | text | |
| utility_incentive | numeric | 0 |
| discount | numeric | 0 |
| discount_description | text | |
| service_type | text | |
| calculated_quote_amount | numeric | |
| job_total | numeric | |
| out_of_pocket_total | numeric | |
| metric | text | |
| value | numeric | |
| category | text | |
| date | timestamptz | |
| profit | numeric | |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| salesperson | text | |
| audit_id | integer | |
| audit_type | text | |

---

## incentive_measures (renamed from rebate_rates)

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| rate_id | text | |
| program_id | integer | FK utility_programs.id |
| location_type | text | |
| fixture_category | text | |
| control_level | text | |
| calc_method | text | |
| rate | numeric | |
| rate_unit | text | |
| min_watts | integer | |
| max_watts | integer | |
| notes | text | |
| measure_type | text | |
| rate_value | numeric | |
| cap_amount | numeric | |
| cap_percent | numeric | |
| requirements | text | |
| measure_category | text | 'Lighting' |
| measure_subcategory | text | |
| equipment_requirements | text | |
| installation_requirements | text | |
| baseline_description | text | |
| replacement_description | text | |
| useful_life_years | integer | |
| tier | text | |
| effective_date | date | |
| expiration_date | date | |
| per_unit_cap | numeric | |
| project_cap_percent | numeric | |
| source_pdf_url | text | |
| pdf_verified | boolean | false |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## rebate_update_log

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| log_id | text | |
| timestamp | timestamptz | |
| program_id | integer | FK utility_programs.id |
| action | text | |
| old_value | text | |
| new_value | text | |
| source_url | text | |
| verified_by | text | |
| status | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## reports

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| company_id | integer | FK companies.id |
| metric | text | |
| business_unit | text | |
| value | numeric | |
| category | text | |
| date | date | |
| profit | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | now() |

---

## routes

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| route_id | text | |
| team | text | |
| date | timestamptz | |
| job_ids | text | |
| route_order | text | |
| total_distance | numeric | |
| total_time | numeric | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| business_unit | text | |

---

## sales_pipeline

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| lead_id | integer | FK leads.id |
| business_unit | text | |
| customer_id | integer | FK customers.id |
| salesperson_id | integer | FK employees.id |
| stage | text | 'New Lead' |
| quote_amount | numeric | |
| date_created | date | |
| last_updated | date | |
| quote_sent_date | date | |
| quote_status | text | |
| contract_required | boolean | false |
| contract_signed | boolean | false |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |
| salesperson | text | |

---

## saved_queries

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| name | text | |
| query | text | |
| created_by | uuid | |
| created_at | timestamptz | now() |

---

## search_index

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| search_id | text | |
| business_unit | text | |
| type | text | |
| name | text | |
| status | text | |
| salesperson_id | integer | FK employees.id |
| details | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## setter_commissions

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| lead_id | integer | FK leads.id |
| appointment_id | integer | |
| setter_id | integer | FK employees.id |
| marketer_id | integer | FK employees.id |
| setter_amount | numeric | 0 |
| marketer_amount | numeric | 0 |
| payment_status | text | 'pending' |
| requires_quote | boolean | true |
| quote_generated | boolean | false |
| quote_id | integer | |
| approved_by | integer | FK employees.id |
| approved_at | timestamptz | |
| paid_at | timestamptz | |
| notes | text | |
| created_at | timestamptz | now() |

---

## settings

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| key | text | |
| list_name | text | |
| value | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## sync_log

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| timestamp | timestamptz | |
| action | text | |
| event_id | text | |
| status | text | |
| details | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## system_settings

| Column | Type | Default |
|--------|------|---------|
| id | uuid | gen_random_uuid() |
| key | text | |
| value | jsonb | |
| description | text | |
| updated_at | timestamptz | now() |
| updated_by | text | |

---

## time_clock

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| employee_id | integer | FK employees.id |
| clock_in | timestamptz | |
| clock_out | timestamptz | |
| clock_in_lat | numeric | |
| clock_in_lng | numeric | |
| clock_in_address | text | |
| clock_out_lat | numeric | |
| clock_out_lng | numeric | |
| clock_out_address | text | |
| lunch_start | timestamptz | |
| lunch_end | timestamptz | |
| total_hours | numeric | |
| notes | text | |
| created_at | timestamptz | now() |

---

## time_log

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| time_log_id | text | |
| business_unit | text | |
| job_id | integer | FK jobs.id |
| category | text | |
| hours | numeric | |
| date | timestamptz | |
| employee_email | text | |
| gusto_synced | boolean | false |
| clock_in_time | timestamptz | |
| clock_out_time | timestamptz | |
| is_clocked_in | boolean | false |
| employee_id | integer | FK employees.id |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## time_off_requests

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| employee_id | integer | FK employees.id |
| start_date | date | |
| end_date | date | |
| request_type | text | 'pto' |
| reason | text | |
| status | text | 'pending' |
| approved_by | integer | FK employees.id |
| approved_at | timestamptz | |
| created_at | timestamptz | now() |

---

## utility_forms

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| provider_id | integer | FK utility_providers.id |
| program_id | integer | FK utility_programs.id |
| form_name | text | |
| form_type | text | 'Application' |
| form_url | text | |
| form_file | text | |
| version_year | integer | |
| is_required | boolean | false |
| form_notes | text | |
| field_mapping | jsonb | Maps PDF form field names to data paths (e.g. {"Customer Name": "customer.name"}) |
| status | text | 'dev' |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## utility_invoices

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| utility_invoice_id | text | |
| business_unit | text | |
| utility_name | text | |
| job_id | integer | FK jobs.id |
| amount | numeric | |
| payment_status | text | 'Pending' |
| notes | text | |
| job_description | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## utility_programs

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| program_id | text | |
| utility_name | text | |
| state | text | |
| program_name | text | |
| program_type | text | |
| effective_date | date | |
| expiration_date | date | |
| max_cap_percent | integer | |
| annual_cap_dollars | numeric | |
| business_size | text | |
| dlc_required | boolean | false |
| pre_approval_required | boolean | false |
| contact_phone | text | |
| program_url | text | |
| pdf_url | text | |
| last_verified | date | |
| ai_can_update | boolean | false |
| source_year | integer | |
| program_category | text | 'Lighting' |
| delivery_mechanism | text | |
| eligible_sectors | text[] | |
| eligible_building_types | text[] | |
| min_demand_kw | numeric | |
| max_demand_kw | numeric | |
| min_annual_kwh | numeric | |
| application_required | boolean | false |
| post_inspection_required | boolean | false |
| contractor_prequalification | boolean | false |
| required_documents | text[] | |
| stacking_allowed | boolean | true |
| stacking_rules | text | |
| stacking_exclusions | text[] | |
| funding_status | text | 'Open' |
| funding_budget | numeric | |
| processing_time_days | integer | |
| rebate_payment_method | text | |
| program_notes_ai | text | |
| pdf_enrichment_status | text | 'pending' |
| pdf_enriched_at | timestamptz | |
| pdf_storage_path | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## utility_providers

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| provider_id | text | |
| provider_name | text | |
| state | text | |
| service_territory | text | |
| has_rebate_program | boolean | false |
| rebate_program_url | text | |
| contact_phone | text | |
| notes | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## utility_rate_schedules

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| provider_id | integer | FK utility_providers.id |
| schedule_name | text | NOT NULL |
| customer_category | text | |
| rate_per_kwh | numeric | |
| demand_charge | numeric | |
| time_of_use | boolean | false |
| description | text | |
| effective_date | date | |
| notes | text | |
| rate_type | text | 'Flat' |
| peak_rate_per_kwh | numeric | |
| off_peak_rate_per_kwh | numeric | |
| summer_rate_per_kwh | numeric | |
| winter_rate_per_kwh | numeric | |
| min_demand_charge | numeric | |
| customer_charge | numeric | |
| source_url | text | |
| pdf_storage_path | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## webhook_form

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| company_id | integer | FK companies.id |
| action | text | |
| lead_id | text | |
| customer_name | text | |
| appointment_time | timestamptz | |
| service_type | text | |
| address | text | |
| event_id | text | |
| created_at | timestamptz | now() |
| updated_at | timestamptz | |

---

## fixture_categories (GLOBAL — no company_id)

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| category_code | text | UNIQUE NOT NULL |
| category_name | text | NOT NULL |
| description | text | |
| typical_mounting | text | |
| typical_ceiling_height | text | |
| typical_applications | text[] | |
| created_at | timestamptz | now() |

---

## lamp_types (GLOBAL — no company_id)

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| lamp_code | text | UNIQUE NOT NULL |
| lamp_name | text | NOT NULL |
| technology | text | NOT NULL |
| description | text | |
| visual_characteristics | text | |
| typical_life_hours | integer | |
| warmup_time | text | |
| dimmable | boolean | false |
| contains_mercury | boolean | false |
| ballast_required | boolean | false |
| ballast_type | text | |
| being_phased_out | boolean | false |
| created_at | timestamptz | now() |

---

## fixture_wattage_reference (GLOBAL — no company_id)

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| fixture_id | text | UNIQUE NOT NULL |
| category_code | text | FK fixture_categories.category_code |
| lamp_code | text | FK lamp_types.lamp_code |
| fixture_description | text | NOT NULL |
| lamp_count | integer | |
| lamp_length | text | |
| system_wattage | integer | NOT NULL |
| ballast_type | text | |
| lumens_initial | integer | |
| lumens_mean | integer | |
| led_replacement_watts | integer | NOT NULL |
| led_replacement_description | text | |
| visual_identification | text | |
| notes | text | |
| created_at | timestamptz | now() |

---

## visual_identification_guide (GLOBAL — no company_id)

| Column | Type | Default |
|--------|------|---------|
| id | integer | PK |
| category_code | text | FK fixture_categories.category_code |
| feature_name | text | NOT NULL |
| feature_description | text | |
| identification_tips | text | |
| common_mistakes | text | |
| photo_clues | text[] | |
| created_at | timestamptz | now() |

---

*73 tables total. Fixture reference data added February 20, 2026. Updated February 20, 2026.*
