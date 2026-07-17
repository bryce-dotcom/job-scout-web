# Database Schema (generated)

**Do not hand-edit.** Regenerate with `npm run schema:dump`.

This file is written from the LIVE database. The previous hand-maintained
version drifted out of date and omitted real columns, which made the rule
"if a column is not listed here, it does not exist" actively misleading.

Generated from https://tzrhfhisdeahrrmeksif.supabase.co

## agents

- `ai_capabilities`
- `avatar_url`
- `created_at`
- `description`
- `display_order`
- `full_name`
- `icon`
- `id`
- `is_free`
- `name`
- `price_monthly`
- `price_yearly`
- `slug`
- `status`
- `tagline`
- `title`
- `trade_category`
- `updated_at`

## ai_alerts

- `created_at`
- `detail`
- `id`
- `kind`

## ai_messages

- `actions_taken`
- `company_id`
- `content`
- `created_at`
- `entities_json`
- `id`
- `intent_detected`
- `message_id`
- `module_used`
- `role`
- `session_id`
- `timestamp`
- `updated_at`

## ai_modules

- `capabilities_json`
- `company_id`
- `config_json`
- `created_at`
- `default_menu_parent`
- `default_menu_section`
- `description`
- `display_name`
- `icon`
- `id`
- `module_name`
- `route_path`
- `sort_order`
- `status`
- `updated_at`
- `user_menu_parent`
- `user_menu_section`

## ai_sessions

- `company_id`
- `context_json`
- `created_at`
- `current_module`
- `id`
- `last_activity`
- `pending_action`
- `pending_data`
- `session_id`
- `started`
- `status`
- `updated_at`
- `user_email`

## ai_usage

- `cache_creation_input_tokens`
- `cache_read_input_tokens`
- `company_id`
- `created_at`
- `error_kind`
- `est_cost_usd`
- `feature`
- `id`
- `input_tokens`
- `model`
- `output_tokens`
- `status`
- `success`

## appointments

- `appointment_type`
- `company_id`
- `created_at`
- `customer_id`
- `duration_minutes`
- `employee_id`
- `end_time`
- `id`
- `lead_id`
- `lead_owner_id`
- `location`
- `notes`
- `outcome`
- `salesperson_id`
- `salesperson_ids`
- `setter_id`
- `start_time`
- `status`
- `title`
- `updated_at`

## assets

_empty table — columns unavailable_

## audit_areas

- `ai_analysis_json`
- `area_id`
- `area_name`
- `area_rebate_estimate`
- `area_watts_reduced`
- `audit_id`
- `ceiling_height`
- `company_id`
- `confirmed`
- `created_at`
- `existing_wattage`
- `fixture_category`
- `fixture_count`
- `fixture_type_detected`
- `id`
- `led_replacement`
- `led_replacement_id`
- `led_wattage`
- `lighting_type`
- `override_notes`
- `photo_path`
- `photos`
- `photos_url`
- `total_existing_watts`
- `total_led_watts`
- `updated_at`

## audit_log

- `action`
- `company_id`
- `created_at`
- `id`
- `new_data`
- `new_values`
- `old_data`
- `old_values`
- `record_id`
- `table_name`
- `user_email`
- `user_id`

## bank_accounts

- `account_type`
- `available_balance`
- `company_id`
- `connected_account_id`
- `created_at`
- `current_balance`
- `id`
- `last_synced`
- `name`
- `pending_balance`
- `provider`
- `provider_account_id`

## beta_invite_codes

- `code`
- `created_at`
- `created_by`
- `expires_at`
- `id`
- `max_uses`
- `times_used`

## bill_payments

_empty table — columns unavailable_

## bills

_empty table — columns unavailable_

## category_rules

- `assigned_category`
- `assigned_tax_category`
- `company_id`
- `created_at`
- `id`
- `match_type`
- `merchant_pattern`
- `priority`

## cc_contact_map

_empty table — columns unavailable_

## cc_integrations

_empty table — columns unavailable_

## collection_reminders

_empty table — columns unavailable_

## communications_log

_empty table — columns unavailable_

## companies

