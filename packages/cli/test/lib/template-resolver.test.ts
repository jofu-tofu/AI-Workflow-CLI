import {existsSync} from 'node:fs'
import {join} from 'node:path'

import {expect} from 'chai'
import {describe, it} from 'vitest'

import {getTemplateIdeNamesByPath, getTemplatePath} from '../../src/lib/template-resolver.js'

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

  it('should discover IDE folders for core template', async () => {
    const sharedPath = await getTemplatePath('core')
    const ides = await getTemplateIdeNamesByPath(sharedPath)
    expect(ides).to.include('claude')
    expect(ides).to.include('codex')
    expect(ides).to.include('windsurf')
  })

  it('should discover IDE folders for cc-native template', async () => {
    const templatePath = await getTemplatePath('cc-native')
    const ides = await getTemplateIdeNamesByPath(templatePath)
    expect(ides).to.include('claude')
    expect(ides).to.include('windsurf')
    expect(ides).to.not.include('codex')
  })
})
