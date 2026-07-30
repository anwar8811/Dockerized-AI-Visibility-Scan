import * as fs from 'fs';
import { ProductsService } from './products.service';

// `jest.spyOn(fs, 'readFileSync')` does NOT work here - Node's built-in
// `fs` module export is a frozen namespace object under ESM/CJS interop,
// so Jest can't redefine the property directly ("Cannot redefine
// property: readFileSync"). jest.mock() replaces the whole module at
// require-time instead, which sidesteps that. The mock still delegates to
// the real implementation, so both tests below use the real
// data/products.json content.
const actualFs = jest.requireActual<typeof fs>('fs');
const readFileSyncMock = jest.fn(actualFs.readFileSync);

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: (...args: Parameters<typeof fs.readFileSync>) =>
    readFileSyncMock(...args),
}));

describe('ProductsService', () => {
  beforeEach(() => {
    readFileSyncMock.mockClear();
  });

  it('reads products.json from disk only once, even across multiple getAll() calls', () => {
    const service = new ProductsService();
    service.onModuleInit();

    service.getAll();
    service.getAll();

    expect(readFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('returns the 5 fictional brands the brief requires, plus Elegant (added for live testing)', () => {
    const service = new ProductsService();
    service.onModuleInit();

    const names = service.getAll().map((product) => product.name);
    expect(names).toEqual([
      'NimbusCRM',
      'OrbitDesk',
      'ClientLoop',
      'FunnelForge',
      'LeadHarbor',
      'Elegant',
    ]);
  });
});
