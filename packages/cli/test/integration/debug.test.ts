import {captureOutput} from '@oclif/test'
import {expect} from 'chai'

import {setDebugEnabled} from '../../src/lib/debug.js'

describe('debug integration', () => {
  // Reset debug state before AND after each test to prevent leakage
  beforeEach(() => {
    setDebugEnabled(false)
  })

  afterEach(() => {
    setDebugEnabled(false)
  })

  it('should show debug output when --debug flag is used', async () => {
    const {stderr} = await captureOutput(async () => {
      const {default: World} = await import('../../src/commands/hello/world.js')
      await World.run(['--debug'])
    })

    expect(stderr).to.include('[debug]')
    expect(stderr).to.include('PAI CLI')
    expect(stderr).to.include('Node.js')
  })

  it('should not show debug output without --debug flag', async () => {
    const {stderr} = await captureOutput(async () => {
      const {default: World} = await import('../../src/commands/hello/world.js')
      await World.run([])
    })

    expect(stderr).to.not.include('[debug]')
  })

  it('should display debug prefix in output', async () => {
    const {stderr} = await captureOutput(async () => {
      const {default: World} = await import('../../src/commands/hello/world.js')
      await World.run(['--debug'])
    })

    expect(stderr).to.include('[debug]')
    expect(stderr).to.include('Executing hello world command')
  })

  it('should show version info in debug mode', async () => {
    const {stderr} = await captureOutput(async () => {
      const {default: World} = await import('../../src/commands/hello/world.js')
      await World.run(['--debug'])
    })

    expect(stderr).to.include('Node.js v')
    expect(stderr).to.include('Platform:')
  })

  it('should accept -d as short form of --debug', async () => {
    const {stderr} = await captureOutput(async () => {
      const {default: World} = await import('../../src/commands/hello/world.js')
      await World.run(['-d'])
    })

    expect(stderr).to.include('[debug]')
  })
})
