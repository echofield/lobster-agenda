'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { T, FONT, fadeUp, GRAIN_SVG } from '@/lib/design'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.void,
        position: 'relative',
      }}
    >
      {/* Grain */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: GRAIN_SVG,
          backgroundRepeat: 'repeat',
          opacity: T.grainOpacity,
          pointerEvents: 'none',
        }}
      />

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        style={{
          width: '100%',
          maxWidth: 360,
          padding: 32,
          background: T.surface,
          border: `1px solid ${T.whisper}`,
          borderRadius: 4,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: FONT.reading,
              fontSize: 28,
              fontWeight: 400,
              color: T.primary,
              margin: 0,
            }}
          >
            Lobster Agenda
          </h1>
          <p
            style={{
              fontFamily: FONT.label,
              fontSize: 11,
              color: T.secondary,
              marginTop: 8,
              letterSpacing: '0.1em',
            }}
          >
            STUDIO PLANNING
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: 'block',
                fontFamily: FONT.label,
                fontSize: 10,
                fontWeight: 500,
                color: T.secondary,
                marginBottom: 6,
                letterSpacing: '0.1em',
              }}
            >
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: T.void,
                border: `1px solid ${T.whisper}`,
                borderRadius: 3,
                fontFamily: FONT.body,
                fontSize: 14,
                color: T.primary,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              style={{
                display: 'block',
                fontFamily: FONT.label,
                fontSize: 10,
                fontWeight: 500,
                color: T.secondary,
                marginBottom: 6,
                letterSpacing: '0.1em',
              }}
            >
              MOT DE PASSE
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: T.void,
                border: `1px solid ${T.whisper}`,
                borderRadius: 3,
                fontFamily: FONT.body,
                fontSize: 14,
                color: T.primary,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '10px 12px',
                background: T.alert + '22',
                border: `1px solid ${T.alert}44`,
                borderRadius: 3,
                marginBottom: 16,
                fontFamily: FONT.label,
                fontSize: 11,
                color: T.alert,
              }}
            >
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={loading}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: T.calm + '22',
              border: `1px solid ${T.calm}44`,
              borderRadius: 3,
              cursor: loading ? 'wait' : 'pointer',
              fontFamily: FONT.label,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.15em',
              color: T.calm,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'CONNEXION...' : 'CONNEXION'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}
