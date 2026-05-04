'use client';

import { Block, TextBlock, HeadingBlock, ImageBlock, ButtonBlock, SpacerBlock, DividerBlock, QuoteBlock, CodeBlock, VideoBlock, YoutubeBlock, ColumnsBlock, HeroBlock, HeroSlideshowBlock, HeroSlideshowSlide, ServicesGridBlock, CtaBlock, TestimonialBlock, StatsBlock, BlogPostsBlock, CardGridBlock, FeaturedContentBlock, AccordionBlock, SectionBlock, GalleryBlock, ProductGridBlock, FeaturedProductsBlock, ProductCategoriesBlock, ShoppingCartBlock, StoreBannerBlock, ProductDetailBlock, BookingBlock, SurveyBlock, SurveyResultsBlock, SocialLinksBlock, LogoStripBlock, MetricCardsBlock, BookingMenuBlock, FlipCardGridBlock, TimelineBlock, TeamShowcaseBlock, TeamFlipGridBlock, BentoGridBlock, BentoCard, SiteFooterBlock, MarqueeBlock, MarqueeItem, TabsBlock, SurveyInputBlock, EmailHeaderBlock, EmailFooterBlock, HtmlEmbedBlock, HtmlRenderBlock } from '@/types/blocks';
import { PageSettingsPanel } from './PageSettingsPanel';
import { Breakpoint } from '@/types/responsive';
import { useState, useEffect, useRef } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { StyleSettings } from './StyleSettings';
import { FormPanel } from './block-settings/panels/FormPanel';
import { ContentPanel } from './block-settings/panels/ContentPanel';
import { LayoutPanel } from './block-settings/panels/LayoutPanel';
import { TokenColorPicker } from './TokenColorPicker';
import { RichTextEditable } from './RichTextEditable';

interface BlockSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>, options?: { batch?: boolean }) => void;
  currentViewport: Breakpoint;
}

type SettingsTab = 'general' | 'style' | 'elements';

const ELEMENT_DEFINITIONS: Record<string, { key: string; label: string }[]> = {
  'hero': [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'description', label: 'Description' },
    { key: 'cta', label: 'Primary Button' },
    { key: 'secondaryCta', label: 'Secondary Button' },
  ],
  'hero-slideshow': [
    { key: 'title', label: 'Slide Title' },
    { key: 'subtitle', label: 'Slide Subtitle' },
    { key: 'description', label: 'Slide Description' },
    { key: 'cta', label: 'Primary Button' },
    { key: 'secondaryCta', label: 'Secondary Button' },
    { key: 'statValue', label: 'Stat Value' },
    { key: 'statLabel', label: 'Stat Label' },
  ],
  'cta': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'primaryButton', label: 'Primary Button' },
    { key: 'secondaryButton', label: 'Secondary Button' },
  ],
  'card-grid': [
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
    { key: 'card', label: 'Card Container' },
    { key: 'cardTitle', label: 'Card Title' },
    { key: 'cardDescription', label: 'Card Description' },
    { key: 'cardIcon', label: 'Card Icon' },
    { key: 'cardLink', label: 'Card Link' },
    { key: 'cardImage', label: 'Card Image' },
  ],
  'stats': [
    { key: 'title', label: 'Section Title' },
    { key: 'statValue', label: 'Stat Value' },
    { key: 'statLabel', label: 'Stat Label' },
  ],
  'testimonial': [
    { key: 'quoteIcon', label: 'Decorative Quote Icon' },
    { key: 'quote', label: 'Quote Text' },
    { key: 'author', label: 'Author Name' },
  ],
  'services-grid': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
    { key: 'card', label: 'Service Card Container' },
    { key: 'serviceTitle', label: 'Service Title' },
    { key: 'serviceDescription', label: 'Service Description' },
    { key: 'serviceIcon', label: 'Service Icon' },
    { key: 'serviceLink', label: 'Service Link' },
    { key: 'serviceImage', label: 'Service Image' },
    { key: 'bullet', label: 'Bullet Item' },
  ],
  'featured-content': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'button', label: 'Button' },
    { key: 'statValue', label: 'Stat Value' },
    { key: 'statLabel', label: 'Stat Label' },
  ],
  'quote': [
    { key: 'quoteText', label: 'Quote Text' },
    { key: 'author', label: 'Author' },
  ],
  'blog-posts': [
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
    { key: 'postTitle', label: 'Post Title' },
    { key: 'postExcerpt', label: 'Post Excerpt' },
  ],
  'accordion': [
    { key: 'title', label: 'Section Title' },
    { key: 'itemTitle', label: 'Item Title' },
    { key: 'itemContent', label: 'Item Content' },
  ],
  'tabs': [
    { key: 'tab', label: 'Tab Button (default)' },
    { key: 'activeTab', label: 'Tab Button (active)' },
    { key: 'tabPanel', label: 'Tab Panel' },
  ],
  'gallery': [
    { key: 'caption', label: 'Image Caption' },
  ],
  'image': [
    { key: 'caption', label: 'Image Caption' },
  ],
  'store-banner': [
    { key: 'title', label: 'Title' },
    { key: 'subtitle', label: 'Subtitle' },
    { key: 'discountCode', label: 'Discount Code' },
    { key: 'button', label: 'Button' },
  ],
  'product-detail': [
    { key: 'breadcrumb', label: 'Breadcrumb' },
    { key: 'gallery', label: 'Image Gallery' },
    { key: 'badge', label: 'Sale Badge' },
    { key: 'productName', label: 'Product Name' },
    { key: 'price', label: 'Price' },
    { key: 'comparePrice', label: 'Compare Price' },
    { key: 'shortDescription', label: 'Short Description' },
    { key: 'optionLabel', label: 'Option Label' },
    { key: 'optionButton', label: 'Option Button' },
    { key: 'addToCartButton', label: 'Add to Cart Button' },
    { key: 'sku', label: 'SKU / Tags' },
    { key: 'sectionTitle', label: 'Description Heading' },
  ],
  'product-grid': [
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
  ],
  'featured-products': [
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
  ],
  'product-categories': [
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
  ],
  'booking': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'survey': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'survey-results': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
  ],
  'flip-card-grid': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
    { key: 'frontCard', label: 'Card Front' },
    { key: 'frontTitle', label: 'Front Title' },
    { key: 'frontSubtitle', label: 'Front Subtitle' },
    { key: 'frontIcon', label: 'Front Icon' },
    { key: 'backCard', label: 'Card Back' },
    { key: 'backText', label: 'Back Text' },
    { key: 'backLink', label: 'Back Link' },
  ],
  'metric-cards': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'description', label: 'Section Description' },
    { key: 'card', label: 'Card Container' },
    { key: 'value', label: 'Metric Value' },
    { key: 'label', label: 'Metric Label' },
    { key: 'institution', label: 'Institution' },
    { key: 'link', label: 'CTA Link' },
  ],
  'logo-strip': [
    { key: 'overline', label: 'Overline' },
    { key: 'logo', label: 'Logo Image' },
  ],
  'timeline': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'subtitle', label: 'Section Subtitle' },
    { key: 'stepTitle', label: 'Step Title' },
    { key: 'stepDescription', label: 'Step Description' },
  ],
  'team-showcase': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'subtitle', label: 'Section Subtitle' },
    { key: 'memberName', label: 'Member Name' },
    { key: 'memberTitle', label: 'Member Title' },
    { key: 'memberCredentials', label: 'Member Credentials' },
    { key: 'memberBio', label: 'Member Bio' },
    { key: 'specialtyTag', label: 'Specialty Tag' },
  ],
  'bento-grid': [
    { key: 'overline', label: 'Overline' },
    { key: 'title', label: 'Section Title' },
    { key: 'subtitle', label: 'Section Subtitle' },
    { key: 'cardTitle', label: 'Card Title (all variants)' },
    { key: 'cardTitleDark', label: 'Card Title (dark variant only)' },
    { key: 'cardTitleLight', label: 'Card Title (light variant only)' },
    { key: 'cardLead', label: 'Card Lead Text (all variants)' },
    { key: 'cardLeadDark', label: 'Card Lead (dark variant only)' },
    { key: 'cardLeadLight', label: 'Card Lead (light variant only)' },
  ],
  'team-flip-grid': [
    { key: 'memberName', label: 'Member Name' },
    { key: 'memberTitle', label: 'Member Title' },
    { key: 'memberBio', label: 'Member Bio' },
    { key: 'question', label: 'Back: Question' },
    { key: 'answer', label: 'Back: Answer' },
    { key: 'frontCard', label: 'Card Front' },
    { key: 'backCard', label: 'Card Back' },
  ],
  'site-footer': [
    { key: 'logo', label: 'Logo' },
    { key: 'tagline', label: 'Tagline' },
    { key: 'linkGroupLabel', label: 'Link Group Label' },
    { key: 'link', label: 'Footer Link' },
    { key: 'socialIcon', label: 'Social Link' },
    { key: 'contactLine', label: 'Contact Line' },
    { key: 'copyright', label: 'Copyright / Disclaimer' },
  ],
  'social-links': [
    { key: 'icon', label: 'Container' },
    { key: 'link', label: 'Link' },
  ],
  'booking-menu': [
    { key: 'title', label: 'Title' },
    { key: 'description', label: 'Description' },
    { key: 'card', label: 'Card Container' },
    { key: 'cardTitle', label: 'Card Title' },
    { key: 'cardDescription', label: 'Card Description' },
    { key: 'button', label: 'Card CTA / Arrow' },
  ],
};

