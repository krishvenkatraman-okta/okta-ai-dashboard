// Build script for Vercel deployment
const { build } = require('vite');
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function buildProject() {
  console.log('🔨 Building client...');
  
  // Build the Vite frontend
  await build({
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  });
  
  console.log('✅ Client built successfully');
  
  // Create API directory if it doesn't exist
  if (!fs.existsSync('api')) {
    fs.mkdirSync('api');
  }
  
  console.log('🔨 Building serverless function...');
  
  // Build serverless function for Vercel
  await esbuild.build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: 'api/index.js',
    external: ['pg-native'],
    define: {
      'process.env.VERCEL': 'true'
    }
  });
  
  console.log('✅ Serverless function built successfully');
}

buildProject().catch(console.error);