- `active`
- `address`
- `billing_email`
- `billing_notes`
- `billing_payment_method_brand`
- `billing_payment_method_last4`
- `billing_status`
- `bond_amount`
- `bond_cert_url`
- `bonded`
- `bso_user_id`
- `business_license_url`
- `business_type`
- `city`
- `commission_requires_quote`
- `company_name`
- `created_at`
- `duns_number`
- `efile_efin`
- `ein`
- `entity_type`
- `federal_deposit_schedule`
- `fiscal_year_end`
- `futa_rate_pct`
- `google_place_id`
- `id`
- `industry`
- `insurance_cert_url`
- `insurance_expiration`
- `insurance_policy_number`
- `insurance_provider`
- `legal_name`
- `license_number`
- `logo_url`
- `marketer_pay_per_appointment`
- `master_stripe_customer_id`
- `master_stripe_subscription_id`
- `naics_code`
- `operating_agreement_url`
- `owner_email`
- `pay_day_1`
- `pay_day_2`
- `pay_frequency`
- `phone`
- `primary_color`
- `prospecting_stripe_sub_id`
- `prospecting_subscription_cancel_at`
- `prospecting_subscription_canceled_at`
- `prospecting_subscription_interval`
- `prospecting_tier`
- `prospecting_tier_canceled`
- `prospecting_tier_renews_at`
- `public_quote_slug`
- `remit_to_address`
- `remit_to_email`
- `setter_pay_per_appointment`
- `setter_qualification_rule`
- `setup_complete`
- `source_pay_per_lead`
- `state`
- `state_deposit_schedule`
- `state_employer_id`
- `state_employer_id_state`
- `state_of_incorporation`
- `subscription_tier`
- `sui_account_number`
- `sui_rate_pct`
- `sui_wage_base`
- `tax_exempt_cert_url`
- `tax_exempt_number`
- `timezone`
- `tos_accepted_at`
- `tos_accepted_ip`
- `tos_version`
- `trial_ends_at`
- `updated_at`
- `w9_url`
- `website`
- `workers_comp_cert_url`
- `workers_comp_class_codes`
- `workers_comp_expiration`
- `workers_comp_policy`
- `zip`

## company_agents

- `activated_at`
- `agent_id`
- `company_id`
- `created_at`
- `custom_name`
- `expires_at`
- `id`
- `settings`
- `subscription_status`
- `updated_at`

## connected_accounts

- `account_name`
- `account_subtype`
- `account_type`
- `available_balance`
- `company_id`
- `created_at`
- `currency_code`
- `current_balance`
- `id`
- `institution_id`
- `institution_name`
- `last_synced`
- `mask`
- `plaid_account_id`
- `plaid_item_id`
- `status`
- `sync_cursor`

## customer_payment_methods

- `brand`
- `company_id`
- `created_at`
- `customer_id`
- `exp_month`
- `exp_year`
- `id`
- `is_default`
- `last_four`
- `status`
- `stripe_customer_id`
- `stripe_payment_method_id`
- `updated_at`

## customer_portal_tokens

- `access_count`
- `accessed_at`
- `company_id`
- `created_at`
- `customer_id`
- `document_id`
- `document_type`
- `expires_at`
- `id`
- `is_revoked`
- `token`

## customers

- `address`
- `business_name`
- `calendar_display`
- `company_id`
- `created_at`
- `customer_id`
- `email`
- `id`
- `job_title`
- `marketing_opt_in`
- `name`
- `notes`
- `phone`
- `preferred_contact`
- `preferred_invoice_format`
- `salesperson`
- `salesperson_id`
- `secondary_contact_email`
- `secondary_contact_name`
- `secondary_contact_phone`
- `secondary_contact_role`
- `source_id`
- `source_system`
- `status`
- `stripe_customer_id`
- `tags`
- `updated_at`
- `utility_invoicing_enabled`

## doc_package_items

- `company_id`
- `created_at`
- `id`
- `service_type`
- `sort_order`
- `source_table`
- `template_id`

## document_approvals

- `approved_at`
- `approver_email`
- `approver_name`
- `company_id`
- `document_hash`
- `document_id`
- `document_type`
- `id`
- `ip_address`
- `legal_terms_hash`
- `portal_token_id`
- `signature_image_path`
- `signature_method`
- `signature_typed_text`
- `user_agent`

## document_templates

- `category`
- `company_id`
- `created_at`
- `field_count`
- `field_mapping`
- `file_name`
- `file_path`
- `file_size`
- `form_code`
- `form_name`
- `id`
- `is_custom`
- `signature_fields`
- `status`
- `updated_at`

## email_automations

_empty table — columns unavailable_

## email_campaigns

_empty table — columns unavailable_

## email_templates

_empty table — columns unavailable_

## employee_onboarding_packets

- `company_id`
- `completed_at`
- `created_at`
- `created_by`
- `draft_data`
- `employee_id`
- `expires_at`
- `i9_section2_completed_at`
- `i9_section2_completed_by`
- `i9_section2_due_date`
- `id`
- `is_revoked`
- `opened_at`
- `sent_at`
- `sent_via`
- `status`
- `step_background_check_completed_at`
- `step_direct_deposit_completed_at`
- `step_emergency_contact_completed_at`
- `step_handbook_completed_at`
- `step_i9_section1_completed_at`
- `step_personal_completed_at`
- `step_signed_completed_at`
- `step_state_w4_completed_at`
- `step_training_completed_at`
- `step_w4_completed_at`
- `step_w9_completed_at`
- `step_workers_comp_completed_at`
- `token`
- `updated_at`

## employees

