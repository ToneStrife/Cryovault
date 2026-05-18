import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types'

interface AuthContextType {
  user: Profile | null
  isLoading: boolean
  isAuthenticated: boolean
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      console.log("[AuthContext] Fetching profile for:", userId)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (error) {
        console.error("[AuthContext] Error fetching profile:", error)
        return null
      }
      console.log("[AuthContext] Profile fetched:", data?.id)
      return data
    } catch (e) {
      console.error("[AuthContext] Unexpected error fetching profile:", e)
      return null
    }
  }, [])

  useEffect(() => {
    let isMounted = true
    let authInitialized = false

    const initializeAuth = async (session: any, event: string) => {
      if (!isMounted) return
      console.log(`[AuthContext] Initializing auth: ${event}`, session?.user?.id)
      
      try {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          if (isMounted) {
            setUser(profile)
            console.log("[AuthContext] User set from profile")
          }
        } else {
          if (isMounted) {
            setUser(null)
            console.log("[AuthContext] No session, user set to null")
          }
        }
      } catch (e) {
        console.error("[AuthContext] Initialization error:", e)
      } finally {
        if (isMounted) {
          setIsLoading(false)
          authInitialized = true
          console.log("[AuthContext] isLoading set to false")
        }
      }
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted && !authInitialized) {
        initializeAuth(session, 'GET_SESSION')
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log(`[AuthContext] Auth state change event: ${event}`, session?.user?.id)
      
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      // For other events, we might want to re-fetch the profile
      if (isMounted) {
        // If it's INITIAL_SESSION and we already initialized via getSession, skip
        if (event === 'INITIAL_SESSION' && authInitialized) {
          return
        }
        
        initializeAuth(session, event)
      }
    })

    // Safety timeout: if after 6 seconds we are still loading, force it to false
    const timer = setTimeout(() => {
      if (isMounted && !authInitialized) {
        console.warn("[AuthContext] Auth initialization timed out, forcing loading to false")
        setIsLoading(false)
      }
    }, 6000)

    return () => {
      isMounted = false
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [fetchProfile])


  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, laboratory: 'default_lab', role: 'researcher' } },
    })
    if (error) throw error
  }

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider')
  return context
}