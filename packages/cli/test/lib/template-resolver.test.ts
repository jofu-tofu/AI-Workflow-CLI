import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'
import {describe, it} from 'mocha'

import {getTemplatePath} from '../../src/lib/template-resolver.js'

describe('Template Resolver', () => {
  it('should resolve to a valid template path', async () => {
    const templatePath = await getTemplatePath('cc-native')
    expect(templatePath).to.be.a('string')
    expect(templatePath.length).to.be.greaterThan(0)
  })

  it('should resolve to an existing directory', async () => {
    const templatePath = await getTemplatePath('cc-native')
    expect(existsSync(templatePath)).to.be.true
  })

  it('should contain required template directories', async () => {
    const templatePath = await getTemplatePath('cc-native')

    // Check for _cc-native subdirectory
    expect(existsSync(join(templatePath, '_cc-native'))).to.be.true

    // Check for .claude subdirectories
    expect(existsSync(join(templatePath, '.claude'))).to.be.true
  })
})
