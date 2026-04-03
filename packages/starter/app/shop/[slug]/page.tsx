import { sd } from '@/lib/sd';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const product = await sd.products.get(slug);
    return { title: product.name, description: product.shortDescription || undefined };
  } catch {
    return { title: 'Not Found' };
  }
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let product;
  try {
    product = await sd.products.get(slug);
  } catch {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="grid md:grid-cols-2 gap-12">
        {/* Images */}
        <div>
          {product.images.length > 0 ? (
            <img src={product.images[0].url} alt={product.images[0].alt || product.name} className="w-full rounded-lg" />
          ) : (
            <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
              No image
            </div>
          )}
          {product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2 mt-4">
              {product.images.slice(1).map(img => (
                <img key={img.id} src={img.url} alt={img.alt || ''} className="rounded aspect-square object-cover" />
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {product.category && (
            <p className="text-sm text-gray-500 mt-1">{product.category.name}</p>
          )}
          <p className="text-2xl font-bold mt-4 text-[var(--brand-primary)]">
            ${(Number(product.price) / 100).toFixed(2)}
            {product.compareAtPrice && (
              <span className="text-sm text-gray-400 line-through ml-2">
                ${(Number(product.compareAtPrice) / 100).toFixed(2)}
              </span>
            )}
          </p>

          {product.options.length > 0 && (
            <div className="mt-6 space-y-4">
              {product.options.map(opt => (
                <div key={opt.id}>
                  <label className="text-sm font-medium">{opt.name}</label>
                  <select className="mt-1 block w-full border rounded-lg px-3 py-2">
                    {opt.values.map(v => (
                      <option key={v.id}>{v.value}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {product.description && (
            <div className="mt-6 prose" dangerouslySetInnerHTML={{ __html: product.description }} />
          )}
        </div>
      </div>
    </div>
  );
}
