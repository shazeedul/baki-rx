import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDatabase } from '../db/schema';
import { customerQueries } from '../db/queries/customers';
import { ledgerQueries } from '../db/queries/ledger';
import { userQueries } from '../db/queries/users';

describe('Relational DB SQLite Queries', () => {
  beforeEach(async () => {
    // Re-initialize database
    await initDatabase();
  });

  it('can upsert and query users', async () => {
    const term = {
      id: 'term-1',
      store_id: 'store-1',
      tenant_id: 'tenant-1',
      store_name: 'Store One',
      branch_name: 'Branch One',
      phone: '01712345678',
      pin_hash: 'hash-value',
      jwt_cache: null,
      created_at: new Date().toISOString()
    };

    await userQueries.upsertUsers([term]);
    
    const fetched = await userQueries.getUserByPhoneAndStore('01700000000', 'store-1'); // none exists with phone '01700000000'
    expect(fetched).toBeNull();

    // Now insert one with phone in mock list
    const termWithPhone = {
      ...term,
      id: 'term-2',
      phone: '01711111111' // our mock allows custom properties in user
    };
    await userQueries.upsertUsers([termWithPhone]);

    const all = await userQueries.getAllUsers();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('can create, update, and search customers', async () => {
    const storeId = 'store-test-1';
    
    // Create customer
    await customerQueries.createCustomer({
      id: 'cust-1',
      store_id: storeId,
      name: 'Rahim Khan',
      phone: '01712345678',
    });

    // Fetch customer by ID
    const c = await customerQueries.getCustomerById(storeId, 'cust-1');
    expect(c).not.toBeNull();
    expect(c?.name).toBe('Rahim Khan');

    // Update customer
    await customerQueries.updateCustomer('cust-1', 'Rahim Uddin', '01712345678', 1);
    const updated = await customerQueries.getCustomerById(storeId, 'cust-1');
    expect(updated?.name).toBe('Rahim Uddin');
    expect(updated?.is_dirty).toBe(1);

    // Search customers
    const results = await customerQueries.getCustomers(storeId, 'Rahim', 20, 0);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('cust-1');
  });

  it('calculates KPIs and defaulters correctly', async () => {
    const storeId = 'store-test-2';
    
    // Create customers
    await customerQueries.createCustomer({ id: 'c-1', store_id: storeId, name: 'Alice', phone: '01700000001' });
    await customerQueries.createCustomer({ id: 'c-2', store_id: storeId, name: 'Bob', phone: '01700000002' });

    // Alice buys medicine (baki): total 500, paid 100 -> due 400
    await ledgerQueries.createLedgerEntry({
      id: 'l-1',
      store_id: storeId,
      customer_id: 'c-1',
      entry_type: 'sale',
      total_amount: 500,
      paid_amount: 100,
      note: 'baki sale',
      created_at: new Date().toISOString()
    });

    // Bob buys medicine (baki): total 300, paid 300 -> due 0
    await ledgerQueries.createLedgerEntry({
      id: 'l-2',
      store_id: storeId,
      customer_id: 'c-2',
      entry_type: 'sale',
      total_amount: 300,
      paid_amount: 300,
      note: 'paid sale',
      created_at: new Date().toISOString()
    });

    // Total Outstanding
    const totalBaki = await ledgerQueries.getTotalBaki(storeId);
    expect(totalBaki).toBe(400); // 500 - 100 = 400, other is 0

    // Top Defaulters
    const defaulters = await ledgerQueries.getTopDefaulters(storeId, 20);
    expect(defaulters.length).toBe(1); // Only Alice has positive due
    expect(defaulters[0].customer_id).toBe('c-1');
    expect(defaulters[0].total_due).toBe(400);
  });
});
