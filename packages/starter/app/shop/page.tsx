import { sd } from '@/lib/sd';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Shop' };

export default async function ShopPage() {
  let products;
  try {
    const result = await sd.products.list({ limit: 24 });
    products = result.data;
  } catch {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Shop</h1>
        <p className="text-gray-600">Store is not available.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Shop</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map(product => (
          <Link key={product.id} href={`/shop/${product.slug}`} className="group">
            {product.image ? (
              <img src={product.image} alt={product.name} className="w-full aspect-square object-cover rounded-lg mb-3" />
            ) : (
              <div className="w-full aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center text-gray-400">
                No image
              </div>
            )}
            <h3 className="font-medium group-hover:text-[var(--brand-primary)] transition-colors">{product.name}</h3>
            <p className="text-sm text-gray-600 mt-1">${(Number(product.price) / 100).toFixed(2)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
