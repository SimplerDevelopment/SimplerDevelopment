// Single source of truth for the "heavy / rarely-needed" block renderers,
// loaded via next/dynamic so they ship as separate chunks and only download
// when a page (or a nested container) actually renders one.
//
// Why this module exists: BlockRenderer AND every container block that renders
// arbitrary children (SectionBlockRender, ColumnsBlockRender, TabsBlockRender)
// each used to STATICALLY import the full block set — including the booking
// chain (which pulls in Stripe, ~740KB), the survey engine, the commerce
// blocks, and the HTML-templating machinery. That meant an ordinary marketing
// page with a `section`/`columns` block dragged the entire universe into its
// bundle even with zero booking/commerce/survey blocks present. Routing every
// dispatcher through these shared lazy components keeps that code OUT of the
// bundle until it's needed.
//
// ssr is left at its default (true) so a block that IS present still
// server-renders for first paint and SEO; only the client hydration chunk is
// code-split and demand-loaded.
import dynamic from 'next/dynamic';

export const HeroSlideshowBlockRender = dynamic(() =>
  import('./HeroSlideshowBlockRender').then((m) => m.HeroSlideshowBlockRender));
export const ProductGridBlockRender = dynamic(() =>
  import('./ProductGridBlockRender').then((m) => m.ProductGridBlockRender));
export const FeaturedProductsBlockRender = dynamic(() =>
  import('./FeaturedProductsBlockRender').then((m) => m.FeaturedProductsBlockRender));
export const ProductCategoriesBlockRender = dynamic(() =>
  import('./ProductCategoriesBlockRender').then((m) => m.ProductCategoriesBlockRender));
export const ShoppingCartBlockRender = dynamic(() =>
  import('./ShoppingCartBlockRender').then((m) => m.ShoppingCartBlockRender));
export const StoreBannerBlockRender = dynamic(() =>
  import('./StoreBannerBlockRender').then((m) => m.StoreBannerBlockRender));
export const ProductDetailBlockRender = dynamic(() =>
  import('./ProductDetailBlockRender').then((m) => m.ProductDetailBlockRender));
export const BookingBlockRender = dynamic(() =>
  import('./BookingBlockRender').then((m) => m.BookingBlockRender));
export const BookingMenuBlockRender = dynamic(() =>
  import('./BookingMenuBlockRender').then((m) => m.BookingMenuBlockRender));
export const SurveyBlockRender = dynamic(() =>
  import('./SurveyBlockRender').then((m) => m.SurveyBlockRender));
export const SurveyResultsBlockRender = dynamic(() =>
  import('./SurveyResultsBlockRender').then((m) => m.SurveyResultsBlockRender));
export const SurveyInputBlockRender = dynamic(() =>
  import('./SurveyInputBlockRender').then((m) => m.SurveyInputBlockRender));
// html-render / html-embed are deliberately STATIC (not dynamic): they are
// among the most common content blocks AND frequently the LCP element (heroes
// are often authored as html-render). Lazy-loading them deferred the LCP
// element's hydration and — because they're so common — pulled Turbopack's
// merged heavy-blocks async chunk onto nearly every page. Re-exporting them
// statically keeps them in the main bundle and out of the lazy chunk.
export { HtmlEmbedBlockRender } from './HtmlEmbedBlockRender';
export { HtmlRenderBlockRender } from './HtmlRenderBlockRender';