- `active`
- `annual_salary`
- `business_unit`
- `celebration_opt_out`
- `commission_goods_rate`
- `commission_goods_type`
- `commission_leads_rate`
- `commission_leads_type`
- `commission_processor_rate`
- `commission_processor_type`
- `commission_services_rate`
- `commission_services_type`
- `commission_setter_rate`
- `commission_setter_type`
- `commission_software_rate`
- `commission_software_type`
- `company_id`
- `created_at`
- `date_of_birth`
- `dd_account_encrypted`
- `dd_account_last4`
- `dd_account_type`
- `dd_routing_encrypted`
- `email`
- `employee_id`
- `gps_opt_in`
- `gusto_uuid`
- `has_hr_access`
- `headshot`
- `headshot_url`
- `hire_date`
- `home_address`
- `home_city`
- `home_state`
- `home_zip`
- `hourly_rate`
- `id`
- `is_admin`
- `is_commission`
- `is_developer`
- `is_hourly`
- `is_salary`
- `last_login`
- `name`
- `new_hire_report_method`
- `new_hire_reported_at`
- `overtime_mode`
- `pay_type`
- `phone`
- `pto_accrued`
- `pto_days_per_year`
- `pto_used`
- `role`
- `salary`
- `skill_level`
- `ssn_encrypted`
- `ssn_last4`
- `state_allowances`
- `state_extra_withholding`
- `state_filing_status`
- `tax_classification`
- `termination_date`
- `updated_at`
- `user_role`
- `w4_deductions`
- `w4_dependents_amount`
- `w4_extra_withholding`
- `w4_filing_status`
- `w4_multiple_jobs`
- `w4_other_income`
- `w4_signed_at`
- `w9_backup_withholding`
- `w9_business_name`
- `w9_ein_encrypted`
- `w9_ein_last4`
- `w9_exempt_fatca_code`
- `w9_exempt_payee_code`
- `w9_federal_classification`
- `w9_legal_name`
- `w9_other_classification`
- `w9_signed_at`
- `w9_tin_type`

## estimate_messages

- `body`
- `channel`
- `company_id`
- `created_at`
- `from_email`
- `from_name`
- `from_role`
- `id`
- `is_internal`
- `metadata`
- `quote_id`
- `read_at`
- `subject`
- `to_email`

## expense_categories

- `color`
- `company_id`
- `default_tax_category`
- `icon`
- `id`
- `name`
- `sort_order`
- `type`

## expense_splits

- `amount`
- `category_id`
- `company_id`
- `created_at`
- `expense_id`
- `id`
- `note`
- `plaid_transaction_id`
- `tax_category`
- `updated_at`

## expenses

- `account`
- `amount`
- `business`
- `business_unit`
- `category`
- `client`
- `company_id`
- `created_at`
- `date`
- `description`
- `expense_id`
- `form_1065_category`
- `id`
- `job_id`
- `lead_id`
- `merchant`
- `notes`
- `plaid_transaction_id`
- `quote_id`
- `receipt`
- `receipt_storage_path`
- `receipt_url`
- `source`
- `status`
- `tax_category`
- `updated_at`
- `vendor`

## feedback

- `company_id`
- `created_at`
- `feedback_type`
- `id`
- `message`
- `notes`
- `page_url`
- `replied_at`
- `reply_history`
- `reply_message`
- `resolved_at`
- `resolved_by`
- `screenshot_url`
- `status`
- `subject`
- `user_email`

## file_attachments

- `company_id`
- `created_at`
- `created_by`
- `file_name`
- `file_path`
- `file_size`
- `file_type`
- `id`
- `job_id`
- `job_line_id`
- `lead_id`
- `photo_context`
- `quote_id`
- `quote_line_id`
- `storage_bucket`

## fixture_types

- `category`
- `company_id`
- `created_at`
- `fixture_id`
- `fixture_name`
- `id`
- `lamp_count`
- `lamp_type`
- `led_replacement_watts`
- `system_wattage`
- `updated_at`
- `visual_characteristics`

## fleet_fuel_logs

_empty table — columns unavailable_

## google_calendar_tokens

_empty table — columns unavailable_

## incentive_measures

- `baseline_description`
- `calc_method`
- `cap_amount`
- `cap_percent`
- `company_id`
- `control_level`
- `created_at`
- `effective_date`
- `equipment_requirements`
- `expiration_date`
- `fixture_category`
- `id`
- `installation_requirements`
- `location_type`
- `max_watts`
- `measure_category`
- `measure_subcategory`
- `measure_type`
- `min_watts`
- `notes`
- `pdf_verified`
- `per_unit_cap`
- `program_id`
- `project_cap_percent`
- `rate`
- `rate_id`
- `rate_unit`
- `rate_value`
- `replacement_description`
- `requirements`
- `source_pdf_url`
- `tier`
- `updated_at`
- `useful_life_years`

## inventory

