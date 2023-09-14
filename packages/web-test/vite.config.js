import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  base: '/chopsticks/',
  // esbuild: {
  //   keepNames: true, // typeorm migrations require timestamp in their names and this way it can be defined with name property
  // },
  // build: {
  //   commonjsOptions: {
  //     transformMixedEsModules: true, // https://github.com/rollup/plugins/tree/master/packages/commonjs#transformmixedesmodules
  //   },
  // },
})
