import { supabase } from '../../services/supabase';

export const authService = {
  getSession: () => supabase.auth.getSession(),

  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  signOut: () => supabase.auth.signOut(),

  onAuthStateChange: (callback) =>
    supabase.auth.onAuthStateChange(callback),
};
