import {expect} from 'chai'

import {run} from '../src/index.js'

describe('src/index barrel export', () => {
  it('exports run function from @oclif/core', () => {
    expect(run).to.be.a('function')
  })
})