- `allocated_qty`
- `assigned_to`
- `available`
- `barcode`
- `company_id`
- `condition`
- `created_at`
- `group_id`
- `id`
- `image_url`
- `inventory_type`
- `item_id`
- `last_updated`
- `location`
- `min_quantity`
- `name`
- `ordering_trigger`
- `product_id`
- `quantity`
- `serial_number`
- `updated_at`

## invoice_lines

- `company_id`
- `created_at`
- `description`
- `discount`
- `id`
- `in_utility_scope`
- `invoice_id`
- `item_id`
- `labor_cost`
- `line_number`
- `line_total`
- `quantity`
- `sort_order`
- `unit_price`
- `updated_at`

## invoices

- `amount`
- `business_unit`
- `company_id`
- `conversation_log`
- `created_at`
- `credit_card_fee`
- `customer_id`
- `discount_applied`
- `due_date`
- `email_bounce_reason`
- `email_clicked_at`
- `email_id`
- `email_opened_at`
- `email_status`
- `email_status_at`
- `hide_line_descriptions`
- `id`
- `invoice_date`
- `invoice_id`
- `invoice_type`
- `is_locked`
- `job_description`
- `job_id`
- `labor_total_override`
- `last_sent_at`
- `notes`
- `parent_invoice_id`
- `parts_total_override`
- `payment_method`
- `payment_status`
- `pdf_url`
- `portal_token`
- `project_discount`
- `sent_to_email`
- `source_id`
- `source_system`
- `stripe_payment_link_id`
- `stripe_payment_link_url`
- `summary_format`
- `updated_at`

## job_bonuses

- `accrued_at`
- `actual_hours`
- `allotted_hours`
- `amount`
- `company_id`
- `created_at`
- `crew_size`
- `employee_id`
- `id`
- `job_id`
- `needs_verification`
- `paid_at`
- `paid_by`
- `paid_pay_period_end`
- `paid_pay_period_start`
- `release_reason`
- `saved_hours`
- `status`
- `updated_at`
- `verification_overridden_at`
- `verification_overridden_by`

## job_lines

- `allocated_qty`
- `company_id`
- `consumed_qty`
- `created_at`
- `description`
- `discount`
- `id`
- `in_utility_scope`
- `item_id`
- `item_name`
- `job_id`
- `job_line_id`
- `kind`
- `labor_cost`
- `notes`
- `photos`
- `po_line_id`
- `price`
- `quantity`
- `source_id`
- `source_system`
- `taxable`
- `total`
- `totals`
- `unit_of_measure`
- `updated_at`

## job_sections

- `actual_hours`
- `assigned_to`
- `company_id`
- `created_at`
- `description`
- `end_time`
- `estimated_hours`
- `id`
- `job_id`
- `name`
- `notes`
- `percent_of_job`
- `scheduled_date`
- `sort_order`
- `start_time`
- `status`
- `updated_at`
- `verified_at`
- `verified_by`

## jobs

- `address`
- `allotted_time_hours`
- `appointment_edit_link`
- `appointment_time`
- `assigned_team`
- `audit_id`
- `business_name`
- `business_unit`
- `calculated_allotted_time`
- `calendar_embed_url`
- `company_id`
- `completed_at`
- `computed_status`
- `coverage_notes`
- `created_at`
- `customer_id`
- `customer_name`
- `customer_signature_captured_at`
- `customer_signature_method`
- `customer_signature_path`
- `customer_signature_typed`
- `date`
- `details`
- `discount`
- `discount_description`
- `edit_link`
- `email`
- `end_date`
- `event_id`
- `expense_amount`
- `generate_work_order`
- `gps_location`
- `has_callback`
- `id`
- `incentive_amount`
- `incentive_status`
- `invoice_status`
- `job_address`
- `job_id`
- `job_ids`
- `job_lead_id`
- `job_title`
- `job_total`
- `labor_coverage`
- `labor_coverage_until_date`
- `last_status_change_at`
- `last_updated`
- `lawn_property_id`
- `lead_id`
- `lead_source`
- `lead_source_name`
- `notes`
- `out_of_pocket_total`
- `parent_job_id`
- `parts_coverage`
- `parts_coverage_until_date`
- `parts_status`
- `phone`
- `pm_id`
- `prepaid_revenue`
- `profit_margin`
- `quote_generated`
- `quote_id`
- `recurrence`
- `recurrence_parent_id`
- `route_id`
- `route_order`
- `sales_calendar_web_link`
- `sales_meeting_calendar_url`
- `salesperson`
- `salesperson_id`
- `service_due_date`
- `service_kind`
- `service_type`
- `signed_proposal_attachment_id`
- `source_id`
- `source_system`
- `start_date`
- `status`
- `team`
- `time_tracked`
- `total_distance`
- `total_time`
- `unique_temp`
- `updated_at`
- `utility_incentive`
- `utility_name`
- `work_order_pdf`
- `work_order_pdf_url`

## labor_rates

- `active`
- `company_id`
- `cost_per_hour`
- `created_at`
- `description`
- `id`
- `is_default`
- `multiplier`
- `name`
- `rate_per_hour`
- `updated_at`

