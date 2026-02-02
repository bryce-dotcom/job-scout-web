# JobScout Development Rules

## Database Rules

1. **No "deals" table** - Use the `leads` table for all sales pipeline functionality
2. **Always filter by company_id** - Every database query must include `.eq('company_id', companyId)` to ensure data isolation between companies
3. **Settings are key-value pairs** - Settings are stored in the `settings` table with `key` and `value` columns. Values are JSON-stringified arrays or objects. Use `getSettingList()` helper to parse.

## UI/UX Rules

4. **No emojis** - Use Lucide React icons instead of emojis throughout the application
5. **Mobile responsive** - All interactive elements must have minimum 44px touch targets for mobile accessibility
6. **Tooltips explain features** - Use the `<Tooltip>` component to provide helpful hints explaining what features do

## Navigation Rules

7. **Numbered Sales Flow menu (1-5)** - The Sales Flow section in navigation should be numbered:
   - 1. Leads
   - 2. Lead Setter
   - 3. Sales Pipeline
   - 4. Appointments
   - 5. Commissions

## Lead Flow

8. **Lead status progression**:
   ```
   New -> Contacted -> Callback -> Appointment Set -> Quote Sent -> Negotiation -> Won/Lost
   ```

9. **Won creates Customer and Job** - When a lead status is set to "Won":
   - Create a new Customer record from lead data
   - Create a new Job record linked to the customer
   - Link the lead to the customer via `customer_id`
