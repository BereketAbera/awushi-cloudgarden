import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import hooks from 'eslint-plugin-react-hooks'
import refresh from 'eslint-plugin-react-refresh'
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, 'react-refresh': refresh },
    languageOptions: { globals: { window: 'readonly', document: 'readonly', localStorage: 'readonly', performance: 'readonly', console: 'readonly', HTMLButtonElement: 'readonly', HTMLElement: 'readonly' } },
    rules: { ...hooks.configs.recommended.rules, 'react-refresh/only-export-components': ['warn', { allowConstantExport: true }], 'react-hooks/set-state-in-effect': 'off', 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off' },
  },
)