## lawn_estimates

_empty table — columns unavailable_

## lawn_pricing

- `aeration_minimum`
- `aeration_per_1000sqft`
- `ai_calibration_factor`
- `ai_sample_n`
- `cleanup_per_hour`
- `company_id`
- `created_at`
- `edging_default_lin_ft`
- `edging_per_lin_ft`
- `fert_per_1000sqft`
- `grub_per_1000sqft`
- `id`
- `iron_per_1000sqft`
- `lime_per_1000sqft`
- `margin_multiplier`
- `mow_minimum`
- `mow_minutes_per_1000sqft`
- `mow_per_sqft`
- `overseed_per_1000sqft`
- `pre_emergent_per_1000sqft`
- `tax_rate`
- `travel_per_visit`
- `updated_at`
- `weed_per_1000sqft`

## lawn_properties

- `active`
- `address`
- `ai_confidence`
- `ai_estimated_at`
- `ai_estimated_sqft`
- `ai_image_url`
- `ai_obstacles`
- `ai_reasoning`
- `city`
- `company_id`
- `created_at`
- `customer_id`
- `dog_notes`
- `dog_on_premises`
- `effort_factor`
- `effort_sample_n`
- `gate_code`
- `hazards`
- `id`
- `irrigation_notes`
- `latitude`
- `lead_id`
- `longitude`
- `lot_size_sqft`
- `map_static_url`
- `mow_day`
- `mow_frequency`
- `mow_height_inches`
- `notes`
- `obstacles`
- `preferred_crew`
- `property_name`
- `service_end_month`
- `service_start_month`
- `state`
- `turf_polygon`
- `turf_size_sqft`
- `turf_type`
- `updated_at`
- `zip`

## lawn_treatments

_empty table — columns unavailable_

## lawn_visits

_empty table — columns unavailable_

## lead_commissions

- `amount`
- `appointment_id`
- `commission_type`
- `company_id`
- `created_at`
- `employee_id`
- `id`
- `lead_id`
- `notes`
- `payment_status`
- `rate_type`

## lead_payments

- `account`
- `amount`
- `business`
- `company_id`
- `created_at`
- `date_created`
- `description`
- `id`
- `invoice_id`
- `job_id`
- `lead_customer_name`
- `lead_id`
- `lead_source`
- `marketer_pay_per_appointment`
- `notes`
- `payment_id`
- `payment_method`
- `payment_status`
- `receipt`
- `receipt_photo`
- `setter_pay_per_appointment`
- `updated_at`

## leads

- `address`
- `appointment_edit_link`
- `appointment_id`
- `appointment_time`
- `business_name`
- `business_unit`
- `calendar_embed_url`
- `callback_date`
- `callback_notes`
- `company_id`
- `computed_status`
- `contact_attempts`
- `converted_at`
- `converted_customer_id`
- `created_at`
- `created_date`
- `customer_id`
- `customer_name`
- `customer_signature_captured_at`
- `customer_signature_method`
- `customer_signature_path`
- `customer_signature_typed`
- `edit_link`
- `ein`
- `email`
- `enrichment_data`
- `event_id`
- `external_prospect_id`
- `id`
- `job_title`
- `last_contact_at`
- `last_updated`
- `lead_id`
- `lead_owner_id`
- `lead_source`
- `lead_source_employee_id`
- `lead_source_name`
- `meter_number`
- `notes`
- `phone`
- `quote_amount`
- `quote_generated`
- `quote_id`
- `sales_calendar_web_link`
- `sales_meeting_calendar_url`
- `salesperson`
- `salesperson_id`
- `salesperson_ids`
- `service_type`
- `setter_id`
- `setter_owner_id`
- `source_id`
- `source_system`
- `status`
- `unique_temp`
- `updated_at`

## liabilities

_empty table — columns unavailable_

## lighting_audits

- `address`
- `annual_savings_dollars`
- `annual_savings_kwh`
- `applicable_rebate_rate`
- `audit_id`
- `calculated_rebate`
- `city`
- `company_id`
- `created_at`
- `created_by`
- `created_date`
- `customer_id`
- `customer_signature`
- `electric_rate`
- `est_project_cost`
- `estimated_rebate`
- `id`
- `job_id`
- `lead_id`
- `net_cost`
- `notes`
- `operating_days`
- `operating_hours`
- `payback_months`
- `proposal_pdf`
- `proposal_pdf_url`
- `rate_schedule`
- `rebate_capped`
- `rebate_source`
- `state`
- `status`
- `total_existing_watts`
- `total_fixtures`
- `total_proposed_watts`
- `updated_at`
- `utility_provider_id`
- `watts_reduced`
- `zip`

## location_pings

- `accuracy`
- `company_id`
- `created_at`
- `employee_id`
- `id`
- `lat`
- `lng`
- `pinged_at`
- `time_clock_id`

