import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { navigateTo, openRoute, seedStableDevice, useTasteMap } from './helpers';
import { installFakeYouTube } from './fixtures/shortsFakeYouTube';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await seedStableDevice(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installFakeYouTube(page);
});

// Test rendered geometry, rather than copying CSS constants into assertions.
async function audit(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Allow responsive media queries, ResizeObservers and the next paint to
  // settle after a viewport/theme change, especially in emulated WebKit.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const visible = (el: Element) => {
      if (el.closest('[hidden], [aria-hidden="true"]')) return false;
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height };
    };
    const collisions: string[] = [];
    for (const row of document.querySelectorAll('.house-nav, .house-nav-utilities, .sec-head-row, .taste-map-tools, .fc-botrow, .fb-head-top, .quiz-meta, .manual-group-head, .taste-pagination, .atlas-reader-toolbar, .hall-sign-row, .shelf-results-head, .story-title-row, .taste-section-heading')) {
      if (!visible(row)) continue;
      const children = [...row.children].filter(visible);
      for (let i=0; i<children.length; i++) for (let j=i+1; j<children.length; j++) {
        const a=box(children[i]), b=box(children[j]);
        if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>2 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2) collisions.push(`${row.className}: ${children[i].className} / ${children[j].className}`);
      }
    }
    const display = [...document.querySelectorAll('.home-opening h1, .home-group-heading h2, .home-story-heading h3, .sec-title, .house-brand, .taste-preview-heading h2, .taste-section-heading h2, .manual-title, .quiz-title, .quiz-q, .daily-q, .wv-title, .recipe-focus-heading h1, .recipe-focus-recipe h2, .atlas-cover h1, .atlas-story-heading h2, .fc-name, .fb-head h3, .landing-atlas-entry em, .story-title-row h3, .editorial-link-copy > span, .flavour-intro h2')].filter(visible);
    const body = [...document.querySelectorAll('input, .taste-ingredients, .fb-method, .fb-ings li, .manual-body p, .quiz-opt-text, .recipe-focus-tagline')].filter(visible);
    const wrongDisplay = display.filter(el=>!getComputedStyle(el).fontFamily.includes('InstrumentSerif')).map(el=>({text:el.textContent?.trim(),font:getComputedStyle(el).fontFamily}));
    const wrongBody = body.filter(el=>!getComputedStyle(el).fontFamily.includes('InstrumentSans')).map(el=>({text:el.textContent?.trim().slice(0,45),font:getComputedStyle(el).fontFamily}));
    const clippedHeadings = display.filter(el=>el instanceof HTMLElement && el.scrollWidth>el.clientWidth+2).map(el=>el.textContent?.trim());
    const clippedTabs = [...document.querySelectorAll('.wv-tabs,.wv-tab')].filter(visible).filter(el=>el instanceof HTMLElement && el.scrollWidth>el.clientWidth+2).map(el=>el.textContent?.trim());
    const targets = [...document.querySelectorAll('.house-nav-utilities button, .house-nav-link, .fc-expand, .act-btn, .wv-share, .wv-clear')].filter(visible).map(el=>({label:el.getAttribute('aria-label')||el.textContent?.trim(),...box(el)}));
    const overflow=document.documentElement.scrollWidth-innerWidth;
    const overflowElements=overflow>1?[...document.body.querySelectorAll('*')].filter(visible).filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(el=>({class:el.className,text:el.textContent?.trim().slice(0,45),...box(el)})):[];
    return { viewport:innerWidth, overflow, overflowElements, collisions, wrongDisplay, wrongBody, clippedHeadings, clippedTabs, targets };
  });
}

function expectClean(result: Awaited<ReturnType<typeof audit>>) {
  expect(result.overflow,JSON.stringify(result.overflowElements)).toBeLessThanOrEqual(1);
  expect(result.collisions).toEqual([]);
  expect(result.wrongDisplay).toEqual([]);
  expect(result.wrongBody).toEqual([]);
  expect(result.clippedHeadings).toEqual([]);
  expect(result.clippedTabs).toEqual([]);
  for (const target of result.targets) {
    expect(target.width, target.label).toBeGreaterThanOrEqual(44);
    expect(target.height, target.label).toBeGreaterThanOrEqual(44);
  }
}

const routes = [
  ['home','/#/','.home-opening'], ['drinks','/#/menu','#menu-list .fc'], ['taste-map','/#/taste-map','.taste-plot'],
  ['shelf','/#/bar','#shelf'], ['tab','/#/tab','#tab-page'],
  ['basics','/#/basics','.manual'], ['quiz','/#/quiz','.quiz-intro'],
  ['atlas','/#/atlas','.atlas-cover'], ['watch','/#/watch','.wv'],
  ['shorts','/#/shorts','.shorts-feed'],
] as const;
for (const [name,route,ready] of routes) test(`spacing and type: ${name}, every width and theme`, async ({ page },info) => {
  test.setTimeout(90_000);
  await openRoute(page,route);
  await expect(page.locator(ready).first()).toBeVisible({timeout:20_000});
  const results=[];
  for (const width of [320,390,430,768,1024,1440,926]) {
    await page.setViewportSize({width,height:width===926?428:width===320?700:900});
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.house-theme').click();
      const result=await audit(page);
      results.push({name,theme,...result});
      expectClean(result);
      if ([390,1440].includes(width)) await page.screenshot({path:info.outputPath(`${name}-${width}-${theme}.png`)});
    }
  }
  await writeFile(info.outputPath('geometry-and-type.json'),JSON.stringify(results,null,2));
});

