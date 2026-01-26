// Build script for Vercel deployment
import { build } from 'vite';
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildProject() {
  console.log('🔨 Building client with Vite...');
  
  // Build the Vite frontend using the existing vite config
  await build({
    configFile: path.resolve(__dirname, 'vite.config.ts'),
    mode: 'production'
  });
  
  console.log('✅ Client built successfully to dist/public');
  
  // Create API directory if it doesn't exist
  if (!fs.existsSync('api')) {
    fs.mkdirSync('api');
  }
  
  console.log('🔨 Building API serverless function...');
  
  // Build serverless function for Vercel
  await esbuild.build({
    entryPoints: ['server/vercel-handler.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'api/index.js',
    external: ['pg-native'],
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    banner: {
      js: '// Vercel Serverless Function\n'
    }
  });
  
  console.log('✅ API serverless function built successfully');
  
  // Move contents from dist/public to dist for Vercel
  console.log('📁 Reorganizing output for Vercel...');
  const publicDir = path.resolve(__dirname, 'dist/public');
  const distDir = path.resolve(__dirname, 'dist');
  
  if (fs.existsSync(publicDir)) {
    const files = fs.readdirSync(publicDir);
    for (const file of files) {
      const src = path.join(publicDir, file);
      const dest = path.join(distDir, file);
      
      // Remove destination if it exists and is not the same as source
      if (fs.existsSync(dest) && src !== dest) {
        if (fs.statSync(dest).isDirectory()) {
          fs.rmSync(dest, { recursive: true });
        } else {
          fs.unlinkSync(dest);
        }
      }
      
      // Move file/directory
      fs.renameSync(src, dest);
    }
    
    // Remove empty public directory
    fs.rmdirSync(publicDir);
  }
  
  console.log('📦 Build complete! Ready for Vercel deployment.');
  console.log('');
  console.log('Output structure:');
  console.log('  dist/          - Static frontend files');
  console.log('  api/index.js   - Serverless API function');
}

buildProject().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
