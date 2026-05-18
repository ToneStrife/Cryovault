import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (error) {
        console.error("[AuthContext] Error fetching profile:", error)
        return null
      }
      return data
    } catch (e) {
      console.error("[AuthContext] Unexpected error:", e)
      return null
    }
  }

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          setUser(profile)
        } else {
          setUser(null)
        }
      } catch (e) {
        console.error("[AuthContext] Init error:", e)
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          setUser(profile)
        } else {
          setUser(null)
        }
      } catch (error) {
        console.error("[AuthContext] Error in onAuthStateChange:", error)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Timeout fallback to prevent infinite loading spinner
  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const timer = setTimeout(() => {
      console.warn("[AuthContext] Loading timeout: forcing isLoading to false after 10 seconds")
      setIsLoading(false)
    }, 10000)
    return () => clearTimeout(timer)
  }, [isLoading])

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