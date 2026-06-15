// Walkthrough registry.
//
// Each feature in featureCatalog.js can specify `walkthrough: '<id>'` to
// render an in-app animated walkthrough instead of a recorded video.
// The Video Library modal picks the component out of this map.
//
// Adding a new walkthrough = drop a component in this folder, register
// it here, and reference the id from the catalog entry. No re-record
// needed — the animation lives in code and updates with the product.

import YardMeasureWalkthrough        from './YardMeasureWalkthrough'
import ProspectScoutWalkthrough      from './ProspectScoutWalkthrough'
import ZachPropertiesWalkthrough     from './ZachPropertiesWalkthrough'
import ZachVisitsWalkthrough         from './ZachVisitsWalkthrough'
import ZachTreatmentsWalkthrough     from './ZachTreatmentsWalkthrough'
import ZachPricingWalkthrough        from './ZachPricingWalkthrough'
import CustomersWalkthrough          from './CustomersWalkthrough'
import LeadsWalkthrough              from './LeadsWalkthrough'
import SalesPipelineWalkthrough      from './SalesPipelineWalkthrough'
import LeadSetterWalkthrough         from './LeadSetterWalkthrough'
import EstimatesWalkthrough          from './EstimatesWalkthrough'
import QuoteFollowupsWalkthrough     from './QuoteFollowupsWalkthrough'
import CustomerPortalWalkthrough     from './CustomerPortalWalkthrough'
import PublicQuoteWalkthrough        from './PublicQuoteWalkthrough'
import CommunicationsLogWalkthrough  from './CommunicationsLogWalkthrough'
import JobsWalkthrough               from './JobsWalkthrough'
import JobSectionsWalkthrough        from './JobSectionsWalkthrough'
import JobBoardWalkthrough           from './JobBoardWalkthrough'
import FieldScoutWalkthrough         from './FieldScoutWalkthrough'
import RoutesWalkthrough             from './RoutesWalkthrough'
import LightingAuditsWalkthrough     from './LightingAuditsWalkthrough'
import LenardPublicPagesWalkthrough  from './LenardPublicPagesWalkthrough'
import UtilityProgramsWalkthrough    from './UtilityProgramsWalkthrough'
import RebateMeasuresWalkthrough     from './RebateMeasuresWalkthrough'
import BooksWalkthrough              from './BooksWalkthrough'
import PlaidSyncWalkthrough          from './PlaidSyncWalkthrough'
import InvoicesWalkthrough           from './InvoicesWalkthrough'
import FrankieWalkthrough            from './FrankieWalkthrough'
import OnboardingPortalWalkthrough   from './OnboardingPortalWalkthrough'
import PayrollWalkthrough            from './PayrollWalkthrough'
import TimeClockWalkthrough          from './TimeClockWalkthrough'
import TaxFilingsWalkthrough         from './TaxFilingsWalkthrough'
import FleetWalkthrough              from './FleetWalkthrough'
import InventoryWalkthrough          from './InventoryWalkthrough'
import ProductsServicesWalkthrough   from './ProductsServicesWalkthrough'
import ExpensesWalkthrough           from './ExpensesWalkthrough'
import ConradWalkthrough             from './ConradWalkthrough'
import VictorWalkthrough             from './VictorWalkthrough'
import DougieWalkthrough             from './DougieWalkthrough'
import MyPayWalkthrough              from './MyPayWalkthrough'
import UtilityInvoicesWalkthrough    from './UtilityInvoicesWalkthrough'
import JobCalendarWalkthrough        from './JobCalendarWalkthrough'
import ReportsWalkthrough            from './ReportsWalkthrough'
import DocumentRulesWalkthrough      from './DocumentRulesWalkthrough'
import FixtureTypesWalkthrough       from './FixtureTypesWalkthrough'
import CommissionsWalkthrough        from './CommissionsWalkthrough'
import EmployeesWalkthrough          from './EmployeesWalkthrough'
// Round 5
import AppointmentsWalkthrough      from './AppointmentsWalkthrough'
import DashboardWalkthrough         from './DashboardWalkthrough'
import ArnieWalkthrough             from './ArnieWalkthrough'
import BookingsWalkthrough          from './BookingsWalkthrough'
import FreddyTrackingWalkthrough    from './FreddyTrackingWalkthrough'
import FreddyCostsWalkthrough       from './FreddyCostsWalkthrough'
import FreddyTripsWalkthrough       from './FreddyTripsWalkthrough'
import LeadPaymentsWalkthrough      from './LeadPaymentsWalkthrough'
import BillsWalkthrough             from './BillsWalkthrough'
import FrankieInsightsWalkthrough   from './FrankieInsightsWalkthrough'
import PayrollInboxWalkthrough      from './PayrollInboxWalkthrough'
import TimeLogWalkthrough           from './TimeLogWalkthrough'
import UtilityProvidersWalkthrough  from './UtilityProvidersWalkthrough'
import PhotosSignaturesWalkthrough  from './PhotosSignaturesWalkthrough'