## manual_expenses

_empty table — columns unavailable_

## migration_jobs

- `company_id`
- `counts`
- `created_at`
- `error`
- `finished_at`
- `id`
- `report`
- `source`
- `started_at`
- `status`
- `triggered_by`

## payment_plans

_empty table — columns unavailable_

## payments

- `amount`
- `company_id`
- `created_at`
- `customer_id`
- `date`
- `id`
- `invoice_id`
- `is_deposit`
- `job_id`
- `method`
- `notes`
- `payment_id`
- `quote_id`
- `receipt_photo`
- `refund_reason`
- `refunded_amount`
- `refunded_at`
- `source`
- `source_id`
- `source_system`
- `source_transaction_id`
- `status`
- `stripe_payment_intent_id`
- `stripe_refund_id`
- `updated_at`

## payroll_adjustments

- `amount`
- `category`
- `company_id`
- `created_at`
- `created_by`
- `employee_id`
- `id`
- `metadata`
- `pay_period_end`
- `pay_period_start`
- `reason`
- `recurring`
- `type`

## payroll_tax_filings

_empty table — columns unavailable_

## payroll_tax_liabilities

_empty table — columns unavailable_

## paystubs

- `additional_medicare`
- `amendment_reason`
- `amends_paystub_id`
- `bonus_pay`
- `commission_pay`
- `company_id`
- `created_at`
- `employee_id`
- `federal_income_tax`
- `futa`
- `gross_pay`
- `hourly_rate`
- `id`
- `medicare_employee`
- `medicare_employer`
- `net_pay`
- `overtime_hours`
- `pay_date`
- `payroll_run_id`
- `period_end`
- `period_start`
- `post_tax_deductions`
- `pre_tax_deductions`
- `pto_hours`
- `regular_hours`
- `reimbursement_pay`
- `salary_amount`
- `social_security_employee`
- `social_security_employer`
- `state_income_tax`
- `sui`
- `taxable_wages`

## plaid_transactions

- `ai_category`
- `ai_confidence`
- `ai_form_1065_line`
- `ai_job_confidence`
- `ai_job_id`
- `ai_tax_category`
- `amount`
- `authorized_date`
- `company_id`
- `confirmed`
- `connected_account_id`
- `created_at`
- `date`
- `expense_id`
- `id`
- `is_transfer`
- `job_id`
- `matched_at`
- `matched_by`
- `matched_invoice_id`
- `matched_payment_id`
- `merchant_name`
- `name`
- `notes`
- `pending`
- `plaid_category`
- `plaid_personal_finance_category`
- `plaid_transaction_id`
- `user_category`
- `user_tax_category`

## prescriptive_measures

- `ai_match_keywords`
- `annual_kwh_per_unit`
- `application_type`
- `baseline_condition`
- `baseline_equipment`
- `baseline_lamp_count`
- `baseline_wattage`
- `building_type`
- `company_id`
- `created_at`
- `dlc_required`
- `dlc_tier`
- `effective_date`
- `energy_star_required`
- `expiration_date`
- `hours_requirement`
- `id`
- `incentive_amount`
- `incentive_formula`
- `incentive_unit`
- `incremental_cost_per_unit`
- `is_active`
- `location_type`
- `max_incentive`
- `max_project_percent`
- `max_quantity`
- `measure_category`
- `measure_code`
- `measure_name`
- `measure_subcategory`
- `min_quantity`
- `needs_pdf_upload`
- `notes`
- `other_certification`
- `program_id`
- `replacement_equipment`
- `replacement_lamp_count`
- `replacement_wattage`
- `rmp_business_type`
- `rmp_controls_tier`
- `rmp_is_sbe`
- `source_notes`
- `source_page`
- `source_pdf_url`
- `source_url`
- `updated_at`
- `watts_reduced`

## product_components

- `company_id`
- `component_product_id`
- `created_at`
- `id`
- `parent_product_id`
- `quantity`

## product_groups

- `active`
- `company_id`
- `created_at`
- `description`
- `icon`
- `id`
- `image_url`
- `name`
- `service_type`
- `sort_order`
- `updated_at`

## products_services

- `active`
- `allotted_time_hours`
- `business_unit`
- `ceiling_price`
- `company_id`
- `cost`
- `created_at`
- `datasheet_json`
- `default_vendor_id`
- `description`
- `dlc_document_url`
- `dlc_listed`
- `dlc_listing_number`
- `floor_price`
- `group_id`
- `id`
- `image`
- `image_url`
- `in_utility_scope`
- `install_guide_url`
- `item_id`
- `labor_coverage_months_added`
- `labor_rate_id`
- `lead_time_days`
- `manufacturer`
- `markup_percent`
- `material_or_labor`
- `model_number`
- `name`
- `parts_coverage_months_added`
- `pricing_ceiling`
- `pricing_floor`
- `pricing_model`
- `pricing_percent`
- `product_category`
- `reorder_point`
- `reorder_qty`
- `spec_sheet_url`
- `suggest_in_lenard`
- `taxable`
- `type`
- `unit_price`
- `updated_at`
- `vendor_sku`
- `warranty_years`

