/*!
 * SimplerDevelopment chat widget loader.
 *
 * Embed:
 *   <script src="https://your-portal/widget/chat.js" data-widget-id="42" async></script>
 *
 * Reads `data-widget-id` from its <script> tag and injects an iframe
 * pointing at /widget/chat?id=<widgetId>. The iframe is a separate
 * origin/document, so the host site's CSS can never bleed in.
 *
 * postMessage contract (iframe -> loader):
 *   { type: 'sd-chat:resize', height, width, expanded }
 *   { type: 'sd-chat:close' }
 */
(function () {
  'use strict';
  if (window.__sdChatLoaded) return;
  window.__sdChatLoaded = true;

  var script = document.currentScript;
  if (!script) {
    // Old browsers — find by data-widget-id.
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-widget-id')) { script = scripts[i]; break; }
    }
  }
  if (!script) return;

  var widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) return;

  // Resolve the platform origin from the script's own URL.
  var src = script.src || '';
  var origin;
  try { origin = new URL(src, window.location.href).origin; } catch (_) { origin = ''; }
  if (!origin) return;

  var iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Live chat');
  iframe.setAttribute('aria-label', 'Live chat');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.src = origin + '/widget/chat?id=' + encodeURIComponent(widgetId);
  iframe.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'width:72px',
    'height:72px',
    'border:0',
    'background:transparent',
    'z-index:2147483600',
    'color-scheme:normal',
    'transition:width .2s ease, height .2s ease'
  ].join(';');

  function appendWhenReady() {
    if (document.body) document.body.appendChild(iframe);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(iframe); });
  }
  appendWhenReady();

  window.addEventListener('message', function (ev) {
    if (ev.origin !== origin) return;
    var data = ev.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'sd-chat:resize') {
      if (data.expanded) {
        iframe.style.width = (data.width || 380) + 'px';
        iframe.style.height = (data.height || 560) + 'px';
      } else {
        iframe.style.width = '72px';
        iframe.style.height = '72px';
      }
    } else if (data.type === 'sd-chat:close') {
      iframe.style.width = '72px';
      iframe.style.height = '72px';
    }
  });
})();
