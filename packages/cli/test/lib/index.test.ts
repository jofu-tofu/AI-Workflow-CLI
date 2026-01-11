import {expect} from 'chai'

import {
  ConfigNotFoundError,
  debug,
  EnvironmentError,
  getPaiHome,
  isDebugEnabled,
  isWorkspace,
  loadConfig,
  type PaiConfig,
  PaiError,
  resolvePath,
  setDebugEnabled,
  validatePaiHome,
} from '../../src/lib/index.js'

describe('lib/index barrel exports', () => {
  it('exports getPaiHome from config', () => {
    expect(getPaiHome).to.be.a('function')
  })

  it('exports loadConfig from config', () => {
    expect(loadConfig).to.be.a('function')
  })

  it('exports validatePaiHome from config', () => {
    expect(validatePaiHome).to.be.a('function')
  })

  it('exports PaiConfig interface', () => {
    const config: PaiConfig = {
      claudeConfigPath: '/test/.claude',
      paiHome: '/test',
      settingsPath: '/test/.claude/settings.json',
    }
    expect(config.paiHome).to.equal('/test')
    expect(config.claudeConfigPath).to.equal('/test/.claude')
    expect(config.settingsPath).to.equal('/test/.claude/settings.json')
  })

  it('exports error classes', () => {
    expect(PaiError).to.be.a('function')
    expect(ConfigNotFoundError).to.be.a('function')
    expect(EnvironmentError).to.be.a('function')
  })

  it('exports path utilities', () => {
    expect(resolvePath).to.be.a('function')
    expect(isWorkspace).to.be.a('function')
  })

  it('exports debug utilities', () => {
    expect(debug).to.be.a('function')
    expect(setDebugEnabled).to.be.a('function')
    expect(isDebugEnabled).to.be.a('function')
  })
})