## prospect_enrichments

- `company_id`
- `company_name`
- `created_at`
- `email`
- `external_org_id`
- `external_prospect_id`
- `full_name`
- `id`
- `imported_as_lead_id`
- `imported_at`
- `linkedin_url`
- `payload`
- `phone`
- `revealed_at`
- `source`
- `title`

## prospecting_usage

- `company_id`
- `created_at`
- `enrichments`
- `enrichments_overage`
- `id`
- `period`
- `searches`
- `searches_overage`
- `updated_at`

## purchase_order_line_jobs

- `company_id`
- `created_at`
- `id`
- `job_id`
- `job_line_id`
- `po_line_id`
- `quantity`

## purchase_order_lines

- `company_id`
- `created_at`
- `description`
- `id`
- `line_total`
- `po_id`
- `product_id`
- `quantity_ordered`
- `quantity_received`
- `sort_order`
- `unit_cost`
- `updated_at`

## purchase_orders

- `business_unit`
- `closed_at`
- `company_id`
- `created_at`
- `created_by`
- `expected_delivery_date`
- `id`
- `internal_notes`
- `job_id`
- `notes`
- `pdf_url`
- `po_number`
- `received_at`
- `sent_at`
- `ship_to_address`
- `shipping`
- `status`
- `subtotal`
- `tax`
- `total`
- `updated_at`
- `vendor_acknowledgement_ref`
- `vendor_id`

## quote_lines

- `company_id`
- `created_at`
- `description`
- `discount`
- `id`
- `image_url`
- `in_utility_scope`
- `item_id`
- `item_name`
- `kind`
- `labor_cost`
- `line_id`
- `line_total`
- `notes`
- `photos`
- `price`
- `quantity`
- `quote_id`
- `sort_order`
- `source_id`
- `source_system`
- `taxable`
- `total`
- `unit_of_measure`
- `updated_at`

## quotes

- `approved_date`
- `arnie_addon_recommendations`
- `arnie_addon_recs_at`
- `arnie_addon_recs_hash`
- `audit_id`
- `audit_type`
- `business_unit`
- `calculated_quote_amount`
- `category`
- `company_id`
- `contract_required`
- `contract_signed`
- `created_at`
- `customer_id`
- `date`
- `deposit_amount`
- `deposit_date`
- `deposit_method`
- `deposit_notes`
- `deposit_photo`
- `discount`
- `discount_description`
- `email_bounce_reason`
- `email_clicked_at`
- `email_id`
- `email_opened_at`
- `email_status`
- `email_status_at`
- `estimate_message`
- `estimate_name`
- `expiration_date`
- `follow_up_1`
- `follow_up_2`
- `follow_up_3`
- `followup_count`
- `id`
- `job_id`
- `job_title`
- `job_total`
- `last_sent_at`
- `lead_id`
- `manual_annual_savings`
- `metric`
- `notes`
- `out_of_pocket_total`
- `pdf_layout`
- `pdf_url`
- `portal_token`
- `profit`
- `quote_amount`
- `quote_id`
- `rejected_date`
- `salesperson`
- `salesperson_id`
- `sent_date`
- `sent_snapshot_pdf_at`
- `sent_snapshot_pdf_path`
- `sent_to_email`
- `service_date`
- `service_type`
- `settings_overrides`
- `signed_proposal_attachment_id`
- `source_id`
- `source_system`
- `status`
- `summary`
- `technician_id`
- `temp_customer_id`
- `temp_job_id`
- `updated_at`
- `utility_incentive`
- `value`

## saved_queries

_empty table — columns unavailable_

## setter_commissions

- `appointment_id`
- `approved_at`
- `approved_by`
- `company_id`
- `created_at`
- `id`
- `lead_id`
- `marketer_amount`
- `marketer_id`
- `notes`
- `paid_at`
- `payment_status`
- `quote_generated`
- `quote_id`
- `requires_quote`
- `setter_amount`
- `setter_id`

## settings

- `company_id`
- `created_at`
- `id`
- `key`
- `list_name`
- `updated_at`
- `value`

## signed_documents

- `company_id`
- `consent_text`
- `created_at`
- `document_kind`
- `document_label`
- `employee_id`
- `id`
- `onboarding_packet_id`
- `pdf_storage_path`
- `signature_image_base64`
- `signature_typed_name`
- `signed_at`
- `signer_ip`
- `signer_user_agent`
- `status`
- `superseded_by`
- `values_snapshot`

## system_settings

- `description`
- `id`
- `key`
- `updated_at`
- `updated_by`
- `value`

## time_clock

