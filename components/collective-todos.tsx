'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { T, FONT, fadeUp } from '@/lib/design'
import type { StudioTodo, Priority } from '@/types/studio'
import { PRIORITY_LABELS } from '@/types/studio'

export function CollectiveTodos() {
  const [todos, setTodos] = useState<StudioTodo[]>([])
  const [loading, setLoading] = useState(true)
  const [newTodo, setNewTodo] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>('normal')

  useEffect(() => { fetchTodos() }, [])

  const fetchTodos = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/todos')
      const data = await res.json()
      setTodos(data.todos || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const addTodo = async () => {
    if (!newTodo.trim()) return
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newTodo, priority: newPriority })
      })
      if (res.ok) {
        setNewTodo('')
        setNewPriority('normal')
        fetchTodos()
      }
    } catch (e) { console.error(e) }
  }

  const toggleTodo = async (todo: StudioTodo) => {
    try {
      await fetch('/api/todos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: todo.id, is_completed: !todo.is_completed })
      })
      fetchTodos()
    } catch (e) { console.error(e) }
  }

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{
      background: T.surface,
      border: '1px solid ' + T.whisper,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid ' + T.whisper,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: FONT.label, fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', color: T.primary }}>
          TÂCHES COLLECTIVES
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, color: T.ghost }}>
          {todos.filter(t => !t.is_completed).length} en cours
        </div>
      </div>

      <div style={{ padding: 12 }}>
        {/* Add todo form */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder="Nouvelle tâche..."
            style={{
              flex: 1,
              background: T.void,
              border: '1px solid ' + T.whisper,
              borderRadius: 3,
              padding: '8px 12px',
              fontFamily: FONT.body,
              fontSize: 12,
              color: T.primary,
            }}
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as Priority)}
            style={{
              background: T.void,
              border: '1px solid ' + T.whisper,
              borderRadius: 3,
              padding: '6px 8px',
              fontFamily: FONT.mono,
              fontSize: 10,
              color: PRIORITY_LABELS[newPriority].color,
            }}
          >
            <option value="low">Basse</option>
            <option value="normal">Normal</option>
            <option value="high">Haute</option>
            <option value="money">Argent</option>
          </select>
          <button
            onClick={addTodo}
            style={{
              background: T.calm + '22',
              border: '1px solid ' + T.calm + '44',
              borderRadius: 3,
              padding: '6px 12px',
              fontFamily: FONT.label,
              fontSize: 9,
              color: T.calm,
              cursor: 'pointer',
            }}
          >
            AJOUTER
          </button>
        </div>

        {/* Todo list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: T.ghost }}>Chargement...</div>
          ) : todos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: T.ghost }}>Aucune tâche</div>
          ) : (
            todos.map(todo => (
              <div
                key={todo.id}
                onClick={() => toggleTodo(todo)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: todo.priority === 'money' ? T.money + '11' : T.void,
                  border: '1px solid ' + (todo.priority === 'money' ? T.money + '33' : T.whisper),
                  borderRadius: 3,
                  cursor: 'pointer',
                  opacity: todo.is_completed ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  border: '2px solid ' + PRIORITY_LABELS[todo.priority].color,
                  background: todo.is_completed ? PRIORITY_LABELS[todo.priority].color : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {todo.is_completed && <span style={{ color: T.void, fontSize: 10 }}>&#10003;</span>}
                </div>
                <span style={{
                  fontFamily: FONT.body,
                  fontSize: 12,
                  color: T.primary,
                  textDecoration: todo.is_completed ? 'line-through' : 'none',
                  flex: 1,
                }}>
                  {todo.content}
                </span>
                {todo.priority === 'money' && (
                  <span style={{ fontSize: 12 }}>&#128176;</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  )
}
