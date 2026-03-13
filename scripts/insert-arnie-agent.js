import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function insertArnieAgent() {
  // Check if Arnie already exists
  const { data: existing } = await supabase
    .from('agents')
    .select('id')
    .eq('slug', 'arnie-og')
    .single()

  if (existing) {
    console.log('Arnie agent already exists (id:', existing.id, '). Skipping.')
    return
  }

  const { data, error } = await supabase
    .from('agents')
    .insert({
      slug: 'arnie-og',
      name: 'Arnie',
      title: 'AI Assistant',
      full_name: 'OG Arnie',
      tagline: 'Your AI-powered business assistant that knows your company inside and out',
      description: 'OG Arnie is a conversational AI assistant that can answer questions about your jobs, customers, products, employees, finances, and more. Arnie respects role-based access — field techs see their assignments, admins see everything, and owners get the full financial picture. Available from anywhere in the app via the floating chat panel.',
      icon: 'Bot',
      avatar_url: null,
      trade_category: 'general',
      ai_capabilities: [
        'Company data Q&A',
        'Job & schedule summaries',
        'Customer & lead insights',
        'Financial overviews',
        'Team & inventory reports',
        'Role-based access control',
        'Markdown tables & lists',
        'Conversation history'
      ],
      price_monthly: 0,
      price_yearly: 0,
      is_free: true,
      status: 'active',
      display_order: 10
    })
    .select()
    .single()

  if (error) {
    console.error('Error inserting Arnie agent:', error)
    process.exit(1)
  }

  console.log('Arnie agent inserted successfully:', data)
}

insertArnieAgent()
