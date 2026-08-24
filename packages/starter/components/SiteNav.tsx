/**
 * Navigation, rendered from the CMS nav tree.
 *
 * One level of children is handled; deeper trees are flattened rather than
 * dropped, so an over-nested menu degrades into something usable instead of
 * silently losing links. Replace with a real menu component when you need one.
 */
import type { NavItem } from '@simplerdevelopment/sdk';

function NavLink({ item }: { item: NavItem }) {
  return (
    <a
      href={item.href}
      className={item.isButton ? 'sd-button' : undefined}
      target={item.openInNewTab ? '_blank' : undefined}
      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
    >
      {item.label}
    </a>
  );
}

export function SiteNav({ items, siteName }: { items: NavItem[]; siteName: string }) {
  return (
    <header className="sd-nav">
      <a href="/" className="sd-nav-brand">
        {siteName}
      </a>
      <nav aria-label="Main">
        <ul>
          {items.map(item => (
            <li key={item.id}>
              <NavLink item={item} />
              {item.children?.length > 0 && (
                <ul>
                  {item.children.map(child => (
                    <li key={child.id}>
                      <NavLink item={child} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