test('card faces, long names, fullscreen and expanded manual retain readable type and clear controls', async ({page},info) => {
  await openRoute(page,'/#/menu?q='+encodeURIComponent("Empellón Cocina's Fat-Washed Mezcal"));
  const card=page.locator('#menu-list .fc[data-recipe-id="17246"]');
  await expect(card).toBeVisible();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expectClean(await audit(page));
  }
  await page.setViewportSize({width:320,height:700});
  await card.getByRole('button',{name:'View recipe',exact:true}).click();
  await expect(card).toHaveClass(/flipped/);
  expectClean(await audit(page));
  await page.screenshot({path:info.outputPath('long-card-back-320.png')});
  const body=card.locator('.fb-scroll');
  expect(await body.evaluate(el=>el.clientHeight)).toBeGreaterThanOrEqual(140);
  await card.locator('.back').getByRole('button',{name:/full screen/}).click();
  const reader=page.getByRole('dialog');
  await expect(reader).toHaveAttribute('data-phase','open');
  expectClean(await audit(page));
  await page.screenshot({path:info.outputPath('long-reader-320.png')});
  await page.keyboard.press('Escape');
  await expect(reader).toHaveCount(0);
  await openRoute(page,'/#/basics');
  await page.locator('.manual-group-head').first().click();
  await page.locator('.manual-row').first().click();
  await expect(page.locator('.manual-body p').first()).toBeVisible();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expectClean(await audit(page));
  }
  await page.screenshot({path:info.outputPath('manual-expanded.png')});
});

test('arrowed Taste Map labels have strong contrast and its selected guides align', async ({page}) => {
  await openRoute(page,'/#/taste-map');
  await page.getByRole('button',{name:'Preview Negroni',exact:true}).click();
  await expect(page.locator('.taste-graph-arrows')).toBeVisible();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.house-theme').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await expect.poll(async()=>page.evaluate(()=>{
        const rgb=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
        const luminance=(c:number[])=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
        const paper=getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
        const sample=document.createElement('span');sample.style.color=paper;document.body.append(sample);
        const sampleColor=getComputedStyle(sample).color, background=luminance(rgb(sampleColor));sample.remove();
        const colors=[...document.querySelectorAll('.taste-axis,.taste-sweetness')].map(el=>getComputedStyle(el).color);
        const ratios=colors.map(color=>{const foreground=luminance(rgb(color));return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);});
        const node=document.querySelector('.taste-node.selected')!.getBoundingClientRect(), guide=document.querySelector('.taste-projection-vertical')!.getBoundingClientRect();
        return ratios.every(r=>r>=7) && Math.abs(node.left+node.width/2-guide.left)<=1;
      }),{message:`Readable graph labels and aligned guides at ${width}px in ${theme}`}).toBe(true);
    }
  }
});

test('populated Shelf, saved cards and expanded comparison stay spacious in both themes', async ({page},info) => {
  await openRoute(page,'/#/bar');
  for (const ingredient of ['Gin','Campari','Sweet Vermouth']) {
    await page.getByRole('textbox',{name:'Search ingredients'}).fill(ingredient);
    await page.getByRole('option',{name:new RegExp(`^${ingredient}\\b`)}).first().click();
  }
  await expect(page.locator('.shelf-results-grid .fc').first()).toBeVisible();
  await page.getByRole('button',{name:'Filter results',exact:true}).click();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.house-theme').click();
      expectClean(await audit(page));
    }
  }
  await navigateTo(page,'Drinks');
  await useTasteMap(page);
  await page.getByRole('button',{name:/^Preview Negroni/}).click();
  await page.getByRole('button',{name:'Save to Your Tab',exact:true}).click();
  await navigateTo(page,'Your Tab');
  await expect(page.locator('#tab-page .fc')).toHaveCount(1);
  await page.setViewportSize({width:320,height:800});
  expectClean(await audit(page));
  await page.screenshot({path:info.outputPath('saved-card-320.png')});
  await useTasteMap(page);
  await page.getByRole('button',{name:'Compare with another drink'}).click();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expectClean(await audit(page));
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('.taste-comparison').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('comparison-390.png')});
});

test('quiz questions, answer rows and the shared record retain clear hierarchy', async ({page},info) => {
  await openRoute(page,'/#/quiz');
  // This suite runs only against the isolated memory-backed preview server.
  await page.getByRole('button',{name:'Start the round',exact:true}).click();
  await expect(page.locator('.quiz-q')).toBeVisible();
  for (const width of [320,390,430,768,1024,1440,926]) {
    await page.setViewportSize({width,height:width===926?428:900});
    for (const theme of ['light','dark']) {
      if (await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('.house-theme').click();
      expectClean(await audit(page));
      const options=await page.locator('.quiz-card .quiz-opt').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};}));
      for(let i=0;i<options.length;i++) for(let j=i+1;j<options.length;j++) {
        const a=options[i],b=options[j];
        expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)<=1 || Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)<=1).toBe(true);
      }
      if(width===390) await page.screenshot({path:info.outputPath(`quiz-playing-${theme}.png`)});
    }
  }
});

test('landing analyses and daily question use the same readable system', async ({page},info) => {
  await openRoute(page,'/#/');
  await expect(page.locator('[data-home-story]')).toHaveCount(4);
  for (const toggle of await page.locator('.home-study-toggle').all()) if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    for (const id of ['calories','pantry','dna','pairings']) {
      const story=page.locator(`[data-home-story="${id}"]`);
      await story.scrollIntoViewIfNeeded();
      expectClean(await audit(page));
      if(width===390) await story.screenshot({path:info.outputPath(`home-${id}.png`)});
    }
  }
  await page.addInitScript(()=>localStorage.removeItem('pubcrawl.dailySeen'));
  await openRoute(page,'/#/quiz?daily=1');
  await expect(page.locator('.daily[role="dialog"]')).toBeVisible();
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expectClean(await audit(page));
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:info.outputPath('daily-390.png')});
});