export const WALKTHROUGHS = {
  'yard-measure':        YardMeasureWalkthrough,
  'prospect-scout':      ProspectScoutWalkthrough,
  'zach-properties':     ZachPropertiesWalkthrough,
  'zach-visits':         ZachVisitsWalkthrough,
  'zach-treatments':     ZachTreatmentsWalkthrough,
  'zach-pricing':        ZachPricingWalkthrough,
  'customers':           CustomersWalkthrough,
  'leads':               LeadsWalkthrough,
  'sales-pipeline':      SalesPipelineWalkthrough,
  'lead-setter':         LeadSetterWalkthrough,
  'estimates':           EstimatesWalkthrough,
  'quote-followups':     QuoteFollowupsWalkthrough,
  'customer-portal':     CustomerPortalWalkthrough,
  'public-quote':        PublicQuoteWalkthrough,
  'communications-log':  CommunicationsLogWalkthrough,
  'jobs':                JobsWalkthrough,
  'job-sections':        JobSectionsWalkthrough,
  'job-board':           JobBoardWalkthrough,
  'field-scout':         FieldScoutWalkthrough,
  'routes':              RoutesWalkthrough,
  'lighting-audits':     LightingAuditsWalkthrough,
  'lenard-public-pages': LenardPublicPagesWalkthrough,
  'utility-programs':    UtilityProgramsWalkthrough,
  'rebate-measures':     RebateMeasuresWalkthrough,
  'books':               BooksWalkthrough,
  'plaid-sync':          PlaidSyncWalkthrough,
  'invoices':            InvoicesWalkthrough,
  'frankie':             FrankieWalkthrough,
  'onboarding-portal':   OnboardingPortalWalkthrough,
  'payroll':             PayrollWalkthrough,
  'time-clock':          TimeClockWalkthrough,
  'tax-filings':         TaxFilingsWalkthrough,
  'fleet':               FleetWalkthrough,
  'inventory':           InventoryWalkthrough,
  'products-services':   ProductsServicesWalkthrough,
  'expenses':            ExpensesWalkthrough,
  'conrad':              ConradWalkthrough,
  'victor':              VictorWalkthrough,
  'dougie':              DougieWalkthrough,
  'my-pay':              MyPayWalkthrough,
  'utility-invoices':    UtilityInvoicesWalkthrough,
  'job-calendar':        JobCalendarWalkthrough,
  'reports':             ReportsWalkthrough,
  'document-rules':      DocumentRulesWalkthrough,
  'fixture-types':       FixtureTypesWalkthrough,
  'commissions':         CommissionsWalkthrough,
  'employees':           EmployeesWalkthrough,
  // Round 5
  'appointments':        AppointmentsWalkthrough,
  'dashboard':           DashboardWalkthrough,
  'arnie':               ArnieWalkthrough,
  'bookings':            BookingsWalkthrough,
  'freddy-tracking':     FreddyTrackingWalkthrough,
  'freddy-costs':        FreddyCostsWalkthrough,
  'freddy-trips':        FreddyTripsWalkthrough,
  'lead-payments':       LeadPaymentsWalkthrough,
  'bills':               BillsWalkthrough,
  'frankie-insights':    FrankieInsightsWalkthrough,
  'payroll-inbox':       PayrollInboxWalkthrough,
  'time-log':            TimeLogWalkthrough,
  'utility-providers':   UtilityProvidersWalkthrough,
  'photos-signatures':   PhotosSignaturesWalkthrough,
}

export function getWalkthrough(id) {
  return id ? WALKTHROUGHS[id] || null : null
}
