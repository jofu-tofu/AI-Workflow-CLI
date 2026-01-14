import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'
import {describe, it} from 'mocha'

import {getTemplatePath} from '../../src/lib/template-resolver.js'

describe('Template Resolver', () => {
  it('should resolve to a valid template path', async () => {
    const templatePath = await getTemplatePath('bmad')
    expect(templatePath).to.be.a('string')
    expect(templatePath.length).to.be.greaterThan(0)
  })

  it('should resolve to an existing directory', async () => {
    const templatePath = await getTemplatePath('bmad')
    expect(existsSync(templatePath)).to.be.true
  })

  it('should contain required template directories', async () => {
    const templatePath = await getTemplatePath('bmad')

    // Check for _bmad subdirectories
    expect(existsSync(join(templatePath, '_bmad'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', 'core'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', 'bmm'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', '_config'))).to.be.true

    // Check for .claude subdirectories
    expect(existsSync(join(templatePath, '.claude'))).to.be.true
    expect(existsSync(join(templatePath, '.claude', 'commands', 'bmad'))).to.be.true
    expect(existsSync(join(templatePath, '.claude', 'commands', 'bmad', 'core'))).to.be.true
    expect(existsSync(join(templatePath, '.claude', 'commands', 'bmad', 'bmm'))).to.be.true
  })

  it('should contain required template files', async () => {
    const templatePath = await getTemplatePath('bmad')

    // Config files in _bmad that will be overwritten
    expect(existsSync(join(templatePath, '_bmad', 'core', 'config.yaml'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', 'bmm', 'config.yaml'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', '_config', 'manifest.yaml'))).to.be.true

    // Manifest CSVs in _bmad
    expect(existsSync(join(templatePath, '_bmad', '_config', 'agent-manifest.csv'))).to.be.true
    expect(existsSync(join(templatePath, '_bmad', '_config', 'workflow-manifest.csv'))).to.be.true
  })
})
