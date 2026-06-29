/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Heavy-dep mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label }: any) => (
    <div data-testid={`media-picker-${label || 'unnamed'}`}>
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label, placeholder }: any) => (
    <label data-testid={`color-wrap-${label || placeholder || 'unnamed'}`}>
      <span>{label}</span>
      <input
        data-testid={`color-${label || placeholder || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: any) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Lazy import after mocks
import { DynamicPanel } from '@/components/blocks/visual/block-settings/panels/DynamicPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOnChange<T = any>() {
  return vi.fn<(updates: Partial<T>) => void>();
}

function renderPanel(block: any, onChange = makeOnChange(), viewport: any = 'desktop') {
  const utils = render(
    <DynamicPanel block={block} onChange={onChange} currentViewport={viewport} />
  );
  return { ...utils, onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests — dispatcher
// ---------------------------------------------------------------------------

describe('DynamicPanel — dispatcher', () => {
  it('renders null for unknown block type', () => {
    const { container } = renderPanel({ id: 'x1', type: 'not-a-real-block' });
    expect(container.firstChild).toBeNull();
  });

  it('dispatches blog-posts blocks', () => {
    renderPanel({ id: 'bp1', type: 'blog-posts', title: '', description: '', postType: '', columns: 3 });
    expect(screen.getByPlaceholderText('Leave empty for all posts')).toBeTruthy();
  });

  it('dispatches card-grid blocks', () => {
    renderPanel({ id: 'cg1', type: 'card-grid', columns: 3 });
    expect(screen.getByText('Number of Columns')).toBeTruthy();
  });

  it('dispatches featured-content blocks', () => {
    renderPanel({ id: 'fc1', type: 'featured-content', title: 'T', description: '' });
    expect(screen.getByPlaceholderText('Button text...')).toBeTruthy();
  });

  it('dispatches accordion blocks', () => {
    renderPanel({ id: 'ac1', type: 'accordion', title: '', items: [] });
    expect(screen.getByText(/Use the controls in the editor/)).toBeTruthy();
  });

  it('dispatches product-grid blocks', () => {
    renderPanel({ id: 'pg1', type: 'product-grid' });
    expect(screen.getByText('Sort By')).toBeTruthy();
  });

  it('dispatches featured-products blocks', () => {
    renderPanel({ id: 'fp1', type: 'featured-products' });
    expect(screen.getByText('Badge Text')).toBeTruthy();
  });

  it('dispatches product-categories blocks', () => {
    renderPanel({ id: 'pc1', type: 'product-categories' });
    expect(screen.getByText('Layout')).toBeTruthy();
  });

  it('dispatches shopping-cart blocks', () => {
    renderPanel({ id: 'sc1', type: 'shopping-cart' });
    expect(screen.getByText('Cart Style')).toBeTruthy();
  });

  it('dispatches store-banner blocks', () => {
    renderPanel({ id: 'sb1', type: 'store-banner', title: 'Sale' });
    expect(screen.getByText('Discount Code')).toBeTruthy();
  });

  it('dispatches product-detail blocks', () => {
    renderPanel({ id: 'pd1', type: 'product-detail' });
    expect(screen.getByText('Product Slug')).toBeTruthy();
  });

  it('dispatches tabs blocks', () => {
    renderPanel({ id: 'tb1', type: 'tabs', tabs: [] });
    expect(screen.getByText('+ Add Tab')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — BlogPostsBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — BlogPostsBlockSettings', () => {
  const baseBlogPosts = {
    id: 'bp1',
    type: 'blog-posts',
    title: 'Latest News',
    description: 'Stay updated',
    postType: '',
    categorySlug: '',
    limit: 3,
    columns: 3,
    showExcerpt: true,
  };

  it('renders title RichTextEditable with value', () => {
    renderPanel(baseBlogPosts);
    const rte = screen.getByTestId('rte-Section title...') as HTMLTextAreaElement;
    expect(rte.value).toBe('Latest News');
  });

  it('updates title via RichTextEditable (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const rte = screen.getByTestId('rte-Section title...');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ title: undefined });
    fireEvent.change(rte, { target: { value: 'News' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'News' });
  });

  it('updates description via RichTextEditable', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const rte = screen.getByTestId('rte-Section description...');
    fireEvent.change(rte, { target: { value: 'New desc' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'New desc' });
  });

  it('updates postType input', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const input = screen.getByPlaceholderText('Leave empty for all posts') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'category' } });
    expect(onChange).toHaveBeenCalledWith({ postType: 'category' });
  });

  it('updates categorySlug input', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const input = screen.getByPlaceholderText('e.g. company-news') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'updates' } });
    expect(onChange).toHaveBeenCalledWith({ categorySlug: 'updates' });
  });

  it('collapses empty categorySlug to undefined', () => {
    const { onChange } = renderPanel({ ...baseBlogPosts, categorySlug: 'news' });
    const input = screen.getByDisplayValue('news') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ categorySlug: undefined });
  });

  it('updates number of posts via number input', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const input = screen.getByDisplayValue('3') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '6' } });
    expect(onChange).toHaveBeenCalledWith({ limit: 6 });
  });

  it('updates columns via select (parses to int)', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 2 });
  });

  it('toggles showExcerpt checkbox', () => {
    const { onChange } = renderPanel(baseBlogPosts);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ showExcerpt: false });
  });

  it('defaults showExcerpt to true when not set (checked)', () => {
    renderPanel({ ...baseBlogPosts, showExcerpt: undefined });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — CardGridBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — CardGridBlockSettings', () => {
  const baseCardGrid = {
    id: 'cg1',
    type: 'card-grid',
    title: 'Our Services',
    description: 'What we offer',
    columns: 3,
  };

  it('renders title RichTextEditable with value', () => {
    renderPanel(baseCardGrid);
    expect((screen.getByTestId('rte-Section title...') as HTMLTextAreaElement).value).toBe('Our Services');
  });

  it('updates columns via select', () => {
    const { onChange } = renderPanel(baseCardGrid);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('updates description via RichTextEditable', () => {
    const { onChange } = renderPanel(baseCardGrid);
    const rte = screen.getByTestId('rte-Section description...');
    fireEvent.change(rte, { target: { value: 'Updated' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'Updated' });
  });

  it('defaults columns to 3 when not set', () => {
    renderPanel({ ...baseCardGrid, columns: undefined });
    expect(screen.getByDisplayValue('3 Columns')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — FeaturedContentBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — FeaturedContentBlockSettings', () => {
  const baseFeatured = {
    id: 'fc1',
    type: 'featured-content',
    title: 'About Us',
    description: 'Learn more',
    buttonText: 'Read More',
    buttonUrl: '/about',
    imageUrl: '',
    imagePosition: 'right',
  };

  it('renders title RichTextEditable with value', () => {
    renderPanel(baseFeatured);
    expect((screen.getByTestId('rte-Title...') as HTMLTextAreaElement).value).toBe('About Us');
  });

  it('updates button text input', () => {
    const { onChange } = renderPanel(baseFeatured);
    const inputs = screen.getAllByPlaceholderText('Button text...') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'Learn More' } });
    expect(onChange).toHaveBeenCalledWith({ buttonText: 'Learn More' });
  });

  it('updates button URL input', () => {
    const { onChange } = renderPanel(baseFeatured);
    const inputs = screen.getAllByPlaceholderText('/url...') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '/team' } });
    expect(onChange).toHaveBeenCalledWith({ buttonUrl: '/team' });
  });

  it('changes imagePosition via select', () => {
    const { onChange } = renderPanel(baseFeatured);
    const select = screen.getByDisplayValue('Right') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'left' } });
    expect(onChange).toHaveBeenCalledWith({ imagePosition: 'left' });
  });

  it('shows click-to-select button when no imageUrl', () => {
    renderPanel(baseFeatured);
    expect(screen.getByText('Click to select image')).toBeTruthy();
  });

  it('opens media picker when select-image button clicked', () => {
    renderPanel(baseFeatured);
    expect(screen.queryByTestId('media-picker-Select Featured Image')).toBeNull();
    fireEvent.click(screen.getByText('Click to select image'));
    expect(screen.getByTestId('media-picker-Select Featured Image')).toBeTruthy();
  });

  it('selecting media closes picker and emits imageUrl', () => {
    const { onChange } = renderPanel(baseFeatured);
    fireEvent.click(screen.getByText('Click to select image'));
    const mpInput = screen.getByTestId('mp-input-Select Featured Image') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'https://img.com/photo.jpg' } });
    expect(onChange).toHaveBeenCalledWith({ imageUrl: 'https://img.com/photo.jpg' });
    expect(screen.queryByTestId('media-picker-Select Featured Image')).toBeNull();
  });

  it('shows Change Image and Remove buttons when imageUrl set', () => {
    const { onChange } = renderPanel({ ...baseFeatured, imageUrl: 'https://img.com/existing.jpg' });
    expect(screen.getByText('Change Image')).toBeTruthy();
    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ imageUrl: '' });
  });

  it('opens media picker via Change Image button', () => {
    renderPanel({ ...baseFeatured, imageUrl: 'https://img.com/existing.jpg' });
    fireEvent.click(screen.getByText('Change Image'));
    expect(screen.getByTestId('media-picker-Select Featured Image')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — AccordionBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — AccordionBlockSettings', () => {
  const baseAccordion = {
    id: 'ac1',
    type: 'accordion',
    title: 'FAQ',
    items: [],
  };

  it('renders section title RichTextEditable with value', () => {
    renderPanel(baseAccordion);
    const rte = screen.getByTestId('rte-Frequently Asked Questions') as HTMLTextAreaElement;
    expect(rte.value).toBe('FAQ');
  });

  it('updates title via RichTextEditable', () => {
    const { onChange } = renderPanel(baseAccordion);
    const rte = screen.getByTestId('rte-Frequently Asked Questions');
    fireEvent.change(rte, { target: { value: 'Common Questions' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'Common Questions' });
  });

  it('collapses empty title to undefined', () => {
    const { onChange } = renderPanel(baseAccordion);
    const rte = screen.getByTestId('rte-Frequently Asked Questions');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ title: undefined });
  });

  it('shows instruction text about editor controls', () => {
    renderPanel(baseAccordion);
    expect(screen.getByText(/Use the controls in the editor/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — ProductGridBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — ProductGridBlockSettings', () => {
  const baseProductGrid = {
    id: 'pg1',
    type: 'product-grid',
    title: 'Products',
    description: 'Browse our selection',
    categorySlug: '',
    sort: 'newest',
    limit: 6,
    columns: 3,
    showPrice: true,
    showDescription: false,
    showCategory: false,
    buttonText: 'Add to Cart',
  };

  it('updates sort via select', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const select = screen.getByDisplayValue('Newest') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'price_asc' } });
    expect(onChange).toHaveBeenCalledWith({ sort: 'price_asc' });
  });

  it('updates limit input', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const input = screen.getByDisplayValue('6') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12' } });
    expect(onChange).toHaveBeenCalledWith({ limit: 12 });
  });

  it('updates columns select', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('updates buttonText input', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const input = screen.getByDisplayValue('Add to Cart') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Buy Now' } });
    expect(onChange).toHaveBeenCalledWith({ buttonText: 'Buy Now' });
  });

  it('toggles showPrice checkbox', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    // showPrice=true is first
    expect(checkboxes[0].checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ showPrice: false });
  });

  it('toggles showDescription checkbox (was false)', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(false);
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ showDescription: true });
  });

  it('toggles showCategory checkbox', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[2]);
    expect(onChange).toHaveBeenCalledWith({ showCategory: true });
  });

  it('updates categorySlug input', () => {
    const { onChange } = renderPanel(baseProductGrid);
    const input = screen.getByPlaceholderText('Leave empty for all products') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'apparel' } });
    expect(onChange).toHaveBeenCalledWith({ categorySlug: 'apparel' });
  });
});

// ---------------------------------------------------------------------------
// Tests — FeaturedProductsBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — FeaturedProductsBlockSettings', () => {
  const baseFeaturedProducts = {
    id: 'fp1',
    type: 'featured-products',
    title: 'Top Picks',
    description: 'Our favorites',
    limit: 4,
    columns: 4,
    showPrice: true,
    showBadge: true,
    badgeText: 'Featured',
    buttonText: 'Shop Now',
  };

  it('updates limit', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const input = screen.getByDisplayValue('4') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith({ limit: 8 });
  });

  it('updates columns', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const select = screen.getByDisplayValue('4 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 2 });
  });

  it('updates badgeText input', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const input = screen.getByDisplayValue('Featured') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Best Seller' } });
    expect(onChange).toHaveBeenCalledWith({ badgeText: 'Best Seller' });
  });

  it('updates buttonText input', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const input = screen.getByDisplayValue('Shop Now') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Buy Now' } });
    expect(onChange).toHaveBeenCalledWith({ buttonText: 'Buy Now' });
  });

  it('toggles showPrice checkbox', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ showPrice: false });
  });

  it('toggles showBadge checkbox', () => {
    const { onChange } = renderPanel(baseFeaturedProducts);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(true);
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ showBadge: false });
  });
});

// ---------------------------------------------------------------------------
// Tests — ProductCategoriesBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — ProductCategoriesBlockSettings', () => {
  const baseProductCategories = {
    id: 'pc1',
    type: 'product-categories',
    title: 'Shop by Category',
    description: '',
    layout: 'grid',
    columns: 3,
    showProductCount: true,
    showImage: true,
  };

  it('changes layout via select', () => {
    const { onChange } = renderPanel(baseProductCategories);
    const select = screen.getByDisplayValue('Grid') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'list' } });
    expect(onChange).toHaveBeenCalledWith({ layout: 'list' });
  });

  it('shows columns selector when layout is grid', () => {
    renderPanel(baseProductCategories);
    expect(screen.getByDisplayValue('3 Columns')).toBeTruthy();
  });

  it('hides columns selector when layout is list', () => {
    renderPanel({ ...baseProductCategories, layout: 'list' });
    expect(screen.queryByText('Columns')).toBeNull();
  });

  it('updates columns select', () => {
    const { onChange } = renderPanel(baseProductCategories);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('toggles showProductCount checkbox', () => {
    const { onChange } = renderPanel(baseProductCategories);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[0].checked).toBe(true);
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ showProductCount: false });
  });

  it('toggles showImage checkbox', () => {
    const { onChange } = renderPanel(baseProductCategories);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes[1].checked).toBe(true);
    fireEvent.click(checkboxes[1]);
    expect(onChange).toHaveBeenCalledWith({ showImage: false });
  });
});

// ---------------------------------------------------------------------------
// Tests — ShoppingCartBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — ShoppingCartBlockSettings', () => {
  const baseCart = {
    id: 'sc1',
    type: 'shopping-cart',
    variant: 'full',
    showSubtotal: true,
    checkoutButtonText: 'Proceed to Checkout',
    emptyCartMessage: 'Your cart is empty',
  };

  it('changes cart style via select', () => {
    const { onChange } = renderPanel(baseCart);
    const select = screen.getByDisplayValue('Full Cart') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'mini' } });
    expect(onChange).toHaveBeenCalledWith({ variant: 'mini' });
  });

  it('updates checkoutButtonText input', () => {
    const { onChange } = renderPanel(baseCart);
    const input = screen.getByDisplayValue('Proceed to Checkout') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Checkout Now' } });
    expect(onChange).toHaveBeenCalledWith({ checkoutButtonText: 'Checkout Now' });
  });

  it('updates emptyCartMessage input', () => {
    const { onChange } = renderPanel(baseCart);
    const input = screen.getByDisplayValue('Your cart is empty') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nothing here yet' } });
    expect(onChange).toHaveBeenCalledWith({ emptyCartMessage: 'Nothing here yet' });
  });

  it('toggles showSubtotal checkbox', () => {
    const { onChange } = renderPanel(baseCart);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ showSubtotal: false });
  });

  it('defaults variant to full when not set', () => {
    renderPanel({ ...baseCart, variant: undefined });
    expect(screen.getByDisplayValue('Full Cart')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — ProductDetailBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — ProductDetailBlockSettings', () => {
  const baseProductDetail = {
    id: 'pd1',
    type: 'product-detail',
    productSlug: 'dinner-at-the-club',
    layout: 'standard',
    showGallery: true,
    showDescription: true,
    showVariants: true,
    showAddToCart: true,
    showBulkPricing: true,
    showBreadcrumb: true,
    showTags: true,
  };

  it('updates productSlug input', () => {
    const { onChange } = renderPanel(baseProductDetail);
    const input = screen.getByDisplayValue('dinner-at-the-club') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new-product' } });
    expect(onChange).toHaveBeenCalledWith({ productSlug: 'new-product' });
  });

  it('changes layout via select', () => {
    const { onChange } = renderPanel(baseProductDetail);
    const select = screen.getByDisplayValue('Standard (2 column)') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'wide' } });
    expect(onChange).toHaveBeenCalledWith({ layout: 'wide' });
  });

  it('has 7 visible toggleable checkboxes', () => {
    renderPanel(baseProductDetail);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(7);
    checkboxes.forEach((cb) => expect(cb.checked).toBe(true));
  });

  it('toggles showGallery off', () => {
    const { onChange } = renderPanel(baseProductDetail);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[0]);
    expect(onChange).toHaveBeenCalledWith({ showGallery: false });
  });

  it('toggles showAddToCart off', () => {
    const { onChange } = renderPanel(baseProductDetail);
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    fireEvent.click(checkboxes[3]);
    expect(onChange).toHaveBeenCalledWith({ showAddToCart: false });
  });
});

// ---------------------------------------------------------------------------
// Tests — StoreBannerBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — StoreBannerBlockSettings', () => {
  const baseStoreBanner = {
    id: 'sb1',
    type: 'store-banner',
    title: 'Big Sale',
    subtitle: 'Up to 50% off',
    discountCode: 'SAVE50',
    buttonText: 'Shop Now',
    buttonUrl: '/shop',
    backgroundStyle: 'gradient',
    accentColor: '',
    countdownDate: '',
  };

  it('renders title RichTextEditable with value', () => {
    renderPanel(baseStoreBanner);
    expect((screen.getByTestId('rte-Banner title...') as HTMLTextAreaElement).value).toBe('Big Sale');
  });

  it('updates title via RichTextEditable', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const rte = screen.getByTestId('rte-Banner title...');
    fireEvent.change(rte, { target: { value: 'Flash Sale' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'Flash Sale' });
  });

  it('updates subtitle via RichTextEditable (collapses empty)', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const rte = screen.getByTestId('rte-Subtitle...');
    fireEvent.change(rte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ subtitle: undefined });
  });

  it('updates discountCode input', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const input = screen.getByDisplayValue('SAVE50') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'SUMMER25' } });
    expect(onChange).toHaveBeenCalledWith({ discountCode: 'SUMMER25' });
  });

  it('updates buttonText input', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const input = screen.getByDisplayValue('Shop Now') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Buy Now' } });
    expect(onChange).toHaveBeenCalledWith({ buttonText: 'Buy Now' });
  });

  it('updates buttonUrl input', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const input = screen.getByDisplayValue('/shop') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/sale' } });
    expect(onChange).toHaveBeenCalledWith({ buttonUrl: '/sale' });
  });

  it('changes backgroundStyle via select', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const select = screen.getByDisplayValue('Gradient') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'solid' } });
    expect(onChange).toHaveBeenCalledWith({ backgroundStyle: 'solid' });
  });

  it('updates accentColor via TokenColorPicker', () => {
    const { onChange } = renderPanel(baseStoreBanner);
    const colorInput = screen.getByTestId('color-Accent Color') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#6366f1' } });
    expect(onChange).toHaveBeenCalledWith({ accentColor: '#6366f1' });
  });

  it('hides background image picker when backgroundStyle is not image', () => {
    renderPanel(baseStoreBanner);
    expect(screen.queryByText('Choose Image')).toBeNull();
  });

  it('shows Choose Image button when backgroundStyle is image', () => {
    renderPanel({ ...baseStoreBanner, backgroundStyle: 'image', backgroundImage: '' });
    expect(screen.getByText('Choose Image')).toBeTruthy();
  });

  it('opens media picker when Choose Image clicked', () => {
    renderPanel({ ...baseStoreBanner, backgroundStyle: 'image', backgroundImage: '' });
    fireEvent.click(screen.getByText('Choose Image'));
    expect(screen.getByTestId('media-picker-Select Banner Image')).toBeTruthy();
  });

  it('shows Change/Remove buttons when backgroundImage set', () => {
    const { onChange } = renderPanel({
      ...baseStoreBanner,
      backgroundStyle: 'image',
      backgroundImage: 'https://img.com/bg.jpg',
    });
    expect(screen.getByText('Change')).toBeTruthy();
    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ backgroundImage: '' });
  });

  it('selects background image via media picker', () => {
    const { onChange } = renderPanel({ ...baseStoreBanner, backgroundStyle: 'image', backgroundImage: '' });
    fireEvent.click(screen.getByText('Choose Image'));
    const mpInput = screen.getByTestId('mp-input-Select Banner Image') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'https://img.com/new-bg.jpg' } });
    expect(onChange).toHaveBeenCalledWith({ backgroundImage: 'https://img.com/new-bg.jpg' });
    // picker closes
    expect(screen.queryByTestId('media-picker-Select Banner Image')).toBeNull();
  });

  it('updates countdownDate input', () => {
    const { onChange } = renderPanel({ ...baseStoreBanner, countdownDate: '2026-06-01T12:00' });
    const input = screen.getByDisplayValue('2026-06-01T12:00') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-12-31T23:59' } });
    expect(onChange).toHaveBeenCalledWith({ countdownDate: '2026-12-31T23:59' });
  });
});

// ---------------------------------------------------------------------------
// Tests — TabsBlockSettings
// ---------------------------------------------------------------------------

describe('DynamicPanel — TabsBlockSettings', () => {
  const baseTabs = {
    id: 'tb1',
    type: 'tabs',
    tabs: [
      { id: 'tab-1', label: 'Overview', blocks: [] },
      { id: 'tab-2', label: 'Details', blocks: [] },
    ],
  };

  it('renders tab label inputs with values', () => {
    renderPanel(baseTabs);
    expect((screen.getByDisplayValue('Overview') as HTMLInputElement).value).toBe('Overview');
    expect((screen.getByDisplayValue('Details') as HTMLInputElement).value).toBe('Details');
  });

  it('updates a tab label', () => {
    const { onChange } = renderPanel(baseTabs);
    const input = screen.getByDisplayValue('Overview') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Summary' } });
    expect(onChange).toHaveBeenCalledWith({
      tabs: [
        { id: 'tab-1', label: 'Summary', blocks: [] },
        { id: 'tab-2', label: 'Details', blocks: [] },
      ],
    });
  });

  it('removes a tab when delete button clicked', () => {
    const { onChange } = renderPanel(baseTabs);
    const deleteBtns = screen.getAllByTitle('Remove tab');
    fireEvent.click(deleteBtns[0]);
    expect(onChange).toHaveBeenCalledWith({
      tabs: [{ id: 'tab-2', label: 'Details', blocks: [] }],
    });
  });

  it('adds a new tab when + Add Tab clicked', () => {
    const { onChange } = renderPanel(baseTabs);
    fireEvent.click(screen.getByText('+ Add Tab'));
    const calls = (onChange as any).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.tabs).toHaveLength(3);
    expect(lastCall.tabs[2]).toMatchObject({ label: 'New Tab', blocks: [] });
    expect(typeof lastCall.tabs[2].id).toBe('string');
  });

  it('adds first tab from empty state', () => {
    const { onChange } = renderPanel({ ...baseTabs, tabs: [] });
    fireEvent.click(screen.getByText('+ Add Tab'));
    const calls = (onChange as any).mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.tabs).toHaveLength(1);
    expect(lastCall.tabs[0]).toMatchObject({ label: 'New Tab', blocks: [] });
  });

  it('shows instruction text', () => {
    renderPanel(baseTabs);
    expect(screen.getByText(/Edit each tab/)).toBeTruthy();
  });
});
