import {expect} from 'chai'

import {
  AiwError,
  type AiwcliConfig,
  ConfigNotFoundError,
  debug,
  EnvironmentError,
  getAiwDir,
  isDebugEnabled,
  isWorkspace,
  loadConfig,
  resolvePath,
  setDebugEnabled,
  validateAiwDir,
} from '../../src/lib/index.js'

describe('lib/index barrel exports', () => {
  it('exports getAiwDir from config', () => {
    expect(getAiwDir).to.be.a('function')
  })

  it('exports loadConfig from config', () => {
    expect(loadConfig).to.be.a('function')
  })

  it('exports validateAiwDir from config', () => {
    expect(validateAiwDir).to.be.a('function')
  })

  it('exports AiwcliConfig interface', () => {
    const config: AiwcliConfig = {
      claudeConfigPath: '/test/.claude',
      aiwDir: '/test',
      settingsPath: '/test/.claude/settings.json',
    }
    expect(config.aiwDir).to.equal('/test')
    expect(config.claudeConfigPath).to.equal('/test/.claude')
    expect(config.settingsPath).to.equal('/test/.claude/settings.json')
  })

  it('exports error classes', () => {
    expect(AiwError).to.be.a('function')
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