export function BlockSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const hasElements = !!ELEMENT_DEFINITIONS[block.type]?.length;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'general'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          General
          {activeTab === 'general' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('style')}
          className={`px-4 py-2 text-sm font-medium transition-colors relative ${
            activeTab === 'style'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Style
          {activeTab === 'style' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        {hasElements && (
          <button
            type="button"
            onClick={() => setActiveTab('elements')}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              activeTab === 'elements'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Elements
            {activeTab === 'elements' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
            )}
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="pt-2">
        {activeTab === 'general' ? (
          <GeneralSettings block={block} onChange={onChange} currentViewport={currentViewport} />
        ) : activeTab === 'style' ? (
          <StyleSettings block={block} onChange={(updates) => onChange(updates, { batch: true })} currentViewport={currentViewport} />
        ) : activeTab === 'elements' ? (
          <ElementsPanel block={block} onChange={onChange} currentViewport={currentViewport} />
        ) : null}
      </div>
    </div>
  );
}

function ElementStyleSettings({ block, onChange, currentViewport, elementKey }: BlockSettingsProps & { elementKey: string }) {
  const elementBlock = {
    ...block,
    style: (block.elementStyles?.[elementKey] || {}) as Block['style'],
  };

  const handleElementChange = (updates: Partial<Block>) => {
    if (updates.style) {
      onChange({
        elementStyles: {
          ...(block.elementStyles || {}),
          [elementKey]: {
            ...(block.elementStyles?.[elementKey] || {}),
            ...updates.style,
          },
        },
      } as Partial<Block>, { batch: true });
    }
  };

  return <StyleSettings block={elementBlock} onChange={handleElementChange} currentViewport={currentViewport} />;
}

function ElementsPanel({ block, onChange, currentViewport }: BlockSettingsProps) {
  const elements = ELEMENT_DEFINITIONS[block.type];
  const [selectedElement, setSelectedElement] = useState(elements?.[0]?.key || '');

  if (!elements || elements.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Element</label>
        <select
          value={selectedElement}
          onChange={(e) => setSelectedElement(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
        >
          {elements.map(el => (
            <option key={el.key} value={el.key}>{el.label}</option>
          ))}
        </select>
      </div>

      {selectedElement && (
        <ElementStyleSettings
          block={block}
          onChange={onChange}
          currentViewport={currentViewport}
          elementKey={selectedElement}
        />
      )}
    </div>
  );
}

function GeneralSettings({ block, onChange, currentViewport }: BlockSettingsProps) {
  return (
    <div className="space-y-4">
      {/* Block-specific settings */}
      <div>
        {(() => {
          switch (block.type) {
            case 'text':
              return <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'heading':
              return <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'image':
              return <ImageBlockSettings block={block as ImageBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'button':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'spacer':
              return <LayoutPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'divider':
              return <LayoutPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'quote':
              return <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'code':
              return <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'video':
              return <VideoBlockSettings block={block as VideoBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'youtube':
              return <YoutubeBlockSettings block={block as YoutubeBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'columns':
              return <LayoutPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'hero':
              return <HeroBlockSettings block={block as HeroBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'hero-slideshow':
              return <HeroSlideshowBlockSettings block={block as HeroSlideshowBlock} onChange={onChange} />;
            case 'services-grid':
              return <ServicesGridBlockSettings block={block as ServicesGridBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'cta':
              return <CtaBlockSettings block={block as CtaBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'testimonial':
              return <TestimonialBlockSettings block={block as TestimonialBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'stats':
              return <StatsBlockSettings block={block as StatsBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'blog-posts':
              return <BlogPostsBlockSettings block={block as BlogPostsBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'card-grid':
              return <CardGridBlockSettings block={block as CardGridBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'featured-content':
              return <FeaturedContentBlockSettings block={block as FeaturedContentBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'accordion':
              return <AccordionBlockSettings block={block as AccordionBlock} onChange={onChange} currentViewport={currentViewport} />;
            case 'section':
              return <LayoutPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'gallery':
              return <GalleryBlockSettings block={block as GalleryBlock} onChange={onChange} />;
            case 'product-grid':
              return <ProductGridBlockSettings block={block as ProductGridBlock} onChange={onChange} />;
            case 'featured-products':
              return <FeaturedProductsBlockSettings block={block as FeaturedProductsBlock} onChange={onChange} />;
            case 'product-categories':
              return <ProductCategoriesBlockSettings block={block as ProductCategoriesBlock} onChange={onChange} />;
            case 'shopping-cart':
              return <ShoppingCartBlockSettings block={block as ShoppingCartBlock} onChange={onChange} />;
            case 'store-banner':
              return <StoreBannerBlockSettings block={block as StoreBannerBlock} onChange={onChange} />;
            case 'product-detail':
              return <ProductDetailBlockSettings block={block as ProductDetailBlock} onChange={onChange} />;
            case 'booking':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'survey':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'survey-results':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'social-links':
              return <SocialLinksBlockSettings block={block as SocialLinksBlock} onChange={onChange} />;
            case 'logo-strip':
              return <LogoStripBlockSettings block={block as LogoStripBlock} onChange={onChange} />;
            case 'metric-cards':
              return <MetricCardsBlockSettings block={block as MetricCardsBlock} onChange={onChange} />;
            case 'booking-menu':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'flip-card-grid':
              return <FlipCardGridBlockSettings block={block as FlipCardGridBlock} onChange={onChange} />;
            case 'timeline':
              return <TimelineBlockSettings block={block as TimelineBlock} onChange={onChange} />;
            case 'team-showcase':
              return <TeamShowcaseBlockSettings block={block as TeamShowcaseBlock} onChange={onChange} />;
            case 'team-flip-grid':
              return <TeamFlipGridBlockSettings block={block as TeamFlipGridBlock} onChange={onChange} />;
            case 'bento-grid':
              return <BentoGridBlockSettings block={block as BentoGridBlock} onChange={onChange} />;
            case 'site-footer':
              return <SiteFooterBlockSettings block={block as SiteFooterBlock} onChange={onChange} />;
            case 'marquee':
              return <MarqueeBlockSettings block={block as MarqueeBlock} onChange={onChange} />;
            case 'tabs':
              return <TabsBlockSettings block={block as TabsBlock} onChange={onChange} />;
            case 'survey-input':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'email-header':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'email-footer':
              return <FormPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            case 'html-embed':
              return <HtmlEmbedBlockSettings block={block as HtmlEmbedBlock} onChange={onChange} />;
            case 'html-render':
              return <ContentPanel block={block} onChange={onChange} currentViewport={currentViewport} />;
            default:
              return <div className="text-sm text-muted-foreground">No settings available for this block.</div>;
          }
        })()}
      </div>
    </div>
  );
}

function ImageBlockSettings({ block, onChange, currentViewport }: { block: ImageBlock; onChange: (updates: Partial<ImageBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Image</label>
        {block.url ? (
          <div className="space-y-2">
            <img
              src={block.url}
              alt={block.alt}
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ url: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
            <p className="text-sm text-muted-foreground">Click to select image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alt Text</label>
        <input
          type="text"
          value={block.alt}
          onChange={(e) => onChange({ alt: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Describe the image..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Image caption..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Width</label>
        <select
          value={block.width || 'full'}
          onChange={(e) => onChange({ width: e.target.value as ImageBlock['width'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="full">Full Width</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <select
          value={block.alignment || 'center'}
          onChange={(e) => onChange({ alignment: e.target.value as ImageBlock['alignment'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>


      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.url}
              onChange={(url) => {
                onChange({ url });
                setShowMediaPicker(false);
              }}
              label="Select Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VideoBlockSettings({ block, onChange, currentViewport }: { block: VideoBlock; onChange: (updates: Partial<VideoBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Video File</label>
        {block.url ? (
          <div className="space-y-2">
            <div className="w-full aspect-video bg-black rounded border border-border overflow-hidden">
              <video
                src={block.url}
                controls
                className="w-full h-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Video
              </button>
              <button
                type="button"
                onClick={() => onChange({ url: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">movie</span>
            <p className="text-sm text-muted-foreground">Click to select video file</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Video caption..."
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="autoplay"
          checked={block.autoplay || false}
          onChange={(e) => onChange({ autoplay: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="autoplay" className="ml-2 text-sm text-foreground">
          Autoplay
        </label>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="controls"
          checked={block.controls !== false}
          onChange={(e) => onChange({ controls: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="controls" className="ml-2 text-sm text-foreground">
          Show Controls
        </label>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.url}
              onChange={(url) => {
                onChange({ url });
                setShowMediaPicker(false);
              }}
              label="Select Video"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function YoutubeBlockSettings({ block, onChange, currentViewport }: { block: YoutubeBlock; onChange: (updates: Partial<YoutubeBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">YouTube URL</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="https://www.youtube.com/watch?v=..."
        />
        <p className="text-xs text-muted-foreground mt-1">Paste a YouTube video URL or video ID</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Video caption..."
        />
      </div>
    </div>
  );
}

function HeroBlockSettings({ block, onChange, currentViewport }: { block: HeroBlock; onChange: (updates: Partial<HeroBlock>) => void; currentViewport: Breakpoint }) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);

  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';

  return (
    <div className="space-y-4">
      {/* Content Fields */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Hero Title" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Optional subtitle" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Optional description" className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">CTA Text</label>
          <input type="text" value={block.ctaText || ''} onChange={(e) => onChange({ ctaText: e.target.value })} className={inputClass} placeholder="Button text" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">CTA Link</label>
          <input type="text" value={block.ctaLink || ''} onChange={(e) => onChange({ ctaLink: e.target.value })} className={inputClass} placeholder="https://..." />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Secondary CTA Text</label>
          <input type="text" value={block.secondaryCtaText || ''} onChange={(e) => onChange({ secondaryCtaText: e.target.value })} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Secondary CTA Link</label>
          <input type="text" value={block.secondaryCtaLink || ''} onChange={(e) => onChange({ secondaryCtaLink: e.target.value })} className={inputClass} placeholder="Optional" />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Background Image (optional)</label>
        {block.backgroundImage ? (
          <div className="space-y-2">
            <img
              src={block.backgroundImage}
              alt="Background"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowImagePicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ backgroundImage: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowImagePicker(true)}
            className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
            <p className="text-sm text-muted-foreground">Click to select background image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Video (optional)</label>
        {block.backgroundVideo ? (
          <div className="space-y-2">
            <div className="w-full aspect-video bg-black rounded border border-border overflow-hidden">
              <video
                src={block.backgroundVideo}
                controls
                className="w-full h-full"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowVideoPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Video
              </button>
              <button
                type="button"
                onClick={() => onChange({ backgroundVideo: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowVideoPicker(true)}
            className="w-full p-6 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">movie</span>
            <p className="text-sm text-muted-foreground">Click to select background video</p>
          </button>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Primary CTA</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.ctaText || ''}
            onChange={(e) => onChange({ ctaText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Get Started"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.ctaLink || ''}
            onChange={(e) => onChange({ ctaLink: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/contact"
          />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Secondary CTA (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.secondaryCtaText || ''}
            onChange={(e) => onChange({ secondaryCtaText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Learn More"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.secondaryCtaLink || ''}
            onChange={(e) => onChange({ secondaryCtaLink: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/about"
          />
        </div>
      </div>

      {showImagePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowImagePicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.backgroundImage || ''}
              onChange={(url) => {
                onChange({ backgroundImage: url });
                setShowImagePicker(false);
              }}
              label="Select Background Image"
            />
          </div>
        </div>
      )}

      {showVideoPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowVideoPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.backgroundVideo || ''}
              onChange={(url) => {
                onChange({ backgroundVideo: url });
                setShowVideoPicker(false);
              }}
              label="Select Background Video"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CtaBlockSettings({ block, onChange, currentViewport }: { block: CtaBlock; onChange: (updates: Partial<CtaBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="CTA Title" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Optional description" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Style</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as CtaBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="none">None</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Primary Button</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.primaryButtonText}
            onChange={(e) => onChange({ primaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.primaryButtonUrl}
            onChange={(e) => onChange({ primaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Secondary Button (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.secondaryButtonText || ''}
            onChange={(e) => onChange({ secondaryButtonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.secondaryButtonUrl || ''}
            onChange={(e) => onChange({ secondaryButtonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Optional"
          />
        </div>
      </div>
    </div>
  );
}

function ServicesGridBlockSettings({ block, onChange, currentViewport }: { block: ServicesGridBlock; onChange: (updates: Partial<ServicesGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.overline || ''} onChange={(html) => onChange({ overline: html || undefined })} singleLine placeholder="OUR SERVICES" className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ServicesGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
      </div>
      <div>
        <TokenColorPicker
          label="Accent Color"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v || undefined })}
          placeholder="Brand primary"
        />
        <p className="text-xs text-muted-foreground mt-1">Used for icons, bullets, and the link arrow.</p>
      </div>
    </div>
  );
}

function StatsBlockSettings({ block, onChange, currentViewport }: { block: StatsBlock; onChange: (updates: Partial<StatsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as StatsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
      </div>
    </div>
  );
}

function CardGridBlockSettings({ block, onChange, currentViewport }: { block: CardGridBlock; onChange: (updates: Partial<CardGridBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as CardGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>
      </div>
    </div>
  );
}

function TestimonialBlockSettings({ block, onChange, currentViewport }: { block: TestimonialBlock; onChange: (updates: Partial<TestimonialBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Quote</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.quote} onChange={(html) => onChange({ quote: html })} placeholder="Enter testimonial quote..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Author Name</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.author} onChange={(html) => onChange({ author: html })} singleLine placeholder="Author name..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Role</label>
        <input
          type="text"
          value={block.role || ''}
          onChange={(e) => onChange({ role: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Role..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Company</label>
        <input
          type="text"
          value={block.company || ''}
          onChange={(e) => onChange({ company: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Company..."
        />
      </div>

      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Avatar (optional)</label>
        {block.avatar ? (
          <div className="space-y-2">
            <img
              src={block.avatar}
              alt="Avatar"
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Avatar
              </button>
              <button
                type="button"
                onClick={() => onChange({ avatar: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">person</span>
            <p className="text-sm text-muted-foreground">Click to select avatar</p>
          </button>
        )}
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.avatar || ''}
              onChange={(url) => {
                onChange({ avatar: url });
                setShowMediaPicker(false);
              }}
              label="Select Avatar"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function BlogPostsBlockSettings({ block, onChange, currentViewport }: { block: BlogPostsBlock; onChange: (updates: Partial<BlogPostsBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Section description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Post Type</label>
        <input
          type="text"
          value={block.postType || ''}
          onChange={(e) => onChange({ postType: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Leave empty for all posts"
        />
        <p className="text-xs text-muted-foreground mt-1">Filter by post type (optional). Set to <span className="font-mono">category</span> to enable category filtering below.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Category Slug</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value || undefined })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. company-news"
        />
        <p className="text-xs text-muted-foreground mt-1">Active when Post Type is <span className="font-mono">category</span>.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Posts</label>
        <input
          type="number"
          value={block.limit || 3}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as BlogPostsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
        </select>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="showExcerpt"
          checked={block.showExcerpt !== false}
          onChange={(e) => onChange({ showExcerpt: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <label htmlFor="showExcerpt" className="ml-2 text-sm text-foreground">
          Show Excerpt
        </label>
      </div>
    </div>
  );
}

function FeaturedContentBlockSettings({ block, onChange, currentViewport }: { block: FeaturedContentBlock; onChange: (updates: Partial<FeaturedContentBlock>) => void; currentViewport: Breakpoint }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[60px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Button text..."
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Button URL</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/url..."
        />
      </div>
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-2">Featured Image</label>
        {block.imageUrl ? (
          <div className="space-y-2">
            <img
              src={block.imageUrl}
              alt="Featured"
              className="w-full h-32 object-cover rounded border border-border"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPicker(true)}
                className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
              >
                Change Image
              </button>
              <button
                type="button"
                onClick={() => onChange({ imageUrl: '' })}
                className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowMediaPicker(true)}
            className="w-full p-8 border-2 border-dashed border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors text-center"
          >
            <span className="material-icons text-5xl text-muted-foreground/20 mb-2">image</span>
            <p className="text-sm text-muted-foreground">Click to select image</p>
          </button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Image Position</label>
        <select
          value={block.imagePosition || 'right'}
          onChange={(e) => onChange({ imagePosition: e.target.value as FeaturedContentBlock['imagePosition'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </div>

      <div className="space-y-3 pt-3 border-t border-border">
        <h4 className="text-sm font-semibold text-foreground">Call to Action (optional)</h4>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
          <input
            type="text"
            value={block.buttonText || ''}
            onChange={(e) => onChange({ buttonText: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="Learn More"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
          <input
            type="text"
            value={block.buttonUrl || ''}
            onChange={(e) => onChange({ buttonUrl: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            placeholder="/learn-more"
          />
        </div>
      </div>

      {showMediaPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
          <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <MediaPicker
              value={block.imageUrl || ''}
              onChange={(url) => {
                onChange({ imageUrl: url });
                setShowMediaPicker(false);
              }}
              label="Select Featured Image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionBlockSettings({ block, onChange, currentViewport }: { block: AccordionBlock; onChange: (updates: Partial<AccordionBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Frequently Asked Questions" className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">Use the controls in the editor to add, remove, or edit accordion items.</p>
      </div>
    </div>
  );
}

function GalleryBlockSettings({ block, onChange }: { block: GalleryBlock; onChange: (updates: Partial<GalleryBlock>) => void }) {
  const addImage = () => {
    const newImage = { id: crypto.randomUUID(), url: '', alt: '', caption: '' };
    onChange({ images: [...block.images, newImage] });
  };

  const updateImage = (index: number, updates: Partial<GalleryBlock['images'][0]>) => {
    const images = [...block.images];
    images[index] = { ...images[index], ...updates };
    onChange({ images });
  };

  const removeImage = (index: number) => {
    onChange({ images: block.images.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'grid'}
          onChange={(e) => onChange({ layout: e.target.value as GalleryBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="grid">Grid</option>
          <option value="masonry">Masonry</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: Number(e.target.value) as GalleryBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Gap</label>
        <select
          value={block.gap || 'md'}
          onChange={(e) => onChange({ gap: e.target.value as GalleryBlock['gap'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="gallery-lightbox"
          checked={block.lightbox !== false}
          onChange={(e) => onChange({ lightbox: e.target.checked })}
          className="rounded border-border"
        />
        <label htmlFor="gallery-lightbox" className="text-sm text-foreground">Enable lightbox</label>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">Images ({block.images.length})</label>
          <button type="button" onClick={addImage} className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90">Add Image</button>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {block.images.map((image, index) => (
            <div key={image.id} className="p-3 border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Image {index + 1}</span>
                <button type="button" onClick={() => removeImage(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <input
                type="text"
                value={image.url}
                onChange={(e) => updateImage(index, { url: e.target.value })}
                placeholder="Image URL"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
              <input
                type="text"
                value={image.alt}
                onChange={(e) => updateImage(index, { alt: e.target.value })}
                placeholder="Alt text"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
              <input
                type="text"
                value={image.caption || ''}
                onChange={(e) => updateImage(index, { caption: e.target.value })}
                placeholder="Caption (optional)"
                className="w-full text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// eCommerce Block Settings
// ============================================================================

function ProductGridBlockSettings({ block, onChange }: { block: ProductGridBlock; onChange: (updates: Partial<ProductGridBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Category Filter</label>
        <input
          type="text"
          value={block.categorySlug || ''}
          onChange={(e) => onChange({ categorySlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Leave empty for all products"
        />
        <p className="text-xs text-muted-foreground mt-1">Category slug to filter by</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Sort By</label>
        <select
          value={block.sort || 'newest'}
          onChange={(e) => onChange({ sort: e.target.value as ProductGridBlock['sort'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="featured">Featured</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Products</label>
        <input
          type="number"
          value={block.limit || 6}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="24"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 3}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductGridBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. Add to Cart"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pgShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowPrice" className="ml-2 text-sm text-foreground">Show Price</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowDesc" checked={block.showDescription === true} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowDesc" className="ml-2 text-sm text-foreground">Show Description</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pgShowCat" checked={block.showCategory === true} onChange={(e) => onChange({ showCategory: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pgShowCat" className="ml-2 text-sm text-foreground">Show Category</label>
        </div>
      </div>
    </div>
  );
}

function FeaturedProductsBlockSettings({ block, onChange }: { block: FeaturedProductsBlock; onChange: (updates: Partial<FeaturedProductsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Number of Products</label>
        <input
          type="number"
          value={block.limit || 4}
          onChange={(e) => onChange({ limit: parseInt(e.target.value) })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          min="1"
          max="12"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: parseInt(e.target.value) as FeaturedProductsBlock['columns'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="2">2 Columns</option>
          <option value="3">3 Columns</option>
          <option value="4">4 Columns</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Badge Text</label>
        <input
          type="text"
          value={block.badgeText || ''}
          onChange={(e) => onChange({ badgeText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Featured"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. Shop Now"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="fpShowPrice" checked={block.showPrice !== false} onChange={(e) => onChange({ showPrice: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowPrice" className="ml-2 text-sm text-foreground">Show Price</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="fpShowBadge" checked={block.showBadge !== false} onChange={(e) => onChange({ showBadge: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="fpShowBadge" className="ml-2 text-sm text-foreground">Show Badge</label>
        </div>
      </div>
    </div>
  );
}

function ProductCategoriesBlockSettings({ block, onChange }: { block: ProductCategoriesBlock; onChange: (updates: Partial<ProductCategoriesBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Optional section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Optional description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'grid'}
          onChange={(e) => onChange({ layout: e.target.value as ProductCategoriesBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="grid">Grid</option>
          <option value="list">List</option>
        </select>
      </div>

      {block.layout !== 'list' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: parseInt(e.target.value) as ProductCategoriesBlock['columns'] })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="2">2 Columns</option>
            <option value="3">3 Columns</option>
            <option value="4">4 Columns</option>
          </select>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pcShowCount" checked={block.showProductCount !== false} onChange={(e) => onChange({ showProductCount: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowCount" className="ml-2 text-sm text-foreground">Show Product Count</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pcShowImage" checked={block.showImage !== false} onChange={(e) => onChange({ showImage: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pcShowImage" className="ml-2 text-sm text-foreground">Show Image</label>
        </div>
      </div>
    </div>
  );
}

function ShoppingCartBlockSettings({ block, onChange }: { block: ShoppingCartBlock; onChange: (updates: Partial<ShoppingCartBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Cart Style</label>
        <select
          value={block.variant || 'full'}
          onChange={(e) => onChange({ variant: e.target.value as ShoppingCartBlock['variant'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Full Cart</option>
          <option value="mini">Mini Cart</option>
          <option value="icon-only">Icon Only</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Checkout Button Text</label>
        <input
          type="text"
          value={block.checkoutButtonText || ''}
          onChange={(e) => onChange({ checkoutButtonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Proceed to Checkout"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Empty Cart Message</label>
        <input
          type="text"
          value={block.emptyCartMessage || ''}
          onChange={(e) => onChange({ emptyCartMessage: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Your cart is empty"
        />
      </div>

      <div className="flex items-center">
        <input type="checkbox" id="scShowSubtotal" checked={block.showSubtotal !== false} onChange={(e) => onChange({ showSubtotal: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="scShowSubtotal" className="ml-2 text-sm text-foreground">Show Subtotal</label>
      </div>
    </div>
  );
}

function StoreBannerBlockSettings({ block, onChange }: { block: StoreBannerBlock; onChange: (updates: Partial<StoreBannerBlock>) => void }) {
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title} onChange={(html) => onChange({ title: html })} singleLine placeholder="Banner title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Discount Code</label>
          <input
            type="text"
            value={block.discountCode || ''}
            onChange={(e) => onChange({ discountCode: e.target.value })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
            placeholder="e.g. SAVE20"
          />
        </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button Text</label>
        <input
          type="text"
          value={block.buttonText || ''}
          onChange={(e) => onChange({ buttonText: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Shop Now"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Button URL</label>
        <input
          type="text"
          value={block.buttonUrl || ''}
          onChange={(e) => onChange({ buttonUrl: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="/shop"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Background Style</label>
        <select
          value={block.backgroundStyle || 'gradient'}
          onChange={(e) => onChange({ backgroundStyle: e.target.value as StoreBannerBlock['backgroundStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
          <option value="image">Image</option>
        </select>
      </div>

      <div>
        <TokenColorPicker
          label="Accent Color"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v })}
          placeholder="#6366f1"
        />
      </div>

      {block.backgroundStyle === 'image' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Background Image</label>
          {block.backgroundImage ? (
            <div className="space-y-2">
              <img src={block.backgroundImage} alt="Banner background" className="w-full h-24 object-cover rounded border border-border" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowMediaPicker(true)} className="flex-1 px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90">Change</button>
                <button type="button" onClick={() => onChange({ backgroundImage: '' })} className="px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">Remove</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setShowMediaPicker(true)} className="w-full px-3 py-2 text-sm bg-background border border-border text-foreground rounded hover:bg-accent">
              Choose Image
            </button>
          )}
          {showMediaPicker && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]" onClick={() => setShowMediaPicker(false)}>
              <div className="bg-white dark:bg-gray-900 border border-border rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <MediaPicker
                  value={block.backgroundImage || ''}
                  onChange={(url) => {
                    onChange({ backgroundImage: url });
                    setShowMediaPicker(false);
                  }}
                  label="Select Banner Image"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Countdown End Date</label>
        <input
          type="datetime-local"
          value={block.countdownDate || ''}
          onChange={(e) => onChange({ countdownDate: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        />
        <p className="text-xs text-muted-foreground mt-1">Optional: Shows a live countdown timer</p>
      </div>
      </div>
    </div>
  );
}

function ProductDetailBlockSettings({ block, onChange }: { block: ProductDetailBlock; onChange: (updates: Partial<ProductDetailBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Product Slug</label>
        <input
          type="text"
          value={block.productSlug || ''}
          onChange={(e) => onChange({ productSlug: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. dinner-at-the-club"
        />
        <p className="text-xs text-muted-foreground mt-1">The URL slug of the product to display</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'standard'}
          onChange={(e) => onChange({ layout: e.target.value as ProductDetailBlock['layout'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="standard">Standard (2 column)</option>
          <option value="compact">Compact (image small)</option>
          <option value="wide">Wide (stacked)</option>
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <input type="checkbox" id="pdShowGallery" checked={block.showGallery !== false} onChange={(e) => onChange({ showGallery: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowGallery" className="ml-2 text-sm text-foreground">Show Image Gallery</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowDescription" checked={block.showDescription !== false} onChange={(e) => onChange({ showDescription: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowDescription" className="ml-2 text-sm text-foreground">Show Full Description</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowVariants" checked={block.showVariants !== false} onChange={(e) => onChange({ showVariants: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowVariants" className="ml-2 text-sm text-foreground">Show Variant Options</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowAddToCart" checked={block.showAddToCart !== false} onChange={(e) => onChange({ showAddToCart: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowAddToCart" className="ml-2 text-sm text-foreground">Show Add to Cart</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBulkPricing" checked={block.showBulkPricing !== false} onChange={(e) => onChange({ showBulkPricing: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBulkPricing" className="ml-2 text-sm text-foreground">Show Bulk Pricing</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowBreadcrumb" checked={block.showBreadcrumb !== false} onChange={(e) => onChange({ showBreadcrumb: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowBreadcrumb" className="ml-2 text-sm text-foreground">Show Breadcrumb</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="pdShowTags" checked={block.showTags !== false} onChange={(e) => onChange({ showTags: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="pdShowTags" className="ml-2 text-sm text-foreground">Show Tags & SKU</label>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Slideshow Settings ──────────────────────────────────────────────

function HeroSlideshowBlockSettings({ block, onChange }: { block: HeroSlideshowBlock; onChange: (updates: Partial<HeroSlideshowBlock>) => void }) {
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = block.slides || [];
  const slide = slides[activeSlide];
  const [showImagePicker, setShowImagePicker] = useState(false);

  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const selectClass = inputClass;

  function updateSlide(index: number, updates: Partial<HeroSlideshowSlide>) {
    const newSlides = slides.map((s, i) => i === index ? { ...s, ...updates } : s);
    onChange({ slides: newSlides });
  }

  function addSlide() {
    const newSlide: HeroSlideshowSlide = {
      id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: 'New Slide',
      textAlignment: 'center',
    };
    onChange({ slides: [...slides, newSlide] });
    setActiveSlide(slides.length);
  }

  function removeSlide(index: number) {
    if (slides.length <= 1) return;
    const newSlides = slides.filter((_, i) => i !== index);
    onChange({ slides: newSlides });
    if (activeSlide >= newSlides.length) setActiveSlide(newSlides.length - 1);
  }

  function moveSlide(from: number, direction: -1 | 1) {
    const to = from + direction;
    if (to < 0 || to >= slides.length) return;
    const newSlides = [...slides];
    [newSlides[from], newSlides[to]] = [newSlides[to], newSlides[from]];
    onChange({ slides: newSlides });
    setActiveSlide(to);
  }

  return (
    <div className="space-y-4">
      {/* Slide tabs */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Slides</label>
        <div className="flex flex-wrap gap-1 mb-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSlide(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                i === activeSlide ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {i + 1}
            </button>
          ))}
          <button onClick={addSlide} className="px-3 py-1.5 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:text-foreground">
            +
          </button>
        </div>
        {slides.length > 1 && (
          <div className="flex gap-1 mb-2">
            <button onClick={() => moveSlide(activeSlide, -1)} disabled={activeSlide === 0} className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30">
              <span className="material-icons text-xs">arrow_back</span>
            </button>
            <button onClick={() => moveSlide(activeSlide, 1)} disabled={activeSlide === slides.length - 1} className="px-2 py-1 text-xs rounded border border-border disabled:opacity-30">
              <span className="material-icons text-xs">arrow_forward</span>
            </button>
            <button onClick={() => removeSlide(activeSlide)} className="px-2 py-1 text-xs rounded border border-border text-destructive hover:bg-destructive/10 ml-auto">
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* Active slide content */}
      {slide && (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Title</label>
            <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
              <RichTextEditable html={slide.title} onChange={(html) => updateSlide(activeSlide, { title: html })} singleLine placeholder="Slide Title" className="text-sm text-foreground" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
            <input type="text" value={slide.subtitle || ''} onChange={(e) => updateSlide(activeSlide, { subtitle: e.target.value })} className={inputClass} placeholder="Optional subtitle" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Description</label>
            <textarea value={slide.description || ''} onChange={(e) => updateSlide(activeSlide, { description: e.target.value })} className={`${inputClass} min-h-[60px] resize-y`} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">CTA Text</label>
              <input type="text" value={slide.ctaText || ''} onChange={(e) => updateSlide(activeSlide, { ctaText: e.target.value })} className={inputClass} placeholder="Button text" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">CTA Link</label>
              <input type="text" value={slide.ctaLink || ''} onChange={(e) => updateSlide(activeSlide, { ctaLink: e.target.value })} className={inputClass} placeholder="/page" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Secondary Text</label>
              <input type="text" value={slide.secondaryCtaText || ''} onChange={(e) => updateSlide(activeSlide, { secondaryCtaText: e.target.value })} className={inputClass} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Secondary Link</label>
              <input type="text" value={slide.secondaryCtaLink || ''} onChange={(e) => updateSlide(activeSlide, { secondaryCtaLink: e.target.value })} className={inputClass} placeholder="Optional" />
            </div>
          </div>

          {/* Background */}
          <div className="border-t border-border pt-3">
            <label className="block text-sm font-medium text-foreground mb-2">Background Image</label>
            {slide.backgroundImage ? (
              <div className="space-y-2">
                <img src={slide.backgroundImage} alt="Slide background" className="w-full h-24 object-cover rounded border border-border" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowImagePicker(true)} className="flex-1 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90">Change</button>
                  <button type="button" onClick={() => updateSlide(activeSlide, { backgroundImage: '' })} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-accent">Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setShowImagePicker(true)} className="w-full px-3 py-6 text-sm border border-dashed border-border rounded-lg text-muted-foreground hover:bg-accent/50 transition-colors">
                Choose Image
              </button>
            )}
            {showImagePicker && (
              <div className="mt-2">
                <MediaPicker value={slide.backgroundImage || ''} onChange={(url) => { updateSlide(activeSlide, { backgroundImage: url }); setShowImagePicker(false); }} label="Slide Background" mimeTypeFilter="image" />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Background Video URL</label>
            <input type="text" value={slide.backgroundVideo || ''} onChange={(e) => updateSlide(activeSlide, { backgroundVideo: e.target.value })} className={inputClass} placeholder="https://...mp4 (optional)" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <TokenColorPicker
                label="Overlay Color"
                value={slide.overlayColor || ''}
                onChange={(v) => updateSlide(activeSlide, { overlayColor: v })}
                placeholder="rgba(0,0,0,0.45)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Text Alignment</label>
              <select value={slide.textAlignment || 'center'} onChange={(e) => updateSlide(activeSlide, { textAlignment: e.target.value as 'left' | 'center' | 'right' })} className={selectClass}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>

          {/* Per-slide Advanced */}
          <details className="border border-border rounded">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
              Advanced (background sizing & overlay opacity)
            </summary>
            <div className="px-3 pb-3 pt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Background Size</label>
                  <select
                    value={slide.backgroundSize || 'cover'}
                    onChange={(e) => updateSlide(activeSlide, { backgroundSize: e.target.value as HeroSlideshowSlide['backgroundSize'] })}
                    className={selectClass}
                  >
                    <option value="cover">cover</option>
                    <option value="contain">contain</option>
                    <option value="auto">auto</option>
                    <option value="50%">50%</option>
                    <option value="100%">100%</option>
                    <option value="150%">150%</option>
                    <option value="200%">200%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Background Repeat</label>
                  <select
                    value={slide.backgroundRepeat || 'no-repeat'}
                    onChange={(e) => updateSlide(activeSlide, { backgroundRepeat: e.target.value as HeroSlideshowSlide['backgroundRepeat'] })}
                    className={selectClass}
                  >
                    <option value="no-repeat">no-repeat</option>
                    <option value="repeat">repeat</option>
                    <option value="repeat-x">repeat-x</option>
                    <option value="repeat-y">repeat-y</option>
                    <option value="space">space</option>
                    <option value="round">round</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Background Position</label>
                <input
                  type="text"
                  value={slide.backgroundPosition || ''}
                  onChange={(e) => updateSlide(activeSlide, { backgroundPosition: e.target.value || undefined })}
                  className={inputClass}
                  placeholder='e.g. "center", "top", "50% 30%"'
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Overlay Opacity</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={slide.overlayOpacity ?? 0.45}
                  onChange={(e) => updateSlide(activeSlide, { overlayOpacity: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground">{slide.overlayOpacity ?? 0.45}</span>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Persistent background video */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Background Video</label>
        <p className="text-xs text-muted-foreground">Plays continuously behind all slides. Not per-slide.</p>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Video URL</label>
          <input type="text" value={block.backgroundVideo || ''} onChange={(e) => onChange({ backgroundVideo: e.target.value || undefined })} className={inputClass} placeholder="https://...mp4 (optional)" />
        </div>
        {block.backgroundVideo && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Video Opacity</label>
            <input type="range" min="0" max="1" step="0.05" value={block.backgroundVideoOpacity ?? 1} onChange={(e) => onChange({ backgroundVideoOpacity: parseFloat(e.target.value) })} className="w-full" />
            <span className="text-xs text-muted-foreground">{block.backgroundVideoOpacity ?? 1}</span>
          </div>
        )}
      </div>

      {/* Slideshow settings */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Slideshow Settings</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Transition</label>
            <select value={block.transition || 'fade'} onChange={(e) => onChange({ transition: e.target.value as 'fade' | 'slide' | 'zoom' })} className={selectClass}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="zoom">Zoom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Height</label>
            <input type="text" value={block.height || '90vh'} onChange={(e) => onChange({ height: e.target.value })} className={inputClass} placeholder="90vh" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Interval (ms)</label>
            <input type="number" value={block.interval || 6000} onChange={(e) => onChange({ interval: parseInt(e.target.value) || 6000 })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Transition (ms)</label>
            <input type="number" value={block.transitionDuration || 800} onChange={(e) => onChange({ transitionDuration: parseInt(e.target.value) || 800 })} className={inputClass} />
          </div>
        </div>
        <div className="space-y-2">
          {[
            { key: 'autoplay', label: 'Autoplay', defaultVal: true },
            { key: 'showDots', label: 'Show Dots', defaultVal: true },
            { key: 'showArrows', label: 'Show Arrows', defaultVal: true },
            { key: 'pauseOnHover', label: 'Pause on Hover', defaultVal: true },
            { key: 'kenBurns', label: 'Ken Burns Effect', defaultVal: true },
          ].map(({ key, label, defaultVal }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={(block as unknown as Record<string, unknown>)[key] as boolean ?? defaultVal}
                onChange={(e) => onChange({ [key]: e.target.checked } as Partial<HeroSlideshowBlock>)}
                className="rounded border-border"
              />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>

        {/* Deck-level Advanced (nav colors) */}
        <details className="border border-border rounded">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
            Advanced navigation colors
          </summary>
          <div className="px-3 pb-3 pt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <TokenColorPicker
                label="Arrow Color"
                value={block.arrowColor || ''}
                onChange={(v) => onChange({ arrowColor: v || undefined })}
              />
              <TokenColorPicker
                label="Arrow Background"
                value={block.arrowBackground || ''}
                onChange={(v) => onChange({ arrowBackground: v || undefined })}
              />
            </div>
            <TokenColorPicker
              label="Arrow Border Color"
              value={block.arrowBorderColor || ''}
              onChange={(v) => onChange({ arrowBorderColor: v || undefined })}
            />
            <div className="grid grid-cols-2 gap-2">
              <TokenColorPicker
                label="Dot Color"
                value={block.dotColor || ''}
                onChange={(v) => onChange({ dotColor: v || undefined })}
              />
              <TokenColorPicker
                label="Dot Active Color"
                value={block.dotActiveColor || ''}
                onChange={(v) => onChange({ dotActiveColor: v || undefined })}
              />
            </div>
            <TokenColorPicker
              label="Progress Bar Color"
              value={block.progressBarColor || ''}
              onChange={(v) => onChange({ progressBarColor: v || undefined })}
            />
          </div>
        </details>
      </div>

      {/* Stats Bar */}
      <div className="border-t border-border pt-3 space-y-3">
        <label className="block text-sm font-medium text-foreground">Stats Bar</label>
        <p className="text-xs text-muted-foreground">Displayed at the bottom of the hero.</p>
        {(block.stats || []).map((stat, i) => (
          <div key={stat.id} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <input
                type="text"
                value={stat.value}
                onChange={(e) => {
                  const newStats = [...(block.stats || [])];
                  newStats[i] = { ...newStats[i], value: e.target.value };
                  onChange({ stats: newStats });
                }}
                className={inputClass}
                placeholder="Value (e.g. 22+)"
              />
              <input
                type="text"
                value={stat.label}
                onChange={(e) => {
                  const newStats = [...(block.stats || [])];
                  newStats[i] = { ...newStats[i], label: e.target.value };
                  onChange({ stats: newStats });
                }}
                className={inputClass}
                placeholder="Label"
              />
            </div>
            <button
              onClick={() => {
                const newStats = (block.stats || []).filter((_, j) => j !== i);
                onChange({ stats: newStats });
              }}
              className="px-2 py-1 text-xs rounded border border-border text-destructive hover:bg-destructive/10 mt-1"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            const newStat = { id: `stat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, value: '', label: '' };
            onChange({ stats: [...(block.stats || []), newStat] });
          }}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
        >
          + Add Stat
        </button>
      </div>
    </div>
  );
}

