import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://eejbtdtzbdivmfdcidoa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlamJ0ZHR6YmRpdm1mZGNpZG9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDAxNzMsImV4cCI6MjA5NTIxNjE3M30.9-FnVDsziWm95jh4lfvMYyywp7BDUYCdkhNKEZz3j24';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
