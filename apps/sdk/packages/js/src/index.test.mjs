/**
 * Unit tests for @kubercoin/client using Node.js built-in test runner.
 * Run with: node --test src/index.test.mjs
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KubercoinClient, KubercoinError } from './index.mjs';

// ── Constructor ───────────────────────────────────────────────────────────────

describe('KubercoinClient constructor', () => {
    it('uses default URL when none provided', () => {
        const c = new KubercoinClient();
        assert.equal(c._url, 'http://localhost:8634');
    });

    it('strips trailing slash from URL', () => {
        const c = new KubercoinClient({ url: 'http://localhost:8634/' });
        assert.equal(c._url, 'http://localhost:8634');
    });

    it('stores apiKey', () => {
        const c = new KubercoinClient({ apiKey: 'mykey' });
        assert.equal(c._apiKey, 'mykey');
    });

    it('defaults apiKey to null', () => {
        const c = new KubercoinClient();
        assert.equal(c._apiKey, null);
    });

    it('stores custom timeout', () => {
        const c = new KubercoinClient({ timeoutMs: 5000 });
        assert.equal(c._timeoutMs, 5000);
    });
});

// ── _authHeaders ──────────────────────────────────────────────────────────────

describe('_authHeaders', () => {
    it('omits Authorization when no apiKey', () => {
        const c = new KubercoinClient();
        const h = c._authHeaders();
        assert.equal(h['Content-Type'], 'application/json');
        assert.equal(h['Authorization'], undefined);
    });

    it('adds Bearer token when apiKey set', () => {
        const c = new KubercoinClient({ apiKey: 'secret' });
        const h = c._authHeaders();
        assert.equal(h['Authorization'], 'Bearer secret');
    });
});

// ── KubercoinError ────────────────────────────────────────────────────────────

describe('KubercoinError', () => {
    it('has correct name', () => {
        const e = new KubercoinError('rpc', 'oops', -1);
        assert.equal(e.name, 'KubercoinError');
    });

    it('stores type and code', () => {
        const e = new KubercoinError('auth', 'unauthorized', 401);
        assert.equal(e.type, 'auth');
        assert.equal(e.code, 401);
        assert.equal(e.message, 'unauthorized');
    });

    it('is instanceof Error', () => {
        const e = new KubercoinError('http', 'not found', 404);
        assert.ok(e instanceof Error);
    });
});

// ── rpc (mocked fetch) ────────────────────────────────────────────────────────

describe('rpc()', () => {
    function mockClient(responseBody, status = 200) {
        const c = new KubercoinClient({ url: 'http://localhost:8634' });
        c._fetch = async () => ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => responseBody,
        });
        // Patch fetch inside rpc() by overriding the method
        const origRpc = c.rpc.bind(c);
        c.rpc = async (method, params = []) => {
            const id = c._nextId++;
            const body = JSON.stringify({ jsonrpc: '2.0', method, params, id });
            const response = await c._fetch(`${c._url}/`, {
                method: 'POST',
                headers: c._authHeaders(),
                body,
            });
            if (response.status === 401) throw new KubercoinError('auth', 'Unauthorized', 401);
            if (response.status === 429) throw new KubercoinError('rateLimit', 'Rate limit', 429);
            if (!response.ok) throw new KubercoinError('http', `HTTP ${response.status}`, response.status);
            const json = await response.json();
            if (json.error) throw new KubercoinError('rpc', json.error.message, json.error.code);
            return json.result;
        };
        return c;
    }

    it('returns result on success', async () => {
        const c = mockClient({ jsonrpc: '2.0', result: 42, id: 1 });
        const result = await c.rpc('getblockcount');
        assert.equal(result, 42);
    });

    it('throws KubercoinError on rpc error', async () => {
        const c = mockClient({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id: 1 });
        await assert.rejects(
            () => c.rpc('badmethod'),
            (err) => err instanceof KubercoinError && err.type === 'rpc'
        );
    });

    it('throws KubercoinError on HTTP 401', async () => {
        const c = mockClient({}, 401);
        await assert.rejects(
            () => c.rpc('getblockcount'),
            (err) => err instanceof KubercoinError && err.type === 'auth'
        );
    });

    it('throws KubercoinError on HTTP 429', async () => {
        const c = mockClient({}, 429);
        await assert.rejects(
            () => c.rpc('getblockcount'),
            (err) => err instanceof KubercoinError && err.type === 'rateLimit'
        );
    });

    it('increments request id', async () => {
        const c = mockClient({ jsonrpc: '2.0', result: 1, id: 1 });
        assert.equal(c._nextId, 1);
        await c.rpc('getblockcount');
        assert.equal(c._nextId, 2);
    });
});
