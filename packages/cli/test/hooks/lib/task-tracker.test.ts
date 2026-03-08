import {mkdirSync, mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, describe, expect, it} from 'vitest'

import {
  addTask,
  deleteTask,
  generateNextTaskId,
  generateTaskSummary,
  getTasks,
  updateTask,
} from '../../../src/templates/core/lib-ts/context/task-tracker.js'
import {createContext} from '../../../src/templates/core/lib-ts/context/context-store.js'

function createProjectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'aiwcli-task-tracker-'))
  mkdirSync(join(root, '.aiwcli'), {recursive: true})
  return root
}

describe('task-tracker', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots) {
      rmSync(root, {force: true, recursive: true})
    }

    roots.length = 0
  })

  describe('CRUD operations', () => {
    it('adds, updates, and deletes a task', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-crud', 'CRUD test context', 'test', projectRoot)

      // Add
      const task = addTask('ctx-crud', 'Implement feature X', 'Build the thing', '', '', projectRoot)
      expect(task).not.toBeNull()
      expect(task!.id).toBe('aiw-1')
      expect(task!.subject).toBe('Implement feature X')
      expect(task!.status).toBe('pending')

      let tasks = getTasks('ctx-crud', projectRoot)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('aiw-1')

      // Update to in_progress
      const updated = updateTask('ctx-crud', 'aiw-1', {status: 'in_progress'}, projectRoot)
      expect(updated).toBe(true)

      tasks = getTasks('ctx-crud', projectRoot)
      expect(tasks[0].status).toBe('in_progress')

      // Update to completed — should set completed_at
      updateTask('ctx-crud', 'aiw-1', {status: 'completed'}, projectRoot)
      tasks = getTasks('ctx-crud', projectRoot)
      expect(tasks[0].status).toBe('completed')
      expect(tasks[0].completed_at).not.toBeNull()

      // Delete
      const deleted = deleteTask('ctx-crud', 'aiw-1', projectRoot)
      expect(deleted).toBe(true)

      tasks = getTasks('ctx-crud', projectRoot)
      expect(tasks).toHaveLength(0)
    })
  })

  describe('auto-incremented IDs', () => {
    it('assigns sequential IDs to tasks', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-ids', 'ID test context', 'test', projectRoot)

      const t1 = addTask('ctx-ids', 'Task one', '', '', '', projectRoot)
      const t2 = addTask('ctx-ids', 'Task two', '', '', '', projectRoot)
      const t3 = addTask('ctx-ids', 'Task three', '', '', '', projectRoot)

      expect(t1!.id).toBe('aiw-1')
      expect(t2!.id).toBe('aiw-2')
      expect(t3!.id).toBe('aiw-3')
    })
  })

  describe('gap handling', () => {
    it('does not reuse deleted IDs', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-gaps', 'Gap test context', 'test', projectRoot)

      addTask('ctx-gaps', 'Task one', '', '', '', projectRoot)
      addTask('ctx-gaps', 'Task two', '', '', '', projectRoot)
      addTask('ctx-gaps', 'Task three', '', '', '', projectRoot)

      // Delete the middle task
      deleteTask('ctx-gaps', 'aiw-2', projectRoot)

      // Next task should be aiw-4, not aiw-2
      const t4 = addTask('ctx-gaps', 'Task four', '', '', '', projectRoot)
      expect(t4!.id).toBe('aiw-4')
    })
  })

  describe('generateNextTaskId', () => {
    it('returns aiw-1 for an empty context', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-next-id', 'Next ID test', 'test', projectRoot)

      expect(generateNextTaskId('ctx-next-id', projectRoot)).toBe('aiw-1')
    })

    it('returns the correct next ID after adding tasks', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-next-id2', 'Next ID test 2', 'test', projectRoot)

      addTask('ctx-next-id2', 'First task', '', '', '', projectRoot)
      addTask('ctx-next-id2', 'Second task', '', '', '', projectRoot)

      expect(generateNextTaskId('ctx-next-id2', projectRoot)).toBe('aiw-3')
    })
  })

  describe('status transitions', () => {
    it('transitions pending → in_progress → completed with completed_at', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-status', 'Status test', 'test', projectRoot)

      addTask('ctx-status', 'Workflow task', '', '', '', projectRoot)

      let tasks = getTasks('ctx-status', projectRoot)
      expect(tasks[0].status).toBe('pending')
      expect(tasks[0].completed_at).toBeNull()

      updateTask('ctx-status', 'aiw-1', {status: 'in_progress'}, projectRoot)
      tasks = getTasks('ctx-status', projectRoot)
      expect(tasks[0].status).toBe('in_progress')
      expect(tasks[0].completed_at).toBeNull()

      updateTask('ctx-status', 'aiw-1', {status: 'completed'}, projectRoot)
      tasks = getTasks('ctx-status', projectRoot)
      expect(tasks[0].status).toBe('completed')
      expect(tasks[0].completed_at).not.toBeNull()
      // completed_at should be a valid ISO-parseable timestamp
      expect(Number.isNaN(new Date(tasks[0].completed_at!).getTime())).toBe(false)
    })

    it('transitions pending → blocked → completed', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-blocked', 'Blocked test', 'test', projectRoot)

      addTask('ctx-blocked', 'Blocked task', '', '', '', projectRoot)

      updateTask('ctx-blocked', 'aiw-1', {status: 'blocked'}, projectRoot)
      let tasks = getTasks('ctx-blocked', projectRoot)
      expect(tasks[0].status).toBe('blocked')

      updateTask('ctx-blocked', 'aiw-1', {status: 'completed'}, projectRoot)
      tasks = getTasks('ctx-blocked', projectRoot)
      expect(tasks[0].status).toBe('completed')
      expect(tasks[0].completed_at).not.toBeNull()
    })
  })

  describe('generateTaskSummary', () => {
    it('formats a summary with the correct status markers', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-summary', 'Summary test', 'test', projectRoot)

      addTask('ctx-summary', 'Done task', '', '', '', projectRoot)
      addTask('ctx-summary', 'Active task', '', '', '', projectRoot)
      addTask('ctx-summary', 'Waiting task', '', '', '', projectRoot)
      addTask('ctx-summary', 'Stuck task', '', '', '', projectRoot)

      updateTask('ctx-summary', 'aiw-1', {status: 'completed', work_summary: 'Finished it'}, projectRoot)
      updateTask('ctx-summary', 'aiw-2', {status: 'in_progress'}, projectRoot)
      // aiw-3 stays pending
      updateTask('ctx-summary', 'aiw-4', {status: 'blocked'}, projectRoot)

      const summary = generateTaskSummary('ctx-summary', projectRoot)

      // Header
      expect(summary).toContain('Tasks (4 total)')

      // Status markers
      expect(summary).toContain('[x]')
      expect(summary).toContain('[~]')
      expect(summary).toContain('[ ]')
      expect(summary).toContain('[!]')

      // Task subjects
      expect(summary).toContain('Done task')
      expect(summary).toContain('Active task')
      expect(summary).toContain('Waiting task')
      expect(summary).toContain('Stuck task')

      // Work summary for completed task
      expect(summary).toContain('Finished it')
    })

    it('returns a no-tasks message for an empty context', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-empty', 'Empty context', 'test', projectRoot)

      const summary = generateTaskSummary('ctx-empty', projectRoot)
      expect(summary).toContain('No tasks')
    })
  })

  describe('error handling', () => {
    it('addTask returns null for a non-existent context', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      const result = addTask('nonexistent-ctx', 'Orphan task', '', '', '', projectRoot)
      expect(result).toBeNull()
    })

    it('deleteTask returns false for a non-existent task', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-del-err', 'Delete error test', 'test', projectRoot)

      const result = deleteTask('ctx-del-err', 'aiw-999', projectRoot)
      expect(result).toBe(false)
    })

    it('updateTask returns false for a non-existent task', () => {
      const projectRoot = createProjectRoot()
      roots.push(projectRoot)

      createContext('ctx-upd-err', 'Update error test', 'test', projectRoot)

      const result = updateTask('ctx-upd-err', 'aiw-999', {status: 'completed'}, projectRoot)
      expect(result).toBe(false)
    })
  })
})
