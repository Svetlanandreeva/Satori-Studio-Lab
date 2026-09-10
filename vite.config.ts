import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Small source transforms kept here so both production and local Vite builds
// receive the same storefront/admin behaviour without duplicating UI code.
// These can be removed once App.tsx/AdminFigmaApp.tsx are split into smaller
// modules and the values below become shared imports.
function satoriCommercePatches() {
  return {
    name: 'satori-commerce-patches',
    enforce: 'pre',
    transform(code, id) {
      const file = id.replace(/\\/g, '/')

      if (file.endsWith('/src/app/App.tsx')) {
        code = code.replace(
          'const CATEGORIES = ["Декор", "Лампы", "Украшения"];',
          'const CATEGORIES = ["Декор", "Лампы", "Мебель", "Украшения"];',
        )

        code = code.replace(
          '  const [cart, setCart] = useState<CartItem[]>([]);',
          '  const [cart, setCart] = useState<CartItem[]>([]);\n  const cartHydrated = useRef(false);',
        )

        code = code.replace(
          '      setProducts(list);\n      const pid = new URLSearchParams(window.location.search).get("p");',
          `      setProducts(list);
      try {
        const stored = JSON.parse(localStorage.getItem("satori_cart_v1") || "[]");
        if (Array.isArray(stored)) {
          const restored = stored
            .map((entry: any) => {
              const product = list.find((item) => Number(item.id) === Number(entry?.id));
              if (!product) return null;
              const qty = Math.max(1, Math.min(99, Number(entry?.qty) || 1));
              return { product, qty } as CartItem;
            })
            .filter(Boolean) as CartItem[];
          setCart(restored);
        }
      } catch {}
      cartHydrated.current = true;
      const pid = new URLSearchParams(window.location.search).get("p");`,
        )

        code = code.replace(
          '    captureMetrikaIdentifiers();\n  }, []);\n\n  function navigate(p: Page) {',
          `    captureMetrikaIdentifiers();
  }, []);

  useEffect(() => {
    if (!cartHydrated.current) return;
    try {
      localStorage.setItem(
        "satori_cart_v1",
        JSON.stringify(cart.map(({ product, qty }) => ({ id: product.id, qty }))),
      );
    } catch {}
  }, [cart]);

  function navigate(p: Page) {`,
        )
      }

      if (file.endsWith('/src/AdminFigmaApp.tsx')) {
        code = code.replace(
          'const CATEGORIES = ["Декор", "Лампы", "Украшения"];',
          'const CATEGORIES = ["Декор", "Лампы", "Мебель", "Украшения"];',
        )
      }

      return code
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    satoriCommercePatches(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
