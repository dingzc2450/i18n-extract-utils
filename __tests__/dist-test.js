#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

console.log(`${colors.cyan}Testing dist build integration...${colors.reset}`);

// Step 1: Make sure the project is built
console.log(`\n${colors.blue}Building project...${colors.reset}`);
try {
  execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });
} catch (error) {
  console.error(`${colors.red}Build failed:${colors.reset}`, error);
  process.exit(1);
}

// Step 2: Create temp directory
const tempDir = mkdtempSync(path.join(tmpdir(), 'i18n-extract-test-'));
console.log(`\n${colors.blue}Created temp directory: ${tempDir}${colors.reset}`);

try {
  // Step 3: Create test files
  console.log(`\n${colors.blue}Creating test files...${colors.reset}`);
  
  // Create package.json
  const packageJson = {
    "name": "i18n-extract-test",
    "version": "1.0.0",
    "type": "module",
    "private": true
  };
  fs.writeFileSync(
    path.join(tempDir, 'package.json'), 
    JSON.stringify(packageJson, null, 2)
  );
  
  // Create src directory
  const srcDir = path.join(tempDir, 'src');
  fs.mkdirSync(srcDir);
  
  // Create a test component with i18n strings
  const testComponent = `
    import React from 'react';
    
    function TestComponent() {
      return (
        <div>
          <h1>___Hello World___</h1>
          <p>___Welcome to our app___</p>
        </div>
      );
    }
    
    export default TestComponent;
  `;
  fs.writeFileSync(path.join(srcDir, 'TestComponent.jsx'), testComponent);
  
  // Create a test script
  const testScript = `
    import { extractI18n } from 'i18n-extract-utils';
    
    async function runTest() {
      const result = await extractI18n('src/**/*.jsx', {
        outputPath: 'translations.json'
      });
      
      console.log(\`Processed \${result.processedFiles} files\`);
      console.log(\`Found \${result.extractedStrings.length} translatable strings\`);
    }
    
    runTest().catch(err => {
      console.error('Test failed:', err);
      process.exit(1);
    });
  `;
  fs.writeFileSync(path.join(tempDir, 'test.js'), testScript);
  
  // Step 4: Install the local package
  console.log(`\n${colors.blue}Installing local package...${colors.reset}`);
  execSync(`npm install "${projectRoot}"`, { 
    stdio: 'inherit', 
    cwd: tempDir 
  });
  
  // Step 5: Run the test
  console.log(`\n${colors.blue}Running test...${colors.reset}`);
  const output = execSync('node test.js', { 
    encoding: 'utf8',
    cwd: tempDir 
  });
  console.log(output);
  
  // Step 6: Verify the outputs
  console.log(`\n${colors.blue}Verifying outputs...${colors.reset}`);
  
  // Check transformed file
  const transformedComponent = fs.readFileSync(
    path.join(srcDir, 'TestComponent.jsx'), 
    'utf8'
  );
  
  if (!transformedComponent.includes('t("Hello World")') || 
      !transformedComponent.includes('t("Welcome to our app")')) {
    throw new Error('File was not transformed correctly!');
  }
  
  // Check extracted translations
  const translations = JSON.parse(
    fs.readFileSync(path.join(tempDir, 'translations.json'), 'utf8')
  );
  
  if (!translations['Hello World'] || !translations['Welcome to our app']) {
    throw new Error('Translations were not extracted correctly!');
  }
  
  console.log(`${colors.green}✓ All tests passed successfully!${colors.reset}`);
} catch (error) {
  console.error(`${colors.red}Test failed:${colors.reset}`, error);
  process.exit(1);
} finally {
  // Clean up
  console.log(`\n${colors.blue}Cleaning up temporary directory...${colors.reset}`);
  rmSync(tempDir, { recursive: true, force: true });
}