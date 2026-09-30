import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseScutilProxy } from '../lib/proxy.js'

test('prefers the HTTPS proxy entry', () => {
  const out = [
    '<dictionary> {',
    '  HTTPEnable : 1',
    '  HTTPPort : 7890',
    '  HTTPProxy : 127.0.0.1',
    '  HTTPSEnable : 1',
    '  HTTPSPort : 7897',
    '  HTTPSProxy : 192.168.1.10',
    '}',
  ].join('\n')
  assert.equal(parseScutilProxy(out), 'http://192.168.1.10:7897')
})

test('falls back to the HTTP proxy entry', () => {
  const out = [
    '<dictionary> {',
    '  HTTPEnable : 1',
    '  HTTPPort : 8080',
    '  HTTPProxy : 10.0.0.2',
    '  HTTPSEnable : 0',
    '}',
  ].join('\n')
  assert.equal(parseScutilProxy(out), 'http://10.0.0.2:8080')
})

test('returns undefined when no web proxy is enabled', () => {
  const out = [
    '<dictionary> {',
    '  HTTPEnable : 0',
    '  HTTPSEnable : 0',
    '  SOCKSEnable : 1',
    '  SOCKSPort : 1080',
    '  SOCKSProxy : 127.0.0.1',
    '}',
  ].join('\n')
  assert.equal(parseScutilProxy(out), undefined)
})
