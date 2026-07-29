import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Product } from './product.interface';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger('ProductsService');
  private products: Product[] = [];

  onModuleInit(): void {
    // data/products.json lives at the project root, one level *above*
    // backend/ - not inside backend/ itself. All npm scripts run with
    // cwd = backend/, so the project root is reliably one level up (same
    // reasoning as the .env path story in STORY-003, before it moved).
    // This changes once the worker itself runs inside Docker (STORY-023),
    // where the file will be bind-mounted at a container-specific path.
    const filePath = path.resolve(process.cwd(), '..', 'data', 'products.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    this.products = JSON.parse(raw) as Product[];
    this.logger.log(`[PRODUCTS] Loaded ${this.products.length} products from ${filePath}`);
  }

  // Returns the already-loaded, in-memory dataset - never re-reads the
  // file from disk. Every prompt job in the process shares this same
  // static dataset, and it never changes at runtime.
  getAll(): Product[] {
    return this.products;
  }
}
