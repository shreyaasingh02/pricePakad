
import React, { useEffect, useRef } from 'react';
import sourceHtml from './pricecrash-source.html?raw';

export default function App() {
  const pageRef = useRef(null);

  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    // Parse the original PriceCrash HTML source.
    const parsed = new DOMParser().parseFromString(
      sourceHtml,
      'text/html'
    );

    // Load the original CSS without changing its styles.
    const styleText = Array.from(
      parsed.querySelectorAll('style')
    )
      .map((node) => node.textContent || '')
      .join('\n');

    const style = document.createElement('style');
    style.dataset.pricecrash = 'source-styles';
    style.textContent = styleText;
    document.head.appendChild(style);

    // Copy all original body elements, including the product grid,
    // How PriceCrash Works, Price Alerts, and both modals.
    const sourceBody = parsed.body.cloneNode(true);

    sourceBody.querySelectorAll('script').forEach((script) => {
      script.remove();
    });

    root.replaceChildren(
      ...Array.from(sourceBody.childNodes)
    );

    // Run the original JavaScript in a private function scope.
    // This avoids global const/let redeclaration errors when
    // React StrictMode runs the effect more than once.
    const originalScripts = Array.from(
      parsed.querySelectorAll('script')
    )
      .map((script) => script.textContent || '')
      .filter((code) => code.trim());

    const runningScripts = [];

    for (const code of originalScripts) {
      const script = document.createElement('script');

      script.textContent = `
        (function () {
          ${code}
        })();
      `;

      document.body.appendChild(script);
      runningScripts.push(script);
    }

    // Clean up when the component unmounts or React re-runs the effect.
    return () => {
      runningScripts.forEach((script) => script.remove());
      style.remove();
      root.replaceChildren();
    };
  }, []);

  return <div ref={pageRef} />;
}
