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
    // backend/ - not inside backend/ itself. This resolves correctly both
    // on the host (cwd = backend/, same reasoning as the .env path story in
    // STORY-003) and inside the worker's Docker container (STORY-023),
    // where docker-compose.yml bind-mounts the host's data/ folder to
    // /app/data and WORKDIR is /app/backend - "one level up" lands on
    // /app/data either way, no code branching needed.
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