// ─── Social Links ────────────────────────────────────────────────────────────
function SocialLinksBlockSettings({ block, onChange }: { block: SocialLinksBlock; onChange: (updates: Partial<SocialLinksBlock>) => void }) {
  const PLATFORMS: Array<SocialLinksBlock['links'][number]['platform']> = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'];
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Icon Size (px)</label>
        <select
          value={block.iconSize ?? 32}
          onChange={(e) => onChange({ iconSize: Number(e.target.value) })}
          className={inputClass}
        >
          <option value={24}>24</option>
          <option value={32}>32</option>
          <option value={40}>40</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
        <select
          value={block.alignment ?? 'center'}
          onChange={(e) => onChange({ alignment: e.target.value as SocialLinksBlock['alignment'] })}
          className={inputClass}
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Links</label>
        {(block.links || []).map((link, i) => (
          <div key={i} className="flex gap-2 items-start">
            <select
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], platform: e.target.value as SocialLinksBlock['links'][number]['platform'] };
                onChange({ links: next });
              }}
              className="text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
            >
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.links || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ links: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-2 text-foreground"
              placeholder="https://"
            />
            <button
              type="button"
              onClick={() => onChange({ links: (block.links || []).filter((_, j) => j !== i) })}
              className="px-2 py-2 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Remove link"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ links: [...(block.links || []), { platform: 'facebook', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Link
        </button>
      </div>
    </div>
  );
}

