import nock from 'nock'
import { InMemoryLRUCache } from 'apollo-server-caching'

import { RESTDataSource } from '..'

describe('integration', () => {
  // https://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.3.3
  //  "This response is only cacheable if indicated by a Cache-Control or Expires header field."
  it('does not cache 302 redirects', async () => {
    nock('https://test-redirect.com')
      .get('/api/v1/redirect-me')
      .reply(302, 'Redirecting to /static-asdf1.json', {
        Location: '/static-asdf1.json'
      })

    const staticJson = JSON.stringify({ "hello": "world" })
    nock('https://test-redirect.com')
      .get('/static-asdf1.json')
      .reply(200, staticJson, {
        'content-type': 'application/json',
        'content-length': staticJson.length.toString(),
        'cache-control': 'public, max-age=31536000, immutable',
        'date': new Date().toUTCString(),
        'last-modified': new Date(Date.now() - 1000).toUTCString(),
      })

    const apolloCache = new InMemoryLRUCache()

    let subject = new RESTDataSourceImpl()
    subject.initialize({
      cache: apolloCache,
      context: {}
    })

    // prime the cache
    const resp = await subject.getResource()
    expect(resp).toEqual({ hello: 'world' })

    // change the redirect
    nock('https://test-redirect.com')
      .get('/api/v1/redirect-me')
      .reply(302, 'Redirecting to /static-asdf2.json', {
        Location: '/static-asdf2.json'
      })

    const staticJson2 = JSON.stringify({ "hello": "world 2" })
    nock('https://test-redirect.com')
      .get('/static-asdf2.json')
      .reply(200, staticJson2, {
        'content-type': 'application/json',
        'content-length': staticJson2.length.toString(),
        'cache-control': 'public, max-age=31536000, immutable',
        'date': new Date().toUTCString(),
        'last-modified': new Date(Date.now() - 1000).toUTCString(),
      })

    // act: reinitialize for a second graphql request with the same cache
    subject = new RESTDataSourceImpl()
    subject.initialize({
      cache: apolloCache,
      context: {}
    })
    const resp2 = await subject.getResource()

    // assert that the redirect was not cached
    expect(resp2).toEqual({ hello: 'world 2' })
  })
})

class RESTDataSourceImpl extends RESTDataSource {
  baseURL = 'https://test-redirect.com/api/v1'

  async getResource() {
    return this.get('/redirect-me')
  }
}
