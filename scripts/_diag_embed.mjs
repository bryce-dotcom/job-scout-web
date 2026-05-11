import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const r1 = await s.from('employee_onboarding_packets').select('id, employee_id').eq('id', 6).single()
console.log('simple:', JSON.stringify(r1))

const r2 = await s.from('employee_onboarding_packets').select('*, employee:employees(id, name)').eq('id', 6).single()
console.log('embed:', JSON.stringify(r2).slice(0, 300))