- `adjusted_at`
- `adjusted_by`
- `adjustment_reason`
- `clock_in`
- `clock_in_address`
- `clock_in_lat`
- `clock_in_lng`
- `clock_out`
- `clock_out_address`
- `clock_out_lat`
- `clock_out_lng`
- `company_id`
- `created_at`
- `employee_id`
- `flagged_for_review`
- `id`
- `job_id`
- `last_lat`
- `last_lng`
- `last_ping_at`
- `lunch_end`
- `lunch_start`
- `notes`
- `original_clock_in`
- `original_clock_out`
- `original_total_hours`
- `review_reason`
- `total_hours`

## time_log

- `business_unit`
- `category`
- `clock_in_time`
- `clock_out_time`
- `company_id`
- `created_at`
- `date`
- `employee_email`
- `employee_id`
- `gusto_synced`
- `hours`
- `id`
- `is_clocked_in`
- `job_id`
- `notes`
- `time_log_id`
- `updated_at`

## time_off_requests

- `approved_at`
- `approved_by`
- `company_id`
- `created_at`
- `employee_id`
- `end_date`
- `id`
- `reason`
- `request_type`
- `start_date`
- `status`

## transaction_job_allocations

- `amount`
- `company_id`
- `created_at`
- `id`
- `job_id`
- `notes`
- `transaction_id`

## utility_forms

- `company_id`
- `created_at`
- `field_mapping`
- `form_file`
- `form_name`
- `form_notes`
- `form_type`
- `form_url`
- `id`
- `is_required`
- `program_id`
- `provider_id`
- `signature_fields`
- `status`
- `updated_at`
- `version_year`

## utility_invoices

- `amount`
- `business_unit`
- `claim_type`
- `company_id`
- `created_at`
- `customer_name`
- `id`
- `incentive_amount`
- `invoice_id`
- `job_description`
- `job_id`
- `labor_pct`
- `labor_total_override`
- `lead_id`
- `linked_invoice_number`
- `material_pct`
- `net_cost`
- `notes`
- `paid_at`
- `parts_total_override`
- `payment_status`
- `processor_id`
- `project_cost`
- `summary_format`
- `updated_at`
- `utility_invoice_id`
- `utility_name`

## utility_programs

- `ai_can_update`
- `annual_cap_dollars`
- `application_required`
- `business_size`
- `company_id`
- `contact_phone`
- `contractor_prequalification`
- `created_at`
- `delivery_mechanism`
- `dlc_required`
- `effective_date`
- `eligible_building_types`
- `eligible_sectors`
- `expiration_date`
- `funding_budget`
- `funding_status`
- `id`
- `last_verified`
- `max_cap_percent`
- `max_demand_kw`
- `min_annual_kwh`
- `min_demand_kw`
- `pdf_enriched_at`
- `pdf_enrichment_status`
- `pdf_storage_path`
- `pdf_url`
- `post_inspection_required`
- `pre_approval_required`
- `processing_time_days`
- `program_category`
- `program_id`
- `program_name`
- `program_notes_ai`
- `program_type`
- `program_url`
- `rebate_payment_method`
- `required_documents`
- `source_year`
- `stacking_allowed`
- `stacking_exclusions`
- `stacking_rules`
- `state`
- `updated_at`
- `utility_name`

## utility_providers

- `company_id`
- `contact_phone`
- `created_at`
- `has_rebate_program`
- `id`
- `notes`
- `provider_id`
- `provider_name`
- `rebate_program_url`
- `service_territory`
- `state`
- `updated_at`

## utility_rate_schedules

- `company_id`
- `created_at`
- `customer_category`
- `customer_charge`
- `demand_charge`
- `description`
- `effective_date`
- `id`
- `min_demand_charge`
- `notes`
- `off_peak_rate_per_kwh`
- `pdf_storage_path`
- `peak_rate_per_kwh`
- `provider_id`
- `rate_per_kwh`
- `rate_type`
- `schedule_name`
- `source_url`
- `summer_rate_per_kwh`
- `time_of_use`
- `updated_at`
- `winter_rate_per_kwh`

## vendors

- `active`
- `billing_address`
- `business_name`
- `company_id`
- `contact_name`
- `created_at`
- `default_payment_terms`
- `default_tax_rate`
- `email`
- `id`
- `is_internal`
- `name`
- `notes`
- `phone`
- `qb_sync_at`
- `qb_vendor_id`
- `updated_at`

## verification_photos

- `ai_analysis`
- `ai_score`
- `company_id`
- `created_at`
- `file_path`
- `id`
- `photo_type`
- `storage_bucket`
- `verification_id`

## verification_reports

- `ai_analysis`
- `checklist_items`
- `company_id`
- `created_at`
- `grade`
- `id`
- `industry`
- `issues_found`
- `job_id`
- `original_grade`
- `original_score`
- `override_at`
- `override_by`
- `override_reason`
- `score`
- `status`
- `summary`
- `updated_at`
- `verification_type`
- `verified_by`
- `voided`