// ─── Logo Strip ──────────────────────────────────────────────────────────────
function LogoStripBlockSettings({ block, onChange }: { block: LogoStripBlock; onChange: (updates: Partial<LogoStripBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline (eyebrow text)</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. TRUSTED BY 100+ TEAMS"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 6}
            onChange={(e) => onChange({ columns: Number(e.target.value) as LogoStripBlock['columns'] })}
            className={inputClass}
          >
            {[3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Gap</label>
          <select
            value={block.gap || 'lg'}
            onChange={(e) => onChange({ gap: e.target.value as LogoStripBlock['gap'] })}
            className={inputClass}
          >
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Alignment</label>
          <select
            value={block.alignment || 'center'}
            onChange={(e) => onChange({ alignment: e.target.value as LogoStripBlock['alignment'] })}
            className={inputClass}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Height</label>
          <input
            type="text"
            value={block.logoHeight || '40px'}
            onChange={(e) => onChange({ logoHeight: e.target.value })}
            className={inputClass}
            placeholder="40px"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={block.grayscale ?? true}
          onChange={(e) => onChange({ grayscale: e.target.checked })}
          className="rounded border-border"
        />
        Grayscale (color on hover)
      </label>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Logos</label>
        {(block.logos || []).map((logo, i) => (
          <div key={logo.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="url"
              value={logo.imageUrl}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], imageUrl: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Image URL"
            />
            <input
              type="text"
              value={logo.alt}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], alt: e.target.value };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Alt text"
            />
            <input
              type="url"
              value={logo.link || ''}
              onChange={(e) => {
                const next = [...(block.logos || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ logos: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ logos: (block.logos || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ logos: [...(block.logos || []), { id: `logo-${Date.now()}`, imageUrl: '', alt: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Logo
        </button>
      </div>
    </div>
  );
}

// ─── Metric Cards ────────────────────────────────────────────────────────────
function MetricCardsBlockSettings({ block, onChange }: { block: MetricCardsBlock; onChange: (updates: Partial<MetricCardsBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. PROOF POINTS"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 4}
            onChange={(e) => onChange({ columns: Number(e.target.value) as MetricCardsBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Metrics</label>
        {(block.metrics || []).map((metric, i) => (
          <div key={metric.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={metric.value}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], value: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder='Big value e.g. "83%"'
            />
            <input
              type="text"
              value={metric.label}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Small label"
            />
            <input
              type="text"
              value={metric.institution || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], institution: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Institution (optional)"
            />
            <input
              type="url"
              value={metric.institutionLogo || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], institutionLogo: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Institution logo URL (optional)"
            />
            <input
              type="url"
              value={metric.link || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <input
              type="text"
              value={metric.linkText || ''}
              onChange={(e) => {
                const next = [...(block.metrics || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ metrics: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder='CTA text (default "Case Study")'
            />
            <button
              type="button"
              onClick={() => onChange({ metrics: (block.metrics || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ metrics: [...(block.metrics || []), { id: `metric-${Date.now()}`, value: '', label: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Metric
        </button>
      </div>
    </div>
  );
}

// ─── Booking Menu ────────────────────────────────────────────────────────────
// ─── Flip Card Grid ──────────────────────────────────────────────────────────
function FlipCardGridBlockSettings({ block, onChange }: { block: FlipCardGridBlock; onChange: (updates: Partial<FlipCardGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. WHY WE'RE DIFFERENT"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.description || ''} onChange={(html) => onChange({ description: html || undefined })} singleLine placeholder="Description..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 3}
            onChange={(e) => onChange({ columns: Number(e.target.value) as FlipCardGridBlock['columns'] })}
            className={inputClass}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Card Height</label>
          <input
            type="text"
            value={block.cardHeight || '280px'}
            onChange={(e) => onChange({ cardHeight: e.target.value })}
            className={inputClass}
            placeholder="280px"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Flip Trigger</label>
          <select
            value={block.flipTrigger || 'hover'}
            onChange={(e) => onChange({ flipTrigger: e.target.value as FlipCardGridBlock['flipTrigger'] })}
            className={inputClass}
          >
            <option value="hover">Hover</option>
            <option value="click">Click</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Flip Axis</label>
          <select
            value={block.flipAxis || 'horizontal'}
            onChange={(e) => onChange({ flipAxis: e.target.value as FlipCardGridBlock['flipAxis'] })}
            className={inputClass}
          >
            <option value="horizontal">Horizontal (Y-axis)</option>
            <option value="vertical">Vertical (X-axis)</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Cards</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.frontTitle}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontTitle: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Front title"
            />
            <input
              type="text"
              value={card.frontSubtitle || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontSubtitle: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Front subtitle (optional)"
            />
            <input
              type="text"
              value={card.frontIcon || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontIcon: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (e.g. trending_up)"
            />
            <input
              type="url"
              value={card.frontImage || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], frontImage: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Front image URL (optional)"
            />
            <textarea
              value={card.backText}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backText: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back text"
              rows={2}
            />
            <input
              type="url"
              value={card.backLink || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLink: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back link URL (optional)"
            />
            <input
              type="text"
              value={card.backLinkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], backLinkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Back link text (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `flipcard-${Date.now()}`, frontTitle: '', backText: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Card
        </button>
      </div>
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────
function TimelineBlockSettings({ block, onChange }: { block: TimelineBlock; onChange: (updates: Partial<TimelineBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. OUR PROCESS"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <select
          value={block.layout || 'alternating'}
          onChange={(e) => onChange({ layout: e.target.value as TimelineBlock['layout'] })}
          className={inputClass}
        >
          <option value="alternating">Alternating (zigzag)</option>
          <option value="left">Left-aligned</option>
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Line Color</label>
          <TokenColorPicker value={block.lineColor || ''} onChange={(color) => onChange({ lineColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Number Color</label>
          <TokenColorPicker value={block.numberColor || ''} onChange={(color) => onChange({ numberColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Node Color</label>
          <TokenColorPicker value={block.nodeColor || ''} onChange={(color) => onChange({ nodeColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Steps</label>
        {(block.steps || []).map((step, i) => (
          <div key={step.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={step.number || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], number: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Number (e.g. 01) — optional"
            />
            <input
              type="text"
              value={step.icon || ''}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (optional, alt to number)"
            />
            <input
              type="text"
              value={step.title}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Step title"
            />
            <textarea
              value={step.description}
              onChange={(e) => {
                const next = [...(block.steps || [])];
                next[i] = { ...next[i], description: e.target.value };
                onChange({ steps: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Step description"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ steps: (block.steps || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ steps: [...(block.steps || []), { id: `step-${Date.now()}`, title: '', description: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Step
        </button>
      </div>
    </div>
  );
}

// ─── Team Showcase ───────────────────────────────────────────────────────────
function TeamShowcaseBlockSettings({ block, onChange }: { block: TeamShowcaseBlock; onChange: (updates: Partial<TeamShowcaseBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. OUR TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Bio Panel Color</label>
          <TokenColorPicker value={block.bioPanelColor || ''} onChange={(color) => onChange({ bioPanelColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Photo Filter (CSS)</label>
        <input
          type="text"
          value={block.photoFilter || ''}
          onChange={(e) => onChange({ photoFilter: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. sepia(0.08)"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="text"
              value={member.credentials || ''}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], credentials: e.target.value || undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Credentials (optional)"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio"
              rows={3}
            />
            <input
              type="text"
              value={(member.specialties || []).join(', ')}
              onChange={(e) => {
                const next = [...(block.members || [])];
                const list = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                next[i] = { ...next[i], specialties: list.length ? list : undefined };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Specialties (comma-separated, optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `member-${Date.now()}`, name: '', title: '', photo: '', bio: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}

// ─── Team Flip Grid ──────────────────────────────────────────────────────────
function TeamFlipGridBlockSettings({ block, onChange }: { block: TeamFlipGridBlock; onChange: (updates: Partial<TeamFlipGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. MEET THE TEAM"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
        <select
          value={block.columns || 4}
          onChange={(e) => onChange({ columns: Number(e.target.value) as TeamFlipGridBlock['columns'] })}
          className={inputClass}
        >
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back BG Color</label>
          <TokenColorPicker value={block.backBgColor || ''} onChange={(color) => onChange({ backBgColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Back Text Color</label>
          <TokenColorPicker value={block.backTextColor || ''} onChange={(color) => onChange({ backTextColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Name Color</label>
          <TokenColorPicker value={block.nameColor || ''} onChange={(color) => onChange({ nameColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Title Color</label>
          <TokenColorPicker value={block.titleColor || ''} onChange={(color) => onChange({ titleColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Members</label>
        {(block.members || []).map((member, i) => (
          <div key={member.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={member.name}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], name: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Name"
            />
            <input
              type="text"
              value={member.title}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Title"
            />
            <input
              type="url"
              value={member.photo}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], photo: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Photo URL"
            />
            <textarea
              value={member.bio}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], bio: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bio (front)"
              rows={2}
            />
            <input
              type="text"
              value={member.question}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], question: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Question (back)"
            />
            <textarea
              value={member.answer}
              onChange={(e) => {
                const next = [...(block.members || [])];
                next[i] = { ...next[i], answer: e.target.value };
                onChange({ members: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Answer (back)"
              rows={2}
            />
            <button
              type="button"
              onClick={() => onChange({ members: (block.members || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ members: [...(block.members || []), { id: `tmember-${Date.now()}`, name: '', title: '', bio: '', photo: '', question: '', answer: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Member
        </button>
      </div>
    </div>
  );
}

// ─── Bento Grid ──────────────────────────────────────────────────────────────
function BentoGridBlockSettings({ block, onChange }: { block: BentoGridBlock; onChange: (updates: Partial<BentoGridBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="e.g. CAPABILITIES"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.title || ''} onChange={(html) => onChange({ title: html || undefined })} singleLine placeholder="Section title..." className="text-sm text-foreground" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Subtitle</label>
        <div className="rounded border border-border bg-background px-3 py-2 min-h-[36px]">
          <RichTextEditable html={block.subtitle || ''} onChange={(html) => onChange({ subtitle: html || undefined })} singleLine placeholder="Subtitle..." className="text-sm text-foreground" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Columns</label>
          <select
            value={block.columns || 2}
            onChange={(e) => onChange({ columns: Number(e.target.value) })}
            className={inputClass}
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Dark BG</label>
          <TokenColorPicker value={block.darkBg || ''} onChange={(color) => onChange({ darkBg: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Light Border</label>
          <TokenColorPicker value={block.lightBorder || ''} onChange={(color) => onChange({ lightBorder: color || undefined })} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accent Color</label>
        <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Cards</label>
        {(block.cards || []).map((card, i) => (
          <div key={card.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={card.title}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], title: e.target.value };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Title"
            />
            <input
              type="text"
              value={card.lead || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], lead: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground italic"
              placeholder="Lead/question (optional)"
            />
            <textarea
              value={(card.items || []).join('\n')}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], items: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Bullet items (one per line)"
              rows={3}
            />
            <input
              type="url"
              value={card.link || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link URL (optional)"
            />
            <input
              type="text"
              value={card.linkText || ''}
              onChange={(e) => {
                const next = [...(block.cards || [])];
                next[i] = { ...next[i], linkText: e.target.value || undefined };
                onChange({ cards: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link text (optional)"
            />
            <div className="flex gap-2">
              <select
                value={card.variant || 'dark'}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], variant: e.target.value as BentoCard['variant'] };
                  onChange({ cards: next });
                }}
                className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <input
                type="number"
                min={1}
                max={12}
                value={card.span ?? 6}
                onChange={(e) => {
                  const next = [...(block.cards || [])];
                  next[i] = { ...next[i], span: Number(e.target.value) };
                  onChange({ cards: next });
                }}
                className="w-20 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder="Span"
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ cards: (block.cards || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ cards: [...(block.cards || []), { id: `bento-${Date.now()}`, title: '', items: [], variant: 'dark', span: 6 }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Card
        </button>
      </div>
    </div>
  );
}

// ─── Site Footer ─────────────────────────────────────────────────────────────
function SiteFooterBlockSettings({ block, onChange }: { block: SiteFooterBlock; onChange: (updates: Partial<SiteFooterBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo URL</label>
          <input
            type="url"
            value={block.logoUrl || ''}
            onChange={(e) => onChange({ logoUrl: e.target.value || undefined })}
            className={inputClass}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Logo Alt</label>
          <input
            type="text"
            value={block.logoAlt || ''}
            onChange={(e) => onChange({ logoAlt: e.target.value || undefined })}
            className={inputClass}
            placeholder="Brand name"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Tagline</label>
        <input
          type="text"
          value={block.tagline || ''}
          onChange={(e) => onChange({ tagline: e.target.value || undefined })}
          className={inputClass}
          placeholder="Short tagline shown under the logo"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Background</label>
          <TokenColorPicker value={block.backgroundColor || ''} onChange={(color) => onChange({ backgroundColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Text</label>
          <TokenColorPicker value={block.textColor || ''} onChange={(color) => onChange({ textColor: color || undefined })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Accent</label>
          <TokenColorPicker value={block.accentColor || ''} onChange={(color) => onChange({ accentColor: color || undefined })} />
        </div>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Contact Info</label>
        <input
          type="text"
          value={block.contactInfo?.address || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), address: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Address"
        />
        <input
          type="text"
          value={block.contactInfo?.phone || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), phone: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Phone"
        />
        <input
          type="email"
          value={block.contactInfo?.email || ''}
          onChange={(e) => onChange({ contactInfo: { ...(block.contactInfo || {}), email: e.target.value || undefined } })}
          className={inputClass}
          placeholder="Email"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Link Groups</label>
        {(block.linkGroups || []).map((group, gi) => (
          <div key={gi} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={group.label}
              onChange={(e) => {
                const next = [...(block.linkGroups || [])];
                next[gi] = { ...next[gi], label: e.target.value };
                onChange({ linkGroups: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Group label (e.g. PRODUCT)"
            />
            {(group.links || []).map((link, li) => (
              <div key={li} className="flex gap-1">
                <input
                  type="text"
                  value={link.label}
                  onChange={(e) => {
                    const groups = [...(block.linkGroups || [])];
                    const links = [...(groups[gi].links || [])];
                    links[li] = { ...links[li], label: e.target.value };
                    groups[gi] = { ...groups[gi], links };
                    onChange({ linkGroups: groups });
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Link label"
                />
                <input
                  type="text"
                  value={link.href}
                  onChange={(e) => {
                    const groups = [...(block.linkGroups || [])];
                    const links = [...(groups[gi].links || [])];
                    links[li] = { ...links[li], href: e.target.value };
                    groups[gi] = { ...groups[gi], links };
                    onChange({ linkGroups: groups });
                  }}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="/path"
                />
                <button
                  type="button"
                  onClick={() => {
                    const groups = [...(block.linkGroups || [])];
                    groups[gi] = { ...groups[gi], links: (groups[gi].links || []).filter((_, j) => j !== li) };
                    onChange({ linkGroups: groups });
                  }}
                  className="px-2 text-xs text-destructive hover:underline"
                >
                  ×
                </button>
              </div>
            ))}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  const groups = [...(block.linkGroups || [])];
                  groups[gi] = { ...groups[gi], links: [...(groups[gi].links || []), { label: '', href: '' }] };
                  onChange({ linkGroups: groups });
                }}
                className="flex-1 text-xs text-muted-foreground hover:underline"
              >
                + Link
              </button>
              <button
                type="button"
                onClick={() => onChange({ linkGroups: (block.linkGroups || []).filter((_, j) => j !== gi) })}
                className="text-xs text-destructive hover:underline"
              >
                Remove group
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ linkGroups: [...(block.linkGroups || []), { label: '', links: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Group
        </button>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Social Links</label>
        {(block.socialLinks || []).map((link, i) => (
          <div key={i} className="flex gap-1">
            <input
              type="text"
              value={link.platform}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], platform: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="w-24 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="platform"
            />
            <input
              type="url"
              value={link.url}
              onChange={(e) => {
                const next = [...(block.socialLinks || [])];
                next[i] = { ...next[i], url: e.target.value };
                onChange({ socialLinks: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="https://"
            />
            <button
              type="button"
              onClick={() => onChange({ socialLinks: (block.socialLinks || []).filter((_, j) => j !== i) })}
              className="px-2 text-xs text-destructive hover:underline"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ socialLinks: [...(block.socialLinks || []), { platform: '', url: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Social Link
        </button>
      </div>
      <div className="border-t border-border pt-4 space-y-2">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Copyright</label>
          <input
            type="text"
            value={block.copyright || ''}
            onChange={(e) => onChange({ copyright: e.target.value || undefined })}
            className={inputClass}
            placeholder="© 2026 Your Company"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Disclaimer</label>
          <textarea
            value={block.disclaimer || ''}
            onChange={(e) => onChange({ disclaimer: e.target.value || undefined })}
            className={inputClass}
            placeholder="Optional fine-print disclaimer"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Marquee ─────────────────────────────────────────────────────────────────
function MarqueeBlockSettings({ block, onChange }: { block: MarqueeBlock; onChange: (updates: Partial<MarqueeBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Direction</label>
          <select
            value={block.direction || 'left'}
            onChange={(e) => onChange({ direction: e.target.value as MarqueeBlock['direction'] })}
            className={inputClass}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Speed (px/s)</label>
          <input
            type="number"
            value={block.speed ?? 50}
            onChange={(e) => onChange({ speed: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Gap</label>
          <input
            type="text"
            value={block.gap || '40px'}
            onChange={(e) => onChange({ gap: e.target.value })}
            className={inputClass}
            placeholder="40px"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Height (vertical)</label>
          <input
            type="text"
            value={block.height || ''}
            onChange={(e) => onChange({ height: e.target.value || undefined })}
            className={inputClass}
            placeholder="300px"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Loop Count</label>
        <input
          type="number"
          min={0}
          value={block.loop ?? 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ loop: Number.isNaN(n) ? undefined : n });
          }}
          className={inputClass}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground mt-1">0 = infinite loop. Set a positive number to stop after N loops.</p>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.pauseOnHover ?? true}
            onChange={(e) => onChange({ pauseOnHover: e.target.checked })}
            className="rounded border-border"
          />
          Pause on hover
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.pauseOnClick ?? false}
            onChange={(e) => onChange({ pauseOnClick: e.target.checked })}
            className="rounded border-border"
          />
          Pause on click
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.autoFill ?? true}
            onChange={(e) => onChange({ autoFill: e.target.checked })}
            className="rounded border-border"
          />
          Auto-fill (loop content)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.gradient ?? false}
            onChange={(e) => onChange({ gradient: e.target.checked })}
            className="rounded border-border"
          />
          Edge gradient fade
        </label>
      </div>
      {block.gradient && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Gradient Color</label>
            <TokenColorPicker value={block.gradientColor || ''} onChange={(color) => onChange({ gradientColor: color || undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Gradient Width (px)</label>
            <input
              type="number"
              value={block.gradientWidth ?? 200}
              onChange={(e) => onChange({ gradientWidth: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>
      )}
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Items</label>
        {(block.items || []).map((item, i) => (
          <div key={item.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <select
              value={item.type}
              onChange={(e) => {
                const next = [...(block.items || [])];
                next[i] = { ...next[i], type: e.target.value as MarqueeItem['type'] };
                onChange({ items: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="icon">Icon</option>
            </select>
            {item.type === 'image' ? (
              <>
                <input
                  type="url"
                  value={item.imageUrl || ''}
                  onChange={(e) => {
                    const next = [...(block.items || [])];
                    next[i] = { ...next[i], imageUrl: e.target.value || undefined };
                    onChange({ items: next });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Image URL"
                />
                <input
                  type="text"
                  value={item.imageAlt || ''}
                  onChange={(e) => {
                    const next = [...(block.items || [])];
                    next[i] = { ...next[i], imageAlt: e.target.value || undefined };
                    onChange({ items: next });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Alt text"
                />
              </>
            ) : (
              <input
                type="text"
                value={item.content || ''}
                onChange={(e) => {
                  const next = [...(block.items || [])];
                  next[i] = { ...next[i], content: e.target.value || undefined };
                  onChange({ items: next });
                }}
                className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder={item.type === 'icon' ? 'Material Icon name' : 'Text content'}
              />
            )}
            <input
              type="url"
              value={item.link || ''}
              onChange={(e) => {
                const next = [...(block.items || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ items: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ items: (block.items || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ items: [...(block.items || []), { id: `marq-${Date.now()}`, type: 'text', content: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function TabsBlockSettings({ block, onChange }: { block: TabsBlock; onChange: (updates: Partial<TabsBlock>) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Edit each tab's contents by selecting it in the canvas and using the inline editor. Add or remove tabs here.
      </p>
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Tabs</label>
        {(block.tabs || []).map((tab, i) => (
          <div key={tab.id ?? i} className="flex gap-2 items-center">
            <input
              type="text"
              value={tab.label}
              onChange={(e) => {
                const next = [...(block.tabs || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ tabs: next });
              }}
              className="flex-1 text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Tab label"
            />
            <button
              type="button"
              onClick={() => onChange({ tabs: (block.tabs || []).filter((_, j) => j !== i) })}
              className="px-2 py-1.5 text-xs rounded border border-border text-destructive hover:bg-destructive/10"
              title="Remove tab"
            >
              <span className="material-icons text-xs">delete</span>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ tabs: [...(block.tabs || []), { id: `tab-${Date.now()}`, label: 'New Tab', blocks: [] }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Tab
        </button>
      </div>
    </div>
  );
}

// ─── Survey Input (pitch-deck preview) ───────────────────────────────────────
// ─── Email Header (email-only block) ─────────────────────────────────────────
// ─── Email Footer (email-only block) ─────────────────────────────────────────
function HtmlEmbedBlockSettings({ block, onChange }: { block: HtmlEmbedBlock; onChange: (updates: Partial<HtmlEmbedBlock>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pull siteId out of /portal/websites/<id>/posts/... so newly uploaded HTML
  // can have its assets imported into the site's media library. Settings panel
  // is also rendered inside an editor popup that lives on the same path.
  function detectSiteId(): string | null {
    if (typeof window === 'undefined') return null;
    const m = window.location.pathname.match(/\/portal\/websites\/(\d+)/);
    if (m) return m[1];
    // Settings popup: try the parent window if same-origin
    try {
      const opener = window.opener as Window | null;
      const parentPath = opener?.location?.pathname;
      const m2 = parentPath?.match(/\/portal\/websites\/(\d+)/);
      if (m2) return m2[1];
    } catch {
      // cross-origin opener — ignore
    }
    return null;
  }

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const siteId = detectSiteId();
      // If we already have a backing media row, version it instead of creating
      // a new one. Falls back to fresh upload if /replace fails.
      if (block.mediaId) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/portal/media/${block.mediaId}/replace`, { method: 'POST', body: fd });
        const json = await res.json();
        if (res.ok && json.success) {
          onChange({ url: json.data.url, filename: json.data.filename });
          return;
        }
        // fall through to fresh upload on failure
      }

      const fd = new FormData();
      fd.append('file', file);
      if (siteId) fd.append('websiteId', siteId);
      const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Upload failed');
      }
      onChange({ url: json.data.url, filename: json.data.filename, mediaId: json.data.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">HTML File</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded border-2 border-dashed p-4 text-center text-sm transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.xhtml,text/html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {uploading ? (
            <span className="text-muted-foreground">Uploading…</span>
          ) : block.url ? (
            <div>
              <div className="font-medium text-foreground truncate">{block.filename || 'uploaded.html'}</div>
              <div className="text-xs text-muted-foreground mt-1">Click or drop a new file to replace</div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <span className="material-icons text-3xl block mb-1">upload_file</span>
              Drop an .html file or click to browse
            </div>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">URL</label>
        <input
          type="text"
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
          placeholder="/api/media/proxy/media/..."
        />
        <p className="text-xs text-muted-foreground mt-1">Auto-populated by upload. You can also paste an existing URL.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Height</label>
        <input
          type="text"
          value={block.height || '600px'}
          onChange={(e) => onChange({ height: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="600px, 100vh, 80rem…"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Width</label>
        <select
          value={block.width || 'full'}
          onChange={(e) => onChange({ width: e.target.value as HtmlEmbedBlock['width'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="full">Full width</option>
          <option value="contained">Contained (max-width)</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Sandbox</label>
        <select
          value={block.sandbox || 'scripts'}
          onChange={(e) => onChange({ sandbox: e.target.value as HtmlEmbedBlock['sandbox'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="strict">Strict — no scripts</option>
          <option value="scripts">Allow scripts (recommended)</option>
          <option value="scripts-forms">Allow scripts + forms + popups</option>
        </select>
        <p className="text-xs text-muted-foreground mt-1">
          The iframe always runs in an opaque origin. allow-same-origin is never granted.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Iframe Title (a11y)</label>
        <input
          type="text"
          value={block.iframeTitle || ''}
          onChange={(e) => onChange({ iframeTitle: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Embedded HTML content"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Caption (optional)</label>
        <input
          type="text"
          value={block.caption || ''}
          onChange={(e) => onChange({ caption: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="Caption shown below the iframe…"
        />
      </div>
    </div>
  );
}
