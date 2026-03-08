#!/usr/bin/env node
/**
 * migrate.js — download all Flickr/Imgur images, upload to GCS, rewrite URLs
 *
 * Usage:
 *   node migrate.js          # dry run (shows what would change)
 *   node migrate.js --apply  # download, upload, rewrite files
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SERVE_URL   = 'https://img.endlesswips.com';
const BUCKET      = 'endlesswips-images';
const NEXTJS_DIR  = '/Users/thomasbrown/Desktop/gitRepos/endlesswips-nextjs';
const TMP_DIR     = '/tmp/endlesswips-migrate';
const APPLY       = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// All unique external image URLs to migrate
// ---------------------------------------------------------------------------
const EXTERNAL_URLS = [
  // Imgur
  'https://i.imgur.com/PrghHEl.png',
  'https://i.imgur.com/4AW1ZGk.jpg',

  // Flickr
  'https://live.staticflickr.com/65535/50543892593_8dee9b7594_o.png',
  'https://live.staticflickr.com/65535/50333837223_f54f7c014c_o.jpg',
  'https://live.staticflickr.com/65535/51886498669_774c8e490c_o.jpg',
  'https://live.staticflickr.com/65535/53515834604_f2f4e34901_o.png',
  'https://live.staticflickr.com/65535/51105179861_c4c7ff4cb9_o.png',
  'https://live.staticflickr.com/65535/51106448340_e42b02868e_o.png',
  'https://live.staticflickr.com/65535/51054104906_c44b81f6a5_o.png',
  'https://live.staticflickr.com/65535/51107311503_1ca24b27ce_o.jpg',
  'https://live.staticflickr.com/65535/50543892813_a5a0950ccc_o.png',
  'https://live.staticflickr.com/65535/51817322350_a61f35c7da_o.jpg',
  'https://live.staticflickr.com/65535/51815584783_285786230a_o.png',
  'https://live.staticflickr.com/65535/52576449150_128d87b9fc_o.png',
  'https://live.staticflickr.com/65535/52575997286_1fac0d22be_o.png',
  'https://live.staticflickr.com/65535/52576474530_f1a11eb291_o.png',
  'https://live.staticflickr.com/65535/53267139187_6542d5dfc1_b.jpg',
  'https://live.staticflickr.com/65535/50544759632_83d8c1033b_o.png',
  'https://live.staticflickr.com/65535/50281312002_da3619ae91_o.png',
  'https://live.staticflickr.com/65535/50279857138_1b50997283_z.jpg',
  'https://live.staticflickr.com/65535/50280702817_eec11b6528_z.jpg',
  'https://live.staticflickr.com/65535/50280702967_273a1733b7_z.jpg',
  'https://live.staticflickr.com/65535/50283555127_1897b5714e_o.png',
  'https://live.staticflickr.com/65535/50284002243_6fe5001e65_o.png',
  'https://live.staticflickr.com/65535/51112197262_e18f48eeb9_o.png',
  'https://live.staticflickr.com/65535/50276461253_dd0eace964_o.png',
  'https://live.staticflickr.com/65535/50545749056_6eb484666c_o.png',
  'https://live.staticflickr.com/65535/50545889182_c1aa0774db_o.png',
  'https://live.staticflickr.com/65535/50937428227_36fb20c789_o.gif',
  'https://live.staticflickr.com/65535/51886217004_5c54d0a52b_o.png',
  'https://live.staticflickr.com/65535/50919520821_875928c570_o.jpg',
  'https://live.staticflickr.com/65535/50334903467_5586168163_o.png',
  'https://live.staticflickr.com/65535/52982545514_538b84255d_k.jpg',
  'https://live.staticflickr.com/6098/6280514227_f0a060884f_k.jpg',
  'https://live.staticflickr.com/65535/51818042490_d858d9f959_o.png',
  'https://live.staticflickr.com/65535/51803600831_745530abd6_o.png',
  'https://live.staticflickr.com/65535/51802642457_c930cb3fd7_o.png',
  'https://live.staticflickr.com/65535/51819310724_81c7325d51_o.png',
  'https://live.staticflickr.com/65535/51819310744_11c7fc251e_o.png',
  'https://live.staticflickr.com/65535/51819680030_dc9214e918_o.png',
  'https://live.staticflickr.com/65535/51819680040_b0501646e0_o.png',
  'https://live.staticflickr.com/65535/51818967111_7d520dd93a_o.png',
  'https://live.staticflickr.com/65535/51818017627_8c069b2e69_o.png',
  'https://live.staticflickr.com/65535/51826308715_545535db2b_o.png',
  'https://live.staticflickr.com/65535/51818017642_3d29124193_o.png',
  'https://live.staticflickr.com/65535/51817329291_388e7c5b98_o.gif',
  'https://live.staticflickr.com/65535/51816378427_785066986a_o.png',
  'https://live.staticflickr.com/65535/51813201103_0b8d4c3fa9_o.png',
  'https://live.staticflickr.com/65535/51816950939_32e8ab59c6_o.png',
  'https://live.staticflickr.com/65535/51804322895_f9c7cbfc69_o.png',
  'https://live.staticflickr.com/65535/51857348726_1ec8609a23_o.png',
  'https://live.staticflickr.com/65535/51858009760_450696b73e_o.jpg',
  'https://live.staticflickr.com/65535/51820752141_a37e81a759_o.jpg',
  'https://live.staticflickr.com/65535/52982404306_706289ed36_k.jpg',
  'https://live.staticflickr.com/65535/52223971039_979c63d71b_o.jpg',
  'https://live.staticflickr.com/65535/51885526826_968fbcdbb2_o.jpg',
  'https://live.staticflickr.com/65535/50414927621_d6fceeb114_o.png',
  'https://live.staticflickr.com/65535/50360612008_71a3084c5b_o.png',
  'https://live.staticflickr.com/65535/50360612103_95c4c3b75c_o.png',
  'https://live.staticflickr.com/65535/50360612183_6e02bea51c_o.png',
  'https://live.staticflickr.com/65535/50359775632_fbef42ebf7_o.png',
  'https://live.staticflickr.com/65535/50359775717_1c41eb3e04_o.png',
  'https://live.staticflickr.com/65535/50360612338_d92a59a43f_o.png',
  'https://live.staticflickr.com/65535/50359775782_5bebc27a4b_o.png',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function filename(url) {
  return path.basename(new URL(url).pathname);
}

function newUrl(url) {
  return `${SERVE_URL}/${filename(url)}`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to execute)'}\n`);

  // Build URL map
  const urlMap = {};
  for (const url of EXTERNAL_URLS) {
    urlMap[url] = newUrl(url);
  }

  // Print mapping
  console.log('=== URL mapping ===');
  for (const [from, to] of Object.entries(urlMap)) {
    console.log(`  ${from}\n  → ${to}\n`);
  }

  if (!APPLY) {
    console.log('--- Dry run complete. Run with --apply to execute. ---');
    return;
  }

  // Download + upload
  fs.mkdirSync(TMP_DIR, { recursive: true });

  console.log('\n=== Downloading and uploading images ===');
  for (const url of EXTERNAL_URLS) {
    const name = filename(url);
    const dest = path.join(TMP_DIR, name);
    process.stdout.write(`  ${name} ... `);
    try {
      await download(url, dest);
      execSync(`gsutil cp "${dest}" "gs://${BUCKET}/${name}"`, { stdio: 'pipe' });
      console.log('done');
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Rewrite source files
  console.log('\n=== Rewriting source files ===');
  const result = execSync(
    `grep -rl --include="*.mdx" --include="*.md" --include="*.tsx" --include="*.ts" --include="*.js" --include="*.jsx" "staticflickr.com\\|imgur.com" "${NEXTJS_DIR}"`,
    { encoding: 'utf8' }
  ).trim().split('\n').filter(Boolean);

  for (const file of result) {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;
    for (const [from, to] of Object.entries(urlMap)) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(file, content, 'utf8');
      console.log(`  updated: ${path.relative(NEXTJS_DIR, file)}`);
    }
  }

  console.log('\nDone!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
