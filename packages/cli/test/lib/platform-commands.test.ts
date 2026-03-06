import {expect} from 'chai'
import {type SinonStub, stub} from 'sinon'

import {adaptHookCommand, validateCommandsForPlatform} from '../../src/lib/platform-commands.js'

describe('platform-commands', () => {
  describe('adaptHookCommand', () => {
    let platformStub: SinonStub

    afterEach(() => {
      platformStub?.restore()
    })

    it('is a no-op on non-Windows', () => {
      platformStub = stub(process, 'platform').value('linux')
      const cmd = 'bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/session_start.ts'
      expect(adaptHookCommand(cmd)).to.equal(cmd)
    })

    it('quotes resolver path on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      const cmd = 'bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/hooks-ts/session_start.ts'
      const result = adaptHookCommand(cmd)
      expect(result).to.include('.aiwcli/_core/scripts/resolve-run.ts')
      expect(result).to.include('.aiwcli/_core/hooks-ts/session_start.ts')
      // Should be quoted for paths with spaces
      expect(result).to.match(/bun "\.aiwcli\/_core\/scripts\/resolve-run\.ts"/)
    })

    it('strips bash env-var prefix on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      const cmd = 'NO_COLOR= FORCE_COLOR=2 bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/scripts/status_line.ts'
      const result = adaptHookCommand(cmd)
      expect(result).to.not.include('NO_COLOR=')
      expect(result).to.not.include('FORCE_COLOR=2')
      expect(result).to.match(/^bun "/)
    })

    it('preserves bash env-var prefix on Unix', () => {
      platformStub = stub(process, 'platform').value('darwin')
      const cmd = 'NO_COLOR= FORCE_COLOR=2 bun .aiwcli/_core/scripts/resolve-run.ts .aiwcli/_core/scripts/status_line.ts'
      expect(adaptHookCommand(cmd)).to.equal(cmd)
    })

    it('handles commands without resolver token on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      const cmd = 'echo hello'
      expect(adaptHookCommand(cmd)).to.equal('echo hello')
    })
  })

  describe('validateCommandsForPlatform', () => {
    let platformStub: SinonStub

    afterEach(() => {
      platformStub?.restore()
    })

    it('is a no-op on Unix', () => {
      platformStub = stub(process, 'platform').value('linux')
      expect(() => validateCommandsForPlatform(['bun ~/some/path foo'])).to.not.throw()
    })

    it('throws on unexpanded ~/ on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      expect(() => validateCommandsForPlatform(['bun ~/some/path foo'])).to.throw(/unexpanded ~\//)
    })

    it('throws on bash env prefix on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      expect(() => validateCommandsForPlatform(['NO_COLOR= bun something'])).to.throw(/bash env prefix/)
    })

    it('passes for adapted commands on Windows', () => {
      platformStub = stub(process, 'platform').value('win32')
      const adapted = ['bun ".aiwcli/_core/scripts/resolve-run.ts" .aiwcli/foo.ts']
      expect(() => validateCommandsForPlatform(adapted)).to.not.throw()
    })
  })
})
